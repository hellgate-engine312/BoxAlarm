using System;
using System.Collections.Generic;
using System.Linq;
using BoxAlarmV1.Core;

namespace BoxAlarmV1.Simulation
{
    public sealed class GameSession
    {
        private readonly MissionGenerator _generator;
        private readonly MissionSimulator _simulator;
        private readonly ProgressionSystem _progression;
        private readonly List<Mission> _missions = new List<Mission>();

        public GameSession(SessionConfig config, PlayerProfile player, Random random)
        {
            Config = config;
            Player = player;
            _generator = new MissionGenerator(random);
            _simulator = new MissionSimulator(random);
            _progression = new ProgressionSystem();
            View = SessionView.Menu;
        }

        public SessionConfig Config { get; private set; }
        public PlayerProfile Player { get; private set; }
        public SessionView View { get; private set; }
        public bool IsPaused { get; private set; }
        public Guid? FocusedMissionId { get; private set; }
        public IReadOnlyList<Mission> Missions { get { return _missions; } }

        public void OpenCityAndTypeSelection()
        {
            View = SessionView.CityMap2D;
        }

        public Mission GenerateMission()
        {
            Mission mission = _generator.CreateMission();
            _missions.Add(mission);
            return mission;
        }

        public Mission TryGenerateMissionIfIdle()
        {
            bool hasUnresolved = _missions.Any(x =>
                x.Status == MissionStatus.PendingDispatch ||
                x.Status == MissionStatus.UnitsEnRoute ||
                x.Status == MissionStatus.OnScene);

            if (hasUnresolved)
            {
                return null;
            }

            return GenerateMission();
        }

        public bool DispatchMission(Guid missionId, IReadOnlyCollection<UnitDispatch> units, DateTimeOffset now)
        {
            Mission mission = _missions.FirstOrDefault(x => x.Id == missionId);
            if (mission == null || mission.Status != MissionStatus.PendingDispatch)
            {
                return false;
            }

            FocusMission(mission.Id);
            _simulator.DispatchUnits(mission, units, now);
            mission.IsLoadingTo3D = true;
            View = SessionView.LoadingToScene3D;

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
            Mission target = _missions.FirstOrDefault(x => x.Id == missionId);
            if (target == null)
            {
                return false;
            }

            FocusedMissionId = missionId;
            foreach (Mission mission in _missions)
            {
                mission.IsFocused = mission.Id == missionId;
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

            foreach (Mission mission in _missions)
            {
                if (!mission.IsFocused)
                {
                    mission.IsPaused = true;
                    continue;
                }

                mission.IsPaused = false;
                bool arrived = _simulator.TickEnRoute(mission, deltaSeconds, now);
                if (arrived)
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
}
