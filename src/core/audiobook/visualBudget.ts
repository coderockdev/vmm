import {
  AudiobookVisualBudget,
  ChannelAudiobookSettings,
  DEFAULT_AUDIOBOOK_SETTINGS,
  ImageToVideoProviderId,
} from "../types";

const PROVIDERS: ImageToVideoProviderId[] = ["fal", "runway", "kling", "luma", "pika"];

function num(value: unknown, fallback: number, min = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}

function provider(value: unknown): ImageToVideoProviderId | null {
  return PROVIDERS.includes(value as ImageToVideoProviderId) ? (value as ImageToVideoProviderId) : null;
}

export function normalizeVisualBudget(raw: Partial<AudiobookVisualBudget> | null | undefined): AudiobookVisualBudget {
  const base = DEFAULT_AUDIOBOOK_SETTINGS.visualBudget;
  const minStatic = Math.round(num(raw?.minStaticImages, base.minStaticImages, 1));
  const maxStatic = Math.max(minStatic, Math.round(num(raw?.maxStaticImages, base.maxStaticImages, 1)));
  const minClips = Math.round(num(raw?.minAiClips, base.minAiClips, 0));
  const maxClips = Math.max(minClips, Math.round(num(raw?.maxAiClips, base.maxAiClips, 0)));
  return {
    referenceMinutes: num(raw?.referenceMinutes, base.referenceMinutes, 1),
    wordsPerMinute: num(raw?.wordsPerMinute, base.wordsPerMinute, 1),
    staticImageBudgetUsd: num(raw?.staticImageBudgetUsd, base.staticImageBudgetUsd),
    aiVideoBudgetUsd: num(raw?.aiVideoBudgetUsd, base.aiVideoBudgetUsd),
    voiceBudgetUsd: num(raw?.voiceBudgetUsd, base.voiceBudgetUsd),
    scriptCostUsd: num(raw?.scriptCostUsd, base.scriptCostUsd),
    maxCostPerChapterUsd: num(raw?.maxCostPerChapterUsd, base.maxCostPerChapterUsd),
    autoApproveUnderUsd: num(raw?.autoApproveUnderUsd, base.autoApproveUnderUsd),
    staticImagesPerReference: Math.round(num(raw?.staticImagesPerReference, base.staticImagesPerReference, 1)),
    aiClipsPerReference: Math.round(num(raw?.aiClipsPerReference, base.aiClipsPerReference, 0)),
    minStaticImages: minStatic,
    maxStaticImages: maxStatic,
    minAiClips: minClips,
    maxAiClips: maxClips,
    openingAiSeconds: num(raw?.openingAiSeconds, base.openingAiSeconds, 1),
    aiClipSeconds: num(raw?.aiClipSeconds, base.aiClipSeconds, 1),
    aiClipUsd: num(raw?.aiClipUsd, base.aiClipUsd),
    aiClipSourceSeconds: num(raw?.aiClipSourceSeconds, base.aiClipSourceSeconds, 1),
    aiClipPlaySeconds: Math.max(
      num(raw?.aiClipSourceSeconds, base.aiClipSourceSeconds, 1),
      num(raw?.aiClipPlaySeconds, base.aiClipPlaySeconds, 1)
    ),
    imageToVideoModel:
      typeof raw?.imageToVideoModel === "string" && raw.imageToVideoModel.trim()
        ? raw.imageToVideoModel.trim()
        : base.imageToVideoModel,
    imageToVideoResolution:
      raw?.imageToVideoResolution === "480p" || raw?.imageToVideoResolution === "580p" || raw?.imageToVideoResolution === "720p"
        ? raw.imageToVideoResolution
        : base.imageToVideoResolution,
    imageToVideoAspect: "16:9",
    stillHoldMinSeconds: num(raw?.stillHoldMinSeconds, base.stillHoldMinSeconds, 1),
    stillHoldMaxSeconds: Math.max(
      num(raw?.stillHoldMinSeconds, base.stillHoldMinSeconds, 1),
      num(raw?.stillHoldMaxSeconds, base.stillHoldMaxSeconds, 1)
    ),
    transitionSeconds: num(raw?.transitionSeconds, base.transitionSeconds),
    defaultImageToVideoProvider:
      raw?.defaultImageToVideoProvider == null
        ? base.defaultImageToVideoProvider
        : provider(raw.defaultImageToVideoProvider) ?? base.defaultImageToVideoProvider,
    favoriteImageToVideoProvider: provider(raw?.favoriteImageToVideoProvider),
  };
}

export function normalizeAudiobookSettings(
  raw: Partial<ChannelAudiobookSettings> | null | undefined
): ChannelAudiobookSettings {
  return {
    ...DEFAULT_AUDIOBOOK_SETTINGS,
    ...raw,
    visualBudget: normalizeVisualBudget(raw?.visualBudget),
  };
}

export function formatUsd(value: number): string {
  return `US$${value.toFixed(2)}`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function chapterDurationSeconds(words: number, budget: AudiobookVisualBudget): number {
  const wpm = budget.wordsPerMinute || 150;
  return Math.max(1, (Math.max(0, words) / wpm) * 60);
}

function scaledCount(perReference: number, scale: number, min: number, max: number): number {
  const raw = Math.round(perReference * scale);
  return Math.min(max, Math.max(min, raw));
}

export interface ChapterCostEstimate {
  durationSec: number;
  durationLabel: string;
  staticImages: number;
  aiClips: number;
  voiceUsd: number;
  staticUsd: number;
  aiUsd: number;
  scriptUsd: number;
  totalUsd: number;
  perImageUsd: number;
  perClipUsd: number;
  exceedsMax: boolean;
  needsApproval: boolean;
}

/** Money follows the clamped image and clip counts. Voice follows the real duration. */
export function estimateChapterCost(words: number, budget: AudiobookVisualBudget): ChapterCostEstimate {
  const durationSec = chapterDurationSeconds(words, budget);
  const scale = durationSec / 60 / budget.referenceMinutes;
  const staticImages = scaledCount(
    budget.staticImagesPerReference,
    scale,
    budget.minStaticImages,
    budget.maxStaticImages
  );
  const scaledClips = scaledCount(budget.aiClipsPerReference, scale, budget.minAiClips, budget.maxAiClips);
  const aiClips =
    durationSec >= 6 * 60
      ? Math.min(budget.maxAiClips, Math.max(scaledClips, budget.aiClipsPerReference))
      : scaledClips;
  const staticUsd =
    budget.staticImagesPerReference > 0
      ? budget.staticImageBudgetUsd * (staticImages / budget.staticImagesPerReference)
      : 0;
  const aiUsd = aiClips * budget.aiClipUsd;
  const voiceUsd = budget.voiceBudgetUsd * scale;
  const scriptUsd = budget.scriptCostUsd;
  const totalUsd = staticUsd + aiUsd + voiceUsd + scriptUsd;
  return {
    durationSec,
    durationLabel: formatClock(durationSec),
    staticImages,
    aiClips,
    voiceUsd,
    staticUsd,
    aiUsd,
    scriptUsd,
    totalUsd,
    perImageUsd: staticImages > 0 ? staticUsd / staticImages : 0,
    perClipUsd: budget.aiClipUsd,
    exceedsMax: totalUsd > budget.maxCostPerChapterUsd + 1e-9,
    needsApproval: totalUsd > budget.autoApproveUnderUsd + 1e-9,
  };
}
