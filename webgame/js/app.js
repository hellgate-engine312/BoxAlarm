(function () {
  'use strict';

  var Sim = window.BoxAlarmSim;
  var LRef = window.L || null;
  var ThreeRef = window.THREE || null;
  var Assets = window.BoxAlarmAssets || null;
  var BUILD_ID = window.BOXALARM_BUILD || 'dev-2026-03-12-10';
  var FORCE_TOPDOWN_SCENE = true;
  var STARTER_STATION_COST = 50000;

  var session = null;
  var currentCityProfile = null;
  var selectedStarterEngineNumber = null;
  var selectedMissionId = null;
  var map = null;
  var mapTiles = null;
  var mapFallbackLayer = null;
  var mapReady = false;
  var stationPlaced = false;
  var placementArmed = false;
  var stationLatLng = null;
  var mapMarkersByMission = {};
  var sceneDataCache = {};
  var stationMarker = null;
  var ticker = null;
  var firstCallTimer = null;
  var followupCallTimer = null;
  var fleet = [];
  var companySelections = {};
  var heldKeys = {
    w: false,
    a: false,
    s: false,
    d: false,
    q: false,
    e: false
  };
  var roadMaterialCache = {};
  var sceneAnimId = null;
  var lastFrameTs = 0;
  var menuState = {
    step: 0,
    mode: null,
    cityKey: null,
    cityQuery: '',
    difficulty: null
  };

  var BACKLOG = [
    'Voice radio playback and hard-mode voice protocol',
    'Pathfinding around cars/tree beds and obstacles',
    'Firefighter rank-based speed and stamina',
    'Custom squad creation via right-click drag',
    'Higher-fidelity truck and firefighter models',
    'Cinematic turnout and apparatus arrival sequence'
  ];
  var TEST_CALL_INTERVAL_MS = 10000;
  var RADIO_REVEAL_BASE_MS = 6500;
  var RADIO_REVEAL_JITTER_MS = 2500;
  var MIN_SCENE_BUILDINGS = 120;
  var MAX_SCENE_BUILDINGS = 260;
  var MAX_OSM_BUILDINGS = 520;
  var BUILDING_OVERLAP_PADDING = 0.14;
  var FIREFIGHTER_COLLIDER_RADIUS = 0.18;
  var FALLBACK_SCENE_VIEW_PAD_PX = 0;
  var FALLBACK_AERIAL_PITCH_COS = 0.82;
  var FALLBACK_AERIAL_SKEW = 0.07;

  var TILE_PROVIDERS = [
    {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c'],
      attribution: '&copy; OpenStreetMap contributors'
    },
    {
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      subdomains: ['a', 'b', 'c', 'd'],
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }
  ];
  var activeTileProviderIndex = 0;

  var els = {
    playerSummary: document.getElementById('playerSummary'),
    buildStamp: document.getElementById('buildStamp'),
    menuScreen: document.getElementById('menuScreen'),
    menuWizard: document.getElementById('menuWizard'),
    mapScreen: document.getElementById('mapScreen'),
    loadingScreen: document.getElementById('loadingScreen'),
    sceneScreen: document.getElementById('sceneScreen'),
    menuProgress: document.getElementById('menuProgress'),
    menuStepPills: document.getElementById('menuStepPills'),
    menuStepHeading: document.getElementById('menuStepHeading'),
    menuStepSubheading: document.getElementById('menuStepSubheading'),
    menuChoices: document.getElementById('menuChoices'),
    menuBackBtn: document.getElementById('menuBackBtn'),
    menuNextBtn: document.getElementById('menuNextBtn'),
    mapStatusText: document.getElementById('mapStatusText'),
    mapPauseBtn: document.getElementById('mapPauseBtn'),
    newMissionBtn: document.getElementById('newMissionBtn'),
    incidentFeed: document.getElementById('incidentFeed'),
    osmMap: document.getElementById('osmMap'),
    stationSetup: document.getElementById('stationSetup'),
    deptSummary: document.getElementById('deptSummary'),
    stationBudget: document.getElementById('stationBudget'),
    starterEngineSpecs: document.getElementById('starterEngineSpecs'),
    starterEngineInput: document.getElementById('starterEngineInput'),
    starterEngineChoices: document.getElementById('starterEngineChoices'),
    beginPlacementBtn: document.getElementById('beginPlacementBtn'),
    callActionPanel: document.getElementById('callActionPanel'),
    callPanelSummary: document.getElementById('callPanelSummary'),
    companySelection: document.getElementById('companySelection'),
    respondBtn: document.getElementById('respondBtn'),
    viewSceneBtn: document.getElementById('viewSceneBtn'),
    backlogList: document.getElementById('backlogList'),
    loadingBuilding: document.getElementById('loadingBuilding'),
    loadingCaller: document.getElementById('loadingCaller'),
    loadingEta: document.getElementById('loadingEta'),
    loadingWeather: document.getElementById('loadingWeather'),
    loadingHydrants: document.getElementById('loadingHydrants'),
    loadingOccupancy: document.getElementById('loadingOccupancy'),
    loadingPreplan: document.getElementById('loadingPreplan'),
    loadingTactical: document.getElementById('loadingTactical'),
    scene3dHost: document.getElementById('scene3dHost'),
    sceneMeta: document.getElementById('sceneMeta'),
    escalationBadge: document.getElementById('escalationBadge'),
    companyHud: document.getElementById('companyHud'),
    radioLog: document.getElementById('radioLog'),
    pauseBtn: document.getElementById('pauseBtn'),
    mapBtn: document.getElementById('mapBtn'),
    sceneStatus: document.getElementById('sceneStatus'),
    toast: document.getElementById('toast')
  };
  var threeState = null;
  var fallbackScene2d = null;

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      els.toast.classList.add('hidden');
    }, 2500);
  }

  function renderBuildStamp() {
    if (!els.buildStamp) {
      return;
    }
    var sceneLabel = FORCE_TOPDOWN_SCENE ? 'SCENE 2D' : (window.THREE ? '3D READY' : '3D FALLBACK');
    var mapLabel = window.L ? 'MAP READY' : 'MAP FALLBACK';
    els.buildStamp.textContent = 'BUILD ' + BUILD_ID + ' | ' + mapLabel + ' | ' + sceneLabel;
  }

  function getCityProfile(cityValue) {
    var profiles = {
      nyc: {
        key: 'nyc',
        name: 'New York City',
        stations: 219,
        departmentName: 'FDNY',
        departmentDescription: 'FDNY runs one of the world’s largest all-hazards urban response systems with dense engine/ladder coverage.',
        center: [40.7302, -73.9359],
        zoom: 13,
        minZoom: 11,
        maxZoom: 18,
        bounds: {
          southWest: [40.4774, -74.2591],
          northEast: [40.9176, -73.7004]
        },
        engineNumbers: [312, 271, 73, 157, 44, 28, 95, 33, 7, 230, 221, 65, 214, 166],
        ladderNumbers: [154, 120, 103, 12, 40, 24, 18, 147, 133, 85, 105, 3]
      },
      london: {
        key: 'london',
        name: 'London',
        stations: 102,
        departmentName: 'London Fire Brigade',
        departmentDescription: 'LFB covers Greater London with a high-volume metropolitan deployment model and mixed pump/appliance operations.',
        center: [51.5072, -0.1276],
        zoom: 12,
        minZoom: 10,
        maxZoom: 18,
        bounds: {
          southWest: [51.2868, -0.5103],
          northEast: [51.6919, 0.3340]
        },
        engineNumbers: [21, 33, 47, 56, 63, 71, 88, 104, 117, 132, 150, 173],
        ladderNumbers: [10, 14, 26, 31, 42, 57, 66, 79]
      },
      tokyo: {
        key: 'tokyo',
        name: 'Tokyo',
        stations: 81,
        departmentName: 'Tokyo Fire Department',
        departmentDescription: 'Tokyo FD combines high-density engine deployment with specialized urban rescue and high-rise response capabilities.',
        center: [35.6762, 139.6503],
        zoom: 12,
        minZoom: 10,
        maxZoom: 18,
        bounds: {
          southWest: [35.5280, 139.4450],
          northEast: [35.8180, 139.9100]
        },
        engineNumbers: [112, 124, 137, 146, 155, 169, 173, 181, 196, 207],
        ladderNumbers: [41, 55, 63, 72, 84, 95]
      },
      paris: {
        key: 'paris',
        name: 'Paris',
        stations: 76,
        departmentName: 'Brigade des Sapeurs-Pompiers de Paris',
        departmentDescription: 'BSPP is a military fire brigade with heavy structural and rescue capability across Paris and inner suburbs.',
        center: [48.8566, 2.3522],
        zoom: 12,
        minZoom: 10,
        maxZoom: 18,
        bounds: {
          southWest: [48.7480, 2.1600],
          northEast: [48.9650, 2.5500]
        },
        engineNumbers: [12, 18, 24, 31, 36, 44, 52, 63, 71, 84],
        ladderNumbers: [4, 7, 11, 15, 19, 27]
      },
      sydney: {
        key: 'sydney',
        name: 'Sydney',
        stations: 49,
        departmentName: 'Fire and Rescue NSW',
        departmentDescription: 'FRNSW handles metropolitan incidents with rescue, hazmat, and structural response across Greater Sydney.',
        center: [-33.8688, 151.2093],
        zoom: 12,
        minZoom: 10,
        maxZoom: 18,
        bounds: {
          southWest: [-34.1180, 150.5200],
          northEast: [-33.5780, 151.3900]
        },
        engineNumbers: [1, 6, 10, 14, 20, 24, 31, 38, 44, 52],
        ladderNumbers: [4, 7, 11, 17, 26]
      }
    };

    return profiles[cityValue] || profiles.nyc;
  }

  function renderMenuWizard() {
    var step = menuState.step;
    var pct = ((step) / 3) * 100;
    els.menuProgress.style.width = pct + '%';
    if (els.menuStepPills) {
      var labels = ['Play', 'Type', 'Location', 'Difficulty'];
      els.menuStepPills.innerHTML = labels.map(function (label, idx) {
        var state = idx < step ? 'done' : (idx === step ? 'active' : 'pending');
        return '<span class="step-pill ' + state + '">' + label + '</span>';
      }).join('');
    }
    els.menuBackBtn.classList.toggle('hidden', step === 0);
    els.menuChoices.innerHTML = '';

    if (step === 0) {
      els.menuStepHeading.textContent = 'Box Alarm';
      els.menuStepSubheading.textContent = 'Command emergency response under pressure.';
      els.menuNextBtn.textContent = 'Play';
      return;
    }

    if (step === 1) {
      els.menuStepHeading.textContent = 'Mission Type';
      els.menuStepSubheading.textContent = 'Choose how this run should play.';
      els.menuNextBtn.textContent = 'Next';
      renderMenuChoices([
        {
          key: Sim.GameMode.BUILD,
          title: 'Build Mode',
          body: 'Start lean, earn credits, expand stations, unlock larger calls.'
        },
        {
          key: Sim.GameMode.DISPATCHER,
          title: 'Dispatcher Mode',
          body: 'Full department available immediately. No expansion economy.'
        }
      ], menuState.mode, function (key) {
        menuState.mode = key;
      });
      return;
    }

    if (step === 2) {
      els.menuStepHeading.textContent = 'Location';
      els.menuStepSubheading.textContent = 'Type a city name (major cities enabled in this build).';
      els.menuNextBtn.textContent = 'Next';
      renderCityInputStep();
      return;
    }

    els.menuStepHeading.textContent = 'Difficulty';
    els.menuStepSubheading.textContent = 'Set how much intel the interface reveals.';
    els.menuNextBtn.textContent = 'Start Sandbox';
    renderMenuChoices([
      {
        key: Sim.Difficulty.EASY,
        title: 'Easy',
        body: 'Complexity color hints visible on call dots and scene badge.'
      },
      {
        key: Sim.Difficulty.NORMAL,
        title: 'Normal',
        body: 'No color assist. Use radio and visual cues.'
      },
      {
        key: Sim.Difficulty.HARD,
        title: 'Hard',
        body: 'Minimal guidance. Pure dispatch and scene interpretation.'
      }
    ], menuState.difficulty, function (key) {
      menuState.difficulty = key;
    });
  }

  function renderMenuChoices(choices, selectedKey, onSelect) {
    els.menuChoices.innerHTML = choices.map(function (choice) {
      var selected = choice.key === selectedKey;
      return '<button class=\"menu-choice' + (selected ? ' selected' : '') + '\" data-choice-key=\"' + choice.key + '\">' +
        '<h3>' + choice.title + '</h3>' +
        '<p>' + choice.body + '</p>' +
        '</button>';
    }).join('');

    els.menuChoices.querySelectorAll('[data-choice-key]').forEach(function (button) {
      button.addEventListener('click', function () {
        var key = button.getAttribute('data-choice-key');
        onSelect(key);
        renderMenuWizard();
      });
    });
  }

  function renderCityInputStep() {
    var selectedCity = menuState.cityKey ? getCityProfile(menuState.cityKey) : null;
    var placeholder = selectedCity ? selectedCity.name : 'Type city (ex: New York, London, Tokyo)';
    var cityList = ['New York City', 'London', 'Tokyo', 'Paris', 'Sydney'];
    els.menuChoices.innerHTML =
      '<div class="menu-city-entry">' +
      '<label for="cityInput">City</label>' +
      '<input id="cityInput" class="menu-city-input" list="citySuggestions" autocomplete="off" placeholder="' + placeholder + '" value="' + escapeHtml(menuState.cityQuery || '') + '">' +
      '<datalist id="citySuggestions">' + cityList.map(function (city) {
        return '<option value="' + city + '"></option>';
      }).join('') + '</datalist>' +
      '<p id="cityHint" class="menu-city-hint"></p>' +
      '</div>';

    var cityInput = document.getElementById('cityInput');
    var hint = document.getElementById('cityHint');
    if (!cityInput || !hint) {
      return;
    }

    var refresh = function () {
      var query = String(cityInput.value || '').trim();
      menuState.cityQuery = query;
      var cityKey = lookupCityKeyFromText(query);
      menuState.cityKey = cityKey;
      if (cityKey) {
        var city = getCityProfile(cityKey);
        hint.textContent = city.name + ' selected - ' + city.departmentName;
        prewarmMapTiles(city);
      } else if (query) {
        hint.textContent = 'City not available yet in this build. Try: New York City, London, Tokyo, Paris, Sydney.';
      } else {
        hint.textContent = 'Type a city to continue.';
      }
    };

    cityInput.addEventListener('input', refresh);
    cityInput.addEventListener('change', refresh);
    cityInput.addEventListener('blur', refresh);
    refresh();
  }

  function lookupCityKeyFromText(input) {
    var text = String(input || '').trim().toLowerCase();
    if (!text) {
      return null;
    }
    var aliases = {
      nyc: ['nyc', 'new york', 'new york city', 'brooklyn', 'queens', 'bronx', 'manhattan', 'staten island'],
      london: ['london', 'greater london'],
      tokyo: ['tokyo'],
      paris: ['paris'],
      sydney: ['sydney']
    };
    var keys = Object.keys(aliases);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var list = aliases[key];
      for (var j = 0; j < list.length; j++) {
        var alias = list[j];
        if (text === alias || text.indexOf(alias) === 0 || alias.indexOf(text) === 0) {
          return key;
        }
      }
    }
    return null;
  }

  function nextMenuStep() {
    if (menuState.step === 1 && !menuState.mode) {
      showToast('Choose mission type.');
      return;
    }
    if (menuState.step === 2 && !menuState.cityKey) {
      showToast('Choose location.');
      return;
    }
    if (menuState.step === 3 && !menuState.difficulty) {
      showToast('Choose difficulty.');
      return;
    }

    if (menuState.step < 3) {
      menuState.step += 1;
      renderMenuWizard();
      return;
    }

    startSession();
  }

  function previousMenuStep() {
    if (menuState.step <= 0) {
      return;
    }
    menuState.step -= 1;
    renderMenuWizard();
  }

  function startSession() {
    var city = getCityProfile(menuState.cityKey || 'nyc');
    currentCityProfile = city;
    session = Sim.createSession({
      cityName: city.name,
      cityStationCount: city.stations,
      mode: menuState.mode || Sim.GameMode.BUILD,
      difficulty: menuState.difficulty || Sim.Difficulty.EASY,
      seed: Date.now()
    });

    Sim.openOperationsView(session);
    selectedStarterEngineNumber = city.engineNumbers[0];
    fleet = createFleet(session.config.mode, city.stations, city);
    stationPlaced = false;
    placementArmed = false;
    selectedMissionId = null;
    clearMissionMarkers();

    initMap(city);
    populateBacklog();
    renderStationSetupCard();
    showStationPopup();
    if (!FORCE_TOPDOWN_SCENE) {
      initThreeScene();
    } else {
      threeState = null;
      initFallbackScene2d();
    }
    startTicking();
    render();
  }

  function populateBacklog() {
    if (!els.backlogList) {
      return;
    }
    els.backlogList.innerHTML = BACKLOG.map(function (item) {
      return '<li>' + item + '</li>';
    }).join('');
  }

  function initMap(city) {
    LRef = window.L || null;
    if (!LRef) {
      mapReady = false;
      els.mapStatusText.textContent = 'Map service unavailable (Leaflet failed to load).';
      return;
    }

    if (!map) {
      map = LRef.map('osmMap', {
        zoomControl: true,
        preferCanvas: true,
        worldCopyJump: false,
        maxBoundsViscosity: 1.0,
        inertia: true,
        zoomAnimation: false,
        fadeAnimation: false
      });

      map.on('click', function (event) {
        onMapClick(event.latlng);
      });
    }

    var bounds = LRef.latLngBounds(city.bounds.southWest, city.bounds.northEast);
    var boundedMinZoom = Math.max(city.minZoom, map.getBoundsZoom(bounds, true));
    map.setMinZoom(boundedMinZoom);
    map.setMaxZoom(city.maxZoom);
    map.setMaxBounds(bounds);
    map.fitBounds(bounds, { animate: false, padding: [16, 16] });
    map.setView(city.center, Math.max(city.zoom, boundedMinZoom), { animate: false });

    ensureTileLayer(city, boundedMinZoom);

    mapReady = true;
    setTimeout(function () {
      if (map) {
        map.invalidateSize(true);
      }
    }, 0);
  }

  function ensureTileLayer(city, minZoomValue) {
    var provider = TILE_PROVIDERS[activeTileProviderIndex];
    var failed = false;
    var loadedAnyTile = false;
    clearTimeout(ensureTileLayer._watchdogTimer);

    if (mapTiles) {
      map.removeLayer(mapTiles);
      mapTiles.off();
    }
    if (mapFallbackLayer) {
      map.removeLayer(mapFallbackLayer);
      mapFallbackLayer = null;
    }
    enableFallbackGridLayer(city, minZoomValue, true);

    mapTiles = LRef.tileLayer(provider.url, {
      subdomains: provider.subdomains,
      minZoom: minZoomValue,
      maxZoom: city.maxZoom,
      maxNativeZoom: city.maxZoom,
      updateWhenIdle: false,
      updateWhenZooming: true,
      keepBuffer: 8,
      attribution: provider.attribution
    });

    mapTiles.on('tileload', function () {
      loadedAnyTile = true;
      if (mapFallbackLayer) {
        map.removeLayer(mapFallbackLayer);
        mapFallbackLayer = null;
      }
    });

    mapTiles.on('tileerror', function () {
      if (failed) {
        return;
      }
      failed = true;
      if (activeTileProviderIndex < TILE_PROVIDERS.length - 1) {
        activeTileProviderIndex += 1;
        ensureTileLayer(city, minZoomValue);
      } else {
        enableFallbackGridLayer(city, minZoomValue, false);
      }
    });

    mapTiles.addTo(map);
    ensureTileLayer._watchdogTimer = setTimeout(function () {
      if (!loadedAnyTile && !mapFallbackLayer) {
        enableFallbackGridLayer(city, minZoomValue, false);
      }
    }, 3200);
  }

  function enableFallbackGridLayer(city, minZoomValue, silent) {
    if (!LRef || !map) {
      return;
    }
    if (mapFallbackLayer) {
      return;
    }

    mapFallbackLayer = LRef.gridLayer({
      minZoom: minZoomValue,
      maxZoom: city.maxZoom,
      tileSize: 256,
      attribution: 'Local fallback tiles'
    });

    mapFallbackLayer.createTile = function (coords) {
      var tile = document.createElement('canvas');
      tile.width = 256;
      tile.height = 256;
      var ctx = tile.getContext('2d');
      ctx.fillStyle = '#112131';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#1f3a53';
      ctx.lineWidth = 2;
      for (var i = 0; i <= 256; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
      }
      ctx.strokeStyle = '#315673';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 84);
      ctx.lineTo(256, 176);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(42, 0);
      ctx.lineTo(190, 256);
      ctx.stroke();
      ctx.fillStyle = 'rgba(215,235,255,0.74)';
      ctx.font = '12px sans-serif';
      ctx.fillText(city.name + ' fallback map', 10, 18);
      ctx.fillText('z' + coords.z + ' x' + coords.x + ' y' + coords.y, 10, 34);
      return tile;
    };

    mapFallbackLayer.addTo(map);
    if (!silent) {
      els.mapStatusText.textContent = 'Using fallback tactical map (tile service unavailable).';
    }
  }

  function prewarmMapTiles(city) {
    if (!window.Image) {
      return;
    }

    var provider = TILE_PROVIDERS[activeTileProviderIndex];
    var zoom = city.zoom;
    var centerTile = latLngToTile(city.center[0], city.center[1], zoom);
    var offsets = [-1, 0, 1];

    offsets.forEach(function (dx) {
      offsets.forEach(function (dy) {
        var x = centerTile.x + dx;
        var y = centerTile.y + dy;
        var sub = provider.subdomains[Math.abs(x + y) % provider.subdomains.length];
        var url = provider.url
          .replace('{s}', sub)
          .replace('{z}', String(zoom))
          .replace('{x}', String(x))
          .replace('{y}', String(y))
          .replace('{r}', '');
        var img = new Image();
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = url;
      });
    });
  }

  function latLngToTile(lat, lng, zoom) {
    var scale = Math.pow(2, zoom);
    var x = Math.floor(((lng + 180) / 360) * scale);
    var latRad = lat * Math.PI / 180;
    var y = Math.floor(((1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2) * scale);
    return { x: x, y: y };
  }

  function showStationPopup() {
    els.stationSetup.classList.remove('hidden');
    els.callActionPanel.classList.add('hidden');
    els.mapStatusText.textContent = 'Select starter engine number, then place your station.';
  }

  function renderStationSetupCard() {
    if (!currentCityProfile) {
      return;
    }

    els.deptSummary.innerHTML =
      '<strong>' + currentCityProfile.departmentName + ':</strong> ' +
      currentCityProfile.departmentDescription;
    els.starterEngineSpecs.textContent =
      'Starter Engine ' + selectedStarterEngineNumber +
      ' | Pump: 2,000 GPM | Tank: 500 gal | Core suppression + forcible entry';
    if (els.starterEngineInput) {
      els.starterEngineInput.value = String(selectedStarterEngineNumber || '');
    }
    if (els.stationBudget && session) {
      els.stationBudget.textContent = 'Budget: $' + session.player.credits.toLocaleString();
    }

    els.starterEngineChoices.innerHTML = currentCityProfile.engineNumbers.slice(0, 12).map(function (num) {
      var selected = num === selectedStarterEngineNumber;
      return '<button class="engine-choice' + (selected ? ' selected' : '') + '" data-engine-num="' + num + '">' +
        'Engine ' + num +
        '</button>';
    }).join('');

    els.starterEngineChoices.querySelectorAll('[data-engine-num]').forEach(function (button) {
      button.addEventListener('click', function () {
        selectedStarterEngineNumber = parseInt(button.getAttribute('data-engine-num'), 10);
        renderStationSetupCard();
      });
    });
  }

  function armPlacement() {
    if (!selectedStarterEngineNumber || selectedStarterEngineNumber < 1) {
      showToast('Enter a valid engine number first.');
      return;
    }
    if (session && session.config.mode === Sim.GameMode.BUILD && !session._starterStationPaid && session.player.credits < STARTER_STATION_COST) {
      showToast('Not enough money to build first station.');
      return;
    }
    placementArmed = true;
    els.mapStatusText.textContent = 'Placement armed: click map to place station.';
    showToast('Placement armed. Click map to place station.');
  }

  function onMapClick(latlng) {
    if (!session || !mapReady) {
      return;
    }

    if (placementArmed) {
      placeStation(latlng);
      return;
    }

    var nearestMission = findNearestMissionByLatLng(latlng);
    if (nearestMission && nearestMission.distanceMeters <= 200) {
      selectMission(nearestMission.mission.id);
      return;
    }
  }

  function placeStation(latlng) {
    if (session && session.config.mode === Sim.GameMode.BUILD && !session._starterStationPaid) {
      if (session.player.credits < STARTER_STATION_COST) {
        showToast('Need $' + STARTER_STATION_COST.toLocaleString() + ' to place station.');
        return;
      }
      session.player.credits -= STARTER_STATION_COST;
      session.player.ownedStations = Math.max(1, session.player.ownedStations);
      session._starterStationPaid = true;
    }

    stationLatLng = clampToCityBounds(latlng);
    placementArmed = false;
    stationPlaced = true;

    if (stationMarker) {
      stationMarker.remove();
    }

    stationMarker = LRef.marker(stationLatLng, {
      draggable: true,
      title: 'Player Station'
    }).addTo(map);

    stationMarker.on('dragend', function () {
      stationLatLng = clampToCityBounds(stationMarker.getLatLng());
      stationMarker.setLatLng(stationLatLng);
    });

    els.stationSetup.classList.add('hidden');
    els.mapStatusText.textContent = 'Station deployed. Waiting for first call...';

    if (session.config.mode === Sim.GameMode.BUILD) {
      applyStarterEngineSelectionToFleet();
      restrictFleetForBuildStart();
    }

    scheduleStarterCall();
  }

  function restrictFleetForBuildStart() {
    fleet.forEach(function (company) {
      company.available = company.id === ('E' + selectedStarterEngineNumber);
    });
  }

  function applyStarterEngineSelectionToFleet() {
    var chosen = parseInt(selectedStarterEngineNumber, 10);
    if (!isFinite(chosen) || chosen < 1) {
      return;
    }
    var starter = fleet.find(function (company) { return company.type === 'engine'; });
    if (!starter) {
      return;
    }
    starter.id = 'E' + chosen;
    starter.label = 'Engine ' + chosen;
    starter.crew = (starter.crew || []).map(function (crew, idx) {
      var suffix = ['CAP', 'LT', 'FF1', 'FF2', 'PRO'][idx] || ('FF' + (idx + 1));
      var rankTitle = crew.rank === 'captain' ? 'Captain' :
        (crew.rank === 'lieutenant' ? 'Lieutenant' :
        (crew.rank === 'proby' ? 'Proby' :
        (crew.rank === 'firefighter' ? 'Firefighter ' + (idx === 2 ? '1' : '2') : 'Crew')));
      return {
        id: starter.id + '-' + suffix,
        rank: crew.rank,
        name: starter.label + ' ' + rankTitle
      };
    });
  }

  function scheduleStarterCall() {
    clearTimeout(firstCallTimer);
    firstCallTimer = setTimeout(function () {
      if (!session || !stationPlaced) {
        return;
      }

      var mission = Sim.createMission(session);
      mission.title = 'Tree Down in Street';
      mission.initialCall.callerReport = 'Caller reports a tree fell in the roadway blocking traffic.';
      mission.initialCall.buildingType = 'Street Obstruction';
      mission.initialCall.hiddenRiskScore = 1;
      mission.severityScore = 1;
      mission.civiliansKnown = 0;
      mission.callCategory = 'minor_tree';
      mission.radio.push({ source: 'Dispatch', message: 'Initial assignment is a low-complexity call.', ts: new Date().toISOString() });
      mission.escalation = Sim.EscalationLevel.BLUE;
      selectedMissionId = mission.id;
      assignMissionLocation(mission, 800);
      showCallPanel(mission);
      els.mapStatusText.textContent = 'New call received. Click call dot and respond.';
      showToast('First call received: tree down in street.');
    }, TEST_CALL_INTERVAL_MS);
  }

  function scheduleFollowupCall() {
    clearTimeout(followupCallTimer);
    followupCallTimer = setTimeout(function () {
      if (!session || !stationPlaced) {
        return;
      }

      var unresolved = session.missions.some(function (mission) {
        return mission.status === Sim.MissionStatus.PENDING_DISPATCH ||
          mission.status === Sim.MissionStatus.UNITS_EN_ROUTE ||
          mission.status === Sim.MissionStatus.ON_SCENE;
      });

      if (unresolved) {
        scheduleFollowupCall();
        return;
      }

      var mission = Sim.createMission(session);
      mission.callCategory = 'generated';
      mission.radio.push({ source: 'Dispatch', message: 'Open-ended AI call generated from city telemetry.', ts: new Date().toISOString() });
      selectedMissionId = mission.id;
      assignMissionLocation(mission, 1600);
      showCallPanel(mission);
      els.mapStatusText.textContent = 'Generated call posted.';
      showToast('New generated call posted.');
    }, TEST_CALL_INTERVAL_MS);
  }

  function randomOffsetLatLng(origin, spreadMeters, rng) {
    var northMeters = (rng() - 0.5) * spreadMeters;
    var eastMeters = (rng() - 0.5) * spreadMeters;
    var lat = origin.lat + (northMeters / 110540);
    var lng = origin.lng + (eastMeters / (111320 * Math.cos(origin.lat * Math.PI / 180)));
    return clampToCityBounds({ lat: lat, lng: lng });
  }

  function clampToCityBounds(latLng) {
    if (!currentCityProfile || !currentCityProfile.bounds) {
      return latLng;
    }

    var sw = currentCityProfile.bounds.southWest;
    var ne = currentCityProfile.bounds.northEast;
    return {
      lat: Math.max(sw[0], Math.min(ne[0], latLng.lat)),
      lng: Math.max(sw[1], Math.min(ne[1], latLng.lng))
    };
  }

  function assignMissionLocation(mission, spreadMeters) {
    if (!stationLatLng) {
      return Promise.resolve();
    }

    var base = randomOffsetLatLng(stationLatLng, spreadMeters, session.rng);
    mission.mapLatLng = base;
    mission.sceneRoadPolylines = generateProceduralSceneRoads();
    mission.sceneOsmBuildings = [];
    return fetchSceneDataFromOsm(base, 620)
      .then(function (sceneData) {
        if (!sceneData.roads.length) {
          return;
        }
        var roads = sceneData.roads.slice(0, 96);
        var snapped = findNearestRoadPoint(base, roads.map(function (road) { return road.geometry; }));
        if (snapped) {
          mission.mapLatLng = clampToCityBounds(snapped);
        }
        mission.sceneRoadPolylines = buildSceneRoadsFromOsm(mission.mapLatLng, roads);
        mission.sceneOsmBuildings = buildSceneBuildingsFromOsm(mission.mapLatLng, sceneData.buildings.slice(0, MAX_OSM_BUILDINGS));
        mission.sceneAreaContext = sceneData.context || null;
        mission.sceneOsmTimestamp = sceneData.osmTimestamp || null;
        mission.sceneAreaUpdatedAt = sceneData.osmAreaUpdatedAt || null;
      })
      .catch(function () {
        // Keep procedural roads and fallback block generation if OSM lookup fails.
      })
      .finally(function () {
        addMissionMarker(mission);
        if (selectedMissionId === mission.id) {
          showCallPanel(mission);
          render();
        }
      });
  }

  function generateProceduralSceneRoads() {
    var centerX = 4.2;
    var centerZ = 1.4;
    var jitter = function (v) {
      return v + ((session.rng() - 0.5) * 0.9);
    };

    var roads = [
      [
        { x: -6, z: jitter(centerZ) },
        { x: 14, z: jitter(centerZ) }
      ],
      [
        { x: jitter(centerX), z: -5.8 },
        { x: jitter(centerX), z: 7.2 }
      ]
    ];

    if (session.rng() > 0.45) {
      roads.push([
        { x: -4.6, z: -3.6 },
        { x: centerX, z: centerZ },
        { x: 11.6, z: 5.8 }
      ]);
    }

    if (session.rng() > 0.6) {
      roads.push([
        { x: -5.8, z: 5.4 },
        { x: 12.8, z: -2.8 }
      ]);
    }

    return roads.map(function (line) {
      line.roadType = 'residential';
      line.roadWidth = roadWidthForType('residential');
      line.roadLanes = 2;
      line.roadOneWay = false;
      return line;
    });
  }

  function fetchSceneDataFromOsm(latLng, radiusMeters) {
    var key = [
      latLng.lat.toFixed(3),
      latLng.lng.toFixed(3),
      String(Math.round(radiusMeters))
    ].join(':');
    if (sceneDataCache[key]) {
      return Promise.resolve(sceneDataCache[key]);
    }

    var q =
      '[out:json][timeout:12];' +
      '(' +
      'way(around:' + Math.round(radiusMeters) + ',' + latLng.lat + ',' + latLng.lng + ')["highway"~"motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|living_street"];' +
      'way(around:' + Math.round(radiusMeters) + ',' + latLng.lat + ',' + latLng.lng + ')["building"];' +
      ');' +
      'out tags geom meta;';

    var url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q);
    return fetchWithTimeout(url, 8200)
      .then(function (res) {
        if (!res.ok) {
          throw new Error('overpass-http-' + res.status);
        }
        return res.json();
      })
      .then(function (json) {
        var elements = (json && json.elements) || [];
        var roads = [];
        var buildings = [];
        var areaNewestTsMs = 0;

        elements.forEach(function (el) {
          if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) {
            return;
          }
          var tags = el.tags || {};
          var geometry = el.geometry.map(function (pt) {
            return { lat: pt.lat, lng: pt.lon };
          });
          if (el.timestamp) {
            var stampMs = Date.parse(el.timestamp);
            if (isFinite(stampMs) && stampMs > areaNewestTsMs) {
              areaNewestTsMs = stampMs;
            }
          }
          if (tags.highway && geometry.length > 1) {
            var lanes = parseFloat(String(tags.lanes || '').replace(/[^\d.]/g, ''));
            var widthMeters = parseNumericMeters(tags.width);
            roads.push({
              geometry: geometry,
              highway: tags.highway,
              name: tags.name || '',
              lanes: isFinite(lanes) && lanes > 0 ? lanes : null,
              widthMeters: widthMeters > 0 ? widthMeters : null,
              oneWay: String(tags.oneway || '').toLowerCase() === 'yes',
              updatedAt: el.timestamp || null
            });
            return;
          }
          if (tags.building && geometry.length > 2) {
            buildings.push({
              geometry: geometry,
              tags: tags,
              updatedAt: el.timestamp || null
            });
          }
        });

        var payload = {
          roads: roads,
          buildings: buildings,
          osmTimestamp: (json && json.osm3s && json.osm3s.timestamp_osm_base) || null,
          osmAreaUpdatedAt: areaNewestTsMs ? new Date(areaNewestTsMs).toISOString() : null
        };
        payload.context = deriveAreaContextFromOsm(roads, buildings, radiusMeters);
        sceneDataCache[key] = payload;
        return payload;
      });
  }

  function deriveAreaContextFromOsm(roads, buildings, radiusMeters) {
    var byType = {};
    (roads || []).forEach(function (r) {
      var t = (r.highway || 'residential').toLowerCase();
      byType[t] = (byType[t] || 0) + 1;
    });
    var topRoadType = 'residential';
    Object.keys(byType).forEach(function (k) {
      if ((byType[k] || 0) > (byType[topRoadType] || 0)) {
        topRoadType = k;
      }
    });

    var area = Math.PI * Math.pow(Math.max(1, radiusMeters), 2);
    var bldDensity = ((buildings || []).length / area) * 1000000;
    var zone = 'urban';
    if (bldDensity < 90) {
      zone = 'suburban';
    }
    if (bldDensity < 35) {
      zone = 'rural';
    }
    return {
      zone: zone,
      dominantRoadType: topRoadType,
      buildingDensity: Math.round(bldDensity)
    };
  }

  function fetchWithTimeout(url, timeoutMs) {
    return Promise.race([
      fetch(url, { cache: 'force-cache' }),
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error('request-timeout'));
        }, timeoutMs);
      })
    ]);
  }

  function findNearestRoadPoint(point, roads) {
    var best = null;
    roads.forEach(function (line) {
      line.forEach(function (pt) {
        var d = latLngDistanceMeters(point, pt);
        if (!best || d < best.d) {
          best = { d: d, p: pt };
        }
      });
    });
    return best ? best.p : null;
  }

  function latLngDistanceMeters(a, b) {
    var dx = (a.lng - b.lng) * 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
    var dy = (a.lat - b.lat) * 110540;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function buildSceneRoadsFromOsm(origin, roads) {
    var scale = 1 / 7.5;
    var lines = roads.map(function (road) {
      var line = Array.isArray(road) ? road : road.geometry;
      return line.map(function (pt) {
        var dx = (pt.lng - origin.lng) * 111320 * Math.cos(origin.lat * Math.PI / 180);
        var dz = (pt.lat - origin.lat) * 110540;
        return {
          x: (dx * scale) + 4.2,
          z: (dz * scale) + 1.4
        };
      });
    }).map(function (sceneLine, idx) {
      var road = roads[idx];
      var roadType = Array.isArray(road) ? 'residential' : (road.highway || 'residential');
      sceneLine.roadType = roadType;
      if (Array.isArray(road)) {
        sceneLine.roadWidth = roadWidthForType(roadType);
        sceneLine.roadLanes = 2;
        sceneLine.roadOneWay = false;
      } else {
        sceneLine.roadWidth = roadWidthForWay(roadType, road.lanes, road.widthMeters);
        sceneLine.roadLanes = Math.max(1, Math.min(8, parseInt(road.lanes || 0, 10) || estimateLanesFromWidth(sceneLine.roadWidth)));
        sceneLine.roadOneWay = road.oneWay === true;
      }
      return sceneLine;
    }).filter(function (sceneLine) {
      return sceneLine.length >= 2;
    });
    return normalizeSceneRoadNetwork(lines);
  }

  function estimateLanesFromWidth(roadWidth) {
    if (roadWidth <= 0.9) {
      return 1;
    }
    if (roadWidth <= 1.35) {
      return 2;
    }
    if (roadWidth <= 1.9) {
      return 3;
    }
    return 4;
  }

  function normalizeSceneRoadNetwork(lines) {
    var normalized = (lines || []).map(function (line) {
      return simplifyRoadPolyline(line);
    }).filter(function (line) {
      return line && line.length >= 2 && roadPolylineLength(line) >= 0.9;
    });

    normalized.sort(function (a, b) {
      var wa = a.roadWidth || 0;
      var wb = b.roadWidth || 0;
      if (wb !== wa) {
        return wb - wa;
      }
      return roadPolylineLength(b) - roadPolylineLength(a);
    });

    var accepted = [];
    normalized.forEach(function (line) {
      if (isRoadLineDuplicate(line, accepted)) {
        return;
      }
      accepted.push(line);
    });
    return accepted;
  }

  function simplifyRoadPolyline(line) {
    if (!line || line.length < 2) {
      return null;
    }
    var out = [];
    line.forEach(function (pt) {
      if (!isFinite(pt.x) || !isFinite(pt.z)) {
        return;
      }
      var prev = out[out.length - 1];
      if (prev && Math.abs(prev.x - pt.x) < 0.02 && Math.abs(prev.z - pt.z) < 0.02) {
        return;
      }
      out.push({ x: pt.x, z: pt.z });
    });
    if (out.length < 2) {
      return null;
    }
    out.roadType = line.roadType || 'residential';
    out.roadWidth = line.roadWidth || roadWidthForType(out.roadType);
    out.roadLanes = line.roadLanes || estimateLanesFromWidth(out.roadWidth);
    out.roadOneWay = !!line.roadOneWay;
    return out;
  }

  function roadPolylineLength(line) {
    var len = 0;
    for (var i = 1; i < line.length; i++) {
      var dx = line[i].x - line[i - 1].x;
      var dz = line[i].z - line[i - 1].z;
      len += Math.sqrt((dx * dx) + (dz * dz));
    }
    return len;
  }

  function isRoadLineDuplicate(line, accepted) {
    var lineLen = roadPolylineLength(line);
    if (lineLen < 0.9) {
      return true;
    }
    var head = lineHeading(line);
    var widthA = line.roadWidth || roadWidthForType(line.roadType || 'residential');
    return accepted.some(function (other) {
      var lenRatio = Math.min(lineLen, roadPolylineLength(other)) / Math.max(lineLen, roadPolylineLength(other));
      if (lenRatio < 0.54) {
        return false;
      }
      var headB = lineHeading(other);
      var diff = Math.abs(Math.atan2(Math.sin(head - headB), Math.cos(head - headB)));
      if (!(diff < 0.18 || Math.abs(diff - Math.PI) < 0.18)) {
        return false;
      }
      var widthB = other.roadWidth || roadWidthForType(other.roadType || 'residential');
      var avgDist = averagePolylineDistance(line, other, 6);
      var dupThreshold = Math.max(0.14, Math.min(0.52, Math.max(widthA, widthB) * 0.34));
      return avgDist < dupThreshold;
    });
  }

  function lineHeading(line) {
    if (!line || line.length < 2) {
      return 0;
    }
    var a = line[0];
    var b = line[line.length - 1];
    return Math.atan2(b.z - a.z, b.x - a.x);
  }

  function averagePolylineDistance(a, b, samplesPerPolyline) {
    var samples = Math.max(3, samplesPerPolyline || 5);
    var total = 0;
    var count = 0;
    [a, b].forEach(function (line, idx) {
      for (var i = 0; i <= samples; i++) {
        var t = i / samples;
        var p = interpolatePolylinePoint(line, t);
        if (!p) {
          continue;
        }
        var ref = idx === 0 ? b : a;
        total += distancePointToPolyline(p.x, p.z, ref);
        count += 1;
      }
    });
    return count ? (total / count) : Infinity;
  }

  function interpolatePolylinePoint(line, t) {
    if (!line || line.length < 2) {
      return null;
    }
    var target = Math.max(0, Math.min(1, t)) * roadPolylineLength(line);
    if (target <= 0) {
      return { x: line[0].x, z: line[0].z };
    }
    var walked = 0;
    for (var i = 1; i < line.length; i++) {
      var a = line[i - 1];
      var b = line[i];
      var dx = b.x - a.x;
      var dz = b.z - a.z;
      var segLen = Math.sqrt((dx * dx) + (dz * dz));
      if (walked + segLen >= target) {
        var local = (target - walked) / Math.max(0.0001, segLen);
        return {
          x: a.x + (dx * local),
          z: a.z + (dz * local)
        };
      }
      walked += segLen;
    }
    var last = line[line.length - 1];
    return { x: last.x, z: last.z };
  }

  function distancePointToPolyline(px, pz, line) {
    if (!line || line.length < 2) {
      return Infinity;
    }
    var best = Infinity;
    for (var i = 1; i < line.length; i++) {
      var a = line[i - 1];
      var b = line[i];
      var d = distancePointToSegment(px, pz, a.x, a.z, b.x, b.z);
      if (d < best) {
        best = d;
      }
    }
    return best;
  }

  function buildSceneBuildingsFromOsm(origin, buildings) {
    var scale = 1 / 7.5;
    var heightContext = deriveOsmHeightContext(buildings);
    return buildings.map(function (building) {
      var pts = building.geometry.map(function (pt) {
        var dx = (pt.lng - origin.lng) * 111320 * Math.cos(origin.lat * Math.PI / 180);
        var dz = (pt.lat - origin.lat) * 110540;
        return {
          x: (dx * scale) + 4.2,
          z: (dz * scale) + 1.4
        };
      });

      var minX = Infinity;
      var maxX = -Infinity;
      var minZ = Infinity;
      var maxZ = -Infinity;
      pts.forEach(function (p) {
        if (p.x < minX) {
          minX = p.x;
        }
        if (p.x > maxX) {
          maxX = p.x;
        }
        if (p.z < minZ) {
          minZ = p.z;
        }
        if (p.z > maxZ) {
          maxZ = p.z;
        }
      });

      var w = maxX - minX;
      var d = maxZ - minZ;
      if (w < 0.18 || d < 0.18 || w > 22 || d > 22) {
        return null;
      }

      var heightMeters = estimateOsmBuildingHeightMeters(building.tags || {}, heightContext, w * d);
      var h = Math.max(1.15, Math.min(6.1, heightMeters * scale * 0.92));
      var cx = (minX + maxX) / 2;
      var cz = (minZ + maxZ) / 2;
      return {
        x: minX,
        y: minZ,
        w: w,
        d: d,
        h: h,
        onFire: false,
        source: 'osm',
        footprint: pts,
        centerX: cx,
        centerZ: cz
      };
    }).filter(Boolean);
  }

  function deriveOsmHeightContext(buildings) {
    var samples = [];
    buildings.forEach(function (building) {
      var tags = building.tags || {};
      var height = parseNumericMeters(tags.height);
      if (height > 1.5) {
        samples.push(Math.min(95, height));
        return;
      }
      var levels = parseNumericMeters(tags['building:levels']);
      if (levels > 0) {
        samples.push(Math.min(95, (levels * 3.2) + 1.4));
      }
    });

    if (!samples.length) {
      return {
        median: 15.5,
        lower: 11.5,
        upper: 22.5
      };
    }

    samples.sort(function (a, b) { return a - b; });
    var median = samples[Math.floor(samples.length / 2)];
    var lower = samples[Math.floor(samples.length * 0.25)];
    var upper = samples[Math.floor(samples.length * 0.75)];
    return {
      median: median,
      lower: lower,
      upper: upper
    };
  }

  function estimateOsmBuildingHeightMeters(tags, context, footprintArea) {
    var explicitHeight = parseNumericMeters(tags.height);
    if (explicitHeight > 0) {
      return explicitHeight;
    }

    var levels = parseNumericMeters(tags['building:levels']);
    if (levels > 0) {
      return (levels * 3.2) + 1.6;
    }

    var type = (tags.building || '').toLowerCase();
    if (type === 'house' || type === 'detached' || type === 'residential') {
      return 10;
    }
    if (type === 'commercial' || type === 'retail' || type === 'office' || type === 'apartments') {
      return 22;
    }
    if (type === 'industrial' || type === 'warehouse') {
      return 14;
    }
    var areaHint = footprintArea || 0;
    if (areaHint > 7.5) {
      return Math.max(context.median, context.upper);
    }
    if (areaHint < 3.2) {
      return context.lower;
    }
    return context.median;
  }

  function parseNumericMeters(value) {
    if (value == null) {
      return 0;
    }
    var m = String(value).match(/(\d+(\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }

  function roadWidthForType(roadType) {
    var t = (roadType || '').toLowerCase();
    if (t === 'motorway') {
      return 1.9;
    }
    if (t === 'trunk') {
      return 1.55;
    }
    if (t === 'primary') {
      return 1.25;
    }
    if (t === 'secondary') {
      return 1.08;
    }
    if (t === 'tertiary') {
      return 0.94;
    }
    if (t === 'service') {
      return 0.56;
    }
    if (t === 'living_street') {
      return 0.5;
    }
    return 0.82;
  }

  function roadWidthForWay(roadType, lanes, widthMeters) {
    var base = roadWidthForType(roadType);
    if (widthMeters && widthMeters > 2) {
      return Math.max(0.46, Math.min(2.4, widthMeters / 7.5));
    }
    if (lanes && lanes >= 1) {
      return Math.max(0.5, Math.min(2.4, (lanes * 3.15) / 7.5));
    }
    return base;
  }

  function clearMissionMarkers() {
    Object.keys(mapMarkersByMission).forEach(function (id) {
      mapMarkersByMission[id].remove();
    });
    mapMarkersByMission = {};
  }

  function missionColor(mission) {
    var severity = mission.severityScore;
    if (severity <= 2) {
      return '#4aa4ff';
    }
    if (severity <= 5) {
      return '#f0c84f';
    }
    return '#ff4256';
  }

  function addMissionMarker(mission) {
    if (!mapReady || !mission.mapLatLng) {
      return;
    }

    var marker = mapMarkersByMission[mission.id];
    if (!marker) {
      marker = LRef.circleMarker(mission.mapLatLng, {
        radius: mission.id === selectedMissionId ? 11 : 8,
        color: '#0b1520',
        weight: 1,
        fillColor: missionColor(mission),
        fillOpacity: 0.9
      }).addTo(map);

      marker.on('click', function () {
        selectMission(mission.id);
      });

      mapMarkersByMission[mission.id] = marker;
    } else {
      marker.setLatLng(mission.mapLatLng);
      marker.setStyle({
        radius: mission.id === selectedMissionId ? 11 : 8,
        fillColor: missionColor(mission),
        fillOpacity: mission.status === Sim.MissionStatus.RESOLVED ? 0.35 : 0.92
      });
    }
  }

  function refreshMissionMarkers() {
    if (!mapReady) {
      return;
    }

    session.missions.forEach(function (mission) {
      if (!mission.mapLatLng) {
        mission.mapLatLng = randomOffsetLatLng(stationLatLng, 1200, session.rng);
      }

      addMissionMarker(mission);
      var marker = mapMarkersByMission[mission.id];
      marker.setStyle({
        radius: mission.id === selectedMissionId ? 11 : 8,
        fillColor: missionColor(mission),
        fillOpacity: mission.status === Sim.MissionStatus.RESOLVED ? 0.35 : 0.92
      });
    });
  }

  function findNearestMissionByLatLng(latlng) {
    var best = null;
    session.missions.forEach(function (mission) {
      if (!mission.mapLatLng || mission.status === Sim.MissionStatus.RESOLVED) {
        return;
      }

      var dx = mission.mapLatLng.lat - latlng.lat;
      var dy = mission.mapLatLng.lng - latlng.lng;
      var meters = Math.sqrt(dx * dx + dy * dy) * 111000;
      if (!best || meters < best.distanceMeters) {
        best = { mission: mission, distanceMeters: meters };
      }
    });

    return best;
  }

  function selectMission(missionId) {
    var mission = session.missions.find(function (m) { return m.id === missionId; });
    if (!mission) {
      return;
    }

    selectedMissionId = mission.id;
    Sim.focusMission(session, mission.id);
    session.view = Sim.SessionView.MAP_2D;

    if (mission.status === Sim.MissionStatus.PENDING_DISPATCH) {
      showCallPanel(mission);
    } else {
      els.callActionPanel.classList.add('hidden');
    }

    refreshMissionMarkers();
    render();
  }

  function showCallPanel(mission) {
    companySelections = {};

    els.callActionPanel.classList.remove('hidden');
    els.callPanelSummary.innerHTML =
      '<strong>Call #' + mission.id + '</strong> | ' + mission.initialCall.buildingType +
      '<br>' + mission.initialCall.callerReport +
      '<br>Complexity: ' + mission.severityScore;

    var availableCompanies = fleet.filter(function (company) { return company.available; });
    els.companySelection.innerHTML = availableCompanies.map(function (company) {
      return '<label class="company-row">' +
        '<input type="checkbox" data-company-id="' + company.id + '">' +
        '<span><strong>' + company.label + '</strong><br>' +
        company.crew[0].name + ' + crew</span>' +
        '</label>';
    }).join('') || '<div class="company-row">No units available.</div>';

    var defaults = autoSelectDefaultCompanies(mission, availableCompanies);
    defaults.forEach(function (id) {
      companySelections[id] = true;
      var checkbox = els.companySelection.querySelector('input[data-company-id="' + id + '"]');
      if (checkbox) {
        checkbox.checked = true;
      }
    });

    els.companySelection.querySelectorAll('input[data-company-id]').forEach(function (input) {
      input.addEventListener('change', function () {
        companySelections[input.getAttribute('data-company-id')] = input.checked;
      });
    });
  }

  function autoSelectDefaultCompanies(mission, availableCompanies) {
    if (mission.callCategory === 'minor_tree') {
      return availableCompanies.filter(function (company) {
        return company.type === 'engine';
      }).slice(0, 1).map(function (company) { return company.id; });
    }

    var picks = [];
    availableCompanies.some(function (company) {
      if (company.type === 'engine') {
        picks.push(company.id);
        return true;
      }
      return false;
    });
    availableCompanies.some(function (company) {
      if (company.type === 'ladder') {
        picks.push(company.id);
        return true;
      }
      return false;
    });
    return picks;
  }

  function buildDispatchPlanFromSelection() {
    var selectedCompanies = fleet.filter(function (company) {
      return companySelections[company.id];
    });

    if (!selectedCompanies.length) {
      return [];
    }

    return selectedCompanies.map(function (company) {
      return {
        type: company.simUnitType,
        count: 1,
        label: company.label,
        companyId: company.id
      };
    });
  }

  function respondToSelectedMission() {
    var mission = getSelectedMission();
    if (!mission) {
      showToast('No call selected.');
      return;
    }

    var plan = buildDispatchPlanFromSelection();
    if (!plan.length) {
      showToast('Select at least one unit company.');
      return;
    }

    var response = Sim.dispatchMission(session, mission.id, plan);
    if (!response.ok) {
      showToast(response.reason);
      return;
    }

    plan.forEach(function (item) {
      var company = fleet.find(function (c) { return c.id === item.companyId; });
      if (company) {
        company.available = false;
      }
    });

    mission.assignedCompanyIds = plan.map(function (x) { return x.companyId; });
    mission.assignedCrew = [];
    mission.assignedCompanyIds.forEach(function (companyId) {
      var company = fleet.find(function (c) { return c.id === companyId; });
      if (company) {
        company.crew.forEach(function (crew) {
          mission.assignedCrew.push({
            id: crew.id,
            name: crew.name,
            rank: crew.rank,
            companyId: company.id,
            companyLabel: company.label
          });
        });
      }
    });

    mission.loadingPacket = createLoadingPacket(mission);
    els.callActionPanel.classList.add('hidden');
    showToast('Dispatch acknowledged.');
    render();
  }

  function getSelectedMission() {
    if (!session || selectedMissionId == null) {
      return null;
    }
    return session.missions.find(function (mission) { return mission.id === selectedMissionId; }) || null;
  }

  function createLoadingPacket(mission) {
    var wind = [
      'Light SW 6 mph | Temp 44F | Visibility 5.8 mi',
      'Gusty NW 12 mph | Temp 37F | Visibility 3.9 mi',
      'Calm air | Temp 51F | Visibility 7.2 mi',
      'Steady E 8 mph | Temp 42F | Visibility 6.4 mi'
    ];
    var occupancy = [
      'Estimated occupancy: 2 | Night profile: residential',
      'Estimated occupancy: 8 | Mixed-use occupancy flag present',
      'Estimated occupancy: unknown | Caller reports voices from upper floor'
    ];
    var preplan = [
      'Preplan B-17 | Standpipe: none | Knox entry noted',
      'Preplan R-4 | Legacy wiring advisory | Recent violation history',
      'Preplan MX-8 | Sprinkler unknown | Rear alley access narrow'
    ];
    var tactic = [
      'Primary: life hazard sweep | Secondary: confine, hold hallway',
      'Primary: confine and extinguish | Secondary: utility control',
      'Primary: block/traffic safety | Secondary: hazard scan and exposure line'
    ];
    var hydrantA = 120 + Math.floor(session.rng() * 95);
    var hydrantB = 190 + Math.floor(session.rng() * 160);
    var flowA = 980 + Math.floor(session.rng() * 640);
    var flowB = 820 + Math.floor(session.rng() * 580);
    var confidence = 40 + Math.floor(session.rng() * 55);
    var areaContext = mission.sceneAreaContext ?
      ('Area: ' + mission.sceneAreaContext.zone + ' | Dominant road: ' + mission.sceneAreaContext.dominantRoadType + ' | Density idx: ' + mission.sceneAreaContext.buildingDensity) :
      'Area: deriving from map telemetry';
    var areaUpdatedNote = mission.sceneAreaUpdatedAt ?
      ('Area features updated: ' + formatOsmTimestamp(mission.sceneAreaUpdatedAt)) :
      'Area features updated: unknown';
    var osmTimestampNote = mission.sceneOsmTimestamp ?
      ('OSM data timestamp: ' + formatOsmTimestamp(mission.sceneOsmTimestamp)) :
      'OSM data timestamp: unavailable';

    return {
      weather: pickArray(wind),
      hydrants: 'Hydrants: ' + hydrantA + ' ft @ est ' + flowA + ' GPM | ' + hydrantB + ' ft @ est ' + flowB + ' GPM',
      occupancy: pickArray(occupancy),
      preplan: pickArray(preplan),
      tactical: pickArray(tactic),
      notes: areaContext + ' | ' + areaUpdatedNote + ' | ' + osmTimestampNote + ' | Caller confidence: ' + confidence + '% | CAD confidence class: ' + (confidence > 72 ? 'A' : (confidence > 56 ? 'B' : 'C'))
    };
  }

  function formatOsmTimestamp(isoTs) {
    var dt = new Date(isoTs);
    if (!isFinite(dt.getTime())) {
      return String(isoTs);
    }
    return dt.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function pickArray(arr) {
    return arr[Math.floor(session.rng() * arr.length)];
  }

  function getRankAsset(rank) {
    if (Assets && Assets.firefighters && Assets.firefighters[rank]) {
      return Assets.firefighters[rank];
    }
    return {
      rank: rank,
      speedMultiplier: rank === 'captain' ? 0.95 : (rank === 'proby' ? 0.8 : 1.05),
      color: rank === 'captain' ? 0xffde62 : (rank === 'lieutenant' ? 0x96bcff : (rank === 'proby' ? 0x7ad39f : 0xd8e7f7))
    };
  }

  function getTruckAsset(type) {
    if (Assets && Assets.trucks && Assets.trucks[type]) {
      return Assets.trucks[type];
    }
    return null;
  }

  function getDepartmentApparatusProfile() {
    var cityKey = (currentCityProfile && currentCityProfile.key) || 'nyc';
    var profiles = {
      nyc: {
        department: 'FDNY',
        warningSystem: 'rotary',
        livery: {
          engine: { main: 0xc61b2e, trim: 0xf6df9a },
          ladder: { main: 0xbc1428, trim: 0xf4dc96 },
          ambulance: { main: 0xf2f4f7, trim: 0xbc1428 }
        }
      },
      london: {
        department: 'LFB',
        warningSystem: 'led_blue',
        livery: {
          engine: { main: 0xc1171f, trim: 0xf7f7f7 },
          ladder: { main: 0xbe2028, trim: 0xf6f6f6 },
          ambulance: { main: 0xf0f2f5, trim: 0x0b5ea8 }
        }
      },
      tokyo: {
        department: 'TFD',
        warningSystem: 'led_red',
        livery: {
          engine: { main: 0xb81a25, trim: 0xf2f2f2 },
          ladder: { main: 0xb21924, trim: 0xf2f2f2 },
          ambulance: { main: 0xf5f7fa, trim: 0x0b4f90 }
        }
      },
      paris: {
        department: 'BSPP',
        warningSystem: 'led_blue',
        livery: {
          engine: { main: 0xb51b2b, trim: 0xf0e8c7 },
          ladder: { main: 0xaf1525, trim: 0xf0e8c7 },
          ambulance: { main: 0xf2f4f7, trim: 0x835d8d }
        }
      },
      sydney: {
        department: 'FRNSW',
        warningSystem: 'led_red',
        livery: {
          engine: { main: 0xc1251d, trim: 0xf0efe6 },
          ladder: { main: 0xbf271f, trim: 0xefeee3 },
          ambulance: { main: 0xf5f6f8, trim: 0xba1e1a }
        }
      }
    };

    return profiles[cityKey] || profiles.nyc;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll('\'', '&#39;');
  }

  function createFleet(mode, stationCount, cityProfile) {
    var engines = cityProfile.engineNumbers || [312, 271, 73, 157, 44, 28];
    var ladders = cityProfile.ladderNumbers || [154, 120, 103, 12, 40, 24];
    var ambulances = [71, 45, 18, 9, 63, 88, 15, 31];

    var maxCompanies = mode === Sim.GameMode.DISPATCHER ? Math.min(stationCount, 24) : 6;
    var companies = [];

    for (var i = 0; i < maxCompanies; i++) {
      var engineNo = engines[i % engines.length];
      companies.push(createCompany('E' + engineNo, 'engine', 'Engine ' + engineNo, Sim.UnitType.ENGINE));

      if (i < ladders.length) {
        var ladderNo = ladders[i];
        companies.push(createCompany('L' + ladderNo, 'ladder', 'Ladder ' + ladderNo, Sim.UnitType.LADDER));
      }

      if (i < ambulances.length) {
        var ambNo = ambulances[i];
        companies.push(createCompany('A' + ambNo, 'ambulance', 'Ambulance ' + ambNo, Sim.UnitType.AMBULANCE));
      }
    }

    return dedupeById(companies);
  }

  function createCompany(id, type, label, simUnitType) {
    var crew = [];

    if (type === 'ambulance') {
      crew.push({ id: id + '-EMS-1', name: label + ' Paramedic', rank: 'ems' });
      crew.push({ id: id + '-EMS-2', name: label + ' EMT', rank: 'ems' });
    } else {
      crew.push({ id: id + '-CAP', name: label + ' Captain', rank: 'captain' });
      crew.push({ id: id + '-LT', name: label + ' Lieutenant', rank: 'lieutenant' });
      crew.push({ id: id + '-FF1', name: label + ' Firefighter 1', rank: 'firefighter' });
      crew.push({ id: id + '-FF2', name: label + ' Firefighter 2', rank: 'firefighter' });
      crew.push({ id: id + '-PRO', name: label + ' Proby', rank: 'proby' });
    }

    return {
      id: id,
      type: type,
      label: label,
      simUnitType: simUnitType,
      available: true,
      crew: crew
    };
  }

  function dedupeById(items) {
    var seen = {};
    return items.filter(function (item) {
      if (seen[item.id]) {
        return false;
      }
      seen[item.id] = true;
      return true;
    });
  }

  function renderPlayerSummary() {
    if (!session) {
      els.playerSummary.innerHTML = '';
      return;
    }

    var modeLabel = session.config.mode === Sim.GameMode.BUILD ? 'Build Mode' : 'Dispatcher Mode';
    var available = fleet.filter(function (c) { return c.available; }).length;

    els.playerSummary.innerHTML =
      'City: <strong>' + session.config.cityName + '</strong><br>' +
      'Mode: <strong>' + modeLabel + '</strong><br>' +
      'Stations: <strong>' + session.player.ownedStations + '</strong> | Units ready: <strong>' + available + '</strong> | Credits: <strong>$' + session.player.credits.toLocaleString() + '</strong>';
  }

  function setScreen(view) {
    if (view !== Sim.SessionView.SCENE_3D) {
      clearHeldCameraKeys();
    }
    els.menuScreen.classList.toggle('hidden', view !== Sim.SessionView.MENU);
    els.mapScreen.classList.toggle('hidden', view !== Sim.SessionView.MAP_2D);
    els.loadingScreen.classList.toggle('hidden', view !== Sim.SessionView.LOADING_3D);
    els.sceneScreen.classList.toggle('hidden', view !== Sim.SessionView.SCENE_3D);

    if (view === Sim.SessionView.MAP_2D && map) {
      setTimeout(function () {
        map.invalidateSize(true);
      }, 0);
    }

    if (view === Sim.SessionView.SCENE_3D) {
      setTimeout(function () {
        ensureThreeSize();
      }, 0);
    }
  }

  function clearHeldCameraKeys() {
    Object.keys(heldKeys).forEach(function (key) {
      heldKeys[key] = false;
    });
  }

  function renderMap() {
    if (!session) {
      return;
    }

    refreshMissionMarkers();
    renderIncidentFeed();

    if (!stationPlaced) {
      els.mapStatusText.textContent = placementArmed ?
        'Placement armed: click map to place station.' :
        'Click Begin Placement to deploy station.';
    }
  }

  function renderIncidentFeed() {
    var unresolved = session.missions.filter(function (mission) {
      return mission.status !== Sim.MissionStatus.RESOLVED;
    });

    if (!unresolved.length) {
      els.incidentFeed.innerHTML = '<div class="incident-item">No active incidents.</div>';
      return;
    }

    els.incidentFeed.innerHTML = unresolved.slice(-12).reverse().map(function (mission) {
      var active = mission.id === selectedMissionId ? ' active' : '';
      return '<button class="incident-item' + active + '" data-feed-mission="' + mission.id + '">' +
        '<strong>Call #' + mission.id + '</strong> - ' + mission.initialCall.buildingType +
        '<br>Status: ' + mission.status.replaceAll('_', ' ') +
        '<br>' + mission.initialCall.callerReport +
        '</button>';
    }).join('');

    els.incidentFeed.querySelectorAll('[data-feed-mission]').forEach(function (button) {
      button.addEventListener('click', function () {
        selectMission(parseInt(button.getAttribute('data-feed-mission'), 10));
      });
    });
  }

  function renderLoading() {
    var mission = Sim.getFocusedMission(session);
    if (!mission) {
      return;
    }

    var packet = mission.loadingPacket || createLoadingPacket(mission);
    mission.loadingPacket = packet;

    els.loadingBuilding.textContent = 'Building/Type: ' + mission.initialCall.buildingType + ' @ ' + mission.initialCall.addressHint;
    els.loadingCaller.textContent = 'Caller transcript: ' + mission.initialCall.callerReport;
    els.loadingEta.textContent = 'ETA to scene: ' + Math.max(0, mission.arrivalEtaSec) + ' sec';
    els.loadingWeather.textContent = 'Weather: ' + packet.weather;
    els.loadingHydrants.textContent = packet.hydrants;
    els.loadingOccupancy.textContent = packet.occupancy;
    els.loadingPreplan.textContent = packet.preplan;
    els.loadingTactical.textContent = packet.tactical + ' | ' + packet.notes;

    prewarmSceneDuringLoading(mission);
  }

  function prewarmSceneDuringLoading(mission) {
    if (!mission) {
      return;
    }
    if (!mission._prewarmStarted) {
      mission._prewarmStarted = true;
      mission._prewarmFrames = 0;
    }

    initThreeScene();
    ensureMissionSceneState(mission);
    applyHeldSceneCameraInput(mission.sceneState, 1 / 60);

    if (FORCE_TOPDOWN_SCENE) {
      initFallbackScene2d();
      renderSceneFallback2d(mission, performance.now() / 1000);
      return;
    }

    if (threeState) {
      ensureThreeMissionObjects(mission);
      mission._prewarmFrames += 1;
      if (mission._prewarmFrames < 2) {
        renderThreeScene(mission, performance.now() / 1000);
      }
    } else {
      initFallbackScene2d();
      renderSceneFallback2d(mission, performance.now() / 1000);
    }
  }

  function ensureMissionSceneState(mission) {
    if (mission.sceneState) {
      return;
    }

    var companies = mission.assignedCompanyIds || [];
    var sceneCompanies = [];
    var laneY = 0;

    companies.forEach(function (companyId, idx) {
      var company = fleet.find(function (x) { return x.id === companyId; });
      if (!company) {
        return;
      }

      sceneCompanies.push({
        id: company.id,
        label: company.label,
        type: company.type,
        x: -7 + idx * 3.2,
        y: laneY + (idx % 2) * 2,
        z: 0,
        targetX: -1 + idx * 2.8,
        targetY: laneY + (idx % 2) * 2,
        arrivalProgress: 0,
        heading: 0,
        compartments: compartmentLayoutForType(company.type)
      });
    });

    var firefighters = [];
    (mission.assignedCrew || []).forEach(function (crew, idx) {
      var homeCompany = sceneCompanies.find(function (company) { return company.id === crew.companyId; }) || sceneCompanies[0];
      var baseX = homeCompany ? homeCompany.targetX : -1;
      var baseY = homeCompany ? homeCompany.targetY : 0;
      firefighters.push({
        id: crew.id,
        name: crew.name,
        rank: crew.rank,
        companyId: crew.companyId,
        x: baseX + (idx % 3) * 0.34,
        y: baseY + 1.2 + Math.floor(idx / 3) * 0.3,
        targetX: null,
        targetY: null,
        pendingAction: null,
        selected: false,
        heading: 0,
        walkPhase: session.rng() * Math.PI
      });
    });

    var roadPolylines = mission.sceneRoadPolylines && mission.sceneRoadPolylines.length ? mission.sceneRoadPolylines : generateProceduralSceneRoads();
    var sceneLayout = generateSceneLayoutFromRoads(roadPolylines, mission.callCategory, mission.sceneOsmBuildings || []);
    assignCompanyStaging(sceneCompanies, roadPolylines, sceneLayout);
    seedFirefightersNearCompanies(firefighters, sceneCompanies);
    var hydrantPoint = deriveHydrantPoint(roadPolylines, sceneLayout.bounds);

    mission.sceneState = {
      companies: sceneCompanies,
      firefighters: firefighters,
      parkedCars: sceneLayout.parkedCars,
      buildings: sceneLayout.buildings,
      trees: sceneLayout.trees,
      roadPolylines: roadPolylines,
      groundMinX: sceneLayout.bounds.minX,
      groundMaxX: sceneLayout.bounds.maxX,
      groundMinY: sceneLayout.bounds.minZ,
      groundMaxY: sceneLayout.bounds.maxZ,
      selectedFirefighterId: null,
      selectedCompartment: null,
      cameraTween: 0,
      cameraZoomIn: true,
      cameraOrbit: 0,
      cameraDistanceScale: 0.62,
      cameraForwardVel: 0,
      cameraStrafeVel: 0,
      cameraTurnVel: 0,
      staticColliders: [],
      truckColliders: [],
      firefighterColliders: [],
      focusPoint: sceneLayout.defaultFocus,
      hydrantPoint: hydrantPoint
    };
    mission.sceneState.staticColliders = buildStaticSceneColliders(mission.sceneState);
    refreshDynamicSceneColliders(mission.sceneState);

    var fireBuilding = mission.sceneState.buildings.find(function (b) { return b.onFire; }) || mission.sceneState.buildings[0];
    if (fireBuilding) {
      mission.sceneState.focusPoint = {
        x: fireBuilding.x + (fireBuilding.w * 0.45),
        y: Math.min(2.1, fireBuilding.h * 0.42),
        z: fireBuilding.y + (fireBuilding.d * 0.35)
      };
    }
  }

  function assignCompanyStaging(sceneCompanies, roadPolylines, sceneLayout) {
    if (!sceneCompanies || !sceneCompanies.length) {
      return;
    }
    var segments = collectRoadSegments(roadPolylines || []).slice().sort(function (a, b) { return b.len - a.len; });
    if (!segments.length) {
      return;
    }
    var seg = segments[0];
    var nx = -seg.dz / seg.len;
    var nz = seg.dx / seg.len;
    var roadHalf = (seg.roadWidth || 2.2) * 0.5;
    var parkOffset = roadHalf + 0.52;
    var heading = Math.atan2(seg.dz, seg.dx);
    var bounds = sceneLayout && sceneLayout.bounds ? sceneLayout.bounds : { minX: -6, maxX: 14, minZ: -5, maxZ: 7 };

    sceneCompanies.forEach(function (company, idx) {
      var t = Math.min(0.9, 0.26 + (idx * 0.14));
      var baseX = seg.a.x + (seg.dx * t);
      var baseZ = seg.a.z + (seg.dz * t);
      var side = (idx % 2 === 0) ? 1 : -1;
      var cx = baseX + (nx * parkOffset * side);
      var cz = baseZ + (nz * parkOffset * side);
      cx = Math.max(bounds.minX + 0.9, Math.min(bounds.maxX - 0.9, cx));
      cz = Math.max(bounds.minZ + 0.9, Math.min(bounds.maxZ - 0.9, cz));

      company.x = cx - 0.28;
      company.y = cz - 0.14;
      company.targetX = company.x;
      company.targetY = company.y;
      company.arrivalProgress = 1;
      company.heading = side === 1 ? heading + Math.PI : heading;
    });
  }

  function seedFirefightersNearCompanies(firefighters, sceneCompanies) {
    var indexByCompany = {};
    (firefighters || []).forEach(function (ff) {
      var company = (sceneCompanies || []).find(function (entry) { return entry.id === ff.companyId; }) || sceneCompanies[0];
      if (!company) {
        return;
      }
      var idx = indexByCompany[company.id] || 0;
      indexByCompany[company.id] = idx + 1;
      var row = Math.floor(idx / 3);
      var col = idx % 3;
      ff.x = company.targetX + 0.08 + (col * 0.16);
      ff.y = company.targetY + 0.38 + (row * 0.14);
    });
  }

  function generateSceneLayoutFromRoads(roadPolylines, callCategory, osmBuildings) {
    var bounds = getRoadBounds(roadPolylines);
    var segments = collectRoadSegments(roadPolylines);
    var buildings = [];
    var cars = [];
    var trees = [];
    var i;
    var targetBuildingCount = Math.max(MIN_SCENE_BUILDINGS, Math.min(MAX_SCENE_BUILDINGS, 30 + Math.floor(segments.length * 0.75)));

    var osmCandidates = (osmBuildings || []).slice(0, MAX_OSM_BUILDINGS).map(function (b) {
      return normalizeSceneBuildingFromOsm(b);
    }).filter(Boolean);

    osmCandidates.sort(function (a, b) {
      return nearestRoadDistanceForPoint(a.centerX, a.centerZ, segments).distance -
        nearestRoadDistanceForPoint(b.centerX, b.centerZ, segments).distance;
    });

    osmCandidates.forEach(function (candidate) {
      if (buildings.length >= targetBuildingCount) {
        return;
      }
      if (!isRoadsideBuildingCandidate(candidate, segments)) {
        return;
      }
      if (buildingIntrudesRoadEnvelope(candidate, segments, 0.2)) {
        return;
      }
      if (canPlaceBuildingCandidate(candidate, buildings, BUILDING_OVERLAP_PADDING)) {
        buildings.push(candidate);
      }
    });

    var fillAttempts = targetBuildingCount * 40;
    for (i = 0; buildings.length < targetBuildingCount && i < fillAttempts; i++) {
      var generated = createRoadsideBuildingCandidate(segments, i);
      if (!generated) {
        break;
      }
      if (!isRoadsideBuildingCandidate(generated, segments)) {
        continue;
      }
      if (buildingIntrudesRoadEnvelope(generated, segments, 0.24)) {
        continue;
      }
      if (!canPlaceBuildingCandidate(generated, buildings, BUILDING_OVERLAP_PADDING)) {
        continue;
      }
      buildings.push(generated);
    }

    if (buildings.length < MIN_SCENE_BUILDINGS) {
      for (i = 0; i < (MIN_SCENE_BUILDINGS * 4) && buildings.length < MIN_SCENE_BUILDINGS; i++) {
        var emergencyFill = createRoadsideBuildingCandidate(segments, i + 999);
        if (emergencyFill &&
            isRoadsideBuildingCandidate(emergencyFill, segments) &&
            !buildingIntrudesRoadEnvelope(emergencyFill, segments, 0.24) &&
            canPlaceBuildingCandidate(emergencyFill, buildings, 0.08)) {
          buildings.push(emergencyFill);
        }
      }
    }

    if (buildings.length < MIN_SCENE_BUILDINGS) {
      var spanX = bounds.maxX - bounds.minX;
      var spanZ = bounds.maxZ - bounds.minZ;
      var cols = 8;
      var rows = 8;
      for (var gx = 0; gx < cols && buildings.length < MIN_SCENE_BUILDINGS; gx++) {
        for (var gz = 0; gz < rows && buildings.length < MIN_SCENE_BUILDINGS; gz++) {
          var px = bounds.minX + ((gx + 0.5) / cols) * spanX;
          var pz = bounds.minZ + ((gz + 0.5) / rows) * spanZ;
          var nearest = nearestRoadDistanceForPoint(px, pz, segments);
          var roadHalf = (nearest.roadWidth || 1.9) * 0.5;
          if (nearest.distance < roadHalf + 0.7 || nearest.distance > roadHalf + 6.8) {
            continue;
          }
          var fallbackBuilding = {
            x: px - 0.62,
            y: pz - 0.58,
            w: 1.24,
            d: 1.16,
            h: 1.4 + (((gx + gz) % 4) * 0.35),
            onFire: false,
            source: 'generated',
            centerX: px,
            centerZ: pz
          };
          if (!buildingIntrudesRoadEnvelope(fallbackBuilding, segments, 0.22) &&
              canPlaceBuildingCandidate(fallbackBuilding, buildings, 0.08)) {
            buildings.push(fallbackBuilding);
          }
        }
      }
    }

    fillNonRoadWithBuildings(segments, bounds, buildings);

    if (buildings.length && callCategory !== 'minor_tree') {
      var callPoint = { x: 4.2, z: 1.4 };
      var bestIdx = 0;
      var bestDist = Infinity;
      buildings.forEach(function (b, idx) {
        var cx = (b.centerX != null) ? b.centerX : (b.x + (b.w / 2));
        var cz = (b.centerZ != null) ? b.centerZ : (b.y + (b.d / 2));
        var dx = cx - callPoint.x;
        var dz = cz - callPoint.z;
        var d = Math.sqrt((dx * dx) + (dz * dz));
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      buildings[bestIdx].onFire = true;
    }

    var carCount = Math.max(9, Math.min(22, Math.floor(segments.length * 1.05)));
    for (i = 0; i < carCount; i++) {
      var carSlot = sampleRoadsideSlot(segments, 0.2, 0.55);
      if (!carSlot) {
        continue;
      }
      var car = {
        x: carSlot.x - 0.68,
        y: carSlot.z - 0.29,
        w: 1.36,
        d: 0.58,
        h: 0.5
      };
      if (canPlaceRect(car, buildings, cars, 0.04)) {
        cars.push(car);
      }
    }

    var treeCount = Math.max(10, Math.min(26, Math.floor(segments.length * 1.25)));
    for (i = 0; i < treeCount; i++) {
      var treeSlot = sampleRoadsideSlot(segments, 1.1, 2.4);
      if (!treeSlot) {
        continue;
      }
      if (isPointNearAnyRect(treeSlot.x, treeSlot.z, buildings, 0.4)) {
        continue;
      }
      trees.push({ x: treeSlot.x, y: treeSlot.z });
    }

    buildings.forEach(function (b) {
      if (b.x < bounds.minX) {
        bounds.minX = b.x;
      }
      if ((b.x + b.w) > bounds.maxX) {
        bounds.maxX = b.x + b.w;
      }
      if (b.y < bounds.minZ) {
        bounds.minZ = b.y;
      }
      if ((b.y + b.d) > bounds.maxZ) {
        bounds.maxZ = b.y + b.d;
      }
    });

    cars.forEach(function (c) {
      if (c.x < bounds.minX) {
        bounds.minX = c.x;
      }
      if ((c.x + c.w) > bounds.maxX) {
        bounds.maxX = c.x + c.w;
      }
      if (c.y < bounds.minZ) {
        bounds.minZ = c.y;
      }
      if ((c.y + c.d) > bounds.maxZ) {
        bounds.maxZ = c.y + c.d;
      }
    });

    var spanX = Math.max(1, bounds.maxX - bounds.minX);
    var spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
    var edgePad = Math.max(1.2, Math.min(2.8, Math.min(spanX, spanZ) * 0.08));
    bounds.minX -= edgePad;
    bounds.maxX += edgePad;
    bounds.minZ -= edgePad;
    bounds.maxZ += edgePad;
    var defaultFocus = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: 1.0,
      z: (bounds.minZ + bounds.maxZ) / 2
    };

    return {
      buildings: buildings,
      parkedCars: cars,
      trees: trees,
      bounds: bounds,
      defaultFocus: defaultFocus
    };
  }

  function normalizeSceneBuildingFromOsm(b) {
    if (!b || !isFinite(b.w) || !isFinite(b.d) || !isFinite(b.h)) {
      return null;
    }
    var clampedH = Math.max(1.1, Math.min(6.3, b.h));
    var centerX = b.centerX != null ? b.centerX : (b.x + (b.w / 2));
    var centerZ = b.centerZ != null ? b.centerZ : (b.y + (b.d / 2));
    return {
      x: b.x,
      y: b.y,
      w: b.w,
      d: b.d,
      h: clampedH,
      onFire: false,
      source: b.source || 'osm',
      footprint: b.footprint || null,
      centerX: centerX,
      centerZ: centerZ
    };
  }

  function fillNonRoadWithBuildings(segments, bounds, buildings) {
    if (!segments.length || buildings.length >= MAX_SCENE_BUILDINGS) {
      return;
    }
    var spanX = Math.max(1, bounds.maxX - bounds.minX);
    var spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
    var area = spanX * spanZ;
    var denseTarget = Math.min(MAX_SCENE_BUILDINGS, Math.max(MIN_SCENE_BUILDINGS, Math.floor(area / 0.9)));
    var grid = 0.74;
    var startX = bounds.minX + (grid * 0.5);
    var startZ = bounds.minZ + (grid * 0.5);

    for (var x = startX; x <= bounds.maxX - (grid * 0.5) && buildings.length < denseTarget; x += grid) {
      for (var z = startZ; z <= bounds.maxZ - (grid * 0.5) && buildings.length < denseTarget; z += grid) {
        var near = nearestRoadDistanceForPoint(x, z, segments);
        var roadHalf = (near.roadWidth || 0.95) * 0.5;
        if (near.distance < (roadHalf + 0.42)) {
          continue;
        }
        var candidate = {
          x: x - 0.28,
          y: z - 0.24,
          w: 0.56,
          d: 0.48,
          h: 0.8 + (session.rng() * 1.9),
          onFire: false,
          source: 'generated',
          centerX: x,
          centerZ: z
        };
        if (!canPlaceBuildingCandidate(candidate, buildings, 0.06)) {
          continue;
        }
        if (buildingIntrudesRoadEnvelope(candidate, segments, 0.2)) {
          continue;
        }
        buildings.push(candidate);
      }
    }
  }

  function deriveHydrantPoint(roadPolylines, bounds) {
    var segments = collectRoadSegments(roadPolylines || []);
    if (!segments.length) {
      return {
        x: (bounds.minX + bounds.maxX) * 0.5,
        z: (bounds.minZ + bounds.maxZ) * 0.5
      };
    }
    var slot = sampleRoadsideSlot(segments, 0.42, 0.92, 17) || sampleRoadsideSlot(segments, 0.35, 0.75, 7);
    if (!slot) {
      return {
        x: (bounds.minX + bounds.maxX) * 0.5,
        z: (bounds.minZ + bounds.maxZ) * 0.5
      };
    }
    return { x: slot.x, z: slot.z };
  }

  function createRoadsideBuildingCandidate(segments, attemptIdx) {
    var slot = sampleRoadsideSlot(segments, 1.25, 3.25, attemptIdx);
    if (!slot) {
      return null;
    }

    var longAlongRoad = (session.rng() > 0.72);
    var w = longAlongRoad ? (1.7 + (session.rng() * 1.5)) : (0.95 + (session.rng() * 0.9));
    var d = longAlongRoad ? (1.1 + (session.rng() * 0.9)) : (1.1 + (session.rng() * 1.1));
    var h = sampleGeneratedBuildingHeight(slot.segment.roadType);

    var centerX = slot.x;
    var centerZ = slot.z;
    return {
      x: centerX - (w / 2),
      y: centerZ - (d / 2),
      w: w,
      d: d,
      h: h,
      onFire: false,
      source: 'generated',
      centerX: centerX,
      centerZ: centerZ
    };
  }

  function sampleGeneratedBuildingHeight(roadType) {
    var t = (roadType || '').toLowerCase();
    var roll = session.rng();
    var lowRise = 1.25 + (roll * 1.2);
    var midRise = 2.2 + (roll * 1.8);

    if (t === 'service' || t === 'living_street' || t === 'residential') {
      return session.rng() > 0.82 ? midRise : lowRise;
    }
    if (t === 'motorway' || t === 'trunk' || t === 'primary') {
      return session.rng() > 0.6 ? midRise : (1.4 + (roll * 1.5));
    }
    return 1.5 + (roll * 2.4);
  }

  function isRoadsideBuildingCandidate(building, segments) {
    var rect = rectFromBuilding(building);
    var nearest = nearestRoadDistanceForRect(rect, segments);
    if (!isFinite(nearest.centerDistance)) {
      return false;
    }
    var roadHalfWidth = (nearest.roadWidth || 2.2) * 0.5;
    var minDistance = roadHalfWidth + 0.62;
    var maxDistance = roadHalfWidth + 7.4;
    return nearest.centerDistance <= maxDistance && nearest.minSampleDistance >= minDistance;
  }

  function canPlaceBuildingCandidate(candidate, buildings, padding) {
    if (candidate.w < 0.32 || candidate.d < 0.32) {
      return false;
    }
    if (!isFinite(candidate.x) || !isFinite(candidate.y)) {
      return false;
    }
    return !buildings.some(function (existing) {
      return rectsOverlap(candidate, existing, padding);
    });
  }

  function buildingIntrudesRoadEnvelope(candidate, segments, clearance) {
    if (!segments || !segments.length) {
      return false;
    }
    var rect = rectFromBuilding(candidate);
    var near = nearestRoadDistanceForRect(rect, segments);
    var roadHalf = (near.roadWidth || 0.82) * 0.5;
    var keepOut = roadHalf + (clearance || 0.18);
    return near.minSampleDistance < keepOut;
  }

  function canPlaceRect(rect, blockersA, blockersB, padding) {
    var groupA = blockersA || [];
    var groupB = blockersB || [];
    var overlapA = groupA.some(function (existing) {
      return rectsOverlap(rect, existing, padding);
    });
    if (overlapA) {
      return false;
    }
    return !groupB.some(function (existing) {
      return rectsOverlap(rect, existing, padding);
    });
  }

  function rectsOverlap(a, b, padding) {
    var p = padding || 0;
    return !(
      (a.x + a.w + p) <= b.x ||
      (b.x + b.w + p) <= a.x ||
      (a.y + a.d + p) <= b.y ||
      (b.y + b.d + p) <= a.y
    );
  }

  function isPointNearAnyRect(x, z, rects, radius) {
    var r = radius || 0;
    return rects.some(function (rect) {
      return x >= (rect.x - r) && x <= (rect.x + rect.w + r) &&
        z >= (rect.y - r) && z <= (rect.y + rect.d + r);
    });
  }

  function sampleRoadsideSlot(segments, minOffset, maxOffset, seedIdx) {
    if (!segments.length) {
      return null;
    }
    var seg = segments[Math.floor(session.rng() * segments.length)];
    if (typeof seedIdx === 'number' && segments.length > 2 && seedIdx % 4 === 0) {
      seg = segments[seedIdx % segments.length];
    }
    var t = 0.08 + (session.rng() * 0.84);
    var baseX = seg.a.x + (seg.dx * t);
    var baseZ = seg.a.z + (seg.dz * t);
    var nx = -seg.dz / seg.len;
    var nz = seg.dx / seg.len;
    var side = (typeof seedIdx === 'number' ? (seedIdx % 2 === 0) : (session.rng() > 0.5)) ? 1 : -1;
    var edgeOffset = (seg.roadWidth || 1.9) * 0.5;
    var off = edgeOffset + minOffset + (session.rng() * (maxOffset - minOffset));
    return {
      x: baseX + (nx * side * off),
      z: baseZ + (nz * side * off),
      segment: seg
    };
  }

  function nearestRoadDistanceForPoint(x, z, segments) {
    var best = {
      distance: Infinity,
      roadWidth: 1.9,
      roadType: 'residential'
    };
    segments.forEach(function (seg) {
      var dist = distancePointToSegment(x, z, seg.a.x, seg.a.z, seg.b.x, seg.b.z);
      if (dist < best.distance) {
        best.distance = dist;
        best.roadWidth = seg.roadWidth || 1.9;
        best.roadType = seg.roadType || 'residential';
      }
    });
    return best;
  }

  function nearestRoadDistanceForRect(rect, segments) {
    var centerX = rect.x + (rect.w * 0.5);
    var centerZ = rect.y + (rect.d * 0.5);
    var center = nearestRoadDistanceForPoint(centerX, centerZ, segments);
    var samplePoints = [
      { x: centerX, z: centerZ },
      { x: rect.x, z: rect.y },
      { x: rect.x + rect.w, z: rect.y },
      { x: rect.x, z: rect.y + rect.d },
      { x: rect.x + rect.w, z: rect.y + rect.d },
      { x: centerX, z: rect.y },
      { x: centerX, z: rect.y + rect.d },
      { x: rect.x, z: centerZ },
      { x: rect.x + rect.w, z: centerZ }
    ];
    var minSampleDistance = Infinity;

    segments.forEach(function (seg) {
      samplePoints.forEach(function (pt) {
        var d = distancePointToSegment(pt.x, pt.z, seg.a.x, seg.a.z, seg.b.x, seg.b.z);
        if (d < minSampleDistance) {
          minSampleDistance = d;
        }
      });
    });

    return {
      centerDistance: center.distance,
      minSampleDistance: minSampleDistance,
      roadWidth: center.roadWidth,
      roadType: center.roadType
    };
  }

  function distancePointToSegment(px, pz, ax, az, bx, bz) {
    var dx = bx - ax;
    var dz = bz - az;
    var lenSq = (dx * dx) + (dz * dz);
    if (lenSq <= 0.000001) {
      var ex = px - ax;
      var ez = pz - az;
      return Math.sqrt((ex * ex) + (ez * ez));
    }
    var t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    var sx = ax + (dx * t);
    var sz = az + (dz * t);
    var rx = px - sx;
    var rz = pz - sz;
    return Math.sqrt((rx * rx) + (rz * rz));
  }

  function buildStaticSceneColliders(sceneState) {
    var colliders = [];
    (sceneState.buildings || []).forEach(function (building, idx) {
      var rect = rectFromBuilding(building);
      colliders.push({
        id: 'bld-' + idx,
        type: 'building',
        minX: rect.x,
        maxX: rect.x + rect.w,
        minZ: rect.y,
        maxZ: rect.y + rect.d
      });
      building.hitbox = {
        minX: rect.x,
        maxX: rect.x + rect.w,
        minZ: rect.y,
        maxZ: rect.y + rect.d
      };
    });

    (sceneState.parkedCars || []).forEach(function (car, idx) {
      colliders.push({
        id: 'car-' + idx,
        type: 'car',
        minX: car.x,
        maxX: car.x + car.w,
        minZ: car.y,
        maxZ: car.y + car.d
      });
    });

    return colliders;
  }

  function rectFromBuilding(building) {
    if (building.footprint && building.footprint.length >= 3) {
      var minX = Infinity;
      var maxX = -Infinity;
      var minZ = Infinity;
      var maxZ = -Infinity;
      building.footprint.forEach(function (pt) {
        if (pt.x < minX) {
          minX = pt.x;
        }
        if (pt.x > maxX) {
          maxX = pt.x;
        }
        if (pt.z < minZ) {
          minZ = pt.z;
        }
        if (pt.z > maxZ) {
          maxZ = pt.z;
        }
      });
      return {
        x: minX,
        y: minZ,
        w: maxX - minX,
        d: maxZ - minZ
      };
    }
    return {
      x: building.x,
      y: building.y,
      w: building.w,
      d: building.d
    };
  }

  function refreshDynamicSceneColliders(sceneState) {
    sceneState.truckColliders = (sceneState.companies || []).map(function (company) {
      var collider = createCompanyCollider(company);
      company.hitbox = collider;
      return collider;
    });
    sceneState.firefighterColliders = (sceneState.firefighters || []).map(function (ff) {
      var collider = createFirefighterCollider(ff, ff.x, ff.y);
      ff.hitbox = collider;
      return collider;
    });
  }

  function createCompanyCollider(company) {
    var dims = getCompanyFootprintDims(company.type);
    var truckLength = dims.length;
    var truckWidth = dims.width;
    var cx = company.x + 0.28;
    var cz = company.y + 0.14;
    var halfW = truckLength * 0.5;
    var halfD = truckWidth * 0.5;
    return {
      id: company.id,
      type: 'truck',
      minX: cx - halfW,
      maxX: cx + halfW,
      minZ: cz - halfD,
      maxZ: cz + halfD
    };
  }

  function getCompanyFootprintDims(companyType) {
    if (companyType === 'ambulance') {
      return { length: 0.74, width: 0.22 };
    }
    if (companyType === 'ladder') {
      return { length: 1.02, width: 0.28 };
    }
    return { length: 0.9, width: 0.26 };
  }

  function getOrientedRectPoints(cx, cz, length, width, heading) {
    var halfL = length * 0.5;
    var halfW = width * 0.5;
    var ch = Math.cos(heading);
    var sh = Math.sin(heading);
    var fx = ch;
    var fz = sh;
    var rx = -sh;
    var rz = ch;

    return [
      { x: cx + (fx * halfL) + (rx * halfW), z: cz + (fz * halfL) + (rz * halfW) },
      { x: cx + (fx * halfL) - (rx * halfW), z: cz + (fz * halfL) - (rz * halfW) },
      { x: cx - (fx * halfL) - (rx * halfW), z: cz - (fz * halfL) - (rz * halfW) },
      { x: cx - (fx * halfL) + (rx * halfW), z: cz - (fz * halfL) + (rz * halfW) }
    ];
  }

  function createFirefighterCollider(ff, x, z) {
    var r = FIREFIGHTER_COLLIDER_RADIUS;
    return {
      id: ff.id,
      type: 'firefighter',
      minX: x - r,
      maxX: x + r,
      minZ: z - r,
      maxZ: z + r
    };
  }

  function collidersOverlap(a, b, pad) {
    var p = pad || 0;
    return !(
      (a.maxX + p) <= b.minX ||
      (b.maxX + p) <= a.minX ||
      (a.maxZ + p) <= b.minZ ||
      (b.maxZ + p) <= a.minZ
    );
  }

  function clampPointToSceneBounds(scene, x, z) {
    return {
      x: Math.max(scene.groundMinX + 0.35, Math.min(scene.groundMaxX - 0.35, x)),
      z: Math.max(scene.groundMinY + 0.35, Math.min(scene.groundMaxY - 0.35, z))
    };
  }

  function canFirefighterOccupyPosition(scene, ff, x, z) {
    var candidate = createFirefighterCollider(ff, x, z);

    var blockedByStatic = (scene.staticColliders || []).some(function (obstacle) {
      return collidersOverlap(candidate, obstacle, 0.03);
    });
    if (blockedByStatic) {
      return false;
    }

    var blockedByTruck = (scene.truckColliders || []).some(function (truck) {
      return collidersOverlap(candidate, truck, 0.03);
    });
    if (blockedByTruck) {
      return false;
    }

    var blockedByCrew = (scene.firefighters || []).some(function (other) {
      if (other.id === ff.id) {
        return false;
      }
      var otherCollider = createFirefighterCollider(other, other.x, other.y);
      return collidersOverlap(candidate, otherCollider, 0.005);
    });
    return !blockedByCrew;
  }

  function projectPointToWalkable(scene, ff, x, z) {
    var clamped = clampPointToSceneBounds(scene, x, z);
    if (canFirefighterOccupyPosition(scene, ff, clamped.x, clamped.z)) {
      return clamped;
    }

    var radius;
    var angle;
    for (radius = 0.2; radius <= 2.6; radius += 0.2) {
      for (angle = 0; angle < Math.PI * 2; angle += (Math.PI / 10)) {
        var px = clamped.x + (Math.cos(angle) * radius);
        var pz = clamped.z + (Math.sin(angle) * radius);
        var probe = clampPointToSceneBounds(scene, px, pz);
        if (canFirefighterOccupyPosition(scene, ff, probe.x, probe.z)) {
          return probe;
        }
      }
    }

    return {
      x: ff.x,
      z: ff.y
    };
  }

  function getRoadBounds(roadPolylines) {
    var minX = Infinity;
    var maxX = -Infinity;
    var minZ = Infinity;
    var maxZ = -Infinity;

    roadPolylines.forEach(function (line) {
      var halfRoad = Math.max(0.25, (line.roadWidth || 0.82) * 0.5);
      line.forEach(function (pt) {
        if ((pt.x - halfRoad) < minX) {
          minX = pt.x - halfRoad;
        }
        if ((pt.x + halfRoad) > maxX) {
          maxX = pt.x + halfRoad;
        }
        if ((pt.z - halfRoad) < minZ) {
          minZ = pt.z - halfRoad;
        }
        if ((pt.z + halfRoad) > maxZ) {
          maxZ = pt.z + halfRoad;
        }
      });
    });

    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minZ) || !isFinite(maxZ)) {
      return { minX: -6, maxX: 14, minZ: -5, maxZ: 7 };
    }

    return { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
  }

  function collectRoadSegments(roadPolylines) {
    var segments = [];
    roadPolylines.forEach(function (line) {
      for (var i = 1; i < line.length; i++) {
        var a = line[i - 1];
        var b = line[i];
        var dx = b.x - a.x;
        var dz = b.z - a.z;
        var len = Math.sqrt((dx * dx) + (dz * dz));
        if (len < 0.6) {
          continue;
        }
        segments.push({
          a: a,
          b: b,
          dx: dx,
          dz: dz,
          len: len,
          roadType: line.roadType || 'residential',
          roadWidth: line.roadWidth || roadWidthForType(line.roadType || 'residential')
        });
      }
    });

    if (!segments.length) {
      segments.push({
        a: { x: -6, z: 1.4 },
        b: { x: 14, z: 1.4 },
        dx: 20,
        dz: 0,
        len: 20,
        roadType: 'residential',
        roadWidth: roadWidthForType('residential')
      });
    }

    return segments;
  }

  function sampleRoadSlot(segments, minOffset, maxOffset) {
    var seg = segments[Math.floor(session.rng() * segments.length)];
    var t = 0.12 + (session.rng() * 0.76);
    var baseX = seg.a.x + ((seg.b.x - seg.a.x) * t);
    var baseZ = seg.a.z + ((seg.b.z - seg.a.z) * t);
    var dx = seg.b.x - seg.a.x;
    var dz = seg.b.z - seg.a.z;
    var len = Math.max(0.001, Math.sqrt((dx * dx) + (dz * dz)));
    var nx = -dz / len;
    var nz = dx / len;
    var side = session.rng() > 0.5 ? 1 : -1;
    var off = minOffset + (session.rng() * (maxOffset - minOffset));
    return {
      x: baseX + (nx * side * off),
      z: baseZ + (nz * side * off)
    };
  }

  function compartmentLayoutForType(type) {
    if (type === 'ladder') {
      return [
        { key: 'turntable', action: 'deploy_outriggers', ox: 0.92, oy: -0.12 },
        { key: 'aerial', action: 'assign_ladder_task', ox: 0.58, oy: -0.22 },
        { key: 'pipe', action: 'operate_master_stream', ox: 0.16, oy: -0.2 },
        { key: 'roof_saw', action: 'ventilate_structure', ox: -0.12, oy: 0.24 },
        { key: 'irons', action: 'forcible_entry', ox: -0.44, oy: 0.22 },
        { key: 'search_pack', action: 'primary_search', ox: -0.7, oy: 0.22 },
        { key: 'door', action: 'right_click_truck_door', ox: 0.26, oy: 0.62 }
      ];
    }

    if (type === 'ambulance') {
      return [
        { key: 'triage_kit', action: 'triage_patient', ox: -0.56, oy: 0.28 },
        { key: 'stretcher', action: 'transport_patient', ox: -0.72, oy: -0.02 },
        { key: 'oxygen', action: 'rescue_victim', ox: -0.34, oy: 0.24 },
        { key: 'rehab', action: 'rehab_rotation', ox: -0.16, oy: 0.26 },
        { key: 'door', action: 'right_click_truck_door', ox: 0.22, oy: 0.56 }
      ];
    }

    return [
      { key: 'hose_bed', action: 'grab_hose', ox: -0.75, oy: 0.25 },
      { key: 'pump_panel', action: 'connect_hydrant', ox: 0.74, oy: 0.22 },
      { key: 'throttle', action: 'set_pump_pressure', ox: 0.58, oy: 0.14 },
      { key: 'crosslay', action: 'charge_line', ox: -0.46, oy: 0.22 },
      { key: 'irons', action: 'forcible_entry', ox: -0.2, oy: -0.22 },
      { key: 'utility', action: 'control_utilities', ox: 0.06, oy: -0.2 },
      { key: 'light_tower', action: 'deploy_scene_lighting', ox: 0.28, oy: -0.2 },
      { key: 'door', action: 'right_click_truck_door', ox: 0.25, oy: 0.62 }
    ];
  }

  function renderSceneHud(mission) {
    ensureMissionSceneState(mission);
    var scene = mission.sceneState;

    var selectedLabel = 'none';
    if (scene.selectedFirefighterId) {
      var selectedCrew = (mission.assignedCrew || []).find(function (crew) {
        return crew.id === scene.selectedFirefighterId;
      });
      selectedLabel = selectedCrew ? selectedCrew.name : scene.selectedFirefighterId;
    }
    els.sceneMeta.innerHTML =
      '<span class="meta-chip"><span class="hud-ico ico-call"></span>' + escapeHtml(mission.initialCall.buildingType) + '</span>' +
      '<span class="meta-chip"><span class="hud-ico ico-life"></span>' + mission.civiliansRescued + '/' + mission.civiliansKnown + '</span>' +
      '<span class="meta-chip"><span class="hud-ico ico-unit"></span>' + escapeHtml(selectedLabel) + '</span>';

    var hint = Sim.getEscalationHintForUi(session, mission);
    if (hint) {
      els.escalationBadge.className = 'badge ' + hint;
      els.escalationBadge.textContent = 'Call Complexity: ' + hint.toUpperCase();
    } else {
      els.escalationBadge.className = 'badge';
      els.escalationBadge.textContent = 'Call Complexity: radio/visual only';
    }

    renderCompanyHud(mission);

    var visibleRadio = getVisibleRadioEntries(mission);
    els.radioLog.innerHTML = visibleRadio.map(function (entry) {
      var t = entry.ts.split('T')[1].slice(0, 8);
      return '<div class="radio-item">' +
        '<span class="radio-ico"></span>' +
        '<span><strong>' + t + ' ' + escapeHtml(entry.source) + '</strong> ' + escapeHtml(entry.message) + '</span>' +
        '</div>';
    }).join('');

    els.sceneStatus.innerHTML =
      '<span class="stat-pill"><span class="hud-ico ico-hose"></span>' + mission.inventory.hoseDeployed + '</span>' +
      '<span class="stat-pill"><span class="hud-ico ico-hydrant"></span>' + mission.inventory.hydrantsConnected + '</span>' +
      '<span class="stat-pill"><span class="hud-ico ico-hose"></span>C' + (mission.inventory.linesCharged || 0) + '</span>' +
      '<span class="stat-pill"><span class="hud-ico ico-ladder"></span>' + mission.inventory.ladderAssignments + '</span>' +
      '<span class="stat-pill"><span class="hud-ico ico-unit"></span>S' + (mission.inventory.primarySearchOps || 0) + '</span>' +
      '<span class="stat-pill"><span class="hud-ico ico-unit"></span>V' + (mission.inventory.ventilationOps || 0) + '</span>' +
      '<span class="stat-pill"><span class="hud-ico ico-ladder"></span>M' + (mission.inventory.masterStreamOps || 0) + '</span>' +
      '<span class="stat-pill"><span class="hud-ico ico-live"></span>' + (session.isPaused ? 'PAUSED' : 'LIVE') + '</span>' +
      '<span class="stat-pill"><span class="hud-ico ico-unit"></span>Cam WASD + Q/E | 1-0 ops | T/Y/U/I/O/P</span>';

    els.pauseBtn.textContent = session.isPaused ? '>' : '||';
    els.pauseBtn.title = session.isPaused ? 'Resume (Space)' : 'Pause (Space)';
  }

  function getVisibleRadioEntries(mission) {
    if (!mission._radioRevealState) {
      mission._radioRevealState = {
        count: Math.min(1, mission.radio.length),
        nextTsMs: Date.now() + 2500
      };
    }
    var state = mission._radioRevealState;
    if (state.count > mission.radio.length) {
      state.count = mission.radio.length;
    }

    var now = Date.now();
    if (state.count < mission.radio.length && now >= state.nextTsMs) {
      state.count += 1;
      var jitter = Math.floor(((session && session.rng) ? session.rng() : Math.random()) * RADIO_REVEAL_JITTER_MS);
      state.nextTsMs = now + RADIO_REVEAL_BASE_MS + jitter;
    }

    return mission.radio.slice(0, state.count).slice(-24);
  }

  function renderCompanyHud(mission) {
    var scene = mission.sceneState;
    var grouped = {};

    (mission.assignedCrew || []).forEach(function (crew) {
      if (!grouped[crew.companyId]) {
        grouped[crew.companyId] = [];
      }
      grouped[crew.companyId].push(crew);
    });

    els.companyHud.innerHTML = (mission.assignedCompanyIds || []).map(function (companyId) {
      var company = fleet.find(function (entry) { return entry.id === companyId; });
      if (!company) {
        return '';
      }

      var selected = scene.selectedFirefighterId && scene.selectedFirefighterId.indexOf(companyId) === 0;
      var icon = company.type === 'ladder' ? './assets/fdny-ladder.svg' :
        (company.type === 'ambulance' ? './assets/fdny-ambulance.svg' : './assets/fdny-engine.svg');
      var companyNum = companyNumberFromLabel(company.label);

      return '<div class="company-chip' + (selected ? ' active' : '') + '">' +
        '<button class="company-icon-btn" data-company-focus="' + companyId + '" title="' + escapeHtml(company.label) + '">' +
        '<img src="' + icon + '" alt="' + escapeHtml(company.label) + '">' +
        '<span class="company-num">' + escapeHtml(companyNum) + '</span>' +
        '</button>' +
        '<div class="rank-dots">' + (grouped[companyId] || []).map(function (crew) {
          return '<button class="rank-dot-btn ' + crew.rank + '" data-crew-select="' + crew.id + '" title="' + escapeHtml(crew.name) + '">' +
            shortRankLabel(crew) +
            '</button>';
        }).join('') + '</div>' +
        '</div>';
    }).join('');

    els.companyHud.querySelectorAll('[data-company-focus]').forEach(function (button) {
      button.addEventListener('click', function () {
        var companyId = button.getAttribute('data-company-focus');
        var firstCrew = (mission.assignedCrew || []).find(function (crew) {
          return crew.companyId === companyId;
        });
        if (firstCrew) {
          selectFirefighterById(mission, firstCrew.id);
          render();
        }
      });
    });

    els.companyHud.querySelectorAll('[data-crew-select]').forEach(function (button) {
      button.addEventListener('click', function () {
        var crewId = button.getAttribute('data-crew-select');
        selectFirefighterById(mission, crewId);
        render();
      });
    });
  }

  function shortRankLabel(crew) {
    if (crew.rank === 'captain') {
      return 'C';
    }
    if (crew.rank === 'lieutenant') {
      return 'L';
    }
    if (crew.rank === 'proby') {
      return 'P';
    }
    if (crew.rank === 'ems') {
      return 'E';
    }
    var suffix = crew.name.match(/Firefighter\s(\d+)/);
    return suffix ? suffix[1] : 'F';
  }

  function companyNumberFromLabel(label) {
    var m = label.match(/(\d+)/);
    return m ? m[1] : label;
  }

  function selectFirefighterById(mission, crewId) {
    var scene = mission.sceneState;
    scene.selectedFirefighterId = crewId;
    scene.firefighters.forEach(function (ff) {
      ff.selected = ff.id === crewId;
    });

    var selected = scene.firefighters.find(function (ff) { return ff.id === crewId; });
    if (selected) {
      Sim.applySceneAction(session, { type: 'select_firefighter', actorId: selected.name });
    }
  }

  function render() {
    if (!session) {
      setScreen(Sim.SessionView.MENU);
      return;
    }

    renderPlayerSummary();
    setScreen(session.view);

    if (session.view === Sim.SessionView.MAP_2D) {
      renderMap();
    } else if (session.view === Sim.SessionView.LOADING_3D) {
      renderLoading();
    } else if (session.view === Sim.SessionView.SCENE_3D) {
      var mission = Sim.getFocusedMission(session);
      if (mission) {
        renderSceneHud(mission);
      }
    }
  }

  function startTicking() {
    if (ticker) {
      clearInterval(ticker);
    }

    ticker = setInterval(function () {
      if (!session) {
        return;
      }

      Sim.tickSession(session, 1);
      handleMissionStateTransitions();
      render();
    }, 1000);

    if (!sceneAnimId) {
      requestAnimationFrame(animationLoop);
    }
  }

  function handleMissionStateTransitions() {
    session.missions.forEach(function (mission) {
      if (mission.status === Sim.MissionStatus.ON_SCENE && !mission._sceneEnteredHandled) {
        mission._sceneEnteredHandled = true;
        selectedMissionId = mission.id;
        Sim.focusMission(session, mission.id);
        session.view = Sim.SessionView.SCENE_3D;
        ensureMissionSceneState(mission);
        mission.sceneState.cameraTween = 0;
        mission.sceneState.cameraZoomIn = true;
      }

      if (mission.status === Sim.MissionStatus.RESOLVED && !mission._resolvedHandled) {
        mission._resolvedHandled = true;
        releaseCompaniesFromMission(mission);
        if (mapMarkersByMission[mission.id]) {
          mapMarkersByMission[mission.id].setStyle({ fillOpacity: 0.28 });
        }
        scheduleFollowupCall();
      }
    });
  }

  function releaseCompaniesFromMission(mission) {
    (mission.assignedCompanyIds || []).forEach(function (id) {
      var company = fleet.find(function (entry) { return entry.id === id; });
      if (company) {
        company.available = true;
      }
    });
  }

  function animationLoop(timestamp) {
    sceneAnimId = requestAnimationFrame(animationLoop);
    var dt = Math.min(0.05, (timestamp - (lastFrameTs || timestamp)) / 1000);
    lastFrameTs = timestamp;

    if (!session || session.view !== Sim.SessionView.SCENE_3D) {
      return;
    }

    var mission = Sim.getFocusedMission(session);
    if (!mission || mission.status !== Sim.MissionStatus.ON_SCENE) {
      return;
    }

    initThreeScene();
    ensureMissionSceneState(mission);
    applyHeldSceneCameraInput(mission.sceneState, dt);
    updateSceneSimulation(mission, dt);
    if (FORCE_TOPDOWN_SCENE) {
      initFallbackScene2d();
      renderSceneFallback2d(mission, timestamp / 1000);
      return;
    }

    if (threeState) {
      try {
        ensureThreeMissionObjects(mission);
        renderThreeScene(mission, timestamp / 1000);
      } catch (err) {
        threeState = null;
        initFallbackScene2d();
        renderSceneFallback2d(mission, timestamp / 1000);
        if (!mission._renderFallbackAlerted) {
          mission._renderFallbackAlerted = true;
          showToast('3D scene error. Switched to tactical fallback.');
        }
      }
    } else {
      initFallbackScene2d();
      renderSceneFallback2d(mission, timestamp / 1000);
    }
  }

  function updateSceneSimulation(mission, dt) {
    if (session && session.isPaused) {
      return;
    }
    var scene = mission.sceneState;

    scene.companies.forEach(function (company) {
      if (company.arrivalProgress < 1) {
        company.arrivalProgress = Math.min(1, company.arrivalProgress + dt * 0.45);
        var tx = lerp(company.x, company.targetX, company.arrivalProgress);
        var ty = lerp(company.y, company.targetY, company.arrivalProgress);
        var moveDx = tx - company.x;
        var moveDy = ty - company.y;
        if (Math.abs(moveDx) + Math.abs(moveDy) > 0.0005) {
          company.heading = Math.atan2(moveDy, moveDx);
        }
        company.x = tx;
        company.y = ty;
      }
    });
    refreshDynamicSceneColliders(scene);

    scene.firefighters.forEach(function (ff) {
      if (ff.targetX == null || ff.targetY == null) {
        return;
      }

      var dx = ff.targetX - ff.x;
      var dy = ff.targetY - ff.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.02) {
        ff.x = ff.targetX;
        ff.y = ff.targetY;
        ff.targetX = null;
        ff.targetY = null;
        if (ff.pendingAction) {
          executePendingFirefighterAction(mission, ff);
        }
        return;
      }

      var rankAsset = getRankAsset(ff.rank);
      var speed = rankAsset.speedMultiplier || 1.0;
      var nextX = ff.x + ((dx / dist) * speed * dt);
      var nextY = ff.y + ((dy / dist) * speed * dt);
      var moved = tryMoveFirefighter(scene, ff, nextX, nextY);
      if (!moved) {
        var slideX = tryMoveFirefighter(scene, ff, nextX, ff.y);
        var slideY = !slideX && tryMoveFirefighter(scene, ff, ff.x, nextY);
        if (!slideX && !slideY) {
          ff.targetX = null;
          ff.targetY = null;
        }
      } else {
        ff.heading = Math.atan2(dy, dx);
      }
      ff.walkPhase += dt * (3.4 + speed);
    });
    refreshDynamicSceneColliders(scene);
  }

  function tryMoveFirefighter(scene, ff, x, z) {
    var clamped = clampPointToSceneBounds(scene, x, z);
    if (!canFirefighterOccupyPosition(scene, ff, clamped.x, clamped.z)) {
      return false;
    }
    ff.x = clamped.x;
    ff.y = clamped.z;
    return true;
  }

  function executePendingFirefighterAction(mission, ff) {
    if (!ff || !ff.pendingAction) {
      return;
    }
    var actionType = ff.pendingAction;
    ff.pendingAction = null;
    applyMappedSceneAction(actionType, ff.name);
    mission.sceneState.selectedFirefighterId = ff.id;
    mission.sceneState.firefighters.forEach(function (crew) {
      crew.selected = crew.id === ff.id;
    });
  }
  function initThreeScene() {
    if (FORCE_TOPDOWN_SCENE) {
      threeState = null;
      return;
    }
    ThreeRef = window.THREE || null;
    if (!ThreeRef || threeState) {
      return;
    }

    try {
      var scene = new ThreeRef.Scene();
      scene.background = new ThreeRef.Color('#314d63');
      scene.fog = new ThreeRef.Fog('#2f4558', 16, 58);

      var camera = new ThreeRef.PerspectiveCamera(52, 1, 0.1, 300);
      camera.position.set(18, 16, 16);
      camera.lookAt(4, 0, 1.8);

      var renderer = new ThreeRef.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.outputColorSpace = ThreeRef.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = ThreeRef.PCFSoftShadowMap;
      els.scene3dHost.innerHTML = '';
      els.scene3dHost.appendChild(renderer.domElement);

      var hemi = new ThreeRef.HemisphereLight(0xb8dbff, 0x3a2d1f, 0.75);
      scene.add(hemi);

      var key = new ThreeRef.DirectionalLight(0xffffff, 0.95);
      key.position.set(10, 22, 12);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      scene.add(key);

      var ambient = new ThreeRef.AmbientLight(0x8aa5bf, 0.45);
      scene.add(ambient);

      var groundGeo = new ThreeRef.PlaneGeometry(80, 60);
      var groundMat = new ThreeRef.MeshStandardMaterial({ color: 0x445b66, roughness: 0.9, metalness: 0.06 });
      var ground = new ThreeRef.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      ground.userData.type = 'ground';
      scene.add(ground);

      var raycaster = new ThreeRef.Raycaster();
      var pointer = new ThreeRef.Vector2();

      threeState = {
        scene: scene,
        camera: camera,
        renderer: renderer,
        ground: ground,
        raycaster: raycaster,
        pointer: pointer,
        missionRoot: null,
        hotspots: [],
        firefighterMeshes: {},
        flameMeshes: [],
        smokeGroups: [],
        hydrantMesh: null,
        attackLine: null,
        supplyLine: null,
        selectionRing: null,
        activeMissionId: null
      };

      ensureThreeSize();
    } catch (err) {
      threeState = null;
      ThreeRef = null;
      initFallbackScene2d();
      showToast('3D renderer unavailable. Using top-down tactical view.');
    }
  }

  function ensureThreeSize() {
    if (!threeState) {
      ensureFallbackSceneSize();
      return;
    }
    var rect = els.scene3dHost.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return;
    }
    threeState.camera.aspect = rect.width / rect.height;
    threeState.camera.updateProjectionMatrix();
    threeState.renderer.setSize(rect.width, rect.height, false);
  }

  function ensureThreeMissionObjects(mission) {
    if (!threeState) {
      return;
    }

    if (threeState.activeMissionId === mission.id && threeState.missionRoot) {
      return;
    }

    clearThreeMissionObjects();
    threeState.activeMissionId = mission.id;

    var root = new ThreeRef.Group();
    root.name = 'missionRoot';
    threeState.scene.add(root);
    threeState.missionRoot = root;
    threeState.hotspots = [];
    threeState.firefighterMeshes = {};
    threeState.flameMeshes = [];
    threeState.smokeGroups = [];
    threeState.hydrantMesh = null;
    threeState.attackLine = null;
    threeState.supplyLine = null;
    threeState.selectionRing = null;

    var sceneData = mission.sceneState;

    if (sceneData.roadPolylines && sceneData.roadPolylines.length) {
      sceneData.roadPolylines.forEach(function (polyline) {
        addRoadPolylineMeshes(root, polyline);
      });
    } else {
      addRoadPolylineMeshes(root, [
        { x: -6, z: 1.4 },
        { x: 14, z: 1.4 }
      ]);
    }

    addStreetProps(root, sceneData);

    sceneData.parkedCars.forEach(function (car, idx) {
      var carMesh = createCarMesh(idx);
      carMesh.position.set(car.x + (car.w / 2), 0, car.y + (car.d / 2));
      root.add(carMesh);
    });

    sceneData.buildings.forEach(function (building) {
      var bMesh;
      try {
        bMesh = createBuildingMesh(building);
      } catch (err) {
        bMesh = createBoxBuildingMesh(building);
      }
      if (building.footprint && building.footprint.length >= 3) {
        bMesh.position.set(0, 0, 0);
      } else {
        bMesh.position.set(building.x + (building.w / 2), 0, building.y + (building.d / 2));
      }
      var bRect = rectFromBuilding(building);
      bMesh.userData.hitbox = {
        type: 'building',
        minX: bRect.x,
        maxX: bRect.x + bRect.w,
        minZ: bRect.y,
        maxZ: bRect.y + bRect.d,
        maxY: building.h
      };
      root.add(bMesh);

      if (building.onFire) {
        var flame = createFlameMesh();
        flame.position.set(building.x + (building.w * 0.42), building.h + 0.9, building.y + (building.d * 0.24));
        flame.userData.baseY = flame.position.y;
        root.add(flame);
        threeState.flameMeshes.push(flame);

        var smoke = createSmokeGroup();
        smoke.position.set(flame.position.x + 0.12, building.h + 1.15, flame.position.z + 0.1);
        smoke.userData.baseY = smoke.position.y;
        root.add(smoke);
        threeState.smokeGroups.push(smoke);
      }
    });

    sceneData.trees.forEach(function (tree) {
      var treeMesh = createTreeMesh();
      treeMesh.position.set(tree.x, 0, tree.y);
      root.add(treeMesh);
    });

    var hydrant = createHydrantMesh();
    var hydrantX = sceneData.hydrantPoint ? sceneData.hydrantPoint.x : 1.1;
    var hydrantZ = sceneData.hydrantPoint ? sceneData.hydrantPoint.z : 1.8;
    hydrant.position.set(hydrantX, 0, hydrantZ);
    root.add(hydrant);
    threeState.hydrantMesh = hydrant;

    sceneData.companies.forEach(function (company) {
      var truck = createTruckMesh(company);
      truck.position.set(company.x + 0.9, 0, company.y + 0.41);
      truck.userData.companyId = company.id;
      truck.userData.hitbox = createCompanyCollider(company);
      root.add(truck);
      company._threeTruck = truck;

      company.compartments.forEach(function (comp) {
        var hot = new ThreeRef.Mesh(
          new ThreeRef.IcosahedronGeometry(0.065, 1),
          new ThreeRef.MeshStandardMaterial({ color: 0xffb571, emissive: 0x6a3a12, emissiveIntensity: 0.26, roughness: 0.36, metalness: 0.4 })
        );
        hot.position.set(comp.ox - 0.8, 0.36, comp.oy - 0.36);
        hot.userData.type = 'hotspot';
        hot.userData.action = comp.action;
        truck.add(hot);
        threeState.hotspots.push(hot);
      });
    });

    if (!threeState.selectionRing && ThreeRef) {
      var ring = new ThreeRef.Mesh(
        new ThreeRef.RingGeometry(0.14, 0.22, 24),
        new ThreeRef.MeshBasicMaterial({ color: 0xffd57a, transparent: true, opacity: 0.88, side: ThreeRef.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      root.add(ring);
      threeState.selectionRing = ring;
    }

    sceneData.firefighters.forEach(function (ff) {
      var color = getRankAsset(ff.rank).color;
      var fMesh = createFirefighterMesh(color);
      fMesh.position.set(ff.x, 0, ff.y);
      fMesh.userData.type = 'firefighter';
      fMesh.userData.ffId = ff.id;
      fMesh.userData.baseY = 0;
      fMesh.userData.hitbox = createFirefighterCollider(ff, ff.x, ff.y);
      root.add(fMesh);
      ff._threeMesh = fMesh;
      threeState.firefighterMeshes[ff.id] = fMesh;
    });
  }

  function clearThreeMissionObjects() {
    if (!threeState || !threeState.missionRoot) {
      return;
    }
    threeState.scene.remove(threeState.missionRoot);
    threeState.missionRoot.traverse(function (obj) {
      if (obj.geometry) {
        obj.geometry.dispose();
      }
      if (obj.material && obj.material.dispose) {
        obj.material.dispose();
      }
    });
    threeState.missionRoot = null;
    threeState.hotspots = [];
    threeState.firefighterMeshes = {};
    threeState.flameMeshes = [];
    threeState.smokeGroups = [];
    threeState.hydrantMesh = null;
    threeState.attackLine = null;
    threeState.supplyLine = null;
    threeState.selectionRing = null;
  }

  function createTruckMesh(company) {
    var type = company.type;
    var label = company.label;
    var spec = getTruckAsset(type);
    var apparatusProfile = getDepartmentApparatusProfile();
    var liveryOverride = apparatusProfile && apparatusProfile.livery ? apparatusProfile.livery[type] : null;
    var group = new ThreeRef.Group();
    var mainColor = liveryOverride ? liveryOverride.main :
      (spec && spec.defaultLivery ? spec.defaultLivery.main :
      (type === 'ladder' ? 0xbf1328 : (type === 'ambulance' ? 0xf0f2f5 : 0xca1b2e)));
    var trimColor = liveryOverride ? liveryOverride.trim :
      (spec && spec.defaultLivery ? spec.defaultLivery.trim :
      (type === 'ambulance' ? 0xbf1328 : 0xf7e0a2));
    var dark = new ThreeRef.MeshStandardMaterial({ color: 0x141a22, roughness: 0.78, metalness: 0.1 });
    var bodyMat = new ThreeRef.MeshStandardMaterial({ color: mainColor, roughness: 0.5, metalness: 0.34 });
    var trimMat = new ThreeRef.MeshStandardMaterial({ color: trimColor, roughness: 0.35, metalness: 0.4 });
    var metalMat = new ThreeRef.MeshStandardMaterial({ color: 0xa9b6c5, roughness: 0.42, metalness: 0.7 });
    var glassMat = new ThreeRef.MeshStandardMaterial({ color: 0x88a5bf, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.85 });
    var wheelRefs = [];
    var warningLights = [];
    var rotaryRefs = [];

    var chassis = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(2.05, 0.18, 0.86), dark);
    chassis.position.y = 0.22;
    chassis.castShadow = true;
    group.add(chassis);

    var cab = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.62, 0.64, 0.8), bodyMat);
    cab.position.set(0.67, 0.56, 0);
    cab.castShadow = true;
    group.add(cab);

    var windshield = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.54, 0.24, 0.72), glassMat);
    windshield.position.set(0.72, 0.66, 0);
    windshield.rotation.z = -0.18;
    windshield.castShadow = true;
    group.add(windshield);

    if (type === 'ambulance') {
      var ambulanceBox = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(1.2, 0.82, 0.82), bodyMat);
      ambulanceBox.position.set(-0.28, 0.58, 0);
      ambulanceBox.castShadow = true;
      group.add(ambulanceBox);

      var ambStripe = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(1.12, 0.08, 0.83), trimMat);
      ambStripe.position.set(-0.28, 0.66, 0);
      group.add(ambStripe);

      var rearDoor = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.08, 0.5, 0.72), metalMat);
      rearDoor.position.set(-0.9, 0.54, 0);
      group.add(rearDoor);
    } else {
      var body = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(1.26, 0.76, 0.82), bodyMat);
      body.position.set(-0.24, 0.56, 0);
      body.castShadow = true;
      group.add(body);

      var trim = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(1.2, 0.08, 0.84), trimMat);
      trim.position.set(-0.24, 0.64, 0);
      group.add(trim);

      var compartmentMat = new ThreeRef.MeshStandardMaterial({ color: 0xb7c5d2, roughness: 0.36, metalness: 0.72 });
      [-0.67, -0.26, 0.16].forEach(function (offset) {
        var sidePanelA = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.26, 0.24, 0.06), compartmentMat);
        sidePanelA.position.set(offset, 0.48, -0.44);
        group.add(sidePanelA);
        var sidePanelB = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.26, 0.24, 0.06), compartmentMat);
        sidePanelB.position.set(offset, 0.48, 0.44);
        group.add(sidePanelB);
      });

      var pumpPanel = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.22, 0.24, 0.06), metalMat);
      pumpPanel.position.set(0.24, 0.42, 0.44);
      group.add(pumpPanel);

      if (type === 'ladder') {
        var ladderBase = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(1.6, 0.1, 0.2), metalMat);
        ladderBase.position.set(-0.18, 0.95, 0);
        ladderBase.castShadow = true;
        group.add(ladderBase);

        [-0.72, -0.36, 0, 0.36].forEach(function (x) {
          var rung = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.03, 0.03, 0.18), metalMat);
          rung.position.set(x, 0.97, 0);
          group.add(rung);
        });
      } else {
        var hoseBed = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.72, 0.18, 0.72), dark);
        hoseBed.position.set(-0.64, 0.95, 0);
        group.add(hoseBed);
      }
    }

    var wheelMat = new ThreeRef.MeshStandardMaterial({ color: 0x0d1118, roughness: 0.88, metalness: 0.08 });
    var hubMat = new ThreeRef.MeshStandardMaterial({ color: 0xa7b5c3, roughness: 0.35, metalness: 0.76 });
    [-0.7, 0.1, 0.72].forEach(function (x) {
      [-0.42, 0.42].forEach(function (z) {
        var wheel = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.14, 0.14, 0.09, 14), wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.15, z);
        wheel.castShadow = true;
        group.add(wheel);
        wheelRefs.push(wheel);

        var hub = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.07, 0.07, 0.102, 12), hubMat);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(x, 0.15, z);
        group.add(hub);
      });
    });

    var warningSystem = apparatusProfile && apparatusProfile.warningSystem ? apparatusProfile.warningSystem : 'led_red';
    var lightBar = new ThreeRef.Mesh(
      new ThreeRef.BoxGeometry(warningSystem === 'rotary' ? 0.62 : 0.28, 0.08, warningSystem === 'rotary' ? 0.28 : 0.78),
      trimMat
    );
    lightBar.position.set(0.78, 0.94, 0);
    group.add(lightBar);

    if (warningSystem === 'rotary' && type !== 'ambulance') {
      [-0.12, 0.12].forEach(function (zPos) {
        var rotary = createRotaryBeacon();
        rotary.position.set(0.82, 1.01, zPos);
        group.add(rotary);
        rotaryRefs.push(rotary);
      });
    } else {
      var blueMode = warningSystem === 'led_blue';
      [-0.24, 0.24].forEach(function (zPos, idx) {
        var warn = new ThreeRef.Mesh(
          new ThreeRef.SphereGeometry(0.06, 10, 8),
          new ThreeRef.MeshStandardMaterial({
            color: blueMode ? 0x3252ff : (idx === 0 ? 0x3252ff : 0xff2f2f),
            emissive: blueMode ? 0x2441b2 : (idx === 0 ? 0x1a2ea8 : 0xa11a1a),
            emissiveIntensity: 0.28,
            roughness: 0.32,
            metalness: 0.22
          })
        );
        warn.position.set(0.9, 0.98, zPos);
        group.add(warn);
        warningLights.push(warn);
      });
    }

    var numberTag = createNumberTag(label, type === 'ambulance' ? '#111' : '#f6e3b0');
    numberTag.position.set(0.12, 0.8, -0.43);
    group.add(numberTag);

    group.traverse(function (obj) {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    group.userData.wheelRefs = wheelRefs;
    group.userData.warningLights = warningLights;
    group.userData.rotaryRefs = rotaryRefs;
    group.userData.companyType = type;
    group.userData.lastPos = new ThreeRef.Vector3(0, 0, 0);

    return group;
  }

  function createRotaryBeacon() {
    var group = new ThreeRef.Group();
    var domeMat = new ThreeRef.MeshStandardMaterial({
      color: 0xc11d2d,
      emissive: 0x6c141f,
      emissiveIntensity: 0.25,
      roughness: 0.28,
      metalness: 0.12,
      transparent: true,
      opacity: 0.72
    });
    var mirrorMat = new ThreeRef.MeshStandardMaterial({
      color: 0xf9dca3,
      emissive: 0xc44717,
      emissiveIntensity: 0.25,
      roughness: 0.26,
      metalness: 0.48
    });
    var baseMat = new ThreeRef.MeshStandardMaterial({ color: 0x919aa3, roughness: 0.46, metalness: 0.56 });

    var base = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.052, 0.052, 0.02, 10), baseMat);
    base.position.y = 0.012;
    group.add(base);

    var dome = new ThreeRef.Mesh(new ThreeRef.SphereGeometry(0.06, 12, 10), domeMat);
    dome.scale.y = 0.6;
    dome.position.y = 0.05;
    group.add(dome);

    var mirror = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.018, 0.042, 0.088), mirrorMat);
    mirror.position.y = 0.036;
    group.add(mirror);

    group.userData.mirror = mirror;
    group.userData.dome = dome;
    return group;
  }

  function createNumberTag(label, color) {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    var ctx = canvas.getContext('2d');
    var match = label.match(/(\d+)/);
    var num = match ? match[1] : label.slice(0, 3).toUpperCase();
    ctx.fillStyle = 'rgba(0,0,0,0.0)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num, canvas.width / 2, canvas.height / 2);
    var texture = new ThreeRef.CanvasTexture(canvas);
    texture.colorSpace = ThreeRef.SRGBColorSpace;
    texture.needsUpdate = true;
    var mat = new ThreeRef.MeshBasicMaterial({ map: texture, transparent: true });
    var plane = new ThreeRef.Mesh(new ThreeRef.PlaneGeometry(0.48, 0.12), mat);
    return plane;
  }

  function createFirefighterMesh(color) {
    var group = new ThreeRef.Group();
    var turnout = new ThreeRef.MeshStandardMaterial({ color: color, roughness: 0.64, metalness: 0.12 });
    var dark = new ThreeRef.MeshStandardMaterial({ color: 0x121820, roughness: 0.8, metalness: 0.06 });
    var skin = new ThreeRef.MeshStandardMaterial({ color: 0xc89b78, roughness: 0.62, metalness: 0.02 });
    var stripe = new ThreeRef.MeshStandardMaterial({ color: 0xf6d175, roughness: 0.35, metalness: 0.35 });

    var torso = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.17, 0.24, 0.11), turnout);
    torso.position.set(0, 0.34, 0);
    group.add(torso);

    var pelvis = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.14, 0.06, 0.09), turnout);
    pelvis.position.set(0, 0.2, 0);
    group.add(pelvis);

    var leftLegRoot = new ThreeRef.Group();
    leftLegRoot.position.set(-0.05, 0.18, 0);
    group.add(leftLegRoot);
    var leftLeg = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.028, 0.03, 0.2, 8), turnout);
    leftLeg.position.y = -0.1;
    leftLegRoot.add(leftLeg);
    var leftBoot = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.05, 0.04, 0.08), dark);
    leftBoot.position.set(0, -0.21, 0.02);
    leftLegRoot.add(leftBoot);

    var rightLegRoot = new ThreeRef.Group();
    rightLegRoot.position.set(0.05, 0.18, 0);
    group.add(rightLegRoot);
    var rightLeg = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.028, 0.03, 0.2, 8), turnout);
    rightLeg.position.y = -0.1;
    rightLegRoot.add(rightLeg);
    var rightBoot = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.05, 0.04, 0.08), dark);
    rightBoot.position.set(0, -0.21, 0.02);
    rightLegRoot.add(rightBoot);

    var leftArmRoot = new ThreeRef.Group();
    leftArmRoot.position.set(-0.11, 0.41, 0);
    leftArmRoot.rotation.z = 0.24;
    group.add(leftArmRoot);
    var leftArm = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.022, 0.024, 0.19, 8), turnout);
    leftArm.position.y = -0.095;
    leftArmRoot.add(leftArm);

    var rightArmRoot = new ThreeRef.Group();
    rightArmRoot.position.set(0.11, 0.41, 0);
    rightArmRoot.rotation.z = -0.24;
    group.add(rightArmRoot);
    var rightArm = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.022, 0.024, 0.19, 8), turnout);
    rightArm.position.y = -0.095;
    rightArmRoot.add(rightArm);

    var neck = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.028, 0.03, 0.04, 8), skin);
    neck.position.set(0, 0.49, 0);
    group.add(neck);

    var helmet = new ThreeRef.Mesh(new ThreeRef.SphereGeometry(0.072, 12, 10), dark);
    helmet.position.set(0, 0.56, 0);
    group.add(helmet);

    var brim = new ThreeRef.Mesh(new ThreeRef.TorusGeometry(0.072, 0.012, 8, 16), dark);
    brim.rotation.x = Math.PI / 2;
    brim.position.set(0, 0.53, 0);
    group.add(brim);

    var chestStripe = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.16, 0.025, 0.112), stripe);
    chestStripe.position.set(0, 0.31, 0);
    group.add(chestStripe);

    group.traverse(function (obj) {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    group.userData.limbRefs = {
      leftLegRoot: leftLegRoot,
      rightLegRoot: rightLegRoot,
      leftArmRoot: leftArmRoot,
      rightArmRoot: rightArmRoot
    };

    return group;
  }

  function createCarMesh(seed) {
    var group = new ThreeRef.Group();
    var colors = [0x5a6775, 0x7c8a98, 0x536a78, 0x646f7a];
    var main = new ThreeRef.MeshStandardMaterial({ color: colors[seed % colors.length], roughness: 0.58, metalness: 0.3 });
    var glass = new ThreeRef.MeshStandardMaterial({ color: 0x88a1b8, roughness: 0.2, metalness: 0.25, transparent: true, opacity: 0.84 });
    var dark = new ThreeRef.MeshStandardMaterial({ color: 0x0f131a, roughness: 0.86, metalness: 0.06 });

    var body = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(1.36, 0.24, 0.58), main);
    body.position.y = 0.2;
    group.add(body);

    var roof = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.76, 0.2, 0.52), main);
    roof.position.set(0.05, 0.38, 0);
    group.add(roof);

    var windshield = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.22, 0.17, 0.5), glass);
    windshield.position.set(0.32, 0.34, 0);
    windshield.rotation.z = -0.24;
    group.add(windshield);

    [-0.48, 0.48].forEach(function (x) {
      [-0.26, 0.26].forEach(function (z) {
        var wheel = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.095, 0.095, 0.08, 12), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.09, z);
        group.add(wheel);
      });
    });

    group.traverse(function (obj) {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return group;
  }

  function createBuildingMesh(building) {
    var group = new ThreeRef.Group();
    if (building.footprint && building.footprint.length >= 3) {
      var cleanFootprint = sanitizeFootprint(building.footprint);
      if (cleanFootprint.length < 3) {
        return createBoxBuildingMesh(building);
      }
      var centerX = building.centerX != null ? building.centerX : cleanFootprint.reduce(function (acc, p) { return acc + p.x; }, 0) / cleanFootprint.length;
      var centerZ = building.centerZ != null ? building.centerZ : cleanFootprint.reduce(function (acc, p) { return acc + p.z; }, 0) / cleanFootprint.length;
      var shape = new ThreeRef.Shape();
      cleanFootprint.forEach(function (pt, idx) {
        var lx = pt.x - centerX;
        var lz = pt.z - centerZ;
        if (idx === 0) {
          shape.moveTo(lx, lz);
        } else {
          shape.lineTo(lx, lz);
        }
      });
      shape.closePath();

      var extrusion = new ThreeRef.ExtrudeGeometry(shape, {
        depth: building.h,
        bevelEnabled: false,
        steps: 1
      });
      extrusion.rotateX(-Math.PI / 2);
      var shellPoly = new ThreeRef.Mesh(
        extrusion,
        new ThreeRef.MeshStandardMaterial({ color: 0x7c8790, roughness: 0.9, metalness: 0.05 })
      );
      shellPoly.position.set(centerX, 0, centerZ);
      shellPoly.castShadow = true;
      shellPoly.receiveShadow = true;
      group.add(shellPoly);

      var roofPoly = new ThreeRef.Mesh(
        new ThreeRef.ShapeGeometry(shape),
        new ThreeRef.MeshStandardMaterial({ color: 0x4e5964, roughness: 0.82, metalness: 0.12 })
      );
      roofPoly.rotation.x = -Math.PI / 2;
      roofPoly.position.set(centerX, building.h + 0.03, centerZ);
      group.add(roofPoly);

      return group;
    }
    return createBoxBuildingMesh(building);
  }

  function sanitizeFootprint(points) {
    if (!Array.isArray(points)) {
      return [];
    }
    var clean = [];
    points.forEach(function (pt) {
      if (!pt || !isFinite(pt.x) || !isFinite(pt.z)) {
        return;
      }
      var prev = clean[clean.length - 1];
      if (prev && Math.abs(prev.x - pt.x) < 0.0001 && Math.abs(prev.z - pt.z) < 0.0001) {
        return;
      }
      clean.push({ x: pt.x, z: pt.z });
    });
    if (clean.length > 2) {
      var first = clean[0];
      var last = clean[clean.length - 1];
      if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.z - last.z) < 0.0001) {
        clean.pop();
      }
    }
    return clean;
  }

  function createBoxBuildingMesh(building) {
    var group = new ThreeRef.Group();
    var shell = new ThreeRef.Mesh(
      new ThreeRef.BoxGeometry(building.w, building.h, building.d),
      new ThreeRef.MeshStandardMaterial({ color: 0x7c8790, roughness: 0.9, metalness: 0.05 })
    );
    shell.position.y = building.h / 2;
    shell.castShadow = true;
    shell.receiveShadow = true;
    group.add(shell);

    var roofCap = new ThreeRef.Mesh(
      new ThreeRef.BoxGeometry(building.w + 0.04, 0.08, building.d + 0.04),
      new ThreeRef.MeshStandardMaterial({ color: 0x4e5964, roughness: 0.82, metalness: 0.12 })
    );
    roofCap.position.y = building.h + 0.05;
    group.add(roofCap);

    var floors = Math.max(2, Math.floor(building.h));
    var cols = Math.max(2, Math.floor(building.w * 2));
    var windowMat = new ThreeRef.MeshStandardMaterial({ color: 0x87a7c3, emissive: 0x1a2940, emissiveIntensity: 0.22, roughness: 0.32, metalness: 0.24 });
    for (var f = 0; f < floors; f++) {
      for (var c = 0; c < cols; c++) {
        var wx = (-building.w / 2) + 0.28 + (c * (building.w - 0.4) / Math.max(1, cols - 1));
        var wy = 0.5 + f * ((building.h - 0.9) / Math.max(1, floors - 1));
        var front = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.18, 0.18, 0.03), windowMat);
        front.position.set(wx, wy, (building.d / 2) + 0.018);
        group.add(front);

        var back = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.18, 0.18, 0.03), windowMat);
        back.position.set(wx, wy, (-building.d / 2) - 0.018);
        group.add(back);
      }
    }

    return group;
  }

  function createTreeMesh() {
    var group = new ThreeRef.Group();
    var trunk = new ThreeRef.Mesh(
      new ThreeRef.CylinderGeometry(0.06, 0.08, 0.55, 8),
      new ThreeRef.MeshStandardMaterial({ color: 0x6d4f30, roughness: 0.85, metalness: 0.02 })
    );
    trunk.position.y = 0.28;
    group.add(trunk);

    var crown = new ThreeRef.Mesh(
      new ThreeRef.SphereGeometry(0.34, 12, 10),
      new ThreeRef.MeshStandardMaterial({ color: 0x3f6a44, roughness: 0.82, metalness: 0.04 })
    );
    crown.position.y = 0.72;
    group.add(crown);
    return group;
  }

  function createHydrantMesh() {
    var group = new ThreeRef.Group();
    var red = new ThreeRef.MeshStandardMaterial({ color: 0xbe202e, roughness: 0.5, metalness: 0.3 });
    var metal = new ThreeRef.MeshStandardMaterial({ color: 0xd2aa4f, roughness: 0.3, metalness: 0.62 });

    var body = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.09, 0.09, 0.34, 14), red);
    body.position.y = 0.17;
    group.add(body);

    var cap = new ThreeRef.Mesh(new ThreeRef.SphereGeometry(0.08, 12, 10), red);
    cap.position.y = 0.38;
    group.add(cap);

    [-0.12, 0.12].forEach(function (x) {
      var side = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.035, 0.035, 0.1, 10), red);
      side.rotation.z = Math.PI / 2;
      side.position.set(x, 0.24, 0);
      group.add(side);
      var nut = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.02, 0.02, 0.05, 10), metal);
      nut.rotation.z = Math.PI / 2;
      nut.position.set(x + (x > 0 ? 0.05 : -0.05), 0.24, 0);
      group.add(nut);
    });

    return group;
  }

  function createFlameMesh() {
    var flame = new ThreeRef.Mesh(
      new ThreeRef.ConeGeometry(0.36, 1.35, 10),
      new ThreeRef.MeshStandardMaterial({ color: 0xff6a1f, emissive: 0xff3a10, emissiveIntensity: 1.1, roughness: 0.36, metalness: 0.08 })
    );
    flame.castShadow = true;
    return flame;
  }

  function initFallbackScene2d() {
    if (fallbackScene2d) {
      return;
    }
    var canvas = document.createElement('canvas');
    canvas.className = 'scene2d-fallback';
    canvas.setAttribute('aria-label', 'Top-down tactical view');
    els.scene3dHost.innerHTML = '';
    els.scene3dHost.appendChild(canvas);
    fallbackScene2d = {
      canvas: canvas,
      ctx: canvas.getContext('2d')
    };
    ensureFallbackSceneSize();
  }

  function ensureFallbackSceneSize() {
    if (!fallbackScene2d) {
      return;
    }
    var rect = els.scene3dHost.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return;
    }
    var dpr = window.devicePixelRatio || 1;
    fallbackScene2d.canvas.width = Math.floor(rect.width * dpr);
    fallbackScene2d.canvas.height = Math.floor(rect.height * dpr);
    fallbackScene2d.canvas.style.width = rect.width + 'px';
    fallbackScene2d.canvas.style.height = rect.height + 'px';
    fallbackScene2d.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function worldToScreen2d(scene, x, z, width, height) {
    var metrics = getSceneOrthoMetrics(scene, width, height);
    var dx = x - metrics.focusX;
    var dz = z - metrics.focusZ;
    var rx = (dx * metrics.cos) + (dz * metrics.sin);
    var rz = (-dx * metrics.sin) + (dz * metrics.cos);
    var nx = (rx / metrics.worldSpan) + 0.5;
    var nzRaw = (rz / metrics.worldSpan) + 0.5;
    var nz = (nzRaw * metrics.pitchCos) + ((1 - metrics.pitchCos) * 0.5);
    var skewY = ((rx / metrics.worldSpan) * metrics.drawH * metrics.skew);
    return {
      x: metrics.pad + (nx * metrics.drawW),
      y: metrics.pad + ((1 - nz) * metrics.drawH) + skewY
    };
  }

  function screenToWorld2d(scene, sx, sy, width, height) {
    var metrics = getSceneOrthoMetrics(scene, width, height);
    var nx = Math.max(0, Math.min(1, (sx - metrics.pad) / Math.max(1, metrics.drawW)));
    var rxFromNx = (nx - 0.5) * metrics.worldSpan;
    var skewY = (rxFromNx / metrics.worldSpan) * metrics.drawH * metrics.skew;
    var nyScreen = Math.max(0, Math.min(1, 1 - ((sy - metrics.pad - skewY) / Math.max(1, metrics.drawH))));
    var nz = ((nyScreen - ((1 - metrics.pitchCos) * 0.5)) / Math.max(0.001, metrics.pitchCos));
    nz = Math.max(0, Math.min(1, nz));
    var rx = (nx - 0.5) * metrics.worldSpan;
    var rz = (nz - 0.5) * metrics.worldSpan;
    var dx = (rx * metrics.cos) - (rz * metrics.sin);
    var dz = (rx * metrics.sin) + (rz * metrics.cos);
    var x = metrics.focusX + dx;
    var z = metrics.focusZ + dz;
    return {
      x: Math.max(scene.groundMinX, Math.min(scene.groundMaxX, x)),
      z: Math.max(scene.groundMinY, Math.min(scene.groundMaxY, z))
    };
  }

  function getSceneOrthoMetrics(scene, width, height) {
    var pad = FALLBACK_SCENE_VIEW_PAD_PX;
    var drawW = Math.max(1, width - (pad * 2));
    var drawH = Math.max(1, height - (pad * 2));
    var rangeX = Math.max(1, scene.groundMaxX - scene.groundMinX);
    var rangeZ = Math.max(1, scene.groundMaxY - scene.groundMinY);
    var zoom = Math.max(0.42, Math.min(1.25, scene.cameraDistanceScale || 0.62));
    var worldSpan = Math.max(rangeX, rangeZ) * zoom;
    var focusX = scene.focusPoint ? scene.focusPoint.x : ((scene.groundMinX + scene.groundMaxX) * 0.5);
    var focusZ = scene.focusPoint ? scene.focusPoint.z : ((scene.groundMinY + scene.groundMaxY) * 0.5);
    var orbit = scene.cameraOrbit || 0;
    var cos = Math.cos(orbit);
    var sin = Math.sin(orbit);
    return {
      pad: pad,
      drawW: drawW,
      drawH: drawH,
      worldSpan: worldSpan,
      focusX: focusX,
      focusZ: focusZ,
      cos: cos,
      sin: sin,
      pitchCos: FALLBACK_AERIAL_PITCH_COS,
      skew: FALLBACK_AERIAL_SKEW
    };
  }

  function sceneUnitsToPixels(scene, units, width, height) {
    var metrics = getSceneOrthoMetrics(scene, width, height);
    var pxPerX = metrics.drawW / metrics.worldSpan;
    var pxPerZ = metrics.drawH / metrics.worldSpan;
    return Math.max(1, units * Math.min(pxPerX, pxPerZ));
  }

  function renderSceneFallback2d(mission, timeSec) {
    if (!fallbackScene2d) {
      return;
    }
    ensureFallbackSceneSize();
    var canvas = fallbackScene2d.canvas;
    var ctx = fallbackScene2d.ctx;
    var width = canvas.clientWidth || 1;
    var height = canvas.clientHeight || 1;
    var scene = mission.sceneState;

    ctx.clearRect(0, 0, width, height);
    var grd = ctx.createLinearGradient(0, 0, 0, height);
    grd.addColorStop(0, '#223545');
    grd.addColorStop(1, '#1a2731');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, width, height);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    (scene.roadPolylines || []).forEach(function (line) {
      drawRoadDiagram2d(ctx, scene, line, width, height);
    });

    scene.buildings.forEach(function (building) {
      var p = worldToScreen2d(scene, building.x, building.y + building.d, width, height);
      var q = worldToScreen2d(scene, building.x + building.w, building.y, width, height);
      var w = Math.abs(q.x - p.x);
      var h = Math.abs(q.y - p.y);
      ctx.fillStyle = '#7b8995';
      ctx.fillRect(Math.min(p.x, q.x), Math.min(p.y, q.y), w, h);
      ctx.strokeStyle = 'rgba(17,23,28,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.min(p.x, q.x), Math.min(p.y, q.y), w, h);
      if (building.onFire) {
        var fx = Math.min(p.x, q.x) + (w * 0.68);
        var fy = Math.min(p.y, q.y) + (h * 0.24);
        var pulse = 8 + (Math.sin((timeSec * 7)) * 2.2);
        ctx.fillStyle = '#ff7e2f';
        ctx.beginPath();
        ctx.arc(fx, fy, pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    scene.parkedCars.forEach(function (car) {
      var p = worldToScreen2d(scene, car.x, car.y + car.d, width, height);
      var q = worldToScreen2d(scene, car.x + car.w, car.y, width, height);
      ctx.fillStyle = '#5f6f7d';
      ctx.fillRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x), Math.abs(q.y - p.y));
    });

    scene.trees.forEach(function (tree) {
      var pt = worldToScreen2d(scene, tree.x, tree.y, width, height);
      ctx.fillStyle = '#3f7049';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    if (scene.hydrantPoint) {
      var hyd = worldToScreen2d(scene, scene.hydrantPoint.x, scene.hydrantPoint.z, width, height);
      ctx.fillStyle = '#cb2d38';
      ctx.beginPath();
      ctx.arc(hyd.x, hyd.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f4d18a';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    scene.companies.forEach(function (company) {
      var truckCenterX = company.x + 0.28;
      var truckCenterZ = company.y + 0.14;
      var dims = getCompanyFootprintDims(company.type);
      var footprint = getOrientedRectPoints(
        truckCenterX,
        truckCenterZ,
        dims.length,
        dims.width,
        company.heading || 0
      );
      var screenPts = footprint.map(function (pt) {
        return worldToScreen2d(scene, pt.x, pt.z, width, height);
      });
      ctx.fillStyle = company.type === 'ladder' ? '#b71a2d' : (company.type === 'ambulance' ? '#e8ecef' : '#ca1b2e');
      ctx.beginPath();
      screenPts.forEach(function (pt, idx) {
        if (idx === 0) {
          ctx.moveTo(pt.x, pt.y);
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      });
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#0f1419';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      var center = worldToScreen2d(scene, truckCenterX, truckCenterZ, width, height);
      ctx.fillStyle = company.type === 'ambulance' ? '#111' : '#ffe2b3';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(company.label.replace(/[^\d]/g, '').slice(0, 4), center.x, center.y + 3);

      if (scene.selectedFirefighterId) {
        (company.compartments || []).forEach(function (comp) {
          var cp = getCompartmentWorldPoint(company, comp);
          var cps = worldToScreen2d(scene, cp.x, cp.z, width, height);
          ctx.fillStyle = 'rgba(255, 186, 110, 0.9)';
          ctx.beginPath();
          ctx.arc(cps.x, cps.y, 3.8, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    });

    scene.firefighters.forEach(function (ff) {
      var pff = worldToScreen2d(scene, ff.x, ff.y, width, height);
      var ffRadiusPx = Math.max(3, sceneUnitsToPixels(scene, FIREFIGHTER_COLLIDER_RADIUS, width, height));
      ctx.fillStyle = ff.selected ? '#ffd166' : '#dff0ff';
      ctx.beginPath();
      ctx.arc(pff.x, pff.y, ff.selected ? ffRadiusPx + 1.4 : ffRadiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1c2a33';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });

    if (mission.inventory.hoseDeployed > 0) {
      var eng = scene.companies.find(function (c) { return c.type === 'engine'; }) || scene.companies[0];
      var fireB = scene.buildings.find(function (b) { return b.onFire; }) || scene.buildings[0];
      if (eng && fireB) {
        var engHit = eng.hitbox || createCompanyCollider(eng);
        var from = worldToScreen2d(scene, (engHit.minX + engHit.maxX) * 0.5, (engHit.minZ + engHit.maxZ) * 0.5, width, height);
        var to = worldToScreen2d(scene, fireB.x + (fireB.w * 0.5), fireB.y + (fireB.d * 0.5), width, height);
        ctx.strokeStyle = '#ffca82';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(6, 12, 18, 0.58)';
    ctx.fillRect(10, 10, 280, 34);
    ctx.fillStyle = '#c7dbed';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TOP-DOWN COMMAND VIEW (OSM ROAD DIAGRAM)', 18, 30);
  }

  function drawRoadDiagram2d(ctx, scene, line, width, height) {
    if (!line || line.length < 2) {
      return;
    }
    var renderLine = extendPolylineForRender(line, 3.5);
    var screenLine = renderLine.map(function (pt) {
      return worldToScreen2d(scene, pt.x, pt.z, width, height);
    });
    if (screenLine.length < 2) {
      return;
    }

    var style = roadDiagramStyleForLine(line);
    var roadPx = Math.max(5, sceneUnitsToPixels(scene, line.roadWidth || 0.82, width, height));
    var boundaryPx = Math.max(1.1, roadPx * 0.035);

    ctx.strokeStyle = style.casing;
    ctx.lineWidth = roadPx + Math.max(2.2, roadPx * 0.2);
    drawScreenPolyline(ctx, screenLine);

    ctx.strokeStyle = style.asphalt;
    ctx.lineWidth = roadPx;
    drawScreenPolyline(ctx, screenLine);

    var edgeOffset = Math.max(0.8, (roadPx * 0.5) - (boundaryPx * 0.9));
    ctx.strokeStyle = style.edgeLine;
    ctx.lineWidth = boundaryPx;
    ctx.setLineDash([]);
    drawScreenPolyline(ctx, offsetScreenPolyline(screenLine, edgeOffset));
    drawScreenPolyline(ctx, offsetScreenPolyline(screenLine, -edgeOffset));

    var laneCount = Math.max(1, style.lanes);
    var laneWidth = roadPx / laneCount;
    var center = laneCount * 0.5;

    for (var laneIdx = 1; laneIdx < laneCount; laneIdx++) {
      var laneOffset = (laneIdx - center) * laneWidth;
      var atCenter = Math.abs(laneOffset) < (laneWidth * 0.26);
      if (atCenter && !style.oneWay) {
        if (laneCount >= 4 || style.major) {
          ctx.strokeStyle = style.centerDivider;
          ctx.lineWidth = Math.max(1.4, laneWidth * 0.17);
          ctx.setLineDash([]);
          drawScreenPolyline(ctx, offsetScreenPolyline(screenLine, laneOffset - 1.2));
          drawScreenPolyline(ctx, offsetScreenPolyline(screenLine, laneOffset + 1.2));
        } else {
          ctx.strokeStyle = style.centerDivider;
          ctx.lineWidth = Math.max(1.25, laneWidth * 0.15);
          ctx.setLineDash([Math.max(9, laneWidth * 1.55), Math.max(8, laneWidth * 1.3)]);
          drawScreenPolyline(ctx, offsetScreenPolyline(screenLine, laneOffset));
        }
      } else {
        ctx.strokeStyle = style.laneDivider;
        ctx.lineWidth = Math.max(1, laneWidth * 0.11);
        ctx.setLineDash([Math.max(8, laneWidth * 1.35), Math.max(9, laneWidth * 1.7)]);
        drawScreenPolyline(ctx, offsetScreenPolyline(screenLine, laneOffset));
      }
    }
    ctx.setLineDash([]);
  }

  function roadDiagramStyleForLine(line) {
    var roadType = (line.roadType || 'residential').toLowerCase();
    var lanes = Math.max(1, Math.min(8, parseInt(line.roadLanes || estimateLanesFromWidth(line.roadWidth || roadWidthForType(roadType)), 10) || 2));
    var oneWay = !!line.roadOneWay;
    var major = roadType === 'motorway' || roadType === 'trunk' || roadType === 'primary' || roadType === 'secondary';

    return {
      major: major,
      lanes: lanes,
      oneWay: oneWay,
      casing: major ? '#1f252c' : '#202830',
      asphalt: major ? '#3a414a' : '#343c44',
      edgeLine: '#dfe5eb',
      laneDivider: '#d8dde3',
      centerDivider: '#f2d46d'
    };
  }

  function drawScreenPolyline(ctx, pts) {
    if (!pts || pts.length < 2) {
      return;
    }
    ctx.beginPath();
    pts.forEach(function (pt, idx) {
      if (idx === 0) {
        ctx.moveTo(pt.x, pt.y);
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    });
    ctx.stroke();
  }

  function offsetScreenPolyline(pts, offsetPx) {
    if (!pts || pts.length < 2) {
      return pts || [];
    }
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var prev = pts[Math.max(0, i - 1)];
      var next = pts[Math.min(pts.length - 1, i + 1)];
      var tx = next.x - prev.x;
      var ty = next.y - prev.y;
      var len = Math.sqrt((tx * tx) + (ty * ty));
      if (len < 0.0001) {
        out.push({ x: pts[i].x, y: pts[i].y });
        continue;
      }
      var nx = -ty / len;
      var ny = tx / len;
      out.push({
        x: pts[i].x + (nx * offsetPx),
        y: pts[i].y + (ny * offsetPx)
      });
    }
    return out;
  }

  function extendPolylineForRender(line, extendUnits) {
    if (!line || line.length < 2) {
      return line || [];
    }
    var out = line.map(function (pt) {
      return { x: pt.x, z: pt.z };
    });
    var first = out[0];
    var second = out[1];
    var last = out[out.length - 1];
    var prev = out[out.length - 2];

    var startDx = second.x - first.x;
    var startDz = second.z - first.z;
    var startLen = Math.max(0.0001, Math.sqrt((startDx * startDx) + (startDz * startDz)));
    out[0] = {
      x: first.x - (startDx / startLen) * extendUnits,
      z: first.z - (startDz / startLen) * extendUnits
    };

    var endDx = last.x - prev.x;
    var endDz = last.z - prev.z;
    var endLen = Math.max(0.0001, Math.sqrt((endDx * endDx) + (endDz * endDz)));
    out[out.length - 1] = {
      x: last.x + (endDx / endLen) * extendUnits,
      z: last.z + (endDz / endLen) * extendUnits
    };

    out.roadWidth = line.roadWidth;
    out.roadType = line.roadType;
    return out;
  }

  function createSmokeGroup() {
    var group = new ThreeRef.Group();
    var smokeMat = new ThreeRef.MeshStandardMaterial({
      color: 0x6f7680,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0.55
    });

    for (var i = 0; i < 6; i++) {
      var puff = new ThreeRef.Mesh(
        new ThreeRef.SphereGeometry(0.15 + (i * 0.06), 10, 8),
        smokeMat.clone()
      );
      puff.position.set(
        (session.rng() - 0.5) * 0.45,
        i * 0.18,
        (session.rng() - 0.5) * 0.45
      );
      puff.userData.basePos = puff.position.clone();
      puff.userData.seed = session.rng() * Math.PI * 2;
      group.add(puff);
    }

    return group;
  }

  function addRoadPolylineMeshes(root, polyline) {
    var roadWidth = polyline.roadWidth || 1.9;
    var roadType = polyline.roadType || 'residential';
    for (var i = 1; i < polyline.length; i++) {
      var a = polyline[i - 1];
      var b = polyline[i];
      var meshes = createRoadSegmentMeshes(a, b, roadWidth, roadType);
      meshes.forEach(function (mesh) {
        root.add(mesh);
      });
    }
  }

  function createRoadSegmentMeshes(a, b, roadWidth, roadType) {
    var dx = b.x - a.x;
    var dz = b.z - a.z;
    var len = Math.sqrt((dx * dx) + (dz * dz));
    if (len < 0.3) {
      return [];
    }

    var angle = Math.atan2(dz, dx);
    var cx = (a.x + b.x) / 2;
    var cz = (a.z + b.z) / 2;
    var width = (roadWidth || 1.92) * 1.12;
    var style = getRoadStyleSet(roadType);
    var shoulderWidth = Math.max(0.16, Math.min(0.34, width * 0.13));
    var sidewalkWidth = Math.max(0.18, Math.min(0.42, width * 0.18));
    var meshes = [];

    var road = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(len, 0.03, width), style.asphalt);
    road.position.set(cx, 0.016, cz);
    road.rotation.y = -angle;
    road.receiveShadow = true;
    meshes.push(road);

    [-1, 1].forEach(function (side) {
      var shoulder = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(len, 0.022, shoulderWidth), style.shoulder);
      var shoulderOff = (width / 2) - (shoulderWidth / 2);
      var nxs = -Math.sin(angle);
      var nzs = Math.cos(angle);
      shoulder.position.set(cx + (nxs * shoulderOff * side), 0.018, cz + (nzs * shoulderOff * side));
      shoulder.rotation.y = -angle;
      shoulder.receiveShadow = true;
      meshes.push(shoulder);

      var curb = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(len, 0.036, sidewalkWidth), style.curb);
      var off = (width / 2) + (sidewalkWidth / 2);
      var nxc = -Math.sin(angle);
      var nzc = Math.cos(angle);
      curb.position.set(cx + (nxc * off * side), 0.024, cz + (nzc * off * side));
      curb.rotation.y = -angle;
      curb.receiveShadow = true;
      meshes.push(curb);
    });

    var centerStyle = centerLineStyleForRoad(roadType);
    if (centerStyle === 'double-yellow') {
      [-0.055, 0.055].forEach(function (offset) {
        var doubleLine = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(len, 0.01, 0.03), style.centerYellow);
        var nx = -Math.sin(angle);
        var nz = Math.cos(angle);
        doubleLine.position.set(cx + (nx * offset), 0.034, cz + (nz * offset));
        doubleLine.rotation.y = -angle;
        meshes.push(doubleLine);
      });
    } else if (centerStyle === 'solid-white') {
      var solid = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(len, 0.01, 0.04), style.centerWhite);
      solid.position.set(cx, 0.034, cz);
      solid.rotation.y = -angle;
      meshes.push(solid);
    } else {
      var dashCount = Math.max(1, Math.floor(len / 1.5));
      for (var d = 0; d < dashCount; d++) {
        var t = (d + 0.5) / dashCount;
        var dash = new ThreeRef.Mesh(
          new ThreeRef.BoxGeometry(Math.min(0.7, len / dashCount * 0.64), 0.01, 0.05),
          style.centerWhite
        );
        dash.position.set(
          a.x + (dx * t),
          0.034,
          a.z + (dz * t)
        );
        dash.rotation.y = -angle;
        meshes.push(dash);
      }
    }

    if (width > 2.45) {
      var laneDividerCount = Math.max(1, Math.floor((width - 0.9) / 0.82) - 1);
      for (var l = 0; l < laneDividerCount; l++) {
        var laneOffset = ((l + 1) / (laneDividerCount + 1) - 0.5) * (width - 0.34);
        var divider = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(len, 0.01, 0.03), style.laneDivider);
        var dnx = -Math.sin(angle);
        var dnz = Math.cos(angle);
        divider.position.set(cx + (dnx * laneOffset), 0.033, cz + (dnz * laneOffset));
        divider.rotation.y = -angle;
        meshes.push(divider);
      }
    }

    return meshes;
  }

  function centerLineStyleForRoad(roadType) {
    var t = (roadType || '').toLowerCase();
    if (t === 'motorway') {
      return 'dashed-white';
    }
    if (t === 'trunk' || t === 'primary' || t === 'secondary') {
      return 'double-yellow';
    }
    if (t === 'service') {
      return 'solid-white';
    }
    return 'dashed-white';
  }

  function getRoadStyleSet(roadType) {
    var key = (roadType || 'residential').toLowerCase();
    if (roadMaterialCache[key]) {
      return roadMaterialCache[key];
    }

    var asphaltColor = key === 'motorway' ? 0x282d35 : (key === 'service' ? 0x353c45 : 0x313841);
    var shoulderColor = key === 'motorway' ? 0x38414a : 0x424c57;
    var curbColor = 0x707782;
    var centerYellowColor = 0xeac86c;
    var centerWhiteColor = 0xdce2e8;
    var laneDividerColor = 0xc2c9cf;

    roadMaterialCache[key] = {
      asphalt: new ThreeRef.MeshStandardMaterial({ color: asphaltColor, roughness: 0.93, metalness: 0.05 }),
      shoulder: new ThreeRef.MeshStandardMaterial({ color: shoulderColor, roughness: 0.9, metalness: 0.05 }),
      curb: new ThreeRef.MeshStandardMaterial({ color: curbColor, roughness: 0.85, metalness: 0.08 }),
      centerYellow: new ThreeRef.MeshStandardMaterial({ color: centerYellowColor, roughness: 0.55, metalness: 0.2, emissive: 0x4a3a12, emissiveIntensity: 0.11 }),
      centerWhite: new ThreeRef.MeshStandardMaterial({ color: centerWhiteColor, roughness: 0.58, metalness: 0.18, emissive: 0x293442, emissiveIntensity: 0.07 }),
      laneDivider: new ThreeRef.MeshStandardMaterial({ color: laneDividerColor, roughness: 0.6, metalness: 0.16 })
    };
    return roadMaterialCache[key];
  }

  function addStreetProps(root, sceneData) {
    var lines = sceneData.roadPolylines || [];
    if (!lines.length) {
      return;
    }

    var lights = sampleRoadsidePoints(lines, 6, 2.25, 3.25);
    lights.forEach(function (pt) {
      var light = createStreetLightMesh();
      light.position.set(pt.x, 0, pt.z);
      root.add(light);
    });

    var primary = sceneData.companies[0];
    if (primary) {
      var baseX = primary.targetX + 0.8;
      var baseZ = primary.targetY + 0.35;
      var coneOffsets = [
        { x: -0.65, z: -0.75 },
        { x: -0.95, z: 0.72 },
        { x: 0.88, z: -0.68 },
        { x: 1.2, z: 0.62 }
      ];
      coneOffsets.forEach(function (off) {
        var cone = createTrafficConeMesh();
        cone.position.set(baseX + off.x, 0, baseZ + off.z);
        root.add(cone);
      });
    }
  }

  function sampleRoadsidePoints(lines, count, minOffset, maxOffset) {
    var points = [];
    var segments = [];
    lines.forEach(function (line) {
      for (var i = 1; i < line.length; i++) {
        var a = line[i - 1];
        var b = line[i];
        var dx = b.x - a.x;
        var dz = b.z - a.z;
        var len = Math.sqrt((dx * dx) + (dz * dz));
        if (len > 0.8) {
          segments.push({ a: a, b: b, dx: dx, dz: dz, len: len });
        }
      }
    });
    if (!segments.length) {
      return points;
    }

    for (var c = 0; c < count; c++) {
      var seg = segments[Math.floor(session.rng() * segments.length)];
      var t = 0.12 + (session.rng() * 0.76);
      var baseX = seg.a.x + (seg.dx * t);
      var baseZ = seg.a.z + (seg.dz * t);
      var nx = -seg.dz / seg.len;
      var nz = seg.dx / seg.len;
      var side = session.rng() > 0.5 ? 1 : -1;
      var off = minOffset + (session.rng() * (maxOffset - minOffset));
      points.push({
        x: baseX + (nx * side * off),
        z: baseZ + (nz * side * off)
      });
    }
    return points;
  }

  function createStreetLightMesh() {
    var group = new ThreeRef.Group();
    var poleMat = new ThreeRef.MeshStandardMaterial({ color: 0x4e5d68, roughness: 0.78, metalness: 0.22 });
    var lampMat = new ThreeRef.MeshStandardMaterial({ color: 0xd6e3ef, emissive: 0xc9deff, emissiveIntensity: 0.25, roughness: 0.34, metalness: 0.4 });

    var pole = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.045, 0.055, 1.9, 10), poleMat);
    pole.position.y = 0.95;
    group.add(pole);

    var arm = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.54, 0.04, 0.04), poleMat);
    arm.position.set(0.26, 1.84, 0);
    group.add(arm);

    var lamp = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.12, 0.08, 0.09), lampMat);
    lamp.position.set(0.5, 1.82, 0);
    group.add(lamp);

    group.traverse(function (obj) {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return group;
  }

  function createTrafficConeMesh() {
    var group = new ThreeRef.Group();
    var orange = new ThreeRef.MeshStandardMaterial({ color: 0xff7a2d, roughness: 0.48, metalness: 0.12 });
    var white = new ThreeRef.MeshStandardMaterial({ color: 0xf3f5f7, roughness: 0.35, metalness: 0.22 });
    var baseMat = new ThreeRef.MeshStandardMaterial({ color: 0x232b34, roughness: 0.82, metalness: 0.08 });

    var cone = new ThreeRef.Mesh(new ThreeRef.ConeGeometry(0.12, 0.36, 12), orange);
    cone.position.y = 0.2;
    group.add(cone);

    var band = new ThreeRef.Mesh(new ThreeRef.CylinderGeometry(0.095, 0.105, 0.06, 12), white);
    band.position.y = 0.2;
    group.add(band);

    var base = new ThreeRef.Mesh(new ThreeRef.BoxGeometry(0.24, 0.03, 0.24), baseMat);
    base.position.y = 0.015;
    group.add(base);

    group.traverse(function (obj) {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return group;
  }

  function createLineMesh(colorHex, emissiveHex) {
    var mesh = new ThreeRef.Mesh(
      new ThreeRef.CylinderGeometry(1, 1, 1, 10),
      new ThreeRef.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.4,
        metalness: 0.18,
        emissive: emissiveHex,
        emissiveIntensity: 0.25
      })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function setCylinderBetween(mesh, from, to, radius) {
    var dir = new ThreeRef.Vector3().subVectors(to, from);
    var len = dir.length();
    if (len < 0.001) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.scale.set(radius, len, radius);
    mesh.quaternion.setFromUnitVectors(new ThreeRef.Vector3(0, 1, 0), dir.normalize());
  }

  function updateHoseLines(mission) {
    if (!threeState || !threeState.missionRoot) {
      return;
    }

    var scene = mission.sceneState;
    var primary = scene.companies.find(function (c) { return c.type === 'engine'; }) || scene.companies[0];
    var fireBuilding = scene.buildings.find(function (b) { return b.onFire; }) || scene.buildings[0];
    if (!primary || !primary._threeTruck || !fireBuilding) {
      return;
    }

    if (!threeState.attackLine) {
      threeState.attackLine = createLineMesh(0xffc47a, 0x7d3b1d);
      threeState.missionRoot.add(threeState.attackLine);
    }
    if (!threeState.supplyLine) {
      threeState.supplyLine = createLineMesh(0x6fc3ff, 0x1b4564);
      threeState.missionRoot.add(threeState.supplyLine);
    }

    var truckPos = primary._threeTruck.position.clone();
    var attackFrom = new ThreeRef.Vector3(truckPos.x - 0.88, 0.46, truckPos.z + 0.12);
    var attackTo = new ThreeRef.Vector3(
      fireBuilding.x + (fireBuilding.w * 0.5),
      0.4,
      fireBuilding.y + (fireBuilding.d * 0.5)
    );

    if (mission.inventory.hoseDeployed > 0) {
      setCylinderBetween(threeState.attackLine, attackFrom, attackTo, 0.03 + (Math.min(3, mission.inventory.hoseDeployed) * 0.002));
    } else {
      threeState.attackLine.visible = false;
    }

    if (threeState.hydrantMesh && mission.inventory.hydrantsConnected > 0) {
      var hydrantPos = threeState.hydrantMesh.position.clone();
      var supplyFrom = new ThreeRef.Vector3(hydrantPos.x, 0.3, hydrantPos.z);
      var supplyTo = new ThreeRef.Vector3(truckPos.x + 0.42, 0.44, truckPos.z + 0.34);
      setCylinderBetween(threeState.supplyLine, supplyFrom, supplyTo, 0.025);
    } else if (threeState.supplyLine) {
      threeState.supplyLine.visible = false;
    }
  }

  function renderThreeScene(mission, timeSec) {
    if (!threeState) {
      return;
    }
    ensureThreeSize();

    mission.sceneState.companies.forEach(function (company) {
      if (company._threeTruck) {
        var newPos = new ThreeRef.Vector3(company.x + 0.9, 0, company.y + 0.41);
        var prev = company._threeTruck.userData.lastPos || newPos.clone();
        var delta = newPos.clone().sub(prev);
        var moved = delta.length();
        company._threeTruck.position.copy(newPos);
        company._threeTruck.rotation.y = -company.heading;
        company._threeTruck.userData.lastPos = newPos.clone();
        company._threeTruck.userData.hitbox = createCompanyCollider(company);

        (company._threeTruck.userData.wheelRefs || []).forEach(function (wheel) {
          wheel.rotation.x += moved * 3.8;
        });

        var lights = company._threeTruck.userData.warningLights || [];
        lights.forEach(function (warn, idx) {
          var pulse = Math.sin((timeSec * 10) + (idx * Math.PI));
          if (warn.material) {
            warn.material.emissiveIntensity = 0.15 + Math.max(0, pulse) * 1.25;
          }
        });

        var rotaries = company._threeTruck.userData.rotaryRefs || [];
        rotaries.forEach(function (rotary, idx) {
          rotary.rotation.y = (idx % 2 === 0 ? 1 : -1) * timeSec * 9.6;
          var mirror = rotary.userData.mirror;
          if (mirror && mirror.material) {
            mirror.material.emissiveIntensity = 0.22 + Math.max(0, Math.sin((timeSec * 16) + (idx * 1.2))) * 1.2;
          }
          var dome = rotary.userData.dome;
          if (dome && dome.material) {
            dome.material.emissiveIntensity = 0.14 + Math.max(0, Math.cos((timeSec * 8.5) + idx)) * 0.45;
          }
        });
      }
    });

    mission.sceneState.firefighters.forEach(function (ff) {
      if (!ff._threeMesh) {
        return;
      }
      var moving = ff.targetX != null && ff.targetY != null;
      var bob = moving ? Math.sin(ff.walkPhase || 0) * 0.025 : 0;
      ff._threeMesh.position.set(ff.x, bob, ff.y);
      ff._threeMesh.rotation.y = -ff.heading;
      ff._threeMesh.userData.hitbox = createFirefighterCollider(ff, ff.x, ff.y);
      var limbs = ff._threeMesh.userData.limbRefs;
      if (limbs) {
        var swing = moving ? Math.sin(ff.walkPhase || 0) * 0.52 : 0;
        limbs.leftLegRoot.rotation.x = swing;
        limbs.rightLegRoot.rotation.x = -swing;
        limbs.leftArmRoot.rotation.x = -swing * 0.75;
        limbs.rightArmRoot.rotation.x = swing * 0.75;
      }
      ff._threeMesh.traverse(function (obj) {
        if (obj.isMesh && obj.material && Object.prototype.hasOwnProperty.call(obj.material, 'emissiveIntensity')) {
          obj.material.emissive = new ThreeRef.Color(ff.selected ? 0x7a3f16 : 0x000000);
          obj.material.emissiveIntensity = ff.selected ? 0.28 : 0;
        }
      });
    });

    threeState.flameMeshes.forEach(function (flame, idx) {
      var s = 1 + (Math.sin((timeSec * 7) + idx) * 0.1);
      flame.scale.set(s, 0.95 + (Math.abs(Math.sin(timeSec * 11 + idx)) * 0.35), s);
      var baseY = flame.userData.baseY || flame.position.y;
      flame.position.y = baseY + (Math.sin((timeSec * 6) + idx) * 0.05);
    });

    threeState.smokeGroups.forEach(function (group, idx) {
      var base = group.userData.baseY || group.position.y;
      group.position.y = base + (Math.sin((timeSec * 0.6) + idx) * 0.1);
      group.children.forEach(function (puff, puffIdx) {
        var basePos = puff.userData.basePos || puff.position;
        var phase = (timeSec * 0.85) + puff.userData.seed + (puffIdx * 0.35);
        puff.position.x = basePos.x + (Math.sin(phase) * 0.08);
        puff.position.z = basePos.z + (Math.cos(phase * 1.1) * 0.08);
        puff.position.y = basePos.y + ((phase % (Math.PI * 2)) * 0.03);
        var scale = 0.92 + (Math.sin(phase * 1.3) * 0.12);
        puff.scale.set(scale, scale, scale);
        if (puff.material) {
          puff.material.opacity = 0.42 + (Math.sin(phase) * 0.12);
        }
      });
    });

    updateHoseLines(mission);

    if (threeState.selectionRing) {
      var selected = mission.sceneState.firefighters.find(function (ff) { return ff.selected; });
      if (selected) {
        threeState.selectionRing.visible = true;
        threeState.selectionRing.position.set(selected.x, 0.02, selected.y);
      } else {
        threeState.selectionRing.visible = false;
      }
    }

    var focus = mission.sceneState.focusPoint || { x: 5.8, y: 1.0, z: 1.3 };
    if (mission.sceneState.cameraZoomIn) {
      mission.sceneState.cameraTween = Math.min(1, mission.sceneState.cameraTween + 0.018);
    }
    var t = mission.sceneState.cameraTween || 0;
    var orbit = mission.sceneState.cameraOrbit || 0;
    var distScale = mission.sceneState.cameraDistanceScale || 1;
    var wideOffset = rotateOffset(20 * distScale, 12 * distScale, orbit);
    var closeOffset = rotateOffset(11 * distScale, 6.6 * distScale, orbit);
    var wide = { x: focus.x + wideOffset.x, y: 22 + ((distScale - 1) * 5), z: focus.z + wideOffset.z };
    var close = { x: focus.x + closeOffset.x, y: 12 + ((distScale - 1) * 3), z: focus.z + closeOffset.z };
    threeState.camera.position.set(
      lerp(wide.x, close.x, t),
      lerp(wide.y, close.y, t),
      lerp(wide.z, close.z, t)
    );
    threeState.camera.lookAt(focus.x, focus.y, focus.z);
    threeState.renderer.render(threeState.scene, threeState.camera);
  }

  function screenPointerFromEvent(event) {
    var rect = els.scene3dHost.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    };
  }

  function sceneHandleLeftClick(event) {
    if (!session || session.view !== Sim.SessionView.SCENE_3D) {
      return;
    }

    var mission = Sim.getFocusedMission(session);
    if (!mission || !mission.sceneState) {
      return;
    }

    if (FORCE_TOPDOWN_SCENE || !threeState) {
      sceneHandleFallbackLeftClick(event, mission);
      return;
    }

    var p = screenPointerFromEvent(event);
    threeState.pointer.set(p.x, p.y);
    threeState.raycaster.setFromCamera(threeState.pointer, threeState.camera);

    var objects = Object.keys(threeState.firefighterMeshes).map(function (id) { return threeState.firefighterMeshes[id]; })
      .concat(threeState.hotspots);
    var hits = threeState.raycaster.intersectObjects(objects, true);
    if (!hits.length) {
      return;
    }

    var node = hits[0].object;
    while (node && !node.userData.type && node.parent) {
      node = node.parent;
    }

    if (node.userData.type === 'firefighter') {
      selectFirefighterById(mission, node.userData.ffId);
      render();
      return;
    }

    if (node.userData.type === 'hotspot') {
      showToast('Right-click this compartment to assign action.');
      render();
    }
  }

  function sceneHandleRightClick(event) {
    if (!session || session.view !== Sim.SessionView.SCENE_3D) {
      return;
    }

    var mission = Sim.getFocusedMission(session);
    if (!mission || !mission.sceneState) {
      return;
    }

    event.preventDefault();
    var scene = mission.sceneState;
    if (!scene.selectedFirefighterId) {
      showToast('Select firefighter first.');
      return;
    }

    if (FORCE_TOPDOWN_SCENE || !threeState) {
      sceneHandleFallbackRightClick(event, mission);
      return;
    }

    var p = screenPointerFromEvent(event);
    threeState.pointer.set(p.x, p.y);
    threeState.raycaster.setFromCamera(threeState.pointer, threeState.camera);
    var hotspotHits = threeState.raycaster.intersectObjects(threeState.hotspots, true);
    if (hotspotHits.length) {
      var hotNode = hotspotHits[0].object;
      while (hotNode && hotNode.parent && hotNode.userData.type !== 'hotspot') {
        hotNode = hotNode.parent;
      }
      if (hotNode && hotNode.userData && hotNode.userData.type === 'hotspot') {
        var ffHot = scene.firefighters.find(function (entry) { return entry.id === scene.selectedFirefighterId; });
        if (!ffHot) {
          return;
        }
        queueFirefighterAction(mission, ffHot, hotNode.userData.action, hotspotHits[0].point.x, hotspotHits[0].point.z);
        render();
        return;
      }
    }

    var hits = threeState.raycaster.intersectObject(threeState.ground, false);
    if (!hits.length) {
      return;
    }

    var point = hits[0].point;
    var ff = scene.firefighters.find(function (entry) { return entry.id === scene.selectedFirefighterId; });
    if (!ff) {
      return;
    }
    var projected = projectPointToWalkable(scene, ff, point.x, point.z);
    ff.pendingAction = null;
    ff.targetX = projected.x;
    ff.targetY = projected.z;
    render();
  }

  function getCompartmentWorldPoint(company, comp) {
    var compScale = company.type === 'ambulance' ? 0.2 : 0.28;
    return {
      x: company.x + 0.28 + (comp.ox * compScale),
      z: company.y + 0.14 + (comp.oy * compScale)
    };
  }

  function pointInsideRect2d(point, rect) {
    return point.x >= rect.x && point.x <= (rect.x + rect.w) && point.z >= rect.y && point.z <= (rect.y + rect.d);
  }

  function sceneHandleFallbackLeftClick(event, mission) {
    if (!fallbackScene2d) {
      return;
    }
    var rect = fallbackScene2d.canvas.getBoundingClientRect();
    var sx = event.clientX - rect.left;
    var sy = event.clientY - rect.top;
    var scene = mission.sceneState;
    var hit = null;
    var hitDist = Infinity;
    scene.firefighters.forEach(function (ff) {
      var p = worldToScreen2d(scene, ff.x, ff.y, rect.width, rect.height);
      var d = Math.sqrt(Math.pow(p.x - sx, 2) + Math.pow(p.y - sy, 2));
      if (d < 18 && d < hitDist) {
        hit = ff;
        hitDist = d;
      }
    });
    if (hit) {
      selectFirefighterById(mission, hit.id);
      render();
      return;
    }

    if (scene.selectedFirefighterId) {
      var world = screenToWorld2d(
        scene,
        sx,
        sy,
        rect.width,
        rect.height
      );
      var nearest = null;
      scene.companies.forEach(function (company) {
        (company.compartments || []).forEach(function (comp) {
          var pos = getCompartmentWorldPoint(company, comp);
          var dx = world.x - pos.x;
          var dz = world.z - pos.z;
          var dist = Math.sqrt((dx * dx) + (dz * dz));
          if (!nearest || dist < nearest.dist) {
            nearest = { dist: dist, comp: comp };
          }
        });
      });
      if (nearest && nearest.dist <= 0.82) {
        showToast('Right-click to assign: ' + actionLabelForType(nearest.comp.action));
      }
    }
  }

  function sceneHandleFallbackRightClick(event, mission) {
    if (!fallbackScene2d) {
      return;
    }
    var rect = fallbackScene2d.canvas.getBoundingClientRect();
    var scene = mission.sceneState;
    var world = screenToWorld2d(
      scene,
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height
    );
    var ff = scene.firefighters.find(function (entry) { return entry.id === scene.selectedFirefighterId; });
    if (!ff) {
      return;
    }

    if (scene.hydrantPoint) {
      var hydDx = world.x - scene.hydrantPoint.x;
      var hydDz = world.z - scene.hydrantPoint.z;
      if (Math.sqrt((hydDx * hydDx) + (hydDz * hydDz)) <= 0.58) {
        queueFirefighterAction(mission, ff, 'connect_hydrant', scene.hydrantPoint.x, scene.hydrantPoint.z);
        render();
        return;
      }
    }

    var closestComp = null;
    scene.companies.forEach(function (company) {
      (company.compartments || []).forEach(function (comp) {
        var cpt = getCompartmentWorldPoint(company, comp);
        var dx = world.x - cpt.x;
        var dz = world.z - cpt.z;
        var dist = Math.sqrt((dx * dx) + (dz * dz));
        if (!closestComp || dist < closestComp.dist) {
          closestComp = {
            dist: dist,
            company: company,
            comp: comp,
            x: cpt.x,
            z: cpt.z
          };
        }
      });
    });

    if (closestComp && closestComp.dist <= 0.78) {
      queueFirefighterAction(mission, ff, closestComp.comp.action, closestComp.x, closestComp.z);
      render();
      return;
    }

    var fireBuilding = (scene.buildings || []).find(function (b) { return b.onFire; });
    if (fireBuilding && pointInsideRect2d(world, fireBuilding)) {
      var buildAction = 'forcible_entry';
      if (mission.inventory.forcibleEntryOps > 0 && mission.inventory.primarySearchOps < Math.max(1, mission.civiliansKnown)) {
        buildAction = 'primary_search';
      } else if (mission.inventory.primarySearchOps >= Math.max(1, mission.civiliansKnown) && mission.inventory.linesCharged < 1) {
        buildAction = 'grab_hose';
      } else if (mission.inventory.linesCharged >= 1) {
        buildAction = 'rescue_victim';
      }
      queueFirefighterAction(mission, ff, buildAction, world.x, world.z);
      render();
      return;
    }

    var projected = projectPointToWalkable(scene, ff, world.x, world.z);
    ff.pendingAction = null;
    ff.targetX = projected.x;
    ff.targetY = projected.z;
    render();
  }

  function lerp(a, b, t) {
    return a + ((b - a) * t);
  }

  function rotateOffset(x, z, angle) {
    var c = Math.cos(angle);
    var s = Math.sin(angle);
    return {
      x: (x * c) - (z * s),
      z: (x * s) + (z * c)
    };
  }

  function moveSceneCameraFocus(sceneState, forwardAmount, strafeAmount) {
    var orbit = sceneState.cameraOrbit || 0;
    var forward = { x: -Math.sin(orbit), z: Math.cos(orbit) };
    var right = { x: Math.cos(orbit), z: Math.sin(orbit) };
    sceneState.focusPoint.x += (forward.x * forwardAmount) + (right.x * strafeAmount);
    sceneState.focusPoint.z += (forward.z * forwardAmount) + (right.z * strafeAmount);
    sceneState.focusPoint.x = Math.max(sceneState.groundMinX + 1, Math.min(sceneState.groundMaxX - 1, sceneState.focusPoint.x));
    sceneState.focusPoint.z = Math.max(sceneState.groundMinY + 1, Math.min(sceneState.groundMaxY - 1, sceneState.focusPoint.z));
  }

  function applyHeldSceneCameraInput(sceneState, dt) {
    if (!sceneState || dt <= 0) {
      return;
    }

    var forwardIntent = (heldKeys.w ? 1 : 0) - (heldKeys.s ? 1 : 0);
    var strafeIntent = (heldKeys.d ? 1 : 0) - (heldKeys.a ? 1 : 0);
    var turnIntent = (heldKeys.e ? 1 : 0) - (heldKeys.q ? 1 : 0);

    var accel = 8.6;
    var damping = 8.8;
    var turnAccel = 4.8;
    var turnDamping = 7.4;
    var maxMoveSpeed = 7.8;
    var maxTurnSpeed = 1.6;

    var drag = Math.max(0, 1 - (damping * dt));
    var turnDrag = Math.max(0, 1 - (turnDamping * dt));

    sceneState.cameraForwardVel = (sceneState.cameraForwardVel || 0) * drag;
    sceneState.cameraStrafeVel = (sceneState.cameraStrafeVel || 0) * drag;
    sceneState.cameraTurnVel = (sceneState.cameraTurnVel || 0) * turnDrag;

    sceneState.cameraForwardVel += forwardIntent * accel * dt;
    sceneState.cameraStrafeVel += strafeIntent * accel * dt;
    sceneState.cameraTurnVel += turnIntent * turnAccel * dt;

    sceneState.cameraForwardVel = Math.max(-maxMoveSpeed, Math.min(maxMoveSpeed, sceneState.cameraForwardVel));
    sceneState.cameraStrafeVel = Math.max(-maxMoveSpeed, Math.min(maxMoveSpeed, sceneState.cameraStrafeVel));
    sceneState.cameraTurnVel = Math.max(-maxTurnSpeed, Math.min(maxTurnSpeed, sceneState.cameraTurnVel));

    if (Math.abs(sceneState.cameraTurnVel) > 0.0001) {
      sceneState.cameraOrbit += sceneState.cameraTurnVel * dt;
    }

    if (Math.abs(sceneState.cameraForwardVel) > 0.0001 || Math.abs(sceneState.cameraStrafeVel) > 0.0001) {
      moveSceneCameraFocus(
        sceneState,
        sceneState.cameraForwardVel * dt,
        sceneState.cameraStrafeVel * dt
      );
    }
  }

  function applyMappedSceneAction(actionType, actorName) {
    if (!session) {
      return { ok: false, reason: 'No active session.' };
    }

    var mission = Sim.getFocusedMission(session);
    if (mission && actorName) {
      mission.selectedActor = actorName;
    }

    var payload = null;
    if (actionType === 'grab_hose') {
      payload = { type: 'grab_hose', count: 1 };
    } else if (actionType === 'connect_hydrant') {
      payload = { type: 'connect_hydrant' };
    } else if (actionType === 'assign_ladder_task') {
      payload = { type: 'assign_ladder_task', task: 'raise/extend' };
    } else if (actionType === 'set_pump_pressure') {
      payload = { type: 'set_pump_pressure' };
    } else if (actionType === 'charge_line') {
      payload = { type: 'charge_line' };
    } else if (actionType === 'forcible_entry') {
      payload = { type: 'forcible_entry' };
    } else if (actionType === 'primary_search') {
      payload = { type: 'primary_search' };
    } else if (actionType === 'secondary_search') {
      payload = { type: 'secondary_search' };
    } else if (actionType === 'ventilate_structure') {
      payload = { type: 'ventilate_structure' };
    } else if (actionType === 'operate_master_stream') {
      payload = { type: 'operate_master_stream' };
    } else if (actionType === 'deploy_outriggers') {
      payload = { type: 'deploy_outriggers' };
    } else if (actionType === 'control_utilities') {
      payload = { type: 'control_utilities' };
    } else if (actionType === 'protect_exposure') {
      payload = { type: 'protect_exposure' };
    } else if (actionType === 'overhaul_hotspots') {
      payload = { type: 'overhaul_hotspots' };
    } else if (actionType === 'deploy_scene_lighting') {
      payload = { type: 'deploy_scene_lighting' };
    } else if (actionType === 'triage_patient') {
      payload = { type: 'triage_patient' };
    } else if (actionType === 'transport_patient') {
      payload = { type: 'transport_patient' };
    } else if (actionType === 'rehab_rotation') {
      payload = { type: 'rehab_rotation' };
    } else if (actionType === 'salvage_cover') {
      payload = { type: 'salvage_cover' };
    } else if (actionType === 'rescue_victim') {
      payload = { type: 'rescue_victim' };
    } else if (actionType === 'right_click_truck_door') {
      payload = { type: 'right_click_truck_door' };
    } else if (actionType === 'reposition_apparatus') {
      payload = { type: 'reposition_apparatus' };
    }

    if (!payload) {
      return { ok: false, reason: 'Unknown action command.' };
    }

    var result = Sim.applySceneAction(session, payload);
    if (!result.ok && result.reason) {
      showToast(result.reason);
    }
    return result;
  }

  function actionLabelForType(actionType) {
    var labels = {
      grab_hose: 'grab hose',
      connect_hydrant: 'connect hydrant',
      set_pump_pressure: 'set pump pressure',
      charge_line: 'charge line',
      forcible_entry: 'forcible entry',
      primary_search: 'primary search',
      secondary_search: 'secondary search',
      ventilate_structure: 'ventilate',
      assign_ladder_task: 'ladder task',
      operate_master_stream: 'master stream',
      deploy_outriggers: 'deploy outriggers',
      control_utilities: 'control utilities',
      protect_exposure: 'protect exposure',
      overhaul_hotspots: 'overhaul hotspots',
      deploy_scene_lighting: 'deploy scene lighting',
      triage_patient: 'triage patient',
      transport_patient: 'transport patient',
      rehab_rotation: 'crew rehab',
      salvage_cover: 'salvage cover',
      rescue_victim: 'rescue victim',
      reposition_apparatus: 'reposition apparatus'
    };
    return labels[actionType] || actionType;
  }

  function queueFirefighterAction(mission, ff, actionType, x, z) {
    var scene = mission.sceneState;
    var projected = projectPointToWalkable(scene, ff, x, z);
    ff.pendingAction = actionType;
    ff.targetX = projected.x;
    ff.targetY = projected.z;
    showToast(ff.name + ': ' + actionLabelForType(actionType));
  }

  function handleCompartmentAction(actionType, actorName) {
    applyMappedSceneAction(actionType, actorName);
  }

  function setupEvents() {
    var safeNext = function (event) {
      if (event) {
        event.preventDefault();
      }
      nextMenuStep();
      render();
    };
    var safeBack = function (event) {
      if (event) {
        event.preventDefault();
      }
      previousMenuStep();
      render();
    };

    els.menuNextBtn.setAttribute('type', 'button');
    els.menuBackBtn.setAttribute('type', 'button');
    window.BoxAlarmMenuNext = safeNext;
    window.BoxAlarmMenuBack = safeBack;

    if (els.menuWizard) {
      els.menuWizard.addEventListener('click', function (event) {
        if (session || menuState.step !== 0) {
          return;
        }
        var target = event.target;
        if (target && target.closest && target.closest('#menuBackBtn')) {
          return;
        }
        safeNext(event);
      });
    }

    if (els.starterEngineInput) {
      var applyInput = function () {
        var parsed = parseInt(els.starterEngineInput.value, 10);
        if (!isFinite(parsed) || parsed < 1) {
          return;
        }
        selectedStarterEngineNumber = parsed;
        renderStationSetupCard();
      };
      els.starterEngineInput.addEventListener('change', applyInput);
      els.starterEngineInput.addEventListener('blur', applyInput);
      els.starterEngineInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          applyInput();
        }
      });
    }

    els.beginPlacementBtn.addEventListener('click', function () {
      armPlacement();
    });

    els.respondBtn.addEventListener('click', function () {
      respondToSelectedMission();
    });

    els.viewSceneBtn.addEventListener('click', function () {
      var mission = getSelectedMission();
      if (!mission) {
        showToast('No call selected.');
        return;
      }
      Sim.focusMission(session, mission.id);
      if (mission.status === Sim.MissionStatus.UNITS_EN_ROUTE || mission.status === Sim.MissionStatus.ON_SCENE) {
        render();
        return;
      }
      showToast('Unit assignment not yet responding to scene.');
    });

    els.newMissionBtn.addEventListener('click', function () {
      if (!session || !stationPlaced) {
        showToast('Place station first.');
        return;
      }
      var mission = Sim.createMission(session);
      selectedMissionId = mission.id;
      assignMissionLocation(mission, 1700);
      showCallPanel(mission);
      render();
    });

    els.mapPauseBtn.addEventListener('click', function () {
      if (!session) {
        return;
      }
      Sim.setPause(session, !session.isPaused);
      render();
    });

    els.pauseBtn.addEventListener('click', function () {
      if (!session) {
        return;
      }
      Sim.setPause(session, !session.isPaused);
      render();
    });

    els.mapBtn.addEventListener('click', function () {
      if (!session) {
        return;
      }
      session.view = Sim.SessionView.MAP_2D;
      render();
    });

    window.addEventListener('keydown', function (event) {
      var key = event.key.toLowerCase();
      if ((!session || session.view === Sim.SessionView.MENU) && event.key === 'Enter') {
        safeNext(event);
        render();
        return;
      }
      if (!session) {
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        Sim.setPause(session, !session.isPaused);
        render();
        return;
      }

      if (session.view === Sim.SessionView.MAP_2D && key === 'd') {
        respondToSelectedMission();
        return;
      }

      if (session.view !== Sim.SessionView.SCENE_3D) {
        return;
      }

      var focusedMission = Sim.getFocusedMission(session);
      if (focusedMission && focusedMission.sceneState) {
        if (Object.prototype.hasOwnProperty.call(heldKeys, key)) {
          heldKeys[key] = true;
          event.preventDefault();
          return;
        }
      }

      if (key === '1') {
        applyMappedSceneAction('grab_hose');
      } else if (key === '2') {
        applyMappedSceneAction('connect_hydrant');
      } else if (key === '3') {
        applyMappedSceneAction('set_pump_pressure');
      } else if (key === '4') {
        applyMappedSceneAction('charge_line');
      } else if (key === '5') {
        applyMappedSceneAction('forcible_entry');
      } else if (key === '6') {
        applyMappedSceneAction('primary_search');
      } else if (key === '7') {
        applyMappedSceneAction('ventilate_structure');
      } else if (key === '8') {
        applyMappedSceneAction('assign_ladder_task');
      } else if (key === '9') {
        applyMappedSceneAction('operate_master_stream');
      } else if (key === '0') {
        applyMappedSceneAction('overhaul_hotspots');
      } else if (key === 't') {
        applyMappedSceneAction('triage_patient');
      } else if (key === 'y') {
        applyMappedSceneAction('transport_patient');
      } else if (key === 'u') {
        applyMappedSceneAction('control_utilities');
      } else if (key === 'i') {
        applyMappedSceneAction('protect_exposure');
      } else if (key === 'o') {
        applyMappedSceneAction('deploy_scene_lighting');
      } else if (key === 'p') {
        applyMappedSceneAction('reposition_apparatus');
      } else if (key === 'j') {
        applyMappedSceneAction('secondary_search');
      } else if (key === 'k') {
        applyMappedSceneAction('salvage_cover');
      } else if (key === 'm') {
        applyMappedSceneAction('rehab_rotation');
      } else if (key === 'r') {
        applyMappedSceneAction('rescue_victim');
      }

      render();
    });

    window.addEventListener('keyup', function (event) {
      var key = (event.key || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(heldKeys, key)) {
        heldKeys[key] = false;
      }
    });

    window.addEventListener('blur', function () {
      clearHeldCameraKeys();
    });

    els.scene3dHost.addEventListener('click', sceneHandleLeftClick);
    els.scene3dHost.addEventListener('contextmenu', sceneHandleRightClick);
    els.scene3dHost.addEventListener('wheel', function (event) {
      if (!session || session.view !== Sim.SessionView.SCENE_3D) {
        return;
      }
      var mission = Sim.getFocusedMission(session);
      if (!mission || !mission.sceneState) {
        return;
      }
      event.preventDefault();
      mission.sceneState.cameraDistanceScale = Math.max(
        0.42,
        Math.min(1.25, mission.sceneState.cameraDistanceScale + (event.deltaY > 0 ? 0.045 : -0.045))
      );
      render();
    }, { passive: false });

    window.addEventListener('resize', function () {
      if (map) {
        map.invalidateSize();
      }
      ensureThreeSize();
    });
  }

  setupEvents();
  renderBuildStamp();
  renderMenuWizard();
  render();
})();
