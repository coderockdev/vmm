import { NextRequest, NextResponse } from "next/server";
import { getChannel, updateChannelDna, updateChannelMeta } from "../../../../core/repo/channels";
import { listProjectsForChannel } from "../../../../core/repo/projects";
import { listPlansForChannel } from "../../../../core/repo/plans";

export async function GET(_req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  return NextResponse.json({
    channel,
    projects: listProjectsForChannel(channel.id),
    plans: listPlansForChannel(channel.id),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json();

  if (body.name || body.niche || body.coverColor) {
    updateChannelMeta(channel.id, {
      name: body.name,
      niche: body.niche,
      coverColor: body.coverColor,
    });
  }

  if (body.dna) {
    updateChannelDna(channel.id, { ...channel.dna, ...body.dna });
  }

  return NextResponse.json({ channel: getChannel(channel.id) });
}
