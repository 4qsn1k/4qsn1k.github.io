# Test-only: focus the experimental Owen Logic simulator window.
# Never attempts to activate a GUI inside an RDP session without an interactive desktop.
$ErrorActionPreference="Stop"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class OwenTestFocus {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int cmd);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@
# Resolve the exact Owen Logic test window, not an arbitrary top-level Pane.
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$desktop=[System.Windows.Automation.AutomationElement]::RootElement
$top=$desktop.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$matches=@()
for($i=0;$i -lt $top.Count;$i++){
 $e=$top.Item($i)
 if($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window){continue}
 if(-not $e.Current.Name.EndsWith("Airlock_SIMULATION_TEST.owle")){continue}
 $p=Get-Process -Id $e.Current.ProcessId -ErrorAction SilentlyContinue
 if($p -and $p.ProcessName -eq "ProgramRelayFBD"){$matches+=,$e}
}
if($matches.Count -ne 1){throw "TEST_OWEN_WINDOW_NOT_UNIQUE: "+$matches.Count}
$target=[IntPtr]($matches[0].Current.NativeWindowHandle)
if($target -eq [IntPtr]::Zero){throw "NO_TEST_WINDOW_HANDLE"}
if([OwenTestFocus]::GetForegroundWindow() -eq [IntPtr]::Zero){
 throw "INTERACTIVE_DESKTOP_NOT_AVAILABLE"
}
# Preserve user's window size. Do not use SW_MAXIMIZE or SW_RESTORE.
[OwenTestFocus]::SetForegroundWindow($target)|Out-Null
Start-Sleep -Milliseconds 220
$success=([OwenTestFocus]::GetForegroundWindow() -eq $target)
Write-Output ("TARGET_PID="+$matches[0].Current.ProcessId+" ACTIVE="+$success)
if(-not $success){throw "TEST_OWEN_NOT_FOREGROUND"}
