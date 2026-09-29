import fs from "fs";
import path from "path";
import { ffprobeDuration, runFfmpeg, ensureParentDir, trimMedia } from "../audio/ffmpegUtils";
import { stripVoiceTags } from "./stripVoiceTags";
import { wrapTextToLines, estimateBlockHeightPx } from "./measureText";
import {
  ASPECT_SIZES,
  RenderStyledVideoArgs,
  RenderStyledVideoResult,
  VideoStyleSettings,
} from "./types";

function assColor(hex: string, alpha = "00"): string {
  // ASS uses &HAABBGGRR
  const h = hex.replace("#", "").padStart(6, "0");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}

function formatAssTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function buildAssFile(args: {
  lines: string[];
  settings: VideoStyleSettings;
  duration: number;
  width: number;
  height: number;
}): string {
  const { lines, settings, duration, width, height } = args;
  const blockH = estimateBlockHeightPx(lines.length, settings);
  const readingY = height * (1 - Math.min(1, Math.max(0, settings.readingZone)));
  // Start: top of block just below bottom of frame. End: bottom of block just above top.
  const startY = height + settings.fontSize;
  const endY = -blockH - settings.fontSize;
  const travel = startY - endY;
  const effectiveDuration = duration / Math.max(0.5, settings.scrollSpeedFactor);
  // We still span the real audio duration; speed factor stretches travel conceptually
  // by adjusting end position slightly when factor ≠ 1.
  const adjustedEndY = startY - travel * settings.scrollSpeedFactor;
  const x = Math.round(width / 2);
  const alignNum = settings.align === "left" ? 7 : settings.align === "right" ? 9 : 8;
  const body = lines.map((l) => (l === "" ? "\\N" : escapeAss(l))).join("\\N");
  const outline = settings.textOutline ? 2.2 : 0;
  const shadow = settings.textShadow ? 2 : 0;
  const primary = assColor(settings.textColor);
  const outlineC = assColor(settings.outlineColor, "60");
  const marginL = Math.round(width * settings.sideMarginPct);
  const marginR = marginL;

  return `[Script Info]
Title: VMM Scrolling Text
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Scroll,${settings.fontFamily},${Math.round(settings.fontSize)},${primary},${primary},${outlineC},&H80000000,${settings.fontWeight >= 600 ? -1 : 0},0,0,0,100,100,0,0,1,${outline},${shadow},${alignNum},${marginL},${marginR},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${formatAssTime(0)},${formatAssTime(duration)},Scroll,,0,0,0,,{\\move(${x},${Math.round(startY)},${x},${Math.round(adjustedEndY)},0,${Math.round(duration * 1000)})\\an${alignNum}\\q2}${body}
`;
}

function solidColorHex(settings: VideoStyleSettings): string {
  const bg = settings.background;
  if (bg.kind === "gradient") return (bg.gradientFrom || bg.color || "#0a0a0c").replace("#", "");
  return (bg.color || "#0a0a0c").replace("#", "0").replace(/^0+/, "") || "0a0a0c";
}

/**
 * Continuous bottom→top scrolling text burned with FFmpeg + ASS.
 * Audio is muxed untouched (duration = ffprobe).
 */
export async function renderScrollingText(
  args: RenderStyledVideoArgs
): Promise<RenderStyledVideoResult> {
  const { audioPath, scriptText, settings, outputPath, previewSeconds, onProgress } = args;
  onProgress?.(5, "Lendo duração do áudio…");
  const fullDuration = await ffprobeDuration(audioPath);
  const duration =
    previewSeconds && previewSeconds > 0
      ? Math.min(fullDuration, previewSeconds)
      : fullDuration;

  const cleaned = stripVoiceTags(scriptText);
  if (!cleaned.trim()) {
    throw new Error("Roteiro vazio após remover tags de voz — nada para renderizar.");
  }

  const size = ASPECT_SIZES[settings.aspectRatio];
  const lines = wrapTextToLines(cleaned, settings);
  const workDir = path.join(path.dirname(outputPath), `.scroll-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const assPath = path.join(workDir, "scroll.ass");
  const audioTrimmed = path.join(workDir, "audio-trim.mp3");

  try {
    onProgress?.(15, "Gerando texto rolante…");
    fs.writeFileSync(
      assPath,
      buildAssFile({
        lines,
        settings,
        duration,
        width: size.width,
        height: size.height,
      }),
      "utf8"
    );

    let audioInput = audioPath;
    if (previewSeconds && previewSeconds > 0 && previewSeconds < fullDuration) {
      onProgress?.(25, "Cortando áudio do preview…");
      await trimMedia(audioPath, audioTrimmed, duration);
      audioInput = audioTrimmed;
    }

    ensureParentDir(outputPath);
    const color = solidColorHex(settings);
    const overlay = Math.min(1, Math.max(0, settings.background.overlayOpacity ?? 0.35));
    // Base color + optional darken overlay via eq, then burn ASS subtitles.
    // Named `filename=` + quotes avoids FFmpeg filter-option parse errors on absolute paths.
    const assEscaped = assPath.replace(/\\/g, "/").replace(/'/g, "\\'");
    const vf = [
      `color=c=0x${color}:s=${size.width}x${size.height}:d=${duration.toFixed(3)}:r=${settings.fps}[base]`,
      `[base]eq=brightness=${(-overlay * 0.15).toFixed(3)}[dim]`,
      `[dim]ass=filename='${assEscaped}'[v]`,
    ].join(";");

    onProgress?.(40, "Renderizando vídeo (FFmpeg)…");
    await runFfmpeg("ffmpeg", [
      "-y",
      "-i",
      audioInput,
      "-filter_complex",
      vf,
      "-map",
      "[v]",
      "-map",
      "0:a",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    onProgress?.(100, "Pronto");
    return {
      outputPath,
      durationSeconds: duration,
      preview: Boolean(previewSeconds && previewSeconds > 0),
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
