import type { FastifyInstance } from "fastify";

import type { AgentRole, PermissionMode, RunRequest } from "../../../../shared/contracts/index.js";
import type { AppContext } from "../types/app-context.js";
import { sendApiError } from "./route-errors.js";
import { shouldTriggerWebSearch, performWebSearch } from "../services/web-search-service.js";

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
      const trimmedPrompt = request.body.prompt.trim();

      // Check if web search should be triggered based on prompt content
      let webResults = [];
      if (shouldTriggerWebSearch(trimmedPrompt)) {
        // Perform web search with the user's query
        // For MVP, this will return empty if no API is configured
        webResults = await performWebSearch(trimmedPrompt, {
          maxResults: 3,
          // In production, API key would come from environment or settings
          apiKey: process.env.WEB_SEARCH_API_KEY,
        });
      }

      const run = context.runService.startRun(
        {
          prompt: trimmedPrompt,
          permissionMode: normalizePermissionMode(request.body?.permissionMode),
          attachments: request.body.attachments,
          projectMemory: request.body.projectMemory,
          role: normalizeRole(request.body?.role),
          webResults,
        },
        settings,
      );
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

function normalizePermissionMode(value: unknown): PermissionMode {
  return value === "full_access" ? "full_access" : "default";
}

function normalizeRole(value: unknown): AgentRole {
  const valid: AgentRole[] = ["planner", "builder", "reviewer"];
  return valid.includes(value as AgentRole) ? (value as AgentRole) : "default";
}
