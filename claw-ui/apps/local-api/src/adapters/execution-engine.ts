import { accessSync, constants } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { AppSettings } from "../../../../shared/contracts/index.js";
import type { EngineAdapterCallbacks, EngineAdapterRun, RunningEngineHandle } from "./engine-adapter.js";

// ── Prompt-only path (direct API, no CLI) ─────────────────────────────────────

function resolveApiKey(settings: AppSettings): string {
  return (
    settings.apiKey ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ""
  );
}

function buildRequestHeaders(settings: AppSettings): Record<string, string> {
  const apiKey = resolveApiKey(settings);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (settings.activeProvider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/claw-code";
    headers["X-Title"] = "Claw Code";
  }

  return headers;
}

function resolveBaseUrl(settings: AppSettings): string {
  return (settings.openaiBaseUrl || "https://openrouter.ai/api/v1").replace(/\/$/, "");
}

type CompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string; code?: number | string };
};

async function fetchChatCompletion(
  settings: AppSettings,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  const url = `${resolveBaseUrl(settings)}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: buildRequestHeaders(settings),
    signal,
    body: JSON.stringify({
      model: settings.activeModel,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const bodyText = await response.text();
  if (!bodyText.trim()) {
    throw new Error(`[${response.status}] empty response from provider`);
  }

  let data: CompletionResponse;
  try {
    data = JSON.parse(bodyText) as CompletionResponse;
  } catch {
    throw new Error(`[${response.status}] non-JSON response: ${bodyText.slice(0, 200)}`);
  }

  if (!response.ok) {
    const message = data.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`[${response.status}] ${message}`);
  }

  return data.choices?.[0]?.message?.content ?? "";
}

export function runPromptOnly(
  run: EngineAdapterRun,
  callbacks: EngineAdapterCallbacks,
): RunningEngineHandle {
  const controller = new AbortController();
  let terminal = false;

  const execute = async (): Promise<void> => {
    const apiKey = resolveApiKey(run.settings);
    const hasApiKey = apiKey.length > 0;
    console.log(`[direct-api] runPromptOnly start run=${run.id} provider=${run.settings.activeProvider} modelId=${run.settings.activeModel} hasApiKey=${hasApiKey}`);
    callbacks.onStatus("running");
    callbacks.onLog(
      "system",
      `[direct-api] runPromptOnly run=${run.id} provider=${run.settings.activeProvider} modelId=${run.settings.activeModel} hasApiKey=${hasApiKey}`,
    );

    if (!hasApiKey) {
      terminal = true;
      callbacks.onStatus("failed", {
        finishedAt: new Date().toISOString(),
        errorMessage: "apiKey is not set. Configure it in Settings or set OPENROUTER_API_KEY env var.",
      });
      return;
    }

    const maxAttempts = 1 + Math.max(0, run.settings.retryCount ?? 0);
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (controller.signal.aborted) return;

      if (attempt > 1) {
        callbacks.onLog("system", `retry ${attempt - 1}/${run.settings.retryCount}`);
      }

      try {
        const content = await fetchChatCompletion(run.settings, run.prompt, controller.signal);

        if (terminal) return;
        if (content) {
          callbacks.onLog("stdout", content);
        }

        terminal = true;
        callbacks.onStatus("completed", {
          finishedAt: new Date().toISOString(),
          finalOutput: content || undefined,
        });
        return;
      } catch (error) {
        if (controller.signal.aborted) return;
        lastError = error instanceof Error ? error : new Error(String(error));
        callbacks.onLog("system", `attempt ${attempt} failed: ${lastError.message}`);
      }
    }

    if (terminal) return;
    terminal = true;
    callbacks.onStatus("failed", {
      finishedAt: new Date().toISOString(),
      errorMessage: lastError?.message ?? "unknown error",
    });
  };

  execute().catch((error: unknown) => {
    if (terminal || controller.signal.aborted) return;
    terminal = true;
    callbacks.onStatus("failed", {
      finishedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  });

  return {
    stop: () => {
      if (terminal) return;
      terminal = true;
      controller.abort();
      callbacks.onStatus("stopped", { finishedAt: new Date().toISOString() });
    },
  };
}

// ── Tool-enabled path (spawns CLI) ────────────────────────────────────────────

export type ToolEnabledOptions = {
  clawCliPath: string;
  repoRoot: string;
};

type StreamState = { buffer: string };

function flushBufferedLines(
  chunk: string,
  state: StreamState,
  emit: (line: string) => void,
): void {
  state.buffer += chunk;
  let idx = state.buffer.indexOf("\n");
  while (idx >= 0) {
    emit(state.buffer.slice(0, idx).replace(/\r$/, ""));
    state.buffer = state.buffer.slice(idx + 1);
    idx = state.buffer.indexOf("\n");
  }
}

function flushRemainder(state: StreamState, emit: (line: string) => void): void {
  if (!state.buffer.length) return;
  emit(state.buffer.replace(/\r$/, ""));
  state.buffer = "";
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

function extractFinalOutput(stdout: string): string | undefined {
  const trimmed = stripAnsi(stdout).trim();
  if (!trimmed) return undefined;

  const blocks = trimmed
    .split(/\r?\n\r?\n+/)
    .map((b) => b.trim())
    .filter(Boolean)
    .filter((b) => {
      const first = b.split(/\r?\n/, 1)[0]?.trim() ?? "";
      return (
        !first.startsWith("[active-model]") &&
        !first.startsWith("warning:") &&
        !first.startsWith("Run `claw --help`")
      );
    });

  return blocks.at(-1) ?? trimmed;
}

function buildClawEnv(settings: AppSettings): NodeJS.ProcessEnv {
  const homePath =
    process.env.HOME ||
    process.env.USERPROFILE ||
    (process.env.HOMEDRIVE && process.env.HOMEPATH
      ? `${process.env.HOMEDRIVE}${process.env.HOMEPATH}`
      : undefined);

  return {
    ...process.env,
    ...(homePath ? { HOME: homePath } : {}),
    CLAW_ACTIVE_PROVIDER_OVERRIDE: settings.activeProvider,
    CLAW_RETRY_COUNT_OVERRIDE: String(settings.retryCount),
    OPENAI_BASE_URL: settings.openaiBaseUrl,
    NO_COLOR: process.env.NO_COLOR || "1",
    CLICOLOR: "0",
  };
}

export function runToolEnabled(
  run: EngineAdapterRun,
  callbacks: EngineAdapterCallbacks,
  options: ToolEnabledOptions,
): RunningEngineHandle {
  try {
    accessSync(options.repoRoot, constants.R_OK);
  } catch {
    throw new Error(`claw repo root is not readable: ${options.repoRoot}`);
  }
  try {
    accessSync(options.clawCliPath, constants.R_OK);
  } catch {
    throw new Error(`claw cli is not readable: ${options.clawCliPath}`);
  }

  const args = [
    "--output-format", "text",
    "--model", run.settings.activeModel,
    "--permission-mode", "danger-full-access",
    "prompt", run.prompt,
  ];

  console.log(`[direct-api] runToolEnabled start run=${run.id} provider=${run.settings.activeProvider} model=${run.settings.activeModel}`);
  callbacks.onLog(
    "system",
    `[direct-api] runToolEnabled run=${run.id} provider=${run.settings.activeProvider} model=${run.settings.activeModel}`,
  );

  const child = spawn(options.clawCliPath, args, {
    cwd: options.repoRoot,
    env: buildClawEnv(run.settings),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }) as ChildProcessWithoutNullStreams;

  let stoppingRequested = false;
  let terminal = false;
  let stdoutCapture = "";
  let stderrCapture = "";
  const stdoutState: StreamState = { buffer: "" };
  const stderrState: StreamState = { buffer: "" };

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.on("spawn", () => callbacks.onStatus("running"));

  child.stdout.on("data", (chunk: string) => {
    stdoutCapture += chunk;
    flushBufferedLines(chunk, stdoutState, (line) => callbacks.onLog("stdout", line));
  });

  child.stderr.on("data", (chunk: string) => {
    stderrCapture += chunk;
    flushBufferedLines(chunk, stderrState, (line) => callbacks.onLog("stderr", line));
  });

  child.on("error", (error) => {
    flushRemainder(stdoutState, (line) => callbacks.onLog("stdout", line));
    flushRemainder(stderrState, (line) => callbacks.onLog("stderr", line));
    if (terminal) return;
    terminal = true;
    callbacks.onLog("system", `claw process error: ${error.message}`);
    callbacks.onStatus(stoppingRequested ? "stopped" : "failed", {
      finishedAt: new Date().toISOString(),
      ...(stoppingRequested ? {} : { errorMessage: `claw process error: ${error.message}` }),
    });
  });

  child.on("close", (code, signal) => {
    flushRemainder(stdoutState, (line) => callbacks.onLog("stdout", line));
    flushRemainder(stderrState, (line) => callbacks.onLog("stderr", line));
    if (terminal) return;
    terminal = true;

    if (stoppingRequested) {
      callbacks.onLog("system", "claw process closed after stop request");
      callbacks.onStatus("stopped", { finishedAt: new Date().toISOString() });
      return;
    }

    if (code === 0) {
      callbacks.onLog("system", "claw process exited successfully");
      callbacks.onStatus("completed", {
        finishedAt: new Date().toISOString(),
        finalOutput: extractFinalOutput(stdoutCapture),
      });
      return;
    }

    const reason =
      code !== null ? `exit code ${code}` : signal ? `signal ${signal}` : "unknown termination";
    const stderrLines = stripAnsi(stderrCapture)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const stderrSummary = stderrLines.slice(0, 2).join(" | ").slice(0, 280);
    const errorMessage = stderrSummary
      ? `claw exited with ${reason}: ${stderrSummary}`
      : `claw exited with ${reason}`;

    callbacks.onLog("system", `claw process exited abnormally: ${reason}`);
    callbacks.onStatus("failed", {
      finishedAt: new Date().toISOString(),
      errorMessage,
    });
  });

  return {
    stop: () => {
      if (terminal || stoppingRequested) return;
      stoppingRequested = true;
      callbacks.onLog("system", `stop requested for tool-enabled run ${run.id}`);
      child.kill();
    },
  };
}
