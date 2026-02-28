# Technical Architecture: Trial + Licensing

**Companion to**: `specs/SPEC-trial-licensing.md`
**Date**: 2026-02-21

---

## 1. Critical Constraint: Sidecar Must Always Run

The sidecar (`thadm-recorder`) is NOT just a recorder — it is the **search
server** (port 3030). Every search query goes through it:

```
Frontend → fetch("localhost:3030/search/keyword") → sidecar → SQLite → response
```

If we don't spawn the sidecar, expired users **can't search old data**.

### Solution: "Read-Only Mode"

When trial is expired, spawn the sidecar with both recording flags disabled:

```
thadm-recorder --port 3030 --disable-audio --disable-vision [other flags]
```

This starts the HTTP server (search works) but skips all capture (no new
recordings). The existing `--disable-audio` and `--disable-vision` flags
already exist in `sidecar.rs:442-444` and `sidecar.rs:515-520`.

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        APP STARTUP                              │
│                                                                 │
│  1. Rust: main.rs setup()                                       │
│     ├── Load store.bin (SettingsStore)                           │
│     ├── Read license_key + first_seen_at from store              │
│     ├── Check permissions                                       │
│     └── Spawn sidecar:                                          │
│         ├── If licensed → normal spawn (full recording)          │
│         ├── If trial active → normal spawn (full recording)      │
│         └── If expired → spawn with --disable-audio              │
│                          --disable-vision (search-only mode)     │
│                                                                 │
│  2. Frontend: SettingsProvider mount                             │
│     ├── Load store.bin → set first_seen_at if missing            │
│     └── Settings available to all components                     │
│                                                                 │
│  3. Frontend: page.tsx render                                    │
│     ├── useLicenseStatus() hook computes trial state             │
│     │   ├── Check license_key in settings                        │
│     │   │   ├── If present → validate online (or use cache)      │
│     │   │   └── If absent → query DB for earliest timestamp      │
│     │   │       ├── SELECT MIN(timestamp) FROM frames            │
│     │   │       ├── Use LATEST of (DB min, first_seen_at)        │
│     │   │       └── Compute days remaining                       │
│     │   └── Return { status, daysRemaining, isRecordingAllowed } │
│     │                                                            │
│     └── Conditional rendering:                                   │
│         ├── status = "trial"          → <Timeline /> (normal)    │
│         ├── status = "trial_expiring" → <Timeline /> + banner    │
│         ├── status = "expired"        → <Timeline /> + gate bar  │
│         └── status = "licensed"       → <Timeline /> (normal)    │
│                                                                  │
│  NOTE: <Timeline /> (search) renders in ALL states.              │
│  The soft gate is a banner/bar, NOT a full-screen block.         │
└─────────────────────────────────────────────────────────────────┘
```

## 3. The Chicken-and-Egg Problem

**Problem**: The DB-based trial check (`SELECT MIN(timestamp) FROM frames`)
requires the sidecar running (it serves `/raw_sql`). But the sidecar spawn
decision needs the trial status.

**Solution**: Two-tier check.

### Tier 1: Rust-side (fast, at spawn time)

Rust reads `store.bin` directly. It checks:

```rust
// Pseudocode in sidecar.rs, before spawning
let license_key = store.license_key;  // from store.bin
let first_seen_at = store.first_seen_at;  // from store.bin
let license_validated_at = store.license_validated_at;

let is_licensed = license_key.is_some()
    && license_validated_at.is_some()
    && (now - license_validated_at) < 7_days;

let trial_expired_by_first_seen = first_seen_at.is_some()
    && (now - first_seen_at) > 15_days;

if is_licensed {
    // Normal spawn — full recording
} else if trial_expired_by_first_seen {
    // Read-only spawn — --disable-audio --disable-vision
} else {
    // Normal spawn — trial still active (or no first_seen yet)
}
```

This is an **approximation**. It uses `first_seen_at` (not the DB earliest
timestamp) because the DB isn't available yet. It's good enough for the
spawn decision.

### Tier 2: Frontend-side (accurate, after sidecar is up)

Once the sidecar is running, the frontend hook `useLicenseStatus()` does
the full DB-based check:

```typescript
// 1. Query DB for actual earliest timestamp
const earliestDate = await getStartDate();  // existing function

// 2. Compare with first_seen_at — use whichever is MORE RECENT (LATEST)
//    WHY: Existing users have old DB timestamps from before the trial
//    feature existed. Using MIN would instantly lock them out on upgrade.
//    Using LATEST gives them a fresh 15-day window from upgrade date.
const trialStart = max(earliestDate, settings.first_seen_at);

