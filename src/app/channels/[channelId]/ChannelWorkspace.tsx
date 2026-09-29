"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Channel, ContentPlan, VideoProject, VideoFormat, JobStatus, AudioAsset } from "../../../core/types";
import { ProjectCostLabel } from "./ProjectCostLabel";
import { CostsPanel } from "./CostsPanel";
import { PortadasPanel } from "./PortadasPanel";
import { AudioBedControls } from "./AudioBedControls";
import { formatUsd } from "../../../core/usage/types";
import { findVoice } from "../../../core/providers/tts/voiceCatalog";
import { TTSProviderName } from "../../../core/providers/tts/TTSProvider";
import { JUAN_CARLOS_ELEVENLABS_VOICE_ID } from "../../../core/providers/tts/voiceCapabilities";
import { ScriptReviewModal } from "./ScriptReviewModal";
import { mediaUrl } from "../../../core/media";
import { sampleIdeasFromDna, suggestTopicsFromDna } from "../../../core/providers/script/ideaSuggestions";
import {
  CalendarIcon,
  CarouselIcon,
  ChevronRightIcon,
  ClockIcon,
  GearIcon,
  HomeIcon,
  PencilIcon,
  PlayIcon,
  ShortIcon,
} from "../../icons";

const CHANNEL_PAGE_REFERENCE_SRC = "/reference/canal-page.png";
const QUANTITIES = [1, 3, 5, 10];
const AUTO_QUANTITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SCENE_COUNTS = [3, 4, 5, 6, 7, 8] as const;
// "script" = script generated, awaiting human review in the Roteiros tab — it
// sits there until a person acts, so it's not part of the auto-poll set.
const ACTIVE_STATUSES: JobStatus[] = ["planned", "audio", "timing", "composing", "rendering"];
const PIPELINE_PRODUCING: JobStatus[] = ["planned", "audio", "timing", "composing", "rendering"];
type WorkspaceTab = "criar" | "ideias" | "roteiros" | "descricoes" | "audio" | "videos" | "portadas" | "custos";
type CreateMode = "manual" | "auto";

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    start: "Início",
    ideas: "Ideias",
    scripts: "Roteiro",
    youtube: "YouTube",
    audio: "Áudio",
    queued: "Fila",
    music: "Música",
    render: "Vídeo",
    thumbnail: "Portada",
  };
  return map[stage] || stage;
}

type Crop = { x: number; y: number; width: number; height: number };

function ReferenceCrop({ crop, alt }: { crop: Crop; alt: string }) {
  return (
    <span className="workspace-reference-crop" role="img" aria-label={alt} style={{ aspectRatio: `${crop.width} / ${crop.height}` }}>
      <img
        src={CHANNEL_PAGE_REFERENCE_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          width: `${(1536 / crop.width) * 100}%`,
          left: `${(-crop.x / crop.width) * 100}%`,
          top: `${(-crop.y / crop.height) * 100}%`,
        }}
      />
    </span>
  );
}

type MiniIconName = "database" | "globe" | "users" | "speaker" | "hash" | "mic" | "video" | "sparkles" | "doc";

function MiniIcon({ name, size = 20 }: { name: MiniIconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9 };
  if (name === "database") return <svg {...common}><ellipse cx="12" cy="5" rx="7.5" ry="3" /><path d="M4.5 5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5M4.5 11v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" /></svg>;
  if (name === "globe") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9S14.3 18.5 12 21M12 3C9.7 5.5 8.5 8.5 8.5 12S9.7 18.5 12 21" /></svg>;
  if (name === "users") return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2.5c0-2.5 2.4-4.5 5.5-4.5s5.5 2 5.5 4.5V20M15 5.5a3 3 0 0 1 0 5.5M16 13c2.7.4 4.5 2.2 4.5 4.5V20" /></svg>;
  if (name === "speaker") return <svg {...common}><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>;
  if (name === "hash") return <svg {...common}><path d="M9 3 7 21M17 3l-2 18M4 9h16M3 15h16" /></svg>;
  if (name === "mic") return <svg {...common}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8 21h8" /></svg>;
  if (name === "video") return <svg {...common}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>;
  if (name === "doc") return <svg {...common}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>;
  return <svg {...common}><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>;
}

function channelDisplay(channel: Channel) {
  const catalogVoice = channel.dna.voice.voiceId
    ? findVoice(channel.dna.voice.provider as TTSProviderName, channel.dna.voice.voiceId)
    : undefined;
  const voice = !channel.dna.usesNarration
    ? "Sem narração"
    : catalogVoice
      ? `${catalogVoice.name} (${catalogVoice.gender === "feminine" ? "Feminina" : "Masculina"})`
      : `Padrão do provedor (${channel.dna.voice.provider})`;

  return {
    name: channel.name,
    category: channel.niche.split(" • ")[0],
    description: channel.dna.description,
    audience: channel.dna.audience,
    tone: channel.dna.tone.join(", "),
    topics: channel.dna.topics.slice(0, 4).join(", "),
    voice,
    format: channel.dna.usesNarration ? "Vídeo e Short" : "Vídeo ambiente",
  };
}

