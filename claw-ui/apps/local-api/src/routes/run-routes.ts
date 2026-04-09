import type { FastifyInstance } from "fastify";

import type { RunRequest } from "../../../../shared/contracts/index.js";
import type { AppContext } from "../types/app-context.js";
import { sendApiError } from "./route-errors.js";

export async function registerRunRoutes(
  app: FastifyInstance,
  context: AppContext,
): Promise<void> {
  app.post<{ Body: RunRequest }>("/api/run", async (request, reply) => {
    if (!request.body?.prompt?.trim()) {
      return sendApiError(reply, 400, "invalid_run_request", "prompt must not be empty");
    }
    try {
      const settings = await context.settingsService.getSettings();
      const run = context.runService.startRun({
        prompt: request.body.prompt.trim(),
      }, settings);
      reply.code(202);
      return { id: run.id, status: run.status };
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "run_start_failed",
        error instanceof Error ? error.message : "failed to start run",
      );
    }
  });

  app.get<{ Params: { id: string } }>("/api/run/:id/status", async (request, reply) => {
    try {
      const run = context.runService.getRunStatus(request.params.id);
      if (!run) {
        return sendApiError(reply, 404, "run_not_found", "run not found");
      }
      return run;
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "run_status_failed",
        error instanceof Error ? error.message : "failed to read run status",
      );
    }
  });

  app.get<{ Params: { id: string } }>("/api/run/:id/logs", async (request, reply) => {
    try {
      const logs = context.runService.getLogs(request.params.id);
      if (!logs) {
        return sendApiError(reply, 404, "run_not_found", "run not found");
      }
      return { id: request.params.id, logs };
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "run_logs_failed",
        error instanceof Error ? error.message : "failed to read run logs",
      );
    }
  });

  app.post<{ Params: { id: string } }>("/api/run/:id/stop", async (request, reply) => {
    try {
      const run = context.runService.stopRun(request.params.id);
      if (!run) {
        return sendApiError(reply, 404, "run_not_found", "run not found");
      }
      return {
        id: run.id,
        status: run.status,
        finishedAt: run.finishedAt,
      };
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "run_stop_failed",
        error instanceof Error ? error.message : "failed to stop run",
      );
    }
  });
}
