#!/usr/bin/env bash
# launches the backend and frontend dev servers concurrently for local development
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8000}"
FRONTEND_PORT="${2:-5173}"

# detect if designated port is currently occupied
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -ano 2>/dev/null | grep -q ":$PORT.*LISTENING"; then
  echo "==> Port $PORT in use. Switching simulation backend to port 8010..."
  PORT=8010
fi

echo "==> Preparing backend"
cd "$ROOT_DIR/backend"
if [ ! -d ".venv" ]; then
  python -m venv .venv
fi
if [ -f ".venv/Scripts/activate" ]; then
  source .venv/Scripts/activate
else
  source .venv/bin/activate
fi
pip install -q -r requirements.txt

echo "==> Starting FastAPI on :$PORT"
uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --reload &
BACKEND_PID=$!

cleanup() {
  echo "==> Shutting down backend (pid $BACKEND_PID)"
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Preparing frontend"
cd "$ROOT_DIR/frontend"
npm install

export VITE_API_URL="http://localhost:$PORT"
export VITE_WS_URL="ws://localhost:$PORT/ws/telemetry"

echo "==> Starting Vite dev server on :$FRONTEND_PORT connecting to backend on :$PORT"
npm run dev -- --port "$FRONTEND_PORT"
