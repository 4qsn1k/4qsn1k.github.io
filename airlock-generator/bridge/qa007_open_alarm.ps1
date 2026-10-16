# QA-OL-007: TEST-ONLY Owen Logic ST open-door overtime/alarm validation.
# No PLC or physical I/O.
$ErrorActionPreference="Stop"
$bridge=Join-Path $PSScriptRoot "owen-bridge.ps1"
$focus=Join-Path $PSScriptRoot "focus-owen.ps1"
$log=Join-Path $PSScriptRoot "qa007-latest.jsonl"
Set-Content -LiteralPath $log -Value "" -Encoding UTF8
function Mark([string]$step,[object]$data){
 $event=[ordered]@{timestamp=(Get-Date).ToUniversalTime().ToString("o");step=$step;data=$data}
 $line=($event|ConvertTo-Json -Depth 8 -Compress)
 Add-Content -LiteralPath $log -Value $line -Encoding UTF8
 Write-Output $line
}
function InvokeBridge([string]$action,[string]$name="",[string]$value=""){
 $arguments=@("-NoProfile","-ExecutionPolicy","Bypass","-File",$bridge,"-Action",$action,"-ExpectedBlock","FB_Room_N1")
 if($name){$arguments+=@("-Name",$name)}
 if($value){$arguments+=@("-Value",$value,"-Apply")}
 $output=@(& powershell.exe @arguments 2>&1)
 if($LASTEXITCODE -ne 0){throw ("BRIDGE_NONZERO "+($output -join "|"))}
 $txt=$output|Where-Object {$_ -match '^\{'}|Select-Object -Last 1
 if(-not $txt){throw "BRIDGE_NO_JSON"}
 $r=$txt | ConvertFrom-Json
 if(-not $r.ok){throw ("BRIDGE_ERROR "+$r.error)}
 return $r
}
function Status{
 for($i=0;$i -lt 3;$i++){
  $r=InvokeBridge "status"
  if($r.signals.O_State -ne "UNAVAILABLE" -and $r.signals.O_Ready -ne "UNAVAILABLE"){return $r}
  Start-Sleep -Milliseconds 300
 }
 throw "STATE_UNAVAILABLE"
}
function Read([string]$signal){
 for($i=0;$i -lt 3;$i++){
  try{$r=InvokeBridge "read" $signal;if($r.value -match '^(TRUE|FALSE|[0-9]+)$'){return $r.value}}catch{}
  Start-Sleep -Milliseconds 200
 }
 throw ("SIGNAL_UNAVAILABLE "+$signal)
}
function Focus{
 $out=@(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $focus 2>&1)
 if($LASTEXITCODE -ne 0 -or -not (($out -join '|') -match 'ACTIVE=True')){throw "NO_INTERACTIVE_TEST_OWEN"}
}
try{
 $initial=Status;Mark "initial" $initial.signals
 if($initial.signals.FireNormal -ne "TRUE" -or $initial.signals.O_State -ne "10" -or $initial.signals.I_D_1_2_Closed -ne "TRUE"){throw "PRECONDITION_NOT_READY"}
 Focus
 $open=InvokeBridge "set-input" "I_D_1_2_Closed" "FALSE"
 Mark "open_door" $open
 if($open.after -ne "FALSE"){throw "OPEN_NOT_CONFIRMED"}
 $start=Get-Date
 $during=Status;Mark "open_state" $during.signals
 if($during.signals.O_State -ne "20"){throw "NOT_IN_OPEN"}
 $early=Read "O_D_1_2_Overtime";Mark "initial_overtime" @{overtime=$early}
 if($early -ne "FALSE"){throw "OVERTIME_TOO_EARLY"}
 $remaining=[math]::Ceiling(35-((Get-Date)-$start).TotalSeconds)
 if($remaining -gt 0){Start-Sleep -Seconds $remaining}
 $overtime=Read "O_D_1_2_Overtime";Mark "after_35s_overtime" @{overtime=$overtime}
 $alarm=Read "O_Alarm";Mark "after_35s_alarm" @{alarm=$alarm}
 if($overtime -ne "TRUE" -or $alarm -ne "TRUE"){throw "OVERTIME_OR_ALARM_MISSING"}
 Focus
 $close=InvokeBridge "set-input" "I_D_1_2_Closed" "TRUE";Mark "close_door" $close
 if($close.after -ne "TRUE"){throw "CLOSURE_NOT_CONFIRMED"}
 $closed=Status;Mark "after_close" $closed.signals
 if($closed.signals.O_State -ne "30"){throw "PURGE_NOT_STARTED"}
 $alarmAfter=Read "O_Alarm";Mark "alarm_after_close" @{alarm=$alarmAfter}
 if($alarmAfter -ne "FALSE"){throw "ALARM_FAILED_TO_CLEAR"}
 Mark "QA007_FINAL" @{status="PASS"}
}catch{
 Mark "QA007_FINAL" @{status="FAIL_OR_UNVERIFIED";error=$_.Exception.Message}
 exit 1
}
