import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  getVideoProject,
  getScript,
  getAudioAsset,
  deleteVideoProject,
} from "../../../../core/repo/projects";
import { getJobForProject } from "../../../../core/repo/jobs";
import { channelDir } from "../../../../core/paths";

export async function GET(_req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const script = project.scriptId ? getScript(project.scriptId) : null;
  const audio = project.audioAssetId ? getAudioAsset(project.audioAssetId) : null;
  const job = getJobForProject(project.id);

  return NextResponse.json({ project, script, audio, job });
}

export async function DELETE(_req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (project.renderPath) {
    const abs = path.join(channelDir(project.channelId), project.renderPath);
    fs.rmSync(abs, { force: true });
  }
  const audio = project.audioAssetId ? getAudioAsset(project.audioAssetId) : null;
  if (audio) {
    fs.rmSync(audio.filePath, { force: true });
  }

  deleteVideoProject(project.id);
  return NextResponse.json({ ok: true });
}
