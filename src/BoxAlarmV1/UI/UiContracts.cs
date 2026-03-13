using System;
using System.Collections.Generic;
using System.Linq;
using BoxAlarmV1.Core;

namespace BoxAlarmV1.UI;

public sealed class OnSceneUnitPanelItem
{
    public required string Label { get; init; }
    public required string Status { get; init; }
    public required bool Selected { get; init; }
}

public sealed class RadioPanelItem
{
    public required string Source { get; init; }
    public required string Message { get; init; }
    public required DateTimeOffset Timestamp { get; init; }
}

public sealed class BottomBarState
{
    public required bool IsPaused { get; init; }
    public required SessionView View { get; init; }
}

public sealed class MissionHudState
{
    public required IReadOnlyList<OnSceneUnitPanelItem> LeftPanelUnits { get; init; }
    public required IReadOnlyList<RadioPanelItem> RightPanelRadioTraffic { get; init; }
    public required BottomBarState BottomBar { get; init; }
    public EscalationLevel? EscalationColorHint { get; init; }
}

public static class UiProjection
{
    public static MissionHudState BuildHudState(Mission mission, Difficulty difficulty, bool paused, SessionView view)
    {
        var units = mission.UnitsSent.Select(unit => new OnSceneUnitPanelItem
        {
            Label = $"{unit.Count}x {unit.UnitType}",
            Status = mission.Status.ToString(),
            Selected = false
        }).ToList();

        var radio = mission.RadioLog.Select(item => new RadioPanelItem
        {
            Source = item.Source,
            Message = item.Message,
            Timestamp = item.Timestamp
        }).ToList();

        return new MissionHudState
        {
            LeftPanelUnits = units,
            RightPanelRadioTraffic = radio,
            BottomBar = new BottomBarState
            {
                IsPaused = paused,
                View = view
            },
            EscalationColorHint = difficulty == Difficulty.Easy ? mission.EscalationLevel : null
        };
    }
}