export function ChannelWorkspace({
  channel,
  initialProjects,
  initialPlans,
  initialAudioAssets = [],
}: {
  channel: Channel;
  initialProjects: VideoProject[];
  initialPlans: ContentPlan[];
  initialAudioAssets?: AudioAsset[];
}) {
  const router = useRouter();
  const display = channelDisplay(channel);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("criar");
  const [portadasFocusId, setPortadasFocusId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode>("manual");
  const [topic, setTopic] = useState("");
  const [quantity, setQuantity] = useState(5);
  const [autoQuantity, setAutoQuantity] = useState(3);
  const [durationKey, setDurationKey] = useState("default");
  const [sceneCount, setSceneCount] = useState(
    channel.dna.scriptRules.defaultSceneCount ?? 4
  );
  const [format, setFormat] = useState<VideoFormat>("video");
  const [ideaAiOverride, setIdeaAiOverride] = useState<"" | "mock" | "anthropic" | "openai" | "gemini">("");
  const [scriptAiOverride, setScriptAiOverride] = useState<"" | "mock" | "anthropic" | "openai" | "gemini">("");
  const [loadingAuto, setLoadingAuto] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoStatus, setAutoStatus] = useState<string | null>(null);
  const [autoLog, setAutoLog] = useState<Array<{ id: string; stage: string; detail: string }>>([]);
  const [autoProjectIds, setAutoProjectIds] = useState<string[]>([]);
  /** Option inside Manual / Automático — not a third create mode. */
  const [includeManchete, setIncludeManchete] = useState(true);
  const [mancheteBankSize] = useState((channel.dna.successfulTitles ?? []).length);
  const [plan, setPlan] = useState<ContentPlan | null>(initialPlans[0] ?? null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set((initialPlans[0]?.items ?? []).filter((item) => item.status === "planned").map((item) => item.id))
  );
  const [sampleSelected, setSampleSelected] = useState<Set<string>>(new Set());
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [ideaError, setIdeaError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [projects, setProjects] = useState<VideoProject[]>(initialProjects);
  const [audioAssets, setAudioAssets] = useState<AudioAsset[]>(initialAudioAssets);
  const [jobByProject, setJobByProject] = useState<Record<string, { progress: number; statusMessage: string; status: string }>>({});
  const [reviewingProject, setReviewingProject] = useState<VideoProject | null>(null);
  const [pendingScriptTitles, setPendingScriptTitles] = useState<string[]>([]);
  const [retryingAudioId, setRetryingAudioId] = useState<string | null>(null);
  const [audioActionMsg, setAudioActionMsg] = useState<string | null>(null);
  const [bedBusyByProject, setBedBusyByProject] = useState<Record<string, string | null>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const durationMinutes = durationKey === "default" ? channel.dna.scriptRules.defaultDurationMinutes : Number(durationKey);
  const hasActiveJobs = Object.values(jobByProject).some((j) =>
    ["planned", "audio", "timing", "composing", "rendering"].includes(j.status)
  );
  const hasActive = projects.some((project) => ACTIVE_STATUSES.includes(project.status)) || hasActiveJobs;

  useEffect(() => {
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(() => {
        void refreshProjects();
        void refreshJobs();
      }, 2000);
      void refreshJobs();
      void refreshProjects();
    }
    if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActive]);

  useEffect(() => {
    if (activeTab === "audio" || activeTab === "roteiros" || activeTab === "videos" || activeTab === "descricoes") {
      void refreshProjects();
      void refreshJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // After auto-flow queues jobs, keep showing live production status on Criar.
  useEffect(() => {
    if (autoProjectIds.length === 0) return;
    const tick = () => {
      void refreshProjects();
      void refreshJobs();
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoProjectIds.join(",")]);

  useEffect(() => {
    if (autoProjectIds.length === 0) return;
    const lines: string[] = [];
    for (const id of autoProjectIds) {
      const project = projects.find((p) => p.id === id);
      const job = jobByProject[id];
      if (!project) continue;
      const title = project.title.slice(0, 36);
      if (job?.statusMessage) {
        lines.push(`${title}: ${job.statusMessage}${job.progress ? ` (${Math.round(job.progress)}%)` : ""}`);
      } else if (project.status === "completed") {
        lines.push(`${title}: pronto`);
      } else if (project.status === "failed") {
        lines.push(`${title}: falhou — ${project.errorMessage?.slice(0, 60) || "erro"}`);
      } else {
        lines.push(`${title}: ${project.status}`);
      }
    }
    if (lines.length > 0) {
      setAutoStatus(lines.join(" · "));
    }
  }, [autoProjectIds, projects, jobByProject]);


  async function refreshProjects() {
    try {
      const response = await fetch(`/api/channels/${channel.id}`);
      const text = await response.text();
      if (!response.ok || !text) return;
      const data = JSON.parse(text) as {
        projects?: VideoProject[];
        audioAssets?: typeof audioAssets;
      };
      if (data.projects) setProjects(data.projects);
      if (data.audioAssets) setAudioAssets(data.audioAssets);
    } catch {
      // Ignore poll/parse errors (empty body, HTML 404 from stale Next instance).
    }
  }

  async function refreshJobs() {
    try {
      const response = await fetch("/api/jobs");
      const text = await response.text();
      if (!response.ok || !text) return;
      const data = JSON.parse(text) as {
        jobs?: Array<{
          channelId: string;
          videoProjectId: string;
          progress?: number;
          statusMessage?: string;
          status?: string;
        }>;
      };
      const map: Record<string, { progress: number; statusMessage: string; status: string }> = {};
      for (const job of data.jobs ?? []) {
        if (job.channelId !== channel.id) continue;
        map[job.videoProjectId] = {
          progress: job.progress ?? 0,
          statusMessage: job.statusMessage ?? "",
          status: job.status ?? "",
        };
      }
      setJobByProject(map);
    } catch {
      // ignore poll errors
    }
  }

  async function handleGenerateIdeas() {
    setLoadingPlan(true);
    setIdeaError(null);
    try {
      const response = await fetch(`/api/channels/${channel.id}/content-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          quantity,
          durationMinutes,
          format,
          aiProviderOverride: ideaAiOverride || null,
          includeManchete,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.plan) {
        throw new Error(data.error ?? `Falha ao gerar ideias (HTTP ${response.status})`);
      }
      setPlan(data.plan);
      setSelectedIds(new Set(data.plan.items.map((item: { id: string }) => item.id)));
      setActiveTab("ideias");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setIdeaError(
        /fetch failed|network|failed to fetch/i.test(raw)
          ? "Falha de rede ao gerar ideias. Espere 2s e tente de novo (às vezes o servidor reinicia no hot-reload)."
          : raw
      );
    } finally {
      setLoadingPlan(false);
    }
  }

  async function handleAutoFlow() {
    setLoadingAuto(true);
    setAutoError(null);
    setAutoLog([]);
    setAutoProjectIds([]);
    setAutoStatus(
      topic.trim()
        ? `A iniciar fluxo automático (${autoQuantity})…`
        : `Sem tópico — a gerar a partir do DNA do canal (${autoQuantity})…`
    );
    try {
      const response = await fetch(`/api/channels/${channel.id}/auto-flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          quantity: autoQuantity,
          durationMinutes,
          format,
          sceneCount,
          aiProviderOverride: ideaAiOverride || null,
          includeManchete,
        }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `Falha no fluxo automático (HTTP ${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let event: {
            type?: string;
            stage?: string;
            detail?: string;
            done?: number;
            total?: number;
            projectId?: string | null;
            projectIds?: string[];
            message?: string;
            error?: string;
            topic?: string;
          };
          try {
            event = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (event.type === "progress") {
            const detail = event.detail || event.stage || "…";
            setAutoStatus(detail);
            setAutoLog((prev) => {
              const next = [
                ...prev,
                {
                  id: `${Date.now()}-${prev.length}`,
                  stage: event.stage || "step",
                  detail,
                },
              ];
              return next.slice(-40);
            });
          } else if (event.type === "done") {
            finished = true;
            setAutoProjectIds(event.projectIds ?? []);
            setAutoStatus(event.message ?? "Na fila de produção");
            setAutoLog((prev) => [
              ...prev,
              {
                id: `${Date.now()}-done`,
                stage: "queued",
                detail: event.message ?? "Na fila",
              },
            ]);
            await refreshProjects();
            await refreshJobs();
          } else if (event.type === "error") {
            throw new Error(event.error ?? "Erro no fluxo automático");
          }
        }
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setAutoError(
        /fetch failed|network|failed to fetch/i.test(raw)
          ? "Falha de rede no fluxo automático. Espera 2s e tenta de novo."
          : raw
      );
    } finally {
      setLoadingAuto(false);
    }
  }

  async function handleRemoveIdea(ideaId: string) {
    await fetch(`/api/content-ideas/${ideaId}`, { method: "DELETE" });
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.delete(ideaId);
      return next;
    });
    setPlan((previous) => previous ? {
      ...previous,
      items: previous.items.map((item) => item.id === ideaId ? { ...item, status: "removed" } : item),
    } : previous);
  }

  async function handleGenerateScripts() {
    if (!plan || selectedIds.size === 0) return;
    setGenerating(true);
    setScriptError(null);
    const titles = visibleIdeas
      .filter((idea) => selectedIds.has(idea.id))
      .map((idea) => idea.title);
    setPendingScriptTitles(titles);
    setActiveTab("roteiros");
    try {
      const response = await fetch(`/api/channels/${channel.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          ideaIds: Array.from(selectedIds),
          aiProviderOverride: scriptAiOverride || null,
          sceneCount,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `Falha ao gerar roteiros (HTTP ${response.status})`);
      await refreshProjects();
      setActiveTab("roteiros");
    } catch (err) {
      setScriptError(err instanceof Error ? err.message : String(err));
      setActiveTab("ideias");
    } finally {
      setPendingScriptTitles([]);
      setGenerating(false);
    }
  }

  async function handleDelete(projectId: string) {
    await fetch(`/api/videos/${projectId}`, { method: "DELETE" });
    setProjects((previous) => previous.filter((project) => project.id !== projectId));
  }

  async function handleRegenerate(projectId: string) {
    await fetch(`/api/videos/${projectId}/regenerate`, { method: "POST" });
    await refreshProjects();
  }

  /** Failed audio card: re-approve with Juan Carlos voice_id and show clear feedback. */
  async function handleRetryAudio(project: VideoProject) {
    setRetryingAudioId(project.id);
    setAudioActionMsg(null);
    try {
      const juanCarlosId =
        channel.dna.voice.profile?.elevenlabs_voice_id || JUAN_CARLOS_ELEVENLABS_VOICE_ID;
      const providerOverride =
        project.ttsProviderOverride === "elevenlabs" ||
        channel.dna.voice.provider === "heygen" ||
        !project.ttsProviderOverride
          ? "elevenlabs"
          : project.ttsProviderOverride;
      const voiceOverride =
        project.ttsVoiceIdOverride?.trim() ||
        (providerOverride === "elevenlabs" ? juanCarlosId : null);

      const response = await fetch(`/api/videos/${project.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ttsProviderOverride: providerOverride,
          ttsVoiceIdOverride: voiceOverride,
        }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(data.error ?? `Falha ao regenerar áudio (HTTP ${response.status})`);
      }
      if (data.project) {
        setProjects((previous) =>
          previous.map((p) => (p.id === data.project.id ? data.project : p))
        );
      } else {
        setProjects((previous) =>
          previous.map((p) =>
            p.id === project.id
              ? { ...p, status: "audio", errorMessage: null }
              : p
          )
        );
      }
      setAudioActionMsg(`A regenerar áudio: «${project.title}»…`);
      await refreshJobs();
      await refreshProjects();
    } catch (err) {
      setAudioActionMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingAudioId(null);
    }
  }

  async function handleRefreshAudioStatus() {
    setAudioActionMsg("A atualizar estado…");
    await Promise.all([refreshProjects(), refreshJobs()]);
    setAudioActionMsg("Estado atualizado.");
    window.setTimeout(() => setAudioActionMsg(null), 2500);
  }

  const planIdeas = (plan?.items ?? []).filter((item) => item.status !== "removed");
  const usingSamples = planIdeas.length === 0;
  const dnaSampleIdeas = sampleIdeasFromDna(channel, 3);
  const dnaTopicSuggestions = suggestTopicsFromDna(channel, 6);
  const topicPlaceholder =
    channel.dna.language === "es"
      ? dnaTopicSuggestions[0]
        ? `Ej.: ${dnaTopicSuggestions[0]}…`
        : "Ej.: que regrese desesperado esta noche…"
      : dnaTopicSuggestions[0]
        ? `Ex.: ${dnaTopicSuggestions[0]}…`
        : "Ex.: assunto alinhado ao DNA deste canal…";
  const visibleIdeas = usingSamples
    ? dnaSampleIdeas
    : planIdeas.map((item) => ({ id: item.id, title: item.title, angle: item.angle, objective: item.objective }));
  const activeSelection = usingSamples ? sampleSelected : selectedIds;
  const allSelected = visibleIdeas.length > 0 && visibleIdeas.every((idea) => activeSelection.has(idea.id));

  const reviewProjects = projects.filter(
    (p) =>
      p.status === "script" ||
      // Keep voice/audio failures visible here so the script doesn't "disappear"
      // after Aprovar — user can reopen and retry.
      (p.status === "failed" && Boolean(p.scriptId))
  );
  const publishProjects = projects.filter((p) => Boolean(p.headline || p.youtubeDescription));
  const projectsByIdeaId = new Map(
    projects.filter((p) => p.contentIdeaId).map((p) => [p.contentIdeaId!, p])
  );
  const audioById = new Map(audioAssets.map((a) => [a.id, a]));
  const audioProjects = projects.filter(
    (p) =>
      p.status !== "script" &&
      (PIPELINE_PRODUCING.includes(p.status) ||
        Boolean(p.audioAssetId) ||
        ["completed", "failed"].includes(p.status))
  );
  const audioBusyCount = projects.filter(
    (p) => PIPELINE_PRODUCING.includes(p.status)
  ).length;
  const scriptBusyCount = pendingScriptTitles.length;
  const videoProjects = projects.filter((p) => p.status === "completed" || p.status === "rendering" || p.status === "composing");

  function productionLabel(project: VideoProject, job?: { progress: number; statusMessage: string; status: string }) {
    // Prefer live job progress — leaving Áudio must still show "Renderizando…".
    if (job?.status === "rendering" || project.status === "rendering") {
      const msg = job?.statusMessage?.trim() || "Renderizando vídeo…";
      const pct = job?.progress ? ` · ${Math.round(job.progress)}%` : "";
      return { text: `${msg}${pct}`, kind: "working" as const };
    }
    if (job?.status === "composing" || project.status === "composing") {
      return { text: job?.statusMessage?.trim() || "Preparando composição…", kind: "working" as const };
    }
    if (project.status === "failed") {
      // Audio may already exist when a later step crashed (e.g. broken .next chunk).
      if (project.audioAssetId) {
        return { text: "Áudio pronto (etapa seguinte falhou)", kind: "failed" as const };
      }
      return { text: job?.statusMessage || project.errorMessage || "Falhou", kind: "failed" as const };
    }
    if (project.status === "completed") {
      return { text: "Concluído", kind: "done" as const };
    }
    if (project.audioAssetId && !PIPELINE_PRODUCING.includes(project.status)) {
      return { text: "Áudio pronto", kind: "done" as const };
    }
    const msg = job?.statusMessage?.trim();
    if (job?.status === "planned" || project.status === "planned") {
      return { text: msg || "Na fila de produção…", kind: "working" as const };
    }
    if (project.status === "audio" || job?.status === "audio") {
      return { text: msg || "Gerando áudio…", kind: "working" as const };
    }
    if (project.status === "timing" || job?.status === "timing") {
      return { text: msg || "Sincronizando texto…", kind: "working" as const };
    }
    return { text: msg || "Em produção…", kind: "working" as const };
  }

  function toggleIdea(id: string, checked: boolean) {
    const setter = usingSamples ? setSampleSelected : setSelectedIds;
    setter((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    const setter = usingSamples ? setSampleSelected : setSelectedIds;
    setter(checked ? new Set(visibleIdeas.map((idea) => idea.id)) : new Set());
  }

  const videoBusyCount = projects.filter(
    (p) => p.status === "rendering" || jobByProject[p.id]?.status === "rendering"
  ).length;
  const producingAnywhere =
    audioBusyCount > 0 ||
    videoBusyCount > 0 ||
    projects.some((p) => PIPELINE_PRODUCING.includes(p.status));

  return (
    <div className="channel-workspace">
      <nav className="channel-breadcrumb" aria-label="Navegação estrutural">
        <Link href="/"><HomeIcon size={16} /> <span>Canais</span></Link>
        <ChevronRightIcon size={16} />
        <strong>{display.name}</strong>
      </nav>

      <header className="channel-profile-header">
        <div className="channel-profile-main">
          <div className="channel-profile-cover">
            <ReferenceCrop crop={{ x: 254, y: 56, width: 167, height: 133 }} alt={`Capa de ${display.name}`} />
            <Link href={`/channels/${channel.id}/edit`} className="cover-edit-button" aria-label="Editar capa">
              <PencilIcon size={16} />
            </Link>
          </div>
          <div className="channel-profile-copy">
            <div className="channel-name-line">
              <h1>{display.name}</h1>
              <Link href={`/channels/${channel.id}/edit`} aria-label="Editar nome do canal"><PencilIcon size={18} /></Link>
            </div>
            <span className="workspace-category">{display.category}</span>
            <p>{display.description}</p>
          </div>
        </div>

        <aside className="channel-dna-card">
          <div className="dna-card-copy">
            <span className="dna-icon"><MiniIcon name="database" size={24} /></span>
            <span>
              <strong>DNA do canal</strong>
              <small>Contexto, estilo, tom, público, temas e<br /> configurações do canal para geração de conteúdo.</small>
            </span>
          </div>
          <Link href={`/channels/${channel.id}/edit`} className="dna-edit-button"><GearIcon size={19} /> Editar DNA do canal</Link>
        </aside>
      </header>

      <nav className="workspace-tabs" aria-label="Seções do canal">
        <button type="button" className={activeTab === "criar" ? "active" : ""} onClick={() => setActiveTab("criar")}>Criar conteúdo</button>
        <button type="button" className={activeTab === "ideias" ? "active" : ""} onClick={() => setActiveTab("ideias")}>Ideias</button>
        <button type="button" className={activeTab === "roteiros" ? "active" : ""} onClick={() => setActiveTab("roteiros")}>
          Roteiros
          {(scriptBusyCount > 0 || reviewProjects.length > 0) && (
            <span className="tab-badge">{scriptBusyCount > 0 ? scriptBusyCount : reviewProjects.length}</span>
          )}
        </button>
        <button type="button" className={activeTab === "descricoes" ? "active" : ""} onClick={() => setActiveTab("descricoes")}>
          Descrições YT
          {publishProjects.length > 0 && (
            <span className="tab-badge">{publishProjects.length}</span>
          )}
        </button>
        <button type="button" className={activeTab === "audio" ? "active" : ""} onClick={() => setActiveTab("audio")}>
          Áudio{(audioBusyCount > 0 || videoBusyCount > 0) && (
            <span className="tab-badge">{audioBusyCount + videoBusyCount}</span>
          )}
        </button>
        <button type="button" className={activeTab === "videos" ? "active" : ""} onClick={() => setActiveTab("videos")}>
          Vídeos
          {videoBusyCount > 0 && <span className="tab-badge">{videoBusyCount}</span>}
        </button>
        <button type="button" className={activeTab === "portadas" ? "active" : ""} onClick={() => setActiveTab("portadas")}>Portadas</button>
        <button type="button" className={activeTab === "custos" ? "active" : ""} onClick={() => setActiveTab("custos")}>Custos</button>
        <button type="button" disabled title="Ainda não implementado">Estatísticas</button>
        <button type="button" onClick={() => router.push(`/channels/${channel.id}/edit`)}>Configurações</button>
      </nav>

      {producingAnywhere && (
        <div className="production-banner workspace-global-progress" role="status" aria-live="polite">
          <span className="production-spinner" aria-hidden />
          {videoBusyCount > 0
            ? `${videoBusyCount} vídeo${videoBusyCount > 1 ? "s" : ""} a renderizar — podes mudar de aba; o progresso continua.`
            : `${audioBusyCount} produção${audioBusyCount > 1 ? "ões" : ""} em andamento — atualizando a cada 2s.`}
          {projects
            .filter((p) => PIPELINE_PRODUCING.includes(p.status) || jobByProject[p.id]?.status === "rendering")
            .slice(0, 2)
            .map((p) => {
              const job = jobByProject[p.id];
              const msg = job?.statusMessage || productionLabel(p, job).text;
              return (
                <span key={p.id} className="workspace-global-progress-item">
                  {p.title.slice(0, 36)}{p.title.length > 36 ? "…" : ""}: {msg}
                  {job?.progress ? ` (${Math.round(job.progress)}%)` : ""}
                </span>
              );
            })}
        </div>
      )}

      {activeTab === "criar" && (
        <div className="creation-layout">
          <section className="creation-card">
            <div className="workspace-section-title">
              <h2>O que vamos criar hoje?</h2>
              <p>Sugestões e ideias geradas a partir do DNA deste canal ({channel.name}).</p>
            </div>

            <div className="create-mode-toggle" role="group" aria-label="Modo de criação">
              <button
                type="button"
                className={createMode === "manual" ? "active" : ""}
                onClick={() => setCreateMode("manual")}
              >
                Manual (passo a passo)
              </button>
              <button
                type="button"
                className={createMode === "auto" ? "active" : ""}
                onClick={() => setCreateMode("auto")}
              >
                Automático (1–10 vídeos)
              </button>
            </div>

            <div className="topic-field">
              <textarea
                value={topic}
                maxLength={500}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={
                  channel.dna.language === "es"
                    ? "Opcional — vacío = generar desde el DNA (títulos de éxito)…"
                    : "Opcional — vazio = gerar a partir do DNA (títulos de sucesso)…"
                }
                aria-label="Assunto opcional para geração"
              />
              <span>{topic.length}/500</span>
            </div>
            {dnaTopicSuggestions.length > 0 && (
              <div className="dna-topic-suggestions" aria-label="Sugestões do DNA do canal">
                <span className="dna-topic-suggestions-label">Sugestões do DNA (opcional)</span>
                <div className="dna-topic-chips">
                  {dnaTopicSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className={topic.trim() === suggestion ? "active" : ""}
                      onClick={() => setTopic(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="create-manchete-option">
              <input
                type="checkbox"
                checked={includeManchete}
                onChange={(e) => setIncludeManchete(e.target.checked)}
              />
              <span>
                Gerar manchete YT automaticamente
                <small>
                  Padrão do DNA ({mancheteBankSize} títulos de sucesso). Tema opcional — sem texto, inventa sozinho.
                </small>
              </span>
            </label>

            <div className="creation-controls">
              {createMode === "manual" ? (
                <label>
                  <span>Quantidade de vídeos</span>
                  <select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>
                    {QUANTITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              ) : (
                <label>
                  <span>Vídeos automáticos</span>
                  <select value={autoQuantity} onChange={(event) => setAutoQuantity(Number(event.target.value))}>
                    {AUTO_QUANTITIES.map((value) => (
                      <option key={value} value={value}>
                        {value} vídeo{value > 1 ? "s" : ""} completo{value > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <span>Duração por vídeo</span>
                <select value={durationKey} onChange={(event) => setDurationKey(event.target.value)}>
                  <option value="default">{channel.dna.scriptRules.defaultDurationMinutes} minutos</option>
                  <option value="5">5 minutos</option>
                  <option value="10">10 minutos</option>
                  <option value="15">15 minutos</option>
                </select>
              </label>
              <label>
                <span>Cenas do roteiro</span>
                <select value={sceneCount} onChange={(event) => setSceneCount(Number(event.target.value))}>
                  {SCENE_COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {n} cenas{n === (channel.dna.scriptRules.defaultSceneCount ?? 4) ? " (padrão do canal)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="format-control">
                <span>Formato</span>
                <div>
                  <button type="button" className={format === "video" ? "active" : ""} onClick={() => setFormat("video")}><PlayIcon size={18} /> Vídeo</button>
                  <button type="button" className={format === "short" ? "active" : ""} onClick={() => setFormat("short")}><ShortIcon size={15} /> Short</button>
                  <button type="button" className={format === "both" ? "active" : ""} onClick={() => setFormat("both")}><CarouselIcon size={18} /> Vídeo + Short</button>
                </div>
              </div>
              {createMode === "manual" ? (
                <button
                  type="button"
                  className="generate-ideas-button"
                  disabled={loadingPlan}
                  onClick={handleGenerateIdeas}
                >
                  <MiniIcon name="sparkles" size={22} />
                  {loadingPlan
                    ? includeManchete
                      ? "Gerando ideias + manchetes…"
                      : "Gerando ideias..."
                    : topic.trim()
                      ? includeManchete
                        ? "Gerar ideias + manchetes YT"
                        : "Gerar ideias de vídeos"
                      : includeManchete
                        ? "Gerar do DNA (ideias + manchetes)"
                        : "Gerar ideias do DNA"}
                </button>
              ) : (
                <button
                  type="button"
                  className="generate-ideas-button generate-auto-button"
                  disabled={loadingAuto}
                  onClick={() => { void handleAutoFlow(); }}
                >
                  <MiniIcon name="sparkles" size={22} />
                  {loadingAuto
                    ? "A gerar fluxo automático…"
                    : topic.trim()
                      ? `Gerar ${autoQuantity} vídeo${autoQuantity > 1 ? "s" : ""} completo${autoQuantity > 1 ? "s" : ""}`
                      : `Gerar ${autoQuantity} do DNA (sem tópico)`}
                </button>
              )}
            </div>
            {createMode === "auto" && (
              <p className="auto-flow-hint">
                Um clique: {includeManchete ? "manchete + descrição YT → " : ""}roteiro → voz Juan Carlos → vídeo (texto rolante) → portada.
                Tema opcional — vazio usa o DNA do canal.
              </p>
            )}
            {createMode === "manual" && (
              <p className="auto-flow-hint">
                Gera ideias{includeManchete ? " com manchetes no padrão do DNA" : ""} e segue para a aba Ideias → Roteiros.
                Tema opcional.
              </p>
            )}
            {(loadingAuto || autoLog.length > 0 || autoStatus) && createMode === "auto" && (
              <div className="auto-progress-panel" role="status" aria-live="polite">
                <div className="auto-progress-head">
                  {loadingAuto && <span className="production-spinner" aria-hidden />}
                  <strong>{loadingAuto ? "Em progresso" : "Último fluxo"}</strong>
                  {autoStatus && <span className="auto-progress-current">{autoStatus}</span>}
                </div>
                {autoLog.length > 0 && (
                  <ol className="auto-progress-log">
                    {autoLog.slice(-12).map((item) => (
                      <li key={item.id}>
                        <span className="auto-progress-stage">{stageLabel(item.stage)}</span>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {autoProjectIds.length > 0 && !loadingAuto && (
                  <p className="auto-progress-follow">
                    Produção a correr — podes abrir{" "}
                    <button type="button" onClick={() => setActiveTab("audio")}>Áudio</button>,{" "}
                    <button type="button" onClick={() => setActiveTab("videos")}>Vídeos</button> ou{" "}
                    <button type="button" onClick={() => setActiveTab("descricoes")}>Descrições YT</button>.
                  </p>
                )}
              </div>
            )}
            {autoError && <div className="generation-error">{autoError}</div>}
            {ideaError && <div className="generation-error">{ideaError}</div>}

            <div className="voice-row">
              <MiniIcon name="sparkles" size={24} />
              <span className="voice-label">IA para gerar as ideias</span>
              <select
                value={ideaAiOverride}
                onChange={(event) => {
                  const next = event.target.value as typeof ideaAiOverride;
                  setIdeaAiOverride(next);
                  // Keep script IA in sync so "ChatGPT nas ideias" também gera o roteiro com ChatGPT.
                  setScriptAiOverride(next);
                }}
              >
                <option value="">Padrão do sistema (AI_PROVIDER)</option>
                <option value="mock">Mock (sem IA, offline)</option>
                <option value="anthropic">Claude (Anthropic)</option>
                <option value="openai">ChatGPT (OpenAI)</option>
                <option value="gemini">Gemini (Google)</option>
              </select>
              <label className="voice-toggle-label">
                <span>Usar outra IA apenas nesta geração</span>
                <input
                  type="checkbox"
                  checked={Boolean(ideaAiOverride)}
                  onChange={(event) => {
                    const next = event.target.checked ? "openai" : "";
                    setIdeaAiOverride(next);
                    setScriptAiOverride(next);
                  }}
                />
                <i />
              </label>
            </div>
          </section>

          <aside className="channel-summary-card">
            <div className="summary-heading">
              <h2>Resumo do canal</h2>
              <Link href={`/channels/${channel.id}/edit`}>Ver detalhes <span>→</span></Link>
            </div>
            <div className="summary-list">
              <div className="summary-row"><div className="summary-key"><MiniIcon name="globe" /><span>Idioma</span></div><div className="summary-value">Português</div></div>
              <div className="summary-row"><div className="summary-key"><MiniIcon name="users" /><span>Público</span></div><div className="summary-value">{display.audience}</div></div>
              <div className="summary-row"><div className="summary-key"><MiniIcon name="speaker" /><span>Tom</span></div><div className="summary-value">{display.tone}</div></div>
              <div className="summary-row"><div className="summary-key"><MiniIcon name="hash" /><span>Temas principais</span></div><div className="summary-value">{display.topics}</div></div>
              <div className="summary-row"><div className="summary-key"><ClockIcon size={20} /><span>Duração padrão</span></div><div className="summary-value">{channel.dna.scriptRules.defaultDurationMinutes} minutos</div></div>
              <div className="summary-row"><div className="summary-key"><MiniIcon name="mic" /><span>Voz padrão</span></div><div className="summary-value">{display.voice}</div></div>
              <div className="summary-row"><div className="summary-key"><MiniIcon name="video" /><span>Formato preferido</span></div><div className="summary-value">{display.format}</div></div>
            </div>
          </aside>
        </div>
      )}

      {activeTab === "ideias" && (
        <section className="suggested-ideas-section">
          <div className="ideas-heading">
            <div className="workspace-section-title">
              <h2>Ideias de vídeos sugeridas</h2>
              <p>Selecione as ideias que quer transformar em roteiro e escolha qual IA vai escrever.</p>
            </div>
            <div className="ideas-actions">
              <label className="select-all"><input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} /> <span>Selecionar todos</span></label>
              <label className="ideas-scene-select">
                <span className="sr-only">Cenas</span>
                <select
                  value={sceneCount}
                  onChange={(event) => setSceneCount(Number(event.target.value))}
                  aria-label="Quantidade de cenas do roteiro"
                >
                  {SCENE_COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {n} cenas (≤4.8k chars)
                    </option>
                  ))}
                </select>
              </label>
              <select
                className="ideas-ai-select"
                value={scriptAiOverride}
                onChange={(event) => setScriptAiOverride(event.target.value as typeof scriptAiOverride)}
                aria-label="IA para gerar o roteiro"
              >
                <option value="">IA do roteiro: padrão do sistema</option>
                <option value="mock">IA do roteiro: Mock</option>
                <option value="anthropic">IA do roteiro: Claude</option>
                <option value="openai">IA do roteiro: ChatGPT</option>
                <option value="gemini">IA do roteiro: Gemini</option>
              </select>
              <button type="button" disabled={usingSamples || selectedIds.size === 0 || generating} onClick={handleGenerateScripts}>
                {generating ? "Enviando para revisão..." : "Gerar roteiros selecionados"} <span>→</span>
              </button>
            </div>
          </div>
          {scriptError && <div className="generation-error">{scriptError}</div>}

          <div className="ideas-grid">
            {visibleIdeas.map((idea) => {
              const linked = !usingSamples ? projectsByIdeaId.get(idea.id) : undefined;
              const pending = pendingScriptTitles.includes(idea.title);
              const ideaStatus = pending
                ? { text: "Gerando roteiro…", kind: "working" as const }
                : linked?.status === "script"
                  ? { text: "Pronto para revisar", kind: "done" as const }
                  : linked && PIPELINE_PRODUCING.includes(linked.status)
                    ? { text: "Em produção…", kind: "working" as const }
                    : linked?.audioAssetId || linked?.status === "completed"
                      ? { text: "Já gerado", kind: "done" as const }
                      : null;
              return (
              <article className={`idea-card${ideaStatus ? " idea-card-has-status" : ""}`} key={idea.id}>
                <input
                  className="idea-checkbox"
                  type="checkbox"
                  checked={activeSelection.has(idea.id)}
                  onChange={(event) => toggleIdea(idea.id, event.target.checked)}
                  aria-label={`Selecionar ${idea.title}`}
                />
                <div className="idea-copy">
                  <h3>{idea.title}</h3>
                  <p className="idea-angle">{idea.angle}</p>
                  {idea.objective && <p className="idea-objective">{idea.objective}</p>}
                  {ideaStatus && (
                    <span className={`workspace-rendered ${ideaStatus.kind}`}>
                      <i /> {ideaStatus.text}
                    </span>
                  )}
                </div>
                {!usingSamples && <button type="button" className="idea-remove" onClick={() => handleRemoveIdea(idea.id)} aria-label={`Remover ${idea.title}`}>×</button>}
              </article>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "roteiros" && (
        <section className="review-queue-section">
          <div className="workspace-section-title">
            <h2>Roteiros aguardando revisão</h2>
            <p>Leia cada roteiro, aprove escolhendo a voz, peça outra versão ou exclua.</p>
          </div>

          {scriptBusyCount > 0 && (
            <div className="production-banner" role="status">
              <span className="production-spinner" aria-hidden />
              Gerando {scriptBusyCount} roteiro{scriptBusyCount > 1 ? "s" : ""} com o DNA do canal… isso pode levar alguns minutos.
            </div>
          )}

          {reviewProjects.length === 0 && scriptBusyCount === 0 ? (
            <div className="review-empty-state">
              Nenhum roteiro aguardando revisão. Gere roteiros na aba <button type="button" onClick={() => setActiveTab("ideias")}>Ideias</button>.
            </div>
          ) : (
            <div className="review-queue-list">
              {pendingScriptTitles.map((title) => (
                <article className="review-queue-card review-queue-card-pending" key={`pending-${title}`}>
                  <div className="review-queue-icon"><MiniIcon name="doc" size={22} /></div>
                  <div className="review-queue-copy">
                    <h3>{title}</h3>
                    <p>{sceneCount} cenas · gerando com IA…</p>
                    <span className="workspace-rendered working"><i /> Escrevendo roteiro…</span>
                  </div>
                  <button type="button" disabled>Aguarde</button>
                </article>
              ))}
              {reviewProjects.map((project) => (
                <article className="review-queue-card" key={project.id}>
                  {project.thumbnailRef ? (
                    <div className="review-queue-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(channel.id, project.thumbnailRef) ?? undefined} alt="" />
                    </div>
                  ) : (
                    <div className="review-queue-icon"><MiniIcon name="doc" size={22} /></div>
                  )}
                  <div className="review-queue-copy">
                    <h3>{project.title}</h3>
                    <p>{project.topic} · {project.durationMinutes} min · {project.format}</p>
                    <span className={`workspace-rendered ${project.status === "failed" ? "failed" : "done"}`}>
                      <i />{" "}
                      {project.status === "failed"
                        ? project.errorMessage?.slice(0, 80) || "Falhou — reabrir para tentar de novo"
                        : "Pronto para revisar"}
                    </span>
                    <ProjectCostLabel project={project} alwaysShow />
                  </div>
                  <div className="review-queue-actions-stack">
                    <button type="button" onClick={() => setReviewingProject(project)}>
                      {project.status === "failed" ? "Reabrir e aprovar" : "Ler e revisar"}
                    </button>
                    <button
                      type="button"
                      className="review-queue-secondary"
                      onClick={() => {
                        setPortadasFocusId(project.id);
                        setActiveTab("portadas");
                      }}
                    >
                      {project.thumbnailRef ? "Ver portada" : "Gerar portada"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "descricoes" && (
        <section className="review-queue-section">
          <div className="workspace-section-title">
            <h2>Descrições YouTube</h2>
            <p>Manchete (título) e descrição geradas no fluxo automático — copia para colar no YT.</p>
          </div>
          {publishProjects.length === 0 ? (
            <div className="review-empty-state">
              Ainda sem descrições. Usa{" "}
              <button type="button" onClick={() => { setCreateMode("auto"); setActiveTab("criar"); }}>
                Criar → Automático
              </button>{" "}
              para gerar manchete + descrição com cada vídeo.
            </div>
          ) : (
            <div className="yt-desc-list">
              {publishProjects.map((project) => (
                <article className="yt-desc-card" key={project.id}>
                  <header>
                    <h3>{project.title}</h3>
                    <span className={`workspace-rendered ${project.status === "completed" ? "done" : project.status === "failed" ? "failed" : "working"}`}>
                      <i /> {project.status}
                    </span>
                  </header>
                  <label className="yt-desc-field">
                    <span>Manchete (título YT)</span>
                    <textarea
                      readOnly
                      rows={2}
                      value={project.headline ?? ""}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      type="button"
                      className="yt-copy-btn"
                      onClick={() => {
                        void navigator.clipboard.writeText(project.headline ?? "");
                      }}
                    >
                      Copiar manchete
                    </button>
                  </label>
                  <label className="yt-desc-field">
                    <span>Descrição</span>
                    <textarea
                      readOnly
                      rows={8}
                      value={project.youtubeDescription ?? ""}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      type="button"
                      className="yt-copy-btn"
                      onClick={() => {
                        void navigator.clipboard.writeText(project.youtubeDescription ?? "");
                      }}
                    >
                      Copiar descrição
                    </button>
                  </label>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "audio" && (
        <section className="review-queue-section">
          <div className="workspace-section-title">
            <h2>Áudios do canal</h2>
            <p>Acompanhe a geração TTS (ElevenLabs/Cartesia/local): status, duração e custo estimado.</p>
          </div>
          {audioBusyCount > 0 && (
            <div className="production-banner" role="status">
              <span className="production-spinner" aria-hidden />
              {audioBusyCount} produção{audioBusyCount > 1 ? "ões" : ""} em andamento — atualizando a cada 2s.
            </div>
          )}
          {audioProjects.length === 0 ? (
            <div className="review-empty-state">
              Nenhum áudio ainda. Aprove um roteiro na aba{" "}
              <button type="button" onClick={() => setActiveTab("roteiros")}>Roteiros</button> para gerar.
            </div>
          ) : (
            <div className="review-queue-list">
              {audioActionMsg && (
                <p
                  className={`workspace-inline-feedback${/falha|erro|sem voice|HTTP/i.test(audioActionMsg) ? " is-error" : ""}`}
                  role="status"
                >
                  {audioActionMsg}
                </p>
              )}
              {audioProjects.map((project) => {
                const asset = project.audioAssetId ? audioById.get(project.audioAssetId) : undefined;
                const job = jobByProject[project.id];
                const audioCost = project.costBreakdown?.audio ?? 0;
                const status = productionLabel(project, job);
                const generatingAudio = status.kind === "working" || retryingAudioId === project.id;
                const canRetryFailed = project.status === "failed" && Boolean(project.scriptId) && !asset;
                const voiceUrl = asset ? mediaUrl(channel.id, asset.filePath) : null;
                const openUrl = project.mixAudioRef
                  ? mediaUrl(channel.id, project.mixAudioRef)
                  : voiceUrl;
                const bedBusy = bedBusyByProject[project.id] ?? null;
                const cardBusy = generatingAudio || Boolean(bedBusy);
                return (
                  <article className={`review-queue-card review-queue-card-audio${cardBusy ? " is-producing" : ""}`} key={project.id}>
                    {project.thumbnailRef ? (
                      <div className="review-queue-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaUrl(channel.id, project.thumbnailRef) ?? undefined} alt="" />
                      </div>
                    ) : (
                      <div className="review-queue-icon"><MiniIcon name="mic" size={22} /></div>
                    )}
                    <div className="review-queue-copy">
                      <h3>{project.title}</h3>
                      <p>
                        {asset?.provider ?? project.ttsProviderOverride ?? channel.dna.voice.provider}
                        {asset ? ` · ${formatDuration(asset.durationSeconds)}` : ""}
                        {audioCost > 0 ? ` · áudio ${formatUsd(audioCost)}` : ""}
                        {project.costUsdTotal != null && project.costUsdTotal > 0
                          ? ` · total ${formatUsd(project.costUsdTotal)}`
                          : ""}
                      </p>
                      <span className={`workspace-rendered ${bedBusy || generatingAudio ? "working" : status.kind}`}>
                        <i />{" "}
                        {bedBusy
                          ? bedBusy
                          : retryingAudioId === project.id
                            ? "A regenerar áudio…"
                            : status.text}
                        {generatingAudio && job && retryingAudioId !== project.id && !bedBusy
                          ? ` · ${Math.round(job.progress)}%`
                          : ""}
                      </span>
                      <ProjectCostLabel project={project} alwaysShow />
                      {asset && (
                        <AudioBedControls
                          channelId={channel.id}
                          project={project}
                          voiceUrl={voiceUrl}
                          onBusyChange={(label) => {
                            setBedBusyByProject((prev) => {
                              if ((prev[project.id] ?? null) === label) return prev;
                              return { ...prev, [project.id]: label };
                            });
                          }}
                          onUpdated={(updated) => {
                            setProjects((previous) =>
                              previous.map((p) => (p.id === updated.id ? updated : p))
                            );
                          }}
                        />
                      )}
                    </div>
                    {openUrl ? (
                      <div className="review-queue-action-pair">
                        <a className="review-queue-action" href={openUrl} target="_blank" rel="noreferrer">
                          {project.mixAudioRef ? "Abrir mix" : "Abrir áudio"}
                        </a>
                        <button
                          type="button"
                          className="review-queue-action review-queue-action-video"
                          disabled={Boolean(bedBusy) || generatingAudio}
                          onClick={() => {
                            setBedBusyByProject((prev) => ({ ...prev, [project.id]: "A renderizar vídeo…" }));
                            // Optimistic: keep progress visible on any tab via poll.
                            setProjects((previous) =>
                              previous.map((p) =>
                                p.id === project.id ? { ...p, status: "rendering", errorMessage: null } : p
                              )
                            );
                            setJobByProject((prev) => ({
                              ...prev,
                              [project.id]: {
                                progress: 10,
                                statusMessage: "Renderizando vídeo (só voz)…",
                                status: "rendering",
                              },
                            }));
                            void fetch(`/api/videos/${project.id}/render-style`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                styleId: "scrolling-text",
                                presetId: "amor-amor",
                                aspectRatio: "9:16",
                                audioSource: "voice",
                              }),
                            })
                              .then(async (res) => {
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                                if (data.project) {
                                  setProjects((previous) =>
                                    previous.map((p) => (p.id === data.project.id ? data.project : p))
                                  );
                                }
                                setAudioActionMsg(`Vídeo gerado: ${project.title.slice(0, 40)}`);
                                setActiveTab("videos");
                              })
                              .catch((err) => {
                                setAudioActionMsg(
                                  err instanceof Error ? err.message : "Falha ao gerar vídeo"
                                );
                                void refreshProjects();
                                void refreshJobs();
                              })
                              .finally(() => {
                                setBedBusyByProject((prev) => ({ ...prev, [project.id]: null }));
                              });
                          }}
                          title="Gera o vídeo com texto rolante usando só a voz (sem música)"
                        >
                          {bedBusy?.includes("vídeo") || bedBusy?.includes("render")
                            ? "A gerar…"
                            : "Gerar vídeo"}
                        </button>
                      </div>
                    ) : asset ? (
                      <span className="review-queue-action review-queue-action-muted" title="Arquivo só existia no disco da máquina que gerou; gere de novo para subir ao Supabase.">
                        Indisponível
                      </span>
                    ) : canRetryFailed ? (
                      <button
                        type="button"
                        className="review-queue-action"
                        disabled={retryingAudioId === project.id}
                        onClick={() => { void handleRetryAudio(project); }}
                        title="Volta a gerar o áudio com a voz Juan Carlos (ElevenLabs)"
                      >
                        {retryingAudioId === project.id ? "A regenerar…" : "Tentar de novo"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="review-queue-action"
                        disabled={generatingAudio}
                        onClick={() => { void handleRefreshAudioStatus(); }}
                        title="Atualiza o progresso desta produção"
                      >
                        {generatingAudio ? "Produzindo…" : "Atualizar"}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === "videos" && (
        <section className="channel-videos-section" id="channel-videos">
          <div className="videos-heading">
            <h2>Últimos vídeos do canal</h2>
            <Link href="/renders">Ver todos <span>→</span></Link>
          </div>
          {videoProjects.length === 0 ? (
            <div className="review-empty-state">
              Nenhum vídeo real ainda. Quando o render terminar, aparece aqui.
            </div>
          ) : (
            <div className="workspace-videos-grid">
              {videoProjects.slice(0, 12).map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  channel={channel}
                  onDelete={handleDelete}
                  onRegenerate={handleRegenerate}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "portadas" && (
        <PortadasPanel
          channel={channel}
          projects={projects}
          focusProjectId={portadasFocusId}
          onProjectUpdated={(updated) => {
            setProjects((previous) => previous.map((p) => (p.id === updated.id ? updated : p)));
          }}
        />
      )}

      {activeTab === "custos" && <CostsPanel channelId={channel.id} />}

      {reviewingProject && (
        <ScriptReviewModal
          project={reviewingProject}
          channel={channel}
          onClose={() => setReviewingProject(null)}
          onApproved={(updated) => {
            setProjects((previous) =>
              previous.map((p) =>
                p.id === updated.id
                  ? { ...updated, status: updated.status === "script" ? "audio" : updated.status }
                  : p
              )
            );
            setReviewingProject(null);
            setActiveTab("audio");
            void refreshProjects();
            void refreshJobs();
          }}
          onDeleted={(projectId) => {
            setProjects((previous) => previous.filter((p) => p.id !== projectId));
            setReviewingProject(null);
          }}
        />
      )}
    </div>
  );
}

function ProjectRow({
  project,
  channel,
  onDelete,
  onRegenerate,
}: {
  project: VideoProject;
  channel: Channel;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
}) {
  const isComplete = project.status === "completed";
  const durationLabel = project.renderDurationSeconds
    ? formatDuration(project.renderDurationSeconds)
    : `${project.durationMinutes}:00`;
  return (
    <article className="workspace-video-card">
      <ProjectThumbnail channelId={channel.id} project={project} durationLabel={durationLabel} />
      <div className="workspace-video-copy">
        <h3>{project.title}</h3>
        <p>{new Date(project.createdAt).toLocaleDateString("pt-BR")} · {channel.name}</p>
        <ProjectCostLabel project={project} />
        <span className={`workspace-rendered${project.status === "failed" ? " failed" : ""}`}><i /> {isComplete ? "Renderizado" : project.status === "failed" ? "Falhou" : "Em produção"}</span>
      </div>
      <details className="project-actions">
        <summary aria-label={`Mais opções para ${project.title}`}>⋮</summary>
        <div>
          <button type="button" onClick={() => onRegenerate(project.id)}>Gerar novamente</button>
          <button type="button" onClick={() => onDelete(project.id)}>Excluir</button>
        </div>
      </details>
    </article>
  );
}

function projectThumbUrl(channelId: string, project: VideoProject): string | null {
  return project.thumbnailRef ? mediaUrl(channelId, project.thumbnailRef) : null;
}

function ProjectThumbnail({
  channelId,
  project,
  durationLabel,
}: {
  channelId: string;
  project: VideoProject;
  durationLabel?: string;
}) {
  const url = projectThumbUrl(channelId, project);
  if (url) {
    return (
      <div className="workspace-video-thumb workspace-video-thumb-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" />
        {durationLabel ? <span>{durationLabel}</span> : null}
      </div>
    );
  }
  return (
    <div className="workspace-video-thumb workspace-video-thumb-plain">
      <span>{durationLabel ?? "Sem capa"}</span>
    </div>
  );
}

function formatDuration(seconds: number) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
