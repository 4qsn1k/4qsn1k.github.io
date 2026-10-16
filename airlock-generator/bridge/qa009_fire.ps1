# QA-OL-009/010 — TEST Owen Logic simulated fire input and recovery only.
# No PLC write, no I/O mapping, no hardware emergency release test.
$ErrorActionPreference="Stop"
$bridge=Join-Path $PSScriptRoot "owen-bridge.ps1"
$focus=Join-Path $PSScriptRoot "focus-owen.ps1"
$log=Join-Path $PSScriptRoot "qa009-latest.jsonl"
Set-Content -LiteralPath $log -Value "" -Encoding UTF8
function Log($name,$data){
 $event=[ordered]@{utc=(Get-Date).ToUniversalTime().ToString("o");step=$name;data=$data}
 $text=$event|ConvertTo-Json -Depth 8 -Compress
 Add-Content -LiteralPath $log -Value $text -Encoding UTF8
 Write-Output $text
}
function Bridge($action,$name="",$value=""){
 $a=@("-NoProfile","-ExecutionPolicy","Bypass","-File",$bridge,"-Action",$action,"-ExpectedBlock","FB_Room_N1")
 if($name){$a+=@("-Name",$name)}
 if($value){$a+=@("-Value",$value,"-Apply")}
 $x=@(& powershell.exe @a 2>&1)
 if($LASTEXITCODE -ne 0){throw ("BRIDGE_NONZERO "+($x -join "|"))}
 $json=$x|Where-Object {$_ -match '^\{'}|Select-Object -Last 1
 if(-not $json){throw "NO_BRIDGE_JSON"}
 $r=$json|ConvertFrom-Json
 if(-not $r.ok){throw ("BRIDGE_ERROR "+$r.error)}
 return $r
}
function Status {
 for($i=0;$i -lt 3;$i++){
  $r=Bridge "status"
  $names=@("O_State","O_Fault","O_D_1_2_Block","O_D_1_4_Block","O_D_1_5_Block")
  if(@($names|Where-Object {$r.signals.$_ -eq "UNAVAILABLE"}).Count -eq 0){return $r}
  Start-Sleep -Milliseconds 300
 }
 throw "STATUS_UNAVAILABLE"
}
function Read-Fire{
 for($i=0;$i -lt 3;$i++){
  try{$s=Bridge "read" "O_Fire";if($s.value -in @("TRUE","FALSE")){return $s.value}}catch{}
  Start-Sleep -Milliseconds 300
 }
 throw "FIRE_OUTPUT_UNAVAILABLE"
}
function Set-TestInput($name,$value){
 $r=@(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $focus 2>&1)
 if($LASTEXITCODE -ne 0 -or -not (($r -join "|") -match "ACTIVE=True")){throw "NO_INTERACTIVE_TEST_OWEN"}
 $x=Bridge "set-input" $name $value
 Log ("set_"+$name+"_"+$value) $x
 if($x.before -ne $value -and $x.after -ne $value){throw "INPUT_NOT_CONFIRMED"}
}
try{
 $s=Status;Log "initial" $s.signals
 if($s.signals.FireNormal -ne "TRUE" -or $s.signals.O_Fault -ne "FALSE" -or $s.signals.I_D_1_2_Closed -ne "TRUE" -or $s.signals.I_D_1_4_Closed -ne "TRUE" -or $s.signals.I_D_1_5_Closed -ne "TRUE"){throw "UNSAFE_PRECONDITION"}
 Set-TestInput "FireNormal" "FALSE"
 $fire=Status;Log "fire_mode" $fire.signals
 $out=Read-Fire;Log "fire_output" @{O_Fire=$out}
 if($fire.signals.O_State -ne "99" -or $out -ne "TRUE"){throw "FIRE_MODE_NOT_ENTERED"}
 foreach($k in @("O_D_1_2_Block","O_D_1_4_Block","O_D_1_5_Block")){
   if($fire.signals.$k -ne "FALSE"){throw ("LOGICAL_BLOCK_NOT_RELEASED_"+$k)}
 }
 if($fire.signals.O_Green -ne "FALSE"){throw "GREEN_ON_DURING_FIRE"}
 Log "QA009_FINAL" @{status="PASS";hardwareReleaseVerified=$false}
 Set-TestInput "FireNormal" "TRUE"
 $restored=Status;Log "after_fire_restored" $restored.signals
 $fire2=Read-Fire;Log "fire_output_after_restored" @{O_Fire=$fire2}
 if($fire2 -ne "FALSE" -or $restored.signals.O_State -ne "30" -or $restored.signals.O_Green -ne "FALSE"){throw "RECOVERY_PURGE_NOT_RUNNING"}
 foreach($k in @("O_D_1_2_Block","O_D_1_4_Block","O_D_1_5_Block")){
   if($restored.signals.$k -ne "TRUE"){throw ("RECOVERY_BLOCK_NOT_SET_"+$k)}
 }
 Log "QA010_OBSERVATION" @{status="AUTO_PURGE_RESTART_OBSERVED";manualAcknowledgeRequired="UNDEFINED";safetyReviewRequired=$true}
}catch{
 Log "QA009_010_FINAL" @{status="FAIL_OR_UNVERIFIED";error=$_.Exception.Message}
 exit 1
}
