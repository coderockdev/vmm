import { getJob, updateJob } from "../repo/jobs";
import { getVideoProject, updateProjectStatus, getScript, updateScriptLines, attachAudioToProject, createAudioAsset, completeProjectRender } from "../repo/projects";
import { getChannel } from "../repo/channels";
import { synthesizeNarration } from "./narration";
import { renderVideoProject } from "./render";
import { RawLine } from "../scriptLines";
import { VideoFormat } from "../types";

/**
 * Executes the heavy part of a single video's pipeline (audio → timing →
 * composing → rendering). Script generation already happened synchronously
 * before the job was enqueued (it's cheap with a mock/local provider).
 */
export async function runProject(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const project = await getVideoProject(job.videoProjectId);
  if (!project) throw new Error(`Video project not found: ${job.videoProjectId}`);

  const channel = await getChannel(project.channelId);
  if (!channel) throw new Error(`Channel not found: ${project.channelId}`);

  try {
    let lines = project.scriptId ? (await getScript(project.scriptId))?.lines ?? [] : [];
    let audioAbsolutePath: string | null = null;
    let durationInSeconds = project.durationMinutes * 60;

    if (channel.dna.usesNarration && project.scriptId) {
      await updateJob(job.id, { status: "audio", progress: 25, statusMessage: "Gerando áudio..." });
      await updateProjectStatus(project.id, "audio");

      const rawLines: RawLine[] = lines.map((l) => ({
        text: l.text,
        pauseAfter: l.pauseAfter,
        sectionBreak: Boolean(l.sectionBreak),
      }));

      const narration = await synthesizeNarration({
        channel,
        videoProjectId: project.id,
        lines: rawLines,
        ttsOverride: project.ttsProviderOverride,
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

      await updateJob(job.id, { status: "timing", progress: 55, statusMessage: "Sincronizando texto..." });
      await updateProjectStatus(project.id, "timing");
    }

    await updateJob(job.id, { status: "composing", progress: 65, statusMessage: "Preparando composição..." });
    await updateProjectStatus(project.id, "composing");

    await updateJob(job.id, { status: "rendering", progress: 75, statusMessage: "Renderizando..." });
    await updateProjectStatus(project.id, "rendering");

    const format: Exclude<VideoFormat, "both"> = project.format === "short" ? "short" : "video";

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
    await updateJob(job.id, { status: "completed", progress: 100, statusMessage: "Vídeo pronto" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateProjectStatus(project.id, "failed", message);
    await updateJob(job.id, { status: "failed", statusMessage: message });
    throw err;
  }
}
