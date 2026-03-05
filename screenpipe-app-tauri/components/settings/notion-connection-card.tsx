"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Check,
  X,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { ask } from "@tauri-apps/plugin-dialog";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { usePipeManager } from "@/lib/hooks/use-pipe-manager";
import { useOllamaStatus } from "@/lib/hooks/use-ollama-status";
import { useSettings } from "@/lib/hooks/use-settings";
import { AIProvider, PROVIDER_CONFIG, cleanupConnectionPreset } from "@/lib/utils/ai-providers";

const PIPE_ID = "notion";
const PIPE_SOURCE =
  "https://github.com/sbpk516/thadm/tree/main/pipes/notion";

type ConnectionState =
  | "idle"
  | "setup"
  | "validating"
  | "creating-databases"
  | "installing"
  | "building"
  | "configuring"
  | "connected"
  | "error"
  | "disconnecting";

interface StoredNotionSettings {
  accessToken?: string;
  databaseId?: string;
  intelligenceDbId?: string;
  aiPresetId?: string;
}

type NotionFailedStep = "creating-databases" | "installing" | "building" | "configuring" | "disconnecting" | null;

interface NotionPage {
  id: string;
  title: string;
}

async function createNotionDatabases(
  accessToken: string,
  parentPageId: string,
  existingDatabaseId?: string
): Promise<{ databaseId: string; intelligenceDbId: string }> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  const handleError = (resp: Response, context: string): never => {
    if (resp.status === 401) {
      throw new Error(
        "Your Notion token has expired or is invalid. Please reconnect."
      );
    }
    if (resp.status === 403) {
      throw new Error(
        "Your integration needs 'Insert content' permission. " +
          "Update it at notion.so/profile/integrations."
      );
    }
    if (resp.status === 404) {
      throw new Error(
        "The parent page was not found. Make sure it's still shared with your integration."
      );
    }
    throw new Error(`${context} (HTTP ${resp.status})`);
  };

  let databaseId = existingDatabaseId;

  // Step A: Create Activity Logs database (skip if already exists from partial failure)
  if (!databaseId) {
    const logsResp = await tauriFetch("https://api.notion.com/v1/databases", {
      method: "POST",
      headers,
      body: JSON.stringify({
        parent: { type: "page_id", page_id: parentPageId },
        title: [{ type: "text", text: { content: "Activity Logs" } }],
        properties: {
          Name: { title: {} },
          Description: { rich_text: {} },
          Tags: { multi_select: {} },
          Date: { date: {} },
          StartTime: { date: {} },
          EndTime: { date: {} },
          Summary: { rich_text: {} },
        },
      }),
      connectTimeout: 30000,
    });

    if (!logsResp.ok) {
      handleError(logsResp, "Failed to create Activity Logs database");
    }
    const logsDb = await logsResp.json();
    databaseId = logsDb.id;
  }

  // Step B: Create Intelligence database under same parent
  try {
    const intResp = await tauriFetch("https://api.notion.com/v1/databases", {
      method: "POST",
      headers,
      body: JSON.stringify({
        parent: { type: "page_id", page_id: parentPageId },
        title: [
          { type: "text", text: { content: "Relationship Intelligence" } },
        ],
        properties: {
          Name: { title: {} },
          Date: { date: {} },
          Summary: { rich_text: {} },
        },
      }),
      connectTimeout: 30000,
    });

    if (!intResp.ok) {
      handleError(intResp, "Failed to create Intelligence database");
    }
    const intDb = await intResp.json();

    return { databaseId: databaseId!, intelligenceDbId: intDb.id };
  } catch (err) {
    // Attach partial result so caller can persist it and avoid duplicate Activity Logs on retry
    if (err instanceof Error && databaseId) {
      (err as any).partialDatabaseId = databaseId;
    }
    throw err;
  }
}

