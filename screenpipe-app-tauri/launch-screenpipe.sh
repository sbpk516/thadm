#!/bin/bash
# Launch Thadm - Development.app
# Kills any previous instances before starting

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_BIN="$APP_DIR/src-tauri/target/debug/bundle/macos/Thadm - Development.app/Contents/MacOS/thadm"

# Kill previous instances
pkill -f "thadm" 2>/dev/null
pkill -f "screenpipe --port" 2>/dev/null
sleep 1

# Ensure ports are free
lsof -ti :3030 | xargs kill -9 2>/dev/null
lsof -ti :11435 | xargs kill -9 2>/dev/null
sleep 1

# Launch the app
exec "$APP_BIN"
