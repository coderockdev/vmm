import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { getVideoProject, updateProjectThumbnail, getScript } from "../../../../../../core/repo/projects";
import { generateCoverConcept } from "../../../../../../core/providers/script/coverConcept";
import { ThumbnailFormatChoice } from "../../../../../../core/providers/image/coverFormats";
import { mergeThumbnailHistory } from "../../../../../../core/providers/image/thumbnailStyles";
import { insertUsageEvent } from "../../../../../../core/repo/usage";

export async function POST(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const channel = await getChannel(project.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const formatChoice = (body.formatChoice ?? "auto") as ThumbnailFormatChoice;
  const titleHint = typeof body.titleHint === "string" ? body.titleHint : project.title;
  const forceDifferentFormat = Boolean(body.forceDifferentFormat);

  try {
    const script = project.scriptId ? await getScript(project.scriptId) : null;
    const { concept, usage } = await generateCoverConcept({
      channel,
      project,
      script,
      formatChoice,
      titleHint,
      forceDifferentFormat,
    });

    const previous = project.thumbnailConcept;
    // Never wipe past generations when only regenerating the text/format concept.
    const history = mergeThumbnailHistory(previous?.history, previous?.candidates ?? []);
    const nextConcept = {
      ...concept,
      history,
      candidates: previous?.candidates ?? null,
      selectedCandidateIndex: previous?.selectedCandidateIndex ?? null,
      imageProvider: previous?.imageProvider ?? concept.imageProvider ?? null,
    };
    await updateProjectThumbnail(project.id, nextConcept);

    if (usage) {
      await insertUsageEvent({
        channelId: channel.id,
        contentIdeaId: project.contentIdeaId,
        videoProjectId: project.id,
        stage: "thumbnail",
        snapshot: usage,
      }).catch(() => undefined);
    }

    return NextResponse.json({
      concept: nextConcept,
      project: await getVideoProject(project.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
