using System.Collections.Generic;
using BoxAlarmV1.Core;

namespace BoxAlarmV1.UI;

public sealed class InputMapper
{
    private readonly Dictionary<string, InputAction> _hotkeys = new()
    {
        ["G"] = InputAction.Grab,
        ["R"] = InputAction.ContextAction,
        ["D"] = InputAction.Dispatch,
        ["H"] = InputAction.Hose,
        ["S"] = InputAction.Search,
        ["M"] = InputAction.Move,
        ["L"] = InputAction.LadderTask,
        ["Space"] = InputAction.Pause
    };

    public InputAction ResolveMouseButton(int button)
    {
        // V1 rule: Left click = grab/select, Right click = contextual action.
        return button switch
        {
            0 => InputAction.Grab,
            1 => InputAction.ContextAction,
            _ => InputAction.ContextAction
        };
    }

    public bool TryResolveHotkey(string key, out InputAction action)
    {
        return _hotkeys.TryGetValue(key, out action);
    }
}
