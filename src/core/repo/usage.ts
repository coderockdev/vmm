import { randomUUID } from "crypto";
import { getDb } from "../db";
import { getSupabase, isSupabaseEnabled, assertNoError } from "../supabaseClient";
import { estimateUsd } from "../usage/pricing";
import {
  CostBreakdown,
  emptyBreakdown,
  UsageEvent,
  UsageSnapshot,
  UsageStage,
} from "../usage/types";

interface UsageRow {
  id: string;
  channel_id: string;
  content_plan_id: string | null;
  content_idea_id: string | null;
  video_project_id: string | null;
  stage: string;
  provider: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  characters: number | null;
  duration_seconds: number | null;
  estimated_usd: number;
  raw_usage: string | object | null;
  created_at: string;
}

function rowToEvent(row: UsageRow): UsageEvent {
  const raw =
    typeof row.raw_usage === "string"
      ? (() => {
          try {
            return JSON.parse(row.raw_usage);
          } catch {
            return row.raw_usage;
          }
        })()
      : row.raw_usage;
  return {
    id: row.id,
    channelId: row.channel_id,
    contentPlanId: row.content_plan_id,
    contentIdeaId: row.content_idea_id,
    videoProjectId: row.video_project_id,
    stage: row.stage as UsageStage,
    provider: row.provider,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    characters: row.characters,
    durationSeconds: row.duration_seconds,
    estimatedUsd: Number(row.estimated_usd) || 0,
    rawUsage: raw,
    createdAt: row.created_at,
  };
}

export async function insertUsageEvent(input: {
  channelId: string;
  contentPlanId?: string | null;
  contentIdeaId?: string | null;
  videoProjectId?: string | null;
  stage: UsageStage;
  snapshot: UsageSnapshot;
}): Promise<UsageEvent> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const inputTokens = input.snapshot.inputTokens ?? null;
  const outputTokens = input.snapshot.outputTokens ?? null;
  const totalTokens =
    inputTokens != null || outputTokens != null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null;
  const estimatedUsd = estimateUsd(input.snapshot);
  const rawJson = input.snapshot.raw != null ? JSON.stringify(input.snapshot.raw) : null;

  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("usage_events")
        .insert({
          id,
          channel_id: input.channelId,
          content_plan_id: input.contentPlanId ?? null,
          content_idea_id: input.contentIdeaId ?? null,
          video_project_id: input.videoProjectId ?? null,
          stage: input.stage,
          provider: input.snapshot.provider,
          model: input.snapshot.model ?? null,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          characters: input.snapshot.characters ?? null,
          duration_seconds: input.snapshot.durationSeconds ?? null,
          estimated_usd: estimatedUsd,
          raw_usage: input.snapshot.raw ?? null,
          created_at: now,
        })
    );
  } else {
    getDb()
      .prepare(
        `INSERT INTO usage_events
          (id, channel_id, content_plan_id, content_idea_id, video_project_id, stage, provider, model,
           input_tokens, output_tokens, total_tokens, characters, duration_seconds, estimated_usd, raw_usage, created_at)
         VALUES
          (@id, @channelId, @contentPlanId, @contentIdeaId, @videoProjectId, @stage, @provider, @model,
           @inputTokens, @outputTokens, @totalTokens, @characters, @durationSeconds, @estimatedUsd, @rawUsage, @createdAt)`
      )
      .run({
        id,
        channelId: input.channelId,
        contentPlanId: input.contentPlanId ?? null,
        contentIdeaId: input.contentIdeaId ?? null,
        videoProjectId: input.videoProjectId ?? null,
        stage: input.stage,
        provider: input.snapshot.provider,
        model: input.snapshot.model ?? null,
        inputTokens,
        outputTokens,
        totalTokens,
        characters: input.snapshot.characters ?? null,
        durationSeconds: input.snapshot.durationSeconds ?? null,
        estimatedUsd,
        rawUsage: rawJson,
        createdAt: now,
      });
  }

  if (input.videoProjectId) {
    await recomputeProjectCost(input.videoProjectId);
  }

  return {
    id,
    channelId: input.channelId,
    contentPlanId: input.contentPlanId ?? null,
    contentIdeaId: input.contentIdeaId ?? null,
    videoProjectId: input.videoProjectId ?? null,
    stage: input.stage,
    provider: input.snapshot.provider,
    model: input.snapshot.model ?? null,
    inputTokens,
    outputTokens,
    totalTokens,
    characters: input.snapshot.characters ?? null,
    durationSeconds: input.snapshot.durationSeconds ?? null,
    estimatedUsd,
    rawUsage: input.snapshot.raw ?? null,
    createdAt: now,
  };
}

