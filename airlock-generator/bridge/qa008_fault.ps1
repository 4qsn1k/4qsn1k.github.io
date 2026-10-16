# QA-OL-008: two simultaneously open simulated doors cause latched fault.
# TEST PROJECT ONLY, no physical PLC / I/O.
$ErrorActionPreference="Stop"
$bridge=Join-Path $PSScriptRoot "owen-bridge.ps1"
$focus=Join-Path $PSScriptRoot "focus-owen.ps1"
$log=Join-Path $PSScriptRoot "qa008-latest.jsonl"
Set-Content -LiteralPath $log -Value "" -Encoding UTF8
function Log($step,$value){
 $row=[ordered]@{timestamp=(Get-Date).ToUniversalTime().ToString("o");step=$step;data=$value}
 $s=$row|ConvertTo-Json -Depth 8 -Compress
 Add-Content -LiteralPath $log -Value $s -Encoding UTF8
 Write-Output $s
}
function Bridge($action,$name="",$value=""){
 $a=@("-NoProfile","-ExecutionPolicy","Bypass","-File",$bridge,"-Action",$action,"-ExpectedBlock","FB_Room_N1")
 if($name){$a+=@("-Name",$name)}
 if($value){$a+=@("-Value",$value,"-Apply")}
 $r=@(& powershell.exe @a 2>&1)
 if($LASTEXITCODE -ne 0){throw ("BRIDGE_NONZERO "+($r -join "|"))}
 $json=$r|Where-Object {$_ -match '^\{'}|Select-Object -Last 1
 if(-not $json){throw "NO_JSON"}
 $obj=$json|ConvertFrom-Json
 if(-not $obj.ok){throw ("BRIDGE_ERROR "+$obj.error)}
 return $obj
}
function Status{
 for($i=0;$i -lt 3;$i++){
  $r=Bridge "status"
  if($r.signals.O_State -ne "UNAVAILABLE" -and $r.signals.O_Fault -ne "UNAVAILABLE"){return $r}
  Start-Sleep -Milliseconds 300
 }
 throw "STATUS_UNAVAILABLE"
}
function Focus{
 $r=@(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $focus 2>&1)
 if($LASTEXITCODE -ne 0 -or -not (($r -join "|") -match "ACTIVE=True")){throw "NO_INTERACTIVE_OWEN"}
}
function Set-TestInput($name,$value){
 Focus
 $r=Bridge "set-input" $name $value
 Log ("set_"+$name+"_"+$value) $r
 if($r.after -ne $value -and $r.before -ne $value){throw "INPUT_FAILED"}
}
try{
 $s=Status;Log "initial" $s.signals
 if($s.signals.FireNormal -ne "TRUE" -or $s.signals.I_D_1_2_Closed -ne "TRUE" -or
 $s.signals.I_D_1_4_Closed -ne "TRUE" -or $s.signals.I_D_1_5_Closed -ne "TRUE" -or
 $s.signals.O_Fault -ne "FALSE"){throw "INVALID_PRECONDITION"}
 if($s.signals.O_State -eq "30"){
   Start-Sleep -Seconds 32
   $s=Status;Log "after_purge" $s.signals
 }
 if($s.signals.O_State -ne "10"){throw "NOT_READY"}
 Set-TestInput "I_D_1_2_Closed" "FALSE"
 Set-TestInput "I_D_1_4_Closed" "FALSE"
 $s=Status;Log "two_open" $s.signals
 if($s.signals.O_State -ne "90" -or $s.signals.O_Fault -ne "TRUE"){throw "FAULT_NOT_LATCHED"}
 Set-TestInput "I_D_1_2_Closed" "TRUE"
 Set-TestInput "I_D_1_4_Closed" "TRUE"
 $s=Status;Log "two_closed_fault_latched" $s.signals
 if($s.signals.O_State -ne "90" -or $s.signals.O_Fault -ne "TRUE"){throw "FAULT_RELEASED_WITHOUT_RESET"}
 Set-TestInput "ResetFault" "TRUE"
 $s=Status;Log "reset_button_pressed" $s.signals
 if($s.signals.O_Fault -ne "FALSE"){throw "RESET_NOT_ACCEPTED"}
 Set-TestInput "ResetFault" "FALSE"
 $s=Status;Log "after_reset_released" $s.signals
 if($s.signals.O_State -ne "30" -or $s.signals.O_Fault -ne "FALSE" -or $s.signals.O_Red -ne "TRUE"){
   throw "DID_NOT_START_PURGE_AFTER_RESET"
 }
 Log "QA008_FINAL" @{status="PASS"}
}catch{
 Log "QA008_FINAL" @{status="FAIL_OR_UNVERIFIED";error=$_.Exception.Message}
 exit 1
}
