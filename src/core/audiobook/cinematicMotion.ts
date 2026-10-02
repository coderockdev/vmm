import path from "path";
import { runFfmpeg } from "../audio/ffmpegUtils";
import { FrameCrop, MotionKind } from "./visualPlan";

export interface MotionRenderRequest {
  imagePath: string;
  outputPath: string;
  motion: MotionKind;
  crop: FrameCrop;
  durationSec: number;
  fps?: number;
  width?: number;
  height?: number;
}

/**
 * Local motion on a still. No model call.
 * Parallax here is a slow drift across a slightly enlarged frame. Real
 * foreground and background plates can replace this filter later.
 */
export function buildMotionFilter(args: {
  motion: MotionKind;
  crop: FrameCrop;
  durationSec: number;
  fps?: number;
  width?: number;
  height?: number;
}): string {
  const fps = args.fps ?? 30;
  const width = args.width ?? 1920;
  const height = args.height ?? 1080;
  const frames = Math.max(1, Math.round(args.durationSec * fps));
  const zoom =
    args.motion === "zoom-out" || args.motion === "pull-out"
      ? "max(1.18-0.0007*on,1.02)"
      : args.motion === "zoom-in" || args.motion === "push-in"
        ? "min(1.02+0.0007*on,1.18)"
        : "1.12";
  const drift = args.motion === "drift" || args.motion === "parallax" ? "on*0.15" : "0";
  const span = `(iw-iw/zoom)`;
  const spanY = `(ih-ih/zoom)`;
  const panX =
    args.motion === "pan-left"
      ? `${span}*(1-on/${frames})`
      : args.motion === "pan-right" || args.motion === "diagonal"
        ? `${span}*(on/${frames})`
        : args.crop === "left"
          ? `${span}*0.15`
          : args.crop === "right"
            ? `${span}*0.85`
            : `${span}/2`;
  const panY =
    args.motion === "pan-up"
      ? `${spanY}*(1-on/${frames})`
      : args.motion === "pan-down" || args.motion === "diagonal"
        ? `${spanY}*(on/${frames})`
        : args.crop === "top"
          ? `${spanY}*0.12`
          : args.crop === "bottom"
            ? `${spanY}*0.88`
            : `${spanY}/2`;
  const x = `(${panX})+${drift}`;
  const y = panY;
  return `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},zoompan=z='${zoom}':x='${x}':y='${y}':d=${frames}:s=${width}x${height}:fps=${fps}`;
}

export async function renderCinematicStill(args: MotionRenderRequest): Promise<{ outputPath: string }> {
  const fps = args.fps ?? 30;
  const filter = buildMotionFilter(args);
  await runFfmpeg("ffmpeg", [
    "-y",
    "-loop",
    "1",
    "-i",
    args.imagePath,
    "-vf",
    filter,
    "-t",
    args.durationSec.toFixed(2),
    "-r",
    String(fps),
    "-pix_fmt",
    "yuv420p",
    "-an",
    path.resolve(args.outputPath),
  ]);
  return { outputPath: args.outputPath };
}
