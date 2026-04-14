import type { FastifyInstance } from "fastify";

import type { AppContext } from "../types/app-context.js";
import type { AppSettings, ConnectionTestResult, LlmSettings } from "../../../../shared/contracts/index.js";
import { ProviderResolutionService } from "../services/provider-resolution-service.js";
import { sendApiError } from "./route-errors.js";

export async function registerSettingsRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.get("/api/settings", async (_request, reply) => {
    try {
      return await context.settingsService.getSettings();
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "settings_read_failed",
        error instanceof Error ? error.message : "failed to read settings",
      );
    }
  });

  app.post<{ Body: Partial<AppSettings> }>("/api/settings", async (request, reply) => {
    try {
      // Validate llmSettings before saving
      const providerResolutionService = new ProviderResolutionService();
      const validation = providerResolutionService.validateLlmSettings(request.body.llmSettings);
      
      if (!validation.isValid) {
        return sendApiError(
          reply,
          400,
          "settings_validation_failed",
          validation.errors.join("; "),
        );
      }
      
      // Get current settings
      const currentSettings = await context.settingsService.getSettings();
      
      // Merge new settings with current
      const mergedSettings = { ...currentSettings };
      
      // Handle llmSettings merge
      if (request.body.llmSettings) {
        if (!mergedSettings.llmSettings) {
          mergedSettings.llmSettings = {};
        }
        
        // Merge llmSettings fields
        Object.keys(request.body.llmSettings).forEach(key => {
          const value = (request.body.llmSettings as any)[key];
          if (value !== undefined) {
            (mergedSettings.llmSettings as any)[key] = value;
          }
        });
      }
      
      // Merge other fields
      Object.keys(request.body).forEach(key => {
        if (key !== 'llmSettings') {
          const value = (request.body as any)[key];
          if (value !== undefined) {
            (mergedSettings as any)[key] = value;
          }
        }
      });
      
      const saved = await context.settingsService.saveSettings(mergedSettings);
      reply.code(200);
      return saved;
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "settings_save_failed",
        error instanceof Error ? error.message : "failed to save settings",
      );
    }
  });

  app.get("/api/settings/resolved", async (_request, reply) => {
    try {
      const settings = await context.settingsService.getSettings();
      const resolved = context.settingsService.getResolvedSettings(settings);
      return resolved;
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "settings_resolution_failed",
        error instanceof Error ? error.message : "failed to resolve settings",
      );
    }
  });

  app.post<{ Body: { llmSettings?: LlmSettings } }>("/api/settings/test-connection", async (request, reply) => {
    try {
      const providerResolutionService = new ProviderResolutionService();
      const result = await providerResolutionService.testConnection(request.body.llmSettings);
      
      reply.code(result.ok ? 200 : 400);
      return result;
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "connection_test_failed",
        error instanceof Error ? error.message : "failed to test connection",
      );
    }
  });
}
