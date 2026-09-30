import { getYoutubeClientForChannel } from "../youtube/client";
import { mapYoutubeApiError } from "../youtube/oauth";
import {
  getCommentById,
  updateCommentState,
} from "../repo/youtubeComments";
import { getYoutubeAccountForChannel } from "../repo/youtubeAccounts";
import { isQuotaError } from "./sync";

export type ReplyResult =
  | { ok: true; replyId: string; replyText: string; dryRun: boolean }
  | { ok: false; error: string; quota: boolean };

/**
 * Post a reply via comments.insert. Idempotent: if already answered locally, no-op.
 */
export async function replyToComment(args: {
  channelId: string;
  commentId: string; // our DB id
  replyText: string;
  dryRun?: boolean;
  maxAttempts?: number;
}): Promise<ReplyResult> {
  const comment = await getCommentById(args.commentId);
  if (!comment || comment.channelId !== args.channelId) {
    return { ok: false, error: "Comentario no encontrado", quota: false };
  }

  if (comment.status === "answered" || comment.ourReplyId) {
    return {
      ok: true,
      replyId: comment.ourReplyId || "already",
      replyText: comment.ourReplyText || args.replyText,
      dryRun: Boolean(args.dryRun),
    };
  }

  const text = args.replyText.trim();
  if (!text) return { ok: false, error: "Respuesta vacía", quota: false };

  if (args.dryRun) {
    return { ok: true, replyId: "dry-run", replyText: text, dryRun: true };
  }

  const account = await getYoutubeAccountForChannel(args.channelId);
  if (!account) return { ok: false, error: "YouTube no conectado", quota: false };

  // Don't reply to ourselves
  if (comment.authorChannelId && comment.authorChannelId === account.youtubeChannelId) {
    await updateCommentState(comment.id, {
      status: "skipped",
      processedAt: new Date().toISOString(),
      errorMessage: "own_comment",
    });
    return { ok: false, error: "Comentario propio — omitido", quota: false };
  }

  const maxAttempts = Math.min(2, Math.max(1, args.maxAttempts ?? 2));
  let lastError = "unknown";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { youtube } = await getYoutubeClientForChannel(args.channelId);
      const res = await youtube.comments.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            parentId: comment.youtubeCommentId,
            textOriginal: text,
          },
        },
      });
      const replyId = res.data.id;
      if (!replyId) throw new Error("YouTube no devolvió reply id");

      await updateCommentState(comment.id, {
        status: "answered",
        ourReplyId: replyId,
        ourReplyText: text,
        errorMessage: null,
        processedAt: new Date().toISOString(),
      });

      return { ok: true, replyId, replyText: text, dryRun: false };
    } catch (err) {
      const mapped = mapYoutubeApiError(err);
      lastError = mapped.message;
      if (isQuotaError(mapped)) {
        await updateCommentState(comment.id, {
          status: "error",
          errorMessage: lastError.slice(0, 300),
        });
        return { ok: false, error: lastError, quota: true };
      }
      if (attempt < maxAttempts) {
        await sleep(400 * attempt + Math.floor(Math.random() * 200));
        continue;
      }
      await updateCommentState(comment.id, {
        status: "error",
        errorMessage: lastError.slice(0, 300),
        processedAt: new Date().toISOString(),
      });
      return { ok: false, error: lastError, quota: false };
    }
  }

  return { ok: false, error: lastError, quota: false };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
