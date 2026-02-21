# Thadm — Implementation Plans

> **Created**: 2026-02-21
> **Process**: Spec Driven Development (Spec → Plan → Tasks → Implement)
> **Spec**: See `SPEC.md`

---

## Plan 1: Release via GitHub + Auto-Update Notifications

### Current State

The auto-update infrastructure is **already built** from the screenpipe codebase:

| Component | Status | Location |
|-----------|--------|----------|
| `tauri-plugin-updater` | Installed v2.9.0 | `Cargo.toml`, `package.json` |
| Updater code (Rust) | Implemented | `src-tauri/src/updates.rs` (245 lines) |
| Updater code (TS) | Implemented | `components/updater.tsx` (83 lines) |
| Periodic update check | Every 5 minutes | `main.rs:1106` |
| CI workflows | Exist | `.github/workflows/release-app.yml` |
| CrabNebula CDN | Configured | `tauri.prod.conf.json` endpoints |
| Tauri updater signing | Configured | `TAURI_SIGNING_PRIVATE_KEY` secret |

### Problem

The existing infrastructure points to **screenpipe's CrabNebula CDN** and uses
**screenpipe's bundle IDs** (`screenpi.pe`, `screenpi.pe.beta`). The prod/beta
configs were never updated during the rebrand.

### Technical Approach

**Option A: GitHub Releases Only (Recommended for v1)**
- Simplest path — no external CDN dependency
- Tauri updater supports GitHub Releases natively
- Users download DMG from GitHub, auto-update checks GitHub API

**Option B: CrabNebula CDN (existing setup)**
- Already configured but points to screenpipe's account
- Would need new CrabNebula account for Thadm
- More infrastructure to manage

### Architecture (Option A)

```
Build locally          GitHub Releases         User's Mac
─────────────         ────────────────         ──────────
./build.sh release
       │
       ▼
   Thadm.app
   Thadm.dmg          gh release create
   Thadm.tar.gz  ──────────────────────►  v2.1.0
   Thadm.tar.gz.sig                        ├─ Thadm.dmg
                                           ├─ Thadm.tar.gz
                                           └─ Thadm.tar.gz.sig
                                                    │
                                      Tauri updater checks
                                      every 5 minutes
                                                    │
                                                    ▼
                                           "Update available!"
                                           User clicks Install
                                                    │
                                                    ▼
                                           Downloads .tar.gz
                                           Verifies signature
                                           Replaces app bundle
                                           Restarts
```

### File Changes

| File | Change |
|------|--------|
| `tauri.conf.json` | Add updater endpoint pointing to GitHub Releases |
| `tauri.prod.conf.json` | Update identifier `screenpi.pe` → `com.thadm.desktop`, update endpoints to GitHub |
| `tauri.beta.conf.json` | Update identifier `screenpi.pe.beta` → `com.thadm.desktop.beta`, update endpoints |
| `src-tauri/src/updates.rs` | Review and update for Thadm branding (dialogs, messages) |
| `components/updater.tsx` | Update endpoint URLs, branding |
| `src-tauri/Cargo.toml` | Bump version for first release |
| `build.sh` | Add `publish` command that creates GitHub Release with `gh` CLI |

### Version Numbering

- Current: `2.0.161` (inherited from screenpipe)
- Proposal: Reset to `1.0.0` for Thadm's first release
- Source of truth: `src-tauri/Cargo.toml` line 3
- Bump strategy: `major.minor.patch` (semver)

### Signing for Updates

Tauri updater requires a signing keypair:
- Generate: `bun tauri signer generate -w ~/.tauri/thadm.key`
- Private key → GitHub secret `TAURI_SIGNING_PRIVATE_KEY`
- Public key → `tauri.conf.json` > `plugins.updater.pubkey`
- This is SEPARATE from the Apple code signing (Developer ID)

### Prerequisites

- [ ] Generate Tauri updater signing keypair
- [ ] Store private key as GitHub secret
- [ ] Decide on version number (reset to 1.0.0?)
- [ ] Test GitHub Releases updater endpoint format

### Risks

- First-time users who installed via DMG won't auto-update to v1 — they need
  to manually download the new version that has the updater configured
- Signing key rotation requires all users to manually update once

---

## Plan 2: Menu Bar Icon Missing on Built-in Display

### Current State

