import {
  ScriptProvider,
  GenerateContentPlanArgs,
  GenerateScriptArgs,
  GeneratedScript,
  ContentPlanResult,
} from "./ScriptProvider";
import { buildScriptGenerationContext } from "./promptContext";
import { contentPlanJsonInstructions, parseContentPlanJson } from "./llmContract";
import { generateScriptWithGuard } from "./generateScriptWithGuard";
import { fetchWithRetry, describeProviderError } from "../../httpRetry";
import { UsageSnapshot } from "../../usage/types";

const MODEL = process.env.GEMINI_SCRIPT_MODEL || "gemini-3.8-flash";

async function complete(prompt: string): Promise<{ text: string; usage: UsageSnapshot }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local to use AI_PROVIDER=gemini.");
  }

  const response = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
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
    const body = await response.text().catch(() => "");
    throw new Error(describeProviderError(`Gemini (modelo "${MODEL}")`, response.status, body));
  }

  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini response had no content.");
  const usageRaw = json.usageMetadata ?? null;
  const usage: UsageSnapshot = {
    provider: "gemini",
    model: MODEL,
    inputTokens: usageRaw?.promptTokenCount ?? null,
    outputTokens: usageRaw?.candidatesTokenCount ?? null,
    raw: usageRaw,
  };
  return { text, usage };
}

/** Real Google Gemini script generation — one of the interchangeable AI_PROVIDER backends. */
export class GeminiScriptProvider implements ScriptProvider {
  async generateContentPlan(args: GenerateContentPlanArgs): Promise<ContentPlanResult> {
    const context = buildScriptGenerationContext({
      channel: args.channel,
      topic: args.topic,
      previousTitles: args.previousTitles,
    });
    const { text, usage } = await complete(context + contentPlanJsonInstructions(args.quantity));
    return { ideas: parseContentPlanJson(text, args.quantity), usage };
  }

  async generateScript(args: GenerateScriptArgs): Promise<GeneratedScript> {
    return generateScriptWithGuard({ scriptArgs: args, complete });
  }
}
