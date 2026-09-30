import { Channel, ContentIdea, VideoFormat } from "../types";
import { buildScriptGenerationContext } from "../providers/script/promptContext";
import { findForbiddenPhrases, parseScriptJson, scriptJsonInstructions } from "../providers/script/llmContract";
import { DEFAULT_CHARS_PER_WORD, DEFAULT_WORDS_PER_MINUTE } from "../scriptBudget";
import { clampSceneCount, DEFAULT_SCENE_COUNT, SCENE_TTS_CHAR_LIMIT } from "../providers/tts/ttsLimits";
import { parseGeneratedScript, normalizeSceneBreaks } from "../scriptLines";
import { createVideoProject, createScript, attachScriptToProject, updateProjectStatus, listScriptTextsForChannel } from "../repo/projects";
import { insertUsageEvent, recomputeProjectCost } from "../repo/usage";
import { hashStringToSeed } from "../../remotion/seededRandom";
import { UsageSnapshot } from "../usage/types";
import { completerFor, mergeUsage, ChannelViewProvider } from "./llm";
import { channelForGeneration } from "./ideas";

const TTS_MAX = SCENE_TTS_CHAR_LIMIT;

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

const toLines = (text: string) => text.split(/\n\n+/).map((line) => line.trim()).filter(Boolean);

/**
 * Writes one full script scene by scene, feeding the model the whole channel
 * context (DNA, avoid list, script model, voice/tag rules). The size comes
 * from the screen's own settings: scene count x words per scene.
 */
async function writeScript(args: {
  channel: Channel;
  topic: string;
  idea: ContentIdea;
  provider: ChannelViewProvider;
  sceneCount: number;
  targetWords: number;
  previousScripts: string[];
}): Promise<{ rawText: string; sectionBreaks: number[]; usage?: UsageSnapshot }> {
  const { channel, idea } = args;
  const complete = completerFor(args.provider);
  const avoid = channel.dna.avoid ?? [];
  const wpm = channel.dna.scriptRules.wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE;
  const cpw = channel.dna.scriptRules.charsPerWord ?? DEFAULT_CHARS_PER_WORD;
  const sceneCount = clampSceneCount(args.sceneCount);
  const targetWords = args.targetWords;
  const targetChars = Math.round(targetWords * cpw);
  const wordsPerScene = Math.max(1, Math.round(targetWords / sceneCount));
  const charsPerScene = Math.min(TTS_MAX - 200, Math.max(1, Math.round(targetChars / sceneCount)));
  const minutes = Math.max(1, Math.round(targetWords / wpm));

  const context = buildScriptGenerationContext({
    channel,
    topic: args.topic,
    previousTitles: args.previousScripts.slice(0, 5),
    durationMinutes: minutes,
  });

  const allLines: string[] = [];
  const sectionBreaks: number[] = [];
  let usage: UsageSnapshot | undefined;
  let previousTail = "";

  for (let scene = 1; scene <= sceneCount; scene++) {
    const isFirst = scene === 1;
    const isLast = scene === sceneCount;
    const brief = [
      `CENA ${scene} de ${sceneCount} (gere APENAS esta cena agora).`,
      `TAMANHO PARELHO: meta ~${wordsPerScene} palavras / ~${charsPerScene} caracteres nesta cena (todas as ${sceneCount} cenas devem ficar com tamanho similar).`,
      `NUNCA ultrapasse ${TTS_MAX} caracteres nesta cena — limite TTS.`,
      `Meta do roteiro completo: ~${targetWords} palavras / ~${targetChars} caracteres.`,
      isFirst
        ? `Esta é a ABERTURA: siga a regra de abertura do DNA do canal.`
        : `Continue a narrativa a partir do trecho anterior (não reinicie, não repita o gancho inicial).`,
      isLast
        ? `Esta é a CENA FINAL: conduza ao desfecho e ao CTA final definidos no DNA/modelo de roteiro do canal.`
        : `Ainda NÃO feche a narrativa — deixe tensão para as cenas seguintes.`,
      previousTail ? `Últimas falas já escritas (só contexto; NÃO as repita):\n${previousTail}` : ``,
    ].filter(Boolean).join("\n");

    const prompt = [
      context,
      ``,
      `IDEIA APROVADA: ${idea.title} — ${idea.angle}`,
      idea.objective ? `OBJETIVO: ${idea.objective}` : ``,
      `Meta de tamanho do roteiro: aproximadamente ${targetWords} palavras.`,
      ``,
      brief,
      scriptJsonInstructions({
        durationMinutes: minutes / sceneCount,
        wordsPerMinute: wpm,
        avoid,
        openingRule: isFirst ? channel.dna.scriptRules.opening : undefined,
        sceneMode: {
          scene,
          sceneCount,
          minWords: Math.round(wordsPerScene * 0.85),
          targetChars: charsPerScene,
          maxChars: TTS_MAX,
        },
      }),
    ].filter((part) => part !== "").join("\n");

    const ask = async (text: string) => {
      const result = await complete(text);
      usage = mergeUsage(usage, result.usage);
      return parseScriptJson(result.text);
    };

    let part = await ask(prompt);

    let forbidden = findForbiddenPhrases(part.rawText, avoid);
    if (forbidden.length > 0) {
      part = await ask([
        prompt,
        ``,
        `TENTATIVA ANTERIOR REJEITADA — continha: ${forbidden.join("; ")}.`,
        `Reescreva esta cena do zero, sem nenhum item da lista de proibidos e sem meta-texto editorial. Mantenha ~${charsPerScene} caracteres (±20%), máx ${TTS_MAX}.`,
      ].join("\n"));
      forbidden = findForbiddenPhrases(part.rawText, avoid);
      if (forbidden.length > 0) {
        throw new Error(`O modelo insistiu em frases proibidas pelo DNA (${forbidden.slice(0, 3).join("; ")}). Tente outra IA.`);
      }
    }

    const words = countWords(part.rawText);
    if (words < wordsPerScene * 0.55 || part.rawText.length < charsPerScene * 0.55) {
      const expanded = await ask([
        prompt,
        ``,
        `A cena veio CURTA DEMAIS (~${words} palavras; meta ~${wordsPerScene}). Reescreva a MESMA cena mais longa e densa, no tom do canal, perto de ~${charsPerScene} caracteres e NUNCA acima de ${TTS_MAX}.`,
      ].join("\n"));
      if (findForbiddenPhrases(expanded.rawText, avoid).length === 0 && countWords(expanded.rawText) > words) part = expanded;
    }

    if (part.rawText.length > TTS_MAX) {
      const shrunk = await ask([
        prompt,
        ``,
        `A cena estourou o limite TTS (${part.rawText.length} > ${TTS_MAX}). Reescreva MAIS CURTA, condensando sem cortar o arco desta cena. Alvo: ~${charsPerScene} caracteres.`,
      ].join("\n"));
      if (findForbiddenPhrases(shrunk.rawText, avoid).length === 0 && shrunk.rawText.length < part.rawText.length) part = shrunk;
    }

    const sceneLines = toLines(part.rawText);
    const base = allLines.length;
    allLines.push(...sceneLines);
    if (sceneLines.length > 0) sectionBreaks.push(base + sceneLines.length - 1);
    previousTail = sceneLines.slice(-3).join("\n");
  }

  return { rawText: allLines.join("\n\n"), sectionBreaks: [...new Set(sectionBreaks)], usage };
}

