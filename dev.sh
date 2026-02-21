#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$YOLO_PID" "$UI_PID" 2>/dev/null
  wait "$YOLO_PID" "$UI_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# ── Python YOLO server ────────────────────────────────────────────────────────
PYTHON_SERVER_DIR="$ROOT/server"
VENV="$PYTHON_SERVER_DIR/venv"

if [ ! -d "$VENV" ]; then
  echo "[YOLO] Creating virtual environment..."
  python3 -m venv "$VENV"
fi

source "$VENV/bin/activate"

echo "[YOLO] Installing Python dependencies..."
pip install -q -r "$PYTHON_SERVER_DIR/requirements.txt"

echo "[YOLO] Starting YOLO detection server on http://127.0.0.1:5001"
uvicorn main:app --host 127.0.0.1 --port 5001 --app-dir "$PYTHON_SERVER_DIR" &
YOLO_PID=$!

deactivate

# ── UI (Plasmo + Convex) ──────────────────────────────────────────────────────
UI_DIR="$ROOT/ui"

if [ ! -d "$UI_DIR/node_modules" ]; then
  echo "[UI] Installing npm dependencies..."
  npm install --prefix "$UI_DIR"
fi

echo "[UI] Starting Plasmo extension + Convex backend..."
npm run dev:all --prefix "$UI_DIR" &
UI_PID=$!

# ── Wait ──────────────────────────────────────────────────────────────────────
echo ""
echo "All services running:"
echo "  YOLO server  → http://127.0.0.1:5001"
echo "  Extension    → ui/build/chrome-mv3-dev  (load unpacked in Chrome)"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

wait
