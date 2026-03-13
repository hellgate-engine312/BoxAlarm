# Box Alarm Firefighter + Truck Action Catalog

This is the master action list for gameplay design. Actions marked `[V1]` are implemented in the current prototype.

## 1) Turnout and Response
1. Acknowledge dispatch
2. Don turnout gear
3. Board assigned apparatus
4. Confirm riding position
5. Review MDT call notes
6. Radio en route report
7. Request additional information from dispatch
8. Select route to incident
9. Stage short of address
10. Announce arrival and initial conditions

## 2) Apparatus Positioning and Setup
1. Spot engine for attack line stretch [V1 via reposition]
2. Spot ladder for aerial access [V1 via reposition]
3. Spot ambulance for treatment/egress [V1 via reposition]
4. Set parking brake/chock wheels
5. Place traffic cones/flares
6. Deploy scene lighting [V1]
7. Deploy ladder outriggers [V1]
8. Rotate/raise aerial device [V1 via ladder task]
9. Reposition apparatus during operations [V1]
10. Prepare demobilization positioning

## 3) Engine Company Operations
1. Pull preconnect attack line [V1 via grab hose]
2. Pull backup line [V1 via grab hose]
3. Connect to hydrant [V1]
4. Set pump pressure [V1]
5. Charge attack line [V1]
6. Advance line to seat of fire
7. Bleed line/check nozzle pattern
8. Operate straight stream
9. Operate fog stream
10. Protect exposures [V1]
11. Operate deck gun/master stream [V1 via master stream]
12. Extend line to upper floors
13. Stretch standpipe bundle
14. Recharge bottle/air rotation support [V1 via rehab]

## 4) Truck Company Operations
1. Forcible entry (irons) [V1]
2. Through-the-lock entry
3. Force interior doors
4. Control door to fire area
5. Ladder the building [V1 via ladder task]
6. Place portable ladders to secondary egress
7. Ventilate roof [V1 via ventilate]
8. Horizontal ventilation [V1 via ventilate]
9. Search above fire [V1 via primary search]
10. Search fire floor [V1 via primary search]
11. Search below fire [V1 via primary search]
12. Overhaul concealed spaces [V1]
13. Open ceilings/walls for extension checks
14. Remove bars/security gates

## 5) Search and Rescue
1. Primary search [V1]
2. Secondary search [V1]
3. Oriented search
4. VEIS/VES operations
5. Thermal imaging search
6. Victim packaging [V1 via transport]
7. Victim removal [V1 via rescue]
8. Transfer patient to EMS [V1]
9. Mark searched rooms
10. Report all-clear conditions

## 6) EMS and Medical Support
1. Initial triage [V1]
2. Airway support
3. Bleeding control
4. Burn treatment
5. Spinal precautions
6. Place patient on stretcher [V1 via transport]
7. Load patient to ambulance [V1 via transport]
8. Transport patient [V1]
9. Rehab monitoring for firefighters [V1]
10. Track patient count/status

## 7) Fireground Support and Safety
1. Control utilities (gas/electric) [V1]
2. Secure collapse zone
3. Establish exclusion zones
4. Monitor structural stability
5. Monitor smoke conditions
6. Set accountability board/tags
7. Request RIT/RIC team
8. Call mayday procedures
9. Deploy salvage covers [V1]
10. Protect evidence for investigation

## 8) Water Supply and Hose Management
1. Forward lay from hydrant
2. Reverse lay to supply point
3. Relay pumping
4. Boost pressure to upper floors
5. Add gated wye/manifold
6. Replace burst section of hose
7. Flake and reroute kinks
8. Transition to defensive streams
9. Shut down/bleed lines
10. Repack hose post-incident

## 9) Command and Communications
1. Give can report
2. Give progress report (PAR-compatible)
3. Request additional alarms
4. Request specialized units
5. Assign/divide tactical sectors
6. Track benchmarks (water on fire, search complete)
7. Confirm evacuation orders
8. Coordinate police traffic control
9. Coordinate utility companies
10. Announce under-control

## 10) Specialized Incident Tasks
1. Vehicle fire suppression
2. Vehicle extrication support
3. Hazardous material isolation
4. Decon corridor setup
5. Confined-space rescue support
6. High-angle rope setup
7. Swift-water standby
8. Wildland progressive hose lay
9. Elevator rescue support
10. Trench collapse support

## 11) Demobilization and Return to Service
1. Secondary overhaul sweep [V1]
2. Collect tools and ladders
3. Stow hose and appliances
4. Re-rack SCBA cylinders
5. Refill water tank
6. Decontaminate PPE/equipment
7. Final PAR/accountability
8. Complete incident report
9. Return apparatus in service
10. Return to quarters

## V1 Action Hooks (currently wired)
- `grab_hose`
- `connect_hydrant`
- `set_pump_pressure`
- `charge_line`
- `assign_ladder_task`
- `deploy_outriggers`
- `operate_master_stream`
- `forcible_entry`
- `primary_search`
- `secondary_search`
- `ventilate_structure`
- `protect_exposure`
- `control_utilities`
- `deploy_scene_lighting`
- `overhaul_hotspots`
- `salvage_cover`
- `triage_patient`
- `transport_patient`
- `rehab_rotation`
- `rescue_victim`
- `reposition_apparatus`

## Current Keyboard Map (scene)
- `1` hose, `2` hydrant, `3` pump, `4` charge
- `5` forcible entry, `6` primary search, `7` ventilation, `8` ladder task
- `9` master stream, `0` overhaul
- `T` triage, `Y` transport, `U` utilities, `I` exposure
- `O` scene lighting, `P` reposition apparatus, `J` secondary search, `K` salvage, `M` rehab
- `R` rescue victim
- Camera: `WASD` move relative to camera heading, `Q/E` rotate
