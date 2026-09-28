import path from "path";
import fs from "fs";
import { Channel, ScriptLine } from "../types";
import { RawLine } from "../scriptLines";
import { getTTSProvider } from "../providers/tts";
import { TTSProviderName } from "../providers/tts/TTSProvider";
import { concatAudioFiles, renderSilence, ensureParentDir } from "../audio/ffmpegUtils";
import { channelAudioDir, channelTmpDir } from "../paths";

export interface NarrationResult {
  filePath: string; // absolute path
  durationSeconds: number;
  provider: TTSProviderName;
  lines: ScriptLine[]; // with EXACT start/end/pauseAfter from real audio
}

/**
 * Synthesizes each script line as its own clip (so pauses are exact silence,
 * not guesswork), concatenates them into one narration file, and returns
 * timestamps derived directly from the real per-line audio durations —
 * text and narration are sample-accurate in sync by construction.
 */
export async function synthesizeNarration(args: {
  channel: Channel;
  videoProjectId: string;
  lines: RawLine[];
  ttsOverride?: TTSProviderName | null;
}): Promise<NarrationResult> {
  const { channel, videoProjectId, lines } = args;
  if (lines.length === 0) {
    throw new Error("Cannot synthesize narration for an empty script.");
  }

  const isOverridden = Boolean(args.ttsOverride && args.ttsOverride !== channel.dna.voice.provider);
  const provider = getTTSProvider(args.ttsOverride ?? (channel.dna.voice.provider as TTSProviderName));
  // A voiceId is only meaningful for the provider it was picked for — if the
  // engine itself is being overridden (A/B test), let that provider fall
  // back to its own default voice instead of misinterpreting another
  // provider's voice id.
  const voiceId = isOverridden ? null : channel.dna.voice.voiceId;
  const tmpDir = path.join(channelTmpDir(channel.id), videoProjectId);
  fs.mkdirSync(tmpDir, { recursive: true });

  const clipPaths: string[] = [];
  const finalLines: ScriptLine[] = [];
  let cursor = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const result = await provider.synthesize({
      text: line.text,
      language: channel.dna.language,
      voiceId,
      speed: channel.dna.voice.speed,
      outDir: tmpDir,
      fileBaseName: `line-${String(i).padStart(3, "0")}`,
    });

    clipPaths.push(result.filePath);
    const start = cursor;
    const end = start + result.durationSeconds;
    finalLines.push({
      text: line.text,
      start,
      end,
      pauseAfter: line.pauseAfter,
      sectionBreak: line.sectionBreak,
    });
    cursor = end;

    if (line.pauseAfter > 0) {
      const silencePath = path.join(tmpDir, `pause-${String(i).padStart(3, "0")}.aiff`);
      await renderSilence(line.pauseAfter, silencePath);
      clipPaths.push(silencePath);
      cursor += line.pauseAfter;
    }
  }

  const outPath = path.join(channelAudioDir(channel.id), `${videoProjectId}.mp3`);
  ensureParentDir(outPath);
  await concatAudioFiles(clipPaths, outPath);

  fs.rmSync(tmpDir, { recursive: true, force: true });

  return {
    filePath: outPath,
    durationSeconds: cursor,
    provider: provider.name,
    lines: finalLines,
  };
}

/**
 * Attaches a user-uploaded MP3/WAV as the narration instead of synthesizing
 * one. Timestamps for this path come from EstimateTimingProvider since we
 * only know the total duration, not per-line splits.
 */
export function attachUploadedAudioPath(uploadedAbsolutePath: string, channel: Channel, videoProjectId: string): string {
  const destDir = channelAudioDir(channel.id);
  const ext = path.extname(uploadedAbsolutePath) || ".mp3";
  const destPath = path.join(destDir, `${videoProjectId}${ext}`);
  fs.copyFileSync(uploadedAbsolutePath, destPath);
  return destPath;
}
