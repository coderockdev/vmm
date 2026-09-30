import { NextRequest, NextResponse } from "next/server";
import {
  getVideoProject,
  getScript,
  getAudioAsset,
  purgeProjectAfterYoutube,
} from "../../../../core/repo/projects";
import { getJobForProject } from "../../../../core/repo/jobs";

export async function GET(_req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const script = project.scriptId ? await getScript(project.scriptId) : null;
  const audio = project.audioAssetId ? await getAudioAsset(project.audioAssetId) : null;
  const job = await getJobForProject(project.id);

  return NextResponse.json({ project, script, audio, job });
}

export async function DELETE(_req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await purgeProjectAfterYoutube(project.id);
  return NextResponse.json({ ok: true });
}
