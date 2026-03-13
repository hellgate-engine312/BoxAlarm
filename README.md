# Box Alarm V1 Playground

This repo now contains a **web-first playable vertical slice** for Box Alarm in `webgame/`.

## What Runs Now

- Browser game loop with:
  - Procedural menu flow: `Play -> Mission Type -> Location -> Difficulty` (no dropdowns)
  - OpenStreetMap-backed 2D sandbox map (Leaflet + CARTO OSM raster tiles), locked to chosen city bounds
  - Station-first setup: place initial station on real map coordinates
  - Delayed call spawning with escalating map dots
  - Call locations snap to nearby OSM roads (Overpass lookup with fallback)
  - Call-specific unit selection panel (appears only when clicking a call)
  - Dispatch -> moving loading screen (captain-seat style MDT view with dense packet data)
  - Full-screen **actual WebGL 3D** scene (Three.js) with HUD overlays (no side boxes)
- Two modes:
  - `Build Mode`: earn credits and buy stations
  - `Dispatcher Mode`: full city station count available, no expansion
- AI-generated missions with dynamic escalation events:
  - flashover
  - additional victims
  - partial collapse
  - hazmat discovery
  - fire spread
- V1 rules implemented:
  - pending/non-focused missions are paused and do not escalate
  - incorrect/insufficient dispatch worsens conditions
  - Easy shows escalation colors (blue/yellow/red)
  - Normal/Hard hide escalation colors (radio/visual only)
- Control model:
  - Left click = grab/select
  - Right click = contextual action
  - Right-click ground movement for selected firefighters
  - Hotkeys for dispatch/pause/scene commands

## Run (Browser)

From repo root:

```bash
python3 -m http.server 8765 --directory webgame
```

Then open:

- `http://127.0.0.1:8765/`
- Internet is required for OpenStreetMap tiles (`tile.openstreetmap.org`) and Leaflet CDN.

## Automated Tests

Run simulation logic tests (JavaScript via macOS JXA runtime):

```bash
./webgame/scripts/run_sim_tests.sh
```

Run longer randomized stability sweep:

```bash
./webgame/scripts/run_soak_test.sh 120
```

Run core verification bundle:

```bash
./webgame/scripts/verify_all.sh
```

Run browser asset smoke checks:

```bash
./webgame/scripts/smoke_web.sh
```

Start the game quickly:

```bash
./webgame/scripts/run_webgame.sh 8765
```

## Project Layout

- `webgame/index.html` - app shell and game screens
- `webgame/styles.css` - desktop-first responsive UI styling
- `webgame/js/simulation.js` - core mission/session simulation rules
- `webgame/js/app.js` - UI bindings, rendering, controls, and input handling
- `docs/fire_truck_model_references.md` - reference links used for truck modeling/layout
- `webgame/assets/` - FDNY-style apparatus SVG placeholders
- `webgame/tests/sim_tests.jxa.js` - JS unit tests
- `webgame/tests/soak_test.jxa.js` - randomized stability soak tests

## Notes

- Unity scaffolding from earlier iteration is still present under `src/` and `UnityPlaytest/`, but the **active target** is browser in `webgame/`.
- ElevenLabs voice radio and hard-mode voice protocol remain deferred post-v1.
