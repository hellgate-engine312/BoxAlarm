using BoxAlarmV1.Core;

namespace BoxAlarmV1.UI;

public sealed class LoadingScreenState
{
    public required string BackgroundSceneId { get; init; }
    public required string CameraSeatDescription { get; init; }
    public required string LaptopHeadline { get; init; }
    public required string BuildingType { get; init; }
    public required string CallerInfo { get; init; }
    public required int EtaSeconds { get; init; }

    public static LoadingScreenState FromMission(Mission mission)
    {
        return new LoadingScreenState
        {
            BackgroundSceneId = "truck_cab_drive_loop",
            CameraSeatDescription = "Captain seat view, zoomed on MDT laptop",
            LaptopHeadline = "Incoming Mission Details",
            BuildingType = mission.InitialCall.BuildingType,
            CallerInfo = mission.InitialCall.CallerReport,
            EtaSeconds = mission.ArrivalCountdownSeconds
        };
    }
}
