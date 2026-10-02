import { randomUUID } from "crypto";
import { getDb } from "../db";
import { getSupabase, isSupabaseEnabled, assertNoError } from "../supabaseClient";
import type {
  CommentCategory,
  CommentRunLogEntry,
  CommentStatus,
  YoutubeCommentRow,
  YoutubeCommentRun,
} from "../comments/types";

interface CommentDbRow {
  id: string;
  channel_id: string;
  youtube_comment_id: string;
  youtube_thread_id: string;
  video_id: string;
  video_title: string | null;
  author_name: string | null;
  author_channel_id: string | null;
  author_profile_image_url: string | null;
  comment_text: string;
  published_at: string | null;
  updated_at_yt: string | null;
  like_count: number;
  reply_count: number;
  our_reply_id: string | null;
  our_reply_text: string | null;
  category: string | null;
  status: string;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RunDbRow {
  id: string;
  channel_id: string;
  status: string;
  dry_run: number | boolean;
  max_items: number;
  processed: number;
  answered: number;
  skipped: number;
  needs_review: number;
  errors: number;
  stop_requested: number | boolean;
  log_json: string | unknown;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

function rowToComment(row: CommentDbRow): YoutubeCommentRow {
  return {
    id: row.id,
    channelId: row.channel_id,
    youtubeCommentId: row.youtube_comment_id,
    youtubeThreadId: row.youtube_thread_id,
    videoId: row.video_id,
    videoTitle: row.video_title,
    authorName: row.author_name,
    authorChannelId: row.author_channel_id,
    authorProfileImageUrl: row.author_profile_image_url,
    commentText: row.comment_text,
    publishedAt: row.published_at,
    updatedAtYt: row.updated_at_yt,
    likeCount: Number(row.like_count) || 0,
    replyCount: Number(row.reply_count) || 0,
    ourReplyId: row.our_reply_id,
    ourReplyText: row.our_reply_text,
    category: (row.category as CommentCategory) || null,
    status: row.status as CommentStatus,
    errorMessage: row.error_message,
    processedAt: row.processed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseLog(raw: string | unknown): CommentRunLogEntry[] {
  if (Array.isArray(raw)) return raw as CommentRunLogEntry[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToRun(row: RunDbRow): YoutubeCommentRun {
  return {
    id: row.id,
    channelId: row.channel_id,
    status: row.status as YoutubeCommentRun["status"],
    dryRun: Boolean(row.dry_run),
    maxItems: Number(row.max_items) || 0,
    processed: Number(row.processed) || 0,
    answered: Number(row.answered) || 0,
    skipped: Number(row.skipped) || 0,
    needsReview: Number(row.needs_review) || 0,
    errors: Number(row.errors) || 0,
    stopRequested: Boolean(row.stop_requested),
    log: parseLog(row.log_json),
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export async function upsertYoutubeComment(input: {
  channelId: string;
  youtubeCommentId: string;
  youtubeThreadId: string;
  videoId: string;
  videoTitle?: string | null;
  authorName?: string | null;
  authorChannelId?: string | null;
  authorProfileImageUrl?: string | null;
  commentText: string;
  publishedAt?: string | null;
  updatedAtYt?: string | null;
  likeCount?: number;
  replyCount?: number;
  /** If YouTube already shows our channel replied, mark answered. */
  ourReplyId?: string | null;
  ourReplyText?: string | null;
  status?: CommentStatus;
}): Promise<YoutubeCommentRow> {
  const now = new Date().toISOString();
  const existing = await getCommentByYoutubeId(input.channelId, input.youtubeCommentId);

  // Never downgrade answered → pending; never wipe our reply.
  let status = input.status ?? existing?.status ?? "pending";
  let ourReplyId = existing?.ourReplyId ?? null;
  let ourReplyText = existing?.ourReplyText ?? null;
  let processedAt = existing?.processedAt ?? null;
  let category = existing?.category ?? null;

  if (input.ourReplyId) {
    ourReplyId = input.ourReplyId;
    ourReplyText = input.ourReplyText ?? ourReplyText;
    status = "answered";
    processedAt = processedAt || now;
  } else if (existing?.status === "answered" || existing?.ourReplyId) {
    status = "answered";
    ourReplyId = existing.ourReplyId;
    ourReplyText = existing.ourReplyText;
  }

  const id = existing?.id ?? randomUUID();

  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase().from("youtube_comments").upsert({
        id,
        channel_id: input.channelId,
        youtube_comment_id: input.youtubeCommentId,
        youtube_thread_id: input.youtubeThreadId,
        video_id: input.videoId,
        video_title: input.videoTitle ?? existing?.videoTitle ?? null,
        author_name: input.authorName ?? existing?.authorName ?? null,
        author_channel_id: input.authorChannelId ?? existing?.authorChannelId ?? null,
        author_profile_image_url:
          input.authorProfileImageUrl ?? existing?.authorProfileImageUrl ?? null,
        comment_text: input.commentText,
        published_at: input.publishedAt ?? existing?.publishedAt ?? null,
        updated_at_yt: input.updatedAtYt ?? existing?.updatedAtYt ?? null,
        like_count: input.likeCount ?? existing?.likeCount ?? 0,
        reply_count: input.replyCount ?? existing?.replyCount ?? 0,
        our_reply_id: ourReplyId,
        our_reply_text: ourReplyText,
        category,
        status,
        error_message: existing?.errorMessage ?? null,
        processed_at: processedAt,
        created_at: existing?.createdAt ?? now,
        updated_at: now,
      })
    );
    return (await getCommentById(id))!;
  }

  getDb()
    .prepare(
      `INSERT INTO youtube_comments (
        id, channel_id, youtube_comment_id, youtube_thread_id, video_id, video_title,
        author_name, author_channel_id, author_profile_image_url, comment_text,
        published_at, updated_at_yt, like_count, reply_count,
        our_reply_id, our_reply_text, category, status, error_message, processed_at,
        created_at, updated_at
      ) VALUES (
        @id, @channelId, @youtubeCommentId, @youtubeThreadId, @videoId, @videoTitle,
        @authorName, @authorChannelId, @authorProfileImageUrl, @commentText,
        @publishedAt, @updatedAtYt, @likeCount, @replyCount,
        @ourReplyId, @ourReplyText, @category, @status, @errorMessage, @processedAt,
        @createdAt, @updatedAt
      )
      ON CONFLICT(channel_id, youtube_comment_id) DO UPDATE SET
        youtube_thread_id = excluded.youtube_thread_id,
        video_id = excluded.video_id,
        video_title = COALESCE(excluded.video_title, youtube_comments.video_title),
        author_name = COALESCE(excluded.author_name, youtube_comments.author_name),
        author_channel_id = COALESCE(excluded.author_channel_id, youtube_comments.author_channel_id),
        author_profile_image_url = COALESCE(excluded.author_profile_image_url, youtube_comments.author_profile_image_url),
        comment_text = excluded.comment_text,
        published_at = COALESCE(excluded.published_at, youtube_comments.published_at),
        updated_at_yt = excluded.updated_at_yt,
        like_count = excluded.like_count,
        reply_count = excluded.reply_count,
        our_reply_id = COALESCE(excluded.our_reply_id, youtube_comments.our_reply_id),
        our_reply_text = COALESCE(excluded.our_reply_text, youtube_comments.our_reply_text),
        status = CASE
          WHEN youtube_comments.status = 'answered' OR youtube_comments.our_reply_id IS NOT NULL THEN 'answered'
          ELSE excluded.status
        END,
        updated_at = excluded.updated_at`
    )
    .run({
      id,
      channelId: input.channelId,
      youtubeCommentId: input.youtubeCommentId,
      youtubeThreadId: input.youtubeThreadId,
      videoId: input.videoId,
      videoTitle: input.videoTitle ?? null,
      authorName: input.authorName ?? null,
      authorChannelId: input.authorChannelId ?? null,
      authorProfileImageUrl: input.authorProfileImageUrl ?? null,
      commentText: input.commentText,
      publishedAt: input.publishedAt ?? null,
      updatedAtYt: input.updatedAtYt ?? null,
      likeCount: input.likeCount ?? 0,
      replyCount: input.replyCount ?? 0,
      ourReplyId,
      ourReplyText,
      category,
      status,
      errorMessage: existing?.errorMessage ?? null,
      processedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

  return (await getCommentByYoutubeId(input.channelId, input.youtubeCommentId))!;
}

/** One read plus one write for a page of comments. Keeps answered rows answered. */
export async function upsertYoutubeCommentsBatch(
  inputs: Array<Parameters<typeof upsertYoutubeComment>[0]>
): Promise<number> {
  if (inputs.length === 0) return 0;
  if (!isSupabaseEnabled()) {
    for (const input of inputs) await upsertYoutubeComment(input);
    return inputs.length;
  }

  const channelId = inputs[0].channelId;
  const ids = inputs.map((input) => input.youtubeCommentId);
  const existingRows = (assertNoError(
    await getSupabase()
      .from("youtube_comments")
      .select("*")
      .eq("channel_id", channelId)
      .in("youtube_comment_id", ids)
  ) ?? []) as CommentDbRow[];
  const byYt = new Map(existingRows.map((row) => [row.youtube_comment_id, row]));
  const now = new Date().toISOString();

  const payload = inputs.map((input) => {
    const existing = byYt.get(input.youtubeCommentId);
    let status = input.status ?? existing?.status ?? "pending";
    let ourReplyId = existing?.our_reply_id ?? null;
    let ourReplyText = existing?.our_reply_text ?? null;
    let processedAt = existing?.processed_at ?? null;

    if (input.ourReplyId) {
      ourReplyId = input.ourReplyId;
      ourReplyText = input.ourReplyText ?? ourReplyText;
      status = "answered";
      processedAt = processedAt || now;
    } else if (existing?.status === "answered" || existing?.our_reply_id) {
      status = "answered";
      ourReplyId = existing.our_reply_id;
      ourReplyText = existing.our_reply_text;
    }

    return {
      id: existing?.id ?? randomUUID(),
      channel_id: input.channelId,
      youtube_comment_id: input.youtubeCommentId,
      youtube_thread_id: input.youtubeThreadId,
      video_id: input.videoId,
      video_title: input.videoTitle ?? existing?.video_title ?? null,
      author_name: input.authorName ?? existing?.author_name ?? null,
      author_channel_id: input.authorChannelId ?? existing?.author_channel_id ?? null,
      author_profile_image_url:
        input.authorProfileImageUrl ?? existing?.author_profile_image_url ?? null,
      comment_text: input.commentText,
      published_at: input.publishedAt ?? existing?.published_at ?? null,
      updated_at_yt: input.updatedAtYt ?? existing?.updated_at_yt ?? null,
      like_count: input.likeCount ?? existing?.like_count ?? 0,
      reply_count: input.replyCount ?? existing?.reply_count ?? 0,
      our_reply_id: ourReplyId,
      our_reply_text: ourReplyText,
      category: existing?.category ?? null,
      status,
      error_message: existing?.error_message ?? null,
      processed_at: processedAt,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
  });

  assertNoError(await getSupabase().from("youtube_comments").upsert(payload));
  return payload.length;
}

export async function getCommentById(id: string): Promise<YoutubeCommentRow | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("youtube_comments").select("*").eq("id", id).maybeSingle();
    const row = assertNoError(res);
    return row ? rowToComment(row as CommentDbRow) : null;
  }
  const row = getDb().prepare(`SELECT * FROM youtube_comments WHERE id = ?`).get(id) as
    | CommentDbRow
    | undefined;
  return row ? rowToComment(row) : null;
}

export async function getCommentByYoutubeId(
  channelId: string,
  youtubeCommentId: string
): Promise<YoutubeCommentRow | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("youtube_comments")
      .select("*")
      .eq("channel_id", channelId)
      .eq("youtube_comment_id", youtubeCommentId)
      .maybeSingle();
    const row = assertNoError(res);
    return row ? rowToComment(row as CommentDbRow) : null;
  }
  const row = getDb()
    .prepare(`SELECT * FROM youtube_comments WHERE channel_id = ? AND youtube_comment_id = ?`)
    .get(channelId, youtubeCommentId) as CommentDbRow | undefined;
  return row ? rowToComment(row) : null;
}

export async function listCommentsForChannel(args: {
  channelId: string;
  status?: CommentStatus | "all";
  limit?: number;
  offset?: number;
}): Promise<YoutubeCommentRow[]> {
  const limit = Math.min(200, Math.max(1, args.limit ?? 50));
  const offset = Math.max(0, args.offset ?? 0);
  const status = args.status && args.status !== "all" ? args.status : null;

  if (isSupabaseEnabled()) {
    let q = getSupabase()
      .from("youtube_comments")
      .select("*")
      .eq("channel_id", args.channelId)
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (status) q = q.eq("status", status);
    const res = await q;
    const rows = assertNoError(res) as CommentDbRow[] | null;
    return (rows ?? []).map(rowToComment);
  }

  if (status) {
    const rows = getDb()
      .prepare(
        `SELECT * FROM youtube_comments WHERE channel_id = ? AND status = ?
         ORDER BY COALESCE(published_at, created_at) DESC LIMIT ? OFFSET ?`
      )
      .all(args.channelId, status, limit, offset) as CommentDbRow[];
    return rows.map(rowToComment);
  }
  const rows = getDb()
    .prepare(
      `SELECT * FROM youtube_comments WHERE channel_id = ?
       ORDER BY COALESCE(published_at, created_at) DESC LIMIT ? OFFSET ?`
    )
    .all(args.channelId, limit, offset) as CommentDbRow[];
  return rows.map(rowToComment);
}

export async function countCommentsByStatus(
  channelId: string
): Promise<Record<CommentStatus, number>> {
  const empty: Record<CommentStatus, number> = {
    pending: 0,
    answered: 0,
    skipped: 0,
    needs_review: 0,
    error: 0,
  };
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("youtube_comments")
      .select("status")
      .eq("channel_id", channelId);
    const rows = assertNoError(res) as Array<{ status: string }> | null;
    for (const r of rows ?? []) {
      if (r.status in empty) empty[r.status as CommentStatus] += 1;
    }
    return empty;
  }
  const rows = getDb()
    .prepare(`SELECT status, COUNT(*) as c FROM youtube_comments WHERE channel_id = ? GROUP BY status`)
    .all(channelId) as Array<{ status: string; c: number }>;
  for (const r of rows) {
    if (r.status in empty) empty[r.status as CommentStatus] = Number(r.c) || 0;
  }
  return empty;
}

export async function updateCommentState(
  id: string,
  patch: Partial<{
    status: CommentStatus;
    category: CommentCategory | null;
    ourReplyId: string | null;
    ourReplyText: string | null;
    errorMessage: string | null;
    processedAt: string | null;
  }>
): Promise<YoutubeCommentRow | null> {
  const existing = await getCommentById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next = {
    status: patch.status ?? existing.status,
    category: patch.category !== undefined ? patch.category : existing.category,
    ourReplyId: patch.ourReplyId !== undefined ? patch.ourReplyId : existing.ourReplyId,
    ourReplyText: patch.ourReplyText !== undefined ? patch.ourReplyText : existing.ourReplyText,
    errorMessage: patch.errorMessage !== undefined ? patch.errorMessage : existing.errorMessage,
    processedAt: patch.processedAt !== undefined ? patch.processedAt : existing.processedAt,
  };

  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("youtube_comments")
        .update({
          status: next.status,
          category: next.category,
          our_reply_id: next.ourReplyId,
          our_reply_text: next.ourReplyText,
          error_message: next.errorMessage,
          processed_at: next.processedAt,
          updated_at: now,
        })
        .eq("id", id)
    );
    return getCommentById(id);
  }

  getDb()
    .prepare(
      `UPDATE youtube_comments SET
        status = ?, category = ?, our_reply_id = ?, our_reply_text = ?,
        error_message = ?, processed_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      next.status,
      next.category,
      next.ourReplyId,
      next.ourReplyText,
      next.errorMessage,
      next.processedAt,
      now,
      id
    );
  return getCommentById(id);
}

export async function listPendingForAuto(
  channelId: string,
  limit: number
): Promise<YoutubeCommentRow[]> {
  return listCommentsForChannel({ channelId, status: "pending", limit });
}

export async function createCommentRun(input: {
  channelId: string;
  dryRun: boolean;
  maxItems: number;
}): Promise<YoutubeCommentRun> {
  const id = randomUUID();
  const now = new Date().toISOString();
  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase().from("youtube_comment_runs").insert({
        id,
        channel_id: input.channelId,
        status: "running",
        dry_run: input.dryRun,
        max_items: input.maxItems,
        processed: 0,
        answered: 0,
        skipped: 0,
        needs_review: 0,
        errors: 0,
        stop_requested: false,
        log_json: [],
        started_at: now,
      })
    );
    return (await getCommentRun(id))!;
  }
  getDb()
    .prepare(
      `INSERT INTO youtube_comment_runs (
        id, channel_id, status, dry_run, max_items, processed, answered, skipped,
        needs_review, errors, stop_requested, log_json, error_message, started_at, finished_at
      ) VALUES (?, ?, 'running', ?, ?, 0, 0, 0, 0, 0, 0, '[]', NULL, ?, NULL)`
    )
    .run(id, input.channelId, input.dryRun ? 1 : 0, input.maxItems, now);
  return (await getCommentRun(id))!;
}

export async function getCommentRun(id: string): Promise<YoutubeCommentRun | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("youtube_comment_runs").select("*").eq("id", id).maybeSingle();
    const row = assertNoError(res);
    return row ? rowToRun(row as RunDbRow) : null;
  }
  const row = getDb().prepare(`SELECT * FROM youtube_comment_runs WHERE id = ?`).get(id) as
    | RunDbRow
    | undefined;
  return row ? rowToRun(row) : null;
}

export async function getLatestCommentRun(channelId: string): Promise<YoutubeCommentRun | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("youtube_comment_runs")
      .select("*")
      .eq("channel_id", channelId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = assertNoError(res);
    return row ? rowToRun(row as RunDbRow) : null;
  }
  const row = getDb()
    .prepare(
      `SELECT * FROM youtube_comment_runs WHERE channel_id = ? ORDER BY started_at DESC LIMIT 1`
    )
    .get(channelId) as RunDbRow | undefined;
  return row ? rowToRun(row) : null;
}

export async function requestStopCommentRun(id: string): Promise<void> {
  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase().from("youtube_comment_runs").update({ stop_requested: true }).eq("id", id)
    );
    return;
  }
  getDb().prepare(`UPDATE youtube_comment_runs SET stop_requested = 1 WHERE id = ?`).run(id);
}

export async function patchCommentRun(
  id: string,
  patch: Partial<{
    status: YoutubeCommentRun["status"];
    processed: number;
    answered: number;
    skipped: number;
    needsReview: number;
    errors: number;
    log: CommentRunLogEntry[];
    errorMessage: string | null;
    finishedAt: string | null;
  }>
): Promise<YoutubeCommentRun | null> {
  const existing = await getCommentRun(id);
  if (!existing) return null;
  const next = {
    status: patch.status ?? existing.status,
    processed: patch.processed ?? existing.processed,
    answered: patch.answered ?? existing.answered,
    skipped: patch.skipped ?? existing.skipped,
    needsReview: patch.needsReview ?? existing.needsReview,
    errors: patch.errors ?? existing.errors,
    log: patch.log ?? existing.log,
    errorMessage: patch.errorMessage !== undefined ? patch.errorMessage : existing.errorMessage,
    finishedAt: patch.finishedAt !== undefined ? patch.finishedAt : existing.finishedAt,
  };

  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("youtube_comment_runs")
        .update({
          status: next.status,
          processed: next.processed,
          answered: next.answered,
          skipped: next.skipped,
          needs_review: next.needsReview,
          errors: next.errors,
          log_json: next.log,
          error_message: next.errorMessage,
          finished_at: next.finishedAt,
        })
        .eq("id", id)
    );
    return getCommentRun(id);
  }

  getDb()
    .prepare(
      `UPDATE youtube_comment_runs SET
        status = ?, processed = ?, answered = ?, skipped = ?, needs_review = ?,
        errors = ?, log_json = ?, error_message = ?, finished_at = ?
       WHERE id = ?`
    )
    .run(
      next.status,
      next.processed,
      next.answered,
      next.skipped,
      next.needsReview,
      next.errors,
      JSON.stringify(next.log),
      next.errorMessage,
      next.finishedAt,
      id
    );
  return getCommentRun(id);
}
