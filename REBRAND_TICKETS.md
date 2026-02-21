# Phase 1: Full Rebrand — Implementation Tickets

> Work through these tickets sequentially. Each ticket is self-contained.
> Mark as complete: `- [x]` when done.

---

## Overview

**Goal**: Transform Screenpipe into Thadm — a clean rebrand with new identity.

**Approach**: Minimal changes, maximum impact. Don't refactor unrelated code.

**Estimated Tickets**: 12 tickets across 4 categories

---

## Category A: App Identity (Core Config)

### Ticket A1: Update Tauri Configuration
**Priority**: P0 (Must do first)
**Files**: 1
**Depends on**: None

**Description**:
Change the app name, bundle identifier, and descriptions in Tauri config.

**File to modify**:
- `screenpipe-app-tauri/src-tauri/tauri.conf.json`

**Changes**:
```json
{
  "productName": "Thadm",
  "identifier": "com.thadm.desktop",
  "bundle": {
    "shortDescription": "Your ADHD-friendly memory assistant",
    "longDescription": "Automatic, searchable memory for your desktop. Built for ADHD minds. 100% local."
  }
}
```

**Verification**:
- [ ] Run `bun tauri dev` — window title shows "Thadm"
- [ ] Build produces `Thadm.app`

---

### Ticket A2: Update Package.json
**Priority**: P0
**Files**: 1
**Depends on**: A1

**Description**:
Update the npm package name.

**File to modify**:
- `screenpipe-app-tauri/package.json`

**Changes**:
```json
{
  "name": "thadm"
}
```

**Verification**:
- [ ] `bun install` works without errors

---

### Ticket A3: Update Deep Link Scheme
**Priority**: P1
**Files**: 1
**Depends on**: A1

**Description**:
Change URL scheme from `screenpipe://` to `thadm://`

**File to modify**:
- `screenpipe-app-tauri/src-tauri/tauri.conf.json`

**Changes**:
```json
{
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["thadm"]
      }
    }
  }
}
```

**Verification**:
- [ ] Deep links work with `thadm://` scheme

---

### Ticket A4: Update Tray Icon ID
**Priority**: P1
**Files**: 1
**Depends on**: A1

**Description**:
Rename the tray icon identifier.

**File to modify**:
- `screenpipe-app-tauri/src-tauri/tauri.conf.json`

**Changes**:
```json
{
  "app": {
    "trayIcon": {
      "id": "thadm_main"
    }
  }
}
```

**Verification**:
- [ ] Menu bar icon appears correctly

---

## Category B: Visual Identity (Icons & Assets)

### Ticket B1: Create New App Icons
**Priority**: P0
**Files**: ~10 icon files
**Depends on**: A1

**Description**:
Replace screenpipe icons with Thadm icons.

