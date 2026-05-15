// src/config.ts
var DEFAULT_BASE_URL = "http://127.0.0.1:3030";
var STORAGE_KEY_TOKEN = "screenpipe_token";
var STORAGE_KEY_BASE_URL = "screenpipe_base_url";
var BROWSER_BASE_PATH = "/connections/browser";
function buildWsUrl(baseHttpUrl, token) {
  const base = baseHttpUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  const path = `${BROWSER_BASE_PATH}/ws`;
  if (!token)
    return `${base}${path}`;
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}
function healthUrl(baseHttpUrl) {
  return `${baseHttpUrl.replace(/\/$/, "")}/health`;
}
function browserStatusUrl(baseHttpUrl) {
  return `${baseHttpUrl.replace(/\/$/, "")}${BROWSER_BASE_PATH}/status`;
}
function searchUrl(baseHttpUrl, query, limit = 8) {
  const base = baseHttpUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    content_type: "all"
  });
  return `${base}/search?${params.toString()}`;
}

// src/popup.ts
var $ = (id) => document.getElementById(id);
async function getConfig() {
  const s = await chrome.storage.local.get([STORAGE_KEY_TOKEN, STORAGE_KEY_BASE_URL]);
  return {
    token: s[STORAGE_KEY_TOKEN] ?? "",
    baseUrl: s[STORAGE_KEY_BASE_URL] ?? DEFAULT_BASE_URL
  };
}
async function probeStatus(token, baseUrl) {
  try {
    const h = await fetch(healthUrl(baseUrl), {
      signal: AbortSignal.timeout(3000)
    });
    if (!h.ok)
      return "server_down";
  } catch {
    return "server_down";
  }
  try {
    const headers = {};
    if (token)
      headers["Authorization"] = `Bearer ${token}`;
    const r = await fetch(browserStatusUrl(baseUrl), {
      headers,
      signal: AbortSignal.timeout(3000)
    });
    if (r.status === 401 || r.status === 403)
      return "auth_required";
    if (!r.ok)
      return "error";
    const data = await r.json();
    return data.connected === true ? "ok" : "bridge_down";
  } catch {
    return "error";
  }
}
function setStatusUI(status) {
  const bar = $("status-bar");
  const text = $("status-text");
  bar.dataset.state = status;
  const labels = {
    checking: "checking…",
    ok: "bridge connected",
    bridge_down: "server reachable — bridge connecting…",
    auth_required: "needs token — open settings",
    server_down: "thadm not running",
    error: "connection error"
  };
  text.textContent = labels[status];
}
async function searchThadm(query, token, baseUrl) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const resp = await fetch(searchUrl(baseUrl, query), {
    headers,
    signal: AbortSignal.timeout(15000)
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error("missing or invalid API token — open settings (⚙) to paste it");
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`thadm /search returned ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.data ?? [];
}
function relativeTime(iso) {
  if (!iso)
    return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()))
    return "";
  const diff = Date.now() - d.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60)
    return `${sec}s ago`;
  if (sec < 3600)
    return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400)
    return `${Math.round(sec / 3600)}h ago`;
  if (sec < 172800)
    return "yesterday";
  if (sec < 604800)
    return `${Math.round(sec / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function snippet(text, query, len = 160) {
  const t = text.replace(/\s+/g, " ").trim();
  if (!query)
    return t.slice(0, len);
  const idx = t.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1)
    return t.slice(0, len);
  const start = Math.max(0, idx - Math.floor(len / 3));
  const end = Math.min(t.length, start + len);
  return (start > 0 ? "…" : "") + t.slice(start, end) + (end < t.length ? "…" : "");
}
function renderResults(items, query, container) {
  container.classList.remove("error");
  if (items.length === 0) {
    container.classList.add("error");
    container.textContent = "no results";
    return;
  }
  container.innerHTML = "";
  for (const item of items) {
    const card = document.createElement("div");
    card.className = "result";
    const meta = document.createElement("div");
    meta.className = "result-meta";
    const left = document.createElement("span");
    const typeBadge = document.createElement("span");
    typeBadge.className = "result-type";
    typeBadge.textContent = item.type;
    const app = document.createElement("span");
    app.className = "result-app";
    app.textContent = [item.content.app_name, item.content.window_name].filter((s) => s && s.trim()).join(" · ") || "—";
    left.append(typeBadge, app);
    const right = document.createElement("span");
    right.textContent = relativeTime(item.content.timestamp);
    meta.append(left, right);
    const body = document.createElement("div");
    body.className = "result-text";
    const raw = item.content.text ?? item.content.transcription ?? "";
    body.textContent = snippet(raw, query);
    card.append(meta, body);
    container.append(card);
  }
}
function wireSearch(token, baseUrl) {
  const input = $("query");
  const btn = $("search-btn");
  const out = $("results");
  let inFlight = false;
  const run = async () => {
    const q = input.value.trim();
    if (!q || inFlight)
      return;
    inFlight = true;
    btn.disabled = true;
    btn.textContent = "Searching…";
    out.classList.remove("error");
    out.textContent = "";
    try {
      const items = await searchThadm(q, token, baseUrl);
      renderResults(items, q, out);
    } catch (e) {
      out.classList.add("error");
      out.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      inFlight = false;
      btn.disabled = false;
      btn.textContent = "Search";
    }
  };
  btn.addEventListener("click", () => void run());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
    }
  });
}
async function init() {
  const { token, baseUrl } = await getConfig();
  $("settings-btn").addEventListener("click", () => {
    const optionsUrl = chrome.runtime.getURL("options.html");
    chrome.tabs.create({ url: optionsUrl }).finally(() => {
      window.close();
    });
  });
  wireSearch(token, baseUrl);
  try {
    chrome.runtime.sendMessage({ type: "wake" });
  } catch {}
  await new Promise((r) => setTimeout(r, 600));
  const status = await probeStatus(token, baseUrl);
  setStatusUI(status);
}
document.addEventListener("DOMContentLoaded", () => void init());
