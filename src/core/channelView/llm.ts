import Anthropic from "@anthropic-ai/sdk";
import { fetchWithRetry, describeProviderError } from "../httpRetry";
import { UsageSnapshot } from "../usage/types";

/**
 * LLM access for the /channel/[slug] screen only. Deliberately independent of
 * providers/script/* so the /channels workspace keeps its own prompts and
 * behaviour untouched.
 */
export type ChannelViewProvider = "anthropic" | "openai" | "gemini";

export const CHANNEL_VIEW_PROVIDERS = new Set<string>(["anthropic", "openai", "gemini"]);

export interface Completion {
  text: string;
  usage: UsageSnapshot;
}

export type CompleteFn = (prompt: string) => Promise<Completion>;

const ANTHROPIC_MODEL = process.env.ANTHROPIC_SCRIPT_MODEL || "claude-opus-5";
const OPENAI_MODEL = process.env.OPENAI_SCRIPT_MODEL || "gpt-4o";
const GEMINI_MODEL = process.env.GEMINI_SCRIPT_MODEL || "gemini-3.8-flash";

async function completeAnthropic(prompt: string): Promise<Completion> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não está configurada em .env.local.");
  let message;
  try {
    message = await new Anthropic({ apiKey }).messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status ?? 500 : 500;
    throw new Error(describeProviderError(`Claude (modelo "${ANTHROPIC_MODEL}")`, status, err instanceof Error ? err.message : String(err)));
  }
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) throw new Error(`Claude não retornou texto (stop_reason=${message.stop_reason ?? "?"}).`);
  const raw = message.usage ?? null;
  return {
    text,
    usage: { provider: "anthropic", model: ANTHROPIC_MODEL, inputTokens: raw?.input_tokens ?? null, outputTokens: raw?.output_tokens ?? null, raw },
  };
}

async function completeOpenAI(prompt: string): Promise<Completion> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não está configurada em .env.local.");
  const response = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 8000,
    }),
  });
  if (!response.ok) {
    throw new Error(describeProviderError(`ChatGPT (modelo "${OPENAI_MODEL}")`, response.status, await response.text().catch(() => "")));
  }
  const json = await response.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("O ChatGPT não retornou conteúdo.");
  const raw = json.usage ?? null;
  return {
    text,
    usage: { provider: "openai", model: OPENAI_MODEL, inputTokens: raw?.prompt_tokens ?? null, outputTokens: raw?.completion_tokens ?? null, raw },
  };
}

async function completeGemini(prompt: string): Promise<Completion> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não está configurada em .env.local.");
  const response = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(describeProviderError(`Gemini (modelo "${GEMINI_MODEL}")`, response.status, await response.text().catch(() => "")));
  }
  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("O Gemini não retornou conteúdo.");
  const raw = json.usageMetadata ?? null;
  return {
    text,
    usage: { provider: "gemini", model: GEMINI_MODEL, inputTokens: raw?.promptTokenCount ?? null, outputTokens: raw?.candidatesTokenCount ?? null, raw },
  };
}

export function completerFor(provider: ChannelViewProvider): CompleteFn {
  if (provider === "anthropic") return completeAnthropic;
  if (provider === "openai") return completeOpenAI;
  return completeGemini;
}

export function mergeUsage(a?: UsageSnapshot, b?: UsageSnapshot): UsageSnapshot | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    provider: a.provider,
    model: a.model ?? b.model,
    inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0),
    raw: { parts: [a.raw, b.raw] },
  };
}
