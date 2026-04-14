import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AppSettings } from "../../../../shared/contracts/index.js";
import { ProviderResolutionService } from "./provider-resolution-service.js";

const DEFAULT_SETTINGS: AppSettings = {
  // Legacy fields for backward compatibility - aligned with llmSettings defaults
  activeProvider: "google",
  activeModel: "gemini-2.5-flash",
  retryCount: 2,
  // openaiBaseUrl remains for legacy UI/API compatibility
  // In practice, execution uses llmSettings.baseUrl or provider-specific defaults
  openaiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
  
  // Primary settings following spec Standard default
  llmSettings: {
    executionMode: "cloud",
    provider: "google",
    modelId: "gemini-2.5-flash",
    toolMode: "enabled",
  },
};

export class SettingsService {
  private providerResolutionService: ProviderResolutionService;

  constructor(private readonly filePath: string) {
    this.providerResolutionService = new ProviderResolutionService();
  }

  async getSettings(): Promise<AppSettings> {
    await this.ensureStorageDir();
    try {
      const raw = await readFile(this.filePath, "utf8");
      const savedSettings = JSON.parse(raw) as Partial<AppSettings>;
      
      // Merge with defaults, ensuring llmSettings is properly structured
      return this.mergeWithDefaults(savedSettings);
    } catch (error) {
      if (isMissingFileError(error)) {
        await this.saveSettings(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      }
      throw error;
    }
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    await this.ensureStorageDir();
    
    // Get existing settings to merge
    let existingSettings: Partial<AppSettings> = {};
    try {
      const raw = await readFile(this.filePath, "utf8");
      existingSettings = JSON.parse(raw) as Partial<AppSettings>;
    } catch (error) {
      // File doesn't exist or is invalid, start with empty
      existingSettings = {};
    }
    
    // Merge settings (don't replace, merge)
    const mergedSettings = this.providerResolutionService.mergeSettings(existingSettings, settings);
    
    // Ensure the merged settings have proper structure
    const finalSettings = this.mergeWithDefaults(mergedSettings);
    
    await writeFile(this.filePath, `${JSON.stringify(finalSettings, null, 2)}\n`, "utf8");
    return finalSettings;
  }

  /**
   * Get resolved settings for execution
   */
  getResolvedSettings(settings: AppSettings) {
    return this.providerResolutionService.resolveSettings(settings.llmSettings);
  }

  private mergeWithDefaults(settings: Partial<AppSettings>): AppSettings {
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    
    // Ensure llmSettings is properly structured
    if (settings.llmSettings) {
      merged.llmSettings = { ...DEFAULT_SETTINGS.llmSettings, ...settings.llmSettings };
    }
    
    return merged as AppSettings;
  }

  private async ensureStorageDir(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export function resolveSettingsFilePath(): string {
  return path.resolve(process.cwd(), "data", "settings.json");
}
