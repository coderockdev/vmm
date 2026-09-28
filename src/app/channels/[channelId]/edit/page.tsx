import React from "react";
import { notFound } from "next/navigation";
import { getChannel } from "../../../../core/repo/channels";
import { EditChannelForm } from "./EditChannelForm";

export const dynamic = "force-dynamic";

export default function EditChannelPage({ params }: { params: { channelId: string } }) {
  const channel = getChannel(params.channelId);
  if (!channel) notFound();
  return <EditChannelForm channel={channel} />;
}
