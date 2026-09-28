import { randomUUID } from "crypto";
import { getDb } from "../db";
import {
  AudioAsset,
  JobStatus,
  Script,
  ScriptLine,
  VideoFormat,
  VideoProject,
} from "../types";

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
  created_at: string;
  updated_at: string;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createVideoProject(input: {
  channelId: string;
  contentIdeaId: string | null;
  title: string;
  topic: string;
  durationMinutes: number;
  format: VideoFormat;
  seed: number;
  ttsProviderOverride?: VideoProject["ttsProviderOverride"];
}): VideoProject {
  const id = randomUUID();
  const now = new Date().toISOString();
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
  return getVideoProject(id)!;
}

export function getVideoProject(id: string): VideoProject | null {
  const row = getDb()
    .prepare(`SELECT * FROM video_projects WHERE id = ?`)
    .get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

export function listProjectsForChannel(channelId: string): VideoProject[] {
  const rows = getDb()
    .prepare(`SELECT * FROM video_projects WHERE channel_id = ? ORDER BY created_at DESC`)
    .all(channelId) as ProjectRow[];
  return rows.map(rowToProject);
}

export function listAllProjects(): VideoProject[] {
  const rows = getDb()
    .prepare(`SELECT * FROM video_projects ORDER BY created_at DESC`)
    .all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function updateProjectStatus(
  id: string,
  status: JobStatus,
  errorMessage: string | null = null
) {
  getDb()
    .prepare(
      `UPDATE video_projects SET status = ?, error_message = ?, updated_at = ? WHERE id = ?`
    )
    .run(status, errorMessage, new Date().toISOString(), id);
}

export function attachScriptToProject(projectId: string, scriptId: string) {
  getDb()
    .prepare(`UPDATE video_projects SET script_id = ?, updated_at = ? WHERE id = ?`)
    .run(scriptId, new Date().toISOString(), projectId);
}

export function attachAudioToProject(projectId: string, audioAssetId: string) {
  getDb()
    .prepare(`UPDATE video_projects SET audio_asset_id = ?, updated_at = ? WHERE id = ?`)
    .run(audioAssetId, new Date().toISOString(), projectId);
}

export function completeProjectRender(
  projectId: string,
  renderPath: string,
  renderDurationSeconds: number
) {
  getDb()
    .prepare(
      `UPDATE video_projects SET render_path = ?, render_duration_seconds = ?, status = 'completed', updated_at = ? WHERE id = ?`
    )
    .run(renderPath, renderDurationSeconds, new Date().toISOString(), projectId);
}

export function deleteVideoProject(id: string) {
  getDb().prepare(`DELETE FROM video_projects WHERE id = ?`).run(id);
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

interface ScriptRow {
  id: string;
  video_project_id: string;
  raw_text: string;
  lines_json: string;
  word_count: number;
  created_at: string;
}

function rowToScript(row: ScriptRow): Script {
  return {
    id: row.id,
    videoProjectId: row.video_project_id,
    rawText: row.raw_text,
    lines: JSON.parse(row.lines_json),
    wordCount: row.word_count,
    createdAt: row.created_at,
  };
}

export function createScript(input: {
  videoProjectId: string;
  rawText: string;
  lines: ScriptLine[];
  wordCount: number;
}): Script {
  const id = randomUUID();
  const now = new Date().toISOString();
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
  return getScript(id)!;
}

export function listScriptTextsForChannel(channelId: string): string[] {
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

export function getScript(id: string): Script | null {
  const row = getDb().prepare(`SELECT * FROM scripts WHERE id = ?`).get(id) as
    | ScriptRow
    | undefined;
  return row ? rowToScript(row) : null;
}

export function updateScriptLines(id: string, lines: ScriptLine[]) {
  getDb()
    .prepare(`UPDATE scripts SET lines_json = ? WHERE id = ?`)
    .run(JSON.stringify(lines), id);
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

export function createAudioAsset(input: {
  videoProjectId: string;
  filePath: string;
  durationSeconds: number;
  provider: AudioAsset["provider"];
}): AudioAsset {
  const id = randomUUID();
  const now = new Date().toISOString();
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
  return getAudioAsset(id)!;
}

export function getAudioAsset(id: string): AudioAsset | null {
  const row = getDb().prepare(`SELECT * FROM audio_assets WHERE id = ?`).get(id) as
    | AudioRow
    | undefined;
  return row ? rowToAudio(row) : null;
}
