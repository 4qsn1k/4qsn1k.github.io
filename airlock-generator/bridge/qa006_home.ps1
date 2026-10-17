# QA-OL-006: native Owen Logic TEST-only repeat purge test.
# Prerequisite: FB_Room_N1 simulator RUNNING, only door 1-2 open, O_State=20,
# other two doors closed, FireNormal=TRUE, ResetFault=FALSE.
# Hard safety guards enforced by owen-bridge.ps1; do not use real project.
$ErrorActionPreference="Stop"
$bridge=Join-Path $PSScriptRoot "owen-bridge.ps1"
$log=Join-Path $PSScriptRoot "qa006-home-latest.jsonl"
Set-Content -LiteralPath $log -Value "" -Encoding UTF8
function Mark([string]$label,$data){
 $row=[pscustomobject]@{at=(Get-Date).ToUniversalTime().ToString("o");step=$label;data=$data}
 $json=$row|ConvertTo-Json -Depth 8 -Compress
 [Console]::WriteLine("QA_HOME_STEP "+$json)
 Add-Content -LiteralPath $log -Value $json -Encoding UTF8
}
function Bridge([string]$action,[string]$signal="",[string]$value=""){
 $args=@("-NoProfile","-ExecutionPolicy","Bypass","-File",$bridge,
  "-Action",$action,"-ExpectedBlock","FB_Room_N1")
 if($signal){$args+=@("-Name",$signal)}
 if($value){$args+=@("-Value",$value,"-Apply")}
 $lines=@(& powershell.exe @args 2>&1)
 if($LASTEXITCODE -ne 0){throw ("BRIDGE_EXIT_"+$action+"_"+($lines -join "|"))}
 $json=$lines|Where-Object {$_ -is [string] -and $_.Trim().StartsWith("{")}|Select-Object -Last 1
 if(-not $json){throw "BRIDGE_NO_JSON"}
 $obj=$json|ConvertFrom-Json
 if(-not $obj.ok){throw "BRIDGE_NOT_OK"}
 return $obj
}
function Input([string]$value){
 $r=Bridge "set-input" "I_D_1_2_Closed" $value
 if($r.changed -and $r.after -ne $value){throw "DOOR_CHANGE_NOT_CONFIRMED"}
 if(!$r.changed -and $r.before -ne $value){throw "DOOR_ALREADY_NOT_TARGET"}
 Mark ("DOOR_CLOSED_"+$value) $r
 return [datetimeoffset]::Parse($r.timestamp)
}
function State([string]$expected,[string]$step){
 $r=Bridge "read" "O_State"
 Mark $step $r
 if($r.value -ne $expected){throw ("STATE_EXPECT_"+$expected+"_GOT_"+$r.value)}
}
try{
 State "20" "RESUME_FROM_OPEN_DOOR"
 $firstClosed=Input "TRUE"
 State "30" "FIRST_PURGE"
 $reopened=Input "FALSE"
 $elapsed=($reopened-$firstClosed).TotalSeconds
 Mark "FIRST_PURGE_INTERRUPTED_AT_SECONDS" $elapsed
 if($elapsed -ge 30){throw ("REOPEN_TOO_LATE_TO_PROVE_RESET "+$elapsed)}
 State "20" "REOPEN_BEFORE_TIMEOUT"
 $secondClosed=Input "TRUE"
 State "30" "SECOND_PURGE"
 $remaining=40-((Get-Date).ToUniversalTime()-$secondClosed.UtcDateTime).TotalSeconds
 if($remaining -gt 0){Write-Output ("WAIT_SECONDS="+[Math]::Ceiling($remaining));Start-Sleep -Seconds ([Math]::Ceiling($remaining))}
 State "10" "AFTER_COMPLETE_PURGE"
 $ready=Bridge "read" "O_Ready"
 Mark "READINESS" $ready
 if($ready.value -ne "TRUE"){throw "O_READY_NOT_TRUE"}
 $blocked=Bridge "read" "O_D_1_4_Block"
 Mark "SHARED_DOOR_REQUEST" $blocked
 if($blocked.value -ne "FALSE"){throw "SHARED_DOOR_NOT_RELEASED"}
 Add-Content $log -Value "QA_HOME_OL_006_PASS" -Encoding UTF8
 Write-Output "QA_HOME_OL_006_PASS"
}catch{
 $msg="QA_HOME_OL_006_FAIL_OR_UNVERIFIED: "+$_.Exception.Message
 Add-Content $log -Value $msg -Encoding UTF8
 Write-Output $msg
 exit 1
}
