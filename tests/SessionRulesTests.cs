using System;
using System.Collections.Generic;
using BoxAlarmV1.Core;
using BoxAlarmV1.Simulation;
using BoxAlarmV1.UI;
using NUnit.Framework;

namespace BoxAlarmV1.Tests;

public sealed class SessionRulesTests
{
    [Test]
    public void DispatchTransitions_From2D_ToLoading_ThenTo3DOnArrival()
    {
        var session = CreateSession(GameMode.Build, Difficulty.Easy, seed: 7);
        session.OpenCityAndTypeSelection();

        var mission = session.GenerateMission();
        var dispatched = session.DispatchMission(
            mission.Id,
            new[]
            {
                new UnitDispatch { UnitType = UnitType.Engine, Count = 1 },
                new UnitDispatch { UnitType = UnitType.Ladder, Count = 1 }
            },
            DateTimeOffset.UtcNow);

        Assert.That(dispatched, Is.True);
        Assert.That(session.View, Is.EqualTo(SessionView.LoadingToScene3D));

        // Force enough time to arrive.
        for (var i = 0; i < 20; i++)
        {
            session.Tick(5, DateTimeOffset.UtcNow.AddSeconds(i * 5));
        }

        Assert.That(mission.Status, Is.EqualTo(MissionStatus.OnScene).Or.EqualTo(MissionStatus.Resolved));
        Assert.That(session.View, Is.EqualTo(SessionView.MissionScene3D).Or.EqualTo(SessionView.CityMap2D));
    }

    [Test]
    public void NonFocusedMission_IsPaused_AndDoesNotProgress()
    {
        var session = CreateSession(GameMode.Dispatcher, Difficulty.Normal, seed: 11);
        session.OpenCityAndTypeSelection();

        var a = session.GenerateMission();
        var b = session.GenerateMission();

        session.DispatchMission(
            a.Id,
            new[] { new UnitDispatch { UnitType = UnitType.Engine, Count = 1 } },
            DateTimeOffset.UtcNow);

        session.FocusMission(a.Id);
        session.Tick(10, DateTimeOffset.UtcNow);

        Assert.That(a.IsPaused, Is.False);
        Assert.That(b.IsPaused, Is.True);
        Assert.That(b.Status, Is.EqualTo(MissionStatus.PendingDispatch));
        Assert.That(b.Events.Count, Is.EqualTo(0));
    }

    [Test]
    public void EasyShowsEscalationColor_NormalHidesColorHint()
    {
        var mission = new Mission
        {
            InitialCall = new CallInfo
            {
                CallerReport = "Smoke showing",
                BuildingType = "Residential",
                AddressHint = "Block 100",
                HiddenRiskScore = 3
            },
            EscalationLevel = EscalationLevel.RedCritical
        };

        var easyHud = UiProjection.BuildHudState(mission, Difficulty.Easy, paused: false, SessionView.MissionScene3D);
        var normalHud = UiProjection.BuildHudState(mission, Difficulty.Normal, paused: false, SessionView.MissionScene3D);

        Assert.That(easyHud.EscalationColorHint, Is.EqualTo(EscalationLevel.RedCritical));
        Assert.That(normalHud.EscalationColorHint, Is.Null);
    }

    [Test]
    public void BuildAndDispatcherModesHaveDifferentStationCapacityRules()
    {
        var build = CreateSession(GameMode.Build, Difficulty.Easy, seed: 13);
        var dispatcher = CreateSession(GameMode.Dispatcher, Difficulty.Easy, seed: 13);

        Assert.That(build.GetStationCapacity(), Is.EqualTo(1));
        Assert.That(dispatcher.GetStationCapacity(), Is.EqualTo(22));
    }

    [Test]
    public void InsufficientDispatchIncreasesSeverity()
    {
        var session = CreateSession(GameMode.Build, Difficulty.Hard, seed: 2);
        var mission = session.GenerateMission();
        var before = mission.IncidentSeverityScore;

        session.DispatchMission(
            mission.Id,
            new[] { new UnitDispatch { UnitType = UnitType.Police, Count = 1 } },
            DateTimeOffset.UtcNow);

        Assert.That(mission.IncidentSeverityScore, Is.GreaterThan(before));
    }

    private static GameSession CreateSession(GameMode mode, Difficulty difficulty, int seed)
    {
        return new GameSession(
            new SessionConfig
            {
                City = new CityDefinition("Metro", RealLifeStationCount: 22),
                Mode = mode,
                Difficulty = difficulty
            },
            new PlayerProfile(),
            new Random(seed));
    }
}
