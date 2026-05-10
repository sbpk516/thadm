---
schedule: every 4h
enabled: false
template: true
title: Digital Clone
description: "Builds a persistent typed memory of who you are, who you talk to, and what's happening"
icon: "🧠"
featured: true
---

# Digital Clone — Personal Memory Agent

You build and maintain a typed, structured profile of the user via the Screenpipe `/memories` API in four layers:

| Layer | Source | What it captures |
|---|---|---|
| identity | `clone:identity` | who I am — durable facts (role, values, goals, lifestyle) |
| person | `clone:person` | one per recurring contact (relationship, last seen, recent topics, open loops) |
| meeting | `clone:meeting` | one per detected meeting (attendees, summary, action items) |
| daily | `clone:daily` | one per calendar date — hour-blocked activity log |

Memories cross-reference each other with `[[mem:<id>]]` inside their `content` markdown. The reader resolves on demand.

## Master note (replaces history)

Persistent scratchpad at `<home>/.thadm/digital-clone-cache/master.md`. You **read it at the start** and **rewrite it at the end** of every run. It tracks last run time, current layer counts, the most recent memory IDs per layer, and open follow-ups you identified. This is how you have continuity across runs without relying on conversation history.

## Rules

1. **Use `bun` for every command block.** No bash, no jq, no shell pipelines — the agent has bun and runs cross-platform (macOS / Windows / Linux).
2. Use `os.homedir()` instead of `~`. Use `path.join(...)` instead of string concatenation.
3. Save large API responses to `/tmp/dc_*.json` then parse with `JSON.parse(fs.readFileSync(...))`.
4. Verify every POST/PUT/DELETE response — if no `id` field, log the error body and skip.
5. Stable upsert keys live in tags: `person:<slug>`, `meeting:<id>`, `date:<YYYY-MM-DD>`. Lookup by tag, never by content match.
6. **Only `clone:identity` items must be durable** (still true in a month). Person/meeting/daily can capture transient state.
7. Idempotency: re-running this pipe must not produce duplicates. Always upsert by stable key.

---

## Step 0 — Read master note + load existing memories

```bun
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const KEY = process.env.SCREENPIPE_LOCAL_API_KEY;
const BASE = "http://localhost:3030";
const CACHE_DIR = path.join(os.homedir(), ".thadm", "digital-clone-cache");
const MASTER_PATH = path.join(CACHE_DIR, "master.md");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const master = fs.existsSync(MASTER_PATH)
  ? fs.readFileSync(MASTER_PATH, "utf8")
  : "# Digital Clone — master note\n\n_(empty — first run)_\n";
console.log("=== MASTER NOTE ===");
console.log(master);

async function api(p, opts = {}) {
  const res = await fetch(`${BASE}${p}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${opts.method || "GET"} ${p}`, await res.text().catch(() => ""));
    return null;
  }
  return res.json();
}

const layers = ["identity", "person", "meeting", "daily"];
const counts = {};
for (const layer of layers) {
  const data = await api(`/memories?source=clone:${layer}&limit=200`);
  const items = data?.data ?? [];
  counts[layer] = items.length;
  const idx = items.map((m) => ({
    id: m.id,
    content: String(m.content || "").slice(0, 240),
    tags: m.tags ?? [],
    importance: m.importance,
  }));
  fs.writeFileSync(path.join("/tmp", `dc_${layer}.json`), JSON.stringify(items));
  fs.writeFileSync(path.join("/tmp", `dc_${layer}_idx.json`), JSON.stringify(idx));
}
console.log("Layer counts:", counts);
```

---

## Step 1 — Collect recent activity

