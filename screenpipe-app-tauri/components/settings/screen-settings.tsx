"use client";

import React, { useCallback } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Check,
  HelpCircle,
  Monitor,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { platform } from "@tauri-apps/plugin-os";
import { useRecordingSettings, RecordingSettingsBanner } from "./recording-settings-provider";

export function ScreenSettings() {
  const {
    settings,
    validationErrors,
    availableMonitors,
    isMacOS,
    handleSettingsChange,
  } = useRecordingSettings();

  const handleFpsChange = useCallback((value: number[]) => {
    const fps = Math.max(0.1, Math.min(60, value[0]));
    handleSettingsChange({ fps }, true);
  }, [handleSettingsChange]);

  const handleOcrModelChange = (value: string) => {
    handleSettingsChange({ ocrEngine: value });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Screen Settings
        </h1>
        <p className="text-muted-foreground text-lg">
          Configure screen recording and OCR preferences
        </p>
      </div>

      <RecordingSettingsBanner />

      {/* FPS */}
      <div className="flex flex-col space-y-2">
        <Label htmlFor="fps" className="flex items-center space-x-2">
          <span>Frames per second (FPS)</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  Adjust the recording frame rate. Lower values save resources,
                  higher values provide smoother recordings and are less likely to miss activity.
                  We optimize resource usage when your screen doesn&apos;t change much.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {validationErrors.fps && (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
        </Label>
        <div className="flex items-center space-x-4">
          <Slider
            id="fps"
            min={0.1}
            max={10}
            step={0.1}
            value={[settings.fps]}
            onValueChange={handleFpsChange}
            className="flex-grow"
          />
          <span className="w-12 text-right">
            {settings.fps.toFixed(1)}
          </span>
        </div>
        {validationErrors.fps && (
          <p className="text-sm text-destructive">{validationErrors.fps}</p>
        )}
      </div>

      <Separator />

      {/* Video Recording */}
      <div className="flex flex-col space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Monitor className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Video Recording</h3>
        </div>

        {/* Monitor Selection */}
        {!settings.useAllMonitors && (
          <div className="flex flex-col space-y-2">
            <Label htmlFor="monitors" className="flex items-center space-x-2">
              <span>Monitors</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4 cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>
                      Select which monitors to record from. Multiple monitors can be selected.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* Default Monitor Option */}
              <div
                className={cn(
                  "flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors",
                  settings.monitorIds.includes("default")
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent"
                )}
                onClick={() => {
                  const isDefaultSelected = settings.monitorIds.includes("default");
                  if (isDefaultSelected) {
                    handleSettingsChange({
                      monitorIds: settings.monitorIds.filter(id => id !== "default")
                    }, true);
                  } else {
                    handleSettingsChange({ monitorIds: ["default"] }, true);
                  }
                }}
              >
                <div className="flex-1">
                  <p className="font-medium">Default Monitor</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically use the system&apos;s default monitor
                  </p>
                </div>
                <Check
                  className={cn(
                    "h-4 w-4",
                    settings.monitorIds.includes("default")
                      ? "opacity-100"
                      : "opacity-0"
                  )}
                />
              </div>

              {availableMonitors.map((monitor) => (
                <div
                  key={monitor.id}
                  className={cn(
                    "flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    settings.monitorIds.includes(monitor.id.toString())
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent"
                  )}
                  onClick={() => {
                    const currentIds = settings.monitorIds.filter(id => id !== "default");
                    const monitorId = monitor.id.toString();
                    const updatedIds = currentIds.includes(monitorId)
                      ? currentIds.filter(id => id !== monitorId)
                      : [...currentIds, monitorId];
                    handleSettingsChange({ monitorIds: updatedIds }, true);
                  }}
                >
                  <div className="flex-1">
                    <p className="font-medium">{monitor.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {monitor.width}x{monitor.height}
                      {monitor.is_default && " (Default)"}
                    </p>
                  </div>
                  <Check
                    className={cn(
                      "h-4 w-4",
                      settings.monitorIds.includes(monitor.id.toString())
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OCR Engine */}
        <div className="flex flex-col space-y-2">
          <Label htmlFor="ocrEngine" className="flex items-center space-x-2">
            <span>OCR engine</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>
                    OCR (Optical Character Recognition) engine for extracting text from images.
                    Platform-optimized engine is automatically selected.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <Select
            value={settings.ocrEngine}
            onValueChange={handleOcrModelChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select OCR engine" />
            </SelectTrigger>
            <SelectContent>
              {isMacOS && <SelectItem value="apple-native">Apple Native</SelectItem>}
              {!isMacOS && platform() === "windows" && <SelectItem value="windows-native">Windows Native</SelectItem>}
              {!isMacOS && platform() !== "windows" && <SelectItem value="tesseract">Tesseract</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        {/* Video Settings Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="disableVision">Disable screen recording</Label>
              <p className="text-sm text-muted-foreground">
                Turn off screen recording completely
              </p>
            </div>
            <Switch
              id="disableVision"
              checked={settings.disableVision}
              onCheckedChange={(checked) =>
                handleSettingsChange({ disableVision: checked }, true)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="useAllMonitors">Use all monitors</Label>
              <p className="text-sm text-muted-foreground">
                Automatically record from all available monitors
              </p>
            </div>
            <Switch
              id="useAllMonitors"
              checked={settings.useAllMonitors}
              onCheckedChange={(checked) =>
                handleSettingsChange({ useAllMonitors: checked }, true)
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="usePiiRemoval">PII removal (recommended)</Label>
              <p className="text-sm text-muted-foreground">
                Redact sensitive data from OCR and audio: emails, phones, SSNs, credit cards, IP addresses, API keys
              </p>
            </div>
            <Switch
              id="usePiiRemoval"
              checked={settings.usePiiRemoval}
              onCheckedChange={(checked) =>
                handleSettingsChange({ usePiiRemoval: checked }, true)
              }
            />
          </div>
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="flex items-center justify-between pt-6 border-t">
        <div className="text-sm text-muted-foreground">
          {/* spacer */}
        </div>
      </div>
    </div>
  );
}
