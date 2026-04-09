import type { FastifyInstance } from "fastify";

import type { AppContext } from "../types/app-context.js";
import type { AppSettings } from "../../../../shared/contracts/index.js";
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

  app.post<{ Body: AppSettings }>("/api/settings", async (request, reply) => {
    try {
      const saved = await context.settingsService.saveSettings(request.body);
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
}
