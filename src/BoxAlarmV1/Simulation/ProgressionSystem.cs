using System;
using BoxAlarmV1.Core;

namespace BoxAlarmV1.Simulation;

public sealed class ProgressionSystem
{
    public int GetAvailableStationCount(SessionConfig config, PlayerProfile player)
    {
        return config.Mode switch
        {
            GameMode.Build => Math.Max(1, player.OwnedStations),
            GameMode.Dispatcher => config.City.RealLifeStationCount,
            _ => 1
        };
    }

    public int GetMaxUnitsPerAlarm(SessionConfig config, PlayerProfile player)
    {
        return config.Mode switch
        {
            GameMode.Build => Math.Clamp(2 + player.OwnedStations, 3, 12),
            GameMode.Dispatcher => Math.Clamp(4 + player.Level, 6, 18),
            _ => 4
        };
    }

    public bool CanDispatchUnit(SessionConfig config, PlayerProfile player, UnitType unitType, int currentlySelectedCount)
    {
        if (unitType == UnitType.Ambulance)
        {
            // V1 rule: ambulances are effectively unconstrained.
            return true;
        }

        var max = GetMaxUnitsPerAlarm(config, player);
        return currentlySelectedCount < max;
    }

    public int CalculateMissionReward(Mission mission)
    {
        var baseReward = 250;
        var severityBonus = mission.IncidentSeverityScore * 20;
        var rescueBonus = mission.CiviliansRescued * 100;
        var eventPenalty = mission.Events.Count * 15;
        return Math.Max(100, baseReward + severityBonus + rescueBonus - eventPenalty);
    }

    public int UpgradeStationCost(int ownedStations)
    {
        return 1_000 + (ownedStations * 700);
    }

    public bool TryBuyStation(PlayerProfile player)
    {
        var cost = UpgradeStationCost(player.OwnedStations);
        if (player.Credits < cost)
        {
            return false;
        }

        player.Credits -= cost;
        player.OwnedStations += 1;
        return true;
    }
}
