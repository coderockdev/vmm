import { GenerateScriptArgs, GeneratedScript } from "./ScriptProvider";
import { buildScriptGenerationContext } from "./promptContext";
import {
  findForbiddenPhrases,
  parseScriptJson,
  scriptJsonInstructions,
} from "./llmContract";
import { UsageSnapshot } from "../../usage/types";
import {
  charsForDuration,
  DEFAULT_CHARS_PER_WORD,
  DEFAULT_WORDS_PER_MINUTE,
  wordsForDuration,
} from "../../scriptBudget";
import { TTS_SOFT_CHAR_LIMIT } from "../tts/ttsLimits";

const TTS_BLOCK_CHARS = TTS_SOFT_CHAR_LIMIT.elevenlabs; // 4800 — hard ceiling per scene / TTS request

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

/** 4–5 narrative scenes, each under the TTS soft char limit. */
export function sceneCountForBudget(targetChars: number): number {
  const byTts = Math.ceil(Math.max(1, targetChars) / TTS_BLOCK_CHARS);
  return Math.min(5, Math.max(4, byTts));
}

function mergeUsage(a?: UsageSnapshot, b?: UsageSnapshot): UsageSnapshot | undefined {
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

/**
 * Generates a full-length script in 4–5 scenes (each ≤ ~4800 chars) so:
 *  - LLMs hit the ~1600-word / 11-min budget instead of stopping at ~500 words
 *  - each scene is already safe to send to ElevenLabs/Cartesia in one request
 *
 * Also retries once if the DNA avoid-list is violated.
 */
export async function generateScriptWithGuard(args: {
  scriptArgs: GenerateScriptArgs;
  complete: (prompt: string) => Promise<{ text: string; usage: UsageSnapshot }>;
}): Promise<GeneratedScript> {
  const { scriptArgs, complete } = args;
  const avoid = scriptArgs.channel.dna.avoid ?? [];
  const wpm = scriptArgs.channel.dna.scriptRules.wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE;
  const cpw = scriptArgs.channel.dna.scriptRules.charsPerWord ?? DEFAULT_CHARS_PER_WORD;
  const durationMinutes = scriptArgs.durationMinutes;
  const targetWords = wordsForDuration(durationMinutes, wpm);
  const targetChars = charsForDuration(durationMinutes, wpm, cpw);
  const sceneCount = sceneCountForBudget(targetChars);
  const wordsPerScene = Math.max(180, Math.round(targetWords / sceneCount));
  const charsPerScene = Math.min(TTS_BLOCK_CHARS - 200, Math.round(targetChars / sceneCount));

  const context = buildScriptGenerationContext({
    channel: scriptArgs.channel,
    topic: scriptArgs.topic,
    previousTitles: scriptArgs.previousScripts.slice(0, 5),
    durationMinutes,
  });

  const allLines: string[] = [];
  const sectionBreaks: number[] = [];
  let usage: UsageSnapshot | undefined;
  let previousTail = "";

  for (let scene = 1; scene <= sceneCount; scene++) {
    const isFirst = scene === 1;
    const isLast = scene === sceneCount;

    const sceneBrief = [
      `CENA ${scene} de ${sceneCount} (gere APENAS esta cena agora).`,
      `Meta desta cena: ~${wordsPerScene} palavras / até ~${charsPerScene} caracteres (NUNCA ultrapasse ${TTS_BLOCK_CHARS} caracteres nesta cena — limite TTS ElevenLabs/Cartesia).`,
      `Meta do roteiro completo: ~${targetWords} palavras / ~${targetChars} caracteres para ${durationMinutes} minutos.`,
      isFirst
        ? `Esta é a ABERTURA: siga a regra de abertura do DNA. Sem respiração/meditação.`
        : `Continue a narrativa a partir do trecho anterior (não reinicie, não repita o gancho inicial).`,
      isLast
        ? `Esta é a CENA FINAL: leve ao clímax se ainda não chegou, depois descarga, perdão (só no fim), agradecimento e CTA final do DNA.`
        : `Ainda NÃO feche a oração — deixe tensão para as cenas seguintes.`,
      previousTail
        ? `Últimas falas já escritas (só contexto; NÃO as repita):\n${previousTail}`
        : ``,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = [
      context,
      ``,
      `IDEIA APROVADA: ${scriptArgs.contentIdea.title} — ${scriptArgs.contentIdea.angle}`,
      `Duração alvo da narração completa: ${durationMinutes} minutos.`,
      ``,
      sceneBrief,
      scriptJsonInstructions({
        durationMinutes: durationMinutes / sceneCount,
        wordsPerMinute: wpm,
        avoid,
        openingRule: isFirst ? scriptArgs.channel.dna.scriptRules.opening : undefined,
        sceneMode: {
          scene,
          sceneCount,
          minWords: Math.round(wordsPerScene * 0.85),
          maxChars: TTS_BLOCK_CHARS,
        },
      }),
    ].join("\n");

    let { text, usage: partUsage } = await complete(prompt);
    let part = parseScriptJson(text);
    usage = mergeUsage(usage, partUsage);

    let forbidden = findForbiddenPhrases(part.rawText, avoid);
    if (forbidden.length > 0) {
      const retryPrompt = [
        prompt,
        ``,
        `TENTATIVA ANTERIOR REJEITADA — continha: ${forbidden.join("; ")}.`,
        `Reescreva esta cena do zero. ZERO respiração/meditação/relaxamento.`,
      ].join("\n");
      ({ text, usage: partUsage } = await complete(retryPrompt));
      part = parseScriptJson(text);
      usage = mergeUsage(usage, partUsage);
      forbidden = findForbiddenPhrases(part.rawText, avoid);
      if (forbidden.length > 0) {
        throw new Error(
          `O modelo insistiu em frases proibidas pelo DNA (${forbidden.slice(0, 3).join("; ")}). Tente regenerar com outro provider.`
        );
      }
    }

    // Soft length nudge: if this scene is way too short, ask once more to expand.
    const partWords = countWords(part.rawText);
    if (partWords < wordsPerScene * 0.7) {
      const expandPrompt = [
        prompt,
        ``,
        `A cena veio CURTA (~${partWords} palavras; meta ~${wordsPerScene}).`,
        `Reescreva a MESMA cena mais longa e densa, sem inventar meditação, sem repetir prefixos mecânicos.`,
        `Mantenha ≤ ${TTS_BLOCK_CHARS} caracteres.`,
      ].join("\n");
      ({ text, usage: partUsage } = await complete(expandPrompt));
      const expanded = parseScriptJson(text);
      usage = mergeUsage(usage, partUsage);
      if (
        findForbiddenPhrases(expanded.rawText, avoid).length === 0 &&
        countWords(expanded.rawText) > partWords
      ) {
        part = expanded;
      }
    }

    const sceneLines = part.rawText.split(/\n\n+/).map((l) => l.trim()).filter(Boolean);
    const base = allLines.length;
    for (const line of sceneLines) allLines.push(line);
    // Mark end of scene as a section break
    if (sceneLines.length > 0) sectionBreaks.push(base + sceneLines.length - 1);
    // Also honor model-provided breaks inside the scene
    for (const idx of part.sectionBreaks ?? []) {
      if (Number.isInteger(idx) && idx >= 0 && idx < sceneLines.length) {
        sectionBreaks.push(base + idx);
      }
    }

    previousTail = sceneLines.slice(-3).join("\n");
  }

  const uniqueBreaks = [...new Set(sectionBreaks)].filter((i) => i >= 0 && i < allLines.length).sort((a, b) => a - b);
  const rawText = allLines.join("\n\n");
  const totalWords = countWords(rawText);

  if (totalWords < targetWords * 0.75) {
    // One continuation pass for the missing length
    const missing = targetWords - totalWords;
    const contPrompt = [
      context,
      ``,
      `O roteiro ficou CURTO (~${totalWords} palavras; meta ~${targetWords}).`,
      `Escreva um BLOCO DE CONTINUAÇÃO de ~${missing} palavras (máx ${TTS_BLOCK_CHARS} caracteres) que aprofunda a oração ANTES do fechamento final — sem recomeçar, sem meditação.`,
      `Últimas falas:\n${previousTail}`,
      scriptJsonInstructions({
        durationMinutes: missing / wpm,
        wordsPerMinute: wpm,
        avoid,
        sceneMode: {
          scene: sceneCount + 1,
          sceneCount: sceneCount + 1,
          minWords: Math.round(missing * 0.8),
          maxChars: TTS_BLOCK_CHARS,
        },
      }),
    ].join("\n");
    const { text, usage: partUsage } = await complete(contPrompt);
    usage = mergeUsage(usage, partUsage);
    const extra = parseScriptJson(text);
    if (findForbiddenPhrases(extra.rawText, avoid).length === 0) {
      const extraLines = extra.rawText.split(/\n\n+/).map((l) => l.trim()).filter(Boolean);
      const base = allLines.length;
      for (const line of extraLines) allLines.push(line);
      if (extraLines.length) uniqueBreaks.push(base + extraLines.length - 1);
    }
  }

  return {
    rawText: allLines.join("\n\n"),
    sectionBreaks: [...new Set(uniqueBreaks)].sort((a, b) => a - b),
    usage,
  };
}
