import { spawn, spawnSync } from "child_process";
import path from "path";
import fs from "fs";

/** Prefer Homebrew ffmpeg-full (libass/drawtext) over the slim `ffmpeg` bottle. */
let cachedFfmpeg: string | null = null;
let cachedFfprobe: string | null = null;

function resolveBinary(kind: "ffmpeg" | "ffprobe"): string {
  if (kind === "ffmpeg" && cachedFfmpeg) return cachedFfmpeg;
  if (kind === "ffprobe" && cachedFfprobe) return cachedFfprobe;

  const envKey = kind === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH";
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    if (kind === "ffmpeg") cachedFfmpeg = fromEnv;
    else cachedFfprobe = fromEnv;
    return fromEnv;
  }

  const candidates =
    kind === "ffmpeg"
      ? [
          "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
          "/usr/local/opt/ffmpeg-full/bin/ffmpeg",
          "ffmpeg",
        ]
      : [
          "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe",
          "/usr/local/opt/ffmpeg-full/bin/ffprobe",
          "ffprobe",
        ];

  for (const c of candidates) {
    if (c.includes("/") && !fs.existsSync(c)) continue;
    if (kind === "ffmpeg" && c.includes("/")) {
      // Ensure this build has the ass filter (needed for scrolling text).
      const check = spawnSync(c, ["-hide_banner", "-filters"], { encoding: "utf8" });
      const out = `${check.stdout || ""}\n${check.stderr || ""}`;
      if (!/\bass\b/.test(out)) continue;
    }
    if (kind === "ffmpeg") cachedFfmpeg = c;
    else cachedFfprobe = c;
    return c;
  }

  const fallback = kind;
  if (kind === "ffmpeg") cachedFfmpeg = fallback;
  else cachedFfprobe = fallback;
  return fallback;
}

export function ffmpegBin(): string {
  return resolveBinary("ffmpeg");
}

export function ffprobeBin(): string {
  return resolveBinary("ffprobe");
}

export function runFfmpeg(
  cmd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const resolved =
    cmd === "ffmpeg" ? ffmpegBin() : cmd === "ffprobe" ? ffprobeBin() : cmd;
  return new Promise((resolve, reject) => {
    const child = spawn(resolved, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

export async function ffprobeDuration(filePath: string): Promise<number> {
  const { stdout } = await runFfmpeg("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const seconds = parseFloat(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`Could not read duration for ${filePath}`);
  return seconds;
}

export async function renderSilence(durationSeconds: number, outPath: string): Promise<void> {
  await runFfmpeg("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=44100:cl=mono`,
    "-t",
    durationSeconds.toFixed(3),
    "-q:a",
    "9",
    outPath,
  ]);
}

/**
 * Concatenates an ordered list of audio files (already-decoded formats are
 * fine — mp3/aiff/wav can be mixed) into a single output file, re-encoding
 * via filter_complex concat so mismatched source codecs never break the
 * splice.
 */
export async function concatAudioFiles(inputPaths: string[], outPath: string): Promise<void> {
  if (inputPaths.length === 1) {
    await runFfmpeg("ffmpeg", ["-y", "-i", inputPaths[0], outPath]);
    return;
  }
  const args: string[] = ["-y"];
  for (const p of inputPaths) args.push("-i", p);
  const filterInputs = inputPaths.map((_, i) => `[${i}:a]`).join("");
  args.push(
    "-filter_complex",
    `${filterInputs}concat=n=${inputPaths.length}:v=0:a=1[out]`,
    "-map",
    "[out]",
    outPath
  );
  await runFfmpeg("ffmpeg", args);
}

export function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/** Trim media to the first `seconds` (re-encode audio/video as needed). */
export async function trimMedia(
  inputPath: string,
  outputPath: string,
  seconds: number
): Promise<void> {
  ensureParentDir(outputPath);
  await runFfmpeg("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-t",
    Math.max(0.5, seconds).toFixed(3),
    "-c",
    "copy",
    outputPath,
  ]).catch(async () => {
    // copy can fail on odd containers — re-encode
    await runFfmpeg("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-t",
      Math.max(0.5, seconds).toFixed(3),
      outputPath,
    ]);
  });
}
