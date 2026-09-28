// ============================================================================
// VMM — Viral Money Machine — core domain types
// ============================================================================

export type Language = "es" | "pt" | "en";

export type VideoFormat = "video" | "short" | "both";

/**
 * ChannelDNA is the permanent editorial identity of a channel.
 * Everything generated inside a channel must inherit from this.
 */
export interface ChannelDNA {
  description: string;
  purpose: string;
  audience: string;
  language: Language;
  tone: string[];
  topics: string[];
  avoid: string[];

  scriptRules: {
    opening: string;
    structure: string;
    cta: string;
    defaultDurationMinutes: number;
    /**
     * Channel-specific blueprint for how scripts must be written (beats,
     * repetition style, what to say/avoid, section order, etc.). Injected
     * verbatim into every script-generation prompt. Empty = only the short
     * `structure` / opening / CTA rules above.
     */
    generationPrompt: string;
    /** Explicit narration pauses (seconds) — not estimated, part of the DNA. */
    pauses: {
      betweenLines: number;
      betweenSections: number;
    };
  };

  visual: {
    template: VisualTemplateId;
    palette: PaletteId;
    textPreset: TextPresetId;
  };

  voice: {
    provider: "local" | "cartesia" | "uploaded" | "elevenlabs";
    voiceId: string | null;
    speed: number;
    volume: number;
  };

  /** Whether this channel's pipeline needs a script/narration at all. */
  usesScript: boolean;
  usesNarration: boolean;
}

export type VisualTemplateId = "neon-meditation";
export type PaletteId = "cosmic" | "night-sky" | "warm-story" | "rain-blue";
export type TextPresetId = "bold-scroll" | "none";

export interface Channel {
  id: string;
  name: string;
  niche: string; // short tagline shown on cards, e.g. "Amor • Relacionamentos"
  coverColor: string; // deterministic accent color for card art
  /** AI-generated cover art reference — relative path (local storage) or full URL (remote storage). Null = no real cover yet. */
  coverRef: string | null;
  dna: ChannelDNA;
  createdAt: string;
  updatedAt: string;
}

export type ContentIdeaStatus = "planned" | "removed";

export interface ContentIdea {
  id: string;
  planId: string;
  title: string;
  angle: string;
  objective: string;
  status: ContentIdeaStatus;
}

export interface ContentPlan {
  id: string;
  channelId: string;
  topic: string;
  quantity: number;
  durationMinutes: number;
  format: VideoFormat;
  createdAt: string;
  items: ContentIdea[];
}

export interface ScriptLine {
  text: string;
  start: number;
  end: number;
  /** Silence (seconds) inserted right after this line, before the next one. */
  pauseAfter: number;
  /** True right after a structural section boundary (bigger pause, for staging). */
  sectionBreak?: boolean;
}

export interface Script {
  id: string;
  videoProjectId: string;
  rawText: string;
  lines: ScriptLine[];
  wordCount: number;
  createdAt: string;
}

export interface AudioAsset {
  id: string;
  videoProjectId: string;
  filePath: string; // relative to data dir (local storage) or full URL (remote storage)
  durationSeconds: number;
  provider: "local" | "cartesia" | "uploaded" | "elevenlabs";
  createdAt: string;
}

export type JobStatus =
  | "planned"
  /** Script generated, sitting in the Roteiros review queue awaiting human approval. */
  | "script"
  | "audio"
  | "timing"
  | "composing"
  | "rendering"
  | "completed"
  | "failed";

export interface VideoProject {
  id: string;
  channelId: string;
  contentIdeaId: string | null;
  title: string;
  topic: string;
  durationMinutes: number;
  format: VideoFormat;
  status: JobStatus;
  errorMessage: string | null;
  seed: number;
  /** Per-generation TTS override (e.g. to A/B "local" vs "elevenlabs" for the same script). Null = use channel default. */
  ttsProviderOverride: "local" | "cartesia" | "elevenlabs" | "uploaded" | null;
  scriptId: string | null;
  audioAssetId: string | null;
  renderPath: string | null; // relative path under data dir (local storage) or full URL (remote storage), once completed
  renderDurationSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionJob {
  id: string;
  videoProjectId: string;
  channelId: string;
  status: JobStatus;
  progress: number; // 0-100
  statusMessage: string;
  createdAt: string;
  updatedAt: string;
}
