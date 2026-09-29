import { ChannelDNA, ScriptLine } from "./types";
import { GeneratedScript } from "./providers/script/ScriptProvider";
import { clampSceneCount, DEFAULT_SCENE_COUNT } from "./providers/tts/ttsLimits";

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

/**
 * TTS "cenas" are ONLY the N pipeline blocks (≤4.8k chars each) — not every
 * [pause] tag or LLM sectionBreak. If a script somehow got 15–20 breaks
 * (model treated each breath as a scene), collapse back to `targetScenes`
 * by character weight and refresh pauseAfter from DNA.
 *
 * betweenLines = tiny breath between sentences; betweenSections = one natural
 * pause when the scene (TTS request) changes.
 */
export function normalizeSceneBreaks(
  lines: RawLine[],
  targetScenes: number,
  pauses: ChannelDNA["scriptRules"]["pauses"]
): RawLine[] {
  if (lines.length === 0) return lines;
  const target = clampSceneCount(targetScenes || DEFAULT_SCENE_COUNT);
  const breakCount = lines.filter((l) => l.sectionBreak).length;

  if (breakCount <= target) {
    return lines.map((line, i) => {
      const isLast = i === lines.length - 1;
      return {
        ...line,
        pauseAfter: isLast ? 0 : line.sectionBreak ? pauses.betweenSections : pauses.betweenLines,
      };
    });
  }

  const totalChars = lines.reduce((sum, l) => sum + Math.max(1, l.text.length), 0);
  const charsPerScene = totalChars / target;
  let acc = 0;
  let sceneIdx = 0;

  return lines.map((line, i) => {
    const isLast = i === lines.length - 1;
    acc += Math.max(1, line.text.length);
    let sectionBreak = false;
    if (!isLast && sceneIdx < target - 1 && acc >= charsPerScene * (sceneIdx + 1)) {
      sectionBreak = true;
      sceneIdx += 1;
    }
    return {
      ...line,
      sectionBreak,
      pauseAfter: isLast ? 0 : sectionBreak ? pauses.betweenSections : pauses.betweenLines,
    };
  });
}

export function totalWeight(lines: RawLine[]): number {
  return lines.reduce((sum, l) => sum + Math.max(l.text.length, 1), 0);
}

export function scriptLinesRawText(lines: ScriptLine[]): string {
  return lines.map((l) => l.text).join("\n\n");
}
