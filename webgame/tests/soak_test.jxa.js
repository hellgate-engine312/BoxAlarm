ObjC.import('Foundation');

function readFile(path) {
  var ns = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if (!ns) {
    throw new Error('Unable to read file: ' + path);
  }
  return ObjC.unwrap(ns);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function executeSoak(repoPath, rounds) {
  var simCode = readFile(repoPath + '/webgame/js/simulation.js');
  eval(simCode);
  var Sim = BoxAlarmSim;

  var totalMissions = 0;
  var resolved = 0;
  var onScene = 0;

  for (var i = 0; i < rounds; i++) {
    var mode = (i % 2 === 0) ? Sim.GameMode.BUILD : Sim.GameMode.DISPATCHER;
    var difficulty = (i % 3 === 0) ? Sim.Difficulty.EASY : ((i % 3 === 1) ? Sim.Difficulty.NORMAL : Sim.Difficulty.HARD);
    var session = Sim.createSession({
      cityName: 'Soak City',
      cityStationCount: 60,
      mode: mode,
      difficulty: difficulty,
      seed: 1000 + i
    });

    Sim.openOperationsView(session);

    for (var m = 0; m < 3; m++) {
      var mission = Sim.createMission(session);
      totalMissions += 1;

      Sim.focusMission(session, mission.id);
      var plan = [
        { type: Sim.UnitType.ENGINE, count: 1 + (i % 2) },
        { type: Sim.UnitType.LADDER, count: 1 },
        { type: Sim.UnitType.AMBULANCE, count: 1 }
      ];

      var ok = Sim.dispatchMission(session, mission.id, plan);
      assert(ok.ok === true, 'Dispatch must succeed in soak run.');

      for (var t = 0; t < 140; t++) {
        Sim.tickSession(session, 1);

        var focused = Sim.getFocusedMission(session);
        if (focused && focused.status === Sim.MissionStatus.ON_SCENE) {
          Sim.applySceneAction(session, { type: 'select_firefighter', actorId: 'FF-1' });
          Sim.applySceneAction(session, { type: 'grab_hose', count: 1 });
          Sim.applySceneAction(session, { type: 'connect_hydrant' });
          Sim.applySceneAction(session, { type: 'assign_ladder_task', task: 'elevate and extend' });
          Sim.applySceneAction(session, { type: 'rescue_victim' });
          onScene += 1;
        }
      }

      if (mission.status === Sim.MissionStatus.RESOLVED) {
        resolved += 1;
      }

      assert(session.view === Sim.SessionView.MAP_2D || session.view === Sim.SessionView.SCENE_3D || session.view === Sim.SessionView.LOADING_3D,
        'Unexpected session view state.');

      assert(mission.severityScore >= 0, 'Severity should not be negative.');
      assert(mission.dispatchAdequacy >= 0, 'Dispatch adequacy should not be negative.');
    }
  }

  console.log('PASS: soak completed rounds=' + rounds + ' missions=' + totalMissions + ' resolved=' + resolved + ' onSceneTicks=' + onScene);
}

function run(argv) {
  var repoPath = argv.length > 0 ? argv[0] : '.';
  var rounds = argv.length > 1 ? parseInt(argv[1], 10) : 80;
  executeSoak(repoPath, rounds);
}
