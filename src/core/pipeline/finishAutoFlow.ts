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
import { generateCoverConcept, buildThumbnailImagePrompt } from "../providers/script/coverConcept";
import { getImageProvider } from "../providers/image";
import { mergeThumbnailHistory, type ThumbnailCandidate } from "../providers/image/thumbnailStyles";
import { normalizeCoverDna, pickRotatingCoverFormats } from "../providers/image/coverFormats";
import { updateChannelDna } from "../repo/channels";
import { insertUsageEvent } from "../repo/usage";
import { randomUUID } from "crypto";
import { getYoutubeAccountForChannel } from "../repo/youtubeAccounts";
import { publishProjectToYoutube } from "../youtube/publishProject";
import { YoutubeAuthError, YoutubeQuotaError } from "../youtube/oauth";
import { getChannel } from "../repo/channels";
import { getIdea } from "../repo/plans";
import { generateYoutubeCopy } from "./generateYoutubeCopy";
import { writeProjectPublish } from "../repo/projectPublish";

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
}): Promise<VideoProject | null> {
  const { channel, projectId, onProgress, voiceOnly = false, uploadYoutube = true } = args;
  const report = async (message: string, progress: number) => {
    await onProgress?.(message, progress);
  };

  const beforeBed = await getVideoProject(projectId);
  if (voiceOnly) {
    await report("Pulando música/SFX (só voz)…", 58);
    await produceAudioBed({ projectId, musicOff: true, sfxOff: true });
  } else if (beforeBed?.mixAudioRef) {
    await report("Música já gravada — reutilizando, sem gerar de novo", 58);
  } else {
    await report("Gerando música e SFX…", 58);
    await produceAudioBed({ projectId });
  }

  let project = await getVideoProject(projectId);
  if (!project) throw new Error("Project not found after audio bed");

  await report("Renderizando vídeo (texto rolante)…", 72);
  await renderScrollingAutoVideo({ channel, project, voiceOnly });

  if (uploadYoutube) {
    return finishProjectToYoutube({
      channelId: channel.id,
      projectId,
      onProgress: report,
    });
  }

  await report("Vídeo pronto (upload YT desligado)", 100);
  return (await getVideoProject(projectId)) ?? null;
}

/**
 * Video already on disk: fill missing title/description and covers, then upload
 * private to the connected YouTube channel. Does not re-render or re-run TTS.
 */
