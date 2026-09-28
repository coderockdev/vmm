import React from "react";
import { notFound } from "next/navigation";
import { getChannel } from "../../../core/repo/channels";
import { listProjectsForChannel } from "../../../core/repo/projects";
import { listPlansForChannel } from "../../../core/repo/plans";
import { ensureSeeded } from "../../../core/seed";
import { ChannelWorkspace } from "./ChannelWorkspace";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params }: { params: { channelId: string } }) {
  await ensureSeeded();
  const channel = await getChannel(params.channelId);
  if (!channel) notFound();

  const projects = await listProjectsForChannel(channel.id);
  const plans = await listPlansForChannel(channel.id);

  return <ChannelWorkspace channel={channel} initialProjects={projects} initialPlans={plans} />;
}