export function NotionConnectionCard() {
  const { status, install, enable, disable, refresh, saveSettings, waitForReady } =
    usePipeManager(PIPE_ID);
  const { settings, updateSettings, isSettingsLoaded } = useSettings();

  const [state, setState] = useState<ConnectionState>("idle");
  const [token, setToken] = useState("");
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [buildProgress, setBuildProgress] = useState("");
  const [failedStep, setFailedStep] = useState<NotionFailedStep>(null);
  const [notionPages, setNotionPages] = useState<NotionPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [loadingPages, setLoadingPages] = useState(false);
  const [pageSearch, setPageSearch] = useState("");
  const searchAbortRef = useRef<AbortController | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null);
  const [providerApiKey, setProviderApiKey] = useState("");
  const ollamaAvailable = useOllamaStatus(
    selectedProvider === "ollama" && (state === "setup" || state === "error")
  );
  const hasInitialized = useRef(false);
  const connectingRef = useRef(false);
  const mountedRef = useRef(true);
  const disabledCountRef = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      searchAbortRef.current?.abort();
    };
  }, []);

  // Wait for settings to load, then refresh pipe status and derive initial state
  useEffect(() => {
    if (!isSettingsLoaded || hasInitialized.current) return;
    hasInitialized.current = true;

    let cancelled = false;
    refresh().then((refreshed) => {
      if (cancelled) return;
      const stored = settings.notionConnection;
      if (stored?.accessToken && refreshed.isEnabled && !refreshed.isBuilding) {
        setState("connected");
        setToken(stored.accessToken);
      } else if (refreshed.isBuilding) {
        setState("building");
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isSettingsLoaded, settings]);

  // Sync build progress from pipe manager
  useEffect(() => {
    if (status.buildProgress) {
      setBuildProgress(status.buildProgress);
    }
    if (status.error && (state === "building" || state === "installing")) {
      setState("error");
      setErrorMessage(status.error);
    }
  }, [status.buildProgress, status.error, state]);

  const searchNotionPages = useCallback(async (accessToken: string, query?: string) => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = new AbortController();
    setLoadingPages(true);
    try {
      const searchResp = await tauriFetch(
        "https://api.notion.com/v1/search",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filter: { property: "object", value: "page" },
            page_size: 100,
            ...(query && { query }),
          }),
          connectTimeout: 15000,
          signal: searchAbortRef.current.signal,
        }
      );

      if (!mountedRef.current) return;
      if (searchResp.ok) {
        const searchData = await searchResp.json();
        const pages: NotionPage[] = (searchData.results || []).map(
          (p: any) => ({
            id: p.id,
            title:
              p.properties?.title?.title?.[0]?.plain_text ||
              p.properties?.Name?.title?.[0]?.plain_text ||
              (Object.values(p.properties || {}).find(
                (prop: any) => prop.type === "title"
              ) as any)?.title?.[0]?.plain_text ||
              "Untitled",
          })
        );
        setNotionPages(pages);
        if (pages.length === 1) {
          setSelectedPageId(pages[0].id);
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      // Non-fatal — user can still retry
    } finally {
      if (mountedRef.current) setLoadingPages(false);
    }
  }, []);

  // Debounced page search — re-fetches from Notion when user types
  useEffect(() => {
    if (!tokenValid || !token.trim()) return;
    const timer = setTimeout(() => {
      searchNotionPages(token.trim(), pageSearch.trim() || undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [pageSearch, tokenValid, token, searchNotionPages]);

  const validateToken = useCallback(async (accessToken: string) => {
    setState("validating");
    setTokenValid(null);
    setErrorMessage("");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await tauriFetch("https://api.notion.com/v1/users/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!mountedRef.current) return;

      if (response.ok) {
        setLoadingPages(true);
        setTokenValid(true);
        setState("setup");
      } else {
        setTokenValid(false);
        setState("error");
        setErrorMessage(
          "Invalid token. Check that you copied the full token from notion.so/profile/integrations"
        );
      }
    } catch {
      if (!mountedRef.current) return;
      setTokenValid(false);
      setState("error");
      setErrorMessage("Could not reach Notion API. Check your internet connection.");
    }
  }, []);

  const handleConnect = useCallback(async () => {
    if (!token.trim()) return;
    await validateToken(token.trim());
  }, [token, validateToken]);

  const handleSetupAndConnect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setFailedStep(null);

    let currentStep: NonNullable<NotionFailedStep> = "creating-databases";
    let finalPresetId: string | undefined;
    let databaseId: string | undefined;
    let intelligenceDbId: string | undefined;

    try {
      // Step 1: Create databases in Notion (or reuse existing ones)
      const currentSettings = settingsRef.current;
      const stored = currentSettings.notionConnection;

      // Check if we have stored DB IDs from a previous connect
      if (stored?.databaseId) {
        try {
          const checkResp = await tauriFetch(
            `https://api.notion.com/v1/databases/${stored.databaseId}`,
            {
              headers: {
                Authorization: `Bearer ${token.trim()}`,
                "Notion-Version": "2022-06-28",
              },
            }
          );
          if (checkResp.ok) {
            databaseId = stored.databaseId;
            intelligenceDbId = stored.intelligenceDbId;
          }
        } catch {
          // Network error verifying — proceed to create new DBs
        }
      }

      if (!mountedRef.current) return;

      // Create databases if needed (handles partial failure too)
      if (databaseId && !intelligenceDbId) {
        currentStep = "creating-databases";
        setState("creating-databases");
        console.log("[NOTION_DEBUG] Step 1: Creating Intelligence DB (partial recovery)...");
        const dbs = await createNotionDatabases(
          token.trim(),
          selectedPageId,
          databaseId
        );
        intelligenceDbId = dbs.intelligenceDbId;
      } else if (!databaseId) {
        if (!selectedPageId) {
          throw new Error("Please select a Notion page to create databases in.");
        }
        currentStep = "creating-databases";
        setState("creating-databases");
        console.log("[NOTION_DEBUG] Step 1: Creating both databases...");
        const dbs = await createNotionDatabases(token.trim(), selectedPageId);
        databaseId = dbs.databaseId;
        intelligenceDbId = dbs.intelligenceDbId;
      } else {
        console.log("[NOTION_DEBUG] Step 1: Skipped (databases already exist)");
      }

      // Early persist: save DB IDs immediately so they survive if later steps throw
      if (databaseId && intelligenceDbId && (!stored?.databaseId || !stored?.intelligenceDbId)) {
        try {
          await updateSettings({
            notionConnection: {
              accessToken: token.trim(),
              databaseId,
              intelligenceDbId,
              aiPresetId: stored?.aiPresetId,
            },
          });
          console.log("[NOTION_DEBUG] Step 1: Early persist of DB IDs");
        } catch {
          // Best effort — main persist at step 1.5 will retry
        }
      }

      // Step 1.5: Create AI preset for Notion summaries
      if (!selectedProvider) {
        throw new Error("Please select an AI provider.");
      }
      const config = PROVIDER_CONFIG[selectedProvider];
      const existingPresets = (currentSettings.aiPresets as any[]) || [];

      // Build the preset and persist it + notionConnection eagerly in one call
      // so a crash between here and step 6 doesn't orphan the preset
      const presetData = {
        id: "",
        provider: config.provider,
        url: config.url,
        model: config.model,
        apiKey: config.needsApiKey ? providerApiKey.trim() : "",
        maxContextChars: config.maxContextChars,
        defaultPreset: false,
        prompt: "",
      };

      let updatedPresets: any[];
      if (stored?.aiPresetId && existingPresets.some((p: any) => p.id === stored.aiPresetId)) {
        // Update existing preset in-place (reconnect scenario)
        finalPresetId = stored.aiPresetId;
        updatedPresets = existingPresets.map((p: any) =>
          p.id === finalPresetId ? { ...presetData, id: finalPresetId } : p
        );
      } else {
        finalPresetId = `notion-${selectedProvider}-${Date.now()}`;
        updatedPresets = [...existingPresets, { ...presetData, id: finalPresetId }];
      }

      await updateSettings({
        aiPresets: updatedPresets,
        notionConnection: {
          accessToken: token.trim(),
          databaseId,
          intelligenceDbId,
          aiPresetId: finalPresetId,
        },
      });
      console.log("[NOTION_DEBUG] Step 1.5: AI preset + notionConnection saved, id:", finalPresetId);

      if (!mountedRef.current) return;

      // Step 2: Install pipe if not installed
      console.log("[NOTION_DEBUG] Starting flow. status.isInstalled:", status.isInstalled);
      if (!status.isInstalled) {
        currentStep = "installing";
        setState("installing");
        setErrorMessage("");
        console.log("[NOTION_DEBUG] Step 2: Installing pipe...");
        await install(PIPE_SOURCE);
        console.log("[NOTION_DEBUG] Step 2: Install complete");
      } else {
        console.log("[NOTION_DEBUG] Step 2: Skipped (already installed)");
      }

      if (!mountedRef.current) return;

      // Step 3: Enable pipe (starts build, resolves when build completes)
      currentStep = "building";
      setState("building");
      setBuildProgress("Starting build...");
      console.log("[NOTION_DEBUG] Step 3: Enabling pipe...");
      await enable();
      console.log("[NOTION_DEBUG] Step 3: Enable complete");

      if (!mountedRef.current) return;

      // Step 4: Get the port and wait for the pipe's HTTP server to be ready.
      // enable() can resolve prematurely due to stale buildStatus from a previous run
      // (double-start race: download auto-enables run #1, enable() kills it and spawns
      // run #2, but sees stale "success" from run #1). The port may also change if
      // the pipe restarts on a different port.
      currentStep = "configuring";
      setState("configuring");

      console.log("[NOTION_DEBUG] Step 4: Waiting for pipe HTTP server...");
      const pipePort = await waitForReady(() => !mountedRef.current);
      if (!mountedRef.current || pipePort === null) return;
      console.log("[NOTION_DEBUG] Step 4: Server ready on port", pipePort);

      // Step 5: Save token + database IDs to pipe settings
      console.log("[NOTION_DEBUG] Step 5: Saving settings to pipe...");
      const pipeSettings = {
        notion: {
          accessToken: token.trim(),
          databaseId,
          intelligenceDbId,
        },
        aiLogPresetId: finalPresetId,
        aiPresetId: finalPresetId,
      };
      await saveSettings("notion", pipeSettings, pipePort);
      console.log("[NOTION_DEBUG] Step 5: Settings saved");

      console.log("[NOTION_DEBUG] Flow complete — connected!");
      if (mountedRef.current) setState("connected");
    } catch (error) {
      // Persist partial progress so retry doesn't create duplicates
      const partialDbId =
        error instanceof Error ? (error as any).partialDatabaseId : undefined;
      if (partialDbId || finalPresetId || databaseId) {
        try {
          await updateSettings({
            notionConnection: {
              accessToken: token.trim(),
              databaseId: partialDbId || databaseId,
              intelligenceDbId,
              aiPresetId: finalPresetId,
            },
          });
        } catch {
          // Best effort — if this also fails, user may get duplicates on retry
        }
      }

      console.error("[NOTION_DEBUG] FAILED at step:", currentStep, "error:", error);
      if (mountedRef.current) {
        setFailedStep(currentStep);
        setState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Connection failed"
        );
      }
    } finally {
      connectingRef.current = false;
    }
  }, [
    selectedPageId,
    selectedProvider,
    providerApiKey,
    status.isInstalled,
    install,
    enable,
    waitForReady,
    saveSettings,
    updateSettings,
    token,
  ]);

  const performDisconnect = useCallback(async () => {
    try {
      setState("disconnecting");
      await disable();

      await cleanupConnectionPreset(settingsRef.current, "notionConnection", updateSettings);

      if (mountedRef.current) {
        resetFormState();
        setState("idle");
      }
    } catch (error) {
      if (mountedRef.current) {
        setFailedStep("disconnecting");
        setState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to disconnect"
        );
      }
    }
  }, [disable, updateSettings]);

  const handleDisconnect = useCallback(async () => {
    const confirmed = await ask(
      "Disconnect from Notion? Syncing will stop. Your Notion databases won't be deleted.",
      { title: "Disconnect Notion", kind: "warning" }
    );

    if (!confirmed || !mountedRef.current) return;
    await performDisconnect();
  }, [performDisconnect]);

  const resetFormState = () => {
    setToken("");
    setTokenValid(null);
    setSelectedProvider(null);
    setProviderApiKey("");
    setPageSearch("");
    setNotionPages([]);
    setSelectedPageId("");
  };

  const handleRetry = useCallback(() => {
    setErrorMessage("");
    if (failedStep === "disconnecting") {
      setFailedStep(null);
      performDisconnect();
    } else if (failedStep && tokenValid === true) {
      setFailedStep(null);
      handleSetupAndConnect();
    } else {
      setTokenValid(null);
      setFailedStep(null);
      setState("setup");
    }
  }, [failedStep, tokenValid, handleSetupAndConnect, performDisconnect]);

  // Health check: detect if pipe stops while we show "connected"
  // Requires 2 consecutive disabled polls (~60s) to avoid false logout during pipe restart
  useEffect(() => {
    if (state !== "connected") return;
    let cancelled = false;
    disabledCountRef.current = 0;

    const interval = setInterval(async () => {
      const refreshed = await refresh();
      if (cancelled) return;
      if (!refreshed.isEnabled && !refreshed.isBuilding) {
        disabledCountRef.current += 1;
        if (disabledCountRef.current >= 2) {
          resetFormState();
          setState("idle");
        }
      } else {
        disabledCountRef.current = 0;
      }
    }, 30000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [state, refresh]);

  const isProcessing =
    state === "validating" ||
    state === "creating-databases" ||
    state === "installing" ||
    state === "building" ||
    state === "configuring" ||
    state === "disconnecting";

  const canConnect = Boolean(
    selectedPageId &&
    selectedProvider &&
    !isProcessing &&
    (!PROVIDER_CONFIG[selectedProvider]?.needsApiKey || providerApiKey.trim()) &&
    (selectedProvider !== "ollama" || ollamaAvailable === true)
  );

  return (
    <Card className="border-border bg-card shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start p-6 gap-6">
          {/* Notion Logo */}
          <div className="flex-shrink-0">
            <svg
              width="64"
              height="64"
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
              className="rounded-2xl"
              aria-hidden="true"
            >
              <rect width="100" height="100" rx="20" fill="white" />
              <path
                d="M25.5 14.5L62 17L64 20.5L39 22L39 82L35 84.5L22 76L21 21L25.5 14.5Z"
                fill="black"
              />
              <path
                d="M68 17L32 14L27 18.5L24.5 19.5L24 74L34 82L38 79.5V23L65 21L66 72L37 79.5L34 82L68 86L78 78V22L68 17Z"
                fill="black"
              />
              <path
                d="M27 18.5L32 14L68 17L78 22V78L68 86L34 82L24 74L24.5 19.5L27 18.5Z"
                fill="white"
                fillOpacity="0"
              />
              <path
                d="M41 35H62V38H41V35ZM41 44H62V47H41V44ZM41 53H62V56H41V53ZM41 62H55V65H41V62Z"
                fill="black"
                fillOpacity="0.5"
              />
            </svg>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-semibold text-foreground">Notion</h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
                by Notion Labs
              </span>
              {state === "connected" && (
                <Badge aria-label="Connected" className="bg-green-500/15 text-green-600 border-green-500/20 hover:bg-green-500/15">
                  Connected
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mb-4">
              Sync screen activity and AI insights to Notion databases
              automatically.
            </p>

            <div className="flex flex-wrap gap-3">
              {state === "idle" && (
                <Button
                  onClick={() => setState("setup")}
                  className="gap-2"
                >
                  Connect
                </Button>
              )}

              {state === "connected" && (
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  className="gap-2"
                >
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Setup form */}
        {(state === "setup" ||
          state === "validating" ||
          state === "error") && (
          <div className="px-6 pb-6 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="notion-token">Notion API Token</Label>
                <button
                  onClick={() =>
                    open("https://www.notion.so/profile/integrations")
                  }
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                >
                  How to get your token
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="notion-token"
                    type="password"
                    placeholder="ntn_..."
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      setTokenValid(null);
                      setErrorMessage("");
                      setNotionPages([]);
                      setSelectedPageId("");
                      setSelectedProvider(null);
                      setProviderApiKey("");
                    }}
                    disabled={isProcessing}
                    className={
                      tokenValid === true
                        ? "border-green-500 pr-8"
                        : tokenValid === false
                        ? "border-red-500 pr-8"
                        : ""
                    }
                  />
                  {tokenValid === true && (
                    <Check className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                  {tokenValid === false && (
                    <X className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                  )}
                </div>
                {state === "validating" ? (
                  <Button disabled className="gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validating
                  </Button>
                ) : tokenValid !== true ? (
                  <Button
                    onClick={handleConnect}
                    disabled={!token.trim()}
                    className="gap-2"
                  >
                    Validate
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Page picker + provider selector — shown after token validates */}
            {tokenValid === true && (
              <div className="space-y-4">
                {/* Page picker */}
                <div className="space-y-2">
                  <Label htmlFor="notion-page-select">Create databases in</Label>
                  {loadingPages ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading your Notion pages...
                    </div>
                  ) : notionPages.length === 0 ? (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <p className="text-sm text-destructive">
                        Your integration doesn&apos;t have access to any pages.
                        Open a page in Notion, click &apos;...&apos; &rarr;
                        &apos;Connections&apos; &rarr; add your integration, then
                        retry.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        placeholder="Search pages..."
                        value={pageSearch}
                        onChange={(e) => setPageSearch(e.target.value)}
                        disabled={isProcessing}
                      />
                      <div className="relative">
                        <select
                          id="notion-page-select"
                          value={selectedPageId}
                          onChange={(e) => setSelectedPageId(e.target.value)}
                          disabled={isProcessing}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 appearance-none pr-8"
                        >
                          <option value="">Select a page...</option>
                          {notionPages.map((page) => (
                            <option key={page.id} value={page.id}>
                              {page.title}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Provider selector — shown after page selected */}
                {selectedPageId && (
                  <div className="space-y-2">
                    <Label>AI provider for summaries</Label>
                    <div className="grid grid-cols-3 gap-2" role="group" aria-label="AI provider for summaries">
                      {(Object.entries(PROVIDER_CONFIG) as [AIProvider, typeof PROVIDER_CONFIG[AIProvider]][]).map(
                        ([key, config]) => (
                          <button
                            key={key}
                            aria-label={config.badge ? `${config.label}, ${config.badge}. ${config.description}` : undefined}
                            onClick={() => {
                              if (key !== selectedProvider) {
                                setSelectedProvider(key);
                                setProviderApiKey("");
                              }
                            }}
                            disabled={isProcessing}
                            className={`p-3 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed ${
                              selectedProvider === key
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium">{config.label}</span>
                              {config.badge && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/15 text-yellow-600">
                                  {config.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
                          </button>
                        )
                      )}
                    </div>

                    {/* API key input for OpenAI/Groq */}
                    {selectedProvider && PROVIDER_CONFIG[selectedProvider].needsApiKey && (
                      <Input
                        type="password"
                        placeholder={selectedProvider === "groq" ? "gsk_..." : "sk-..."}
                        value={providerApiKey}
                        onChange={(e) => setProviderApiKey(e.target.value)}
                        disabled={isProcessing}
                        aria-label={`${PROVIDER_CONFIG[selectedProvider].label} API key`}
                      />
                    )}

                    {/* Ollama status */}
                    {selectedProvider === "ollama" && (
                      <p className={`text-xs ${
                        ollamaAvailable === true ? "text-green-600" :
                        ollamaAvailable === false ? "text-yellow-600" :
                        "text-muted-foreground"
                      }`}>
                        {ollamaAvailable === null ? "Checking Ollama..." :
                         ollamaAvailable ? "Ollama is running" :
                         "Ollama not detected at localhost:11434. Start it and we'll auto-detect."}
                      </p>
                    )}
                  </div>
                )}

                {/* Connect button — full width, separate from page picker */}
                {notionPages.length > 0 && (
                  <div className="space-y-1">
                    <Button
                      onClick={handleSetupAndConnect}
                      disabled={!canConnect}
                      className="w-full gap-2"
                      aria-describedby={!canConnect ? "connect-hint" : undefined}
                    >
                      Connect & Set Up
                    </Button>
                    {!canConnect && !isProcessing && (
                      <p id="connect-hint" className="text-xs text-muted-foreground text-center">
                        {!selectedPageId
                          ? "Select a page above"
                          : !selectedProvider
                            ? "Choose an AI provider"
                            : selectedProvider === "ollama" && ollamaAvailable !== true
                              ? "Waiting for Ollama to be available"
                              : PROVIDER_CONFIG[selectedProvider]?.needsApiKey && !providerApiKey.trim()
                                ? `Enter your ${PROVIDER_CONFIG[selectedProvider].label} API key`
                                : "Complete the fields above"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {state === "error" && errorMessage && (
              <div role="alert" className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-destructive">{errorMessage}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRetry}
                    className="mt-1 h-7 px-2 gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Build progress — persistent aria-live wrapper so first mount is announced */}
        <div aria-live="polite">
          {(state === "creating-databases" ||
            state === "installing" ||
            state === "building" ||
            state === "configuring" ||
            state === "disconnecting") && (
            <div className="px-6 pb-6">
              <div className="flex items-center gap-3 p-3 bg-muted border border-border rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  {state === "creating-databases" &&
                    "Creating databases in your Notion workspace..."}
                  {state === "installing" && "Downloading Notion pipe..."}
                  {state === "building" &&
                    (buildProgress || "Building application...")}
                  {state === "configuring" && "Saving configuration..."}
                  {state === "disconnecting" && "Disconnecting..."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Connected success */}
        {state === "connected" && (
          <div className="px-6 pb-6">
            <div className="p-4 bg-muted border border-border rounded-lg">
              <p className="text-sm text-foreground">
                <strong>Notion is connected!</strong> Your screen activity will
                be synced to Notion every 5 minutes.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
