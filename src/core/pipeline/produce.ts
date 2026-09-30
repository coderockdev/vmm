import { getChannel } from "../repo/channels";
import { getIdea } from "../repo/plans";
import {
  getVideoProject,
  getScript,
  setTtsProviderOverride,
  createScript,
  attachScriptToProject,
  listScriptTextsForChannel,
  updateProjectStatus,
} from "../repo/projects";
import { scriptContainsProductionBrief } from "../providers/script/phraseBanks";
import { createJob } from "../repo/jobs";
import { insertUsageEvent } from "../repo/usage";
import { enqueueJob } from "./queue";
import { withScriptProviderFallback } from "../providers/script/withFallback";
import { parseGeneratedScript, normalizeSceneBreaks } from "../scriptLines";
import { TTSProviderName } from "../providers/tts/TTSProvider";
import { Script } from "../types";

/**
 * The human-review gate: a VideoProject sits at status "script" until this is
 * called. Picks the voice for this generation (or keeps the channel default)
 * and hands the project to the existing single-concurrency queue — from here
 * on nothing changes vs. the old one-shot flow (runProject.ts is untouched).
 */
export async function approveScriptAndProduce(
  projectId: string,
  ttsProviderOverride: TTSProviderName | null,
  ttsVoiceIdOverride: string | null = null
): Promise<void> {
  const project = await getVideoProject(projectId);
  if (!project) throw new Error(`Video project not found: ${projectId}`);
  // Allow retry after any failed attempt that still has a script (Áudio → Tentar de novo).
  const canRetryFailed = project.status === "failed" && Boolean(project.scriptId);
  if (project.status !== "script" && !canRetryFailed) {
    throw new Error(`Project is not awaiting review (status: ${project.status})`);
  }

  const channel = await getChannel(project.channelId);
  if (!channel) throw new Error(`Channel not found: ${project.channelId}`);

  const scriptText = project.scriptId ? (await getScript(project.scriptId))?.rawText ?? "" : "";
  if (scriptContainsProductionBrief(scriptText) || scriptContainsProductionBrief(project.topic)) {
    throw new Error(
      "Este guion lee la instrucción de títulos («nuevos títulos», «referencias»), no una oración. No se graba ni se sube."
    );
  }

  const { resolvePipelineAudioVoice, JUAN_CARLOS_ELEVENLABS_VOICE_ID } = await import(
    "../providers/tts/voiceCapabilities"
  );
  const resolved = resolvePipelineAudioVoice({
    channelProvider: channel.dna.voice.provider,
    channelVoiceId: channel.dna.voice.voiceId,
    profile: channel.dna.voice.profile,
    ttsOverride: ttsProviderOverride,
    ttsVoiceIdOverride,
  });

  if (resolved.provider === "heygen") {
    throw new Error(
      "HeyGen só gera o vídeo pelo template. O áudio do pipeline usa a voz ElevenLabs do Juan Carlos (elevenlabs_voice_id)."
    );
  }

  const voiceId =
    resolved.voiceId?.trim() ||
    channel.dna.voice.profile?.elevenlabs_voice_id ||
    (resolved.provider === "elevenlabs" ? JUAN_CARLOS_ELEVENLABS_VOICE_ID : null);
  if (resolved.provider === "elevenlabs" && !voiceId) {
    throw new Error(
      "ElevenLabs sem voice_id. O DNA precisa de elevenlabs_voice_id (Juan Carlos) ou escolha uma voz ao aprovar."
    );
  }

  // Persist the resolved audio voice so the worker uses Juan Carlos (not Rachel).
  // If the DB column is missing, this clears a bare "elevenlabs" override instead
  // of leaving a broken state — narration then resolves voice from DNA.
  await setTtsProviderOverride(projectId, resolved.provider, voiceId);

  // Flip status immediately so the Áudio tab shows "em produção" before the
  // worker loop picks the job up (otherwise the card stays on Roteiros).
  await updateProjectStatus(projectId, "audio", null);
  const job = await createJob({ videoProjectId: project.id, channelId: project.channelId });
  await enqueueJob(job.id);
}

/**
 * Discards the current script and generates a fresh one for the same idea —
 * optionally with a different AI provider. Project stays at status "script"
 * so it's still sitting in the review queue afterwards.
 */
export async function regenerateScript(projectId: string, aiProviderOverride: string | null): Promise<Script> {
  const project = await getVideoProject(projectId);
  if (!project) throw new Error(`Video project not found: ${projectId}`);
  if (project.status !== "script") {
    throw new Error(`Project is not awaiting review (status: ${project.status})`);
  }

  const channel = await getChannel(project.channelId);
  if (!channel) throw new Error(`Channel not found: ${project.channelId}`);

  const idea = project.contentIdeaId ? await getIdea(project.contentIdeaId) : null;
  if (!idea) throw new Error("Original content idea not found; cannot regenerate this script.");

  const previousScripts = await listScriptTextsForChannel(channel.id);

  const generated = channel.dna.usesScript
    ? await withScriptProviderFallback({
        preferred: aiProviderOverride,
        run: (provider) =>
          provider.generateScript({
            channel,
            topic: project.topic,
            contentIdea: idea,
            durationMinutes: project.durationMinutes,
            sceneCount: channel.dna.scriptRules.defaultSceneCount,
            previousScripts,
          }),
      })
    : {
        rawText: `Ambiente contínuo sobre ${project.topic}.`,
        sectionBreaks: [] as number[],
        usage: { provider: "mock" as const, model: "mock", inputTokens: 0, outputTokens: 0 },
      };

  const rawLines = normalizeSceneBreaks(
    parseGeneratedScript(generated, channel.dna.scriptRules.pauses),
    channel.dna.scriptRules.defaultSceneCount ?? 4,
    channel.dna.scriptRules.pauses
  );
  const wordCount = rawLines.reduce((sum, l) => sum + l.text.split(/\s+/).filter(Boolean).length, 0);

  const script = await createScript({
    videoProjectId: project.id,
    rawText: generated.rawText,
    lines: rawLines.map((l) => ({ text: l.text, start: 0, end: 0, pauseAfter: l.pauseAfter, sectionBreak: l.sectionBreak })),
    wordCount,
  });
  await attachScriptToProject(project.id, script.id);

  if (generated.usage) {
    await insertUsageEvent({
      channelId: channel.id,
      contentIdeaId: idea.id,
      videoProjectId: project.id,
      stage: "script",
      snapshot: generated.usage,
    });
  }

  return script;
}