export async function listUsageForProject(videoProjectId: string): Promise<UsageEvent[]> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("usage_events")
      .select("*")
      .eq("video_project_id", videoProjectId)
      .order("created_at", { ascending: true });
    return assertNoError(res).map((r) => rowToEvent(r as UsageRow));
  }
  const rows = getDb()
    .prepare(`SELECT * FROM usage_events WHERE video_project_id = ? ORDER BY created_at ASC`)
    .all(videoProjectId) as UsageRow[];
  return rows.map(rowToEvent);
}

export async function listUsageForPlan(contentPlanId: string): Promise<UsageEvent[]> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("usage_events")
      .select("*")
      .eq("content_plan_id", contentPlanId)
      .order("created_at", { ascending: true });
    return assertNoError(res).map((r) => rowToEvent(r as UsageRow));
  }
  const rows = getDb()
    .prepare(`SELECT * FROM usage_events WHERE content_plan_id = ? ORDER BY created_at ASC`)
    .all(contentPlanId) as UsageRow[];
  return rows.map(rowToEvent);
}

function breakdownFromEvents(events: UsageEvent[]): CostBreakdown {
  const b = emptyBreakdown();
  for (const e of events) {
    if (e.stage in b) b[e.stage as keyof CostBreakdown] += e.estimatedUsd;
  }
  return b;
}

async function mergeUnique(into: UsageEvent[], extra: UsageEvent[]) {
  const seen = new Set(into.map((e) => e.id));
  for (const e of extra) {
    if (!seen.has(e.id)) into.push(e);
  }
}

export async function recomputeProjectCost(videoProjectId: string): Promise<{
  total: number;
  breakdown: CostBreakdown;
}> {
  // Project-linked events + shared script (idea) + plan-level ideas cost.
  let events: UsageEvent[] = await listUsageForProject(videoProjectId);

  if (isSupabaseEnabled()) {
    const projectRes = await getSupabase()
      .from("video_projects")
      .select("id, content_idea_id")
      .eq("id", videoProjectId)
      .maybeSingle();
    const project = assertNoError(projectRes) as { id: string; content_idea_id: string | null } | null;
    if (project?.content_idea_id) {
      const ideaRes = await getSupabase()
        .from("usage_events")
        .select("*")
        .eq("content_idea_id", project.content_idea_id)
        .eq("stage", "script");
      await mergeUnique(events, assertNoError(ideaRes).map((r) => rowToEvent(r as UsageRow)));

      const ideaRow = await getSupabase()
        .from("content_ideas")
        .select("plan_id")
        .eq("id", project.content_idea_id)
        .maybeSingle();
      const planId = (assertNoError(ideaRow) as { plan_id: string } | null)?.plan_id;
      if (planId) {
        const planRes = await getSupabase()
          .from("usage_events")
          .select("*")
          .eq("content_plan_id", planId)
          .eq("stage", "ideas");
        await mergeUnique(events, assertNoError(planRes).map((r) => rowToEvent(r as UsageRow)));
      }
    }
  } else {
    const project = getDb()
      .prepare(`SELECT id, content_idea_id FROM video_projects WHERE id = ?`)
      .get(videoProjectId) as { id: string; content_idea_id: string | null } | undefined;
    if (project?.content_idea_id) {
      const ideaRows = getDb()
        .prepare(`SELECT * FROM usage_events WHERE content_idea_id = ? AND stage = 'script'`)
        .all(project.content_idea_id) as UsageRow[];
      await mergeUnique(events, ideaRows.map(rowToEvent));

      const idea = getDb()
        .prepare(`SELECT plan_id FROM content_ideas WHERE id = ?`)
        .get(project.content_idea_id) as { plan_id: string } | undefined;
      if (idea?.plan_id) {
        const planRows = getDb()
          .prepare(`SELECT * FROM usage_events WHERE content_plan_id = ? AND stage = 'ideas'`)
          .all(idea.plan_id) as UsageRow[];
        await mergeUnique(events, planRows.map(rowToEvent));
      }
    }
  }

  const breakdown = breakdownFromEvents(events);
  const total = breakdown.ideas + breakdown.script + breakdown.audio + breakdown.render;
  const now = new Date().toISOString();

  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("video_projects")
        .update({
          cost_usd_total: total,
          cost_breakdown_json: breakdown,
          updated_at: now,
        })
        .eq("id", videoProjectId)
    );
  } else {
    getDb()
      .prepare(
        `UPDATE video_projects SET cost_usd_total = ?, cost_breakdown_json = ?, updated_at = ? WHERE id = ?`
      )
      .run(total, JSON.stringify(breakdown), now, videoProjectId);
  }

  return { total, breakdown };
}
