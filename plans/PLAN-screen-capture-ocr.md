# Plan: Continuous Screen Capture with OCR

> **Type**: Reverse-engineering (existing feature)
> **Status**: Implemented
> **Feature**: Continuous screen capture with OCR text extraction

---

## 1. What This Feature Does

Continuously captures screenshots from all connected monitors, extracts visible
text via OCR, and stores both the video frames and extracted text in a local
SQLite database for full-text search.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    thadm-recorder (sidecar)                      │
│                                                                  │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────────┐  │
│  │ Monitor  │    │ VisionManager│    │  Per-Monitor Pipeline  │  │
│  │ Watcher  │───►│              │───►│  (one per display)     │  │
│  │ (30s poll)│    │  DashMap of  │    │                       │  │
│  └──────────┘    │  JoinHandles │    │  ┌─────────────────┐  │  │
│                  └──────────────┘    │  │ capture_image() │  │  │
│                                     │  │ (ScreenCaptureKit│  │  │
│                                     │  │  via sck_rs)     │  │  │
│                                     │  └────────┬────────┘  │  │
│                                     │           │            │  │
│                                     │     ┌─────▼─────┐     │  │
│                                     │     │ Frame     │     │  │
│                                     │     │ Dedup     │     │  │
│                                     │     │ (hist+    │     │  │
│                                     │     │  SSIM)    │     │  │
│                                     │     └─────┬─────┘     │  │
│                                     │           │            │  │
│                                     │   ┌───────┴───────┐   │  │
│                                     │   │               │   │  │
│                                     │   ▼               ▼   │  │
│                                     │ ┌──────┐    ┌───────┐ │  │
│                                     │ │ OCR  │    │ Video │ │  │
│                                     │ │(Apple│    │Encode │ │  │
│                                     │ │Vision│    │(H.265)│ │  │
│                                     │ │)     │    │       │ │  │
│                                     │ └──┬───┘    └───┬───┘ │  │
│                                     │    │            │     │  │
│                                     │    └─────┬──────┘     │  │
│                                     │          │            │  │
│                                     │    ┌─────▼─────┐     │  │
│                                     │    │  SQLite   │     │  │
│                                     │    │  (frames  │     │  │
│                                     │    │  + FTS5)  │     │  │
│                                     │    └───────────┘     │  │
│                                     └───────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Breakdown

### 3.1 Entry Point

| Item | Detail |
|------|--------|
| File | `screenpipe-server/src/bin/screenpipe-server.rs` |
| Key lines | 773-869 |
| Function | `main()` |

The sidecar binary (`thadm-recorder`) starts here. It initializes logging,
database, audio manager, and resource monitoring. Then it either:
- Creates a `VisionManager` for dynamic multi-monitor support, OR
- Spawns `start_continuous_recording()` with a fixed list of monitor IDs

The `VisionManager` path is the default and recommended approach.

### 3.2 VisionManager (Multi-Monitor Orchestrator)

| Item | Detail |
|------|--------|
| File | `screenpipe-server/src/vision_manager/manager.rs` |
| Key struct | `VisionManager` |
| Key fields | `recording_tasks: Arc<DashMap<u32, JoinHandle<()>>>` |

```rust
pub struct VisionManager {
    config: VisionManagerConfig,
    db: Arc<DatabaseManager>,
    vision_handle: Handle,
    status: Arc<RwLock<VisionManagerStatus>>,
    recording_tasks: Arc<DashMap<u32, JoinHandle<()>>>,
}
```

Responsibilities:
- Maintains a `DashMap` of monitor_id -> recording task handle
- `start_with_monitors(cached_monitors)` — starts recording on pre-fetched monitors
  (avoids redundant ScreenCaptureKit calls)
- `start_monitor_direct(monitor_id, monitor)` — starts a single monitor pipeline
- `stop_monitor(monitor_id)` — aborts the recording task
- Each monitor runs independently in its own Tokio task

### 3.3 Monitor Watcher (Hot-Plug Detection)

| Item | Detail |
|------|--------|
| File | `screenpipe-server/src/vision_manager/monitor_watcher.rs` |
| Key lines | 20-96 |
| Poll interval | 30 seconds |

```
Every 30 seconds:
  list_monitors() → current_ids
  Get active_ids from VisionManager

  NEW monitors (current - active):
    → start_monitor_direct()

  DISCONNECTED monitors (active - current):
    → stop_monitor()
```

macOS Sequoia optimization: 30s initial delay before first `list_monitors()` call
to avoid flooding the "bypass private window picker" dialog.

