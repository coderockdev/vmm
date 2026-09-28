import path from "path";
import fs from "fs";
import { Channel, ScriptLine } from "../types";
import { RawLine } from "../scriptLines";
import { getTTSProvider } from "../providers/tts";
import { TTSProviderName } from "../providers/tts/TTSProvider";
import { compileForVoice, VoiceCompileError } from "../providers/tts/compileForVoice";
import { profileFromLegacyVoice } from "../providers/tts/voiceCapabilities";
import { concatAudioFiles, renderSilence, ensureParentDir } from "../audio/ffmpegUtils";
import { channelTmpDir } from "../paths";
import { workingFilePath, persistFile } from "../storage";
import { softCharLimitForProvider, splitTextForTts } from "../providers/tts/ttsLimits";

export interface NarrationResult {
  filePath: string;
  durationSeconds: number;
  provider: TTSProviderName;
  lines: ScriptLine[];
  /** Characters sent to TTS after compileForVoice (for cost). */
  characters: number;
}

/**
 * Synthesizes each script line as its own clip (so pauses are exact silence),
 * compiling performance tags for the channel voice first so engines never
 * speak raw [whisper] / accent tags aloud.
 *
 * Requests are already one-line-per-call; if a single line still exceeds the
 * provider soft limit (~4800 for ElevenLabs/Cartesia), it is split further.
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
  const providerName = args.ttsOverride ?? (channel.dna.voice.provider as TTSProviderName);
  if (providerName === "heygen") {
    throw new Error(
      "HeyGen não sintetiza narração linha a linha aqui — use generate_from_template com o template do canal."
    );
  }
  const provider = getTTSProvider(providerName);
  const voiceId = isOverridden ? null : channel.dna.voice.voiceId;
  const profile =
    !isOverridden && channel.dna.voice.profile
      ? channel.dna.voice.profile
      : profileFromLegacyVoice({
          provider: providerName,
          voiceId,
          speed: channel.dna.voice.speed,
          language: channel.dna.language,
        });
  const maxChars = softCharLimitForProvider(provider.name);

  const tmpDir = path.join(channelTmpDir(channel.id), videoProjectId);
  fs.mkdirSync(tmpDir, { recursive: true });

  const clipPaths: string[] = [];
  const finalLines: ScriptLine[] = [];
  let cursor = 0;
  let characters = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let spoken: string;
    try {
      spoken = compileForVoice(line.text, profile);
    } catch (err) {
      if (err instanceof VoiceCompileError) {
        throw new Error(`Linha ${i + 1}: ${err.message}`);
      }
      throw err;
    }
    characters += spoken.length;
    if (!spoken.trim()) {
      finalLines.push({
        text: line.text,
        start: cursor,
        end: cursor,
        pauseAfter: line.pauseAfter,
        sectionBreak: line.sectionBreak,
      });
      if (line.pauseAfter > 0) {
        const silencePath = path.join(tmpDir, `pause-${String(i).padStart(3, "0")}.aiff`);
        await renderSilence(line.pauseAfter, silencePath);
        clipPaths.push(silencePath);
        cursor += line.pauseAfter;
      }
      continue;
    }

    const chunks = splitTextForTts(spoken, maxChars);
    const start = cursor;
    for (let c = 0; c < chunks.length; c++) {
      const result = await provider.synthesize({
        text: chunks[c],
        language: channel.dna.language,
        voiceId,
        speed: channel.dna.voice.speed,
        outDir: tmpDir,
        fileBaseName: `line-${String(i).padStart(3, "0")}-p${String(c).padStart(2, "0")}`,
      });
      clipPaths.push(result.filePath);
      cursor += result.durationSeconds;
    }
    finalLines.push({
      text: line.text,
      start,
      end: cursor,
      pauseAfter: line.pauseAfter,
      sectionBreak: line.sectionBreak,
    });

    if (line.pauseAfter > 0) {
      const silencePath = path.join(tmpDir, `pause-${String(i).padStart(3, "0")}.aiff`);
      await renderSilence(line.pauseAfter, silencePath);
      clipPaths.push(silencePath);
      cursor += line.pauseAfter;
    }
  }

  const fileName = `${videoProjectId}.mp3`;
  const outPath = workingFilePath(channel.id, "audio", fileName);
  ensureParentDir(outPath);
  await concatAudioFiles(clipPaths, outPath);

  fs.rmSync(tmpDir, { recursive: true, force: true });

  const ref = await persistFile(outPath, channel.id, "audio", fileName, "audio/mpeg");

  return {
    filePath: ref,
    durationSeconds: cursor,
    provider: provider.name,
    lines: finalLines,
    characters,
  };
}

export async function attachUploadedAudioPath(
  uploadedAbsolutePath: string,
  channel: Channel,
  videoProjectId: string
): Promise<string> {
  const ext = path.extname(uploadedAbsolutePath) || ".mp3";
  const fileName = `${videoProjectId}${ext}`;
  const destPath = workingFilePath(channel.id, "audio", fileName);
  fs.copyFileSync(uploadedAbsolutePath, destPath);
  return persistFile(destPath, channel.id, "audio", fileName, "audio/mpeg");
}
