#!/usr/bin/env bash
# Apply thumbnail + tts_voice_id_override columns. Prefer Dashboard SQL editor if
# direct DB host is IPv6-only from your network.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1091
source .env.local
set +a

REF="$(echo "$SUPABASE_URL" | sed -E 's|https://([^.]+)\.supabase\.co.*|\1|')"
SQL="$(cat supabase/schema_tts_voice_override.sql; echo; cat supabase/schema_thumbnails.sql)"
echo "Run this SQL in Supabase Dashboard → SQL Editor if the script cannot connect:"
echo "----"
echo "$SQL"
echo "----"

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "No SUPABASE_DB_PASSWORD — paste the SQL above in the dashboard."
  exit 0
fi

ENC_PW=$(python3 -c "import os,urllib.parse; print(urllib.parse.quote(os.environ['SUPABASE_DB_PASSWORD'], safe=''))")
CONN="postgresql://postgres:${ENC_PW}@db.${REF}.supabase.co:5432/postgres?sslmode=require"

node -e '
const { Client } = require("pg");
const client = new Client({ connectionString: process.argv[1], ssl: { rejectUnauthorized: false } });
const sql = process.argv[2];
client.connect().then(() => client.query(sql)).then(() => { console.log("Migration OK"); return client.end(); }).catch((e) => { console.error("Direct DB failed:", e.message); console.error("Paste the SQL printed above into Supabase SQL Editor."); process.exit(0); });
' "$CONN" "$SQL"
