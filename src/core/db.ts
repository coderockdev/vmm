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
  `);

  addColumnIfMissing(db, "video_projects", "tts_provider_override", "TEXT");
  addColumnIfMissing(db, "channels", "cover_ref", "TEXT");
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