| Component | Status | Detail |
|-----------|--------|--------|
| Tray icon file | Correct | `thadm-tray-white.png` (973 bytes, template image) |
| Tray config | Correct | `iconAsTemplate: true`, ID `thadm_main` |
| `LSUIElement` | `true` | In `Info.plist` — hides app from dock |
| Activation policy | Conflicting | Code sets `Regular`, `LSUIElement` overrides to `Accessory` |
| Multi-display code | Exists | Only for window positioning, not tray |
| Notch handling | None | No code for MacBook notch awareness |

### Root Cause Hypothesis

The tray icon IS being created, but on MacBook built-in displays with a notch,
the menu bar has limited space. When there are many menu bar items (system icons,
third-party apps), the tray icon may be **pushed behind the notch** where it's
invisible.

When an external monitor is connected, macOS extends the menu bar to the external
display which has no notch and more space — making the icon visible.

### Alternative Hypothesis

The `LSUIElement=true` + dynamic `ActivationPolicy` switching may cause macOS
to not show the tray icon on the primary (built-in) display until a window
is opened on that display.

### Investigation Steps (before coding)

1. Check icon dimensions — should be exactly 22x22 pixels (or 44x44 @2x)
2. Test with all other menu bar items removed — does icon appear?
3. Test with `LSUIElement=false` — does icon appear?
4. Check if `ActivationPolicy::Regular` at startup fixes it
5. Test on a MacBook without notch (pre-2021 model) if available

### Technical Approach

```
Step 1: Verify icon dimensions
        sips -g pixelHeight -g pixelWidth thadm-tray-white.png
        If wrong size → fix icon to 22x22 (44x44 @2x)

Step 2: Test ActivationPolicy
        Change startup to ActivationPolicy::Accessory (match LSUIElement)
        See if tray appears consistently

Step 3: If notch is the issue
        macOS has no API to detect notch or menu bar overflow
        Options:
        a) Reduce icon size to minimum
        b) Use NSStatusItem priority (if Tauri exposes it)
        c) Document as known limitation
```

### File Changes

| File | Change |
|------|--------|
| `src-tauri/src/main.rs` | Fix activation policy conflict (line 1180) |
| `src-tauri/Info.plist` | Potentially remove `LSUIElement` if it's the cause |
| `src-tauri/assets/thadm-tray-white.png` | Verify/fix dimensions |
| `src-tauri/src/tray.rs` | Potentially add display-aware tray management |

### Risks

- Removing `LSUIElement=true` will show app in dock (changes UX)
- Notch issue may have no programmatic fix — could be macOS limitation
- Need physical testing on MacBook with notch

---

## Plan 3: 15-Day Free Trial + License Key

### Current State

| Component | Status | Detail |
|-----------|--------|--------|
| Trial logic | None | No expiration code exists |
| License validation | None | No license key code |
| Settings store | Ready | `store.bin` via `tauri-plugin-store` |
| User model | Ready | Has `id`, `email`, `token`, `api_key`, `cloud_subscribed` |
| Device ID | Ready | Generated on first launch, stored in settings |
| PostHog analytics | Ready | Fully integrated, can track trial events |
| Account settings UI | Ready | Perfect place for trial status display |
| Onboarding flow | Ready | 3 steps, can add trial activation step |

### Architecture

```
                    FIRST LAUNCH
                    ───────────
                         │
                         ▼
              ┌─────────────────────┐
              │  Store trial_start  │
              │  = now() in store   │
              │  trial_days = 15    │
              └──────────┬──────────┘
                         │
                    EVERY LAUNCH
                    ───────────
                         │
                         ▼
              ┌─────────────────────┐
              │  Check: has valid   │
              │  license key?       │
              │                     │
              │  YES → full access  │
              │  NO  → check trial  │
              └──────────┬──────────┘
                         │ NO
                         ▼
              ┌─────────────────────┐
              │  Check: trial       │
              │  expired?           │
              │                     │
              │  days_left =        │
              │  trial_start + 15   │
              │  - now()            │
              │                     │
              │  > 0 → show banner  │
              │       "X days left" │
              │                     │
              │  ≤ 0 → block app   │
              │       show license  │
              │       input screen  │
              └─────────────────────┘


                LICENSE VALIDATION
                ──────────────────

    ┌──────────────┐         ┌──────────────────┐
    │  User enters │         │  Validation      │
    │  license key │────────►│  Server          │
    │              │         │  (LemonSqueezy   │
    │              │◄────────│   or Keygen)     │
    │  Valid?      │         │                  │
    │  Store key   │         │  Returns:        │
    │  + unlock    │         │  valid/invalid   │
    └──────────────┘         │  + expiry date   │
                             └──────────────────┘

    Offline fallback:
    If no internet, allow 3 grace days after trial
    with "connect to validate" warning
```

