/**
 * Turns a stored file reference into something a browser can load. A ref is
 * either a relative path (local-storage mode — served through
 * /api/media/[...path]) or an absolute URL (remote-storage mode — Supabase
 * Storage's own public URL, used as-is). Pure/string-only so it's safe to
 * import from both server and client components.
 */
export function mediaUrl(channelId: string, ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (/^https?:\/\//i.test(ref)) return ref;
  return `/api/media/${channelId}/${ref}`;
}
