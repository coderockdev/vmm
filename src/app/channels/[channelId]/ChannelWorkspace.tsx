"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Channel, ContentPlan, VideoProject, VideoFormat, JobStatus, AudioAsset } from "../../../core/types";
import { ProjectCostLabel } from "./ProjectCostLabel";
import { CostsPanel } from "./CostsPanel";
import { PortadasPanel } from "./PortadasPanel";
import { BooksPanel } from "./BooksPanel";
import { AudiobookBoard } from "./AudiobookBoard";
import { AudiobookVoicePanel } from "./AudiobookVoicePanel";
import { ImageToVideoLab } from "./ImageToVideoLab";
import { YoutubeConnectPanel } from "./YoutubeConnectPanel";
import { CommentsPanel } from "./CommentsPanel";
import { ControlPanel } from "./ControlPanel";
import type { StepClock } from "../../../core/pipeline/stepClock";
import { AudioBedControls } from "./AudioBedControls";
import { formatUsd } from "../../../core/usage/types";
import { findVoice } from "../../../core/providers/tts/voiceCatalog";
import { TTSProviderName } from "../../../core/providers/tts/TTSProvider";
import { JUAN_CARLOS_ELEVENLABS_VOICE_ID } from "../../../core/providers/tts/voiceCapabilities";
import { ScriptReviewModal } from "./ScriptReviewModal";
import { lightCoverUrl, mediaUrl } from "../../../core/media";
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
type WorkspaceTab =
  | "painel"
  | "criar"
  | "ideias"
  | "roteiros"
  | "descricoes"
  | "audio"
  | "videos"
  | "portadas"
  | "custos"
  | "youtube"
  | "comentarios"
  | "livros"
  | "laboratorio";
type CreateMode = "manual" | "auto";

function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    start: "Início",
    ideas: "Ideias",
    scripts: "Roteiro",
    youtube: "Título + desc YT",
    audio: "Áudio",
    queued: "Fila (vídeo→YT)",
    music: "Música",
    render: "Vídeo",
    thumbnail: "Portada",
  };
  return map[stage] || stage;
}

/** Pipeline steps shown during auto-flow (prep phase before jobs). */
const AUTO_PIPELINE_STEPS = [
  { id: "start", label: "Início" },
  { id: "ideas", label: "Ideias" },
  { id: "scripts", label: "Roteiros" },
  { id: "youtube", label: "Título + desc" },
  { id: "audio", label: "Fila de voz" },
  { id: "queued", label: "Vídeo → YouTube" },
] as const;

function autoPipelineIndex(stage: string | null | undefined): number {
  if (!stage) return 0;
  const idx = AUTO_PIPELINE_STEPS.findIndex((s) => s.id === stage);
  return idx >= 0 ? idx : 0;
}

