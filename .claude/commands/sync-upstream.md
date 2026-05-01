---
name: "Sync Upstream"
description: Sync latest screenpipe upstream into thadm with conflict triage and privacy audit
category: Maintenance
tags: [git, upstream, fork, sync]
---

Pull the latest changes from `upstream` (mediar-ai/screenpipe) into thadm. The deterministic work lives in `sync-upstream.sh`; this command adds judgment on top: classifying conflicts against thadm-specific files, reviewing the privacy audit, and drafting the commit message.

**Input**: optionally a base branch (defaults to `main`).

**Never auto-resolve conflicts. Never push. Stop and ask before any commit.**

---

## Steps

### 1. Run the script

```bash
./sync-upstream.sh
```

(or `./sync-upstream.sh <base-branch>` if the user specified one)

Read the full output. Note the exit code.

### 2. Branch on exit code

- **exit 0**: clean merge, ready for review → go to step 4 (audit review + commit drafting)
- **exit 1**: pre-flight failure → report what failed and stop. Do not retry without the user.
- **exit 2**: merge conflicts → go to step 3 (classify and propose, do NOT auto-resolve)

### 3. Conflict triage (exit 2 only)

For each file in the conflict list, classify it. The categories below come from `REBRAND_PLAN.md` and `CLAUDE.md`. Read the actual conflict markers before proposing — do not guess from the path alone.

**Always-conflict-prone (rebrand surface — keep thadm side, then re-apply upstream's non-branding changes manually):**
- `apps/screenpipe-app-tauri/src-tauri/tauri.conf.json`, `tauri.prod.conf.json`, `tauri.beta.conf.json`, `tauri.enterprise.conf.json`
- `src-tauri/src/main.rs`, `src-tauri/src/tray.rs`, `src-tauri/src/updates.rs`
- `src-tauri/Info.plist`
- `src-tauri/capabilities/main.json` (`"cmd": "thadm-recorder"` not `"screenpipe"`)
- `app/home/page.tsx`, `app/overlay/page.tsx`, `app/notification-panel/page.tsx`
- `components/notification-handler.tsx`
- many `components/settings/*.tsx`

**Cloud-disabled files (must stay disabled — privacy invariant):**
- `app/providers.tsx` (PostHog `init` commented out)
- `src-tauri/src/analytics.rs`, `src-tauri/src/main.rs` (Sentry init commented out)
- `components/upgrade-dialog.tsx`, `components/login-dialog.tsx`, `components/referral-card.tsx`, `components/onboarding/login-gate.tsx` (all `return null`)
- `components/settings/account-section.tsx`, `sync-settings.tsx`, `archive-settings.tsx`, `ai-presets.tsx`, `intercom-chat.tsx`
- `lib/hooks/use-enterprise-policy.ts`
- `components/updater.tsx`, `components/update-banner.tsx` (point at GitHub Releases, not screenpi.pe)

**Auto-update wiring (must survive every sync):**
- GitHub Releases endpoint in `components/updater.tsx`
- `tauri.conf.json > plugins.updater.pubkey` (Tauri signing public key)

**Shared code (no thadm modification — usually take upstream cleanly):**
- everything in `crates/screenpipe-*` except where CLAUDE.md memory notes a thadm fix
- `packages/ai-gateway/` — note: thadm has modified models here, check before taking upstream

For each conflict, propose to the user:
- which side to take (or describe the merge),
- the specific lines/markers,
- whether the rebrand or cloud-disabled rule applies.

Do not modify files until the user confirms.

### 4. Privacy audit review (exit 0)

The script printed any hits for: PostHog init, Sentry init, `screenpi.pe`, `~/.screenpipe`, `screenpipe://`, `com.screenpi.pe`.

For each hit, decide:
- **regression** (upstream re-introduced something thadm disabled) → propose the fix from `REBRAND_PLAN.md` or the matching CLAUDE.md memory entry
- **legitimate** (test fixture, comment, doc) → note it in the summary and move on

If there are regressions, fix them, `git add` the fix, and re-run `./sync-upstream.sh` to refresh the audit and tests.

### 5. Test review

The script ran `cargo test --workspace` and `bun test`. CLAUDE.md notes pre-existing failures (`TextOverlay` tests, ~13 fails) — do not block on those. For any *new* failures, investigate the cause before suggesting a commit.

### 6. Draft the commit and stop

Show the user the commit message — do not commit without confirmation. Use this template:

```
merge: sync with upstream screenpipe (<N> commits, up to <upstream-tag-or-sha>)

- conflicts resolved in: <file-list-or-"none">
- ee/ re-removed
- thadm invariants verified (<N> audit hits reviewed)
- tests: cargo <pass/fail>, bun <pass/fail>
```

Then list the next commands for the user to run themselves:

```
git commit -m "<message>"
git checkout <base>
git merge --no-ff sync/upstream-<date>
git push origin <base>
```

**Stop here. Do not run the commit, the merge into base, or the push without explicit user approval each time.**

### 7. Follow-up: was a thadm invariant broken?

If upstream introduced something that genuinely violates a thadm invariant — new telemetry, a new login gate, a new external API call we cannot disable with a one-line comment — that is a *product decision*, not a sync mechanic. Suggest the user run `/opsx:propose` to spec out how thadm should diverge from upstream on that point.
