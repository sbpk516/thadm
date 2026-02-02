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

## macOS Dev Builds
- Dev builds are signed with a developer certificate for consistent permissions
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
