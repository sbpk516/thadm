# Spec: Menu Bar Icon Missing on Built-in Display

> **Type**: Bug investigation + fix
> **Priority**: P1
> **Status**: Not started
> **Related**: TODO.md Issue 2, PLAN.md Plan 2

---

## 1. Problem Statement

The Thadm menu bar (tray) icon is **not visible** on the MacBook's built-in
display when no external monitor is connected. The icon becomes visible on both
displays only when an external monitor is connected.

---

## 2. Precise Problem Definition

### 2.1 What We Know (Observed Facts)

| # | Fact | Source |
|---|------|--------|
| F1 | Icon does NOT appear on MacBook built-in display when used alone | User report |
| F2 | Icon DOES appear on both displays when external monitor is connected | User report |
| F3 | The app IS running — recording works, sidecar is alive | Process is active, recording works |
| F4 | The user has **14+ menu bar icons** on the built-in display | User report |
| F5 | MacBook has a notch (2021+ MacBook Pro or 2022+ MacBook Air) | Likely — to be confirmed |

### 2.2 What We Don't Know (Open Questions)

| # | Question | Why It Matters |
|---|----------|---------------|
| Q1 | Is the NSStatusItem (tray item) created but hidden, or never created? | Determines if this is a rendering issue vs a code issue |
| Q2 | Does the icon appear if the user removes other menu bar items? | Confirms or eliminates the notch crowding theory |
| Q3 | Does the icon appear briefly on startup then disappear, or never at all? | Points to either a race condition or a persistent layout issue |
| Q4 | Which MacBook model exactly (Pro with notch, Air with notch, or no notch)? | Notch models have significantly less menu bar space |
| Q5 | Does the icon reappear when an external monitor is hot-plugged (without restarting)? | Tells us if macOS re-lays out NSStatusBar items on display change |
| Q6 | Is this a dev build or prod build? | Dev builds have different bundle identity, may affect NSStatusBar |

### 2.3 The Core Ambiguity

There are two fundamentally different problems this could be:

**Problem A: Tray icon exists but is occluded (menu bar overflow)**
- macOS creates the NSStatusItem, assigns it space in the menu bar
- But 14+ other icons + the notch leave zero space on the right side
- macOS silently hides overflow items — no scroll, no indicator
- External monitor has no notch and is wider → all items fit

**Problem B: Tray icon fails to render due to a code bug**
- ActivationPolicy conflict (`LSUIElement=true` vs `Regular` in code)
- Icon `unwrap()` panic in health check kills the update task
- Race condition during startup leaves tray in broken state
- External monitor triggers a display change event that re-initializes the tray

These require **completely different fixes**. Problem A may have no programmatic
fix. Problem B is a code bug we can solve.

### 2.4 Reproduction Steps (To Be Verified)

```
1. Disconnect all external monitors
2. Ensure 14+ menu bar icons are present (default macOS + third-party)
3. Launch Thadm (either from /Applications or via ./build.sh dev)
4. Look at the right side of the menu bar — Thadm icon should be there
5. Expected: icon visible
6. Actual: icon NOT visible
7. Connect an external monitor
8. Check both menu bars
9. Observed: icon now visible on BOTH displays
```

---

## 3. Why This Matters

Thadm is a menu bar app (`LSUIElement=true`, no dock icon). The tray icon is the
**only way** users can access the app — open settings, start/stop recording,
check status, or quit. If the icon is invisible, the app is completely
inaccessible. Users would have to force-quit via Activity Monitor.

For the target audience (ADHD users), this is especially frustrating — they may
not realize the app is running, may reinstall, or may give up entirely.

### Impact Severity

| Scenario | Impact |
|----------|--------|
| User has few menu bar icons | No impact — icon visible |
| User has many menu bar icons + notch MacBook | **App completely inaccessible** |
| User has many icons + no notch MacBook | Possibly affected (less menu bar space than external monitors) |
| User always uses external monitor | No impact |

---

## 4. Current Implementation

### 4.1 Tray Icon Configuration

**File**: `screenpipe-app-tauri/src-tauri/tauri.conf.json` (lines 104-109)

```json
"trayIcon": {
    "id": "thadm_main",
    "iconPath": "assets/thadm-tray-white.png",
    "iconAsTemplate": true,
    "menuOnLeftClick": true
}
```

