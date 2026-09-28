import { randomUUID } from "crypto";
import { getDb } from "../db";
import { getSupabase, isSupabaseEnabled, assertNoError } from "../supabaseClient";
import { AudioAsset, JobStatus, Script, ScriptLine, VideoFormat, VideoProject } from "../types";

interface ProjectRow {
  id: string;
  channel_id: string;
  content_idea_id: string | null;
  title: string;
  topic: string;
  duration_minutes: number;
  format: string;
  status: string;
  error_message: string | null;
  seed: number;
  tts_provider_override: string | null;
  script_id: string | null;
  audio_asset_id: string | null;
  render_path: string | null;
  render_duration_seconds: number | null;
  cost_usd_total?: number | null;
  cost_breakdown_json?: string | object | null;
  created_at: string;
  updated_at: string;
}

function parseBreakdown(raw: string | object | null | undefined): VideoProject["costBreakdown"] {
  if (raw == null) return null;
  const obj = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  return {
    ideas: Number(o.ideas) || 0,
    script: Number(o.script) || 0,
    audio: Number(o.audio) || 0,
    render: Number(o.render) || 0,
  };
}

function rowToProject(row: ProjectRow): VideoProject {
  return {
    id: row.id,
    channelId: row.channel_id,
    contentIdeaId: row.content_idea_id,
    title: row.title,
    topic: row.topic,
    durationMinutes: row.duration_minutes,
    format: row.format as VideoFormat,
    status: row.status as JobStatus,
    errorMessage: row.error_message,
    seed: row.seed,
    ttsProviderOverride: row.tts_provider_override as VideoProject["ttsProviderOverride"],
    scriptId: row.script_id,
    audioAssetId: row.audio_asset_id,
    renderPath: row.render_path,
    renderDurationSeconds: row.render_duration_seconds,
    costUsdTotal: row.cost_usd_total != null ? Number(row.cost_usd_total) : null,
    costBreakdown: parseBreakdown(row.cost_breakdown_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createVideoProject(input: {
  channelId: string;
  contentIdeaId: string | null;
  title: string;
  topic: string;
  durationMinutes: number;
  format: VideoFormat;
  seed: number;
  ttsProviderOverride?: VideoProject["ttsProviderOverride"];
}): Promise<VideoProject> {
  const id = randomUUID();
  const now = new Date().toISOString();

  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("video_projects")
        .insert({
          id,
          channel_id: input.channelId,
          content_idea_id: input.contentIdeaId,
          title: input.title,
          topic: input.topic,
          duration_minutes: input.durationMinutes,
          format: input.format,
          status: "planned",
          error_message: null,
          seed: input.seed,
          tts_provider_override: input.ttsProviderOverride ?? null,
          created_at: now,
          updated_at: now,
        })
    );
    return (await getVideoProject(id))!;
  }

  getDb()
    .prepare(
      `INSERT INTO video_projects
        (id, channel_id, content_idea_id, title, topic, duration_minutes, format, status, error_message, seed, tts_provider_override, script_id, audio_asset_id, render_path, render_duration_seconds, created_at, updated_at)
       VALUES
        (@id, @channelId, @contentIdeaId, @title, @topic, @durationMinutes, @format, 'planned', NULL, @seed, @ttsProviderOverride, NULL, NULL, NULL, NULL, @createdAt, @updatedAt)`
    )
    .run({
      id,
      channelId: input.channelId,
      contentIdeaId: input.contentIdeaId,
      title: input.title,
      topic: input.topic,
      durationMinutes: input.durationMinutes,
      format: input.format,
      seed: input.seed,
      ttsProviderOverride: input.ttsProviderOverride ?? null,
      createdAt: now,
      updatedAt: now,
    });
  return (await getVideoProject(id))!;
}

export async function getVideoProject(id: string): Promise<VideoProject | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("video_projects").select("*").eq("id", id).maybeSingle();
    const row = assertNoError(res);
    return row ? rowToProject(row as ProjectRow) : null;
  }
  const row = getDb().prepare(`SELECT * FROM video_projects WHERE id = ?`).get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export async function listProjectsForChannel(channelId: string): Promise<VideoProject[]> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("video_projects")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false });
    return assertNoError(res).map(rowToProject);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM video_projects WHERE channel_id = ? ORDER BY created_at DESC`)
    .all(channelId) as ProjectRow[];
  return rows.map(rowToProject);
}

export async function listAllProjects(): Promise<VideoProject[]> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("video_projects").select("*").order("created_at", { ascending: false });
    return assertNoError(res).map(rowToProject);
  }
  const rows = getDb().prepare(`SELECT * FROM video_projects ORDER BY created_at DESC`).all() as ProjectRow[];
  return rows.map(rowToProject);
}

export async function updateProjectStatus(
  id: string,
  status: JobStatus,
  errorMessage: string | null = null
): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("video_projects")
        .update({ status, error_message: errorMessage, updated_at: now })
        .eq("id", id)
    );
    return;
  }
  getDb()
    .prepare(`UPDATE video_projects SET status = ?, error_message = ?, updated_at = ? WHERE id = ?`)
    .run(status, errorMessage, now, id);
}

export async function setTtsProviderOverride(
  projectId: string,
  override: VideoProject["ttsProviderOverride"]
): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("video_projects")
        .update({ tts_provider_override: override, updated_at: now })
        .eq("id", projectId)
    );
    return;
  }
  getDb()
    .prepare(`UPDATE video_projects SET tts_provider_override = ?, updated_at = ? WHERE id = ?`)
    .run(override, now, projectId);
}

export async function attachScriptToProject(projectId: string, scriptId: string): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase().from("video_projects").update({ script_id: scriptId, updated_at: now }).eq("id", projectId)
    );
    return;
  }
  getDb()
    .prepare(`UPDATE video_projects SET script_id = ?, updated_at = ? WHERE id = ?`)
    .run(scriptId, now, projectId);
}

export async function attachAudioToProject(projectId: string, audioAssetId: string): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("video_projects")
        .update({ audio_asset_id: audioAssetId, updated_at: now })
        .eq("id", projectId)
    );
    return;
  }
  getDb()
    .prepare(`UPDATE video_projects SET audio_asset_id = ?, updated_at = ? WHERE id = ?`)
    .run(audioAssetId, now, projectId);
}

export async function completeProjectRender(
  projectId: string,
  renderPath: string,
  renderDurationSeconds: number
): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("video_projects")
        .update({
          render_path: renderPath,
          render_duration_seconds: renderDurationSeconds,
          status: "completed",
          updated_at: now,
        })
        .eq("id", projectId)
    );
    return;
  }
  getDb()
    .prepare(
      `UPDATE video_projects SET render_path = ?, render_duration_seconds = ?, status = 'completed', updated_at = ? WHERE id = ?`
    )
    .run(renderPath, renderDurationSeconds, now, projectId);
}

export async function deleteVideoProject(id: string): Promise<void> {
  if (isSupabaseEnabled()) {
    assertNoError(await getSupabase().from("video_projects").delete().eq("id", id));
    return;
  }
  getDb().prepare(`DELETE FROM video_projects WHERE id = ?`).run(id);
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

interface ScriptRow {
  id: string;
  video_project_id: string;
  raw_text: string;
  lines_json: string | ScriptLine[];
  word_count: number;
  created_at: string;
}

function rowToScript(row: ScriptRow): Script {
  return {
    id: row.id,
    videoProjectId: row.video_project_id,
    rawText: row.raw_text,
    lines: typeof row.lines_json === "string" ? JSON.parse(row.lines_json) : row.lines_json,
    wordCount: row.word_count,
    createdAt: row.created_at,
  };
}

export async function createScript(input: {
  videoProjectId: string;
  rawText: string;
  lines: ScriptLine[];
  wordCount: number;
}): Promise<Script> {
  const id = randomUUID();
  const now = new Date().toISOString();

  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("scripts")
        .insert({
          id,
          video_project_id: input.videoProjectId,
          raw_text: input.rawText,
          lines_json: input.lines,
          word_count: input.wordCount,
          created_at: now,
        })
    );
    return (await getScript(id))!;
  }

  getDb()
    .prepare(
      `INSERT INTO scripts (id, video_project_id, raw_text, lines_json, word_count, created_at)
       VALUES (@id, @videoProjectId, @rawText, @lines, @wordCount, @createdAt)`
    )
    .run({
      id,
      videoProjectId: input.videoProjectId,
      rawText: input.rawText,
      lines: JSON.stringify(input.lines),
      wordCount: input.wordCount,
      createdAt: now,
    });
  return (await getScript(id))!;
}

export async function listScriptTextsForChannel(channelId: string): Promise<string[]> {
  if (isSupabaseEnabled()) {
    const projectIdsRes = await getSupabase().from("video_projects").select("id").eq("channel_id", channelId);
    const projectIds = assertNoError(projectIdsRes).map((p: { id: string }) => p.id);
    if (projectIds.length === 0) return [];
    const res = await getSupabase()
      .from("scripts")
      .select("raw_text")
      .in("video_project_id", projectIds)
      .order("created_at", { ascending: false })
      .limit(20);
    return assertNoError(res).map((r: { raw_text: string }) => r.raw_text);
  }
  const rows = getDb()
    .prepare(
      `SELECT s.raw_text as raw_text FROM scripts s
       JOIN video_projects v ON v.id = s.video_project_id
       WHERE v.channel_id = ?
       ORDER BY s.created_at DESC
       LIMIT 20`
    )
    .all(channelId) as Array<{ raw_text: string }>;
  return rows.map((r) => r.raw_text);
}

export async function getScript(id: string): Promise<Script | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("scripts").select("*").eq("id", id).maybeSingle();
    const row = assertNoError(res);
    return row ? rowToScript(row as ScriptRow) : null;
  }
  const row = getDb().prepare(`SELECT * FROM scripts WHERE id = ?`).get(id) as ScriptRow | undefined;
  return row ? rowToScript(row) : null;
}

export async function updateScriptLines(id: string, lines: ScriptLine[]): Promise<void> {
  if (isSupabaseEnabled()) {
    assertNoError(await getSupabase().from("scripts").update({ lines_json: lines }).eq("id", id));
    return;
  }
  getDb().prepare(`UPDATE scripts SET lines_json = ? WHERE id = ?`).run(JSON.stringify(lines), id);
}

// ---------------------------------------------------------------------------
// Audio assets
// ---------------------------------------------------------------------------

interface AudioRow {
  id: string;
  video_project_id: string;
  file_path: string;
  duration_seconds: number;
  provider: string;
  created_at: string;
}

function rowToAudio(row: AudioRow): AudioAsset {
  return {
    id: row.id,
    videoProjectId: row.video_project_id,
    filePath: row.file_path,
    durationSeconds: row.duration_seconds,
    provider: row.provider as AudioAsset["provider"],
    createdAt: row.created_at,
  };
}

export async function createAudioAsset(input: {
  videoProjectId: string;
  filePath: string;
  durationSeconds: number;
  provider: AudioAsset["provider"];
}): Promise<AudioAsset> {
  const id = randomUUID();
  const now = new Date().toISOString();

  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("audio_assets")
        .insert({
          id,
          video_project_id: input.videoProjectId,
          file_path: input.filePath,
          duration_seconds: input.durationSeconds,
          provider: input.provider,
          created_at: now,
        })
    );
    return (await getAudioAsset(id))!;
  }

  getDb()
    .prepare(
      `INSERT INTO audio_assets (id, video_project_id, file_path, duration_seconds, provider, created_at)
       VALUES (@id, @videoProjectId, @filePath, @durationSeconds, @provider, @createdAt)`
    )
    .run({
      id,
      videoProjectId: input.videoProjectId,
      filePath: input.filePath,
      durationSeconds: input.durationSeconds,
      provider: input.provider,
      createdAt: now,
    });
  return (await getAudioAsset(id))!;
}

export async function getAudioAsset(id: string): Promise<AudioAsset | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("audio_assets").select("*").eq("id", id).maybeSingle();
    const row = assertNoError(res);
    return row ? rowToAudio(row as AudioRow) : null;
  }
  const row = getDb().prepare(`SELECT * FROM audio_assets WHERE id = ?`).get(id) as AudioRow | undefined;
  return row ? rowToAudio(row) : null;
}

export async function listAudioAssetsForChannel(channelId: string): Promise<AudioAsset[]> {
  if (isSupabaseEnabled()) {
    const projects = await listProjectsForChannel(channelId);
    const ids = projects.map((p) => p.audioAssetId).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return [];
    const res = await getSupabase().from("audio_assets").select("*").in("id", ids);
    return assertNoError(res).map((r) => rowToAudio(r as AudioRow));
  }
  const rows = getDb()
    .prepare(
      `SELECT a.* FROM audio_assets a
       JOIN video_projects p ON p.audio_asset_id = a.id
       WHERE p.channel_id = ?
       ORDER BY a.created_at DESC`
    )
    .all(channelId) as AudioRow[];
  return rows.map(rowToAudio);
}
