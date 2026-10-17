@echo off
:: ════════════════════════════════════════════════
::  NetShield-ML — One-Click Launcher (Windows)
::  Starts Backend, Frontend, and Agent in
::  separate windows.
::  Usage:  npm start   OR   start.bat
:: ════════════════════════════════════════════════

set "ROOT=%~dp0"
set "VENV_PY=%ROOT%venv\Scripts\python.exe"

echo.
echo   ======================================
echo     NetShield-ML  Launcher
echo   ======================================
echo.

:: ── Step 1: Check Python venv ──
if not exist "%VENV_PY%" (
    echo [1/4] Creating Python virtual environment...
    python -m venv "%ROOT%venv"
    if errorlevel 1 (
        echo   ERROR: Failed to create venv. Is Python installed?
        pause
        exit /b 1
    )
    echo   Virtual environment created.
) else (
    echo [1/4] Python virtual environment found.
)

:: ── Step 2: Install Python dependencies ──
echo [2/4] Installing Python dependencies...
"%VENV_PY%" -m pip install -r "%ROOT%requirements.txt" --quiet 2>nul
echo   Dependencies ready.

:: ── Step 3: Check Node modules ──
if not exist "%ROOT%node_modules" (
    echo [3/4] Installing Node dependencies...
    cd /d "%ROOT%"
    npm install --silent 2>nul
    echo   Node modules installed.
) else (
    echo [3/4] Node modules found.
)

:: ── Step 4: Launch all services ──
echo [4/4] Starting services...
echo.

echo   Starting Backend (FastAPI :8000 + TCP :5000)...
start "NetShield Backend" cmd /k "cd /d "%ROOT%" && "%VENV_PY%" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 /nobreak >nul

echo   Starting Frontend (React :5173)...
start "NetShield Frontend" cmd /k "cd /d "%ROOT%" && npm run dev"

timeout /t 2 /nobreak >nul

echo   Starting Agent (Traffic Generator)...
start "NetShield Agent" cmd /k "cd /d "%ROOT%" && "%VENV_PY%" agent/traffic_generator.py --server 127.0.0.1 --port 5000"

echo.
echo   All services launched!
echo.
echo   Dashboard:  http://localhost:5173
echo   API:        http://localhost:8000/api/status
echo   TCP Server: localhost:5000
echo.
echo   Three new terminal windows have been opened.
echo   Close them to stop the services.
echo.
