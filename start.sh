#!/usr/bin/env bash
# launches the backend and frontend dev servers concurrently for local development
# usage: ./start.sh [backend_port=8000] [frontend_port=5173]
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8000}"
FRONTEND_PORT="${2:-5173}"

port_in_use() {
  lsof -Pi :"$1" -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -ano 2>/dev/null | grep -Eq "[:.]$1[[:space:]].*LISTENING"
}

# detect if designated port is currently occupied
if port_in_use "$PORT"; then
  echo "==> Port $PORT in use. Switching simulation backend to port 8010..."
  PORT=8010
  if port_in_use "$PORT"; then
    echo "!! Port 8010 is in use too. Free a port or pass one explicitly: ./start.sh <backend_port> <frontend_port>"
    exit 1
  fi
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
  # --reload runs the server in a child of the reloader process: stop the children first
  pkill -P "$BACKEND_PID" 2>/dev/null || true
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Preparing frontend"
cd "$ROOT_DIR/frontend"
npm install

# the frontend is built against whichever backend port was actually chosen above
export VITE_API_URL="http://localhost:$PORT"
export VITE_WS_URL="ws://localhost:$PORT/ws/telemetry"

echo "==> Backend API:  http://localhost:$PORT  (health: http://localhost:$PORT/api/health)"
echo "==> Game UI:      http://localhost:$FRONTEND_PORT"
npm run dev -- --port "$FRONTEND_PORT" --strictPort
