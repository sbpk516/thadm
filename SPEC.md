# Thadm — Product Spec

## 1. What

Thadm is a macOS menu bar app that continuously records your screen (via OCR) and audio (via transcription), stores everything locally in a SQLite database, and lets you search your entire computer history with a simple query. It is built for people with ADHD who lose track of what they were doing, what they said in a meeting, or where they saw that one thing three days ago. All data stays on-device. Nothing is uploaded anywhere.

## 2. Why

ADHD creates specific, recurring pain points that existing tools do not address:

- **"What was I just doing?"** — Context-switching kills working memory. After an interruption, it can take 20+ minutes to reconstruct what you were working on. Thadm gives you a searchable timeline to jump back in.
- **"I saw it somewhere but I can't find it"** — You read something in a Slack thread, a PDF, a browser tab, or a terminal window. You know it exists but you cannot relocate it. Thadm OCRs every frame, so you can search for the text itself.
- **"What did they say in the meeting?"** — Audio transcription captures every conversation, lecture, and call. No need to take notes in real time.
- **"I forgot to write it down"** — The app is always running. There is no "start recording" button to forget to press. It captures everything by default.

The core insight: **ADHD is a working memory disorder, not a laziness problem.** Thadm acts as an external memory prosthetic — always on, always capturing, never judgmental.

## 3. How It Works

Three steps:

1. **Record** — Runs silently in the background. Takes periodic screenshots with OCR to extract all visible text. Captures system audio and microphone input, transcribing speech to text in real time.
2. **Store** — All extracted text, timestamps, and metadata go into a local SQLite database. Nothing leaves the device.
3. **Search** — Open from the menu bar, type a query, get results ranked by relevance. Results show what was on screen, what was said, and when.

No cloud. No accounts. No sync.

## 4. Who

| Audience | Needs |
|----------|-------|
| **People with ADHD (20-45)** | Recall after context-switches, find lost information, capture meeting action items |
| **Scientists & Researchers** | Recall papers/datasets, searchable lab meeting records, work across many tools |
| **Students** | Searchable lecture transcripts, find slides from weeks ago, study across apps |

## 5. Architecture Overview

| Binary | Role |
|--------|------|
| **thadm** | UI app (Tauri + Next.js). Menu bar icon, settings, search. |
| **thadm-recorder** | Recorder sidecar (Rust). Screen capture, audio, OCR, transcription, SQLite writes. |

```
Screen → ScreenCaptureKit → OCR → SQLite
Audio → CoreAudio/cpal → Whisper → SQLite
User → Search UI → SQLite query → Results
```

Menu bar app (`LSUIElement=true`), no dock icon. All data local.

## 6. Current Features

- Continuous screen capture with OCR
- Multi-monitor support
- Audio capture + real-time transcription
- Privacy filters (ignore specific apps/windows)
- Full-text search across OCR and transcriptions
- Settings UI with grouped sidebar
- Signed macOS app with crash recovery and permission handling
- macOS Sequoia ScreenCaptureKit compatibility

## 7. Planned Features

- GitHub Releases with auto-update notifications
- 15-day free trial + license key system
- README and landing page
- UI polish and onboarding improvements

## 8. Non-Goals

- Cloud storage or sync
- AI chat / summarization (v1 is search only)
- Cross-platform (macOS only for v1)
- Team / collaboration features
- Real-time notifications or alerts
- Browser extensions or per-app plugins
- Mobile

## 9. Success Metrics

| Category | Metric | Target |
|----------|--------|--------|
| Usage | Searches per user per day | 3+ |
| Usage | Recording uptime (% of active hours) | 80%+ |
| Retention | 30-day retention | Track |
| Business | Trial-to-paid conversion | 5-10% |
| Health | Sidecar crash rate | <1 per 8hr |
| Health | DB growth | <1 GB/month |
