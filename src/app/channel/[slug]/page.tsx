import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getChannel } from "../../../core/repo/channels";
import { listProjectsForChannel } from "../../../core/repo/projects";
import { listPlansForChannel } from "../../../core/repo/plans";
import { listUsageForChannel } from "../../../core/repo/usage";
import { mediaUrl } from "../../../core/media";
import type { ChannelReferencePlatform } from "../../../core/types";
import { wordsForDuration } from "../../../core/scriptBudget";
import { ChannelSubjectGenerator } from "./ChannelSubjectGenerator";
import { ChannelProductions } from "./ChannelProductions";
import { ChannelIdeasTable, type ChannelIdeaRow } from "./ChannelIdeasTable";
import { ChannelSections } from "./ChannelSections";
import { ChannelThumbnails } from "./ChannelThumbnails";
import { normalizeCoverDna } from "../../../core/providers/image/coverFormats";

export const dynamic = "force-dynamic";

const PLATFORM_NAMES: Record<ChannelReferencePlatform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  website: "Site",
};

export default async function ChannelViewPage({ params }: { params: { slug: string } }) {
  const channel = await getChannel(params.slug);
  if (!channel) notFound();

  const [projects, plans, usageEvents] = await Promise.all([
    listProjectsForChannel(channel.id),
    listPlansForChannel(channel.id),
    listUsageForChannel(channel.id),
  ]);
  const ideasCount = plans.reduce((total, plan) => total + plan.items.filter((idea) => idea.status !== "removed").length, 0);
  const imagesCount = projects.filter((project) => project.thumbnailRef).length;
  const audiosCount = projects.filter((project) => project.audioAssetId).length;
  const videosCount = projects.filter((project) => project.status === "completed").length;
  const projectByIdea = new Map<string, (typeof projects)[number]>();
  for (const project of projects) {
    if (project.contentIdeaId && !projectByIdea.has(project.contentIdeaId)) projectByIdea.set(project.contentIdeaId, project);
  }
  const ideaGenerationCostByPlan = new Map<string, number>();
  const scriptCostByIdea = new Map<string, number>();
  for (const event of usageEvents) {
    if (event.stage === "ideas" && event.contentPlanId) {
      ideaGenerationCostByPlan.set(event.contentPlanId, (ideaGenerationCostByPlan.get(event.contentPlanId) ?? 0) + event.estimatedUsd);
    }
    if (event.stage === "script" && event.contentIdeaId) {
      scriptCostByIdea.set(event.contentIdeaId, (scriptCostByIdea.get(event.contentIdeaId) ?? 0) + event.estimatedUsd);
    }
  }
  const ideaRows: ChannelIdeaRow[] = plans.flatMap((plan) => plan.items
    .filter((idea) => idea.status !== "removed")
    .map((idea) => {
      const project = projectByIdea.get(idea.id);
      return {
        id: idea.id,
        planId: plan.id,
        title: idea.title,
        angle: idea.angle,
        objective: idea.objective,
        format: plan.format,
        durationMinutes: plan.durationMinutes,
        titleCostUsd: ideaGenerationCostByPlan.has(plan.id)
          ? (ideaGenerationCostByPlan.get(plan.id) ?? 0) / Math.max(1, plan.items.length)
          : project?.costBreakdown?.ideas && plan.items.length > 0
            ? project.costBreakdown.ideas / plan.items.length
            : null,
        scriptCostUsd: scriptCostByIdea.has(idea.id)
          ? scriptCostByIdea.get(idea.id) ?? 0
          : project?.costBreakdown?.script && project.costBreakdown.script > 0
            ? project.costBreakdown.script
            : null,
        project: project ? {
          id: project.id,
          status: project.status,
          scriptId: project.scriptId,
          updatedAt: project.updatedAt,
        } : null,
      };
    }));
  const avatarUrl = mediaUrl(channel.id, channel.channelImageRef ?? channel.coverRef);
  const productionItems = projects.flatMap((project) => {
    const thumbnailUrl = mediaUrl(channel.id, project.thumbnailRef);
    return thumbnailUrl ? [{
      id: project.id,
      title: project.title,
      createdAt: project.createdAt,
      status: project.status,
      format: project.format,
      thumbnailUrl,
      durationSeconds: project.renderDurationSeconds,
    }] : [];
  });
  const topics = channel.dna.topics.filter(Boolean);
  const languageName = channel.dna.language === "pt" ? "Português" : channel.dna.language === "en" ? "Inglês" : "Espanhol";
  const channelPrompt = channel.dna.scriptRules.generationPrompt.trim() || channel.scriptSkill.trim();
  const scriptDefaults = {
    sceneCount: channel.dna.scriptRules.defaultSceneCount ?? 4,
    wordCount: wordsForDuration(
      channel.dna.scriptRules.defaultDurationMinutes,
      channel.dna.scriptRules.wordsPerMinute
    ),
  };
  const scriptContext = [
    {
      title: "Contexto do canal",
      items: [
        { label: "Descrição do canal", value: channel.dna.description },
        { label: "Propósito", value: channel.dna.purpose },
        { label: "Público", value: channel.dna.audience },
        { label: "Idioma", value: languageName },
        { label: "Tom", value: channel.dna.tone.join(", ") },
        { label: "Temas permitidos", value: channel.dna.topics.join(", ") },
        { label: "Temas a evitar", value: channel.dna.avoid.join(", ") },
      ].filter((item) => item.value.trim()),
    },
    {
      title: "Regras de escrita",
      items: [
        { label: "Prompt estrutural", value: channelPrompt || "Não há prompt estrutural adicional cadastrado." },
        { label: "Estrutura", value: channel.dna.scriptRules.structure },
        { label: "Abertura", value: channel.dna.scriptRules.opening },
        { label: "Chamada para ação (CTA)", value: channel.dna.scriptRules.cta },
      ].filter((item) => item.value.trim()),
    },
  ];
  const successfulTitles = (channel.dna.successfulTitles ?? []).map((title) => title.trim()).filter(Boolean);
  const channelContext = [
    { label: "Identidade", value: [channel.dna.description, channel.dna.purpose].filter(Boolean).join(" · ") },
    { label: "Público e idioma", value: [channel.dna.audience, languageName].filter(Boolean).join(" · ") },
    { label: "Temas permitidos", value: topics.join(", ") },
    { label: "Temas a evitar", value: channel.dna.avoid.join(", ") },
  ].filter((item) => item.value.trim().length > 0);

  return (
    <div className="channel-view-page">
      <div className="channel-view-breadcrumb">
        <Link href="/">⌂ <span>Canais</span></Link>
        <span className="channel-view-crumb-chevron">›</span>
        <span aria-current="page">{channel.name}</span>
      </div>

      <section className="channel-view-heading" aria-labelledby="channel-view-title">
        <div className="channel-view-avatar">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={`Imagem do canal ${channel.name}`} />
          ) : (
            <span aria-hidden="true">{channel.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>

        <div className="channel-view-heading-copy">
          <div className="channel-view-title-line">
            <h1 id="channel-view-title">{channel.name}</h1>
            <Link href={`/channels/${channel.id}/edit`} className="channel-view-edit" aria-label={`Editar ${channel.name}`} title="Editar canal">↗</Link>
          </div>
          {channel.dna.description && <p>{channel.dna.description}</p>}
          <div className="channel-view-meta">
            <span className="channel-view-language">◎ <span>{languageName}</span></span>
            {channel.referenceLinks.map((reference, index) => (
              <a key={`${reference.platform}-${reference.url}-${index}`} href={reference.url} target="_blank" rel="noreferrer">
                {PLATFORM_NAMES[reference.platform]}
              </a>
            ))}
          </div>
        </div>

        <div className="channel-view-heading-actions">
          <Link href={`/channels/${channel.id}`}>Abrir canal</Link>
          <Link href={`/channels/${channel.id}/edit`} aria-label="Mais opções do canal" title="Mais opções">•••</Link>
        </div>
      </section>

      <ChannelSections
        ideasCount={ideasCount}
        generator={(
          <>
            <ChannelSubjectGenerator
              channelId={channel.id}
              durationMinutes={channel.dna.scriptRules.defaultDurationMinutes}
              exampleTopic={topics[0] ?? ""}
              channelContext={channelContext}
              channelPrompt={channelPrompt}
              successfulTitles={successfulTitles}
            />
            <ChannelProductions channelId={channel.id} items={productionItems} />
          </>
        )}
        ideas={<ChannelIdeasTable channelId={channel.id} initialRows={ideaRows} scriptContext={scriptContext} scriptDefaults={scriptDefaults} />}
        thumbnails={<ChannelThumbnails channelId={channel.id} channelName={channel.name} projects={projects} ideas={ideaRows} coverFormats={normalizeCoverDna(channel.dna.visual?.cover)} />}
        imagesCount={imagesCount}
        audiosCount={audiosCount}
        videosCount={videosCount}
      />
    </div>
  );
}
