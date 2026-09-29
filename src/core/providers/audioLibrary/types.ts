/**
 * VMM internal audio library — music beds + SFX.
 * Source of truth: files under data/audio-library/ + catalog.json.
 * Prefer YouTube Audio Library tracks with attributionRequired=false.
 * Never scrape random internet pages; only files registered here.
 */

export type AudioLibraryType = "music" | "sfx";

export type AudioLicenseType =
  | "youtube-audio-library"
  | "youtube-audio-library-cc"
  | "dev-placeholder"
  | "custom";

export interface AudioLibraryEntry {
  id: string;
  name: string;
  /** Relative path under data/audio-library/ (e.g. music/amor-soft-01.mp3). */
  file: string;
  type: AudioLibraryType;
  /** Mood tags for AI selection: romantico, emocional, misterio, tensao, espiritual, esperanca… */
  mood: string[];
  /** Category: piano, ambient, phone, rain, wind… */
  category: string;
  durationSeconds: number;
  intensity: "soft" | "medium" | "intense";
  licenseType: AudioLicenseType;
  attributionRequired: boolean;
  attributionText: string;
  source: string;
  /** Channels that favorited this track (ids). */
  favoritedBy?: string[];
  /** Channels that blocked this track. */
  blockedBy?: string[];
  enabled: boolean;
}

export interface AudioLibraryCatalog {
  version: 1;
  updatedAt: string;
  entries: AudioLibraryEntry[];
}

export const AUDIO_LIBRARY_DIR = "data/audio-library";
export const AUDIO_LIBRARY_CATALOG = "data/audio-library/catalog.json";