### 4.2 Icon Files

All tray icons are 44x44 pixels, ~973 bytes each:

| File | Purpose |
|------|---------|
| `assets/thadm-tray-white.png` | Default (dark mode) |
| `assets/thadm-tray-black.png` | Light mode |
| `assets/thadm-tray-white-failed.png` | Error state (dark mode) |
| `assets/thadm-tray-black-failed.png` | Error state (light mode) |
| `assets/thadm-tray-updates-white.png` | Update available (dark mode) |
| `assets/thadm-tray-updates-black.png` | Update available (light mode) |

**No @2x variants exist.** All icons are 44x44 (which IS @2x of the expected
22x22 point size, but macOS may not interpret them correctly without the `@2x`
filename suffix).

### 4.3 Dynamic Icon Updates

**File**: `screenpipe-app-tauri/src-tauri/src/health.rs` (lines 56-117)

Every 1 second, the health check:
1. Detects system theme via `dark_light::detect()`
2. Checks sidecar health via `http://localhost:3030/health`
3. If status OR theme changed, calls `main_tray.set_icon()` with new icon
4. Calls `main_tray.set_icon_as_template(true)` after every icon swap

### 4.4 Activation Policy

**File**: `screenpipe-app-tauri/src-tauri/Info.plist` (line 14-15)
```xml
<key>LSUIElement</key>
<true/>
```

**File**: `screenpipe-app-tauri/src-tauri/src/main.rs` (line 1180)
```rust
app.set_activation_policy(tauri::ActivationPolicy::Regular);
```

**Conflict**: `LSUIElement=true` tells macOS "this is a background app" (Accessory),
but `main.rs:1180` immediately overrides to `Regular` (foreground app with dock icon,
though LSUIElement suppresses the dock icon).

Additionally, `window_api.rs` switches the activation policy **12 times** across
different window show/hide events:
- Lines 54, 302, 412, 463, 718 → `Accessory`
- Lines 393, 672, 803 → `Regular`
- `commands.rs:257` → `Regular`, `commands.rs:450` → `Accessory`

This creates a rapid, unpredictable switching pattern.

### 4.5 Tray Setup

**File**: `screenpipe-app-tauri/src-tauri/src/tray.rs` (lines 47-60)

```rust
pub fn setup_tray(app: &AppHandle, update_item: ...) -> Result<()> {
    if let Some(main_tray) = app.tray_by_id("thadm_main") {
        let menu = create_dynamic_menu(app, &MenuState::default(), update_item)?;
        main_tray.set_menu(Some(menu))?;
        setup_tray_click_handlers(&main_tray)?;
        setup_tray_menu_updater(app.clone(), update_item);
    }
    Ok(())
}
```

No display-aware logic. No error handling if tray creation fails. Relies on Tauri
having already created the tray from `tauri.conf.json`.

---

## 5. Confirmed Root Cause

### Diagnosis: macOS Notch Menu Bar Overflow (Hypothesis A)

**Status**: CONFIRMED on 2026-02-21

**Evidence**:

| Test | Result |
|------|--------|
| Device | MacBook Pro M4 Pro (Mac16,7), Liquid Retina XDR 3456x2234, **has notch** |
| Menu bar screenshot | 16+ status icons packed into the right-of-notch area |
| Test: remove 5-6 icons | **Thadm icon appeared immediately** |
| Test: connect external monitor | Icon visible on both displays |

**Root Cause**: macOS allocates NSStatusItem slots from right to left in the menu
bar. On notched MacBooks, the usable space to the right of the notch is ~800pt.
With 14+ third-party menu bar icons, the lowest-priority items (most recently
registered NSStatusItems) are pushed behind the notch where they are invisible.
macOS provides **no overflow indicator, no scroll, and no API** to control item
priority or detect overflow.

When an external monitor is connected, macOS uses the full-width menu bar on the
external display (no notch), providing enough space for all items.

**This is NOT a code bug in Thadm.** It is a macOS platform limitation that
affects all menu bar apps equally.

### Ancillary Issues Found During Investigation

These are not the root cause but should be fixed for robustness:

