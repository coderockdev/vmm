import { NextRequest, NextResponse } from "next/server";
import { getChannel, updateChannelDna, updateChannelMeta, deleteChannel } from "../../../../core/repo/channels";
import { listProjectsForChannel, listAudioAssetsForChannel, getAudioAsset } from "../../../../core/repo/projects";
import { listPlansForChannel } from "../../../../core/repo/plans";
import { deleteStoredFile } from "../../../../core/storage";

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

export async function DELETE(_req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  // Clean up stored files before the row (and its cascaded DB rows) go away
  // — the DB delete alone would just orphan them in disk/Supabase Storage.
  const projects = await listProjectsForChannel(channel.id);
  for (const project of projects) {
    await deleteStoredFile(channel.id, project.renderPath);
    if (project.audioAssetId) {
      const audio = await getAudioAsset(project.audioAssetId);
      if (audio) await deleteStoredFile(channel.id, audio.filePath);
    }
  }
  await deleteStoredFile(channel.id, channel.coverRef);
  await deleteStoredFile(channel.id, channel.channelImageRef);
  await deleteStoredFile(channel.id, channel.channelBannerRef);
  await deleteStoredFile(channel.id, channel.visualReferenceRef);

  await deleteChannel(channel.id);
  return NextResponse.json({ ok: true });
}
