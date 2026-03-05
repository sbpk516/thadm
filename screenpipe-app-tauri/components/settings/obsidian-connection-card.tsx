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
  FolderOpen,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { open as openDialog, ask } from "@tauri-apps/plugin-dialog";
import { exists, stat } from "@tauri-apps/plugin-fs";
import { usePipeManager } from "@/lib/hooks/use-pipe-manager";
import { useOllamaStatus } from "@/lib/hooks/use-ollama-status";
import { useSettings } from "@/lib/hooks/use-settings";
import { AIProvider, PROVIDER_CONFIG, cleanupConnectionPreset } from "@/lib/utils/ai-providers";

const PIPE_ID = "obsidian";
const PIPE_SOURCE =
  "https://github.com/sbpk516/thadm/tree/main/pipes/obsidian";

type ConnectionState =
  | "idle"
  | "setup"
  | "validating"
  | "installing"
  | "building"
  | "configuring"
  | "connected"
  | "error"
  | "disconnecting";

interface StoredObsidianSettings {
  vaultPath?: string;
  aiPresetId?: string;
}

type ObsidianFailedStep = "validating" | "installing" | "building" | "configuring" | "disconnecting" | null;

export function ObsidianConnectionCard() {
  const { status, install, enable, disable, refresh, saveSettings, waitForReady } =
    usePipeManager(PIPE_ID);
  const { settings, updateSettings, isSettingsLoaded } = useSettings();

  const [state, setState] = useState<ConnectionState>("idle");
  const [vaultPath, setVaultPath] = useState("");
  const [pathValid, setPathValid] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [buildProgress, setBuildProgress] = useState("");
  const [failedStep, setFailedStep] = useState<ObsidianFailedStep>(null);
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
    return () => { mountedRef.current = false; };
  }, []);

  // Wait for settings to load, then refresh pipe status and derive initial state
  useEffect(() => {
    if (!isSettingsLoaded || hasInitialized.current) return;
    hasInitialized.current = true;

    let cancelled = false;
    refresh().then((refreshed) => {
      if (cancelled) return;
      const stored = settings.obsidianConnection as
        | StoredObsidianSettings
        | undefined;
      if (stored?.vaultPath && refreshed.isEnabled && !refreshed.isBuilding) {
        setState("connected");
        setVaultPath(stored.vaultPath);
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

  const validateVaultPath = useCallback(
    async (path: string): Promise<boolean> => {
      setState("validating");
      setPathValid(null);
      setErrorMessage("");

      if (!path.trim()) {
        setPathValid(false);
        setFailedStep("validating");
        setState("error");
        setErrorMessage("Please select a folder.");
        return false;
      }

      try {
        // Use Tauri fs to check for .obsidian directory locally
        const sep = path.includes("\\") ? "\\" : "/";
        const obsidianDir = path.endsWith(sep)
          ? `${path}.obsidian`
          : `${path}${sep}.obsidian`;

        console.log("[OBSIDIAN_DEBUG] Checking path:", obsidianDir);
        let hasObsidian = false;
        try {
          hasObsidian = await exists(obsidianDir);
          console.log("[OBSIDIAN_DEBUG] exists() returned:", hasObsidian);
        } catch (existsErr) {
          console.error("[OBSIDIAN_DEBUG] exists() error:", existsErr);
          // Fallback: try stat()
          try {
            const info = await stat(obsidianDir);
            hasObsidian = info.isDirectory;
            console.log("[OBSIDIAN_DEBUG] stat() fallback succeeded:", hasObsidian);
          } catch (statErr) {
            console.error("[OBSIDIAN_DEBUG] stat() also failed:", statErr);
          }
        }
        if (!mountedRef.current) return false;

        if (hasObsidian) {
          setPathValid(true);
          setState("setup");
          return true;
        } else {
          setPathValid(false);
          setFailedStep("validating");
          setState("error");
          setErrorMessage(
            "No .obsidian folder found. Select a folder that contains an Obsidian vault."
          );
          return false;
        }
      } catch (err) {
        console.error("[OBSIDIAN_DEBUG] exists() threw:", err);
        if (!mountedRef.current) return false;
        setPathValid(false);
        setFailedStep("validating");
        setState("error");
        const detail = err instanceof Error ? err.message : String(err);
        setErrorMessage(`Could not verify the folder: ${detail}`);
        return false;
      }
    },
    []
  );

  const handleSelectFolder = useCallback(async () => {
    try {
      const selectedPath = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Obsidian Vault",
      });

      if (selectedPath) {
        setVaultPath(selectedPath as string);
        setSelectedProvider(null);
        setProviderApiKey("");
        await validateVaultPath(selectedPath as string);
      }
    } catch (error) {
      console.error("failed to select path:", error);
    }
  }, [validateVaultPath]);

  const resetFormState = () => {
    setVaultPath("");
    setPathValid(null);
    setSelectedProvider(null);
    setProviderApiKey("");
  };

  const handleConnect = useCallback(async () => {
    if (!vaultPath.trim()) return;
    if (connectingRef.current) return;
    connectingRef.current = true;
    setFailedStep(null);
    setErrorMessage("");

    let currentStep: NonNullable<ObsidianFailedStep> = "installing";
    let finalPresetId: string | undefined;

    try {
      // Step 1: Create AI preset + persist eagerly to Tauri store
      if (!selectedProvider) {
        throw new Error("Please select an AI provider.");
      }
      const config = PROVIDER_CONFIG[selectedProvider];
      const currentSettings = settingsRef.current;
      const existingPresets = (currentSettings.aiPresets as any[]) || [];
      const stored = currentSettings.obsidianConnection as
        | StoredObsidianSettings
        | undefined;

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
        finalPresetId = `obsidian-${selectedProvider}-${Date.now()}`;
        updatedPresets = [...existingPresets, { ...presetData, id: finalPresetId }];
      }

      await updateSettings({
        aiPresets: updatedPresets,
        obsidianConnection: {
          vaultPath: vaultPath.trim(),
          aiPresetId: finalPresetId,
        },
      });
      console.log("[OBSIDIAN_DEBUG] Step 1: AI preset + obsidianConnection saved, id:", finalPresetId);

      if (!mountedRef.current) return;

      // Step 2: Install pipe if not installed
      if (!status.isInstalled) {
        currentStep = "installing";
        setState("installing");
        setErrorMessage("");
        console.log("[OBSIDIAN_DEBUG] Step 2: Installing pipe...");
        await install(PIPE_SOURCE);
        console.log("[OBSIDIAN_DEBUG] Step 2: Install complete");
      }

      if (!mountedRef.current) return;

      // Step 3: Enable pipe (starts build, resolves when build completes)
      currentStep = "building";
      setState("building");
      setBuildProgress("Starting build...");
      console.log("[OBSIDIAN_DEBUG] Step 3: Enabling pipe...");
      await enable();
      console.log("[OBSIDIAN_DEBUG] Step 3: Enable complete");

      if (!mountedRef.current) return;

      // Step 4: Readiness loop — wait for pipe HTTP server
      currentStep = "configuring";
      setState("configuring");

      console.log("[OBSIDIAN_DEBUG] Step 4: Waiting for pipe HTTP server...");
      const pipePort = await waitForReady(() => !mountedRef.current);
      if (!mountedRef.current || pipePort === null) return;
      console.log("[OBSIDIAN_DEBUG] Step 4: Server ready on port", pipePort);

      // Step 5: Save vaultPath + AI preset IDs to pipe settings
      console.log("[OBSIDIAN_DEBUG] Step 5: Saving settings to pipe...");
      await saveSettings(
        "obsidian",
        {
          vaultPath: vaultPath.trim(),
          aiLogPresetId: finalPresetId,
          aiPresetId: finalPresetId,
        },
        pipePort
      );
      console.log("[OBSIDIAN_DEBUG] Step 5: Settings saved");

      console.log("[OBSIDIAN_DEBUG] Flow complete — connected!");
      if (mountedRef.current) setState("connected");
    } catch (error) {
      // Persist partial progress so retry reuses preset
      if (finalPresetId) {
        try {
          await updateSettings({
            obsidianConnection: {
              vaultPath: vaultPath.trim(),
              aiPresetId: finalPresetId,
            },
          });
        } catch {
          // Best effort
        }
      }

      console.error("[OBSIDIAN_DEBUG] FAILED at step:", currentStep, "error:", error);
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
    selectedProvider,
    providerApiKey,
    status.isInstalled,
    install,
    enable,
    waitForReady,
    saveSettings,
    updateSettings,
    vaultPath,
  ]);

  const performDisconnect = useCallback(async () => {
    try {
      setState("disconnecting");
      await disable();

      await cleanupConnectionPreset(settingsRef.current, "obsidianConnection", updateSettings);

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
      "Disconnect from Obsidian? Activity logs will stop syncing to your vault.",
      { title: "Disconnect Obsidian", kind: "warning" }
    );

    if (!confirmed || !mountedRef.current) return;
    await performDisconnect();
  }, [performDisconnect]);

  const handleRetry = useCallback(() => {
    setErrorMessage("");
    if (failedStep === "disconnecting") {
      setFailedStep(null);
      performDisconnect();
    } else if (failedStep === "validating") {
      // Clear invalid path so user starts fresh
      setVaultPath("");
      setPathValid(null);
      setFailedStep(null);
      setState("setup");
    } else if (failedStep && pathValid === true && (failedStep === "installing" || failedStep === "building" || failedStep === "configuring")) {
      // Retry from the failed step (preset already persisted)
      setFailedStep(null);
      handleConnect();
    } else {
      setPathValid(null);
      setFailedStep(null);
      setState("setup");
    }
  }, [failedStep, pathValid, handleConnect, performDisconnect]);

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
    state === "installing" ||
    state === "building" ||
    state === "configuring" ||
    state === "disconnecting";

  const canConnect = Boolean(
    pathValid === true &&
    selectedProvider &&
    !isProcessing &&
    (!PROVIDER_CONFIG[selectedProvider]?.needsApiKey || providerApiKey.trim()) &&
    (selectedProvider !== "ollama" || ollamaAvailable === true)
  );

  return (
    <Card className="border-border bg-card shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start p-6 gap-6">
          {/* Obsidian Logo */}
          <div className="flex-shrink-0">
            <svg
              width="64"
              height="64"
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
              className="rounded-2xl"
              aria-hidden="true"
            >
              <rect width="100" height="100" rx="20" fill="#1e1e2e" />
              <path
                d="M65 20L40 30L30 70L45 85L70 75L75 35L65 20Z"
                fill="#a88bfa"
                fillOpacity="0.9"
              />
              <path
                d="M40 30L30 70L50 65L55 25L40 30Z"
                fill="#7c5cbf"
                fillOpacity="0.8"
              />
              <path
                d="M55 25L50 65L45 85L70 75L75 35L55 25Z"
                fill="#c4b5fd"
                fillOpacity="0.6"
              />
            </svg>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-semibold text-foreground">
                Obsidian
              </h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
                by Obsidian
              </span>
              {state === "connected" && (
                <Badge aria-label="Connected" className="bg-green-500/15 text-green-600 border-green-500/20 hover:bg-green-500/15">
                  Connected
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mb-4">
              Sync screen activity logs and AI insights directly to your
              Obsidian vault as markdown files.
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
              <Label htmlFor="obsidian-vault-path">Obsidian Vault Folder</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="obsidian-vault-path"
                    placeholder="Select your Obsidian vault folder..."
                    value={vaultPath}
                    onChange={(e) => {
                      setVaultPath(e.target.value);
                      setPathValid(null);
                      setErrorMessage("");
                      setSelectedProvider(null);
                      setProviderApiKey("");
                      if (state === "error") setState("setup");
                    }}
                    disabled={isProcessing}
                    className={
                      pathValid === true
                        ? "border-green-500 pr-8"
                        : pathValid === false
                        ? "border-red-500 pr-8"
                        : ""
                    }
                  />
                  {pathValid === true && (
                    <Check className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                  {pathValid === false && (
                    <X className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={handleSelectFolder}
                  disabled={isProcessing}
                  className="gap-2"
                >
                  <FolderOpen className="h-4 w-4" />
                  Browse
                </Button>
              </div>
            </div>

            {pathValid !== true && vaultPath.trim() && state !== "validating" && (
              <Button
                variant="outline"
                onClick={() => validateVaultPath(vaultPath.trim())}
                disabled={isProcessing}
                className="gap-2"
              >
                Validate
              </Button>
            )}
            {state === "validating" && (
              <Button disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Validating
              </Button>
            )}

            {/* Provider selector — shown after vault validates */}
            {pathValid === true && state !== "error" && (
              <div className="space-y-4">
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

                {/* Connect button */}
                <div className="space-y-1">
                  <Button
                    onClick={handleConnect}
                    disabled={!canConnect}
                    className="w-full gap-2"
                    aria-describedby={!canConnect ? "connect-hint" : undefined}
                  >
                    Connect & Set Up
                  </Button>
                  {!canConnect && !isProcessing && (
                    <p id="connect-hint" className="text-xs text-muted-foreground text-center">
                      {!selectedProvider
                        ? "Choose an AI provider"
                        : selectedProvider === "ollama" && ollamaAvailable !== true
                          ? "Waiting for Ollama to be available"
                          : PROVIDER_CONFIG[selectedProvider]?.needsApiKey && !providerApiKey.trim()
                            ? `Enter your ${PROVIDER_CONFIG[selectedProvider].label} API key`
                            : "Complete the fields above"}
                    </p>
                  )}
                </div>
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

        {/* Build progress */}
        <div aria-live="polite">
          {(state === "installing" ||
            state === "building" ||
            state === "configuring" ||
            state === "disconnecting") && (
            <div className="px-6 pb-6">
              <div className="flex items-center gap-3 p-3 bg-muted border border-border rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  {state === "installing" && "Downloading Obsidian pipe..."}
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
                <strong>Obsidian is connected!</strong> Activity logs will be
                synced to your vault every 5 minutes.
              </p>
              {vaultPath && (
                <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                  {vaultPath}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
