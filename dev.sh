#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
UI_DIR="$ROOT/ui"
BUILD_DIR="$UI_DIR/build/chrome-mv3-dev"

cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$UI_PID" ]     && kill "$UI_PID"     2>/dev/null || true
  [ -n "$ICON_PID" ]   && kill "$ICON_PID"   2>/dev/null || true
  [ -n "$SERVER_PID" ] && wait "$SERVER_PID" 2>/dev/null || true
  [ -n "$UI_PID" ]     && wait "$UI_PID"     2>/dev/null || true
  [ -n "$ICON_PID" ]   && wait "$ICON_PID"   2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# ── Python server ────────────────────────────────────────────────────────────
SERVER_DIR="$ROOT/server"
VENV="$SERVER_DIR/venv"

if [ ! -d "$VENV" ]; then
  echo "[SERVER] Creating virtual environment..."
  python3 -m venv "$VENV"
fi

source "$VENV/bin/activate"

echo "[SERVER] Installing Python dependencies..."
pip install -q -r "$SERVER_DIR/requirements.txt"

existing_pid=$(lsof -ti tcp:5001 2>/dev/null || true)
if [ -n "$existing_pid" ]; then
  echo "[SERVER] Killing existing process on port 5001 (PID $existing_pid)..."
  kill "$existing_pid" 2>/dev/null || true
  sleep 1
fi

echo "[SERVER] Starting RT-DETR detection server on http://127.0.0.1:5001"
# --workers >1 spawns separate processes; MPS cannot be shared across processes so force CPU for multi-worker mode
PANORA_DISABLE_MPS=1 uvicorn main:app --host 127.0.0.1 --port 5001 --workers 2 --app-dir "$SERVER_DIR" &
SERVER_PID=$!

deactivate

# ── UI (Plasmo + Convex) ──────────────────────────────────────────────────────
if [ ! -d "$UI_DIR/node_modules" ]; then
  echo "[UI] Installing npm dependencies..."
  npm install --prefix "$UI_DIR"
fi

if [ ! -f "$UI_DIR/.env.local" ]; then
  echo "[UI] Creating .env.local from example..."
  cp "$UI_DIR/.env.example" "$UI_DIR/.env.local"
fi

echo "[UI] Starting Plasmo extension..."
npm run dev --prefix "$UI_DIR" &
UI_PID=$!

# ── Icon fixer (re-applies orange icons after each Plasmo rebuild) ────────────
icon_fix_loop() {
  while true; do
    if [ -d "$BUILD_DIR" ]; then
      if [ ! -f "$BUILD_DIR/.icon_stamp" ] || \
         [ -n "$(find "$BUILD_DIR" -name "icon*.png" -newer "$BUILD_DIR/.icon_stamp" 2>/dev/null | head -1)" ]; then
        node "$UI_DIR/scripts/fix-icons.js" 2>/dev/null && touch "$BUILD_DIR/.icon_stamp"
      fi
    fi
    sleep 3
  done
}

icon_fix_loop &
ICON_PID=$!

# ── Wait ──────────────────────────────────────────────────────────────────────
echo ""
echo "All services running:"
echo "  RT-DETR server → http://127.0.0.1:5001 (2 workers, CPU)"
echo "  Extension    → ui/build/chrome-mv3-dev  (load unpacked in Chrome)"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

wait
