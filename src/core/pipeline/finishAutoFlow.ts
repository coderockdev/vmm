import path from "path";
import { Channel, VideoProject } from "../types";
import { produceAudioBed } from "./produceAudioBed";
import {
  getVideoProject,
  getScript,
  getAudioAsset,
  updateProjectVideoStyle,
  completeProjectRender,
  updateProjectThumbnail,
} from "../repo/projects";
import { ensureLocalFile, persistFile, persistRenderLocalFirst, workingFilePath } from "../storage";
import { renderVideo, mergePresetSettings } from "../videoRenderers";
import { generateCoverConcept } from "../providers/script/coverConcept";
import { getImageProvider } from "../providers/image";
import { stylesForCount, mergeThumbnailHistory } from "../providers/image/thumbnailStyles";
import { buildThumbnailImagePrompt } from "../providers/script/coverConcept";
import { normalizeCoverDna } from "../providers/image/coverFormats";
import { updateChannelDna } from "../repo/channels";
import { insertUsageEvent } from "../repo/usage";
import { randomUUID } from "crypto";
import { getYoutubeAccountForChannel } from "../repo/youtubeAccounts";
import { publishProjectToYoutube } from "../youtube/publishProject";
import { YoutubeAuthError, YoutubeQuotaError } from "../youtube/oauth";

export type AutoFlowStageHook = (message: string, progress: number) => void | Promise<void>;

/**
 * After TTS: music/SFX → scrolling-text video → portada → YouTube (privado).
 * Thumbnail / YouTube failures are non-fatal for the local video.
 */
export async function finishAutoFlowAfterAudio(args: {
  channel: Channel;
  projectId: string;
  onProgress?: AutoFlowStageHook;
  /** Default false = generate music + SFX. Set true for voice-only. */
  voiceOnly?: boolean;
  /** Default true = upload to YouTube when account is connected. */
  uploadYoutube?: boolean;
}): Promise<VideoProject> {
  const { channel, projectId, onProgress, voiceOnly = false, uploadYoutube = true } = args;
  const report = async (message: string, progress: number) => {
    await onProgress?.(message, progress);
  };

  if (voiceOnly) {
    await report("Pulando música/SFX (só voz)…", 58);
    await produceAudioBed({ projectId, musicOff: true, sfxOff: true });
  } else {
    await report("Gerando música e SFX…", 58);
    await produceAudioBed({ projectId });
  }

  let project = await getVideoProject(projectId);
  if (!project) throw new Error("Project not found after audio bed");

  await report("Renderizando vídeo (texto rolante)…", 72);
  await renderScrollingAutoVideo({ channel, project, voiceOnly });

  project = (await getVideoProject(projectId))!;

  try {
    await report("Gerando portada…", 88);
    await generateAutoThumbnail({ channel, project });
  } catch (err) {
    console.warn(
      "[auto-flow] thumbnail failed (video kept):",
      err instanceof Error ? err.message : err
    );
  }

  project = (await getVideoProject(projectId))!;

  if (uploadYoutube) {
    const account = await getYoutubeAccountForChannel(channel.id);
    if (!account) {
      await report("Vídeo pronto — YouTube não ligado (aba YouTube → Conectar)", 100);
    } else {
      try {
        await report("A subir para YouTube (privado)…", 94);
        const published = await publishProjectToYoutube({
          channelId: channel.id,
          projectId,
          onProgress: async (msg) => report(msg, 96),
        });
        await report(
          published.thumbnailOk
            ? `YouTube privado OK · Studio`
            : `YouTube privado OK (capa: ${published.thumbnailError?.slice(0, 80) || "pendente"})`,
          100
        );
      } catch (err) {
        const msg =
          err instanceof YoutubeAuthError || err instanceof YoutubeQuotaError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        console.warn("[auto-flow] YouTube upload failed (video kept local):", msg);
        await report(`Vídeo local OK — YouTube falhou: ${msg.slice(0, 120)}`, 100);
      }
    }
  } else {
    await report("Vídeo + portada prontos (upload YT desligado)", 100);
  }

  return (await getVideoProject(projectId))!;
}

