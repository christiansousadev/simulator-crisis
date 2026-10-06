# launches the backend and frontend dev servers concurrently for local development
# usage: .\start.ps1 [-Port 8000] [-FrontendPort 5173]   (Windows PowerShell 5.1 or PowerShell 7)
param(
    [int]$Port = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-PortInUse([int]$P) {
    return [bool](Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction SilentlyContinue)
}

# detect if designated port is currently occupied
if (Test-PortInUse $Port) {
    Write-Warning "Port $Port is already in use. Switching simulation backend to port 8010..."
    $Port = 8010
    if (Test-PortInUse $Port) {
        throw "Port 8010 is in use too. Free a port or pass one explicitly: .\start.ps1 -Port <backend> -FrontendPort <frontend>"
    }
}

Write-Host "==> Preparing backend (FastAPI on :$Port)"
Set-Location "$RootDir\backend"
if (-not (Test-Path ".venv")) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw "Could not create the virtualenv (is Python 3.12+ on PATH?)" }
}
& ".\.venv\Scripts\python.exe" -m pip install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

$backendProcess = Start-Process -FilePath ".\.venv\Scripts\python.exe" `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$Port", "--reload" `
    -PassThru -NoNewWindow

try {
    Write-Host "==> Preparing frontend (Vite on :$FrontendPort)"
    Set-Location "$RootDir\frontend"
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    # the frontend is pointed at whichever backend port was actually chosen above
    $env:VITE_API_URL = "http://localhost:$Port"
    $env:VITE_WS_URL = "ws://localhost:$Port/ws/telemetry"

    Write-Host "==> Backend API:  http://localhost:$Port  (health: http://localhost:$Port/api/health)"
    Write-Host "==> Game UI:      http://localhost:$FrontendPort"
    npm run dev -- --port $FrontendPort --strictPort
}
finally {
    Write-Host "==> Shutting down backend (pid $($backendProcess.Id))"
    # /T also ends uvicorn's --reload child process, otherwise it would keep holding the port
    taskkill /PID $backendProcess.Id /T /F | Out-Null
}
