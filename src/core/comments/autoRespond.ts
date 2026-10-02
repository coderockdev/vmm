import type { Channel } from "../types";
import { normalizeCommentAutomation } from "./defaults";
import { classifyComment } from "./classify";
import { draftPersonalReply, isSafetyReview, wantsPersonalReply } from "./personalReply";
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
  /** Short Gemini reply for personal or long comments. Templates stay for amen / thanks. */
  useAi?: boolean;
  /** If provided, continue an existing run (for stop polling). */
  runId?: string;
  /**
   * How many comments to touch in this request. The run's maxItems is the
   * whole goal; the platform kills a function that tries to do hundreds at once.
   */
  batchSize?: number;
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
  const useAi = args.useAi ?? cfg.aiEnabled;

  let run =
    (args.runId ? await getCommentRun(args.runId) : null) ??
    (await createCommentRun({
      channelId: args.channel.id,
      dryRun: args.dryRun,
      maxItems: args.maxItems,
    }));

  const log: CommentRunLogEntry[] = [...run.log];
  let answered = run.answered;
  let skipped = run.skipped;
  let needsReview = run.needsReview;
  let errors = run.errors;
  let processed = run.processed;

  const room = Math.max(0, run.maxItems - processed);
  const batchSize = Math.min(room, Math.max(1, args.batchSize ?? room));
  const pending = room === 0 ? [] : await listPendingForAuto(args.channel.id, batchSize);
  if (pending.length === 0) {
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

  const deadline = Date.now() + (useAi ? 28_000 : args.dryRun ? 12_000 : 8_000);
  let hitDeadline = false;
  for (const comment of pending) {
    if (Date.now() > deadline) {
      hitDeadline = true;
      break;
    }
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

    if ((isSafetyReview(classified) || classified.needsReview) && skipDelicate && !wantsPersonalReply(classified)) {
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

    let replyText: string | null = null;
    if (useAi && wantsPersonalReply(classified)) {
      replyText = await draftPersonalReply({
        channelId: args.channel.id,
        channelName: args.channel.name,
        commentText: comment.commentText,
      });
      if (!replyText) {
        await updateCommentState(comment.id, {
          status: "needs_review",
          category: classified.category,
          processedAt: new Date().toISOString(),
          errorMessage: "ai_failed",
        });
        needsReview += 1;
        processed += 1;
        log.push({
          at: new Date().toISOString(),
          youtubeCommentId: comment.youtubeCommentId,
          authorName: comment.authorName,
          action: "needs_review",
          category: classified.category,
          message: "ai_failed",
        });
        continue;
      }
    } else if (classified.category === "NO_REPLY") {
      await updateCommentState(comment.id, {
        status: "skipped",
        category: "NO_REPLY",
        processedAt: new Date().toISOString(),
        errorMessage: classified.reviewReason,
      });
      skipped += 1;
      processed += 1;
      log.push({
        at: new Date().toISOString(),
        youtubeCommentId: comment.youtubeCommentId,
        authorName: comment.authorName,
        action: "skipped",
        category: "NO_REPLY",
        message: classified.reviewReason ?? "personal",
      });
      continue;
    } else if (classified.needsReview || classified.category === "REVIEW_REQUIRED") {
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

    if (!replyText) {
      replyText = pickReplyText({
        channelId: args.channel.id,
        category: classified.category === "REVIEW_REQUIRED" ? "GENERIC" : classified.category,
        customSets: cfg.responseSets,
        vary,
      });
    }

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

  const hitGoal = processed >= run.maxItems;
  const drained = !hitDeadline && pending.length < batchSize;
  const finished = hitGoal || drained;
  await patchCommentRun(run.id, {
    status: finished ? "completed" : "running",
    processed,
    answered,
    skipped,
    needsReview,
    errors,
    log: log.slice(-200),
    finishedAt: finished ? new Date().toISOString() : null,
  });
  return (await getCommentRun(run.id))!;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
