import { Channel, VideoFormat } from "../types";
import { generateContentPlanForChannel, generateScriptsForIdeas } from "./generate";
import { generateYoutubeCopy } from "./generateYoutubeCopy";
import { approveScriptAndProduce } from "./produce";
import { getIdea } from "../repo/plans";
import { getVideoProject, getScript } from "../repo/projects";
import { writeProjectPublish } from "../repo/projectPublish";
import { insertUsageEvent } from "../repo/usage";
import { JUAN_CARLOS_ELEVENLABS_VOICE_ID } from "../providers/tts/voiceCapabilities";

export type AutoFlowProgress = {
  stage: string;
  detail?: string;
  projectId?: string;
  done: number;
  total: number;
};

/**
 * One-click: ideas → scripts → YT copy → approve/enqueue audio (Juan Carlos).
 * Music/SFX run after TTS when autoFlow flag is set (see runProject).
 */
export async function runAutoFlow(args: {
  channel: Channel;
  topic: string;
  quantity: number;
  durationMinutes: number;
  format: VideoFormat;
  sceneCount?: number;
  aiProviderOverride?: string | null;
  onProgress?: (p: AutoFlowProgress) => void;
}): Promise<{ planId: string; projectIds: string[] }> {
  const quantity = Math.max(1, Math.min(10, Math.round(args.quantity)));
  const report = (stage: string, extra?: Partial<AutoFlowProgress>) => {
    args.onProgress?.({
      stage,
      done: extra?.done ?? 0,
      total: extra?.total ?? quantity,
      detail: extra?.detail,
      projectId: extra?.projectId,
    });
  };

  report("ideas", { detail: `A gerar ${quantity} ideias…` });
  const plan = await generateContentPlanForChannel({
    channel: args.channel,
    topic: args.topic,
    quantity,
    durationMinutes: args.durationMinutes,
    format: args.format,
    aiProviderOverride: args.aiProviderOverride,
  });

  const ideas = plan.items.filter((item) => item.status === "planned");

  report("scripts", { detail: "A gerar roteiros…" });
  const projectIds = await generateScriptsForIdeas({
    channel: args.channel,
    topic: args.topic,
    durationMinutes: args.durationMinutes,
    format: args.format,
    ideas,
    aiProviderOverride: args.aiProviderOverride,
    sceneCount: args.sceneCount,
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
      detail: `Descrição YT · ${project.title.slice(0, 40)}…`,
    });

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

    report("audio", {
      done: i,
      total: projectIds.length,
      projectId,
      detail: `A enfileirar áudio · ${project.title.slice(0, 40)}…`,
    });

    await approveScriptAndProduce(
      projectId,
      "elevenlabs",
      voiceId
    );
  }

  report("queued", {
    done: projectIds.length,
    total: projectIds.length,
    detail: `${projectIds.length} vídeos na fila (áudio → música/SFX automático)`,
  });

  return { planId: plan.id, projectIds };
}
