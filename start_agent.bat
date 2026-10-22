@echo off
REM ──────────────────────────────────────────────────────────
REM  NetShield-ML — One-Click AGENT Launcher (Computer A)
REM  Starts the agent server + React UI for Computer A.
REM  Double-click this file on Computer A, then open:
REM    http://localhost:5173  (or whatever Vite reports)
REM ──────────────────────────────────────────────────────────

title NetShield Agent Launcher

echo.
echo   ╔══════════════════════════════════════╗
echo   ║   NetShield-ML  — Agent Launcher     ║
echo   ║          Computer A Mode             ║
echo   ╚══════════════════════════════════════╝
echo.

REM Check for venv
IF NOT EXIST "venv\Scripts\python.exe" (
    echo [1/3] Creating Python virtual environment...
    python -m venv venv
    IF ERRORLEVEL 1 (
        echo   ERROR: Failed to create venv. Is Python installed?
        pause
        exit /b 1
    )
    echo   Virtual environment created.
) ELSE (
    echo [1/3] Python virtual environment found.
)

echo [2/3] Installing dependencies...
venv\Scripts\python.exe -m pip install -r requirements.txt --quiet 2>nul
echo   Dependencies ready.

echo [3/3] Starting agent services...
echo.

REM Start the agent API server in a new window
start "NetShield Agent Server :7001" /MIN cmd /k "venv\Scripts\python.exe agent\agent_server.py"

timeout /t 2 /nobreak >nul

REM Start the React UI
start "NetShield Agent UI :5173" cmd /k "npm run dev"

echo.
echo   Agent services launched!
echo.
echo   UI:           http://localhost:5173
echo   Agent API:    http://localhost:7001/api/agent/status
echo.
echo   Open the UI, select Agent role, then enter the
echo   IP address of Computer B (the server).
echo.
pause
