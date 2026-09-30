import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import { getYoutubeAccountForChannel } from "../../../../../core/repo/youtubeAccounts";
import {
  countCommentsByStatus,
  getLatestCommentRun,
  listCommentsForChannel,
} from "../../../../../core/repo/youtubeComments";
import { normalizeCommentAutomation } from "../../../../../core/comments/defaults";
import type { CommentStatus } from "../../../../../core/comments/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });

  const account = await getYoutubeAccountForChannel(channel.id);
  const statusParam = req.nextUrl.searchParams.get("status") || "all";
  const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
  const offset = Number(req.nextUrl.searchParams.get("offset") || 0);

  const status =
    statusParam === "pending" ||
    statusParam === "answered" ||
    statusParam === "skipped" ||
    statusParam === "needs_review" ||
    statusParam === "error" ||
    statusParam === "all"
      ? (statusParam as CommentStatus | "all")
      : "all";

  const connection = {
    connected: Boolean(account),
    youtubeTitle: account?.title ?? null,
    youtubeChannelId: account?.youtubeChannelId ?? null,
    scopes: account?.scopes ?? null,
    hasForceSsl: Boolean(account?.scopes?.includes("youtube.force-ssl")),
    automation: normalizeCommentAutomation(channel.dna.commentAutomation),
  };

  try {
    const [comments, counts, latestRun] = await Promise.all([
      listCommentsForChannel({ channelId: channel.id, status, limit, offset }),
      countCommentsByStatus(channel.id),
      getLatestCommentRun(channel.id),
    ]);

    return NextResponse.json({
      ...connection,
      counts,
      comments,
      latestRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ...connection,
        counts: { pending: 0, answered: 0, skipped: 0, needs_review: 0, error: 0 },
        comments: [],
        latestRun: null,
        error: message,
      },
      { status: 500 }
    );
  }
}
