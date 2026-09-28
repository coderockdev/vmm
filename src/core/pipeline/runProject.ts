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
  const job = getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const project = getVideoProject(job.videoProjectId);
  if (!project) throw new Error(`Video project not found: ${job.videoProjectId}`);

  const channel = getChannel(project.channelId);
  if (!channel) throw new Error(`Channel not found: ${project.channelId}`);

  try {
    let lines = project.scriptId ? getScript(project.scriptId)?.lines ?? [] : [];
    let audioAbsolutePath: string | null = null;
    let durationInSeconds = project.durationMinutes * 60;

    if (channel.dna.usesNarration && project.scriptId) {
      updateJob(job.id, { status: "audio", progress: 25, statusMessage: "Gerando áudio..." });
      updateProjectStatus(project.id, "audio");

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

      const audioAsset = createAudioAsset({
        videoProjectId: project.id,
        filePath: narration.filePath,
        durationSeconds: narration.durationSeconds,
        provider: narration.provider,
      });
      attachAudioToProject(project.id, audioAsset.id);
      updateScriptLines(project.scriptId, narration.lines);

      lines = narration.lines;
      audioAbsolutePath = narration.filePath;
      durationInSeconds = narration.durationSeconds;

      updateJob(job.id, { status: "timing", progress: 55, statusMessage: "Sincronizando texto..." });
      updateProjectStatus(project.id, "timing");
    }

    updateJob(job.id, { status: "composing", progress: 65, statusMessage: "Preparando composição..." });
    updateProjectStatus(project.id, "composing");

    updateJob(job.id, { status: "rendering", progress: 75, statusMessage: "Renderizando..." });
    updateProjectStatus(project.id, "rendering");

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
        updateJob(job.id, { progress: Math.min(98, progress), statusMessage: message });
      },
    });

    completeProjectRender(project.id, result.relativeRenderPath, result.durationSeconds);
    updateJob(job.id, { status: "completed", progress: 100, statusMessage: "Vídeo pronto" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateProjectStatus(project.id, "failed", message);
    updateJob(job.id, { status: "failed", statusMessage: message });
    throw err;
  }
}
