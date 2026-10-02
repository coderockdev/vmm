import { YoutubeQuotaError } from "./oauth";

/**
 * YouTube Data API quota, per Google Cloud project. Resets at midnight Pacific
 * (~04:00 Argentina). Paying the Cloud bill does not raise it. A new API key
 * in the same project shares these same counters. Another channel connected
 * to this project shares them too.
 *
 * Official split (docs updated 2026-09-15):
 * - videos.insert has its own bucket: 100 calls a day, 1 each. It does not
 *   spend the point pool, so a day of comment replies cannot block an upload.
 * - search.list has its own bucket: 100 calls a day.
 * - Every other method shares 10,000 points a day. A cover (thumbnails.set)
 *   and a comment reply (comments.insert) each cost 50.
 */
export const YOUTUBE_VIDEO_UPLOADS_PER_DAY = 100;
export const YOUTUBE_QUERY_POINTS_PER_DAY = 10_000;
export const YOUTUBE_THUMBNAIL_POINTS = 50;
export const YOUTUBE_COMMENT_POINTS = 50;

export const COVER_PENDING_MESSAGE =
  "Vídeo no YouTube. A portada entra quando a cota renovar, cerca das 4h (Argentina).";

export function isYoutubeQuotaError(err: unknown): boolean {
  if (err instanceof YoutubeQuotaError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /quotaExceeded|\bquota\b/i.test(message);
}
