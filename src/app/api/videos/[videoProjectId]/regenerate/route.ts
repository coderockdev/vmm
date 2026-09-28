import { NextRequest, NextResponse } from "next/server";
import { getVideoProject, updateProjectStatus } from "../../../../../core/repo/projects";
import { createJob } from "../../../../../core/repo/jobs";
import { enqueueJob } from "../../../../../core/pipeline/queue";

export async function POST(_req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await updateProjectStatus(project.id, "planned");
  const job = await createJob({ videoProjectId: project.id, channelId: project.channelId });
  await enqueueJob(job.id);

  return NextResponse.json({ jobId: job.id });
}
