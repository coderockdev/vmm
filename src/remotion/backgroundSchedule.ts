import { mulberry32 } from "./seededRandom";

export type BackgroundId = "neon-tunnel" | "radial-mandala" | "flowing-waves" | "particle-field";

export interface BackgroundSegment {
  id: BackgroundId;
  startSec: number;
  endSec: number;
}

const ORDER: BackgroundId[] = ["neon-tunnel", "radial-mandala", "flowing-waves", "particle-field"];
const SEGMENT_SECONDS = 20;

/**
 * Distributes the four procedural backgrounds across the full duration in
 * ~20s segments (per spec section 15), deterministically shuffled by seed so
 * every render of the same project produces the identical schedule.
 */
export function buildBackgroundSchedule(totalDurationSeconds: number, seed: number): BackgroundSegment[] {
  const rng = mulberry32(seed + 7);
  const segmentCount = Math.max(1, Math.ceil(totalDurationSeconds / SEGMENT_SECONDS));

  // Shuffle a repeating deck of the 4 backgrounds so consecutive segments
  // rarely repeat the same background back to back.
  const deck: BackgroundId[] = [];
  while (deck.length < segmentCount) {
    const shuffled = [...ORDER];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    deck.push(...shuffled);
  }

  const segments: BackgroundSegment[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const startSec = i * SEGMENT_SECONDS;
    const endSec = Math.min(totalDurationSeconds, startSec + SEGMENT_SECONDS);
    segments.push({ id: deck[i], startSec, endSec });
  }
  return segments;
}
