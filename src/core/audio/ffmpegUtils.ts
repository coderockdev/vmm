import { spawn } from "child_process";
import path from "path";
import fs from "fs";

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
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
  const { stdout } = await run("ffprobe", [
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
  await run("ffmpeg", [
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
    await run("ffmpeg", ["-y", "-i", inputPaths[0], outPath]);
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
  await run("ffmpeg", args);
}

export function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
