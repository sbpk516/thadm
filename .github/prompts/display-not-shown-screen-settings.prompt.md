---
description: Systematically debug why Display 1 is not shown in the Screen Settings page of the thadm desktop app by investigating all layers from UI rendering to platform APIs.
---

# Debug: Display Not Shown in Screen Settings

## Description

As part of this debugging session, you will systematically investigate why physical monitors (e.g., "Display 1") do not appear in the Screen Settings page of the thadm desktop app. You will trace the full signal chain from the UI component through the settings provider, sidecar CLI, and platform-level monitor detection to identify the root cause.

**IMPORTANT: This is a DEBUGGING / ROOT CAUSE ANALYSIS task**. This task involves:

1. Reading source files across multiple layers (UI, hooks, Rust backend, platform APIs)
2. Testing the sidecar CLI command directly to verify monitor detection
3. Checking configuration files (capabilities, settings defaults)
4. Checking macOS permissions (screen recording, ScreenCaptureKit)
5. Documenting findings at each layer in a tracking document
6. Proposing a targeted fix after the root cause is confirmed

**This task does NOT involve**:

1. Refactoring or "improving" code unrelated to the bug
2. Changing settings defaults without understanding the full impact
3. Modifying the database schema or migrations
4. Adding new features or UI components
5. Making code changes before the root cause is confirmed

## ⚠️ CRITICAL: INVESTIGATE BEFORE FIXING

**Your ONLY goal is to find the root cause with evidence, then propose a minimal fix.**

This task is for **debugging and root cause analysis**. Your role is to:

1. **TRACE** the monitor display flow from UI to platform API
2. **TEST** each layer independently to isolate where the break occurs
3. **DOCUMENT** findings with exact file paths, line numbers, and evidence
4. **DIAGNOSE** the root cause based on collected evidence
5. **PROPOSE** a targeted fix — the smallest change that solves the problem

**You must NEVER**:

1. Make code changes before confirming the root cause
2. Skip any investigation layer (UI → Provider → Sidecar → Platform → Capabilities)
3. Assume the bug is in one layer without checking others
4. Refactor, rename, or "improve" code that isn't part of the bug
5. Add dependencies or change architecture
6. Propose changes to more than 3 files without explicit approval

**All investigation findings must be recorded in `./tmp/display-debug-tracking.md`.**

## Architecture: Monitor Display Signal Chain

