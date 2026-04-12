import { accessSync, constants } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type {
  EngineAdapter,
  EngineAdapterCallbacks,
  EngineAdapterRun,
  RunningEngineHandle,
} from "./engine-adapter.js";
import type { AppSettings, GitReadResult, WebResult } from "../../../../shared/contracts/index.js";
import { performWebSearch, shouldTriggerWebSearch, formatWebResults } from "../services/web-search-service.js";

type ClawEngineAdapterOptions = {
  clawCliPath?: string;
  clawCliArgsPrefix?: string[];
  repoRoot?: string;
};

type StreamState = {
  buffer: string;
};

export class ClawEngineAdapter implements EngineAdapter {
  private readonly repoRoot: string;
  private readonly clawCliPath: string;
  private readonly clawCliArgsPrefix: string[];

  constructor(options: ClawEngineAdapterOptions = {}) {
    this.repoRoot = options.repoRoot ?? resolveDefaultRepoRoot();
    this.clawCliPath = options.clawCliPath ?? resolveDefaultClawCliPath(this.repoRoot);
    this.clawCliArgsPrefix = options.clawCliArgsPrefix ?? [];
  }

  startRun(run: EngineAdapterRun, callbacks: EngineAdapterCallbacks): RunningEngineHandle {
    assertSpawnPrerequisites(this.repoRoot, this.clawCliPath);

    const webResults = run.webResults ?? [];
    const gitResults = run.gitResults ?? [];

    // Resolve execution path: prompt-only disables tool schema injection in the CLI.
    // - tool-enabled (default): full tool support, permission mode from request
    // - prompt-only: no tool schemas sent to the API, prevents tool-call loops on
    //   models that don't handle function calling well (e.g. OpenRouter free tier)
    const toolMode = run.settings.llmSettings?.toolMode ?? "enabled";
    const isPromptOnly = toolMode === "disabled";

    // Both paths inject context (memory, web, git, role, attachments) into the prompt.
    const injectedPrompt = buildPrompt(
      run.prompt,
      run.projectMemory,
      run.attachments,
      run.role,
      webResults,
      gitResults,
    );

    // Path-specific CLI flag construction
    const args: string[] = [
      ...this.clawCliArgsPrefix,
      "--output-format",
      "text",
      "--model",
      run.settings.activeModel,
    ];

    if (isPromptOnly) {
      // prompt-only path: auto-approve all permissions so the process never blocks
      // waiting for interactive input. The model receives no tool schemas, so it
      // responds with plain text and exits cleanly.
      args.push("--dangerously-skip-permissions");
    } else {
      // tool-enabled path: honour the permission mode from the run request
      args.push("--permission-mode", toCliPermissionMode(run.permissionMode));
    }

    args.push("prompt", injectedPrompt);

    callbacks.onLog("system", `launching claw for run ${run.id}`);
    callbacks.onLog("system", `claw cwd: ${this.repoRoot}`);
    callbacks.onLog("system", `claw cli: ${this.clawCliPath}`);
    callbacks.onLog(
      "system",
      `claw settings: provider=${run.settings.activeProvider} model=${run.settings.activeModel} retryCount=${run.settings.retryCount}`,
    );
    callbacks.onLog("system", `execution path: ${isPromptOnly ? "prompt-only" : "tool-enabled"}`);
    if (!isPromptOnly) {
      callbacks.onLog("system", `claw permission mode: ${run.permissionMode}`);
    }
    callbacks.onLog(
      "system",
      "claw precedence: local-api execution settings override repo config for bridged fields",
    );
    if (run.attachments && run.attachments.length > 0) {
      callbacks.onLog("system", `[v1 injection] attachments acknowledged: ${run.attachments.length} image(s)`);
    }
    if (run.projectMemory) {
      const memoryKeys = [
        run.projectMemory.rules ? "rules" : "",
        run.projectMemory.decisions ? "decisions" : "",
        run.projectMemory.currentFocus ? "currentFocus" : "",
        run.projectMemory.pinnedItems ? "pinnedItems" : "",
      ].filter(Boolean);
      if (memoryKeys.length > 0) {
        callbacks.onLog("system", `[v1 injection] project memory applied: ${memoryKeys.join(", ")}`);
        const prioritized = prioritizeMemory(run.projectMemory);
        const pinnedCount = prioritized?.pinnedItems?.length ?? 0;
        const focusCount = prioritized?.currentFocus?.length ?? 0;
        const decisionsCount = prioritized?.decisions?.length ?? 0;
        const rulesCount = prioritized?.rules?.length ?? 0;
        callbacks.onLog(
          "system",
          `[v1 memory] prioritized memory applied: pinned=${pinnedCount} focus=${focusCount} decisions=${decisionsCount} rules=${rulesCount}`,
        );
      }
    }
    if (run.role && run.role !== "default") {
      callbacks.onLog("system", `[v1 role] role applied: ${run.role}`);
    }
    if (webResults.length > 0) {
      callbacks.onLog("system", `[v1 web] search results applied: ${webResults.length} items`);
    }
    if (gitResults.length > 0) {
      callbacks.onLog("system", `[v1 git] repo context applied: ${gitResults.length} items`);
    }

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(this.clawCliPath, args, {
        cwd: this.repoRoot,
        env: buildChildEnv(run.settings),
        // Use a piped stdin to keep types consistent; we still never write to it.
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      throw error;
    }

    let stoppingRequested = false;
    let terminalEmitted = false;
    let stdoutCapture = "";
    let stderrCapture = "";

    const stdoutState: StreamState = { buffer: "" };
    const stderrState: StreamState = { buffer: "" };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.on("spawn", () => {
      callbacks.onStatus("running");
    });

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

      if (terminalEmitted) {
        return;
      }

      terminalEmitted = true;
      const abnormalError = buildAbnormalProcessErrorMessage({
        error,
        repoRoot: this.repoRoot,
        clawCliPath: this.clawCliPath,
      });
      callbacks.onLog("system", `claw process error: ${abnormalError}`);
      callbacks.onStatus(stoppingRequested ? "stopped" : "abnormal_exit", {
        finishedAt: new Date().toISOString(),
        ...(stoppingRequested ? {} : { errorMessage: abnormalError }),
      });
    });

