import { ScriptLine } from "../../types";
import { RawLine } from "../../scriptLines";
import { TimingProvider } from "./TimingProvider";

/**
 * Distributes a known total audio duration across lines proportionally to
 * each line's character count (a cheap but decent proxy for how long a TTS
 * engine takes to speak it), then subtracts the explicit pauses so the
 * remaining "speaking time" budget is what actually gets divided up.
 */
export class EstimateTimingProvider implements TimingProvider {
  computeTimestamps(lines: RawLine[], totalDurationSeconds: number): ScriptLine[] {
    if (lines.length === 0) return [];

    const totalPause = lines.reduce((sum, l) => sum + l.pauseAfter, 0);
    const speakingBudget = Math.max(totalDurationSeconds - totalPause, lines.length * 0.4);
    const weights = lines.map((l) => Math.max(l.text.length, 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const result: ScriptLine[] = [];
    let cursor = 0;
    for (let i = 0; i < lines.length; i++) {
      const share = (weights[i] / totalWeight) * speakingBudget;
      const start = cursor;
      const end = start + share;
      result.push({
        text: lines[i].text,
        start,
        end,
        pauseAfter: lines[i].pauseAfter,
        sectionBreak: lines[i].sectionBreak,
      });
      cursor = end + lines[i].pauseAfter;
    }
    return result;
  }
}
