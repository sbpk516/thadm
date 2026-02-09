# Thadm Development Guide

> Comprehensive guide for developers working on the Thadm desktop app.
> Follow these patterns when adding new features.

---

## 1. Tech Stack Overview

### Frontend (TypeScript/React)
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.1.4 | React framework (App Router) |
| React | 18 | UI library |
| Bun | - | Package manager (**NOT npm/pnpm**) |
| Zustand | 5.0.3 | Global state management |
| Tailwind CSS | 3.4.1 | Styling (with CSS variables) |
| Radix UI | - | Accessible UI primitives |
| shadcn/ui | - | Component library |
| Framer Motion | 11.5.4 | Animations |
| Zod | - | Schema validation |
| PostHog | - | Analytics (eu.i.posthog.com) |
| Vitest | - | Unit testing |

### Desktop Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| Tauri | 2.8.3 | Desktop app framework |
| tauri-specta | - | Auto-generate TS bindings |

### Backend (Rust)
| Technology | Purpose |
|------------|---------|
| Axum | HTTP server framework |
| SQLite + sqlx | Database |
| Tracing | Logging |
| Candle ML | Local ML models |

---

## 2. Project Structure

```
screenpipe-app-tauri/
├── app/                    # Next.js pages (App Router)
│   ├── page.tsx           # Home/timeline
│   ├── settings/          # Settings pages
│   ├── chat/              # Chat interface
│   ├── onboarding/        # Onboarding flow
│   ├── layout.tsx         # Root layout
│   └── providers.tsx      # Global providers
│
├── components/
│   ├── ui/                # Radix + shadcn components
│   ├── rewind/            # Timeline visualization
│   ├── settings/          # Settings UI
│   └── onboarding/        # Onboarding components
│
├── lib/
│   ├── hooks/             # Zustand stores + custom hooks
│   │   ├── use-settings.tsx
│   │   ├── use-timeline-store.tsx
│   │   ├── use-health-check.tsx
│   │   └── use-keyword-search-store.tsx
│   ├── actions/           # Server actions
│   ├── api/               # API client classes
│   └── utils/
│       ├── tauri.ts       # AUTO-GENERATED Tauri commands
│       └── validation.ts  # Zod schemas
│
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── main.rs        # App initialization
│   │   ├── commands.rs    # Tauri commands
│   │   ├── sidecar.rs     # Sidecar management
│   │   ├── permissions.rs # macOS permissions
│   │   └── store.rs       # Persistent storage
│   └── tauri.conf.json    # Tauri config
│
└── public/                # Static assets

screenpipe-server/         # Backend server (sidecar)
├── src/
│   ├── bin/screenpipe-server.rs
│   ├── server.rs          # Axum routes
│   └── lib.rs
└── Cargo.toml
```

---

## 3. Frontend Patterns

### 3.1 Component Pattern

```typescript
// Always mark interactive components as client components
"use client";

import { useSettings } from "@/lib/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MyComponentProps {
  className?: string;
  title: string;
}

export function MyComponent({ className, title }: MyComponentProps) {
  const { settings } = useSettings();

  return (
    <div className={cn("p-4", className)}>
      <h2>{title}</h2>
      <Button>{settings.theme}</Button>
    </div>
  );
}
```

**Rules:**
- Use `"use client"` for interactive components
- Import UI from `@/components/ui/`
- Use `cn()` for class merging
- One component per file
- Props interface above component

### 3.2 State Management (Zustand)

```typescript
// lib/hooks/use-my-store.tsx
import { create } from "zustand";

interface MyState {
  // State
  items: Item[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setItems: (items: Item[]) => void;
  fetchItems: () => Promise<void>;
  reset: () => void;
}

export const useMyStore = create<MyState>((set, get) => ({
  // Initial state
  items: [],
  isLoading: false,
  error: null,

  // Actions
  setItems: (items) => set({ items }),

  fetchItems: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch("http://localhost:3030/items");
      const data = await response.json();
      set({ items: data, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
    }
  },

  reset: () => set({ items: [], isLoading: false, error: null }),
}));
```

**Usage in components:**
```typescript
// Full store
const { items, fetchItems, isLoading } = useMyStore();

// With selector (prevents unnecessary re-renders)
const items = useMyStore((state) => state.items);
```

### 3.3 API Calls Pattern

**Direct fetch to sidecar:**
```typescript
const response = await fetch("http://localhost:3030/endpoint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ data }),
});
const result = await response.json();
```