| Issue | Severity | Detail |
|-------|----------|--------|
| All 6 tray icon PNGs are byte-identical | Low | Theme/status icon switching in `health.rs` is a no-op |
| `unwrap()` in `health.rs:109` | Medium | Panic kills health check task silently if icon path fails |
| ActivationPolicy switches 12+ times | Low | Not causing this bug, but unnecessary churn |
| Icons are 44x44 @72DPI without `@2x` suffix | Low | macOS may misinterpret point size |

---

## 6. Fix Options

Since this is a macOS limitation (no API to control NSStatusItem priority or
detect overflow), there is no direct programmatic fix. The options below are
**mitigations** ranked by impact.

### Fix A: Global Keyboard Shortcut as Fallback Access (Recommended)

**Impact**: High — makes the app accessible even when icon is hidden

A keyboard shortcut (e.g., `Ctrl+Cmd+S`) already exists to show the main window.
But users may not know about it. Mitigations:
1. Show the shortcut in onboarding
2. Add a "Can't find the icon?" help tooltip during onboarding
3. Register a second shortcut specifically for opening settings
4. Ensure shortcuts work even when the tray icon is hidden

**Effort**: Low (shortcuts already exist, just needs UX visibility)

### Fix B: Document the Limitation

**Impact**: Medium — prevents user confusion

Add a note to:
- Onboarding flow: "If you have many menu bar icons, Thadm may be hidden behind
  the notch. Use [shortcut] to open, or remove some menu bar apps."
- Settings > General: "Menu bar icon not visible? Your menu bar may be full."
- README: Known limitation section

**Effort**: Low

### Fix C: Reduce Icon Width

**Impact**: Low — saves a few pixels but won't fix overflow with 14+ icons

macOS menu bar items have a minimum width. The icon itself is 22pt (44px @2x),
which is already the standard size. Reducing further would make it hard to see.

**Effort**: Low but marginal benefit

### Fix D: Fix Ancillary Issues

**Impact**: Robustness improvement, does not fix the visibility problem

1. **Create distinct icon variants** — separate white/black/failed PNGs
   instead of 6 identical files
2. **Replace `unwrap()` in `health.rs:109`** with error handling
3. **Audit ActivationPolicy** — reduce 12 call sites to a consistent pattern

**Effort**: Medium

---

## 7. Files Involved

| File | Lines | What to Check/Change |
|------|-------|---------------------|
| `src-tauri/src/health.rs` | 109 | Replace `unwrap()` with error handling |
| `src-tauri/src/tray.rs` | 47-60 | No change needed (tray setup is correct) |
| `src-tauri/assets/thadm-tray-*.png` | — | Create distinct icon variants |
| `app/onboarding/page.tsx` | — | Add "can't see icon?" note with shortcut |
| `components/settings/general-settings.tsx` | — | Add "icon not visible?" help text |

---

## 8. Success Criteria

- [x] Root cause identified and confirmed via testing
- [ ] Users can access Thadm even when icon is hidden (via keyboard shortcut)
- [ ] Onboarding mentions the shortcut and the notch limitation
- [ ] `unwrap()` panic risk in `health.rs` is fixed
- [ ] Icon variants are distinct (not 6 identical files)

---

## 9. Decision Log

### Decision 1: Do NOT add a dock icon as fallback (2026-02-21)

**Considered**: Remove `LSUIElement=true` so the app always shows a dock icon,
giving users a fallback when the menu bar icon is hidden.

**Rejected because**:
- Contradicts Thadm's core design as an invisible, always-on background utility
- A dock icon adds visual clutter — counterproductive for ADHD users
- Solves the wrong problem: the menu bar icon IS the right UX; the issue is the
  user's menu bar being unusually full (14+ icons), which affects a small percentage
  of users
- Would require reworking the 12 ActivationPolicy switches throughout the codebase

**Instead**: Accept the macOS limitation. Document it in onboarding and README.
The existing `Cmd+Ctrl+S` shortcut provides fallback access.

---

## 10. Risks

- **No complete fix exists** — macOS does not provide an API to prioritize
  NSStatusItems or detect overflow
- Users who don't read onboarding may still be confused
- Keyboard shortcut may conflict with other apps
- Reducing menu bar icons is a user-side workaround, not something we control
