# Thadm Implementation Plan

## Overview
Transform Screenpipe into Thadm - a desktop app for people with ADHD that provides automatic, searchable memory of everything they do on their computer.

## Target Audience
- People with ADHD (ages 20-45)
- Scientists and researchers
- Students

---

## Git Architecture

### Current Setup
- Only 1 remote: `origin` → `sbpk516/thadm.git`
- Completely isolated from screenpipe upstream
- No automatic changes will flow in

### Recommended Setup
```bash
# Add screenpipe as upstream remote (for reference only)
git remote add upstream https://github.com/mediar-ai/screenpipe.git

# Fetch upstream changes (doesn't merge)
git fetch upstream

# Cherry-pick specific features when needed
git cherry-pick <commit-hash>
```

**Rule**: Never merge upstream directly. Cherry-pick specific commits/features and document what was incorporated.

---

## Phase 0: Architecture Setup
**Goal**: Enable selective feature pulls from screenpipe

- [ ] Add screenpipe as upstream remote
- [ ] Create `UPSTREAM_FEATURES.md` to track incorporated commits
- [ ] Set up branch strategy for feature development

---

## Phase 1: Full Rebrand (PRIORITY #1)

### 1.1 App Identity
| Task | Files |
|------|-------|
| App name: Screenpipe → Thadm | `tauri.conf.json`, `package.json` |
| Bundle identifier | `tauri.conf.json` |
| Window titles | Rust + TypeScript code |

### 1.2 Visual Identity
| Task | Files |
|------|-------|
| App icon (all sizes) | `src-tauri/icons/` |
| Logo assets | `public/`, component assets |
| Favicon | `app/favicon.ico` |

### 1.3 Color Palette
| Task | Files |
|------|-------|
| Primary/secondary colors | `globals.css` |
| CSS variables | `globals.css` |
| Tailwind config | `tailwind.config.js` |

### 1.4 Typography
| Task | Files |
|------|-------|
| Font selection | Font imports |
| Font CSS variables | `globals.css` |

### 1.5 Content Cleanup
| Task | Details |
|------|---------|
| Remove "screenpipe" text | All UI components |
| Update about/help pages | Legal, credits |
| Update links | Remove screenpipe.com references |
| Update error messages | Brand consistency |

---

## Phase 2: Onboarding & Permissions (PRIORITY #2)

### Goal
Dead-simple DMG setup, especially for:
- Screen Recording permission
- Microphone permission
- Accessibility permission (if needed)

### Tasks
| Task | Details |
|------|---------|
| Permission wizard | Step-by-step guide with visual cues |
| Auto-detect permission status | Real-time green checkmarks |
| One-click permission requests | "Open System Preferences" buttons |
| Clear error states | Explain what's missing and how to fix |
| Progress indicator | Show setup completion status |
| Dev build handling | "Continue anyway" button after 5s |

---

## Phase 3: Core Features

### 3A. Enhanced Search/Recall
**Purpose**: Help ADHD users recover lost context

| Feature | Description |
|---------|-------------|
| "What was I doing?" button | One-click to see last 5 min of activity |
| Visual timeline | Scrubable timeline of activity |
| Context bundles | Group related activities together |
| Breadcrumb trail | Show path: how you got distracted |
| Time travel search | "What was I reading yesterday afternoon?" |

### 3B. Analytics/Insights
**Purpose**: Build self-awareness without judgment

| Feature | Description |
|---------|-------------|
| Daily summary | Time spent per category |
| App usage breakdown | Which apps, how long |
| Focus vs distraction | Deep work vs shallow work |
| Peak hours detection | "Your best focus: 10am-12pm Tuesdays" |
| Interruption mapping | Which notifications break focus most |

### 3C. AI Assistance
**Purpose**: Smart help that understands ADHD needs

| Feature | Description |
|---------|-------------|
| Keep Claude/Gemini | Existing integration works |
| "Catch me up" | Summary after being away |
| Smart suggestions | "You usually work on X now" |
| Meeting summaries | Capture + summarize calls |
| Auto-categorization | Tag activities automatically |

---

## Recommended Execution Order

```
Week 1: Phase 0 + Phase 1 (Rebrand foundation)
   ├── Set up upstream remote
   ├── App name & bundle config
   ├── Define color palette & typography
   └── Create new app icon

Week 2: Phase 1 continued + Phase 2
   ├── Apply colors/fonts across app
   ├── Remove screenpipe branding from UI
   └── Polish onboarding flow

Week 3+: Phase 3 Features
   ├── 3A: Enhanced Search/Recall
   ├── 3B: Analytics/Insights
   └── 3C: AI Assistance
```

---

## Files Reference

### Key Config Files
- `screenpipe-app-tauri/src-tauri/tauri.conf.json` - App name, bundle ID, icons
- `screenpipe-app-tauri/package.json` - Package name
- `screenpipe-app-tauri/app/globals.css` - Colors, CSS variables
- `screenpipe-app-tauri/tailwind.config.js` - Tailwind theme

### Key UI Files
- `screenpipe-app-tauri/components/` - React components
- `screenpipe-app-tauri/app/` - Next.js pages
- `screenpipe-app-tauri/lib/` - Utilities and hooks

### Rust Backend
- `screenpipe-server/` - Core backend
- `screenpipe-audio/` - Audio capture
- `screenpipe-vision/` - Screen capture

---

## Notes
- Use `bun` for JS/TS package management
- Use `cargo` for Rust
- Always run tests after changes
- Commit after each working piece
