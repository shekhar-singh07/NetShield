# ──────────────────────────────────────────────────────────
#  NetShield-ML — One-Click Launcher (Windows PowerShell)
#  Starts Backend, Frontend, and Agent in separate windows.
#  Usage:  npm start   OR   .\start.ps1
# ──────────────────────────────────────────────────────────

$Root = $PSScriptRoot
if (-not $Root) { $Root = (Get-Location).Path }

$VenvPython = Join-Path $Root "venv\Scripts\python.exe"
$RequirementsFile = Join-Path $Root "requirements.txt"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║       NetShield-ML  Launcher         ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Check / Create Python virtual environment ──
if (-not (Test-Path $VenvPython)) {
    Write-Host "[1/4] Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv (Join-Path $Root "venv")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Failed to create venv. Is Python installed?" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Virtual environment created." -ForegroundColor Green
} else {
    Write-Host "[1/4] Python virtual environment found." -ForegroundColor Green
}

# ── Step 2: Install Python dependencies if needed ──
Write-Host "[2/4] Checking Python dependencies..." -ForegroundColor Yellow
& $VenvPython -m pip install -r $RequirementsFile --quiet 2>$null
Write-Host "  Dependencies ready." -ForegroundColor Green

# ── Step 3: Check Node modules ──
$NodeModules = Join-Path $Root "node_modules"
if (-not (Test-Path $NodeModules)) {
    Write-Host "[3/4] Installing Node dependencies (npm install)..." -ForegroundColor Yellow
    Push-Location $Root
    npm install --silent 2>$null
    Pop-Location
    Write-Host "  Node modules installed." -ForegroundColor Green
} else {
    Write-Host "[3/4] Node modules found." -ForegroundColor Green
}

# ── Step 4: Launch all services ──
Write-Host "[4/4] Starting services..." -ForegroundColor Yellow
Write-Host ""

# Backend (FastAPI + TCP Server)
Write-Host "  Starting Backend (FastAPI :8000 + TCP :5000)..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Root'; & '$VenvPython' -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"
) -WindowStyle Normal

Start-Sleep -Seconds 3

# Frontend (Vite React Dashboard)
Write-Host "  Starting Frontend (React :5173)..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Root'; npm run dev"
) -WindowStyle Normal

Start-Sleep -Seconds 2

# Agent (Traffic Generator)
Write-Host "  Starting Agent (Traffic Generator)..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Root'; & '$VenvPython' agent/traffic_generator.py --server 127.0.0.1 --port 5000"
) -WindowStyle Normal

Write-Host ""
Write-Host "  ✓ All services launched!" -ForegroundColor Green
Write-Host ""
Write-Host "  Dashboard:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "  API:        http://localhost:8000/api/status" -ForegroundColor Cyan
Write-Host "  TCP Server: localhost:5000" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Three new terminal windows have been opened." -ForegroundColor DarkGray
Write-Host "  Close them to stop the services." -ForegroundColor DarkGray
Write-Host ""
