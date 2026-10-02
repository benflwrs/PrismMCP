@echo off
rem Double-click to install/update PrismMCP. Runs install-windows.ps1 with a one-off
rem ExecutionPolicy bypass (doesn't change your system policy).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" %*
echo.
pause
