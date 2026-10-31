#!/usr/bin/env bash
# open_local.sh — start a static server for the portfolio and open it in the browser (macOS/Linux).
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-5199}"
URL="http://localhost:${PORT}/"
python3 -m http.server "$PORT" --bind 127.0.0.1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for _ in $(seq 1 40); do curl -s -o /dev/null "$URL" && break; sleep 0.25; done
if command -v open >/dev/null 2>&1; then open "$URL"; else xdg-open "$URL" >/dev/null 2>&1 || true; fi
echo "Serving at $URL  (Ctrl+C to stop)"
wait $SRV
