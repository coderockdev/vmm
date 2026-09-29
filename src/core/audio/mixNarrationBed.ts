import path from "path";
import { runFfmpeg, ensureParentDir, ffprobeDuration } from "../audio/ffmpegUtils";

export interface MixNarrationBedArgs {
  narrationPath: string;
  musicPath?: string | null;
  sfxPath?: string | null;
  /** Music gain 0–1 (before ducking). */
  musicVolume: number;
  /** When true, sidechain-compress music from narration. */
  ducking: boolean;
  outputPath: string;
}

/**
 * Mix narration (dry, full level) + instrumental bed (+ optional SFX) with FFmpeg.
 * Never alters narration speed or pitch — only levels on music/SFX.
 */
export async function mixNarrationWithBed(args: MixNarrationBedArgs): Promise<{
  outputPath: string;
  durationSeconds: number;
}> {
  ensureParentDir(args.outputPath);
  const hasMusic = Boolean(args.musicPath);
  const hasSfx = Boolean(args.sfxPath);
  const musicVol = Math.min(1, Math.max(0, args.musicVolume));

  if (!hasMusic && !hasSfx) {
    await runFfmpeg("ffmpeg", ["-y", "-i", args.narrationPath, "-c:a", "libmp3lame", "-q:a", "2", args.outputPath]);
    return { outputPath: args.outputPath, durationSeconds: await ffprobeDuration(args.outputPath) };
  }

  const inputs = ["-y", "-i", args.narrationPath];
  if (hasMusic) inputs.push("-i", args.musicPath!);
  if (hasSfx) inputs.push("-i", args.sfxPath!);

  let filter: string;
  if (hasMusic && args.ducking) {
    // sidechaincompress: narration ducks music
    const sfxIdx = hasSfx ? 2 : -1;
    filter = [
      `[1:a]volume=${musicVol.toFixed(3)}[mus]`,
      `[0:a]asplit=2[voice][sc]`,
      `[mus][sc]sidechaincompress=threshold=0.02:ratio=6:attack=50:release=400[ducked]`,
      sfxIdx >= 0
        ? `[${sfxIdx}:a]volume=0.35[sfx];[voice][ducked][sfx]amix=inputs=3:duration=first:dropout_transition=2[out]`
        : `[voice][ducked]amix=inputs=2:duration=first:dropout_transition=2[out]`,
    ].join(";");
  } else if (hasMusic) {
    filter = hasSfx
      ? `[1:a]volume=${musicVol.toFixed(3)}[mus];[2:a]volume=0.35[sfx];[0:a][mus][sfx]amix=inputs=3:duration=first:dropout_transition=2[out]`
      : `[1:a]volume=${musicVol.toFixed(3)}[mus];[0:a][mus]amix=inputs=2:duration=first:dropout_transition=2[out]`;
  } else {
    filter = `[1:a]volume=0.35[sfx];[0:a][sfx]amix=inputs=2:duration=first:dropout_transition=2[out]`;
  }

  await runFfmpeg("ffmpeg", [
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-c:a",
    "libmp3lame",
    "-q:a",
    "2",
    args.outputPath,
  ]);

  return {
    outputPath: args.outputPath,
    durationSeconds: await ffprobeDuration(args.outputPath),
  };
}
