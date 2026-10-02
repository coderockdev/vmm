import path from "path";
import fs from "fs";
import { Channel, ScriptLine } from "../types";
import { RawLine } from "../scriptLines";
import { getTTSProvider } from "../providers/tts";
import { TTSProviderName } from "../providers/tts/TTSProvider";
import { compileForVoice, VoiceCompileError } from "../providers/tts/compileForVoice";
import { profileFromLegacyVoice, resolvePipelineAudioVoice, JUAN_CARLOS_ELEVENLABS_VOICE_ID } from "../providers/tts/voiceCapabilities";
import { concatAudioFiles, renderSilence, ensureParentDir, ffprobeDuration } from "../audio/ffmpegUtils";
import { isChirpVoiceId } from "../audiobook/chirpVoices";
import { synthesizeChirpToFile } from "../providers/tts/chirpSpeech";
import { channelTmpDir } from "../paths";
import { workingFilePath, persistFile } from "../storage";
import { softCharLimitForProvider, splitTextForTts } from "../providers/tts/ttsLimits";

const OPENING_TAG_RE = /^\s*\[/;
const PRAYER_START_RE = /vamos a comenzar/i;
/** Silence before «Ahora sí. Vamos a comenzar con la oración.» */
const PRAYER_START_PAUSE_SECONDS = 1.5;

/** Ensure first spoken beat of a scene carries performance direction (Amor Amor naturalness). */
function ensureOpeningPerformance(text: string, isFirstScene: boolean): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (PRAYER_START_RE.test(trimmed)) {
    return OPENING_TAG_RE.test(trimmed) ? trimmed : `[warmly] ${trimmed}`;
  }
  if (OPENING_TAG_RE.test(trimmed) || /<break\b/i.test(trimmed)) return text;
  if (isFirstScene) {
    return `[softly] [pause] ${trimmed}`;
  }
  return `[warmly] ${trimmed}`;
}

