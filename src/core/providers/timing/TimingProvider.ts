import { ScriptLine } from "../../types";
import { RawLine } from "../../scriptLines";

/**
 * TimingProvider turns raw lines + a known total narration duration into
 * exact ScriptLine timestamps. Used as a FALLBACK when we don't already have
 * real per-line audio durations (e.g. a single uploaded MP3/WAV covering the
 * whole script). Swappable later for a real forced-alignment implementation
 * without touching call sites.
 */
export interface TimingProvider {
  computeTimestamps(lines: RawLine[], totalDurationSeconds: number): ScriptLine[];
}
