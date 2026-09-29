/**
 * Seeds short instrumental/SFX placeholders into data/audio-library
 * so the pipeline works before real YouTube Audio Library files are added.
 * Replace with YTAL downloads — never scrape random sites.
 */
import fs from "fs";
import path from "path";
import { runFfmpeg, ensureParentDir } from "../src/core/audio/ffmpegUtils";
import { AudioLibraryCatalog, AudioLibraryEntry } from "../src/core/providers/audioLibrary/types";
import { saveAudioLibrary } from "../src/core/providers/audioLibrary/catalog";

const ROOT = path.join(process.cwd(), "data", "audio-library");

async function makePad(file: string, freqs: [number, number, number], seconds: number) {
  const out = path.join(ROOT, file);
  ensureParentDir(out);
  if (fs.existsSync(out) && fs.statSync(out).size > 1000) return;
  const filter = [
    `sine=frequency=${freqs[0]}:duration=${seconds}[a0]`,
    `sine=frequency=${freqs[1]}:duration=${seconds}[a1]`,
    `sine=frequency=${freqs[2]}:duration=${seconds}[a2]`,
    `anoisesrc=color=pink:duration=${seconds},volume=0.015[n]`,
    `[a0][a1][a2][n]amix=inputs=4:duration=longest,volume=0.14,afade=t=in:d=1,afade=t=out:st=${seconds - 2}:d=2[out]`,
  ].join(";");
  await runFfmpeg("ffmpeg", [
    "-y",
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-t",
    String(seconds),
    "-c:a",
    "libmp3lame",
    "-q:a",
    "5",
    out,
  ]);
}

async function makeSfx(file: string, lavfi: string) {
  const out = path.join(ROOT, file);
  ensureParentDir(out);
  if (fs.existsSync(out) && fs.statSync(out).size > 200) return;
  await runFfmpeg("ffmpeg", ["-y", "-f", "lavfi", "-i", lavfi, "-t", "1.5", out]);
}

function entry(partial: Omit<AudioLibraryEntry, "enabled" | "favoritedBy" | "blockedBy">): AudioLibraryEntry {
  return { ...partial, enabled: true, favoritedBy: [], blockedBy: [] };
}

