import { NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { importJulioVerneBooks } from "../../../../../../core/audiobook/importBooks";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  _req: Request,
  { params }: { params: { channelId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  if (channel.dna.mode !== "audiobook") {
    return NextResponse.json(
      { error: "Este canal não está em modo audiolivro." },
      { status: 400 }
    );
  }

  try {
    const result = await importJulioVerneBooks(channel.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
