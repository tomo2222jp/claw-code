import type { AppSettings, LogEntry, RunRecord, RunStatus } from "../../../../shared/contracts/index.js";

export type EngineAdapterLogStream = LogEntry["stream"];

export type EngineAdapterRunPatch = Partial<
  Pick<RunRecord, "finalOutput" | "errorMessage" | "finishedAt">
>;

export type EngineAdapterCallbacks = {
  onStatus: (status: RunStatus, patch?: EngineAdapterRunPatch) => void;
  onLog: (stream: EngineAdapterLogStream, message: string) => void;
};

export type RunningEngineHandle = {
  stop: () => void;
};

export type EngineAdapterRun = Pick<RunRecord, "id" | "prompt"> & {
  settings: AppSettings;
};

export interface EngineAdapter {
  startRun(run: EngineAdapterRun, callbacks: EngineAdapterCallbacks): RunningEngineHandle;
}
