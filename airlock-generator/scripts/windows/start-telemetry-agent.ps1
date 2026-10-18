param(
 [Parameter(Mandatory=$true)][string]$Config,
 [string]$PythonPath = "",
 [int]$Port = 8787
)
# Foreground read-only agent launcher. Never installs a service or accesses PLC before successful preflight.
$ErrorActionPreference='Stop'
$project=Resolve-Path (Join-Path $PSScriptRoot '..\..')
$configFile=Resolve-Path -LiteralPath $Config -ErrorAction Stop
if($Port -lt 1 -or $Port -gt 65535){throw 'PORT_RANGE_ERROR'}
$node=Get-Command node.exe -ErrorAction Stop
if(-not $PythonPath){
 $lab=Join-Path $env:USERPROFILE 'AirlockGeneratorLab\.venv\Scripts\python.exe'
 if(Test-Path -LiteralPath $lab){$PythonPath=$lab}
 else{$PythonPath=(Get-Command python.exe -ErrorAction Stop).Source}
}
if(-not (Test-Path -LiteralPath $PythonPath)){throw 'PYTHON_EXECUTABLE_MISSING'}
& $PythonPath -c 'import pymodbus, serial;print("RTU_PYTHON_DEPENDENCIES_READY")'
if($LASTEXITCODE -ne 0){throw 'MODBUS_DEPENDENCIES_MISSING'}
& $node.Source (Join-Path $project 'gateway\preflight.js') --config "$configFile"
if($LASTEXITCODE -ne 0){throw 'PROFILE_NOT_READY_NO_PLC_POLL_PERFORMED'}
$env:AIRLOCK_PYTHON=$PythonPath
Write-Output 'AIRLOCK_AGENT_START_LOCAL_LOOPBACK_ONLY; MODBUS_READ_ONLY'
& $node.Source (Join-Path $project 'gateway\server.js') --config "$configFile" --port $Port
if($LASTEXITCODE -ne 0){throw 'AIRLOCK_AGENT_TERMINATED_WITH_ERROR'}
