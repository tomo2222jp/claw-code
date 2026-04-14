import type { AppSettings } from "../../../../shared/contracts/index.js";
import { ProviderResolutionService } from "./provider-resolution-service.js";

const providerResolutionService = new ProviderResolutionService();

/**
 * Resolve execution-facing provider/model/toolMode while preserving backward compatibility.
 * Uses the new centralized provider resolution service.
 */
export function resolveExecutionSettings(settings: AppSettings): AppSettings {
  const resolved = providerResolutionService.resolveSettings(settings.llmSettings);
  
  // Update activeProvider and activeModel for backward compatibility
  const updatedSettings = {
    ...settings,
    activeProvider: resolved.provider,
    activeModel: resolved.modelId,
  };
  
  // Update llmSettings with resolved values
  if (!updatedSettings.llmSettings) {
    updatedSettings.llmSettings = {};
  }
  
  updatedSettings.llmSettings = {
    ...updatedSettings.llmSettings,
    executionMode: resolved.executionMode,
    provider: resolved.provider,
    modelId: resolved.modelId,
    toolMode: resolved.toolMode,
    baseUrl: resolved.baseUrl,
  };
  
  return updatedSettings;
}
