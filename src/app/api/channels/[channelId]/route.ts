import { NextRequest, NextResponse } from "next/server";
import { getChannel, updateChannelDna, updateChannelMeta } from "../../../../core/repo/channels";
import { listProjectsForChannel, listAudioAssetsForChannel } from "../../../../core/repo/projects";
import { listPlansForChannel } from "../../../../core/repo/plans";

export async function GET(_req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  return NextResponse.json({
    channel,
    projects: await listProjectsForChannel(channel.id),
    plans: await listPlansForChannel(channel.id),
    audioAssets: await listAudioAssetsForChannel(channel.id),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json();

  if (body.name || body.niche || body.coverColor) {
    await updateChannelMeta(channel.id, {
      name: body.name,
      niche: body.niche,
      coverColor: body.coverColor,
    });
  }

  if (body.dna) {
    await updateChannelDna(channel.id, { ...channel.dna, ...body.dna });
  }

  return NextResponse.json({ channel: await getChannel(channel.id) });
}
