/**
 * Turns a stored file reference into something a browser can load. A ref is
 * either a relative path (local-storage mode — served through
 * /api/media/[...path]) or an absolute URL (remote-storage mode — Supabase
 * Storage's own public URL, used as-is). Pure/string-only so it's safe to
 * import from both server and client components.
 *
 * Also tolerates legacy absolute filesystem paths that older builds wrote
 * into the DB (…/channels/{id}/audio/….mp3) by extracting the relative bit.
 */
export function mediaUrl(channelId: string, ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (/^https?:\/\//i.test(ref)) return ref;

  const normalized = ref.replace(/\\/g, "/");
  const underChannels = normalized.match(/\/channels\/([^/]+)\/(.+)$/);
  if (underChannels) {
    return `/api/media/${underChannels[1]}/${underChannels[2]}`;
  }

  // Absolute path without a recognizable channels/ segment — unusable in the browser.
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    const kindFile = normalized.match(/\/((?:audio|renders)\/[^/]+)$/i);
    if (kindFile) return `/api/media/${channelId}/${kindFile[1]}`;
    return null;
  }

  return `/api/media/${channelId}/${normalized.replace(/^\.\//, "")}`;
}

/**
 * Grid preview. The stored PNG is the YouTube cover. Beside it we keep a
 * JPEG under 30 KB, named like the PNG with `-id.jpg`, only to recognize it.
 */
export function lightCoverUrl(args: {
  channelId: string;
  thumbnailRef?: string | null;
  youtubeVideoId?: string | null;
}): string | null {
  if (args.youtubeVideoId) {
    return `https://i.ytimg.com/vi/${args.youtubeVideoId}/mqdefault.jpg`;
  }
  const raw = mediaUrl(args.channelId, args.thumbnailRef);
  if (raw && /\.png(?=$|\?)/i.test(raw)) {
    return raw.replace(/\.png(?=$|\?)/i, "-id.jpg");
  }
  return raw;
}