// 3. Compute accurate trial age
const trialAgeDays = daysBetween(trialStart, now);
```

If the frontend discovers the trial is expired but the sidecar was spawned
in full mode (Tier 1 thought trial was active because `first_seen_at` was
missing), it sends `commands.stopScreenpipe()` then
`commands.spawnScreenpipe(null)` to restart in read-only mode (Rust
re-reads live store.bin and applies the gate).

### Why Two Tiers?

| Tier | When | Data Source | Accuracy | Purpose |
|------|------|-------------|----------|---------|
| Rust (Tier 1) | Spawn time | store.bin only | ~90% | Don't start recording if clearly expired |
| Frontend (Tier 2) | After mount | DB + store.bin | 100% | Show correct UI, fix sidecar mode if needed |

The worst case is: first launch after 15 days with no `first_seen_at` yet.
Rust spawns in full mode → frontend detects expired → restarts sidecar in
read-only mode. This takes ~5 seconds and happens once.

## 4. Data Flow Diagram

```
store.bin                    SQLite DB (~/.thadm/db.sqlite)
┌───────────────────┐        ┌──────────────────────────┐
│ first_seen_at     │        │ frames.timestamp (MIN)   │
│ license_key       │        │ audio_transcriptions     │
│ license_validated_at│       └──────────┬───────────────┘
│ license_plan      │                    │
└────────┬──────────┘                    │
         │                               │
    ┌────▼────┐                    ┌─────▼──────┐
    │ Rust    │                    │ Frontend   │
    │ Tier 1  │──spawn sidecar──> │ Tier 2     │
    │ (fast)  │                    │ (accurate) │
    └────┬────┘                    └─────┬──────┘
         │                               │
         ▼                               ▼
    Sidecar mode:                  UI state:
    - full (trial/licensed)        - trial (no banner)
    - read-only (expired)          - trial_expiring (banner)
                                   - expired (gate bar)
                                   - licensed (no banner)
```

## 5. License Validation Flow

```
User pastes key in UI
        │
        ▼
Frontend: POST https://api.lemonsqueezy.com/v1/licenses/validate
          Body: { "license_key": "THADM-XXXX-..." }
        │
        ├── 200 + valid: true + status: "active"
        │   └── Store in settings: license_key, license_plan,
        │       license_validated_at = now
        │   └── If sidecar in read-only mode → restart in full mode
        │   └── UI: "Licensed (Annual)" or "Licensed (Lifetime)"
        │
        ├── 200 + valid: false + status: "expired"
        │   └── Show: "Subscription expired. Renew at kalam-plus.com"
        │   └── Keep sidecar in read-only mode
        │
        ├── 200 + valid: false + error: "not found"
        │   └── Show: "Invalid license key"
        │
        └── Network error
            └── Show: "Can't verify right now. Check internet."
            └── If cached validation < 7 days → honor cache
```

### Re-validation Schedule

| Event | Action |
|-------|--------|
| App launch | Validate license online (background, non-blocking) |
| Every 24 hours while running | Re-validate in background |
| Network comes back after offline | Re-validate immediately |
| Cache older than 7 days + offline | Soft gate until online |

## 6. Sidecar Spawn Modes

### Normal Mode (trial active or licensed)

```
thadm-recorder --port 3030 \
  --audio-transcription-engine whisper-large-v3-turbo \
  --ocr-engine apple-native \
  --monitor-id 1 --monitor-id 2 \
  --audio-device "MacBook Pro Microphone (input)" \
  [... all normal flags]
```

### Read-Only Mode (trial expired, no license)

```
thadm-recorder --port 3030 \
  --disable-audio \
  --disable-vision \
  --auto-destruct-pid <parent_pid> \
  --disable-telemetry \
  --data-dir <data_dir>
```

Minimal flags: just enough to start the HTTP server for search queries.
No monitor IDs, no audio devices, no transcription engine needed.

## 7. Settings Store Changes

### New Fields in TypeScript Settings Type

```typescript
// lib/hooks/use-settings.tsx — add to Settings type
license_key: string | null;            // "THADM-XXXX-XXXX-XXXX-XXXX"
license_validated_at: string | null;   // ISO timestamp
license_plan: "annual" | "lifetime" | null;
first_seen_at: string | null;          // ISO timestamp, set once
```

### New Fields in Rust SettingsStore

```rust
// src-tauri/src/store.rs — add to SettingsStore struct
pub license_key: Option<String>,
pub license_validated_at: Option<String>,
pub license_plan: Option<String>,  // "annual" or "lifetime"
pub first_seen_at: Option<String>,
```

### Migration in use-settings.tsx

```typescript
// In settingsStore.get(), after existing migrations:

