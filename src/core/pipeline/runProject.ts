import { getJob, updateJob } from "../repo/jobs";
import {
  getVideoProject,
  updateProjectStatus,
  getScript,
  getAudioAsset,
  updateScriptLines,
  attachAudioToProject,
  createAudioAsset,
  completeProjectRender,
} from "../repo/projects";
import { getChannel } from "../repo/channels";
import { insertUsageEvent } from "../repo/usage";
import { synthesizeNarration } from "./narration";
import { finishAutoFlowAfterAudio, finishProjectToYoutube } from "./finishAutoFlow";
import { RawLine, normalizeSceneBreaks } from "../scriptLines";
import { VideoFormat } from "../types";
import { UsageProvider } from "../usage/types";

// Lazy: avoid pulling Remotion/AWS into every page that seeds/reconciles jobs.

/**
 * Executes the heavy part of a single video's pipeline (audio → timing →
 * composing → rendering). Script generation already happened synchronously
 * before the job was enqueued.
 *
 * When project.autoFlow is set: after TTS runs music/SFX + scrolling-text + portada.
 */
export async function runProject(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const project = await getVideoProject(job.videoProjectId);
  if (!project) throw new Error(`Video project not found: ${job.videoProjectId}`);

  const channel = await getChannel(project.channelId);
  if (!channel) throw new Error(`Channel not found: ${project.channelId}`);

  try {
    if (project.youtubeVideoId) {
      await updateJob(job.id, {
        status: "completed",
        progress: 100,
        statusMessage: "Já está no YouTube — sem nova narração nem novo vídeo",
      });
      await updateProjectStatus(project.id, "completed", null);
      return;
    }

    let lines = project.scriptId ? (await getScript(project.scriptId))?.lines ?? [] : [];
    let audioAbsolutePath: string | null = null;
    let durationInSeconds = project.durationMinutes * 60;

    if (channel.dna.usesNarration && project.scriptId) {
      // Re-read: a restarted or duplicate job must not pay ElevenLabs again.
      const fresh = await getVideoProject(project.id);
      const existing = fresh?.audioAssetId ? await getAudioAsset(fresh.audioAssetId) : null;
      if (existing) {
        await updateJob(job.id, {
          status: "timing",
          progress: 55,
          statusMessage: "Áudio já gravado — reutilizando, sem nova narração",
        });
        await updateProjectStatus(project.id, "timing");
        audioAbsolutePath = existing.filePath;
        durationInSeconds = existing.durationSeconds;
      } else {
      await updateJob(job.id, { status: "audio", progress: 25, statusMessage: "Gerando áudio..." });
      await updateProjectStatus(project.id, "audio");

      const rawLines: RawLine[] = normalizeSceneBreaks(
        lines.map((l) => ({
          text: l.text,
          pauseAfter: l.pauseAfter,
          sectionBreak: Boolean(l.sectionBreak),
        })),
        channel.dna.scriptRules.defaultSceneCount ?? 4,
        channel.dna.scriptRules.pauses
      );

      if (project.scriptId) {
        const normalizedScriptLines = rawLines.map((l, i) => ({
          ...lines[i],
          text: l.text,
          pauseAfter: l.pauseAfter,
          sectionBreak: l.sectionBreak,
          start: lines[i]?.start ?? 0,
          end: lines[i]?.end ?? 0,
        }));
        await updateScriptLines(project.scriptId, normalizedScriptLines).catch(() => undefined);
      }

      const narration = await synthesizeNarration({
        channel,
        videoProjectId: project.id,
        lines: rawLines,
        ttsOverride: project.ttsProviderOverride,
        ttsVoiceIdOverride: project.ttsVoiceIdOverride,
      });

      const audioAsset = await createAudioAsset({
        videoProjectId: project.id,
        filePath: narration.filePath,
        durationSeconds: narration.durationSeconds,
        provider: narration.provider,
      });
      await attachAudioToProject(project.id, audioAsset.id);
      await updateScriptLines(project.scriptId, narration.lines);

      lines = narration.lines;
      audioAbsolutePath = narration.filePath;
      durationInSeconds = narration.durationSeconds;

      const ttsProvider = (narration.provider === "heygen" ? "heygen" : narration.provider) as UsageProvider;
      await insertUsageEvent({
        channelId: channel.id,
        contentIdeaId: project.contentIdeaId,
        videoProjectId: project.id,
        stage: "audio",
        snapshot: {
          provider: ttsProvider,
          model:
            narration.provider === "elevenlabs"
              ? "eleven_v3"
              : narration.provider === "cartesia"
                ? "sonic-3.6"
                : narration.provider,
          characters: narration.characters,
          durationSeconds: narration.durationSeconds,
        },
      });

      await updateJob(job.id, { status: "timing", progress: 55, statusMessage: "Sincronizando texto..." });
      await updateProjectStatus(project.id, "timing");
      }
    }

    // Auto-flow: music/SFX → FFmpeg scrolling text → portada (skip Remotion).
    // Re-read so a restarted job never re-renders or re-uploads work already done.
    // The Hetzner worker always finishes with scrolling-text FFmpeg.
    // Remotion Lambda ignores remote audio and bills per minute.
    if (project.autoFlow || process.env.VMM_WORKER_NAME) {
      const current = (await getVideoProject(project.id)) ?? project;
      const onProgress = async (message: string, progress: number) => {
        await updateJob(job.id, {
          status: progress >= 72 ? "rendering" : "composing",
          progress: Math.min(98, progress),
          statusMessage: message,
        }).catch(() => undefined);
        if (progress >= 72) {
          await updateProjectStatus(project.id, "rendering").catch(() => undefined);
        }
      };

      if (current.youtubeVideoId) {
        await updateJob(job.id, {
          status: "completed",
          progress: 100,
          statusMessage: "Já está no YouTube — sem nova narração nem novo vídeo",
        });
        return;
      }

      const finished = current.renderPath
        ? await (async () => {
            await updateJob(job.id, {
              status: "rendering",
              progress: 90,
              statusMessage: "Vídeo já pronto — a subir, sem renderizar de novo",
            });
            return finishProjectToYoutube({
              channelId: channel.id,
              projectId: project.id,
              onProgress,
            });
          })()
        : await (async () => {
            await updateJob(job.id, {
              status: "composing",
              progress: 60,
              statusMessage: current.mixAudioRef
                ? "Vídeo em falta — música já existe, a renderizar"
                : "Música e SFX...",
            });
            await updateProjectStatus(project.id, "composing");
            return finishAutoFlowAfterAudio({
              channel,
              projectId: project.id,
              voiceOnly: false,
              uploadYoutube: true,
              onProgress,
            });
          })();

      await updateJob(job.id, {
        status: "completed",
        progress: 100,
        statusMessage: finished?.youtubeVideoId
          ? "YouTube OK (privado)"
          : "Vídeo pronto — YouTube não ligado",
      });
      return;
    }

    await updateJob(job.id, { status: "composing", progress: 65, statusMessage: "Preparando composição..." });
    await updateProjectStatus(project.id, "composing");

    await updateJob(job.id, { status: "rendering", progress: 75, statusMessage: "Renderizando..." });
    await updateProjectStatus(project.id, "rendering");

    const format: Exclude<VideoFormat, "both"> = project.format === "short" ? "short" : "video";

    const { renderVideoProject } = await import("./render");
    const result = await renderVideoProject({
      channel,
      videoProjectId: project.id,
      lines,
      seed: project.seed,
      durationInSeconds,
      format,
      audioAbsolutePath,
      onProgress: (progress, message) => {
        updateJob(job.id, { progress: Math.min(98, progress), statusMessage: message }).catch(() => {});
      },
    });

    await completeProjectRender(project.id, result.relativeRenderPath, result.durationSeconds);

    const renderProvider =
      (process.env.RENDER_PROVIDER ?? "local").toLowerCase() === "lambda"
        ? ("remotion-lambda" as const)
        : ("local" as const);
    await insertUsageEvent({
      channelId: channel.id,
      contentIdeaId: project.contentIdeaId,
      videoProjectId: project.id,
      stage: "render",
      snapshot: {
        provider: renderProvider,
        model: renderProvider === "remotion-lambda" ? process.env.REMOTION_LAMBDA_FUNCTION_NAME ?? "lambda" : "local",
        durationSeconds: result.durationSeconds,
      },
    });

    await updateJob(job.id, { status: "completed", progress: 100, statusMessage: "Vídeo pronto" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateProjectStatus(project.id, "failed", message);
    await updateJob(job.id, { status: "failed", statusMessage: message });
    throw err;
  }
}