**Tauri commands (IPC to Rust):**
```typescript
import { commands } from "@/lib/utils/tauri";

// Commands are auto-generated with full types
await commands.spawnScreenpipe(null);
const status = await commands.doPermissionsCheck(true);
```

**WebSocket streaming:**
```typescript
const ws = new WebSocket("ws://localhost:3030/stream/timeseries");
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  set((state) => ({ frames: [...state.frames, ...data] }));
};
```

### 3.4 Custom Hooks Pattern

```typescript
// lib/hooks/use-my-feature.tsx
import { useState, useEffect, useCallback } from "react";
import { useMyStore } from "./use-my-store";

export function useMyFeature() {
  const { items, fetchItems } = useMyStore();
  const [localState, setLocalState] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  const doSomething = useCallback(() => {
    setLocalState(true);
  }, []);

  return {
    items,
    localState,
    doSomething,
  };
}
```

### 3.5 Styling Pattern

```typescript
// Use Tailwind classes
<div className="flex items-center gap-4 p-4 bg-background">
  <span className="text-sm text-muted-foreground">Label</span>
</div>

// Conditional classes with cn()
<div className={cn(
  "p-4 border",
  isActive && "border-primary bg-primary/10",
  className
)}>

// Dark mode (automatic via CSS variables)
<div className="bg-background text-foreground">
```

**Color tokens** (defined in globals.css):
- `background`, `foreground`
- `primary`, `primary-foreground`
- `secondary`, `muted`, `accent`
- `destructive`, `success`

---

## 4. Backend Patterns (Rust/Tauri)

### 4.1 Tauri Commands

```rust
// src-tauri/src/commands.rs

// Simple command
#[tauri::command]
#[specta::specta]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// Async command with error handling
#[tauri::command]
#[specta::specta]
pub async fn my_command(
    app_handle: tauri::AppHandle,
    param: String,
) -> Result<MyResponse, String> {
    // Implementation
    Ok(MyResponse { ... })
}

// Command with app state
#[tauri::command]
#[specta::specta]
pub async fn with_state(
    state: tauri::State<'_, MyState>,
) -> Result<(), String> {
    // Access shared state
    Ok(())
}
```

**Decorators:**
- `#[tauri::command]` - Exposes to frontend
- `#[specta::specta]` - Generates TypeScript types

### 4.2 HTTP Endpoints (Axum)

```rust
// screenpipe-server/src/server.rs

// Route definition
let app = Router::new()
    .route("/health", get(health_check))
    .route("/search", post(search_handler))
    .route("/items/:id", get(get_item))
    .with_state(app_state);

// Handler
async fn search_handler(
    State(db): State<Arc<DatabaseManager>>,
    Json(payload): Json<SearchRequest>,
) -> impl IntoResponse {
    match db.search(&payload.query).await {
        Ok(results) => Json(json!({ "results": results })),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
```

### 4.3 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                        │
├─────────────────────────────────────────────────────────────┤
│  Component                                                  │
│      ↓                                                      │
│  Zustand Store (state + actions)                           │
│      ↓                                                      │
│  fetch() / commands.xxx()                                  │
└─────────────────────────────────────────────────────────────┘
              │                           │
              │ Tauri IPC                 │ HTTP
              ↓                           ↓
┌─────────────────────┐     ┌─────────────────────────────────┐
│   TAURI (Rust)      │     │   SIDECAR (screenpipe-server)   │
│   - Window mgmt     │     │   - HTTP API (:3030)            │
│   - Permissions     │     │   - WebSocket streaming         │
│   - Store           │     │   - Database queries            │
│   - Sidecar spawn   │     │   - ML processing               │
└─────────────────────┘     └─────────────────────────────────┘
                                          │
                                          ↓
                            ┌─────────────────────────────────┐
                            │        SQLite Database          │
                            └─────────────────────────────────┘
```

---

## 5. Feature Implementation Checklist

### Step 1: Plan
- [ ] Read existing similar features
- [ ] Design data flow diagram
- [ ] Identify files to modify
- [ ] Get approval if >3 files

### Step 2: Backend (if needed)
- [ ] Add HTTP endpoint in `screenpipe-server/src/server.rs`
- [ ] Add Tauri command in `src-tauri/src/commands.rs`
- [ ] Run `cargo test`

### Step 3: Frontend Store
- [ ] Create `lib/hooks/use-feature-store.tsx`
- [ ] Define state interface
- [ ] Implement actions

### Step 4: Frontend Components
- [ ] Create components in `components/feature/`
- [ ] Use existing UI components
- [ ] Follow styling patterns

### Step 5: Integration
- [ ] Add to routing (if page)
- [ ] Add to settings (if configurable)
- [ ] Add analytics events

### Step 6: Testing
- [ ] Write unit tests
- [ ] Run `bun test`
- [ ] Manual testing

---

## 6. Common Patterns

### Adding a New Page

```typescript
// app/mypage/page.tsx
"use client";

