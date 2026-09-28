/**
 * Deterministic PRNG (mulberry32). Every visual randomness in this project
 * MUST go through this instead of Math.random(), so preview and render (and
 * re-renders of the same project) always produce the identical composition.
 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

export function seededRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}
