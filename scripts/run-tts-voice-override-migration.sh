#!/usr/bin/env bash
# Apply supabase/schema_tts_voice_override.sql to the remote project.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1091
source .env.local
set +a

if [[ -z "${SUPABASE_DB_PASSWORD:-}" && -z "${DATABASE_URL:-}" ]]; then
  echo "Missing SUPABASE_DB_PASSWORD (or DATABASE_URL) in .env.local"
  exit 1
fi

REF="$(echo "$SUPABASE_URL" | sed -E 's|https://([^.]+)\.supabase\.co.*|\1|')"
SQL_FILE="supabase/schema_tts_voice_override.sql"

if [[ -n "${DATABASE_URL:-}" ]]; then
  CONN="$DATABASE_URL"
else
  CONN="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${REF}.supabase.co:5432/postgres?sslmode=require"
fi

node -e "
  const { Client } = require('pg');
  const fs = require('fs');
  const sql = fs.readFileSync('$SQL_FILE','utf8');
  const client = new Client({ connectionString: process.argv[1], ssl: { rejectUnauthorized: false } });
  client.connect()
    .then(() => client.query(sql))
    .then(() => client.query(\"select column_name from information_schema.columns where table_name='video_projects' and column_name='tts_voice_id_override'\"))
    .then((r) => { console.log('Migration OK:', r.rows); return client.end(); })
    .catch((e) => { console.error(e.message); process.exit(1); });
" "$CONN"
