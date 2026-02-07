"use client";

import React, { useState, useCallback } from "react";
import { useSettings, Settings } from "@/lib/hooks/use-settings";
import { useTheme } from "@/components/theme-provider";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Rocket,
  Moon,
  Sun,
  Monitor,
  FlaskConical,
  ExternalLink,
  Folder,
  ChevronsUpDown,
  Terminal,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { open } from "@tauri-apps/plugin-shell";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ValidatedInput } from "@/components/ui/validated-input";
import { commands } from "@/lib/utils/tauri";
import {
  validateField,
  FieldValidationResult,
} from "@/lib/utils/validation";
// posthog, Sentry, and tauri-plugin-sentry-api are dynamically imported in handleUpdate

export default function GeneralSettings() {
  const { settings, updateSettings, getDataDir } = useSettings();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [dataDirInputVisible, setDataDirInputVisible] = useState(false);
  const [clickTimeout, setClickTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSettingsChange = (newSettings: Partial<Settings>, restart: boolean = false) => {
    if (settings) {
      updateSettings(newSettings);
      if (restart) {
        setHasUnsavedChanges(true);
      }
    }
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    setHasUnsavedChanges(false);

    toast({
      title: "Updating settings",
      description: "This may take a few moments...",
    });

    try {
      const posthog = (await import("posthog-js")).default;
      const Sentry = await import("@sentry/react");
      const { defaultOptions } = await import("tauri-plugin-sentry-api");

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
  };

  const handleDataDirChange = async () => {
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      setDataDirInputVisible(true);
    } else {
      const timeout = setTimeout(() => {
        selectDataDir();
        setClickTimeout(null);
      }, 250);
      setClickTimeout(timeout);
    }

    async function selectDataDir() {
      try {
        const dataDir = await getDataDir();
        const selected = await openDialog({
          directory: true,
          multiple: false,
          defaultPath: dataDir,
        });
        if (selected) {
          handleSettingsChange({ dataDir: selected }, true);
        }
      } catch (error) {
        console.error("failed to change data directory:", error);
        toast({
          title: "error",
          description: "failed to change data directory.",
          variant: "destructive",
          duration: 3000,
        });
      }
    }
  };

  const handleDataDirInputChange = useCallback((value: string, isValid: boolean) => {
    handleSettingsChange({ dataDir: value }, true);
  }, []);

  const validateDataDirectory = useCallback((path: string): FieldValidationResult => {
    if (!path.trim()) return { isValid: false, error: "Data directory path is required" };
    return { isValid: true };
  }, []);

  const validateDataDirInput = async () => {
    try {
      if (await exists(settings.dataDir)) return;
    } catch (err) {}

    toast({
      title: "error",
      description: "failed to change data directory.",
      variant: "destructive",
      duration: 3000,
    });

    handleSettingsChange({ dataDir: settings.dataDir }, true);
  };

  const themeOptions = [
    {
      value: "system" as const,
      label: "System",
      description: "Use system preference",
      icon: Monitor,
    },
    {
      value: "light" as const,
      label: "Light",
      description: "Light theme",
      icon: Sun,
    },
    {
      value: "dark" as const,
      label: "Dark",
      description: "Dark theme",
      icon: Moon,
    },
  ];

  const handleDownloadBeta = async () => {
    await open("https://screenpi.pe/beta");
    toast({
      title: "Opening beta download",
      description: "Download the beta app to run it alongside stable",
      duration: 5000,
    });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          General Settings
        </h1>
        <p className="text-muted-foreground text-lg">
          Configure basic application preferences and behavior
        </p>
      </div>

      {/* Apply Changes Banner */}
      {hasUnsavedChanges && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Configuration Status</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Unsaved changes - restart required</span>
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
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Rocket className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    Auto-start Application
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Automatically launch thadm when your computer starts up.
                    This ensures you never miss capturing important moments.
                  </p>
                </div>
              </div>
              <Switch
                id="auto-start-toggle"
                checked={settings?.autoStartEnabled ?? false}
                onCheckedChange={(checked) =>
                  handleSettingsChange({ autoStartEnabled: checked })
                }
                className="ml-4"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Monitor className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    Theme
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Choose your preferred theme. System follows your device settings automatically.
                  </p>
                </div>
              </div>

              <div className="space-y-3 ml-16">
                {themeOptions.map((option) => {
                  const IconComponent = option.icon;
                  return (
                    <label
                      key={option.value}
                      className="flex items-center space-x-3 cursor-pointer group"
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={option.value}
                        checked={theme === option.value}
                        onChange={() => setTheme(option.value)}
                        className="sr-only"
                      />
                      <div className={`
                        flex items-center justify-center w-4 h-4 rounded-full border-2 transition-colors
                        ${theme === option.value
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground group-hover:border-primary'
                        }
                      `}>
                        {theme === option.value && (
                          <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <IconComponent className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">
                          {option.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FlaskConical className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    Try Beta Version
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Get early access to new features. The beta app runs separately alongside this stable version.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleDownloadBeta}
                className="ml-4 flex items-center gap-2"
              >
                <FlaskConical className="h-4 w-4" />
                Download Beta
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Data Directory */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Folder className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Data Directory</h3>
        </div>

        {dataDirInputVisible ? (
          <ValidatedInput
            id="dataDir"
            label="Data Directory Path"
            value={settings.dataDir || ""}
            onChange={handleDataDirInputChange}
            validation={validateDataDirectory}
            onBlur={() => {
              setDataDirInputVisible(false);
              validateDataDirInput();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setDataDirInputVisible(false);
                validateDataDirInput();
              }
            }}
            placeholder="Enter data directory path"
            autoFocus={true}
            required={true}
          />
        ) : (
          <Button
            variant="outline"
            role="combobox"
            className="w-full justify-between"
            onClick={handleDataDirChange}
          >
            <div className="flex gap-4">
              {settings.dataDir ? "Change directory" : "Select directory"}
              <span className="text-muted-foreground">
                {settings.dataDir || "Default directory"}
              </span>
            </div>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        )}
      </div>

      <Separator />

      {/* System Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="h-5 w-5" />
          <h3 className="text-lg font-semibold">System Settings</h3>
        </div>

        <ValidatedInput
          id="port"
          label="Server Port"
          type="number"
          value={settings.port.toString()}
          onChange={(value, isValid) => {
            const portValue = parseInt(value) || 3030;
            handleSettingsChange({ port: portValue }, true);
          }}
          validation={(value) => validateField("port", parseInt(value) || 0)}
          placeholder="Enter server port"
          required={true}
          helperText="Port for the thadm server (requires restart)"
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="analyticsEnabled">Enable analytics</Label>
              <p className="text-sm text-muted-foreground">
                Help improve thadm by sharing anonymous usage data and error reports
              </p>
            </div>
            <Switch
              id="analyticsEnabled"
              checked={settings.analyticsEnabled}
              onCheckedChange={(checked) =>
                handleSettingsChange({ analyticsEnabled: checked }, true)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="useChineseMirror">Use Chinese mirror</Label>
              <p className="text-sm text-muted-foreground">
                Use Chinese mirror for downloads (for users in China)
              </p>
            </div>
            <Switch
              id="useChineseMirror"
              checked={settings.useChineseMirror}
              onCheckedChange={(checked) =>
                handleSettingsChange({ useChineseMirror: checked }, true)
              }
            />
          </div>
        </div>
      </div>

      <div className="pt-4">
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-sm text-primary">
            Auto-start ensures continuous recording so you never miss capturing important moments.
          </p>
        </div>
      </div>
    </div>
  );
}
