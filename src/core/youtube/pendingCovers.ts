import fs from "fs";
import path from "path";
import { getDb } from "../db";
import { getBook, getChapter, patchChapter } from "../repo/books";
import { getVideoProject } from "../repo/projects";
import { insertUsageEvent } from "../repo/usage";
import { ensureLocalFile } from "../storage";
import { getSupabase, isSupabaseEnabled } from "../supabaseClient";
import { freshLog, markPart, packMessage, readLog } from "../audiobook/chapterLog";
import { setVideoThumbnail, studioEditUrl } from "./upload";
import { isYoutubeQuotaError, YOUTUBE_THUMBNAIL_POINTS } from "./quota";

const LOOKBACK = 400;

type UsageRow = {
  channel_id: string;
  video_project_id: string | null;
  raw_usage: unknown;
  created_at: string;
};

export type PendingCoverResult = {
  attached: number;
  stillPending: number;
  skipped: number;
  stopped: "done" | "quota";
};

/**
 * Attach covers that were painted but not accepted because the 10,000-point
 * pool was empty. Video uploads are not retried here: they have their own
 * bucket of 100 a day and already went up. Vercel calls this after the pool
 * resets, so it runs with the computer off.
 */
export async function retryPendingCovers(limit = 40): Promise<PendingCoverResult> {
  const result: PendingCoverResult = { attached: 0, stillPending: 0, skipped: 0, stopped: "done" };
  const projects = await pendingProjectCovers();
  const chapters = await pendingChapterCovers();
  const jobs = [
    ...projects.map((item) => ({ kind: "project" as const, item })),
    ...chapters.map((item) => ({ kind: "chapter" as const, item })),
  ].slice(0, limit);
  result.stillPending = projects.length + chapters.length;

  for (const job of jobs) {
    if (result.attached + result.skipped >= limit) break;
    try {
      if (job.kind === "project") await attachProjectCover(job.item);
      else await attachChapterCover(job.item);
      result.attached += 1;
      result.stillPending -= 1;
    } catch (err) {
      if (isYoutubeQuotaError(err)) {
        result.stopped = "quota";
        return result;
      }
      result.skipped += 1;
      result.stillPending -= 1;
      console.warn(
        "[covers]",
        job.kind,
        job.kind === "project" ? job.item.projectId : job.item.chapterId,
        err instanceof Error ? err.message : err
      );
    }
  }
  return result;
}

async function attachProjectCover(item: { channelId: string; projectId: string; videoId: string }): Promise<void> {
  const project = await getVideoProject(item.projectId);
  if (!project?.thumbnailRef) throw new Error("Sem ficheiro de portada");
  const thumbLocal = await ensureLocalFile(
    item.channelId,
    project.thumbnailRef,
    `yt-thumb-${project.id}${path.extname(project.thumbnailRef) || ".jpg"}`
  );
  const raw = fs.readFileSync(thumbLocal);
  const mime = /\.png$/i.test(thumbLocal) ? "image/png" : "image/jpeg";
  await setVideoThumbnail({
    channelId: item.channelId,
    videoId: item.videoId,
    buffer: raw,
    mimeType: mime,
  });
  await insertUsageEvent({
    channelId: item.channelId,
    contentIdeaId: project.contentIdeaId,
    videoProjectId: project.id,
    stage: "youtube",
    snapshot: {
      provider: "youtube",
      model: "data-api-v3",
      quotaUnits: YOUTUBE_THUMBNAIL_POINTS,
      raw: {
        videoId: item.videoId,
        thumbnailOk: true,
        attachedLater: true,
        privacyStatus: "private",
      },
    },
  });
}

async function attachChapterCover(item: {
  chapterId: string;
  channelId: string;
  videoId: string;
  thumbPath: string;
}): Promise<void> {
  const thumbLocal = await ensureLocalFile(
    item.channelId,
    item.thumbPath,
    `yt-thumb-${item.chapterId}${path.extname(item.thumbPath) || ".jpg"}`
  );
  const raw = fs.readFileSync(thumbLocal);
  const mime = /\.png$/i.test(thumbLocal) ? "image/png" : "image/jpeg";
  await setVideoThumbnail({
    channelId: item.channelId,
    videoId: item.videoId,
    buffer: raw,
    mimeType: mime,
  });
  const chapter = await getChapter(item.chapterId);
  const log = markPart(
    markPart(readLog(chapter?.errorMessage) ?? freshLog(), "cover", {
      percent: 100,
      detail: "No YouTube",
      done: true,
    }),
    "youtube",
    { percent: 100, detail: "Privado", done: true }
  );
  await patchChapter(item.chapterId, {
    status: "uploaded",
    youtubeVideoId: item.videoId,
    youtubeUrl: studioEditUrl(item.videoId),
    errorMessage: packMessage("No YouTube (privado). Portada enviada.", log),
  });
}

async function pendingProjectCovers(): Promise<Array<{ channelId: string; projectId: string; videoId: string }>> {
  const rows = await recentYoutubeEvents();
  const seen = new Set<string>();
  const pending: Array<{ channelId: string; projectId: string; videoId: string }> = [];
  for (const row of rows) {
    const raw = parseRaw(row.raw_usage);
    const videoId = typeof raw.videoId === "string" ? raw.videoId : "";
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    if (raw.thumbnailOk !== false || !row.video_project_id || !row.channel_id) continue;
    pending.push({ channelId: row.channel_id, projectId: row.video_project_id, videoId });
  }
  return pending;
}

async function pendingChapterCovers(): Promise<
  Array<{ chapterId: string; channelId: string; videoId: string; thumbPath: string }>
> {
  const rows = await chaptersWaitingForCover();
  const pending = [];
  for (const row of rows) {
    if (!row.youtube_video_id || !row.thumb_path) continue;
    const book = await getBook(row.book_id);
    if (!book) continue;
    pending.push({
      chapterId: row.id,
      channelId: book.channelId,
      videoId: row.youtube_video_id,
      thumbPath: row.thumb_path,
    });
  }
  return pending;
}

async function recentYoutubeEvents(): Promise<UsageRow[]> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("usage_events")
      .select("channel_id, video_project_id, raw_usage, created_at")
      .eq("stage", "youtube")
      .order("created_at", { ascending: false })
      .limit(LOOKBACK);
    if (res.error) throw new Error(res.error.message);
    return (res.data ?? []) as UsageRow[];
  }
  return getDb()
    .prepare(
      `SELECT channel_id, video_project_id, raw_usage, created_at
       FROM usage_events WHERE stage = 'youtube'
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(LOOKBACK) as UsageRow[];
}

async function chaptersWaitingForCover(): Promise<
  Array<{ id: string; book_id: string; youtube_video_id: string | null; thumb_path: string | null }>
> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("chapters")
      .select("id, book_id, youtube_video_id, thumb_path")
      .eq("status", "thumb_ready")
      .not("youtube_video_id", "is", null)
      .limit(80);
    if (res.error) throw new Error(res.error.message);
    return res.data ?? [];
  }
  return getDb()
    .prepare(
      `SELECT id, book_id, youtube_video_id, thumb_path FROM chapters
       WHERE status = 'thumb_ready' AND youtube_video_id IS NOT NULL LIMIT 80`
    )
    .all() as Array<{ id: string; book_id: string; youtube_video_id: string | null; thumb_path: string | null }>;
}

function parseRaw(raw: unknown): { videoId?: string; thumbnailOk?: boolean } {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as { videoId?: string; thumbnailOk?: boolean };
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as { videoId?: string; thumbnailOk?: boolean };
  return {};
}
