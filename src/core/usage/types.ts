export type UsageStage =
  | "ideas"
  | "script"
  | "audio"
  | "music"
  | "sfx"
  | "transcription"
  | "render"
  | "thumbnail"
  | "youtube";

export type UsageProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "google"
  | "cartesia"
  | "elevenlabs"
  | "heygen"
  | "remotion-lambda"
  | "pollinations"
  | "ffmpeg-ambient"
  | "ffmpeg-lavfi-sfx"
  | "fal"
  | "local"
  | "mock"
  | "uploaded"
  | "youtube";

/** Raw metrics captured from an API response or measured locally. */
export interface UsageSnapshot {
  provider: UsageProvider;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  characters?: number | null;
  durationSeconds?: number | null;
  /** Number of generated images (OpenAI Images / Gemini Imagen / Pollinations). */
  images?: number | null;
  /** YouTube Data API quota units consumed (not USD). */
  quotaUnits?: number | null;
  /** Unprocessed usage object from the provider response. */
  raw?: unknown;
}

export interface CostBreakdown {
  ideas: number;
  script: number;
  audio: number;
  music: number;
  sfx: number;
  transcription: number;
  render: number;
  thumbnail: number;
  /** YouTube Data API has no $ fee — always 0; events still logged for quota. */
  youtube: number;
}

export interface UsageEvent {
  id: string;
  channelId: string;
  contentPlanId: string | null;
  contentIdeaId: string | null;
  videoProjectId: string | null;
  stage: UsageStage;
  provider: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  characters: number | null;
  durationSeconds: number | null;
  estimatedUsd: number;
  rawUsage: unknown;
  createdAt: string;
}

export function emptyBreakdown(): CostBreakdown {
  return {
    ideas: 0,
    script: 0,
    audio: 0,
    music: 0,
    sfx: 0,
    transcription: 0,
    render: 0,
    thumbnail: 0,
    youtube: 0,
  };
}

/** Normalize partial/legacy breakdowns into a full CostBreakdown. */
export function normalizeBreakdown(raw: Partial<CostBreakdown> | null | undefined): CostBreakdown {
  return {
    ideas: Number(raw?.ideas) || 0,
    script: Number(raw?.script) || 0,
    audio: Number(raw?.audio) || 0,
    music: Number(raw?.music) || 0,
    sfx: Number(raw?.sfx) || 0,
    transcription: Number(raw?.transcription) || 0,
    render: Number(raw?.render) || 0,
    thumbnail: Number(raw?.thumbnail) || 0,
    youtube: Number(raw?.youtube) || 0,
  };
}

export function sumBreakdown(b: CostBreakdown): number {
  return (
    b.ideas +
    b.script +
    b.audio +
    b.music +
    b.sfx +
    b.transcription +
    b.render +
    b.thumbnail +
    b.youtube
  );
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
