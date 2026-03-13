using System;
using System.Collections.Generic;
using System.Linq;
using BoxAlarmV1.Core;

namespace BoxAlarmV1.Simulation;

public sealed class MissionSimulator
{
    private readonly Random _random;

    public MissionSimulator(Random? random = null)
    {
        _random = random ?? new Random();
    }

    public void DispatchUnits(Mission mission, IReadOnlyCollection<UnitDispatch> units, DateTimeOffset now)
    {
        foreach (var unit in units)
        {
            mission.UnitsSent.Add(unit);
        }

        mission.Status = MissionStatus.UnitsEnRoute;
        mission.ArrivalCountdownSeconds = Math.Clamp(45 - (units.Count * 4), 15, 60);
        mission.DispatchAdequacyScore += ScoreDispatch(units);

        mission.RadioLog.Add(new RadioMessage
        {
            Source = "Dispatch",
            Message = $"Units responding: {string.Join(", ", units.Select(x => $"{x.Count}x {x.UnitType}"))}",
            Timestamp = now
        });

        if (mission.DispatchAdequacyScore < mission.IncidentSeverityScore)
        {
            mission.RadioLog.Add(new RadioMessage
            {
                Source = "System",
                Message = "Initial dispatch may be insufficient for conditions.",
                Timestamp = now
            });
        }
    }

    public bool TickEnRoute(Mission mission, int deltaSeconds, DateTimeOffset now)
    {
        if (mission.Status != MissionStatus.UnitsEnRoute || mission.IsPaused)
        {
            return false;
        }

        mission.ArrivalCountdownSeconds -= deltaSeconds;
        if (mission.ArrivalCountdownSeconds > 0)
        {
            return false;
        }

        mission.Status = MissionStatus.OnScene;
        mission.RadioLog.Add(new RadioMessage
        {
            Source = "Engine 1",
            Message = "On scene, investigating conditions.",
            Timestamp = now
        });

        return true;
    }

    public void TickScene(Mission mission, int deltaSeconds, Difficulty difficulty, DateTimeOffset now)
    {
        if (mission.Status != MissionStatus.OnScene || mission.IsPaused)
        {
            return;
        }

        // Escalation pressure grows with hidden risk and poor dispatch.
        mission.IncidentSeverityScore += Math.Max(0, mission.InitialCall.HiddenRiskScore - 2);
        if (mission.DispatchAdequacyScore < mission.IncidentSeverityScore)
        {
            mission.IncidentSeverityScore += 1;
        }

        MaybeInjectDynamicEvent(mission, now);
        mission.EscalationLevel = ComputeEscalation(mission, difficulty);

        if (mission.CiviliansRescued >= mission.CiviliansKnown &&
            mission.DispatchAdequacyScore >= mission.IncidentSeverityScore)
        {
            mission.Status = MissionStatus.Resolved;
            mission.RadioLog.Add(new RadioMessage
            {
                Source = "Command",
                Message = "Incident stabilized and under control.",
                Timestamp = now
            });
        }
    }

    public void MarkCivilianRescued(Mission mission, DateTimeOffset now)
    {
        mission.CiviliansRescued = Math.Min(mission.CiviliansRescued + 1, mission.CiviliansKnown);
        mission.RadioLog.Add(new RadioMessage
        {
            Source = "Rescue",
            Message = "One civilian removed and transferred to EMS.",
            Timestamp = now
        });
    }

    private int ScoreDispatch(IReadOnlyCollection<UnitDispatch> units)
    {
        var score = 0;
        foreach (var unit in units)
        {
            var perUnit = unit.UnitType switch
            {
                UnitType.Engine => 3,
                UnitType.Ladder => 3,
                UnitType.Ambulance => 2,
                UnitType.BattalionChief => 2,
                UnitType.Rescue => 3,
                UnitType.Hazmat => 4,
                UnitType.Police => 1,
                _ => 1
            };
            score += perUnit * unit.Count;
        }

        return score;
    }

    private void MaybeInjectDynamicEvent(Mission mission, DateTimeOffset now)
    {
        if (_random.NextDouble() > 0.3)
        {
            return;
        }

        var eventType = (DynamicEventType)_random.Next(Enum.GetValues<DynamicEventType>().Length);
        var description = eventType switch
        {
            DynamicEventType.Flashover => "Rapid fire transition reported in upper compartment.",
            DynamicEventType.AdditionalVictims => "Additional victim located in rear room.",
            DynamicEventType.PartialCollapse => "Ceiling collapse in interior attack zone.",
            DynamicEventType.HazardousMaterialDiscovered => "Unknown chemical containers found near origin.",
            DynamicEventType.FireSpread => "Fire extension into concealed attic space.",
            DynamicEventType.UtilityFailure => "Power/utility issue creating access hazard.",
            _ => "Conditions changed unexpectedly."
        };

        mission.Events.Add(new DynamicEvent
        {
            Type = eventType,
            Description = description,
            OccurredAt = now
        });

        mission.RadioLog.Add(new RadioMessage
        {
            Source = "Command",
            Message = description,
            Timestamp = now
        });

        mission.IncidentSeverityScore += 1;
        if (eventType == DynamicEventType.AdditionalVictims)
        {
            mission.CiviliansKnown += 1;
        }
    }

    private static EscalationLevel ComputeEscalation(Mission mission, Difficulty difficulty)
    {
        var delta = mission.IncidentSeverityScore - mission.DispatchAdequacyScore;
        var level = delta switch
        {
            <= 0 => EscalationLevel.BlueMinimal,
            <= 3 => EscalationLevel.YellowModerate,
            _ => EscalationLevel.RedCritical
        };

        // In Normal/Hard the UI should not color-code escalation; we still store internal severity.
        return difficulty == Difficulty.Easy ? level : level;
    }
}
