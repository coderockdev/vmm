/**
 * Style variants for multi-thumbnail generation (YouTube allows up to 3).
 * Same concept/format, different visual treatment so the editor can pick/upload several.
 * styleId may be a legacy cinematic variant OR a cover-format id (01-antes-despues…).
 */

export type ThumbnailStyleId = "cinematic" | "high-contrast" | "emotional-close" | string;

export type ThumbnailCandidate = {
  id: string;
  styleId: string;
  styleLabel: string;
  ref: string;
  createdAt: string;
};

export const THUMBNAIL_STYLE_VARIANTS: Array<{
  id: "cinematic" | "high-contrast" | "emotional-close";
  label: string;
  /** Extra direction appended to the image prompt. */
  promptExtra: string;
}> = [
  {
    id: "cinematic",
    label: "Cinemático",
    promptExtra:
      "STYLE VARIANT — Cinematic: wide film-still framing, dramatic side light, shallow depth of field, moody atmosphere.",
  },
  {
    id: "high-contrast",
    label: "Alto contraste",
    promptExtra:
      "STYLE VARIANT — High-CTR YouTube: punchy contrast, saturated accent color, bold clear text zone, graphic impact, mobile-readable.",
  },
  {
    id: "emotional-close",
    label: "Close emocional",
    promptExtra:
      "STYLE VARIANT — Emotional close: tighter crop on the hero object or face ONLY (not the text). Keep on-image text fully inside an 8% safe margin — never clip letters.",
  },
];

export function stylesForCount(count: number) {
  const n = Math.min(3, Math.max(1, Math.round(count) || 1));
  return THUMBNAIL_STYLE_VARIANTS.slice(0, n);
}

const HISTORY_MAX = 18;

/** Append new candidates to history (dedupe by ref), keep newest last. */
export function mergeThumbnailHistory(
  previous: ThumbnailCandidate[] | null | undefined,
  incoming: ThumbnailCandidate[]
): ThumbnailCandidate[] {
  const byRef = new Map<string, ThumbnailCandidate>();
  for (const item of previous ?? []) {
    if (item?.ref) byRef.set(item.ref, item);
  }
  for (const item of incoming) {
    if (item?.ref) byRef.set(item.ref, item);
  }
  return Array.from(byRef.values())
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(-HISTORY_MAX);
}
