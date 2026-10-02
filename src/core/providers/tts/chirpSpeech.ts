import fs from "fs";
import os from "os";
import path from "path";
import { concatAudioFiles, runFfmpeg } from "../../audio/ffmpegUtils";

/** Chirp 3 HD rejects speakingRate. Pace is applied afterwards with ffmpeg. */
export function clampChirpSpeed(speed: number): number {
  const value = Number.isFinite(speed) && speed > 0 ? speed : 0.95;
  return Math.min(1.05, Math.max(0.85, value));
}

export function chirpLanguageCode(voiceName: string, fallback = "pt-BR"): string {
  const match = voiceName.match(/^(pt-BR|es-US)-Chirp3-HD-/);
  return match?.[1] ?? fallback;
}

export async function synthesizeChirpMp3(args: {
  text: string;
  voiceName: string;
  speed: number;
}): Promise<Buffer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmm-chirp-"));
  const out = path.join(dir, "out.mp3");
  try {
    await synthesizeChirpToFile({ ...args, outPath: out });
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function synthesizeChirpToFile(args: {
  text: string;
  voiceName: string;
  speed: number;
  outPath: string;
}): Promise<void> {
  const key = process.env.GOOGLE_TTS_API_KEY?.trim();
  if (!key) throw new Error("Falta GOOGLE_TTS_API_KEY.");
  const speed = clampChirpSpeed(args.speed);
  const languageCode = chirpLanguageCode(args.voiceName);
  const pieces = splitBreaks(args.text);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmm-chirp-parts-"));
  try {
    const parts: string[] = [];
    let index = 0;
    for (const piece of pieces) {
      if (piece.kind === "silence") {
        const file = path.join(dir, `sil-${index}.mp3`);
        await writeSilence(file, piece.seconds);
        parts.push(file);
        index += 1;
        continue;
      }
      for (const chunk of chunkText(piece.text, 3500)) {
        const raw = path.join(dir, `raw-${index}.mp3`);
        const paced = path.join(dir, `pace-${index}.mp3`);
        await requestChirp(key, chunk, args.voiceName, languageCode, raw);
        await applySpeed(raw, paced, speed);
        parts.push(paced);
        index += 1;
      }
    }
    if (parts.length === 0) throw new Error("Chirp não recebeu texto.");
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    if (parts.length === 1) {
      fs.copyFileSync(parts[0], args.outPath);
      return;
    }
    await concatAudioFiles(parts, args.outPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function splitBreaks(text: string): Array<{ kind: "text"; text: string } | { kind: "silence"; seconds: number }> {
  const pieces: Array<{ kind: "text"; text: string } | { kind: "silence"; seconds: number }> = [];
  const breakRe = /<break\s+time="([\d.]+)s"\s*\/>/gi;
  let last = 0;
  for (const match of text.matchAll(breakRe)) {
    const before = text.slice(last, match.index).replace(/\s+/g, " ").trim();
    if (before) pieces.push({ kind: "text", text: before });
    const seconds = Math.min(3, Math.max(0.2, Number(match[1]) || 0.6));
    pieces.push({ kind: "silence", seconds });
    last = (match.index ?? 0) + match[0].length;
  }
  const tail = text.slice(last).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (tail) pieces.push({ kind: "text", text: tail });
  return pieces;
}

function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf(", "), window.lastIndexOf(" "));
    const at = cut > 200 ? cut + 1 : maxChars;
    chunks.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function requestChirp(
  key: string,
  text: string,
  voiceName: string,
  languageCode: string,
  outPath: string
): Promise<void> {
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: "MP3" },
      }),
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Chirp ${response.status}: ${body.slice(0, 240)}`);
  }
  const json = (await response.json()) as { audioContent?: string };
  if (!json.audioContent) throw new Error("Chirp não devolveu áudio.");
  fs.writeFileSync(outPath, Buffer.from(json.audioContent, "base64"));
}

async function applySpeed(input: string, output: string, speed: number): Promise<void> {
  if (Math.abs(speed - 1) < 0.015) {
    fs.copyFileSync(input, output);
    return;
  }
  try {
    await runFfmpeg("ffmpeg", [
      "-y",
      "-i",
      input,
      "-filter:a",
      `atempo=${speed.toFixed(3)}`,
      "-ar",
      "44100",
      "-ac",
      "1",
      output,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/ENOENT|not found/i.test(message)) throw err;
    fs.copyFileSync(input, output);
  }
}

async function writeSilence(outPath: string, seconds: number): Promise<void> {
  await runFfmpeg("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=mono",
    "-t",
    seconds.toFixed(2),
    "-q:a",
    "9",
    outPath,
  ]);
}
