# Thadm Architecture Overview

> This document explains how the app is built and why certain technologies were chosen.

---

## App Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        THADM.app (Native macOS App)                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    APP SHELL (Tauri - Rust)                   │ │
│  │                                                               │ │
│  │  What it does:                                                │ │
│  │  • Creates native window (title bar, close/minimize buttons)  │ │
│  │  • Menu bar tray icon (top right of screen)                   │ │
│  │  • Dock icon                                                  │ │
│  │  • Keyboard shortcuts (global hotkeys)                        │ │
│  │  • macOS permissions (Screen, Mic, Accessibility)             │ │
│  │  • File system access                                         │ │
│  │  • App signing & notarization                                 │ │
│  │                                                               │ │
│  │  Technology: Tauri (open-source Rust library)                 │ │
│  │  Website: https://tauri.app                                   │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                 UI RENDERING (macOS WebKit)                   │ │
│  │                                                               │ │
│  │  What it does:                                                │ │
│  │  • Takes HTML/CSS/JS and draws it on screen                   │ │
│  │  • Same engine as Safari browser                              │ │
│  │  • Built into macOS (no download needed)                      │ │
│  │  • NOT a browser - just renders UI locally                    │ │
│  │                                                               │ │
│  │  Technology: WebKit (Apple's built-in browser engine)         │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                   UI CODE (React/Next.js)                     │ │
│  │                                                               │ │
│  │  What it does:                                                │ │
│  │  • The actual UI we see (buttons, settings, timeline, etc.)   │ │
│  │  • Written in TypeScript/React                                │ │
│  │  • This is what developers modify to change the UI            │ │
│  │                                                               │ │
│  │  Technology: Next.js 15 + React 18 + Tailwind CSS             │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │              BACKEND SERVER (screenpipe-server)               │ │
│  │                                                               │ │
│  │  What it does:                                                │ │
│  │  • Screen capture using ScreenCaptureKit                      │ │
│  │  • Audio capture using CoreAudio                              │ │
│  │  • OCR (text recognition from screenshots)                    │ │
│  │  • ML models (Whisper for transcription)                      │ │
│  │  • SQLite database (stores all captured data)                 │ │
│  │  • HTTP API (frontend talks to this)                          │ │
│  │                                                               │ │
│  │  Technology: Rust + Axum (HTTP server)                        │ │
│  │  Runs as: Sidecar process (separate from main app)            │ │
│  │  Port: http://localhost:3030                                  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Visual: App Shell vs UI Code

```
┌──────────────────────────────────────┐
│  [─] [□] [×]    Thadm               │  ← APP SHELL (Tauri)
├──────────────────────────────────────┤     - Window frame
│                                      │     - Title bar
│     ┌────────────────────────┐      │     - Close/minimize buttons
│     │   Settings Button      │      │
│     │   Timeline View        │      │  ← UI CODE (React)
│     │   Search Box           │      │     - Everything inside
│     │   Chat Interface       │      │     - Buttons, text, images
│     └────────────────────────┘      │
│                                      │
└──────────────────────────────────────┘

Menu Bar (top of screen):
┌─────────────────────────────────────────────────────────┐
│  Apple  File  Edit  View  ...           [Thadm Icon]   │  ← APP SHELL
└─────────────────────────────────────────────────────────┘
```

---

## Technology Stack Explained

### Layer 1: App Shell (Tauri)

| Question | Answer |
|----------|--------|
| What is Tauri? | Open-source Rust library for building desktop apps |
| Who made it? | Tauri community (not us, not Apple) |
| Website | https://tauri.app |
| Why use it? | Cross-platform (Mac, Windows, Linux) + lightweight |
| Alternative | Electron (heavier, uses Chromium) |

**Tauri vs Electron:**
```
Electron = JavaScript + Chromium browser bundled (~150MB)
Tauri    = Rust + System WebKit (already on Mac) (~5MB)
```

### Layer 2: UI Rendering (WebKit)

| Question | Answer |
|----------|--------|
| What is WebKit? | Apple's browser engine (powers Safari) |
| Who made it? | Apple |
| Built into macOS? | Yes, comes with every Mac |
| Why use it? | Renders HTML/CSS/JS without bundling a browser |
| Is it a browser? | No - just renders UI, doesn't access internet |

**Why WebKit is needed:**
- React code produces HTML/CSS/JavaScript
- Something needs to display that on screen
- WebKit takes HTML/CSS/JS and draws pixels
- Like a "painter" that draws what React describes

### Layer 3: UI Code (React/Next.js)

| Question | Answer |
|----------|--------|
| What is React? | JavaScript library for building UIs |
| What is Next.js? | Framework that adds features to React |
| Who made them? | Meta (React), Vercel (Next.js) |
| Why use them? | Easy to build complex UIs, large ecosystem |

**UI Code = The code we write**
- Components (buttons, dialogs, settings)
- Pages (timeline, chat, onboarding)
- Styling (colors, layout)

### Layer 4: Backend (Rust)

| Question | Answer |
|----------|--------|
| What language? | Rust |
| What framework? | Axum (HTTP server) |
| What does it do? | Screen capture, audio, ML, database |
| How does it run? | As a "sidecar" (separate process) |
| Port | http://localhost:3030 |

---

## Native macOS APIs Used

### Screen Capture: ScreenCaptureKit

| Question | Answer |
|----------|--------|
| What is it? | Apple's API for capturing screen content |
| Who made it? | Apple |
| Built into macOS? | Yes (macOS 12.3+) |
| Requires permission? | Yes - Screen Recording |

### Audio Capture: cpal + CoreAudio

| Question | Answer |
|----------|--------|
| What is CoreAudio? | Apple's built-in audio system |
| Who made it? | Apple |
| What is cpal? | Rust library that wraps audio APIs |
| Who made cpal? | Open-source community |

**How they work together:**
```
App (Rust code)
    ↓
cpal (cross-platform Rust library)
    ↓
┌─────────────────────────────────┐
│ macOS: CoreAudio (Apple)        │
│ Windows: WASAPI (Microsoft)     │
│ Linux: ALSA                     │
└─────────────────────────────────┘
```

### Permissions: TCC

| Question | Answer |
|----------|--------|
| What is TCC? | Transparency, Consent, and Control |
| Who made it? | Apple |
| What does it do? | Manages permissions (Screen, Mic, etc.) |
| Those permission popups? | Yes, that's TCC |

---

## Why Rust Instead of Swift?

| If you use... | You get... |
|---------------|------------|
| Swift/SwiftUI | macOS only |
| Tauri/Rust | macOS + Windows + Linux |

**Reasons they chose Tauri/Rust:**

1. **Cross-platform** — Same codebase for Mac, Windows, Linux
2. **Performance** — Rust is very fast (good for ML, audio)
3. **Smaller app** — Uses system WebKit (~5MB vs Electron's ~150MB)
4. **Memory efficient** — Uses less RAM than Electron apps

---

## Data Flow: How Everything Connects

```
USER ACTION                         WHAT HAPPENS
─────────────────────────────────────────────────────────────────

User clicks                    React component handles click
"Search" button          →     ↓
                              Zustand store calls API
                              ↓
                              fetch("http://localhost:3030/search")
                              ↓
                              Axum HTTP server receives request
                              ↓
                              Rust code queries SQLite database
                              ↓
                              Results sent back as JSON
                              ↓
                              Zustand store updates state
                              ↓
                              React re-renders with results
                              ↓
                              WebKit draws updated UI
                              ↓
User sees                      Search results appear on screen
search results
```

---

## Summary Table

| Component | Technology | Made By | Native macOS? |
|-----------|------------|---------|---------------|
| App window, tray, menus | Tauri (Rust) | Tauri community | ✅ Yes |
| Draws UI on screen | WebKit | Apple | ✅ Yes |
| UI components | React/Next.js | Meta/Vercel | Web tech in native container |
| Screen capture | ScreenCaptureKit | Apple | ✅ Yes |
| Audio capture | cpal → CoreAudio | Community/Apple | ✅ Yes |
| Permissions | TCC | Apple | ✅ Yes |
| ML, database | Rust (screenpipe-server) | screenpipe team | ✅ Yes |

---

## Analogy: Building a House

```
HOUSE                           APP
─────────────────────────────────────────────
Foundation, walls, roof    =    Tauri (app shell)
Windows (glass)            =    WebKit (renders what's inside)
Furniture, decorations     =    React (the UI we see)
Plumbing, electrical       =    Rust backend (does the work)
Permits from city          =    TCC permissions
```

---

## Files Reference

| What | Where |
|------|-------|
| Tauri config | `screenpipe-app-tauri/src-tauri/tauri.conf.json` |
| Tauri Rust code | `screenpipe-app-tauri/src-tauri/src/` |
| React components | `screenpipe-app-tauri/components/` |
| Next.js pages | `screenpipe-app-tauri/app/` |
| Backend server | `screenpipe-server/src/` |
| Database | `~/.screenpipe/db.sqlite` |
