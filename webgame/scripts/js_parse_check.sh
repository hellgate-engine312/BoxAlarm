#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

BOXALARM_ROOT="$ROOT" osascript -l JavaScript -e 'ObjC.import("Foundation"); function rf(p){return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(p,$.NSUTF8StringEncoding,null));} var root=($.NSProcessInfo.processInfo.environment.objectForKey("BOXALARM_ROOT")+"/webgame/js/"); new Function(rf(root+"simulation.js")); new Function(rf(root+"app.js")); console.log("PASS: JS syntax parse")'
