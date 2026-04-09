import { accessSync, constants } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type {
  EngineAdapter,
  EngineAdapterCallbacks,
  EngineAdapterRun,
  RunningEngineHandle,
} from "./engine-adapter.js";

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

    const args = [
      ...this.clawCliArgsPrefix,
      "--output-format",
      "text",
      "--model",
      run.settings.activeModel,
      "--permission-mode",
      "danger-full-access",
      "prompt",
      run.prompt,
    ];

    callbacks.onLog("system", `launching claw for run ${run.id}`);
    callbacks.onLog("system", `claw cwd: ${this.repoRoot}`);
    callbacks.onLog("system", `claw cli: ${this.clawCliPath}`);
    callbacks.onLog(
      "system",
      `claw settings: provider=${run.settings.activeProvider} model=${run.settings.activeModel} retryCount=${run.settings.retryCount}`,
    );
    callbacks.onLog(
      "system",
      "claw precedence: local-api execution settings override repo config for bridged fields",
    );

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(this.clawCliPath, args, {
        cwd: this.repoRoot,
        env: buildChildEnv(run.settings),
        stdio: ["ignore", "pipe", "pipe"],
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
      callbacks.onLog("system", `claw process error: ${error.message}`);
      callbacks.onStatus(stoppingRequested ? "stopped" : "failed", {
        finishedAt: new Date().toISOString(),
        ...(stoppingRequested ? {} : { errorMessage: `claw process error: ${error.message}` }),
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
      callbacks.onStatus("failed", {
        finishedAt: new Date().toISOString(),
        errorMessage: buildExitErrorMessage(code, signal, stderrCapture),
      });
    });

    return {
      stop: () => {
        if (terminalEmitted || stoppingRequested) {
          return;
        }
        stoppingRequested = true;
        callbacks.onLog("system", `stop requested for claw run ${run.id}`);
        terminateChildProcess(child, callbacks);
      },
    };
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
    NO_COLOR: process.env.NO_COLOR || "1",
    CLICOLOR: "0",
  };
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

  const candidateBlocks = normalized
    .split(/\r?\n\r?\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !isNonAnswerBlock(block));

  return candidateBlocks.at(-1) ?? normalized;
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
): string {
  const reason = describeExitReason(code, signal);
  const stderrSummary = summarizeStderr(trailingStderr);
  return stderrSummary ? `claw exited with ${reason}: ${stderrSummary}` : `claw exited with ${reason}`;
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

function terminateChildProcess(
  child: ChildProcessWithoutNullStreams,
  callbacks: EngineAdapterCallbacks,
): void {
  const killed = child.kill();
  if (!killed) {
    callbacks.onLog("system", "claw process was already exiting when stop was requested");
  }
}
