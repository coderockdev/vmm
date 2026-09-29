/**
 * Channel DNA — musical identity (instrumental bed + SFX).
 */

export type MusicStyleId =
  | "auto"
  | "piano-emocional"
  | "piano-ambient"
  | "romantico-cinematico"
  | "espiritual"
  | "misterioso"
  | "tensao-emocional"
  | "esperanca"
  | "melancolico"
  | "epico-suave"
  | "ambient-minimalista"
  | "lofi-emocional"
  | "custom";

export type MusicIntensity = "soft" | "medium" | "intense";

export type SfxMode = "auto" | "manual" | "off";

export type SfxKind =
  | "phone_vibrate"
  | "phone_ring"
  | "message"
  | "clock"
  | "wind"
  | "rain"
  | "thunder"
  | "waves"
  | "door"
  | "footsteps"
  | "heartbeat"
  | "breath"
  | "whoosh"
  | "impact"
  | "night"
  | "birds"
  | "fire"
  | "city"
  | "silence";

export interface MusicalDna {
  /** Default: generate instrumental bed after narration. */
  useMusicByDefault: boolean;
  defaultStyle: MusicStyleId;
  intensity: MusicIntensity;
  /** 0–1; recommended 0.15–0.20 with narration. */
  volume: number;
  ducking: boolean;
  adaptToScript: boolean;
  /** continuous bed vs dynamic rises (metadata; MVP uses continuous). */
  bedMode: "continuous" | "dynamic";
  useSfx: boolean;
  sfxMode: SfxMode;
  sfxIntensity: MusicIntensity;
  allowedSfx: SfxKind[];
  forbiddenSfx: SfxKind[];
  customMusicInstructions: string;
}

export const DEFAULT_AMOR_AMOR_MUSICAL: MusicalDna = {
  useMusicByDefault: true,
  defaultStyle: "romantico-cinematico",
  intensity: "soft",
  volume: 0.17,
  ducking: true,
  adaptToScript: true,
  bedMode: "continuous",
  useSfx: true,
  sfxMode: "auto",
  sfxIntensity: "soft",
  allowedSfx: ["phone_vibrate", "phone_ring", "message", "wind", "night", "heartbeat", "whoosh", "impact", "silence"],
  forbiddenSfx: ["thunder", "city", "footsteps"],
  customMusicInstructions:
    "Trilha 100% instrumental: piano + pads + cordas suaves. Mistério → tensão → esperança → paz. Sem vocal, letra, bateria agressiva ou melodia que dispute com a oração.",
};

export const DEFAULT_MUSICAL_DNA: MusicalDna = {
  useMusicByDefault: false,
  defaultStyle: "auto",
  intensity: "soft",
  volume: 0.18,
  ducking: true,
  adaptToScript: false,
  bedMode: "continuous",
  useSfx: false,
  sfxMode: "off",
  sfxIntensity: "soft",
  allowedSfx: [],
  forbiddenSfx: [],
  customMusicInstructions: "",
};

export function normalizeMusicalDna(raw: Partial<MusicalDna> | null | undefined): MusicalDna {
  const base = DEFAULT_MUSICAL_DNA;
  if (!raw || typeof raw !== "object") return { ...base };
  return {
    useMusicByDefault: Boolean(raw.useMusicByDefault ?? base.useMusicByDefault),
    defaultStyle: (raw.defaultStyle as MusicStyleId) || base.defaultStyle,
    intensity: (raw.intensity as MusicIntensity) || base.intensity,
    volume: clamp01(typeof raw.volume === "number" ? raw.volume : base.volume),
    ducking: raw.ducking !== false,
    adaptToScript: Boolean(raw.adaptToScript),
    bedMode: raw.bedMode === "dynamic" ? "dynamic" : "continuous",
    useSfx: Boolean(raw.useSfx),
    sfxMode: raw.sfxMode === "auto" || raw.sfxMode === "manual" || raw.sfxMode === "off" ? raw.sfxMode : base.sfxMode,
    sfxIntensity: (raw.sfxIntensity as MusicIntensity) || base.sfxIntensity,
    allowedSfx: Array.isArray(raw.allowedSfx) ? (raw.allowedSfx as SfxKind[]) : base.allowedSfx,
    forbiddenSfx: Array.isArray(raw.forbiddenSfx) ? (raw.forbiddenSfx as SfxKind[]) : base.forbiddenSfx,
    customMusicInstructions: typeof raw.customMusicInstructions === "string" ? raw.customMusicInstructions : "",
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.18;
  return Math.min(1, Math.max(0, n));
}

export const MUSIC_STYLE_OPTIONS: Array<{ id: MusicStyleId; label: string }> = [
  { id: "auto", label: "Automático pelo DNA" },
  { id: "piano-emocional", label: "Piano emocional" },
  { id: "piano-ambient", label: "Piano + ambient" },
  { id: "romantico-cinematico", label: "Romântico cinematográfico" },
  { id: "espiritual", label: "Espiritual" },
  { id: "misterioso", label: "Misterioso" },
  { id: "tensao-emocional", label: "Tensão emocional" },
  { id: "esperanca", label: "Esperança" },
  { id: "melancolico", label: "Melancólico" },
  { id: "epico-suave", label: "Épico suave" },
  { id: "ambient-minimalista", label: "Ambient minimalista" },
  { id: "lofi-emocional", label: "Lo-fi emocional" },
  { id: "custom", label: "Custom" },
];
