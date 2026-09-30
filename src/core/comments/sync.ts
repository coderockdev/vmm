import { getYoutubeClientForChannel } from "../youtube/client";
import { YoutubeQuotaError, mapYoutubeApiError } from "../youtube/oauth";
import { upsertYoutubeComment } from "../repo/youtubeComments";
import { getYoutubeAccountForChannel } from "../repo/youtubeAccounts";

type ThreadItem = {
  id?: string | null;
  snippet?: {
    topLevelComment?: {
      id?: string | null;
      snippet?: {
        videoId?: string | null;
        textDisplay?: string | null;
        textOriginal?: string | null;
        authorDisplayName?: string | null;
        authorChannelId?: { value?: string | null } | null;
        authorProfileImageUrl?: string | null;
        publishedAt?: string | null;
        updatedAt?: string | null;
        likeCount?: number | null;
      } | null;
    } | null;
    videoId?: string | null;
    totalReplyCount?: number | null;
  } | null;
  replies?: {
    comments?: Array<{
      id?: string | null;
      snippet?: {
        textOriginal?: string | null;
        authorChannelId?: { value?: string | null } | null;
        authorDisplayName?: string | null;
      } | null;
    }>;
  } | null;
};

export type SyncCommentsResult = {
  imported: number;
  pages: number;
  alreadyAnsweredOnYt: number;
};

/**
 * Import comment threads for the connected YouTube channel.
 * Idempotent upsert by youtube_comment_id.
 */
export async function syncChannelComments(args: {
  channelId: string;
  /** Soft cap on pages (100 comments/page). Default 10 = up to 1000. */
  maxPages?: number;
}): Promise<SyncCommentsResult> {
  const account = await getYoutubeAccountForChannel(args.channelId);
  if (!account) throw new Error("YouTube no conectado para este canal.");

  const { youtube } = await getYoutubeClientForChannel(args.channelId);
  const maxPages = Math.min(50, Math.max(1, args.maxPages ?? 10));
  let pageToken: string | undefined;
  let imported = 0;
  let pages = 0;
  let alreadyAnsweredOnYt = 0;
  const ourYtChannelId = account.youtubeChannelId;

  for (let p = 0; p < maxPages; p++) {
    let res;
    try {
      res = await youtube.commentThreads.list({
        part: ["snippet", "replies"],
        allThreadsRelatedToChannelId: ourYtChannelId,
        maxResults: 100,
        textFormat: "plainText",
        order: "time",
        pageToken,
      });
    } catch (err) {
      throw mapYoutubeApiError(err);
    }

    pages += 1;
    const items = (res.data.items ?? []) as ThreadItem[];
    for (const item of items) {
      const top = item.snippet?.topLevelComment;
      const sn = top?.snippet;
      if (!top?.id || !sn) continue;

      const videoId = sn.videoId || item.snippet?.videoId || "";
      if (!videoId) continue;

      const replies = item.replies?.comments ?? [];
      const ourReply = replies.find(
        (r) => r.snippet?.authorChannelId?.value === ourYtChannelId
      );

      if (ourReply?.id) alreadyAnsweredOnYt += 1;

      await upsertYoutubeComment({
        channelId: args.channelId,
        youtubeCommentId: top.id,
        youtubeThreadId: item.id || top.id,
        videoId,
        videoTitle: null,
        authorName: sn.authorDisplayName ?? null,
        authorChannelId: sn.authorChannelId?.value ?? null,
        authorProfileImageUrl: sn.authorProfileImageUrl ?? null,
        commentText: sn.textOriginal || sn.textDisplay || "",
        publishedAt: sn.publishedAt ?? null,
        updatedAtYt: sn.updatedAt ?? null,
        likeCount: sn.likeCount ?? 0,
        replyCount: item.snippet?.totalReplyCount ?? replies.length,
        ourReplyId: ourReply?.id ?? null,
        ourReplyText: ourReply?.snippet?.textOriginal ?? null,
        status: ourReply?.id ? "answered" : "pending",
      });
      imported += 1;
    }

    pageToken = res.data.nextPageToken || undefined;
    if (!pageToken) break;

    // Gentle pause between pages
    await sleep(150 + Math.floor(Math.random() * 150));
  }

  return { imported, pages, alreadyAnsweredOnYt };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function isQuotaError(err: unknown): boolean {
  if (err instanceof YoutubeQuotaError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /quotaExceeded|rateLimitExceeded|quota/i.test(msg);
}
