#!/usr/bin/env node
/**
 * Apply supabase/schema_usage.sql using SUPABASE_DB_PASSWORD from .env.local.
 * Never prints the password.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");
const sqlPath = path.join(root, "supabase", "schema_usage.sql");

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

async function main() {
  const env = parseEnv(fs.readFileSync(envPath, "utf8"));
  const sql = fs.readFileSync(sqlPath, "utf8");
  const url = env.SUPABASE_URL;
  const password = env.SUPABASE_DB_PASSWORD || env.POSTGRES_PASSWORD || env.DB_PASSWORD;
  let conn = env.DATABASE_URL || env.SUPABASE_DB_URL;

  if (!conn) {
    if (!url || !password) {
      console.error("Missing SUPABASE_URL or SUPABASE_DB_PASSWORD in .env.local");
      process.exit(1);
    }
    const ref = url.replace(/^https:\/\//, "").split(".")[0];
    const enc = encodeURIComponent(password);
    conn = `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`;
  }

  console.log("Connecting to db…" + (url ? url.replace(/^https:\/\//, "").split(".")[0] : "custom") + "…");
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  await client.query(sql);
  // verify
  const check = await client.query(
    `select to_regclass('public.usage_events') as usage_events,
            exists (
              select 1 from information_schema.columns
              where table_name = 'video_projects' and column_name = 'cost_usd_total'
            ) as has_cost_col`
  );
  console.log("Migration OK:", check.rows[0]);
  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
