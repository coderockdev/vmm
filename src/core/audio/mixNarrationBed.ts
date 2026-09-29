import { runFfmpeg, ensureParentDir, ffprobeDuration } from "../audio/ffmpegUtils";

export interface MixNarrationBedArgs {
  narrationPath: string;
  musicPath?: string | null;
  sfxPath?: string | null;
  /** Music gain 0–1 from UI (8–15% intended as subtle but audible bed). */
  musicVolume: number;
  /** SFX gain 0–1 in the final mix. */
  sfxVolume?: number;
  /** When true, sidechain-compress music from narration. */
  ducking: boolean;
  outputPath: string;
}

const RATE = 48000;
const FMT = `aformat=sample_fmts=fltp:sample_rates=${RATE}:channel_layouts=mono`;

/**
 * Mix narration (dry, full level) + instrumental bed (+ optional SFX) with FFmpeg.
 * Never alters narration speed or pitch — only levels on music/SFX.
 *
 * Critical: every input is resampled to the same rate/layout before amix /
 * sidechaincompress. Mismatched rates (ElevenLabs 44.1k vs bed 48k) made the
 * music inaudible and produced clicks / "freeze" feel in silence gaps.
 */
export async function mixNarrationWithBed(args: MixNarrationBedArgs): Promise<{
  outputPath: string;
  durationSeconds: number;
}> {
  ensureParentDir(args.outputPath);
  const hasMusic = Boolean(args.musicPath);
  const hasSfx = Boolean(args.sfxPath);
  const uiMusic = Math.min(1, Math.max(0, args.musicVolume));
  // UI 12% → ~0.54 — clearly audible in pauses, still under voice.
  const musicVol = Math.min(0.65, Math.max(0.35, uiMusic * 4.5));
  const sfxVol = Math.min(0.8, Math.max(0.28, args.sfxVolume ?? 0.5));
  const musicVolStr = musicVol.toFixed(3);
  const sfxVolStr = sfxVol.toFixed(3);

  if (!hasMusic && !hasSfx) {
    await runFfmpeg("ffmpeg", [
      "-y",
      "-i",
      args.narrationPath,
      "-af",
      FMT,
      "-c:a",
      "libmp3lame",
      "-q:a",
      "2",
      args.outputPath,
    ]);
    return { outputPath: args.outputPath, durationSeconds: await ffprobeDuration(args.outputPath) };
  }

  const narrDur = await ffprobeDuration(args.narrationPath);
  const inputs = ["-y", "-i", args.narrationPath];
  if (hasMusic) inputs.push("-i", args.musicPath!);
  if (hasSfx) inputs.push("-i", args.sfxPath!);

  // Voice always label [voice]; music/sfx padded to narration length so amix
  // never truncates early and sidechain has a continuous timeline.
  const parts: string[] = [`[0:a]${FMT},asetpts=PTS-STARTPTS[voice]`];

  let musicLabel: string | null = null;
  if (hasMusic) {
    // dynaudnorm here so remisturar also fixes beds gerados antes (muito baixos).
    parts.push(
      `[1:a]${FMT},asetpts=PTS-STARTPTS,dynaudnorm=f=75:g=10:p=0.9,volume=${musicVolStr},apad=whole_dur=${narrDur.toFixed(3)}[musraw]`
    );
    if (args.ducking) {
      parts.push(`[voice]asplit=2[v][sc]`);
      parts.push(
        // Gentle duck — music must remain audible in pauses (release fast enough).
        `[musraw][sc]sidechaincompress=threshold=0.08:ratio=2.2:attack=80:release=450:level_sc=1:makeup=1.1[mus]`
      );
      musicLabel = "mus";
      // voice for mix is [v] after split
    } else {
      musicLabel = "musraw";
    }
  }

  let sfxLabel: string | null = null;
  if (hasSfx) {
    const sfxIdx = hasMusic ? 2 : 1;
    parts.push(
      `[${sfxIdx}:a]${FMT},asetpts=PTS-STARTPTS,volume=${sfxVolStr},apad=whole_dur=${narrDur.toFixed(3)}[sfx]`
    );
    sfxLabel = "sfx";
  }

  const voiceLabel = hasMusic && args.ducking ? "v" : "voice";
  const mixInputs: string[] = [`[${voiceLabel}]`];
  if (musicLabel) mixInputs.push(`[${musicLabel}]`);
  if (sfxLabel) mixInputs.push(`[${sfxLabel}]`);

  parts.push(
    `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0,` +
      `alimiter=limit=0.96:attack=5:release=50[out]`
  );

  await runFfmpeg("ffmpeg", [
    ...inputs,
    "-filter_complex",
    parts.join(";"),
    "-map",
    "[out]",
    "-ar",
    String(RATE),
    "-ac",
    "1",
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
