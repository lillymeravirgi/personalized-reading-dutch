#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend/leeswijs"

BACKEND_PID=""
FRONTEND_PID=""

stop_servers() {
  if [ -n "$FRONTEND_PID" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap stop_servers EXIT INT TERM

echo "Starting LeesWijs locally..."

cd "$BACKEND_DIR"

if [ -x ".venv313/bin/python" ]; then
  PYTHON_BIN=".venv313/bin/python"
  PIP_BIN=".venv313/bin/pip"
elif [ -x ".venv/bin/python" ]; then
  PYTHON_BIN=".venv/bin/python"
  PIP_BIN=".venv/bin/pip"
else
  python3 -m venv .venv
  PYTHON_BIN=".venv/bin/python"
  PIP_BIN=".venv/bin/pip"
fi

"$PIP_BIN" install -r requirements.txt

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created backend/.env. Add GOOGLE_API_KEY there before generating readings."
fi

"$PYTHON_BIN" seed.py
"$PYTHON_BIN" seed_local_test_accounts.py
"$PYTHON_BIN" -m uvicorn main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
  npm install
fi

if [ ! -f ".env.local" ]; then
  cp .env.example .env.local
fi

npm run dev -- --host 127.0.0.1 --port 5173 &
FRONTEND_PID=$!

echo ""
echo "Frontend: http://127.0.0.1:5173"
echo "Backend:  http://127.0.0.1:8000"
echo ""
echo "Local test accounts:"
echo "  TST-01 / test1234"
echo "  TST-02 / test1234"
echo ""
echo "Press Ctrl+C to stop both servers."

wait
