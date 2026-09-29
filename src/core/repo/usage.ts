import { randomUUID } from "crypto";
import { getDb } from "../db";
import { getSupabase, isSupabaseEnabled, assertNoError } from "../supabaseClient";
import { estimateUsd } from "../usage/pricing";
import {
  CostBreakdown,
  emptyBreakdown,
  normalizeBreakdown,
  sumBreakdown,
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

/** When usage_events insert fails, still accumulate a visible cost on the project. */
async function stampProjectCostFallback(
  videoProjectId: string,
  stage: UsageStage,
  estimatedUsd: number
): Promise<void> {
  if (!(estimatedUsd > 0)) return;
  try {
    const project = isSupabaseEnabled()
      ? ((await assertNoError(
          await getSupabase()
            .from("video_projects")
            .select("cost_usd_total, cost_breakdown_json")
            .eq("id", videoProjectId)
            .maybeSingle()
        )) as { cost_usd_total: number | null; cost_breakdown_json: CostBreakdown | string | null } | null)
      : (getDb()
          .prepare(`SELECT cost_usd_total, cost_breakdown_json FROM video_projects WHERE id = ?`)
          .get(videoProjectId) as {
          cost_usd_total: number | null;
          cost_breakdown_json: string | null;
        } | null);

    if (!project) return;
    const prev =
      typeof project.cost_breakdown_json === "string"
        ? (() => {
            try {
              return JSON.parse(project.cost_breakdown_json) as CostBreakdown;
            } catch {
              return emptyBreakdown();
            }
          })()
        : project.cost_breakdown_json && typeof project.cost_breakdown_json === "object"
          ? (project.cost_breakdown_json as CostBreakdown)
          : emptyBreakdown();
    const breakdown = normalizeBreakdown(prev);
    if (stage in breakdown) {
      breakdown[stage as keyof CostBreakdown] += estimatedUsd;
    }
    const total = sumBreakdown(breakdown);
    const now = new Date().toISOString();
    if (isSupabaseEnabled()) {
      await getSupabase()
        .from("video_projects")
        .update({ cost_usd_total: total, cost_breakdown_json: breakdown, updated_at: now })
        .eq("id", videoProjectId);
    } else {
      getDb()
        .prepare(
          `UPDATE video_projects SET cost_usd_total = ?, cost_breakdown_json = ?, updated_at = ? WHERE id = ?`
        )
        .run(total, JSON.stringify(breakdown), now, videoProjectId);
    }
  } catch (err) {
    console.warn(`[usage] stampProjectCostFallback failed:`, err);
  }
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
    const res = await getSupabase()
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
      });
    if (res.error) {
      // Schema not migrated yet — don't block content generation, but still
      // stamp the project cost so the UI keeps showing a number.
      console.warn(
        `[usage] insert failed (${res.error.message}). Run supabase/schema_usage.sql in the Supabase SQL editor.`
      );
      if (input.videoProjectId) {
        await stampProjectCostFallback(input.videoProjectId, input.stage, estimatedUsd);
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
    if (res.error) {
      console.warn(`[usage] list failed (${res.error.message})`);
      return [];
    }
    return (res.data ?? []).map((r) => rowToEvent(r as UsageRow));
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
    if (res.error) {
      console.warn(`[usage] list plan failed (${res.error.message})`);
      return [];
    }
    return (res.data ?? []).map((r) => rowToEvent(r as UsageRow));
  }
  const rows = getDb()
    .prepare(`SELECT * FROM usage_events WHERE content_plan_id = ? ORDER BY created_at ASC`)
    .all(contentPlanId) as UsageRow[];
  return rows.map(rowToEvent);
}

/** All usage events for a channel, optionally since an ISO timestamp (inclusive). */
export async function listUsageForChannel(
  channelId: string,
  opts?: { since?: string | null }
): Promise<UsageEvent[]> {
  const since = opts?.since ?? null;
  if (isSupabaseEnabled()) {
    let query = getSupabase()
      .from("usage_events")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (since) query = query.gte("created_at", since);
    const res = await query;
    if (res.error) {
      console.warn(`[usage] list channel failed (${res.error.message})`);
      return [];
    }
    return (res.data ?? []).map((r) => rowToEvent(r as UsageRow));
  }
  if (since) {
    const rows = getDb()
      .prepare(
        `SELECT * FROM usage_events WHERE channel_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 2000`
      )
      .all(channelId, since) as UsageRow[];
    return rows.map(rowToEvent);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM usage_events WHERE channel_id = ? ORDER BY created_at DESC LIMIT 2000`)
    .all(channelId) as UsageRow[];
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
    try {
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
        if (!ideaRes.error) {
          await mergeUnique(events, (ideaRes.data ?? []).map((r) => rowToEvent(r as UsageRow)));
        }

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
          if (!planRes.error) {
            await mergeUnique(events, (planRes.data ?? []).map((r) => rowToEvent(r as UsageRow)));
          }
        }
      }
    } catch (err) {
      console.warn(`[usage] recompute gather failed:`, err);
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
  const total = sumBreakdown(breakdown);
  const now = new Date().toISOString();

  if (isSupabaseEnabled()) {
    const upd = await getSupabase()
      .from("video_projects")
      .update({
        cost_usd_total: total,
        cost_breakdown_json: breakdown,
        updated_at: now,
      })
      .eq("id", videoProjectId);
    if (upd.error) {
      // cost_* columns may be missing until schema_usage.sql is applied
      console.warn(`[usage] project cost update failed (${upd.error.message})`);
    }
  } else {
    getDb()
      .prepare(
        `UPDATE video_projects SET cost_usd_total = ?, cost_breakdown_json = ?, updated_at = ? WHERE id = ?`
      )
      .run(total, JSON.stringify(breakdown), now, videoProjectId);
  }

  return { total, breakdown };
}
