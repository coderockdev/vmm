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

const MODEL = process.env.ANTHROPIC_SCRIPT_MODEL || "claude-opus-5";

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local to use AI_PROVIDER=anthropic.");
  }
  return new Anthropic({ apiKey });
}

async function complete(prompt: string): Promise<string> {
  const message = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude response had no text content.");
  }
  return textBlock.text;
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
    });
    const prompt = [
      context,
      ``,
      `IDEIA APROVADA: ${args.contentIdea.title} — ${args.contentIdea.angle}`,
      `Duração alvo da narração: ${args.durationMinutes} minutos.`,
      scriptJsonInstructions(),
    ].join("\n");
    const text = await complete(prompt);
    return parseScriptJson(text);
  }
}
