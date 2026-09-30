#!/bin/bash
# Reinicia VMM fuera del proxy/sandbox de Cursor (si no, Supabase da "fetch failed").
set -e
cd "$HOME/Documents/vmm"

echo ">>> Liberando puertos 3000-3010..."
for port in 3000 3001 3002 3003 3005 3010; do
  pids=$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Puerto $port -> $pids"
    kill -9 $pids 2>/dev/null || true
  fi
done
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1

ulimit -n 65536
rm -rf .next

PORT="${PORT:-3000}"
echo ">>> Arrancando en http://localhost:$PORT (env limpio, sin proxy)"
exec env -i \
  HOME="$HOME" \
  PATH="$PATH" \
  USER="$USER" \
  LANG="${LANG:-en_US.UTF-8}" \
  NODE_OPTIONS="--dns-result-order=ipv4first" \
  WATCHPACK_POLLING=true \
  CHOKIDAR_USEPOLLING=true \
  PORT="$PORT" \
  bash -lc "set -a; source .env.local; set +a; npx next dev -p $PORT"
