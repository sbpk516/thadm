#!/bin/bash
set -e

# Thadm Build Script
# Usage: ./build.sh [command] [--target TARGET]
#
# Commands:
#   sidecar        - Build the recorder sidecar only (fastest, for testing recorder changes)
#   dev            - Build sidecar + launch full app in dev mode (hot reload for frontend)
#   release        - Build sidecar + production .app/.dmg bundle (signed, installable)
#   release-all    - Build release DMGs for BOTH macOS architectures (M-series + Intel)
#   clean          - Remove all build artifacts, then do a full release build
#   help           - Show this help message
#
# Options:
#   --target TARGET  Cross-compile for a specific target:
#                    aarch64-apple-darwin  (Apple Silicon / M-series)
#                    x86_64-apple-darwin   (Intel Mac)
#
# Examples:
#   ./build.sh release                                # Build for current machine
#   ./build.sh release --target x86_64-apple-darwin   # Build Intel DMG from M-series Mac
#   ./build.sh release-all                            # Build both macOS DMGs

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
SIDECAR_BIN="thadm-recorder"
TAURI_DIR="$PROJECT_ROOT/screenpipe-app-tauri"
SIGNING_IDENTITY="Developer ID Application: Balaji Sachidanandam (KVLNE2Y696)"

cd "$PROJECT_ROOT"

# Source .env.local if it exists (Apple notarization credentials, etc.)
if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
    set -a
    source "$PROJECT_ROOT/.env.local"
    set +a
fi

# Notarize a .dmg or .app with Apple
# Requires: APPLE_ID, APPLE_PASSWORD (app-specific), APPLE_TEAM_ID env vars
notarize_app() {
    local file="$1"
    if [[ -z "${APPLE_ID:-}" || -z "${APPLE_PASSWORD:-}" || -z "${APPLE_TEAM_ID:-}" ]]; then
        echo "==> WARNING: Skipping notarization (APPLE_ID, APPLE_PASSWORD, or APPLE_TEAM_ID not set)"
        echo "    Set these env vars to enable notarization."
        return 0
    fi

    echo "==> Submitting for notarization: $(basename "$file")"
    echo "    This may take a few minutes..."
    xcrun notarytool submit "$file" \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" \
        --wait

    echo "==> Stapling notarization ticket..."
    xcrun stapler staple "$file"
    echo "==> Notarization complete for: $(basename "$file")"
}

# Detect host architecture
detect_host_target() {
    local arch
    arch="$(uname -m)"
    case "$arch" in
        arm64|aarch64)  echo "aarch64-apple-darwin" ;;
        x86_64)         echo "x86_64-apple-darwin" ;;
        *)
            echo "error: unsupported architecture: $arch" >&2
            exit 1
            ;;
    esac
}

# Parse --target flag from arguments
parse_target() {
    local target=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --target)
                target="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    echo "$target"
}

HOST_TARGET="$(detect_host_target)"

show_help() {
    echo ""
    echo "Thadm Build Script"
    echo "==================="
    echo ""
    echo "Usage: ./build.sh [command] [--target TARGET]"
    echo ""
    echo "Commands:"
    echo "  sidecar       Build the recorder sidecar only (fastest)"
    echo "                Compiles Rust code for the recorder binary."
    echo "                Use this to quickly test changes to: screenpipe-server,"
    echo "                screenpipe-audio, screenpipe-vision"
    echo ""
    echo "  dev           Build sidecar + launch full app in dev mode"
    echo "                Compiles sidecar, copies it into Tauri, then runs"
    echo "                'bun tauri dev' with hot reload for frontend changes."
    echo ""
    echo "  release       Build sidecar + production .app/.dmg bundle"
    echo "                Compiles sidecar in release mode, copies it, then"
    echo "                runs 'bun tauri build' to produce a signed .app and .dmg"
    echo ""
    echo "  release-all   Build BOTH macOS DMGs (Apple Silicon + Intel)"
    echo "                Runs two sequential release builds, producing:"
    echo "                  - Thadm_<ver>_aarch64.dmg  (M-series Macs)"
    echo "                  - Thadm_<ver>_x86_64.dmg   (Intel Macs)"
    echo ""
    echo "  clean         Full clean rebuild"
    echo "                Removes all build artifacts (cargo clean + old binaries)"
    echo "                then does a full release build from scratch."
    echo ""
    echo "  help          Show this help message"
    echo ""
    echo "Options:"
    echo "  --target TARGET   Cross-compile for a specific target:"
    echo "                    aarch64-apple-darwin   (Apple Silicon / M-series)"
    echo "                    x86_64-apple-darwin    (Intel Mac)"
    echo ""
    echo "Examples:"
    echo "  ./build.sh release                                 # Current architecture"
    echo "  ./build.sh release --target x86_64-apple-darwin    # Intel DMG"
    echo "  ./build.sh release-all                             # Both DMGs"
    echo ""
    echo "Note: Windows builds require GitHub Actions (trigger via 'Release App' workflow)."
    echo ""
}

