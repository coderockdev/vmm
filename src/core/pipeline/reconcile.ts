import { listJobs, updateJob } from "../repo/jobs";
import { JobStatus } from "../types";
import { forceWake, localQueueEnabled, wake } from "./queue";
import { readProjectPublish } from "../repo/projectPublish";

declare global {
  // eslint-disable-next-line no-var
  var __vmmReconciled: boolean | undefined;
  // eslint-disable-next-line no-var
  var __vmmLastReconcileAt: number | undefined;
}

const IN_FLIGHT_STATUSES: JobStatus[] = ["audio", "timing", "composing", "rendering"];

/** How long without an update before we treat an in-flight job as dead. */
const STUCK_MS: Record<string, number> = {
  audio: 25 * 60 * 1000, // ElevenLabs can be slow on long scripts
  timing: 10 * 60 * 1000,
  composing: 15 * 60 * 1000,
  rendering: 35 * 60 * 1000, // scrolling-text FFmpeg can take a long time
};

const REQUEUE_MSG = "Retomado automaticamente após travamento — a continuar o fluxo.";
const MIN_RECONCILE_INTERVAL_MS = 45_000;

/**
 * Keep the production queue alive across hot-reloads and hung FFmpeg/TTS:
 * - On process boot: any in-flight job is orphaned → requeue (don't leave failed forever).
 * - Periodically (every ~45s via ensureSeeded / page polls): age-stuck in-flight → requeue.
 * - Always wake() if there are planned jobs.
 *
 * Called from ensureSeeded() on page loads so the UI polling naturally shepherds
 * a 10-video overnight batch without manual "Continuar".
 */
export async function reconcileStuckJobs(): Promise<void> {
  const now = Date.now();
  const isBoot = !global.__vmmReconciled;
  if (
    !isBoot &&
    global.__vmmLastReconcileAt &&
    now - global.__vmmLastReconcileAt < MIN_RECONCILE_INTERVAL_MS
  ) {
    return;
  }
  global.__vmmReconciled = true;
  global.__vmmLastReconcileAt = now;

  const { updateProjectStatus } = await import("../repo/projects");
  const jobs = await listJobs();
  let hasPlanned = false;
  let requeued = 0;

  for (const job of jobs) {
    if (job.status === "planned") {
      hasPlanned = true;
      continue;
    }

    if (!IN_FLIGHT_STATUSES.includes(job.status)) continue;

    const age = now - new Date(job.updatedAt).getTime();
    const limit = STUCK_MS[job.status] ?? 20 * 60 * 1000;
    // The page does not own the queue. A fresh in-flight job belongs to the
    // Hetzner worker — only age it out if that worker stopped updating it.
    const shouldRequeue = (localQueueEnabled() && isBoot) || age >= limit;
    if (!shouldRequeue) continue;

    const reason = isBoot
      ? "Retomado após reinício do servidor — a continuar."
      : `${REQUEUE_MSG} (${job.status} sem update há ${Math.round(age / 60000)} min)`;

    await updateJob(job.id, {
      status: "planned",
      progress: 0,
      statusMessage: reason,
    });
    // Clear failed/error so the Áudio tab shows production again.
    await updateProjectStatus(job.videoProjectId, "audio", null).catch(() => undefined);
    hasPlanned = true;
    requeued += 1;
    // eslint-disable-next-line no-console
    console.log(`[reconcile] requeued stuck job ${job.id.slice(0, 8)} (${job.status}, age=${Math.round(age / 60000)}m)`);
  }

  // Auto-flow projects left "failed" by an interrupt — put them back (recent only).
  for (const job of jobs) {
    if (job.status !== "failed") continue;
    const msg = job.statusMessage || "";
    const interrupted =
      /Interrompido|travou|Retomado automaticamente|servidor foi reiniciado/i.test(msg);
    if (!interrupted) continue;
    const age = now - new Date(job.updatedAt).getTime();
    if (age > 2 * 60 * 60 * 1000) continue; // older than 2h — leave it
    const publish = readProjectPublish(job.videoProjectId);
    if (!publish?.autoFlow) continue;

    await updateJob(job.id, {
      status: "planned",
      progress: 0,
      statusMessage: "Retomado automaticamente (falha anterior) — a continuar.",
    });
    await updateProjectStatus(job.videoProjectId, "audio", null).catch(() => undefined);
    hasPlanned = true;
    requeued += 1;
    // eslint-disable-next-line no-console
    console.log(`[reconcile] requeued failed auto job ${job.id.slice(0, 8)}`);
  }

  if (hasPlanned && localQueueEnabled()) {
    if (requeued > 0 || isBoot) forceWake();
    else wake();
  }
}

/** Manual / API helper: requeue one project’s latest job. */
export async function requeueProjectJob(projectId: string, reason = REQUEUE_MSG): Promise<boolean> {
  const { listJobs: list } = await import("../repo/jobs");
  const { updateProjectStatus } = await import("../repo/projects");
  const { createJob } = await import("../repo/jobs");
  const { getVideoProject } = await import("../repo/projects");
  const { enqueueJob } = await import("./queue");

  const project = await getVideoProject(projectId);
  if (!project) return false;

  const jobs = (await list()).filter((j) => j.videoProjectId === projectId);
  const latest = jobs.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (latest && ["planned", "audio", "timing", "composing", "rendering"].includes(latest.status)) {
    await updateJob(latest.id, { status: "planned", progress: 0, statusMessage: reason });
    await updateProjectStatus(projectId, "audio", null).catch(() => undefined);
    forceWake();
    return true;
  }
  const job = await createJob({ videoProjectId: projectId, channelId: project.channelId });
  await updateProjectStatus(projectId, "audio", null).catch(() => undefined);
  await enqueueJob(job.id);
  return true;
}
