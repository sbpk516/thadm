# Feature Spec: 15-Day Trial + License Key Activation

**Status**: Approved
**Date**: 2026-02-21
**Author**: Balaji / Claude

---

## 1. Problem Statement

Thadm is currently free with no monetization. We need a 15-day free trial
that requires no account or credit card, followed by a soft gate that
disables recording (but allows searching existing data) until the user
purchases and activates a license key.

## 2. Decisions (Confirmed)

| Decision | Choice |
|----------|--------|
| Gate type | **Soft gate** — recording stops, search of OLD data still works |
| Trial storage | **Data-based** — detect from DB timestamp + first_seen_at (use most recent) |
| Trial banner | **Last 5 days only** (day 11-15) |
| Expired search | **Yes** — expired users can still search/view old data |
| Offline grace | **7 days** — cached license valid for 1 week without internet |
| Activation limit | **Unlimited** — no machine restriction |
| Payment provider | **LemonSqueezy** (Merchant of Record, handles tax) |
| Verification | **License key** pasted into Settings > Account |

## 3. Pricing (Two Tiers)

| Tier | Price | What They Get |
|------|-------|---------------|
| **Annual** | $29/year | Full access, renews yearly, key expires after 1 year |
| **Lifetime** | $49 once | Full access forever, never expires |

Both tiers are separate LemonSqueezy products, each generating a license
key. The validation response includes `license_key.status` which tells the
app whether the key is active or expired (for annual renewals).

### How Annual Renewal Works

- LemonSqueezy handles recurring billing automatically
- If payment fails, LemonSqueezy sets key status to `"expired"`
- App re-validates on launch → detects expired key → soft gate
- User renews payment → key status returns to `"active"` → app unlocks
- No code needed for billing — LemonSqueezy manages the subscription lifecycle

## 4. User Journey

```
INSTALL & FIRST USE (Day 1-10)
├── User installs Thadm
├── App works fully — recording, search, everything
├── NO trial banner shown (clean experience)
├── No account, no email, no credit card required
└── first_seen_at written to store.bin on first launch

TRIAL WARNING (Day 11-15)
├── App still works fully
├── Subtle banner appears at bottom of main page:
│   "Trial ends in 5 days · Buy Thadm →"
└── Banner links to kalam-plus.com/thadm

TRIAL EXPIRES (Day 16+)
├── App still launches and opens
├── Recording STOPS (sidecar not spawned)
├── Search WORKS for existing data (read-only mode)
├── Banner at top of main page:
│   "Your 15-day trial has ended. Recording is paused."
│   "Enter a license key or buy Thadm to continue recording."
│   [ License Key Input ]  [ Activate ]
│   "Annual $29/yr · Lifetime $49 · [Buy Thadm →]"
├── Settings page fully accessible
└── Tray menu: "Start Recording" → "Trial Expired — Buy Thadm"

PURCHASE & ACTIVATE
├── User clicks "Buy Thadm" → opens kalam-plus.com/thadm
├── User chooses Annual ($29/yr) or Lifetime ($49)
├── LemonSqueezy checkout overlay (card, PayPal, Apple Pay)
├── User receives license key via email: "THADM-XXXX-XXXX-XXXX-XXXX"
├── User pastes key into the banner input OR Settings > Account
├── App calls LemonSqueezy Validate API → confirms key is valid
├── license_key + validated_at stored in store.bin
├── Recording resumes, full access restored
└── Annual keys re-validated on each launch; lifetime keys cached
```

## 5. Trial Expiry Detection (Data-Based)

### Strategy

Instead of storing a `trial_start_date` (easily deleted), detect trial
status from the **actual data in the screenpipe database**.

### Logic