/**
 * "Gerar roteiros selecionados": one project + script per idea (and per
 * format when the plan is "both"), status "script" awaiting review.
 */
export async function generateChannelViewScripts(args: {
  channel: Channel;
  topic: string;
  durationMinutes: number;
  format: VideoFormat;
  ideas: ContentIdea[];
  provider: ChannelViewProvider;
  sceneCount: number;
  targetWords: number;
}): Promise<string[]> {
  const channel = channelForGeneration(args.channel, true);
  const previousScripts = await listScriptTextsForChannel(channel.id);
  const formats: Exclude<VideoFormat, "both">[] = args.format === "both" ? ["video", "short"] : [args.format];
  const createdProjectIds: string[] = [];

  for (const idea of args.ideas) {
    const generated = channel.dna.usesScript
      ? await writeScript({
          channel,
          topic: args.topic,
          idea,
          provider: args.provider,
          sceneCount: args.sceneCount,
          targetWords: args.targetWords,
          previousScripts,
        })
      : { rawText: `Ambiente contínuo sobre ${args.topic}.`, sectionBreaks: [] as number[], usage: undefined };

    const rawLines = normalizeSceneBreaks(
      parseGeneratedScript(generated, channel.dna.scriptRules.pauses),
      args.sceneCount || DEFAULT_SCENE_COUNT,
      channel.dna.scriptRules.pauses
    );
    const wordCount = rawLines.reduce((sum, line) => sum + countWords(line.text), 0);

    const ideaProjectIds: string[] = [];
    for (const format of formats) {
      const project = await createVideoProject({
        channelId: channel.id,
        contentIdeaId: idea.id,
        title: idea.title,
        topic: args.topic,
        durationMinutes: args.durationMinutes,
        format,
        seed: hashStringToSeed(`${idea.id}-${format}`),
      });
      const script = await createScript({
        videoProjectId: project.id,
        rawText: generated.rawText,
        lines: rawLines.map((line) => ({ text: line.text, start: 0, end: 0, pauseAfter: line.pauseAfter, sectionBreak: line.sectionBreak })),
        wordCount,
      });
      await attachScriptToProject(project.id, script.id);
      await updateProjectStatus(project.id, "script");
      ideaProjectIds.push(project.id);
    }
    createdProjectIds.push(...ideaProjectIds);

    if (generated.usage && ideaProjectIds[0]) {
      await insertUsageEvent({
        channelId: channel.id,
        contentIdeaId: idea.id,
        videoProjectId: ideaProjectIds[0],
        stage: "script",
        snapshot: generated.usage,
      });
      for (const projectId of ideaProjectIds.slice(1)) await recomputeProjectCost(projectId);
    }
  }
  return createdProjectIds;
}
