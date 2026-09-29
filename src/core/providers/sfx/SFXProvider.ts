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
}

export interface PlanSfxArgs {
  scriptText: string;
  durationSeconds: number;
  allowed: SfxKind[];
  forbidden: SfxKind[];
  intensity: "soft" | "medium" | "intense";
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