// IMPORTANT: For existing users upgrading to a version with trial logic,
// first_seen_at is set to NOW — giving them a fresh 15-day trial from
// the moment they upgrade. This prevents instant lockout for users who
// have had the app for weeks/months before the trial feature existed.
if (!settings.first_seen_at) {
    settings.first_seen_at = new Date().toISOString();
    needsUpdate = true;
}
if (settings.license_key === undefined) {
    settings.license_key = null;
    needsUpdate = true;
}
// license_validated_at and license_plan default to null (undefined → null)
```

### Trial Start Calculation (LATEST, not earliest)

When computing trial age, use the **most recent** of (DB earliest timestamp,
first_seen_at) — NOT the earliest. Rationale:

| Scenario | DB MIN timestamp | first_seen_at | Correct trial_start |
|----------|-----------------|---------------|---------------------|
| Fresh install | none | today | today (day 0) |
| Existing user upgrades | 3 months ago | today | **today** (fresh 15 days) |
| Normal user day 10 | 10 days ago | 10 days ago | 10 days ago |

Using `min()` would pick "3 months ago" and instantly lock out existing users.

## 8. Hook: useLicenseStatus

### Interface

```typescript
type LicenseStatus = {
  status: "loading" | "trial" | "trial_expiring" | "expired" | "licensed";
  daysRemaining: number | null;
  plan: "annual" | "lifetime" | null;
  isRecordingAllowed: boolean;
  isSearchAllowed: boolean;  // always true
};

