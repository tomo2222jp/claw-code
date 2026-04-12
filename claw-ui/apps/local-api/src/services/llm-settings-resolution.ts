import type { AppSettings, LlmSettings, LlmToolMode } from "../../../../shared/contracts/index.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const GOOGLE_OPENAI_COMPAT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const OPENAI_BASE_URL = "https://api.openai.com/v1";

type ResolvedExecutionSettings = Pick<LlmSettings, "provider" | "modelId" | "toolMode" | "executionMode"> & {
  openaiBaseUrl?: string;
};

/**
 * Resolve execution-facing provider/model/toolMode while preserving backward compatibility.
 * Priority:
 * 1) valid llmSettings provider/model/toolMode
 * 2) inferred defaults based on provider
 * 3) existing activeProvider/activeModel
 */
export function resolveExecutionSettings(settings: AppSettings): AppSettings {
  const next = resolveFromLlmSettings(settings.llmSettings);
  if (!next) {
    return settings;
  }

  const resolvedOpenaiBaseUrl = resolveOpenaiBaseUrlForProvider(
    next.provider,
    settings.openaiBaseUrl,
  );

  return {
    ...settings,
    activeProvider: next.provider,
    activeModel: next.modelId,
    ...(resolvedOpenaiBaseUrl ? { openaiBaseUrl: resolvedOpenaiBaseUrl } : {}),
    llmSettings: {
      ...settings.llmSettings,
      executionMode: next.executionMode,
      provider: next.provider,
      modelId: next.modelId,
      toolMode: next.toolMode,
    },
  };
}

const KNOWN_CLOUD_PROVIDERS = new Set(["google", "openrouter", "openai", "anthropic"]);

function isLocalProvider(provider: string): boolean {
  return provider === "ollama" || provider.startsWith("ollama");
}

function resolveToolMode(provider: string, explicit?: LlmToolMode): LlmToolMode {
  if (explicit === "enabled" || explicit === "disabled") {
    return explicit;
  }
  // Default: disabled for openrouter (free models don't support tools well), enabled for others
  return provider === "openrouter" ? "disabled" : "enabled";
}

function resolveFromLlmSettings(
  llmSettings: AppSettings["llmSettings"],
): ResolvedExecutionSettings | undefined {
  if (!llmSettings) {
    return undefined;
  }

  const provider =
    typeof llmSettings.provider === "string" ? llmSettings.provider.trim().toLowerCase() : "";
  const modelId = typeof llmSettings.modelId === "string" ? llmSettings.modelId.trim() : "";
  if (!provider || !modelId) {
    return undefined;
  }

  // Infer executionMode from provider if missing
  let executionMode = llmSettings.executionMode;
  if (executionMode !== "cloud" && executionMode !== "local") {
    // Default based on provider: local for Ollama, cloud for known providers
    executionMode = isLocalProvider(provider) ? "local" : "cloud";
  }

  const toolMode = resolveToolMode(provider, llmSettings.toolMode);

  return {
    provider,
    modelId,
    toolMode,
    executionMode,
  };
}

function resolveOpenaiBaseUrlForProvider(
  provider: string,
  currentBaseUrl: string,
): string | undefined {
  // Provider path is explicit and never inferred from modelId.
  if (provider === "google") {
    return GOOGLE_OPENAI_COMPAT_BASE_URL;
  }
  if (provider === "openrouter") {
    return OPENROUTER_BASE_URL;
  }
  if (provider === "openai") {
    return OPENAI_BASE_URL;
  }
  if (provider === "anthropic") {
    // Anthropic is not normalized to an OpenAI-compatible endpoint in this slice.
    return currentBaseUrl;
  }
  // Unknown providers stay permissive in this slice to preserve compatibility.
  return currentBaseUrl;
}
