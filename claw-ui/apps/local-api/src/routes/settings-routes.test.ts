import { describe, it, expect, vi } from "vitest";
import { ProviderResolutionService } from "../services/provider-resolution-service.js";

describe("Phase 9C: Settings validation", () => {
  const service = new ProviderResolutionService();

  describe("validateLlmSettings", () => {
    it("should reject invalid custom provider (missing providerId)", () => {
      const llmSettings = {
        provider: "custom",
        customProvider: {
          providerId: "", // empty - invalid
          baseUrl: "https://api.example.com/v1",
          modelId: "custom-model-1",
        },
      };
      
      const result = service.validateLlmSettings(llmSettings);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("providerId is required for custom provider");
    });

    it("should reject invalid custom provider (invalid baseUrl)", () => {
      const llmSettings = {
        provider: "custom",
        customProvider: {
          providerId: "my-provider",
          baseUrl: "not-a-valid-url", // invalid
          modelId: "custom-model-1",
        },
      };
      
      const result = service.validateLlmSettings(llmSettings);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("baseUrl must be a valid URL");
    });

    it("should reject invalid custom provider (missing modelId)", () => {
      const llmSettings = {
        provider: "custom",
        customProvider: {
          providerId: "my-provider",
          baseUrl: "https://api.example.com/v1",
          modelId: "", // empty - invalid
        },
      };
      
      const result = service.validateLlmSettings(llmSettings);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("modelId is required for custom provider");
    });

    it("should accept valid custom provider", () => {
      const llmSettings = {
        provider: "custom",
        customProvider: {
          providerId: "my-provider",
          baseUrl: "https://api.example.com/v1",
          modelId: "custom-model-1",
          apiKey: "sk-test-key",
          displayName: "My Custom Provider",
        },
      };
      
      const result = service.validateLlmSettings(llmSettings);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should ignore invalid customProvider when provider is preset", () => {
      const llmSettings = {
        provider: "openai", // preset provider
        customProvider: {
          providerId: "", // invalid, but should be ignored
          baseUrl: "not-a-url",
          modelId: "",
        },
      };
      
      const result = service.validateLlmSettings(llmSettings);
      
      expect(result.isValid).toBe(true); // custom provider validation skipped
      expect(result.errors).toEqual([]);
    });

    it("should accept provider=custom without customProvider (will fail at resolution)", () => {
      const llmSettings = {
        provider: "custom",
        // missing customProvider
      };
      
      const result = service.validateLlmSettings(llmSettings);
      
      expect(result.isValid).toBe(true); // validation passes, resolution will handle missing fields
      expect(result.errors).toEqual([]);
    });
  });

  describe("normalizeProviderSettings", () => {
    it("should return customProvider when provider=custom", () => {
      const customProvider = {
        providerId: "my-provider",
        baseUrl: "https://api.example.com/v1",
        modelId: "custom-model-1",
      };
      
      const result = service["normalizeProviderSettings"]("custom", customProvider);
      
      expect(result.provider).toBe("custom");
      expect(result.customProvider).toBe(customProvider);
    });

    it("should ignore customProvider when provider is preset", () => {
      const customProvider = {
        providerId: "my-provider",
        baseUrl: "https://api.example.com/v1",
        modelId: "custom-model-1",
      };
      
      const result = service["normalizeProviderSettings"]("openai", customProvider);
      
      expect(result.provider).toBe("openai");
      expect(result.customProvider).toBeUndefined(); // ignored for preset provider
    });
  });
});