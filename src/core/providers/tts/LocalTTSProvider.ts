import { spawn } from "child_process";
import path from "path";
import { TTSProvider, SynthesizeArgs, SynthesizeResult } from "./TTSProvider";
import { ffprobeDuration } from "../../audio/ffmpegUtils";

const DEFAULT_VOICE_BY_LANGUAGE: Record<string, string> = {
  pt: "Luciana",
  es: "Monica",
  en: "Samantha",
};

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/**
 * Uses macOS's built-in `say` command as a zero-setup, fully local narration
 * engine — good enough to prove the pipeline without any API key. On other
 * platforms this provider throws; use UploadedAudioProvider instead.
 */
export class LocalTTSProvider implements TTSProvider {
  readonly name = "local" as const;

  async synthesize(args: SynthesizeArgs): Promise<SynthesizeResult> {
    if (process.platform !== "darwin") {
      throw new Error(
        "LocalTTSProvider uses macOS `say` and is only available on darwin. Use uploaded audio instead."
      );
    }

    const voice = args.voiceId || DEFAULT_VOICE_BY_LANGUAGE[args.language] || "Samantha";
    const rate = Math.round(180 * args.speed);
    const aiffPath = path.join(args.outDir, `${args.fileBaseName}.aiff`);
    const finalPath = path.join(args.outDir, `${args.fileBaseName}.mp3`);

    await run("say", ["-v", voice, "-r", String(rate), "-o", aiffPath, args.text]);
    await run("ffmpeg", ["-y", "-i", aiffPath, finalPath]);

    const durationSeconds = await ffprobeDuration(finalPath);
    return { filePath: finalPath, durationSeconds, provider: this.name };
  }
}
