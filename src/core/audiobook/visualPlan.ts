import { AudiobookVisualBudget } from "../types";
import { ChapterCostEstimate, estimateChapterCost } from "./visualBudget";

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

function pickMotion(
  imageIndex: number,
  durationSec: number,
  used: Set<string>,
  salt: number
): { motion: MotionKind; crop: FrameCrop; durationSec: number } {
  for (let attempt = 0; attempt < MOTION_KINDS.length * FRAME_CROPS.length; attempt++) {
    const motion = MOTION_KINDS[(imageIndex + salt + attempt) % MOTION_KINDS.length];
    const crop = FRAME_CROPS[(imageIndex * 2 + salt + attempt) % FRAME_CROPS.length];
    const key = `${imageIndex}|${motion}|${crop}|${durationSec.toFixed(1)}`;
    if (used.has(key)) continue;
    used.add(key);
    return { motion, crop, durationSec };
  }
  const duration = Math.round((durationSec + 1) * 10) / 10;
  const motion = MOTION_KINDS[salt % MOTION_KINDS.length];
  const crop = FRAME_CROPS[(salt + 1) % FRAME_CROPS.length];
  used.add(`${imageIndex}|${motion}|${crop}|${duration.toFixed(1)}`);
  return { motion, crop, durationSec: duration };
}

/**
 * The AI clips open the video back to back. That is the stretch people
 * actually stay for. After that, stills carry the chapter with camera
 * moves, and the same paintings can return.
 * Does not generate images or spend money.
 */
export function planChapterVisuals(words: number, budget: AudiobookVisualBudget): ChapterVisualPlan {
  const estimate = estimateChapterCost(words, budget);
  const imageCount = estimate.staticImages;
  const totalWords = Math.max(imageCount, Math.round(words));
  const clipCountForImages = estimate.aiClips;
  const openCount = Math.min(clipCountForImages, imageCount);
  const openWords = Math.min(
    Math.max(0, totalWords - Math.max(1, imageCount - openCount)),
    Math.max(openCount * 12, Math.round((budget.wordsPerMinute * 45) / 60))
  );
  const images: PlannedImage[] = [];
  const openEach = Math.max(1, Math.floor(Math.max(openWords, openCount) / Math.max(1, openCount)));
  for (let index = 0; index < openCount; index++) {
    const wordStart = index * openEach;
    const wordEnd = index === openCount - 1 ? openWords : Math.min(openWords, wordStart + openEach);
    images.push({ index, wordStart, wordEnd: Math.max(wordStart + 1, wordEnd), role: index === 0 ? "opening" : "moment" });
  }
  const restCount = imageCount - openCount;
  const restEach = Math.max(1, Math.floor(Math.max(1, totalWords - openWords) / Math.max(1, restCount)));
  for (let index = 0; index < restCount; index++) {
    const wordStart = openWords + index * restEach;
    const wordEnd = index === restCount - 1 ? totalWords : Math.min(totalWords, wordStart + restEach);
    images.push({
      index: openCount + index,
      wordStart,
      wordEnd: Math.max(wordStart + 1, wordEnd),
      role: "moment",
    });
  }

  const used = new Set<string>();
  const slots: TimelineSlot[] = [];
  const playSec = budget.aiClipSourceSeconds;
  const audio = estimate.durationSec;
  const clipCount = estimate.aiClips;

  const push = (
    kind: TimelineSlot["kind"],
    startSec: number,
    durationSec: number,
    imageIndex: number,
    salt: number
  ) => {
    const motion = pickMotion(imageIndex, Math.round(durationSec * 10) / 10, used, salt);
    slots.push({
      index: slots.length,
      kind,
      startSec: Math.round(startSec * 10) / 10,
      durationSec: motion.durationSec,
      imageIndex,
      motion: motion.motion,
      crop: motion.crop,
      transition: "crossfade",
      sourceDurationSec: kind === "ai-clip" ? budget.aiClipSourceSeconds : null,
      silent: true,
      estimatedUsd: kind === "ai-clip" ? estimate.perClipUsd : 0,
    });
  };

  const fillStills = (from: number, to: number, salt: number) => {
    let cursor = from;
    let step = 0;
    const holds = [35, 40, 45, 50, 55, 32, 48];
    while (cursor < to - 0.4) {
      const remaining = to - cursor;
      let hold = holds[(salt + step) % holds.length];
      hold = Math.min(budget.stillHoldMaxSeconds, Math.max(Math.min(budget.stillHoldMinSeconds, remaining), Math.min(hold, remaining)));
      if (remaining < budget.stillHoldMinSeconds) hold = remaining;
      const imageIndex = step % imageCount;
      push("still-motion", cursor, hold, imageIndex, salt + step);
      cursor += slots[slots.length - 1].durationSec;
      if (cursor > to) {
        const last = slots[slots.length - 1];
        last.durationSec = Math.max(1, Math.round((last.durationSec - (cursor - to)) * 10) / 10);
        break;
      }
      step += 1;
      if (step > 40) break;
    }
  };

  let cursor = 0;
  // Five slow clips from the opening of the text, with a still between them.
  // The still is where the fades live, so the 5s of Fal stays whole.
  for (let index = 0; index < clipCount; index++) {
    const imageIndex = Math.min(index, Math.max(0, imageCount - 1));
    push("ai-clip", cursor, playSec, imageIndex, index);
    cursor += playSec;
    if (index < clipCount - 1) {
      push("still-motion", cursor, 4, imageIndex, 100 + index);
      cursor += 4;
    }
  }
  if (cursor < audio - 0.4) fillStills(cursor, audio, clipCount + 3);

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
