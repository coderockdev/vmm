#!/usr/bin/env bash
# Apply supabase/schema_usage.sql to the remote project.
# Requires in .env.local:
#   SUPABASE_URL=https://xxxx.supabase.co
#   SUPABASE_DB_PASSWORD=...   # Dashboard → Settings → Database
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1091
source .env.local
set +a

if [[ -z "${SUPABASE_DB_PASSWORD:-}" && -z "${DATABASE_URL:-}" ]]; then
  echo "Missing SUPABASE_DB_PASSWORD (or DATABASE_URL) in .env.local"
  echo "Get it from: Supabase Dashboard → Project Settings → Database → Database password"
  exit 1
fi

REF="$(echo "$SUPABASE_URL" | sed -E 's|https://([^.]+)\.supabase\.co.*|\1|')"
SQL_FILE="supabase/schema_usage.sql"

if [[ -n "${DATABASE_URL:-}" ]]; then
  CONN="$DATABASE_URL"
else
  # Direct connection (port 5432). URL-encode is not handled — avoid special chars or use DATABASE_URL.
  CONN="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${REF}.supabase.co:5432/postgres?sslmode=require"
fi

if command -v psql >/dev/null 2>&1; then
  psql "$CONN" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
elif command -v npx >/dev/null 2>&1; then
  npx --yes pg-connection-string >/dev/null 2>&1 || true
  node -e "
    const { Client } = require('pg');
    const fs = require('fs');
    const sql = fs.readFileSync('$SQL_FILE','utf8');
    const client = new Client({ connectionString: process.env.CONN || '$CONN', ssl: { rejectUnauthorized: false } });
    client.connect()
      .then(() => client.query(sql))
      .then(() => { console.log('Migration OK'); return client.end(); })
      .catch((e) => { console.error(e.message); process.exit(1); });
  "
else
  echo "Need psql or node pg package"
  exit 1
fi
