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

const MODEL = process.env.OPENAI_SCRIPT_MODEL || "gpt-4o";

async function complete(prompt: string): Promise<{ text: string; usage: UsageSnapshot }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env.local to use AI_PROVIDER=openai.");
  }

  const response = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(describeProviderError(`ChatGPT (modelo "${MODEL}")`, response.status, body));
  }

  const json = await response.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI response had no content.");
  const usageRaw = json.usage ?? null;
  const usage: UsageSnapshot = {
    provider: "openai",
    model: MODEL,
    inputTokens: usageRaw?.prompt_tokens ?? null,
    outputTokens: usageRaw?.completion_tokens ?? null,
    raw: usageRaw,
  };
  return { text, usage };
}

/** Real OpenAI (ChatGPT) script generation — one of the interchangeable AI_PROVIDER backends. */
export class OpenAIScriptProvider implements ScriptProvider {
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