    child.on("close", (code, signal) => {
      flushRemainder(stdoutState, (line) => callbacks.onLog("stdout", line));
      flushRemainder(stderrState, (line) => callbacks.onLog("stderr", line));

      if (terminalEmitted) {
        return;
      }
      terminalEmitted = true;

      if (stoppingRequested) {
        callbacks.onLog("system", "claw process closed after stop request");
        callbacks.onStatus("stopped", {
          finishedAt: new Date().toISOString(),
        });
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

callbacks.onLog("system", `claw process exited abnormally: ${describeExitReason(code, signal)}`);
      callbacks.onStatus("abnormal_exit", {
        finishedAt: new Date().toISOString(),
        errorMessage: buildExitErrorMessage(code, signal, stderrCapture, run.settings),
      });
    });

    return {
      stop: () => {
        if (terminalEmitted || stoppingRequested) {
          return;
        }
        stoppingRequested = true;
        callbacks.onStatus("stopping");
        callbacks.onLog("system", `stop requested for claw run ${run.id}`);
        terminateChildProcess(child, callbacks);
      },
    };
  }
}

function buildPrompt(
  userPrompt: string,
  projectMemory?: EngineAdapterRun["projectMemory"],
  attachments?: EngineAdapterRun["attachments"],
  role?: EngineAdapterRun["role"],
  webResults?: WebResult[],
  gitResults?: GitReadResult[],
): string {
  const parts: string[] = [];

  // Apply memory prioritization before injection
  const prioritizedMemory = projectMemory ? prioritizeMemory(projectMemory) : undefined;

  // 1. Context preamble when project memory, web results, or git results are present
  const hasMemory =
    prioritizedMemory !== undefined &&
    Object.values(prioritizedMemory).some((v) => Array.isArray(v) && v.length > 0);
  const hasWebResults = webResults && webResults.length > 0;
  const hasGitResults = gitResults && gitResults.length > 0;

  if (hasMemory || hasWebResults || hasGitResults) {
    parts.push("You are working with the following context.");
  }

  // 2. Project memory sections in priority order: pinnedItems → currentFocus → decisions → rules
  if (prioritizedMemory) {
    if (prioritizedMemory.pinnedItems && prioritizedMemory.pinnedItems.length > 0) {
      parts.push("Pinned Context:\n" + prioritizedMemory.pinnedItems.map((item) => `- ${item}`).join("\n"));
    }
    if (prioritizedMemory.currentFocus && prioritizedMemory.currentFocus.length > 0) {
      parts.push("Current Focus:\n" + prioritizedMemory.currentFocus.map((focus) => `- ${focus}`).join("\n"));
    }
    if (prioritizedMemory.decisions && prioritizedMemory.decisions.length > 0) {
      parts.push("Decisions:\n" + prioritizedMemory.decisions.map((decision) => `- ${decision}`).join("\n"));
    }
    if (prioritizedMemory.rules && prioritizedMemory.rules.length > 0) {
      parts.push("Rules:\n" + prioritizedMemory.rules.map((rule) => `- ${rule}`).join("\n"));
    }
  }

  // 3. Web search results (when available)
  if (hasWebResults) {
    const formattedResults = webResults
      .map(
        (result) =>
          `- Title: ${result.title}\n  Snippet: ${result.snippet}\n  URL: ${result.url}`,
      )
      .join("\n");
    parts.push(`Web search results:\n${formattedResults}`);
  }

  // 4. Repository context (when available)
  if (hasGitResults) {
    const formattedResults = gitResults
      .map((result) => `- Path: ${result.path}\n  Excerpt: ${result.excerpt}`)
      .join("\n");
    parts.push(`Repository context:\n${formattedResults}`);
  }

  // 5. Attachment awareness
  if (attachments && attachments.length > 0) {
    const count = attachments.length;
    const label = count === 1 ? "1 image attachment is" : `${count} image attachments are`;
    parts.push(`Attached images:\n- ${label} included with this request.`);
  }

  // 6. Role guidance (additive, only for non-default roles)
  if (role && role !== "default") {
    parts.push(buildRoleGuidance(role));
  }

  // If no context to add, return original prompt unchanged
  if (parts.length === 0) {
    return userPrompt;
  }

  // 6. User request
  parts.push(`User request:\n${userPrompt}`);

  return parts.join("\n\n");
}

