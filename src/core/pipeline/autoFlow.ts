import { Channel, VideoFormat } from "../types";
import { generateContentPlanForChannel, generateScriptsForIdeas } from "./generate";
import { generateYoutubeCopy } from "./generateYoutubeCopy";
import { approveScriptAndProduce } from "./produce";
import { getIdea } from "../repo/plans";
import { getVideoProject, getScript } from "../repo/projects";
import { writeProjectPublish } from "../repo/projectPublish";
import { insertUsageEvent } from "../repo/usage";
import { JUAN_CARLOS_ELEVENLABS_VOICE_ID } from "../providers/tts/voiceCapabilities";
import { suggestTopicsFromDna } from "../providers/script/ideaSuggestions";

export type AutoFlowProgress = {
  stage: string;
  detail?: string;
  projectId?: string;
  done: number;
  total: number;
};

/** Topic from UI, or DNA themes / successful-title vibes when empty. */
export function resolveAutoTopic(channel: Channel, topicRaw: string): string {
  const trimmed = topicRaw.trim();
  if (trimmed) return trimmed;
  const hits = (channel.dna.successfulTitles ?? []).slice(0, 5);
  if (hits.length > 0) {
    return `Nuevos títulos al estilo de los más exitosos del canal (urgencia, regreso, oración). Referencias: ${hits
      .map((t) => t.split("|")[0].trim().slice(0, 60))
      .join(" · ")}`;
  }
  const themes = (channel.dna.topics ?? []).map((t) => t.trim()).filter(Boolean);
  if (themes.length > 0) return themes.slice(0, 5).join(", ");
  const chips = suggestTopicsFromDna(channel, 4);
  if (chips.length > 0) return chips.slice(0, 3).join(" / ");
  return channel.niche?.trim() || channel.name;
}

/**
 * One-click: ideas → scripts → YT copy → approve/enqueue audio (Juan Carlos).
 * Music/SFX + scrolling video + portada run after TTS when autoFlow is set (runProject).
 */
export async function runAutoFlow(args: {
  channel: Channel;
  topic: string;
  quantity: number;
  durationMinutes: number;
  format: VideoFormat;
  sceneCount?: number;
  aiProviderOverride?: string | null;
  /** When false, skip YouTube headline/description step. Default true. */
  includeManchete?: boolean;
  onProgress?: (p: AutoFlowProgress) => void;
}): Promise<{ planId: string; projectIds: string[]; topic: string }> {
  const quantity = Math.max(1, Math.min(10, Math.round(args.quantity)));
  const topic = resolveAutoTopic(args.channel, args.topic);
  const fromDna = !args.topic.trim();
  const includeManchete = args.includeManchete !== false;

  const report = (stage: string, extra?: Partial<AutoFlowProgress>) => {
    args.onProgress?.({
      stage,
      done: extra?.done ?? 0,
      total: extra?.total ?? quantity,
      detail: extra?.detail,
      projectId: extra?.projectId,
    });
  };

  report("start", {
    detail: fromDna
      ? `Sem tópico: a usar DNA do canal («${topic.slice(0, 80)}${topic.length > 80 ? "…" : ""}»)`
      : `Tema: «${topic.slice(0, 80)}${topic.length > 80 ? "…" : ""}»`,
  });

  report("ideas", { detail: `A gerar ${quantity} ideia(s) com o DNA…` });
  const plan = await generateContentPlanForChannel({
    channel: args.channel,
    topic,
    quantity,
    durationMinutes: args.durationMinutes,
    format: args.format,
    aiProviderOverride: args.aiProviderOverride,
  });

  const ideas = plan.items.filter((item) => item.status === "planned");
  report("ideas", {
    done: ideas.length,
    total: quantity,
    detail: `${ideas.length} ideia(s) prontas`,
  });

  const projectIds: string[] = [];
  for (let i = 0; i < ideas.length; i++) {
    const idea = ideas[i];
    report("scripts", {
      done: i,
      total: ideas.length,
      detail: `Roteiro ${i + 1}/${ideas.length}: ${idea.title.slice(0, 48)}…`,
    });
    const ids = await generateScriptsForIdeas({
      channel: args.channel,
      topic,
      durationMinutes: args.durationMinutes,
      format: args.format,
      ideas: [idea],
      aiProviderOverride: args.aiProviderOverride,
      sceneCount: args.sceneCount,
    });
    projectIds.push(...ids);
  }

  report("scripts", {
    done: projectIds.length,
    total: projectIds.length,
    detail: `${projectIds.length} roteiro(s) gerado(s)`,
  });

  const voiceId =
    args.channel.dna.voice.profile?.elevenlabs_voice_id ||
    args.channel.dna.voice.voiceId ||
    JUAN_CARLOS_ELEVENLABS_VOICE_ID;

  for (let i = 0; i < projectIds.length; i++) {
    const projectId = projectIds[i];
    const project = await getVideoProject(projectId);
    if (!project) continue;

    report("youtube", {
      done: i,
      total: projectIds.length,
      projectId,
      detail: includeManchete
        ? `Manchete + descrição YT · ${project.title.slice(0, 40)}…`
        : `A preparar produção · ${project.title.slice(0, 40)}…`,
    });

    if (includeManchete) {
      const script = project.scriptId ? await getScript(project.scriptId) : null;
      const idea = project.contentIdeaId ? await getIdea(project.contentIdeaId) : null;
      const copy = await generateYoutubeCopy({
        channel: args.channel,
        idea: idea ?? { title: project.title, angle: project.topic, objective: "" },
        scriptText: script?.rawText ?? script?.lines.map((l) => l.text).join("\n") ?? project.title,
        aiProviderOverride: args.aiProviderOverride,
      });

      writeProjectPublish(projectId, {
        headline: copy.headline,
        youtubeDescription: copy.youtubeDescription,
        autoFlow: true,
      });

      if (copy.usage) {
        await insertUsageEvent({
          channelId: args.channel.id,
          contentIdeaId: project.contentIdeaId,
          videoProjectId: projectId,
          stage: "script",
          snapshot: copy.usage,
        }).catch(() => undefined);
      }
    } else {
      writeProjectPublish(projectId, { autoFlow: true });
    }

    report("audio", {
      done: i,
      total: projectIds.length,
      projectId,
      detail: `A enfileirar voz (Juan Carlos) · ${project.title.slice(0, 40)}…`,
    });

    await approveScriptAndProduce(projectId, "elevenlabs", voiceId);
  }

  report("queued", {
    done: projectIds.length,
    total: projectIds.length,
    detail: `${projectIds.length} na fila — a seguir: voz → música/SFX → vídeo → portada (atualiza sozinho)`,
  });

  return { planId: plan.id, projectIds, topic };
}