function autoPipelinePercent(args: {
  stage: string | null;
  done?: number;
  total?: number;
  productionProgress?: number | null;
}): number {
  if (args.productionProgress != null && Number.isFinite(args.productionProgress)) {
    // Prep is ~35% of perceived progress; production (TTS→YT) is the rest.
    return Math.min(99, Math.round(35 + (args.productionProgress / 100) * 65));
  }
  const idx = autoPipelineIndex(args.stage);
  const base = (idx / AUTO_PIPELINE_STEPS.length) * 35;
  const within =
    args.total && args.total > 0
      ? (Math.min(args.done ?? 0, args.total) / args.total) * (35 / AUTO_PIPELINE_STEPS.length)
      : 0;
  return Math.min(99, Math.round(base + within));
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
  const dnaName = channel.dna.voice.profile?.voice_name;
  const voice = !channel.dna.usesNarration
    ? "Sem narração"
    : dnaName
      ? `${dnaName}${channel.dna.voice.provider === "google" ? " · Google Cloud Chirp" : ""}`
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
  const isAudiobook = channel.dna.mode === "audiobook";
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    if (typeof window !== "undefined") {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (tab === "youtube") return "youtube";
      if (tab === "comentarios" || tab === "comments") return "comentarios";
      if (tab === "livros" && isAudiobook) return "livros";
      if (tab === "laboratorio" && isAudiobook) return "laboratorio";
      if (tab === "audio") return "audio";
      if (tab === "painel") return "painel";
    }
    return isAudiobook ? "livros" : "painel";
  });
  const [portadasFocusId, setPortadasFocusId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode>("auto");
  const [topic, setTopic] = useState("");
  const [quantity, setQuantity] = useState(5);
  const [autoQuantity, setAutoQuantity] = useState(1);
  const [durationKey, setDurationKey] = useState("default");
  const [sceneCount, setSceneCount] = useState(
    channel.dna.scriptRules.defaultSceneCount ?? 4
  );
  const [format, setFormat] = useState<VideoFormat>("video");
  const [ideaAiOverride, setIdeaAiOverride] = useState<"" | "mock" | "anthropic" | "openai" | "gemini">("openai");
  const [scriptAiOverride, setScriptAiOverride] = useState<"" | "mock" | "anthropic" | "openai" | "gemini">("openai");
  const [loadingAuto, setLoadingAuto] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoStuckIdeaId, setAutoStuckIdeaId] = useState<string | null>(null);
  const [autoStuckPlanId, setAutoStuckPlanId] = useState<string | null>(null);
  const [autoStatus, setAutoStatus] = useState<string | null>(null);
  const [autoLog, setAutoLog] = useState<Array<{ id: string; stage: string; detail: string }>>([]);
  const [autoProjectIds, setAutoProjectIds] = useState<string[]>([]);
  const [autoStage, setAutoStage] = useState<string | null>(null);
  const [autoDone, setAutoDone] = useState(0);
  const [autoTotal, setAutoTotal] = useState(0);
  /** Manual mode only — auto always generates manchete + descrição for YT upload. */
  const [includeManchete, setIncludeManchete] = useState(true);
  const [mancheteBankSize] = useState((channel.dna.successfulTitles ?? []).length);
  const [youtubeConnected, setYoutubeConnected] = useState<boolean | null>(null);
  const [voiceSpeed, setVoiceSpeed] = useState(channel.dna.voice.speed || 0.85);
  const [youtubeChannelTitle, setYoutubeChannelTitle] = useState<string | null>(null);
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
  const [jobByProject, setJobByProject] = useState<
    Record<string, { progress: number; statusMessage: string; status: string; createdAt?: string; updatedAt?: string; steps?: StepClock }>
  >({});
  const [reviewingProject, setReviewingProject] = useState<VideoProject | null>(null);
  const [pendingScriptTitles, setPendingScriptTitles] = useState<string[]>([]);
  const [retryingAudioId, setRetryingAudioId] = useState<string | null>(null);
  const [audioActionMsg, setAudioActionMsg] = useState<string | null>(null);
  const [bedBusyByProject, setBedBusyByProject] = useState<Record<string, string | null>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollBusy = useRef(false);

  const durationMinutes = durationKey === "default" ? channel.dna.scriptRules.defaultDurationMinutes : Number(durationKey);
  const hasActiveJobs = Object.values(jobByProject).some((j) =>
    ["planned", "audio", "timing", "composing", "rendering"].includes(j.status)
  );
  const hasActive = projects.some((project) => ACTIVE_STATUSES.includes(project.status)) || hasActiveJobs;

  const watchBoard = hasActive || activeTab === "painel";

  useEffect(() => {
    if (watchBoard && !pollRef.current) {
      pollRef.current = setInterval(() => {
        if (pollBusy.current) return;
        pollBusy.current = true;
        void Promise.all([refreshProjects(), refreshJobs()]).finally(() => {
          pollBusy.current = false;
        });
      }, 8000);
      void refreshJobs();
      void refreshProjects();
    }
    if (!watchBoard && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchBoard]);

  useEffect(() => {
    if (activeTab === "painel" || activeTab === "audio" || activeTab === "roteiros" || activeTab === "videos" || activeTab === "descricoes") {
      void refreshProjects();
      void refreshJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/channels/${channel.id}/youtube`);
        const json = (await res.json().catch(() => ({}))) as {
          account?: { title?: string } | null;
        };
        if (cancelled) return;
        setYoutubeConnected(Boolean(json.account));
        setYoutubeChannelTitle(json.account?.title ?? null);
      } catch {
        if (!cancelled) setYoutubeConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel.id, activeTab]);

  // After auto-flow queues jobs, keep showing live production status on Criar.
  useEffect(() => {
    if (autoProjectIds.length === 0) return;
    const tick = () => {
      if (pollBusy.current) return;
      pollBusy.current = true;
      void Promise.all([refreshProjects(), refreshJobs()]).finally(() => {
        pollBusy.current = false;
      });
    };
    tick();
    const id = window.setInterval(tick, 8000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoProjectIds.join(",")]);

  useEffect(() => {
    if (autoProjectIds.length === 0) return;
    const lines: string[] = [];
    for (const id of autoProjectIds) {
      const project = projects.find((p) => p.id === id);
      const job = jobByProject[id];
      // After YT OK we purge local — missing project + completed job = success.
      if (!project) {
        if (job?.status === "completed") {
          lines.push(`↑ YouTube OK (privado) — local limpo`);
        }
        continue;
      }
      const title = project.title.slice(0, 36);
      if (project.youtubeVideoId) {
        lines.push(`${title}: no YouTube (privado)`);
      } else if (job?.statusMessage && job.status !== "completed") {
        lines.push(`${title}: ${job.statusMessage}${job.progress ? ` (${Math.round(job.progress)}%)` : ""}`);
      } else if (project.status === "completed") {
        lines.push(`${title}: vídeo pronto (YT pendente)`);
      } else if (project.status === "failed") {
        lines.push(`${title}: falhou — ${project.errorMessage?.slice(0, 60) || "erro"}`);
      } else if (job?.statusMessage) {
        lines.push(`${title}: ${job.statusMessage}${job.progress ? ` (${Math.round(job.progress)}%)` : ""}`);
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
          createdAt?: string;
          updatedAt?: string;
          steps?: StepClock;
        }>;
      };
      const map: Record<
        string,
        { progress: number; statusMessage: string; status: string; createdAt?: string; updatedAt?: string; steps?: StepClock }
      > = {};
      // Prefer the newest job per project (API may return several historical rows).
      const sorted = [...(data.jobs ?? [])].sort((a, b) =>
        String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""))
      );
      for (const job of sorted) {
        if (job.channelId !== channel.id) continue;
        map[job.videoProjectId] = {
          progress: job.progress ?? 0,
          statusMessage: job.statusMessage ?? "",
          status: job.status ?? "",
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          steps: job.steps,
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
    setAutoStuckIdeaId(null);
    setAutoStuckPlanId(null);
    setAutoLog([
      {
        id: `${Date.now()}-boot`,
        stage: "start",
        detail: topic.trim()
          ? `A iniciar (${autoQuantity} vídeo${autoQuantity > 1 ? "s" : ""}) com ChatGPT…`
          : `Sem tópico — DNA do canal · ${autoQuantity} vídeo${autoQuantity > 1 ? "s" : ""} · ChatGPT…`,
      },
    ]);
    setAutoProjectIds([]);
    setAutoStage("start");
    setAutoDone(0);
    setAutoTotal(autoQuantity);
    setAutoStatus(
      topic.trim()
        ? `A iniciar fluxo automático (${autoQuantity})…`
        : `Sem tópico — a gerar a partir do DNA do canal (${autoQuantity})…`
    );

    const isRetryableClientError = (err: unknown) => {
      const raw = err instanceof Error ? err.message : String(err);
      return /fetch failed|network|failed to fetch|falha de rede|load failed|aborted|econnreset|socket|etimedout|timeout|limite de requisições|rate limit|\b429\b|sobrecarregado|indisponível|tente de novo/i.test(
        raw
      );
    };

    const maxAttempts = 5;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
              aiProviderOverride: ideaAiOverride || "openai",
              includeManchete: true,
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
                ideaId?: string | null;
                planId?: string | null;
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
                if (event.stage) setAutoStage(event.stage);
                if (event.ideaId) setAutoStuckIdeaId(event.ideaId);
                if (event.planId) setAutoStuckPlanId(event.planId);
                if (typeof event.done === "number") setAutoDone(event.done);
                if (typeof event.total === "number" && event.total > 0) setAutoTotal(event.total);
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
                setAutoStage("queued");
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
          // Stream closed without done — treat as droppable network blip if nothing queued.
          if (!finished) {
            throw new Error("Falha de rede no fluxo automático (ligação interrompida).");
          }
          return;
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err);
          if (isRetryableClientError(err) && attempt < maxAttempts) {
            const waitSec = Math.min(20, 2 ** attempt); // 2, 4, 8, 16…
            setAutoError(null);
            const detail = `Rede/IA falhou — a retentar automaticamente em ${waitSec}s (${attempt}/${maxAttempts})…`;
            setAutoStatus(detail);
            setAutoLog((prev) =>
              [
                ...prev,
                { id: `${Date.now()}-retry-${attempt}`, stage: "retry", detail },
              ].slice(-40)
            );
            await new Promise((r) => setTimeout(r, waitSec * 1000));
            continue;
          }
          setAutoError(
            /fetch failed|network|failed to fetch|falha de rede|aborted/i.test(raw)
              ? `Falha de rede após ${maxAttempts} tentativas. Recarrega a página e tenta de novo.`
              : raw
          );
          return;
        }
      }
    } finally {
      setLoadingAuto(false);
    }
  }

  function clearStuckFlow() {
    setAutoError(null);
    setAutoStatus(null);
    setAutoLog([]);
    setAutoStage(null);
    setAutoDone(0);
    setAutoTotal(0);
    setAutoStuckIdeaId(null);
    setAutoStuckPlanId(null);
  }

  async function unstickFlow() {
    if (!autoStuckIdeaId || !autoStuckPlanId) {
      clearStuckFlow();
      return;
    }
    const ideaId = autoStuckIdeaId;
    const planId = autoStuckPlanId;
    setAutoError(null);
    setLoadingAuto(true);
    setAutoStatus("A destravar: roteiro de novo, depois voz…");
    try {
      const generated = await fetch(`/api/channels/${channel.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          ideaIds: [ideaId],
          aiProviderOverride: ideaAiOverride || "openai",
          sceneCount,
        }),
      });
      const generatedJson = await generated.json().catch(() => ({}));
      if (!generated.ok) {
        throw new Error(generatedJson.error ?? "Não deu para gerar o roteiro");
      }
      const projectIds: string[] = generatedJson.projectIds ?? [];
      const resumed = await fetch(`/api/channels/${channel.id}/auto-flow/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds }),
      });
      if (!resumed.ok || !resumed.body) {
        const data = await resumed.json().catch(() => ({}));
        throw new Error(data.error ?? "Não deu para retomar a produção");
      }
      const reader = resumed.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed) as { type?: string; detail?: string; error?: string };
            if (event.type === "error") throw new Error(event.error ?? "Falha ao destravar");
            if (event.detail) setAutoStatus(event.detail);
          } catch (err) {
            if (err instanceof SyntaxError) continue;
            throw err;
          }
        }
      }
      setAutoProjectIds(projectIds);
      setAutoStage("queued");
      setAutoStatus("Destravado: na fila de voz → YouTube");
      setAutoStuckIdeaId(null);
      setAutoStuckPlanId(null);
      await refreshProjects();
      await refreshJobs();
    } catch (err) {
      setAutoError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingAuto(false);
    }
  }

  async function discardStuckFlow() {
    const ideaId = autoStuckIdeaId;
    clearStuckFlow();
    if (ideaId) {
      await fetch(`/api/content-ideas/${ideaId}`, { method: "DELETE" });
      setSelectedIds((previous) => {
        const next = new Set(previous);
        next.delete(ideaId);
        return next;
      });
      setPlan((previous) =>
        previous
          ? {
              ...previous,
              items: previous.items.map((item) =>
                item.id === ideaId ? { ...item, status: "removed" } : item
              ),
            }
          : previous
      );
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
    const project = projects.find((p) => p.id === projectId);
    // If voice already exists, only re-render video — never re-run TTS via /regenerate.
    if (project?.audioAssetId) {
      setBedBusyByProject((prev) => ({ ...prev, [projectId]: "A renderizar vídeo…" }));
      setProjects((previous) =>
        previous.map((p) =>
          p.id === projectId ? { ...p, status: "rendering", errorMessage: null } : p
        )
      );
      setJobByProject((prev) => ({
        ...prev,
        [projectId]: {
          progress: 10,
          statusMessage: "Renderizando vídeo (só voz)…",
          status: "rendering",
        },
      }));
      try {
        const res = await fetch(`/api/videos/${projectId}/render-style`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            styleId: "scrolling-text",
            presetId: "amor-amor",
            aspectRatio: "9:16",
            audioSource: "voice",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (data.project) {
          setProjects((previous) =>
            previous.map((p) => (p.id === data.project.id ? data.project : p))
          );
        }
        setAudioActionMsg(`Vídeo regenerado: ${project.title.slice(0, 40)}`);
        setActiveTab("videos");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Falha ao regenerar vídeo";
        setAudioActionMsg(message);
        setProjects((previous) =>
          previous.map((p) =>
            p.id === projectId ? { ...p, status: "failed", errorMessage: message } : p
          )
        );
      } finally {
        setBedBusyByProject((prev) => ({ ...prev, [projectId]: null }));
        void refreshProjects();
        void refreshJobs();
      }
      return;
    }
    await fetch(`/api/videos/${projectId}/regenerate`, { method: "POST" });
    await refreshProjects();
  }

  async function handleCancelProduction(projectId: string) {
    setAudioActionMsg(null);
    try {
      const res = await fetch(`/api/videos/${projectId}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.project) {
        setProjects((previous) =>
          previous.map((p) => (p.id === data.project.id ? data.project : p))
        );
      }
      setJobByProject((prev) => ({
        ...prev,
        [projectId]: {
          progress: 0,
          statusMessage: "Cancelado pelo utilizador",
          status: "failed",
        },
      }));
      setBedBusyByProject((prev) => ({ ...prev, [projectId]: null }));
      setAudioActionMsg("Produção cancelada.");
      await Promise.all([refreshProjects(), refreshJobs()]);
    } catch (err) {
      setAudioActionMsg(err instanceof Error ? err.message : String(err));
    }
  }

  /** Failed audio card: retry with the channel DNA voice (Cartesia if that's the default). */
  async function handleRetryAudio(project: VideoProject) {
    setRetryingAudioId(project.id);
    setAudioActionMsg(null);
    try {
      const dna = channel.dna.voice;
      const providerOverride = dna.provider === "heygen" ? "elevenlabs" : dna.provider;
      const voiceOverride =
        providerOverride === "elevenlabs"
          ? dna.profile?.elevenlabs_voice_id || JUAN_CARLOS_ELEVENLABS_VOICE_ID
          : dna.voiceId || dna.profile?.voice_id || null;

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
      // Já no YouTube = registo leve em Vídeos — sem o "choclo" de música/SFX.
      !p.youtubeVideoId &&
      p.status !== "script" &&
      (PIPELINE_PRODUCING.includes(p.status) ||
        Boolean(p.audioAssetId) ||
        ["completed", "failed"].includes(p.status))
  );
  const audioBusyCount = projects.filter((p) => isProjectActivelyProducing(p) && p.status !== "rendering").length;
  const scriptBusyCount = pendingScriptTitles.length;
  const videoProjects = projects.filter((p) => {
    const job = jobByProject[p.id];
    if (p.youtubeVideoId) return true; // light registry after upload
    if (p.status === "failed" && (job?.statusMessage?.includes("FFmpeg") || job?.statusMessage?.includes("upload") || p.errorMessage)) {
      return true;
    }
    return p.status === "completed" || p.status === "rendering" || p.status === "composing";
  });

  function productionLabel(project: VideoProject, job?: { progress: number; statusMessage: string; status: string }) {
    // Stale optimistic "rendering" must not win over a failed/completed job from the API.
    if (job?.status === "failed" || (project.status === "failed" && job?.status !== "rendering")) {
      if (project.audioAssetId) {
        const cancelled = /cancelad/i.test(job?.statusMessage || project.errorMessage || "");
        return {
          text: cancelled
            ? "Áudio pronto (produção cancelada)"
            : job?.statusMessage || project.errorMessage || "Áudio pronto (etapa seguinte falhou)",
          kind: cancelled ? ("done" as const) : ("failed" as const),
        };
      }
      return { text: job?.statusMessage || project.errorMessage || "Falhou", kind: "failed" as const };
    }
    if (job?.status === "completed" || project.status === "completed") {
      return { text: "Concluído", kind: "done" as const };
    }
    // Prefer live job progress — leaving Áudio must still show "Renderizando…".
    if (job?.status === "rendering" || project.status === "rendering") {
      const msg = job?.statusMessage?.trim() || "Renderizando vídeo…";
      const pct = job?.progress ? ` · ${Math.round(job.progress)}%` : "";
      return { text: `${msg}${pct}`, kind: "working" as const };
    }
    if (job?.status === "composing" || project.status === "composing") {
      return { text: job?.statusMessage?.trim() || "Preparando composição…", kind: "working" as const };
    }
    // Voice already attached but project/job still says "audio"/"timing" → stuck after TTS.
    if (
      project.audioAssetId &&
      (project.status === "audio" ||
        project.status === "timing" ||
        job?.status === "audio" ||
        job?.status === "timing" ||
        job?.status === "planned")
    ) {
      return { text: "Áudio pronto", kind: "done" as const };
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

  function isProjectActivelyProducing(project: VideoProject): boolean {
    const job = jobByProject[project.id];
    if (job?.status === "failed" || job?.status === "completed") return false;
    if (project.status === "failed" || project.status === "completed") return false;
    // Don't treat "stuck after TTS" as active production.
    if (
      project.audioAssetId &&
      ["audio", "timing", "planned"].includes(project.status) &&
      (!job || ["audio", "timing", "planned", ""].includes(job.status))
    ) {
      return false;
    }
    return (
      PIPELINE_PRODUCING.includes(project.status) ||
      ["planned", "audio", "timing", "composing", "rendering"].includes(job?.status ?? "")
    );
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

  const videoBusyCount = projects.filter((p) => {
    const job = jobByProject[p.id];
    // Don't keep the banner on optimistic "rendering" after the job already failed.
    if (job?.status === "failed" || job?.status === "completed") return false;
    if (p.status === "failed" || p.status === "completed") return false;
    return p.status === "rendering" || job?.status === "rendering";
  }).length;
  const producingAnywhere =
    audioBusyCount > 0 ||
    videoBusyCount > 0 ||
    projects.some((p) => isProjectActivelyProducing(p));

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
            {mediaUrl(channel.id, channel.channelImageRef ?? channel.coverRef) ? (
              <img
                className="channel-profile-photo"
                src={mediaUrl(channel.id, channel.channelImageRef ?? channel.coverRef) ?? undefined}
                alt={`Capa de ${display.name}`}
              />
            ) : (
              <ReferenceCrop crop={{ x: 254, y: 56, width: 167, height: 133 }} alt={`Capa de ${display.name}`} />
            )}
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
              <small>
                {isAudiobook
                  ? "Voz, qualidade das imagens e regras do audiolivro (1 capítulo = 1 vídeo)."
                  : "Contexto, estilo, tom, público, temas e configurações do canal para geração de conteúdo."}
              </small>
            </span>
          </div>
          <Link href={`/channels/${channel.id}/edit`} className="dna-edit-button"><GearIcon size={19} /> Editar DNA do canal</Link>
        </aside>
      </header>

      <nav className="workspace-tabs" aria-label="Seções do canal">
        {isAudiobook ? (
          <>
            <button type="button" className={activeTab === "painel" ? "active" : ""} onClick={() => setActiveTab("painel")}>
              Painel
            </button>
            <button type="button" className={activeTab === "livros" ? "active" : ""} onClick={() => setActiveTab("livros")}>
              Livros
            </button>
            <button type="button" className={activeTab === "audio" ? "active" : ""} onClick={() => setActiveTab("audio")}>
              Áudio
            </button>
            <button type="button" className={activeTab === "videos" ? "active" : ""} onClick={() => setActiveTab("videos")}>
              Vídeos
            </button>
            <button type="button" className={activeTab === "portadas" ? "active" : ""} onClick={() => setActiveTab("portadas")}>
              Portadas
            </button>
            <button type="button" className={activeTab === "custos" ? "active" : ""} onClick={() => setActiveTab("custos")}>
              Custos
            </button>
            <button type="button" className={activeTab === "laboratorio" ? "active" : ""} onClick={() => setActiveTab("laboratorio")}>
              Laboratório
            </button>
            <button type="button" className={activeTab === "youtube" ? "active" : ""} onClick={() => setActiveTab("youtube")}>
              YouTube
            </button>
            <button type="button" className={activeTab === "comentarios" ? "active" : ""} onClick={() => setActiveTab("comentarios")}>
              Comentarios
            </button>
          </>
        ) : (
          <>
            <button type="button" className={activeTab === "painel" ? "active" : ""} onClick={() => setActiveTab("painel")}>
              Painel
              {(audioBusyCount + videoBusyCount) > 0 && (
                <span className="tab-badge">{audioBusyCount + videoBusyCount}</span>
              )}
            </button>
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
            <button type="button" className={activeTab === "youtube" ? "active" : ""} onClick={() => setActiveTab("youtube")}>
              YouTube
            </button>
            <button type="button" className={activeTab === "comentarios" ? "active" : ""} onClick={() => setActiveTab("comentarios")}>
              Comentarios
            </button>
          </>
        )}
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
            .filter((p) => isProjectActivelyProducing(p))
            .slice(0, 2)
            .map((p) => {
              const job = jobByProject[p.id];
              const msg = job?.statusMessage || productionLabel(p, job).text;
              return (
                <span key={p.id} className="workspace-global-progress-item">
                  {p.title.slice(0, 36)}
                  {p.title.length > 36 ? "…" : ""}: {msg}
                  {job?.progress ? ` (${Math.round(job.progress)}%)` : ""}{" "}
                  <button
                    type="button"
                    className="workspace-cancel-prod"
                    onClick={() => void handleCancelProduction(p.id)}
                  >
                    Parar
                  </button>
                </span>
              );
            })}
        </div>
      )}

      {activeTab === "painel" && !isAudiobook && (
        <ControlPanel channelId={channel.id} projects={projects} jobByProject={jobByProject} />
      )}

      {activeTab === "criar" && !isAudiobook && (
        <div className="creation-layout">
          <section className="creation-card">
            <div className="workspace-section-title">
              <h2>O que vamos criar hoje?</h2>
              <p>
                {createMode === "auto"
                  ? `Um botão: do DNA até o YouTube privado de ${channel.name}.`
                  : `Sugestões e ideias geradas a partir do DNA deste canal (${channel.name}).`}
              </p>
            </div>

            <div className="create-mode-toggle" role="group" aria-label="Modo de criação">
              <button
                type="button"
                className={createMode === "auto" ? "active" : ""}
                onClick={() => setCreateMode("auto")}
              >
                Automático (título → YouTube)
              </button>
              <button
                type="button"
                className={createMode === "manual" ? "active" : ""}
                onClick={() => setCreateMode("manual")}
              >
                Manual (passo a passo)
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

            {createMode === "manual" && (
              <label className="create-manchete-option">
                <input
                  type="checkbox"
                  checked={includeManchete}
                  onChange={(e) => setIncludeManchete(e.currentTarget.checked)}
                />
                <span>
                  Gerar manchete YT automaticamente
                  <small>
                    Padrão do DNA ({mancheteBankSize} títulos de sucesso). Tema opcional — sem texto, inventa sozinho.
                  </small>
                </span>
              </label>
            )}

            {createMode === "auto" && youtubeConnected === false && (
              <p className="auto-flow-yt-warn" role="status">
                YouTube ainda não ligado — o vídeo fica neste PC.{" "}
                <button type="button" onClick={() => setActiveTab("youtube")}>
                  Abrir aba YouTube → Conectar
                </button>
              </p>
            )}
            {createMode === "auto" && youtubeConnected === true && (
              <p className="auto-flow-yt-ok" role="status">
                Upload automático para{" "}
                <strong>{youtubeChannelTitle || "YouTube ligado"}</strong> (privado).
              </p>
            )}

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
                <>
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
                        ? `Gerar ${autoQuantity} vídeo${autoQuantity > 1 ? "s" : ""} → YouTube`
                        : `Gerar ${autoQuantity} do DNA → YouTube`}
                  </button>
                </>
              )}
            </div>
            {createMode === "auto" && (
              <p className="auto-flow-hint">
                Um clique faz tudo: título + descrição → roteiro → voz → música/SFX → vídeo →
                portada → <strong>upload YouTube privado</strong>
                {youtubeConnected
                  ? ` em «${youtubeChannelTitle || "conta ligada"}».`
                  : " (liga a conta na aba YouTube)."}{" "}
                Tema opcional — vazio usa o DNA. Se um vídeo travar, para esse cartão em Áudio.
                O sistema retoma sozinho; Continuar só aparece nesse vídeo se ele falhar.
              </p>
            )}
            {autoError && createMode === "auto" && (
              <div className="generation-error" role="alert">
                <p>{autoError}</p>
                <div className="generation-error-actions">
                  {autoStuckIdeaId && autoStuckPlanId && (
                    <button type="button" onClick={() => { void unstickFlow(); }}>
                      Destravar e seguir
                    </button>
                  )}
                  <button type="button" onClick={() => { void discardStuckFlow(); }}>
                    Apagar este fluxo
                  </button>
                </div>
              </div>
            )}
            {createMode === "manual" && (
              <p className="auto-flow-hint">
                Gera ideias{includeManchete ? " com manchetes no padrão do DNA" : ""} e segue para a aba Ideias → Roteiros.
                Tema opcional.
              </p>
            )}
            {(loadingAuto || autoLog.length > 0 || autoStatus) && createMode === "auto" && (
              <div className="auto-progress-panel" role="status" aria-live="polite">
                {(() => {
                  const prodJobs = autoProjectIds
                    .map((id) => jobByProject[id])
                    .filter(Boolean);
                  const avgProd =
                    prodJobs.length > 0
                      ? prodJobs.reduce((s, j) => s + (j.progress || 0), 0) / prodJobs.length
                      : null;
                  const pct = autoPipelinePercent({
                    stage: autoStage,
                    done: autoDone,
                    total: autoTotal,
                    productionProgress:
                      !loadingAuto && autoProjectIds.length > 0 ? avgProd : null,
                  });
                  const activeIdx = autoPipelineIndex(autoStage);
                  return (
                    <>
                      <div className="auto-progress-head">
                        {loadingAuto && <span className="production-spinner" aria-hidden />}
                        <strong>
                          {loadingAuto
                            ? "Em progresso"
                            : autoProjectIds.length > 0
                              ? "Produção (voz → YouTube)"
                              : "Último fluxo"}
                        </strong>
                        <span className="auto-progress-pct">{pct}%</span>
                      </div>
                      <div className="auto-progress-bar" aria-hidden>
                        <i style={{ width: `${pct}%` }} />
                      </div>
                      {autoStatus && (
                        <p className="auto-progress-current">{autoStatus}</p>
                      )}
                      <ol className="auto-progress-steps">
                        {AUTO_PIPELINE_STEPS.map((step, i) => {
                          const state =
                            i < activeIdx || (!loadingAuto && autoProjectIds.length > 0 && i <= activeIdx)
                              ? "done"
                              : i === activeIdx && (loadingAuto || autoProjectIds.length > 0)
                                ? "active"
                                : "pending";
                          return (
                            <li key={step.id} className={`is-${state}`}>
                              <span className="auto-progress-step-dot" aria-hidden />
                              <span>{step.label}</span>
                            </li>
                          );
                        })}
                      </ol>
                      {autoTotal > 0 && (autoStage === "scripts" || autoStage === "youtube" || autoStage === "audio") && (
                        <p className="portadas-actions-hint">
                          Vídeo {Math.min(autoDone + 1, autoTotal)} de {autoTotal}
                        </p>
                      )}
                      {autoLog.length > 0 && (
                        <ol className="auto-progress-log">
                          {autoLog.slice(-8).map((item) => (
                            <li key={item.id}>
                              <span className="auto-progress-stage">{stageLabel(item.stage)}</span>
                              <span>{item.detail}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                      {autoProjectIds.length > 0 && !loadingAuto && (
                        <p className="auto-progress-follow">
                          Cada vídeo: voz → música → render → portada → YouTube. Acompanha em{" "}
                          <button type="button" onClick={() => setActiveTab("audio")}>Áudio</button>{" "}
                          ou{" "}
                          <button type="button" onClick={() => setActiveTab("videos")}>Vídeos</button>.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            {ideaError && <div className="generation-error">{ideaError}</div>}

            <div className="voice-row">
              <MiniIcon name="sparkles" size={24} />
              <span className="voice-label">IA para gerar ideias e roteiros</span>
              <select
                value={ideaAiOverride === "gemini" ? "gemini" : "openai"}
                onChange={(event) => {
                  const next = event.target.value as typeof ideaAiOverride;
                  setIdeaAiOverride(next);
                  setScriptAiOverride(next);
                }}
              >
                <option value="openai">ChatGPT (padrão)</option>
                <option value="gemini">Gemini, se o ChatGPT não responder</option>
              </select>
              <span className="books-muted voice-row-hint">ChatGPT → Gemini. Claude não entra.</span>
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

      {activeTab === "ideias" && !isAudiobook && (
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
                value={scriptAiOverride === "openai" || scriptAiOverride === "gemini" ? scriptAiOverride : ""}
                onChange={(event) => setScriptAiOverride(event.target.value as typeof scriptAiOverride)}
                aria-label="IA para gerar o roteiro"
              >
                <option value="">IA do roteiro: ChatGPT, senão Gemini</option>
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

      {activeTab === "roteiros" && !isAudiobook && (
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
                      <img
                        src={lightCoverUrl({ channelId: channel.id, thumbnailRef: project.thumbnailRef, youtubeVideoId: project.youtubeVideoId }) ?? undefined}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={(event) => {
                          const full = mediaUrl(channel.id, project.thumbnailRef);
                          const img = event.currentTarget;
                          if (!full || img.dataset.fell === "1") return;
                          img.dataset.fell = "1";
                          img.src = full;
                        }}
                      />
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

      {activeTab === "descricoes" && !isAudiobook && (
        <section className="review-queue-section">
          <div className="workspace-section-title">
            <h2>Descrições YouTube</h2>
            <p>
              Título e descrição gerados no Automático — o upload já os envia. Aqui podes
              copiar ou rever o texto.
            </p>
          </div>
          {publishProjects.length === 0 ? (
            <div className="review-empty-state">
              Ainda sem descrições. Usa{" "}
              <button type="button" onClick={() => { setCreateMode("auto"); setActiveTab("criar"); }}>
                Criar → Automático
              </button>{" "}
              (gera + sobe ao YouTube).
            </div>
          ) : (
            <div className="yt-desc-list">
              {publishProjects.map((project) => (
                <article className="yt-desc-card" key={project.id}>
                  <header>
                    <h3>{project.title}</h3>
                    <span className={`workspace-rendered ${project.youtubeVideoId ? "done" : project.status === "completed" ? "done" : project.status === "failed" ? "failed" : "working"}`}>
                      <i />{" "}
                      {project.youtubeVideoId
                        ? "No YouTube (privado)"
                        : project.status}
                    </span>
                  </header>
                  {project.youtubeUrl && (
                    <p className="yt-studio-link">
                      <a href={project.youtubeUrl} target="_blank" rel="noreferrer">
                        Abrir no YouTube Studio →
                      </a>
                    </p>
                  )}
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

      {activeTab === "audio" && isAudiobook && (
        <section className="review-queue-section">
          <AudiobookVoicePanel channelId={channel.id} />
        </section>
      )}

      {activeTab === "audio" && !isAudiobook && (
        <section className="review-queue-section">
          <div className="workspace-section-title">
            <h2>Áudios do canal</h2>
            <p>
              Produção em curso: TTS, música/SFX e progresso por etapa. Depois do upload YouTube o
              áudio pesado some — fica só o registo leve em Vídeos.
            </p>
          </div>
          <label className="channel-speed">
            <span>
              Velocidade da narração {voiceSpeed.toFixed(2)}
              <small>
                Vale para a próxima geração deste canal. 0,85 é o ritmo atual de Amor Amor: dá para
                acompanhar sem correr.
              </small>
            </span>
            <input
              type="range"
              min={0.75}
              max={1.15}
              step={0.01}
              value={voiceSpeed}
              onChange={(event) => setVoiceSpeed(Number(event.target.value))}
              onPointerUp={(event) => {
                const speed = Number((event.target as HTMLInputElement).value);
                void fetch(`/api/channels/${channel.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    dna: {
                      voice: {
                        ...channel.dna.voice,
                        speed,
                        ...(channel.dna.voice.profile
                          ? { profile: { ...channel.dna.voice.profile, speed } }
                          : {}),
                      },
                    },
                  }),
                });
              }}
            />
          </label>
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
                const stuckWithAudio =
                  Boolean(asset) &&
                  status.kind === "done" &&
                  ["audio", "timing", "planned"].includes(project.status);
                const generatingAudio =
                  (status.kind === "working" && !stuckWithAudio) || retryingAudioId === project.id;
                const canStop = isProjectActivelyProducing(project) || stuckWithAudio;
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
                        <img
                        src={lightCoverUrl({ channelId: channel.id, thumbnailRef: project.thumbnailRef, youtubeVideoId: project.youtubeVideoId }) ?? undefined}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={(event) => {
                          const full = mediaUrl(channel.id, project.thumbnailRef);
                          const img = event.currentTarget;
                          if (!full || img.dataset.fell === "1") return;
                          img.dataset.fell = "1";
                          img.src = full;
                        }}
                      />
                      </div>
                    ) : (
                      <div className="review-queue-icon"><MiniIcon name="mic" size={22} /></div>
                    )}
                    <div className="review-queue-copy">
                      <h3>{project.title}</h3>
                      <p>
                        {new Date(project.createdAt).toLocaleString("pt-BR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}
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
                      {asset && !project.youtubeVideoId && (
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
                        {canStop && (
                          <button
                            type="button"
                            className="review-queue-action review-queue-action-stop"
                            disabled={retryingAudioId === project.id}
                            onClick={() => void handleCancelProduction(project.id)}
                            title="Para a produção presa (não apaga o áudio)"
                          >
                            Parar
                          </button>
                        )}
                        <button
                          type="button"
                          className="review-queue-action review-queue-action-video"
                          disabled={Boolean(bedBusy) || (generatingAudio && !asset)}
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
                                const localNote = data.localAbsolutePath
                                  ? ` · local: ${data.localAbsolutePath}`
                                  : "";
                                const warn = data.uploadWarning ? ` · ${data.uploadWarning}` : "";
                                setAudioActionMsg(
                                  `Vídeo gerado: ${project.title.slice(0, 40)}${localNote}${warn}`
                                );
                                setActiveTab("videos");
                              })
                              .catch((err) => {
                                const message =
                                  err instanceof Error ? err.message : "Falha ao gerar vídeo";
                                setAudioActionMsg(message);
                                setProjects((previous) =>
                                  previous.map((p) =>
                                    p.id === project.id
                                      ? { ...p, status: "failed", errorMessage: message }
                                      : p
                                  )
                                );
                                setJobByProject((prev) => ({
                                  ...prev,
                                  [project.id]: {
                                    progress: 0,
                                    statusMessage: message.slice(0, 240),
                                    status: "failed",
                                  },
                                }));
                                void refreshProjects();
                                void refreshJobs();
                              })
                              .finally(() => {
                                setBedBusyByProject((prev) => ({ ...prev, [project.id]: null }));
                              });
                          }}
                          title="Gera o vídeo com o áudio já pronto (não regenera TTS). Fica neste PC; Supabase/YouTube depois."
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
                        title="Só este vídeo. O automático parou antes de terminar — continua a partir daqui."
                      >
                        {retryingAudioId === project.id ? "A continuar…" : "Continuar"}
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
          <p className="auto-flow-hint" style={{ marginTop: 0 }}>
            Em produção: acompanha o progresso. Depois do YouTube: registo leve (portada pequena +
            título + link Studio) — sem MP4 local. Últimos 10.
          </p>
          {videoProjects.length === 0 ? (
            <div className="review-empty-state">
              Nenhum vídeo real ainda. Quando o render terminar, aparece aqui.
            </div>
          ) : (
            <div className="workspace-videos-grid">
              {videoProjects.slice(0, 10).map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  channel={channel}
                  onDelete={handleDelete}
                  onRegenerate={handleRegenerate}
                  onPublished={(info) => {
                    if (info.project) {
                      setProjects((previous) => {
                        const exists = previous.some((p) => p.id === info.project!.id);
                        if (exists) {
                          return previous.map((p) => (p.id === info.project!.id ? info.project! : p));
                        }
                        return [info.project!, ...previous];
                      });
                      setAutoStatus(
                        info.studioUrl
                          ? `YouTube OK — registo leve · ${info.studioUrl}`
                          : "YouTube OK — registo leve (sem ficheiros pesados)"
                      );
                      return;
                    }
                    if (info.purged) {
                      // Legacy full-delete path
                      setProjects((previous) => previous.filter((p) => p.id !== info.projectId));
                    }
                  }}
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

      {activeTab === "youtube" && (
        <section className="review-queue-section">
          <YoutubeConnectPanel channelId={channel.id} channelName={channel.name} />
        </section>
      )}

      {activeTab === "comentarios" && (
        <section className="review-queue-section">
          <CommentsPanel channel={channel} />
        </section>
      )}

      {activeTab === "painel" && isAudiobook && (
        <AudiobookBoard channelId={channel.id} />
      )}

      {activeTab === "livros" && (
        <BooksPanel channelId={channel.id} onGoToVoice={() => setActiveTab("audio")} />
      )}

      {activeTab === "laboratorio" && isAudiobook && <ImageToVideoLab channelId={channel.id} />}

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
  onPublished,
}: {
  project: VideoProject;
  channel: Channel;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
  onPublished?: (info: {
    projectId: string;
    purged?: boolean;
    studioUrl?: string;
    project?: VideoProject;
  }) => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const isComplete = project.status === "completed";
  const durationLabel = project.renderDurationSeconds
    ? formatDuration(project.renderDurationSeconds)
    : `${project.durationMinutes}:00`;

  async function publishToYoutube() {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/videos/${project.id}/youtube/publish`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (json.project) {
        onPublished?.({
          projectId: project.id,
          purged: Boolean(json.purged),
          studioUrl: typeof json.studioUrl === "string" ? json.studioUrl : undefined,
          project: json.project as VideoProject,
        });
        return;
      }
      if (json.purged) {
        onPublished?.({
          projectId: project.id,
          purged: true,
          studioUrl: typeof json.studioUrl === "string" ? json.studioUrl : undefined,
        });
      }
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <article className="workspace-video-card">
      <ProjectThumbnail channelId={channel.id} project={project} durationLabel={durationLabel} />
      <div className="workspace-video-copy">
        <h3>{project.headline || project.title}</h3>
        <p>{new Date(project.createdAt).toLocaleDateString("pt-BR")} · {channel.name}</p>
        <ProjectCostLabel project={project} />
        <span
          className={`workspace-rendered${project.status === "failed" ? " failed" : ""}${
            project.youtubeVideoId ? " done" : ""
          }`}
        >
          <i />{" "}
          {project.youtubeVideoId
            ? project.renderPath
              ? "No YouTube (privado)"
              : "No YouTube · registo leve"
            : isComplete
              ? "Renderizado"
              : project.status === "failed"
                ? "Falhou"
                : "Em produção"}
        </span>
        {project.youtubeUrl && (
          <a className="workspace-yt-link" href={project.youtubeUrl} target="_blank" rel="noreferrer">
            Abrir no Studio →
          </a>
        )}
        {publishError && <p className="workspace-yt-error">{publishError}</p>}
      </div>
      <details className="project-actions">
        <summary aria-label={`Mais opções para ${project.title}`}>⋮</summary>
        <div>
          {isComplete && !project.youtubeVideoId && (
            <button type="button" disabled={publishing} onClick={() => void publishToYoutube()}>
              {publishing ? "A subir…" : "Subir ao YouTube"}
            </button>
          )}
          {project.youtubeVideoId && project.youtubeUrl && (
            <a href={project.youtubeUrl} target="_blank" rel="noreferrer">
              YouTube Studio
            </a>
          )}
          <button type="button" onClick={() => onRegenerate(project.id)}>Gerar novamente</button>
          <button type="button" onClick={() => onDelete(project.id)}>Excluir</button>
        </div>
      </details>
    </article>
  );
}

function projectThumbUrl(channelId: string, project: VideoProject): string | null {
  return lightCoverUrl({
    channelId,
    thumbnailRef: project.thumbnailRef,
    youtubeVideoId: project.youtubeVideoId,
  });
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
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          width={320}
          height={180}
          onError={(event) => {
            const full = mediaUrl(channelId, project.thumbnailRef);
            const img = event.currentTarget;
            if (!full || img.dataset.fell === "1") return;
            img.dataset.fell = "1";
            img.src = full;
          }}
        />
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