async function renderScrollingAutoVideo(args: {
  channel: Channel;
  project: VideoProject;
  voiceOnly?: boolean;
}): Promise<void> {
  const { channel, project, voiceOnly } = args;
  if (!project.audioAssetId) throw new Error("Sem áudio para renderizar.");

  const asset = await getAudioAsset(project.audioAssetId);
  if (!asset) throw new Error("Áudio não encontrado.");

  const script = project.scriptId ? await getScript(project.scriptId) : null;
  const scriptText =
    script?.rawText ||
    (script?.lines ?? []).map((l) => l.text).join("\n\n") ||
    project.title;

  const styleId = "scrolling-text" as const;
  const presetId = "amor-amor" as const;
  const settings = mergePresetSettings(presetId, {
    aspectRatio: project.format === "short" ? "9:16" : "9:16",
  });

  await updateProjectVideoStyle(project.id, {
    styleId,
    presetId,
    settings,
    enabled: true,
  });

  const audioRef = voiceOnly ? asset.filePath : project.mixAudioRef || asset.filePath;
  const localAudio = await ensureLocalFile(
    channel.id,
    audioRef,
    `render-audio${path.extname(audioRef) || ".mp3"}`
  );

  const fileName = `${project.id}.mp4`;
  const outPath = workingFilePath(channel.id, "render", fileName);
  const result = await renderVideo({
    audioPath: localAudio,
    scriptText,
    styleId,
    settings,
    outputPath: outPath,
  });

  const persisted = await persistRenderLocalFirst(outPath, channel.id, fileName);
  await completeProjectRender(project.id, persisted.ref, result.durationSeconds);
  await insertUsageEvent({
    channelId: channel.id,
    contentIdeaId: project.contentIdeaId,
    videoProjectId: project.id,
    stage: "render",
    snapshot: {
      provider: "local",
      model: `ffmpeg-${styleId}`,
      durationSeconds: result.durationSeconds,
    },
  }).catch(() => undefined);
}

async function generateAutoThumbnail(args: {
  channel: Channel;
  project: VideoProject;
}): Promise<void> {
  const { channel, project } = args;
  const script = project.scriptId ? await getScript(project.scriptId) : null;
  const titleHint = project.headline || project.title;

  const { concept, usage } = await generateCoverConcept({
    channel,
    project,
    script,
    formatChoice: "auto",
    titleHint,
  });

  if (usage) {
    await insertUsageEvent({
      channelId: channel.id,
      contentIdeaId: project.contentIdeaId,
      videoProjectId: project.id,
      stage: "thumbnail",
      snapshot: usage,
    }).catch(() => undefined);
  }

  await updateProjectThumbnail(project.id, {
    ...concept,
    history: mergeThumbnailHistory(project.thumbnailConcept?.history, project.thumbnailConcept?.candidates ?? []),
  });

  const provider = getImageProvider(null);
  const style = stylesForCount(1)[0];
  const prompt = buildThumbnailImagePrompt({
    channel,
    concept,
    styleExtra: style.promptExtra,
  });
  const fileName = `thumb-${project.id}-auto-${Date.now()}.png`;
  const outPath = workingFilePath(channel.id, "thumbnails", fileName);
  await provider.generate({ prompt, outPath });
  const ref = await persistFile(outPath, channel.id, "thumbnails", fileName, "image/png");

  const candidate = {
    id: randomUUID(),
    styleId: style.id,
    styleLabel: style.label,
    ref,
    createdAt: new Date().toISOString(),
  };
  const history = mergeThumbnailHistory(concept.history, [candidate]);
  await updateProjectThumbnail(
    project.id,
    {
      ...concept,
      imageProvider: provider.name,
      candidates: [candidate],
      selectedCandidateIndex: 0,
      history,
      status: "generated",
      updatedAt: new Date().toISOString(),
    },
    ref
  );

  const cover = normalizeCoverDna(channel.dna.visual?.cover);
  const formatId = String(concept.thumbnailFormatId ?? "");
  if (formatId && formatId !== "auto" && formatId !== "invent") {
    cover.recentFormatIds = [...cover.recentFormatIds, formatId].slice(-20);
    await updateChannelDna(channel.id, {
      ...channel.dna,
      visual: { ...channel.dna.visual, cover },
    }).catch(() => undefined);
  }
}
