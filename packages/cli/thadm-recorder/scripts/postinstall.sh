#!/bin/sh
# postinstall script — ensures runtime dependencies are present
# Runs automatically after `npm install thadm-recorder` or `bunx thadm-recorder`

set -e

check_ffmpeg() {
    if command -v ffmpeg >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

install_ffmpeg_macos() {
    arch=$(uname -m)
    if [ "$arch" = "arm64" ]; then
        FFMPEG_URL="https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip"
    else
        FFMPEG_URL="https://ffmpeg.martin-riedl.de/redirect/latest/macos/amd64/release/ffmpeg.zip"
    fi

    echo "thadm: downloading ffmpeg..."
    TMP_DIR=$(mktemp -d)
    if curl -sL "$FFMPEG_URL" -o "$TMP_DIR/ffmpeg.zip"; then
        cd "$TMP_DIR"
        unzip -q ffmpeg.zip
        mkdir -p "$HOME/.local/bin"
        mv ffmpeg "$HOME/.local/bin/"
        chmod +x "$HOME/.local/bin/ffmpeg"
        xattr -d com.apple.quarantine "$HOME/.local/bin/ffmpeg" 2>/dev/null || true
        cd - >/dev/null
        rm -rf "$TMP_DIR"
        echo "thadm: ffmpeg installed to ~/.local/bin/ffmpeg"
    else
        echo "thadm: warning: failed to download ffmpeg"
        echo "thadm: install it manually: brew install ffmpeg"
    fi
}

install_ffmpeg_linux() {
    if command -v apt-get >/dev/null 2>&1; then
        echo "thadm: installing ffmpeg via apt..."
        sudo apt-get install -qq -y ffmpeg 2>/dev/null || echo "thadm: warning: failed to install ffmpeg (try: sudo apt install ffmpeg)"
    elif command -v dnf >/dev/null 2>&1; then
        echo "thadm: installing ffmpeg via dnf..."
        sudo dnf install -q -y ffmpeg 2>/dev/null || echo "thadm: warning: failed to install ffmpeg (try: sudo dnf install ffmpeg)"
    elif command -v pacman >/dev/null 2>&1; then
        echo "thadm: installing ffmpeg via pacman..."
        sudo pacman -S --noconfirm --quiet ffmpeg 2>/dev/null || echo "thadm: warning: failed to install ffmpeg (try: sudo pacman -S ffmpeg)"
    else
        echo "thadm: warning: ffmpeg not found. install it manually."
    fi
}

install_linux_deps() {
    # Check for libasound
    if ! ldconfig -p 2>/dev/null | grep -q "libasound.so.2"; then
        if command -v apt-get >/dev/null 2>&1; then
            echo "thadm: installing libasound2-dev..."
            sudo apt-get install -qq -y libasound2-dev 2>/dev/null || true
        elif command -v dnf >/dev/null 2>&1; then
            sudo dnf install -q -y alsa-lib 2>/dev/null || true
        elif command -v pacman >/dev/null 2>&1; then
            sudo pacman -S --noconfirm --quiet alsa-lib 2>/dev/null || true
        fi
    fi
}

# Remove macOS quarantine from the binary
remove_quarantine() {
    if [ "$(uname)" = "Darwin" ]; then
        SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
        PKG_DIR=$(dirname "$SCRIPT_DIR")
        NODE_MODULES=$(dirname "$PKG_DIR")
        for pkg in "thadm-darwin-arm64" "thadm-darwin-x64"; do
            BIN="$NODE_MODULES/$pkg/bin/thadm-recorder"
            if [ -f "$BIN" ]; then
                xattr -d com.apple.quarantine "$BIN" 2>/dev/null || true
            fi
        done
    fi
}

# Main
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

if ! check_ffmpeg; then
    case "$OS" in
        darwin) install_ffmpeg_macos ;;
        linux) install_ffmpeg_linux ;;
    esac
fi

if [ "$OS" = "linux" ]; then
    install_linux_deps
fi

remove_quarantine

# THADM: telemetry disabled — upstream screenpipe posted a "cli_install_npm"
# event to PostHog here. Removed per the cloud-disabled invariant in CLAUDE.md.

echo "thadm: ready! run: thadm-recorder --help"
