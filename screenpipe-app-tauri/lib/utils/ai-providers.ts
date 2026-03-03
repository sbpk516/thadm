export type AIProvider = "openai" | "groq" | "ollama";

export interface AIProviderConfig {
  label: string;
  description: string;
  provider: "openai" | "native-ollama";
  url: string;
  model: string;
  needsApiKey: boolean;
  maxContextChars: number;
  badge?: string;
}

export const PROVIDER_CONFIG: Record<AIProvider, AIProviderConfig> = {
  openai: {
    label: "OpenAI",
    description: "GPT-4o-mini — reliable, fast",
    provider: "openai",
    url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    needsApiKey: true,
    maxContextChars: 128000,
  },
  groq: {
    label: "Groq",
    description: "Llama 4 Scout — free, very fast",
    provider: "openai",
    url: "https://api.groq.com/openai/v1",
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    needsApiKey: true,
    maxContextChars: 128000,
  },
  ollama: {
    label: "Ollama",
    description: "Local, private — requires Ollama running",
    provider: "native-ollama",
    url: "http://localhost:11434/v1",
    model: "llama3.2:3b",
    needsApiKey: false,
    maxContextChars: 128000,
    badge: "Experimental",
  },
};

/**
 * Removes the AI preset created for a connection and clears the connection key.
 * Shared by Notion and Obsidian disconnect flows.
 */
export async function cleanupConnectionPreset(
  currentSettings: Record<string, any>,
  connectionKey: "notionConnection" | "obsidianConnection",
  updateSettings: (patch: Record<string, any>) => Promise<void>
): Promise<void> {
  const stored = currentSettings[connectionKey] as
    | { aiPresetId?: string }
    | undefined;

  if (stored?.aiPresetId) {
    const cleanedPresets = ((currentSettings.aiPresets as any[]) || []).filter(
      (p: any) => p.id !== stored.aiPresetId
    );
    await updateSettings({ aiPresets: cleanedPresets, [connectionKey]: undefined });
  } else {
    await updateSettings({ [connectionKey]: undefined });
  }
}
