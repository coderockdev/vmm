import React from "react";
import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { getChannel } from "../../../../core/repo/channels";
import { channelDir } from "../../../../core/paths";
import { ensureSeeded } from "../../../../core/seed";
import { EditChannelForm } from "./EditChannelForm";

export const dynamic = "force-dynamic";

export default async function EditChannelPage({ params }: { params: { channelId: string } }) {
  await ensureSeeded();
  const channel = await getChannel(params.channelId);
  if (!channel) notFound();

  const hasCover = fs.existsSync(path.join(channelDir(channel.id), "cover.png"));
  const initialCoverUrl = hasCover ? `/api/media/${channel.id}/cover.png` : null;

  return <EditChannelForm channel={channel} initialCoverUrl={initialCoverUrl} />;
}
