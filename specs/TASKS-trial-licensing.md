# Implementation Tasks: Trial + Licensing

**Methodology**: Spec Driven Development (SDD)
**Prereqs**: SPEC-trial-licensing.md (what), ARCH-trial-licensing.md (how)
**This doc**: Implementable task checklist (do)

Each task is scoped so an LLM agent can execute it with focused context.
Tasks are ordered — each builds on the previous.

---

## Phase 0: Prerequisites (must be done first)

### Task 0.1: Fix stale SettingsStore in Rust (BLOCKER)

**Goal**: Ensure `spawn_sidecar()` and `create_dynamic_menu()` read LIVE
store.bin values, not the frozen `app.state::<SettingsStore>()` clone.

**Why this is a blocker**: `app.state::<SettingsStore>()` is cloned once
at startup (`main.rs:997`) and never re-read. When the frontend writes
`license_key` to store.bin via `@tauri-apps/plugin-store`, Rust still
sees the OLD values. Without this fix, license activation would NOT
unlock the sidecar — it would keep spawning in read-only mode.

**Context files to read**:
- `src-tauri/src/sidecar.rs` (~line 357 where store is read)
- `src-tauri/src/tray.rs` (~line 62 where menu is built)
- `src-tauri/src/main.rs` (~line 997 where `init_store()` clones)

**Changes**:
1. In `sidecar.rs`: Where license fields are read, use `tauri_plugin_store::StoreExt`
   to read live store.bin instead of `app.state::<SettingsStore>()`:
   ```rust
   use tauri_plugin_store::StoreExt;
   let store_handle = app.store("store.bin")?;
   let license_key: Option<String> = store_handle.get("license_key")
       .and_then(|v| serde_json::from_value(v).ok());
   // ... same for first_seen_at, license_validated_at
   ```
2. In `tray.rs`: Same pattern for `create_dynamic_menu()` license check.

**Test**: Write a value to store.bin from frontend → immediately read it
from Rust spawn_sidecar → confirm it sees the new value.

**Files modified**: 2 (`sidecar.rs`, `tray.rs`)

---

## Phase 1: Trial Detection (no payment, no LemonSqueezy)

### Task 1.1: Add license fields to Settings type + store migration

**Goal**: Existing installs get new fields without breaking.

**Context files to read**:
- `lib/hooks/use-settings.tsx` (Settings type at ~line 80, defaults at ~line 153, migrations at ~line 262)
- `src-tauri/src/store.rs` (SettingsStore struct at ~line 100)

**Changes**:
1. In `use-settings.tsx`: Add 4 fields to Settings/SettingsStore type:
   ```typescript
   license_key: string | null;
   license_validated_at: string | null;
   license_plan: "annual" | "lifetime" | null;
   first_seen_at: string | null;
   ```
2. In `use-settings.tsx`: Add defaults (all `null`) to `createDefaultSettingsObject()`
3. In `use-settings.tsx`: Add migration in `get()` function:
   - If `first_seen_at` is missing → set to `new Date().toISOString()`
     **NOTE**: This means existing users upgrading get a fresh 15-day
     trial starting from the moment they upgrade — they are NOT
     instantly locked out by their old DB timestamps.
   - If other license fields are `undefined` → set to `null`
4. In `store.rs`: Add 4 corresponding fields to Rust `SettingsStore`:
   ```rust
   pub license_key: Option<String>,
   pub license_validated_at: Option<String>,
   pub license_plan: Option<String>,
   pub first_seen_at: Option<String>,
   ```

**Test**: Launch app → check store.bin has `first_seen_at` set.
Print `settings.first_seen_at` in browser console via React DevTools.

**Files modified**: 2 (`use-settings.tsx`, `store.rs`)

---

### Task 1.2: Create useLicenseStatus hook

**Goal**: Single hook that computes trial/license state from DB + store.

