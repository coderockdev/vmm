import path from "path";
import fs from "fs";
import { PlanSfxArgs, RenderSfxArgs, GeneratedSfxBed, SfxEvent, SFXProvider } from "./SFXProvider";
import { SfxKind } from "../music/musicalDna";
import {
  listLibraryEntries,
  pickBestLibraryEntry,
  resolveLibraryFile,
} from "../audioLibrary/catalog";
import { runFfmpeg, ensureParentDir, ffprobeDuration } from "../../audio/ffmpegUtils";

const KEYWORD_TO_CATEGORY: Array<{ re: RegExp; kind: SfxKind; category: string }> = [
  { re: /tel[eé]fono|llamar|llame|llamarte|vibra|mensaje|whatsapp/, kind: "phone_vibrate", category: "telefone" },
  { re: /silencio|noche|oscur|medianoche/, kind: "night", category: "noite" },
  { re: /viento|aire|sopla/, kind: "wind", category: "vento" },
  { re: /lluvia|chuva|rain/, kind: "rain", category: "chuva" },
  { re: /reloj|hora|clock/, kind: "clock", category: "relogio" },
  { re: /coraz[oó]n|latir|latido|pecho/, kind: "heartbeat", category: "batimento" },
  { re: /llámame ahora|ahora mismo/, kind: "whoosh", category: "whoosh" },
];

/**
 * Plans sparse SFX from script keywords at the timed line where they appear,
 * then pulls clips from the VMM audio library.
 */
export class LibrarySfxProvider implements SFXProvider {
  readonly name = "vmm-audio-library-sfx";

  planEvents(args: PlanSfxArgs): SfxEvent[] {
    const allowed = new Set(args.allowed.filter((k) => !args.forbidden.includes(k)));
    if (allowed.size === 0) return [];

    const vol = args.intensity === "intense" ? 1.0 : args.intensity === "soft" ? 0.85 : 0.95;
    const usedKinds = new Set<SfxKind>();
    const events: SfxEvent[] = [];
    const minGap = 12; // seconds between cues

    const timed = (args.timedLines ?? []).filter(
      (l) => l && typeof l.text === "string" && Number.isFinite(l.start)
    );

    if (timed.length > 0) {
      for (const line of timed) {
        if (events.length >= 5) break;
        const text = line.text.toLowerCase();
        for (const rule of KEYWORD_TO_CATEGORY) {
          if (!allowed.has(rule.kind) || usedKinds.has(rule.kind)) continue;
          if (!rule.re.test(text)) continue;
          // Place near the start of the spoken line (when the idea is heard).
          const at = clamp(
            (line.start ?? 0) + 0.15,
            0.2,
            Math.max(0.3, args.durationSeconds - 0.6)
          );
          if (events.some((e) => Math.abs(e.atSeconds - at) < minGap)) continue;
          usedKinds.add(rule.kind);
          events.push({
            kind: rule.kind,
            atSeconds: at,
            volume: vol,
            marker: `SFX_${rule.kind.toUpperCase()} @ ${fmt(at)} · “${snip(line.text)}”`,
            categoryHint: rule.category,
          });
          break; // one SFX per line
        }
      }
      return events.sort((a, b) => a.atSeconds - b.atSeconds);
    }

    // Fallback (no timings): still prefer first keyword occurrence position in text.
    const full = args.scriptText || "";
    const lower = full.toLowerCase();
    for (const rule of KEYWORD_TO_CATEGORY) {
      if (!allowed.has(rule.kind) || usedKinds.has(rule.kind)) continue;
      const idx = lower.search(rule.re);
      if (idx < 0) continue;
      const ratio = full.length > 0 ? idx / full.length : 0.2;
      const at = clamp(ratio * args.durationSeconds, 0.4, args.durationSeconds - 0.5);
      if (events.some((e) => Math.abs(e.atSeconds - at) < minGap)) continue;
      usedKinds.add(rule.kind);
      events.push({
        kind: rule.kind,
        atSeconds: at,
        volume: vol,
        marker: `SFX_${rule.kind.toUpperCase()} @ ${fmt(at)}`,
        categoryHint: rule.category,
      });
      if (events.length >= 5) break;
    }
    return events.sort((a, b) => a.atSeconds - b.atSeconds);
  }

  async renderBed(args: RenderSfxArgs & { channelId?: string; scriptText?: string }): Promise<GeneratedSfxBed> {
    const outPath = path.join(args.outDir, `${args.fileBaseName}.mp3`);
    ensureParentDir(outPath);
    const dur = Math.max(1, args.durationSeconds);
    const RATE = 48000;
    const FMT = `aformat=sample_fmts=fltp:sample_rates=${RATE}:channel_layouts=mono`;

    if (args.events.length === 0) {
      await runFfmpeg("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `anullsrc=r=${RATE}:cl=mono`,
        "-t",
        dur.toFixed(3),
        "-c:a",
        "libmp3lame",
        "-q:a",
        "5",
        outPath,
      ]);
      return { filePath: outPath, events: [], provider: this.name };
    }

    // Input 0 = continuous silent bed (avoids adelay+apad glitches / MP3 freezes).
    const inputs: string[] = ["-f", "lavfi", "-t", dur.toFixed(3), "-i", `anullsrc=r=${RATE}:cl=mono`];
    const filterParts: string[] = [`[0:a]${FMT},asetpts=PTS-STARTPTS[base]`];
    const mixLabels = ["[base]"];
    let inputIndex = 1;

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

      ev.trackName = entry.name;
      inputs.push("-i", src);

      let clipDur = 1.2;
      try {
        clipDur = Math.max(0.15, await ffprobeDuration(src));
      } catch {
        /* keep default */
      }
      // Cap one-shots so long ambient files don't wash over the voice.
      const useDur = Math.min(clipDur, ev.kind === "night" || ev.kind === "wind" || ev.kind === "rain" ? 2.2 : 1.4);
      const fadeOutStart = Math.max(0.05, useDur - 0.25);
      const delayMs = Math.max(0, Math.round(ev.atSeconds * 1000));
      const vol = Math.min(1.4, Math.max(0.85, ev.volume * 1.25));
      const label = `s${inputIndex}`;
      // atrim → fade → asetpts → adelay on a clean PCM timeline (no double-pad).
      filterParts.push(
        `[${inputIndex}:a]${FMT},atrim=0:${useDur.toFixed(3)},asetpts=PTS-STARTPTS,` +
          `volume=${vol.toFixed(3)},` +
          `afade=t=in:d=0.03,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.18,` +
          `adelay=${delayMs}|${delayMs}[${label}]`
      );
      mixLabels.push(`[${label}]`);
      inputIndex++;
    }

    if (mixLabels.length === 1) {
      await runFfmpeg("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `anullsrc=r=${RATE}:cl=mono`,
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

    const filter =
      `${filterParts.join(";")};` +
      `${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0:normalize=0,` +
      `alimiter=limit=0.9:attack=5:release=40[out]`;

    await runFfmpeg("ffmpeg", [
      "-y",
      ...inputs,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-t",
      dur.toFixed(3),
      "-ar",
      String(RATE),
      "-ac",
      "1",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
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

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function snip(text: string): string {
  const t = text.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
  return t.length > 42 ? `${t.slice(0, 40)}…` : t;
}

export function getSfxProvider(): SFXProvider {
  return new LibrarySfxProvider();
}
