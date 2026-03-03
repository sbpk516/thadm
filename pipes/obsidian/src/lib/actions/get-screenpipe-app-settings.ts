"use server";

import { pipe } from "@screenpipe/js";
import type { Settings as ScreenpipeAppSettings } from "@screenpipe/js";
import { promises as fs } from "fs";
import path from "path";

function getPipeSettingsPath() {
  const screenpipeDir =
    process.env.THADM_DIR || process.env.SCREENPIPE_DIR || process.cwd();
  return path.join(screenpipeDir, "pipes", "obsidian", "settings.json");
}

export async function getScreenpipeAppSettings() {
  const rawSettings = await pipe.settings.getAll();

  // Overlay pipe-local settings.json on top of SDK settings.
  // The PUT handler writes here instead of SDK's store.bin to avoid
  // flattenObject() corruption of the Tauri plugin-store format.
  try {
    const settingsPath = getPipeSettingsPath();
    const content = await fs.readFile(settingsPath, "utf8");
    const persisted = JSON.parse(content);
    return {
      ...rawSettings,
      customSettings: {
        ...rawSettings.customSettings,
        obsidian: {
          ...(rawSettings.customSettings?.obsidian || {}),
          ...persisted,
        },
      },
    };
  } catch {
    return rawSettings;
  }
}

export async function updateScreenpipeAppSettings(
  newSettings: Partial<ScreenpipeAppSettings>
) {
  // Only persist the obsidian namespace to settings.json.
  // Never call pipe.settings.update() — it corrupts store.bin.
  const obsidianSettings = newSettings.customSettings?.obsidian;
  if (obsidianSettings) {
    const settingsPath = getPipeSettingsPath();
    let current: Record<string, any> = {};
    try {
      const raw = await fs.readFile(settingsPath, "utf8");
      current = JSON.parse(raw);
    } catch {
      // No existing file
    }
    const merged = { ...current, ...obsidianSettings };
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2));
  }
}
