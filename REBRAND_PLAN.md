# Thadm Rebrand Plan — Minimal Changes from Screenpipe

## Principle
- Only change what the END USER sees (app name, icons, menu text, window titles, data folders, notifications)
- Internal code (crate names, variable names, file paths) stays as screenpipe
- Cloud/login features: comment out, don't delete

---

## PART 1: User-Facing Brand Text Changes

### 1.1 Tauri Config Files (HIGH PRIORITY)

| File | What to Change |
|------|---------------|
| `src-tauri/tauri.conf.json` | `productName` → "thadm - Development", `identifier` → thadm ID, deep-link scheme → "thadm", `$HOME/.screenpipe` → `$HOME/.thadm` |
| `src-tauri/tauri.prod.conf.json` | `productName` → "thadm", `identifier` → thadm ID, deep-link scheme → "thadm", `$HOME/.screenpipe` → `$HOME/.thadm` |
| `src-tauri/tauri.beta.conf.json` | `productName` → "thadm beta", `identifier` → thadm beta ID, deep-link → "thadm-beta" |
| `src-tauri/tauri.enterprise.conf.json` | `productName` → "thadm", identifier + deep-link + data dir |

### 1.2 macOS Menu Bar & Tray (HIGH PRIORITY)

| File | Line | Change |
|------|------|--------|
| `src-tauri/src/main.rs` | 962 | `SubmenuBuilder::new(app, "screenpipe")` → `"thadm"` |
| `src-tauri/src/main.rs` | 963 | `"About screenpipe"` → `"About thadm"` |
| `src-tauri/src/main.rs` | 976 | `"Quit screenpipe"` → `"Quit thadm"` |
| `src-tauri/src/tray.rs` | 272 | `"Quit screenpipe"` → `"Quit thadm"` |
| `src-tauri/src/tray.rs` | 410 | `"screenpipe v{}"` → `"thadm v{}"` |
| `src-tauri/src/tray.rs` | 808-811 | tooltip: `"screenpipe"` → `"thadm"` |

### 1.3 Update/Notification Messages (HIGH PRIORITY)

| File | Lines | Change |
|------|-------|--------|
| `src-tauri/src/updates.rs` | 261, 369, 413, 423, 472, 487, 554, 688, 700, 709 | All "screenpipe" → "thadm" in user-visible notification text |

### 1.4 macOS Info.plist Permission Prompts (HIGH PRIORITY)

| File | Lines | Change |
|------|-------|--------|
| `src-tauri/Info.plist` | 14, 16, 18 | "screenpipe saves..." → "thadm saves...", "screenpipe reads..." → "thadm reads..." |

### 1.5 UI Components — User-Visible Text (MEDIUM PRIORITY)

| File | What to Change |
|------|---------------|
| `app/home/page.tsx` | Lines 335-336, 353, 468, 598, 961, 969: sidebar header, alt text, referral text |
| `app/overlay/page.tsx` | Lines 300, 312, 321, 328, 380, 400, 414, 436: server status messages |
| `app/notification-panel/page.tsx` | Line 419: panel header; lines 131-133: deep-link scheme |
| `app/error.tsx` | Line 23: alt text |
| `components/notification-handler.tsx` | Lines 37-38: welcome toast |
| `components/settings/connections-section.tsx` | Lines 563, 594, 641, 645, 702, 715: tool name mentions |
| `components/settings/browser-url-card.tsx` | Lines 83, 155: permission instructions |
| `components/settings/disk-usage-section.tsx` | Lines 49, 194: data path text |
| `components/settings/shortcut-section.tsx` | Line 19: shortcut label |
| `components/settings/voice-memos-card.tsx` | Line 56: permission instruction |
| `components/settings/calendar-card.tsx` | Line 242: instruction text |
| `components/settings/openclaw-card.tsx` | Line 276: sync description |
| `components/settings/notifications-settings.tsx` | Line 43: description |
| `components/settings/usage-section.tsx` | Line 81: app name |

### 1.6 Data Directory Path (HIGH PRIORITY)

The user-visible data folder `~/.screenpipe` needs to become `~/.thadm`. Key locations:
- All tauri.*.conf.json fs:scope entries
- Rust code that constructs the path (search for `.screenpipe` in crates/)
- UI text that references `~/.screenpipe`

**Note:** This is the riskiest change — many internal paths depend on this. Map all references before changing.

