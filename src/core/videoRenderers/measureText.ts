import { VideoStyleSettings, ASPECT_SIZES } from "./types";

/** Rough monospace-ish wrap using avg glyph width ≈ 0.55 * fontSize for Arial. */
export function wrapTextToLines(text: string, settings: VideoStyleSettings): string[] {
  const size = ASPECT_SIZES[settings.aspectRatio];
  const maxWidthPx = size.width * settings.maxTextWidthPct;
  const avgChar = settings.fontSize * 0.52;
  const maxChars = Math.max(12, Math.floor(maxWidthPx / avgChar));

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (lines.length) {
      // blank visual gap between paragraphs
      lines.push("");
    }
    const words = para.split(" ");
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export function estimateBlockHeightPx(lineCount: number, settings: VideoStyleSettings): number {
  const linePx = settings.fontSize * settings.lineHeight;
  // Empty lines count as paragraph gaps
  return Math.max(linePx, lineCount * linePx);
}
