export type AppSettings = {
  activeProvider: string;
  activeModel: string;
  retryCount: number;
  openaiBaseUrl: string;
};

export type RunRequest = {
  prompt: string;
};

export type RunStatus =
  | "idle"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export type RunRecord = {
  id: string;
  prompt: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  finalOutput?: string;
  errorMessage?: string;
};

export type LogEntry = {
  ts: string;
  stream: "stdout" | "stderr" | "system";
  message: string;
};
