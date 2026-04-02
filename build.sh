#!/bin/bash
# build.sh — Build thadm for production distribution
set -e

cd "$(dirname "$0")/apps/screenpipe-app-tauri"
bun install
bun run tauri build