**Files to replace** (in `screenpipe-app-tauri/src-tauri/icons/`):
- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `256x256.png`
- `512x512.png`
- `1024x1024.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)

**Design requirements**:
- Simple, memorable icon
- Works at small sizes (16x16 in menu bar)
- Works in light and dark mode
- Consider ADHD-friendly aesthetic (calming, not overwhelming)

**Verification**:
- [ ] App icon shows in Dock/Taskbar
- [ ] Icon shows in app switcher
- [ ] Icon looks good at all sizes

---

### Ticket B2: Create New Tray Icons
**Priority**: P1
**Files**: 3
**Depends on**: B1

**Description**:
Replace tray icons (menu bar on macOS).

**Files to replace**:
- `screenpipe-app-tauri/src-tauri/assets/screenpipe-logo-tray-white.png` → `thadm-tray-white.png`
- `screenpipe-app-tauri/src-tauri/icons/screenpipe-logo-tray-failed.png` → `thadm-tray-failed.png`
- `screenpipe-app-tauri/src-tauri/icons/screenpipe-logo-tray-black.png` → `thadm-tray-black.png`

**Also update reference in**:
- `tauri.conf.json` → `trayIcon.iconPath`

**Verification**:
- [ ] Menu bar shows correct icon
- [ ] Error state shows failed icon

---

### Ticket B3: Update Favicon and Web Assets
**Priority**: P2
**Files**: 2-3
**Depends on**: B1

**Description**:
Update favicon and any web-related assets.

**Files to replace**:
- `screenpipe-app-tauri/app/favicon.ico`
- `screenpipe-app-tauri/public/` (any logo files)

**Verification**:
- [ ] Browser tab shows correct favicon
- [ ] No screenpipe logos visible in UI

---

## Category C: Color & Typography

### Ticket C1: Define Thadm Color Palette
**Priority**: P1
**Files**: 1
**Depends on**: None

**Description**:
Update CSS color variables to Thadm brand colors.

**File to modify**:
- `screenpipe-app-tauri/app/globals.css`

**Research first**:
- Look at current color definitions in `:root` and `.dark`
- Decide on new brand colors (primary, accent, etc.)
- Consider ADHD-friendly colors (calming blues/greens, avoid overstimulation)

**Example changes**:
```css
:root {
  --primary: 220 70% 50%;        /* Thadm blue */
  --primary-foreground: 0 0% 100%;
  /* ... other colors */
}
```

**Verification**:
- [ ] App uses new colors
- [ ] Dark mode looks correct
- [ ] Buttons, links use primary color

---

### Ticket C2: Update Typography (Optional)
**Priority**: P3
**Files**: 1-2
**Depends on**: C1

**Description**:
Optionally change fonts for Thadm brand.

**Files to modify**:
- `screenpipe-app-tauri/app/globals.css`
- `screenpipe-app-tauri/tailwind.config.ts`

**Note**: Current design uses monospace fonts (JetBrains Mono / SF Mono).
Decide if this fits Thadm brand or if a different font is better.

**Verification**:
- [ ] Fonts render correctly
- [ ] Readable at all sizes

---

## Category D: UI Text & Branding

### Ticket D1: Replace "screenpipe" Text in UI
**Priority**: P0
**Files**: ~15-20 (search and replace)
**Depends on**: A1

**Description**:
Find and replace all instances of "screenpipe" in the frontend code.

**Search command**:
```bash
grep -r "screenpipe" screenpipe-app-tauri/components/ --include="*.tsx"
grep -r "screenpipe" screenpipe-app-tauri/app/ --include="*.tsx"
grep -r "Screenpipe" screenpipe-app-tauri/ --include="*.tsx"
```

**Common replacements**:
- "screenpipe" → "thadm" (lowercase)
- "Screenpipe" → "Thadm" (capitalized)
- "screenpi.pe" → (remove or replace with thadm domain if exists)
- "screenpipe is now capturing" → "thadm is now capturing"

**DO NOT change**:
- Import paths (those are folder names, change separately if needed)
- External URLs that still reference screenpipe (API endpoints)
- Variable names in code (unnecessary refactor)

**Verification**:
- [ ] No "screenpipe" visible in UI text
- [ ] Onboarding shows "Thadm"
- [ ] Settings shows "Thadm"
- [ ] Error messages say "Thadm"

---

### Ticket D2: Update Onboarding Content
**Priority**: P1
**Files**: 3-4
**Depends on**: D1

**Description**:
Update onboarding slides with Thadm branding and ADHD-focused messaging.

**Files to modify**:
- `screenpipe-app-tauri/components/onboarding/welcome.tsx`
- `screenpipe-app-tauri/components/onboarding/status.tsx`
- `screenpipe-app-tauri/components/onboarding/usecases-selection.tsx`

**Content updates**:
- Welcome message: Focus on ADHD benefits
- Permission explanations: Clear, friendly, non-technical
- Success messages: Encouraging, supportive tone

**Example**:
```
Before: "screenpipe needs these permissions to work"
After:  "thadm needs permission to help remember things for you"
```

**Verification**:
- [ ] Onboarding feels welcoming
- [ ] Language is ADHD-friendly
- [ ] No screenpipe branding visible

---

### Ticket D3: Update Settings and About Pages
**Priority**: P1
**Files**: 2-3
**Depends on**: D1

**Description**:
Update settings UI with Thadm branding.

**Files to check**:
- `screenpipe-app-tauri/app/settings/page.tsx`
- `screenpipe-app-tauri/components/settings/` (all files)

**Changes**:
- App name in headers
- Any "About" section
- Version display format
- Help/support links

**Verification**:
- [ ] Settings shows "Thadm"
- [ ] No screenpipe references
- [ ] Links point to correct resources

---

### Ticket D4: Update Error Messages and Toasts
**Priority**: P2
**Files**: Multiple (search-based)
**Depends on**: D1

**Description**:
Update error messages to say "Thadm" instead of "screenpipe".

**Search for**:
```bash
grep -r "screenpipe" screenpipe-app-tauri/ --include="*.ts" --include="*.tsx" | grep -i "error\|fail\|toast"
```

**Verification**:
- [ ] Error toasts say "Thadm"
- [ ] Console errors reference "Thadm"

---

### Ticket D5: Remove External Screenpipe Links
**Priority**: P2
**Files**: Multiple
**Depends on**: D1

**Description**:
Remove or update links to screenpipe.com, cal.com/screenpipe, etc.

**Search for**:
```bash
grep -r "screenpi.pe" screenpipe-app-tauri/
grep -r "screenpipe.com" screenpipe-app-tauri/
grep -r "cal.com" screenpipe-app-tauri/
```

**Decision needed**:
- What should happen to "book a call" links?
- What about API endpoints (api.screenpi.pe)?

**Note**: API endpoints may need to stay as-is if backend still uses screenpipe cloud.

**Verification**:
- [ ] No user-facing screenpipe.com links
- [ ] Help resources point to correct place

---

## Category E: Rust Backend References

### Ticket E1: Update Rust Logging/Comments
**Priority**: P3
**Files**: 2-3
**Depends on**: D1

**Description**:
Update Rust code references to screenpipe in logs and comments.

**Files to check**:
- `screenpipe-app-tauri/src-tauri/src/main.rs`
- `screenpipe-app-tauri/src-tauri/src/commands.rs`
- `screenpipe-app-tauri/src-tauri/src/sidecar.rs`

**Note**: Don't rename the sidecar binary yet — that's a bigger change.
Just update user-visible strings and log messages.

**Verification**:
- [ ] Log messages say "thadm" where appropriate
- [ ] No user-visible "screenpipe" in Rust code output

---

## Ticket Execution Order

```
Phase 1A: Core Identity (DO FIRST)
├── A1: Tauri Config ✓
├── A2: Package.json ✓
├── A3: Deep Link ✓
└── A4: Tray ID ✓

