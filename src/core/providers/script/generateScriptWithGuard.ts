import { GenerateScriptArgs, GeneratedScript } from "./ScriptProvider";
import { buildScriptGenerationContext } from "./promptContext";
import {
  findForbiddenPhrases,
  parseScriptJson,
  scriptJsonInstructions,
} from "./llmContract";
import { UsageSnapshot } from "../../usage/types";

/**
 * Shared script-generation prompt + one automatic retry if the model
 * violates the channel DNA avoid-list (e.g. ChatGPT opening with
 * "Respira profundamente" despite explicit bans).
 */
export async function generateScriptWithGuard(args: {
  scriptArgs: GenerateScriptArgs;
  complete: (prompt: string) => Promise<{ text: string; usage: UsageSnapshot }>;
}): Promise<GeneratedScript> {
  const { scriptArgs, complete } = args;
  const avoid = scriptArgs.channel.dna.avoid ?? [];

  const context = buildScriptGenerationContext({
    channel: scriptArgs.channel,
    topic: scriptArgs.topic,
    previousTitles: scriptArgs.previousScripts.slice(0, 5),
    durationMinutes: scriptArgs.durationMinutes,
  });

  function buildPrompt(retryNote?: string): string {
    return [
      context,
      ``,
      `IDEIA APROVADA: ${scriptArgs.contentIdea.title} — ${scriptArgs.contentIdea.angle}`,
      `Duração alvo da narração: ${scriptArgs.durationMinutes} minutos.`,
      scriptJsonInstructions({
        durationMinutes: scriptArgs.durationMinutes,
        wordsPerMinute: scriptArgs.channel.dna.scriptRules.wordsPerMinute,
        avoid,
        openingRule: scriptArgs.channel.dna.scriptRules.opening,
      }),
      retryNote ? `\n${retryNote}` : "",
    ].join("\n");
  }

  let { text, usage } = await complete(buildPrompt());
  let script = { ...parseScriptJson(text), usage };

  let forbidden = findForbiddenPhrases(script.rawText, avoid);
  if (forbidden.length === 0) return script;

  const retryNote = [
    `TENTATIVA ANTERIOR REJEITADA.`,
    `O roteiro continha frases/temas PROIBIDOS pelo DNA: ${forbidden.join("; ")}.`,
    `Reescreva do zero. Abra com o gancho emocional do canal. ZERO respiração/meditação/relaxamento.`,
  ].join(" ");

  ({ text, usage } = await complete(buildPrompt(retryNote)));
  script = { ...parseScriptJson(text), usage };
  forbidden = findForbiddenPhrases(script.rawText, avoid);
  if (forbidden.length > 0) {
    throw new Error(
      `O modelo insistiu em frases proibidas pelo DNA (${forbidden.slice(0, 3).join("; ")}). Tente regenerar com outro provider (Claude) ou revise o DNA.`
    );
  }
  return script;
}
