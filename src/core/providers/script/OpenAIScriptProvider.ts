import {
  ScriptProvider,
  GenerateContentPlanArgs,
  GenerateScriptArgs,
  GeneratedScript,
  ContentIdeaDraft,
} from "./ScriptProvider";
import { buildScriptGenerationContext } from "./promptContext";
import { contentPlanJsonInstructions, scriptJsonInstructions, parseContentPlanJson, parseScriptJson } from "./llmContract";

const MODEL = process.env.OPENAI_SCRIPT_MODEL || "gpt-4o";

async function complete(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env.local to use AI_PROVIDER=openai.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI script request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const json = await response.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI response had no content.");
  return text;
}

/** Real OpenAI (ChatGPT) script generation — one of the interchangeable AI_PROVIDER backends. */
export class OpenAIScriptProvider implements ScriptProvider {
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