---

## PART 2: Icon/Asset Replacement

Copy from `thadm_old` → current `thadm`:

### 2.1 App Icons (src-tauri/icons/) — 52 files
- Main: icon.icns, icon.ico, 32x32→1024x1024 PNGs
- Beta: same set in icons/beta/
- Windows Store: Square*.png, StoreLogo.png
- iOS: all AppIcon variants in icons/ios/
- Android: all mipmap densities in icons/android/
- Recording state: icons/app/start_recording.png, stop_recording.png, recording.png

### 2.2 Tray Icons (src-tauri/assets/) — 14 files
- PNG: screenpipe-logo-tray-{black,white,beta-black,beta-white,updates-black,updates-white,black-failed,white-failed}.png
- SVG: same variants in assets/svg/

### 2.3 Public Assets (public/) — 5 files
- screenpipe.svg, screenpipe.png, images/screenpipe.png, pipe-store-preview.png, 128x128.png

### 2.4 Installer Assets — 3 files
- nsis-header.bmp, nsis-sidebar.bmp, dmg-background.png

---

## PART 3: Disable Cloud/Login Features (Comment Out)

### 3.1 Analytics/Telemetry (HIGH PRIORITY — do first)

| File | Action |
|------|--------|
| `app/providers.tsx` (line 88) | Comment out `posthog.init(...)` call |
| `src-tauri/src/analytics.rs` (lines 125-275) | Comment out `send_event()` and `start_periodic_event()` bodies |
| `components/settings/privacy-section.tsx` (line 178) | Comment out `Sentry.init()` |
| `components/settings/recording-settings.tsx` (line 820) | Comment out `Sentry.init()` |

### 3.2 Subscription/Upgrade UI (HIGH PRIORITY)

| File | Action |
|------|--------|
| `components/upgrade-dialog.tsx` | Add `return null;` at top of component |
| `components/settings/account-section.tsx` (lines 87-158) | Comment out `handleCheckout` and subscription polling |
| `components/settings/ai-presets.tsx` (line 958) | Comment out cloud model fetching; remove "screenpipe-cloud" provider |
| `components/settings/referral-card.tsx` | Add `return null;` at top of component |

### 3.3 Login/Auth (HIGH PRIORITY)

| File | Action |
|------|--------|
| `components/login-dialog.tsx` | Add `return null;` at top |
| `components/onboarding/login-gate.tsx` | Skip the login gate (auto-pass) |
| `lib/hooks/use-enterprise-policy.ts` (line 73) | Comment out `fetchPolicy()` API call |

### 3.4 Cloud Sync (MEDIUM PRIORITY)

| File | Action |
|------|--------|
| `components/settings/sync-settings.tsx` | Comment out all `screenpi.pe` API calls |
| `components/settings/archive-settings.tsx` (line 193) | Comment out checkout URL |
| Cloud sync service in Rust | Set `enabled: false` in default config |

### 3.5 Auto-Update Endpoints (MEDIUM PRIORITY)

| File | Action |
|------|--------|
| `components/updater.tsx` (lines 10-17) | Comment out UPDATE_ENDPOINTS or point to your own server |
| `components/update-banner.tsx` (line 105) | Comment out screenpipe update URL |

### 3.6 External URLs (LOW PRIORITY)

| File | Action |
|------|--------|
| `components/settings/intercom-chat.tsx` | Comment out API_URL |
| All `openUrl("https://screenpi.pe/...")` calls | Comment out or replace with thadm URLs |

---

## Implementation Order

1. **Icons first** — copy assets from thadm_old (zero risk, instant visual result)
2. **Tauri configs** — product name, identifier, deep-link scheme
3. **Disable cloud/analytics** — comment out PostHog, Sentry, login, upgrade
4. **Text branding** — tray menu, main.rs, updates.rs, Info.plist
5. **UI component text** — React components with user-visible "screenpipe"
6. **Data directory** — `.screenpipe` → `.thadm` (do last, most risky)

---

## Daily Sync Impact

After running `./sync-upstream.sh`, these files may conflict:
- **Likely conflicts**: tauri.conf.json, home/page.tsx, tray.rs (high-churn files you also modified)
- **Unlikely conflicts**: icon files, Info.plist (rarely change upstream)
- **Strategy**: Keep changes minimal and isolated so conflicts are easy to resolve
