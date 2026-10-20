@echo off
title Job Pilot setup
rem Double-click to install Job Pilot. Runs install.ps1 for this window only (no system setting is changed).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo Setup did not finish. See the messages above, or data\install.log.
  pause
)
