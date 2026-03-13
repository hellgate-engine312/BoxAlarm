using System;
using BoxAlarmV1.Core;

namespace BoxAlarmV1.Simulation
{
    public sealed class MissionGenerator
    {
        private readonly Random _random;

        private static readonly string[] BuildingTypes =
        {
            "Single Family Residential",
            "Multi-Family Apartment",
            "Strip Mall",
            "Warehouse",
            "Office Mid-Rise",
            "Light Industrial"
        };

        private static readonly string[] CallerReports =
        {
            "Caller reports smoke coming from a structure.",
            "Caller reports an odor of gas in the building.",
            "Caller reports a possible room fire.",
            "Caller reports vehicle into building with injuries.",
            "Caller reports alarm sounding and visible haze."
        };

        public MissionGenerator(Random random)
        {
            _random = random ?? new Random();
        }

        public Mission CreateMission()
        {
            string report = CallerReports[_random.Next(CallerReports.Length)];
            string building = BuildingTypes[_random.Next(BuildingTypes.Length)];

            Mission mission = new Mission
            {
                InitialCall = new CallInfo
                {
                    CallerReport = report,
                    BuildingType = building,
                    AddressHint = string.Format("Block {0}", _random.Next(100, 999)),
                    HiddenRiskScore = _random.Next(1, 6)
                },
                CiviliansKnown = _random.Next(0, 3),
                IncidentSeverityScore = _random.Next(2, 8)
            };

            mission.RadioLog.Add(new RadioMessage
            {
                Source = "Dispatch",
                Message = report,
                Timestamp = DateTimeOffset.UtcNow
            });

            return mission;
        }
    }
}
