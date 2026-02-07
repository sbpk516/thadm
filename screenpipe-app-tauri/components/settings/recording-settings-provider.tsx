"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { Command as TauriCommand } from "@tauri-apps/plugin-shell";
import { commands, SettingsStore } from "@/lib/utils/tauri";
import {
  useSettings,
  Settings,
} from "@/lib/hooks/use-settings";
import { useToast } from "@/components/ui/use-toast";
import { useHealthCheck } from "@/lib/hooks/use-health-check";
import { platform } from "@tauri-apps/plugin-os";
import posthog from "posthog-js";
import * as Sentry from "@sentry/react";
import { defaultOptions } from "tauri-plugin-sentry-api";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import {
  validateField,
  sanitizeValue,
  debounce,
} from "@/lib/utils/validation";

export interface AudioDevice {
  name: string;
  is_default: boolean;
}

export interface MonitorDevice {
  id: string;
  name: string;
  is_default: boolean;
  width: number;
  height: number;
}

interface RecordingSettingsContextValue {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  validationErrors: Record<string, string>;
  pendingChanges: Partial<SettingsStore>;
  hasUnsavedChanges: boolean;
  isUpdating: boolean;
  availableMonitors: MonitorDevice[];
  availableAudioDevices: AudioDevice[];
  isMacOS: boolean;
  handleSettingsChange: (newSettings: Partial<Settings>, restart?: boolean) => void;
  handleUpdate: () => Promise<void>;
  getValidationStatus: () => { variant: "destructive" | "secondary" | "default"; message: string };
}

const RecordingSettingsContext = createContext<RecordingSettingsContextValue | null>(null);

export function useRecordingSettings() {
  const ctx = useContext(RecordingSettingsContext);
  if (!ctx) {
    throw new Error("useRecordingSettings must be used within RecordingSettingsProvider");
  }
  return ctx;
}

