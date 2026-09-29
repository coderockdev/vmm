import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../../core/repo/channels";
import { getYoutubeAccountForChannel } from "../../../../../../../core/repo/youtubeAccounts";
import {
  startResumableVideoUpload,
  loadSession,
  queryResumableStatus,
} from "../../../../../../../core/youtube/upload";
import {
  YoutubeAuthError,
  YoutubeQuotaError,
} from "../../../../../../../core/youtube/oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function errorResponse(err: unknown) {
  if (err instanceof YoutubeAuthError) {
    return NextResponse.json({ error: err.message, code: "invalid_grant" }, { status: 401 });
  }
  if (err instanceof YoutubeQuotaError) {
    return NextResponse.json({ error: err.message, code: "quotaExceeded" }, { status: 403 });
  }
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status: 502 });
}

/** Start resumable videos.insert session (private). */
export async function POST(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });

  const account = await getYoutubeAccountForChannel(channel.id);
  if (!account) {
    return NextResponse.json(
      { error: "Liga o YouTube primeiro (Conectar YouTube).", code: "invalid_grant" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "");
  const contentType = String(body.contentType || "video/mp4");
  const contentLength = Number(body.contentLength);

  if (!title) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });
  if (!Number.isFinite(contentLength) || contentLength < 1) {
    return NextResponse.json({ error: "contentLength inválido" }, { status: 400 });
  }

  try {
    const session = await startResumableVideoUpload({
      channelId: channel.id,
      title,
      description,
      contentType,
      contentLength,
    });
    return NextResponse.json({
      uploadId: session.uploadId,
      contentLength: session.contentLength,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Resume helper: how many bytes already on YouTube. */
export async function GET(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const uploadId = req.nextUrl.searchParams.get("uploadId")?.trim();
  if (!uploadId) return NextResponse.json({ error: "uploadId obrigatório" }, { status: 400 });

  const session = loadSession(uploadId);
  if (!session || session.channelId !== params.channelId) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
  }

  try {
    const bytesReceived = await queryResumableStatus(session);
    const fresh = loadSession(uploadId)!;
    return NextResponse.json({
      uploadId,
      bytesReceived,
      contentLength: fresh.contentLength,
      videoId: fresh.videoId,
      done: Boolean(fresh.videoId) || bytesReceived >= fresh.contentLength,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
