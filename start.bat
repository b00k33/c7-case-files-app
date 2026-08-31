@echo off
REM C7 Case Files — double-click launcher (Windows). No installs required —
REM this uses PowerShell, which ships with Windows, to serve the folder.
cd /d "%~dp0"
echo Starting C7 Case Files...
start "" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8777"
