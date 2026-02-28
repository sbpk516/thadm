# SPEC: Rename Data Directory ~/.screenpipe → ~/.thadm

## Summary

Rename the default data directory from `~/.screenpipe` to `~/.thadm` across the
entire codebase, with automatic migration for existing users.

## Motivation

The app was rebranded from "screenpipe" to "Thadm". The binary names
(`thadm`, `thadm-recorder`), bundle ID (`com.thadm.desktop`), and UI are
already rebranded — but the data directory still uses the old name. This
confuses users and leaks the upstream project name.

## Current State

- **177 total references** to `.screenpipe` across the codebase
- **~30 hardcoded string literals** in source code (Rust + TypeScript)
- **No centralized constant** — the string `".screenpipe"` is scattered
- **Two separate directories** use the `screenpipe` name:
  - `~/.screenpipe` — main data dir (home dir dotfile): `data/`, `videos/`, `pipes/`, `mcp/`, `db.sqlite`
  - `~/Library/Application Support/screenpipe/` — Tauri `local_data_dir` (stores `store.bin`)
- **Platforms**: `~/.screenpipe` (macOS/Linux), `%USERPROFILE%\.screenpipe` (Windows)

## Scope

### In Scope
1. Rename all hardcoded `".screenpipe"` → `".thadm"` in source code
2. Introduce a centralized constant per layer (Rust, TypeScript, Node.js)
3. Auto-migrate existing `~/.screenpipe` → `~/.thadm` on first launch
4. Auto-migrate `~/Library/Application Support/screenpipe/` → `.../thadm/`
5. Update Tauri capability file system scopes
6. Update environment variable name (`SCREENPIPE_DIR` → `THADM_DIR`)
7. Update docs, scripts, and CI workflows

### Out of Scope
- Renaming Rust crate names (`screenpipe-server`, etc.) — separate effort
- Renaming source directories (`screenpipe-app-tauri/`, etc.) — separate effort
- Changing the sidecar CLI `--data-dir` flag name (still works, just default changes)

---

## Plan

### Phase 1: Centralize the constant (no behavior change)

Create a single source of truth for the directory name in each layer, but keep
it set to `".screenpipe"` so nothing changes yet.

**Rust — new file `screenpipe-core/src/constants.rs`:**
```rust
/// Default data directory name under $HOME.
pub const DATA_DIR_NAME: &str = ".screenpipe"; // will become ".thadm" in Phase 3
```

**Files to update (replace hardcoded strings with constant):**

| File | Line(s) | Current Code |
|------|---------|-------------|
| `screenpipe-server/src/bin/screenpipe-server.rs` | 137 | `.join(".screenpipe")` |
| `screenpipe-server/src/cli.rs` | 183, 352, 382, 538 | CLI help strings |
| `screenpipe-app-tauri/src-tauri/src/main.rs` | 423, 438, 926, 934 | `.join(".screenpipe")` |
| `screenpipe-app-tauri/src-tauri/src/commands.rs` | 271 | `.join(".screenpipe")` |
| `screenpipe-app-tauri/src-tauri/src/config.rs` | 10 | `.join("screenpipe")` — **NOTE: this is `local_data_dir` (App Support), not home dir** |
| `screenpipe-app-tauri/src-tauri/src/main.rs` | 665 | `dirs::data_local_dir().join("screenpipe")` — **same App Support path, reads `store.bin`** |
| `screenpipe-core/src/pipes.rs` | 1045 | `.join(".screenpipe")` |
| `screenpipe-server/src/pipe_manager.rs` | 385 | Windows PowerShell string |

**TypeScript — new file `screenpipe-app-tauri/lib/constants.ts`:**
```typescript
export const DATA_DIR_NAME = ".screenpipe"; // will become ".thadm" in Phase 3
```

**Files to update:**

| File | Line | Current Code |
|------|------|-------------|
| `screenpipe-app-tauri/lib/hooks/use-settings.tsx` | 469 | `"${homeDirPath}/.screenpipe"` |
| `screenpipe-app-tauri/components/onboarding/status.tsx` | 337 | `join(home, ".screenpipe")` |

**Node.js pipes — update each pipe's config to use env var with fallback:**

