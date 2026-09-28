import { listJobs, updateJob } from "../repo/jobs";
import { JobStatus } from "../types";
import { wake } from "./queue";

declare global {
  // eslint-disable-next-line no-var
  var __vmmReconciled: boolean | undefined;
}

// A ProductionJob only sits in one of these while THIS process's queue loop
// (queue.ts) is actively running it. If the process restarted (crash, dev
// server bounce), any job still in one of these from before is orphaned —
// nothing will ever pick it back up — so it gets marked failed instead of
// showing fake progress forever.
const IN_FLIGHT_STATUSES: JobStatus[] = ["audio", "timing", "composing", "rendering"];
const INTERRUPTED_MESSAGE = "Interrompido: o servidor foi reiniciado durante o processamento. Gere novamente.";

/**
 * Runs once per server process (guarded by a global flag). Called from
 * ensureSeeded() so every page load gets a sane job list without needing a
 * dedicated startup hook.
 *
 * updateProjectStatus is loaded lazily to avoid a circular import with
 * page.tsx → seed → reconcile → projects (which left named exports undefined
 * under webpack and made channel tabs look clickable but do nothing).
 */
export async function reconcileStuckJobs(): Promise<void> {
  if (global.__vmmReconciled) return;
  global.__vmmReconciled = true;

  const { updateProjectStatus } = await import("../repo/projects");
  const jobs = await listJobs();
  let hasPlanned = false;

  for (const job of jobs) {
    if (job.status === "planned") {
      hasPlanned = true;
    } else if (IN_FLIGHT_STATUSES.includes(job.status)) {
      await updateJob(job.id, { status: "failed", statusMessage: INTERRUPTED_MESSAGE });
      await updateProjectStatus(job.videoProjectId, "failed", INTERRUPTED_MESSAGE);
      // eslint-disable-next-line no-console
      console.log(`[reconcile] marked orphaned job ${job.id} as failed`);
    }
  }

  // A job still "planned" was queued but never started (or the wake() that
  // should have started it never fired in this process) — give it a fresh
  // wake() rather than leaving it silently parked.
  if (hasPlanned) wake();
}