**Context files to read**:
- `lib/actions/get-start-date.ts` (how to query earliest DB timestamp)
- `lib/hooks/use-settings.tsx` (how to access settings)
- `specs/ARCH-trial-licensing.md` Section 8 (hook interface + pseudocode)

**Create new file**: `lib/hooks/use-license-status.ts`

**Interface**:
```typescript
type LicenseStatus = {
  status: "loading" | "trial" | "trial_expiring" | "expired" | "licensed";
  daysRemaining: number | null;
  plan: "annual" | "lifetime" | null;
  isRecordingAllowed: boolean;  // false when expired
  isSearchAllowed: boolean;     // always true
};

export function useLicenseStatus(): LicenseStatus;
```

**Logic** (from ARCH Section 8):
1. If `license_key` exists + `license_validated_at` < 7 days → "licensed"
2. Else query DB via `getStartDate()` for earliest timestamp
3. Use **LATEST** (most recent) of (DB timestamp, `first_seen_at`) as trial start
   — NOT earliest. This prevents existing users from being instantly locked out.
4. Days 1-10 → "trial", days 11-15 → "trial_expiring", day 16+ → "expired"
5. Re-check every 60 seconds (interval)

**Test**: Manually set `first_seen_at` to 12 days ago in store →
hook should return `{ status: "trial_expiring", daysRemaining: 3 }`.

**Files modified**: 1 (new file)

---

### Task 1.3: Add trial banner to main page (day 11-15)

**Goal**: Subtle bottom banner when trial is expiring.

**Context files to read**:
- `app/page.tsx` (current page structure, conditional rendering at ~line 142)
- `lib/hooks/use-license-status.ts` (from Task 1.2)

**Changes in `app/page.tsx`**:
1. Import `useLicenseStatus`
2. Call hook: `const licenseStatus = useLicenseStatus();`
3. Add banner component BELOW the existing content (before closing `</div>`):
   ```tsx
   {licenseStatus.status === "trial_expiring" && (
     <div className="fixed bottom-0 left-0 right-0 bg-primary/10 border-t
                     px-4 py-2 text-center text-sm">
       Trial ends in {licenseStatus.daysRemaining} days ·{" "}
       <button onClick={() => openUrl("https://kalam-plus.com/thadm")}
               className="text-primary hover:underline">
         Buy Thadm
       </button>
     </div>
   )}
   ```

**Test**: Set `first_seen_at` to 12 days ago → banner appears at bottom.
Set to 5 days ago → no banner. Set to 20 days ago → no banner (that's
task 1.4).

**Files modified**: 1 (`page.tsx`)

---

### Task 1.4: Add expired banner to main page (day 16+)

**Goal**: Top banner with license key input when trial expired.
Search (Timeline) still renders below it.

**Context files to read**:
- `app/page.tsx` (current structure, from Task 1.3)
- `specs/ARCH-trial-licensing.md` Section 9 (UI integration)

**Changes in `app/page.tsx`**:
1. Add expired banner ABOVE the Timeline/server-down conditional:
   ```tsx
   {licenseStatus.status === "expired" && (
     <div className="bg-destructive/5 border-b px-6 py-4">
       <div className="max-w-2xl mx-auto space-y-3">
         <div>
           <h3 className="font-medium">Your 15-day trial has ended</h3>
           <p className="text-sm text-muted-foreground">
             Recording is paused. Search still works for your existing data.
           </p>
         </div>
         <div className="flex gap-2">
           <Input placeholder="THADM-XXXX-XXXX-XXXX-XXXX"
                  value={keyInput} onChange={...} />
           <Button onClick={handleActivate}>Activate</Button>
         </div>
         <p className="text-sm">
           <button onClick={() => openUrl("https://kalam-plus.com/thadm")}
                   className="text-primary hover:underline">
             Buy Thadm — Annual $29/yr · Lifetime $49
           </button>
         </p>
       </div>
     </div>
   )}
   ```
2. The `handleActivate` function is a placeholder for now (shows toast
   "License activation coming soon"). Real validation is Phase 2.
