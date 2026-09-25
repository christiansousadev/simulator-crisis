# launches the backend and frontend dev servers concurrently for local development
param(
    [int]$Port = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# detect if designated port is currently occupied
$isOccupied = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($isOccupied) {
    Write-Warning "Port $Port is already in use. Switching simulation backend to port 8010..."
    $Port = 8010
}

Write-Host "==> Preparing backend (FastAPI on :$Port)"
Set-Location "$RootDir\backend"
if (-not (Test-Path ".venv")) {
    python -m venv .venv
}
& ".\.venv\Scripts\pip.exe" install -q -r requirements.txt

$backendProcess = Start-Process -FilePath ".\.venv\Scripts\python.exe" `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$Port", "--reload" `
    -PassThru -NoNewWindow

try {
    Write-Host "==> Preparing frontend (Vite on :$FrontendPort)"
    Set-Location "$RootDir\frontend"
    npm install

    $env:VITE_API_URL = "http://localhost:$Port"
    $env:VITE_WS_URL = "ws://localhost:$Port/ws/telemetry"

    Write-Host "==> Starting Vite dev server on :$FrontendPort connecting to backend on :$Port"
    npm run dev -- --port $FrontendPort
}
finally {
    Write-Host "==> Shutting down backend (pid $($backendProcess.Id))"
    Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
}
