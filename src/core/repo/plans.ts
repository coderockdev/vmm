import { randomUUID } from "crypto";
import { getDb } from "../db";
import { getSupabase, isSupabaseEnabled, assertNoError } from "../supabaseClient";
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

async function loadItems(planId: string): Promise<ContentIdea[]> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("content_ideas")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: true });
    return assertNoError(res).map(rowToIdea);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM content_ideas WHERE plan_id = ? ORDER BY rowid ASC`)
    .all(planId) as IdeaRow[];
  return rows.map(rowToIdea);
}

async function rowToPlan(row: PlanRow): Promise<ContentPlan> {
  return {
    id: row.id,
    channelId: row.channel_id,
    topic: row.topic,
    quantity: row.quantity,
    durationMinutes: row.duration_minutes,
    format: row.format as VideoFormat,
    createdAt: row.created_at,
    items: await loadItems(row.id),
  };
}

export async function createContentPlan(input: {
  channelId: string;
  topic: string;
  quantity: number;
  durationMinutes: number;
  format: VideoFormat;
  ideas: Array<{ title: string; angle: string; objective: string }>;
}): Promise<ContentPlan> {
  const id = randomUUID();
  const now = new Date().toISOString();

  if (isSupabaseEnabled()) {
    const supabase = getSupabase();
    assertNoError(
      await supabase.from("content_plans").insert({
        id,
        channel_id: input.channelId,
        topic: input.topic,
        quantity: input.quantity,
        duration_minutes: input.durationMinutes,
        format: input.format,
        created_at: now,
      })
    );
    if (input.ideas.length > 0) {
      assertNoError(
        await supabase.from("content_ideas").insert(
          input.ideas.map((idea) => ({
            id: randomUUID(),
            plan_id: id,
            title: idea.title,
            angle: idea.angle,
            objective: idea.objective,
            status: "planned",
          }))
        )
      );
    }
    return (await getContentPlan(id))!;
  }

  const db = getDb();
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

  return (await getContentPlan(id))!;
}

export async function getContentPlan(id: string): Promise<ContentPlan | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("content_plans").select("*").eq("id", id).maybeSingle();
    const row = assertNoError(res);
    return row ? await rowToPlan(row as PlanRow) : null;
  }
  const row = getDb().prepare(`SELECT * FROM content_plans WHERE id = ?`).get(id) as PlanRow | undefined;
  return row ? await rowToPlan(row) : null;
}

export async function listPlansForChannel(channelId: string): Promise<ContentPlan[]> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("content_plans")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false });
    return Promise.all(assertNoError(res).map((row: PlanRow) => rowToPlan(row)));
  }
  const rows = getDb()
    .prepare(`SELECT * FROM content_plans WHERE channel_id = ? ORDER BY created_at DESC`)
    .all(channelId) as PlanRow[];
  return Promise.all(rows.map((row) => rowToPlan(row)));
}

export async function setIdeaStatus(ideaId: string, status: ContentIdea["status"]): Promise<void> {
  if (isSupabaseEnabled()) {
    assertNoError(await getSupabase().from("content_ideas").update({ status }).eq("id", ideaId));
    return;
  }
  getDb().prepare(`UPDATE content_ideas SET status = ? WHERE id = ?`).run(status, ideaId);
}

export async function listAllIdeaTitlesForChannel(channelId: string): Promise<string[]> {
  if (isSupabaseEnabled()) {
    const planIdsRes = await getSupabase().from("content_plans").select("id").eq("channel_id", channelId);
    const planIds = assertNoError(planIdsRes).map((p: { id: string }) => p.id);
    if (planIds.length === 0) return [];
    const res = await getSupabase().from("content_ideas").select("title").in("plan_id", planIds);
    return assertNoError(res).map((r: { title: string }) => r.title);
  }
  const rows = getDb()
    .prepare(
      `SELECT i.title as title FROM content_ideas i
       JOIN content_plans p ON p.id = i.plan_id
       WHERE p.channel_id = ?`
    )
    .all(channelId) as Array<{ title: string }>;
  return rows.map((r) => r.title);
}

export async function getIdea(ideaId: string): Promise<ContentIdea | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("content_ideas").select("*").eq("id", ideaId).maybeSingle();
    const row = assertNoError(res);
    return row ? rowToIdea(row as IdeaRow) : null;
  }
  const row = getDb().prepare(`SELECT * FROM content_ideas WHERE id = ?`).get(ideaId) as IdeaRow | undefined;
  return row ? rowToIdea(row) : null;
}