3. Timeline still renders below the banner — search works.

**Test**: Set `first_seen_at` to 20 days ago → expired banner appears at
top, Timeline/search still renders below. Enter garbage key → toast.

**Files modified**: 1 (`page.tsx`)

---

### Task 1.5: Gate sidecar spawn in Rust (read-only mode)

**Goal**: When trial expired, spawn sidecar with --disable-audio
--disable-vision so search works but recording stops.

**Context files to read**:
- `src-tauri/src/sidecar.rs` (~line 293-520 for args construction)
- `src-tauri/src/store.rs` (SettingsStore fields)
- `specs/ARCH-trial-licensing.md` Section 10 (Rust-side gate)

**Prereq**: Task 0.1 (live store reading) must be done first.

**Changes in `sidecar.rs`**:
1. After reading settings from live store.bin (Task 0.1), add trial check:
   ```rust
   // license_key, first_seen_at, license_validated_at read from LIVE
   // store.bin via StoreExt (NOT app.state — see Task 0.1)
   let read_only_mode = {
       let is_licensed = license_key.is_some() && {
           license_validated_at.as_ref().map_or(false, |v| {
               chrono::DateTime::parse_from_rfc3339(v)
                   .map(|dt| chrono::Utc::now().signed_duration_since(dt).num_days() < 7)
                   .unwrap_or(false)
           })
       };
       let trial_expired = first_seen_at.as_ref().map_or(false, |v| {
           chrono::DateTime::parse_from_rfc3339(v)
               .map(|dt| chrono::Utc::now().signed_duration_since(dt).num_days() > 15)
               .unwrap_or(false)
       });
       !is_licensed && trial_expired
   };

   if read_only_mode {
       info!("[LICENSE] Trial expired, spawning sidecar in read-only mode");
   }
   ```
2. Modify the disable_audio / disable_vision arg sections:
   ```rust
   if disable_audio || read_only_mode {
       args.push("--disable-audio".to_string());
   }
   // ... and similarly for disable_vision
   if disable_vision || read_only_mode {
       args.push("--disable-vision".to_string());
   }
   ```

**Test**: Set `first_seen_at` to 20 days ago in store.bin → restart app →
sidecar log shows `[LICENSE] Trial expired, spawning sidecar in read-only
mode`. Search works. No new recordings appear.

**Files modified**: 1 (`sidecar.rs`)

---

### Task 1.6: Update tray menu when expired

**Goal**: Replace "Start Recording" with "Trial Expired" in tray.

**Context files to read**:
- `src-tauri/src/tray.rs` (menu construction at ~line 62-172)
- `src-tauri/src/store.rs` (to read license fields)

**Changes in `tray.rs`**:
1. In `create_dynamic_menu()`, read license state from store
2. If `read_only_mode` (same check as Task 1.5):
   - Replace start/stop recording items with a single disabled item:
     "Trial Expired — Buy Thadm"
   - Add click handler for "buy" menu item → opens kalam-plus.com/thadm
3. If not expired, keep existing menu unchanged

**Test**: Set `first_seen_at` to 20 days ago → tray shows "Trial Expired"
instead of "Start Recording". Click it → opens browser to kalam-plus.com.

**Files modified**: 1 (`tray.rs`)

---

## Phase 2: License Activation (wire up LemonSqueezy)

### Task 2.1: Implement LemonSqueezy validate function

**Goal**: Reusable function to validate a license key via API.

**Context files to read**:
- `specs/ARCH-trial-licensing.md` Section 5 (validation flow)
- `specs/SPEC-trial-licensing.md` Section 6 (API endpoints)

**Create new file**: `lib/actions/validate-license.ts`

```typescript
export async function validateLicense(key: string): Promise<{
  valid: boolean;
  status: "active" | "expired" | "not_found";
  plan: "annual" | "lifetime" | null;
  error: string | null;
}>;
```