```
1. Check store.bin for valid license_key
   → If found AND (validated_at < 7 days ago OR revalidation succeeds)
   → status = "licensed", full access. DONE.

2. Query: SELECT MIN(timestamp) FROM frames
   → Returns the timestamp of the earliest screen capture

3. If NO data exists → check first_seen_at from store.bin
   → If first_seen_at not set → set it now → trial active (day 0)
   → If first_seen_at set → use it as trial start

4. trial_start = LATEST of (MIN(frames.timestamp), first_seen_at)
   trial_age_days = floor((now - trial_start) / 86400)

   WHY LATEST (not earliest): Existing users who installed weeks ago
   already have old DB timestamps. Using MIN would instantly lock them
   out on upgrade. Using the MOST RECENT date gives them a fresh 15-day
   window starting from either first_seen_at (set on first upgrade) or
   their oldest recording — whichever happened MORE recently.

5. If trial_age_days <= 10  → status = "trial" (no banner)
   If trial_age_days 11-15  → status = "trial_expiring" (show banner)
   If trial_age_days > 15   → status = "expired" (soft gate)
```

### Why This Works

| Attack | Outcome |
|--------|---------|
| Delete store.bin | No effect — trial is based on DB, not store |
| Change system clock forward | Trial expires early (hurts attacker) |
| Change system clock backward | New data still has real timestamps from DB writes |
| Delete the database | Loses ALL their data — strong deterrent, resets trial |
| Reinstall app | DB at ~/.screenpipe persists — trial still detected |
| Delete DB + reinstall | Fresh trial, but all data gone — acceptable tradeoff |

### Edge Cases

| Case | Behavior |
|------|----------|
| Fresh install, no data yet | Set first_seen_at, trial active (day 0) |
| **Existing user upgrading** | **first_seen_at set to now → fresh 15-day trial from today** |
| Data exists, < 11 days | Trial active, no banner |
| Data exists, 11-15 days | Trial active, show "X days remaining" banner |
| Data exists, > 15 days, no license | Soft gate — stop recording, search still works |
| Data exists, > 15 days, valid license | Full access |
| Annual license expired (payment failed) | Soft gate (LemonSqueezy sets key to expired) |
| Lifetime license | Always valid, never expires |
| No internet during validation | Use cached result if validated_at < 7 days ago |
| Offline > 7 days with license | Soft gate until internet available for revalidation |

## 6. License Key System

### Provider: LemonSqueezy

**Why**: Built-in license key generation + validation API, Merchant of
Record (handles all tax/VAT globally), embeds on any website, 5% + $0.50
per transaction, buyers can pay with PayPal/card/Apple Pay.

### Setup Required on LemonSqueezy

1. Create LemonSqueezy account
2. Create **two products**:
   - "Thadm Annual" — $29/year, subscription, generates license key
   - "Thadm Lifetime" — $49, one-time, generates license key
3. Configure license key settings for both:
   - Activation limit: **Unlimited**
   - Key prefix: "THADM"
4. Get Store ID and API key for validation endpoint

### Setup Required on kalam-plus.com

1. Add LemonSqueezy checkout script to `<head>`:
   ```html
   <script src="https://app.lemonsqueezy.com/js/lemon.js" defer></script>
   ```

2. Add pricing section with two buy buttons:
   ```html
   <a href="https://yourstore.lemonsqueezy.com/buy/annual-product-id"
      class="lemonsqueezy-button">
     Annual — $29/year
   </a>

   <a href="https://yourstore.lemonsqueezy.com/buy/lifetime-product-id"
      class="lemonsqueezy-button">
     Lifetime — $49
   </a>
   ```

3. LemonSqueezy handles checkout overlay, payment, receipt, tax,
   and license key email delivery.

### Validation API (called from Thadm app on each launch)

