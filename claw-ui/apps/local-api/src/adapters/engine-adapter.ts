import type {
  AgentRole,
  AppSettings,
  GitReadResult,
  ImageAttachment,
  InjectedProjectMemory,
  LogEntry,
  PermissionMode,
  RunRecord,
  RunStatus,
  WebResult,
} from "../../../../shared/contracts/index.js";

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
  permissionMode: PermissionMode;
  settings: AppSettings;
  attachments?: ImageAttachment[];
  projectMemory?: InjectedProjectMemory;
  role?: AgentRole;
  webResults?: WebResult[];
  gitResults?: GitReadResult[];
};

export interface EngineAdapter {
  startRun(run: EngineAdapterRun, callbacks: EngineAdapterCallbacks): RunningEngineHandle;
}
