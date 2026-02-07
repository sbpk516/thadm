"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  Brain,
  Video,
  Keyboard,
  User,
  Settings as SettingsIcon,
  HardDrive,
  Plug,
  MessageSquare,
  Mic,
  Monitor,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AccountSection } from "@/components/settings/account-section";
import ShortcutSection from "@/components/settings/shortcut-section";
import { AIPresets } from "@/components/settings/ai-presets";
import { AudioSettings } from "@/components/settings/audio-settings";
import { ScreenSettings } from "@/components/settings/screen-settings";
import { PrivacySettings } from "@/components/settings/privacy-settings";
import { RecordingSettingsProvider } from "@/components/settings/recording-settings-provider";
import GeneralSettings from "@/components/settings/general-settings";
import { DiskUsageSection } from "@/components/settings/disk-usage-section";
import { ConnectionsSection } from "@/components/settings/connections-section";
import { FeedbackSection } from "@/components/settings/feedback-section";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { listen } from "@tauri-apps/api/event";

type SettingsSection =
  | "general"
  | "ai"
  | "shortcuts"
  | "audio"
  | "screen"
  | "privacy"
  | "account"
  | "disk-usage"
  | "connections"
  | "feedback";

const VALID_SECTIONS: SettingsSection[] = [
  "general", "ai", "shortcuts", "audio", "screen", "privacy",
  "account", "disk-usage", "connections", "feedback",
];

const settingsGroups = [
  {
    label: "Recording",
    sections: [
      {
        id: "audio" as const,
        label: "Audio",
        icon: <Mic className="h-4 w-4" />,
        description: "Audio devices, transcription, and VAD",
      },
      {
        id: "screen" as const,
        label: "Screen",
        icon: <Monitor className="h-4 w-4" />,
        description: "Monitors, FPS, OCR, and video settings",
      },
      {
        id: "privacy" as const,
        label: "Privacy",
        icon: <Shield className="h-4 w-4" />,
        description: "Ignored and included windows and URLs",
      },
    ],
  },
  {
    label: "App",
    sections: [
      {
        id: "general" as const,
        label: "General",
        icon: <SettingsIcon className="h-4 w-4" />,
        description: "Auto-start, theme, data directory, and system",
      },
      {
        id: "ai" as const,
        label: "AI Settings",
        icon: <Brain className="h-4 w-4" />,
        description: "AI models and processing options",
      },
      {
        id: "shortcuts" as const,
        label: "Shortcuts",
        icon: <Keyboard className="h-4 w-4" />,
        description: "Keyboard shortcuts and hotkeys",
      },
    ],
  },
  {
    label: "Account",
    sections: [
      {
        id: "account" as const,
        label: "Account",
        icon: <User className="h-4 w-4" />,
        description: "User account and authentication",
      },
      {
        id: "connections" as const,
        label: "Connections",
        icon: <Plug className="h-4 w-4" />,
        description: "Connect to AI assistants like Claude",
      },
    ],
  },
  {
    label: "System",
    sections: [
      {
        id: "disk-usage" as const,
        label: "Disk Usage",
        icon: <HardDrive className="h-4 w-4" />,
        description: "Monitor storage usage for thadm data",
      },
      {
        id: "feedback" as const,
        label: "Send Feedback",
        icon: <MessageSquare className="h-4 w-4" />,
        description: "Report issues or share suggestions",
      },
    ],
  },
];

function parseSection(value: string): SettingsSection {
  // Backward compat: map old "recording" to "audio"
  if (value === "recording") return "audio";
  if (VALID_SECTIONS.includes(value as SettingsSection)) {
    return value as SettingsSection;
  }
  return "general";
}

function SettingsPageContent() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useQueryState("section", {
    defaultValue: "general" as SettingsSection,
    parse: parseSection,
    serialize: (value) => value,
  });

  const { settings } = useSettings();

  const isRecordingSection = (section: string) =>
    section === "audio" || section === "screen" || section === "privacy";

  const renderSection = () => {
    if (isRecordingSection(activeSection)) {
      return (
        <RecordingSettingsProvider>
          {activeSection === "audio" && <AudioSettings />}
          {activeSection === "screen" && <ScreenSettings />}
          {activeSection === "privacy" && <PrivacySettings />}
        </RecordingSettingsProvider>
      );
    }

    switch (activeSection) {
      case "general":
        return <GeneralSettings />;
      case "ai":
        return <AIPresets />;
      case "account":
        return <AccountSection />;
      case "shortcuts":
        return <ShortcutSection />;
      case "disk-usage":
        return <DiskUsageSection />;
      case "connections":
        return <ConnectionsSection />;
      case "feedback":
        return <FeedbackSection />;
    }
  };

  // Listen for navigation events from other windows
  useEffect(() => {
    const unlisten = listen<{ url: string }>("navigate", (event) => {
      const url = new URL(event.payload.url, window.location.origin);
      const section = url.searchParams.get("section");
      if (section) {
        const parsed = parseSection(section);
        setActiveSection(parsed);
      }
    });

    return () => {
      unlisten.then((unlistenFn) => unlistenFn());
    };
  }, [setActiveSection]);

  return (
    <div className="min-h-screen bg-background">
      {/* Transparent titlebar area */}
      <div className="h-8 bg-transparent" data-tauri-drag-region></div>

      <div className="max-w-7xl mx-auto px-4">
        <div className="flex h-[calc(100vh-2rem)] min-h-0">
          {/* Sidebar */}
          <div className="w-80 border-r bg-background flex flex-col min-h-0 rounded-tl-lg">
            <div className="p-6 border-b">
              <div className="space-y-3">
                <h1 className="text-2xl font-bold text-foreground">Settings</h1>
              </div>
            </div>

            {/* Navigation */}
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              {settingsGroups.map((group) => (
                <div key={group.label}>
                  <div className="px-4 pb-1 pt-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {group.label}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {group.sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={cn(
                          "w-full flex items-start space-x-3 px-4 py-3 rounded-xl transition-all duration-200 text-left group",
                          activeSection === section.id
                            ? "bg-card shadow-sm border border-border text-foreground"
                            : "hover:bg-card/50 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <div className={cn(
                          "mt-0.5 transition-colors",
                          activeSection === section.id
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-foreground"
                        )}>
                          {section.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{section.label}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {section.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border flex-shrink-0">
              <div className="text-xs text-muted-foreground text-center">
                thadm settings
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col h-full bg-background min-h-0 rounded-tr-lg">
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
              <div className="p-8 pb-16 max-w-4xl mx-auto">
                {renderSection()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-muted-foreground">Loading settings...</div>
    </div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
