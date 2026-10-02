import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getYoutubeAccountForChannel } from "../../../../../../core/repo/youtubeAccounts";
import { runAutoRespond } from "../../../../../../core/comments/autoRespond";
import {
  getCommentRun,
  getLatestCommentRun,
  requestStopCommentRun,
} from "../../../../../../core/repo/youtubeComments";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Start (or check) an auto-respond run. */
export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });

  const account = await getYoutubeAccountForChannel(channel.id);
  if (!account) {
    return NextResponse.json({ error: "YouTube não ligado." }, { status: 400 });
  }
  if (!account.scopes.includes("youtube.force-ssl")) {
    return NextResponse.json(
      {
        error:
          "Falta o scope youtube.force-ssl. Volta a «Conectar YouTube» na aba YouTube para autorizar comentários.",
        code: "scope_missing",
      },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const maxItems = Math.min(2000, Math.max(1, Number(body.maxItems) || 25));
  const dryRun = Boolean(body.dryRun);
  const skipDelicate = body.skipDelicate !== false;
  const varyResponses = body.varyResponses !== false;
  const skipAlreadyAnswered = body.skipAlreadyAnswered !== false;
  const useAi = Boolean(body.useAi);
  const batchCap = dryRun ? 20 : 5;
  const batchSize = Math.min(batchCap, Math.max(1, Number(body.batchSize) || (dryRun ? 15 : 5)));
  const runId = typeof body.runId === "string" ? body.runId : undefined;

  try {
    const run = await runAutoRespond({
      channel,
      maxItems,
      dryRun,
      skipDelicate,
      varyResponses,
      skipAlreadyAnswered,
      useAi,
      runId,
      batchSize,
    });
    return NextResponse.json({ run });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Poll latest / specific run, or request stop. */
export async function GET(req: NextRequest, { params }: { params: { channelId: string } }) {
  const runId = req.nextUrl.searchParams.get("runId");
  const run = runId
    ? await getCommentRun(runId)
    : await getLatestCommentRun(params.channelId);
  if (run && run.channelId !== params.channelId) {
    return NextResponse.json({ error: "Run não encontrado" }, { status: 404 });
  }
  return NextResponse.json({ run });
}

export async function DELETE(req: NextRequest, { params }: { params: { channelId: string } }) {
  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId em falta" }, { status: 400 });
  const run = await getCommentRun(runId);
  if (!run || run.channelId !== params.channelId) {
    return NextResponse.json({ error: "Run não encontrado" }, { status: 404 });
  }
  await requestStopCommentRun(runId);
  return NextResponse.json({ ok: true, stopRequested: true });
}
