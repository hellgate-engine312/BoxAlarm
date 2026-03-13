using System;
using System.Collections.Generic;

namespace BoxAlarmV1.Core
{
    public sealed class CityDefinition
    {
        public CityDefinition(string name, int realLifeStationCount)
        {
            Name = name;
            RealLifeStationCount = realLifeStationCount;
        }

        public string Name { get; private set; }
        public int RealLifeStationCount { get; private set; }
    }

    public sealed class CallInfo
    {
        public string CallerReport;
        public string BuildingType;
        public string AddressHint;
        public int HiddenRiskScore;
    }

    public sealed class UnitDispatch
    {
        public UnitType UnitType;
        public int Count;
    }

    public sealed class DynamicEvent
    {
        public DynamicEventType Type;
        public string Description;
        public DateTimeOffset OccurredAt;
    }

    public sealed class RadioMessage
    {
        public string Source;
        public string Message;
        public DateTimeOffset Timestamp;
    }

    public sealed class Mission
    {
        public Guid Id = Guid.NewGuid();
        public CallInfo InitialCall;
        public MissionStatus Status = MissionStatus.PendingDispatch;
        public EscalationLevel EscalationLevel = EscalationLevel.BlueMinimal;
        public bool IsPaused;
        public bool IsFocused;
        public bool IsLoadingTo3D;
        public int CiviliansKnown;
        public int CiviliansRescued;
        public int IncidentSeverityScore;
        public int DispatchAdequacyScore;
        public int ArrivalCountdownSeconds;
        public readonly List<UnitDispatch> UnitsSent = new List<UnitDispatch>();
        public readonly List<DynamicEvent> Events = new List<DynamicEvent>();
        public readonly List<RadioMessage> RadioLog = new List<RadioMessage>();
    }

    public sealed class PlayerProfile
    {
        public int Level = 1;
        public int Credits;
        public int OwnedStations = 1;
    }

    public sealed class SessionConfig
    {
        public CityDefinition City;
        public GameMode Mode;
        public Difficulty Difficulty;
    }
}
