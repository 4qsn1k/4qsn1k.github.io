param(
 [string]$PythonPath = 'python',
 [switch]$RealLibrary
)
# HOME-PC/Z4559 software smoke only. Does not start the agent, scan COM/IP, install packages/tasks or contact a PLC.
$ErrorActionPreference='Stop'
$project=Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $project
try {
 foreach($test in @('agent-reliability.test.js','rtu-supervisor.test.js','tcp-faults.test.js','profile-store.test.js')) {
  & node (Join-Path 'tests' $test)
  if($LASTEXITCODE -ne 0){throw "OFFLINE_TEST_FAILED $test"}
 }
 & $PythonPath -B tests/rtu-worker-faults.py
 if($LASTEXITCODE -ne 0){throw 'OFFLINE_WORKER_TEST_FAILED'}
 if($RealLibrary){
  # Install tests/requirements-rtu.txt in a separate local venv beforehand if this opt-in test is desired.
  & $PythonPath -B tests/rtu-library-faults.py
  if($LASTEXITCODE -ne 0){throw 'OFFLINE_LIBRARY_TEST_FAILED'}
 }
 Write-Output 'AIRLOCK_WINDOWS_OFFLINE_SMOKE_PASS; PHYSICAL_PLC_NOT_TESTED'
} finally { Pop-Location }
