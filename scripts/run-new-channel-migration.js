#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const env = parseEnv(fs.readFileSync(envPath, "utf8"));
const projectRef = env.SUPABASE_URL?.replace(/^https:\/\//, "").split(".")[0];
const password = env.SUPABASE_DB_PASS || env.SUPABASE_DB_PASSWORD;

if (!projectRef || !password) {
  console.error("SUPABASE_URL e SUPABASE_DB_PASS são necessários em .env.local.");
  process.exit(1);
}

const databaseUrl = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;
const result = spawnSync(
  "supabase",
  ["db", "push", "--db-url", databaseUrl, "--include-all"],
  { cwd: root, stdio: "inherit" }
);

process.exit(result.status ?? 1);