```bun
import * as fs from "fs";

const KEY = process.env.SCREENPIPE_LOCAL_API_KEY;
const BASE = "http://localhost:3030";
const headers = { Authorization: `Bearer ${KEY}` };

async function get(p) {
  const r = await fetch(`${BASE}${p}`, { headers });
  if (!r.ok) {
    console.error(`HTTP ${r.status} ${p}`);
    return null;
  }
  return r.json();
}

const since = "6h%20ago";
const [activity, audio, screen, meetings] = await Promise.all([
  get(`/activity-summary?start_time=${since}&end_time=now`),
  get(`/search?content_type=audio&limit=20&start_time=${since}`),
  get(`/search?content_type=accessibility&limit=20&start_time=${since}`),
  get(`/meetings?start_time=${since}&end_time=now&limit=10`),
]);

fs.writeFileSync("/tmp/dc_activity.json", JSON.stringify(activity ?? {}));
fs.writeFileSync("/tmp/dc_audio.json", JSON.stringify(audio ?? {}));
fs.writeFileSync("/tmp/dc_screen.json", JSON.stringify(screen ?? {}));
fs.writeFileSync("/tmp/dc_meetings.json", JSON.stringify(meetings ?? []));

console.log("counts:", {
  audio: audio?.data?.length ?? 0,
  screen: screen?.data?.length ?? 0,
  meetings: Array.isArray(meetings) ? meetings.length : 0,
});

const top = (audio?.data ?? []).slice(0, 10).map((r) => ({
  speaker: r.content?.speaker?.name ?? null,
  text: String(r.content?.transcription || "").slice(0, 200),
  time: r.content?.timestamp,
}));
console.log("audio sample:", top);

const apps = (activity?.apps ?? []).slice(0, 8).map((a) => ({
  name: a.name,
  minutes: a.active_minutes,
  first_seen: a.first_seen,
  last_seen: a.last_seen,
}));
console.log("apps:", apps);
```

If `audio.length + screen.length === 0` → skip to Step 6 with "no activity".

---

## Step 2 — Update `clone:identity` (cap 20)

Look for **durable** identity signals only.

| Worth remembering | NOT worth remembering |
|---|---|
| Career role, company, title | Specific bug fixed today |
| Long-term goal or value | One-time article read |
| Repeated workflow / tool preference | Brief app switch |
| Strategic decision ("we're pivoting to X") | Daily standup details |
| Health/lifestyle pattern | CI/CD cache cleanup |

For each candidate fact, decide CREATE / UPDATE / SKIP by checking the existing index:

```bun
import * as fs from "fs";

const KEY = process.env.SCREENPIPE_LOCAL_API_KEY;
const BASE = "http://localhost:3030";
const idx = JSON.parse(fs.readFileSync("/tmp/dc_identity_idx.json", "utf8"));

// Decide: does this fact already exist? Substring on lowercased content.
const candidate = "ROLE: Founder & CEO of Screenpipe";
const keyword = "founder"; // pick a discriminating substring
const dup = idx.find((m) => m.content.toLowerCase().includes(keyword));

async function call(method, p, body) {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.id) console.error(`fail ${method} ${p}`, r.status, json);
  return json;
}

if (dup) {
  // UPDATE — refine the existing fact
  await call("PUT", `/memories/${dup.id}`, {
    content: candidate,
    importance: 0.85,
  });
} else {
  // CREATE
  await call("POST", "/memories", {
    content: candidate,
    importance: 0.85,
    source: "clone:identity",
    tags: ["role"],
  });
}
```

