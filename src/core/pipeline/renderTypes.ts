import { Channel, ScriptLine, VideoFormat } from "../types";

export interface RenderVideoArgs {
  channel: Channel;
  videoProjectId: string;
  lines: ScriptLine[];
  seed: number;
  durationInSeconds: number;
  format: Exclude<VideoFormat, "both">;
  /** Absolute path to the final narration/ambient audio file, or null for silent. */
  audioAbsolutePath: string | null;
  onProgress?: (progress: number, message: string) => void;
}

export interface RenderVideoResult {
  outputPath: string; // absolute path
  relativeRenderPath: string; // relative to channel dir, e.g. "renders/xyz.mp4"
  durationSeconds: number;
}
