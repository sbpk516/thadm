
<h1 align="center">thadm</h1>

<p align="center">AI that knows everything you've seen, said, or heard</p>
<p align="center">100% local. No cloud. No login. You own your data.</p>

<p align="center">
  <a href="https://github.com/sbpk516/thadm/releases">
    <img src="https://img.shields.io/badge/download-latest%20release-black?style=for-the-badge" alt="download">
  </a>
</p>

---

## what is this?

thadm turns your computer into a personal AI that knows everything you've done. record. search. automate. all local, all private, all yours.

Built on [screenpipe](https://github.com/screenpipe/screenpipe) (open source, MIT license).

```
┌─────────────────────────────────────────┐
│  screen + audio → local storage → ai   │
└─────────────────────────────────────────┘
```

- **remember everything** - never forget what you saw, heard, or did
- **run agents that work based on what you do** - pipes are agents triggered by your work activity
- **search with ai** - find anything using natural language
- **100% local** - your data never leaves your machine
- **no cloud, no login** - all cloud/SaaS features disabled by design

## install

[Download the latest release](https://github.com/sbpk516/thadm/releases) for your platform:

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `.dmg` (aarch64) |
| macOS (Intel) | `.dmg` (x86_64) |
| Windows 10/11 | `.exe` (NSIS installer) |
| Linux | `.deb` / `.AppImage` |

## specs

- captures full accessibility tree, OCR as fallback, transcription, speakers, keyboard inputs, app switches
- 5-10% cpu usage
- 0.5-3gb ram
- ~20gb storage/month
- filters (window, app, chrome extensions, passwords, PII)
- optional encryption at rest
- works offline
- data stored at `~/.thadm/`

## build from source

### prerequisites

- **Rust** 1.93.1+ (`rustup`)
- **Bun** 1.3.10+ (`curl -fsSL https://bun.sh/install | bash`)
- **Xcode CLI tools** (macOS: `xcode-select --install`)

### dev build

```bash
./dev.sh
```

### production build (macOS)

```bash
./build.sh                                    # native arm64
./build.sh --target x86_64-apple-darwin       # Intel cross-compile
./build.sh --all                              # both architectures
```

## core features

### event-driven screen capture
Listens for meaningful events — app switches, clicks, typing pauses, scrolling — and captures a screenshot only when something changes. Pairs screenshots with the accessibility tree for structured text extraction. Falls back to OCR when needed.

### audio transcription
Captures system audio and microphone input. Real-time speech-to-text using OpenAI Whisper running locally on your device. Speaker identification and diarization.

### ai-powered search
Natural language search across all OCR text and audio transcriptions. Filter by application, window title, date range. Semantic search using embeddings.

### timeline view
Visual timeline of your entire screen history. Scroll through your day, click any moment to see the full screenshot and extracted text.

### plugin system (pipes)
Pipes are scheduled AI agents defined as markdown files. Each pipe has a prompt and schedule — thadm runs an AI agent that queries your screen data and takes actions.

### MCP server
thadm runs as an MCP server, allowing AI assistants (Claude Desktop, Cursor, etc.) to query your screen history.

### developer API
REST API on localhost:3030. Search, frames, audio, elements, health, pipe management. JavaScript/TypeScript SDK available.

## what's different from screenpipe?

thadm is a rebranded fork focused on **local-first, no-cloud usage**:

- No analytics (PostHog disabled)
- No crash reporting (Sentry disabled)
- No login/signup required
- No subscription/checkout flows
- No cloud sync
- No enterprise policy enforcement
- Data directory: `~/.thadm/` (not `~/.screenpipe/`)
- Auto-updates via GitHub Releases

## architecture

```
apps/screenpipe-app-tauri/     Desktop app (Tauri + Next.js)
crates/
  screenpipe-core/             FFmpeg, paths, pipe runner
  screenpipe-engine/           AI processing, capture orchestration
  screenpipe-audio/            Audio capture & transcription
  screenpipe-screen/           Screen capture & OCR
  screenpipe-db/               SQLite database layer
  screenpipe-connect/          Integrations (MCP, OAuth)
```

- **Frontend**: Next.js 15 (port 1420 dev)
- **Backend**: Axum server (port 3030)
- **Database**: SQLite at `~/.thadm/db.sqlite`
- **MCP server**: stdio or HTTP (port 3031)

## license

Built on [screenpipe](https://github.com/screenpipe/screenpipe) which is MIT licensed.