/** Channel DNA off: the voice reads the words, without [emotional] / [excited] / [pause]. */
function stripPerformanceTags(text: string): string {
  return text
    .replace(/\[[^\]]{1,80}\]/g, " ")
    .replace(/<break\s+time=["']?[\d.]+s["']?\s*\/>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripEdgePauses(text: string, edge: "start" | "end"): string {
  const chunk = String.raw`(?:\s*\[pause\]\s*|\s*<break\s+time=["']?[\d.]+s["']?\s*/>\s*|\s*\.{3}\s*)`;
  const re = edge === "start" ? new RegExp(`^(?:${chunk})+`, "i") : new RegExp(`(?:${chunk})+$`, "i");
  return text.replace(re, "").trim();
}

/**
 * The step into the prayer is one and a half seconds of silence, not a model pause.
 * Extra [pause] tags there stack and turn it into a hole of several seconds.
 */
function applyPrayerStartPause(lines: RawLine[]): RawLine[] {
  const idx = lines.findIndex((line) => PRAYER_START_RE.test(line.text));
  if (idx <= 0) return lines;
  return lines.map((line, i) => {
    if (i === idx - 1) {
      return {
        ...line,
        pauseAfter: PRAYER_START_PAUSE_SECONDS,
        text: stripEdgePauses(line.text, "end"),
      };
    }
    if (i === idx) {
      return { ...line, text: stripEdgePauses(line.text, "start") };
    }
    return line;
  });
}

export interface NarrationResult {
  filePath: string;
  durationSeconds: number;
  provider: TTSProviderName | "google";
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
  ttsOverride?: TTSProviderName | "google" | null;
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
    channelSpeed: channel.dna.voice.speed,
    ttsOverride: args.ttsOverride,
    ttsVoiceIdOverride: args.ttsVoiceIdOverride,
  });
  const providerName = resolved.provider;
  if (providerName === "heygen") {
    throw new Error(
      "HeyGen só gera vídeo via template. Para áudio use a voz ElevenLabs do Juan Carlos (elevenlabs_voice_id no DNA)."
    );
  }
  // Last-resort: never fail audio for missing id when DNA/Juan Carlos is known.
  const voiceId =
    resolved.voiceId?.trim() ||
    channel.dna.voice.profile?.elevenlabs_voice_id ||
    (providerName === "elevenlabs" ? JUAN_CARLOS_ELEVENLABS_VOICE_ID : null);
  if (providerName === "elevenlabs" && !voiceId) {
    throw new Error(
      "ElevenLabs sem voice_id — configure elevenlabs_voice_id no DNA (Juan Carlos) ou escolha uma voz ao aprovar."
    );
  }

  const chirp = providerName === "google" || isChirpVoiceId(voiceId ?? "");
  if (providerName === "google" && !isChirpVoiceId(voiceId ?? "")) {
    throw new Error("A voz do DNA não é uma voz Chirp do Google.");
  }
  const provider = chirp ? null : getTTSProvider(providerName as TTSProviderName);
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
  const maxChars = softCharLimitForProvider(chirp ? "google" : provider!.name);
  const speed = resolved.speed;

  const spokenLines = channel.id === "amor-amor" ? applyPrayerStartPause(lines) : lines;

  const tmpDir = path.join(channelTmpDir(channel.id), videoProjectId);
  fs.mkdirSync(tmpDir, { recursive: true });

  async function speak(text: string, fileBaseName: string): Promise<{ filePath: string; durationSeconds: number }> {
    if (chirp) {
      const filePath = path.join(tmpDir, `${fileBaseName}.mp3`);
      await synthesizeChirpToFile({ text, voiceName: voiceId!, speed, outPath: filePath });
      return { filePath, durationSeconds: await ffprobeDuration(filePath) };
    }
    return provider!.synthesize({
      text,
      language: channel.dna.language,
      voiceId,
      speed,
      outDir: tmpDir,
      fileBaseName,
    });
  }

  const clipPaths: string[] = [];
  const finalLines: ScriptLine[] = [];
  let cursor = 0;
  let characters = 0;
  const scenes = groupLinesIntoScenes(spokenLines);

  for (let s = 0; s < scenes.length; s++) {
    const sceneLines = scenes[s];
    const compiled: { line: RawLine; spoken: string }[] = [];

    for (let i = 0; i < sceneLines.length; i++) {
      const line = sceneLines[i];
      const emotionsOn =
        channel.dna.scriptRules.performanceTags?.enabled === true &&
        profile.capabilities.emotion_tags;
      const source = emotionsOn ? line.text : stripPerformanceTags(line.text);
      const withOpening =
        i === 0 && emotionsOn ? ensureOpeningPerformance(source, s === 0) : source;
      let spoken: string;
      try {
        spoken = compileForVoice(withOpening, profile);
      } catch (err) {
        if (err instanceof VoiceCompileError) {
          throw new Error(`Cena ${s + 1}, linha ${i + 1}: ${err.message}`);
        }
        throw err;
      }
      compiled.push({ line: { ...line, text: withOpening }, spoken });
      characters += spoken.length;
    }

    // Prefer one TTS request per scene when the whole scene fits under the limit.
    const sceneSpoken = compiled
      .map((c) => c.spoken.trim())
      .filter(Boolean)
      .join("\n\n");
    const sceneFits = sceneSpoken.length > 0 && sceneSpoken.length <= maxChars;

    const prayerAt = compiled.findIndex((c) => PRAYER_START_RE.test(c.line.text));

    if (sceneFits && prayerAt > 0) {
      const slices = [
        { items: compiled.slice(0, prayerAt), silenceAfter: PRAYER_START_PAUSE_SECONDS },
        { items: compiled.slice(prayerAt), silenceAfter: 0 },
      ];
      for (let part = 0; part < slices.length; part++) {
        const slice = slices[part];
        const text = slice.items.map((c) => c.spoken.trim()).filter(Boolean).join("\n\n");
        const start = cursor;
        let dur = 0;
        if (text) {
          const result = await speak(
            text,
            `scene-${String(s + 1).padStart(2, "0")}-p${String(part).padStart(2, "0")}`
          );
          clipPaths.push(result.filePath);
          dur = result.durationSeconds;
          cursor += dur;
        }
        const totalSpokenChars =
          slice.items.reduce((sum, c) => sum + Math.max(1, c.spoken.trim().length), 0) || 1;
        let t = start;
        for (let j = 0; j < slice.items.length; j++) {
          const { line, spoken } = slice.items[j];
          const share = spoken.trim()
            ? (Math.max(1, spoken.trim().length) / totalSpokenChars) * dur
            : 0;
          const isCut = part === 0 && j === slice.items.length - 1;
          const gap = isCut ? slice.silenceAfter : 0;
          finalLines.push({
            text: line.text,
            start: t,
            end: t + share,
            pauseAfter: gap || line.pauseAfter,
            sectionBreak: line.sectionBreak,
          });
          t += share;
          if (gap > 0) {
            const silencePath = path.join(
              tmpDir,
              `pause-prayer-s${String(s + 1).padStart(2, "0")}.aiff`
            );
            await renderSilence(gap, silencePath);
            clipPaths.push(silencePath);
            cursor += gap;
            t += gap;
          }
        }
        const tail = slice.items[slice.items.length - 1];
        if (part === slices.length - 1 && tail && tail.line.pauseAfter > 0) {
          const silencePath = path.join(
            tmpDir,
            `pause-scene-s${String(s + 1).padStart(2, "0")}.aiff`
          );
          await renderSilence(tail.line.pauseAfter, silencePath);
          clipPaths.push(silencePath);
          cursor += tail.line.pauseAfter;
          t += tail.line.pauseAfter;
        }
        cursor = Math.max(cursor, t);
      }
      continue;
    }

    if (sceneFits) {
      const start = cursor;
      const result = await speak(sceneSpoken, `scene-${String(s + 1).padStart(2, "0")}`);
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
        const result = await speak(
          chunks[c],
          `scene-${String(s + 1).padStart(2, "0")}-l${String(i).padStart(3, "0")}-p${String(c).padStart(2, "0")}`
        );
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
    provider: chirp ? "google" : provider!.name,
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