Implementation:
1. POST to `https://api.lemonsqueezy.com/v1/licenses/validate`
2. Body: `{ license_key: key }`
3. Parse response → return normalized result
4. Handle network errors → return `{ valid: false, error: "network" }`

**Test**: Unit test with mocked fetch. Test with real LemonSqueezy test
key (requires LemonSqueezy account from Phase 3).

**Files modified**: 1 (new file)

---

### Task 2.2: Wire up license activation in page.tsx (with transition spinner)

**Goal**: Replace placeholder handleActivate with real validation.
Include `isActivating` transition state to prevent UI flash during
sidecar restart.

**Context files to read**:
- `app/page.tsx` (expired banner from Task 1.4)
- `lib/actions/validate-license.ts` (from Task 2.1)
- `lib/hooks/use-settings.tsx` (updateSettings)
- `specs/ARCH-trial-licensing.md` Section 14 (activation sequence + UI flash problem)

**Changes in `app/page.tsx`**:
1. Import `validateLicense`
2. Add state: `const [isActivating, setIsActivating] = useState(false);`
3. Implement `handleActivate`:
   - `setIsActivating(true)`
   - Call `validateLicense(keyInput)`
   - If invalid/expired: `setIsActivating(false)` + toast error
   - If valid + active: `updateSettings({ license_key, license_plan, license_validated_at })`
   - Then: `commands.stopScreenpipe()`
   - Then: `await sleep(2000)` (debounce for port close)
   - Then: `commands.spawnScreenpipe(null)` (Rust re-reads live store.bin)
   - Then: poll health check until OK (max 10s)
   - Then: `setIsActivating(false)`
4. Add activation spinner to render:
   ```tsx
   {isActivating && (
     <div className="flex items-center justify-center gap-2 py-8">
       <Loader2 className="h-5 w-5 animate-spin" />
       <span>Activating license...</span>
     </div>
   )}
   ```
5. Wrap expired banner + server-down card in `!isActivating && (...)` so
   neither flashes during the transition.

**Why the spinner**: Without it, stopping the sidecar causes
`isServerDown = true` → "Can't Search Right Now" flashes for 3-5 seconds
before the new sidecar comes up. The spinner covers this gap.

**Test**: With LemonSqueezy test key → enter key → see spinner "Activating
license..." → spinner disappears → status changes to "licensed" → recording
resumes. NO "Can't Search Right Now" flash.

**Files modified**: 1 (`page.tsx`)

---

### Task 2.3: Add license section to Settings > Account

**Goal**: Permanent license management in settings page.

**Context files to read**:
- `components/settings/account-section.tsx` (commented-out cloud features area)
- `lib/hooks/use-license-status.ts` (status display)
- `specs/ARCH-trial-licensing.md` Section 9 (account section mockup)

**Changes in `account-section.tsx`**:
1. Import `useLicenseStatus` and `validateLicense`
2. Add license Card below the login section (where cloud features were):
   - Status display (trial/licensed/expired)
   - License key input + Activate button
   - Buy link to kalam-plus.com/thadm
   - If licensed: show key (masked), plan type, validated date

**Test**: Open Settings > Account → see license section. Enter key →
activates. Status updates.

**Files modified**: 1 (`account-section.tsx`)

---

### Task 2.4: Add re-validation to useLicenseStatus hook

**Goal**: Validate license online on app launch + every 24 hours.

**Context files to read**:
- `lib/hooks/use-license-status.ts` (from Task 1.2)
- `lib/actions/validate-license.ts` (from Task 2.1)

**Changes in `use-license-status.ts`**:
1. On mount: if license_key exists and `license_validated_at` > 24 hours ago,
   call `validateLicense()` in background
2. If response says expired → update settings → status becomes "expired"
3. If network error + cache < 7 days → keep "licensed"
4. If network error + cache > 7 days → status becomes "expired"

**Test**: Set `license_validated_at` to 8 days ago, disconnect internet →
status should be "expired". Reconnect → re-validates → "licensed".