Understanding the full flow is essential. Monitors pass through these layers:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: UI Component                                       │
│ screen-settings.tsx                                         │
│ Renders availableMonitors — BUT only if useAllMonitors=false│
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Data Provider                                      │
│ recording-settings-provider.tsx                             │
│ Calls sidecar CLI: thadm-recorder vision list -o json      │
│ Parses JSON → sets availableMonitors state                  │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: Sidecar CLI                                        │
│ screenpipe-server/src/bin/screenpipe-server.rs              │
│ Handles `vision list` subcommand                            │
│ Calls list_monitors() → returns JSON                        │
├─────────────────────────────────────────────────────────────┤
│ Layer 4: Platform Monitor Detection                         │
│ screenpipe-vision/src/monitor.rs                            │
│ Uses xcap/ScreenCaptureKit to enumerate monitors            │
│ Returns Vec<SafeMonitor>                                    │
├─────────────────────────────────────────────────────────────┤
│ Layer 5: Tauri Capabilities                                 │
│ src-tauri/gen/schemas/capabilities.json                     │
│ Must have "cmd": "thadm-recorder" with "sidecar": true     │
│ If misconfigured, sidecar command is blocked entirely       │
└─────────────────────────────────────────────────────────────┘
```

## Known Conditions That Hide Monitors

| Condition | Layer | Effect |
|-----------|-------|--------|
| `useAllMonitors === true` (DEFAULT) | UI | Monitor selection UI is **completely hidden** |
| Sidecar `vision list` command fails | Provider | `availableMonitors = []` → empty list |
| Screen recording permission denied | Platform | `list_monitors()` returns `[]` |
| Capabilities `cmd` mismatch | Capabilities | Sidecar command blocked → never executes |
| Sidecar binary not running/found | Provider | Command execution fails → `[]` |

## Key Files

| Component | Relative Path |
|-----------|---------------|
| Screen Settings UI | `screenpipe-app-tauri/components/settings/screen-settings.tsx` |
| Recording Settings Provider | `screenpipe-app-tauri/components/settings/recording-settings-provider.tsx` |
| Settings Hook (defaults) | `screenpipe-app-tauri/lib/hooks/use-settings.tsx` |
| Tauri Commands (TS) | `screenpipe-app-tauri/lib/utils/tauri.ts` |
| Sidecar CLI handler | `screenpipe-server/src/bin/screenpipe-server.rs` |
| Monitor detection (Rust) | `screenpipe-vision/src/monitor.rs` |
| Capabilities config | `screenpipe-app-tauri/src-tauri/gen/schemas/capabilities.json` |
| Capabilities source | `screenpipe-app-tauri/src-tauri/capabilities/main.json` |

## Writing Guidelines for Investigation

### 1. Always Include Evidence

**Good**: "Monitor list hidden because `useAllMonitors` is `true` at `use-settings.tsx:219`. The conditional at `screen-settings.tsx:113` `{!settings.useAllMonitors && (...)}` prevents rendering."

**Bad**: "Monitor list seems to be hidden by a setting."

### 2. Test Each Layer Independently

**Good**: "Ran `./screenpipe-app-tauri/src-tauri/thadm-recorder-aarch64-apple-darwin vision list -o json` directly. Output: `{ "data": [{ "id": 1, "name": "Built-in Retina Display", ... }], "success": true }`. Monitor detection works at the sidecar level."

**Bad**: "The sidecar probably works fine."

### 3. Record Exact File Paths and Line Numbers

**Good**: "`screen-settings.tsx:113` — conditional render gate"

**Bad**: "somewhere in the screen settings file"

### 4. Distinguish Bug from Design

**Good**: "`useAllMonitors` defaults to `true` at `use-settings.tsx:219`. This is intentional — it means 'record all monitors without manual selection.' The monitor list being hidden when this is true is **by design**, not a bug."

**Bad**: "useAllMonitors hides monitors, this is the bug."

## Output Requirements

### File Location

- **Tracking Document**: `./tmp/display-debug-tracking.md`
- **Create Directory**: Create `./tmp/` if it doesn't exist

### File Format

- **Format**: Markdown
- **Sections**: One per investigation layer
- **Evidence**: Every finding must include file path and line number

### Content Requirements

The tracking document must include:

1. **Investigation Summary**: One-paragraph overview of findings
2. **Layer-by-Layer Findings**: Detailed results for each of the 5 layers
3. **Root Cause**: Clear statement of what causes the issue, with evidence
4. **Recommended Fix**: Specific code changes with file paths and line numbers
5. **Risk Assessment**: What could break if the fix is applied

### Quality Standards

The tracking document must be:

- **Evidence-Based**: Every claim backed by file path, line number, or command output
- **Complete**: All 5 layers investigated, no shortcuts
- **Specific**: Exact code references, not vague descriptions
- **Actionable**: Fix is concrete enough to implement immediately

---

# ⚠️ MANDATORY DEBUGGING PROCESS ⚠️

**READ THIS SECTION COMPLETELY BEFORE STARTING ANY WORK**

This section contains the **MANDATORY step-by-step process** you MUST follow. **DO NOT SKIP ANY STEPS**. **DO NOT JUMP AHEAD**. Each phase must be completed in order.

## Critical Process Rules

**YOU MUST:**

1. ✅ Complete **ALL 9 PHASES** in sequential order (0 through 8)
2. ✅ Create a tracking document at `./tmp/display-debug-tracking.md` in Phase 0
3. ✅ Update the tracking document **AFTER EACH PHASE** before proceeding
4. ✅ Include exact file paths and line numbers for every finding
5. ✅ Test the sidecar CLI directly in Phase 3 (do not skip)
6. ✅ Check `useAllMonitors` value FIRST — it is the most common cause
7. ✅ Confirm root cause with evidence before proposing a fix
8. ✅ Keep the fix minimal — smallest diff that solves the problem

**YOU MUST NOT:**

1. ❌ Skip any investigation layer
2. ❌ Make code changes before completing Phase 6 (Diagnosis)
3. ❌ Assume the bug is in one layer without checking others
4. ❌ Refactor or "improve" code unrelated to this bug
5. ❌ Propose changes to more than 3 files without approval
6. ❌ Change settings defaults without understanding downstream effects
7. ❌ Ignore the `useAllMonitors` setting — it is the #1 cause of "missing monitors"

**FAILURE TO FOLLOW THIS PROCESS INVALIDATES YOUR WORK**

---

## PHASE 0: Setup Investigation Tracking

**⚠️ MANDATORY FIRST STEP — DO THIS BEFORE ANY INVESTIGATION ⚠️**

**Action**: Create `./tmp/display-debug-tracking.md` with this exact structure:

```markdown
# Display Not Shown — Debug Tracking

