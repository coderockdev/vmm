import React from "react";
import { notFound } from "next/navigation";
import { getChannel } from "../../../../core/repo/channels";
import { ensureSeeded } from "../../../../core/seed";
import { mediaUrl } from "../../../../core/media";
import { EditChannelForm } from "./EditChannelForm";

export const dynamic = "force-dynamic";

export default async function EditChannelPage({ params }: { params: { channelId: string } }) {
  await ensureSeeded();
  const channel = await getChannel(params.channelId);
  if (!channel) notFound();

  const initialCoverUrl = mediaUrl(channel.id, channel.coverRef ?? channel.channelImageRef);

  return <EditChannelForm channel={channel} initialCoverUrl={initialCoverUrl} />;
}
