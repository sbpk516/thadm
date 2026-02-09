# Thadm Build Guide

## What is Thadm?

Thadm is a desktop app. It has TWO separate programs that work together:

1. **thadm** (Main App) — The window you see. The UI. Built with Tauri + Next.js.
2. **thadm-recorder** (Sidecar) — Runs in the background. Records your screen and audio. Built with Rust.

When you open Thadm, the main app launches the recorder as a background process. They talk to each other over HTTP (port 3030).

## What is Tauri?

Tauri is a framework for building desktop apps (like Electron, which VS Code uses, but lighter).
- Electron bundles an entire Chrome browser inside your app (~150MB extra)
- Tauri uses the built-in browser that macOS already has (~0MB extra)
- Tauri provides: folder structure, build system, window management, native API access
- We fill in: Rust backend code + React/Next.js frontend code

## Source Code Structure

```
thadm/
│
├── build.sh                         ← THE build script (always use this)
│
├── screenpipe-server/               ← Sidecar source code (Rust)
│   ├── Cargo.toml                   ← Defines binary name: thadm-recorder
│   └── src/bin/screenpipe-server.rs ← Main entry point for the recorder
│
├── screenpipe-audio/                ← Audio capture + transcription (Rust)
├── screenpipe-vision/               ← Screen capture + OCR (Rust)
├── screenpipe-core/                 ← Shared utilities (Rust)
├── screenpipe-db/                   ← Database (Rust)
│
│   All of the above get compiled into ONE binary: thadm-recorder
│
├── screenpipe-app-tauri/            ← Main app (UI + Tauri)
│   ├── app/                         ← Next.js/React UI (JavaScript)
│   ├── scripts/
│   │   └── pre_build.js             ← Copies binaries before Tauri build
│   └── src-tauri/
│       ├── src/                     ← Main app Rust backend
│       ├── tauri.conf.json          ← Tauri config (app name, signing, etc.)
│       ├── tauri.macos.conf.json    ← Lists external binaries (sidecar, ffmpeg, etc.)
│       │
│       │   These bin files are placed here before building:
│       ├── thadm-recorder-aarch64-apple-darwin  ← sidecar copy
│       ├── bun-aarch64-apple-darwin             ← JavaScript runtime
│       ├── ffmpeg-aarch64-apple-darwin           ← video processing
│       ├── ffprobe-aarch64-apple-darwin          ← video inspection
│       └── ui_monitor-aarch64-apple-darwin       ← accessibility monitor
│
└── target/                          ← Sidecar build output (see below)
```

## Build Outputs — Two Separate target/ Folders

### Root target/ — Sidecar builds only

```
target/
├── debug/
│   └── thadm-recorder       ← debug sidecar (just executable, ~80MB)
└── release/
    └── thadm-recorder       ← release sidecar (just executable, ~34MB)
```

No .app, no .dmg here. Just the raw recorder binary.

### src-tauri/target/ — Main app builds

```
screenpipe-app-tauri/src-tauri/target/
├── debug/
│   └── thadm               ← debug main app (just executable, no .app)
└── release/
    ├── thadm               ← release main app (just executable)
    └── bundle/              ← ONLY exists in release mode
        ├── macos/
        │   └── Thadm.app/  ← the final app (a folder containing all binaries)
        │       └── Contents/MacOS/
        │           ├── thadm              ← main app
        │           ├── thadm-recorder     ← sidecar
        │           ├── bun                ← JavaScript runtime
        │           ├── ffmpeg             ← video processing
        │           ├── ffprobe            ← video inspection
        │           └── ui_monitor         ← accessibility monitor
        └── dmg/
            └── Thadm_2.0.161_aarch64.dmg ← installable disk image
```

Key points:
- Debug folders contain ONLY raw executable files
- Release folder contains raw executable + .app + .dmg
- .app and .dmg are NEVER created in debug/dev mode
- The .app is actually a folder — macOS just shows it as an icon

## Build Commands — Always Use build.sh

```bash
./build.sh sidecar    # Build recorder only (fastest)
./build.sh dev        # Build sidecar + launch full app in dev mode
./build.sh release    # Build sidecar + production .app + .dmg
./build.sh clean      # Delete everything + full release build
./build.sh help       # Show help
```

NEVER run cargo build, bun tauri build, or cp commands manually.

## What Each Build Command Does

### ./build.sh sidecar (fastest — test recorder changes)

```
Step 1: cargo build --release --bin thadm-recorder
        Compiles: screenpipe-server + audio + vision + core + db
        Creates:  target/release/thadm-recorder

That's it. Run directly: ./target/release/thadm-recorder
No UI, no window — just the recorder running in your terminal.
```

### ./build.sh dev (full app with hot reload)

```
Step 1: cargo build --bin thadm-recorder (debug mode)
        Creates: target/debug/thadm-recorder

Step 2: Copy sidecar to Tauri location
        target/debug/thadm-recorder
          → screenpipe-app-tauri/src-tauri/thadm-recorder-aarch64-apple-darwin

Step 3: bun tauri dev
        - pre_build.js runs (skips sidecar copy, copies bun/ffmpeg/ffprobe)
        - Tauri compiles main app → src-tauri/target/debug/thadm
        - Next.js dev server starts (hot reload)
        - Tauri opens a window + launches sidecar in background

No .app created. No .dmg created. App runs directly from the binary.
```

### ./build.sh release (production build)

```
Step 1: cargo build --release --bin thadm-recorder
        Creates: target/release/thadm-recorder

Step 2: Copy sidecar to Tauri location
        target/release/thadm-recorder
          → screenpipe-app-tauri/src-tauri/thadm-recorder-aarch64-apple-darwin

Step 3: bun tauri build
        - pre_build.js runs (skips sidecar copy, copies bun/ffmpeg/ffprobe)
        - Next.js builds static pages
        - Tauri compiles main app → src-tauri/target/release/thadm
        - Tauri bundles everything into Thadm.app
        - Code signing with "Developer ID Application: Balaji Sachidanandam"
        - Creates DMG

Output:
  .app → src-tauri/target/release/bundle/macos/Thadm.app
  .dmg → src-tauri/target/release/bundle/dmg/Thadm_*.dmg
```

### ./build.sh clean (start fresh)

```
Step 1: cargo clean (deletes entire target/ folder)
Step 2: Remove old sidecar copies from src-tauri/
Step 3: Run the full release build (same as above)
```

## macOS Permissions — Dev vs Release

| | Dev mode | Release mode |
|--|---------|-------------|
| Code signed? | No | Yes |
| Permissions persist across rebuilds? | No — may need to re-grant | Yes — macOS trusts the signature |
| Screen recording permission | Tied to binary path, may reset | Tied to signing identity, persists |

In dev mode, macOS sees the raw binary path. Every rebuild changes the binary, so macOS may ask for permissions again. This is normal.

In release mode, the app is code-signed. macOS recognizes the signature and remembers your permission choices across rebuilds and updates.

## What is Cargo?

Cargo is Rust's build tool. It reads Cargo.toml files, compiles .rs source code, and produces executable binaries. It is to Rust what bun/npm is to JavaScript.

## What is a Sidecar?

A sidecar is a separate program that runs alongside the main app. The main app (thadm) launches it in the background. It's called "sidecar" because it rides alongside — like a motorcycle sidecar.

## What is the -aarch64-apple-darwin suffix?

It means "this binary is for Apple Silicon Mac." Tauri adds this suffix automatically.
- aarch64-apple-darwin = Apple Silicon Mac (M1/M2/M3/M4)
- x86_64-apple-darwin = Intel Mac
