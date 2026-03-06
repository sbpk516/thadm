"use server";

import { pipe } from "@screenpipe/js";
import type { Settings as ScreenpipeAppSettings } from "@screenpipe/js";
import { promises as fs } from "fs";
import path from "path";

function getPipeSettingsPath() {
  const screenpipeDir =
    process.env.THADM_DIR || process.env.SCREENPIPE_DIR || process.cwd();
  return path.join(screenpipeDir, "pipes", "notion", "settings.json");
}

async function readStoreBin(): Promise<Record<string, any> | null> {
  const storePath = process.env.THADM_STORE_PATH;
  if (!storePath) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await fs.readFile(storePath, "utf8");
      return JSON.parse(raw);
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 100));
    }
  }
  return null;
}

function mapNotionSettings(
  store: Record<string, any>,
): Partial<ScreenpipeAppSettings> {
  const s = store.settings ?? store;
  const conn = s.notionConnection;

  const mapped: Partial<ScreenpipeAppSettings> = { ...s };

  if (conn) {
    mapped.customSettings = {
      ...s.customSettings,
      notion: {
        ...(s.customSettings?.notion || {}),
        notion: {
          ...(s.customSettings?.notion?.notion || {}),
          accessToken: conn.accessToken,
          databaseId: conn.databaseId,
          intelligenceDbId: conn.intelligenceDbId,
        },
        aiLogPresetId: conn.aiPresetId,
        aiPresetId: conn.aiPresetId,
      },
    };
  }

  return mapped;
}

export async function getScreenpipeAppSettings() {
  // Try reading store.bin directly (bypasses SDK's hardcoded path)
  const store = await readStoreBin();
  if (store) {
    let settings = mapNotionSettings(store);

    // Overlay pipe-local settings.json on top
    try {
      const settingsPath = getPipeSettingsPath();
      const content = await fs.readFile(settingsPath, "utf8");
      const persisted = JSON.parse(content);
      settings = {
        ...settings,
        customSettings: {
          ...settings.customSettings,
          notion: {
            ...(settings.customSettings?.notion || {}),
            ...persisted,
          },
        },
      };
    } catch {
      // No settings.json — that's fine
    }

    return settings;
  }

  // Fallback: use SDK (may read stale screenpipe/ path)
  const rawSettings = await pipe.settings.getAll();

  try {
    const settingsPath = getPipeSettingsPath();
    const content = await fs.readFile(settingsPath, "utf8");
    const persisted = JSON.parse(content);
    return {
      ...rawSettings,
      customSettings: {
        ...rawSettings.customSettings,
        notion: {
          ...(rawSettings.customSettings?.notion || {}),
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
  // Only persist the notion namespace to settings.json.
  // Never call pipe.settings.update() — it corrupts store.bin.
  const notionSettings = newSettings.customSettings?.notion;
  if (notionSettings) {
    const settingsPath = getPipeSettingsPath();
    let current: Record<string, any> = {};
    try {
      const raw = await fs.readFile(settingsPath, "utf8");
      current = JSON.parse(raw);
    } catch {
      // No existing file
    }
    const merged = { ...current, ...notionSettings };
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2));
  }
}
