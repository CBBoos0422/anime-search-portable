@echo off
cd /d "%~dp0"

if not exist "vendor\node\node.exe" (
  echo The portable package is incomplete: bundled Node.js is missing.
  pause
  exit /b 1
)

if not exist "vendor\qbittorrent\qbittorrent.exe" (
  echo The portable package is incomplete: bundled qBittorrent is missing.
  pause
  exit /b 1
)

"vendor\node\node.exe" "app\server.js"
if errorlevel 1 pause
