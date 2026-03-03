@echo off
echo.
echo =============================================
echo  PRODUCT COPILOT BRIDGE - STARTING
echo =============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo Node.js found
echo.

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting bridge server...
echo.
echo Leave this window open!
echo Open Figma and run Sidebot plugin
echo.
echo Press Ctrl+C to stop
echo.

node bridge-server.js
pause
