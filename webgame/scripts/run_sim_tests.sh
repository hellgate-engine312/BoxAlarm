#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

osascript -l JavaScript "$ROOT/webgame/tests/sim_tests.jxa.js" "$ROOT"
