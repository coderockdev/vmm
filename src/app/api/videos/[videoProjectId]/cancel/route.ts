import { NextResponse } from "next/server";
import { getVideoProject, updateProjectStatus } from "../../../../../core/repo/projects";
import { getJobForProject, updateJob } from "../../../../../core/repo/jobs";

export const dynamic = "force-dynamic";

const CANCEL_MSG = "Cancelado pelo utilizador";

/**
 * Stop a stuck / in-flight production job.
 * If narration already exists, keep the audio and unlock the UI for «Gerar vídeo».
 */
export async function POST(
  _req: Request,
  { params }: { params: { videoProjectId: string } }
) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const job = await getJobForProject(project.id);
  if (job && !["completed", "failed"].includes(job.status)) {
    await updateJob(job.id, {
      status: "failed",
      progress: 0,
      statusMessage: CANCEL_MSG,
    });
  }

  // Keep audio usable — don't leave status stuck on "audio"/"rendering".
  if (project.audioAssetId) {
    await updateProjectStatus(project.id, "failed", CANCEL_MSG);
  } else if (!["completed", "script"].includes(project.status)) {
    await updateProjectStatus(project.id, "failed", CANCEL_MSG);
  }

  const updated = await getVideoProject(project.id);
  return NextResponse.json({
    ok: true,
    project: updated,
    job: job ? await getJobForProject(project.id) : null,
  });
}
