import path from "path";
import fs from "fs";
import { PlanSfxArgs, RenderSfxArgs, GeneratedSfxBed, SfxEvent, SFXProvider } from "./SFXProvider";
import { SfxKind } from "../music/musicalDna";
import {
  listLibraryEntries,
  pickBestLibraryEntry,
  resolveLibraryFile,
} from "../audioLibrary/catalog";
import { runFfmpeg, ensureParentDir, renderSilence } from "../../audio/ffmpegUtils";

const KEYWORD_TO_CATEGORY: Array<{ re: RegExp; kind: SfxKind; category: string }> = [
  { re: /tel[eé]fono|llamar|llame|vibra|mensaje|whatsapp/, kind: "phone_vibrate", category: "telefone" },
  { re: /silencio|noche|oscur|medianoche/, kind: "night", category: "noite" },
  { re: /viento|aire|sopla/, kind: "wind", category: "vento" },
  { re: /lluvia|chuva|rain/, kind: "rain", category: "chuva" },
  { re: /reloj|hora|clock/, kind: "clock", category: "relogio" },
  { re: /coraz[oó]n|latir|pecho/, kind: "heartbeat", category: "batimento" },
  { re: /llámame ahora|ahora mismo/, kind: "whoosh", category: "whoosh" },
];

/**
 * Plans sparse SFX from script keywords, then pulls clips from the VMM
 * audio library (YouTube Audio Library SFX registered in catalog).
 */
export class LibrarySfxProvider implements SFXProvider {
  readonly name = "vmm-audio-library-sfx";

  planEvents(args: PlanSfxArgs): SfxEvent[] {
    const allowed = new Set(args.allowed.filter((k) => !args.forbidden.includes(k)));
    if (allowed.size === 0) return [];
    const text = args.scriptText.toLowerCase();
    const dur = args.durationSeconds;
    const events: SfxEvent[] = [];
    const vol = args.intensity === "intense" ? 0.35 : args.intensity === "soft" ? 0.14 : 0.22;

    for (const rule of KEYWORD_TO_CATEGORY) {
      if (!rule.re.test(text)) continue;
      if (!allowed.has(rule.kind)) continue;
      if (events.length >= 4) break;
      const at = Math.min(dur - 0.5, Math.max(0.4, dur * (0.1 + events.length * 0.2)));
      if (events.some((e) => Math.abs(e.atSeconds - at) < 8)) continue;
      events.push({
        kind: rule.kind,
        atSeconds: at,
        volume: vol,
        marker: `SFX_${rule.kind.toUpperCase()} @ ${fmt(at)}`,
        categoryHint: rule.category,
      });
    }
    return events;
  }

  async renderBed(args: RenderSfxArgs & { channelId?: string; scriptText?: string }): Promise<GeneratedSfxBed> {
    const outPath = path.join(args.outDir, `${args.fileBaseName}.mp3`);
    ensureParentDir(outPath);
    const dur = Math.max(1, args.durationSeconds);

    if (args.events.length === 0) {
      const aiff = outPath.replace(/\.mp3$/, ".aiff");
      await renderSilence(dur, aiff);
      await runFfmpeg("ffmpeg", ["-y", "-i", aiff, "-c:a", "libmp3lame", "-q:a", "5", outPath]);
      fs.rmSync(aiff, { force: true });
      return { filePath: outPath, events: [], provider: this.name };
    }

    const inputs: string[] = [];
    const filterParts: string[] = [];
    let inputIndex = 0;

    for (let i = 0; i < args.events.length; i++) {
      const ev = args.events[i];
      const entry =
        pickBestLibraryEntry("sfx", {
          scriptText: args.scriptText ?? "",
          channelId: args.channelId,
          categoryHint: (ev as SfxEvent & { categoryHint?: string }).categoryHint,
          intensity: "soft",
        }) ?? listLibraryEntries({ type: "sfx", preferNoAttribution: true })[0];

      if (!entry) continue;
      const src = resolveLibraryFile(entry);
      if (!fs.existsSync(src)) continue;

      inputs.push("-i", src);
      const delayMs = Math.round(ev.atSeconds * 1000);
      filterParts.push(
        `[${inputIndex}]volume=${ev.volume},adelay=${delayMs}|${delayMs},afade=t=out:st=1.2:d=0.4[s${inputIndex}]`
      );
      inputIndex++;
    }

    if (inputIndex === 0) {
      const aiff = outPath.replace(/\.mp3$/, ".aiff");
      await renderSilence(dur, aiff);
      await runFfmpeg("ffmpeg", ["-y", "-i", aiff, "-c:a", "libmp3lame", "-q:a", "5", outPath]);
      fs.rmSync(aiff, { force: true });
      return { filePath: outPath, events: args.events, provider: this.name };
    }

    const mix = Array.from({ length: inputIndex }, (_, i) => `[s${i}]`).join("");
    const filter = `${filterParts.join(";")};${mix}amix=inputs=${inputIndex}:duration=longest:dropout_transition=0,apad=whole_dur=${dur.toFixed(3)}[out]`;

    await runFfmpeg("ffmpeg", [
      "-y",
      ...inputs,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-t",
      dur.toFixed(3),
      "-c:a",
      "libmp3lame",
      "-q:a",
      "5",
      outPath,
    ]);

    return { filePath: outPath, events: args.events, provider: this.name };
  }
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function getSfxProvider(): SFXProvider {
  return new LibrarySfxProvider();
}
