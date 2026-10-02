import { getJob, updateJob, claimNextPlannedJobId, findNextPendingJobId } from "../repo/jobs";
import { runProject } from "./runProject";

/** The page sets VMM_QUEUE=off. Only the Hetzner worker renders. */
export function localQueueEnabled(): boolean {
  const mode = (process.env.VMM_QUEUE ?? "on").trim().toLowerCase();
  return mode !== "off" && mode !== "remote";
}

declare global {
  // eslint-disable-next-line no-var
  var __vmmQueueRunning: boolean | undefined;
  // eslint-disable-next-line no-var
  var __vmmQueueStartedAt: number | undefined;
}

/** If the loop flag is stuck true (HMR / aborted await), clear after this. */
const STALE_QUEUE_LOCK_MS = 45 * 60 * 1000;

/**
 * A single-concurrency worker: only one heavy render runs at a time (per
 * spec section 12). Call `wake()` any time a job is enqueued; it's a no-op
 * if the loop is already running — unless the lock looks stale.
 */
export function wake(): void {
  if (!localQueueEnabled()) return;
  const started = global.__vmmQueueStartedAt ?? 0;
  if (global.__vmmQueueRunning) {
    if (Date.now() - started < STALE_QUEUE_LOCK_MS) return;
    // eslint-disable-next-line no-console
    console.warn("[queue] clearing stale __vmmQueueRunning lock — retomando fila");
  }
  global.__vmmQueueRunning = true;
  global.__vmmQueueStartedAt = Date.now();
  void loop();
}

/** Always start a loop (after clearing a lock). Used by reconcile after requeues. */
export function forceWake(): void {
  global.__vmmQueueRunning = false;
  global.__vmmQueueStartedAt = undefined;
  wake();
}

async function loop(): Promise<void> {
  try {
    while (true) {
      const jobId = await claimNextPlannedJobId(process.env.VMM_WORKER_NAME || "local");
      if (!jobId) {
        if (await findNextPendingJobId()) continue;
        const { runNextAudiobookChapter } = await import("../audiobook/runChapter");
        const ranChapter = await runNextAudiobookChapter().catch((err) => {
          console.error("[queue] capítulo:", err instanceof Error ? err.message : err);
          return false;
        });
        if (ranChapter) continue;
        break;
      }
      global.__vmmQueueStartedAt = Date.now();
      try {
        await runProject(jobId);
      } catch (err) {
        // runProject already persisted the failure onto the job/project;
        // keep draining the rest of the queue instead of stopping.
        console.error(`[queue] job ${jobId} failed:`, err);
      }
      global.__vmmQueueStartedAt = Date.now();
    }
  } finally {
    global.__vmmQueueRunning = false;
    global.__vmmQueueStartedAt = undefined;
  }
}

export async function enqueueJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  await updateJob(jobId, { status: "planned", progress: 0, statusMessage: "Na fila" });
  wake();
}
