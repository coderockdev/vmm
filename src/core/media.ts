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
 * Grid-sized preview. YouTube's own CDN is a few dozen KB; a stored cover is
 * the full 1536px file. Supabase image render is used only when the ref is a
 * public storage URL and there is no YouTube id.
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
  if (!raw) return null;
  const marker = "/storage/v1/object/public/";
  const at = raw.indexOf(marker);
  if (at === -1) return raw;
  const path = raw.slice(at + marker.length).split("?")[0];
  return `${raw.slice(0, at)}/storage/v1/render/image/public/${path}?width=320&quality=60`;
}
