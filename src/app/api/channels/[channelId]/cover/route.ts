import { NextRequest, NextResponse } from "next/server";
import { getChannel, updateChannelCoverRef } from "../../../../../core/repo/channels";
import { getImageProvider, buildCoverPrompt } from "../../../../../core/providers/image";
import { workingFilePath, persistFile } from "../../../../../core/storage";
import { mediaUrl } from "../../../../../core/media";

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
      channel,
    });

    const fileName = "cover.png";
    const outPath = workingFilePath(channel.id, "cover", fileName);
    await getImageProvider().generate({ prompt, outPath });
    const ref = await persistFile(outPath, channel.id, "cover", fileName, "image/png");
    await updateChannelCoverRef(channel.id, ref);

    return NextResponse.json({ coverUrl: `${mediaUrl(channel.id, ref)}?t=${Date.now()}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
