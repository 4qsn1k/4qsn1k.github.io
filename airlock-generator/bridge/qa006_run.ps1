$ErrorActionPreference="Stop"
$path=Join-Path $PSScriptRoot "owen-bridge.ps1"
$focus=Join-Path $PSScriptRoot "focus-owen.ps1"
$steps=New-Object System.Collections.ArrayList
$logFile=Join-Path $PSScriptRoot "qa006-latest.jsonl"
Set-Content -LiteralPath $logFile -Value "" -Encoding UTF8
function Invoke-Bridge([string]$action,[string]$name="",[string]$value=""){
  $arguments=@("-NoProfile","-ExecutionPolicy","Bypass","-File",$path,"-Action",$action,"-ExpectedBlock","FB_Room_N1")
  if($name){$arguments+=@("-Name",$name)}
  if($value){$arguments+=@("-Value",$value,"-Apply")}
  $lines=@(& powershell.exe @arguments 2>&1)
  if($LASTEXITCODE -ne 0){throw ("BRIDGE_ERROR:"+($lines -join '|'))}
  $json=$lines|Where-Object {$_ -match '^[{]'}|Select-Object -Last 1
  if(-not $json){throw ("NO_JSON:"+($lines -join '|'))}
  $result=$json|ConvertFrom-Json
  if(-not $result.ok){throw ("BRIDGE_FAILED:"+($lines -join '|'))}
  return $result
}
function Read-Status {
  for($attempt=1;$attempt -le 3;$attempt++){
    $s=Invoke-Bridge "status"
    $names=@("O_State","O_Ready","O_Red","O_Green","O_D_1_2_Block","O_D_1_4_Block","O_D_1_5_Block")
    $bad=@($names|Where-Object {$s.signals.$_ -eq "UNAVAILABLE"})
    if($bad.Count -eq 0){return $s}
    Write-Output ("QA006_RETRY "+$attempt+" UNAVAILABLE:"+($bad -join ","))
    Start-Sleep -Milliseconds 400
  }
  throw "STATUS_READING_UNAVAILABLE_AFTER_RETRIES"
}
function Focus-Window {
  $output=@(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $focus 2>&1)
  if($LASTEXITCODE -ne 0 -or -not (($output -join '|') -match 'ACTIVE=True')){
    throw ("COULD_NOT_FOCUS:" + ($output -join '|'))
  }
}
function Mark([string]$label,[object]$data){
  $row=[pscustomobject]@{at=(Get-Date).ToUniversalTime().ToString("o");step=$label;result=$data}
  [void]$steps.Add($row)
  $json="QA006_STEP "+($row|ConvertTo-Json -Depth 7 -Compress)
  Write-Output $json
  Add-Content -LiteralPath $logFile -Value $json -Encoding UTF8
}
function Assert-State([object]$status,[string]$state,[string]$signal,[string]$expected){
  if($status.signals.O_State -ne $state){
    throw ("STATE_MISMATCH expected="+$state+" actual="+$status.signals.O_State)
  }
  if($status.signals.$signal -ne $expected){
    throw ("SIGNAL_MISMATCH "+$signal+" expected="+$expected+" actual="+$status.signals.$signal)
  }
}
try{
  $s0=Read-Status;Mark "initial_open" $s0.signals
  Assert-State $s0 "20" "I_D_1_2_Closed" "FALSE"
  if($s0.signals.FireNormal -ne "TRUE"){throw "FIRE_INPUT_NOT_NORMAL"}
  foreach($reed in @("I_D_1_4_Closed","I_D_1_5_Closed")){
    if($s0.signals.$reed -ne "TRUE"){throw "OTHER_REED_OPEN"}
  }
  Focus-Window
  $s1=Invoke-Bridge "set-input" "I_D_1_2_Closed" "TRUE";Mark "first_close" $s1
  if($s1.after -ne "TRUE"){throw "FIRST_CLOSE_NOT_CONFIRMED"}
  $state1=Read-Status;Mark "first_purge" $state1.signals
  Assert-State $state1 "30" "O_Red" "TRUE"
  Focus-Window
  $s2=Invoke-Bridge "set-input" "I_D_1_2_Closed" "FALSE";Mark "reopen_during_purge" $s2
  if($s2.after -ne "FALSE"){throw "REOPEN_NOT_CONFIRMED"}
  $state2=Read-Status;Mark "reopened" $state2.signals
  Assert-State $state2 "20" "O_D_1_4_Block" "TRUE"
  Focus-Window
  $s3=Invoke-Bridge "set-input" "I_D_1_2_Closed" "TRUE";Mark "second_close" $s3
  if($s3.after -ne "TRUE"){throw "SECOND_CLOSE_NOT_CONFIRMED"}
  $secondCloseAt=Get-Date
  $state3=Read-Status;Mark "second_purge" $state3.signals
  Assert-State $state3 "30" "O_Red" "TRUE"
  $remaining=[math]::Ceiling(18.0-((Get-Date)-$secondCloseAt).TotalSeconds)
  if($remaining -gt 0){Start-Sleep -Seconds $remaining}
  $beforeEnd=Read-Status;Mark "before_30s_elapsed" $beforeEnd.signals
  Assert-State $beforeEnd "30" "O_Green" "FALSE"
  $remaining=[math]::Ceiling(38.0-((Get-Date)-$secondCloseAt).TotalSeconds)
  if($remaining -gt 0){Start-Sleep -Seconds $remaining}
  $afterEnd=Read-Status;Mark "after_30s_elapsed" $afterEnd.signals
  Assert-State $afterEnd "10" "O_Ready" "TRUE"
  foreach($signal in @("O_D_1_2_Block","O_D_1_4_Block","O_D_1_5_Block")){
    if($afterEnd.signals.$signal -ne "FALSE"){throw ("BLOCK_NOT_RELEASED:"+$signal)}
  }
  Write-Output "QA006_FINAL PASS"
  Add-Content -LiteralPath $logFile -Value "QA006_FINAL PASS" -Encoding UTF8
}catch{
  $finalMessage="QA006_FINAL FAIL_OR_UNVERIFIED: "+$_.Exception.Message
  Write-Output $finalMessage
  Add-Content -LiteralPath $logFile -Value $finalMessage -Encoding UTF8
  exit 1
}
