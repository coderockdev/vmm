import { NextResponse } from "next/server";
import { listJobs } from "../../../core/repo/jobs";
import { humanOf, readClock } from "../../../core/pipeline/stepClock";
import { getSupabase, isSupabaseEnabled, assertNoError } from "../../../core/supabaseClient";
import { getDb } from "../../../core/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await listJobs();
  if (jobs.length === 0) return NextResponse.json({ jobs: [] });

  const projectIds = [...new Set(jobs.map((job) => job.videoProjectId))];
  const channelIds = [...new Set(jobs.map((job) => job.channelId))];
  const titles = new Map<string, string>();
  const names = new Map<string, string>();

  if (isSupabaseEnabled()) {
    const [projects, channels] = await Promise.all([
      getSupabase().from("video_projects").select("id, title").in("id", projectIds),
      getSupabase().from("channels").select("id, name").in("id", channelIds),
    ]);
    for (const row of (assertNoError(projects) ?? []) as Array<{ id: string; title: string | null }>) {
      if (row.title) titles.set(row.id, row.title);
    }
    for (const row of (assertNoError(channels) ?? []) as Array<{ id: string; name: string | null }>) {
      if (row.name) names.set(row.id, row.name);
    }
  } else {
    const projectRows = getDb()
      .prepare(
        `SELECT id, title FROM video_projects WHERE id IN (${projectIds.map(() => "?").join(",")})`
      )
      .all(...projectIds) as Array<{ id: string; title: string }>;
    for (const row of projectRows) titles.set(row.id, row.title);
    const channelRows = getDb()
      .prepare(`SELECT id, name FROM channels WHERE id IN (${channelIds.map(() => "?").join(",")})`)
      .all(...channelIds) as Array<{ id: string; name: string }>;
    for (const row of channelRows) names.set(row.id, row.name);
  }

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      ...job,
      statusMessage: humanOf(job.statusMessage),
      steps: readClock(job.statusMessage),
      projectTitle: titles.get(job.videoProjectId) ?? "—",
      channelName: names.get(job.channelId) ?? "—",
      channelId: job.channelId,
    })),
  });
}
