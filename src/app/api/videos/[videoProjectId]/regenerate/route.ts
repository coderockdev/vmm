import { NextRequest, NextResponse } from "next/server";
import { getVideoProject, updateProjectStatus } from "../../../../../core/repo/projects";
import { createJob } from "../../../../../core/repo/jobs";
import { enqueueJob } from "../../../../../core/pipeline/queue";

export async function POST(_req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  updateProjectStatus(project.id, "planned");
  const job = createJob({ videoProjectId: project.id, channelId: project.channelId });
  enqueueJob(job.id);

  return NextResponse.json({ jobId: job.id });
}
