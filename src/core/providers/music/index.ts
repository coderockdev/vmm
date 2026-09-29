import path from "path";
import fs from "fs";
import { GenerateMusicArgs, GeneratedMusic, MusicProvider } from "./MusicProvider";
import {
  moodsFromScript,
  pickBestLibraryEntry,
  resolveLibraryFile,
} from "../audioLibrary/catalog";
import { runFfmpeg, ensureParentDir, ffprobeDuration } from "../../audio/ffmpegUtils";

/**
 * Picks an instrumental bed from the VMM audio library (YouTube Audio Library
 * files registered in catalog.json). Never downloads from the open web.
 */
export class LibraryMusicProvider implements MusicProvider {
  readonly name = "vmm-audio-library";

  async generate(args: GenerateMusicArgs & { scriptText?: string; channelId?: string }): Promise<GeneratedMusic> {
    const moods = moodsFromScript(args.scriptText ?? args.instructions ?? "");
    const entry = pickBestLibraryEntry("music", {
      scriptText: args.scriptText ?? "",
      moods,
      intensity: args.intensity,
      channelId: args.channelId ?? args.channelId,
    });
    if (!entry) {
      throw new Error(
        "Biblioteca de música vazia. Adicione faixas instrumentais da YouTube Audio Library em data/audio-library/ (ver README)."
      );
    }
    const src = resolveLibraryFile(entry);
    if (!fs.existsSync(src)) {
      throw new Error(`Arquivo da biblioteca em falta: ${entry.file}`);
    }

    const outPath = path.join(args.outDir, `${args.fileBaseName}.mp3`);
    ensureParentDir(outPath);
    // Normalize the short library clip first (fast), then loop — never alter narration.
    const dur = Math.max(2, args.durationSeconds);
    const normalized = path.join(args.outDir, `${args.fileBaseName}-norm.mp3`);
    await runFfmpeg("ffmpeg", [
      "-y",
      "-i",
      src,
      "-af",
      "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono,dynaudnorm=f=75:g=12:p=0.95,volume=1.35,alimiter=limit=0.95",
      "-ar",
      "48000",
      "-ac",
      "1",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "3",
      normalized,
    ]);
    await runFfmpeg("ffmpeg", [
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      normalized,
      "-t",
      dur.toFixed(3),
      "-af",
      `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono,afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0.5, dur - 2.5).toFixed(3)}:d=2.5`,
      "-ar",
      "48000",
      "-ac",
      "1",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "3",
      outPath,
    ]);
    fs.rmSync(normalized, { force: true });

    return {
      filePath: outPath,
      durationSeconds: await ffprobeDuration(outPath),
      provider: this.name,
      style: args.style,
      instrumental: true,
      libraryEntryId: entry.id,
      attributionRequired: entry.attributionRequired,
      attributionText: entry.attributionText,
    };
  }
}

export function getMusicProvider(): MusicProvider {
  return new LibraryMusicProvider();
}
