"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import {
  HelpCircle,
  AppWindowMac,
  Asterisk,
  AlertCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MultiSelect } from "@/components/ui/multi-select";
import { useSqlAutocomplete } from "@/lib/hooks/use-sql-autocomplete";
import { useRecordingSettings, RecordingSettingsBanner } from "./recording-settings-provider";

const createWindowOptions = (
  windowItems: { name: string }[],
  existingPatterns: string[]
) => {
  const windowOptions = windowItems
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      value: item.name,
      label: item.name,
      icon: AppWindowMac,
    }));

  const customOptions = existingPatterns
    .filter((pattern) => !windowItems.some((item) => item.name === pattern))
    .map((pattern) => ({
      value: pattern,
      label: pattern,
      icon: Asterisk,
    }));

  return [...windowOptions, ...customOptions];
};

export function PrivacySettings() {
  const {
    settings,
    handleSettingsChange,
  } = useRecordingSettings();

  const { items: windowItems } = useSqlAutocomplete("window");

  const handleIgnoredWindowsChange = (values: string[]) => {
    const lowerCaseValues = values.map((v) => v.toLowerCase());
    const currentLowerCase = settings.ignoredWindows.map((v) => v.toLowerCase());

    const addedValues = values.filter(
      (v) => !currentLowerCase.includes(v.toLowerCase())
    );
    const removedValues = settings.ignoredWindows.filter(
      (v) => !lowerCaseValues.includes(v.toLowerCase())
    );

    if (addedValues.length > 0) {
      const newValue = addedValues[0];
      handleSettingsChange(
        {
          ignoredWindows: [...settings.ignoredWindows, newValue],
          includedWindows: settings.includedWindows.filter(
            (w) => w.toLowerCase() !== newValue.toLowerCase()
          ),
        },
        true
      );
    } else if (removedValues.length > 0) {
      const removedValue = removedValues[0];
      handleSettingsChange(
        {
          ignoredWindows: settings.ignoredWindows.filter(
            (w) => w !== removedValue
          ),
        },
        true
      );
    }
  };

  const handleIncludedWindowsChange = (values: string[]) => {
    const lowerCaseValues = values.map((v) => v.toLowerCase());
    const currentLowerCase = settings.includedWindows.map((v) => v.toLowerCase());

    const addedValues = values.filter(
      (v) => !currentLowerCase.includes(v.toLowerCase())
    );
    const removedValues = settings.includedWindows.filter(
      (v) => !lowerCaseValues.includes(v.toLowerCase())
    );

    if (addedValues.length > 0) {
      const newValue = addedValues[0];
      handleSettingsChange(
        {
          includedWindows: [...settings.includedWindows, newValue],
          ignoredWindows: settings.ignoredWindows.filter(
            (w) => w.toLowerCase() !== newValue.toLowerCase()
          ),
        },
        true
      );
    } else if (removedValues.length > 0) {
      const removedValue = removedValues[0];
      handleSettingsChange(
        {
          includedWindows: settings.includedWindows.filter(
            (w) => w !== removedValue
          ),
        },
        true
      );
    }
  };

  const handleIgnoredUrlsChange = (values: string[]) => {
    const currentUrls = settings.ignoredUrls || [];
    const lowerCaseValues = values.map((v) => v.toLowerCase());
    const currentLowerCase = currentUrls.map((v) => v.toLowerCase());

    const addedValues = values.filter(
      (v) => !currentLowerCase.includes(v.toLowerCase())
    );
    const removedValues = currentUrls.filter(
      (v) => !lowerCaseValues.includes(v.toLowerCase())
    );

    if (addedValues.length > 0) {
      const newValue = addedValues[0];
      handleSettingsChange(
        { ignoredUrls: [...currentUrls, newValue] },
        true
      );
    } else if (removedValues.length > 0) {
      const removedValue = removedValues[0];
      handleSettingsChange(
        { ignoredUrls: currentUrls.filter((u) => u !== removedValue) },
        true
      );
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Privacy Settings
        </h1>
        <p className="text-muted-foreground text-lg">
          Control which windows and URLs are recorded
        </p>
      </div>

      <RecordingSettingsBanner />

      {/* Window Filtering */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <AppWindowMac className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Window Filtering</h3>
        </div>

        <div className="flex flex-col space-y-2">
          <Label htmlFor="ignoredWindows" className="flex items-center space-x-2">
            <span>Ignored windows</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>
                    Windows that will be excluded from recording. Useful for privacy or reducing noise.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <MultiSelect
            options={createWindowOptions(windowItems || [], settings.ignoredWindows)}
            defaultValue={settings.ignoredWindows}
            value={settings.ignoredWindows}
            onValueChange={handleIgnoredWindowsChange}
            placeholder="Select windows to ignore..."
          />
        </div>

        <div className="flex flex-col space-y-2">
          <Label htmlFor="includedWindows" className="flex items-center space-x-2">
            <span>Included windows (whitelist)</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>
                    Only these windows will be recorded. Leave empty to record all windows except ignored ones.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <MultiSelect
            options={createWindowOptions(windowItems || [], settings.includedWindows)}
            defaultValue={settings.includedWindows}
            value={settings.includedWindows}
            onValueChange={handleIncludedWindowsChange}
            placeholder="Select windows to include (optional)..."
          />
        </div>

        <div className="flex flex-col space-y-2">
          <Label htmlFor="ignoredUrls" className="flex items-center space-x-2">
            <span>Ignored URLs (privacy)</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="font-semibold mb-1">Block browser URLs from recording</p>
                  <p className="text-xs mb-2">
                    Use domain patterns like "wellsfargo.com" or "chase.com".
                    Works best with the active browser tab. For background tabs,
                    we also check window titles as a fallback.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tip: Use specific domains, not generic words like "bank" which may over-match.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <MultiSelect
            options={(settings.ignoredUrls || []).map((url) => ({
              label: url,
              value: url,
            }))}
            defaultValue={settings.ignoredUrls || []}
            value={settings.ignoredUrls || []}
            onValueChange={handleIgnoredUrlsChange}
            placeholder="Type domain patterns (e.g., wellsfargo.com, chase.com)..."
          />
          {(settings.ignoredUrls || []).some((url) =>
            url.length < 5 || ['bank', 'pay', 'money', 'finance'].includes(url.toLowerCase())
          ) && (
            <p className="text-xs text-yellow-600 dark:text-yellow-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Short or generic patterns may block unintended sites. Use specific domains.
            </p>
          )}
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
