#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${1:-8765}"

cd "$ROOT/webgame"
python3 -m http.server "$PORT" >/tmp/boxalarm_webserver.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

sleep 1

check_url() {
  local path="$1"
  local url="http://127.0.0.1:${PORT}${path}"
  local status
  status=$(curl -s -o /tmp/boxalarm_smoke_body -w "%{http_code}" "$url")
  if [[ "$status" != "200" ]]; then
    echo "FAIL ${path} -> HTTP ${status}"
    exit 1
  fi
  echo "OK   ${path}"
}

check_url "/"
check_url "/styles.css"
check_url "/js/simulation.js"
check_url "/js/assets.js"
check_url "/js/app.js"
check_url "/vendor/leaflet.1.9.4.css"
check_url "/vendor/leaflet.1.9.4.js"
check_url "/vendor/three.module.r164.js"
check_url "/assets/fdny-engine.svg"
check_url "/assets/fdny-ladder.svg"
check_url "/assets/fdny-ambulance.svg"

echo "PASS: web smoke checks completed"
