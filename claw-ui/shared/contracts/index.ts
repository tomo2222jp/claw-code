export type AppSettings = {
  activeProvider: string;
  activeModel: string;
  retryCount: number;
  openaiBaseUrl: string;
};

export type PermissionMode = "default" | "full_access";

export type AgentRole = "default" | "planner" | "builder" | "reviewer";

export type ImageAttachment = {
  id: string;
  data: string;
  mimeType: string;
};

export type InjectedProjectMemory = {
  rules?: string[];
  decisions?: string[];
  currentFocus?: string[];
  pinnedItems?: string[];
};

export type WebResult = {
  title: string;
  snippet: string;
  url: string;
};

export type GitReadResult = {
  path: string;
  excerpt: string;
};

export type RunRequest = {
  prompt: string;
  permissionMode?: PermissionMode;
  attachments?: ImageAttachment[];
  projectMemory?: InjectedProjectMemory;
  role?: AgentRole;
  webResults?: WebResult[];
  gitResults?: GitReadResult[];
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