build_sidecar_debug() {
    local target="${1:-$HOST_TARGET}"
    echo "==> Building from: $(pwd)"
    echo "==> Building sidecar (debug) for $target..."
    if [[ "$target" == "$HOST_TARGET" ]]; then
        cargo build --bin "$SIDECAR_BIN"
    else
        cargo build --bin "$SIDECAR_BIN" --target "$target"
    fi
    echo "==> Sidecar built for $target"
}

build_sidecar_release() {
    local target="${1:-$HOST_TARGET}"
    echo "==> Building from: $(pwd)"
    echo "==> Building sidecar (release) for $target..."
    # Set target-specific C/C++ flags to prevent AVX/AVX2 (Intel) or i8mm (ARM)
    # Use CC crate's target-specific env vars (CFLAGS_<target_with_underscores>)
    # to avoid applying x86 flags to ARM assembly files (e.g. ring crate)
    if [[ "$target" == "$HOST_TARGET" ]]; then
        CFLAGS_x86_64_apple_darwin="-march=penryn -mno-avx -mno-avx2" \
        CXXFLAGS_x86_64_apple_darwin="-march=penryn -mno-avx -mno-avx2" \
        CFLAGS_aarch64_apple_darwin="-mcpu=apple-m1 -U__ARM_FEATURE_MATMUL_INT8" \
        CXXFLAGS_aarch64_apple_darwin="-mcpu=apple-m1 -U__ARM_FEATURE_MATMUL_INT8" \
        cargo build --release --bin "$SIDECAR_BIN"
    else
        CFLAGS_x86_64_apple_darwin="-march=penryn -mno-avx -mno-avx2" \
        CXXFLAGS_x86_64_apple_darwin="-march=penryn -mno-avx -mno-avx2" \
        CFLAGS_aarch64_apple_darwin="-mcpu=apple-m1 -U__ARM_FEATURE_MATMUL_INT8" \
        CXXFLAGS_aarch64_apple_darwin="-mcpu=apple-m1 -U__ARM_FEATURE_MATMUL_INT8" \
        cargo build --release --bin "$SIDECAR_BIN" --target "$target"
    fi
    echo "==> Sidecar built for $target"
}

# Returns the path to the compiled sidecar binary
sidecar_output_path() {
    local mode="$1"  # debug or release
    local target="$2"
    if [[ "$target" == "$HOST_TARGET" ]]; then
        echo "$PROJECT_ROOT/target/$mode/$SIDECAR_BIN"
    else
        echo "$PROJECT_ROOT/target/$target/$mode/$SIDECAR_BIN"
    fi
}

copy_sidecar() {
    local mode="$1"  # debug or release
    local target="$2"
    local src
    src="$(sidecar_output_path "$mode" "$target")"
    local dest="$TAURI_DIR/src-tauri/${SIDECAR_BIN}-${target}"

    echo "==> Copying $mode sidecar to Tauri..."
    cp "$src" "$dest"
    echo "==> Copied to: $dest"
}

cmd_sidecar() {
    local target="${1:-$HOST_TARGET}"
    echo ""
    echo "=== SIDECAR BUILD ($target) ==="
    build_sidecar_release "$target"
    echo ""
    echo "Done. Binary at: $(sidecar_output_path release "$target")"
    echo ""
}

cmd_dev() {
    echo ""
    echo "=== DEV BUILD ==="
    build_sidecar_debug "$HOST_TARGET"
    copy_sidecar "debug" "$HOST_TARGET"
    echo "==> Launching Tauri dev mode..."
    cd "$TAURI_DIR"
    SKIP_SCREENPIPE_SETUP=1 bun tauri dev
}

