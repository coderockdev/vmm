import Anthropic from "@anthropic-ai/sdk";
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
import { describeProviderError } from "../../httpRetry";
import { UsageSnapshot } from "../../usage/types";

const MODEL = process.env.ANTHROPIC_SCRIPT_MODEL || "claude-opus-5";

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local to use AI_PROVIDER=anthropic.");
  }
  return new Anthropic({ apiKey });
}

async function complete(prompt: string): Promise<{ text: string; usage: UsageSnapshot }> {
  let message;
  try {
    message = await client().messages.create({
      model: MODEL,
      max_tokens: 16000,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status ?? 500 : 500;
    const body = err instanceof Error ? err.message : String(err);
    throw new Error(describeProviderError(`Claude (modelo "${MODEL}")`, status, body));
  }
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) {
    const types = message.content.map((b) => b.type).join(", ") || "(vazio)";
    throw new Error(
      `Claude response had no text content (stop_reason=${message.stop_reason ?? "?"}, blocks=[${types}]). Tente de novo ou troque o modelo em ANTHROPIC_SCRIPT_MODEL.`
    );
  }
  const usageRaw = message.usage ?? null;
  const usage: UsageSnapshot = {
    provider: "anthropic",
    model: MODEL,
    inputTokens: usageRaw?.input_tokens ?? null,
    outputTokens: usageRaw?.output_tokens ?? null,
    raw: usageRaw,
  };
  return { text, usage };
}

/** Real Anthropic (Claude) script generation — one of the interchangeable AI_PROVIDER backends. */
export class ClaudeScriptProvider implements ScriptProvider {
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