### Technical Approach

**License Provider: LemonSqueezy (Recommended)**
- Simple API for license key validation
- Handles payments, receipts, tax compliance
- REST API: `POST /v1/licenses/validate` with license key + device ID
- No server infrastructure needed on our side
- Alternative: Keygen.sh (more developer-focused)

**Trial State Storage**
```rust
// Add to store.rs SettingsStore or User
pub struct TrialState {
    pub trial_started_at: Option<String>,     // RFC3339 timestamp
    pub trial_expires_at: Option<String>,     // RFC3339 timestamp
    pub license_key: Option<String>,          // Encrypted
    pub license_valid_until: Option<String>,  // RFC3339 timestamp
    pub license_device_id: Option<String>,    // Bound to this device
    pub grace_days_used: u32,                 // Offline grace counter
}
```

**Anti-Bypass Measures**
- Store `trial_started_at` in both `store.bin` AND a hidden file
- Compare system time with last-known time (detect clock rollback)
- Device ID binding prevents key sharing
- Online validation on each app launch (when internet available)

**Trial UI Locations**
1. **Tray menu** — "Trial: X days left" or "Licensed"
2. **Account settings** — Full trial status + license key input
3. **Blocking screen** — After expiry, overlay that blocks the app

### File Changes

| File | Change |
|------|--------|
| `src-tauri/src/store.rs` | Add `TrialState` struct to settings |
| `src-tauri/src/trial.rs` | **NEW** — Trial check logic, license validation API calls |
| `src-tauri/src/main.rs` | Add trial check on startup, register new commands |
| `lib/hooks/use-settings.tsx` | Add trial state to frontend settings |
| `lib/utils/tauri.ts` | Add trial-related command bindings and types |
| `components/settings/account-section.tsx` | Add trial status display + license key input |
| `components/trial-expired.tsx` | **NEW** — Full-screen blocking overlay |
| `src-tauri/src/tray.rs` | Add trial status to tray menu |
| `app/onboarding/page.tsx` | Optionally show trial info during onboarding |

### Decisions Needed Before Implementation

1. **License provider**: LemonSqueezy vs Keygen vs custom?
2. **Pricing**: One-time purchase or subscription?
3. **Price point**: $X one-time or $X/month?
4. **Grace period**: How many days offline after trial expires?
5. **What gets blocked**: Entire app or just recording?
6. **Existing users**: How to handle users who installed before trial was added?

### Risks

- Clock manipulation bypass — mitigation: track monotonic time + online checks
- Offline users can't validate — mitigation: grace period
- License provider downtime — mitigation: cache validation result locally
- `store.bin` deletion resets trial — mitigation: secondary hidden file

---

## Plan 4: Update README.md for Thadm

### Current State

The README.md is the original screenpipe README — extensive documentation about
screenpipe cloud, pipes, plugins, and features that don't apply to Thadm.

### Technical Approach

Replace entirely with a focused Thadm README:

```
README.md Structure:
─────────────────
1. Header (name + one-line description + badges)
2. What is Thadm? (2-3 sentences from SPEC.md)
3. Who is it for? (ADHD, researchers, students)
4. Features (bullet list of current features)
5. Installation (download DMG from GitHub Releases)
6. Build from Source (./build.sh commands)
7. Privacy (100% local, no cloud)
8. Tech Stack (Tauri, Rust, Next.js, SQLite)
9. Attribution (screenpipe MIT license)
10. License
```

### File Changes

| File | Change |
|------|--------|
| `README.md` | Replace entirely with Thadm content |

### Dependencies

- Issue 1 (GitHub Releases) should be done first — installation section
  needs a download link
- Screenshots of current UI would be nice but not blocking

### Content Source

- Pull from `SPEC.md` sections 1-4 for What/Why/Who
- Pull from `CLAUDE.md` for build instructions
- Keep MIT license attribution to screenpipe as required

---

## Execution Order

```
Plan 1: GitHub Releases + Auto-Update     ← DO FIRST (unblocks distribution)
  │
  ▼
Plan 4: Update README.md                  ← DO SECOND (needs download link from Plan 1)
  │
  ▼
Plan 2: Menu Bar Icon Investigation       ← DO THIRD (debug + fix)
  │
  ▼
Plan 3: 15-Day Trial + License Key        ← DO LAST (largest scope, needs decisions)
```

Plan 2 and Plan 3 can be parallelized if needed, but Plan 1 → Plan 4 is sequential.
