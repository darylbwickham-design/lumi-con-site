using System;
public class CPHInline
{
    public bool Execute()
    {
        int current = CPH.GetGlobalVar<int?>("FactoryLiveMultiplier", true) ?? 1;
        if (current >= 16) { CPH.LogWarn("Factory Live multiplier has reached its limit."); return false; }
        current = Math.Max(1, current) + 1;
        CPH.SetGlobalVar("FactoryLiveMultiplier", current, true);
        CPH.SendMessage("the current multiplier is now " + current, true, true);
        return true;
    }
}