import { useEffect } from "react";
import { useMyStore } from "@/lib/hooks/use-my-store";

export default function MyPage() {
  const { data, fetchData } = useMyStore();

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold">My Page</h1>
      {/* Content */}
    </div>
  );
}
```

### Adding Settings

```typescript
// In app/settings/page.tsx or components/settings/my-setting.tsx
import { useSettings } from "@/lib/hooks/use-settings";

export function MySetting() {
  const { settings, updateSettings } = useSettings();

  return (
    <div>
      <Switch
        checked={settings.myOption}
        onCheckedChange={(checked) =>
          updateSettings({ myOption: checked })
        }
      />
    </div>
  );
}
```

### Error Handling

```typescript
// In Zustand store
fetchData: async () => {
  set({ isLoading: true, error: null });
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    set({ data, isLoading: false });
  } catch (error) {
    console.error("Fetch error:", error);
    set({ error: error.message, isLoading: false });
  }
}

// In component
const { error } = useMyStore();
if (error) {
  return <Alert variant="destructive">{error}</Alert>;
}
```

### Toast Notifications

```typescript
import { useToast } from "@/components/ui/use-toast";

function MyComponent() {
  const { toast } = useToast();

  const handleAction = async () => {
    try {
      await doSomething();
      toast({ title: "Success", description: "Action completed" });
    } catch {
      toast({
        title: "Error",
        description: "Action failed",
        variant: "destructive"
      });
    }
  };
}
```

### Analytics

```typescript
import posthog from "posthog-js";

// Track event
posthog.capture("feature_used", {
  feature: "search",
  query_length: query.length,
});

// Track page view (automatic in most cases)
posthog.capture("$pageview");
```

---

## 7. Testing

### Unit Tests (Vitest)

```typescript
// components/__tests__/my-component.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MyComponent } from "../my-component";

describe("MyComponent", () => {
  it("renders correctly", () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("handles click", async () => {
    const onClick = vi.fn();
    render(<MyComponent onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });
});
```

Run: `bun test`

### Rust Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_my_function() {
        let result = my_function("input");
        assert_eq!(result, "expected");
    }

    #[tokio::test]
    async fn test_async_function() {
        let result = async_function().await;
        assert!(result.is_ok());
    }
}
```

Run: `cargo test`

---

## 8. Debugging

### Frontend
- Browser DevTools → Console
- React DevTools extension
- Console logs saved: `localStorage.getItem("console_logs")`

### Rust/Tauri
- Logs: `~/Library/Logs/screenpipe/` (macOS)
- Use `tracing` macros: `info!()`, `error!()`, `debug!()`
- Run with: `RUST_LOG=debug bun tauri dev`

### Network
- Backend: `http://localhost:3030`
- WebSocket: `ws://localhost:3030`
- Browser DevTools → Network tab

---

## 9. Development Rules

### DO
- Read existing code before writing
- Change ONE file at a time
- Add new functions instead of modifying existing
- Run tests after every change
- Use specific `git add` (not `git add .`)

### DON'T
- Change >3 files without approval
- Refactor while adding features
- Delete/rename functions without approval
- Add dependencies without asking
- Skip tests

---

## 10. Quick Reference

### Commands
```bash
# Install dependencies
bun install

# Run development
bun tauri dev

# Run tests
bun test           # Frontend
cargo test         # Rust

# Build
bun tauri build

# Clean
bun run clean
```

### Key Files
| File | Purpose |
|------|---------|
| `tauri.conf.json` | App name, bundle ID, icons |
| `package.json` | Dependencies, scripts |
| `globals.css` | CSS variables, colors |
| `tailwind.config.ts` | Tailwind theme |
| `lib/utils/tauri.ts` | Auto-generated Tauri commands |

### Important Hooks
| Hook | Purpose |
|------|---------|
| `useSettings()` | Global settings |
| `useTimelineStore()` | Timeline data |
| `useHealthCheck()` | Server health |
| `usePlatform()` | OS detection |
| `useToast()` | Notifications |
