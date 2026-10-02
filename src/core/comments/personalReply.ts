import type { ClassifyResult } from "./classify";
import { describeProviderError } from "../httpRetry";
import { insertUsageEvent } from "../repo/usage";

const SAFETY_REASONS = new Set([
  "self_harm",
  "insult",
  "threat_accusation",
  "link",
  "money",
  "medical",
  "sexual",
  "minor_sensitive",
]);

/** Personal or long comments. Short amen / thanks stay on the template bank. */
export function wantsPersonalReply(classified: ClassifyResult): boolean {
  if (classified.category === "NO_REPLY") return true;
  if (classified.category !== "REVIEW_REQUIRED") return false;
  const reason = classified.reviewReason;
  if (!reason || reason === "empty" || SAFETY_REASONS.has(reason)) return false;
  return reason === "too_long" || reason === "complex_question" || reason === "uncertain";
}

export function isSafetyReview(classified: ClassifyResult): boolean {
  return (
    classified.category === "REVIEW_REQUIRED" &&
    !!classified.reviewReason &&
    SAFETY_REASONS.has(classified.reviewReason)
  );
}

/** Drop a draft that breaks the short public-reply rules. */
export function cleanPersonalReply(raw: string): string | null {
  let text = raw.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
  text = text.replace(/^(respuesta|resposta)\s*:\s*/i, "").trim();
  if (!text) return null;
  if (text.length > 320) {
    const cut = text.slice(0, 320);
    const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
    text = (end > 40 ? cut.slice(0, end + 1) : cut).trim();
  }
  if (/https?:\/\/|www\./i.test(text)) return null;
  if (/\b(como ia|soy una ia|sou uma ia|inteligencia artificial|inteligência artificial|modelo de lenguaje|language model)\b/i.test(text)) {
    return null;
  }
  if (/\b(va a volver|vai voltar|volver[aá] con vos|te va a (escribir|llamar|buscar))\b/i.test(text)) {
    return null;
  }
  return text;
}

/**
 * One or two sentences for a personal comment. Gemini Flash, plain text.
 * Returns null when the key is missing, the call fails, or the draft breaks the rules.
 */
export async function draftPersonalReply(args: {
  channelId: string;
  channelName: string;
  commentText: string;
}): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.GEMINI_COMMENT_MODEL?.trim() || "gemini-3.8-flash";
  const prompt = `Respondes un comentario de YouTube del canal "${args.channelName}".
Escribe solo el texto de la respuesta, en el idioma del comentario.

Reglas:
- Una o dos frases. Nada más.
- Cálido y breve. No juzgues.
- No prometas que la otra persona vuelve, escribe, llama o desbloquea.
- No des consejos médicos, legales ni de dinero. No pidas teléfono, nombre ni datos.
- No digas que eres una IA. No te presentes.
- No repitas la historia ni des instrucciones sobre la pareja.
- Si pide oración, acompaña en una frase. Si solo cuenta lo que vive, ofrece paz y cierra.
- Como mucho un 🙏 y un ❤️.

Comentario:
"""
${args.commentText.slice(0, 800)}
"""`;

  try {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 512,
              thinkingConfig: { thinkingLevel: "low" },
            },
          }),
        }
      );
      if (response.ok || response.status < 500 || attempt === 1) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!response?.ok) {
      const body = await response?.text().catch(() => "") ?? "";
      console.warn(describeProviderError(`Gemini comentarios (${model})`, response?.status ?? 0, body));
      return null;
    }
    const json = await response.json();
    const parts = (json.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>;
    const text = parts.filter((p) => !p.thought).map((p) => p.text || "").join("");
    const usageRaw = json.usageMetadata ?? null;
    void insertUsageEvent({
      channelId: args.channelId,
      stage: "youtube",
      snapshot: {
        provider: "gemini",
        model,
        inputTokens: usageRaw?.promptTokenCount ?? null,
        outputTokens: usageRaw?.candidatesTokenCount ?? null,
        raw: { task: "comment_reply", ...(usageRaw ?? {}) },
      },
    }).catch(() => undefined);
    return cleanPersonalReply(text);
  } catch (err) {
    console.warn(`[comments] personal reply failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
