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
  const frames = Math.max(2, Math.round(args.durationSec * fps));
  const den = Math.max(1, frames - 1);
  const zoom =
    args.motion === "zoom-out" || args.motion === "pull-out"
      ? `max(1,2-on/${den})`
      : args.motion === "pan-left" || args.motion === "pan-right"
        ? "2"
        : args.motion === "zoom-in" || args.motion === "push-in"
          ? "min(1.02+0.0002*on,1.12)"
          : "1.08";
  const span = `(iw-iw/zoom)`;
  const spanY = `(ih-ih/zoom)`;
  const panX =
    args.motion === "pan-left"
      ? `${span}*(1-on/${den})`
      : args.motion === "pan-right"
        ? `${span}*(on/${den})`
        : `${span}/2`;
  const panY = `${spanY}/2`;
  return `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},zoompan=z='${zoom}':x='${panX}':y='${panY}':d=${frames}:s=${width}x${height}:fps=${fps}`;
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
