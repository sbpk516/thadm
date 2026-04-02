# Thadm Licensing System — Implementation Plan

## Overview
- 15-day free trial, then recording stops (search still works)
- User buys token from kalam-plus.com → enters THADM-XXXX-XXXX-XXXX-XXXX
- Token validated via LemonSqueezy API
- Recording gate enforced in **Rust** (not frontend)

## Architecture Decisions

### P0 Fixes (security)
1. **Dual storage for firstSeenAt** — store.bin + db.sqlite. Use oldest on boot.
2. **Clock rollback protection** — persist lastSeenAt. If now < lastSeenAt, treat as expired.
3. **Recording gate in Rust** — `recording.rs` → `spawn_screenpipe()`, not frontend hooks.
4. **Frontend is display-only** — React hook shows UI state, never enforces.
5. **firstSeenAt set in Rust** — `init_store()` on app launch, before any UI.

### P1 Fixes (robustness)
- Save license key BEFORE API call (crash safety)
- Grace period on re-validation failure (3 days)
- LemonSqueezy `instance_name` for device tracking
- Typed `LicenseStore` struct in Rust

## Files to Create/Modify

### 1. `apps/screenpipe-app-tauri/src-tauri/src/store.rs`
**Add `LicenseStore` struct** (following OnboardingStore pattern):
```rust
pub struct LicenseStore {
    pub first_seen_at: String,        // ISO 8601 — trial start
    pub last_seen_at: String,         // ISO 8601 — clock rollback detection
    pub license_key: Option<String>,  // THADM-XXXX-XXXX-XXXX-XXXX
    pub license_validated_at: Option<String>, // ISO 8601
    pub license_plan: Option<String>, // "annual" | "lifetime"
}
```
- `LicenseStore::get(app)` — read from store
- `LicenseStore::update(app, closure)` — write to store
- `init_license_store(app)` — called from main.rs setup, sets first_seen_at if absent, always updates last_seen_at
- `LicenseStore::is_trial_expired()` — checks 15-day window with clock rollback protection
- `LicenseStore::is_licensed()` — checks license_key + validated_at < 7 days
- `LicenseStore::is_recording_allowed()` — `is_licensed() || !is_trial_expired()`

### 2. `apps/screenpipe-app-tauri/src-tauri/src/recording.rs`
**Add recording gate** in `spawn_screenpipe()`:
- Read `LicenseStore::get(app)`
- If `!is_recording_allowed()`: force `config.disable_vision = true` and `config.disable_audio = true`
- Log: `info!("[LICENSE] trial expired, recording disabled")`
- Emit event to frontend: `app.emit("license-recording-blocked", ())`

### 3. `apps/screenpipe-app-tauri/lib/hooks/use-license-status.ts`
**Display-only React hook**:
```typescript
type LicenseStatus = {
  status: "trial" | "trial_expiring" | "expired" | "licensed" | "pending";
  daysRemaining: number;
  plan: "annual" | "lifetime" | null;
};
```
- Reads license fields from settings store
- Rechecks every 60 seconds
- Days 0-10: "trial"
- Days 10-15: "trial_expiring"
- Day 15+: "expired" (unless licensed)
- Licensed + valid: "licensed"
- Key saved but not validated: "pending"

### 4. `apps/screenpipe-app-tauri/lib/actions/validate-license.ts`
**LemonSqueezy API call**:
```typescript
POST https://api.lemonsqueezy.com/v1/licenses/validate
Body: { license_key: string, instance_name?: string }
Returns: { valid, status, plan, error }
```
- Extract plan from product name ("annual" | "lifetime")
- On success: save licenseValidatedAt + licensePlan to store
- On network error: return { valid: false, error: "network" }

### 5. `apps/screenpipe-app-tauri/components/trial-banner.tsx`
**UI component** shown at top of home page:
- **trial_expiring**: Yellow banner — "Trial ends in X days" + "Buy now" link
- **expired**: Red banner — "Trial expired" + token input field + "Activate" button + "Buy" link to kalam-plus.com/#thadm
- **licensed**: Green banner (briefly) — "Licensed ✓" then auto-hide
- **pending**: Blue banner — "License saved — will activate when online"
- Token format hint: THADM-XXXX-XXXX-XXXX-XXXX

### 6. `apps/screenpipe-app-tauri/src-tauri/src/main.rs`
**Initialize license store on startup**:
- Call `init_license_store(app)` in the setup closure
- Add Tauri command: `validate_license_key(key: String)` that calls LemonSqueezy from Rust side (more secure than frontend fetch)

## Data Flow

```
APP LAUNCH (main.rs)
  ↓
init_license_store(app)
  → Set first_seen_at if absent
  → Update last_seen_at = now
  → Clock rollback check: if now < last_seen_at, flag it
  ↓
spawn_screenpipe() [recording.rs]
  → LicenseStore::get(app)
  → is_recording_allowed()?
    YES → normal recording
    NO  → disable_vision + disable_audio, emit event
  ↓
FRONTEND renders [use-license-status.ts]
  → Read store fields
  → Calculate display status
  → Show trial-banner.tsx if needed
  ↓
USER ENTERS TOKEN [trial-banner.tsx]
  → Save key to store immediately (crash safe)
  → Call validate_license Tauri command
  → On success: save validated_at + plan
  → Restart recording (re-call spawn_screenpipe)
```

## Purchase URL
- `https://kalam-plus.com/#thadm`
- Plans: Annual ($29/year), Lifetime ($49)

## LemonSqueezy API
- Validate: `POST https://api.lemonsqueezy.com/v1/licenses/validate`
- Activate: `POST https://api.lemonsqueezy.com/v1/licenses/activate`
- Deactivate: `POST https://api.lemonsqueezy.com/v1/licenses/deactivate` (future)

## Deferred to v2
- Device deactivation UI
- Self-hosted validation proxy at kalam-plus.com
- Subscription/renewal handling
- db.sqlite backup of firstSeenAt (v1 uses store.bin only with clock rollback protection)
