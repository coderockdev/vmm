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
  const bank = (channel.dna.successfulTitles ?? [])
    .map((t) => t.split("|")[0].trim())
    .filter(Boolean);
  // Prefer non-mantra hits so auto DNA topic doesn't bias the model.
  const preferred = bank.filter((t) => !/\bmantra\b/i.test(t));
  const pool = preferred.length > 0 ? preferred : bank;
  const start = pool.length > 0 ? Date.now() % pool.length : 0;
  const hits = pool.length
    ? Array.from({ length: Math.min(5, pool.length) }, (_, i) => pool[(start + i * 17) % pool.length])
    : [];
  if (hits.length > 0) {
    return `Nuevos títulos al estilo de los más exitosos del canal (urgencia, regreso, oración, aviso/cuidado). Evita la palabra «mantra» salvo rareza (~5%). Referencias: ${hits
      .map((t) => t.slice(0, 60))
      .join(" · ")}`;
  }
  const themes = (channel.dna.topics ?? []).map((t) => t.trim()).filter(Boolean);
  if (themes.length > 0) return themes.slice(0, 5).join(", ");
  const chips = suggestTopicsFromDna(channel, 4);
  if (chips.length > 0) return chips.slice(0, 3).join(" / ");
  return channel.niche?.trim() || channel.name;
}

/**
 * One-click: ideas → scripts → YT title/description → approve/enqueue audio →
 * (in runProject) music/SFX → scrolling video → portada → YouTube privado.
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

  const onAiFallback = (from: string, to: string) => {
    const label: Record<string, string> = {
      openai: "ChatGPT",
      anthropic: "Claude",
      gemini: "Gemini",
    };
    report("scripts", {
      detail: `${label[from] || from} no limite — a continuar com ${label[to] || to}…`,
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
    onAiFallback,
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
      onAiFallback,
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

    await approveWithRetry(projectId, voiceId, report);
  }

  report("queued", {
    done: projectIds.length,
    total: projectIds.length,
    detail: `${projectIds.length} na fila — voz → música/SFX → vídeo → portada → YouTube privado`,
  });

  return { planId: plan.id, projectIds, topic };
}

async function approveWithRetry(
  projectId: string,
  voiceId: string,
  report: (stage: string, extra?: Partial<AutoFlowProgress>) => void
): Promise<void> {
  const maxAttempts = 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await approveScriptAndProduce(projectId, "elevenlabs", voiceId);
      return;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /fetch failed|network|econnreset|etimedout|socket|aborted|timeout|503|502|429/i.test(
        msg
      );
      if (!retryable || attempt >= maxAttempts) break;
      const waitSec = Math.min(16, 2 ** attempt);
      report("audio", {
        projectId,
        detail: `Fila de voz falhou (rede) — a retentar em ${waitSec}s (${attempt}/${maxAttempts})…`,
      });
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Continue auto-flow projects that already have script (+ optional YT copy)
 * without regenerating ideas/scripts — saves LLM credits.
 */
export async function resumeAutoFlow(args: {
  channel: Channel;
  projectIds?: string[];
  onProgress?: (p: AutoFlowProgress) => void;
}): Promise<{ projectIds: string[]; resumed: string[]; skipped: string[] }> {
  const { listProjectsForChannel } = await import("../repo/projects");
  const { getJobForProject, createJob } = await import("../repo/jobs");
  const { enqueueJob } = await import("./queue");
  const { readProjectPublish } = await import("../repo/projectPublish");

  const voiceId =
    args.channel.dna.voice.profile?.elevenlabs_voice_id ||
    args.channel.dna.voice.voiceId ||
    JUAN_CARLOS_ELEVENLABS_VOICE_ID;

  const all = await listProjectsForChannel(args.channel.id);
  const candidates = (args.projectIds?.length
    ? all.filter((p) => args.projectIds!.includes(p.id))
    : all.filter((p) => {
        if (!p.scriptId) return false;
        if (p.status === "completed" || p.youtubeVideoId) return false;
        const publish = readProjectPublish(p.id);
        return (
          Boolean(publish?.autoFlow) ||
          p.status === "script" ||
          p.status === "failed" ||
          p.status === "audio" ||
          p.status === "rendering" ||
          p.status === "composing" ||
          p.status === "timing"
        );
      })
  ).slice(0, 10);

  const resumed: string[] = [];
  const skipped: string[] = [];
  const total = Math.max(1, candidates.length);

  const report = (stage: string, extra?: Partial<AutoFlowProgress>) => {
    args.onProgress?.({
      stage,
      done: extra?.done ?? resumed.length,
      total: extra?.total ?? total,
      detail: extra?.detail,
      projectId: extra?.projectId,
    });
  };

  report("start", { detail: `A retomar ${candidates.length} projeto(s) sem gastar créditos de IA…` });

  for (let i = 0; i < candidates.length; i++) {
    const project = candidates[i];
    writeProjectPublish(project.id, { autoFlow: true });

    const job = await getJobForProject(project.id);
    const jobBusy =
      job &&
      !["completed", "failed"].includes(job.status) &&
      (job.progress ?? 0) < 100;

    if (jobBusy && project.status !== "script" && project.status !== "failed") {
      skipped.push(project.id);
      report("audio", {
        done: i + 1,
        projectId: project.id,
        detail: `Já em produção · ${project.title.slice(0, 40)}…`,
      });
      continue;
    }

    if (project.status === "script" || (project.status === "failed" && !project.audioAssetId)) {
      report("audio", {
        done: i,
        projectId: project.id,
        detail: `A enfileirar voz · ${project.title.slice(0, 40)}…`,
      });
      await approveWithRetry(project.id, voiceId, report);
      resumed.push(project.id);
      continue;
    }

    // Has script+audio (or mid-pipeline) but job died — re-queue without new TTS if possible.
    // runProject always re-runs TTS today; still better than regenerating scripts.
    report("audio", {
      done: i,
      projectId: project.id,
      detail: `A repor na fila · ${project.title.slice(0, 40)}…`,
    });
    const { updateProjectStatus } = await import("../repo/projects");
    await updateProjectStatus(project.id, project.audioAssetId ? "audio" : "script", null);
    const newJob = await createJob({ videoProjectId: project.id, channelId: args.channel.id });
    await enqueueJob(newJob.id);
    resumed.push(project.id);
  }

  report("queued", {
    done: resumed.length + skipped.length,
    total: resumed.length + skipped.length,
    detail: `${resumed.length} retomado(s), ${skipped.length} já a correr — sem novo gasto de roteiro`,
  });

  return {
    projectIds: [...resumed, ...skipped],
    resumed,
    skipped,
  };
}