```
POST https://api.lemonsqueezy.com/v1/licenses/validate
Body: { "license_key": "THADM-XXXX-XXXX-XXXX-XXXX" }

Response (valid — active subscription or lifetime):
{
  "valid": true,
  "license_key": {
    "key": "THADM-XXXX-XXXX-XXXX-XXXX",
    "status": "active"
  },
  "meta": {
    "product_name": "Thadm Lifetime"  // or "Thadm Annual"
  }
}

Response (expired — annual subscription lapsed):
{
  "valid": false,
  "license_key": {
    "key": "THADM-XXXX-XXXX-XXXX-XXXX",
    "status": "expired"
  }
}

Response (invalid key):
{
  "valid": false,
  "error": "license key not found"
}
```

### Activation Flow in Thadm

```
User pastes key → app calls validate endpoint
  → valid + active   → store key + validated_at in store.bin → full access
  → valid + expired   → show "Subscription expired. Renew at kalam-plus.com"
  → invalid           → show "Invalid license key. Please check and try again."
  → network error     → show "Can't verify right now. Check your internet."
```

No activate/deactivate calls needed since activation limit is unlimited.

### Activation UX (Transition State)

When the user clicks Activate while expired, the sidecar must restart.
During this 3-5 second window, show a spinner instead of the banner:

```
User clicks Activate → spinner "Activating license..."
  → validate key → store in settings
  → stop sidecar → respawn in full mode
  → wait for health check OK
  → spinner disappears, status = "licensed"
```

This prevents the "Can't Search Right Now" flash that would appear if
the UI just removed the expired banner while the sidecar is restarting.

## 7. What Changes in the App

### New State in store.bin (Settings)

Add to the Settings type:

```typescript
// New fields in Settings
license_key: string | null;          // "THADM-XXXX-XXXX-XXXX-XXXX"
license_validated_at: string | null;  // ISO timestamp of last successful validation
license_plan: "annual" | "lifetime" | null; // which plan they bought
first_seen_at: string | null;         // ISO timestamp, set once on first launch
```

### New: License Status Hook

```typescript
useLicenseStatus() → {
  status: "trial" | "trial_expiring" | "expired" | "licensed",
  daysRemaining: number | null,   // null when licensed
  plan: "annual" | "lifetime" | null,
  isRecordingAllowed: boolean,    // false when expired
  isSearchAllowed: boolean,       // ALWAYS true (even when expired)
}
```

This hook:
1. Checks if `license_key` exists in settings
2. If yes: validate (online) or use cache (offline, < 7 days)
   - Active → status = "licensed"
   - Expired subscription → status = "expired"
3. If no license: query earliest DB timestamp via get-start-date
4. Falls back to `first_seen_at` if DB is empty
5. Computes days remaining, returns permissions

### Permissions Matrix

| Status | Recording | Search old data | Trial banner |
|--------|-----------|-----------------|-------------|
| trial (day 1-10) | YES | YES | NO |
| trial_expiring (day 11-15) | YES | YES | YES — "X days left" |
| expired (day 16+) | **NO** | YES | YES — "Trial ended" + key input |
| licensed | YES | YES | NO |

### UI Changes

| Location | Change |
|----------|--------|
| **Main page (page.tsx)** | Day 11-15: subtle bottom banner "Trial ends in X days · Buy Thadm →" |
| **Main page (page.tsx)** | Day 16+: top banner with key input + buy links (NOT full-screen overlay) |
| **Main page (page.tsx)** | Search still works when expired — just no new recordings |
| **Settings > Account** | Add "License" section: key input, activate button, status display |
| **Settings > Account** | Show: "Trial (X days)" or "Licensed (Annual)" or "Licensed (Lifetime)" or "Expired" |
| **Tray menu (tray.rs)** | When expired: "Start Recording" → "Trial Expired — Buy Thadm" |
| **Sidecar spawn (sidecar.rs)** | When expired: skip sidecar spawn, log reason |

### Files to Modify

