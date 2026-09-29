/**
 * Soft caps per TTS engine (chars per request). Leave headroom under the
 * documented hard limit so tags / punctuation don't tip over the edge.
 * ElevenLabs eleven_v3 ≈ 5k; multilingual/turbo often 10k — we use 4800 for v3.
 */
export const TTS_SOFT_CHAR_LIMIT: Record<string, number> = {
  elevenlabs: 4800,
  cartesia: 4800,
  local: 50_000,
  heygen: 4800,
  uploaded: 50_000,
};

/** Hard ceiling per scene / TTS request (ElevenLabs v3 / Cartesia). */
export const SCENE_TTS_CHAR_LIMIT = 4800;

/** How many narrative scenes a script may be split into for TTS-safe chunks. */
export const MIN_SCENE_COUNT = 3;
export const MAX_SCENE_COUNT = 8;
export const DEFAULT_SCENE_COUNT = 4;

export function softCharLimitForProvider(provider: string): number {
  return TTS_SOFT_CHAR_LIMIT[provider] ?? SCENE_TTS_CHAR_LIMIT;
}

export function clampSceneCount(n: number | null | undefined): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return DEFAULT_SCENE_COUNT;
  return Math.min(MAX_SCENE_COUNT, Math.max(MIN_SCENE_COUNT, Math.round(v)));
}

/**
 * Split spoken text into chunks that fit under `maxChars`, preferring sentence
 * boundaries, then spaces. Never returns empty chunks.
 */
export function splitTextForTts(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
    let cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf(".\n"),
      window.lastIndexOf("!\n"),
      window.lastIndexOf("?\n")
    );
    if (cut < maxChars * 0.4) {
      cut = window.lastIndexOf(" ");
    }
    if (cut < maxChars * 0.2) {
      cut = maxChars;
    } else {
      cut += 1; // include the space / keep punctuation with previous sentence
    }
    const piece = remaining.slice(0, cut).trim();
    if (piece) chunks.push(piece);
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
