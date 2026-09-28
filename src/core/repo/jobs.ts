import { randomUUID } from "crypto";
import { getDb } from "../db";
import { JobStatus, ProductionJob } from "../types";

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

export function createJob(input: {
  videoProjectId: string;
  channelId: string;
}): ProductionJob {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO production_jobs (id, video_project_id, channel_id, status, progress, status_message, created_at, updated_at)
       VALUES (@id, @videoProjectId, @channelId, 'planned', 0, 'Na fila', @createdAt, @updatedAt)`
    )
    .run({ id, videoProjectId: input.videoProjectId, channelId: input.channelId, createdAt: now, updatedAt: now });
  return getJob(id)!;
}

export function getJob(id: string): ProductionJob | null {
  const row = getDb().prepare(`SELECT * FROM production_jobs WHERE id = ?`).get(id) as
    | JobRow
    | undefined;
  return row ? rowToJob(row) : null;
}

export function getJobForProject(videoProjectId: string): ProductionJob | null {
  const row = getDb()
    .prepare(`SELECT * FROM production_jobs WHERE video_project_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(videoProjectId) as JobRow | undefined;
  return row ? rowToJob(row) : null;
}

export function listJobs(): ProductionJob[] {
  const rows = getDb()
    .prepare(`SELECT * FROM production_jobs ORDER BY created_at ASC`)
    .all() as JobRow[];
  return rows.map(rowToJob);
}

export function updateJob(
  id: string,
  fields: Partial<Pick<ProductionJob, "status" | "progress" | "statusMessage">>
) {
  const current = getJob(id);
  if (!current) return;
  getDb()
    .prepare(
      `UPDATE production_jobs SET status = ?, progress = ?, status_message = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      fields.status ?? current.status,
      fields.progress ?? current.progress,
      fields.statusMessage ?? current.statusMessage,
      new Date().toISOString(),
      id
    );
}