### 3.4 Per-Monitor Recording Pipeline

| Item | Detail |
|------|--------|
| File | `screenpipe-server/src/core.rs` |
| Key function | `record_video()` (line 117) |

`record_video()` is the main loop for each monitor. It:

1. Creates a `VideoCapture` instance
2. Spawns parallel tasks:
   - **capture thread** — calls `continuous_capture()` which takes screenshots at `fps` rate
   - **queue thread** — processes OCR on captured frames
   - **video thread** — encodes frames to H.265 via FFmpeg
3. Pops frames from `ocr_frame_queue`
4. Correlates each frame with its video offset via `FrameWriteTracker`
5. Inserts frame metadata + OCR text into SQLite

Error recovery: on any error, the outer loop in `start_monitor_direct()` waits 1s
and restarts.

### 3.5 Screenshot Capture (ScreenCaptureKit)

| Item | Detail |
|------|--------|
| File | `screenpipe-vision/src/monitor.rs` |
| Key struct | `SafeMonitor` |
| macOS backend | `sck_rs::Monitor` (ScreenCaptureKit) |
| Other OS | `xcap::Monitor` |

```rust
SafeMonitor::capture_image()
  → std::thread::spawn { Monitor::all().find(id).capture_image() }
  → Returns DynamicImage (RGBA8)
```

`SafeMonitor` wraps the platform-specific monitor handle and caches metadata
(width, height, name, is_primary) to avoid repeated system calls.

Window-level capture is handled by `capture_all_visible_windows()` in
`screenpipe-vision/src/capture_screenshot_by_window.rs`, which returns a
`Vec<CapturedWindow>` with per-window images, positions, app names, and
focused state.

### 3.6 Frame Deduplication (Histogram + SSIM)

| Item | Detail |
|------|--------|
| File | `screenpipe-vision/src/utils.rs` (lines 50-127) |
| Decision file | `screenpipe-vision/src/core.rs` (lines 240-295) |
| Threshold | 0.006 (0.6% change) |

Two-metric comparison:

```
current_average = (histogram_diff + ssim_diff) / 2.0

if current_average < 0.006 → SKIP (static frame)
else → process this frame
```

- `compare_images_histogram()` — Hellinger distance on grayscale histograms
- `compare_images_ssim()` — Multi-Scale SSIM on grayscale images

Result: ~94% of static frames are skipped, processing only frames with
meaningful visual changes.

### 3.7 OCR Pipeline (Apple Vision Framework)

| Item | Detail |
|------|--------|
| File | `screenpipe-vision/src/core.rs` (lines 332-524) |
| Apple OCR | `screenpipe-vision/src/apple.rs` (lines 75-200) |
| Cache | `screenpipe-vision/src/ocr_cache.rs` |
| Cache hit rate | ~70-90% |

Processing flow per frame:

```
For each CapturedWindow in frame:
  1. Calculate image hash of window content
  2. Check WindowOcrCache (5min expiry, max 100 windows)

  Cache HIT → reuse cached OCR result + transform coordinates
  Cache MISS → perform_ocr_apple(image, languages)
                 → Apple Vision RecognizeTextRequest
                 → Returns: text, bounding_boxes, confidence
                 → Store in cache
```

Apple Vision details (`apple.rs`):
1. Convert `DynamicImage` to grayscale 8-bit `PixelBuffer`
2. Create `RecognizeTextRequest` with language hints
3. Create `ImageRequestHandler`
4. Execute `handler.perform(requests)`
5. Extract: text, confidence, bounding boxes per text region

Coordinate transformation (lines 387-395): window-relative coordinates are
transformed to screen-relative for spatial indexing.

### 3.8 Video Encoding (H.265 via FFmpeg)

| Item | Detail |
|------|--------|
| File | `screenpipe-server/src/video.rs` (lines 419-765) |
| Codec | H.265/HEVC (`libx265`) |
| Preset | `ultrafast` |
| Quality | CRF 23 |
| Container | Fragmented MP4 |

FFmpeg command:
```bash
ffmpeg -f image2pipe -vcodec png -r {fps} -i - \
  -vf "pad=width=ceil(iw/2)*2:height=ceil(ih/2)*2" \
  -vcodec libx265 -tag:v hvc1 -preset ultrafast -crf 23 \
  -movflags frag_keyframe+empty_moov+default_base_moof \
  -pix_fmt yuv420p {output_file}
```

