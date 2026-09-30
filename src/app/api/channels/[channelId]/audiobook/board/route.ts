import { NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { listChapterBoard } from "../../../../../../core/repo/books";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { channelId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  const chapters = await listChapterBoard(channel.id);
  return NextResponse.json({ chapters });
}
