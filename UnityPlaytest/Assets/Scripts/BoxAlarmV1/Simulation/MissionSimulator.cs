using System;
using System.Collections.Generic;
using System.Linq;
using BoxAlarmV1.Core;

namespace BoxAlarmV1.Simulation
{
    public sealed class MissionSimulator
    {
        private readonly Random _random;

        public MissionSimulator(Random random)
        {
            _random = random ?? new Random();
        }

        public void DispatchUnits(Mission mission, IReadOnlyCollection<UnitDispatch> units, DateTimeOffset now)
        {
            foreach (UnitDispatch unit in units)
            {
                mission.UnitsSent.Add(unit);
            }

            mission.Status = MissionStatus.UnitsEnRoute;
            mission.ArrivalCountdownSeconds = Clamp(45 - (units.Count * 4), 15, 60);
            mission.DispatchAdequacyScore += ScoreDispatch(units);

            mission.RadioLog.Add(new RadioMessage
            {
                Source = "Dispatch",
                Message = "Units responding: " + string.Join(", ", units.Select(x => x.Count + "x " + x.UnitType)),
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

            mission.IncidentSeverityScore += Math.Max(0, mission.InitialCall.HiddenRiskScore - 2);
            if (mission.DispatchAdequacyScore < mission.IncidentSeverityScore)
            {
                mission.IncidentSeverityScore += 1;
            }

            MaybeInjectDynamicEvent(mission, now);
            mission.EscalationLevel = ComputeEscalation(mission);

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
            int score = 0;
            foreach (UnitDispatch unit in units)
            {
                int perUnit;
                switch (unit.UnitType)
                {
                    case UnitType.Engine:
                    case UnitType.Ladder:
                    case UnitType.Rescue:
                        perUnit = 3;
                        break;
                    case UnitType.Ambulance:
                    case UnitType.BattalionChief:
                        perUnit = 2;
                        break;
                    case UnitType.Hazmat:
                        perUnit = 4;
                        break;
                    default:
                        perUnit = 1;
                        break;
                }

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

            DynamicEventType eventType = (DynamicEventType)_random.Next(Enum.GetValues(typeof(DynamicEventType)).Length);
            string description;
            switch (eventType)
            {
                case DynamicEventType.Flashover:
                    description = "Rapid fire transition reported in upper compartment.";
                    break;
                case DynamicEventType.AdditionalVictims:
                    description = "Additional victim located in rear room.";
                    break;
                case DynamicEventType.PartialCollapse:
                    description = "Ceiling collapse in interior attack zone.";
                    break;
                case DynamicEventType.HazardousMaterialDiscovered:
                    description = "Unknown chemical containers found near origin.";
                    break;
                case DynamicEventType.FireSpread:
                    description = "Fire extension into concealed attic space.";
                    break;
                default:
                    description = "Power/utility issue creating access hazard.";
                    break;
            }

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

        private static EscalationLevel ComputeEscalation(Mission mission)
        {
            int delta = mission.IncidentSeverityScore - mission.DispatchAdequacyScore;
            if (delta <= 0)
            {
                return EscalationLevel.BlueMinimal;
            }

            if (delta <= 3)
            {
                return EscalationLevel.YellowModerate;
            }

            return EscalationLevel.RedCritical;
        }

        private static int Clamp(int value, int min, int max)
        {
            if (value < min)
            {
                return min;
            }

            if (value > max)
            {
                return max;
            }

            return value;
        }
    }
}
