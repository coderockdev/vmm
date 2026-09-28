import React from "react";
import { notFound } from "next/navigation";
import { getChannel } from "../../../core/repo/channels";
import { listProjectsForChannel } from "../../../core/repo/projects";
import { listPlansForChannel } from "../../../core/repo/plans";
import { ChannelWorkspace } from "./ChannelWorkspace";

export const dynamic = "force-dynamic";

export default function ChannelPage({ params }: { params: { channelId: string } }) {
  const channel = getChannel(params.channelId);
  if (!channel) notFound();

  const projects = listProjectsForChannel(channel.id);
  const plans = listPlansForChannel(channel.id);

  return <ChannelWorkspace channel={channel} initialProjects={projects} initialPlans={plans} />;
}
