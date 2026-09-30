import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getYoutubeAccountForChannel } from "../../../../../../core/repo/youtubeAccounts";
import { setVideoThumbnail, studioEditUrl } from "../../../../../../core/youtube/upload";
import {
  YoutubeAuthError,
  YoutubeQuotaError,
} from "../../../../../../core/youtube/oauth";

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
  return NextResponse.json({ error: message, code: "thumbnail_failed" }, { status: 502 });
}

/** Retry / set custom thumbnail for an already-uploaded video. */
export async function POST(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });

  const account = await getYoutubeAccountForChannel(channel.id);
  if (!account) {
    return NextResponse.json(
      { error: "Liga o YouTube primeiro.", code: "invalid_grant" },
      { status: 401 }
    );
  }

  const form = await req.formData();
  const videoId = String(form.get("videoId") || "").trim();
  const file = form.get("thumbnail");
  if (!videoId) return NextResponse.json({ error: "videoId obrigatório" }, { status: 400 });
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Ficheiro de capa obrigatório" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";

  try {
    await setVideoThumbnail({
      channelId: channel.id,
      videoId,
      buffer,
      mimeType,
    });
    return NextResponse.json({
      ok: true,
      videoId,
      studioUrl: studioEditUrl(videoId),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
