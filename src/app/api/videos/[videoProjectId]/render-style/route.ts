import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  renderVideo,
  isFfmpegVideoStyle,
  mergePresetSettings,
  getPreset,
} from "../../../../../core/videoRenderers";
import {
  getVideoProject,
  getScript,
  getAudioAsset,
  updateProjectVideoStyle,
  updateProjectStatus,
  completeProjectRender,
} from "../../../../../core/repo/projects";
import { getChannel } from "../../../../../core/repo/channels";
import {
  ensureLocalFile,
  persistRenderLocalFirst,
  workingFilePath,
} from "../../../../../core/storage";
import {
  VideoStyleId,
  VideoStylePresetId,
  AspectRatioId,
} from "../../../../../core/videoRenderers/types";
import { mediaUrl } from "../../../../../core/media";
import { insertUsageEvent } from "../../../../../core/repo/usage";
import { createJob, getJobForProject, updateJob } from "../../../../../core/repo/jobs";
import type { ScriptLine } from "../../../../../core/types";

export async function POST(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const channel = await getChannel(project.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  if (!project.audioAssetId) {
    return NextResponse.json({ error: "Gere a voz antes do vídeo." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const styleId = (body.styleId || "scrolling-text") as VideoStyleId;
  const presetId = (body.presetId || "amor-amor") as VideoStylePresetId;
  const preview = Boolean(body.preview);
  const previewSeconds = preview ? Number(body.previewSeconds) || 15 : null;
  const aspectRatio = (body.aspectRatio || "9:16") as AspectRatioId;
  const settings = mergePresetSettings(presetId, {
    ...(body.settings || {}),
    aspectRatio,
  });

  if (!isFfmpegVideoStyle(styleId) && styleId !== "neon-meditation") {
    return NextResponse.json(
      { error: `Estilo «${styleId}» ainda não está disponível.` },
      { status: 400 }
    );
  }

  const asset = await getAudioAsset(project.audioAssetId);
  if (!asset) return NextResponse.json({ error: "Áudio não encontrado" }, { status: 404 });
  const script = project.scriptId ? await getScript(project.scriptId) : null;
  const scriptText =
    script?.rawText ||
    (script?.lines ?? []).map((l: ScriptLine) => l.text).join("\n\n") ||
    project.title;

  // Which mix to burn into the video. Default = voice only (no music/SFX).
  const audioSourceRaw = String(body.audioSource || (body.voiceOnly === false ? "full" : "voice"));
  const audioSource =
    audioSourceRaw === "music" || audioSourceRaw === "sfx" || audioSourceRaw === "full"
      ? audioSourceRaw
      : "voice";

  let audioRef = asset.filePath;
  if (audioSource === "music") {
    if (!project.mixMusicRef) {
      return NextResponse.json(
        { error: "Gera primeiro a versão voz+música (ou usa Gerar vídeo nessa opção)." },
        { status: 400 }
      );
    }
    audioRef = project.mixMusicRef;
  } else if (audioSource === "sfx") {
    if (!project.mixSfxRef) {
      return NextResponse.json(
        { error: "Gera primeiro a versão voz+SFX (ou usa Gerar vídeo nessa opção)." },
        { status: 400 }
      );
    }
    audioRef = project.mixSfxRef;
  } else if (audioSource === "full") {
    if (!project.mixAudioRef) {
      return NextResponse.json(
        { error: "Gera primeiro o mix completo (ou usa Gerar vídeo nessa opção)." },
        { status: 400 }
      );
    }
    audioRef = project.mixAudioRef;
  }

  const sourceLabel =
    audioSource === "voice"
      ? "só voz"
      : audioSource === "music"
        ? "voz+música"
        : audioSource === "sfx"
          ? "voz+SFX"
          : "mix completo";

  const localAudio = await ensureLocalFile(
    channel.id,
    audioRef,
    `render-audio-${audioSource}${path.extname(audioRef) || ".mp3"}`
  );

  await updateProjectVideoStyle(project.id, {
    styleId,
    presetId,
    settings,
    enabled: true,
  });

  if (styleId === "neon-meditation") {
    return NextResponse.json(
      {
        error:
          "Use Aprovar/Atualizar para o estilo Remotion legado, ou escolha um estilo de texto rolante.",
      },
      { status: 400 }
    );
  }

  // Persist progress so leaving the Áudio tab doesn't look like the job stopped.
  let job = await getJobForProject(project.id);
  if (!preview) {
    if (!job) {
      job = await createJob({ videoProjectId: project.id, channelId: channel.id });
    }
    await updateProjectStatus(project.id, "rendering", null);
    await updateJob(job.id, {
      status: "rendering",
      progress: 10,
      statusMessage: `Renderizando vídeo (${sourceLabel})…`,
    });
  }

  const fileName = preview ? `preview-${project.id}.mp4` : `${project.id}.mp4`;
  const outPath = workingFilePath(channel.id, "render", fileName);

  try {
    if (job && !preview) {
      await updateJob(job.id, {
        status: "rendering",
        progress: 40,
        statusMessage: `FFmpeg · texto rolante (${sourceLabel})…`,
      });
    }

    // Heartbeat while FFmpeg runs — otherwise the UI sits at 40% for many minutes.
    let tick = 40;
    const heartbeat =
      job && !preview
        ? setInterval(() => {
            tick = Math.min(88, tick + 3);
            void updateJob(job!.id, {
              status: "rendering",
              progress: tick,
              statusMessage: `FFmpeg · texto rolante (${sourceLabel})…`,
            }).catch(() => undefined);
          }, 15_000)
        : null;

    let result;
    try {
      result = await renderVideo({
        audioPath: localAudio,
        scriptText,
        styleId,
        settings,
        outputPath: outPath,
        previewSeconds,
        onProgress: (pct, message) => {
          if (!job || preview) return;
          const mapped = Math.max(40, Math.min(90, Math.round(pct)));
          tick = Math.max(tick, mapped);
          void updateJob(job.id, {
            status: "rendering",
            progress: tick,
            statusMessage: message || `FFmpeg · texto rolante (${sourceLabel})…`,
          }).catch(() => undefined);
        },
      });
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }

    if (job && !preview) {
      await updateJob(job.id, {
        status: "rendering",
        progress: 92,
        statusMessage: "A guardar vídeo neste PC…",
      });
    }

    // Local-first: FFmpeg output stays on disk; Supabase/YouTube are optional later.
    const persisted = await persistRenderLocalFirst(outPath, channel.id, fileName);
    const { ref, localAbsolutePath, uploadWarning } = persisted;

    if (!preview) {
      await completeProjectRender(project.id, ref, result.durationSeconds);
      if (uploadWarning) {
        await updateProjectStatus(project.id, "completed", uploadWarning).catch(() => undefined);
      }
      if (job) {
        await updateJob(job.id, {
          status: "completed",
          progress: 100,
          statusMessage: uploadWarning
            ? "Vídeo pronto (só neste PC — Supabase depois)"
            : "Vídeo pronto",
        });
      }
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

    return NextResponse.json({
      preview,
      durationSeconds: result.durationSeconds,
      url: mediaUrl(channel.id, ref),
      project: await getVideoProject(project.id),
      preset: getPreset(presetId).label,
      localAbsolutePath,
      uploadWarning,
      localOnly: Boolean(uploadWarning) || !/^https?:\/\//i.test(ref),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!preview) {
      await updateProjectStatus(project.id, "failed", message).catch(() => undefined);
      if (job) {
        await updateJob(job.id, {
          status: "failed",
          progress: 0,
          statusMessage: message.slice(0, 240),
        }).catch(() => undefined);
      }
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
