import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../../core/repo/channels";
import { getBook, requestChapterRange } from "../../../../../../../core/repo/books";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { channelId: string; bookId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const book = await getBook(params.bookId);
  if (!book || book.channelId !== channel.id) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "full" ? "full" : body.mode === "audio" ? "audio" : null;
  const to = Number(body.to);
  if (!mode) {
    return NextResponse.json({ error: "Diz se é áudio ou sequência completa." }, { status: 400 });
  }
  if (!Number.isInteger(to) || to < 1) {
    return NextResponse.json({ error: "Diz até que capítulo, a partir do 1." }, { status: 400 });
  }

  const { queued, skipped } = await requestChapterRange(book.id, to, mode);
  return NextResponse.json({ chapters: queued, skipped, from: 1, to });
}
