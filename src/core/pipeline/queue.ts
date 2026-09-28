import { getDb } from "../db";
import { getJob, updateJob } from "../repo/jobs";
import { runProject } from "./runProject";

declare global {
  // eslint-disable-next-line no-var
  var __vmmQueueRunning: boolean | undefined;
}

interface PendingJobRow {
  id: string;
}

function nextPendingJobId(): string | null {
  const row = getDb()
    .prepare(`SELECT id FROM production_jobs WHERE status = 'planned' ORDER BY created_at ASC LIMIT 1`)
    .get() as PendingJobRow | undefined;
  return row?.id ?? null;
}

/**
 * A single-concurrency worker: only one heavy render runs at a time (per
 * spec section 12). Call `wake()` any time a job is enqueued; it's a no-op
 * if the loop is already running.
 */
export function wake(): void {
  if (global.__vmmQueueRunning) return;
  global.__vmmQueueRunning = true;
  void loop();
}

async function loop(): Promise<void> {
  try {
    while (true) {
      const jobId = nextPendingJobId();
      if (!jobId) break;
      try {
        await runProject(jobId);
      } catch (err) {
        // runProject already persisted the failure onto the job/project;
        // keep draining the rest of the queue instead of stopping.
        console.error(`[queue] job ${jobId} failed:`, err);
      }
    }
  } finally {
    global.__vmmQueueRunning = false;
  }
}

export function enqueueJob(jobId: string): void {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  updateJob(jobId, { status: "planned", progress: 0, statusMessage: "Na fila" });
  wake();
}
