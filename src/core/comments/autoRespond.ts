import type { Channel } from "../types";
import { normalizeCommentAutomation } from "./defaults";
import { classifyComment } from "./classify";
import { pickReplyText } from "./replyBank";
import { replyToComment } from "./reply";
import { isQuotaError } from "./sync";
import {
  createCommentRun,
  getCommentRun,
  listPendingForAuto,
  patchCommentRun,
  updateCommentState,
} from "../repo/youtubeComments";
import type { CommentRunLogEntry, YoutubeCommentRun } from "./types";

export type AutoRespondOptions = {
  channel: Channel;
  maxItems: number;
  dryRun: boolean;
  /** Override DNA flags for this run */
  skipDelicate?: boolean;
  varyResponses?: boolean;
  skipAlreadyAnswered?: boolean;
  /** If provided, continue an existing run (for stop polling). */
  runId?: string;
};

/**
 * Process up to maxItems pending comments with local rules (no LLM by default).
 * Concurrency = 1 (safe for YouTube quota). Checks stop_requested between items.
 */
export async function runAutoRespond(args: AutoRespondOptions): Promise<YoutubeCommentRun> {
  const cfg = normalizeCommentAutomation(args.channel.dna.commentAutomation);
  const skipDelicate = args.skipDelicate ?? cfg.skipDelicate;
  const vary = args.varyResponses ?? cfg.varyResponses;
  const skipAnswered = args.skipAlreadyAnswered ?? cfg.skipAlreadyAnswered;

  let run =
    (args.runId ? await getCommentRun(args.runId) : null) ??
    (await createCommentRun({
      channelId: args.channel.id,
      dryRun: args.dryRun,
      maxItems: args.maxItems,
    }));

  const pending = await listPendingForAuto(args.channel.id, args.maxItems);
  const log: CommentRunLogEntry[] = [...run.log];
  let answered = run.answered;
  let skipped = run.skipped;
  let needsReview = run.needsReview;
  let errors = run.errors;
  let processed = run.processed;

  for (const comment of pending) {
    // Re-read stop flag
    const live = await getCommentRun(run.id);
    if (live?.stopRequested) {
      await patchCommentRun(run.id, {
        status: "stopped",
        processed,
        answered,
        skipped,
        needsReview,
        errors,
        log,
        finishedAt: new Date().toISOString(),
      });
      return (await getCommentRun(run.id))!;
    }

    if (skipAnswered && (comment.status === "answered" || comment.ourReplyId)) {
      skipped += 1;
      processed += 1;
      log.push({
        at: new Date().toISOString(),
        youtubeCommentId: comment.youtubeCommentId,
        authorName: comment.authorName,
        action: "skipped",
        message: "already_answered",
      });
      continue;
    }

    const classified = classifyComment(comment.commentText);
    await updateCommentState(comment.id, { category: classified.category });

    if (classified.needsReview || classified.category === "REVIEW_REQUIRED") {
      if (skipDelicate) {
        await updateCommentState(comment.id, {
          status: "needs_review",
          category: "REVIEW_REQUIRED",
          processedAt: new Date().toISOString(),
          errorMessage: classified.reviewReason,
        });
        needsReview += 1;
        processed += 1;
        log.push({
          at: new Date().toISOString(),
          youtubeCommentId: comment.youtubeCommentId,
          authorName: comment.authorName,
          action: "needs_review",
          category: "REVIEW_REQUIRED",
          message: classified.reviewReason,
        });
        continue;
      }
    }

    const replyText = pickReplyText({
      channelId: args.channel.id,
      category: classified.category === "REVIEW_REQUIRED" ? "GENERIC" : classified.category,
      customSets: cfg.responseSets,
      vary,
    });

    if (!replyText) {
      await updateCommentState(comment.id, {
        status: "needs_review",
        processedAt: new Date().toISOString(),
        errorMessage: "no_template",
      });
      needsReview += 1;
      processed += 1;
      log.push({
        at: new Date().toISOString(),
        youtubeCommentId: comment.youtubeCommentId,
        authorName: comment.authorName,
        action: "needs_review",
        category: classified.category,
        message: "no_template",
      });
      continue;
    }

    if (args.dryRun) {
      answered += 1;
      processed += 1;
      log.push({
        at: new Date().toISOString(),
        youtubeCommentId: comment.youtubeCommentId,
        authorName: comment.authorName,
        action: "dry_run",
        category: classified.category,
        replyText,
      });
      await patchCommentRun(run.id, {
        processed,
        answered,
        skipped,
        needsReview,
        errors,
        log: log.slice(-200),
      });
      continue;
    }

    try {
      const result = await replyToComment({
        channelId: args.channel.id,
        commentId: comment.id,
        replyText,
        dryRun: false,
      });

      if (result.ok) {
        await updateCommentState(comment.id, { category: classified.category });
        answered += 1;
        processed += 1;
        log.push({
          at: new Date().toISOString(),
          youtubeCommentId: comment.youtubeCommentId,
          authorName: comment.authorName,
          action: "answered",
          category: classified.category,
          replyText: result.replyText,
        });
      } else if (result.quota) {
        errors += 1;
        processed += 1;
        log.push({
          at: new Date().toISOString(),
          youtubeCommentId: comment.youtubeCommentId,
          authorName: comment.authorName,
          action: "error",
          message: result.error,
        });
        await patchCommentRun(run.id, {
          status: "quota_stopped",
          processed,
          answered,
          skipped,
          needsReview,
          errors,
          log: log.slice(-200),
          errorMessage: "Automatización detenida por límite de YouTube.",
          finishedAt: new Date().toISOString(),
        });
        return (await getCommentRun(run.id))!;
      } else {
        errors += 1;
        processed += 1;
        log.push({
          at: new Date().toISOString(),
          youtubeCommentId: comment.youtubeCommentId,
          authorName: comment.authorName,
          action: "error",
          message: result.error,
        });
      }
    } catch (err) {
      if (isQuotaError(err)) {
        errors += 1;
        await patchCommentRun(run.id, {
          status: "quota_stopped",
          processed: processed + 1,
          answered,
          skipped,
          needsReview,
          errors,
          log: log.slice(-200),
          errorMessage: "Automatización detenida por límite de YouTube.",
          finishedAt: new Date().toISOString(),
        });
        return (await getCommentRun(run.id))!;
      }
      errors += 1;
      processed += 1;
      log.push({
        at: new Date().toISOString(),
        youtubeCommentId: comment.youtubeCommentId,
        authorName: comment.authorName,
        action: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }

    await patchCommentRun(run.id, {
      processed,
      answered,
      skipped,
      needsReview,
      errors,
      log: log.slice(-200),
    });

    // Jitter between replies
    await sleep(350 + Math.floor(Math.random() * 400));
  }

  await patchCommentRun(run.id, {
    status: "completed",
    processed,
    answered,
    skipped,
    needsReview,
    errors,
    log: log.slice(-200),
    finishedAt: new Date().toISOString(),
  });
  return (await getCommentRun(run.id))!;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
