import fs from "fs";
import path from "path";
import { ffprobeDuration, runFfmpeg, ensureParentDir, trimMedia } from "../audio/ffmpegUtils";
import { stripVoiceTags } from "./stripVoiceTags";
import { wrapTextToLines } from "./measureText";
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
  // readingZone: 0 = bottom, 0.5 = mid, 1 = top (see VideoStyleSettings).
  const zone = Math.min(1, Math.max(0, settings.readingZone));
  // Each line is its own move, with a step we control. A single \move on a guessed
  // block height was longer than the real text, so the lines left the frame and
  // the rest of the prayer played over black.
  const lineStep = Math.round(settings.fontSize * 1.2);
  const readingY = Math.round(height * (1 - zone));
  const travel = Math.max(0, (lines.length - 1) * lineStep);
  const alignNum = settings.align === "left" ? 7 : settings.align === "right" ? 9 : 8;
  const marginL = Math.round(width * settings.sideMarginPct);
  const marginR = marginL;
  const x =
    alignNum === 7 ? marginL : alignNum === 9 ? width - marginR : Math.round(width / 2);
  const outline = settings.textOutline ? 2.2 : 0;
  const shadow = settings.textShadow ? 2 : 0;
  const primary = assColor(settings.textColor);
  const outlineC = assColor(settings.outlineColor, "60");

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
${lines
  .map((line, i) => {
    const y0 = readingY + i * lineStep;
    // Last line is still on the reading line when the audio ends.
    const y1 = y0 - travel;
    const text = line.trim() ? escapeAss(line) : "\\h";
    const moveMs = Math.round(duration * 1000);
    return `Dialogue: 0,${formatAssTime(0)},${formatAssTime(duration)},Scroll,,0,0,0,,{\\move(${x},${y0},${x},${y1},0,${moveMs})\\an${alignNum}\\q2}${text}`;
  })
  .join("\n")}
`;
}

function solidColorHex(settings: VideoStyleSettings): string {
  const bg = settings.background;
  if (bg.kind === "gradient") return (bg.gradientFrom || bg.color || "#0a0a0c").replace("#", "");
  return (bg.color || "#0a0a0c").replace("#", "0").replace(/^0+/, "") || "0a0a0c";
}

/**
 * Continuous scrolling text (bottom→top) burned with FFmpeg + ASS.
 * First lines appear at the reading zone (~mid screen), then scroll up.
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
    // Solid-color + text compresses very well — without CRF, libx264 can balloon
    // to hundreds of MB for an 11‑min 1080×1920 file and break Storage uploads.
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
      "-crf",
      "28",
      "-maxrate",
      "2.5M",
      "-bufsize",
      "5M",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "2",
      "-ar",
      "44100",
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
