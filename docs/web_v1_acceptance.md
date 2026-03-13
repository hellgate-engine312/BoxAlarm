# Web V1 Acceptance Checklist

## Core Flow

- [x] Start from procedural menu flow: Play -> Mission Type -> Location -> Difficulty.
- [x] Enter map mode and place first station before calls start.
- [x] Station placement uses OpenStreetMap view (Leaflet tile map).
- [x] Map is constrained to selected city bounds.
- [x] First call appears after delay as a low-complexity event (tree down).
- [x] Calls appear as color dots and open unit selection only when clicked.
- [x] Call points can snap to nearby OSM road geometry.
- [x] Dispatch transitions to moving loading screen with extended incident packet.
- [x] First-arriving units transition session straight to full-screen 3D scene with zoom-in focus.

## Units, Naming, and Crew

- [x] Engine and ladder companies are named with explicit numbers.
- [x] Radio/dispatch refers to named companies (for example `Engine 312`).
- [x] Firefighters are named by company + rank (captain, lieutenant, firefighter, proby).
- [x] Left-side crew selection is grouped by company.

## Scene and Input

- [x] Scene is full-screen with HUD overlays instead of boxed side panels.
- [x] Isometric/perspective street scene includes trucks, parked cars, buildings, and animated flames.
- [x] Apparatus compartments are clickable hotspots without explicit labels.
- [x] Firefighters are simple proportional rectangles in v1.
- [x] Right-click on ground issues movement commands for selected firefighter.

## Difficulty and Simulation Rules

- [x] Easy mode exposes color escalation hints.
- [x] Normal/Hard rely on radio + visual cues.
- [x] Pending/non-focused incidents are paused and do not escalate.
- [x] Insufficient dispatch can worsen severity.

## Automated Validation

- [x] JS simulation rule tests pass via `./webgame/scripts/run_sim_tests.sh`.
- [x] Randomized soak test passes via `./webgame/scripts/run_soak_test.sh 120`.
- [x] Core verification passes via `./webgame/scripts/verify_all.sh`.
- [x] HTTP smoke checks pass via `./webgame/scripts/smoke_web.sh`.
