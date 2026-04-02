# Thadm Rebrand Changelog

## What is Thadm?
Thadm is a rebranded fork of [screenpipe](https://github.com/screenpipe/screenpipe) — a local-first desktop app that records your screen, audio, and accessibility data 24/7, then lets you search and ask AI questions about everything you've seen, said, or heard.

Thadm is sold as a commercial product. Screenpipe's cloud/SaaS features are disabled. Thadm adds its own licensing (14-day trial + token-based activation).

## Why the rebrand?
- Thadm is a separate brand sold independently
- Screenpipe's MIT-licensed code allows commercial use and rebranding
- The `ee/` directory (proprietary Screenpipe Enterprise code) was removed — it's under a separate non-MIT license
- Cloud features (login, subscription, analytics) are disabled since Thadm has its own business model

## Repository structure
- **upstream remote**: `https://github.com/mediar-ai/screenpipe.git` (latest screenpipe)
- **origin remote**: `git@github-sbpk516:sbpk516/thadm.git` (thadm repo)
- **branch**: `thadm` (all customizations live here)
- **sync script**: `./sync-upstream.sh` rebases thadm on latest screenpipe daily

## Internal vs user-facing naming
Internal code (crate names, variable names, file paths, imports) stays as `screenpipe-*` to minimize merge conflicts with upstream. Only what the **end user sees** says "thadm".

---

## Changes made (in order)

### 1. Removed proprietary code
- **Deleted `ee/` directory** — Screenpipe Enterprise License (not MIT, cannot redistribute)
- **Stubbed `enterprise_policy.rs`** — `is_tray_item_hidden()` always returns false, `set_enterprise_policy()` is a no-op with `#[specta::specta]`
- **Added `ee/` to `.gitignore`** — prevents re-adding after upstream sync

### 2. Brand icons and assets (copied from thadm_old)
- **App icons** (`src-tauri/icons/`): All PNG sizes, .icns, .ico, iOS, Android, Windows Store — 52 files
- **Tray icons** (`src-tauri/assets/`): thadm-tray-{white,black,white-failed,black-failed,updates-white,updates-black}.png + SVGs — 14 files
- **Installer assets**: dmg-background.png, nsis-header.bmp, nsis-sidebar.bmp
- **Public assets**: screenpipe.svg, 128x128.png, pipe-store-preview.png
- **Code updated** to reference `thadm-tray-*.png` filenames instead of `screenpipe-logo-tray-*.png` in: tauri configs, health.rs, tray.rs, updates.rs, commands.rs

### 3. Tauri configuration
- **Product name**: "thadm" (prod), "thadm - Development" (dev), "thadm beta" (beta)
- **Bundle identifier**: `com.thadm.app` (prod), `com.thadm.dev` (dev), `com.thadm.beta` (beta)
- **Deep-link scheme**: `thadm://` (was `screenpipe://`)
- **fs:scope**: `$HOME/.thadm/**` (was `$HOME/.screenpipe/**`)
- **Capabilities** (`main.json`): All filesystem scopes updated to `.thadm`
- **Info.plist**: Permission prompt text says "thadm" not "screenpipe"
- Files: tauri.conf.json, tauri.prod.conf.json, tauri.beta.conf.json, tauri.enterprise.conf.json

### 4. Data directory: `~/.screenpipe` → `~/.thadm`
- **Primary path definition** (`crates/screenpipe-core/src/paths.rs`): Returns `~/.thadm`
- **Auto-migration**: On first run, if `~/.screenpipe` exists and `~/.thadm` doesn't, attempts `rename`. Falls back to `create_dir_all` with manual copy warning.
- **Config persistence** (`crates/screenpipe-config/src/persistence.rs`): Uses `~/.thadm`
- **All TypeScript path construction**: use-settings.tsx, chat-storage.ts, standalone-chat.tsx, usage-section.tsx, engine-startup.tsx, status.tsx, shortcut-reminder/page.tsx
- **Node packages**: packages/sync, packages/agent
- **UI text**: All user-visible references to `~/.screenpipe` changed to `~/.thadm`

### 5. Deep-link handlers updated
All runtime code that generates or parses deep links changed from `screenpipe://` to `thadm://`:
- main.rs: `starts_with("thadm://")`
- commands.rs: `format!("thadm://frame/{}", ...)`
- standalone-chat.tsx, chat-message.tsx, notification-handler.tsx
- MCP server (index.ts): resource URIs and guide text
- SKILL.md: AI prompt instructions

### 6. Cloud/analytics disabled (commented out, not deleted)
All changes marked with `// THADM: disabled` comments.

**Analytics/Telemetry:**
- PostHog initialization (`providers.tsx`) — commented out
- Sentry crash reporting (`main.rs`, `privacy-section.tsx`, `recording-settings.tsx`) — disabled
- Rust analytics (`analytics.rs`) — early return in `send_event()` and `start_periodic_event()`

**Subscription/Upgrade:**
- `upgrade-dialog.tsx` — returns null
- `referral-card.tsx` — returns null
- `login-dialog.tsx` — returns null
- `account-section.tsx` — checkout function commented out
- `ai-presets.tsx` — screenpipe-cloud provider hidden, cloud model fetch disabled

**Cloud sync:**
- `sync-settings.tsx`, `archive-settings.tsx` — all screenpi.pe API calls commented out
- Cloud sync service default — `enabled: false`

**Auto-update:**
- `updater.tsx` — UPDATE_ENDPOINTS emptied
- `update-banner.tsx` — screenpipe update URL commented out

**External services:**
- Enterprise policy fetch — commented out
- Intercom chat — returns null
- Team join API — commented out

**API endpoints disabled:**
- `pi.rs` — `SCREENPIPE_API_URL = ""`, cloud provider registration guarded
- `store.rs` — default AI URL emptied
- `embedded_server.rs` — Deepgram proxy env vars commented out
- `overlay/page.tsx` — sendLogs function gutted
- `web-search.ts` — early return when URL empty
- `region-ocr-overlay.tsx` — cloud OCR fetch commented out
- `ai-presets-selector.tsx` — cloud model fetch commented out

### 7. User-visible text: "screenpipe" → "thadm"

**Rust files:**
- main.rs: macOS menu bar ("thadm"), About/Quit menu items, stderr message, log filename prefix
- tray.rs: version display, tooltip, "Open thadm", "Quit thadm"
- updates.rs: All notification text (update available, downloading, up to date, etc.)
- permissions.rs, chatgpt_oauth.rs, pi.rs: error messages

**React/TypeScript files (30+ files):**
- Home page, overlay, notification panel, error page
- Onboarding: engine-startup, login-gate, permissions-step, status, read-content
- Settings: connections, browser-url-card, disk-usage, shortcut, voice-memos, calendar, openclaw, notifications, display, recording, ai-presets, usage, google-calendar
- Components: notification-handler, standalone-chat, screenpipe-status, vault-lock-dialog, splash-screen, update-banner, upgrade-dialog, dev-mode-settings, cli-command-dialog

**CLI (Rust):**
- cli/mod.rs: --help name, about, subcommand descriptions
- cli/login.rs, status.rs, pipe.rs, mcp.rs: printed messages

**MCP server:**
- index.ts: server name "thadm", tool descriptions, guide text, export filename
- http-server.ts: server name, tool descriptions
- manifest.json: name, display_name, long_description
- search.html: title and heading

**Other:**
- Swift notification_panel.swift: `Text("thadm")`
- Windows hooks.nsh: process names, directory paths
- package.json: name "thadm"
- Cargo.toml: binary name "thadm", default-run "thadm"

### 8. UI feature: "Pipes" → "Tasks"
All user-visible text renamed (15 files, 73 replacements):
- Sidebar: "Pipes" → "Tasks"
- Tabs: "My Pipes" → "My Tasks"
- Header: "Pipe AI" → "Thadm AI", "SCREEN ACTIVITY ASSISTANT" → "YOUR SCREEN MEMORY"
- All search placeholders, empty states, toast messages, dialog text, notification labels
- Settings labels: "Pipe suggestions" → "Task suggestions", etc.
- Internal code (variable names, file paths, function names) unchanged

### 9. Default AI preset
- Changed from `screenpipe-cloud` provider to `native-ollama` (localhost:11434)
- Default preset ID renamed from "screenpipe-free" to "default"
- Migration added for existing users with old preset names
- Chat login gate bypassed (`needsLogin = false`)
- "Login required to use Screenpipe Cloud" warning hidden

### 10. Sidebar cleanup (cloud features hidden)
Commented out in home/page.tsx:
- "Add your team to thadm" promo card
- "Invite your team" link
- "Get free month" link
- Settings sections: Team, Account, Get free month

### 11. Build scripts
- **`dev.sh`** — 5-phase dev build: verify structure, check prerequisites, kill stale processes, install deps, build + monitor with failure detection and timeout
- **`build.sh`** — Simple production build wrapper
- **`sync-upstream.sh`** — Daily sync with screenpipe upstream via rebase

### 12. Documentation
- **`CLAUDE.md`** — Comprehensive guide for AI agents working on the codebase
- **`REBRAND_PLAN.md`** — Original rebrand analysis and implementation plan
- **`CHANGELOG_REBRAND.md`** — This file

---

## What was NOT changed (intentionally)
- Crate names: `screenpipe-core`, `screenpipe-audio`, etc.
- Variable and function names throughout the codebase
- File and directory names (except icons)
- Import paths
- Internal provider type strings (e.g., `"screenpipe-cloud"` in serde/switch statements)
- Log messages (internal, not user-visible)
- Test fixtures
- Internal permission file names (`.screenpipe-permissions.json`)
- The `CLAUDE.md` file header comment (kept as screenpipe per upstream convention)

## Known remaining items
- Some code comments still reference `~/.screenpipe` (internal documentation, not user-visible)
- `posthog.capture()` calls exist throughout but are no-ops since `posthog.init()` is disabled
- README.md still references screenpipe (intentional — documents the upstream origin)

## Pending features (not yet implemented)
1. **Apple Developer signing** — for production .dmg builds
2. **14-day trial + token activation** — licensing system (reference: thadm_old repo)
