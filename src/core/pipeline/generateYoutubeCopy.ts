import { Channel, ContentIdea } from "../types";
import { fetchWithRetry, describeProviderError } from "../httpRetry";
import { UsageSnapshot } from "../usage/types";

export type YoutubeCopy = {
  headline: string;
  youtubeDescription: string;
  usage?: UsageSnapshot;
};

/**
 * Manchete (título YT) + descrição longa do YouTube, no idioma do canal.
 */
export async function generateYoutubeCopy(args: {
  channel: Channel;
  idea: ContentIdea | { title: string; angle?: string; objective?: string };
  scriptText: string;
  aiProviderOverride?: string | null;
}): Promise<YoutubeCopy> {
  const lang = args.channel.dna.language === "es" ? "español" : args.channel.dna.language === "pt" ? "português" : "English";
  const excerpt = args.scriptText.replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1800);
  const hits = (args.channel.dna.successfulTitles ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 12);
  const bankBlock =
    hits.length > 0
      ? `\nBanco de títulos de éxito del canal (inspírate en el PATRÓN — no copies literal):\n${hits.map((t) => `- ${t}`).join("\n")}\n`
      : "";

  const prompt = `Eres editor de YouTube para el canal "${args.channel.name}".
Idioma de salida: ${lang}.
DNA / tono: ${(args.channel.dna.tone || []).join(", ")}.
Público: ${args.channel.dna.audience.slice(0, 400)}.
${bankBlock}
Idea:
- Título base: ${args.idea.title}
- Ángulo: ${args.idea.angle ?? ""}
- Objetivo: ${args.idea.objective ?? ""}

Fragmento del guión (puede estar vacío si solo quieres manchete):
"""
${excerpt || "(sin guión aún — inventa manchete potente a partir del tema y del banco de títulos)"}
"""

Devuelve SOLO JSON:
{
  "headline": "título YouTube potente ≤ 70 caracteres, sin clickbait vacío",
  "youtubeDescription": "descripción YouTube 800–1500 caracteres: gancho, de qué trata, para quién, CTA suave (suscribirse), hashtags al final (3–6). Sin mentiras. Sin emojis excesivos."
}`;

  const provider = (args.aiProviderOverride || process.env.AI_PROVIDER || "mock").toLowerCase();
  const tryOrder = [provider, "anthropic", "openai", "gemini"].filter(
    (p, i, arr) => arr.indexOf(p) === i
  );

  for (const name of tryOrder) {
    try {
      if (name === "openai" && process.env.OPENAI_API_KEY) return await completeOpenAI(prompt);
      if (name === "anthropic" && process.env.ANTHROPIC_API_KEY) return await completeAnthropic(prompt);
    } catch (err) {
      console.warn(`[youtube-copy] ${name} failed:`, err instanceof Error ? err.message : err);
    }
  }

  return templateCopy(args);
}

/** Several manchete variants from a topic (Criar conteúdo → Manchete YT). */
export async function generateMancheteVariants(args: {
  channel: Channel;
  topic: string;
  quantity?: number;
  aiProviderOverride?: string | null;
}): Promise<{ items: YoutubeCopy[]; usage?: UsageSnapshot }> {
  const quantity = Math.min(10, Math.max(1, args.quantity ?? 5));
  const lang = args.channel.dna.language === "es" ? "español" : args.channel.dna.language === "pt" ? "português" : "English";
  const hits = (args.channel.dna.successfulTitles ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 15);
  const bankBlock =
    hits.length > 0
      ? `Banco de títulos de éxito (${hits.length} ejemplos — imita el patrón, NO copies literal):\n${hits.map((t) => `- ${t}`).join("\n")}\n`
      : "";

  const prompt = `Eres editor de YouTube para el canal "${args.channel.name}".
Idioma: ${lang}.
Tom: ${(args.channel.dna.tone || []).join(", ")}.
Público: ${args.channel.dna.audience.slice(0, 350)}.
${bankBlock}
Tema / asunto: "${args.topic.trim()}"

Genera ${quantity} manchetes (títulos YT) distintas y potentes + descripción corta para cada una.
Devuelve SOLO JSON:
{
  "items": [
    {
      "headline": "≤70 caracteres",
      "youtubeDescription": "descripción 400–900 caracteres con gancho, CTA y 3–6 hashtags"
    }
  ]
}`;

  const provider = (args.aiProviderOverride || process.env.AI_PROVIDER || "mock").toLowerCase();
  try {
    if (provider === "openai" && process.env.OPENAI_API_KEY) {
      return await completeMancheteListOpenAI(prompt, quantity);
    }
    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      return await completeMancheteListAnthropic(prompt, quantity);
    }
  } catch (err) {
    console.warn("[manchetes] LLM failed, using template:", err instanceof Error ? err.message : err);
  }

  const items: YoutubeCopy[] = [];
  for (let i = 0; i < quantity; i++) {
    const base = args.topic.trim().slice(0, 55);
    const suffix = i === 0 ? "" : ` (${i + 1})`;
    items.push(
      templateCopy({
        channel: args.channel,
        idea: { title: `${base}${suffix}`.slice(0, 70), angle: args.topic },
        scriptText: "",
      })
    );
  }
  return { items };
}

