#!/usr/bin/env node

const { execFileSync, execSync } = require("child_process");
const { join, dirname } = require("path");
const { existsSync, chmodSync } = require("fs");

// THADM v0.3.327: only macOS Apple Silicon is published.
// macOS Intel, Linux, and Windows are blocked on an upstream `mlx-sys`
// cross-platform build issue. Until that is resolved, users on those
// platforms should install the desktop app from
// https://github.com/sbpk516/thadm/releases instead.
const PLATFORMS = {
  "darwin-arm64": "thadm-darwin-arm64",
};

const key = `${process.platform}-${process.arch}`;
const pkg = PLATFORMS[key];

if (!pkg) {
  console.error(`thadm: this npm package currently ships only for macOS Apple Silicon (darwin-arm64).`);
  console.error(`you are on ${key}.`);
  console.error(`install the desktop app instead: https://github.com/sbpk516/thadm/releases`);
  process.exit(1);
}

let binPath;
try {
  const pkgPath = require.resolve(`${pkg}/package.json`);
  const ext = process.platform === "win32" ? ".exe" : "";
  binPath = join(dirname(pkgPath), "bin", `thadm-recorder${ext}`);
} catch {
  console.error(`thadm: platform package ${pkg} not installed`);
  console.error(`run: npm install thadm-recorder   (or: bun install thadm-recorder)`);
  process.exit(1);
}

if (!existsSync(binPath)) {
  console.error(`thadm: binary not found at ${binPath}`);
  console.error(`the platform package may be corrupted. try reinstalling.`);
  process.exit(1);
}

// macOS: remove quarantine attribute (Gatekeeper) and ensure executable
if (process.platform === "darwin") {
  try {
    execSync(`xattr -d com.apple.quarantine "${binPath}" 2>/dev/null || true`);
  } catch {}
  try {
    chmodSync(binPath, 0o755);
  } catch {}
}

// Linux: ensure executable
if (process.platform === "linux") {
  try {
    chmodSync(binPath, 0o755);
  } catch {}
}

try {
  execFileSync(binPath, process.argv.slice(2), { stdio: "inherit" });
} catch (e) {
  if (e.status !== undefined) {
    process.exit(e.status);
  }

  // Helpful error messages for common failures
  const msg = (e.message || "").toLowerCase();
  if (process.platform === "darwin" && msg.includes("eperm")) {
    console.error(`\nthadm: macOS blocked the binary.`);
    console.error(`go to System Settings > Privacy & Security and allow thadm.`);
    console.error(`or run: xattr -d com.apple.quarantine "${binPath}"`);
  } else if (process.platform === "linux" && msg.includes("enoent")) {
    console.error(`\nthadm: missing system libraries.`);
    console.error(`try: sudo apt install libasound2-dev ffmpeg  (ubuntu/debian)`);
    console.error(`     sudo dnf install alsa-lib ffmpeg         (fedora)`);
  } else if (process.platform === "win32" && msg.includes("onnxruntime")) {
    console.error(`\nthadm: missing onnxruntime.dll`);
    console.error(`check that it's alongside thadm-recorder.exe in the package.`);
  }

  process.exit(e.status || 1);
}
