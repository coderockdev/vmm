import path from "path";
import fs from "fs";
import { GenerateMusicArgs, GeneratedMusic, MusicProvider } from "./MusicProvider";
import {
  getLibraryEntry,
  moodsFromScript,
  pickBestLibraryEntry,
  resolveLibraryFile,
} from "../audioLibrary/catalog";
import { takeNextStandardMusic } from "./musicRotation";
import { getChannel } from "../../repo/channels";
import { normalizeMusicalDna } from "./musicalDna";
import { runFfmpeg, ensureParentDir, ffprobeDuration } from "../../audio/ffmpegUtils";

/**
 * Picks an instrumental bed from the VMM audio library (YouTube Audio Library
 * files registered in catalog.json). Never downloads from the open web.
 */
export class LibraryMusicProvider implements MusicProvider {
  readonly name = "vmm-audio-library";

  async generate(args: GenerateMusicArgs & { scriptText?: string; channelId?: string }): Promise<GeneratedMusic> {
    const channelId = args.channelId;
    // Amor Amor = oración/amor: prefer soft spiritual/romantic beds, never meditation drones.
    const baseMoods = moodsFromScript(args.scriptText ?? args.instructions ?? "");
    const moods =
      channelId === "amor-amor"
        ? ["espiritual", "oracion", "romantico", "emocional", "esperanca", ...baseMoods.filter((m) => m !== "misterio" && m !== "tensao")]
        : baseMoods;
    const styleHint =
      args.style === "espiritual" || args.style === "piano-emocional" || args.style === "romantico-cinematico"
        ? args.style
        : channelId === "amor-amor"
          ? "espiritual"
          : args.style;

    const forced = args.libraryEntryId ? getLibraryEntry(args.libraryEntryId) : null;
    if (args.libraryEntryId && (!forced || forced.type !== "music")) {
      throw new Error(`Faixa de biblioteca inválida: ${args.libraryEntryId}`);
    }

    let standard: ReturnType<typeof takeNextStandardMusic> = null;
    if (!forced && channelId) {
      const channel = await getChannel(channelId).catch(() => null);
      const musical = normalizeMusicalDna(channel?.dna.musical);
      if (musical.standardMusicIds.length > 0) {
        standard = takeNextStandardMusic({
          channelId,
          standardIds: musical.standardMusicIds,
        });
      }
    }

    const entry =
      forced ??
      standard ??
      pickBestLibraryEntry("music", {
        scriptText: `${args.scriptText ?? ""} ${args.instructions ?? ""} ${styleHint}`,
        moods,
        intensity: args.intensity ?? "soft",
        channelId,
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
    const dur = Math.max(2, args.durationSeconds);
    const normalized = path.join(args.outDir, `${args.fileBaseName}-norm.mp3`);
    // Keep bed soft — do NOT dynaudnorm/boost (that made placeholders harsh).
    await runFfmpeg("ffmpeg", [
      "-y",
      "-i",
      src,
      "-af",
      "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono,volume=0.55,alimiter=limit=0.85",
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
      `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=mono,afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0.5, dur - 3).toFixed(3)}:d=3`,
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
