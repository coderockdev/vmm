import { randomUUID } from "crypto";
import { getSupabase, isSupabaseEnabled } from "../../supabaseClient";
import {
  mergeThumbnailHistory,
  ThumbnailCandidate,
  ThumbnailStyleId,
  THUMBNAIL_STYLE_VARIANTS,
} from "./thumbnailStyles";
import type { VideoConcept } from "./coverFormats";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "media";

function styleFromFileName(name: string): { styleId: ThumbnailStyleId; styleLabel: string } {
  for (const style of THUMBNAIL_STYLE_VARIANTS) {
    if (name.includes(`-${style.id}-`) || name.includes(`-${style.id}.`)) {
      return { styleId: style.id, styleLabel: style.label };
    }
  }
  return { styleId: "cinematic", styleLabel: "Gerada" };
}

/**
 * List PNG thumbs in Storage for a video project (including legacy
 * `thumb-{id}.png` from before style suffixes).
 */
export async function listStoredThumbnailRefs(
  channelId: string,
  projectId: string
): Promise<Array<{ ref: string; name: string; createdAt: string }>> {
  if (!isSupabaseEnabled()) return [];
  const folder = `${channelId}/thumbnails`;
  const { data, error } = await getSupabase().storage.from(BUCKET).list(folder, {
    limit: 200,
    sortBy: { column: "created_at", order: "asc" },
  });
  if (error || !data) return [];

  const prefixA = `thumb-${projectId}`;
  const prefixB = `thumb-${projectId}-`;
  const out: Array<{ ref: string; name: string; createdAt: string }> = [];
  for (const file of data) {
    if (!file.name || !file.name.endsWith(".png")) continue;
    if (file.name !== `${prefixA}.png` && !file.name.startsWith(prefixB) && !file.name.startsWith(prefixA)) {
      continue;
    }
    // Skip JSON sidecars already filtered by .png
    const { data: pub } = getSupabase().storage.from(BUCKET).getPublicUrl(`${folder}/${file.name}`);
    out.push({
      ref: pub.publicUrl,
      name: file.name,
      createdAt: file.created_at || new Date(0).toISOString(),
    });
  }
  return out;
}

/** Build candidate entries for any storage files missing from concept.history. */
export function orphansToCandidates(
  stored: Array<{ ref: string; name: string; createdAt: string }>,
  known: ThumbnailCandidate[] | null | undefined
): ThumbnailCandidate[] {
  const knownRefs = new Set((known ?? []).map((c) => c.ref));
  const orphans: ThumbnailCandidate[] = [];
  for (const file of stored) {
    if (knownRefs.has(file.ref)) continue;
    const { styleId, styleLabel } = styleFromFileName(file.name);
    orphans.push({
      id: randomUUID(),
      styleId,
      styleLabel: knownRefs.size === 0 && orphans.length === 0 ? "Original" : styleLabel,
      ref: file.ref,
      createdAt: file.createdAt,
    });
  }
  return orphans;
}

/**
 * Merge Storage orphans into concept.history. Returns null if nothing changed.
 */
export async function recoverThumbnailHistory(args: {
  channelId: string;
  projectId: string;
  concept: VideoConcept | null;
  thumbnailRef?: string | null;
}): Promise<VideoConcept | null> {
  const stored = await listStoredThumbnailRefs(args.channelId, args.projectId);
  if (stored.length === 0) return null;

  const concept = args.concept ?? {
    title: "",
    thumbnailFormatId: "auto",
    thumbnailFormatName: "recovered",
    thumbnailText: "",
    thumbnailScene: "",
    thumbnailEmotion: "",
    thumbnailMessage: "",
    curiosityGap: "",
    titleThumbnailRelation: "",
    status: "generated" as const,
  };

  const known = mergeThumbnailHistory(concept.history, concept.candidates ?? []);
  if (args.thumbnailRef && !known.some((c) => c.ref === args.thumbnailRef)) {
    known.push({
      id: randomUUID(),
      styleId: "cinematic",
      styleLabel: "Principal",
      ref: args.thumbnailRef,
      createdAt: new Date(0).toISOString(),
    });
  }

  const orphans = orphansToCandidates(stored, known);
  if (orphans.length === 0) {
    // Still ensure history field is populated from candidates if missing.
    if ((concept.history?.length ?? 0) >= known.length && (concept.history?.length ?? 0) > 0) {
      return null;
    }
    if (known.length === 0) return null;
  }

  const history = mergeThumbnailHistory(known, orphans);
  const sameAsExisting =
    history.length === (concept.history?.length ?? 0) &&
    history.every((h, i) => h.ref === concept.history?.[i]?.ref);
  if (sameAsExisting) return null;

  return {
    ...concept,
    history,
    candidates: concept.candidates?.length ? concept.candidates : history.slice(-3),
    selectedCandidateIndex: concept.selectedCandidateIndex ?? 0,
    status: concept.status === "draft" || concept.status === "ready" ? "generated" : concept.status,
    updatedAt: new Date().toISOString(),
  };
}
