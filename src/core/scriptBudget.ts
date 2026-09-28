/** Defaults for calm spoken narration when a channel DNA omits the fields. */
export const DEFAULT_WORDS_PER_MINUTE = 145;
export const DEFAULT_CHARS_PER_WORD = 6;

export function wordsForDuration(durationMinutes: number, wordsPerMinute = DEFAULT_WORDS_PER_MINUTE): number {
  if (!(durationMinutes > 0) || !(wordsPerMinute > 0)) return 0;
  return Math.round(durationMinutes * wordsPerMinute);
}

export function charsForDuration(
  durationMinutes: number,
  wordsPerMinute = DEFAULT_WORDS_PER_MINUTE,
  charsPerWord = DEFAULT_CHARS_PER_WORD
): number {
  return Math.round(wordsForDuration(durationMinutes, wordsPerMinute) * charsPerWord);
}

export function minutesForWords(wordCount: number, wordsPerMinute = DEFAULT_WORDS_PER_MINUTE): number {
  if (!(wordCount > 0) || !(wordsPerMinute > 0)) return 0;
  return Math.round((wordCount / wordsPerMinute) * 10) / 10;
}

export function formatBudgetLabel(args: {
  durationMinutes: number;
  wordsPerMinute?: number;
  charsPerWord?: number;
}): string {
  const wpm = args.wordsPerMinute ?? DEFAULT_WORDS_PER_MINUTE;
  const cpw = args.charsPerWord ?? DEFAULT_CHARS_PER_WORD;
  const words = wordsForDuration(args.durationMinutes, wpm);
  const chars = charsForDuration(args.durationMinutes, wpm, cpw);
  return `≈ ${words.toLocaleString("pt-BR")} palavras · ≈ ${chars.toLocaleString("pt-BR")} caracteres`;
}
