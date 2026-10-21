@echo off
setlocal
set "AIRLOCK_ROOT=%~dp0.."
set "CODEX_CMD=%APPDATA%\npm\codex.cmd"
if not exist "%CODEX_CMD%" (
  echo ERROR: Codex CLI not installed for current user.
  pause
  exit /b 4
)
cd /d "%AIRLOCK_ROOT%"
if errorlevel 1 (
  echo ERROR: Cannot enter Airlock working directory.
  pause
  exit /b 3
)
set "NODE_USE_SYSTEM_CA=1"
echo Airlock ST acceptance - continue from existing checkpoint.
echo Git branch: codex/airlock-28-st-native-acceptance
echo LIVE HARDWARE: do not access COM, PR, Modbus or S2000-2.
"%CODEX_CMD%" -C "%CD%" --sandbox workspace-write --ask-for-approval on-request "Continue Issue #28 Airlock ST implementation in the existing worktree. Do not discard changes or restart from scratch. Read AGENTS.md, docs/ISSUE28-ST-STATUS-2026-10-21.md and docs/ISSUE28-ST-NATIVE-ACCEPTANCE.md first. Check git status and recent commits. FB_Airlock2.st and ST00 native vendor samples exist; 27 offline tests passed, but two-door native compile and full simulator acceptance remain unfinished. Continue ST00 vendor acceptance then finish the two-door Owen Logic Save As/Compile/Simulator matrix before seven-door work. No COM ports, Modbus, PLC downloads, hardware writes, auto push or merge. Report precise evidence and blockers."
exit /b %errorlevel%