Key design decisions:
- **`-preset ultrafast`**: prioritize speed over compression ratio
- **`-crf 23`**: good quality/size balance (lower = better quality, bigger files)
- **`-tag:v hvc1`**: required for macOS QuickTime compatibility
- **Fragmented MP4**: allows reading frames while still recording
- **`image2pipe`**: frames piped via stdin as PNG, no temp files

Frame tracking via `FrameWriteTracker`:
```rust
pub struct FrameWriteTracker {
    writes: DashMap<u64, FrameWriteInfo>,       // frame_number → offset
    oldest_relevant_frame: AtomicU64,
}
```
Maps each frame number to its offset in the video file. The OCR insertion thread
uses this to correlate frame metadata with the correct video position.

### 3.9 Database Storage (SQLite)

| Item | Detail |
|------|--------|
| File | `screenpipe-db/src/db.rs` |
| Schema | `screenpipe-db/src/migrations/` (39 migrations) |
| Connection pool | 50 max, 3 min connections |
| Journal mode | WAL (Write-Ahead Logging) |

Core schema (after all migrations):
```sql
video_chunks {
    id INTEGER PRIMARY KEY,
    file_path TEXT,
    device_name TEXT          -- "monitor_0", "monitor_1"
}

frames {
    id INTEGER PRIMARY KEY,
    video_chunk_id INTEGER FK → video_chunks(id),
    offset_index INTEGER,     -- frame position in video
    timestamp TIMESTAMP,
    name TEXT,                -- video file path
    browser_url TEXT,
    app_name TEXT,
    window_name TEXT,
    focused BOOLEAN,
    device_name TEXT
}

ocr_text {
    frame_id INTEGER FK → frames(id),
    text TEXT
}

-- Full-text search (FTS5)
frames_fts USING fts5(name, browser_url, app_name, window_name, focused)
```

Performance pragmas:
```sql
PRAGMA journal_mode = WAL;           -- concurrent reads + async writes
PRAGMA cache_size = -64000;          -- 64MB page cache
PRAGMA mmap_size = 268435456;        -- 256MB memory-mapped I/O
PRAGMA temp_store = MEMORY;          -- temp tables in RAM
```

Insertion flow:
1. `insert_video_chunk(file_path, device_name)` → returns `video_chunk_id`
2. For each OCR result: `insert_frame(device_name, timestamp, app_name, window_name, focused, offset_index)` → returns `frame_id`
3. FTS triggers auto-populate `frames_fts`

---

## 4. Data Flow (End to End)

```
1. Screenshot
   SafeMonitor::capture_image()
   └─ sck_rs::Monitor → DynamicImage (RGBA8)
   └─ capture_all_visible_windows() → Vec<CapturedWindow>

2. Deduplication
   compare_images_histogram() + compare_images_ssim()
   └─ average < 0.006 → SKIP
   └─ average >= 0.006 → PROCESS

3. Fork into two parallel queues:
   ┌─ OCR Queue ──────────────────────────┐
   │ process_ocr_task()                    │
   │ └─ For each window:                   │
   │    ├─ Cache check (70-90% hit)        │
   │    └─ perform_ocr_apple() on miss     │
   │    └─ CaptureResult with OCR text     │
   └───────────────────────────────────────┘
   ┌─ Video Queue ────────────────────────┐
   │ save_frames_as_video()                │
   │ └─ PNG encode → pipe to FFmpeg stdin  │
   │ └─ FrameWriteTracker.record_write()   │
   └───────────────────────────────────────┘

4. Correlation
   FrameWriteTracker.get_offset(frame_number)
   └─ Maps OCR results to video frame positions

5. Database Insert
   db.insert_frame(metadata + offset_index)
   └─ frames table + FTS5 auto-update
```

---

## 5. Error Recovery

| Failure | Recovery | Location |
|---------|----------|----------|
| Screenshot fails | Sleep 1s, retry in outer loop | `manager.rs:188-194` |
| Monitor disconnected | Monitor watcher detects, stops task | `monitor_watcher.rs:60-80` |
| OCR fails | Log error, skip window, continue | `core.rs:440-450` |
| FFmpeg write fails | Retry up to 5 times (100ms delay) | `video.rs:721-755` |
| FFmpeg process dies | Start new process, new video chunk | `video.rs:650-680` |
| Database insert fails | Log error, continue capture | `core.rs:280-290` |
| 100 consecutive DB errors | Mark unhealthy, restart | `core.rs:208-213` |

