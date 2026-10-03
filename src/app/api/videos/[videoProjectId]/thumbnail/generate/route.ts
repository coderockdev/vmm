import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getChannel, updateChannelDna } from "../../../../../../core/repo/channels";
import { getVideoProject, updateProjectThumbnail } from "../../../../../../core/repo/projects";
import { getImageProvider } from "../../../../../../core/providers/image";
import { ImageProviderName } from "../../../../../../core/providers/image/ImageProvider";
import { stylesForCount, mergeThumbnailHistory, ThumbnailCandidate } from "../../../../../../core/providers/image/thumbnailStyles";
import { buildThumbnailImagePrompt } from "../../../../../../core/providers/script/coverConcept";
import { stillImageRequest } from "../../../../../../core/providers/image/stillChoices";
import { burnThumbnailText } from "../../../../../../core/providers/image/burnThumbnailText";
import { persistIdentificationThumb } from "../../../../../../core/providers/image/identificationThumb";
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
  const count = Math.min(3, Math.max(1, Number(body.count) || 1));
  const styles = stylesForCount(count);

  const stored = project.thumbnailConcept;
  let concept: VideoConcept | null =
    (body.concept as VideoConcept | undefined) ?? stored;
  if (!concept) {
    return NextResponse.json(
      { error: "Gere o conceito (título+formato) antes de gerar a imagem." },
      { status: 400 }
    );
  }

  if (typeof body.title === "string") concept = { ...concept, title: body.title };
  if (typeof body.thumbnailText === "string") concept = { ...concept, thumbnailText: body.thumbnailText };
  if (typeof body.thumbnailScene === "string") concept = { ...concept, thumbnailScene: body.thumbnailScene };

  // Always accumulate from DB — client body can be stale and omit history.
  let priorHistory = mergeThumbnailHistory(
    stored?.history,
    [...(stored?.candidates ?? []), ...(concept.history ?? []), ...(concept.candidates ?? [])]
  );

  // Re-attach any PNGs still in Storage that were dropped from JSON history.
  try {
    const { recoverThumbnailHistory } = await import(
      "../../../../../../core/providers/image/recoverThumbnails"
    );
    const recovered = await recoverThumbnailHistory({
      channelId: channel.id,
      projectId: project.id,
      concept: { ...concept, history: priorHistory },
      thumbnailRef: project.thumbnailRef,
    });
    if (recovered?.history?.length) {
      priorHistory = mergeThumbnailHistory(priorHistory, recovered.history);
      concept = { ...concept, history: priorHistory };
    }
  } catch {
    // Non-fatal — generation still proceeds with whatever history we have.
  }

  const provider = getImageProvider(imageProvider);
  const candidates: ThumbnailCandidate[] = [];
  const urls: Array<{ id: string; styleId: string; styleLabel: string; url: string }> = [];
  let lastError: string | null = null;

  try {
    for (let i = 0; i < styles.length; i++) {
      const style = styles[i];
      const prompt = buildThumbnailImagePrompt({
        channel,
        concept,
        styleExtra: style.promptExtra,
      });
      const fileName = `thumb-${project.id}-${style.id}-${Date.now()}-${i}.png`;
      const outPath = workingFilePath(channel.id, "thumbnails", fileName);
      try {
        const still = provider.name === "openai" ? stillImageRequest(channel.dna.visual.stillImage) : null;
        await provider.generate({
          prompt,
          outPath,
          ...(still ? { model: still.model, quality: still.quality, size: "1536x1024" } : {}),
        });
        await burnThumbnailText(outPath, concept.thumbnailText);
        await persistIdentificationThumb(outPath, channel.id, fileName).catch(() => undefined);
        const ref = await persistFile(outPath, channel.id, "thumbnails", fileName, "image/png");
        const candidate: ThumbnailCandidate = {
          id: randomUUID(),
          styleId: style.id,
          styleLabel: style.label,
          ref,
          createdAt: new Date().toISOString(),
        };
        candidates.push(candidate);
        urls.push({
          id: candidate.id,
          styleId: style.id,
          styleLabel: style.label,
          url: `${mediaUrl(channel.id, ref)}?t=${Date.now()}`,
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        // Keep going so 2/3 successes still return usable thumbs.
      }
    }

    if (candidates.length === 0) {
      throw new Error(lastError || "Nenhuma imagem gerada.");
    }

    const primary = candidates[0];
    const history = mergeThumbnailHistory(priorHistory, candidates);
    const nextConcept: VideoConcept = {
      ...concept,
      imageProvider: provider.name,
      candidates,
      selectedCandidateIndex: 0,
      history,
      status: "generated",
      errorMessage: lastError && candidates.length < styles.length ? lastError : null,
      updatedAt: new Date().toISOString(),
    };
    await updateProjectThumbnail(project.id, nextConcept, primary.ref);

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
      stage: "thumbnail",
      snapshot: {
        provider:
          provider.name === "openai"
            ? "openai"
            : provider.name === "gemini"
              ? "gemini"
              : "pollinations",
        model:
          provider.name === "openai"
            ? "gpt-image-1 medium 1536x1024"
            : provider.name === "gemini"
              ? "gemini-3.1-flash-image"
              : provider.name,
        images: candidates.length,
        characters: styles.length,
      },
    }).catch(() => undefined);

    return NextResponse.json({
      concept: nextConcept,
      thumbnailUrl: urls[0]?.url ?? null,
      candidates: urls,
      count: candidates.length,
      project: await getVideoProject(project.id),
      partialError: lastError && candidates.length < styles.length ? lastError : null,
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
