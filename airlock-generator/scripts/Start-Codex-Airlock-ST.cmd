@echo off
setlocal
set "AIRLOCK_ROOT=%~dp0.."
cd /d "%AIRLOCK_ROOT%"
if errorlevel 1 (
  echo ERROR: airlock-generator folder cannot be opened.
  pause
  exit /b 3
)
echo Working directory: %CD%
echo Required branch: codex/airlock-28-st-native-acceptance
echo Safety: NO COM, no PLC download, no Modbus writes, no physical outputs.
echo Read: docs/CODEX-ST-START-HERE-2026-10-20.md
echo.
where codex.cmd >nul 2>&1
if errorlevel 1 (
  echo Codex CLI is not on PATH. Open a new PowerShell or check npm global installation.
  pause
  exit /b 4
)
codex.cmd -C "%CD%" --sandbox workspace-write --ask-for-approval on-request "Read AGENTS.md and docs/CODEX-ST-START-HERE-2026-10-20.md completely. Follow Issue 28 and PR 30, using this isolated branch only. Start Milestone 0: real native Owen Logic ST syntax probe, and proceed to two-door test logic. No serial, no controller or hardware writes. Report evidence and blockers. Do not push, merge, deploy or edit other worktrees."
exit /b %errorlevel%
