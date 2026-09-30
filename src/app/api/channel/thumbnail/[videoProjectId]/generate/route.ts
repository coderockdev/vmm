import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getChannel, updateChannelDna } from "../../../../../../core/repo/channels";
import { getVideoProject, getScript, updateProjectThumbnail } from "../../../../../../core/repo/projects";
import { getImageProvider } from "../../../../../../core/providers/image";
import type { ImageProviderName } from "../../../../../../core/providers/image/ImageProvider";
import { mergeThumbnailHistory, type ThumbnailCandidate } from "../../../../../../core/providers/image/thumbnailStyles";
import { findCoverFormat, normalizeCoverDna, type VideoConcept } from "../../../../../../core/providers/image/coverFormats";
import { workingFilePath, persistFile } from "../../../../../../core/storage";
import { mediaUrl } from "../../../../../../core/media";
import { insertUsageEvent } from "../../../../../../core/repo/usage";

function buildPrompt(args: {
  channel: Awaited<ReturnType<typeof getChannel>> & {};
  concept: VideoConcept;
  topic: string;
  scriptText: string;
}): string {
  const cover = normalizeCoverDna(args.channel.dna.visual?.cover);
  const format = findCoverFormat(cover, String(args.concept.thumbnailFormatId));
  return [
    "Create a YouTube thumbnail in 16:9 landscape. Follow the channel-specific prompt and concept below; do not apply any preset visual style.",
    `Channel: ${args.channel.name}.`,
    `Channel visual prompt: ${cover.styleRules}.`,
    `Topic: ${args.topic}.`,
    `Script context: ${args.scriptText.trim().slice(0, 1800) || args.topic}.`,
    `Creative direction: ${args.concept.thumbnailScene}.`,
    `Emotion: ${args.concept.thumbnailEmotion}.`,
    `Concept format: ${format?.name ?? args.concept.thumbnailFormatName}. ${format?.structure ?? args.concept.inventedFormat?.visualStructure ?? ""}`,
    `Title: ${args.concept.title}. The title and thumbnail text must complement each other, not duplicate; ${args.concept.titleThumbnailRelation || "add curiosity and emotion without repeating the title"}.`,
    `Text on image, large and mobile-readable (max ~6 words): "${args.concept.thumbnailText}". Do not write the full title on the image.`,
    `Accent colors: ${cover.accentColors.primary} and ${cover.accentColors.emphasis}.`,
    `Avoid: ${cover.avoid.join(", ")}.`,
    "No watermarks, logos, tiny paragraphs, or deformed hands/objects.",
  ].filter(Boolean).join(" ");
}

export async function POST(req: NextRequest, { params }: { params: { videoProjectId: string } }) {
  const project = await getVideoProject(params.videoProjectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const channel = await getChannel(project.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const imageProvider = (body.imageProvider ?? null) as ImageProviderName | null;
  const count = Math.min(3, Math.max(1, Number(body.count) || 1));
  const stored = project.thumbnailConcept;
  let concept: VideoConcept | null = (body.concept as VideoConcept | undefined) ?? stored;
  if (!concept) return NextResponse.json({ error: "Gere o conceito antes de gerar as imagens." }, { status: 400 });
  if (typeof body.title === "string") concept = { ...concept, title: body.title };
  if (typeof body.thumbnailText === "string") concept = { ...concept, thumbnailText: body.thumbnailText };
  if (typeof body.thumbnailScene === "string") concept = { ...concept, thumbnailScene: body.thumbnailScene };

  let priorHistory = mergeThumbnailHistory(stored?.history, [
    ...(stored?.candidates ?? []), ...(concept.history ?? []), ...(concept.candidates ?? []),
  ]);
  try {
    const { recoverThumbnailHistory } = await import("../../../../../../core/providers/image/recoverThumbnails");
    const recovered = await recoverThumbnailHistory({
      channelId: channel.id, projectId: project.id,
      concept: { ...concept, history: priorHistory }, thumbnailRef: project.thumbnailRef,
    });
    if (recovered?.history?.length) {
      priorHistory = mergeThumbnailHistory(priorHistory, recovered.history);
      concept = { ...concept, history: priorHistory };
    }
  } catch { /* Existing history remains usable if storage recovery is unavailable. */ }

  const script = project.scriptId ? await getScript(project.scriptId) : null;
  const provider = getImageProvider(imageProvider);
  const candidates: ThumbnailCandidate[] = [];
  const urls: Array<{ id: string; styleId: string; styleLabel: string; url: string }> = [];
  let lastError: string | null = null;
  try {
    for (let index = 0; index < count; index++) {
      const fileName = `thumb-${project.id}-channel-${Date.now()}-${index}.png`;
      const outPath = workingFilePath(channel.id, "thumbnails", fileName);
      try {
        const prompt = buildPrompt({ channel, concept, topic: project.topic, scriptText: script?.rawText ?? project.topic });
        await provider.generate({ prompt, outPath });
        const ref = await persistFile(outPath, channel.id, "thumbnails", fileName, "image/png");
        const candidate: ThumbnailCandidate = {
          id: randomUUID(), styleId: `variation-${index + 1}` as ThumbnailCandidate["styleId"], styleLabel: `Variação ${index + 1}`,
          ref, createdAt: new Date().toISOString(),
        };
        candidates.push(candidate);
        urls.push({ id: candidate.id, styleId: candidate.styleId, styleLabel: candidate.styleLabel, url: `${mediaUrl(channel.id, ref)}?t=${Date.now()}` });
      } catch (err) { lastError = err instanceof Error ? err.message : String(err); }
    }
    if (!candidates.length) throw new Error(lastError || "Nenhuma imagem foi gerada.");

    const history = mergeThumbnailHistory(priorHistory, candidates);
    const nextConcept: VideoConcept = {
      ...concept, imageProvider: provider.name, candidates, selectedCandidateIndex: 0, history,
      status: "generated", errorMessage: lastError && candidates.length < count ? lastError : null,
      updatedAt: new Date().toISOString(),
    };
    await updateProjectThumbnail(project.id, nextConcept, candidates[0].ref);
    const cover = normalizeCoverDna(channel.dna.visual?.cover);
    const formatId = String(nextConcept.thumbnailFormatId);
    if (formatId && formatId !== "auto" && formatId !== "invent") {
      cover.recentFormatIds = [...cover.recentFormatIds, formatId].slice(-20);
      await updateChannelDna(channel.id, { ...channel.dna, visual: { ...channel.dna.visual, cover } });
    }
    await insertUsageEvent({
      channelId: channel.id, contentIdeaId: project.contentIdeaId, videoProjectId: project.id,
      stage: "thumbnail", snapshot: {
        provider: provider.name === "openai" ? "openai" : provider.name === "gemini" ? "gemini" : "pollinations",
        model: provider.name, images: candidates.length, characters: count,
      },
    }).catch(() => undefined);
    return NextResponse.json({
      concept: nextConcept, thumbnailUrl: urls[0]?.url ?? null, candidates: urls, count: candidates.length,
      project: await getVideoProject(project.id), partialError: lastError && candidates.length < count ? lastError : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed: VideoConcept = { ...concept, status: "failed", errorMessage: message, updatedAt: new Date().toISOString() };
    await updateProjectThumbnail(project.id, failed).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
