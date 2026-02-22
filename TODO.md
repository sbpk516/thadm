# Thadm — Open Issues & Next Steps

> **Updated**: 2026-02-21
> **Priority**: Work through these sequentially

---

## Issue 1: Release via GitHub + Auto-Update Notifications

**Status**: Not started
**Priority**: P0

**Goal**: Users should be able to install Thadm and receive update notifications when a new version is released.

**Requirements**:
- Release builds (DMG) published to GitHub Releases
- Existing users get notified when a new version is available
- Users can download and install the update

**Questions to investigate**:
- Does Tauri have a built-in updater plugin? (tauri-plugin-updater)
- What signing/notarization is needed for auto-update?
- How to bump version numbers (currently hardcoded `2.0.161`)?
- GitHub Actions CI/CD for automated release builds?

---

## Issue 2: Menu Bar Icon Missing on Built-in Display

**Status**: Diagnosed — macOS limitation, no code fix
**Priority**: P1

**Root cause**: macOS notch menu bar overflow. With 14+ menu bar icons on a notched MacBook Pro (M4 Pro), macOS silently hides the lowest-priority NSStatusItems behind the notch. No API exists to control priority or detect overflow. When an external monitor is connected, the wider menu bar has enough space for all icons.

**Confirmed**: 2026-02-21 — removing 5-6 third-party icons made Thadm icon appear immediately.

**Decision**: Accept the limitation. Do NOT add a dock icon as fallback — contradicts Thadm's design as an invisible background utility. Document the limitation in onboarding/README. Existing `Cmd+Ctrl+S` shortcut provides fallback access.

**See**: `specs/SPEC-menu-bar-icon.md` for full investigation and decision log

---

## Issue 3: 15-Day Free Trial + License Key

**Status**: Not started
**Priority**: P1

**Goal**: New users get 15 days of free usage. After 15 days, the app stops working and asks for a license key. Only valid license keys unlock continued usage.

**Requirements**:
- Track first-launch date (store locally)
- Show "X days remaining" somewhere in the UI
- After 15 days: block recording, show license key input screen
- License key validation (online or offline?)
- Prevent simple bypass (e.g., changing system clock)

**Questions to decide**:
- License key provider: Gumroad? LemonSqueezy? Keygen? Custom server?
- Online validation (requires internet) or offline (embedded key)?
- What happens if user has no internet when trial expires?
- Grace period after trial ends?
- Pricing model?

---

## Issue 4: Update README.md for Thadm

**Status**: Not started
**Priority**: P2

**Goal**: Replace the screenpipe README with Thadm-specific content reflecting the rebrand, target audience, and current feature set.

**Requirements**:
- App name, description, and branding updated to Thadm
- Target audience (ADHD, researchers, students) highlighted
- Installation instructions (DMG download from GitHub Releases)
- Build from source instructions (using `./build.sh`)
- Screenshots of the current UI
- Remove or update screenpipe-specific content (cloud features, pipes, etc.)
- Keep MIT license attribution to screenpipe

---

## Completed Issues (for reference)

### Fixed: Screen Recording Permission Denied (2026-02-20)
- Root cause: Launch Services cache poisoning from old DMG builds
- Fix: `lsregister -u` stale entries, re-add in System Settings
- See: `PERMISSION_AND_RECORDING_FLOW.md`

### Fixed: "Reset & Fix" Button Not Working (2026-02-20)
- Root cause: Called `requestPermission()` instead of `resetAndRequestPermission()`, TS binding missing
- Fix: Added binding, fixed call in `page.tsx:179`

### Fixed: Permission Recovery Crash Loop (2026-02-19)
- Root cause: Unbounded setTimeout + accessibility triggering recovery window
- Fix: useRef guard + only emit permission-lost for screen/mic

### Fixed: Sidecar Won't Re-spawn After Crash (2026-02-10)
- Root cause: Stale CommandChild handle + SIGKILL preventing clean socket close
- Fix: Verify process alive before skipping spawn, graceful SIGTERM shutdown

### Fixed: ScreenCaptureKit Dialog Flood (2026-02-08)
- Root cause: 108+ SCK calls/min from 4 sources
- Fix: Reduced call frequency, added cooldowns