function prioritizeMemory(
  memory: EngineAdapterRun["projectMemory"],
): EngineAdapterRun["projectMemory"] {
  if (!memory) {
    return memory;
  }

  // Fixed per-section limits with priority order: pinnedItems → currentFocus → decisions → rules
  const limits = {
    pinnedItems: 3,
    currentFocus: 3,
    decisions: 3,
    rules: 2,
  };

  return {
    pinnedItems: memory.pinnedItems ? memory.pinnedItems.slice(0, limits.pinnedItems) : memory.pinnedItems,
    currentFocus: memory.currentFocus ? memory.currentFocus.slice(0, limits.currentFocus) : memory.currentFocus,
    decisions: memory.decisions ? memory.decisions.slice(0, limits.decisions) : memory.decisions,
    rules: memory.rules ? memory.rules.slice(0, limits.rules) : memory.rules,
  };
}

function buildRoleGuidance(role: "planner" | "builder" | "reviewer"): string {
  switch (role) {
    case "planner":
      return "Role guidance (planner): Break the task into clear steps and outline an implementation sequence before writing code.";
    case "builder":
      return "Role guidance (builder): Implement the task directly and practically.";
    case "reviewer":
      return "Role guidance (reviewer): Identify risks, critique the approach, and validate correctness.";
  }
}

function resolveDefaultRepoRoot(): string {
  return path.resolve(process.cwd(), "../../..");
}

function resolveDefaultClawCliPath(repoRoot: string): string {
  const explicit = process.env.CLAW_CLI_PATH;
  if (explicit) {
    return path.resolve(explicit);
  }

  const executableName = process.platform === "win32" ? "claw.exe" : "claw";
  return path.resolve(repoRoot, "rust", "target", "debug", executableName);
}

function assertSpawnPrerequisites(repoRoot: string, clawCliPath: string): void {
  try {
    accessSync(repoRoot, constants.R_OK);
  } catch {
    throw new Error(`claw repo root is not readable: ${repoRoot}`);
  }

  try {
    accessSync(clawCliPath, constants.R_OK);
  } catch {
    throw new Error(`claw cli is not readable: ${clawCliPath}`);
  }
}

function buildChildEnv(settings: EngineAdapterRun["settings"]): NodeJS.ProcessEnv {
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
    ...(settings.apiKey ? { OPENAI_API_KEY: settings.apiKey } : {}),
    NO_COLOR: process.env.NO_COLOR || "1",
    CLICOLOR: "0",
  };
}

function toCliPermissionMode(permissionMode: EngineAdapterRun["permissionMode"]): string {
  // The current CLI no longer accepts "default"; workspace-write matches legacy default behavior.
  return permissionMode === "full_access" ? "danger-full-access" : "workspace-write";
}

function flushBufferedLines(
  chunk: string,
  state: StreamState,
  emit: (line: string) => void,
): void {
  state.buffer += chunk;

  let newlineIndex = state.buffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = state.buffer.slice(0, newlineIndex).replace(/\r$/, "");
    emit(line);
    state.buffer = state.buffer.slice(newlineIndex + 1);
    newlineIndex = state.buffer.indexOf("\n");
  }
}

function flushRemainder(state: StreamState, emit: (line: string) => void): void {
  if (!state.buffer.length) {
    return;
  }
  emit(state.buffer.replace(/\r$/, ""));
  state.buffer = "";
}

