@echo off
rem DON'T BURN YOUR FEET — double-click to play.
rem Starts the dev server (if not already running) and opens the game.
cd /d "%~dp0"
netstat -an | findstr /c":8123 " | findstr /c"LISTENING" >nul
if errorlevel 1 (
  echo Starting server on http://localhost:8123 ...
  start "DBYF server" /min python serve.py
  timeout /t 2 /nobreak >nul
)
start http://localhost:8123
