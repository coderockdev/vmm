/**
 * Video style system — types for FFmpeg-based scrolling text renders.
 */

export type VideoStyleId =
  | "scrolling-text"
  | "cinematic-text"
  | "minimalist"
  | "highlighted-scroll"
  | "teleprompter"
  | "karaoke"
  | "neon-meditation";

export type VideoStylePresetId =
  | "amor-amor"
  | "dark-minimal"
  | "news"
  | "story"
  | "custom";

export type AspectRatioId = "9:16" | "16:9" | "1:1" | "4:5";

export type TextAlign = "left" | "center" | "right";

export interface AspectSize {
  width: number;
  height: number;
  id: AspectRatioId;
}

export const ASPECT_SIZES: Record<AspectRatioId, AspectSize> = {
  "9:16": { id: "9:16", width: 1080, height: 1920 },
  "16:9": { id: "16:9", width: 1920, height: 1080 },
  "1:1": { id: "1:1", width: 1080, height: 1080 },
  "4:5": { id: "4:5", width: 1080, height: 1350 },
};

export interface VideoStyleBackground {
  kind: "solid" | "gradient" | "image" | "video";
  /** Hex or CSS-ish color for solid. */
  color?: string;
  gradientFrom?: string;
  gradientTo?: string;
  /** Local path or Storage URL for image/video. */
  ref?: string | null;
  backgroundOpacity?: number;
  backgroundBlur?: number;
  overlayOpacity?: number;
}

export interface VideoStyleSettings {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  highlightColor: string;
  maxTextWidthPct: number;
  align: TextAlign;
  lineHeight: number;
  paragraphSpacing: number;
  sideMarginPct: number;
  /** 0 = bottom reading zone, 0.5 = center, 1 = top. */
  readingZone: number;
  /** Multiplier on auto scroll speed (1 = exact duration fit). */
  scrollSpeedFactor: number;
  textShadow: boolean;
  textOutline: boolean;
  outlineColor: string;
  fps: number;
  aspectRatio: AspectRatioId;
  background: VideoStyleBackground;
}

export interface VideoStyleChoice {
  styleId: VideoStyleId;
  presetId: VideoStylePresetId;
  settings: VideoStyleSettings;
  /** When true, full render uses this instead of Remotion neon. */
  enabled: boolean;
}

export interface RenderStyledVideoArgs {
  audioPath: string;
  scriptText: string;
  styleId: VideoStyleId;
  settings: VideoStyleSettings;
  outputPath: string;
  /** If set, render only the first N seconds (preview). */
  previewSeconds?: number | null;
  onProgress?: (pct: number, message: string) => void;
}

export interface RenderStyledVideoResult {
  outputPath: string;
  durationSeconds: number;
  preview: boolean;
}

export const FFMPEG_STYLE_IDS: VideoStyleId[] = [
  "scrolling-text",
  "cinematic-text",
  "minimalist",
];

export const STUB_STYLE_IDS: VideoStyleId[] = [
  "highlighted-scroll",
  "teleprompter",
  "karaoke",
];

export function isFfmpegVideoStyle(id: VideoStyleId | string | null | undefined): boolean {
  return Boolean(id && FFMPEG_STYLE_IDS.includes(id as VideoStyleId));
}

export function defaultStyleSettings(partial?: Partial<VideoStyleSettings>): VideoStyleSettings {
  const baseBg = {
    kind: "solid" as const,
    color: "#0a0a0c",
    backgroundOpacity: 1,
    backgroundBlur: 0,
    overlayOpacity: 0.35,
  };
  return {
    fontFamily: "Arial",
    fontSize: 52,
    fontWeight: 600,
    textColor: "#FFFFFF",
    highlightColor: "#E8C547",
    maxTextWidthPct: 0.82,
    align: "center",
    lineHeight: 1.35,
    paragraphSpacing: 0.55,
    sideMarginPct: 0.09,
    readingZone: 0.5,
    scrollSpeedFactor: 1,
    textShadow: true,
    textOutline: true,
    outlineColor: "#000000",
    fps: 30,
    aspectRatio: "9:16",
    ...partial,
    background: {
      ...baseBg,
      ...partial?.background,
    },
  };
}
