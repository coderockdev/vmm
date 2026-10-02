import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import { listProjectsForChannel } from "../../../../../core/repo/projects";
import { chirpMonthSummary, listUsageForChannel, listUsdOf, providerTaskLabel, spendTask } from "../../../../../core/repo/usage";
import {
  CostBreakdown,
  emptyBreakdown,
  normalizeBreakdown,
  sumBreakdown,
  UsageEvent,
  UsageStage,
} from "../../../../../core/usage/types";

export type CostPeriod = "7d" | "30d" | "90d" | "all";

function periodSince(period: CostPeriod): string | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function stageMarks(events: UsageEvent[]): Record<string, { start: string; end: string } | null> {
  const marks: Record<string, { start: string; end: string } | null> = {};
  for (const stage of ["script", "audio", "music", "render", "thumbnail", "youtube"] as const) {
    const times = events
      .filter((event) => event.stage === stage)
      .map((event) => event.createdAt)
      .sort();
    marks[stage] = times.length ? { start: times[0], end: times[times.length - 1] } : null;
  }
  return marks;
}

function inPeriod(iso: string, since: string | null): boolean {
  if (!since) return true;
  return iso >= since;
}

export async function GET(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const periodParam = req.nextUrl.searchParams.get("period") ?? "30d";
  const period: CostPeriod =
    periodParam === "7d" || periodParam === "30d" || periodParam === "90d" || periodParam === "all"
      ? periodParam
      : "30d";
  const since = periodSince(period);

  const [events, projects, chirp] = await Promise.all([
    listUsageForChannel(channel.id, { since }),
    listProjectsForChannel(channel.id),
    chirpMonthSummary(),
  ]);

  const projectsInPeriod = projects.filter((p) => inPeriod(p.createdAt, since));
  const titleById = new Map(projects.map((p) => [p.id, p.title]));

  const byStage: CostBreakdown = emptyBreakdown();
  const providerMap = new Map<
    string,
    { provider: string; task: string; label: string; usd: number; listUsd: number; characters: number; count: number }
  >();

  for (const e of events) {
    if (e.stage in byStage) byStage[e.stage as keyof CostBreakdown] += e.estimatedUsd;
    const task = spendTask(e.stage);
    const key = `${e.provider || "unknown"}|${task}`;
    const prev = providerMap.get(key) ?? {
      provider: e.provider || "unknown",
      task,
      label: providerTaskLabel(e.provider || "unknown", e.stage),
      usd: 0,
      listUsd: 0,
      characters: 0,
      count: 0,
    };
    prev.usd += e.estimatedUsd;
    prev.listUsd += listUsdOf(e.rawUsage, e.estimatedUsd);
    prev.characters += e.characters ?? 0;
    prev.count += 1;
    providerMap.set(key, prev);
  }

  // Fallback when usage_events is empty/unavailable: use stamped project costs.
  const usedFallback = events.length === 0;
  if (usedFallback) {
    for (const p of projectsInPeriod) {
      const b = p.costBreakdown;
      if (b) {
        byStage.ideas += b.ideas || 0;
        byStage.script += b.script || 0;
        byStage.audio += b.audio || 0;
        byStage.music += b.music || 0;
        byStage.sfx += b.sfx || 0;
        byStage.transcription += b.transcription || 0;
        byStage.render += b.render || 0;
        byStage.thumbnail += b.thumbnail || 0;
      } else if (p.costUsdTotal != null && p.costUsdTotal > 0) {
        byStage.script += p.costUsdTotal;
      }
    }
  }

  const totalUsd = sumBreakdown(byStage);

  const videosCreated = projectsInPeriod.filter(
    (p) => p.status === "completed" || Boolean(p.renderPath)
  ).length;
  const withAudio = projectsInPeriod.filter((p) => Boolean(p.audioAssetId)).length;
  const productionsStarted = projectsInPeriod.length;
  // All period spend attributed to finished videos (includes failed attempts).
  const costPerVideo = videosCreated > 0 ? totalUsd / videosCreated : null;
  const completedCosts = projectsInPeriod
    .filter((p) => p.status === "completed" || Boolean(p.renderPath))
    .map((p) => {
      if (p.costUsdTotal != null && p.costUsdTotal > 0) return p.costUsdTotal;
      const b = p.costBreakdown;
      return b ? sumBreakdown(normalizeBreakdown(b)) : 0;
    });
  const avgCompletedProjectCost =
    completedCosts.length > 0
      ? completedCosts.reduce((a, b) => a + b, 0) / completedCosts.length
      : null;

  const projectRows = projectsInPeriod
    .map((p) => {
      const fromEvents = events.filter((e) => e.videoProjectId === p.id);
      let breakdown = emptyBreakdown();
      if (fromEvents.length > 0) {
        for (const e of fromEvents) {
          if (e.stage in breakdown) breakdown[e.stage as keyof CostBreakdown] += e.estimatedUsd;
        }
      } else if (p.costBreakdown) {
        breakdown = normalizeBreakdown(p.costBreakdown);
      }
      const total = sumBreakdown(breakdown) || (p.costUsdTotal ?? 0);
      const published = fromEvents.find(
        (e) => e.stage === "youtube" && typeof (e.rawUsage as { videoId?: unknown } | null)?.videoId === "string"
      );
      const youtubeVideoId =
        (typeof (published?.rawUsage as { videoId?: unknown } | null)?.videoId === "string"
          ? ((published?.rawUsage as { videoId: string }).videoId as string)
          : null) || p.youtubeVideoId;
      let textUsd = 0;
      let imageUsd = 0;
      let voiceUsd = 0;
      let videoUsd = 0;
      if (fromEvents.length > 0) {
        for (const e of fromEvents) {
          const task = spendTask(e.stage);
          if (task === "text") textUsd += e.estimatedUsd;
          else if (task === "image") imageUsd += e.estimatedUsd;
          else if (task === "voice") voiceUsd += e.estimatedUsd;
          else if (task === "video") videoUsd += e.estimatedUsd;
        }
      } else {
        textUsd = (breakdown.ideas || 0) + (breakdown.script || 0);
        imageUsd = breakdown.thumbnail || 0;
        voiceUsd = breakdown.audio || 0;
        videoUsd = (breakdown.render || 0) + (breakdown.music || 0) + (breakdown.sfx || 0);
      }
      const lineMap = new Map<string, { label: string; usd: number; listUsd: number; characters: number }>();
      if (fromEvents.length > 0) {
        for (const e of fromEvents) {
          const list = listUsdOf(e.rawUsage, e.estimatedUsd);
          if (!(e.estimatedUsd > 0) && !(list > 0)) continue;
          const label = providerTaskLabel(e.provider, e.stage);
          const prev = lineMap.get(label) ?? { label, usd: 0, listUsd: 0, characters: 0 };
          prev.usd += e.estimatedUsd;
          prev.listUsd += list;
          prev.characters += e.characters ?? 0;
          lineMap.set(label, prev);
        }
      } else {
        if (textUsd > 0) lineMap.set("Texto", { label: "Texto", usd: textUsd, listUsd: textUsd, characters: 0 });
        if (imageUsd > 0) lineMap.set("Imagem", { label: "Imagem", usd: imageUsd, listUsd: imageUsd, characters: 0 });
        if (voiceUsd > 0) lineMap.set("Voz", { label: "Voz", usd: voiceUsd, listUsd: voiceUsd, characters: 0 });
        if (videoUsd > 0) lineMap.set("Animação", { label: "Animação", usd: videoUsd, listUsd: videoUsd, characters: 0 });
      }
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        createdAt: p.createdAt,
        youtubeVideoId,
        publishedAt: published?.createdAt ?? null,
        totalUsd: total,
        breakdown,
        textUsd,
        imageUsd,
        voiceUsd,
        videoUsd,
        lines: [...lineMap.values()].sort((a, b) => b.usd - a.usd),
        marks: stageMarks(fromEvents),
      };
    })
    .filter((p) => p.totalUsd > 0 || projectsInPeriod.length <= 40)
    .sort((a, b) => b.totalUsd - a.totalUsd || b.createdAt.localeCompare(a.createdAt));

  const stageLabels: Record<UsageStage, string> = {
    ideas: "Ideias",
    script: "Roteiros",
    audio: "Voz",
    music: "Música",
    sfx: "SFX",
    transcription: "Transcrição/sync",
    render: "Vídeo / render",
    thumbnail: "Portadas / thumbnail",
    youtube: "YouTube upload",
  };

  const recentEvents = events.slice(0, 40).map((e: UsageEvent) => ({
    id: e.id,
    stage: e.stage,
    stageLabel: providerTaskLabel(e.provider, e.stage) || stageLabels[e.stage] || e.stage,
    provider: e.provider,
    model: e.model,
    estimatedUsd: e.estimatedUsd,
    listUsd: listUsdOf(e.rawUsage, e.estimatedUsd),
    characters: e.characters,
    createdAt: e.createdAt,
    videoProjectId: e.videoProjectId,
    projectTitle: e.videoProjectId ? titleById.get(e.videoProjectId) ?? null : null,
  }));

  return NextResponse.json({
    period,
    since,
    totalUsd,
    byStage,
    byProvider: Array.from(providerMap.values()).sort((a, b) => b.usd - a.usd),
    projects: projectRows,
    recentEvents,
    chirp,
    eventCount: events.length,
    usedFallback,
    videosCreated,
    withAudio,
    productionsStarted,
    costPerVideo,
    avgCompletedProjectCost,
  });
}
