#!/usr/bin/env node
/**
 * Apply supabase/schema_video_styles.sql using SUPABASE_DB_PASSWORD from .env.local.
 * Never prints the password.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");
const sqlPath = path.join(root, "supabase", "schema_video_styles.sql");

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

async function tryConnect(conn) {
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
  });
  await client.connect();
  return client;
}

async function main() {
  const env = parseEnv(fs.readFileSync(envPath, "utf8"));
  const sql = fs.readFileSync(sqlPath, "utf8");
  const url = env.SUPABASE_URL;
  const password = env.SUPABASE_DB_PASSWORD || env.POSTGRES_PASSWORD || env.DB_PASSWORD;
  const ref = url ? url.replace(/^https:\/\//, "").split(".")[0] : "";
  const enc = password ? encodeURIComponent(password) : "";

  const candidates = [];
  if (env.DATABASE_URL || env.SUPABASE_DB_URL) {
    candidates.push(env.DATABASE_URL || env.SUPABASE_DB_URL);
  }
  if (ref && enc) {
    candidates.push(
      `postgresql://postgres.${ref}:${enc}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
    );
    candidates.push(`postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`);
  }

  if (candidates.length === 0) {
    console.error("Missing SUPABASE_URL or SUPABASE_DB_PASSWORD in .env.local");
    process.exit(1);
  }

  let lastErr = null;
  for (const conn of candidates) {
    try {
      const client = await tryConnect(conn);
      await client.query(sql);
      const check = await client.query(`
        select column_name from information_schema.columns
        where table_name = 'video_projects'
          and column_name in ('video_style_json','audio_bed_json')
        order by 1
      `);
      console.log(
        "Migration OK:",
        check.rows.map((r) => r.column_name).join(", ") || "(no columns found)"
      );
      await client.end();
      return;
    } catch (err) {
      lastErr = err;
      console.warn("Connect failed:", err.message);
    }
  }
  console.error("Migration failed:", lastErr?.message || "unknown");
  process.exit(1);
}

main();
