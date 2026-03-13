(function (global) {
  'use strict';

  var GameMode = {
    BUILD: 'build',
    DISPATCHER: 'dispatcher'
  };

  var Difficulty = {
    EASY: 'easy',
    NORMAL: 'normal',
    HARD: 'hard'
  };

  var SessionView = {
    MENU: 'menu',
    MAP_2D: 'map2d',
    LOADING_3D: 'loading3d',
    SCENE_3D: 'scene3d'
  };

  var MissionStatus = {
    PENDING_DISPATCH: 'pending_dispatch',
    UNITS_EN_ROUTE: 'units_en_route',
    ON_SCENE: 'on_scene',
    RESOLVED: 'resolved',
    FAILED: 'failed'
  };

  var EscalationLevel = {
    BLUE: 'blue',
    YELLOW: 'yellow',
    RED: 'red'
  };

  var UnitType = {
    ENGINE: 'engine',
    LADDER: 'ladder',
    AMBULANCE: 'ambulance',
    BATTALION: 'battalion',
    RESCUE: 'rescue',
    HAZMAT: 'hazmat',
    POLICE: 'police'
  };

  var unitWeights = {
    engine: 3,
    ladder: 3,
    ambulance: 2,
    battalion: 2,
    rescue: 3,
    hazmat: 4,
    police: 1
  };

  function createRng(seed) {
    var s = (seed || Date.now()) >>> 0;
    return function rand() {
      s = (1664525 * s + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function pick(rng, list) {
    return list[Math.floor(rng() * list.length)];
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createPlayerState(mode, cityStationCount) {
    if (mode === GameMode.DISPATCHER) {
      return {
        level: 5,
        credits: 0,
        ownedStations: cityStationCount
      };
    }

    return {
      level: 1,
      credits: 50000,
      ownedStations: 0
    };
  }

  function createSession(config) {
    var rng = createRng(config.seed);
    return {
      config: {
        cityName: config.cityName || 'New York City',
        cityStationCount: config.cityStationCount || 22,
        mode: config.mode || GameMode.BUILD,
        difficulty: config.difficulty || Difficulty.EASY
      },
      view: SessionView.MENU,
      isPaused: false,
      missions: [],
      focusedMissionId: null,
      globalRadio: [],
      nextMissionId: 1,
      rng: rng,
      simTimeSec: 0,
      player: createPlayerState(config.mode || GameMode.BUILD, config.cityStationCount || 22)
    };
  }

  function openOperationsView(session) {
    session.view = SessionView.MAP_2D;
    return session.view;
  }

  function getBuildingTypes() {
    return [
      '2-Story Residential',
      'Garden Apartment',
      'Taxpayer Mixed Use',
      'Warehouse',
      'Light Industrial',
      'Office Mid-Rise'
    ];
  }

  function getCallerReports() {
    return [
      'Caller reports smoke from upper windows.',
      'Caller reports possible kitchen fire with alarm sounding.',
      'Multiple callers report flames from roofline.',
      'Caller reports vehicle into structure with injuries.',
      'Caller reports odor of gas and haze in hallway.'
    ];
  }

  function createMission(session) {
    var missionId = session.nextMissionId++;
    var rng = session.rng;
    var building = pick(rng, getBuildingTypes());
    var caller = pick(rng, getCallerReports());
    var hiddenRisk = 1 + Math.floor(rng() * 5);
    var severity = 2 + Math.floor(rng() * 6);

    var mission = {
      id: missionId,
      title: building + ' Incident #' + missionId,
      status: MissionStatus.PENDING_DISPATCH,
      escalation: EscalationLevel.BLUE,
      initialCall: {
        callerReport: caller,
        buildingType: building,
        addressHint: 'Block ' + (100 + Math.floor(rng() * 900)),
        hiddenRiskScore: hiddenRisk
      },
      severityScore: severity,
      dispatchAdequacy: 0,
      arrivalEtaSec: 0,
      civiliansKnown: Math.floor(rng() * 3),
      civiliansRescued: 0,
      isFocused: false,
      isPaused: false,
      isLoadingTo3D: false,
      startedAt: nowIso(),
      callCategory: 'generated',
      dispatchedUnits: [],
      dynamicEvents: [],
      radio: [
        {
          source: 'Dispatch',
          message: caller,
          ts: nowIso()
        }
      ],
      selectedActor: null,
      inventory: {
        hoseAvailable: 6,
        hoseDeployed: 0,
        hydrantsConnected: 0,
        ladderAssignments: 0,
        linesCharged: 0,
        pumpPressureSet: false,
        forcibleEntryOps: 0,
        primarySearchOps: 0,
        secondarySearchOps: 0,
        ventilationOps: 0,
        overhaulOps: 0,
        utilityControlOps: 0,
        exposureProtectionOps: 0,
        sceneLightingOps: 0,
        outriggerOps: 0,
        masterStreamOps: 0,
        triageOps: 0,
        transportOps: 0,
        rehabOps: 0,
        salvageOps: 0
      }
    };

    session.missions.push(mission);
    return mission;
  }

  function tryCreateMissionIfIdle(session) {
    var unresolved = session.missions.some(function (m) {
      return m.status === MissionStatus.PENDING_DISPATCH ||
        m.status === MissionStatus.UNITS_EN_ROUTE ||
        m.status === MissionStatus.ON_SCENE;
    });

    if (unresolved) {
      return null;
    }

    return createMission(session);
  }

  function getStationCapacity(session) {
    if (session.config.mode === GameMode.DISPATCHER) {
      return session.config.cityStationCount;
    }

    return Math.max(1, session.player.ownedStations);
  }

  function getMaxUnitsPerAlarm(session) {
    if (session.config.mode === GameMode.DISPATCHER) {
      return Math.max(6, Math.min(18, 4 + session.player.level));
    }

    return Math.max(3, Math.min(12, 2 + session.player.ownedStations));
  }

  function canDispatchUnit(session, unitType, selectedCount) {
    if (unitType === UnitType.AMBULANCE) {
      return true;
    }
    return selectedCount < getMaxUnitsPerAlarm(session);
  }

  function calcDispatchScore(units) {
    return units.reduce(function (acc, u) {
      var weight = unitWeights[u.type] || 1;
      return acc + (weight * u.count);
    }, 0);
  }

  function focusMission(session, missionId) {
    var target = null;
    session.missions.forEach(function (mission) {
      mission.isFocused = mission.id === missionId;
      mission.isPaused = !mission.isFocused;
      if (mission.isFocused) {
        target = mission;
      }
    });

    session.focusedMissionId = target ? target.id : null;

    if (!target) {
      return null;
    }

    if (target.status === MissionStatus.ON_SCENE) {
      session.view = SessionView.SCENE_3D;
    } else if (target.status === MissionStatus.UNITS_EN_ROUTE) {
      session.view = SessionView.LOADING_3D;
    } else {
      session.view = SessionView.MAP_2D;
    }

    return target;
  }

  function addRadio(mission, source, message) {
    mission.radio.push({ source: source, message: message, ts: nowIso() });
  }

  function dispatchMission(session, missionId, unitPlan) {
    var mission = session.missions.find(function (m) { return m.id === missionId; });
    if (!mission || mission.status !== MissionStatus.PENDING_DISPATCH) {
      return { ok: false, reason: 'Mission unavailable for dispatch.' };
    }

    focusMission(session, missionId);

    mission.dispatchedUnits = unitPlan.map(function (u) {
      return {
        type: u.type,
        count: u.count,
        label: u.label || null,
        companyId: u.companyId || null
      };
    });

    mission.dispatchAdequacy += calcDispatchScore(unitPlan);
    mission.status = MissionStatus.UNITS_EN_ROUTE;
    mission.arrivalEtaSec = 10;
    mission.isLoadingTo3D = true;
    session.view = SessionView.LOADING_3D;

    addRadio(mission, 'Dispatch', 'Units responding: ' + unitPlan.map(function (u) {
      return u.label ? u.label : (u.count + 'x ' + u.type);
    }).join(', '));

    if (mission.dispatchAdequacy < mission.severityScore) {
      mission.severityScore += 2;
      addRadio(mission, 'Dispatch', 'Updated reports suggest worsening conditions.');
    }

    return { ok: true };
  }

  function maybeInjectDynamicEvent(session, mission) {
    var rng = session.rng;
    if (rng() > 0.32) {
      return null;
    }

    var eventTypes = [
      { key: 'flashover', msg: 'Flashover risk reported on upper floor.', delta: 2 },
      { key: 'additional_victims', msg: 'Additional victim discovered in rear room.', delta: 1, victims: 1 },
      { key: 'collapse', msg: 'Partial interior collapse reported.', delta: 2 },
      { key: 'hazmat', msg: 'Unknown chemical containers found near fire area.', delta: 1 },
      { key: 'fire_spread', msg: 'Fire spread to concealed spaces/attic.', delta: 1 }
    ];

    var evt = pick(rng, eventTypes);
    mission.dynamicEvents.push({
      type: evt.key,
      description: evt.msg,
      ts: nowIso()
    });

    mission.severityScore += evt.delta;
    if (evt.victims) {
      mission.civiliansKnown += evt.victims;
    }

    addRadio(mission, 'Command', evt.msg);
    return evt;
  }

  function computeEscalation(mission) {
    var delta = mission.severityScore - mission.dispatchAdequacy;
    if (delta <= 0) {
      return EscalationLevel.BLUE;
    }
    if (delta <= 3) {
      return EscalationLevel.YELLOW;
    }
    return EscalationLevel.RED;
  }

  function tickMissionEnRoute(session, mission, dtSec) {
    if (mission.status !== MissionStatus.UNITS_EN_ROUTE || mission.isPaused) {
      return;
    }

    mission.arrivalEtaSec -= dtSec;
    if (mission.arrivalEtaSec > 0) {
      return;
    }

    mission.status = MissionStatus.ON_SCENE;
    mission.isLoadingTo3D = false;
    session.view = SessionView.SCENE_3D;
    var firstLabel = mission.dispatchedUnits.length ? (mission.dispatchedUnits[0].label || 'Engine 1') : 'Engine 1';
    addRadio(mission, firstLabel, 'On scene. Establishing command and size-up.');
  }

  function tickMissionOnScene(session, mission, dtSec) {
    if (mission.status !== MissionStatus.ON_SCENE || mission.isPaused) {
      return;
    }

    // Pressure rises if hidden conditions outmatch response.
    mission.severityScore += Math.max(0, mission.initialCall.hiddenRiskScore - 2);
    if (mission.dispatchAdequacy < mission.severityScore) {
      mission.severityScore += 1;
    }

    maybeInjectDynamicEvent(session, mission);
    mission.escalation = computeEscalation(mission);

    if (mission.civiliansRescued >= mission.civiliansKnown && mission.dispatchAdequacy >= mission.severityScore) {
      mission.status = MissionStatus.RESOLVED;
      addRadio(mission, 'Command', 'Incident stabilized and under control.');
      onMissionResolved(session, mission);
    }
  }

  function onMissionResolved(session, mission) {
    var reward = calculateMissionReward(mission);
    session.player.credits += reward;
    if (session.config.mode === GameMode.BUILD) {
      session.player.level += 1;
    }
    session.view = SessionView.MAP_2D;
  }

  function calculateMissionReward(mission) {
    return 5000;
  }

  function tickSession(session, dtSec) {
    if (session.isPaused) {
      return;
    }

    session.simTimeSec += dtSec;

    session.missions.forEach(function (mission) {
      if (!mission.isFocused) {
        mission.isPaused = true;
        return;
      }

      mission.isPaused = false;
      tickMissionEnRoute(session, mission, dtSec);
      tickMissionOnScene(session, mission, dtSec);
    });
  }

  function setPause(session, paused) {
    session.isPaused = !!paused;
  }

  function getFocusedMission(session) {
    return session.missions.find(function (m) { return m.id === session.focusedMissionId; }) || null;
  }

  function tryBuyStation(session) {
    if (session.config.mode !== GameMode.BUILD) {
      return { ok: false, reason: 'Station expansion disabled in Dispatcher mode.' };
    }

    var cost = 50000 + (Math.max(0, session.player.ownedStations - 1) * 25000);
    if (session.player.credits < cost) {
      return { ok: false, reason: 'Not enough credits.' };
    }

    session.player.credits -= cost;
    session.player.ownedStations += 1;
    return { ok: true, cost: cost };
  }

  function applySceneAction(session, action) {
    var mission = getFocusedMission(session);
    if (!mission || mission.status !== MissionStatus.ON_SCENE) {
      return { ok: false, reason: 'No active on-scene mission.' };
    }

    if (action.type === 'select_firefighter') {
      mission.selectedActor = action.actorId;
      addRadio(mission, 'Command', 'Firefighter ' + action.actorId + ' selected.');
      return { ok: true };
    }

    if (action.type === 'grab_hose') {
      var amount = Math.max(1, action.count || 1);
      if (mission.inventory.hoseAvailable < amount) {
        return { ok: false, reason: 'Not enough hose available.' };
      }
      mission.inventory.hoseAvailable -= amount;
      mission.inventory.hoseDeployed += amount;
      mission.dispatchAdequacy += amount;
      addRadio(mission, 'Engine', 'Hose deployed x' + amount + '.');
      return { ok: true };
    }

    if (action.type === 'connect_hydrant') {
      mission.inventory.hydrantsConnected += 1;
      mission.dispatchAdequacy += 1;
      addRadio(mission, 'Engine', 'Hydrant connection established.');
      return { ok: true };
    }

    if (action.type === 'set_pump_pressure') {
      mission.inventory.pumpPressureSet = true;
      mission.dispatchAdequacy += 1;
      addRadio(mission, 'Engine', 'Pump pressure set and monitored.');
      return { ok: true };
    }

    if (action.type === 'charge_line') {
      if (mission.inventory.hoseDeployed < 1) {
        return { ok: false, reason: 'Deploy hose first.' };
      }
      if (mission.inventory.hydrantsConnected < 1 && !mission.inventory.pumpPressureSet) {
        return { ok: false, reason: 'Water supply or pump pressure required.' };
      }
      mission.inventory.linesCharged += 1;
      mission.dispatchAdequacy += 2;
      mission.severityScore = Math.max(1, mission.severityScore - 1);
      addRadio(mission, 'Engine', 'Attack line charged and flowing.');
      return { ok: true };
    }

    if (action.type === 'assign_ladder_task') {
      mission.inventory.ladderAssignments += 1;
      mission.dispatchAdequacy += 1;
      addRadio(mission, 'Ladder', 'Ladder operation assigned: ' + (action.task || 'elevate and access'));
      return { ok: true };
    }

    if (action.type === 'deploy_outriggers') {
      mission.inventory.outriggerOps += 1;
      mission.dispatchAdequacy += 1;
      addRadio(mission, 'Ladder', 'Outriggers deployed and apparatus stabilized.');
      return { ok: true };
    }

    if (action.type === 'operate_master_stream') {
      if (mission.inventory.ladderAssignments < 1 && mission.inventory.linesCharged < 2) {
        return { ok: false, reason: 'Need ladder stream position or multiple charged lines.' };
      }
      mission.inventory.masterStreamOps += 1;
      mission.dispatchAdequacy += 2;
      mission.severityScore = Math.max(1, mission.severityScore - 1);
      addRadio(mission, 'Ladder', 'Master stream operation in progress.');
      return { ok: true };
    }

    if (action.type === 'forcible_entry') {
      mission.inventory.forcibleEntryOps += 1;
      mission.dispatchAdequacy += 1;
      if (session.rng() > 0.72) {
        mission.civiliansKnown += 1;
        addRadio(mission, 'Ladder', 'Forcible entry complete. Additional occupant report received.');
      } else {
        addRadio(mission, 'Ladder', 'Entry gained and interior access improved.');
      }
      return { ok: true };
    }

    if (action.type === 'primary_search') {
      mission.inventory.primarySearchOps += 1;
      mission.dispatchAdequacy += 1;
      if (mission.civiliansRescued < mission.civiliansKnown) {
        addRadio(mission, 'Search', 'Primary search underway for reported occupants.');
      } else if (session.rng() > 0.75) {
        mission.civiliansKnown += 1;
        addRadio(mission, 'Search', 'Primary search found an additional victim.');
      } else {
        addRadio(mission, 'Search', 'Primary search all clear in assigned area.');
      }
      return { ok: true };
    }

    if (action.type === 'secondary_search') {
      mission.inventory.secondarySearchOps += 1;
      mission.dispatchAdequacy += 1;
      mission.severityScore = Math.max(1, mission.severityScore - 1);
      addRadio(mission, 'Search', 'Secondary search complete in selected sector.');
      return { ok: true };
    }

    if (action.type === 'ventilate_structure') {
      mission.inventory.ventilationOps += 1;
      mission.dispatchAdequacy += 1;
      mission.severityScore = Math.max(1, mission.severityScore - 1);
      addRadio(mission, 'Ladder', 'Ventilation opening completed.');
      return { ok: true };
    }

    if (action.type === 'protect_exposure') {
      mission.inventory.exposureProtectionOps += 1;
      mission.dispatchAdequacy += 1;
      mission.severityScore = Math.max(1, mission.severityScore - 1);
      addRadio(mission, 'Engine', 'Exposure line in place; adjacent structures protected.');
      return { ok: true };
    }

    if (action.type === 'control_utilities') {
      mission.inventory.utilityControlOps += 1;
      mission.dispatchAdequacy += 1;
      addRadio(mission, 'Safety', 'Utilities controlled for hazard reduction.');
      return { ok: true };
    }

    if (action.type === 'deploy_scene_lighting') {
      mission.inventory.sceneLightingOps += 1;
      mission.dispatchAdequacy += 1;
      addRadio(mission, 'Command', 'Portable scene lighting deployed.');
      return { ok: true };
    }

    if (action.type === 'overhaul_hotspots') {
      mission.inventory.overhaulOps += 1;
      mission.dispatchAdequacy += 1;
      mission.severityScore = Math.max(1, mission.severityScore - 1);
      addRadio(mission, 'Engine', 'Overhaul started for hidden fire extension.');
      return { ok: true };
    }

    if (action.type === 'salvage_cover') {
      mission.inventory.salvageOps += 1;
      mission.dispatchAdequacy += 1;
      addRadio(mission, 'Engine', 'Salvage covers deployed to protect contents.');
      return { ok: true };
    }

    if (action.type === 'triage_patient') {
      mission.inventory.triageOps += 1;
      mission.dispatchAdequacy += 1;
      addRadio(mission, 'EMS', 'Patient triage performed.');
      return { ok: true };
    }

    if (action.type === 'transport_patient') {
      mission.inventory.transportOps += 1;
      mission.dispatchAdequacy += 1;
      if (mission.civiliansRescued < mission.civiliansKnown) {
        mission.civiliansRescued += 1;
      }
      addRadio(mission, 'EMS', 'Patient packaged and transported.');
      return { ok: true };
    }

    if (action.type === 'rehab_rotation') {
      mission.inventory.rehabOps += 1;
      addRadio(mission, 'Command', 'Crew rotation to rehab/air in progress.');
      return { ok: true };
    }

    if (action.type === 'right_click_truck_door') {
      if (!mission.selectedActor) {
        return { ok: false, reason: 'Select a firefighter first.' };
      }
      addRadio(mission, 'Command', 'Firefighter ' + mission.selectedActor + ' moving apparatus position.');
      mission.dispatchAdequacy += 1;
      return { ok: true };
    }

    if (action.type === 'rescue_victim') {
      if (mission.civiliansRescued < mission.civiliansKnown) {
        mission.civiliansRescued += 1;
        addRadio(mission, 'Rescue', 'One victim removed and transferred to EMS.');
        mission.dispatchAdequacy += 1;
      }
      return { ok: true };
    }

    if (action.type === 'reposition_apparatus') {
      mission.dispatchAdequacy += 1;
      addRadio(mission, 'Command', 'Apparatus repositioned for tactical advantage.');
      return { ok: true };
    }

    return { ok: false, reason: 'Unknown action.' };
  }

  function getEscalationHintForUi(session, mission) {
    if (!mission) {
      return null;
    }

    if (session.config.difficulty !== Difficulty.EASY) {
      return null;
    }

    return mission.escalation;
  }

  function createDefaultDispatchPlan() {
    return [
      { type: UnitType.ENGINE, count: 1 },
      { type: UnitType.LADDER, count: 1 }
    ];
  }

  var api = {
    GameMode: GameMode,
    Difficulty: Difficulty,
    SessionView: SessionView,
    MissionStatus: MissionStatus,
    EscalationLevel: EscalationLevel,
    UnitType: UnitType,
    createSession: createSession,
    openOperationsView: openOperationsView,
    createMission: createMission,
    tryCreateMissionIfIdle: tryCreateMissionIfIdle,
    focusMission: focusMission,
    dispatchMission: dispatchMission,
    tickSession: tickSession,
    setPause: setPause,
    getFocusedMission: getFocusedMission,
    getStationCapacity: getStationCapacity,
    getMaxUnitsPerAlarm: getMaxUnitsPerAlarm,
    canDispatchUnit: canDispatchUnit,
    tryBuyStation: tryBuyStation,
    applySceneAction: applySceneAction,
    getEscalationHintForUi: getEscalationHintForUi,
    createDefaultDispatchPlan: createDefaultDispatchPlan,
    calculateMissionReward: calculateMissionReward
  };

  global.BoxAlarmSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
