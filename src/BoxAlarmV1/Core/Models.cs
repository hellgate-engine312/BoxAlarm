using System;
using System.Collections.Generic;

namespace BoxAlarmV1.Core;

public sealed record CityDefinition(string Name, int RealLifeStationCount);

public sealed class CallInfo
{
    public required string CallerReport { get; init; }
    public required string BuildingType { get; init; }
    public required string AddressHint { get; init; }
    public int HiddenRiskScore { get; init; }
}

public sealed class UnitDispatch
{
    public required UnitType UnitType { get; init; }
    public int Count { get; init; }
}

public sealed class DynamicEvent
{
    public required DynamicEventType Type { get; init; }
    public required string Description { get; init; }
    public DateTimeOffset OccurredAt { get; init; }
}

public sealed class RadioMessage
{
    public required string Source { get; init; }
    public required string Message { get; init; }
    public DateTimeOffset Timestamp { get; init; }
}

public sealed class Mission
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required CallInfo InitialCall { get; init; }
    public MissionStatus Status { get; set; } = MissionStatus.PendingDispatch;
    public EscalationLevel EscalationLevel { get; set; } = EscalationLevel.BlueMinimal;
    public bool IsPaused { get; set; }
    public bool IsFocused { get; set; }
    public bool IsLoadingTo3D { get; set; }
    public int CiviliansKnown { get; set; }
    public int CiviliansRescued { get; set; }
    public int IncidentSeverityScore { get; set; }
    public int DispatchAdequacyScore { get; set; }
    public int ArrivalCountdownSeconds { get; set; }
    public List<UnitDispatch> UnitsSent { get; } = new();
    public List<DynamicEvent> Events { get; } = new();
    public List<RadioMessage> RadioLog { get; } = new();
}

public sealed class PlayerProfile
{
    public int Level { get; set; } = 1;
    public int Credits { get; set; } = 0;
    public int OwnedStations { get; set; } = 1;
}

public sealed class SessionConfig
{
    public required CityDefinition City { get; init; }
    public required GameMode Mode { get; init; }
    public required Difficulty Difficulty { get; init; }
}