Phase 1B: Visual Identity (AFTER 1A)
├── B1: App Icons ✓
├── B2: Tray Icons ✓
└── B3: Favicon ✓

Phase 1C: Colors (PARALLEL with 1B)
├── C1: Color Palette ✓
└── C2: Typography (optional) ✓

Phase 1D: Text Content (AFTER 1A)
├── D1: Replace "screenpipe" text ✓
├── D2: Onboarding content ✓
├── D3: Settings pages ✓
├── D4: Error messages ✓
└── D5: External links ✓

Phase 1E: Cleanup (LAST)
└── E1: Rust references ✓
```

---

## Verification Checklist (After All Tickets)

### Visual
- [ ] App icon is Thadm (Dock, Taskbar, Switcher)
- [ ] Menu bar icon is Thadm
- [ ] Favicon is Thadm
- [ ] Colors match Thadm brand

### Text
- [ ] Window title says "Thadm"
- [ ] Onboarding says "Thadm"
- [ ] Settings says "Thadm"
- [ ] Error messages say "Thadm"
- [ ] No visible "screenpipe" anywhere in UI

### Technical
- [ ] Build produces `Thadm.app` / `Thadm.dmg`
- [ ] Deep links work with `thadm://`
- [ ] All tests pass
- [ ] No console errors

### User Experience
- [ ] Fresh install works correctly
- [ ] Permissions flow works
- [ ] App feels cohesive with new brand

---

## Notes

### What NOT to change (yet)
- Folder names (`screenpipe-app-tauri/`, `screenpipe-server/`)
- Import paths in code
- Sidecar binary name
- Database paths
- API endpoint URLs (if using screenpipe cloud)

These can be changed later if needed, but are higher risk.

### Attribution
Keep attribution to screenpipe in code comments and LICENSE as required by MIT license.
