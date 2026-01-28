@echo off
title Twisst's Oscilloscope Launcher
echo Starting Twisst's Oscilloscope...
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not installed or not in PATH.
    echo Please install Python from https://www.python.org/
    pause
    exit /b 1
)

:: Start the browser
echo Opening browser...
start "" "http://localhost:8000"

:: Start the server
echo Starting local server on port 8000...
echo Press Ctrl+C to stop the server.
python -m http.server 8000 || (
    echo Failed to start server. Port 8000 might be in use.
    pause
    exit /b 1
)
