import { randomUUID } from "crypto";
import { getDb } from "../db";
import { ContentIdea, ContentPlan, VideoFormat } from "../types";

interface PlanRow {
  id: string;
  channel_id: string;
  topic: string;
  quantity: number;
  duration_minutes: number;
  format: string;
  created_at: string;
}

interface IdeaRow {
  id: string;
  plan_id: string;
  title: string;
  angle: string;
  objective: string;
  status: string;
}

function rowToIdea(row: IdeaRow): ContentIdea {
  return {
    id: row.id,
    planId: row.plan_id,
    title: row.title,
    angle: row.angle,
    objective: row.objective,
    status: row.status as ContentIdea["status"],
  };
}

function loadItems(planId: string): ContentIdea[] {
  const rows = getDb()
    .prepare(`SELECT * FROM content_ideas WHERE plan_id = ? ORDER BY rowid ASC`)
    .all(planId) as IdeaRow[];
  return rows.map(rowToIdea);
}

function rowToPlan(row: PlanRow): ContentPlan {
  return {
    id: row.id,
    channelId: row.channel_id,
    topic: row.topic,
    quantity: row.quantity,
    durationMinutes: row.duration_minutes,
    format: row.format as VideoFormat,
    createdAt: row.created_at,
    items: loadItems(row.id),
  };
}

export function createContentPlan(input: {
  channelId: string;
  topic: string;
  quantity: number;
  durationMinutes: number;
  format: VideoFormat;
  ideas: Array<{ title: string; angle: string; objective: string }>;
}): ContentPlan {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  const insertPlan = db.prepare(
    `INSERT INTO content_plans (id, channel_id, topic, quantity, duration_minutes, format, created_at)
     VALUES (@id, @channelId, @topic, @quantity, @durationMinutes, @format, @createdAt)`
  );
  const insertIdea = db.prepare(
    `INSERT INTO content_ideas (id, plan_id, title, angle, objective, status)
     VALUES (@id, @planId, @title, @angle, @objective, 'planned')`
  );

  const tx = db.transaction(() => {
    insertPlan.run({
      id,
      channelId: input.channelId,
      topic: input.topic,
      quantity: input.quantity,
      durationMinutes: input.durationMinutes,
      format: input.format,
      createdAt: now,
    });
    for (const idea of input.ideas) {
      insertIdea.run({ id: randomUUID(), planId: id, ...idea });
    }
  });
  tx();

  return getContentPlan(id)!;
}

export function getContentPlan(id: string): ContentPlan | null {
  const row = getDb()
    .prepare(`SELECT * FROM content_plans WHERE id = ?`)
    .get(id) as PlanRow | undefined;
  return row ? rowToPlan(row) : null;
}

export function listPlansForChannel(channelId: string): ContentPlan[] {
  const rows = getDb()
    .prepare(`SELECT * FROM content_plans WHERE channel_id = ? ORDER BY created_at DESC`)
    .all(channelId) as PlanRow[];
  return rows.map(rowToPlan);
}

export function setIdeaStatus(ideaId: string, status: ContentIdea["status"]) {
  getDb().prepare(`UPDATE content_ideas SET status = ? WHERE id = ?`).run(status, ideaId);
}

export function listAllIdeaTitlesForChannel(channelId: string): string[] {
  const rows = getDb()
    .prepare(
      `SELECT i.title as title FROM content_ideas i
       JOIN content_plans p ON p.id = i.plan_id
       WHERE p.channel_id = ?`
    )
    .all(channelId) as Array<{ title: string }>;
  return rows.map((r) => r.title);
}

export function getIdea(ideaId: string): ContentIdea | null {
  const row = getDb()
    .prepare(`SELECT * FROM content_ideas WHERE id = ?`)
    .get(ideaId) as IdeaRow | undefined;
  return row ? rowToIdea(row) : null;
}
