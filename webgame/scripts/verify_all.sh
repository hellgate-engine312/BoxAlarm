#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

./webgame/scripts/run_sim_tests.sh
./webgame/scripts/run_soak_test.sh 120
./webgame/scripts/js_parse_check.sh
./webgame/scripts/static_asset_check.sh

echo "PASS: core web verification suite completed"
echo "NOTE: run ./webgame/scripts/smoke_web.sh for full HTTP smoke test."
