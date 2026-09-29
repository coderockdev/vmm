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
  completeProjectRender,
} from "../../../../../core/repo/projects";
import { getChannel } from "../../../../../core/repo/channels";
import { ensureLocalFile, persistFile, workingFilePath } from "../../../../../core/storage";
import {
  VideoStyleId,
  VideoStylePresetId,
  AspectRatioId,
} from "../../../../../core/videoRenderers/types";
import { mediaUrl } from "../../../../../core/media";
import { insertUsageEvent } from "../../../../../core/repo/usage";
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

  const audioRef = project.mixAudioRef || asset.filePath;
  const localAudio = await ensureLocalFile(
    channel.id,
    audioRef,
    `render-audio${path.extname(audioRef) || ".mp3"}`
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

  const fileName = preview ? `preview-${project.id}.mp4` : `${project.id}.mp4`;
  const outPath = workingFilePath(channel.id, "render", fileName);

  try {
    const result = await renderVideo({
      audioPath: localAudio,
      scriptText,
      styleId,
      settings,
      outputPath: outPath,
      previewSeconds,
    });

    const ref = await persistFile(outPath, channel.id, "render", fileName, "video/mp4");

    if (!preview) {
      await completeProjectRender(project.id, ref, result.durationSeconds);
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
