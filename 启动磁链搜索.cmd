@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "vendor\node\node.exe" (
  echo 便携包不完整：缺少内置 Node.js。
  pause
  exit /b 1
)

if not exist "vendor\qbittorrent\qbittorrent.exe" (
  echo 便携包不完整：缺少内置 qBittorrent。
  pause
  exit /b 1
)

"vendor\node\node.exe" "app\server.js"
if errorlevel 1 pause