| File | Change |
|------|--------|
| `lib/hooks/use-settings.tsx` | Add license fields to Settings type + defaults + migration |
| `lib/hooks/use-license-status.ts` | **NEW** — hook that computes trial/license state |
| `lib/actions/get-start-date.ts` | Already exists — reuse for earliest timestamp query |
| `app/page.tsx` | Add trial banner (day 11-15) + expired banner with key input (day 16+) |
| `components/settings/account-section.tsx` | Add license key section (replaces commented-out cloud features) |
| `src-tauri/src/sidecar.rs` | Check license status before spawning sidecar (**must re-read live store.bin**, not use frozen `app.state`) |
| `src-tauri/src/tray.rs` | Update tray menu text when expired |

### Files NOT Modified

- No Rust-side license validation (all via frontend fetch to LemonSqueezy)
- No database schema changes
- No new Tauri commands needed (use existing fetch + store)
- No changes to recording logic itself — just gate the sidecar spawn

## 8. Security Considerations

| Risk | Mitigation |
|------|-----------|
| User edits store.bin to fake license | Revalidation on each launch catches fakes (needs real key) |
| User blocks LemonSqueezy API | Cached validation honored for 7 days only, then soft gate |
| User reverse-engineers the check | Accept this — desktop apps can always be cracked. Focus on honest users. |
| LemonSqueezy goes down | 7-day cache grace period for licensed users |
| User deletes DB to reset trial | Loses all data — acceptable, they're punishing themselves |

## 9. Implementation Order

```
Phase 1: Trial detection (no payment yet — fully testable)
  1. Add first_seen_at + license fields to Settings type + defaults
  2. Set first_seen_at on first launch (in use-settings.tsx init)
  3. Create useLicenseStatus hook (query DB + compute status)
  4. Add trial banner to main page (day 11-15)
  5. Add expired banner to main page (day 16+) with key input placeholder
  6. Block sidecar spawn when expired (sidecar.rs)
  7. Update tray menu when expired (tray.rs)

Phase 2: License activation (wire up LemonSqueezy)
  8. Add license key section in Settings > Account
  9. Implement LemonSqueezy validate API call
  10. Store validated license in settings
  11. Wire up: valid license bypasses soft gate + resumes recording

Phase 3: Payment page (LemonSqueezy + kalam-plus.com)
  12. Create LemonSqueezy account + 2 products (annual + lifetime)
  13. Add checkout buttons to kalam-plus.com/thadm
  14. Test full flow: buy → get key email → paste → activate → record

Phase 4: Polish
  15. Offline grace period (7-day cache logic)
  16. Annual subscription expiry handling
  17. Analytics: track trial_started, trial_expiring, trial_expired,
      license_activated, license_plan
```

## 10. Out of Scope (Not in This Feature)

- Account/login system (not needed — license key is enough)
- Server-side trial tracking (local DB detection is sufficient)
- Activate/deactivate API calls (unlimited machines, no need)
- In-app purchase via App Store
- Refund handling (LemonSqueezy handles this)
- Multi-device sync of license (each device enters key independently)
- Free tier / freemium (either trial or paid, no middle ground)

## 11. LLM Implementation Prompt

When ready to implement, use this prompt for each phase:

```
You are implementing Phase [N] of the Thadm trial + licensing system.

Read the full spec at specs/SPEC-trial-licensing.md first.

Context:
- Thadm is a Tauri + Next.js desktop app (see CLAUDE.md for build rules)
- Settings are stored in store.bin via @tauri-apps/plugin-store
- The screenpipe SQLite DB is at ~/.screenpipe/db.sqlite
- Earliest timestamp query exists in lib/actions/get-start-date.ts
- License validation is via LemonSqueezy REST API (no SDK needed)
- The sidecar (thadm-recorder) is spawned in src-tauri/src/sidecar.rs

For this phase, implement ONLY steps [X-Y] from the spec.
Do NOT implement future phases.
Follow CLAUDE.md rules strictly: one file at a time, test after each change.

Files to read first: [list relevant files for the phase]
Files to modify: [list files for the phase]
```
