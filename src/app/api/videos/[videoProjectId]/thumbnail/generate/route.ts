import { NextRequest, NextResponse } from "next/server";
import { getChannel, updateChannelDna } from "../../../../../../core/repo/channels";
import { getVideoProject, updateProjectThumbnail } from "../../../../../../core/repo/projects";
import { getImageProvider } from "../../../../../../core/providers/image";
import { ImageProviderName } from "../../../../../../core/providers/image/ImageProvider";
import { buildThumbnailImagePrompt } from "../../../../../../core/providers/script/coverConcept";
import { normalizeCoverDna, VideoConcept } from "../../../../../../core/providers/image/coverFormats";
import { workingFilePath, persistFile } from "../../../../../../core/storage";
import { mediaUrl } from "../../../../../../core/media";
import { insertUsageEvent } from "../../../../../../core/repo/usage";

export async function POST(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const channel = await getChannel(project.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const imageProvider = (body.imageProvider ?? null) as ImageProviderName | null;

  let concept: VideoConcept | null =
    (body.concept as VideoConcept | undefined) ?? project.thumbnailConcept;
  if (!concept) {
    return NextResponse.json(
      { error: "Gere o conceito (título+formato) antes de gerar a imagem." },
      { status: 400 }
    );
  }

  // Allow UI edits before generate
  if (typeof body.title === "string") concept = { ...concept, title: body.title };
  if (typeof body.thumbnailText === "string") concept = { ...concept, thumbnailText: body.thumbnailText };
  if (typeof body.thumbnailScene === "string") concept = { ...concept, thumbnailScene: body.thumbnailScene };

  try {
    const prompt = buildThumbnailImagePrompt({ channel, concept });
    const provider = getImageProvider(imageProvider);
    const fileName = `thumb-${project.id}.png`;
    const outPath = workingFilePath(channel.id, "thumbnails", fileName);
    await provider.generate({ prompt, outPath });
    const ref = await persistFile(outPath, channel.id, "thumbnails", fileName, "image/png");

    const nextConcept: VideoConcept = {
      ...concept,
      imageProvider: provider.name,
      status: "generated",
      errorMessage: null,
      updatedAt: new Date().toISOString(),
    };
    await updateProjectThumbnail(project.id, nextConcept, ref);

    // Anti-repetition: push format id onto channel DNA recent list
    const cover = normalizeCoverDna(channel.dna.visual?.cover);
    const formatId = String(nextConcept.thumbnailFormatId);
    if (formatId && formatId !== "auto" && formatId !== "invent") {
      cover.recentFormatIds = [...cover.recentFormatIds, formatId].slice(-20);
      await updateChannelDna(channel.id, {
        ...channel.dna,
        visual: { ...channel.dna.visual, cover },
      });
    }

    await insertUsageEvent({
      channelId: channel.id,
      contentIdeaId: project.contentIdeaId,
      videoProjectId: project.id,
      stage: "render",
      snapshot: {
        provider: provider.name === "openai" ? "openai" : provider.name === "gemini" ? "gemini" : "mock",
        model: provider.name,
        characters: prompt.length,
      },
    }).catch(() => undefined);

    return NextResponse.json({
      concept: nextConcept,
      thumbnailUrl: `${mediaUrl(channel.id, ref)}?t=${Date.now()}`,
      project: await getVideoProject(project.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed: VideoConcept = {
      ...concept,
      status: "failed",
      errorMessage: message,
      updatedAt: new Date().toISOString(),
    };
    await updateProjectThumbnail(project.id, failed).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
