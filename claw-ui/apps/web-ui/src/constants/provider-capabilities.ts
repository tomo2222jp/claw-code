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
    notes: "Best starting point for most users",
    summary: "Best default for most users",
    bestFor: "Balanced general use, tools, and multimodal workflows"
  },
  openrouter: {
    provider: "openrouter",
    label: "OpenRouter",
    supportsTools: false,
    supportsStreaming: true,
    supportsVision: false,
    supportsCustomEndpoint: false,
    stability: "supported",
    notes: "Aggregated access to multiple providers",
    summary: "Flexible access to many remote models",
    bestFor: "Trying multiple hosted models through one provider",
    caution: "Tool behavior may vary by model"
  },
  openai: {
    provider: "openai",
    label: "OpenAI",
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsCustomEndpoint: false,
    stability: "supported",
    notes: "Original GPT models and APIs",
    summary: "Strong compatibility with OpenAI-style workflows",
    bestFor: "Well-known hosted API workflows and broad ecosystem support"
  },
  anthropic: {
    provider: "anthropic",
    label: "Anthropic",
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    supportsCustomEndpoint: false,
    stability: "supported",
    notes: "Claude models with strong reasoning",
    summary: "Strong reasoning-oriented hosted option",
    bestFor: "Reasoning-heavy tasks and Claude-style workflows"
  },
  custom: {
    provider: "custom",
    label: "Custom Provider",
    supportsTools: "depends",
    supportsStreaming: "depends",
    supportsVision: "depends",
    supportsCustomEndpoint: true,
    stability: "experimental",
    notes: "Connect to any OpenAI-compatible endpoint",
    summary: "Connect your own OpenAI-compatible endpoint",
    bestFor: "Advanced users using custom or self-hosted endpoints",
    caution: "Capabilities depend entirely on the endpoint implementation"
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