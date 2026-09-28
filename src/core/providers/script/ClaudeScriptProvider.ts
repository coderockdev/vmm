import Anthropic from "@anthropic-ai/sdk";
import {
  ScriptProvider,
  GenerateContentPlanArgs,
  GenerateScriptArgs,
  GeneratedScript,
  ContentIdeaDraft,
} from "./ScriptProvider";
import { buildScriptGenerationContext } from "./promptContext";
import { contentPlanJsonInstructions, scriptJsonInstructions, parseContentPlanJson, parseScriptJson } from "./llmContract";
import { describeProviderError } from "../../httpRetry";

const MODEL = process.env.ANTHROPIC_SCRIPT_MODEL || "claude-opus-5";

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local to use AI_PROVIDER=anthropic.");
  }
  // The SDK already retries 429/5xx automatically before giving up.
  return new Anthropic({ apiKey });
}

async function complete(prompt: string): Promise<string> {
  let message;
  try {
    message = await client().messages.create({
      model: MODEL,
      // Sonnet/Opus 5 use adaptive thinking — keep headroom so the text
      // block isn't truncated away after internal reasoning tokens.
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
  return text;
}

/** Real Anthropic (Claude) script generation — one of the interchangeable AI_PROVIDER backends. */
export class ClaudeScriptProvider implements ScriptProvider {
  async generateContentPlan(args: GenerateContentPlanArgs): Promise<ContentIdeaDraft[]> {
    const context = buildScriptGenerationContext({
      channel: args.channel,
      topic: args.topic,
      previousTitles: args.previousTitles,
    });
    const text = await complete(context + contentPlanJsonInstructions(args.quantity));
    return parseContentPlanJson(text, args.quantity);
  }

  async generateScript(args: GenerateScriptArgs): Promise<GeneratedScript> {
    const context = buildScriptGenerationContext({
      channel: args.channel,
      topic: args.topic,
      previousTitles: args.previousScripts.slice(0, 5),
      durationMinutes: args.durationMinutes,
    });
    const prompt = [
      context,
      ``,
      `IDEIA APROVADA: ${args.contentIdea.title} — ${args.contentIdea.angle}`,
      `Duração alvo da narração: ${args.durationMinutes} minutos.`,
      scriptJsonInstructions(args.durationMinutes),
    ].join("\n");
    const text = await complete(prompt);
    return parseScriptJson(text);
  }
}
