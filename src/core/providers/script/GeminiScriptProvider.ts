import {
  ScriptProvider,
  GenerateContentPlanArgs,
  GenerateScriptArgs,
  GeneratedScript,
  ContentIdeaDraft,
} from "./ScriptProvider";
import { buildScriptGenerationContext } from "./promptContext";
import { contentPlanJsonInstructions, scriptJsonInstructions, parseContentPlanJson, parseScriptJson } from "./llmContract";

const MODEL = process.env.GEMINI_SCRIPT_MODEL || "gemini-3.8-flash";

async function complete(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local to use AI_PROVIDER=gemini.");
  }

  const response = await fetch(
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
    throw new Error(
      `Gemini script request failed (${response.status}) using model "${MODEL}" — set GEMINI_SCRIPT_MODEL in .env.local (or in Vercel's env vars) if Google has retired this one. Response: ${body.slice(0, 500)}`
    );
  }

  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini response had no content.");
  return text;
}

/** Real Google Gemini script generation — one of the interchangeable AI_PROVIDER backends. */
export class GeminiScriptProvider implements ScriptProvider {
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
