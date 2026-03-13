using BoxAlarmV1.Core;

namespace BoxAlarmV1.Simulation
{
    public sealed class ProgressionSystem
    {
        public int GetAvailableStationCount(SessionConfig config, PlayerProfile player)
        {
            if (config.Mode == GameMode.Build)
            {
                return player.OwnedStations < 1 ? 1 : player.OwnedStations;
            }

            return config.City.RealLifeStationCount;
        }

        public int GetMaxUnitsPerAlarm(SessionConfig config, PlayerProfile player)
        {
            if (config.Mode == GameMode.Build)
            {
                int value = 2 + player.OwnedStations;
                return value < 3 ? 3 : (value > 12 ? 12 : value);
            }

            int dispatcher = 4 + player.Level;
            return dispatcher < 6 ? 6 : (dispatcher > 18 ? 18 : dispatcher);
        }

        public bool CanDispatchUnit(SessionConfig config, PlayerProfile player, UnitType unitType, int currentlySelectedCount)
        {
            if (unitType == UnitType.Ambulance)
            {
                return true;
            }

            return currentlySelectedCount < GetMaxUnitsPerAlarm(config, player);
        }

        public int CalculateMissionReward(Mission mission)
        {
            int baseReward = 250;
            int severityBonus = mission.IncidentSeverityScore * 20;
            int rescueBonus = mission.CiviliansRescued * 100;
            int eventPenalty = mission.Events.Count * 15;
            int total = baseReward + severityBonus + rescueBonus - eventPenalty;
            return total < 100 ? 100 : total;
        }

        public int UpgradeStationCost(int ownedStations)
        {
            return 1000 + (ownedStations * 700);
        }

        public bool TryBuyStation(PlayerProfile player)
        {
            int cost = UpgradeStationCost(player.OwnedStations);
            if (player.Credits < cost)
            {
                return false;
            }

            player.Credits -= cost;
            player.OwnedStations += 1;
            return true;
        }
    }
}
