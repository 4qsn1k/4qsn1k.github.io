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
$p=Get-Process ProgramRelayFBD -ErrorAction Stop |
 Where-Object {$_.MainWindowTitle -like "*Airlock_SIMULATION_TEST.owle"} |
 Select-Object -First 1
if(-not $p){throw "TEST_OWEN_WINDOW_NOT_FOUND"}
if($p.MainWindowHandle -eq [IntPtr]::Zero){throw "NO_TEST_WINDOW_HANDLE"}
if([OwenTestFocus]::GetForegroundWindow() -eq [IntPtr]::Zero){
 throw "INTERACTIVE_DESKTOP_NOT_AVAILABLE: RDP may be disconnected or locked"
}
[OwenTestFocus]::ShowWindowAsync($p.MainWindowHandle,3)|Out-Null
Start-Sleep -Milliseconds 200
[OwenTestFocus]::SetForegroundWindow($p.MainWindowHandle)|Out-Null
Start-Sleep -Milliseconds 200
$success=([OwenTestFocus]::GetForegroundWindow() -eq $p.MainWindowHandle)
Write-Output ("TARGET_PID="+$p.Id+" ACTIVE="+$success)
if(-not $success){throw "TEST_OWEN_NOT_FOREGROUND"}
