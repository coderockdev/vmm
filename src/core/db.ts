import Database from "better-sqlite3";
import { DB_PATH } from "./paths";

declare global {
  // eslint-disable-next-line no-var
  var __vmmDb: Database.Database | undefined;
}

function createDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      niche TEXT NOT NULL,
      cover_color TEXT NOT NULL,
      dna_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_plans (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      duration_minutes REAL NOT NULL,
      format TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_ideas (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES content_plans(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      angle TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS video_projects (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      content_idea_id TEXT,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      duration_minutes REAL NOT NULL,
      format TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      seed INTEGER NOT NULL,
      tts_provider_override TEXT,
      script_id TEXT,
      audio_asset_id TEXT,
      render_path TEXT,
      render_duration_seconds REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      video_project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
      raw_text TEXT NOT NULL,
      lines_json TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audio_assets (
      id TEXT PRIMARY KEY,
      video_project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      duration_seconds REAL NOT NULL,
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS production_jobs (
      id TEXT PRIMARY KEY,
      video_project_id TEXT NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      status_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      content_plan_id TEXT,
      content_idea_id TEXT,
      video_project_id TEXT,
      stage TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      characters INTEGER,
      duration_seconds REAL,
      estimated_usd REAL NOT NULL DEFAULT 0,
      raw_usage TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      folder TEXT NOT NULL,
      total_chapters INTEGER NOT NULL DEFAULT 0,
      total_chars INTEGER NOT NULL DEFAULT 0,
      total_words INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      youtube_playlist_id TEXT,
      playlist_title TEXT,
      playlist_description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (channel_id, folder)
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      chapter_index INTEGER NOT NULL,
      label TEXT NOT NULL,
      source_file TEXT NOT NULL,
      words INTEGER NOT NULL DEFAULT 0,
      chars INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      tts_text_path TEXT,
      audio_path TEXT,
      audio_duration_sec REAL,
      video_path TEXT,
      thumb_path TEXT,
      image_prompts_json TEXT,
      image_paths_json TEXT,
      youtube_video_id TEXT,
      youtube_url TEXT,
      publish_at TEXT,
      error_message TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (book_id, source_file)
    );

    CREATE TABLE IF NOT EXISTS tts_usage (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL,
      provider TEXT NOT NULL,
      chars INTEGER NOT NULL DEFAULT 0,
      requests INTEGER NOT NULL DEFAULT 0,
      chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS youtube_accounts (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      youtube_channel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      refresh_token_encrypted TEXT NOT NULL,
      scopes TEXT NOT NULL,
      connected_at TEXT NOT NULL,
      UNIQUE (channel_id)
    );

    CREATE TABLE IF NOT EXISTS youtube_quota_log (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      units INTEGER NOT NULL DEFAULT 0,
      operation TEXT NOT NULL,
      chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_audiobook_settings (
      channel_id TEXT PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
      settings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS youtube_comments (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      youtube_comment_id TEXT NOT NULL,
      youtube_thread_id TEXT NOT NULL,
      video_id TEXT NOT NULL,
      video_title TEXT,
      author_name TEXT,
      author_channel_id TEXT,
      author_profile_image_url TEXT,
      comment_text TEXT NOT NULL,
      published_at TEXT,
      updated_at_yt TEXT,
      like_count INTEGER NOT NULL DEFAULT 0,
      reply_count INTEGER NOT NULL DEFAULT 0,
      our_reply_id TEXT,
      our_reply_text TEXT,
      category TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      processed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (channel_id, youtube_comment_id)
    );

    CREATE TABLE IF NOT EXISTS youtube_comment_runs (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'running',
      dry_run INTEGER NOT NULL DEFAULT 0,
      max_items INTEGER NOT NULL DEFAULT 50,
      processed INTEGER NOT NULL DEFAULT 0,
      answered INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      needs_review INTEGER NOT NULL DEFAULT 0,
      errors INTEGER NOT NULL DEFAULT 0,
      stop_requested INTEGER NOT NULL DEFAULT 0,
      log_json TEXT NOT NULL DEFAULT '[]',
      error_message TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
  `);

  addColumnIfMissing(db, "video_projects", "tts_provider_override", "TEXT");
  addColumnIfMissing(db, "video_projects", "tts_voice_id_override", "TEXT");
  addColumnIfMissing(db, "video_projects", "thumbnail_json", "TEXT");
  addColumnIfMissing(db, "video_projects", "thumbnail_ref", "TEXT");
  addColumnIfMissing(db, "video_projects", "video_style_json", "TEXT");
  addColumnIfMissing(db, "video_projects", "audio_bed_json", "TEXT");
  addColumnIfMissing(db, "video_projects", "publish_json", "TEXT");
  addColumnIfMissing(db, "channels", "cover_ref", "TEXT");
  addColumnIfMissing(db, "video_projects", "cost_usd_total", "REAL");
  addColumnIfMissing(db, "video_projects", "cost_breakdown_json", "TEXT");
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, type: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function getDb(): Database.Database {
  if (!global.__vmmDb) {
    global.__vmmDb = createDb();
  }
  return global.__vmmDb;
}
