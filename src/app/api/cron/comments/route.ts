import { NextRequest, NextResponse } from "next/server";
import { getChannel, updateChannelDna } from "../../../../core/repo/channels";
import { runAutoRespond } from "../../../../core/comments/autoRespond";
import { syncChannelComments, isQuotaError } from "../../../../core/comments/sync";
import { normalizeCommentAutomation } from "../../../../core/comments/defaults";
import { countCommentsByStatus } from "../../../../core/repo/youtubeComments";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PER_SLOT = 50;
const SLOT_BUDGET_MS = 250_000;

/**
 * Evening reply slot for one channel. Vercel calls this at 18:00, 19:00 and 20:00
 * Argentina (21:00, 22:00, 23:00 UTC). Fifty replies leave room in the shared
 * 200-reply project quota.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const channelId = req.nextUrl.searchParams.get("channel") || "amor-amor";
  const slot = req.nextUrl.searchParams.get("slot") || "";
  const channel = await getChannel(channelId);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });

  const started = Date.now();
  let runId: string | undefined;
  let status = "running";
  let answered = 0;
  let skipped = 0;
  let needsReview = 0;
  let errors = 0;

  while (Date.now() - started < SLOT_BUDGET_MS) {
    const run = await runAutoRespond({
      channel,
      maxItems: PER_SLOT,
      dryRun: false,
      skipDelicate: true,
      varyResponses: true,
      skipAlreadyAnswered: true,
      useAi: true,
      runId,
      batchSize: 5,
    });
    runId = run.id;
    status = run.status;
    answered = run.answered;
    skipped = run.skipped;
    needsReview = run.needsReview;
    errors = run.errors;
    if (run.status !== "running") break;
  }

  let imported = 0;
  let history = "skipped";
  if (status !== "quota_stopped" && Date.now() - started < SLOT_BUDGET_MS - 20_000) {
    try {
      const pulled = await importOlderComments(channelId, 8);
      imported = pulled.imported;
      history = pulled.done ? "done" : "advanced";
    } catch (err) {
      history = isQuotaError(err) ? "quota" : "error";
    }
  }

  const counts = await countCommentsByStatus(channelId);
  return NextResponse.json({
    channelId,
    slot,
    status,
    answered,
    skipped,
    needsReview,
    errors,
    imported,
    history,
    pending: counts.pending,
  });
}

async function importOlderComments(
  channelId: string,
  pages: number
): Promise<{ imported: number; done: boolean }> {
  const channel = await getChannel(channelId);
  if (!channel) return { imported: 0, done: false };
  const cfg = normalizeCommentAutomation(channel.dna.commentAutomation);
  if (cfg.historyPageToken === "done") return { imported: 0, done: true };

  const result = await syncChannelComments({
    channelId,
    maxPages: pages,
    pageToken: cfg.historyPageToken || undefined,
  });
  const next = result.nextPageToken || "done";
  await updateChannelDna(channelId, {
    ...channel.dna,
    commentAutomation: { ...cfg, historyPageToken: next },
  });
  return { imported: result.imported, done: next === "done" };
}