function normalizeFinalOutput(stdout: string): string | undefined {
  const trimmed = stripAnsi(stdout).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractFinalOutput(stdout: string): string | undefined {
  const normalized = normalizeFinalOutput(stdout);
  if (!normalized) {
    return undefined;
  }

  const toolMessage = extractToolMessage(normalized);
  if (toolMessage) {
    return toolMessage;
  }

  const candidateBlocks = normalized
    .split(/\r?\n\r?\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !isNonAnswerBlock(block));

  return candidateBlocks.at(-1) ?? normalized;
}

function extractToolMessage(normalized: string): string | undefined {
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const jsonMessageLine = [...lines]
    .reverse()
    .find((line) => /^\{"message":".+","status":"[^"]+"\}$/.test(line));
  if (jsonMessageLine) {
    try {
      const parsed = JSON.parse(jsonMessageLine) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
      // Fall through to plain-text extraction.
    }
  }

  const plainTextLine = [...lines]
    .reverse()
    .find(
      (line) =>
        line !== "Done" &&
        line !== "\u2714 \u2728 Done" &&
        !line.startsWith("[active-model]") &&
        !line.startsWith("{") &&
        !line.startsWith("}") &&
        !line.includes("\"sentAt\"") &&
        !line.includes("\"attachments\"") &&
        !line.includes("\"message\"") &&
        !line.startsWith("SendUserMessage") &&
        !line.includes("Thinking..."),
    );
  return plainTextLine;
}

function isNonAnswerBlock(block: string): boolean {
  const firstLine = block.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return (
    firstLine.startsWith("[active-model]") ||
    firstLine.startsWith("warning:") ||
    firstLine.startsWith("Run `claw --help`")
  );
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

function buildExitErrorMessage(
  code: number | null,
  signal: NodeJS.Signals | null,
  trailingStderr: string,
  settings: AppSettings,
): string {
  const reason = describeExitReason(code, signal);
  const stderrSummary = summarizeStderr(trailingStderr);
  const base = signal
    ? `abnormal exit (process signal): ${reason}`
    : `abnormal exit (non-zero code): ${reason}`;
  const provider = settings.activeProvider;
  const localHint = buildLocalProviderHint(stderrSummary, provider);
  if (localHint) {
    return `${base}: ${localHint}`;
  }
  return stderrSummary ? `${base}: ${stderrSummary}` : base;
}

function describeExitReason(code: number | null, signal: NodeJS.Signals | null): string {
  return code !== null ? `exit code ${code}` : signal ? `signal ${signal}` : "unknown termination";
}

function summarizeStderr(stderr: string): string {
  const lines = stripAnsi(stderr)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "";
  }

  const summary = lines.slice(0, 2).join(" | ");
  return summary.length > 280 ? `${summary.slice(0, 277)}...` : summary;
}

function isLocalProvider(provider: string): boolean {
  return provider === "ollama" || provider.startsWith("ollama");
}

function buildLocalProviderHint(stderrSummary: string, provider: string): string | undefined {
  if (!stderrSummary) {
    return undefined;
  }

  // Only show local/Ollama hints for actual local providers
  if (!isLocalProvider(provider)) {
    return undefined;
  }

  const normalized = stderrSummary.toLowerCase();
  const isOllamaUnreachable =
    normalized.includes("econnrefused") ||
    normalized.includes("connection refused") ||
    normalized.includes("failed to connect") ||
    normalized.includes("connect error") ||
    normalized.includes("127.0.0.1:11434") ||
    normalized.includes("localhost:11434");
  if (isOllamaUnreachable) {
    return "local provider is unreachable; start Ollama and retry";
  }

  const isModelMissing =
    /model.+not found/i.test(stderrSummary) ||
    /unknown model/i.test(stderrSummary) ||
    /does not exist/i.test(stderrSummary) ||
    /pull.+model/i.test(stderrSummary);
  if (isModelMissing) {
    return "local model is missing; pull the selected model in Ollama and retry";
  }

  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return "local provider request timed out; check Ollama health and model load";
  }

  return undefined;
}

function terminateChildProcess(
  child: ChildProcessWithoutNullStreams,
  callbacks: EngineAdapterCallbacks,
): void {
  try {
    const killed = child.kill();
    if (!killed) {
      callbacks.onLog("system", "claw process was already exiting when stop was requested");
    }
  } catch (error) {
    callbacks.onLog(
      "system",
      `failed to terminate claw process: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildAbnormalProcessErrorMessage({
  error,
  repoRoot,
  clawCliPath,
}: {
  error: Error & { code?: string; path?: string };
  repoRoot: string;
  clawCliPath: string;
}): string {
  const code = error.code?.toUpperCase();
  const targetPath = error.path ?? "";

  if (code === "ENOENT") {
    return `abnormal exit (spawn failed / missing path): ${targetPath || clawCliPath}`;
  }
  if (code === "EACCES") {
    return `abnormal exit (spawn denied / permission): ${targetPath || clawCliPath}`;
  }
  if (targetPath && (targetPath.includes(repoRoot) || targetPath === clawCliPath)) {
    return `abnormal exit (path error): ${error.message}`;
  }
  return `abnormal exit (process error): ${error.message}`;
}