function useLicenseStatus(): LicenseStatus;
```

Note: The `isActivating` transitional state (spinner during sidecar restart
after license activation) is managed in `page.tsx` as local component state,
NOT in this hook. See Section 14 for the activation sequence.

### Implementation Pseudocode

```typescript
function useLicenseStatus(): LicenseStatus {
  const { settings } = useSettings();
  const [status, setStatus] = useState<LicenseStatus>({ status: "loading", ... });

  useEffect(() => {
    async function check() {
      // Step 1: Check license
      if (settings.license_key) {
        const cacheAge = daysSince(settings.license_validated_at);
        if (cacheAge < 7) {
          // Trust cache
          return setStatus({ status: "licensed", plan: settings.license_plan, ... });
        }
        // Revalidate online
        const result = await validateLicense(settings.license_key);
        if (result.valid && result.status === "active") {
          // Update cache
          updateSettings({ license_validated_at: new Date().toISOString() });
          return setStatus({ status: "licensed", plan: settings.license_plan, ... });
        }
        if (!result.valid && result.status === "expired") {
          // Annual sub lapsed
          return setStatus({ status: "expired", ... });
        }
        // Network error + cache expired
        if (cacheAge >= 7) {
          return setStatus({ status: "expired", ... });
        }
      }

      // Step 2: No license — check trial
      let trialStart: Date;
      try {
        const dbEarliest = await getStartDate();  // queries sidecar DB
        const firstSeen = new Date(settings.first_seen_at);
        // Use LATEST (most recent) — prevents existing users from being
        // instantly locked out when they upgrade to a version with trial logic
        trialStart = dbEarliest > firstSeen ? dbEarliest : firstSeen;
      } catch {
        // Sidecar not ready yet — use first_seen_at only
        trialStart = new Date(settings.first_seen_at);
      }

      const ageDays = Math.floor((Date.now() - trialStart.getTime()) / 86400000);

      if (ageDays <= 10) {
        return setStatus({ status: "trial", daysRemaining: 15 - ageDays, ... });
      }
      if (ageDays <= 15) {
        return setStatus({ status: "trial_expiring", daysRemaining: 15 - ageDays, ... });
      }
      return setStatus({ status: "expired", daysRemaining: 0, ... });
    }

    check();
    // Re-check every 60 seconds (for re-validation after key entry)
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [settings.license_key, settings.license_validated_at, settings.first_seen_at]);

  return status;
}
```

### Permissions Matrix

```
status            | isRecordingAllowed | isSearchAllowed
──────────────────┼────────────────────┼────────────────
loading           | false (wait)       | false (wait)
trial             | true               | true
trial_expiring    | true               | true
expired           | false              | true
licensed          | true               | true
```

## 9. UI Integration Points

### page.tsx — Three-Layer Rendering

```tsx
function Home() {
  const licenseStatus = useLicenseStatus();
  const { isServerDown } = useHealthCheck();

  if (!isSettingsLoaded || licenseStatus.status === "loading") {
    return <SplashScreen />;
  }

  return (
    <div>
      {/* Layer 1: Trial expiring banner (day 11-15) */}
      {licenseStatus.status === "trial_expiring" && (
        <TrialBanner daysRemaining={licenseStatus.daysRemaining} />
      )}

      {/* Layer 2: Expired banner with key input (day 16+) */}
      {licenseStatus.status === "expired" && (
        <ExpiredBanner onActivate={handleActivate} />
      )}

      {/* Layer 3: Main content — search always works */}
      {!isServerDown ? (
        <Timeline />
      ) : (
        <ServerDownCard
          showStartRecording={licenseStatus.isRecordingAllowed}
        />
      )}
    </div>
  );
}
```

Key: `<Timeline />` (search) renders in ALL states including expired.
The expired banner is above it, not replacing it.

### account-section.tsx — License Section

Replaces the commented-out cloud features area:

```tsx
{/* License section */}
<Card className="p-4 space-y-4">
  <h4 className="font-medium">License</h4>

  {/* Status display */}
  <div className="text-sm text-muted-foreground">
    {licenseStatus.status === "licensed" && `Licensed (${licenseStatus.plan})`}
    {licenseStatus.status === "trial" && `Trial — ${licenseStatus.daysRemaining} days remaining`}
    {licenseStatus.status === "trial_expiring" && `Trial ending — ${licenseStatus.daysRemaining} days left`}
    {licenseStatus.status === "expired" && "Trial expired — enter license key to continue"}
  </div>

  {/* Key input (always visible, for entering key at any time) */}
  <div className="flex gap-2">
    <Input
      placeholder="THADM-XXXX-XXXX-XXXX-XXXX"
      value={keyInput}
      onChange={e => setKeyInput(e.target.value)}
    />
    <Button onClick={handleActivate}>Activate</Button>
  </div>

  {/* Buy link */}
  <a onClick={() => openUrl("https://kalam-plus.com/thadm")}
     className="text-sm text-primary hover:underline cursor-pointer">
    Buy Thadm — Annual $29/yr · Lifetime $49
  </a>
</Card>
```

## 10. Rust-Side: Sidecar Spawn Gate

### CRITICAL: Stale SettingsStore Problem

`app.state::<SettingsStore>()` is a **frozen Clone** from app startup
(`main.rs:997`). It is cloned once via `init_store()` and never updated.
If the frontend writes `license_key` to store.bin via
`@tauri-apps/plugin-store`, the Rust `app.state` still has the OLD values.

**Solution**: `spawn_sidecar()` must **re-read store.bin directly** using
the Tauri store plugin, NOT use `app.state::<SettingsStore>()`.

```rust
// In spawn_sidecar(), re-read live store.bin instead of using app.state
use tauri_plugin_store::StoreExt;
let store_handle = app.store("store.bin")?;
let license_key: Option<String> = store_handle.get("license_key")
    .and_then(|v| serde_json::from_value(v).ok());
let first_seen_at: Option<String> = store_handle.get("first_seen_at")
    .and_then(|v| serde_json::from_value(v).ok());
let license_validated_at: Option<String> = store_handle.get("license_validated_at")
    .and_then(|v| serde_json::from_value(v).ok());
```

The same fix applies to `tray.rs` — `create_dynamic_menu()` must also
re-read live store.bin, not use the frozen `app.state`.

### Where to Add the Check

`src-tauri/src/sidecar.rs` — in `spawn_sidecar()`, after settings are read
(~line 357) and before args are constructed (~line 362).

```rust
// After re-reading live store.bin (NOT app.state)...

// Trial/license gate
// license_key, first_seen_at, license_validated_at already read from live store above

let is_licensed = license_key.is_some() && {
    if let Some(ref validated) = license_validated_at {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(validated) {
            chrono::Utc::now().signed_duration_since(dt).num_days() < 7
        } else { false }
    } else { false }
};

let trial_expired = if let Some(ref seen) = first_seen_at {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(seen) {
        chrono::Utc::now().signed_duration_since(dt).num_days() > 15
    } else { false }
} else { false };

let read_only_mode = !is_licensed && trial_expired;

// Later, when constructing args:
if disable_audio || read_only_mode {
    args.push("--disable-audio".to_string());
}
if disable_vision || read_only_mode {
    args.push("--disable-vision".to_string());
}

if read_only_mode {
    info!("[LICENSE] Trial expired, spawning sidecar in read-only mode (search only)");
}
```

### Tray Menu Update

`src-tauri/src/tray.rs` — in `create_dynamic_menu()`, after reading
recording status:

```rust
// Read license state from LIVE store.bin (NOT app.state — it's frozen)
use tauri_plugin_store::StoreExt;
let store_handle = app.store("store.bin")?;
let read_only_mode = /* same check as sidecar.rs, using store_handle.get() */;

if read_only_mode {
    // Replace start/stop recording with "Trial Expired"
    menu_builder = menu_builder.item(
        &MenuItemBuilder::with_id("buy", "Trial Expired — Buy Thadm")
            .build(app)?
    );
} else {
    // Normal recording controls
    // ... existing start/stop recording menu items
}
```

## 11. New Dependencies

| Dependency | Purpose | Already in project? |
|------------|---------|---------------------|
| `chrono` | Date parsing/comparison in Rust | Yes (used in screenpipe-server) |
| None | Frontend uses native `Date` + `fetch` | N/A |

**No new dependencies needed.** LemonSqueezy validation is a plain
`fetch()` POST — no SDK required.

## 12. Files Changed (Complete List)

| File | Type | Change |
|------|------|--------|
| `lib/hooks/use-settings.tsx` | Modify | Add 4 license fields to type + defaults + migration |
| `lib/hooks/use-license-status.ts` | **NEW** | Hook: compute trial/license state from DB + store |
| `app/page.tsx` | Modify | Add trial banner, expired banner, conditional rendering |
| `components/settings/account-section.tsx` | Modify | Add license key input section |
| `src-tauri/src/store.rs` | Modify | Add 4 license fields to SettingsStore struct |
| `src-tauri/src/sidecar.rs` | Modify | Add read-only mode gate before spawn |
| `src-tauri/src/tray.rs` | Modify | Add "Trial Expired" menu item when expired |

**7 files total** (1 new, 6 modified). No new dependencies.

## 13. Test Plan

| Test | How | Expected |
|------|-----|----------|
| Fresh install | Delete store.bin + DB, launch | first_seen_at set, full recording, no banner |
| Trial active (day 5) | Set first_seen_at to 5 days ago | Full recording, no banner |
| Trial warning (day 12) | Set first_seen_at to 12 days ago | Full recording, banner "3 days left" |
| Trial expired (day 20) | Set first_seen_at to 20 days ago | Read-only sidecar, search works, expired banner |
| Valid license key | Paste test key from LemonSqueezy | "Licensed" status, full recording |
| Invalid license key | Paste garbage key | "Invalid key" error message |
| Expired annual sub | Use expired test key | "Subscription expired" message, read-only mode |
| Offline with valid cache | Disconnect internet, launch | "Licensed" from cache, full recording |
| Offline with stale cache | Disconnect, cache > 7 days | Read-only mode until internet |
| License → restart sidecar | Activate key while expired | Sidecar restarts in full mode within 5s |

## 14. Sequence: Key Activation While Expired

### The UI Flash Problem

When the user activates a license, the sidecar must restart (stop read-only
→ spawn full mode). During this 3-5 second gap, the health check sees no
sidecar → `isServerDown = true` → "Can't Search Right Now" card flashes.

### Solution: `isActivating` Transition State

Add an `isActivating` state to page.tsx. While true, show a spinner
("Activating license...") instead of the expired banner or the server-down
card. Only clear it after the health check confirms sidecar is back up.

```
User in expired state (sidecar in read-only mode)
    │
    ▼
User pastes key → clicks Activate
    │
    ▼
UI: setIsActivating(true) → show spinner "Activating license..."
    │
    ▼
Frontend: POST to LemonSqueezy validate
    │
    ├── Invalid/expired → setIsActivating(false), show error toast
    │
    ▼ (valid)
Frontend: updateSettings({
  license_key: "THADM-...",
  license_plan: "lifetime",
  license_validated_at: now
})
    │
    ▼
Frontend: commands.stopScreenpipe()
    │
    ▼
Frontend: await sleep(2000)  // debounce — wait for port to close
    │
    ▼
Frontend: commands.spawnScreenpipe(null)
  → Rust re-reads LIVE store.bin → is_licensed = true
  → Spawns sidecar in full mode
    │
    ▼
Frontend: poll health check until OK (max 10s timeout)
    │
    ▼
setIsActivating(false)
useLicenseStatus re-evaluates → status = "licensed"
    │
    ▼
UI updates: spinner disappears, normal view, recording resumes
```

Key: The spinner covers BOTH the expired banner area AND the server-down
card, so the user never sees "Can't Search Right Now" during activation.
