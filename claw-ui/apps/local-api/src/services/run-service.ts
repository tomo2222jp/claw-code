import { randomUUID } from "node:crypto";

import type {
  AppSettings,
  LogEntry,
  RunRecord,
  RunRequest,
  RunStatus,
} from "../../../../shared/contracts/index.js";
import type { EngineAdapter, RunningEngineHandle } from "../adapters/engine-adapter.js";
import { resolveExecutionSettings } from "./llm-settings-resolution.js";

type ActiveRun = {
  handle: RunningEngineHandle;
};

export class RunService {
  private readonly runs = new Map<string, RunRecord>();
  private readonly logs = new Map<string, LogEntry[]>();
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(private readonly adapter: EngineAdapter) {}

  startRun(request: RunRequest, settings: AppSettings): RunRecord {
    const run: RunRecord = {
      id: randomUUID(),
      prompt: request.prompt,
      status: "starting",
      startedAt: new Date().toISOString(),
    };

    this.runs.set(run.id, run);
    this.logs.set(run.id, []);

    try {
      // Resolve settings using centralized provider resolution
      const resolvedSettings = resolveExecutionSettings(settings);
      
      const handle = this.adapter.startRun(
        {
          ...run,
          permissionMode: request.permissionMode ?? "default",
          settings: resolvedSettings,
          attachments: request.attachments,
          projectMemory: request.projectMemory,
          role: request.role,
          webResults: request.webResults,
          gitResults: request.gitResults,
        },
        {
        onStatus: (status, patch) => {
          this.updateRun(run.id, status, patch);
          if (isTerminalStatus(status)) {
            this.activeRuns.delete(run.id);
          }
        },
        onLog: (stream, message) => {
          this.appendLog(run.id, { ts: new Date().toISOString(), stream, message });
        },
        },
      );

      this.activeRuns.set(run.id, { handle });
      return this.getRun(run.id)!;
    } catch (error) {
      this.activeRuns.delete(run.id);
      this.logs.delete(run.id);
      this.runs.delete(run.id);
      throw error;
    }
  }

  getRun(id: string): RunRecord | undefined {
    return this.runs.get(id);
  }

  getRunStatus(id: string): Pick<
    RunRecord,
    "id" | "status" | "startedAt" | "finishedAt" | "finalOutput" | "errorMessage"
  > | undefined {
    const run = this.runs.get(id);
    if (!run) {
      return undefined;
    }
    return {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      finalOutput: run.finalOutput,
      errorMessage: run.errorMessage,
    };
  }

  getLogs(id: string): LogEntry[] | undefined {
    return this.logs.get(id);
  }

  stopRun(id: string): RunRecord | undefined {
    const current = this.runs.get(id);
    if (!current) {
      return undefined;
    }
    if (isTerminalStatus(current.status)) {
      this.activeRuns.delete(id);
      return current;
    }
    const active = this.activeRuns.get(id);
    if (!active) {
      return current;
    }
    active.handle.stop();
    return this.runs.get(id);
  }

  private updateRun(
    id: string,
    status: RunStatus,
    patch?: Partial<Pick<RunRecord, "finalOutput" | "errorMessage" | "finishedAt">>,
  ): void {
    const current = this.runs.get(id);
    if (!current) {
      return;
    }
    this.runs.set(id, {
      ...current,
      status,
      ...patch,
    });
  }

  private appendLog(id: string, entry: LogEntry): void {
    const existing = this.logs.get(id) ?? [];
    existing.push(entry);
    this.logs.set(id, existing);
  }
}

function isTerminalStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "stopped";
}
