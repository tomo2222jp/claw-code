// src/index.ts
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";

// src/adapters/claw-engine-adapter.ts
import { accessSync, constants } from "fs";
import path from "path";
import { spawn } from "child_process";
var ClawEngineAdapter = class {
  repoRoot;
  clawCliPath;
  clawCliArgsPrefix;
  constructor(options = {}) {
    this.repoRoot = options.repoRoot ?? resolveDefaultRepoRoot();
    this.clawCliPath = options.clawCliPath ?? resolveDefaultClawCliPath(this.repoRoot);
    this.clawCliArgsPrefix = options.clawCliArgsPrefix ?? [];
  }
  startRun(run, callbacks) {
    assertSpawnPrerequisites(this.repoRoot, this.clawCliPath);
    const webResults = run.webResults || [];
    const injectedPrompt = buildPrompt(run.prompt, run.projectMemory, run.attachments, run.role, webResults);
    const args = [
      ...this.clawCliArgsPrefix,
      "--output-format",
      "text",
      "--model",
      run.settings.activeModel,
      "--permission-mode",
      toCliPermissionMode(run.permissionMode),
      "prompt",
      injectedPrompt
    ];
    callbacks.onLog("system", `launching claw for run ${run.id}`);
    callbacks.onLog("system", `claw cwd: ${this.repoRoot}`);
    callbacks.onLog("system", `claw cli: ${this.clawCliPath}`);
    callbacks.onLog(
      "system",
      `claw settings: provider=${run.settings.activeProvider} model=${run.settings.activeModel} retryCount=${run.settings.retryCount}`
    );
    callbacks.onLog("system", `claw permission mode: ${run.permissionMode}`);
    callbacks.onLog(
      "system",
      "claw precedence: local-api execution settings override repo config for bridged fields"
    );
    if (run.attachments && run.attachments.length > 0) {
      callbacks.onLog("system", `[v1 injection] attachments acknowledged: ${run.attachments.length} image(s)`);
    }
    if (run.projectMemory) {
      const memoryKeys = [
        run.projectMemory.rules ? "rules" : "",
        run.projectMemory.decisions ? "decisions" : "",
        run.projectMemory.currentFocus ? "currentFocus" : "",
        run.projectMemory.pinnedItems ? "pinnedItems" : ""
      ].filter(Boolean);
      if (memoryKeys.length > 0) {
        callbacks.onLog("system", `[v1 injection] project memory applied: ${memoryKeys.join(", ")}`);
        const prioritized = prioritizeMemory(run.projectMemory);
        const pinnedCount = prioritized.pinnedItems?.length ?? 0;
        const focusCount = prioritized.currentFocus?.length ?? 0;
        const decisionsCount = prioritized.decisions?.length ?? 0;
        const rulesCount = prioritized.rules?.length ?? 0;
        callbacks.onLog(
          "system",
          `[v1 memory] prioritized memory applied: pinned=${pinnedCount} focus=${focusCount} decisions=${decisionsCount} rules=${rulesCount}`
        );
      }
    }
    if (run.role && run.role !== "default") {
      callbacks.onLog("system", `[v1 role] role applied: ${run.role}`);
    }
    if (webResults.length > 0) {
      callbacks.onLog("system", `[v1 web] search results applied: ${webResults.length} items`);
    }
    let child;
    try {
      child = spawn(this.clawCliPath, args, {
        cwd: this.repoRoot,
        env: buildChildEnv(run.settings),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      throw error;
    }
    let stoppingRequested = false;
    let terminalEmitted = false;
    let stdoutCapture = "";
    let stderrCapture = "";
    const stdoutState = { buffer: "" };
    const stderrState = { buffer: "" };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.on("spawn", () => {
      callbacks.onStatus("running");
    });
    child.stdout.on("data", (chunk) => {
      stdoutCapture += chunk;
      flushBufferedLines(chunk, stdoutState, (line) => callbacks.onLog("stdout", line));
    });
    child.stderr.on("data", (chunk) => {
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
        finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
        ...stoppingRequested ? {} : { errorMessage: `claw process error: ${error.message}` }
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
          finishedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        return;
      }
      if (code === 0) {
        callbacks.onLog("system", "claw process exited successfully");
        callbacks.onStatus("completed", {
          finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
          finalOutput: extractFinalOutput(stdoutCapture)
        });
        return;
      }
      callbacks.onLog("system", `claw process exited abnormally: ${describeExitReason(code, signal)}`);
      callbacks.onStatus("failed", {
        finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
        errorMessage: buildExitErrorMessage(code, signal, stderrCapture)
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
      }
    };
  }
};
function buildPrompt(userPrompt, projectMemory, attachments, role, webResults) {
  const parts = [];
  const prioritizedMemory = projectMemory ? prioritizeMemory(projectMemory) : void 0;
  const hasMemory = prioritizedMemory !== void 0 && Object.values(prioritizedMemory).some((v) => Array.isArray(v) && v.length > 0);
  const hasWebResults = webResults && webResults.length > 0;
  if (hasMemory || hasWebResults) {
    parts.push("You are working with the following context.");
  }
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
  if (hasWebResults) {
    const formattedResults = webResults.map(
      (result) => `- Title: ${result.title}
  Snippet: ${result.snippet}
  URL: ${result.url}`
    ).join("\n");
    parts.push(`Web search results:
${formattedResults}`);
  }
  if (attachments && attachments.length > 0) {
    const count = attachments.length;
    const label = count === 1 ? "1 image attachment is" : `${count} image attachments are`;
    parts.push(`Attached images:
- ${label} included with this request.`);
  }
  if (role && role !== "default") {
    parts.push(buildRoleGuidance(role));
  }
  if (parts.length === 0) {
    return userPrompt;
  }
  parts.push(`User request:
${userPrompt}`);
  return parts.join("\n\n");
}
function prioritizeMemory(memory) {
  if (!memory) {
    return memory;
  }
  const limits = {
    pinnedItems: 3,
    currentFocus: 3,
    decisions: 3,
    rules: 2
  };
  return {
    pinnedItems: memory.pinnedItems ? memory.pinnedItems.slice(0, limits.pinnedItems) : memory.pinnedItems,
    currentFocus: memory.currentFocus ? memory.currentFocus.slice(0, limits.currentFocus) : memory.currentFocus,
    decisions: memory.decisions ? memory.decisions.slice(0, limits.decisions) : memory.decisions,
    rules: memory.rules ? memory.rules.slice(0, limits.rules) : memory.rules
  };
}
function buildRoleGuidance(role) {
  switch (role) {
    case "planner":
      return "Role guidance (planner): Break the task into clear steps and outline an implementation sequence before writing code.";
    case "builder":
      return "Role guidance (builder): Implement the task directly and practically.";
    case "reviewer":
      return "Role guidance (reviewer): Identify risks, critique the approach, and validate correctness.";
  }
}
function resolveDefaultRepoRoot() {
  return path.resolve(process.cwd(), "../../..");
}
function resolveDefaultClawCliPath(repoRoot) {
  const explicit = process.env.CLAW_CLI_PATH;
  if (explicit) {
    return path.resolve(explicit);
  }
  const executableName = process.platform === "win32" ? "claw.exe" : "claw";
  return path.resolve(repoRoot, "rust", "target", "debug", executableName);
}
function assertSpawnPrerequisites(repoRoot, clawCliPath) {
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
function buildChildEnv(settings) {
  const homePath = process.env.HOME || process.env.USERPROFILE || (process.env.HOMEDRIVE && process.env.HOMEPATH ? `${process.env.HOMEDRIVE}${process.env.HOMEPATH}` : void 0);
  return {
    ...process.env,
    ...homePath ? { HOME: homePath } : {},
    CLAW_ACTIVE_PROVIDER_OVERRIDE: settings.activeProvider,
    CLAW_RETRY_COUNT_OVERRIDE: String(settings.retryCount),
    OPENAI_BASE_URL: settings.openaiBaseUrl,
    NO_COLOR: process.env.NO_COLOR || "1",
    CLICOLOR: "0"
  };
}
function toCliPermissionMode(permissionMode) {
  return permissionMode === "full_access" ? "danger-full-access" : "default";
}
function flushBufferedLines(chunk, state, emit) {
  state.buffer += chunk;
  let newlineIndex = state.buffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = state.buffer.slice(0, newlineIndex).replace(/\r$/, "");
    emit(line);
    state.buffer = state.buffer.slice(newlineIndex + 1);
    newlineIndex = state.buffer.indexOf("\n");
  }
}
function flushRemainder(state, emit) {
  if (!state.buffer.length) {
    return;
  }
  emit(state.buffer.replace(/\r$/, ""));
  state.buffer = "";
}
function normalizeFinalOutput(stdout) {
  const trimmed = stripAnsi(stdout).trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function extractFinalOutput(stdout) {
  const normalized = normalizeFinalOutput(stdout);
  if (!normalized) {
    return void 0;
  }
  const candidateBlocks = normalized.split(/\r?\n\r?\n+/).map((block) => block.trim()).filter(Boolean).filter((block) => !isNonAnswerBlock(block));
  return candidateBlocks.at(-1) ?? normalized;
}
function isNonAnswerBlock(block) {
  const firstLine = block.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return firstLine.startsWith("[active-model]") || firstLine.startsWith("warning:") || firstLine.startsWith("Run `claw --help`");
}
function stripAnsi(value) {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}
function buildExitErrorMessage(code, signal, trailingStderr) {
  const reason = describeExitReason(code, signal);
  const stderrSummary = summarizeStderr(trailingStderr);
  return stderrSummary ? `claw exited with ${reason}: ${stderrSummary}` : `claw exited with ${reason}`;
}
function describeExitReason(code, signal) {
  return code !== null ? `exit code ${code}` : signal ? `signal ${signal}` : "unknown termination";
}
function summarizeStderr(stderr) {
  const lines = stripAnsi(stderr).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return "";
  }
  const summary = lines.slice(0, 2).join(" | ");
  return summary.length > 280 ? `${summary.slice(0, 277)}...` : summary;
}
function terminateChildProcess(child, callbacks) {
  const killed = child.kill();
  if (!killed) {
    callbacks.onLog("system", "claw process was already exiting when stop was requested");
  }
}

// src/routes/health-routes.ts
async function registerHealthRoutes(app) {
  app.get("/api/health", async () => ({
    ok: true,
    service: "local-api",
    ts: (/* @__PURE__ */ new Date()).toISOString()
  }));
}

// src/routes/route-errors.ts
function sendApiError(reply, statusCode, code, message) {
  reply.code(statusCode);
  return {
    error: {
      code,
      message
    }
  };
}

// src/services/web-search-service.ts
function shouldTriggerWebSearch(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const englishKeywords = [
    "search",
    "latest",
    "news",
    "current",
    "today",
    "recent",
    "what's new",
    "whats new",
    "find out",
    "look up",
    "web search",
    "google",
    "check online"
  ];
  const japaneseKeywords = [
    "\u691C\u7D22",
    "\u63A2\u3057\u3066",
    "\u8ABF\u3079\u3066",
    "\u6700\u65B0",
    "\u30CB\u30E5\u30FC\u30B9",
    "\u4ECA\u65E5",
    "\u6700\u8FD1",
    "\u30AA\u30F3\u30E9\u30A4\u30F3",
    "\u30A6\u30A7\u30D6\u3067"
  ];
  if (englishKeywords.some((keyword) => lowerPrompt.includes(keyword))) {
    return true;
  }
  if (japaneseKeywords.some((keyword) => prompt.includes(keyword))) {
    return true;
  }
  return false;
}
async function performWebSearch(query, options = {}) {
  const { maxResults = 3, apiKey } = options;
  if (!apiKey) {
    return [];
  }
  try {
    const results = await fetchSearchResults(query, apiKey, maxResults);
    return results;
  } catch (error) {
    console.error("Web search error:", error);
    return [];
  }
}
async function fetchSearchResults(query, apiKey, maxResults) {
  return [];
}

// src/routes/run-routes.ts
async function registerRunRoutes(app, context) {
  app.post("/api/run", async (request, reply) => {
    if (!request.body?.prompt?.trim()) {
      return sendApiError(reply, 400, "invalid_run_request", "prompt must not be empty");
    }
    try {
      const settings = await context.settingsService.getSettings();
      const trimmedPrompt = request.body.prompt.trim();
      let webResults = [];
      if (shouldTriggerWebSearch(trimmedPrompt)) {
        webResults = await performWebSearch(trimmedPrompt, {
          maxResults: 3,
          // In production, API key would come from environment or settings
          apiKey: process.env.WEB_SEARCH_API_KEY
        });
      }
      const run = context.runService.startRun(
        {
          prompt: trimmedPrompt,
          permissionMode: normalizePermissionMode(request.body?.permissionMode),
          attachments: request.body.attachments,
          projectMemory: request.body.projectMemory,
          role: normalizeRole(request.body?.role),
          webResults
        },
        settings
      );
      reply.code(202);
      return { id: run.id, status: run.status };
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "run_start_failed",
        error instanceof Error ? error.message : "failed to start run"
      );
    }
  });
  app.get("/api/run/:id/status", async (request, reply) => {
    try {
      const run = context.runService.getRunStatus(request.params.id);
      if (!run) {
        return sendApiError(reply, 404, "run_not_found", "run not found");
      }
      return run;
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "run_status_failed",
        error instanceof Error ? error.message : "failed to read run status"
      );
    }
  });
  app.get("/api/run/:id/logs", async (request, reply) => {
    try {
      const logs = context.runService.getLogs(request.params.id);
      if (!logs) {
        return sendApiError(reply, 404, "run_not_found", "run not found");
      }
      return { id: request.params.id, logs };
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "run_logs_failed",
        error instanceof Error ? error.message : "failed to read run logs"
      );
    }
  });
  app.post("/api/run/:id/stop", async (request, reply) => {
    try {
      const run = context.runService.stopRun(request.params.id);
      if (!run) {
        return sendApiError(reply, 404, "run_not_found", "run not found");
      }
      return {
        id: run.id,
        status: run.status,
        finishedAt: run.finishedAt
      };
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "run_stop_failed",
        error instanceof Error ? error.message : "failed to stop run"
      );
    }
  });
}
function normalizePermissionMode(value) {
  return value === "full_access" ? "full_access" : "default";
}
function normalizeRole(value) {
  const valid = ["planner", "builder", "reviewer"];
  return valid.includes(value) ? value : "default";
}

