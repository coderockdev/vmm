import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../../../core/repo/channels";
import {
  getBook,
  getChapter,
  requestChapterProduction,
} from "../../../../../../../../core/repo/books";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { channelId: string; bookId: string; chapterId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const book = await getBook(params.bookId);
  if (!book || book.channelId !== channel.id) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }
  const chapter = await getChapter(params.chapterId);
  if (!chapter || chapter.bookId !== book.id) {
    return NextResponse.json({ error: "Capítulo não encontrado" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "full" ? "full" : body.mode === "audio" ? "audio" : null;
  if (!mode) {
    return NextResponse.json({ error: "Diz se é áudio ou sequência completa." }, { status: 400 });
  }

  const saved = await requestChapterProduction(chapter.id, mode);
  return NextResponse.json({ chapter: saved });
}
