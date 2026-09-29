import { SfxKind } from "../music/musicalDna";

export interface SfxEvent {
  kind: SfxKind;
  /** Seconds from start of narration. */
  atSeconds: number;
  /** Relative gain 0–1. */
  volume: number;
  /** Internal production marker — never shown on video / never spoken. */
  marker: string;
  categoryHint?: string;
  /** Library track display name when resolved. */
  trackName?: string;
}

export interface PlanSfxArgs {
  scriptText: string;
  durationSeconds: number;
  allowed: SfxKind[];
  forbidden: SfxKind[];
  intensity: "soft" | "medium" | "intense";
  /** Timed narration lines — SFX are placed at the line where the keyword is spoken. */
  timedLines?: Array<{ text: string; start: number; end?: number }>;
}

export interface RenderSfxArgs {
  events: SfxEvent[];
  durationSeconds: number;
  outDir: string;
  fileBaseName: string;
  channelId?: string;
  scriptText?: string;
}

export interface GeneratedSfxBed {
  /** Mixed SFX track (may be silence if no events). */
  filePath: string;
  events: SfxEvent[];
  provider: string;
}

export interface SFXProvider {
  readonly name: string;
  planEvents(args: PlanSfxArgs): SfxEvent[];
  renderBed(args: RenderSfxArgs): Promise<GeneratedSfxBed>;
}
