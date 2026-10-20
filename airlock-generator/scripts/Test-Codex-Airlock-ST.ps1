param([switch]$RunTests)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  Write-Output 'AIRLOCK_CODEX_ST_PREFLIGHT'
  $branch = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'GIT_UNAVAILABLE' }
  if ($branch -ne 'codex/airlock-28-st-native-acceptance') {
    throw "WRONG_BRANCH:$branch"
  }
  Write-Output "BRANCH=$branch"
  $files = @(
    'AGENTS.md',
    'docs/CODEX-ST-START-HERE-2026-10-20.md',
    'docs/CODEX-ST-NATIVE-QA-MATRIX.csv',
    'native-airlock-fbd.js',
    'tests/native-airlock-fbd.test.js',
    'experimental/fixtures/real-cad-1252-1274-candidate.json',
    'experimental/native-gui/Airlock_NATIVE_2DOOR_INTERLOCK_10S_GUI_20261020.owle',
    'experimental/native-gui/Issue28_PR100_PRIMITIVES_GUI_CAPTURE.owle'
  )
  foreach ($f in $files) {
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { throw "MISSING_FILE:$f" }
  }
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'experimental/native-gui/Airlock_NATIVE_2DOOR_INTERLOCK_10S_GUI_20261020.owle').Hash.ToLowerInvariant()
  if ($hash -ne '040de07825dee60d0ae726073e9c2fc2a0931f27e4ae170b1e4d714eaea8b0ef') {
    throw 'VENDOR_TIMER_PROOF_HASH_MISMATCH'
  }
  Write-Output 'ORIGINAL_VENDOR_PROOF_SHA256=PASS'
  & node --version
  if ($LASTEXITCODE -ne 0) { throw 'NODE_UNAVAILABLE' }
  & codex --version
  if ($LASTEXITCODE -ne 0) { throw 'CODEX_CLI_UNAVAILABLE' }
  & codex login status
  if ($LASTEXITCODE -ne 0) { throw 'CODEX_LOGIN_NOT_READY' }
  $free = (Get-PSDrive -Name C).Free
  Write-Output ("FREE_C_GB=" + [math]::Round($free / 1GB,2))
  if ($free -lt 3GB) { Write-Warning 'LOW_DISK_SPACE: do not generate large test artifacts.' }
  Write-Output 'HARDWARE_ACCESS=NOT_PERFORMED'
  if ($RunTests) {
    & node tests/native-airlock-fbd.test.js
    if ($LASTEXITCODE -ne 0) { throw 'REFERENCE_QA_FAILED' }
    & node tests/reserved-fbd-export.test.js
    if ($LASTEXITCODE -ne 0) { throw 'EXPORT_QA_FAILED' }
    Write-Output 'FOCUSED_REFERENCE_QA=PASS'
  }
  Write-Output 'AIRLOCK_CODEX_ST_PREFLIGHT=PASS'
} finally { Pop-Location }
