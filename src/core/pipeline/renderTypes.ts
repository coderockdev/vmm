import { Channel, ScriptLine, VideoFormat } from "../types";

export interface RenderVideoArgs {
  channel: Channel;
  videoProjectId: string;
  lines: ScriptLine[];
  seed: number;
  durationInSeconds: number;
  format: Exclude<VideoFormat, "both">;
  /**
   * Narration/ambient audio reference, or null for silent — a relative path
   * (local storage; resolve with storage.resolveChannelRelativePath) or a
   * full URL (remote storage; directly fetchable). See storage/index.ts.
   */
  audioAbsolutePath: string | null;
  onProgress?: (progress: number, message: string) => void;
}

export interface RenderVideoResult {
  outputPath: string; // absolute local path
  relativeRenderPath: string; // DB-storable ref: relative to channel dir (local storage) or a full URL (remote storage)
  durationSeconds: number;
}
