"use client";

import { getStore, useSettings } from "@/lib/hooks/use-settings";
import { useLicenseStatus } from "@/lib/hooks/use-license-status";

import React, { useEffect, useState, useRef } from "react";
import NotificationHandler from "@/components/notification-handler";
import { useToast } from "@/components/ui/use-toast";
import { useOnboarding } from "@/lib/hooks/use-onboarding";
import { ChangelogDialog } from "@/components/changelog-dialog";
import { BreakingChangesInstructionsDialog } from "@/components/breaking-changes-instructions-dialog";
import { useHealthCheck } from "@/lib/hooks/use-health-check";

import { commands } from "@/lib/utils/tauri";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import localforage from "localforage";
import { LoginDialog } from "../components/login-dialog";
import { ModelDownloadTracker } from "../components/model-download-tracker";
import Timeline from "@/components/rewind/timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { PermissionButtons } from "@/components/status/permission-buttons";
import { usePlatform } from "@/lib/hooks/use-platform";
import SplashScreen from "@/components/splash-screen";

export default function Home() {
  const { settings, updateSettings, loadUser, reloadStore, isSettingsLoaded, loadingError } = useSettings();
  const { toast } = useToast();
  const { onboardingData } = useOnboarding();
  const { isServerDown, isLoading: isHealthLoading } = useHealthCheck();
  const { isMac } = usePlatform();
  const licenseStatus = useLicenseStatus();
  const [isRestarting, setIsRestarting] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const isProcessingRef = useRef(false);

  // Load onboarding status on mount
  useEffect(() => {
    const { loadOnboardingStatus } = useOnboarding.getState();
    loadOnboardingStatus();
  }, []);

  useEffect(() => {
    const getAudioDevices = async () => {
      const store = await getStore();
      const devices = (await store.get("audioDevices")) as string[];
      return devices;
    };

    // Cleanup function placeholder if needed
    return () => {
      // Any cleanup logic can go here
    };
  }, []);

  useEffect(() => {
    // add a shortcut to hide main window when pressed esc
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        commands.closeWindow("Main");
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    const checkScreenPermissionRestart = async () => {
      const restartPending = await localforage.getItem(
        "screenPermissionRestartPending"
      );
      if (restartPending) {
        // Clear the restart pending flag
        await localforage.removeItem("screenPermissionRestartPending");
        try {
          await commands.showWindow("Onboarding");
        } catch (error) {
          console.error("Failed to show onboarding window:", error);
        }
      }
    };

    // Always call this effect, but only execute logic when onboarding data is loaded
    if (onboardingData.isCompleted !== undefined) {
      checkScreenPermissionRestart();
    }
  }, [onboardingData.isCompleted]);

  const handleRestartServer = async () => {
    setIsRestarting(true);
    try {
      toast({
        title: "restarting server",
        description: "stopping thadm server...",
        duration: 3000,
      });

      // Stop the server first
      await commands.stopScreenpipe();
      
      // Wait for proper cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "restarting server",
        description: "starting thadm server...",
        duration: 3000,
      });

      // Start the server
      await commands.spawnScreenpipe(null);
      
      toast({
        title: "server restarted",
        description: "thadm server has been restarted successfully.",
        duration: 3000,
      });
    } catch (error) {
      console.error("failed to restart server:", error);
      toast({
        title: "restart failed",
        description: "failed to restart thadm server. please check the logs.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsRestarting(false);
    }
  };

  const handleActivate = () => {
    toast({
      title: "coming soon",
      description: "license activation coming soon.",
      duration: 3000,
    });
  };

  return (
    <div className="flex flex-col items-center flex-1 mx-auto relative scrollbar-hide">
      {/* Transparent titlebar area - no drag region to prevent accidental window moves */}
      <div className="h-8 bg-gradient-to-b from-black/15 to-transparent w-full fixed top-0 left-0 z-[1000] pointer-events-none" />
      
      <NotificationHandler />
      {/* Only render content after settings are loaded */}
      {isSettingsLoaded ? (
        <>
          <ChangelogDialog />
          <BreakingChangesInstructionsDialog />
          <LoginDialog />
          <ModelDownloadTracker />
          {licenseStatus.status === "expired" && (
            <div className="bg-destructive/5 border-b px-6 py-4 w-full">
              <div className="max-w-2xl mx-auto space-y-3">
                <div>
                  <h3 className="font-medium">Your 15-day trial has ended</h3>
                  <p className="text-sm text-muted-foreground">
                    Recording is paused. Search still works for your existing data.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="THADM-XXXX-XXXX-XXXX-XXXX"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                  />
                  <Button onClick={handleActivate}>Activate</Button>
                </div>
                <p className="text-sm">
                  <button
                    onClick={() => openUrl("https://kalam-plus.com/thadm")}
                    className="text-primary hover:underline"
                  >
                    Buy Thadm — Annual $29/yr · Lifetime $49
                  </button>
                </p>
              </div>
            </div>
          )}
          {!isServerDown ? (
            <div className="w-full scrollbar-hide bg-background relative">
              {/* Show connecting overlay while health check is loading */}
              {isHealthLoading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">connecting to thadm...</p>
                  </div>
                </div>
              )}
              <Timeline />
            </div>
          ) : (
            <div className="flex items-center justify-center h-screen p-4 bg-background w-full">
              <div className="max-w-lg w-full space-y-6">
                {/* Header */}
                <div className="text-center space-y-4">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center border border-destructive/15">
                      <AlertTriangle className="w-8 h-8 text-destructive" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">Can&apos;t Search Right Now</h2>
                      <p className="text-muted-foreground mt-2">
                        The recorder needs to be running to search your history. Start recording to continue.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions Card */}
                <div className="bg-card border border-border rounded-lg p-6 space-y-6">
                  {/* Server Control */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">Recorder</h3>
                        <p className="text-sm text-muted-foreground">
                          Start the recorder to search your history
                        </p>
                      </div>
                      <Button
                        onClick={handleRestartServer}
                        disabled={isRestarting}
                        className="flex items-center gap-2"
                      >
                        <RefreshCw className={`h-4 w-4 ${isRestarting ? 'animate-spin' : ''}`} />
                        {isRestarting ? "Starting..." : "Start Recording"}
                      </Button>
                    </div>
                  </div>

                  {/* Permissions Section - Only show on Mac */}
                  {isMac && (
                    <>
                      <Separator />
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-semibold">System Permissions</h3>
                          <p className="text-sm text-muted-foreground">
                            Ensure thadm has the necessary permissions to function properly
                          </p>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Screen Recording</span>
                            <PermissionButtons type="screen" hideWindowOnClick />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Audio Recording</span>
                            <PermissionButtons type="audio" hideWindowOnClick />
                          </div>

                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          {licenseStatus.status === "trial_expiring" && (
            <div className="fixed bottom-0 left-0 right-0 bg-primary/10 border-t px-4 py-2 text-center text-sm z-50">
              Trial ends in {licenseStatus.daysRemaining} days{" · "}
              <button
                onClick={() => openUrl("https://kalam-plus.com/thadm")}
                className="text-primary hover:underline"
              >
                Buy Thadm
              </button>
            </div>
          )}
        </>
      ) : (
        <SplashScreen />
      )}
    </div>
  );
}
