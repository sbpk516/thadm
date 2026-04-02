#!/bin/bash
# build.sh — Build thadm for production distribution (signed + notarized)
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/apps/screenpipe-app-tauri"
LOG_FILE="$SCRIPT_DIR/.thadm-build.log"

phase() { echo ""; echo "=== [$1/6] $2 ==="; echo ""; }

# -------------------------------------------------------
phase 1 "Verifying project structure"
# -------------------------------------------------------
if [ ! -f "$APP_DIR/src-tauri/Cargo.toml" ]; then
  echo "FAIL: cannot find $APP_DIR/src-tauri/Cargo.toml"
  exit 1
fi
if [ ! -f "$APP_DIR/src-tauri/tauri.prod.conf.json" ]; then
  echo "FAIL: cannot find tauri.prod.conf.json"
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
command -v xcrun >/dev/null 2>&1 && echo "OK: xcrun" || { echo "MISSING: xcrun"; MISSING=1; }

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
CREDS_FILE="$HOME/Documents/ai_ground/apple_and_aws/thadm/credentials.md"

export APPLE_ID="${APPLE_ID:-}"
export APPLE_PASSWORD="${APPLE_PASSWORD:-}"
export APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-}"

# Read from credentials file if env vars not set
if [ -f "$CREDS_FILE" ]; then
  [ -z "$APPLE_ID" ] && APPLE_ID=$(grep "APPLE_ID:" "$CREDS_FILE" | head -1 | sed 's/.*: *//' | tr -d '[:space:]') && export APPLE_ID
  [ -z "$APPLE_PASSWORD" ] && APPLE_PASSWORD=$(grep "APPLE_PASSWORD:" "$CREDS_FILE" | head -1 | sed 's/.*: *//' | tr -d '[:space:]') && export APPLE_PASSWORD
  [ -z "$APPLE_TEAM_ID" ] && APPLE_TEAM_ID=$(grep "APPLE_TEAM_ID:" "$CREDS_FILE" | head -1 | sed 's/.*: *//' | tr -d '[:space:]') && export APPLE_TEAM_ID
  [ -z "$APPLE_SIGNING_IDENTITY" ] && APPLE_SIGNING_IDENTITY=$(grep "APPLE_SIGNING_IDENTITY:" "$CREDS_FILE" | head -1 | sed 's/.*: *//' | tr -d '\r\n') && export APPLE_SIGNING_IDENTITY
fi

# Validate all required vars
CREDS_MISSING=0
[ -z "$APPLE_ID" ] && { echo "MISSING: APPLE_ID"; CREDS_MISSING=1; }
[ -z "$APPLE_PASSWORD" ] && { echo "MISSING: APPLE_PASSWORD"; CREDS_MISSING=1; }
[ -z "$APPLE_TEAM_ID" ] && { echo "MISSING: APPLE_TEAM_ID"; CREDS_MISSING=1; }
[ -z "$APPLE_SIGNING_IDENTITY" ] && { echo "MISSING: APPLE_SIGNING_IDENTITY"; CREDS_MISSING=1; }

if [ $CREDS_MISSING -eq 1 ]; then
  echo ""
  echo "set env vars or ensure $CREDS_FILE exists"
  exit 1
fi

echo "APPLE_ID: $APPLE_ID"
echo "APPLE_TEAM_ID: $APPLE_TEAM_ID"
echo "APPLE_SIGNING_IDENTITY: $APPLE_SIGNING_IDENTITY"
echo "APPLE_PASSWORD: (set)"

# -------------------------------------------------------
phase 4 "Cleaning stale artifacts and installing dependencies"
# -------------------------------------------------------
cd "$APP_DIR"

# Remove old build output so we don't accidentally ship stale .dmg
rm -rf src-tauri/target/release/bundle/dmg 2>/dev/null && echo "cleaned: old dmg"
rm -rf src-tauri/target/release/bundle/macos 2>/dev/null && echo "cleaned: old app"

bun install || { echo "FAIL: bun install failed"; exit 1; }

# -------------------------------------------------------
phase 5 "Building production app (this takes 10-20 min)"
# -------------------------------------------------------
echo "building with:"
echo "  - config: tauri.prod.conf.json (productName: thadm)"
echo "  - release optimizations (LTO)"
echo "  - Apple code signing"
echo "  - notarization (requires internet)"
echo ""
echo "build log: $LOG_FILE"
echo "--------------------------------------------"

# Clear old log
> "$LOG_FILE"

# Build with PROD config, redact password from log
bun run tauri build --config src-tauri/tauri.prod.conf.json 2>&1 \
  | sed "s/$APPLE_PASSWORD/***REDACTED***/g" \
  | tee "$LOG_FILE"

BUILD_EXIT=${PIPESTATUS[0]}

if [ $BUILD_EXIT -ne 0 ]; then
  echo ""
  echo "============================================"
  echo "BUILD FAILED (exit code: $BUILD_EXIT)"
  echo "============================================"
  echo ""
  echo "errors:"
  grep -iE "^error" "$LOG_FILE" | tail -10
  echo ""
  echo "full log: $LOG_FILE"
  exit $BUILD_EXIT
fi

# -------------------------------------------------------
phase 6 "Verifying signature and notarization"
# -------------------------------------------------------
APP=$(find src-tauri/target/release/bundle/macos -name "*.app" 2>/dev/null | head -1)
DMG=$(find src-tauri/target/release/bundle/dmg -name "*.dmg" 2>/dev/null | head -1)

if [ -z "$APP" ]; then
  echo "FAIL: no .app found in build output"
  exit 1
fi

echo "verifying: $APP"

# Check code signature
if codesign --verify --deep --strict "$APP" 2>&1; then
  echo "OK: code signature valid"
else
  echo "FAIL: code signature INVALID"
  echo "the .app is not properly signed — do not distribute"
  exit 1
fi

# Check Gatekeeper assessment
if spctl --assess --type exec "$APP" 2>&1; then
  echo "OK: Gatekeeper assessment passed"
else
  echo "WARN: Gatekeeper assessment failed — notarization may be missing"
  echo "  customers may see 'app is damaged' on first launch"
fi

# Check notarization stapling
if xcrun stapler validate "$APP" 2>&1; then
  echo "OK: notarization ticket stapled"
else
  echo "WARN: notarization ticket not stapled"
  echo "  try: xcrun stapler staple \"$APP\""
fi

echo ""
echo "============================================"
echo "BUILD SUCCESS"
echo "============================================"
echo ""
if [ -n "$DMG" ]; then
  echo "DMG: $DMG"
  echo "size: $(du -h "$DMG" | cut -f1)"
fi
echo "APP: $APP"
echo ""
echo "build log: $LOG_FILE"
