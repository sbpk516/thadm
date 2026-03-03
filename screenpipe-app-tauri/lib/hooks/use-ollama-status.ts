"use client";

import { useState, useEffect } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/**
 * Polls Ollama at localhost:11434 every 5s when `enabled` is true.
 * Returns `null` (checking), `true` (running), or `false` (not detected).
 * Resets to `null` when `enabled` flips to false.
 */
export function useOllamaStatus(enabled: boolean): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) {
      setAvailable(null);
      return;
    }

    let cancelled = false;
    const check = async () => {
      try {
        const resp = await tauriFetch("http://localhost:11434/api/tags", {
          method: "GET",
          connectTimeout: 3000,
        });
        if (!cancelled) setAvailable(resp.ok);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    };

    check();
    const interval = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled]);

  return available;
}
