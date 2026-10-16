@echo off
chcp 65001 >nul
title Owen Logic Bridge - Simulation Status
echo Owen Logic: reading ST simulator in TEST project...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0owen-bridge.ps1" -Action status -ExpectedBlock FB_Room_N1
echo.
echo Window stays open. Press any key to close.
pause >nul
