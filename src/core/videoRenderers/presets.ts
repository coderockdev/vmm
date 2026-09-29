import {
  VideoStylePresetId,
  VideoStyleSettings,
  defaultStyleSettings,
} from "./types";

export type StylePreset = {
  id: VideoStylePresetId;
  label: string;
  description: string;
  settings: VideoStyleSettings;
};

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "amor-amor",
    label: "Amor Amor",
    description: "Texto branco grande, destaque dourado, fundo emocional escuro.",
    settings: defaultStyleSettings({
      fontSize: 56,
      fontWeight: 650,
      textColor: "#F7F4EE",
      highlightColor: "#E8C547",
      maxTextWidthPct: 0.84,
      lineHeight: 1.38,
      readingZone: 0.4,
      scrollSpeedFactor: 1,
      aspectRatio: "9:16",
      background: {
        kind: "gradient",
        gradientFrom: "#1a0f14",
        gradientTo: "#0a0608",
        color: "#120a0e",
        overlayOpacity: 0.45,
        backgroundBlur: 0,
        backgroundOpacity: 1,
      },
    }),
  },
  {
    id: "dark-minimal",
    label: "Dark Minimal",
    description: "Fundo preto + texto branco, sem distrações.",
    settings: defaultStyleSettings({
      fontSize: 58,
      fontWeight: 600,
      textColor: "#FFFFFF",
      highlightColor: "#FFFFFF",
      textOutline: false,
      textShadow: true,
      aspectRatio: "9:16",
      background: {
        kind: "solid",
        color: "#000000",
        overlayOpacity: 0,
        backgroundBlur: 0,
        backgroundOpacity: 1,
      },
    }),
  },
  {
    id: "news",
    label: "News",
    description: "Texto branco limpo; destaque amarelo para trecho ativo.",
    settings: defaultStyleSettings({
      fontSize: 50,
      fontWeight: 700,
      textColor: "#F2F4F7",
      highlightColor: "#FFD60A",
      align: "left",
      maxTextWidthPct: 0.88,
      aspectRatio: "9:16",
      background: {
        kind: "solid",
        color: "#111318",
        overlayOpacity: 0.25,
        backgroundBlur: 0,
        backgroundOpacity: 1,
      },
    }),
  },
  {
    id: "story",
    label: "Story",
    description: "Texto creme, scroll mais lento e cinematográfico.",
    settings: defaultStyleSettings({
      fontSize: 54,
      fontWeight: 500,
      textColor: "#F3E8D4",
      highlightColor: "#D4A574",
      scrollSpeedFactor: 0.92,
      lineHeight: 1.45,
      aspectRatio: "9:16",
      background: {
        kind: "gradient",
        gradientFrom: "#1c1612",
        gradientTo: "#0c0a08",
        color: "#14100e",
        overlayOpacity: 0.4,
        backgroundBlur: 0,
        backgroundOpacity: 1,
      },
    }),
  },
  {
    id: "custom",
    label: "Custom",
    description: "Controlo total — parte do Dark Minimal.",
    settings: defaultStyleSettings(),
  },
];

export function getPreset(id: VideoStylePresetId | string | null | undefined): StylePreset {
  return STYLE_PRESETS.find((p) => p.id === id) ?? STYLE_PRESETS[0];
}

export function mergePresetSettings(
  presetId: VideoStylePresetId,
  overrides?: Partial<VideoStyleSettings> | null
): VideoStyleSettings {
  const base = getPreset(presetId).settings;
  if (!overrides) return { ...base, background: { ...base.background } };
  return {
    ...base,
    ...overrides,
    background: { ...base.background, ...overrides.background },
  };
}