| File | Line |
|------|------|
| `pipes/notion/src/lib/actions/update-pipe-config.ts` | 9 |
| `pipes/obsidian/src/lib/actions/update-pipe-config.ts` | 9 |
| `pipes/example-pipe/lib/actions/update-pipe-config.ts` | 9 |
| `pipes/data-table/src/app/api/settings/route.ts` | 22 |

---

### Phase 2: Add migration logic (no rename yet)

Add a migration function that runs on app startup. It will be a no-op until
Phase 3 flips the constant.

**Two directories need migration:**

| Directory | Old Path | New Path |
|-----------|----------|----------|
| Home data dir | `~/.screenpipe` | `~/.thadm` |
| App Support dir | `~/Library/Application Support/screenpipe/` | `.../thadm/` |

**Rust — `screenpipe-app-tauri/src-tauri/src/migration.rs`:**

```
fn migrate_data_dir() -> Result<()>:
    // 1. Migrate home data directory
    let old_home = home_dir().join(".screenpipe")
    let new_home = home_dir().join(".thadm")
    migrate_dir(old_home, new_home)?

    // 2. Migrate App Support directory
    let old_app = data_local_dir().join("screenpipe")
    let new_app = data_local_dir().join("thadm")
    migrate_dir(old_app, new_app)?

    OK

fn migrate_dir(old: PathBuf, new: PathBuf) -> Result<()>:
    if old.exists() AND NOT new.exists():
        rename(old, new)
        // If rename fails (cross-device), fall back to copy + delete
        eprintln!("Migrated {} to {}", old, new)

    else if old.exists() AND new.exists():
        // Both exist — user may have manually created new dir
        // Don't touch anything, log a warning
        eprintln!("Both {} and {} exist. Using {}.", old, new, new)

    else:
        // Nothing to migrate (fresh install or already migrated)
        OK
```

**Call site:** At the start of the `.setup()` closure in `main.rs` (after
line 866), **before** the first `get_base_dir()` call at line 921.

**Also needed in the sidecar binary:** `screenpipe-server/src/bin/screenpipe-server.rs`
must call `migrate_data_dir()` before its own `get_base_dir()` at line 267.

**Key decisions:**
- Use `std::fs::rename()` first (atomic on same filesystem — both old and new
  are under `$HOME` / same APFS volume on macOS)
- Fall back to recursive copy + delete if rename fails (e.g., cross-device)
- On Windows: use `%USERPROFILE%` instead of `$HOME`
- **Never delete old dir if copy fails partway** — leave both, log error
- Log file location chicken-and-egg: migration runs before logging init, so
  use `eprintln!` for migration messages (not `log::info!`)

---

### Phase 3: Flip the constant + update standalone packages

Change the centralized constants (covers Tauri app, sidecar, and core):

```rust
// screenpipe-core/src/constants.rs
pub const DATA_DIR_NAME: &str = ".thadm";
```

```typescript
// screenpipe-app-tauri/lib/constants.ts
export const DATA_DIR_NAME = ".thadm";
```

**IMPORTANT:** The constants above only cover code that imports from
`screenpipe-core` or `screenpipe-app-tauri/lib`. The following standalone
packages have their own hardcoded `".screenpipe"` and must be updated
manually in this same phase:

| File | Line | Current Code |
|------|------|-------------|
| `screenpipe-js/cli/src/utils/credentials.ts` | 6 | `path.join(os.homedir(), ".screenpipe")` |
| `packages/agent/src/index.ts` | 282 | `join(home, ".screenpipe", "db.sqlite")` |
| `packages/sync/src/index.ts` | 73 | `` `${home}/.screenpipe/db.sqlite` `` |
| `packages/claude-code/src/index.ts` | 58, 62 | `settings.mcpServers.screenpipe` (MCP key name) |

These are separate npm packages that do not import from the app's constants
file. Each must be edited directly.

---

### Phase 4: Update Tauri capabilities

**File: `screenpipe-app-tauri/src-tauri/capabilities/main.json`**

Replace all 5 path scope entries:

| Old | New |
|-----|-----|
| `$RESOURCE/.screenpipe/*` | `$RESOURCE/.thadm/*` |
| `$HOME/.screenpipe/*` | `$HOME/.thadm/*` |
| `$HOME/.screenpipe/data/**` | `$HOME/.thadm/data/**` |
| `$HOME/.screenpipe/**` | `$HOME/.thadm/**` |
| `$RESOURCE/.screenpipe/**` | `$RESOURCE/.thadm/**` |

