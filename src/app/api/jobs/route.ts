import { NextResponse } from "next/server";
import { listJobs } from "../../../core/repo/jobs";
import { getVideoProject } from "../../../core/repo/projects";
import { getChannel } from "../../../core/repo/channels";

export async function GET() {
  const jobs = await listJobs();
  const enriched = await Promise.all(
    jobs.map(async (job) => {
      const project = await getVideoProject(job.videoProjectId);
      const channel = project ? await getChannel(project.channelId) : null;
      return {
        ...job,
        projectTitle: project?.title ?? "—",
        channelName: channel?.name ?? "—",
        channelId: channel?.id ?? null,
      };
    })
  );
  return NextResponse.json({ jobs: enriched });
}
