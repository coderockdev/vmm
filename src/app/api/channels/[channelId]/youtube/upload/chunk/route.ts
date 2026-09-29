import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../../core/repo/channels";
import { putResumableChunk } from "../../../../../../../core/youtube/upload";
import {
  YoutubeAuthError,
  YoutubeQuotaError,
} from "../../../../../../../core/youtube/oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

/**
 * Forward a byte range to the YouTube resumable session.
 * Headers: Content-Range: bytes start-end/total
 * Query: uploadId
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });

  const uploadId = req.nextUrl.searchParams.get("uploadId")?.trim();
  if (!uploadId) return NextResponse.json({ error: "uploadId obrigatório" }, { status: 400 });

  const contentRange = req.headers.get("content-range") || req.headers.get("Content-Range");
  if (!contentRange) {
    return NextResponse.json({ error: "Content-Range obrigatório" }, { status: 400 });
  }
  const m = /bytes\s+(\d+)-(\d+)\/(\d+)/i.exec(contentRange);
  if (!m) {
    return NextResponse.json({ error: "Content-Range inválido" }, { status: 400 });
  }
  const start = Number(m[1]);
  const end = Number(m[2]);
  const total = Number(m[3]);

  const ab = await req.arrayBuffer();
  const body = Buffer.from(ab);
  if (body.length !== end - start + 1) {
    return NextResponse.json(
      { error: `Chunk size ${body.length} ≠ range ${start}-${end}` },
      { status: 400 }
    );
  }

  try {
    const result = await putResumableChunk({
      uploadId,
      channelId: channel.id,
      start,
      end,
      total,
      body,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
