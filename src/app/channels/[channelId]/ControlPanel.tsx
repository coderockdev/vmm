import React from "react";
import { JobStatus, VideoProject } from "../../../core/types";

type JobSnap = { progress: number; statusMessage: string; status: string };

const LIVE: JobStatus[] = ["planned", "audio", "timing", "composing", "rendering"];

const STEPS = [
  { id: "roteiro", label: "Roteiro" },
  { id: "voz", label: "Voz" },
  { id: "musica", label: "Música" },
  { id: "video", label: "Vídeo" },
  { id: "portada", label: "Portada" },
  { id: "youtube", label: "YouTube" },
] as const;

function stepIndex(project: VideoProject): number {
  if (project.youtubeVideoId) return 5;
  if (project.thumbnailRef) return 4;
  if (project.renderPath) return 3;
  if (project.mixAudioRef || project.musicRef) return 2;
  if (project.audioAssetId) return 1;
  if (project.scriptId) return 0;
  return -1;
}

function floorPercent(project: VideoProject): number {
  const idx = stepIndex(project);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / STEPS.length) * 100);
}

export function controlSnapshot(project: VideoProject, job?: JobSnap) {
  const floor = floorPercent(project);
  const live = Boolean(job && LIVE.includes(job.status as JobStatus));
  const failed = job?.status === "failed" || (project.status === "failed" && !live);
  let percent = project.youtubeVideoId ? 100 : floor;
  if (live && job) {
    percent = Math.max(floor, Math.min(99, Math.round(job.progress || floor)));
  }
  const stage = project.youtubeVideoId
    ? "Enviado ao YouTube"
    : failed
      ? job?.statusMessage || project.errorMessage || "Parado"
      : live
        ? job?.statusMessage || STEPS[Math.max(0, stepIndex(project))]?.label || "Na fila"
        : STEPS[Math.max(0, stepIndex(project))]?.label || "Sem roteiro";
  const kind = project.youtubeVideoId ? "done" : failed ? "failed" : live ? "working" : "idle";
  return { percent, stage, kind, step: stepIndex(project) };
}

function queueRank(status: string): number {
  if (status === "rendering") return 0;
  if (status === "composing") return 1;
  if (status === "timing") return 2;
  if (status === "audio") return 3;
  if (status === "planned") return 4;
  return 9;
}

const PROVIDER_LABEL: Record<string, string> = {
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
  cartesia: "Cartesia",
  heygen: "HeyGen",
  "remotion-lambda": "Lambda",
  pollinations: "Pollinations",
  local: "FFmpeg",
};

