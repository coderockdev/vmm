import { NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getVideoProject } from "../../../../../../core/repo/projects";
import { publishProjectToYoutube } from "../../../../../../core/youtube/publishProject";
import {
  YoutubeAuthError,
  YoutubeQuotaError,
} from "../../../../../../core/youtube/oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Push an already-rendered project to YouTube (uses headline, description, video, thumb). */
export async function POST(
  _req: Request,
  { params }: { params: { videoProjectId: string } }
) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const channel = await getChannel(project.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  try {
    const result = await publishProjectToYoutube({
      channelId: channel.id,
      projectId: project.id,
    });
    // Archive keeps the row (light registry); always reload.
    return NextResponse.json({
      ...result,
      project: await getVideoProject(project.id),
    });
  } catch (err) {
    if (err instanceof YoutubeAuthError) {
      return NextResponse.json({ error: err.message, code: "invalid_grant" }, { status: 401 });
    }
    if (err instanceof YoutubeQuotaError) {
      return NextResponse.json({ error: err.message, code: "quotaExceeded" }, { status: 403 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
