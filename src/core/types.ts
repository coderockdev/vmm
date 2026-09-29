// ============================================================================
// VMM — Viral Money Machine — core domain types
// ============================================================================

export type Language = "es" | "pt" | "en";

export type VideoFormat = "video" | "short" | "both";

export type {
  VoiceProfile,
  VoiceProvider,
  VoiceCapabilities,
} from "./providers/tts/voiceCapabilities";

import type { VoiceProfile } from "./providers/tts/voiceCapabilities";
import type { MusicalDna } from "./providers/music/musicalDna";
import type { VideoStyleChoice } from "./videoRenderers/types";

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
  /**
   * Proven YouTube titles for this channel (performance bank).
   * Idea/auto generation must invent NEW titles that rhyme with these
   * patterns (urgency, santo/deidad, timeframe, warning) — never clone verbatim.
   */
  successfulTitles?: string[];

  scriptRules: {
    opening: string;
    structure: string;
    cta: string;
    defaultDurationMinutes: number;
    /**
     * How many TTS-safe scenes (3–8) a full script is split into by default.
     * Each scene stays ≤ ~4800 characters so ElevenLabs/Cartesia/HeyGen can
     * synthesize one scene per request. Amor Amor defaults to 4.
     */
    defaultSceneCount: number;
    /**
     * Spoken-pace budget used to translate minutes ↔ words ↔ characters
     * for the LLM and the DNA UI. Calm/passionate narration is often ~130–150;
     * Amor Amor targets ~145 → ~1600 words at 11 min.
     */
    wordsPerMinute: number;
    /** Average characters per spoken word (incl. spaces), for the char estimate. */
    charsPerWord: number;
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
    /**
     * Performance / emotion markup the script generator may insert
     * (e.g. "[pause]", "[whisper]"). Only `selected` tags are allowed in
     * prompts; TTS strips any markup the engine cannot interpret.
     */
    performanceTags: {
      enabled: boolean;
      selected: string[];
      /**
       * How many interpretation tags the LLM should aim for per 1000 spoken
       * words (e.g. 30 = sparse, 50 = dense). Ignored when disabled.
       */
      tagsPerThousandWords: number;
    };
  };

  visual: {
    template: VisualTemplateId;
    palette: PaletteId;
    textPreset: TextPresetId;
    /** YouTube thumbnail creative engine (formats + style rules). */
    cover?: CoverVisualDna;
    /** Default FFmpeg/Remotion video style for this channel. */
    defaultVideoStyle?: VideoStyleChoice | null;
  };

  voice: {
    provider: "local" | "cartesia" | "uploaded" | "elevenlabs" | "heygen";
    voiceId: string | null;
    speed: number;
    volume: number;
    /** Full voice selection (provider, capabilities, HeyGen template, etc.). */
    profile?: VoiceProfile;
  };

  /** Instrumental bed + SFX identity. */
  musical?: MusicalDna;

  /** Whether this channel's pipeline needs a script/narration at all. */
  usesScript: boolean;
  usesNarration: boolean;
}

export type VisualTemplateId = "neon-meditation";
export type PaletteId = "cosmic" | "night-sky" | "warm-story" | "rain-blue";
export type TextPresetId = "bold-scroll" | "none";

export type {
  CoverFormat,
  CoverVisualDna,
  VideoConcept,
  InventedCoverFormat,
  ThumbnailFormatChoice,
} from "./providers/image/coverFormats";
export type { ImageProviderName } from "./providers/image/ImageProvider";

import type { CoverVisualDna, VideoConcept } from "./providers/image/coverFormats";

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
  provider: "local" | "cartesia" | "uploaded" | "elevenlabs" | "heygen";
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
  ttsProviderOverride: "local" | "cartesia" | "elevenlabs" | "uploaded" | "heygen" | null;
  /** Explicit voice when overriding TTS (required for ElevenLabs — never invent a default). */
  ttsVoiceIdOverride: string | null;
  scriptId: string | null;
  audioAssetId: string | null;
  renderPath: string | null; // relative path under data dir (local storage) or full URL (remote storage), once completed
  renderDurationSeconds: number | null;
  /** Sum of estimated USD for ideas+script+audio+render+thumbnail attributed to this project. */
  costUsdTotal: number | null;
  /** Per-stage USD snapshot { ideas, script, audio, render, thumbnail }. */
  costBreakdown: {
    ideas: number;
    script: number;
    audio: number;
    music: number;
    sfx: number;
    transcription: number;
    render: number;
    thumbnail: number;
  } | null;
  /** Joint title+thumbnail creative concept. */
  thumbnailConcept: VideoConcept | null;
  /** Generated thumbnail image path/URL. */
  thumbnailRef: string | null;
  /**
   * Chosen video style for FFmpeg/Remotion render (scrolling text, etc.).
   * Null = legacy neon-meditation Remotion path.
   */
  videoStyle: VideoStyleChoice | null;
  /** Instrumental bed ref (path/URL) — never overwrites narration asset. */
  musicRef: string | null;
  musicStyle: string | null;
  /** Catalog id of the looped instrumental track. */
  musicLibraryId: string | null;
  /** Display name of the instrumental track (same theme looped). */
  musicTrackName: string | null;
  /** Mixed SFX bed ref. */
  sfxRef: string | null;
  /** Voice + music only. */
  mixMusicRef: string | null;
  /** Voice + SFX only. */
  mixSfxRef: string | null;
  /** Final mix (narration+music+sfx) used for video render when present. */
  mixAudioRef: string | null;
  /** Last music gain used in mix (0–1). */
  musicVolume: number | null;
  /** Last SFX gain used in mix (0–1). */
  sfxVolume: number | null;
  /** Production SFX markers (never shown on screen / never spoken). */
  productionMarkers: string[] | null;
  /** Human-readable SFX cues for the editor UI. */
  sfxCues: Array<{ at: string; label: string; trackName?: string }> | null;
  /** YouTube headline / manchete. */
  headline: string | null;
  /** Full YouTube description. */
  youtubeDescription: string | null;
  /** Auto-flow: continue music/SFX after TTS. */
  autoFlow: boolean;
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
