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

function runTests(repoPath) {
  var simCode = readFile(repoPath + '/webgame/js/simulation.js');
  eval(simCode);
  var Sim = BoxAlarmSim;

  // 1) 2D -> loading -> 3D on arrival.
  var s1 = Sim.createSession({ cityName: 'NYC', cityStationCount: 219, mode: Sim.GameMode.BUILD, difficulty: Sim.Difficulty.EASY, seed: 7 });
  Sim.openOperationsView(s1);
  var m1 = Sim.createMission(s1);
  Sim.focusMission(s1, m1.id);
  var resDispatch = Sim.dispatchMission(s1, m1.id, [{ type: Sim.UnitType.ENGINE, count: 1 }, { type: Sim.UnitType.LADDER, count: 1 }]);
  assert(resDispatch.ok, 'Dispatch should succeed');
  assert(s1.view === Sim.SessionView.LOADING_3D, 'Session should be in loading view after dispatch');

  for (var i = 0; i < 90; i++) {
    Sim.tickSession(s1, 1);
  }

  assert(m1.status === Sim.MissionStatus.ON_SCENE || m1.status === Sim.MissionStatus.RESOLVED, 'Mission should arrive on scene');
  assert(s1.view === Sim.SessionView.SCENE_3D || s1.view === Sim.SessionView.MAP_2D, 'View should be scene or map after mission progression');

  // 2) Non-focused missions are paused and do not escalate.
  var s2 = Sim.createSession({ cityName: 'Metro', cityStationCount: 22, mode: Sim.GameMode.DISPATCHER, difficulty: Sim.Difficulty.NORMAL, seed: 5 });
  Sim.openOperationsView(s2);
  var a = Sim.createMission(s2);
  var b = Sim.createMission(s2);
  Sim.dispatchMission(s2, a.id, [{ type: Sim.UnitType.ENGINE, count: 1 }]);
  Sim.focusMission(s2, a.id);
  var bBefore = b.severityScore;
  Sim.tickSession(s2, 30);
  assert(a.isPaused === false, 'Focused mission should not be paused');
  assert(b.isPaused === true, 'Non-focused mission should be paused');
  assert(b.severityScore === bBefore, 'Paused mission severity should not change');

  // 3) Easy shows color hint, normal hides it.
  var easyHint = Sim.getEscalationHintForUi(s1, m1);
  var s3 = Sim.createSession({ cityName: 'Metro', cityStationCount: 22, mode: Sim.GameMode.BUILD, difficulty: Sim.Difficulty.NORMAL, seed: 9 });
  Sim.openOperationsView(s3);
  var m3 = Sim.createMission(s3);
  var normalHint = Sim.getEscalationHintForUi(s3, m3);
  assert(easyHint !== null, 'Easy mode should return escalation hint');
  assert(normalHint === null, 'Normal mode should hide escalation hint');

  // 4) Build and dispatcher station capacities differ.
  var sBuild = Sim.createSession({ cityName: 'Metro', cityStationCount: 22, mode: Sim.GameMode.BUILD, difficulty: Sim.Difficulty.EASY, seed: 12 });
  var sDispatch = Sim.createSession({ cityName: 'Metro', cityStationCount: 22, mode: Sim.GameMode.DISPATCHER, difficulty: Sim.Difficulty.EASY, seed: 12 });
  assert(Sim.getStationCapacity(sBuild) === 1, 'Build mode should start with 1 station');
  assert(Sim.getStationCapacity(sDispatch) === 22, 'Dispatcher mode should have full station count');

  // 5) Insufficient dispatch worsens severity.
  var s5 = Sim.createSession({ cityName: 'Metro', cityStationCount: 22, mode: Sim.GameMode.BUILD, difficulty: Sim.Difficulty.HARD, seed: 2 });
  Sim.openOperationsView(s5);
  var m5 = Sim.createMission(s5);
  var before = m5.severityScore;
  Sim.dispatchMission(s5, m5.id, [{ type: Sim.UnitType.POLICE, count: 1 }]);
  assert(m5.severityScore > before, 'Insufficient dispatch should increase severity');

  // 6) Scene action validations.
  for (var t = 0; t < 90; t++) {
    Sim.tickSession(s5, 1);
  }
  Sim.focusMission(s5, m5.id);
  if (m5.status === Sim.MissionStatus.ON_SCENE) {
    var moveFails = Sim.applySceneAction(s5, { type: 'right_click_truck_door' });
    assert(moveFails.ok === false, 'Move truck should require firefighter selection');
    Sim.applySceneAction(s5, { type: 'select_firefighter', actorId: 'FF-1' });
    var moveOk = Sim.applySceneAction(s5, { type: 'right_click_truck_door' });
    assert(moveOk.ok === true, 'Move truck should work after selecting firefighter');
  }

  return 'PASS: simulation tests completed';
}

function run(argv) {
  var repoPath = argv.length > 0 ? argv[0] : '.';
  var result = runTests(repoPath);
  console.log(result);
}
