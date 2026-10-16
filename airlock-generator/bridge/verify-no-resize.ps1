$ErrorActionPreference="Stop"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$p=Get-Process ProgramRelayFBD | Where-Object {$_.MainWindowTitle -like '*Airlock_SIMULATION_TEST.owle'} | Select-Object -First 1
if(-not $p){throw 'Test Owen Logic missing'}
function Current-Shape(){
 $el=[System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
 $rect=$el.Current.BoundingRectangle
 $window=$el.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern)
 return [pscustomobject]@{geometry=$rect.ToString();state=$window.Current.WindowVisualState.ToString()}
}
$base=$PSScriptRoot
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $base 'focus-owen.ps1') | Out-Null
$before=Current-Shape
Write-Output ("BEFORE "+($before|ConvertTo-Json -Compress))
foreach($v in @('FALSE','TRUE')){
 $output=@(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $base 'owen-bridge.ps1') -Action set-input -ExpectedBlock FB_Room_N4 -Name I_D_3_4_Closed -Value $v -Apply)
 $j=$output|Where-Object {$_ -match '^\{'}|Select-Object -Last 1|ConvertFrom-Json
 Write-Output ("SWITCH value="+$v+" changed="+$j.changed+" after="+$j.after+" error="+$j.error)
 if(-not $j.ok -or $j.after -ne $v){throw ('SWITCH_NOT_CONFIRMED '+$v)}
 $after=Current-Shape
 Write-Output ("AFTER_"+$v+" "+($after|ConvertTo-Json -Compress))
 if($before.geometry -ne $after.geometry -or $before.state -ne $after.state){throw 'WINDOW_RESIZED'}
}
Write-Output 'WINDOW_SIZE_STABLE_PASS'