---

### Phase 5: Update environment variables

| Old | New |
|-----|-----|
| `SCREENPIPE_DIR` | `THADM_DIR` |
| `SCREENPIPE_DB` | `THADM_DB` |

Keep backward compatibility: check new env var first, fall back to old.

```typescript
process.env.THADM_DIR || process.env.SCREENPIPE_DIR || path.join(home, ".thadm")
```

**All files that reference `SCREENPIPE_DIR` (11 total):**

| File | Line(s) |
|------|---------|
| `screenpipe-core/src/pipes.rs` | 417 (sets the env var) |
| `pipes/notion/src/lib/actions/update-pipe-config.ts` | 8 |
| `pipes/obsidian/src/lib/actions/update-pipe-config.ts` | 8 |
| `pipes/example-pipe/lib/actions/update-pipe-config.ts` | 8 |
| `pipes/example-pipe/app/api/settings/route.ts` | 24 |
| `pipes/data-table/src/app/api/settings/route.ts` | 21 |
| `pipes/memories/src/app/api/settings/route.ts` | 15, 87 |
| `pipes/reddit-auto-posts/lib/actions/update-pipe-config.ts` | 14 |
| `pipes/reddit-auto-posts/app/api/pipeline/route.ts` | 16, 90 |
| `pipes/reddit-auto-posts/app/api/settings/route.ts` | 17 |

**Files that reference `SCREENPIPE_DB`:**

| File | Line(s) |
|------|---------|
| `packages/sync/src/index.ts` | 73, 160, 621 |

---

### Phase 6: Update tests & benchmarks

| File | Change |
|------|--------|
| `screenpipe-db/benches/search_accuracy.rs:14` | `"~/.screenpipe/db.sqlite"` → `"~/.thadm/db.sqlite"` |
| `screenpipe-server/tests/endpoint_test.rs:722` | `"{}/.screenpipe/db.sqlite"` → `"{}/.thadm/db.sqlite"` |
| `screenpipe-server/tests/index_test.rs:32` | `.join(".screenpipe")` → `.join(".thadm")` |
| `screenpipe-server/tests/first_frames_test.rs:22` | Same |
| `screenpipe-server/tests/video_utils_test.rs:23` | Same |
| `screenpipe-server/tests/video_cache_test.rs:18,27` | Same |

---

### Phase 7: Update docs, scripts, CI

**Documentation — `.md` files (76 references across 19 files):**
- `TESTING.md` (3) — log locations
- `ARCHITECTURE.md` (1) — DB location
- `RECORDING_FLOW.md` (2) — data_dir table
- `CONTRIBUTING.md` (4) — sqlite3 commands
- `PERMISSION_AND_RECORDING_FLOW.md` (3) — grep commands
- `.github/ISSUE_TEMPLATE/bug_report.md` (1) — log location
- `packages/sync/README.md` (4), `packages/agent/README.md` (1), `packages/skills/README.md` (1)
- `packages/skills/skills/digest.md` (5), `recall.md` (4), `context.md` (5), `search.md` (5)
- `specs/SPEC-trial-licensing.md` (2) — trial persistence docs
- `specs/ARCH-trial-licensing.md` (1) — architecture diagram
- `content/changelogs/0.44.2.md` (1) — release notes

**Documentation — `.mdx` files (15 references across 6 files):**
- `content/docs-mintlify-mig-tmp/moltbot.mdx` (5)
- `content/docs-mintlify-mig-tmp/sdk-reference.mdx` (4)
- `content/docs-mintlify-mig-tmp/faq.mdx` (2)
- `content/docs-mintlify-mig-tmp/cli-reference.mdx` (2)
- `content/docs-mintlify-mig-tmp/architecture.mdx` (1)
- `content/docs-mintlify-mig-tmp/meeting-transcription.mdx` (1)

**Scripts & CI (11 references across 6 files):**
- `.devcontainer/scripts/linux_integration.sh` (1)
- `.github/scripts/test_ocr.sh` (2)
- `.github/workflows/linux-integration-test.yml` (2)
- `.github/workflows/windows-integration-test.yml` (2)
- `.github/workflows/windows-longevity-test.yml` (2)
- `.github/workflows/e2e-test.yml` (2)

