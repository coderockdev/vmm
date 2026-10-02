import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getCommentById, updateCommentState } from "../../../../../../core/repo/youtubeComments";
import { replyToComment } from "../../../../../../core/comments/reply";
import { classifyComment } from "../../../../../../core/comments/classify";
import { draftPersonalReply, wantsPersonalReply } from "../../../../../../core/comments/personalReply";
import { pickReplyText } from "../../../../../../core/comments/replyBank";
import { normalizeCommentAutomation } from "../../../../../../core/comments/defaults";
import { getYoutubeAccountForChannel } from "../../../../../../core/repo/youtubeAccounts";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { channelId: string; commentId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });

  const comment = await getCommentById(params.commentId);
  if (!comment || comment.channelId !== channel.id) {
    return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "reply");

  if (action === "skip") {
    const updated = await updateCommentState(comment.id, {
      status: "skipped",
      processedAt: new Date().toISOString(),
    });
    return NextResponse.json({ comment: updated });
  }

  if (action === "needs_review") {
    const updated = await updateCommentState(comment.id, {
      status: "needs_review",
      processedAt: new Date().toISOString(),
    });
    return NextResponse.json({ comment: updated });
  }

  // suggest only
  if (action === "suggest") {
    const classified = classifyComment(comment.commentText);
    const cfg = normalizeCommentAutomation(channel.dna.commentAutomation);
    const replyText = wantsPersonalReply(classified)
      ? await draftPersonalReply({
          channelId: channel.id,
          channelName: channel.name,
          commentText: comment.commentText,
        })
      : pickReplyText({
          channelId: channel.id,
          category: classified.category === "REVIEW_REQUIRED" ? "GENERIC" : classified.category,
          customSets: cfg.responseSets,
          vary: true,
        });
    return NextResponse.json({
      category: classified.category,
      needsReview: classified.needsReview,
      reviewReason: classified.reviewReason,
      suggestedReply: replyText,
    });
  }

  const account = await getYoutubeAccountForChannel(channel.id);
  if (!account) return NextResponse.json({ error: "YouTube não ligado." }, { status: 400 });

  let replyText = typeof body.replyText === "string" ? body.replyText.trim() : "";
  if (!replyText) {
    const classified = classifyComment(comment.commentText);
    const cfg = normalizeCommentAutomation(channel.dna.commentAutomation);
    replyText =
      pickReplyText({
        channelId: channel.id,
        category: classified.category === "REVIEW_REQUIRED" ? "GENERIC" : classified.category,
        customSets: cfg.responseSets,
        vary: true,
      }) || "";
  }
  if (!replyText) {
    return NextResponse.json({ error: "Sem texto de resposta" }, { status: 400 });
  }

  const dryRun = Boolean(body.dryRun);
  const result = await replyToComment({
    channelId: channel.id,
    commentId: comment.id,
    replyText,
    dryRun,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, quota: result.quota },
      { status: result.quota ? 429 : 502 }
    );
  }

  const updated = await getCommentById(comment.id);
  return NextResponse.json({
    dryRun: result.dryRun,
    replyId: result.replyId,
    replyText: result.replyText,
    comment: updated,
  });
}
