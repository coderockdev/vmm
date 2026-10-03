import { AudiobookVisualBudget } from "../types";
import {
  ChapterCostEstimate,
  SCRIPT_PAD_SECONDS,
  estimateChapterCost,
  timelineCounts,
} from "./visualBudget";

export const MOTION_KINDS = [
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "diagonal",
  "push-in",
  "pull-out",
  "drift",
  "parallax",
] as const;

export const FRAME_CROPS = ["center", "left", "right", "top", "bottom"] as const;

export type MotionKind = (typeof MOTION_KINDS)[number];
export type FrameCrop = (typeof FRAME_CROPS)[number];

export interface PlannedImage {
  index: number;
  wordStart: number;
  wordEnd: number;
  /** Same painting can be the thumbnail source. The video uses it with no letters. */
  role: "opening" | "main" | "moment";
}

export interface TimelineSlot {
  index: number;
  kind: "ai-clip" | "still-motion";
  startSec: number;
  durationSec: number;
  imageIndex: number;
  motion: MotionKind;
  crop: FrameCrop;
  transition: "crossfade";
  /** Seconds the model generates. The slot duration is the slowed playback. */
  sourceDurationSec: number | null;
  /** Model audio is never used. */
  silent: true;
  estimatedUsd: number;
}

export interface AssetCostLine {
  id: string;
  kind: "image" | "ai-video" | "voice" | "script";
  label: string;
  estimatedUsd: number;
  actualUsd: number | null;
}

export interface ChapterVisualPlan {
  estimate: ChapterCostEstimate;
  images: PlannedImage[];
  /** Image index whose clean frame can also feed the thumbnail (text added apart). */
  thumbnailSourceImage: number;
  slots: TimelineSlot[];
  costs: AssetCostLine[];
  estimatedTotalUsd: number;
  actualTotalUsd: number | null;
}

function placeClipBeats(beatCount: number, clipCount: number): number[] {
  const chosen: number[] = [];
  const early = Math.min(3, clipCount, beatCount);
  for (let i = 0; i < early; i++) {
    const beat = i * 2;
    if (beat < beatCount) chosen.push(beat);
  }
  const rest = clipCount - chosen.length;
  const from = chosen.length > 0 ? chosen[chosen.length - 1] + 2 : 0;
  const tail = Math.max(0, beatCount - from);
  if (rest > 0 && tail > 0) {
    const step = tail / rest;
    for (let i = 0; i < rest; i++) {
      const beat = Math.min(beatCount - 1, from + Math.round(i * step));
      if (!chosen.includes(beat)) chosen.push(beat);
    }
  }
  return chosen;
}

/** Zoom out most of the time. A lateral pan every third still, alternating sides. */
function stillMotion(index: number): MotionKind {
  if (index % 3 !== 2) return "zoom-out";
  return index % 6 === 2 ? "pan-left" : "pan-right";
}

/**
 * Each beat is 10s on screen and illustrates about 11s of narration, so the
 * fade has a picture without stealing time from the shot. Fal still paints 5s.
 * Three of the clips sit in the first minute; the rest are spread later.
 * A still between clips is always a different painting. Does not spend money.
 */
export function planChapterVisuals(
  words: number,
  budget: AudiobookVisualBudget,
  stillChoiceId?: string | null
): ChapterVisualPlan {
  const estimate = estimateChapterCost(words, budget, stillChoiceId);
  const audio = estimate.durationSec;
  const { playSec, beatCount, clipCount } = timelineCounts(audio, budget);
  const clipBeats = new Set(placeClipBeats(beatCount, clipCount));
  const totalWords = Math.max(1, Math.round(words));
  const wpm = budget.wordsPerMinute || 150;
  const wordAt = (sec: number) => Math.min(totalWords, Math.max(0, Math.round((sec * wpm) / 60)));

  const images: PlannedImage[] = [];
  const slots: TimelineSlot[] = [];
  let stills = 0;

  for (let beat = 0; beat < beatCount; beat++) {
    const startSec = beat * playSec;
    if (startSec >= audio - 0.3) break;
    const durationSec = Math.round(Math.min(playSec, audio - startSec) * 10) / 10;
    const wordStart = wordAt(startSec);
    const wordEnd = Math.max(
      wordStart + 1,
      Math.min(totalWords, wordAt(startSec + durationSec + SCRIPT_PAD_SECONDS))
    );
    images.push({
      index: beat,
      wordStart,
      wordEnd,
      role: beat === 0 ? "opening" : "moment",
    });
    const kind: TimelineSlot["kind"] = clipBeats.has(beat) ? "ai-clip" : "still-motion";
    const motion = kind === "ai-clip" ? "zoom-out" : stillMotion(stills);
    if (kind === "still-motion") stills += 1;
    slots.push({
      index: beat,
      kind,
      startSec: Math.round(startSec * 10) / 10,
      durationSec,
      imageIndex: beat,
      motion,
      crop: "center",
      transition: "crossfade",
      sourceDurationSec: kind === "ai-clip" ? budget.aiClipSourceSeconds : null,
      silent: true,
      estimatedUsd: kind === "ai-clip" ? estimate.perClipUsd : 0,
    });
  }

  const covered = slots.reduce((sum, slot) => sum + slot.durationSec, 0);
  const drift = audio - covered;
  if (slots.length > 0 && Math.abs(drift) >= 0.1) {
    const last = slots[slots.length - 1];
    last.durationSec = Math.max(1, Math.round((last.durationSec + drift) * 10) / 10);
  }
  slots.forEach((slot, index) => {
    slot.index = index;
  });

  const costs: AssetCostLine[] = [
    ...images.map((image) => ({
      id: `image-${String(image.index + 1).padStart(2, "0")}`,
      kind: "image" as const,
      label: `Imagem ${String(image.index + 1).padStart(2, "0")}`,
      estimatedUsd: estimate.perImageUsd,
      actualUsd: null,
    })),
    ...slots
      .filter((slot) => slot.kind === "ai-clip")
      .map((slot, index) => ({
        id: `ai-video-${String(index + 1).padStart(2, "0")}`,
        kind: "ai-video" as const,
        label: `Clipe IA ${String(index + 1).padStart(2, "0")}`,
        estimatedUsd: estimate.perClipUsd,
        actualUsd: null,
      })),
    {
      id: "voice",
      kind: "voice",
      label: "Voz",
      estimatedUsd: estimate.voiceUsd,
      actualUsd: null,
    },
    {
      id: "script",
      kind: "script",
      label: "Roteiro",
      estimatedUsd: estimate.scriptUsd,
      actualUsd: null,
    },
  ];

  return {
    estimate,
    images,
    thumbnailSourceImage: 0,
    slots,
    costs,
    estimatedTotalUsd: estimate.totalUsd,
    actualTotalUsd: null,
  };
}
