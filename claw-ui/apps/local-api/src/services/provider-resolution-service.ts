import type { AppSettings, CloudProvider, ExecutionMode, LlmSettings, LlmToolMode, ResolvedSettings } from "../../../../shared/contracts/index.js";

const DEFAULT_MODEL_ID = "gemini-2.5-flash";
const DEFAULT_PROVIDER: CloudProvider = "google";
const DEFAULT_EXECUTION_MODE: ExecutionMode = "cloud";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const GOOGLE_OPENAI_COMPAT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const OPENAI_BASE_URL = "https://api.openai.com/v1";

// Cloud provider taxonomy - fixed per spec
// Note: 'custom' is reserved/transitional in Phase 9B
// Full nested customProvider shape will land in Phase 9C
// Current Phase 9B support is compatibility-only minimal placeholder
const KNOWN_CLOUD_PROVIDERS: CloudProvider[] = ["google", "openrouter", "openai", "anthropic"];

/**
 * Provider resolution service that centralizes all provider/settings resolution logic
 * following Phase 9B requirements.
 */
export class ProviderResolutionService {
  /**
   * Resolve complete settings from llmSettings with standard fallback
   */
  resolveSettings(llmSettings?: LlmSettings): ResolvedSettings {
    if (!llmSettings) {
      return this.createFallbackSettings();
    }

    // Validate and normalize provider
    const provider = this.validateProvider(llmSettings.provider);
    
    // Validate modelId
    const modelId = this.validateModelId(llmSettings.modelId);
    
    // Determine execution mode
    const executionMode = this.determineExecutionMode(llmSettings.executionMode);
    
    // Determine tool mode
    const toolMode = this.determineToolMode(provider, llmSettings.toolMode);
    
    // Determine base URL
    const baseUrl = this.determineBaseUrl(provider, llmSettings.baseUrl);
    
    // Get API key for provider
    const apiKey = this.getApiKeyForProvider(provider, llmSettings.apiKeys);

    return {
      executionMode,
      provider,
      modelId,
      baseUrl,
      apiKey,
      toolMode,
      resolvedProviderType: provider,
    };
  }

  /**
   * Merge settings with existing settings (shallow merge)
   */
  mergeSettings(existing: Partial<AppSettings>, updates: Partial<AppSettings>): Partial<AppSettings> {
    const merged = { ...existing };
    
    // Handle llmSettings merge
    if (updates.llmSettings !== undefined) {
      if (merged.llmSettings === undefined) {
        merged.llmSettings = {};
      }
      
      const mergedLlmSettings = { ...merged.llmSettings };
      
      // Shallow merge llmSettings fields (excluding apiKeys for now)
      Object.keys(updates.llmSettings).forEach(key => {
        if (key !== 'apiKeys') {
          const value = (updates.llmSettings as any)[key];
          if (value !== undefined) {
            (mergedLlmSettings as any)[key] = value;
          }
        }
      });
      
      // Handle apiKeys merge
      if (updates.llmSettings.apiKeys !== undefined) {
        if (mergedLlmSettings.apiKeys === undefined) {
          mergedLlmSettings.apiKeys = {};
        }
        
        const mergedApiKeys = { ...mergedLlmSettings.apiKeys };
        Object.keys(updates.llmSettings.apiKeys).forEach(key => {
          const value = (updates.llmSettings.apiKeys as any)[key];
          if (value !== undefined && value !== '') {
            (mergedApiKeys as any)[key] = value;
          }
        });
        
        mergedLlmSettings.apiKeys = mergedApiKeys;
      }
      
      merged.llmSettings = mergedLlmSettings;
    }
    
    // Merge other top-level fields
    Object.keys(updates).forEach(key => {
      if (key !== 'llmSettings') {
        const value = (updates as any)[key];
        if (value !== undefined) {
          (merged as any)[key] = value;
        }
      }
    });
    
    return merged;
  }

  /**
   * Validate and normalize provider
   */
  private validateProvider(provider?: string): CloudProvider {
    if (!provider || typeof provider !== 'string') {
      return DEFAULT_PROVIDER;
    }

    const normalized = provider.trim().toLowerCase();
    
    // Check if it's a known cloud provider
    if (KNOWN_CLOUD_PROVIDERS.includes(normalized as CloudProvider)) {
      return normalized as CloudProvider;
    }
    
    // For custom provider, return as-is but type it as custom
    // Note: Phase 9B only supports minimal placeholder for 'custom'
    // Full custom provider implementation will come in Phase 9C
    if (normalized === 'custom') {
      return 'custom' as CloudProvider;
    }
    
    // Fallback to default for unknown providers
    return DEFAULT_PROVIDER;
  }

  /**
   * Validate model ID
   */
  private validateModelId(modelId?: string): string {
    if (!modelId || typeof modelId !== 'string' || modelId.trim() === '') {
      return DEFAULT_MODEL_ID;
    }
    
    return modelId.trim();
  }

  /**
   * Determine execution mode
   */
  private determineExecutionMode(executionMode?: ExecutionMode): ExecutionMode {
    if (executionMode === 'cloud' || executionMode === 'local') {
      return executionMode;
    }
    
    return DEFAULT_EXECUTION_MODE;
  }

  /**
   * Determine tool mode based on provider
   */
  private determineToolMode(provider: CloudProvider, toolMode?: LlmToolMode): LlmToolMode {
    if (toolMode === 'enabled' || toolMode === 'disabled') {
      return toolMode;
    }
    
    // Default: disabled for openrouter (free models don't support tools well), enabled for others
    return provider === "openrouter" ? "disabled" : "enabled";
  }

  /**
   * Determine base URL based on provider
   */
  private determineBaseUrl(provider: CloudProvider, customBaseUrl?: string): string | undefined {
    // Use custom base URL if provided
    if (customBaseUrl && customBaseUrl.trim() !== '') {
      return customBaseUrl.trim();
    }
    
    // Provider-specific defaults
    switch (provider) {
      case "google":
        return GOOGLE_OPENAI_COMPAT_BASE_URL;
      case "openrouter":
        return OPENROUTER_BASE_URL;
      case "openai":
        return OPENAI_BASE_URL;
      default:
        return undefined;
    }
  }

  /**
   * Get API key for the specified provider
   */
  private getApiKeyForProvider(provider: CloudProvider, apiKeys?: LlmSettings['apiKeys']): string | undefined {
    if (!apiKeys) {
      return undefined;
    }
    
    switch (provider) {
      case "google":
        return apiKeys.google;
      case "openrouter":
        return apiKeys.openrouter;
      case "openai":
        return apiKeys.openai;
      case "anthropic":
        return apiKeys.anthropic;
      default:
        return undefined;
    }
  }

  /**
   * Create fallback settings
   */
  private createFallbackSettings(): ResolvedSettings {
    return {
      executionMode: DEFAULT_EXECUTION_MODE,
      provider: DEFAULT_PROVIDER,
      modelId: DEFAULT_MODEL_ID,
      baseUrl: GOOGLE_OPENAI_COMPAT_BASE_URL,
      apiKey: undefined,
      toolMode: "enabled",
      resolvedProviderType: DEFAULT_PROVIDER,
    };
  }
}