Last Updated: [Date]

## Investigation Summary

[To be filled after Phase 6]

## Layer 1: UI Rendering — screen-settings.tsx

**Status**: ⬜ Not Started
**Finding**: [To be filled in Phase 1]

## Layer 2: Data Provider — recording-settings-provider.tsx

**Status**: ⬜ Not Started
**Finding**: [To be filled in Phase 2]

## Layer 3: Sidecar CLI — thadm-recorder vision list

**Status**: ⬜ Not Started
**Command Output**: [To be filled in Phase 3]
**Finding**: [To be filled in Phase 3]

## Layer 4: Platform Monitor Detection — monitor.rs

**Status**: ⬜ Not Started
**Finding**: [To be filled in Phase 4]

## Layer 5: Capabilities — main.json

**Status**: ⬜ Not Started
**Finding**: [To be filled in Phase 5]

## Root Cause

[To be filled in Phase 6]

## Recommended Fix

[To be filled in Phase 7]

## Risk Assessment

[To be filled in Phase 7]
```

**Purpose**: Forces systematic investigation of all layers, prevents jumping to conclusions.

**Validation**: Before proceeding to Phase 1, verify:

- Tracking document exists at `./tmp/display-debug-tracking.md`
- All 5 layer sections present with "Not Started" status
- Root Cause and Recommended Fix sections are placeholder

---

## PHASE 1: Check UI Rendering Logic

**⚠️ MANDATORY: Update tracking document Layer 1 BEFORE proceeding to Phase 2 ⚠️**

**What to Investigate**:

The `screen-settings.tsx` component conditionally renders the monitor list. The most common reason monitors don't appear is that `useAllMonitors` is `true` (its default value), which hides the entire monitor selection section.

**Key Files**:

- `screenpipe-app-tauri/components/settings/screen-settings.tsx`
- `screenpipe-app-tauri/lib/hooks/use-settings.tsx`

**Process**:

1. **Read `screen-settings.tsx`** and find the conditional rendering block for monitors
   - Look for `{!settings.useAllMonitors && (` or similar
   - Document the exact line number

2. **Read `use-settings.tsx`** and find the default value of `useAllMonitors`
   - Look for `useAllMonitors:` in the defaults object
   - Document the exact line number and default value

3. **Determine**: Is the monitor list hidden by design (useAllMonitors=true) or is it truly missing (useAllMonitors=false but list is empty)?

**Update `./tmp/display-debug-tracking.md` Layer 1** with:

```markdown
## Layer 1: UI Rendering — screen-settings.tsx

**Status**: ✅ Investigated
**Finding**:

- Conditional render at `screen-settings.tsx:[LINE]`: `{!settings.useAllMonitors && (...)}`
- Default value at `use-settings.tsx:[LINE]`: `useAllMonitors: [VALUE]`
- Monitor selection UI is [VISIBLE/HIDDEN] because useAllMonitors is [true/false]
- `availableMonitors` array has [N] items
- **Conclusion**: [Is this the cause? Or need to investigate deeper?]
```

**REQUIRED OUTPUT**: Updated tracking document with Layer 1 findings

**Validation**: Before proceeding to Phase 2, verify:

- Found the conditional render line in screen-settings.tsx
- Found the default value of useAllMonitors in use-settings.tsx
- Documented whether the UI is hidden by design or if monitors are truly missing

---

## PHASE 2: Check Data Provider

**⚠️ MANDATORY: Update tracking document Layer 2 BEFORE proceeding to Phase 3 ⚠️**

**What to Investigate**:

The `recording-settings-provider.tsx` component fetches monitors by executing the sidecar CLI command `thadm-recorder vision list -o json`. If this command fails, `availableMonitors` will be an empty array.

**Key Files**:

- `screenpipe-app-tauri/components/settings/recording-settings-provider.tsx`

**Process**:

1. **Read `recording-settings-provider.tsx`** and find the `loadMonitors` function
   - How does it invoke the sidecar? (`TauriCommand.sidecar("thadm-recorder", [...])`)
   - What happens on failure? (returns `[]`)
   - How is the JSON response parsed?

2. **Check error handling**:
   - Does it log errors to console?
   - Does it fall back to an empty array silently?

3. **Check the command name**: Is it `"thadm-recorder"` or `"screenpipe"`? (Capabilities must match)

**Update `./tmp/display-debug-tracking.md` Layer 2** with:

```markdown
## Layer 2: Data Provider — recording-settings-provider.tsx

**Status**: ✅ Investigated
**Finding**:

- Monitor loading at `recording-settings-provider.tsx:[LINE]`
- Sidecar command: `TauriCommand.sidecar("[COMMAND_NAME]", ["vision", "list", "-o", "json"])`
- Error handling: [DESCRIPTION — silent fail? logs warning?]
- JSON parsing expects: `monitorResponse.data || monitorResponse`
- **Conclusion**: [Does the command name match capabilities? Could this be failing?]
```

**REQUIRED OUTPUT**: Updated tracking document with Layer 2 findings

**Validation**: Before proceeding to Phase 3, verify:

- Found the exact sidecar command invocation with command name
- Documented error handling behavior
- Checked if command name matches capabilities

---

## PHASE 3: Test Sidecar CLI Directly

**⚠️ MANDATORY: Update tracking document Layer 3 BEFORE proceeding to Phase 4 ⚠️**

**What to Investigate**:

Run the sidecar binary directly from terminal to verify monitor detection works at the CLI level. This isolates whether the problem is in the frontend or the backend.

**Process**:

1. **Find the sidecar binary**: Check for `thadm-recorder-aarch64-apple-darwin` in `screenpipe-app-tauri/src-tauri/`

2. **Run the command directly**:

```bash
./screenpipe-app-tauri/src-tauri/thadm-recorder-aarch64-apple-darwin vision list -o json
```

3. **Check the output**:
   - Does it return JSON with a `data` array?
   - Does the `data` array contain monitor objects with `id`, `name`, `width`, `height`?
   - Is the exit code 0?

4. **If it fails**: Check stderr for permission errors, missing libraries, etc.

**Expected successful output**:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Built-in Retina Display",
      "width": 1728,
      "height": 1117,
      "is_default": true
    }
  ],
  "success": true
}
```

**Update `./tmp/display-debug-tracking.md` Layer 3** with:

```markdown
## Layer 3: Sidecar CLI — thadm-recorder vision list

**Status**: ✅ Investigated
**Command**: `[EXACT COMMAND RUN]`
**Exit Code**: [CODE]
**Stdout**:
\`\`\`json
[ACTUAL OUTPUT]
\`\`\`
**Stderr**: [ANY ERROR OUTPUT]
**Finding**:

- Monitor detection at CLI level: [WORKS/FAILS]
- Number of monitors found: [N]
- **Conclusion**: [Is the sidecar detecting monitors correctly?]
```

**REQUIRED OUTPUT**: Updated tracking document with actual command output

**Validation**: Before proceeding to Phase 4, verify:

- Ran the sidecar command directly (not through Tauri)
- Captured actual stdout and stderr output
- Documented exit code
- Determined if monitor detection works at CLI level

---

## PHASE 4: Check Platform Monitor Detection

**⚠️ MANDATORY: Update tracking document Layer 4 BEFORE proceeding to Phase 5 ⚠️**

**What to Investigate**:

The Rust function `list_monitors()` in `screenpipe-vision/src/monitor.rs` calls platform-specific APIs (ScreenCaptureKit on macOS) to enumerate monitors. If screen recording permission is not granted, it returns an empty list.

**Key Files**:

- `screenpipe-vision/src/monitor.rs`

**Process**:

1. **Read `monitor.rs`** and find `list_monitors()` and `list_monitors_safe()`
   - Does `list_monitors_safe()` check permissions before enumerating?
   - What does it return when permission is denied?

2. **Check macOS screen recording permission**:

```bash
# Check if screen recording permission is granted for the sidecar
tccutil reset ScreenCapture 2>/dev/null  # DON'T run this — just check
# Instead, look at System Settings > Privacy & Security > Screen Recording
```

3. **Check the permission function**: `has_screen_capture_permission()` — where is it defined? What does it check?

**Update `./tmp/display-debug-tracking.md` Layer 4** with:

```markdown
## Layer 4: Platform Monitor Detection — monitor.rs

**Status**: ✅ Investigated
**Finding**:

- `list_monitors()` at `monitor.rs:[LINE]`: [DESCRIPTION]
- `list_monitors_safe()` at `monitor.rs:[LINE]`: checks permission via `has_screen_capture_permission()`
- Permission check result: [GRANTED/DENIED/UNKNOWN]
- If denied, returns: `Vec::new()` (empty list)
- **Conclusion**: [Are permissions the issue?]
```

**REQUIRED OUTPUT**: Updated tracking document with Layer 4 findings

**Validation**: Before proceeding to Phase 5, verify:

- Read the monitor detection code
- Identified the permission check function
- Determined if permissions could be the cause

---

## PHASE 5: Check Capabilities Configuration

**⚠️ MANDATORY: Update tracking document Layer 5 BEFORE proceeding to Phase 6 ⚠️**

**What to Investigate**:

Tauri capabilities control which sidecar commands the frontend can invoke. If the capability entry has `"cmd": "screenpipe"` instead of `"cmd": "thadm-recorder"`, the frontend's call to `TauriCommand.sidecar("thadm-recorder", ...)` will be blocked silently.

**Key Files**:

- `screenpipe-app-tauri/src-tauri/capabilities/main.json`
- `screenpipe-app-tauri/src-tauri/gen/schemas/capabilities.json`

**Process**:

1. **Read `capabilities/main.json`** and search for all entries with `"sidecar": true`
2. **Check each entry**: Does it have `"cmd": "thadm-recorder"` or `"cmd": "screenpipe"`?
3. **If mismatch found**: This is likely the root cause — the frontend command name doesn't match the capability

**Expected correct entry**:

```json
{
  "name": "shell:allow-execute",
  "identifier": "shell:allow-execute",
  "commands": {
    "thadm-recorder": {
      "sidecar": true,
      "args": true
    }
  }
}
```

**Update `./tmp/display-debug-tracking.md` Layer 5** with:

```markdown
## Layer 5: Capabilities — main.json

**Status**: ✅ Investigated
**Finding**:

- Found [N] sidecar entries in `capabilities/main.json`
- Command names: [LIST ALL "cmd" VALUES FOUND]
- Expected command name: `thadm-recorder`
- Match status: [ALL MATCH / MISMATCH FOUND]
- **Conclusion**: [Are capabilities correctly configured?]
```

**REQUIRED OUTPUT**: Updated tracking document with Layer 5 findings

**Validation**: Before proceeding to Phase 6, verify:

- Read the capabilities file
- Checked all sidecar command entries
- Confirmed whether command names match

---

## PHASE 6: Consolidate and Diagnose

**⚠️ MANDATORY: Update tracking document Root Cause BEFORE proceeding to Phase 7 ⚠️**

**Action**: Review findings from all 5 layers and identify the root cause.

**Process**:

1. **Review all layer findings** in the tracking document
2. **Identify which layer breaks the chain**:
   - If Layer 1 (`useAllMonitors=true`): Not a bug, it's the default behavior
   - If Layer 2 (provider fails): Check command name and capabilities
   - If Layer 3 (sidecar CLI fails): Check binary path and permissions
   - If Layer 4 (platform API fails): Check macOS screen recording permission
   - If Layer 5 (capabilities mismatch): Command is blocked
3. **Write the root cause** with evidence from specific phases

**Update `./tmp/display-debug-tracking.md` Root Cause** with:

```markdown
## Root Cause

**Layer where break occurs**: Layer [N] — [NAME]

**Evidence**:

- [Finding from Phase X]: [EVIDENCE]
- [Finding from Phase Y]: [EVIDENCE]

**Root Cause Statement**: [CLEAR ONE-SENTENCE EXPLANATION]

**Why this happens**: [DETAILED EXPLANATION OF THE FAILURE CHAIN]
```

**REQUIRED OUTPUT**: Root cause identified with evidence

**Validation**: Before proceeding to Phase 7, verify:

- Root cause references specific findings from earlier phases
- Evidence includes file paths and line numbers
- Cause is specific (not "something is wrong")

---

## PHASE 7: Propose Fix

**⚠️ MANDATORY: Update tracking document Recommended Fix BEFORE proceeding to Phase 8 ⚠️**

**Action**: Based on the root cause, propose the minimal code change to fix the issue.

**Process**:

1. **Identify the exact file(s)** that need to change
2. **Write the specific change** (before/after code)
3. **Assess risk**: What could break?
4. **Keep it minimal**: The smallest diff that solves the problem

**Update `./tmp/display-debug-tracking.md` Recommended Fix** with:

```markdown
## Recommended Fix

**File(s) to modify**:
- `[exact/path/to/file]` (line [N])

**Change**:

Before:
\`\`\`[language]
[CURRENT CODE]
\`\`\`

After:
\`\`\`[language]
[PROPOSED CODE]
\`\`\`

**Why this fixes it**: [EXPLANATION]

## Risk Assessment

- **What could break**: [LIST]
- **Blast radius**: [Small/Medium/Large]
- **Reversibility**: [Easy to revert? / Hard to undo?]
- **Testing needed**: [SPECIFIC TESTS]
```

**REQUIRED OUTPUT**: Specific fix with before/after code

**Validation**: Before proceeding to Phase 8, verify:

- Fix targets the root cause identified in Phase 6
- Change is minimal (fewest lines/files possible)
- Risk assessment is realistic
- Testing steps are specific

---

## PHASE 8: Quality Review

**⚠️ MANDATORY: Validate all findings before considering investigation complete ⚠️**

**Action**: Review the tracking document for completeness and accuracy.

**Quality Checks**:

1. **All layers investigated**: All 5 layer sections have "✅ Investigated" status
2. **Evidence quality**: Every finding includes file path and line number
3. **Root cause specificity**: Cause is a specific, testable statement
4. **Fix minimality**: Change affects fewest files possible
5. **No assumptions**: Every claim is backed by evidence (code read, command output)

**Fix any gaps found** and update the tracking document.

**Final Status Update**:

```markdown
## Investigation Summary

**Date**: [DATE]
**Root Cause**: [ONE SENTENCE]
**Fix**: [ONE SENTENCE DESCRIPTION OF CHANGE]
**Files Affected**: [N] file(s)
**Risk**: [Low/Medium/High]
**All Layers Investigated**: ✅ Yes
```

---

# MANDATORY COMPLETION CHECKLIST

**Before considering this task complete, you MUST verify ALL items in this checklist:**

## Phase Completion

- [ ] **Phase 0**: Created tracking document at `./tmp/display-debug-tracking.md` with all 5 layer sections
- [ ] **Phase 1**: Checked `useAllMonitors` default and conditional render in `screen-settings.tsx`
- [ ] **Phase 2**: Traced data provider flow in `recording-settings-provider.tsx`
- [ ] **Phase 3**: Ran sidecar `vision list` command directly and captured output
- [ ] **Phase 4**: Checked `list_monitors()` and `list_monitors_safe()` in `monitor.rs`
- [ ] **Phase 5**: Verified all capability entries have `"cmd": "thadm-recorder"`
- [ ] **Phase 6**: Root cause identified with evidence from specific phases
- [ ] **Phase 7**: Fix proposed with exact file paths, line numbers, and before/after code
- [ ] **Phase 8**: Quality review passed, tracking document is complete

## Investigation Quality

- [ ] Every finding includes exact file path and line number
- [ ] Sidecar CLI was tested directly (not just code-read)
- [ ] `useAllMonitors` default value documented
- [ ] Capabilities command names verified
- [ ] macOS permissions checked

## Fix Quality

- [ ] Fix targets the root cause (not a symptom)
- [ ] Change affects 3 or fewer files
- [ ] Before/after code provided
- [ ] Risk assessment included
- [ ] Testing steps specified

## Process Verification

- [ ] Did NOT skip any investigation layer
- [ ] Did NOT make code changes before Phase 7
- [ ] Did NOT assume the bug was in one layer without checking others
- [ ] Updated tracking document after every phase
- [ ] Distinguished "hidden by design" (useAllMonitors=true) from actual bugs

**IF ANY CHECKBOX ABOVE IS UNCHECKED, THE TASK IS NOT COMPLETE.**

## Success Criteria

This task is successful when:

1. **Completeness**: All 5 layers of the monitor display chain are investigated with evidence
2. **Accuracy**: Root cause is correct and backed by specific code/output evidence
3. **Specificity**: Fix references exact file paths and line numbers
4. **Minimality**: Proposed fix is the smallest change that solves the problem
5. **Documentation**: Tracking document is complete and could be used by another developer to understand the issue
6. **No Collateral**: No unrelated code changes proposed