function money(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function durationLabel(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function CostLine({
  cost,
  fallback,
}: {
  cost?: { totalUsd: number; byProvider: { provider: string; usd: number }[] };
  fallback: number | null;
}) {
  const parts = (cost?.byProvider ?? []).filter((p) => p.usd > 0);
  const total = cost && cost.totalUsd > 0 ? cost.totalUsd : fallback && fallback > 0 ? fallback : 0;
  if (total <= 0 && parts.length === 0) {
    return <p className="control-cost">Custo variável: ainda sem registro</p>;
  }
  return (
    <p className="control-cost">
      {parts.map((p) => (
        <span key={p.provider}>
          {PROVIDER_LABEL[p.provider] || p.provider} {money(p.usd)}
        </span>
      ))}
      <strong>Total {money(total)}</strong>
    </p>
  );
}

export function ControlPanel({
  channelId,
  projects,
  jobByProject,
}: {
  channelId: string;
  projects: VideoProject[];
  jobByProject: Record<string, JobSnap>;
}) {
  const [costs, setCosts] = React.useState<
    Record<
      string,
      {
        totalUsd: number;
        byProvider: { provider: string; usd: number }[];
        youtubeVideoId: string | null;
        publishedAt: string | null;
      }
    >
  >({});

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/channels/${channelId}/usage?period=all`);
        const json = (await res.json()) as {
          projects?: {
            id: string;
            totalUsd: number;
            byProvider?: { provider: string; usd: number }[];
            youtubeVideoId?: string | null;
            publishedAt?: string | null;
          }[];
        };
        if (cancelled || !json.projects) return;
        const map: typeof costs = {};
        for (const row of json.projects) {
          map[row.id] = {
            totalUsd: row.totalUsd,
            byProvider: row.byProvider ?? [],
            youtubeVideoId: row.youtubeVideoId ?? null,
            publishedAt: row.publishedAt ?? null,
          };
        }
        setCosts(map);
      } catch {
        /* the board still shows progress without money */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId, projects.length]);
  const rows = [...projects].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const queue = rows
    .filter((project) => {
      const job = jobByProject[project.id];
      return job ? LIVE.includes(job.status as JobStatus) : LIVE.includes(project.status);
    })
    .sort((a, b) => {
      const ra = queueRank(jobByProject[a.id]?.status || a.status);
      const rb = queueRank(jobByProject[b.id]?.status || b.status);
      if (ra !== rb) return ra - rb;
      return a.createdAt < b.createdAt ? -1 : 1;
    });

  const seen = (project: VideoProject) => {
    const extra = costs[project.id];
    const youtubeVideoId = project.youtubeVideoId || extra?.youtubeVideoId || null;
    return youtubeVideoId ? { ...project, youtubeVideoId } : project;
  };

  const onYoutube = rows.filter((p) => seen(p).youtubeVideoId).length;
  const working = queue.filter((p) => (jobByProject[p.id]?.status || p.status) !== "planned").length;

  return (
    <section className="control-board">
      <div className="workspace-section-title">
        <h2>Painel</h2>
        <p>Onde está cada vídeo e o que está na fila. Um por vez no servidor.</p>
      </div>

      <div className="control-stats">
        <span><strong>{queue.length}</strong> na fila</span>
        <span><strong>{working}</strong> em andamento</span>
        <span><strong>{onYoutube}</strong> no YouTube</span>
        <span><strong>{rows.length}</strong> no total</span>
      </div>

      <h3 className="control-subtitle">Fila</h3>
      {queue.length === 0 ? (
        <p className="control-empty">Nada na fila. O próximo que entrar é o que o servidor pega.</p>
      ) : (
        <ol className="control-queue">
          {queue.map((project, index) => {
            const job = jobByProject[project.id];
            const snap = controlSnapshot(seen(project), job);
            const waiting = (job?.status || project.status) === "planned";
            return (
              <li key={project.id}>
                <span className="control-pos">{waiting ? index + 1 : "●"}</span>
                <div>
                  <strong>{project.title}</strong>
                  <small>{waiting ? "Esperando" : snap.stage}</small>
                </div>
                <em>{snap.percent}%</em>
              </li>
            );
          })}
        </ol>
      )}

      <h3 className="control-subtitle">Todos os vídeos</h3>
      <ul className="control-list">
        {rows.map((raw) => {
          const project = seen(raw);
          const extra = costs[raw.id];
          const snap = controlSnapshot(project, jobByProject[project.id]);
          const length = durationLabel(project.renderDurationSeconds);
          const covers = project.thumbnailConcept?.candidates?.length ?? (project.thumbnailRef ? 1 : 0);
          return (
            <li key={project.id} className={`control-row is-${snap.kind}`}>
              <div className="control-row-head">
                <strong>{project.title}</strong>
                <span>{snap.percent}%</span>
              </div>
              <p className="control-when">
                <span>Começou {when(project.createdAt)}</span>
                {project.youtubeVideoId ? (
                  <span>
                    Publicado {extra?.publishedAt ? when(extra.publishedAt) : "no YouTube"}
                  </span>
                ) : (
                  <span>Não publicado pelo sistema</span>
                )}
                {length ? (
                  <span>
                    Duração {length}
                    {project.durationMinutes ? ` · pedido ${project.durationMinutes} min` : ""}
                  </span>
                ) : null}
                <span>{covers} {covers === 1 ? "portada" : "portadas"}</span>
              </p>
              <div className="control-bar" role="progressbar" aria-valuenow={snap.percent} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${snap.percent}%` }} />
              </div>
              <div className="control-steps">
                {STEPS.map((step, index) => (
                  <span key={step.id} className={index <= snap.step ? "on" : ""}>
                    {step.label}
                  </span>
                ))}
              </div>
              <small>{snap.stage.length > 140 ? `${snap.stage.slice(0, 140)}…` : snap.stage}</small>
              <CostLine cost={costs[project.id]} fallback={project.costUsdTotal} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
