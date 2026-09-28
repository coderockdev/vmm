import { NextRequest, NextResponse } from "next/server";
import {
  getVideoProject,
  getScript,
  getAudioAsset,
  deleteVideoProject,
} from "../../../../core/repo/projects";
import { getJobForProject } from "../../../../core/repo/jobs";
import { deleteStoredFile } from "../../../../core/storage";

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

  await deleteStoredFile(project.channelId, project.renderPath);
  const audio = project.audioAssetId ? await getAudioAsset(project.audioAssetId) : null;
  if (audio) await deleteStoredFile(project.channelId, audio.filePath);

  await deleteVideoProject(project.id);
  return NextResponse.json({ ok: true });
}
