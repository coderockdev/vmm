import { NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getBook, listChaptersForBook } from "../../../../../../core/repo/books";
import { spendByChapterId } from "../../../../../../core/repo/usage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { channelId: string; bookId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const book = await getBook(params.bookId);
  if (!book || book.channelId !== channel.id) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  const chapters = await listChaptersForBook(book.id);
  const spend = await spendByChapterId(channel.id);
  return NextResponse.json({ book, chapters, spend });
}
