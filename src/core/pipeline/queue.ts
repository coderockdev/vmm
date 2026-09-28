import { getJob, updateJob, findNextPendingJobId } from "../repo/jobs";
import { runProject } from "./runProject";

declare global {
  // eslint-disable-next-line no-var
  var __vmmQueueRunning: boolean | undefined;
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
      const jobId = await findNextPendingJobId();
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

export async function enqueueJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  await updateJob(jobId, { status: "planned", progress: 0, statusMessage: "Na fila" });
  wake();
}