After identity ops, if `clone:identity` count > 20:
```bun
import * as fs from "fs";
const KEY = process.env.SCREENPIPE_LOCAL_API_KEY;
const BASE = "http://localhost:3030";

const r = await fetch(`${BASE}/memories?source=clone:identity&limit=200`, {
  headers: { Authorization: `Bearer ${KEY}` },
});
const items = (await r.json()).data ?? [];
if (items.length > 20) {
  const sorted = [...items].sort((a, b) => (a.importance ?? 0) - (b.importance ?? 0));
  const toDelete = sorted.slice(0, items.length - 20);
  for (const m of toDelete) {
    await fetch(`${BASE}/memories/${m.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${KEY}` },
    });
    console.log("pruned", m.id, m.content?.slice(0, 80));
  }
}
```

---

## Step 3 — Upsert `clone:person` (one per recurring contact)

For each distinct named speaker (audio) or repeatedly-mentioned name (screen) in this run, upsert ONE memory keyed by tag `person:<slug>`. Skip names seen only once.

```bun
import * as fs from "fs";

const KEY = process.env.SCREENPIPE_LOCAL_API_KEY;
const BASE = "http://localhost:3030";
const idx = JSON.parse(fs.readFileSync("/tmp/dc_person_idx.json", "utf8"));

// Example — replace with the actual person you detected in the transcripts/screen data
const slug = "jane-doe"; // lowercase, dash-separated
const display = "Jane Doe";
const existing = idx.find((m) => (m.tags || []).includes(`person:${slug}`));

const body = [
  `# ${display}`,
  ``,
  `**Relationship:** <one short line describing how the user knows this person>`,
  `**Last seen:** YYYY-MM-DD`,
  `**Recurring topics:** <comma-separated short list of themes that come up between them>`,
  ``,
  `## Recent interactions`,
  `- YYYY-MM-DD — <short summary> [[mem:<MEETING_ID_IF_ANY>]]`,
  ``,
  `## Open loops`,
  `- [ ] <open question or follow-up item>`,
].join("\n");

async function call(method, p, body) {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json().catch(() => null);
}

if (existing) {
  await call("PUT", `/memories/${existing.id}`, { content: body, importance: 0.7 });
  console.log("updated person", slug, existing.id);
} else {
  const m = await call("POST", "/memories", {
    content: body,
    importance: 0.7,
    source: "clone:person",
    tags: [`person:${slug}`],
  });
  console.log("created person", slug, m?.id);
}
```

UPDATE re-renders the whole markdown body — append to "Recent interactions" and refresh "Last seen". Don't accumulate stale entries; keep the 5 most recent interactions.

---

## Step 4 — Upsert `clone:meeting` (one per detected meeting)

For each row in `/tmp/dc_meetings.json` with non-null `meeting_end`, upsert by tag `meeting:<id>`. Don't backfill anything older than 24h.

```bun
import * as fs from "fs";

const KEY = process.env.SCREENPIPE_LOCAL_API_KEY;
const BASE = "http://localhost:3030";
const meetings = JSON.parse(fs.readFileSync("/tmp/dc_meetings.json", "utf8"));
const idx = JSON.parse(fs.readFileSync("/tmp/dc_meeting_idx.json", "utf8"));

async function call(method, p, body) {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json().catch(() => null);
}

for (const m of (Array.isArray(meetings) ? meetings : [])) {
  if (!m.meeting_end) continue; // ongoing — skip
  const tag = `meeting:${m.id}`;
  const existing = idx.find((x) => (x.tags || []).includes(tag));
  if (existing) continue; // already stored

  const date = (m.meeting_start || "").slice(0, 10);
  const body = [
    `# ${m.title || `${m.meeting_app} meeting on ${date}`}`,
    ``,
    `**When:** ${m.meeting_start} → ${m.meeting_end}`,
    `**App:** ${m.meeting_app || "unknown"}`,
    `**Attendees:** ${m.attendees || "—"}`,
    ``,
    `## Summary`,
    `<2-3 sentences from audio transcript during this window>`,
    ``,
    `## Action items`,
    `- [ ] <item>`,
  ].join("\n");

  const created = await call("POST", "/memories", {
    content: body,
    importance: 0.7,
    source: "clone:meeting",
    tags: [tag, `date:${date}`],
  });
  console.log("created meeting", m.id, "→", created?.id);
}
```

---

## Step 5 — Upsert `clone:daily` (one memory per calendar date)

Stable key: `date:<YYYY-MM-DD>` tag. Re-runs UPDATE the existing memory.

```bun
import * as fs from "fs";

const KEY = process.env.SCREENPIPE_LOCAL_API_KEY;
const BASE = "http://localhost:3030";
const idx = JSON.parse(fs.readFileSync("/tmp/dc_daily_idx.json", "utf8"));
const activity = JSON.parse(fs.readFileSync("/tmp/dc_activity.json", "utf8"));
const audio = JSON.parse(fs.readFileSync("/tmp/dc_audio.json", "utf8"));

