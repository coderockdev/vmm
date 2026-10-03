/**
 * Storyboard is the source of truth for what the viewer sees and hears
 * around the narration. The script says the words. The audio says when.
 * Assets only implement shots that already exist here.
 */

export const VISUAL_TYPES = [
  "cinematic-image",
  "image-animation",
  "ai-video",
  "archival",
  "document",
  "photograph",
  "map",
  "diagram",
  "location-card",
  "newspaper",
  "close-up",
  "black",
  "text-only",
  "b-roll",
] as const;

export type VisualType = (typeof VISUAL_TYPES)[number];

export const VISUAL_TYPE_LABELS: Record<VisualType, string> = {
  "cinematic-image": "CINEMATIC IMAGE",
  "image-animation": "IMAGE → ANIMATION",
  "ai-video": "AI VIDEO",
  archival: "ARCHIVAL STYLE",
  document: "DOCUMENT",
  photograph: "PHOTOGRAPH",
  map: "MAP",
  diagram: "DIAGRAM",
  "location-card": "LOCATION CARD",
  newspaper: "NEWSPAPER",
  "close-up": "CLOSE-UP / DETAIL",
  black: "BLACK SCREEN",
  "text-only": "TEXT ONLY",
  "b-roll": "B-ROLL",
};

export const SFX_PRESETS = [
  "none",
  "radio-static",
  "wind",
  "rain",
  "footsteps",
  "engine",
  "door",
  "telephone",
  "camera",
  "paper",
  "electrical-hum",
  "insects",
  "thunder",
  "custom",
] as const;

export type SfxPreset = (typeof SFX_PRESETS)[number];

export const MUSIC_MOODS = [
  "none",
  "mystery",
  "investigation",
  "tension",
  "discovery",
  "danger",
  "revelation",
  "aftermath",
] as const;

export type MusicMood = (typeof MUSIC_MOODS)[number];

export const MUSIC_ACTIONS = ["start", "continue", "fade", "stop"] as const;
export type MusicAction = (typeof MUSIC_ACTIONS)[number];

export const TRANSITIONS = ["cut", "fade", "black"] as const;
export type ShotTransition = (typeof TRANSITIONS)[number];

export const VOICE_EFFECTS = [
  "none",
  "radio",
  "telephone",
  "distant",
  "muffled",
  "echo",
  "intercom",
  "cassette",
  "old-recording",
] as const;

export type VoiceEffect = (typeof VOICE_EFFECTS)[number];

export type RenderMode = "quick" | "cinematic";
export type StoryboardStatus = "draft" | "approved";
export type ShotStatus = "planned" | "asset-ready" | "failed" | "skipped";

/** Present now so a later multi-voice pass does not redesign the shot. */
export interface SpokenSegment {
  text: string;
  speakerId: string;
  speakerName: string;
  voiceId: string | null;
  emotion: string | null;
  delivery: string | null;
  voiceEffect: VoiceEffect;
}

export interface SfxCue {
  id: string;
  preset: SfxPreset;
  /** File name the mixer should look for later, e.g. radio_static.wav */
  fileHint: string | null;
  /** Seconds from the start of this shot. */
  startSec: number;
  endSec: number;
}

export interface LocationCardSpec {
  lines: string[];
  coordinates: string | null;
}

export interface MapSpec {
  mapType: "route" | "region";
  startLabel: string;
  endLabel: string;
  stops: string[];
  camera: string;
  animateRoute: boolean;
  labels: boolean;
}

export interface StoryboardShot {
  id: string;
  index: number;
  startSec: number;
  endSec: number;
  narration: string;
  speech: SpokenSegment[];
  visualType: VisualType;
  visual: string;
  imagePrompt: string;
  motion: string;
  sfx: SfxCue[];
  musicMood: MusicMood;
  musicAction: MusicAction;
  silenceSec: number;
  onScreenText: string;
  transition: ShotTransition;
  locationCard: LocationCardSpec | null;
  map: MapSpec | null;
  status: ShotStatus;
  assetRef: string | null;
  error: string | null;
}

export interface StoryboardScene {
  id: string;
  index: number;
  title: string;
  shots: StoryboardShot[];
}

export interface Storyboard {
  videoProjectId: string;
  channelId: string;
  title: string;
  renderMode: RenderMode;
  status: StoryboardStatus;
  durationSec: number;
  scenes: StoryboardScene[];
  createdAt: string;
  updatedAt: string;
}

export function formatTimecode(sec: number): string {
  const safe = Math.max(0, sec);
  const total = Math.floor(safe);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function shotCount(board: Storyboard): number {
  return board.scenes.reduce((sum, scene) => sum + scene.shots.length, 0);
}

export function allShots(board: Storyboard): StoryboardShot[] {
  return board.scenes.flatMap((scene) => scene.shots);
}

export function isVisualType(value: string): value is VisualType {
  return (VISUAL_TYPES as readonly string[]).includes(value);
}

export function needsGeneratedImage(type: VisualType, mode: RenderMode): boolean {
  if (type === "black" || type === "text-only" || type === "location-card" || type === "map") return false;
  if (type === "ai-video" && mode === "cinematic") return false;
  return true;
}