**Files modified**: 1 (`use-license-status.ts`)

---

## Phase 3: Payment (LemonSqueezy + Website)

### Task 3.1: Create LemonSqueezy account + products

**Goal**: Two products live on LemonSqueezy, ready for checkout.

**This is NOT a code task. Manual setup:**
1. Sign up at lemonsqueezy.com
2. Create store
3. Create product: "Thadm Annual" — $29/year, subscription, license key enabled
4. Create product: "Thadm Lifetime" — $49, one-time, license key enabled
5. Configure: activation limit = unlimited, key prefix = "THADM"
6. Get test mode API credentials
7. Generate a test license key for development

**Deliverable**: Store ID, product IDs, test API key, test license key.

---

### Task 3.2: Add checkout to kalam-plus.com

**Goal**: Buy buttons on the website that open LemonSqueezy checkout.

**Changes on kalam-plus.com** (not in this repo):
1. Add `<script src="https://app.lemonsqueezy.com/js/lemon.js" defer></script>`
2. Add pricing section with two checkout buttons (annual + lifetime)
3. Style to match site design

**Test**: Click "Buy Annual" → LemonSqueezy checkout overlay opens →
complete test purchase → receive license key email.

---

### Task 3.3: End-to-end test

**Goal**: Full flow works: buy → email → paste key → activate → record.

**Steps**:
1. Set `first_seen_at` to 20 days ago (simulate expired trial)
2. Launch app → see expired banner, no recording
3. Click "Buy Thadm" → opens kalam-plus.com → complete purchase
4. Receive license key email
5. Paste key into expired banner input → click Activate
6. Sidecar restarts in full mode → recording resumes
7. Close and reopen app → still licensed (cached)
8. Verify Settings > Account shows "Licensed (Lifetime)" or "Licensed (Annual)"

---

## Phase 4: Polish

### Task 4.1: Analytics events

Add PostHog tracking:
- `trial_started` (on first_seen_at set)
- `trial_expiring` (on banner shown)
- `trial_expired` (on soft gate)
- `license_activated` (on successful activation, with plan type)
- `license_validation_failed` (on API error)

### Task 4.2: Edge case handling

- Handle system clock manipulation (if `first_seen_at` is in the future, treat as day 0)
- Handle corrupt license_validated_at (fail open to re-validate)
- Handle sidecar restart race condition (debounce stop→spawn by 2s)

---

## Summary

| Phase | Tasks | Files | Can ship independently? |
|-------|-------|-------|------------------------|
| Phase 0 | 0.1 | 2 files | **No** — prerequisite for Phase 1 |
| Phase 1 | 1.1–1.6 | 7 files (1 new) | Yes — trial works, no payment yet |
| Phase 2 | 2.1–2.4 | 4 files (1 new) | Yes — activation works with test keys |
| Phase 3 | 3.1–3.3 | 0 code files | Yes — payment live on website |
| Phase 4 | 4.1–4.2 | 2-3 files | Yes — polish, non-blocking |

**Total**: ~11 files changed, 2 new files, 0 new dependencies.

### Review Fixes Applied

Three issues found during adversarial review (2026-02-21):

1. **BLOCKER — Stale SettingsStore**: `app.state::<SettingsStore>()` is a
   frozen Clone. Added Task 0.1 to use live store.bin reads via StoreExt.
2. **BLOCKER — Existing users locked out**: `MIN(timestamp)` from months of
   old data would trigger instant expiry. Changed to `MAX` (most recent) and
   documented that `first_seen_at = now()` on migration gives fresh 15 days.
3. **RISK — UI flash during activation**: Health check shows "Can't Search
   Right Now" during sidecar restart. Added `isActivating` spinner to Task 2.2.

Each task has:
- Exactly which files to read (context)
- Exactly what to change (action)
- Exactly how to verify (test)

This is the **focused context** that produces high-quality LLM output —
not too little (guessing), not too much (losing focus).
