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
  RefreshCw,
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
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRecordingSettings, RecordingSettingsBanner } from "./recording-settings-provider";

export function ScreenSettings() {
  const {
    settings,
    validationErrors,
    availableMonitors,
    isMacOS,
    isWindows,
    deviceLoadError,
    handleSettingsChange,
    retryLoadDevices,
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
                    {settings.useAllMonitors
                      ? "Recording all detected monitors."
                      : "Select which monitors to record from. Multiple monitors can be selected."}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          {deviceLoadError && availableMonitors.length === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{deviceLoadError}</span>
                <Button
                  onClick={retryLoadDevices}
                  size="sm"
                  variant="outline"
                  className="ml-2 shrink-0"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {settings.useAllMonitors ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {availableMonitors.map((monitor) => (
                <div
                  key={monitor.id}
                  className="flex items-center space-x-3 rounded-lg border border-primary bg-primary/5 p-3"
                >
                  <div className="flex-1">
                    <p className="font-medium">
                      {monitor.name}
                      {isMacOS && (monitor.is_default ? " (Built-in)" : " (External)")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {monitor.width}x{monitor.height}
                    </p>
                  </div>
                  <Check className="h-4 w-4 opacity-100" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
                    const monitorId = monitor.id.toString();
                    const updatedIds = settings.monitorIds.includes(monitorId)
                      ? settings.monitorIds.filter(id => id !== monitorId)
                      : [...settings.monitorIds, monitorId];
                    handleSettingsChange({ monitorIds: updatedIds }, true);
                  }}
                >
                  <div className="flex-1">
                    <p className="font-medium">
                      {monitor.name}
                      {isMacOS && (monitor.is_default ? " (Built-in)" : " (External)")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {monitor.width}x{monitor.height}
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
          )}
        </div>

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
              {isWindows && <SelectItem value="windows-native">Windows Native</SelectItem>}
              {!isMacOS && !isWindows && <SelectItem value="tesseract">Tesseract</SelectItem>}
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
