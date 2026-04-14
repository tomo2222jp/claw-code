export type LlmToolMode = "enabled" | "disabled";
export type ExecutionMode = "cloud" | "local";
export type CloudProvider = "google" | "openrouter" | "openai" | "anthropic" | "custom";

export type LlmSettings = {
  executionMode?: ExecutionMode;
  provider?: CloudProvider | string;
  modelId?: string;
  toolMode?: LlmToolMode;
  baseUrl?: string;
  apiKeys?: {
    google?: string;
    openrouter?: string;
    openai?: string;
    anthropic?: string;
  };
  providerOptions?: Record<string, unknown>;
};

export type AppSettings = {
  activeProvider: string;
  activeModel: string;
  retryCount: number;
  openaiBaseUrl: string;
  llmSettings?: LlmSettings;
};

export type ResolvedSettings = {
  executionMode: ExecutionMode;
  provider: CloudProvider;
  modelId: string;
  baseUrl?: string;
  apiKey?: string;
  toolMode: LlmToolMode;
  resolvedProviderType: CloudProvider;
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
