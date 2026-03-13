namespace BoxAlarmV1.Core
{
    public enum GameMode
    {
        Build,
        Dispatcher
    }

    public enum Difficulty
    {
        Easy,
        Normal,
        Hard
    }

    public enum EscalationLevel
    {
        BlueMinimal,
        YellowModerate,
        RedCritical
    }

    public enum SessionView
    {
        Menu,
        CityMap2D,
        LoadingToScene3D,
        MissionScene3D
    }

    public enum MissionStatus
    {
        PendingDispatch,
        UnitsEnRoute,
        OnScene,
        Resolved,
        Failed
    }

    public enum DynamicEventType
    {
        Flashover,
        AdditionalVictims,
        PartialCollapse,
        HazardousMaterialDiscovered,
        FireSpread,
        UtilityFailure
    }

    public enum UnitType
    {
        Engine,
        Ladder,
        Ambulance,
        BattalionChief,
        Rescue,
        Hazmat,
        Police
    }

    public enum InputAction
    {
        Grab,
        ContextAction,
        Dispatch,
        Hose,
        Search,
        Move,
        LadderTask,
        Pause
    }
}
