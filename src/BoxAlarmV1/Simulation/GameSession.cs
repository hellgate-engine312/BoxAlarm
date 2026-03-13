using System;
using System.Collections.Generic;
using System.Linq;
using BoxAlarmV1.Core;

namespace BoxAlarmV1.Simulation;

public sealed class GameSession
{
    private readonly MissionGenerator _generator;
    private readonly MissionSimulator _simulator;
    private readonly ProgressionSystem _progression;

    private readonly List<Mission> _missions = new();

    public GameSession(SessionConfig config, PlayerProfile player, Random? random = null)
    {
        Config = config;
        Player = player;

        _generator = new MissionGenerator(random);
        _simulator = new MissionSimulator(random);
        _progression = new ProgressionSystem();

        View = SessionView.Menu;
    }

    public SessionConfig Config { get; }
    public PlayerProfile Player { get; }
    public SessionView View { get; private set; }
    public IReadOnlyList<Mission> Missions => _missions;
    public Guid? FocusedMissionId { get; private set; }
    public bool IsPaused { get; private set; }

    public void OpenCityAndTypeSelection()
    {
        // Menu has only city select + type select, then enter 2D city map.
        View = SessionView.CityMap2D;
    }

    public Mission GenerateMission()
    {
        var mission = _generator.CreateMission();
        _missions.Add(mission);
        return mission;
    }

    public Mission? TryGenerateMissionIfIdle()
    {
        var hasUnresolved = _missions.Any(x =>
            x.Status is MissionStatus.PendingDispatch or MissionStatus.UnitsEnRoute or MissionStatus.OnScene);
        if (hasUnresolved)
        {
            return null;
        }

        return GenerateMission();
    }

    public bool DispatchMission(Guid missionId, IReadOnlyCollection<UnitDispatch> units, DateTimeOffset now)
    {
        var mission = _missions.FirstOrDefault(x => x.Id == missionId);
        if (mission is null || mission.Status != MissionStatus.PendingDispatch)
        {
            return false;
        }

        FocusMission(mission.Id);
        _simulator.DispatchUnits(mission, units, now);

        // V1 cinematic loading in truck cab after dispatch.
        mission.IsLoadingTo3D = true;
        View = SessionView.LoadingToScene3D;

        // Incorrect/insufficient dispatch worsens conditions.
        if (mission.DispatchAdequacyScore < mission.IncidentSeverityScore)
        {
            mission.IncidentSeverityScore += 2;
            mission.RadioLog.Add(new RadioMessage
            {
                Source = "Dispatch",
                Message = "Updated reports suggest worsening conditions.",
                Timestamp = now
            });
        }

        return true;
    }

    public bool FocusMission(Guid missionId)
    {
        var target = _missions.FirstOrDefault(x => x.Id == missionId);
        if (target is null)
        {
            return false;
        }

        FocusedMissionId = missionId;
        foreach (var mission in _missions)
        {
            mission.IsFocused = mission.Id == missionId;
            // V1 rule: non-focused incidents are paused and do not escalate.
            mission.IsPaused = !mission.IsFocused;
        }

        if (target.Status == MissionStatus.OnScene)
        {
            View = SessionView.MissionScene3D;
        }
        else if (target.Status == MissionStatus.UnitsEnRoute)
        {
            View = SessionView.LoadingToScene3D;
        }
        else
        {
            View = SessionView.CityMap2D;
        }

        return true;
    }

    public void ReturnToMap()
    {
        View = SessionView.CityMap2D;
    }

    public void SetPause(bool paused)
    {
        IsPaused = paused;
    }

    public void Tick(int deltaSeconds, DateTimeOffset now)
    {
        if (IsPaused)
        {
            return;
        }

        foreach (var mission in _missions)
        {
            if (!mission.IsFocused)
            {
                mission.IsPaused = true;
                continue;
            }

            mission.IsPaused = false;

            if (_simulator.TickEnRoute(mission, deltaSeconds, now))
            {
                mission.IsLoadingTo3D = false;
                View = SessionView.MissionScene3D;
            }

            _simulator.TickScene(mission, deltaSeconds, Config.Difficulty, now);

            if (mission.Status == MissionStatus.Resolved)
            {
                Player.Credits += _progression.CalculateMissionReward(mission);
                if (Config.Mode == GameMode.Build)
                {
                    Player.Level += 1;
                }
                View = SessionView.CityMap2D;
            }
        }
    }

    public int GetStationCapacity()
    {
        return _progression.GetAvailableStationCount(Config, Player);
    }

    public int GetMaxUnitsPerAlarm()
    {
        return _progression.GetMaxUnitsPerAlarm(Config, Player);
    }

    public bool TryBuyStation()
    {
        return Config.Mode == GameMode.Build && _progression.TryBuyStation(Player);
    }

    public bool CanDispatchUnit(UnitType unitType, int currentlySelectedCount)
    {
        return _progression.CanDispatchUnit(Config, Player, unitType, currentlySelectedCount);
    }
}
