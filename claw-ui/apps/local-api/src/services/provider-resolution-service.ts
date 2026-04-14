import type { AppSettings, CloudProvider, CustomProvider, ExecutionMode, LlmSettings, LlmToolMode, ResolvedSettings } from "../../../../shared/contracts/index.js";

const DEFAULT_MODEL_ID = "gemini-2.5-flash";
const DEFAULT_PROVIDER: CloudProvider = "google";
const DEFAULT_EXECUTION_MODE: ExecutionMode = "cloud";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const GOOGLE_OPENAI_COMPAT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const OPENAI_BASE_URL = "https://api.openai.com/v1";

// Cloud provider taxonomy - fixed per spec
// Phase 9C: custom provider is now officially supported with full shape
const KNOWN_CLOUD_PROVIDERS: CloudProvider[] = ["google", "openrouter", "openai", "anthropic", "custom"];

/**
 * Provider resolution service that centralizes all provider/settings resolution logic
 * following Phase 9B requirements and Phase 9C custom provider support.
 */
export class ProviderResolutionService {
  /**
   * Resolve complete settings from llmSettings with standard fallback
   */
  resolveSettings(llmSettings?: LlmSettings): ResolvedSettings {
    if (!llmSettings) {
      return this.createFallbackSettings();
    }

    // Phase 9C: Validate and normalize provider with custom provider support
    const provider = this.validateProvider(llmSettings.provider, llmSettings.customProvider);
    
    // Phase 9C: Normalize provider settings - prevent preset/custom confusion
    const normalized = this.normalizeProviderSettings(provider, llmSettings.customProvider);
    const resolvedProvider = normalized.provider;
    const effectiveCustomProvider = normalized.customProvider; // Only valid for custom provider
    
    // Phase 9C: Determine modelId with custom provider support
    const modelId = this.validateModelId(llmSettings.modelId, effectiveCustomProvider);
    
    // Determine execution mode
    const executionMode = this.determineExecutionMode(llmSettings.executionMode);
    
    // Determine tool mode
    const toolMode = this.determineToolMode(resolvedProvider, llmSettings.toolMode);
    
    // Phase 9C: Determine base URL with custom provider support
    const baseUrl = this.determineBaseUrl(resolvedProvider, llmSettings.baseUrl, effectiveCustomProvider);
    
    // Phase 9C: Get API key with custom provider support
    const apiKey = this.getApiKeyForProvider(resolvedProvider, llmSettings.apiKeys, effectiveCustomProvider);

    return {
      executionMode,
      provider: resolvedProvider,
      modelId,
      baseUrl,
      apiKey,
      toolMode,
      resolvedProviderType: resolvedProvider,
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
        Object.keys(updates.llmSettings.apiKeys!).forEach(key => {
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
   * Validate and normalize provider with custom provider support
   * Phase 9C: provider=custom only when customProvider is present
   */
  private validateProvider(provider?: string, customProvider?: CustomProvider): CloudProvider {
    if (!provider || typeof provider !== 'string') {
      return DEFAULT_PROVIDER;
    }

    const normalized = provider.trim().toLowerCase();
    
    // Check if it's a known cloud provider
    if (KNOWN_CLOUD_PROVIDERS.includes(normalized as CloudProvider)) {
      return normalized as CloudProvider;
    }
    
    // Phase 9C: custom provider validation
    if (normalized === 'custom') {
      // Custom provider is returned as 'custom' regardless of customProvider presence
      // Actual validation is done in separate methods
      return 'custom' as CloudProvider;
    }
    
    // Fallback to default for unknown providers
    return DEFAULT_PROVIDER;
  }

  /**
   * Phase 9C: Normalize provider settings - prevent preset/custom confusion
   * - Only use customProvider when provider=custom
   * - Do not mix preset provider with custom provider
   */
  private normalizeProviderSettings(provider: CloudProvider, customProvider?: CustomProvider): { provider: CloudProvider; customProvider?: CustomProvider } {
    // Phase 9C absolute rule: Only use customProvider when provider=custom
    if (provider === 'custom') {
      // Return custom provider if configured
      return { provider, customProvider };
    } else {
      // For preset providers, ignore customProvider
      return { provider, customProvider: undefined };
    }
  }

  /**
   * Validate model ID with custom provider support
   * Phase 9C: Use effectiveCustomProvider modelId when available (only valid for custom provider)
   */
  private validateModelId(modelId?: string, effectiveCustomProvider?: CustomProvider): string {
    // Phase 9C: Use effectiveCustomProvider modelId when available (only valid for custom provider)
    if (effectiveCustomProvider && effectiveCustomProvider.modelId && effectiveCustomProvider.modelId.trim() !== '') {
      return effectiveCustomProvider.modelId.trim();
    }
    
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
   * Determine base URL based on provider with custom provider support
   * Phase 9C: Use effectiveCustomProvider baseUrl when available (only valid for custom provider)
   */
  private determineBaseUrl(provider: CloudProvider, customBaseUrl?: string, effectiveCustomProvider?: CustomProvider): string | undefined {
    // Phase 9C: Use effectiveCustomProvider baseUrl when available (only valid for custom provider)
    if (effectiveCustomProvider && effectiveCustomProvider.baseUrl && effectiveCustomProvider.baseUrl.trim() !== '') {
      return effectiveCustomProvider.baseUrl.trim();
    }
    
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
      case "anthropic":
        // Anthropic doesn't have a default base URL in the spec
        return undefined;
      case "custom":
        // Custom provider requires baseUrl in customProvider config
        return undefined;
      default:
        return undefined;
    }
  }

  /**
   * Get API key for the specified provider with custom provider support
   * Phase 9C: Use effectiveCustomProvider apiKey when available (only valid for custom provider)
   */
  private getApiKeyForProvider(provider: CloudProvider, apiKeys?: LlmSettings['apiKeys'], effectiveCustomProvider?: CustomProvider): string | undefined {
    // Phase 9C: Use effectiveCustomProvider apiKey when available (only valid for custom provider)
    if (effectiveCustomProvider && effectiveCustomProvider.apiKey && effectiveCustomProvider.apiKey.trim() !== '') {
      return effectiveCustomProvider.apiKey.trim();
    }
    
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
      case "custom":
        // For custom provider, apiKey should come from customProvider
        return undefined;
      default:
        return undefined;
    }
  }

  /**
   * Phase 9C: Validate custom provider configuration
   * - providerId, baseUrl, modelId are required
   * - displayName, apiKey are optional
   */
  private validateCustomProvider(customProvider?: CustomProvider): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!customProvider) {
      return { isValid: true, errors: [] }; // No customProvider means no validation needed
    }
    
    if (!customProvider.providerId || customProvider.providerId.trim() === '') {
      errors.push('providerId is required for custom provider');
    }
    
    if (!customProvider.baseUrl || customProvider.baseUrl.trim() === '') {
      errors.push('baseUrl is required for custom provider');
    } else {
      try {
        new URL(customProvider.baseUrl);
      } catch {
        errors.push('baseUrl must be a valid URL');
      }
    }
    
    if (!customProvider.modelId || customProvider.modelId.trim() === '') {
      errors.push('modelId is required for custom provider');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Phase 9C: Validate complete LLM settings with custom provider support
   */
  validateLlmSettings(llmSettings?: LlmSettings): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!llmSettings) {
      return { isValid: true, errors: [] };
    }
    
    // Validate provider
    if (llmSettings.provider && typeof llmSettings.provider !== 'string') {
      errors.push('provider must be a string');
    }
    
    // Validate modelId
    if (llmSettings.modelId && typeof llmSettings.modelId !== 'string') {
      errors.push('modelId must be a string');
    }
    
    // Validate custom provider
    if (llmSettings.provider === 'custom' && llmSettings.customProvider) {
      const customValidation = this.validateCustomProvider(llmSettings.customProvider);
      if (!customValidation.isValid) {
        errors.push(...customValidation.errors);
      }
    }
    
    // Validate executionMode
    if (llmSettings.executionMode && !['cloud', 'local'].includes(llmSettings.executionMode)) {
      errors.push('executionMode must be either "cloud" or "local"');
    }
    
    // Validate toolMode
    if (llmSettings.toolMode && !['enabled', 'disabled'].includes(llmSettings.toolMode)) {
      errors.push('toolMode must be either "enabled" or "disabled"');
    }
    
    // Validate baseUrl
    if (llmSettings.baseUrl && typeof llmSettings.baseUrl === 'string' && llmSettings.baseUrl.trim() !== '') {
      try {
        new URL(llmSettings.baseUrl);
      } catch {
        errors.push('baseUrl must be a valid URL');
      }
    }
    
    // Validate apiKeys structure if present
    if (llmSettings.apiKeys && typeof llmSettings.apiKeys !== 'object') {
      errors.push('apiKeys must be an object');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
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