// src/routes/settings-routes.ts
async function registerSettingsRoutes(app, context) {
  app.get("/api/settings", async (_request, reply) => {
    try {
      return await context.settingsService.getSettings();
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "settings_read_failed",
        error instanceof Error ? error.message : "failed to read settings"
      );
    }
  });
  app.post("/api/settings", async (request, reply) => {
    try {
      const saved = await context.settingsService.saveSettings(request.body);
      reply.code(200);
      return saved;
    } catch (error) {
      return sendApiError(
        reply,
        500,
        "settings_save_failed",
        error instanceof Error ? error.message : "failed to save settings"
      );
    }
  });
}

// src/services/run-service.ts
import { randomUUID } from "crypto";
var RunService = class {
  constructor(adapter) {
    this.adapter = adapter;
  }
  adapter;
  runs = /* @__PURE__ */ new Map();
  logs = /* @__PURE__ */ new Map();
  activeRuns = /* @__PURE__ */ new Map();
  startRun(request, settings) {
    const run = {
      id: randomUUID(),
      prompt: request.prompt,
      status: "starting",
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.runs.set(run.id, run);
    this.logs.set(run.id, []);
    try {
      const handle = this.adapter.startRun(
        {
          ...run,
          permissionMode: request.permissionMode ?? "default",
          settings,
          attachments: request.attachments,
          projectMemory: request.projectMemory,
          role: request.role,
          webResults: request.webResults
        },
        {
          onStatus: (status, patch) => {
            this.updateRun(run.id, status, patch);
            if (isTerminalStatus(status)) {
              this.activeRuns.delete(run.id);
            }
          },
          onLog: (stream, message) => {
            this.appendLog(run.id, { ts: (/* @__PURE__ */ new Date()).toISOString(), stream, message });
          }
        }
      );
      this.activeRuns.set(run.id, { handle });
      return this.getRun(run.id);
    } catch (error) {
      this.activeRuns.delete(run.id);
      this.logs.delete(run.id);
      this.runs.delete(run.id);
      throw error;
    }
  }
  getRun(id) {
    return this.runs.get(id);
  }
  getRunStatus(id) {
    const run = this.runs.get(id);
    if (!run) {
      return void 0;
    }
    return {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      finalOutput: run.finalOutput,
      errorMessage: run.errorMessage
    };
  }
  getLogs(id) {
    return this.logs.get(id);
  }
  stopRun(id) {
    const current = this.runs.get(id);
    if (!current) {
      return void 0;
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
  updateRun(id, status, patch) {
    const current = this.runs.get(id);
    if (!current) {
      return;
    }
    this.runs.set(id, {
      ...current,
      status,
      ...patch
    });
  }
  appendLog(id, entry) {
    const existing = this.logs.get(id) ?? [];
    existing.push(entry);
    this.logs.set(id, existing);
  }
};
function isTerminalStatus(status) {
  return status === "completed" || status === "failed" || status === "stopped";
}

// src/services/settings-service.ts
import { mkdir, readFile, writeFile } from "fs/promises";
import path2 from "path";
var DEFAULT_SETTINGS = {
  activeProvider: "openrouter",
  activeModel: "openai/gpt-oss-120b:free",
  retryCount: 2,
  openaiBaseUrl: "https://openrouter.ai/api/v1"
};
var SettingsService = class {
  constructor(filePath) {
    this.filePath = filePath;
  }
  filePath;
  async getSettings() {
    await this.ensureStorageDir();
    try {
      const raw = await readFile(this.filePath, "utf8");
      return {
        ...DEFAULT_SETTINGS,
        ...JSON.parse(raw)
      };
    } catch (error) {
      if (isMissingFileError(error)) {
        await this.saveSettings(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      }
      throw error;
    }
  }
  async saveSettings(settings) {
    await this.ensureStorageDir();
    await writeFile(this.filePath, `${JSON.stringify(settings, null, 2)}
`, "utf8");
    return settings;
  }
  async ensureStorageDir() {
    await mkdir(path2.dirname(this.filePath), { recursive: true });
  }
};
function isMissingFileError(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function resolveSettingsFilePath() {
  return path2.resolve(process.cwd(), "data", "settings.json");
}

// src/index.ts
var port = Number.parseInt(process.env.PORT ?? "4000", 10);
var host = process.env.HOST ?? "127.0.0.1";
async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(fastifyCors, {
    origin: true
  });
  const context = {
    settingsService: new SettingsService(resolveSettingsFilePath()),
    runService: new RunService(new ClawEngineAdapter())
  };
  await registerHealthRoutes(app);
  await registerSettingsRoutes(app, context);
  await registerRunRoutes(app, context);
  return app;
}
async function main() {
  const app = await buildServer();
  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}
void main();
