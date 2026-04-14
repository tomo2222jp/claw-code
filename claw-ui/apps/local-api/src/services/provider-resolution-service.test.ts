import { describe, it, expect } from "vitest";
import { ProviderResolutionService } from "./provider-resolution-service.js";
import type { AppSettings, LlmSettings } from "../../../../shared/contracts/index.js";

describe("ProviderResolutionService", () => {
  const service = new ProviderResolutionService();

  describe("resolveSettings", () => {
    it("should return fallback settings when llmSettings is empty", () => {
      const result = service.resolveSettings(undefined);
      
      expect(result).toEqual({
        executionMode: "cloud",
        provider: "google",
        modelId: "gemini-2.5-flash",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
        apiKey: undefined,
        toolMode: "enabled",
        resolvedProviderType: "google",
      });
    });

    it("should return google provider with default model", () => {
      const llmSettings: LlmSettings = {
        provider: "google",
        modelId: "gemini-2.5-flash",
      };
      
      const result = service.resolveSettings(llmSettings);
      
      expect(result.provider).toBe("google");
      expect(result.modelId).toBe("gemini-2.5-flash");
      expect(result.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai/");
      expect(result.toolMode).toBe("enabled");
    });

    it("should return openrouter provider with toolMode disabled by default", () => {
      const llmSettings: LlmSettings = {
        provider: "openrouter",
        modelId: "meta-llama/llama-3.3-70b-instruct:free",
      };
      
      const result = service.resolveSettings(llmSettings);
      
      expect(result.provider).toBe("openrouter");
      expect(result.modelId).toBe("meta-llama/llama-3.3-70b-instruct:free");
      expect(result.baseUrl).toBe("https://openrouter.ai/api/v1");
      expect(result.toolMode).toBe("disabled");
    });

    it("should handle custom baseUrl", () => {
      const llmSettings: LlmSettings = {
        provider: "openai",
        modelId: "gpt-4",
        baseUrl: "https://custom.openai.example.com/v1",
      };
      
      const result = service.resolveSettings(llmSettings);
      
      expect(result.provider).toBe("openai");
      expect(result.baseUrl).toBe("https://custom.openai.example.com/v1");
    });

    it("should handle apiKeys for different providers", () => {
      const llmSettings: LlmSettings = {
        provider: "openai",
        modelId: "gpt-4",
        apiKeys: {
          openai: "sk-test-openai-key",
          google: "sk-test-google-key",
        },
      };
      
      const result = service.resolveSettings(llmSettings);
      
      expect(result.provider).toBe("openai");
      expect(result.apiKey).toBe("sk-test-openai-key");
    });

    it("should fallback to google for unknown provider", () => {
      const llmSettings: LlmSettings = {
        provider: "unknown",
        modelId: "some-model",
      };
      
      const result = service.resolveSettings(llmSettings);
      
      expect(result.provider).toBe("google");
      expect(result.modelId).toBe("some-model");
    });

    it("should handle custom provider", () => {
      const llmSettings: LlmSettings = {
        provider: "custom",
        modelId: "custom-model",
      };
      
      const result = service.resolveSettings(llmSettings);
      
      expect(result.provider).toBe("custom");
      expect(result.modelId).toBe("custom-model");
    });

    it("should respect explicit toolMode setting", () => {
      const llmSettings: LlmSettings = {
        provider: "openrouter",
        modelId: "test-model",
        toolMode: "enabled",
      };
      
      const result = service.resolveSettings(llmSettings);
      
      expect(result.provider).toBe("openrouter");
      expect(result.toolMode).toBe("enabled");
    });

    it("should handle empty modelId by using default", () => {
      const llmSettings: LlmSettings = {
        provider: "google",
        modelId: "",
      };
      
      const result = service.resolveSettings(llmSettings);
      
      expect(result.provider).toBe("google");
      expect(result.modelId).toBe("gemini-2.5-flash");
    });
  });

  describe("mergeSettings", () => {
    it("should merge llmSettings fields", () => {
      const existing: Partial<AppSettings> = {
        llmSettings: {
          provider: "google",
          modelId: "gemini-2.5-flash",
        },
      };
      
      const updates: Partial<AppSettings> = {
        llmSettings: {
          modelId: "gemini-2.5-pro",
          toolMode: "disabled",
        },
      };
      
      const result = service.mergeSettings(existing, updates);
      
      expect(result.llmSettings?.provider).toBe("google");
      expect(result.llmSettings?.modelId).toBe("gemini-2.5-pro");
      expect(result.llmSettings?.toolMode).toBe("disabled");
    });

    it("should merge apiKeys without removing existing ones", () => {
      const existing: Partial<AppSettings> = {
        llmSettings: {
          apiKeys: {
            google: "existing-google-key",
            openai: "existing-openai-key",
          },
        },
      };
      
      const updates: Partial<AppSettings> = {
        llmSettings: {
          apiKeys: {
            openrouter: "new-openrouter-key",
          },
        },
      };
      
      const result = service.mergeSettings(existing, updates);
      
      expect(result.llmSettings?.apiKeys?.google).toBe("existing-google-key");
      expect(result.llmSettings?.apiKeys?.openai).toBe("existing-openai-key");
      expect(result.llmSettings?.apiKeys?.openrouter).toBe("new-openrouter-key");
    });

    it("should not overwrite apiKey with empty string", () => {
      const existing: Partial<AppSettings> = {
        llmSettings: {
          apiKeys: {
            google: "existing-google-key",
          },
        },
      };
      
      const updates: Partial<AppSettings> = {
        llmSettings: {
          apiKeys: {
            google: "",
          },
        },
      };
      
      const result = service.mergeSettings(existing, updates);
      
      expect(result.llmSettings?.apiKeys?.google).toBe("existing-google-key");
    });

    it("should handle undefined values in merge", () => {
      const existing: Partial<AppSettings> = {
        llmSettings: {
          provider: "google",
          modelId: "gemini-2.5-flash",
        },
      };
      
      const updates: Partial<AppSettings> = {
        llmSettings: {
          modelId: undefined,
          toolMode: "disabled",
        },
      };
      
      const result = service.mergeSettings(existing, updates);
      
      expect(result.llmSettings?.provider).toBe("google");
      expect(result.llmSettings?.modelId).toBe("gemini-2.5-flash");
      expect(result.llmSettings?.toolMode).toBe("disabled");
    });

    it("should merge top-level fields", () => {
      const existing: Partial<AppSettings> = {
        activeProvider: "google",
        activeModel: "gemini-2.5-flash",
        retryCount: 2,
      };
      
      const updates: Partial<AppSettings> = {
        retryCount: 3,
        openaiBaseUrl: "https://custom.example.com/v1",
      };
      
      const result = service.mergeSettings(existing, updates);
      
      expect(result.activeProvider).toBe("google");
      expect(result.activeModel).toBe("gemini-2.5-flash");
      expect(result.retryCount).toBe(3);
      expect(result.openaiBaseUrl).toBe("https://custom.example.com/v1");
    });
  });
});