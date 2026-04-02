#!/bin/bash
# dev.sh — Run thadm in development mode

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/apps/screenpipe-app-tauri"
LOG_FILE="$SCRIPT_DIR/.thadm-dev-build.log"
TIMEOUT=600  # 10 minutes max wait for backend

phase() { echo ""; echo "=== [$1/5] $2 ==="; echo ""; }

cleanup() {
  echo ""
  echo "shutting down..."
  kill $DEV_PID 2>/dev/null || true
  pkill -P $DEV_PID 2>/dev/null || true
  lsof -ti:1420 | xargs kill 2>/dev/null || true
  lsof -ti:3030 | xargs kill 2>/dev/null || true
}
trap cleanup EXIT

# -------------------------------------------------------
phase 1 "Verifying project structure"
# -------------------------------------------------------
if [ ! -f "$APP_DIR/src-tauri/Cargo.toml" ]; then
  echo "FAIL: cannot find $APP_DIR/src-tauri/Cargo.toml"
  echo "run this script from the thadm repo root"
  exit 1
fi
echo "OK: project found at $APP_DIR"

# -------------------------------------------------------
phase 2 "Checking prerequisites"
# -------------------------------------------------------
MISSING=0
command -v bun >/dev/null 2>&1 && echo "OK: bun $(bun --version)" || { echo "MISSING: bun"; MISSING=1; }
command -v cargo >/dev/null 2>&1 && echo "OK: cargo $(cargo --version | cut -d' ' -f2)" || { echo "MISSING: cargo"; MISSING=1; }
xcode-select -p >/dev/null 2>&1 && echo "OK: xcode CLI tools" || { echo "MISSING: xcode CLI tools (run: xcode-select --install)"; MISSING=1; }
if [ $MISSING -eq 1 ]; then
  echo ""
  echo "install missing tools and try again"
  exit 1
fi

# -------------------------------------------------------
phase 3 "Killing stale processes on ports 1420 and 3030"
# -------------------------------------------------------
lsof -ti:1420 | xargs kill 2>/dev/null && echo "killed: process on port 1420" || echo "port 1420: free"
lsof -ti:3030 | xargs kill 2>/dev/null && echo "killed: process on port 3030" || echo "port 3030: free"
sleep 1

# -------------------------------------------------------
phase 4 "Installing JS dependencies"
# -------------------------------------------------------
cd "$APP_DIR"
if [ ! -d "node_modules" ] || [ "bun.lock" -nt "node_modules/.package-lock.json" ] 2>/dev/null; then
  bun install || { echo "FAIL: bun install failed"; exit 1; }
else
  echo "SKIP: node_modules up to date"
fi

# -------------------------------------------------------
phase 5 "Building and running thadm"
# -------------------------------------------------------
echo "this will:"
echo "  - start Next.js on http://localhost:1420"
echo "  - compile Rust backend (first build takes ~10-15 min)"
echo "  - open the thadm app window when ready"
echo ""
echo "build log: $LOG_FILE"
echo "--------------------------------------------"

# Clear old log
> "$LOG_FILE"

# Run build in background, capture all output to log
bun run tauri dev > "$LOG_FILE" 2>&1 &
DEV_PID=$!

# Monitor loop — check log for failure or success every second
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do

  # 1. Cargo compile failed
  if grep -q "could not compile" "$LOG_FILE" 2>/dev/null; then
    sleep 1
    echo ""
    echo "============================================"
    echo "RUST BUILD FAILED"
    echo "============================================"
    echo ""
    echo "errors:"
    grep -E "^error" "$LOG_FILE" 2>/dev/null | tail -10
    echo ""
    echo "full log: $LOG_FILE"
    exit 1
  fi

  # 2. Build script / pre_build failed
  if grep -q "error: script.*exited with code" "$LOG_FILE" 2>/dev/null; then
    echo ""
    echo "============================================"
    echo "BUILD SCRIPT FAILED"
    echo "============================================"
    echo ""
    tail -20 "$LOG_FILE" 2>/dev/null
    echo ""
    echo "full log: $LOG_FILE"
    exit 1
  fi

  # 3. Backend is up — build succeeded and app is running
  if curl -s http://localhost:3030/health >/dev/null 2>&1; then
    echo ""
    echo "============================================"
    echo "thadm is running!"
    echo "============================================"
    echo ""
    echo "frontend: http://localhost:1420"
    echo "backend:  http://localhost:3030"
    echo "health:   http://localhost:3030/health"
    echo "log:      $LOG_FILE"
    echo ""
    echo "press Ctrl+C to stop"
    wait $DEV_PID
    exit 0
  fi

  # Show progress: print last Compiling/Building line every 10 seconds
  if [ $((ELAPSED % 10)) -eq 0 ] && [ $ELAPSED -gt 0 ]; then
    PROGRESS=$(grep -E "Compiling|Building|Finished|Running|Ready" "$LOG_FILE" 2>/dev/null | tail -1 | sed 's/\x1b\[[0-9;]*m//g')
    if [ -n "$PROGRESS" ]; then
      echo "  [$ELAPSED s] $PROGRESS"
    fi
  fi

  sleep 1
  ELAPSED=$((ELAPSED + 1))
done

# Timeout
echo ""
echo "============================================"
echo "TIMEOUT — backend did not start within $((TIMEOUT / 60)) minutes"
echo "============================================"
echo ""
echo "last 10 lines of log:"
tail -10 "$LOG_FILE" 2>/dev/null
echo ""
echo "full log: $LOG_FILE"
exit 1
