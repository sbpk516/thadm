"use client";

import React, { useState, useCallback } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Check,
  ChevronsUpDown,
  Eye,
  HelpCircle,
  Languages,
  Mic,
  EyeOff,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { Language } from "@/lib/language";
import { useSettings, VadSensitivity } from "@/lib/hooks/use-settings";
import { useToast } from "@/components/ui/use-toast";
import { ValidatedInput } from "@/components/ui/validated-input";
import { FieldValidationResult } from "@/lib/utils/validation";
import { useRecordingSettings, RecordingSettingsBanner } from "./recording-settings-provider";
import { useLoginDialog } from "../login-dialog";

export function AudioSettings() {
  const {
    settings,
    validationErrors,
    availableAudioDevices,
    handleSettingsChange,
  } = useRecordingSettings();
  const { toast } = useToast();
  const { checkLogin } = useLoginDialog();

  const [openAudioDevices, setOpenAudioDevices] = useState(false);
  const [openLanguages, setOpenLanguages] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isRefreshingSubscription, setIsRefreshingSubscription] = useState(false);
  const { loadUser } = useSettings();

  const handleAudioTranscriptionModelChange = (value: string) => {
    const isLoggedIn = checkLogin(settings.user);
    if (value === "screenpipe-cloud" && !isLoggedIn) return;
    if (value === "screenpipe-cloud" && !settings.user?.cloud_subscribed) {
      const clientRefId = `${settings.user?.id}&customer_email=${encodeURIComponent(settings.user?.email ?? "")}`;
      openUrl(`https://buy.stripe.com/7sIdRzbym4RA98c7sX?client_reference_id=${clientRefId}`);
      return;
    }
    handleSettingsChange({ audioTranscriptionEngine: value }, true);
  };

  const handleAudioChunkDurationChange = useCallback((value: number[]) => {
    const duration = Math.max(5, Math.min(3600, value[0]));
    handleSettingsChange({ audioChunkDuration: duration }, true);
  }, [handleSettingsChange]);

  const handleDeepgramApiKeyChange = useCallback((value: string, isValid: boolean) => {
    handleSettingsChange({ deepgramApiKey: value }, true);
  }, [handleSettingsChange]);

  const validateDeepgramApiKey = useCallback((apiKey: string): FieldValidationResult => {
    if (!apiKey.trim()) return { isValid: false, error: "API key is required" };
    if (apiKey.length < 10) return { isValid: false, error: "API key seems too short" };
    return { isValid: true };
  }, []);

  const handleLanguageChange = (currentValue: Language) => {
    const updatedLanguages = settings.languages.includes(currentValue)
      ? settings.languages.filter((id) => id !== currentValue)
      : [...settings.languages, currentValue];
    handleSettingsChange({ languages: updatedLanguages });
  };

  const handleAudioDeviceChange = (currentValue: string) => {
    const updatedDevices = settings.audioDevices.includes(currentValue)
      ? settings.audioDevices.filter((device) => device !== currentValue)
      : [...settings.audioDevices, currentValue];
    handleSettingsChange({ audioDevices: updatedDevices }, true);
  };

  const handleVadSensitivityChange = (value: number[]) => {
    const sensitivityMap: { [key: number]: VadSensitivity } = {
      2: "high",
      1: "medium",
      0: "low",
    };
    handleSettingsChange({ vadSensitivity: sensitivityMap[value[0]] }, true);
  };

  const vadSensitivityToNumber = (sensitivity: VadSensitivity): number => {
    const sensitivityMap: { [key in VadSensitivity]: number } = {
      high: 2,
      medium: 1,
      low: 0,
    };
    return sensitivityMap[sensitivity];
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Audio Settings
        </h1>
        <p className="text-muted-foreground text-lg">
          Configure audio recording and transcription
        </p>
      </div>

      <RecordingSettingsBanner />

      {/* Audio Transcription Engine */}
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <Mic className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Audio Transcription</h3>
        </div>
        <div className="space-y-4">
          {/* Cloud Subscription Status */}
          {settings.user && (
            <div className="flex items-center justify-between p-3 rounded-lg border bg-secondary/20 border-secondary/50">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  settings.user.cloud_subscribed ? "bg-foreground" : "bg-muted-foreground"
                )} />
                <span className="text-sm text-muted-foreground">
                  thadm Cloud: {settings.user.cloud_subscribed ? "Subscribed" : "Not subscribed"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={isRefreshingSubscription}
                  onClick={async () => {
                    if (!settings.user?.token) return;
                    setIsRefreshingSubscription(true);
                    try {
                      await loadUser(settings.user.token, true);
                      toast({
                        title: "Subscription status refreshed",
                        description: settings.user.cloud_subscribed
                          ? "Your subscription is active"
                          : "Subscription status updated",
                      });
                    } catch (error) {
                      toast({
                        title: "Failed to refresh",
                        description: "Please try again",
                        variant: "destructive",
                      });
                    } finally {
                      setIsRefreshingSubscription(false);
                    }
                  }}
                >
                  <RefreshCw className={cn("h-3 w-3", isRefreshingSubscription && "animate-spin")} />
                </Button>
              </div>
              {!settings.user.cloud_subscribed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const clientRefId = `${settings.user?.id}&customer_email=${encodeURIComponent(settings.user?.email ?? "")}`;
                    openUrl(`https://buy.stripe.com/7sIdRzbym4RA98c7sX?client_reference_id=${clientRefId}`);
                  }}
                >
                  Subscribe
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-col space-y-2">
            <Label htmlFor="audioTranscriptionEngine" className="flex items-center space-x-2">
              <span>Audio transcription engine</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4 cursor-default" />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>
                      Choose the transcription engine. Deepgram provides higher quality but requires an API key or thadm cloud.
                      Whisper runs locally but may be slower.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Select
              value={settings.audioTranscriptionEngine}
              onValueChange={handleAudioTranscriptionModelChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select transcription engine" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="screenpipe-cloud" disabled={!settings.user?.cloud_subscribed}>
                  thadm Cloud {!settings.user?.cloud_subscribed && "(requires subscription)"}
                </SelectItem>
                <SelectItem value="whisper-tiny">Whisper Tiny</SelectItem>
                <SelectItem value="whisper-tiny-quantized">Whisper Tiny Quantized</SelectItem>
                <SelectItem value="whisper-large">Whisper Large V3</SelectItem>
                <SelectItem value="whisper-large-quantized">Whisper Large V3 Quantized</SelectItem>
                <SelectItem value="whisper-large-v3-turbo">Whisper Large V3 Turbo</SelectItem>
                <SelectItem value="whisper-large-v3-turbo-quantized">Whisper Large V3 Turbo Quantized</SelectItem>
                <SelectItem value="deepgram">Deepgram</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Deepgram API Key */}
          {settings.audioTranscriptionEngine === "deepgram" && (
            <div className="relative">
              <ValidatedInput
                id="deepgramApiKey"
                label="Deepgram API Key"
                type={showApiKey ? "text" : "password"}
                value={settings.deepgramApiKey || ""}
                onChange={handleDeepgramApiKeyChange}
                validation={validateDeepgramApiKey}
                placeholder="Enter your Deepgram API key"
                required={true}
                helperText="Get an API key from deepgram.com or use thadm Cloud"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-7 h-8 w-8"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Audio Devices */}
      <div className="flex flex-col space-y-2">
        <Label htmlFor="audioDevices" className="flex items-center space-x-2">
          <span>Audio devices</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  Select which audio devices to record from. You can select multiple devices.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <Popover open={openAudioDevices} onOpenChange={setOpenAudioDevices}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openAudioDevices}
              className="w-full justify-between"
            >
              {settings.audioDevices.length > 0
                ? `${settings.audioDevices.length} device(s) selected`
                : "Select audio devices..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder="Search audio devices..." />
              <CommandList>
                <CommandEmpty>No audio devices found.</CommandEmpty>
                <CommandGroup>
                  {availableAudioDevices.map((device) => (
                    <CommandItem
                      key={device.name}
                      value={device.name}
                      onSelect={() => handleAudioDeviceChange(device.name)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          settings.audioDevices.includes(device.name)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      {device.name}
                      {device.is_default && (
                        <Badge variant="secondary" className="ml-2">
                          Default
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Languages */}
      <div className="flex flex-col space-y-2">
        <Label htmlFor="languages" className="flex items-center space-x-2">
          <Languages className="h-4 w-4" />
          <span>Languages</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  Select languages for audio transcription. Multiple languages can be selected.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <Popover open={openLanguages} onOpenChange={setOpenLanguages}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openLanguages}
              className="w-full justify-between"
            >
              {settings.languages.length > 0
                ? `${settings.languages.length} language(s) selected`
                : "Select languages..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder="Search languages..." />
              <CommandList>
                <CommandEmpty>No languages found.</CommandEmpty>
                <CommandGroup>
                  {[
                    { code: "english", name: "English" },
                    { code: "spanish", name: "Spanish" },
                    { code: "french", name: "French" },
                    { code: "german", name: "German" },
                    { code: "italian", name: "Italian" },
                    { code: "portuguese", name: "Portuguese" },
                    { code: "russian", name: "Russian" },
                    { code: "japanese", name: "Japanese" },
                    { code: "korean", name: "Korean" },
                    { code: "chinese", name: "Chinese" },
                    { code: "arabic", name: "Arabic" },
                    { code: "hindi", name: "Hindi" },
                    { code: "dutch", name: "Dutch" },
                    { code: "swedish", name: "Swedish" },
                    { code: "indonesian", name: "Indonesian" },
                    { code: "finnish", name: "Finnish" },
                    { code: "hebrew", name: "Hebrew" },
                    { code: "ukrainian", name: "Ukrainian" },
                    { code: "greek", name: "Greek" },
                    { code: "malay", name: "Malay" },
                    { code: "czech", name: "Czech" },
                    { code: "romanian", name: "Romanian" },
                    { code: "danish", name: "Danish" },
                    { code: "hungarian", name: "Hungarian" },
                    { code: "norwegian", name: "Norwegian" },
                    { code: "thai", name: "Thai" },
                    { code: "urdu", name: "Urdu" },
                    { code: "croatian", name: "Croatian" },
                    { code: "bulgarian", name: "Bulgarian" },
                    { code: "lithuanian", name: "Lithuanian" },
                    { code: "latin", name: "Latin" },
                    { code: "welsh", name: "Welsh" },
                    { code: "slovak", name: "Slovak" },
                    { code: "persian", name: "Persian" },
                    { code: "latvian", name: "Latvian" },
                    { code: "bengali", name: "Bengali" },
                    { code: "serbian", name: "Serbian" },
                    { code: "azerbaijani", name: "Azerbaijani" },
                    { code: "slovenian", name: "Slovenian" },
                    { code: "estonian", name: "Estonian" },
                    { code: "macedonian", name: "Macedonian" },
                    { code: "nepali", name: "Nepali" },
                    { code: "mongolian", name: "Mongolian" },
                    { code: "bosnian", name: "Bosnian" },
                    { code: "kazakh", name: "Kazakh" },
                    { code: "albanian", name: "Albanian" },
                    { code: "swahili", name: "Swahili" },
                    { code: "galician", name: "Galician" },
                    { code: "marathi", name: "Marathi" },
                    { code: "punjabi", name: "Punjabi" },
                    { code: "sinhala", name: "Sinhala" },
                    { code: "khmer", name: "Khmer" },
                    { code: "afrikaans", name: "Afrikaans" },
                    { code: "belarusian", name: "Belarusian" },
                    { code: "gujarati", name: "Gujarati" },
                    { code: "amharic", name: "Amharic" },
                    { code: "yiddish", name: "Yiddish" },
                    { code: "lao", name: "Lao" },
                    { code: "uzbek", name: "Uzbek" },
                    { code: "faroese", name: "Faroese" },
                    { code: "pashto", name: "Pashto" },
                    { code: "maltese", name: "Maltese" },
                    { code: "sanskrit", name: "Sanskrit" },
                    { code: "luxembourgish", name: "Luxembourgish" },
                    { code: "myanmar", name: "Myanmar" },
                    { code: "tibetan", name: "Tibetan" },
                    { code: "tagalog", name: "Tagalog" },
                    { code: "assamese", name: "Assamese" },
                    { code: "tatar", name: "Tatar" },
                    { code: "hausa", name: "Hausa" },
                    { code: "javanese", name: "Javanese" },
                    { code: "turkish", name: "Turkish" },
                    { code: "polish", name: "Polish" },
                    { code: "catalan", name: "Catalan" },
                    { code: "malayalam", name: "Malayalam" },
                  ].map((language) => (
                    <CommandItem
                      key={language.code}
                      value={language.code}
                      onSelect={() => handleLanguageChange(language.code as Language)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          settings.languages.includes(language.code as Language)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      {language.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Audio Chunk Duration */}
      <div className="flex flex-col space-y-2">
        <Label
          htmlFor="audioChunkDuration"
          className="flex items-center space-x-2"
        >
          <span>Audio chunk duration (seconds)</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  Adjust the duration of each audio chunk. Shorter durations may lower
                  resource usage spikes, while longer durations may increase transcription
                  quality. Deepgram generally works better than Whisper for higher quality transcription.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {validationErrors.audioChunkDuration && (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
        </Label>
        <div className="flex items-center space-x-4">
          <Slider
            id="audioChunkDuration"
            min={5}
            max={3000}
            step={1}
            value={[settings.audioChunkDuration]}
            onValueChange={handleAudioChunkDurationChange}
            className="flex-grow"
          />
          <span className="w-12 text-right">
            {settings.audioChunkDuration} s
          </span>
        </div>
        {validationErrors.audioChunkDuration && (
          <p className="text-sm text-destructive">{validationErrors.audioChunkDuration}</p>
        )}
      </div>

      <Separator />

      {/* Disable Audio Toggle */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="disableAudio">Disable audio recording</Label>
            <p className="text-sm text-muted-foreground">
              Turn off audio recording completely
            </p>
          </div>
          <Switch
            id="disableAudio"
            checked={settings.disableAudio}
            onCheckedChange={(checked) =>
              handleSettingsChange({ disableAudio: checked }, true)
            }
          />
        </div>
      </div>

      {/* VAD Sensitivity */}
      <div className="flex flex-col space-y-2">
        <Label htmlFor="vadSensitivity" className="flex items-center space-x-2">
          <span>Voice activity detection sensitivity</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-4 w-4 cursor-default" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>
                  Adjust how sensitive the voice activity detection is. Higher sensitivity
                  may capture more audio but also more background noise.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <div className="flex items-center space-x-4">
          <Slider
            id="vadSensitivity"
            min={0}
            max={2}
            step={1}
            value={[vadSensitivityToNumber(settings.vadSensitivity as VadSensitivity)]}
            onValueChange={handleVadSensitivityChange}
            className="flex-grow"
          />
          <span className="w-16 text-right capitalize">
            {settings.vadSensitivity}
          </span>
        </div>
      </div>

      {/* Bottom Apply Changes */}
      <div className="flex items-center justify-between pt-6 border-t">
        <div className="text-sm text-muted-foreground">
          {/* spacer */}
        </div>
      </div>
    </div>
  );
}
