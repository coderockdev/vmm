import fs from "fs";
import path from "path";
import { runFfmpeg, ensureParentDir } from "../audio/ffmpegUtils";
import { isUrl } from "../storage";
import { RenderStyledVideoArgs, RenderStyledVideoResult, ASPECT_SIZES } from "./types";
import { renderScrollingText } from "./scrollingText";
import { defaultStyleSettings } from "./types";

/**
 * Same continuous scroll, but prefers image/gradient background with blur + dark overlay.
 * Falls back to scrolling-text solid color when no image ref is set.
 */
export async function renderCinematicText(
  args: RenderStyledVideoArgs
): Promise<RenderStyledVideoResult> {
  const bg = args.settings.background;
  if (bg.kind !== "image" || !bg.ref || isUrl(bg.ref)) {
    // URL backgrounds need a local download — for MVP use gradient-ish solid via scroll renderer.
    const settings = {
      ...args.settings,
      background: {
        ...bg,
        kind: "gradient" as const,
        gradientFrom: bg.gradientFrom || bg.color || "#1a0f14",
        gradientTo: bg.gradientTo || "#050405",
      },
    };
    return renderScrollingText({ ...args, settings });
  }

  // Local image path: build scrolling on top of blurred still.
  const size = ASPECT_SIZES[args.settings.aspectRatio];
  // Reuse scrollingText by first generating a solid render then… too heavy.
  // Simpler: temporarily treat as solid and note image support for local paths via ffmpeg input.
  const workOut = args.outputPath;
  const result = await renderScrollingText({
    ...args,
    settings: {
      ...args.settings,
      background: {
        kind: "solid",
        color: bg.color || "#0a0a0c",
        overlayOpacity: bg.overlayOpacity ?? 0.5,
        backgroundBlur: bg.backgroundBlur ?? 8,
        backgroundOpacity: 1,
      },
    },
  });

  // Optional: if local image exists, re-composite — skip if missing.
  if (bg.ref && fs.existsSync(bg.ref)) {
    const tmp = `${workOut}.bg.mp4`;
    ensureParentDir(tmp);
    const blur = Math.max(0, Math.min(30, bg.backgroundBlur ?? 10));
    const overlay = Math.min(1, Math.max(0, bg.overlayOpacity ?? 0.45));
    try {
      await runFfmpeg("ffmpeg", [
        "-y",
        "-loop",
        "1",
        "-i",
        bg.ref,
        "-i",
        result.outputPath,
        "-filter_complex",
        `[0:v]scale=${size.width}:${size.height}:force_original_aspect_ratio=increase,crop=${size.width}:${size.height},boxblur=${blur}:${blur},eq=brightness=${(-overlay * 0.2).toFixed(3)}[bg];[1:v]colorkey=0x${(bg.color || "0a0a0c").replace("#", "")}:0.15:0.2[fg];[bg][fg]overlay=0:0[v]`,
        "-map",
        "[v]",
        "-map",
        "1:a?",
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
        "-t",
        result.durationSeconds.toFixed(3),
        "-shortest",
        "-movflags",
        "+faststart",
        tmp,
      ]);
      fs.renameSync(tmp, result.outputPath);
    } catch {
      // Keep solid scroll result if composite fails.
      fs.rmSync(tmp, { force: true });
    }
  }

  return result;
}

export async function renderMinimalist(
  args: RenderStyledVideoArgs
): Promise<RenderStyledVideoResult> {
  const settings = defaultStyleSettings({
    ...args.settings,
    textColor: "#FFFFFF",
    highlightColor: "#FFFFFF",
    textOutline: false,
    fontSize: Math.max(args.settings.fontSize, 56),
    background: {
      kind: "solid",
      color: "#000000",
      overlayOpacity: 0,
      backgroundBlur: 0,
      backgroundOpacity: 1,
    },
  });
  return renderScrollingText({ ...args, styleId: "minimalist", settings });
}
