#!/bin/bash
# build.sh — Build thadm for production distribution (signed + notarized)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/apps/screenpipe-app-tauri"

phase() { echo ""; echo "=== [$1/5] $2 ==="; echo ""; }

# -------------------------------------------------------
phase 1 "Verifying project structure"
# -------------------------------------------------------
if [ ! -f "$APP_DIR/src-tauri/Cargo.toml" ]; then
  echo "FAIL: cannot find $APP_DIR/src-tauri/Cargo.toml"
  exit 1
fi
echo "OK: project found at $APP_DIR"

# -------------------------------------------------------
phase 2 "Checking prerequisites"
# -------------------------------------------------------
MISSING=0
command -v bun >/dev/null 2>&1 && echo "OK: bun $(bun --version)" || { echo "MISSING: bun"; MISSING=1; }
command -v cargo >/dev/null 2>&1 && echo "OK: cargo $(cargo --version | cut -d' ' -f2)" || { echo "MISSING: cargo"; MISSING=1; }
xcode-select -p >/dev/null 2>&1 && echo "OK: xcode CLI tools" || { echo "MISSING: xcode CLI tools"; MISSING=1; }

# Check signing certificate
if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application: Balaji Sachidanandam"; then
  echo "OK: signing certificate found"
else
  echo "MISSING: Apple signing certificate"
  echo "  import Certificates.p12 into Keychain Access"
  MISSING=1
fi

if [ $MISSING -eq 1 ]; then
  echo ""
  echo "install missing tools and try again"
  exit 1
fi

# -------------------------------------------------------
phase 3 "Setting notarization environment"
# -------------------------------------------------------
# Load from credentials file if env vars not already set
CREDS_FILE="$HOME/Documents/ai_ground/apple_and_aws/thadm/credentials.md"

export APPLE_ID="${APPLE_ID:-sbpk516@gmail.com}"
export APPLE_PASSWORD="${APPLE_PASSWORD:-}"
export APPLE_TEAM_ID="${APPLE_TEAM_ID:-KVLNE2Y696}"
export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: Balaji Sachidanandam (KVLNE2Y696)}"

# Read password from credentials file if not in env
if [ -z "$APPLE_PASSWORD" ] && [ -f "$CREDS_FILE" ]; then
  APPLE_PASSWORD=$(grep "APPLE_PASSWORD:" "$CREDS_FILE" | head -1 | sed 's/.*: //')
  export APPLE_PASSWORD
fi

if [ -z "$APPLE_PASSWORD" ]; then
  echo "FAIL: APPLE_PASSWORD not set. Either:"
  echo "  export APPLE_PASSWORD=your-app-specific-password"
  echo "  or ensure $CREDS_FILE exists"
  exit 1
fi

echo "APPLE_ID: $APPLE_ID"
echo "APPLE_TEAM_ID: $APPLE_TEAM_ID"
echo "APPLE_SIGNING_IDENTITY: $APPLE_SIGNING_IDENTITY"
echo "APPLE_PASSWORD: ****$(echo $APPLE_PASSWORD | tail -c 5)"

# -------------------------------------------------------
phase 4 "Installing dependencies"
# -------------------------------------------------------
cd "$APP_DIR"
bun install || { echo "FAIL: bun install failed"; exit 1; }

# -------------------------------------------------------
phase 5 "Building production app (this takes 10-20 min)"
# -------------------------------------------------------
echo "building with:"
echo "  - release optimizations (LTO)"
echo "  - Apple code signing"
echo "  - notarization (requires internet)"
echo ""

bun run tauri build 2>&1 | tee "$SCRIPT_DIR/.thadm-build.log"

EXIT_CODE=${PIPESTATUS[0]}

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "============================================"
  echo "BUILD FAILED (exit code: $EXIT_CODE)"
  echo "============================================"
  echo ""
  echo "errors:"
  grep -iE "^error" "$SCRIPT_DIR/.thadm-build.log" | tail -10
  echo ""
  echo "full log: $SCRIPT_DIR/.thadm-build.log"
  exit $EXIT_CODE
fi

echo ""
echo "============================================"
echo "BUILD SUCCESS"
echo "============================================"
echo ""

# Find the output
DMG=$(find "$APP_DIR/src-tauri/target/release/bundle/dmg" -name "*.dmg" 2>/dev/null | head -1)
APP=$(find "$APP_DIR/src-tauri/target/release/bundle/macos" -name "*.app" 2>/dev/null | head -1)

if [ -n "$DMG" ]; then
  echo "DMG: $DMG"
  echo "size: $(du -h "$DMG" | cut -f1)"
fi
if [ -n "$APP" ]; then
  echo "APP: $APP"
fi
echo ""
echo "build log: $SCRIPT_DIR/.thadm-build.log"
