param(
 [string]$Config,
 [string]$Root="",
 [switch]$Install,
 [switch]$Remove
)
# Controlled opt-in Windows logon task. Default is a DRY RUN.
$ErrorActionPreference='Stop'
$taskName='AirlockGenerator-Telemetry'
$script=Join-Path $PSScriptRoot 'start-telemetry-agent.ps1'
if($Install -and $Remove){throw 'Select Install OR Remove'}
if(-not $Root){$Root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path}
if(-not($Install -or $Remove)){
 Write-Output ('DRY_RUN_ONLY; task='+$taskName)
 Write-Output 'To install after successful physical bench: -Config <local path> -Install'
 Write-Output 'To remove: -Remove'
 exit 0
}
if($Remove){
 Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
 Write-Output ('REMOVED '+$taskName);exit 0
}
if(-not $Config){throw 'Configuration is mandatory for installation'}
$configFile=(Resolve-Path -LiteralPath $Config -ErrorAction Stop).Path
$node=(Get-Command node.exe -ErrorAction Stop).Source
& $node (Join-Path $Root 'gateway\preflight.js') --config $configFile
if($LASTEXITCODE -ne 0){throw 'PRECHECK_FAIL: no task installed'}
$existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($existing){throw 'Task already exists; refusing to overwrite without review'}
$quotedScript='"'+$script+'"'
$quotedConfig='"'+$configFile+'"'
$arguments='-NoProfile -ExecutionPolicy Bypass -File '+$quotedScript+' -Config '+$quotedConfig
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $Root
$trigger=New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Airlock read-only SCADA polling agent; local loopback; requires vetted config' -ErrorAction Stop | Out-Null
Write-Output ('INSTALLED '+$taskName+' (not started)')
