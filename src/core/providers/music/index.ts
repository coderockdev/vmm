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
    // Loop / trim to narration duration with soft fades — never alter pitch of narration.
    const dur = Math.max(2, args.durationSeconds);
    await runFfmpeg("ffmpeg", [
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      src,
      "-t",
      dur.toFixed(3),
      "-af",
      `afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0.5, dur - 2.5).toFixed(3)}:d=2.5`,
      "-c:a",
      "libmp3lame",
      "-q:a",
      "3",
      outPath,
    ]);

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
