"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export interface PipeStatus {
  isInstalled: boolean;
  isEnabled: boolean;
  isBuilding: boolean;
  port: number | null;
  buildProgress: string | null;
  error: string | null;
}

const INITIAL_STATUS: PipeStatus = {
  isInstalled: false,
  isEnabled: false,
  isBuilding: false,
  port: null,
  buildProgress: null,
  error: null,
};

// The recorder sidecar always runs on port 3030 — matches all other pipe code in the codebase
const BASE_URL = "http://localhost:3030";

export function usePipeManager(pipeId: string) {
  const [status, setStatus] = useState<PipeStatus>(INITIAL_STATUS);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef<PipeStatus>(INITIAL_STATUS);

  // Keep statusRef in sync with status state
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Reset status when pipeId changes
  useEffect(() => {
    setStatus(INITIAL_STATUS);
    statusRef.current = INITIAL_STATUS;
  }, [pipeId]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const refresh = useCallback(async (): Promise<PipeStatus> => {
    try {
      const response = await fetch(`${BASE_URL}/pipes/list`);
      if (!response.ok) throw new Error("Failed to list pipes");

      const data = await response.json();
      const pipe = Array.isArray(data.data)
        ? data.data.find(
            (p: any) => p.config?.id === pipeId || p.id === pipeId
          )
        : undefined;

      if (!pipe) {
        const newStatus = { ...INITIAL_STATUS };
        if (mountedRef.current) setStatus(newStatus);
        return newStatus;
      }

      const buildStatus =
        pipe.config?.buildStatus || pipe.installed_config?.buildStatus;
      const isBuilding =
        buildStatus === "in_progress" ||
        (typeof buildStatus === "object" &&
          buildStatus.status === "in_progress");

      let buildProgress: string | null = null;
      if (typeof buildStatus === "object") {
        if (buildStatus.status === "error") {
          const errStatus: PipeStatus = {
            isInstalled: true,
            isEnabled: pipe.config?.enabled ?? false,
            isBuilding: false,
            port: pipe.config?.port ?? null,
            buildProgress: null,
            error: buildStatus.error || "Build failed",
          };
          if (mountedRef.current) setStatus(errStatus);
          return errStatus;
        }
        buildProgress = getBuildStepMessage(buildStatus);
      }

      const newStatus: PipeStatus = {
        isInstalled: true,
        isEnabled: pipe.config?.enabled ?? false,
        isBuilding,
        port: pipe.config?.port ?? null,
        buildProgress: isBuilding ? buildProgress : null,
        error: null,
      };

      if (mountedRef.current) setStatus(newStatus);
      return newStatus;
    } catch {
      // Return current status from ref — avoids stale closure on `status`
      return statusRef.current;
    }
  }, [pipeId]);

  const install = useCallback(
    async (sourceUrl: string) => {
      const response = await fetch(`${BASE_URL}/pipes/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl }),
      });

      if (!response.ok) {
        const err = await response.text().catch(() => "Unknown error");
        throw new Error(`Failed to install pipe: ${err}`);
      }

      await refresh();
    },
    [refresh]
  );

  const enable = useCallback(async () => {
    const response = await fetch(`${BASE_URL}/pipes/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipe_id: pipeId }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "Unknown error");
      throw new Error(`Failed to enable pipe: ${err}`);
    }

    // Start polling build status
    if (mountedRef.current) {
      setStatus((s) => ({
        ...s,
        isBuilding: true,
        buildProgress: "Starting build...",
        error: null,
      }));
    }

    // Clear any existing poll interval before starting a new one
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return new Promise<void>((resolve, reject) => {
      let elapsed = 0;
      let settled = false;
      const POLL_INTERVAL = 3000;
      const TIMEOUT = 90000;

      const cleanup = () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };

      pollRef.current = setInterval(async () => {
        if (settled) return;

        // Check if unmounted
        if (!mountedRef.current) {
          cleanup();
          settled = true;
          reject(new Error("Component unmounted during build"));
          return;
        }

        elapsed += POLL_INTERVAL;

        if (elapsed > TIMEOUT) {
          cleanup();
          settled = true;
          // Auto-disable on timeout
          try {
            await fetch(`${BASE_URL}/pipes/disable`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pipe_id: pipeId }),
            });
          } catch {}
          const err = "Build timed out after 90 seconds";
          if (mountedRef.current) {
            setStatus((s) => ({ ...s, isBuilding: false, error: err }));
          }
          reject(new Error(err));
          return;
        }

        try {
          const refreshed = await refresh();

          if (settled) return;

          if (refreshed.error) {
            cleanup();
            settled = true;
            reject(new Error(refreshed.error));
            return;
          }

          if (!refreshed.isBuilding && refreshed.isEnabled) {
            cleanup();
            settled = true;
            resolve();
            return;
          }
        } catch {
          // Keep polling on network errors
        }
      }, POLL_INTERVAL);
    });
  }, [pipeId, refresh]);

  const disable = useCallback(async () => {
    const response = await fetch(`${BASE_URL}/pipes/disable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipe_id: pipeId }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "Unknown error");
      throw new Error(`Failed to disable pipe: ${err}`);
    }

    await refresh();
  }, [pipeId, refresh]);

  const saveSettings = useCallback(
    async (
      namespace: string,
      value: Record<string, any>,
      pipePort?: number
    ) => {
      const targetPort = pipePort ?? statusRef.current.port;
      if (!targetPort) {
        throw new Error("Pipe port not available — is the pipe running?");
      }

      const response = await fetch(
        `http://localhost:${targetPort}/api/settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            namespace,
            isPartialUpdate: true,
            value,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.text().catch(() => "Unknown error");
        throw new Error(`Failed to save settings: ${err}`);
      }
    },
    []
  );

  /**
   * Waits for the pipe's HTTP server to respond on its dynamic port.
   * Double-probes with a 500ms gap to confirm a stable server (not a dying previous run).
   * Returns the port on success, null if cancelled, throws on 30s timeout.
   */
  const waitForReady = useCallback(
    async (isCancelled?: () => boolean): Promise<number | null> => {
      const READY_TIMEOUT = 30000;
      const READY_INTERVAL = 2000;
      const readyStart = Date.now();

      let attempt = 0;
      while (Date.now() - readyStart < READY_TIMEOUT) {
        if (isCancelled?.()) return null;
        attempt++;

        const latest = await refresh();
        const port = latest.port;
        if (port) {
          // Use regular fetch (not tauriFetch) — the /api/settings route
          // sets CORS headers, and tauriFetch is blocked by the HTTP plugin
          // scope which doesn't match multi-segment paths like /api/settings.
          const probeCtrl = new AbortController();
          const probeTimer = setTimeout(() => probeCtrl.abort(), 5000);
          try {
            const resp1 = await fetch(`http://localhost:${port}/api/settings`, {
              method: "GET",
              signal: probeCtrl.signal,
            });
            clearTimeout(probeTimer);

            // Re-probe after short delay to confirm stable server
            await new Promise((r) => setTimeout(r, 500));
            if (isCancelled?.()) return null;

            const confirmCtrl = new AbortController();
            const confirmTimer = setTimeout(() => confirmCtrl.abort(), 5000);
            try {
              const resp2 = await fetch(`http://localhost:${port}/api/settings`, {
                method: "GET",
                signal: confirmCtrl.signal,
              });
              clearTimeout(confirmTimer);
              return port;
            } catch {
              clearTimeout(confirmTimer);
              // Server died between probes — it was the old run. Keep polling.
            }
          } catch {
            clearTimeout(probeTimer);
            // Connection refused, timeout, or abort — server not up yet
          }
        }

        await new Promise((r) => setTimeout(r, READY_INTERVAL));
      }

      if (isCancelled?.()) return null;

      throw new Error(
        "Pipe server did not start within 30 seconds. Try disconnecting and reconnecting."
      );
    },
    [refresh]
  );

  return { status, install, enable, disable, refresh, saveSettings, waitForReady };
}

function getBuildStepMessage(buildStatus: {
  status: string;
  step?: string;
}): string {
  switch (buildStatus.step) {
    case "downloading":
      return "Downloading files...";
    case "extracting":
      return "Extracting files...";
    case "installing":
      return "Installing dependencies...";
    case "building":
      return "Building application...";
    case "completed":
      return "Completed";
    default:
      return buildStatus.step || "Processing...";
  }
}
