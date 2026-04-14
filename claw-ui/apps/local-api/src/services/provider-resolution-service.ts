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

    // Phase 9C: Validate and normalize provider with custom provider support
    const provider = this.validateProvider(llmSettings.provider, llmSettings.customProvider);
    
    // Phase 9C: Normalize provider settings - preset / custom の混同を防ぐ
    const normalized = this.normalizeProviderSettings(provider, llmSettings.customProvider);
    const normalizedProvider = normalized.provider;
    const normalizedCustomProvider = normalized.customProvider;
    
    // Phase 9C: Determine modelId with custom provider support
    const modelId = this.validateModelId(llmSettings.modelId, normalizedCustomProvider);
    
    // Determine execution mode
    const executionMode = this.determineExecutionMode(llmSettings.executionMode);
    
    // Determine tool mode
    const toolMode = this.determineToolMode(normalizedProvider, llmSettings.toolMode);
    
    // Phase 9C: Determine base URL with custom provider support
    const baseUrl = this.determineBaseUrl(normalizedProvider, llmSettings.baseUrl, normalizedCustomProvider);
    
    // Phase 9C: Get API key with custom provider support
    const apiKey = this.getApiKeyForProvider(normalizedProvider, llmSettings.apiKeys, normalizedCustomProvider);

    return {
      executionMode,
      provider: normalizedProvider,
      modelId,
      baseUrl,
      apiKey,
      toolMode,
      resolvedProviderType: normalizedProvider,
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
      Object.keys(updates.llmSettings!).forEach(key => {
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
   * Phase 9C: provider=custom のときだけ customProvider を使う
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
      // custom プロバイダーは customProvider の有無に関わらず 'custom' として返す
      // 実際の検証は別のメソッドで行う
      return 'custom' as CloudProvider;
    }
    
    // Fallback to default for unknown providers
    return DEFAULT_PROVIDER;
  }

  /**
   * Phase 9C: Normalize provider settings - preset / custom の混同を防ぐ
   * - provider=custom のときだけ customProvider を使う
   * - preset provider と custom provider を混同しない
   */
  private normalizeProviderSettings(provider: CloudProvider, customProvider?: CustomProvider): { provider: CloudProvider; customProvider?: CustomProvider } {
    // Phase 9C 絶対ルール: provider=custom のときだけ customProvider を使う
    if (provider === 'custom') {
      // custom プロバイダーが設定されている場合はそのまま返す
      return { provider, customProvider };
    } else {
      // preset provider の場合は customProvider を無視する
      return { provider, customProvider: undefined };
    }
  }

  /**
   * Validate model ID with custom provider support
   * Phase 9C: custom provider がある場合はその modelId を優先
   */
  private validateModelId(modelId?: string, customProvider?: CustomProvider): string {
    // Phase 9C: custom provider がある場合はその modelId を優先
    if (customProvider && customProvider.modelId && customProvider.modelId.trim() !== '') {
      return customProvider.modelId.trim();
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
   * Phase 9C: custom provider がある場合はその baseUrl を優先
   */
  private determineBaseUrl(provider: CloudProvider, customBaseUrl?: string, customProvider?: CustomProvider): string | undefined {
    // Phase 9C: custom provider がある場合はその baseUrl を優先
    if (customProvider && customProvider.baseUrl && customProvider.baseUrl.trim() !== '') {
      return customProvider.baseUrl.trim();
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
      default:
        return undefined;
    }
  }

  /**
   * Get API key for the specified provider with custom provider support
   * Phase 9C: custom provider がある場合はその apiKey を優先
   */
  private getApiKeyForProvider(provider: CloudProvider, apiKeys?: LlmSettings['apiKeys'], customProvider?: CustomProvider): string | undefined {
    // Phase 9C: custom provider がある場合はその apiKey を優先
    if (customProvider && customProvider.apiKey && customProvider.apiKey.trim() !== '') {
      return customProvider.apiKey.trim();
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
      default:
        return undefined;
    }
  }

  /**
   * Phase 9C: Validate custom provider configuration
   * - providerId, baseUrl, modelId は必須
   * - displayName, apiKey は optional
   */
  private validateCustomProvider(customProvider?: CustomProvider): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!customProvider) {
      return { isValid: true, errors: [] }; // customProvider がなければバリデーション不要
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