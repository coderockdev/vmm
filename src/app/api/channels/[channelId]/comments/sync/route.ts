import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getYoutubeAccountForChannel } from "../../../../../../core/repo/youtubeAccounts";
import { syncChannelComments, isQuotaError } from "../../../../../../core/comments/sync";
import { YoutubeAuthError, YoutubeQuotaError } from "../../../../../../core/youtube/oauth";
import { countCommentsByStatus } from "../../../../../../core/repo/youtubeComments";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });

  const account = await getYoutubeAccountForChannel(channel.id);
  if (!account) {
    return NextResponse.json(
      { error: "YouTube não ligado. Abre a aba YouTube → Conectar." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const maxPages = Number(body.maxPages) || 10;

  try {
    const result = await syncChannelComments({ channelId: channel.id, maxPages });
    const counts = await countCommentsByStatus(channel.id);
    return NextResponse.json({ ...result, counts });
  } catch (err) {
    if (err instanceof YoutubeAuthError) {
      return NextResponse.json({ error: err.message, code: "auth" }, { status: 401 });
    }
    if (err instanceof YoutubeQuotaError || isQuotaError(err)) {
      return NextResponse.json(
        { error: "Quota YouTube esgotada. Tenta amanhã.", code: "quota" },
        { status: 429 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