Health monitoring: each pipeline has 4 task handles (capture, queue, video,
monitor_check). `check_health()` returns false if any handle is finished.

---

## 6. Key Optimizations

| Optimization | Impact | Detail |
|-------------|--------|--------|
| Frame deduplication | ~94% frames skipped | Histogram + SSIM comparison, threshold 0.006 |
| OCR window cache | 70-90% hit rate | 5min TTL, max 100 windows, image hash key |
| H.265 encoding | 60% smaller than H.264 | `libx265 -preset ultrafast -crf 23` |
| Fragmented MP4 | Streaming-friendly | Can read frames while still recording |
| WAL journal mode | Concurrent access | Readers don't block writers |
| Cached monitors | Fewer SCK calls | Pass `SafeMonitor` objects instead of re-querying |
| 30s monitor poll | Dialog flood prevention | Reduced from per-frame to 30s interval |
| Per-monitor isolation | Fault tolerance | Failed monitor doesn't block others |

---

## 7. File Map

| File | Role |
|------|------|
| `screenpipe-server/src/bin/screenpipe-server.rs` | Entry point, CLI args, initialization |
| `screenpipe-server/src/core.rs` | `record_video()`, frame processing loop, DB insertion |
| `screenpipe-server/src/video.rs` | FFmpeg encoding, `FrameWriteTracker`, health checks |
| `screenpipe-server/src/vision_manager/manager.rs` | `VisionManager`, per-monitor task orchestration |
| `screenpipe-server/src/vision_manager/monitor_watcher.rs` | Hot-plug monitor detection (30s poll) |
| `screenpipe-vision/src/monitor.rs` | `SafeMonitor`, `list_monitors()`, `capture_image()` |
| `screenpipe-vision/src/utils.rs` | `capture_screenshot()`, histogram/SSIM comparison |
| `screenpipe-vision/src/core.rs` | `continuous_capture()`, `process_ocr_task()`, dedup logic |
| `screenpipe-vision/src/apple.rs` | Apple Vision OCR (`perform_ocr_apple()`) |
| `screenpipe-vision/src/ocr_cache.rs` | `WindowOcrCache` (LRU, 5min TTL) |
| `screenpipe-vision/src/capture_screenshot_by_window.rs` | Per-window image extraction |
| `screenpipe-db/src/db.rs` | `DatabaseManager`, `insert_frame()`, pool config |
| `screenpipe-db/src/migrations/*.sql` | 39 schema migrations |

---

## 8. Key Structs

```rust
// screenpipe-vision/src/core.rs
pub struct CaptureResult {
    pub image: DynamicImage,
    pub frame_number: u64,
    pub timestamp: Instant,
    pub captured_at: DateTime<Utc>,
    pub window_ocr_results: Vec<WindowOcrResult>,
}

pub struct WindowOcrResult {
    pub image: DynamicImage,
    pub window_name: String,
    pub app_name: String,
    pub text: String,
    pub text_json: Vec<HashMap<String, String>>,  // bounding boxes
    pub focused: bool,
    pub confidence: f64,
    pub browser_url: Option<String>,
}

// screenpipe-server/src/vision_manager/manager.rs
pub struct VisionManagerConfig {
    pub output_path: String,
    pub fps: f64,
    pub video_chunk_duration: Duration,
    pub ocr_engine: Arc<OcrEngine>,
    pub use_pii_removal: bool,
    pub ignored_windows: Vec<String>,
    pub included_windows: Vec<String>,
    pub ignored_urls: Vec<String>,
    pub languages: Vec<Language>,
    pub capture_unfocused_windows: bool,
    pub realtime_vision: bool,
}

// screenpipe-server/src/video.rs
pub struct FrameWriteTracker {
    writes: DashMap<u64, FrameWriteInfo>,
    oldest_relevant_frame: AtomicU64,
}

pub struct FrameWriteInfo {
    pub offset: u64,
    pub video_path: String,
}
```

---

## 9. Known Limitations

1. **FrameWriteTracker memory**: accumulates entries until `cleanup_before()` is called
2. **OCR cache limit**: max 100 windows per monitor; oldest evicted if exceeded
3. **macOS Sequoia dialog**: mitigated but not eliminated; ~4 SCK calls/min remain
4. **FFmpeg ultrafast**: prioritizes speed over compression; alternative presets
   would reduce storage but increase CPU usage
5. **Single DB pool**: 50 max connections shared across all monitors; potential
   bottleneck with many monitors
6. **Protected windows**: some apps (private mode) skip capture gracefully