export function RecordingSettingsProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const { toast } = useToast();
  const { health } = useHealthCheck();
  const isDisabled = health?.status_code === 500;

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [pendingChanges, setPendingChanges] = useState<Partial<SettingsStore>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [availableMonitors, setAvailableMonitors] = useState<MonitorDevice[]>([]);
  const [availableAudioDevices, setAvailableAudioDevices] = useState<AudioDevice[]>([]);
  const [isMacOS, setIsMacOS] = useState(false);

  const debouncedValidateSettings = useMemo(
    () => debounce((newSettings: Partial<SettingsStore>) => {
      const errors: Record<string, string> = {};

      if (newSettings.fps !== undefined) {
        const fpsValidation = validateField("fps", newSettings.fps);
        if (!fpsValidation.isValid && fpsValidation.error) {
          errors.fps = fpsValidation.error;
        }
      }

      if (newSettings.audioChunkDuration !== undefined) {
        const durationValidation = validateField("audioChunkDuration", newSettings.audioChunkDuration);
        if (!durationValidation.isValid && durationValidation.error) {
          errors.audioChunkDuration = durationValidation.error;
        }
      }

      if (newSettings.port !== undefined) {
        const portValidation = validateField("port", newSettings.port);
        if (!portValidation.isValid && portValidation.error) {
          errors.port = portValidation.error;
        }
      }

      if (newSettings.dataDir !== undefined) {
        const dataDirValidation = validateField("dataDir", newSettings.dataDir);
        if (!dataDirValidation.isValid && dataDirValidation.error) {
          errors.dataDir = dataDirValidation.error;
        }
      }

      if (newSettings.deepgramApiKey !== undefined && newSettings.deepgramApiKey.trim()) {
        if (newSettings.deepgramApiKey.length < 10) {
          errors.deepgramApiKey = "API key seems too short";
        }
      }

      setValidationErrors(errors);
    }, 300),
    []
  );

  const handleSettingsChange = useCallback((
    newSettings: Partial<Settings>,
    restart: boolean = true
  ) => {
    const sanitizedSettings: Partial<Settings> = {};
    for (const [key, value] of Object.entries(newSettings)) {
      sanitizedSettings[key as keyof Settings] = sanitizeValue(key as keyof SettingsStore, value);
    }

    setPendingChanges(prev => ({ ...prev, ...sanitizedSettings }));
    debouncedValidateSettings({ ...settings, ...sanitizedSettings });
    updateSettings(sanitizedSettings);

    if (restart) {
      setHasUnsavedChanges(true);
    }
  }, [settings, updateSettings, debouncedValidateSettings]);

  const handleUpdate = useCallback(async () => {
    if (Object.keys(validationErrors).length > 0) {
      toast({
        title: "Validation errors",
        description: "Please fix all validation errors before applying changes",
        variant: "destructive",
      });
      return;
    }

    setIsUpdating(true);
    setHasUnsavedChanges(false);

    toast({
      title: "Updating recording settings",
      description: "This may take a few moments...",
    });

    try {
      if (!settings.analyticsEnabled) {
        posthog.capture("telemetry", { enabled: false });
        posthog.opt_out_capturing();
        Sentry.close();
      } else {
        const isDebug = process.env.TAURI_ENV_DEBUG === "true";
        if (!isDebug) {
          posthog.opt_in_capturing();
          posthog.capture("telemetry", { enabled: true });
          Sentry.init({ ...defaultOptions });
        }
      }

      await commands.stopScreenpipe();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await commands.spawnScreenpipe(null);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      toast({
        title: "Settings updated successfully",
        description: "thadm has been restarted with new settings",
      });
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast({
        title: "Error updating settings",
        description: "Please try again or check the logs for more information",
        variant: "destructive",
      });
      setHasUnsavedChanges(true);
    } finally {
      setIsUpdating(false);
    }
  }, [validationErrors, settings.analyticsEnabled, toast]);

  const getValidationStatus = useCallback(() => {
    const errorCount = Object.keys(validationErrors).length;
    if (errorCount > 0) {
      return {
        variant: "destructive" as const,
        message: `${errorCount} validation error${errorCount > 1 ? 's' : ''} found`,
      };
    }
    if (hasUnsavedChanges) {
      return {
        variant: "secondary" as const,
        message: "Unsaved changes - restart required",
      };
    }
    return {
      variant: "default" as const,
      message: "All settings valid",
    };
  }, [validationErrors, hasUnsavedChanges]);

  useEffect(() => {
    const currentPlatform = platform();
    setIsMacOS(currentPlatform === "macos");
  }, []);

  useEffect(() => {
    const loadMonitors = async (): Promise<MonitorDevice[]> => {
      try {
        const monitorCommand = TauriCommand.sidecar("thadm-recorder", [
          "vision", "list", "-o", "json",
        ]);
        const monitorOutput = await monitorCommand.execute();
        if (monitorOutput.code !== 0) {
          console.warn("Failed to fetch monitors:", monitorOutput.stderr);
          return [];
        }
        const monitorResponse = JSON.parse(monitorOutput.stdout);
        return monitorResponse.data || monitorResponse;
      } catch (error) {
        console.warn("Failed to load monitors:", error);
        return [];
      }
    };

    const loadAudioDevices = async (): Promise<AudioDevice[]> => {
      try {
        const audioCommand = TauriCommand.sidecar("thadm-recorder", [
          "audio", "list", "-o", "json",
        ]);
        const audioOutput = await audioCommand.execute();
        if (audioOutput.code !== 0) {
          console.warn("Failed to fetch audio devices:", audioOutput.stderr);
          return [];
        }
        const audioResponse = JSON.parse(audioOutput.stdout);
        return audioResponse.data || audioResponse;
      } catch (error) {
        console.warn("Failed to load audio devices:", error);
        return [];
      }
    };

    const loadDevices = async () => {
      // Load monitors and audio devices independently so one failure doesn't block the other
      const [monitors, audioDevices] = await Promise.all([
        loadMonitors(),
        loadAudioDevices(),
      ]);

      setAvailableMonitors(monitors);
      setAvailableAudioDevices(audioDevices);

      const updates: Partial<typeof settings> = {};

      if (monitors.length > 0) {
        const availableMonitorIds = monitors.map((monitor) => monitor.id.toString());
        let updatedMonitorIds = settings.monitorIds.filter((id) =>
          id === "default" || availableMonitorIds.includes(id)
        );
        if (updatedMonitorIds.length === 0) {
          updatedMonitorIds = [
            monitors.find((monitor) => monitor.is_default)!.id!.toString(),
          ];
        }
        updates.monitorIds = updatedMonitorIds;
      }

      if (audioDevices.length > 0) {
        const availableAudioDeviceNames = audioDevices.map((device) => device.name);
        let updatedAudioDevices = settings.audioDevices.filter((device) =>
          availableAudioDeviceNames.includes(device)
        );
        if (
          updatedAudioDevices.length === 0 ||
          (settings.audioDevices.length === 1 &&
            settings.audioDevices[0] === "default" &&
            audioDevices.length > 0)
        ) {
          updatedAudioDevices = audioDevices
            .filter((device) => device.is_default)
            .map((device) => device.name);
        }
        updates.audioDevices = updatedAudioDevices;
      }

      if (Object.keys(updates).length > 0) {
        handleSettingsChange(updates, false);
      }
    };

    loadDevices();
  }, []);

  const value = useMemo(() => ({
    settings,
    updateSettings,
    validationErrors,
    pendingChanges,
    hasUnsavedChanges,
    isUpdating,
    availableMonitors,
    availableAudioDevices,
    isMacOS,
    handleSettingsChange,
    handleUpdate,
    getValidationStatus,
  }), [
    settings,
    updateSettings,
    validationErrors,
    pendingChanges,
    hasUnsavedChanges,
    isUpdating,
    availableMonitors,
    availableAudioDevices,
    isMacOS,
    handleSettingsChange,
    handleUpdate,
    getValidationStatus,
  ]);

  return (
    <RecordingSettingsContext.Provider value={value}>
      {children}
    </RecordingSettingsContext.Provider>
  );
}

export function RecordingSettingsBanner() {
  const { validationErrors, hasUnsavedChanges, isUpdating, handleUpdate, getValidationStatus } = useRecordingSettings();

  if (Object.keys(validationErrors).length === 0 && !hasUnsavedChanges) {
    return null;
  }

  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Configuration Status</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>{getValidationStatus().message}</span>
        {hasUnsavedChanges && Object.keys(validationErrors).length === 0 && (
          <Button
            onClick={handleUpdate}
            disabled={isUpdating}
            size="sm"
            variant="outline"
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Apply Changes
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
