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
    ? "No YouTube"
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

export function ControlPanel({
  projects,
  jobByProject,
}: {
  projects: VideoProject[];
  jobByProject: Record<string, JobSnap>;
}) {
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

  const onYoutube = rows.filter((p) => p.youtubeVideoId).length;
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
            const snap = controlSnapshot(project, job);
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
        {rows.map((project) => {
          const snap = controlSnapshot(project, jobByProject[project.id]);
          return (
            <li key={project.id} className={`control-row is-${snap.kind}`}>
              <div className="control-row-head">
                <strong>{project.title}</strong>
                <span>{snap.percent}%</span>
              </div>
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
              <small>{snap.stage}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
