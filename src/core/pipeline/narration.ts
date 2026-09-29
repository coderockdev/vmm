import path from "path";
import fs from "fs";
import { Channel, ScriptLine } from "../types";
import { RawLine } from "../scriptLines";
import { getTTSProvider } from "../providers/tts";
import { TTSProviderName } from "../providers/tts/TTSProvider";
import { compileForVoice, VoiceCompileError } from "../providers/tts/compileForVoice";
import { profileFromLegacyVoice, resolvePipelineAudioVoice } from "../providers/tts/voiceCapabilities";
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

/** Group script lines into scenes using sectionBreak markers from multi-scene generation. */
export function groupLinesIntoScenes(lines: RawLine[]): RawLine[][] {
  if (lines.length === 0) return [];
  const scenes: RawLine[][] = [];
  let current: RawLine[] = [];
  for (const line of lines) {
    current.push(line);
    if (line.sectionBreak) {
      scenes.push(current);
      current = [];
    }
  }
  if (current.length) scenes.push(current);
  return scenes;
}

/**
 * Synthesizes narration scene-by-scene (each scene ≤ provider soft limit ~4800
 * chars). Lines inside a scene are joined into one (or few) TTS requests, then
 * exact pauses between lines are re-applied as silence clips when needed.
 *
 * HeyGen DNA (Juan Carlos) maps to the same ElevenLabs voice for pipeline audio;
 * video still uses generate_from_template without sending voice_id.
 */
export async function synthesizeNarration(args: {
  channel: Channel;
  videoProjectId: string;
  lines: RawLine[];
  ttsOverride?: TTSProviderName | null;
  ttsVoiceIdOverride?: string | null;
}): Promise<NarrationResult> {
  const { channel, videoProjectId, lines } = args;
  if (lines.length === 0) {
    throw new Error("Cannot synthesize narration for an empty script.");
  }

  const resolved = resolvePipelineAudioVoice({
    channelProvider: channel.dna.voice.provider,
    channelVoiceId: channel.dna.voice.voiceId,
    profile: channel.dna.voice.profile,
    ttsOverride: args.ttsOverride,
    ttsVoiceIdOverride: args.ttsVoiceIdOverride,
  });
  const providerName = resolved.provider;
  if (providerName === "heygen") {
    throw new Error(
      "HeyGen só gera vídeo via template. Para áudio use a voz ElevenLabs do Juan Carlos (elevenlabs_voice_id no DNA)."
    );
  }
  if (providerName === "elevenlabs" && !resolved.voiceId) {
    throw new Error(
      "ElevenLabs sem voice_id — configure elevenlabs_voice_id no DNA (Juan Carlos) ou escolha uma voz ao aprovar."
    );
  }

  const provider = getTTSProvider(providerName);
  const voiceId = resolved.voiceId;
  const isOverridden = Boolean(args.ttsOverride && args.ttsOverride !== channel.dna.voice.provider);
  const profile =
    !isOverridden && channel.dna.voice.profile
      ? channel.dna.voice.profile
      : profileFromLegacyVoice({
          provider: providerName,
          voiceId,
          speed: resolved.speed,
          language: channel.dna.language,
        });
  const maxChars = softCharLimitForProvider(provider.name);
  const speed = resolved.speed;

  const tmpDir = path.join(channelTmpDir(channel.id), videoProjectId);
  fs.mkdirSync(tmpDir, { recursive: true });

  const clipPaths: string[] = [];
  const finalLines: ScriptLine[] = [];
  let cursor = 0;
  let characters = 0;
  const scenes = groupLinesIntoScenes(lines);

  for (let s = 0; s < scenes.length; s++) {
    const sceneLines = scenes[s];
    const compiled: { line: RawLine; spoken: string }[] = [];

    for (let i = 0; i < sceneLines.length; i++) {
      const line = sceneLines[i];
      let spoken: string;
      try {
        spoken = compileForVoice(line.text, profile);
      } catch (err) {
        if (err instanceof VoiceCompileError) {
          throw new Error(`Cena ${s + 1}, linha ${i + 1}: ${err.message}`);
        }
        throw err;
      }
      compiled.push({ line, spoken });
      characters += spoken.length;
    }

    // Prefer one TTS request per scene when the whole scene fits under the limit.
    const sceneSpoken = compiled
      .map((c) => c.spoken.trim())
      .filter(Boolean)
      .join("\n\n");
    const sceneFits = sceneSpoken.length > 0 && sceneSpoken.length <= maxChars;

    if (sceneFits) {
      const start = cursor;
      const result = await provider.synthesize({
        text: sceneSpoken,
        language: channel.dna.language,
        voiceId,
        speed,
        outDir: tmpDir,
        fileBaseName: `scene-${String(s + 1).padStart(2, "0")}`,
      });
      clipPaths.push(result.filePath);
      cursor += result.durationSeconds;

      // Distribute timing proportionally across lines for captions.
      const totalSpokenChars = compiled.reduce((sum, c) => sum + Math.max(1, c.spoken.trim().length), 0);
      let t = start;
      for (const { line, spoken } of compiled) {
        const share = spoken.trim()
          ? (Math.max(1, spoken.trim().length) / totalSpokenChars) * result.durationSeconds
          : 0;
        const lineStart = t;
        const lineEnd = t + share;
        finalLines.push({
          text: line.text,
          start: lineStart,
          end: lineEnd,
          pauseAfter: line.pauseAfter,
          sectionBreak: line.sectionBreak,
        });
        t = lineEnd;
        if (line.pauseAfter > 0) {
          const silencePath = path.join(
            tmpDir,
            `pause-s${String(s + 1).padStart(2, "0")}-${String(finalLines.length).padStart(3, "0")}.aiff`
          );
          await renderSilence(line.pauseAfter, silencePath);
          clipPaths.push(silencePath);
          cursor += line.pauseAfter;
          t += line.pauseAfter;
        }
      }
      // Keep cursor aligned with last silence (proportional loop already advanced t with pauses).
      cursor = Math.max(cursor, t);
      continue;
    }

    // Scene too long (or empty spoken): fall back to per-line + TTS chunk split.
    for (let i = 0; i < compiled.length; i++) {
      const { line, spoken } = compiled[i];
      if (!spoken.trim()) {
        finalLines.push({
          text: line.text,
          start: cursor,
          end: cursor,
          pauseAfter: line.pauseAfter,
          sectionBreak: line.sectionBreak,
        });
        if (line.pauseAfter > 0) {
          const silencePath = path.join(tmpDir, `pause-${String(finalLines.length).padStart(3, "0")}.aiff`);
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
          speed,
          outDir: tmpDir,
          fileBaseName: `scene-${String(s + 1).padStart(2, "0")}-l${String(i).padStart(3, "0")}-p${String(c).padStart(2, "0")}`,
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
        const silencePath = path.join(tmpDir, `pause-${String(finalLines.length).padStart(3, "0")}.aiff`);
        await renderSilence(line.pauseAfter, silencePath);
        clipPaths.push(silencePath);
        cursor += line.pauseAfter;
      }
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
