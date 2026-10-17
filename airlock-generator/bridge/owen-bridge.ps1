# Owen Logic UI Automation bridge v0.2 — TEST SIMULATION ONLY
# All actions require the exact separate Airlock_SIMULATION_TEST.owle project.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File owen-bridge.ps1 -Action status
#        ... -Action read -Name I_D_1_2_Closed
#        ... -Action set-input -Name I_D_1_2_Closed -Value TRUE -Apply
[CmdletBinding()]
param(
  [ValidateSet("status","read","set-input","inspect")]
  [string]$Action="status",
  [string]$Name="",
  [ValidateSet("TRUE","FALSE")][string]$Value="TRUE",
  [switch]$Apply,
  [string]$ExpectedBlock="FB_Room_N1"
)
$ErrorActionPreference="Stop"
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class OwenBridgeWin32 {
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int cmd);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
"@ -ErrorAction Stop
  # The WPF UIA bounds are in physical pixels; align mouse coordinates with them.
  [OwenBridgeWin32]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
  # Get-Process.MainWindowHandle can identify a hidden native Pane after focus.
  # Locate the exact test document in the desktop top-level UIA Window set.
  $desktopRoot=[System.Windows.Automation.AutomationElement]::RootElement
  $topWindows=$desktopRoot.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    [System.Windows.Automation.Condition]::TrueCondition)
  $matches=@()
  for($wi=0;$wi -lt $topWindows.Count;$wi++){
    $candidate=$topWindows.Item($wi)
    if($candidate.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window){continue}
    if(-not $candidate.Current.Name.EndsWith("Airlock_SIMULATION_TEST.owle")){continue}
    $owner=Get-Process -Id $candidate.Current.ProcessId -ErrorAction SilentlyContinue
    if($owner -and $owner.ProcessName -eq "ProgramRelayFBD"){$matches+=,$candidate}
  }
  if($matches.Count -ne 1){throw "TEST_PROJECT_WINDOW_NOT_UNIQUE: "+$matches.Count}
  $window=$matches[0]
  $targetHandle=[IntPtr]($window.Current.NativeWindowHandle)
  if($targetHandle -eq [IntPtr]::Zero){throw "TEST_WINDOW_NO_HANDLE"}
  $process=Get-Process -Id $window.Current.ProcessId -ErrorAction Stop
  $property=[System.Windows.Automation.AutomationElement]::AutomationIdProperty
  $condition=New-Object System.Windows.Automation.PropertyCondition($property,"Editor")
  $editor=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
  if(-not $editor){throw "ST_EDITOR_NOT_FOUND"}
  $pattern=$editor.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
  if(-not $pattern){throw "ST_TEXT_PATTERN_NOT_AVAILABLE"}
  $source=$pattern.DocumentRange.GetText(-1)
  $blockMatch=[regex]::Match($source,"(?m)^\s*FUNCTION_BLOCK\s+(\w+)")
  if(-not $blockMatch.Success){throw "ST_BLOCK_NOT_FOUND"}
  $block=$blockMatch.Groups[1].Value
  if($ExpectedBlock -and $block -ne $ExpectedBlock){throw "BLOCK_MISMATCH: "+$block}
  $inputs=[regex]::Match($source,"(?s)\bVAR_INPUT\b(.*?)\bEND_VAR\b").Groups[1].Value
  $outputs=[regex]::Match($source,"(?s)\bVAR_OUTPUT\b(.*?)\bEND_VAR\b").Groups[1].Value
  function SignalLocation([string]$signal){
    if($signal -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,79}$'){throw "INVALID_SIGNAL_NAME"}
    $hit=$pattern.DocumentRange.FindText($signal,$false,$false)
    if(-not $hit){throw "SIGNAL_NOT_FOUND: "+$signal}
    $hit.ScrollIntoView($true)
    Start-Sleep -Milliseconds 120
    $rr=$hit.GetBoundingRectangles()
    if(-not $rr -or $rr.Count -eq 0){throw "SIGNAL_NOT_VISIBLE: "+$signal}
    $a=$rr[0]
    $near=@()
    $controls=$editor.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
    for($i=0;$i -lt $controls.Count;$i++){
      $elem=$controls.Item($i)
      if($elem.Current.ControlType -ne [System.Windows.Automation.ControlType]::Text){continue}
      $label=$elem.Current.Name
      if($label -notmatch '^(TRUE|FALSE|\d+)$'){continue}
      $rect=$elem.Current.BoundingRectangle
      $yDiff=[Math]::Abs(($rect.Top+$rect.Height/2)-($a.Top+$a.Height/2))
      $xDiff=$rect.Left-$a.Right
      if($yDiff -le 17 -and $xDiff -ge -10 -and $xDiff -lt 330){
        $near+= [pscustomobject]@{Element=$elem;Value=$label;Rect=$rect;Score=$xDiff+$yDiff*4}
      }
    }
    if($near.Count -eq 0){throw "INLINE_VALUE_NOT_FOUND: "+$signal}
    $best=$near|Sort-Object Score|Select-Object -First 1
    $rect=$best.Rect
    return [pscustomobject]@{
      Name=$signal;Value=$best.Value;
      X=[int]($rect.Left+$rect.Width/2);Y=[int]($rect.Top+$rect.Height/2);
      Input=([regex]::IsMatch($inputs,"(?m)^\s*"+[regex]::Escape($signal)+"<BooleanVariable>"));
      Output=([regex]::IsMatch($outputs,"(?m)^\s*"+[regex]::Escape($signal)+"<(?:BooleanVariable|UdintVariable)>"));
    }
  }
  $result=@{ok=$true;action=$Action;project="Airlock_SIMULATION_TEST.owle";block=$block;pid=$process.Id}
  switch($Action){
    "inspect" {
      $result.inputNames=[regex]::Matches($inputs,"(?m)^\s*(\w+)<BooleanVariable>")|ForEach-Object {$_.Groups[1].Value}
      $result.outputNames=[regex]::Matches($outputs,"(?m)^\s*(\w+)<(?:BooleanVariable|UdintVariable)>")|ForEach-Object {$_.Groups[1].Value}
      $result.stLength=$source.Length
    }
    "read" {
      if(-not $Name){throw "REQUIRED_NAME"}
      $a=SignalLocation $Name
      $result.signal=$a.Name;$result.value=$a.Value;$result.input=$a.Input;$result.output=$a.Output
    }
    "status" {
      $readings=@{}
      $signals=@("FireNormal","ResetFault","O_State","O_Ready","O_Red","O_Green","O_Fault","O_Fire","O_Alarm")
      if($block -eq "FB_Room_N4"){
        $signals+=@("I_D_1_4_Closed","I_D_2_4_Closed","I_D_3_4_Closed","I_D_4_6_Closed",
          "O_D_1_4_Block","O_D_2_4_Block","O_D_3_4_Block","O_D_4_6_Block")
      }elseif($block -eq "FB_Room_N1"){
        $signals+=@("I_D_1_2_Closed","I_D_1_4_Closed","I_D_1_5_Closed",
          "O_D_1_2_Block","O_D_1_4_Block","O_D_1_5_Block")
      }else{throw "UNSUPPORTED_BLOCK_FOR_STATUS: "+$block}
      foreach($signal in $signals){
        try{$loc=SignalLocation $signal;$readings[$signal]=$loc.Value}
        catch{$readings[$signal]="UNAVAILABLE"}
      }
      $result.signals=$readings
    }
    "set-input" {
      if(-not $Name){throw "REQUIRED_NAME"}
      $before=SignalLocation $Name
      if(-not $before.Input){throw "NOT_AN_INPUT: "+$Name}
      if($before.Value -notin @("TRUE","FALSE")){throw "NOT_BOOLEAN: "+$Name}
      $result.signal=$Name;$result.before=$before.Value;$result.requested=$Value
      if($before.Value -eq $Value){$result.changed=$false;$result.note="ALREADY_MATCHES"}
      elseif(-not $Apply){$result.changed=$false;$result.note="DRY_RUN_ADD_APPLY"}
      else {
        # Do not call ShowWindow(SW_RESTORE=9): that un-maximizes the Owen Logic window.
        # The preceding focus helper can maximize once; the bridge must preserve size.
        [OwenBridgeWin32]::SetForegroundWindow($targetHandle)|Out-Null
        Start-Sleep -Milliseconds 250
        if([OwenBridgeWin32]::GetForegroundWindow() -ne $targetHandle){throw "FOREGROUND_NOT_OWEN: refusing click"}
        $current=SignalLocation $Name
        if($current.Value -ne $before.Value){throw "RACE_INPUT_CHANGED: refusing click"}
        [OwenBridgeWin32]::SetCursorPos($current.X,$current.Y)|Out-Null
        [OwenBridgeWin32]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
        Start-Sleep -Milliseconds 75
        [OwenBridgeWin32]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
        Start-Sleep -Milliseconds 300
        # Owen Logic opens a modal "Изменить значение" (change value) dialog.
        # Find it by PID + exact signal label; never click unrelated windows.
        $desktop=[System.Windows.Automation.AutomationElement]::RootElement
        $top=$desktop.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
        $modal=$null
        foreach($candidate in $top){
          if($candidate.Current.ProcessId -ne $process.Id){continue}
          if($candidate.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window){continue}
          if($candidate.Current.NativeWindowHandle -eq $window.Current.NativeWindowHandle){continue}
          $c=$candidate.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
          if($c.Count -lt 7 -or $c.Count -gt 25){continue}
          foreach($el in $c){if($el.Current.Name -eq $Name){$modal=$candidate;break}}
          if($modal){break}
        }
        if(-not $modal){throw "SIMULATOR_VALUE_DIALOG_NOT_FOUND: no input changed"}
        $controls=$modal.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
        $valueButton=$null;$fixCheck=$null;$actionButtons=@()
        foreach($el in $controls){
          if($el.Current.ControlType -eq [System.Windows.Automation.ControlType]::CheckBox){
            $fixCheck=$el
          } elseif($el.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button){
            try{$null=$el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern);$valueButton=$el}catch{}
            try{$null=$el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern);$actionButtons+=,$el}catch{}
          }
        }
        if(-not $valueButton -or -not $fixCheck -or $actionButtons.Count -ne 2){
          throw "UNEXPECTED_SIMULATOR_DIALOG: do not confirm"
        }
        $toggle=$valueButton.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
        $fix=$fixCheck.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
        $wanted=if($Value -eq "TRUE"){"On"}else{"Off"}
        if([string]$toggle.Current.ToggleState -ne $wanted){$toggle.Toggle()}
        if([string]$toggle.Current.ToggleState -ne $wanted){throw "TOGGLE_NOT_APPLIED"}
        # In Owen Logic this keeps the injected test signal stable.
        if($fix.Current.ToggleState -eq [System.Windows.Automation.ToggleState]::Off){$fix.Toggle()}
        if($fix.Current.ToggleState -ne [System.Windows.Automation.ToggleState]::On){
          throw "FIXATION_NOT_ENABLED"
        }
        # Left button is "Принять", right is "Отмена" in the verified dialog.
        $accept=@($actionButtons|Sort-Object {$_.Current.BoundingRectangle.Left})[0]
        $invoke=$accept.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $invoke.Invoke()
        Start-Sleep -Milliseconds 400
        $after=SignalLocation $Name
        $result.after=$after.Value;$result.changed=($after.Value -eq $Value)
        $result.note=if($result.changed){"CHANGED_AND_VERIFIED"}else{"CHANGE_NOT_CONFIRMED"}
      }
    }
  }
  $result.timestamp=(Get-Date).ToUniversalTime().ToString("o")
  $result|ConvertTo-Json -Depth 8 -Compress
} catch {
  $msg=$_.Exception.Message
  @{ok=$false;action=$Action;error=$msg;timestamp=(Get-Date).ToUniversalTime().ToString("o")}|
    ConvertTo-Json -Compress
  exit 1
}
