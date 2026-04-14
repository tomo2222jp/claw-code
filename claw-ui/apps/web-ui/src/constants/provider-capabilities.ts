import type { ProviderCapability } from "../../../../shared/contracts/index.js";

export const PROVIDER_CAPABILITIES: Record<string, ProviderCapability> = {
  google: {
    provider: "google",
    label: "Google (Gemini)",
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsCustomEndpoint: false,
    stability: "recommended",
    notes: "Best starting point for most users"
  },
  openrouter: {
    provider: "openrouter",
    label: "OpenRouter",
    supportsTools: false,
    supportsStreaming: true,
    supportsVision: false,
    supportsCustomEndpoint: false,
    stability: "supported",
    notes: "Aggregated access to multiple providers"
  },
  openai: {
    provider: "openai",
    label: "OpenAI",
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsCustomEndpoint: false,
    stability: "supported",
    notes: "Original GPT models and APIs"
  },
  anthropic: {
    provider: "anthropic",
    label: "Anthropic",
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    supportsCustomEndpoint: false,
    stability: "supported",
    notes: "Claude models with strong reasoning"
  },
  custom: {
    provider: "custom",
    label: "Custom Provider",
    supportsTools: "depends",
    supportsStreaming: "depends",
    supportsVision: "depends",
    supportsCustomEndpoint: true,
    stability: "experimental",
    notes: "Connect to any OpenAI-compatible endpoint"
  }
};

export function getProviderCapability(provider: string): ProviderCapability | null {
  if (!provider || provider === "") {
    // Return default recommended capability
    return PROVIDER_CAPABILITIES.google;
  }
  
  const key = provider.toLowerCase();
  return PROVIDER_CAPABILITIES[key] || null;
}