import { ChannelDNA, ScriptLine } from "./types";
import { GeneratedScript } from "./providers/script/ScriptProvider";

export interface RawLine {
  text: string;
  pauseAfter: number;
  sectionBreak: boolean;
}

/**
 * Splits a ScriptProvider's rawText (blank-line-separated sentences) into
 * raw lines with pause durations already attached, using the channel's
 * explicit pause configuration. Timestamps (start/end) are NOT set here —
 * they come either from real per-line audio durations (narration pipeline)
 * or from EstimateTimingProvider (uploaded whole-file audio fallback).
 */
export function parseGeneratedScript(
  generated: GeneratedScript,
  pauses: ChannelDNA["scriptRules"]["pauses"]
): RawLine[] {
  const texts = generated.rawText
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean);

  const sectionBreakSet = new Set(generated.sectionBreaks ?? []);

  return texts.map((text, i) => {
    const isLast = i === texts.length - 1;
    const sectionBreak = sectionBreakSet.has(i);
    return {
      text,
      pauseAfter: isLast ? 0 : sectionBreak ? pauses.betweenSections : pauses.betweenLines,
      sectionBreak,
    };
  });
}

export function totalWeight(lines: RawLine[]): number {
  return lines.reduce((sum, l) => sum + Math.max(l.text.length, 1), 0);
}

export function scriptLinesRawText(lines: ScriptLine[]): string {
  return lines.map((l) => l.text).join("\n\n");
}
