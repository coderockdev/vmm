import { NextResponse } from "next/server";
import { listJobs } from "../../../core/repo/jobs";
import { getVideoProject } from "../../../core/repo/projects";
import { getChannel } from "../../../core/repo/channels";

export async function GET() {
  const jobs = listJobs();
  const enriched = jobs.map((job) => {
    const project = getVideoProject(job.videoProjectId);
    const channel = project ? getChannel(project.channelId) : null;
    return {
      ...job,
      projectTitle: project?.title ?? "—",
      channelName: channel?.name ?? "—",
      channelId: channel?.id ?? null,
    };
  });
  return NextResponse.json({ jobs: enriched });
}