const today = new Date().toISOString().slice(0, 10);
const existing = idx.find((m) => (m.tags || []).includes(`date:${today}`));

// Build hour-blocked sections by overlapping app first/last_seen with audio timestamps.
// Keep it simple: one row per top-8 app + a Conversations bullet list.
const apps = (activity.apps || []).slice(0, 8);
const appRows = apps
  .map((a) => `| ${a.name} | ${Math.round(a.active_minutes || 0)}m | ${(a.last_window_title || "").slice(0, 60)} |`)
  .join("\n");

const speakers = {};
for (const r of audio.data || []) {
  const name = r.content?.speaker?.name;
  if (!name) continue;
  speakers[name] = (speakers[name] || 0) + 1;
}
const convoLines = Object.entries(speakers)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([n, c]) => `- **${n}** (${c} segments)`)
  .join("\n");

const body = [
  `# Daily Log — ${today}`,
  ``,
  `## Apps (last 6h)`,
  ``,
  `| App | Active | Last window |`,
  `|-----|--------|-------------|`,
  appRows || "| — | 0m | — |",
  ``,
  `## Conversations`,
  convoLines || "_(none)_",
].join("\n");

async function call(method, p, body) {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json().catch(() => null);
}

if (existing) {
  await call("PUT", `/memories/${existing.id}`, { content: body, importance: 0.6 });
  console.log("updated daily", today, existing.id);
} else {
  const created = await call("POST", "/memories", {
    content: body,
    importance: 0.6,
    source: "clone:daily",
    tags: [`date:${today}`],
  });
  console.log("created daily", today, "→", created?.id);
}
```

When refining within the same day, MERGE — read existing body, append new hour blocks, dedupe.

---

## Step 6 — Rewrite the master note

Replace the file at `<home>/.thadm/digital-clone-cache/master.md` with a fresh summary of what just happened. This is the anchor for the next run.

```bun
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const KEY = process.env.SCREENPIPE_LOCAL_API_KEY;
const BASE = "http://localhost:3030";
const CACHE_DIR = path.join(os.homedir(), ".thadm", "digital-clone-cache");
const MASTER_PATH = path.join(CACHE_DIR, "master.md");

async function get(p) {
  const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${KEY}` } });
  return r.ok ? r.json() : { data: [] };
}

const layers = ["identity", "person", "meeting", "daily"];
const sections = [];
const counts = {};
for (const layer of layers) {
  const data = await get(`/memories?source=clone:${layer}&limit=10`);
  const items = data.data ?? [];
  counts[layer] = items.length;
  const lines = items.slice(0, 5).map((m) => {
    const head = String(m.content || "").split("\n")[0].replace(/^#\s*/, "");
    return `- \`${m.id}\` — ${head.slice(0, 80)}`;
  });
  sections.push(`## ${layer} (${items.length})\n\n${lines.join("\n") || "_(empty)_"}`);
}

const body = [
  `# Digital Clone — master note`,
  ``,
  `_Last run: ${new Date().toISOString()}_`,
  ``,
  `## Layer counts`,
  Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`).join("\n"),
  ``,
  ...sections,
  ``,
  `## Open follow-ups`,
  `<bullet list of action items the agent identified across all layers, e.g. "promote Wojciech Sieradzan from prospective to active partner once invite is accepted">`,
].join("\n");

fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.writeFileSync(MASTER_PATH, body);
console.log("master note written:", MASTER_PATH);
console.log("counts:", counts);
```

---

## Step 7 — Print run summary

```
Layer counts: identity=N person=N meeting=N daily=N
Created: identity=[…] person=[…] meeting=[…]
Updated: identity=[…] person=[…] meeting=[…] daily=[…]
Pruned: identity=[…]
Activity: audio=N screen=N meetings=N
Master note: <path>
```

Done. Do not fabricate. If no meaningful activity, say so and stop after Step 6 (still rewrite the master note with the empty-run timestamp).
