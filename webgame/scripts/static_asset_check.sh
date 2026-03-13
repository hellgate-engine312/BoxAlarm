#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

required=(
  "$ROOT/webgame/index.html"
  "$ROOT/webgame/styles.css"
  "$ROOT/webgame/js/simulation.js"
  "$ROOT/webgame/js/assets.js"
  "$ROOT/webgame/js/app.js"
  "$ROOT/webgame/vendor/leaflet.1.9.4.css"
  "$ROOT/webgame/vendor/leaflet.1.9.4.js"
  "$ROOT/webgame/vendor/three.module.r164.js"
  "$ROOT/webgame/assets/fdny-engine.svg"
  "$ROOT/webgame/assets/fdny-ladder.svg"
  "$ROOT/webgame/assets/fdny-ambulance.svg"
)

for f in "${required[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "FAIL missing: $f"
    exit 1
  fi
  echo "OK   $f"
done

echo "PASS: static asset checks completed"
