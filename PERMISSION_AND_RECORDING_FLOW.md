# Thadm: Permission & Recording Flow — Complete Reference

> **Created**: 2026-02-19
> **Purpose**: Understand how screen recording permission works on macOS and how the sidecar starts/stops
> **Status**: Debugging guide — includes known bugs and gaps

---

## Table of Contents

1. [The Two Binaries](#the-two-binaries)
2. [How macOS Screen Recording Permission Works](#how-macos-screen-recording-permission-works)
3. [The Full Identity Chain](#the-full-identity-chain)
4. [The Permission Check Journey (Code Trace)](#the-permission-check-journey-code-trace)
5. [Why Permission Shows "Denied" Even After Granting](#why-permission-shows-denied-even-after-granting)
6. [Launch Services Cache Poisoning (Root Cause Found 2026-02-20)](#launch-services-cache-poisoning-root-cause-found-2026-02-20)
7. [The "Reset & Fix" Button Flow](#the-reset--fix-button-flow)
8. [The Permission Recovery Window Flow](#the-permission-recovery-window-flow)
9. [All 21 Recording Start/Stop Entry Points](#all-21-recording-startstop-entry-points)
10. [The Crash Loop Bug (Found & Fixed)](#the-crash-loop-bug-found--fixed)
11. [Known Bugs & Gaps](#known-bugs--gaps)
12. [How to Debug Permission Issues](#how-to-debug-permission-issues)

---

## The Two Binaries

Thadm has TWO separate binaries that work together:

```
/Applications/Thadm.app/
  Contents/
    MacOS/
      thadm              ← Main UI app (Tauri + Next.js)
      thadm-recorder     ← Sidecar (does actual screen/audio capture)
      ffmpeg             ← Video processing
      ffprobe            ← Video analysis
      bun                ← JS runtime
      ui_monitor         ← UI element tracking
```

**Key point**: The main app (`thadm`) checks if it has screen recording permission.
The sidecar (`thadm-recorder`) is the one that actually captures the screen.
These are two SEPARATE processes with potentially SEPARATE permission states.

```
┌─────────────────────┐         ┌──────────────────────┐
│     thadm           │         │   thadm-recorder     │
│   (main UI app)     │ spawns  │    (sidecar)         │
│                     │────────>│                      │
│ - Checks permission │         │ - Captures screen    │
│ - Shows UI          │         │ - Records audio      │
│ - Manages sidecar   │         │ - Runs OCR           │
│                     │         │ - Serves API :3030   │
│ Bundle ID:          │         │ No bundle ID         │
│ com.thadm.desktop   │         │ (bare executable)    │
└─────────────────────┘         └──────────────────────┘
        │                                │
        │ calls                          │ calls
        ▼                                ▼
 CGPreflightScreen                ScreenCaptureKit
 CaptureAccess()                  (SCStream, etc.)
        │                                │
        │ checks                         │ checks
        ▼                                ▼
┌─────────────────────────────────────────────────┐
│              macOS TCC Database                  │
│  (Transparency, Consent, and Control)            │
│                                                  │
│  System-level: /Library/Application Support/     │
│                com.apple.TCC/TCC.db              │
│  (requires sudo to read)                         │
│                                                  │
│  User-level:   ~/Library/Application Support/    │
│                com.apple.TCC/TCC.db              │
│  (Screen Recording is NOT stored here)           │
└─────────────────────────────────────────────────┘
```

---

## How macOS Screen Recording Permission Works

### What is TCC?

TCC = Transparency, Consent, and Control. It's macOS's permission system.

```
User clicks "Allow" in System Settings
        │
        ▼
┌─────────────────────────────────┐
│  System Settings UI             │
│  Privacy & Security             │
│  > Screen Recording             │
│                                 │
│  [✓] Thadm                     │
│  [ ] Zoom                      │
│  [ ] OBS                       │
└────────────┬────────────────────┘
             │ writes to
             ▼
┌─────────────────────────────────┐
│  /Library/Application Support/  │
│  com.apple.TCC/TCC.db          │
│  (SYSTEM-level, needs sudo)     │
│                                 │
│  Table: access                  │
│  ┌──────────┬────────┬───────┐ │
│  │ service  │ client │ auth  │ │
│  ├──────────┼────────┼───────┤ │
│  │ Screen   │ com.   │ 2     │ │
│  │ Capture  │ thadm. │(allow)│ │
│  │          │desktop │       │ │
│  └──────────┴────────┴───────┘ │
└─────────────────────────────────┘

auth_value meanings:
  0 = denied
  2 = allowed
  3 = limited
```

### Two TCC Databases (Important!)

```
┌──────────────────────────────────────────────────────────┐
│  SYSTEM-LEVEL TCC (requires sudo to read)                │
│  /Library/Application Support/com.apple.TCC/TCC.db       │
│                                                          │
│  Stores:                                                 │
│    - Screen Recording    ← THIS IS WHERE IT LIVES        │
│    - Accessibility                                       │
│    - Full Disk Access                                    │
│    - Input Monitoring                                    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  USER-LEVEL TCC (readable without sudo)                  │
│  ~/Library/Application Support/com.apple.TCC/TCC.db      │
│                                                          │
│  Stores:                                                 │
│    - Microphone          ← confirmed here for thadm      │
│    - Camera                                              │
│    - Contacts                                            │
│    - Calendar                                            │
└──────────────────────────────────────────────────────────┘

MISTAKE WE MADE: We queried the user-level database looking
for Screen Recording entries and found nothing. That's because
Screen Recording is in the SYSTEM-level database.
```

### How macOS Identifies Apps in TCC

```
For BUNDLED apps (.app):
  TCC key = Bundle ID (e.g., "com.thadm.desktop")
  + validates code signature at runtime (same Team ID = OK)

  Replacing the binary with a new build signed by the
  SAME Developer ID should NOT break TCC recognition.
  (Team ID: KVLNE2Y696)

For BARE executables (no .app wrapper):
  TCC key = Absolute path (e.g., "/usr/local/bin/ffmpeg")
  + validates code signature

  thadm-recorder is a bare executable inside the .app bundle.
  It may be identified by path OR by the parent app's bundle ID,
  depending on how macOS traces the "responsible application."
```

### macOS Sequoia: Two Permission Layers

macOS Sequoia (15.x) has TWO separate permission systems for screen capture:

```
Layer 1: TCC (System Settings toggle)
┌────────────────────────────────────────┐
│ System Settings > Screen Recording     │
│ [✓] Thadm                             │
│                                        │
│ Checked by: CGPreflightScreenCapture   │
│             Access()                   │
│ Persists: Until manually removed       │
└────────────────────────────────────────┘

Layer 2: ScreenCaptureKit Bypass Dialog
┌────────────────────────────────────────┐
│ "Thadm would like to capture your      │
│  screen and system audio"              │
│                                        │
│ [Allow for One Month] [Don't Allow]    │
│                                        │
│ Triggered by: replayd daemon           │
│ NOT checked by CGPreflight...()        │
│ Expires: After 30 days                 │
└────────────────────────────────────────┘

CGPreflightScreenCaptureAccess() only checks Layer 1.
ScreenCaptureKit (used by thadm-recorder) needs BOTH layers.
```

---

## The Full Identity Chain

Every macOS permission check follows this chain. A break at ANY point = permission denied.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     THE IDENTITY CHAIN                                   │
│                                                                          │
│  Step 1          Step 2          Step 3            Step 4                │
│                                                                          │
│  Info.plist  →  codesign    →  Launch Services  →  TCC Database         │
│  (on disk)      (binary)       (cached in RAM)     (permission store)   │
│                                                                          │
│  CFBundle       designated     lsregister          sqlite3               │
│  Identifier     requirement    -dump               TCC.db                │
│                                                                          │
│  "com.thadm     "identifier    identifier:         client:               │
│   .desktop"      com.thadm     com.thadm           com.thadm            │
│                  .desktop"     .desktop             .desktop              │
│                                                                          │
│              ↓                                                           │
│         Step 5: Runtime API                                              │
│         CGPreflightScreenCaptureAccess()                                │
│         Looks up calling process in TCC via the identity chain          │
│                                                                          │
│  If ANY step has a DIFFERENT value → permission check fails             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Diagnostic Commands for Each Step

```bash
# Step 1: What's in the app's Info.plist?
defaults read /Applications/Thadm.app/Contents/Info.plist CFBundleIdentifier
# Expected: com.thadm.desktop

# Step 2: What does the code signature say?
codesign -dr - /Applications/Thadm.app
# Expected: identifier "com.thadm.desktop"

# Step 3: What does Launch Services have cached?
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -dump | grep "identifier:" | grep "com.thadm"
# Expected: ONLY com.thadm.desktop entries

# Step 4: What's in the TCC database?
sudo sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" \
  "SELECT service, client, auth_value FROM access WHERE client LIKE '%thadm%' ORDER BY client;"
# Expected: kTCCServiceScreenCapture|com.thadm.desktop|2
```

### Dev vs Prod: Different Identity Paths

```
PRODUCTION (installed .app):
  Info.plist → bundle ID → TCC key = "com.thadm.desktop"

DEVELOPMENT (bare executable via `bun tauri dev`):
  No Info.plist → no bundle ID → TCC key = ABSOLUTE PATH
  e.g., "/Users/.../target/debug/thadm"

These are COMPLETELY SEPARATE TCC entries.
Dev having permission does NOT mean prod has it.
```

---

## The Permission Check Journey (Code Trace)

Here's the exact code path when thadm checks screen recording permission:

### Step 1: Something triggers a permission check

Multiple places call `do_permissions_check()`:

```
Callers:
  - spawn_screenpipe()      → before spawning sidecar
  - SidecarManager::spawn() → before spawning sidecar (yes, checked twice!)
  - Permission monitor      → every 30 seconds
  - Permission recovery UI  → every 500ms (polling)
  - Onboarding flow         → on page load
```

### Step 2: `do_permissions_check()` runs

```
File: screenpipe-app-tauri/src-tauri/src/permissions.rs:312-360

do_permissions_check(initial_check: bool)
  │
  ├─ Screen Recording:
  │    ScreenCaptureAccess.preflight()
  │      │
  │      └─ CGPreflightScreenCaptureAccess()    ← macOS C API
  │           │
  │           ├─ true  → Granted
  │           ├─ false + initial_check=true  → Empty (first launch, never asked)
  │           └─ false + initial_check=false → Denied
  │
  ├─ Microphone:
  │    AVCaptureDevice.authorizationStatus(for: .audio)
  │      │
  │      ├─ NotDetermined → Empty
  │      ├─ Authorized    → Granted
  │      └─ other         → Denied
  │
  └─ Accessibility:
       AXIsProcessTrusted()
         │
         ├─ true  → Granted
         └─ false → Denied
```

### Step 3: Permission result used to gate sidecar spawn

```
File: screenpipe-app-tauri/src-tauri/src/sidecar.rs:250-284

spawn_screenpipe() {
  │
  ├─ do_permissions_check(false)
  │
  ├─ if screen_recording == Denied:
  │     return Err("Screen recording permission required...")  ← BLOCKS HERE
  │
  ├─ if microphone == Denied && audio_enabled:
  │     warn("Microphone not granted")  ← logs warning but CONTINUES
  │
  └─ SidecarManager::spawn()
       │
       ├─ do_permissions_check(false)   ← CHECKS AGAIN (redundant)
       │
       ├─ if screen_recording == Denied:
       │     return Err(...)            ← BLOCKS AGAIN
       │
       └─ spawn_sidecar()              ← actually launches thadm-recorder
```

### Step 4: What `CGPreflightScreenCaptureAccess()` does internally

```
CGPreflightScreenCaptureAccess()
  │
  ├─ Reads TCC database (SYSTEM-level)
  │    service = "kTCCServiceScreenCapture"
  │    client  = bundle ID of calling process
  │
  ├─ Validates code signature of calling process
  │    Must match a valid Developer ID
  │    Team ID must match the TCC entry
  │
  ├─ Returns:
  │    true  = app is in TCC list AND toggled ON
  │    false = app is NOT in list, OR toggled OFF, OR signature mismatch
  │
  └─ IMPORTANT: This checks the MAIN APP's permission,
     NOT the sidecar's permission. The sidecar is a
     separate binary that does the actual screen capture.
```

---

## Why Permission Shows "Denied" Even After Granting

### The 5 possible reasons

```
Reason 1: App requires restart after granting
┌──────────────────────────────────────────────┐
│ macOS caches the permission state per-process│
│ The running process still has the old        │
│ "denied" state cached in memory              │
│                                              │
│ Fix: Restart the app                         │
│ Status: User DID restart, still denied       │
└──────────────────────────────────────────────┘

Reason 2: Added but not toggled ON
┌──────────────────────────────────────────────┐
│ The app appears in System Settings list       │
│ but the toggle switch is OFF                 │
│                                              │
│ In System Settings, the app must have a      │
│ checked checkbox / enabled toggle            │
│                                              │
│ Fix: Make sure toggle is ON, not just listed │
└──────────────────────────────────────────────┘

Reason 3: Wrong TCC database queried
┌──────────────────────────────────────────────┐
│ Screen Recording is in SYSTEM-level TCC      │
│ We queried USER-level TCC and found nothing  │
│ This doesn't mean the entry is missing       │
│                                              │
│ Fix: Query with sudo:                        │
│ sudo sqlite3 "/Library/Application Support/  │
│   com.apple.TCC/TCC.db" "SELECT client,      │
│   auth_value FROM access WHERE service=       │
│   'kTCCServiceScreenCapture';"               │
└──────────────────────────────────────────────┘

Reason 4: Main app vs sidecar mismatch
┌──────────────────────────────────────────────┐
│ The MAIN APP (thadm) checks preflight()      │
│ The SIDECAR (thadm-recorder) does capture    │
│                                              │
│ On Sequoia, these may need SEPARATE          │
│ TCC entries. Adding Thadm.app grants         │
│ permission to the main app, but the          │
│ sidecar may be treated as a different entity │
│                                              │
│ This is an architectural issue               │
└──────────────────────────────────────────────┘

Reason 5: macOS Sequoia bypass dialog not approved
┌──────────────────────────────────────────────┐
│ Even with TCC granted, Sequoia has a SECOND  │
│ permission layer (replayd bypass dialog)     │
│ that CGPreflightScreenCaptureAccess() does   │
│ NOT check                                    │
│                                              │
│ The sidecar may be blocked at this layer     │
│ even though preflight() returns true         │
└──────────────────────────────────────────────┘
```

### What happened to the user (timeline from logs)

```
12:24:38  App launched (new build installed to /Applications)
          │
12:24:48  Permission check: screen=Empty (never asked in this process)
          │
12:24:53  Permission monitor starts
          Permission check: screen=Denied, mic=Granted, accessibility=Denied
          │
          Why Denied? New binary was installed. Either:
          - TCC entry from old build doesn't match new code signature
          - TCC entry was cleared when old app was replaced
          - User hasn't added new build to Screen Recording yet
          │
12:25:23  Permission monitor: screen_fails=1
12:25:53  Permission monitor: screen_fails=2 → triggers permission-lost event
          Permission recovery window opens
          │
12:26:36  User clicked "Reset & Fix"
          → called requestPermission() (just shows dialog)
          → did NOT call resetAndRequestPermission() (which runs tccutil)
          → user went to System Settings and added Thadm
          │
          But... the user added the app while the OLD process was running.
          macOS caches permission per-process.
          │
12:26:52  User manually restarted app
          New process starts
          Permission check: screen=Denied  ← STILL DENIED!
          │
          Why? Either:
          - The TCC entry wasn't actually saved properly
          - The toggle was listed but not ON
          - Need to check system-level TCC database to know for sure
          │
12:27:07  User clicked "Start Recording" in tray
          spawn_screenpipe() → screen=Denied → BLOCKED
          Error: "Screen recording permission required"
          Opens permission recovery window again
          │
12:27:32  Permission monitor: screen=Denied (keeps failing)
  ...
12:31:55  User clicked "Start Recording" again → still Denied
```

---

## Launch Services Cache Poisoning (Root Cause Found 2026-02-20)

This was the root cause of Screen Recording appearing "Denied" even after the user
added Thadm in System Settings and toggled it ON.

### What Happened

```
TIMELINE OF THE BUG:

1. During rebrand, app was built multiple times with different bundle IDs
   before the final ID was chosen.

   Early builds:  com.thadm.app     (proposed in REBRAND_TICKETS.md)
                  executable: screenpipe-app (old name)

   Final build:   com.thadm.desktop  (actually committed)
                  executable: thadm

2. Each build was installed via DMG. Each DMG mount created a
   Launch Services entry:

   /Volumes/dmg.vqKERQ/Thadm.app  → identifier: com.thadm.app
   /Volumes/dmg.fBM3eP/Thadm.app  → identifier: com.thadm.app
   /Volumes/dmg.eMipiW/Thadm.app  → identifier: com.thadm.app
   /Volumes/dmg.8ClHYz/Thadm.app  → identifier: com.thadm.app
   /Volumes/dmg.WQ1Owl/Thadm.app  → identifier: com.thadm.app
   /Volumes/dmg.VJQEPu/Thadm.app  → identifier: com.thadm.app
   /Volumes/dmg.tm6bjT/Thadm.app  → identifier: com.thadm.app
   (7 stale entries!)

   These persisted even after the DMGs were unmounted.

3. Current app at /Applications/Thadm.app has:
   identifier: com.thadm.desktop  (correct)

4. BUT when user adds "Thadm" in System Settings → Screen Recording,
   macOS resolves the name through Launch Services:

   System Settings: "Add Thadm"
        │
        ▼
   Launch Services: "Which Thadm?"
        │
        ├─ /Volumes/dmg.vqKERQ/Thadm.app → com.thadm.app  ← 7 entries!
        ├─ /Volumes/dmg.fBM3eP/Thadm.app → com.thadm.app
        ├─ ...
        └─ /Applications/Thadm.app       → com.thadm.desktop ← 1 entry
        │
        ▼
   macOS picks com.thadm.app (majority wins? first match?)
        │
        ▼
   TCC stores: kTCCServiceScreenCapture | com.thadm.app | 2 (allowed)
        │
        ▼
   App runs as com.thadm.desktop
   CGPreflightScreenCaptureAccess() looks up com.thadm.desktop
   NOT FOUND in TCC → returns false → "Denied"
```

### The Evidence

```
TCC BEFORE fix:
  kTCCServiceScreenCapture | com.thadm.app     | 2 (allowed)   ← WRONG ID
  kTCCServiceScreenCapture | com.thadm.desktop  | (not found)   ← REAL ID MISSING
  kTCCServiceAccessibility | com.thadm.desktop  | 2 (allowed)   ← correct

Launch Services BEFORE fix (7 stale + 1 correct):
  identifier: com.thadm.app      (from /Volumes/dmg.vqKERQ/Thadm.app)
  identifier: com.thadm.app      (from /Volumes/dmg.fBM3eP/Thadm.app)
  identifier: com.thadm.app      (from /Volumes/dmg.eMipiW/Thadm.app)
  identifier: com.thadm.app      (from /Volumes/dmg.8ClHYz/Thadm.app)
  identifier: com.thadm.app      (from /Volumes/dmg.WQ1Owl/Thadm.app)
  identifier: com.thadm.app      (from /Volumes/dmg.VJQEPu/Thadm.app)
  identifier: com.thadm.app      (from /Volumes/dmg.tm6bjT/Thadm.app)
  identifier: com.thadm.desktop  (from /Applications/Thadm.app)

System Settings → Screen Recording showed ONE "Thadm" entry
with toggle ON — but it was mapped to com.thadm.app (stale).
```

### The Fix

```bash
# Step 1: Unregister all stale DMG entries
lsregister -u /Volumes/dmg.vqKERQ/Thadm.app
lsregister -u /Volumes/dmg.fBM3eP/Thadm.app
lsregister -u /Volumes/dmg.eMipiW/Thadm.app
lsregister -u /Volumes/dmg.8ClHYz/Thadm.app
lsregister -u /Volumes/dmg.WQ1Owl/Thadm.app
lsregister -u /Volumes/dmg.VJQEPu/Thadm.app
lsregister -u /Volumes/dmg.tm6bjT/Thadm.app

# (lsregister path:
#  /System/Library/Frameworks/CoreServices.framework/Frameworks/
#  LaunchServices.framework/Support/lsregister)

# Step 2: Force re-register the current app
lsregister -f /Applications/Thadm.app

# Step 3: Verify — ONLY com.thadm.desktop should remain
lsregister -dump | grep "identifier:" | grep "com.thadm"

# Step 4: In System Settings → Screen Recording:
#   - Remove "Thadm" (click "-")
#   - Re-add /Applications/Thadm.app (click "+")

# Step 5: Verify TCC has the correct bundle ID
sudo sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" \
  "SELECT service, client, auth_value FROM access WHERE client LIKE '%thadm%';"
# Should show: kTCCServiceScreenCapture|com.thadm.desktop|2
```

### After Fix

```
TCC AFTER fix:
  kTCCServiceScreenCapture | com.thadm.desktop  | 2 (allowed)   ← CORRECT
  kTCCServiceAccessibility | com.thadm.desktop  | 2 (allowed)   ← correct

Launch Services AFTER fix:
  identifier: com.thadm.desktop  (ALL entries are now correct)
```

### Key Takeaways

```
1. DMG installs create Launch Services entries that PERSIST after unmount.
   Each install = one entry. They accumulate silently.

2. Changing bundle ID between builds creates a poisoned cache.
   Old entries outnumber the current one → System Settings resolves
   to the wrong bundle ID.

3. System Settings UI shows ONE "Thadm" entry regardless.
   You can't tell from the UI that it's mapped to the wrong bundle ID.
   Only a TCC database query reveals the mismatch.

4. tccutil reset CANNOT fix this.
   - tccutil said "Successfully reset" but didn't modify system-level TCC (SIP)
   - Even if it worked, the stale Launch Services entries would
     re-create the wrong TCC entry on next add

5. The ONLY reliable fix is:
   - Clean Launch Services (lsregister -u stale paths)
   - Remove + re-add in System Settings
   - Verify with TCC query

6. PREVENTION: After changing a bundle ID, always run:
   lsregister -dump | grep "identifier:" | grep "<app_name>"
   to verify no stale entries exist.
```

### tccutil Limitations on macOS Sequoia

```
┌──────────────────────────────────────────────────────────────────────┐
│  tccutil behavior on Sequoia (15.x)                                  │
│                                                                      │
│  Permission        │ TCC Level    │ tccutil works? │ Verified?       │
│  ──────────────────┼──────────────┼────────────────┼──────────────── │
│  Microphone        │ User-level   │ YES            │ Tested ✓        │
│  Screen Recording  │ System-level │ NO (SIP)       │ Tested ✓        │
│  Accessibility     │ System-level │ Likely NO      │ Not tested      │
│                                                                      │
│  IMPORTANT: tccutil reports "Successfully reset" even when           │
│  SIP blocks the actual modification. Always verify with a            │
│  TCC database query after running tccutil.                           │
│                                                                      │
│  Direct sqlite3 writes are also blocked:                             │
│    sudo sqlite3 TCC.db "DELETE..." → "attempt to write a readonly   │
│    database" even with sudo. SIP protects the system TCC database.  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## The "Reset & Fix" Button Flow

### What it SHOULD do vs what it ACTUALLY does

```
WHAT THE BUTTON SHOULD DO:
┌───────────────────────────────────────┐
│ 1. tccutil reset ScreenCapture        │
│    com.thadm.desktop                  │
│    (clear stale TCC entry)            │
│                                       │
│ 2. tccutil reset ScreenCapture        │
│    thadm-recorder                     │  ← BUG: not a valid bundle ID
│    (clear sidecar entry)              │
│                                       │
│ 3. Wait 500ms                         │
│                                       │
│ 4. CGRequestScreenCaptureAccess()     │
│    (show fresh permission dialog)     │
│                                       │
│ Function: resetAndRequestPermission() │
│ File: permissions.rs:219-280          │
└───────────────────────────────────────┘

WHAT THE BUTTON ACTUALLY DOES (after fix 2026-02-20):
┌───────────────────────────────────────┐
│ 1. tccutil reset <service> <bundle>   │
│ 2. Wait 500ms                         │
│ 3. Re-request permission              │
│                                       │
│ Function: resetAndRequestPermission() │
│ File: permissions.rs:219-280          │
│                                       │
│ WORKS FOR: Microphone (user-level TCC)│
│ DOES NOT WORK FOR: Screen Recording   │
│   on Sequoia (system-level TCC,       │
│   tccutil blocked by SIP)             │
└───────────────────────────────────────┘

WHAT IT USED TO DO (before fix):
  permission-recovery/page.tsx:179 called
  commands.requestPermission() (just shows dialog, no reset)
  instead of commands.resetAndRequestPermission()

FIX (2026-02-20):
  1. Added TypeScript binding for resetAndRequestPermission in tauri.ts
  2. Changed page.tsx:179 to call resetAndRequestPermission
```

### Additional bug in `resetAndRequestPermission`

```
Even if we fix the button to call resetAndRequestPermission:

tccutil reset ScreenCapture "thadm-recorder"
                              ^^^^^^^^^^^^
                              NOT a valid bundle ID!

thadm-recorder is a bare executable, not a .app bundle.
tccutil expects a bundle ID like "com.thadm.desktop"
or an absolute path. This command silently does nothing.

Also: tccutil may not work for Screen Recording on Sequoia
because Screen Recording is in the SYSTEM-level TCC database
and tccutil may only modify the USER-level database.
```

---

## The Permission Recovery Window Flow

### How it opens

```
TWO paths can open the permission recovery window:

Path A: Permission Monitor (automatic, background)
──────────────────────────────────────────────────
permissions.rs:365-450

Every 30 seconds:
  check permissions
  if screen OR mic denied for 3 consecutive checks (~90s):
    emit "permission-lost" event to frontend

Frontend (use-permission-monitor.tsx:25):
  listen for "permission-lost" event
  double-check permissions (avoid false positives)
  if confirmed:
    commands.showWindow("PermissionRecovery")


Path B: Tray "Start Recording" fails (manual)
──────────────────────────────────────────────
tray.rs:193-216

User clicks "Start Recording"
  spawn_screenpipe() → returns Err("...permission...")
  if error contains "permission":
    ShowRewindWindow::PermissionRecovery.show(&app)
```

### What happens inside the window

```
permission-recovery/page.tsx

On mount:
  ┌─────────────────────────────────────┐
  │ Start polling permissions every     │
  │ 500ms via setInterval               │
  │                                     │
  │ Each poll:                          │
  │   commands.doPermissionsCheck(false) │
  │   setPermissions(result)            │
  │   → triggers useEffect             │
  └─────────────────────────────────────┘

useEffect (runs on every permissions change):
  ┌─────────────────────────────────────┐
  │ if screen=OK AND mic=OK:           │
  │   if !isRestartingRef.current:     │  ← guard (added 2026-02-19)
  │     isRestartingRef = true         │
  │     setTimeout(1500ms):            │
  │       stopScreenpipe()             │
  │       spawnScreenpipe()            │
  │       closeWindow("PermRecovery") │
  │                                    │
  │ BUG (FIXED): Without the ref      │
  │ guard, every poll created a NEW    │
  │ setTimeout, causing a crash loop   │
  │ of stop→spawn every ~1 second     │
  └─────────────────────────────────────┘
```

---

## All 21 Recording Start/Stop Entry Points

### Visual Overview

```
                        ┌──────────────────┐
                        │  spawn_screenpipe │
                        │  (Rust, sidecar.rs│
                        │   line 250)       │
                        └────────▲─────────┘
                                 │
         ┌───────────────────────┼──────────────────────────┐
         │                       │                          │
    MANUAL (user)           AUTO (system)              API (HTTP)
         │                       │                          │
    ┌────┴────┐            ┌─────┴─────┐              ┌─────┴─────┐
    │ Tray    │            │ App       │              │ HTTP      │
    │ Start   │            │ Startup   │              │ :11435    │
    │ (#1)    │            │ (#18)     │              │ /start    │
    │         │            │           │              │ (#16)     │
    │ Shortcut│            │ Perm      │              └───────────┘
    │ Start   │            │ Recovery  │
    │ (#2)    │            │ (#10)     │
    │         │            │           │
    │ Onboard │            │ Onboard   │
    │ Status  │            │ Health    │
    │ (#11)   │            │ Check     │
    │         │            │ (#13)     │
    │ Dev     │            └───────────┘
    │ Mode    │
    │ (#8)    │
    │         │
    │ Settings│
    │ Restart │
    │ (#6,7)  │
    │         │
    │ Status  │
    │ Dialog  │
    │ (#20)   │
    │         │
    │ Main    │
    │ Page    │
    │ (#21)   │
    └─────────┘
```

### Detailed Table

| # | Trigger | File:Line | Pattern | Stop First? | Can Loop? |
|---|---------|-----------|---------|-------------|-----------|
| **MANUAL — User Clicks Something** |||||
| 1 | Tray: Start Recording | `tray.rs:187` | spawn | No | No |
| 2 | Keyboard shortcut: start | `deeplink-handler.tsx:78` | spawn | No | No |
| 3 | Keyboard shortcut: stop | `deeplink-handler.tsx:95` | stop | N/A | No |
| 4 | Tray: Stop Recording | `tray.rs:222` | stop | N/A | No |
| 5 | Tray: Quit | `tray.rs:298` | stop → exit | Yes | No |
| 6 | Recording settings change | `recording-settings-provider.tsx:175` | stop → 1s → spawn | Yes | No |
| 7 | General settings change | `general-settings.tsx:84` | stop → 1s → spawn | Yes | No |
| 8 | Dev mode: Start button | `dev-mode-settings.tsx:124` | spawn | No | No |
| 9 | Dev mode: Stop button | `dev-mode-settings.tsx:155` | stop | N/A | No |
| 11 | Onboarding: Start Recording | `onboarding/status.tsx:356` | stop → 1s → spawn | Yes | No (guarded) |
| 12 | Onboarding: non-dev choice | `dev-or-non-dev.tsx:94` | spawn | No | No |
| 20 | Status dialog: Restart | `screenpipe-status.tsx:60` | stop → 2s → spawn | Yes | No |
| 21 | Main page: Restart | `page.tsx:97` | stop → 2s → spawn | Yes | No |
| **AUTOMATIC — System Triggered** |||||
| 10 | Permission recovery: fixed | `permission-recovery/page.tsx:137` | stop → spawn → close | Yes | **Was looping (fixed)** |
| 13 | Onboarding: health check fail | `pipe-store.tsx:42` | stop → 1s → spawn | Yes | **Yes (can retry)** |
| 18 | App startup (non-dev mode) | `main.rs:1057` | spawn | No | No |
| 19 | Permission monitor: lost | `permissions.rs:421` | emit event → open window | No | **Yes (every 30s)** |
| 14 | Updater: pre-install | `updates.rs:150` | stop | Yes | No |
| 15 | Windows updater | `updater.tsx:51` | stop | Yes | No |
| **HTTP API** |||||
| 16 | POST /start-sidecar | `server.rs:377` | spawn | No | If called |
| 17 | POST /stop-sidecar | `server.rs:404` | stop | N/A | If called |

### The Common Pattern

Most restart paths follow this pattern:

```
await commands.stopScreenpipe();          // 1. Stop sidecar
await new Promise(r => setTimeout(r, N)); // 2. Wait N ms (1000-2000)
await commands.spawnScreenpipe(null);     // 3. Start sidecar
```

---

## The Crash Loop Bug (Found & Fixed)

### Root Cause

```
TWO bugs combined to create a crash loop:

Bug 1: Permission monitor fires for accessibility alone
────────────────────────────────────────────────────────
permissions.rs:421 had:
  if screen_confirmed_lost || mic_confirmed_lost || accessibility_confirmed_lost

Accessibility is always Denied (we never set it up).
After 3 checks (90 seconds), the monitor emits permission-lost.
The frontend opens the permission recovery window.
But screen and mic are both GRANTED — the window opens for no good reason.

Fix: Only emit for critical permissions (screen or mic):
  if screen_confirmed_lost || mic_confirmed_lost


Bug 2: Unbounded setTimeout in permission recovery page
───────────────────────────────────────────────────────
permission-recovery/page.tsx:

  Every 500ms: poll permissions → update state → trigger useEffect
  useEffect: if allCriticalOk → setTimeout(1500ms, stop + spawn + close)

  Since permissions are OK (screen+mic granted), EVERY poll creates
  a new setTimeout. After the first 1500ms, they start firing:

  T=0:      poll → setTimeout(T+1500)
  T=500:    poll → setTimeout(T+2000)
  T=1000:   poll → setTimeout(T+2500)
  T=1500:   FIRE → stop + spawn
  T=2000:   FIRE → stop + spawn    ← sidecar killed after ~0.5s!
  T=2500:   FIRE → stop + spawn    ← and again!
  ...forever

Fix: Added useRef guard (isRestartingRef) so restart fires only ONCE.
```

### Evidence from Trace Logs

```
12:16:29.909  [SPAWN_TRACE] sidecar spawned PID=49292
12:16:30.814  [STOP_TRACE]  stop_screenpipe() CALLED     ← 0.9s later!
12:16:30.854  [EVENT_TRACE] PID=49292 TERMINATED signal=15 (SIGTERM)
12:16:30.910  [SPAWN_TRACE] sidecar spawned PID=49370
12:16:31.816  [STOP_TRACE]  stop_screenpipe() CALLED     ← 0.9s later!
12:16:31.855  [EVENT_TRACE] PID=49370 TERMINATED signal=15
12:16:31.908  [SPAWN_TRACE] sidecar spawned PID=49424
12:16:32.817  [STOP_TRACE]  stop_screenpipe() CALLED     ← 0.9s later!
...repeats forever, 684K+ log lines generated
```

---

## Known Bugs & Gaps

### Bug: "Reset & Fix" doesn't actually reset

```
Status: FIXED (2026-02-20)
File:   permission-recovery/page.tsx:179, lib/utils/tauri.ts
Fix:    Added TypeScript binding for resetAndRequestPermission.
        Changed page.tsx to call resetAndRequestPermission instead of requestPermission.
        Now calls tccutil reset before re-requesting.
Note:   Works for Microphone (user-level TCC).
        Still does NOT work for Screen Recording on Sequoia (tccutil blocked by SIP).
```

### Bug: tccutil uses invalid identifier for sidecar

```
Status: OPEN
File:   permissions.rs:252-254
Issue:  tccutil reset ScreenCapture "thadm-recorder"
        "thadm-recorder" is not a bundle ID.
        tccutil expects bundle ID or nothing.
Impact: Sidecar TCC entry is never actually reset.
```

### Bug: tccutil does NOT work for Screen Recording on Sequoia

```
Status: VERIFIED (2026-02-20)
Issue:  Screen Recording is in SYSTEM-level TCC database.
        tccutil only modifies USER-level database.
        SIP blocks both tccutil and direct sqlite3 writes to system TCC.
        tccutil reports "Successfully reset" but does NOTHING.
Impact: "Reset & Fix" for Screen Recording is fundamentally broken on Sequoia.
        The only fix is manual: clean Launch Services + remove/re-add in System Settings.
Tested: tccutil reset ScreenCapture com.thadm.app → "Successfully reset"
        but TCC entry remained unchanged. Confirmed with sqlite3 query.
```

### Gap: Main app gates on permission that sidecar needs

```
Status: ARCHITECTURAL
File:   sidecar.rs:261
Issue:  Main app calls CGPreflightScreenCaptureAccess() and blocks
        sidecar spawn if denied. But it's the SIDECAR that needs
        the permission, not the main app. These could have different
        permission states on Sequoia.
Impact: Main app could block sidecar even when sidecar has permission,
        or allow sidecar when sidecar doesn't have permission.
```

### Gap: Permission checked twice before spawn

```
Status: MINOR
Files:  sidecar.rs:256 (spawn_screenpipe) and sidecar.rs:677 (SidecarManager::spawn)
Issue:  do_permissions_check() is called in BOTH functions.
        spawn_screenpipe() checks, then calls manager.spawn() which checks again.
Impact: Redundant work, confusing code flow.
```

### Gap: We never verified system-level TCC database

```
Status: RESOLVED (2026-02-20)
Findings:
  - System TCC had com.thadm.app (stale, from old DMG builds)
  - com.thadm.desktop was MISSING from system TCC
  - Root cause: Launch Services cache poisoning (see section above)
  - After cleaning Launch Services + re-adding app: com.thadm.desktop|2 (allowed)
```

---

## How to Debug Permission Issues

### Step 1: Check what the app sees

```bash
# Look at the latest permission check results in the log:
grep "PERM_CHECK" ~/.thadm/thadm.$(date +%Y-%m-%d).log | tail -5
```

### Step 2: Check the SYSTEM TCC database (requires sudo)

```bash
sudo sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" \
  "SELECT service, client, client_type, auth_value FROM access
   WHERE client LIKE '%thadm%' OR client LIKE '%Thadm%';"

# client_type: 0 = bundle ID, 1 = absolute path
# auth_value: 0 = denied, 2 = allowed, 3 = limited
```

### Step 3: Check what trace logging says

```bash
# Spawn/stop trace:
grep -E '\[SPAWN_TRACE\]|\[STOP_TRACE\]|\[EVENT_TRACE\]' \
  ~/.thadm/thadm.$(date +%Y-%m-%d).log | tail -20

# Permission monitor:
grep 'PERM_MONITOR' ~/.thadm/thadm.$(date +%Y-%m-%d).log | tail -10
```

### Step 4: Manually test the sidecar

```bash
# If the sidecar runs fine standalone, the problem is in the Tauri spawn flow:
/Applications/Thadm.app/Contents/MacOS/thadm-recorder --port 3030

# If it crashes or shows permission errors, the sidecar itself lacks permission.
```

### Step 5: Nuclear option — reset all TCC entries

```bash
# Reset Screen Recording for the bundle ID:
tccutil reset ScreenCapture com.thadm.desktop

# Then restart the app and re-grant permission in System Settings.
# NOTE: This may not work on Sequoia (see known bugs above).
```

---

## Files Changed

### 2026-02-19

| File | Change | Status |
|------|--------|--------|
| `permission-recovery/page.tsx` | Added `useRef` guard to prevent crash loop | Done |
| `permissions.rs:421` | Only emit permission-lost for screen/mic, not accessibility | Done |
| `sidecar.rs` | Added `[SPAWN_TRACE]`, `[STOP_TRACE]`, `[EVENT_TRACE]` logging | Done |
| `server.rs` | Added `[SPAWN_TRACE]`, `[STOP_TRACE]` to HTTP endpoints | Done |
| `build.sh` | Added `cd "$PROJECT_ROOT"` fix from previous session | Done |

### 2026-02-20

| File | Change | Status |
|------|--------|--------|
| `permission-recovery/page.tsx:179` | Changed `requestPermission` → `resetAndRequestPermission` | Done |
| `lib/utils/tauri.ts` | Added missing `resetAndRequestPermission` TypeScript binding | Done |
| `REBRAND_TICKETS.md` | Fixed stale `com.thadm.app` → `com.thadm.desktop` | Done |
| Launch Services (system) | Removed 7 stale DMG entries via `lsregister -u` | Done |
| TCC database (system) | `com.thadm.desktop` now registered for ScreenCapture | Done |