cmd_release() {
    local target="${1:-$HOST_TARGET}"
    echo ""
    echo "=== RELEASE BUILD ($target) ==="

    # Ensure the Rust target is installed
    if ! rustup target list --installed | grep -q "^${target}$"; then
        echo "==> Installing Rust target: $target"
        rustup target add "$target"
    fi

    build_sidecar_release "$target"
    copy_sidecar "release" "$target"

    echo "==> Building Tauri app for $target (this will take a few minutes)..."
    cd "$TAURI_DIR"

    local app_path="src-tauri/target/$target/release/bundle/macos/Thadm.app"
    local dmg_dir="src-tauri/target/$target/release/bundle/dmg"

    # Tauri's DMG bundler (bundle_dmg.sh) can fail on newer macOS versions.
    # If `bun tauri build` fails but the .app exists, fall back to hdiutil.
    # Use target-specific CFLAGS to avoid applying x86 flags to ARM assembly (ring crate)
    if SKIP_SCREENPIPE_SETUP=1 \
        CFLAGS_x86_64_apple_darwin="-march=penryn -mno-avx -mno-avx2" \
        CXXFLAGS_x86_64_apple_darwin="-march=penryn -mno-avx -mno-avx2" \
        CFLAGS_aarch64_apple_darwin="-mcpu=apple-m1 -U__ARM_FEATURE_MATMUL_INT8" \
        CXXFLAGS_aarch64_apple_darwin="-mcpu=apple-m1 -U__ARM_FEATURE_MATMUL_INT8" \
        bun tauri build --target "$target"; then
        echo "==> Tauri build completed successfully."
        # Tauri already signs & notarizes the .app during build.
        # Only notarize the DMG (notarytool rejects .app directly).
        for dmg in "$dmg_dir"/*.dmg; do
            [[ -f "$dmg" ]] && notarize_app "$dmg"
        done
    elif [[ -d "$app_path" ]]; then
        echo ""
        echo "==> Tauri DMG bundler failed, but .app was built successfully."
        echo "==> Creating DMG with hdiutil fallback..."
        local version
        version="$(grep '^version = ' src-tauri/Cargo.toml | sed 's/version = "\(.*\)"/\1/')"
        local arch_label
        case "$target" in
            aarch64-apple-darwin) arch_label="aarch64" ;;
            x86_64-apple-darwin)  arch_label="x64" ;;
            *)                    arch_label="$target" ;;
        esac
        local dmg_name="Thadm_${version}_${arch_label}.dmg"
        mkdir -p "$dmg_dir"
        hdiutil create -volname "Thadm" -srcfolder "$app_path" -ov -format UDZO "$dmg_dir/$dmg_name"
        echo "==> Signing DMG with: $SIGNING_IDENTITY"
        codesign --sign "$SIGNING_IDENTITY" "$dmg_dir/$dmg_name"
        echo "==> DMG created and signed: $dmg_dir/$dmg_name"
        notarize_app "$app_path"
        notarize_app "$dmg_dir/$dmg_name"
    else
        echo ""
        echo "ERROR: Tauri build failed and no .app was produced."
        exit 1
    fi

    echo ""
    echo "Done. Outputs for $target:"
    echo "  App: $app_path"
    echo "  DMG: $dmg_dir/"
    echo ""
}

cmd_release_all() {
    echo ""
    echo "========================================="
    echo "  BUILDING ALL macOS TARGETS"
    echo "========================================="
    echo ""

    local targets=("aarch64-apple-darwin" "x86_64-apple-darwin")
    local output_dir="$PROJECT_ROOT/dist"
    mkdir -p "$output_dir"

    for target in "${targets[@]}"; do
        echo ""
        echo ">>>>>>>>>> Building $target <<<<<<<<<<"
        echo ""
        cmd_release "$target"

        # Copy DMG to dist/ with clear naming
        local dmg_dir="$TAURI_DIR/src-tauri/target/$target/release/bundle/dmg"
        if [[ -d "$dmg_dir" ]]; then
            for dmg in "$dmg_dir"/*.dmg; do
                if [[ -f "$dmg" ]]; then
                    local base
                    base="$(basename "$dmg")"
                    # Extract arch label for the filename
                    local arch_label
                    case "$target" in
                        aarch64-apple-darwin)  arch_label="apple-silicon" ;;
                        x86_64-apple-darwin)   arch_label="intel" ;;
                    esac
                    # Insert arch label: Thadm_1.0.3_aarch64.dmg -> Thadm_1.0.3_apple-silicon.dmg
                    local dest_name="${base%.dmg}_${arch_label}.dmg"
                    cp "$dmg" "$output_dir/$dest_name"
                    echo "==> Copied: dist/$dest_name"
                fi
            done
        fi

        # Return to project root for next iteration
        cd "$PROJECT_ROOT"
    done

    echo ""
    echo "========================================="
    echo "  ALL BUILDS COMPLETE"
    echo "========================================="
    echo ""
    echo "Output DMGs in: $output_dir/"
    ls -lh "$output_dir"/*.dmg 2>/dev/null || echo "  (no DMGs found — check build output above)"
    echo ""
    echo "Note: Windows builds require GitHub Actions."
    echo "      Trigger the 'Release App' workflow from the Actions tab."
    echo ""
}

cmd_clean() {
    local target="${1:-$HOST_TARGET}"
    echo ""
    echo "=== CLEAN BUILD ==="
    echo "==> Removing cargo build artifacts..."
    cargo clean
    echo "==> Removing old sidecar binaries..."
    rm -f "$TAURI_DIR/src-tauri/${SIDECAR_BIN}-"*
    echo "==> Clean complete. Starting full release build..."
    echo ""
    cmd_release "$target"
}

# Parse command and --target
CMD="${1:-help}"
shift || true
TARGET="$(parse_target "$@")"

case "$CMD" in
    sidecar)      cmd_sidecar "${TARGET:-$HOST_TARGET}" ;;
    dev)          cmd_dev ;;
    release)      cmd_release "${TARGET:-$HOST_TARGET}" ;;
    release-all)  cmd_release_all ;;
    clean)        cmd_clean "${TARGET:-$HOST_TARGET}" ;;
    help)         show_help ;;
    *)
        echo "Unknown command: $CMD"
        show_help
        exit 1
        ;;
esac
