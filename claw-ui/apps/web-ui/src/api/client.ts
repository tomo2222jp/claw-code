import type {
  AppSettings,
  LogEntry,
  RunRequest,
} from "../../../../shared/contracts/index.js";
import type { RunStatusResponse } from "../types/ui.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || "";

type ApiErrorPayload =
  | {
      error?: string;
      message?: string;
    }
  | {
      error?: {
        code?: string;
        message?: string;
      };
    };

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly path: string;

  constructor(path: string, status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.path = path;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw await toApiClientError(path, response);
  }

  return (await response.json()) as T;
}

async function toApiClientError(path: string, response: Response): Promise<ApiClientError> {
  const fallbackMessage = `${response.status} ${response.statusText || "Request failed"}`;

  try {
    const payload = (await response.json()) as ApiErrorPayload;
    const topLevelMessage =
      "message" in payload && typeof payload.message === "string" ? payload.message : undefined;

    if (typeof payload.error === "string") {
      return new ApiClientError(path, response.status, topLevelMessage ?? payload.error, payload.error);
    }
    if (payload.error && typeof payload.error === "object") {
      return new ApiClientError(
        path,
        response.status,
        payload.error.message ?? fallbackMessage,
        payload.error.code,
      );
    }
    return new ApiClientError(path, response.status, topLevelMessage ?? fallbackMessage);
  } catch {
    const body = await response.text().catch(() => "");
    return new ApiClientError(path, response.status, body || fallbackMessage);
  }
}

export async function getHealth(): Promise<{ ok: boolean; service: string; ts: string }> {
  return request("/api/health");
}

export async function getSettings(): Promise<AppSettings> {
  return request("/api/settings");
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return request("/api/settings", {
    method: "POST",
    body: JSON.stringify(settings),
  });
}

export async function startRun(payload: RunRequest): Promise<{ id: string; status: string }> {
  return request("/api/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getRunStatus(id: string): Promise<RunStatusResponse> {
  return request(`/api/run/${id}/status`);
}

export async function getRunLogs(id: string): Promise<{ id: string; logs: LogEntry[] }> {
  return request(`/api/run/${id}/logs`);
}

export async function stopRun(id: string): Promise<{
  id: string;
  status: string;
  finishedAt?: string;
}> {
  return request(`/api/run/${id}/stop`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
