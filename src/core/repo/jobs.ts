import { randomUUID } from "crypto";
import { getDb } from "../db";
import { getSupabase, isSupabaseEnabled, assertNoError } from "../supabaseClient";
import { JobStatus, ProductionJob } from "../types";
import { advanceClock, humanOf, packClock, readClock } from "../pipeline/stepClock";

interface JobRow {
  id: string;
  video_project_id: string;
  channel_id: string;
  status: string;
  progress: number;
  status_message: string;
  created_at: string;
  updated_at: string;
}

function rowToJob(row: JobRow): ProductionJob {
  return {
    id: row.id,
    videoProjectId: row.video_project_id,
    channelId: row.channel_id,
    status: row.status as JobStatus,
    progress: row.progress,
    statusMessage: row.status_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createJob(input: { videoProjectId: string; channelId: string }): Promise<ProductionJob> {
  const id = randomUUID();
  const now = new Date().toISOString();

  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("production_jobs")
        .insert({
          id,
          video_project_id: input.videoProjectId,
          channel_id: input.channelId,
          status: "planned",
          progress: 0,
          status_message: "Na fila",
          created_at: now,
          updated_at: now,
        })
    );
    return (await getJob(id))!;
  }

  getDb()
    .prepare(
      `INSERT INTO production_jobs (id, video_project_id, channel_id, status, progress, status_message, created_at, updated_at)
       VALUES (@id, @videoProjectId, @channelId, 'planned', 0, 'Na fila', @createdAt, @updatedAt)`
    )
    .run({ id, videoProjectId: input.videoProjectId, channelId: input.channelId, createdAt: now, updatedAt: now });
  return (await getJob(id))!;
}

export async function getJob(id: string): Promise<ProductionJob | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("production_jobs").select("*").eq("id", id).maybeSingle();
    const row = assertNoError(res);
    return row ? rowToJob(row as JobRow) : null;
  }
  const row = getDb().prepare(`SELECT * FROM production_jobs WHERE id = ?`).get(id) as JobRow | undefined;
  return row ? rowToJob(row) : null;
}

export async function getJobForProject(videoProjectId: string): Promise<ProductionJob | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("production_jobs")
      .select("*")
      .eq("video_project_id", videoProjectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = assertNoError(res);
    return row ? rowToJob(row as JobRow) : null;
  }
  const row = getDb()
    .prepare(`SELECT * FROM production_jobs WHERE video_project_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(videoProjectId) as JobRow | undefined;
  return row ? rowToJob(row) : null;
}

export async function listJobs(): Promise<ProductionJob[]> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("production_jobs").select("*").order("created_at", { ascending: true });
    return assertNoError(res).map(rowToJob);
  }
  const rows = getDb().prepare(`SELECT * FROM production_jobs ORDER BY created_at ASC`).all() as JobRow[];
  return rows.map(rowToJob);
}

export async function updateJob(
  id: string,
  fields: Partial<Pick<ProductionJob, "status" | "progress" | "statusMessage">>
): Promise<void> {
  const current = await getJob(id);
  if (!current) return;
  const now = new Date().toISOString();
  const status = fields.status ?? current.status;
  const progress = fields.progress ?? current.progress;
  const human = humanOf(fields.statusMessage ?? current.statusMessage);
  const statusMessage = packClock(
    human,
    advanceClock(readClock(current.statusMessage), {
      status,
      message: human,
      now,
      jobCreatedAt: current.createdAt,
      previousUpdatedAt: current.updatedAt,
      previousStatus: current.status,
    })
  );

  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("production_jobs")
        .update({ status, progress, status_message: statusMessage, updated_at: now })
        .eq("id", id)
    );
    return;
  }

  getDb()
    .prepare(`UPDATE production_jobs SET status = ?, progress = ?, status_message = ?, updated_at = ? WHERE id = ?`)
    .run(status, progress, statusMessage, now, id);
}

/**
 * Take the oldest planned job so two machines cannot render it.
 * Returns null if another worker claimed it first.
 */
export async function claimNextPlannedJobId(workerLabel: string): Promise<string | null> {
  const id = await findNextPendingJobId();
  if (!id) return null;
  const now = new Date().toISOString();
  const message = `Tomado por ${workerLabel}`;

  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("production_jobs")
      .update({
        status: "audio",
        progress: 1,
        status_message: message,
        updated_at: now,
      })
      .eq("id", id)
      .eq("status", "planned")
      .select("id");
    const rows = assertNoError(res) as { id: string }[] | null;
    return rows && rows.length > 0 ? id : null;
  }

  const info = getDb()
    .prepare(
      `UPDATE production_jobs
       SET status = 'audio', progress = 1, status_message = ?, updated_at = ?
       WHERE id = ? AND status = 'planned'`
    )
    .run(message, now, id) as { changes: number };
  return info.changes > 0 ? id : null;
}

/** Used only by the queue's polling loop to find the next job to run. */
export async function findNextPendingJobId(): Promise<string | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("production_jobs")
      .select("id")
      .eq("status", "planned")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const row = assertNoError(res);
    return row?.id ?? null;
  }
  const row = getDb()
    .prepare(`SELECT id FROM production_jobs WHERE status = 'planned' ORDER BY created_at ASC LIMIT 1`)
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}
