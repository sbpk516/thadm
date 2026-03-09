# CLAUDE.md — Thadm Development Guidelines

## Project Overview
Thadm is a desktop app for people with ADHD that provides automatic,
searchable memory of everything they do on their computer. Built on
screenpipe (MIT licensed). All data stays local on device.

## Target Audience
- People with ADHD (ages 20-45)
- Scientists and researchers
- Students

## Package Manager
- Use `bun` for JS/TS (not npm or pnpm)
- Use `cargo` for Rust

## Key Directories
- `screenpipe-app-tauri/` - Desktop app (Tauri + Next.js)
- `screenpipe-server/` - Core backend (Rust)
- `screenpipe-audio/` - Audio capture/transcription (Rust)
- `screenpipe-vision/` - Screen capture/OCR (Rust)

## Analytics
- PostHog API key: source from `.env.local` (gitignored)
- Project ID: 27525
- Host: eu.i.posthog.com

## Testing
- `cargo test` for Rust
- `bun test` for JS/TS
- ALWAYS run tests after any code change
- NEVER skip tests to save time

## Build Process — MANDATORY

**NEVER run manual build commands (cargo build, bun tauri build, cp, etc.) directly.**
**ALWAYS use `./build.sh [command]` from the project root.**

| Command | What it does | When to use |
|---------|-------------|-------------|
| `./build.sh sidecar` | Compiles the recorder binary only | Testing changes to screenpipe-server, audio, or vision |
| `./build.sh dev` | Compiles sidecar + launches full app in dev mode | Testing with the UI + hot reload |
| `./build.sh release` | Compiles sidecar + builds signed .app bundle | Creating installable app for /Applications |
| `./build.sh clean` | Removes all artifacts + full release build | When builds are broken or stale |

The app has TWO binaries:
- **thadm** (main UI app) — compiled automatically by `bun tauri build`
- **thadm-recorder** (sidecar recorder) — must be compiled separately via `build.sh`

The build script handles compiling the sidecar, copying it to the right location, and running Tauri. Never do these steps manually.

## macOS Dev Builds
- Signing identity: `Developer ID Application: Balaji Sachidanandam (KVLNE2Y696)`
- Config: `screenpipe-app-tauri/src-tauri/tauri.conf.json` > `bundle.macOS.signingIdentity`
- This ensures macOS TCC recognizes the app across rebuilds (permissions persist)
- Other devs without the cert will see permission issues - onboarding has "continue anyway" button after 5s

## Coding Rules — STRICT

### Before Writing Any Code
1. Read ALL relevant existing files first
2. Explain how the current code works
3. Propose a plan — do NOT write code until plan is approved
4. Identify what could break

### While Writing Code
1. Change ONE file at a time when possible
2. Do NOT modify existing functions unless absolutely necessary
3. Add new functions instead of changing existing ones
4. Do NOT refactor, rename, or "improve" code that isn't part of the task
5. Do NOT add comments, docstrings, or type annotations to unchanged code
6. Do NOT add error handling for impossible scenarios
7. Do NOT create abstractions for one-time operations
8. Keep changes minimal — the smallest diff that solves the problem

### After Writing Code
1. Run tests immediately
2. If tests fail, fix the issue before moving on
3. List exactly what files changed and why
4. Flag anything that could have side effects

### NEVER Do These
- Change more than 3 files in a single response without approval
- Refactor existing code while adding a new feature
- Add dependencies without asking first
- Modify database schema without a migration plan
- Delete or rename existing functions without approval
- Use "git add ." — always add specific files
- Make architectural decisions without asking
- Run manual build commands (cargo build, bun tauri build, cp sidecar) — ALWAYS use `./build.sh`

## Feature Development Process
1. Create a git branch for each feature
2. Explore existing code first (read, don't write)
3. Write a plan (no code)
4. Get approval
5. Write tests first
6. Implement one piece at a time
7. Run tests after each piece
8. Commit after each working piece

## Attribution
This project includes code from screenpipe (MIT License).
Copyright (c) 2024-2025 louis030195

<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **thadm** (8026 symbols, 20916 relationships, 300 execution flows).

## Always Start Here

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
