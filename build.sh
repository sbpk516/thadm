#!/bin/bash
set -e

# Thadm Build Script
# Usage: ./build.sh [command]
#
# Commands:
#   sidecar   - Build the recorder sidecar only (fastest, for testing recorder changes)
#   dev       - Build sidecar + launch full app in dev mode (hot reload for frontend)
#   release   - Build sidecar + production .app bundle (signed, installable)
#   clean     - Remove all build artifacts, then do a full release build
#   help      - Show this help message

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
SIDECAR_BIN="thadm-recorder"
TAURI_DIR="$PROJECT_ROOT/screenpipe-app-tauri"
SIDECAR_DEST="$TAURI_DIR/src-tauri/${SIDECAR_BIN}-aarch64-apple-darwin"

show_help() {
    echo ""
    echo "Thadm Build Script"
    echo "==================="
    echo ""
    echo "Usage: ./build.sh [command]"
    echo ""
    echo "Commands:"
    echo "  sidecar   Build the recorder sidecar only (fastest)"
    echo "            Compiles Rust code and runs the recorder directly."
    echo "            Use this to quickly test changes to: screenpipe-server,"
    echo "            screenpipe-audio, screenpipe-vision"
    echo ""
    echo "  dev       Build sidecar + launch full app in dev mode"
    echo "            Compiles sidecar, copies it into Tauri, then runs"
    echo "            'bun tauri dev' with hot reload for frontend changes."
    echo ""
    echo "  release   Build sidecar + production .app bundle"
    echo "            Compiles sidecar in release mode, copies it, then"
    echo "            runs 'bun tauri build' to produce a signed .app and .dmg"
    echo ""
    echo "  clean     Full clean rebuild"
    echo "            Removes all build artifacts (cargo clean + old binaries)"
    echo "            then does a full release build from scratch."
    echo ""
    echo "  help      Show this help message"
    echo ""
}

build_sidecar_debug() {
    echo "==> Building sidecar (debug)..."
    cargo build --bin "$SIDECAR_BIN"
    echo "==> Sidecar built: target/debug/$SIDECAR_BIN"
}

build_sidecar_release() {
    echo "==> Building sidecar (release)..."
    cargo build --release --bin "$SIDECAR_BIN"
    echo "==> Sidecar built: target/release/$SIDECAR_BIN"
}

copy_sidecar_debug() {
    echo "==> Copying debug sidecar to Tauri..."
    cp "$PROJECT_ROOT/target/debug/$SIDECAR_BIN" "$SIDECAR_DEST"
    echo "==> Copied to: $SIDECAR_DEST"
}

copy_sidecar_release() {
    echo "==> Copying release sidecar to Tauri..."
    cp "$PROJECT_ROOT/target/release/$SIDECAR_BIN" "$SIDECAR_DEST"
    echo "==> Copied to: $SIDECAR_DEST"
}

cmd_sidecar() {
    echo ""
    echo "=== SIDECAR BUILD ==="
    build_sidecar_release
    echo ""
    echo "Done. To run the sidecar directly:"
    echo "  ./target/release/$SIDECAR_BIN"
    echo ""
}

cmd_dev() {
    echo ""
    echo "=== DEV BUILD ==="
    build_sidecar_debug
    copy_sidecar_debug
    echo "==> Launching Tauri dev mode..."
    cd "$TAURI_DIR"
    SKIP_SCREENPIPE_SETUP=1 bun tauri dev
}

cmd_release() {
    echo ""
    echo "=== RELEASE BUILD ==="
    build_sidecar_release
    copy_sidecar_release
    echo "==> Building Tauri app (this will take a few minutes)..."
    cd "$TAURI_DIR"
    SKIP_SCREENPIPE_SETUP=1 bun tauri build
    echo ""
    echo "Done. Outputs:"
    echo "  App: src-tauri/target/release/bundle/macos/Thadm.app"
    echo "  DMG: src-tauri/target/release/bundle/dmg/"
    echo ""
}

cmd_clean() {
    echo ""
    echo "=== CLEAN BUILD ==="
    echo "==> Removing cargo build artifacts..."
    cargo clean
    echo "==> Removing old sidecar binaries..."
    rm -f "$TAURI_DIR/src-tauri/${SIDECAR_BIN}-"*
    echo "==> Clean complete. Starting full release build..."
    echo ""
    cmd_release
}

case "${1:-help}" in
    sidecar)  cmd_sidecar ;;
    dev)      cmd_dev ;;
    release)  cmd_release ;;
    clean)    cmd_clean ;;
    help)     show_help ;;
    *)
        echo "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
