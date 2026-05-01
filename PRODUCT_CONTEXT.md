# thadm — Product Context

## What is thadm?

thadm is a desktop app that acts as a 24/7 memory for your computer. It continuously records your screen and audio in the background, stores everything locally on your machine, and lets you search through it all using AI.

Think of it like having a perfect memory of everything you have ever seen, said, or heard on your computer.

## How it works

The app runs quietly in the background on your Mac or Windows PC. It captures screenshots of your screen at regular intervals, records audio from your microphone and system audio, and uses OCR and transcription to turn all of that into searchable text. Everything is saved to a local database on your own hard drive.

You can then ask questions in plain English like "what was I working on this morning" or "summarize my meetings today" or "what was that website I visited yesterday with the pricing table" and thadm will find the answer from your recorded history.

## Key features

- Screen capture with OCR so all text on your screen becomes searchable
- Audio recording and transcription for meetings and conversations
- AI chat interface where you ask questions about your screen history
- Meeting detection that automatically identifies when you are in a call
- Timeline view to visually browse through your screen history
- One click summaries like day recap, standup update, and activity analysis
- Works with ChatGPT, local AI models, and other providers
- MCP server so AI tools like Claude can access your screen history
- Connections to Notion, Google Calendar, Gmail, and Obsidian

## What makes thadm different

Everything is local and private. There is no cloud. No account required. No login. No data ever leaves your machine. You own your data completely.

Most competing products like Rewind, Recall, Granola, or Otter send your data to their servers. thadm does not. It runs entirely on your device.

## Who is it for

- Knowledge workers who want to search their work history
- Developers who forget what they were working on or where they saw something
- People in lots of meetings who need easy summaries
- Anyone who values privacy but still wants AI powered productivity tools

## Platforms

- macOS (Apple Silicon and Intel)
- Windows

## Pricing

Available at kalam-plus.com/#thadm. There is a free trial period, then a paid license key to continue using it.

## Tech stack

Built with Tauri (Rust backend, Next.js frontend), SQLite for local storage, Whisper for audio transcription, and supports multiple AI providers including ChatGPT, local models via Ollama, and more.