**Claude Code agents (33 references across 3 files):**
- `.claude/agents/screenpipe-logs.md` (21)
- `.claude/agents/screenpipe-health.md` (11)
- `.claude/agents/screenpipe-query.md` (1)

**Packages — non-pipe source code (plist IDs, rsync commands, etc.):**
- `packages/sync/src/index.ts` — plist identifiers (`com.screenpipe.sync`), help strings, examples
- `packages/agent/src/index.ts` — plist identifiers, rsync commands, SQL examples
- `packages/claude-code/src/index.ts` — MCP server config key
- `screenpipe-js/cli/src/utils/credentials.ts` — credentials dir

---

## File Change Summary

| Phase | Files Changed | Risk |
|-------|--------------|------|
| 1. Centralize constant | ~13 source files (+ 2 new constant files) | Low — no behavior change |
| 2. Migration logic | 3 files (1 new + 2 call sites in main.rs and screenpipe-server.rs) | Medium — file system operations |
| 3. Flip constant + standalone packages | 6 files (2 constants + 4 standalone packages) | Medium — triggers actual rename |
| 4. Capabilities | 1 JSON file | Low |
| 5. Env vars | 11 source files | Low |
| 6. Tests | 7 files | Low |
| 7. Docs/scripts/CI | ~34 files (19 .md + 6 .mdx + 6 scripts/CI + 3 agents) | Low — no runtime impact |
| **Total** | **~65 files** | |

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Data loss during migration | High | Atomic rename; never delete old if copy fails; log everything |
| Permissions lost (TCC) | High | TCC is by bundle ID, not data dir — no impact |
| Old plugins reference old path | Medium | Env var fallback chain (`THADM_DIR` → `SCREENPIPE_DIR` → default) |
| Partial migration (crash mid-copy) | Medium | Check both dirs exist → warn, don't overwrite |
| Windows `%USERPROFILE%` differences | Low | Use `dirs::home_dir()` (already cross-platform) |
| Existing users confused by path change | Low | Log message on migration; mention in release notes |

---

## Testing Plan

1. **Fresh install** — verify `~/.thadm` is created, no `~/.screenpipe`
2. **Existing user** — place test data in `~/.screenpipe`, launch app, verify:
   - Data moved to `~/.thadm`
   - `~/.screenpipe` no longer exists
   - DB opens correctly, recordings play
3. **Both dirs exist** — verify app uses `~/.thadm`, logs warning
4. **Sidecar** — verify `--data-dir` default uses `~/.thadm`
5. **Pipes** — verify pipes can read/write to new location
6. **CI workflows** — verify integration tests pass with new paths
7. **Tauri capabilities** — verify file access works (open data dir, read frames)

---

## Execution Order

```
Phase 1 → commit → run tests
Phase 2 → commit → run tests (migration is no-op)
Phase 3 → commit → run tests (migration activates)
Phase 4 → commit → run tests
Phase 5 → commit → run tests
Phase 6 → commit → run tests
Phase 7 → commit (docs only, no tests needed)
```

Each phase is independently committable and testable. If any phase breaks,
revert only that phase.

---

## Review Log

**Reviewed 2026-02-27** — LLM self-review against codebase. Corrections applied:

1. **Phase 1**: Added `main.rs:665` (`data_local_dir().join("screenpipe")`) — a second
   directory (App Support) missed in original spec. All other line numbers verified exact.
2. **Phase 2**: Specified precise insertion point (`.setup()` closure after line 866,
   before first `get_base_dir()` at line 921). Added sidecar call site. Added App Support
   directory migration. Changed `log::info!` to `eprintln!` (runs before logging init).
3. **Phase 3**: Corrected misleading "single-line change" — 4 standalone packages have
   independent hardcoded `.screenpipe` that won't pick up the constant. Now listed explicitly.
4. **Phase 4**: Verified accurate — no changes needed.
5. **Phase 5**: Added 5 missed files (`pipes/memories`, `pipes/reddit-auto-posts` ×3,
   `pipes/example-pipe/app/api/settings`). Corrected total from 6 → 11 files.
6. **Phase 6**: Verified accurate — no changes needed.
7. **Phase 7**: Corrected counts (59→76 for .md, added 15 .mdx refs in 6 files,
   corrected agents from 45→33). Added 3 missed .md files and entire `.mdx` category.
