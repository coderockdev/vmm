import { NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getVideoProject, updateProjectThumbnail } from "../../../../../../core/repo/projects";
import { recoverThumbnailHistory } from "../../../../../../core/providers/image/recoverThumbnails";
import { mediaUrl } from "../../../../../../core/media";

/** Re-attach thumbnails that still exist in Storage but were dropped from history. */
export async function POST(_req: Request, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const channel = await getChannel(project.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const recovered = await recoverThumbnailHistory({
    channelId: project.channelId,
    projectId: project.id,
    concept: project.thumbnailConcept,
    thumbnailRef: project.thumbnailRef,
  });

  if (!recovered) {
    return NextResponse.json({
      recovered: false,
      concept: project.thumbnailConcept,
      historyCount: project.thumbnailConcept?.history?.length ?? 0,
      project,
    });
  }

  await updateProjectThumbnail(project.id, recovered, project.thumbnailRef ?? undefined);
  const next = await getVideoProject(project.id);
  return NextResponse.json({
    recovered: true,
    concept: recovered,
    historyCount: recovered.history?.length ?? 0,
    thumbnailUrl: project.thumbnailRef
      ? `${mediaUrl(channel.id, project.thumbnailRef)}?t=${Date.now()}`
      : null,
    project: next,
  });
}