export async function finishProjectToYoutube(args: {
  channelId: string;
  projectId: string;
  onProgress?: AutoFlowStageHook;
}): Promise<VideoProject | null> {
  const channel = await getChannel(args.channelId);
  if (!channel) throw new Error("Canal não encontrado");
  const report = async (message: string, progress: number) => {
    await args.onProgress?.(message, progress);
  };

  let project = await getVideoProject(args.projectId);
  if (!project) throw new Error("Projeto não encontrado");
  if (project.youtubeVideoId) {
    await report("Já está no YouTube", 100);
    return project;
  }
  if (!project.renderPath) throw new Error("Sem vídeo renderizado — gera o vídeo antes de subir.");

  if (!project.headline || !project.youtubeDescription) {
    await report("Manchete e descrição…", 86);
    const script = project.scriptId ? await getScript(project.scriptId) : null;
    const idea = project.contentIdeaId ? await getIdea(project.contentIdeaId) : null;
    const copy = await generateYoutubeCopy({
      channel,
      idea: idea ?? { title: project.title, angle: project.topic, objective: "" },
      scriptText:
        script?.rawText ??
        (script?.lines ?? []).map((l) => l.text).join("\n") ??
        project.title,
      aiProviderOverride: "anthropic",
    });
    writeProjectPublish(project.id, {
      headline: copy.headline,
      youtubeDescription: copy.youtubeDescription,
      autoFlow: true,
    });
    project = (await getVideoProject(project.id))!;
  }

  if (!project.thumbnailRef) {
    try {
      await report("Gerando 3 portadas…", 88);
      await generateAutoThumbnail({ channel, project, onProgress: report });
    } catch (err) {
      console.warn(
        "[auto-flow] thumbnail failed (video kept):",
        err instanceof Error ? err.message : err
      );
    }
    project = (await getVideoProject(project.id))!;
  }

  const account = await getYoutubeAccountForChannel(channel.id);
  if (!account) {
    await report("Vídeo pronto — YouTube não ligado (aba YouTube → Conectar)", 100);
    return project;
  }

  await report("A subir para YouTube (privado)…", 94);
  const published = await publishProjectToYoutube({
    channelId: channel.id,
    projectId: project.id,
    onProgress: async (msg) => report(msg, 96),
  });
  await report(
    published.thumbnailOk
      ? "YouTube privado OK"
      : `YouTube privado OK (capa: ${published.thumbnailError?.slice(0, 80) || "pendente"})`,
    100
  );
  return (await getVideoProject(project.id)) ?? null;
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
  onProgress?: AutoFlowStageHook;
}): Promise<void> {
  const { channel, project, onProgress } = args;
  const script = project.scriptId ? await getScript(project.scriptId) : null;
  const titleHint = project.headline || project.title;
  const cover = normalizeCoverDna(channel.dna.visual?.cover);
  const formats = pickRotatingCoverFormats(cover, 3);

  if (formats.length === 0) {
    throw new Error("Nenhum formato de portada habilitado no DNA do canal.");
  }

  await onProgress?.(
    `3 portadas: ${formats.map((f) => f.name).join(" · ")}`,
    88
  );

  // One concept (LLM) — then 3 images with distinct cover formats (cheaper + more reliable).
  const { concept: baseConcept, usage } = await generateCoverConcept({
    channel,
    project,
    script,
    formatChoice: formats[0].id,
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

  const primary = getImageProvider(null);
  // OpenAI first when the key exists. If it has no credits, Gemini still follows
  // the cover brief. Pollinations is last: it ignores the text and stamps a watermark.
  const engineChain = [
    primary,
    getImageProvider("gemini"),
    getImageProvider("pollinations-gptimage"),
    getImageProvider("pollinations"),
    getImageProvider("pollinations-turbo"),
  ].filter((eng, idx, arr) => arr.findIndex((e) => e.name === eng.name) === idx);

  const candidates: ThumbnailCandidate[] = [];
  let history = mergeThumbnailHistory(
    project.thumbnailConcept?.history,
    project.thumbnailConcept?.candidates ?? []
  );

  for (let i = 0; i < formats.length; i++) {
    const format = formats[i];
    await onProgress?.(`Portada ${i + 1}/3 · ${format.name}…`, 88 + Math.min(5, i + 1));

    const conceptForImage = {
      ...baseConcept,
      thumbnailFormatId: format.id,
      thumbnailFormatName: format.name,
    };
    const prompt = buildThumbnailImagePrompt({
      channel,
      concept: conceptForImage,
      styleExtra: `COVER FORMAT LOCK — ${format.name} (${format.previewHint}). Structure: ${format.structure}. Text: ${format.textStrategy}. Visually DISTINCT from the other two variants of this same video.`,
    });
    const fileName = `thumb-${project.id}-${format.id}-${Date.now()}-${i}.png`;
    const outPath = workingFilePath(channel.id, "thumbnails", fileName);

    let generated = false;
    for (let attempt = 0; attempt < engineChain.length && !generated; attempt++) {
      const eng = engineChain[attempt];
      try {
        await eng.generate({ prompt, outPath });
        const ref = await persistFile(outPath, channel.id, "thumbnails", fileName, "image/png");
        const candidate: ThumbnailCandidate = {
          id: randomUUID(),
          styleId: format.id,
          styleLabel: format.name,
          ref,
          createdAt: new Date().toISOString(),
        };
        candidates.push(candidate);
        history = mergeThumbnailHistory(history, [candidate]);
        // Persist after each success so a crash mid-loop still leaves what we have.
        await updateProjectThumbnail(
          project.id,
          {
            ...conceptForImage,
            imageProvider: eng.name,
            candidates: [...candidates],
            selectedCandidateIndex: 0,
            history,
            status: "generated",
            updatedAt: new Date().toISOString(),
          },
          candidates[0].ref
        );
        generated = true;
      } catch (err) {
        console.warn(
          `[auto-flow] portada ${format.id} via ${eng.name} falhou:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error("Nenhuma portada gerada (3 tentativas falharam).");
  }
  if (candidates.length < 3) {
    console.warn(
      `[auto-flow] só ${candidates.length}/3 portadas geradas para ${project.id.slice(0, 8)}`
    );
    await onProgress?.(
      `Portadas: ${candidates.length}/3 OK (algumas falharam — podes regenerar na aba Portadas)`,
      92
    );
  } else {
    await onProgress?.("3 portadas prontas", 92);
  }

  const usedIds = formats.slice(0, candidates.length).map((f) => f.id);
  cover.recentFormatIds = [...cover.recentFormatIds, ...usedIds].slice(-20);
  await updateChannelDna(channel.id, {
    ...channel.dna,
    visual: { ...channel.dna.visual, cover },
  }).catch(() => undefined);
}
