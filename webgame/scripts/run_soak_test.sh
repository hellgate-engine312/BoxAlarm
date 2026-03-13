#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ROUNDS="${1:-80}"

osascript -l JavaScript "$ROOT/webgame/tests/soak_test.jxa.js" "$ROOT" "$ROUNDS"