function templateCopy(args: {
  channel: Channel;
  idea: { title: string; angle?: string; objective?: string };
  scriptText: string;
}): YoutubeCopy {
  const es = args.channel.dna.language === "es";
  const headline = args.idea.title.slice(0, 70);
  const hook = (args.idea.angle || args.idea.objective || args.idea.title).slice(0, 220);
  const body = es
    ? `${hook}

En este video de ${args.channel.name} vas a escuchar una oración intensa pensada para quien atraviesa distancia, silencio o ruptura.

Qué vas a sentir:
- Una invocación directa, sin rodeos
- Palabras para cuando el amor duele y quieres que regrese
- Un cierre con esperanza realista

Si este mensaje te habla, suscríbete a ${args.channel.name} y vuelve mañana.

#${args.channel.name.replace(/\s+/g, "")} #oracion #amor #regreso #reconciliacion`
    : `${hook}

Neste vídeo de ${args.channel.name} vais ouvir uma oração intensa.

Subscreve-te a ${args.channel.name}.

#${args.channel.name.replace(/\s+/g, "")} #oracao #amor`;

  return { headline, youtubeDescription: body.trim() };
}

async function completeOpenAI(prompt: string): Promise<YoutubeCopy> {
  const model = process.env.OPENAI_SCRIPT_MODEL || "gpt-4o-mini";
  const response = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(describeProviderError(`ChatGPT`, response.status, body));
  }
  const json = await response.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI empty");
  return parseCopy(text, {
    provider: "openai",
    model,
    inputTokens: json.usage?.prompt_tokens ?? null,
    outputTokens: json.usage?.completion_tokens ?? null,
  });
}

async function completeAnthropic(prompt: string): Promise<YoutubeCopy> {
  const model = process.env.ANTHROPIC_SCRIPT_MODEL || "claude-sonnet-4-20250514";
  const response = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(describeProviderError(`Claude`, response.status, body));
  }
  const json = await response.json();
  const text = json.content?.map((c: { text?: string }) => c.text || "").join("") || "";
  return parseCopy(text, {
    provider: "anthropic",
    model,
    inputTokens: json.usage?.input_tokens ?? null,
    outputTokens: json.usage?.output_tokens ?? null,
  });
}

function parseCopy(text: string, usage: UsageSnapshot): YoutubeCopy {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const obj = JSON.parse(cleaned) as { headline?: string; youtubeDescription?: string };
  if (!obj.headline || !obj.youtubeDescription) throw new Error("Invalid youtube copy JSON");
  return {
    headline: String(obj.headline).slice(0, 100),
    youtubeDescription: String(obj.youtubeDescription).slice(0, 5000),
    usage,
  };
}

function parseMancheteList(
  text: string,
  quantity: number,
  usage: UsageSnapshot
): { items: YoutubeCopy[]; usage: UsageSnapshot } {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const obj = JSON.parse(cleaned) as { items?: Array<{ headline?: string; youtubeDescription?: string }> };
  const raw = Array.isArray(obj.items) ? obj.items : [];
  const items = raw
    .filter((it) => it?.headline && it?.youtubeDescription)
    .slice(0, quantity)
    .map((it) => ({
      headline: String(it.headline).slice(0, 100),
      youtubeDescription: String(it.youtubeDescription).slice(0, 5000),
    }));
  if (items.length === 0) throw new Error("Invalid manchete list JSON");
  return { items, usage };
}

async function completeMancheteListOpenAI(
  prompt: string,
  quantity: number
): Promise<{ items: YoutubeCopy[]; usage: UsageSnapshot }> {
  const model = process.env.OPENAI_SCRIPT_MODEL || "gpt-4o-mini";
  const response = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 3500,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(describeProviderError(`ChatGPT`, response.status, body));
  }
  const json = await response.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI empty");
  return parseMancheteList(text, quantity, {
    provider: "openai",
    model,
    inputTokens: json.usage?.prompt_tokens ?? null,
    outputTokens: json.usage?.completion_tokens ?? null,
  });
}

async function completeMancheteListAnthropic(
  prompt: string,
  quantity: number
): Promise<{ items: YoutubeCopy[]; usage: UsageSnapshot }> {
  const model = process.env.ANTHROPIC_SCRIPT_MODEL || "claude-sonnet-4-20250514";
  const response = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 3500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(describeProviderError(`Claude`, response.status, body));
  }
  const json = await response.json();
  const text = json.content?.map((c: { text?: string }) => c.text || "").join("") || "";
  return parseMancheteList(text, quantity, {
    provider: "anthropic",
    model,
    inputTokens: json.usage?.input_tokens ?? null,
    outputTokens: json.usage?.output_tokens ?? null,
  });
}
