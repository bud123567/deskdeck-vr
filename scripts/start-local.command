#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -d node_modules ]; then npm ci; fi
if [ ! -d "artifacts/DeskDeck Host.app" ]; then bash scripts/build-host.sh; fi
npm run dev &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM
for i in $(seq 1 60); do
  if curl -fsS http://localhost:3443/api/status >/dev/null 2>&1; then
    open "artifacts/DeskDeck Host.app" --args --config "$PWD/.data/host.json"
    open http://localhost:3443
    wait "$SERVER_PID"
    exit 0
  fi
  sleep 1
done
printf '%s\n' 'Server did not start. Read the output above.'
exit 1
