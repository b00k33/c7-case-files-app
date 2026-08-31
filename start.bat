@echo off
REM C7 Case Files — double-click launcher (Windows)
cd /d "%~dp0"
echo Starting C7 Case Files on http://localhost:8777 ...
start "" "http://localhost:8777"
python -m http.server 8777 || python3 -m http.server 8777
