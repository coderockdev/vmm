import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getChannel } from "../../../../../core/repo/channels";
import { channelDir } from "../../../../../core/paths";
import { getImageProvider, buildCoverPrompt } from "../../../../../core/providers/image";

export async function POST(_req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  try {
    const prompt = buildCoverPrompt({
      name: channel.name,
      description: channel.dna.description,
      tone: channel.dna.tone,
      topics: channel.dna.topics,
      palette: channel.dna.visual.palette,
    });

    const outPath = path.join(channelDir(channel.id), "cover.png");
    await getImageProvider().generate({ prompt, outPath });

    return NextResponse.json({ coverUrl: `/api/media/${channel.id}/cover.png?t=${Date.now()}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