async function main() {
  fs.mkdirSync(path.join(ROOT, "music"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "sfx"), { recursive: true });

  // Amor Amor starter beds (replace with YTAL downloads)
  await makePad("music/amor-romantico-01.mp3", [175, 220, 262], 90);
  await makePad("music/amor-misterio-01.mp3", [110, 139, 165], 90);
  await makePad("music/amor-esperanca-01.mp3", [262, 330, 392], 90);
  await makePad("music/amor-espiritual-01.mp3", [147, 196, 294], 90);
  await makePad("music/amor-tensao-01.mp3", [123, 155, 185], 90);
  await makePad("music/amor-melancolia-01.mp3", [147, 175, 208], 90);
  await makePad("music/amor-piano-01.mp3", [220, 277, 330], 90);
  await makePad("music/amor-ambient-01.mp3", [98, 147, 196], 90);

  await makeSfx("sfx/telefone-vibra.mp3", "sine=frequency=180:duration=0.5");
  await makeSfx("sfx/vento.mp3", "anoisesrc=color=pink:duration=1.5,highpass=f=400,volume=0.3");
  await makeSfx("sfx/noite.mp3", "anoisesrc=color=brown:duration=1.5,volume=0.1");
  await makeSfx("sfx/whoosh.mp3", "anoisesrc=color=white:duration=0.5,lowpass=f=800,volume=0.35");
  await makeSfx("sfx/impacto.mp3", "sine=frequency=55:duration=0.4");
  await makeSfx("sfx/batimento.mp3", "sine=frequency=60:duration=0.2");

  const entries: AudioLibraryEntry[] = [
    entry({
      id: "music-amor-romantico-01",
      name: "Amor Romântico (placeholder)",
      file: "music/amor-romantico-01.mp3",
      type: "music",
      mood: ["romantico", "emocional"],
      category: "piano",
      durationSeconds: 90,
      intensity: "soft",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "music-amor-misterio-01",
      name: "Mistério suave (placeholder)",
      file: "music/amor-misterio-01.mp3",
      type: "music",
      mood: ["misterio", "tensao"],
      category: "ambient",
      durationSeconds: 90,
      intensity: "soft",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "music-amor-esperanca-01",
      name: "Esperança (placeholder)",
      file: "music/amor-esperanca-01.mp3",
      type: "music",
      mood: ["esperanca", "espiritual"],
      category: "pads",
      durationSeconds: 90,
      intensity: "soft",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "music-amor-espiritual-01",
      name: "Espiritual (placeholder)",
      file: "music/amor-espiritual-01.mp3",
      type: "music",
      mood: ["espiritual", "esperanca"],
      category: "pads",
      durationSeconds: 90,
      intensity: "soft",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "music-amor-tensao-01",
      name: "Tensão emocional (placeholder)",
      file: "music/amor-tensao-01.mp3",
      type: "music",
      mood: ["tensao", "emocional"],
      category: "strings",
      durationSeconds: 90,
      intensity: "medium",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "music-amor-melancolia-01",
      name: "Melancolia (placeholder)",
      file: "music/amor-melancolia-01.mp3",
      type: "music",
      mood: ["melancolico", "emocional"],
      category: "piano",
      durationSeconds: 90,
      intensity: "soft",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "music-amor-piano-01",
      name: "Piano emocional (placeholder)",
      file: "music/amor-piano-01.mp3",
      type: "music",
      mood: ["emocional", "romantico"],
      category: "piano",
      durationSeconds: 90,
      intensity: "soft",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "music-amor-ambient-01",
      name: "Ambient minimalista (placeholder)",
      file: "music/amor-ambient-01.mp3",
      type: "music",
      mood: ["espiritual", "misterio"],
      category: "ambient",
      durationSeconds: 90,
      intensity: "soft",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "sfx-telefone-vibra",
      name: "Telefone vibra (placeholder)",
      file: "sfx/telefone-vibra.mp3",
      type: "sfx",
      mood: ["tensao"],
      category: "telefone",
      durationSeconds: 1,
      intensity: "soft",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "sfx-vento",
      name: "Vento (placeholder)",
      file: "sfx/vento.mp3",
      type: "sfx",
      mood: ["misterio"],
      category: "vento",
      durationSeconds: 2,
      intensity: "soft",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "sfx-noite",
      name: "Ambiente noturno (placeholder)",
      file: "sfx/noite.mp3",
      type: "sfx",
      mood: ["misterio"],
      category: "noite",
      durationSeconds: 2,
      intensity: "soft",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "sfx-whoosh",
      name: "Whoosh suave (placeholder)",
      file: "sfx/whoosh.mp3",
      type: "sfx",
      mood: ["tensao"],
      category: "whoosh",
      durationSeconds: 1,
      intensity: "soft",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "sfx-impacto",
      name: "Impacto suave (placeholder)",
      file: "sfx/impacto.mp3",
      type: "sfx",
      mood: ["tensao"],
      category: "impacto",
      durationSeconds: 1,
      intensity: "medium",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
    entry({
      id: "sfx-batimento",
      name: "Batimento (placeholder)",
      file: "sfx/batimento.mp3",
      type: "sfx",
      mood: ["emocional"],
      category: "batimento",
      durationSeconds: 1,
      intensity: "soft",
      licenseType: "dev-placeholder",
      attributionRequired: false,
      attributionText: "",
      source: "dev-placeholder — substituir por YouTube Audio Library",
    }),
  ];

  const catalog: AudioLibraryCatalog = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries,
  };
  saveAudioLibrary(catalog);
  console.log(`[audio-library] seeded ${entries.length} entries under data/audio-library/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
