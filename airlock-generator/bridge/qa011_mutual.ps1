# QA-OL-011; native test simulator only. Do not interact with a PLC.
$ErrorActionPreference="Stop"
$base=$PSScriptRoot
$bridge=Join-Path $base "owen-bridge-n4.ps1"
$focus=Join-Path $base "maximize_owen_test.ps1"
$log=Join-Path $base "qa011-latest.jsonl"
Set-Content -LiteralPath $log -Value "" -Encoding UTF8
function Log([string]$step,[object]$data){
 $entry=[ordered]@{timestamp=(Get-Date).ToUniversalTime().ToString('o');step=$step;data=$data}
 $json=$entry|ConvertTo-Json -Depth 8 -Compress
 Add-Content -LiteralPath $log -Value $json -Encoding UTF8
 Write-Output $json
}
function Invoke-Bridge([string]$action,[string]$name="",[string]$value=""){
 $args=@("-NoProfile","-ExecutionPolicy","Bypass","-File",$bridge,"-Action",$action,"-ExpectedBlock","FB_Room_N4")
 if($name){$args+=@("-Name",$name)}
 if($value){$args+=@("-Value",$value,"-Apply")}
 $output=@(& powershell.exe @args 2>&1)
 if($LASTEXITCODE -ne 0){throw "BRIDGE_EXIT: "+($output -join '|')}
 $json=$output|Where-Object {$_ -match '^\{'}|Select-Object -Last 1
 if(-not $json){throw "MISSING_JSON"}
 $r=$json|ConvertFrom-Json
 if(-not $r.ok){throw "BRIDGE_REPORTED_ERROR: "+$r.error}
 return $r
}
function Status(){
 for($i=1;$i -le 3;$i++){
  $r=Invoke-Bridge "status"
  $needed=@("O_State","O_Ready","O_Red","O_Green","O_Fault",
            "O_D_1_4_Block","O_D_2_4_Block","O_D_3_4_Block","O_D_4_6_Block")
  if(@($needed|Where-Object {$r.signals.$_ -eq "UNAVAILABLE"}).Count -eq 0){return $r}
  Start-Sleep -Milliseconds 350
 }
 throw "STATUS_UNAVAILABLE"
}
function Set-TestInput([string]$name,[string]$value){
 $focusout=@(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $focus 2>&1)
 if($LASTEXITCODE -ne 0 -or (($focusout -join '|') -notmatch 'ACTIVE=True')){
  throw "TEST_GUI_NOT_ACTIVE: "+($focusout -join '|')
 }
 $r=Invoke-Bridge "set-input" $name $value
 Log ("set_"+$name+"_"+$value) $r
 if($r.before -ne $value -and $r.after -ne $value){throw "INPUT_WRITE_NOT_VERIFIED"}
}
function AssertReady([object]$s,[string]$stage){
 if($s.signals.O_State -ne "10" -or $s.signals.O_Ready -ne "TRUE" -or
    $s.signals.O_Green -ne "TRUE" -or $s.signals.O_Red -ne "FALSE" -or
    $s.signals.O_Fault -ne "FALSE"){throw ("NOT_READY: "+$stage)}
 foreach($id in @('1_4','2_4','3_4','4_6')){
  $name='O_D_'+$id+'_Block'
  if($s.signals.$name -ne "FALSE"){throw ("BLOCK_HELD: "+$stage+' '+$name)}
 }
}
function AssertOpen([object]$s,[string]$open,[string]$stage){
 if($s.signals.O_State -ne "20" -or $s.signals.O_Red -ne "TRUE" -or
    $s.signals.O_Green -ne "FALSE" -or $s.signals.O_Fault -ne "FALSE"){
  throw ("OPEN_STATE_INCORRECT: "+$stage)
 }
 foreach($id in @('1_4','2_4','3_4','4_6')){
  $name='O_D_'+$id+'_Block'
  $expected=if($id -eq $open){"FALSE"}else{"TRUE"}
  if($s.signals.$name -ne $expected){throw ("WRONG_BLOCK: "+$stage+' '+$name)}
 }
}
try{
 $s=Status;Log 'initial_ready' $s.signals
 AssertReady $s 'initial'
 foreach($door in @('3_4','4_6')){
  $reed='I_D_'+$door+'_Closed'
  Set-TestInput $reed 'FALSE'
  $a=Status;Log ('open_'+$door) $a.signals
  AssertOpen $a $door ('open_'+$door)
  Set-TestInput $reed 'TRUE'
  $b=Status;Log ('closed_'+$door) $b.signals
  AssertReady $b ('closed_'+$door)
 }
 Log 'QA011_FINAL' @{status='PASS';mode='mutual';purgeTimerUsed=$false;testedDoors=@('3-4','4-6')}
}catch{
 Log 'QA011_FINAL' @{status='FAIL_OR_UNVERIFIED';error=$_.Exception.Message}
 exit 1
}
