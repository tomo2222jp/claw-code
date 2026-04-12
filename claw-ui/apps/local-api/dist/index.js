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
    const webResults = run.webResults ?? [];
    const gitResults = run.gitResults ?? [];
    const toolMode = run.settings.llmSettings?.toolMode ?? "enabled";
    const isPromptOnly = toolMode === "disabled";
    const injectedPrompt = buildPrompt(
      run.prompt,
      run.projectMemory,
      run.attachments,
      run.role,
      webResults,
      gitResults
    );
    const args = [
      ...this.clawCliArgsPrefix,
      "--output-format",
      "text",
      "--model",
      run.settings.activeModel
    ];
    if (isPromptOnly) {
      args.push("--dangerously-skip-permissions");
    } else {
      args.push("--permission-mode", toCliPermissionMode(run.permissionMode));
    }
    args.push("prompt", injectedPrompt);
    callbacks.onLog("system", `launching claw for run ${run.id}`);
    callbacks.onLog("system", `claw cwd: ${this.repoRoot}`);
    callbacks.onLog("system", `claw cli: ${this.clawCliPath}`);
    callbacks.onLog(
      "system",
      `claw settings: provider=${run.settings.activeProvider} model=${run.settings.activeModel} retryCount=${run.settings.retryCount}`
    );
    callbacks.onLog("system", `execution path: ${isPromptOnly ? "prompt-only" : "tool-enabled"}`);
    if (!isPromptOnly) {
      callbacks.onLog("system", `claw permission mode: ${run.permissionMode}`);
    }
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
        const pinnedCount = prioritized?.pinnedItems?.length ?? 0;
        const focusCount = prioritized?.currentFocus?.length ?? 0;
        const decisionsCount = prioritized?.decisions?.length ?? 0;
        const rulesCount = prioritized?.rules?.length ?? 0;
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
    if (gitResults.length > 0) {
      callbacks.onLog("system", `[v1 git] repo context applied: ${gitResults.length} items`);
    }
    let child;
    try {
      child = spawn(this.clawCliPath, args, {
        cwd: this.repoRoot,
        env: buildChildEnv(run.settings),
        // Use a piped stdin to keep types consistent; we still never write to it.
        stdio: ["pipe", "pipe", "pipe"],
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
      const abnormalError = buildAbnormalProcessErrorMessage({
        error,
        repoRoot: this.repoRoot,
        clawCliPath: this.clawCliPath
      });
      callbacks.onLog("system", `claw process error: ${abnormalError}`);
      callbacks.onStatus(stoppingRequested ? "stopped" : "abnormal_exit", {
        finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
        ...stoppingRequested ? {} : { errorMessage: abnormalError }
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
      callbacks.onStatus("abnormal_exit", {
        finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
        errorMessage: buildExitErrorMessage(code, signal, stderrCapture, run.settings)
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
      }
    };
  }
};
function buildPrompt(userPrompt, projectMemory, attachments, role, webResults, gitResults) {
  const parts = [];
  const prioritizedMemory = projectMemory ? prioritizeMemory(projectMemory) : void 0;
  const hasMemory = prioritizedMemory !== void 0 && Object.values(prioritizedMemory).some((v) => Array.isArray(v) && v.length > 0);
  const hasWebResults = webResults && webResults.length > 0;
  const hasGitResults = gitResults && gitResults.length > 0;
  if (hasMemory || hasWebResults || hasGitResults) {
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
  if (hasGitResults) {
    const formattedResults = gitResults.map((result) => `- Path: ${result.path}
  Excerpt: ${result.excerpt}`).join("\n");
    parts.push(`Repository context:
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
    ...settings.apiKey ? { OPENAI_API_KEY: settings.apiKey } : {},
    NO_COLOR: process.env.NO_COLOR || "1",
    CLICOLOR: "0"
  };
}
function toCliPermissionMode(permissionMode) {
  return permissionMode === "full_access" ? "danger-full-access" : "workspace-write";
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
  const toolMessage = extractToolMessage(normalized);
  if (toolMessage) {
    return toolMessage;
  }
  const candidateBlocks = normalized.split(/\r?\n\r?\n+/).map((block) => block.trim()).filter(Boolean).filter((block) => !isNonAnswerBlock(block));
  return candidateBlocks.at(-1) ?? normalized;
}
function extractToolMessage(normalized) {
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const jsonMessageLine = [...lines].reverse().find((line) => /^\{"message":".+","status":"[^"]+"\}$/.test(line));
  if (jsonMessageLine) {
    try {
      const parsed = JSON.parse(jsonMessageLine);
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
    }
  }
  const plainTextLine = [...lines].reverse().find(
    (line) => line !== "Done" && line !== "\u2714 \u2728 Done" && !line.startsWith("[active-model]") && !line.startsWith("{") && !line.startsWith("}") && !line.includes('"sentAt"') && !line.includes('"attachments"') && !line.includes('"message"') && !line.startsWith("SendUserMessage") && !line.includes("Thinking...")
  );
  return plainTextLine;
}
function isNonAnswerBlock(block) {
  const firstLine = block.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return firstLine.startsWith("[active-model]") || firstLine.startsWith("warning:") || firstLine.startsWith("Run `claw --help`");
}
function stripAnsi(value) {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}
function buildExitErrorMessage(code, signal, trailingStderr, settings) {
  const reason = describeExitReason(code, signal);
  const stderrSummary = summarizeStderr(trailingStderr);
  const base = signal ? `abnormal exit (process signal): ${reason}` : `abnormal exit (non-zero code): ${reason}`;
  const provider = settings.activeProvider;
  const localHint = buildLocalProviderHint(stderrSummary, provider);
  if (localHint) {
    return `${base}: ${localHint}`;
  }
  return stderrSummary ? `${base}: ${stderrSummary}` : base;
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
function isLocalProvider(provider) {
  return provider === "ollama" || provider.startsWith("ollama");
}
function buildLocalProviderHint(stderrSummary, provider) {
  if (!stderrSummary) {
    return void 0;
  }
  if (!isLocalProvider(provider)) {
    return void 0;
  }
  const normalized = stderrSummary.toLowerCase();
  const isOllamaUnreachable = normalized.includes("econnrefused") || normalized.includes("connection refused") || normalized.includes("failed to connect") || normalized.includes("connect error") || normalized.includes("127.0.0.1:11434") || normalized.includes("localhost:11434");
  if (isOllamaUnreachable) {
    return "local provider is unreachable; start Ollama and retry";
  }
  const isModelMissing = /model.+not found/i.test(stderrSummary) || /unknown model/i.test(stderrSummary) || /does not exist/i.test(stderrSummary) || /pull.+model/i.test(stderrSummary);
  if (isModelMissing) {
    return "local model is missing; pull the selected model in Ollama and retry";
  }
  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return "local provider request timed out; check Ollama health and model load";
  }
  return void 0;
}
function terminateChildProcess(child, callbacks) {
  try {
    const killed = child.kill();
    if (!killed) {
      callbacks.onLog("system", "claw process was already exiting when stop was requested");
    }
  } catch (error) {
    callbacks.onLog(
      "system",
      `failed to terminate claw process: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
function buildAbnormalProcessErrorMessage({
  error,
  repoRoot,
  clawCliPath
}) {
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

// src/services/git-read-service.ts
import { execFile } from "child_process";
import fs from "fs";
import path2 from "path";
import readline from "readline";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
var MAX_RESULTS = 3;
var MAX_EXCERPT_LINES = 35;
var MAX_EXCERPT_CHARS = 4e3;
var MIN_SEARCH_TERM_LEN = 8;
function shouldTriggerGitRead(prompt) {
  const lower = prompt.toLowerCase();
  const englishTriggers = [
    "read file",
    "check code",
    "inspect file",
    "inspect this file",
    "inspect code",
    "look at file",
    "look at this file"
  ];
  const japaneseTriggers = ["\u30D5\u30A1\u30A4\u30EB\u898B\u3066", "\u30B3\u30FC\u30C9\u898B\u3066", "\u3053\u306E\u30D5\u30A1\u30A4\u30EB", "\u30EA\u30DD\u30B8\u30C8\u30EA\u898B\u3066"];
  return englishTriggers.some((k) => lower.includes(k)) || japaneseTriggers.some((k) => prompt.includes(k));
}
async function readRepoContext(query) {
  const repoRoot = await resolveRepoRoot(process.cwd());
  if (!repoRoot) return [];
  const results = [];
  const explicitPaths = extractExplicitFilePaths(query);
  const fileNameHints = extractFileNameHints(query);
  for (const p of explicitPaths) {
    const tracked = await resolveTrackedPath(repoRoot, p);
    if (!tracked) continue;
    const excerpt = await readBoundedExcerpt(repoRoot, tracked);
    if (!excerpt) continue;
    results.push({ path: tracked, excerpt });
    if (results.length >= MAX_RESULTS) return results;
  }
  if (results.length < MAX_RESULTS && fileNameHints.length > 0) {
    const trackedFiles = await listTrackedFiles(repoRoot);
    for (const name of fileNameHints) {
      const matches = trackedFiles.filter(
        (p) => p.toLowerCase().endsWith(`/${name.toLowerCase()}`)
      );
      for (const match of matches) {
        if (results.some((r) => r.path === match)) continue;
        const excerpt = await readBoundedExcerpt(repoRoot, match);
        if (!excerpt) continue;
        results.push({ path: match, excerpt });
        if (results.length >= MAX_RESULTS) return results;
      }
    }
  }
  if (results.length < MAX_RESULTS) {
    const terms = extractSearchTerms(query);
    const hits = await findFirstHits(repoRoot, terms, MAX_RESULTS);
    for (const hit of hits) {
      if (results.some((r) => r.path === hit.filePath)) continue;
      const excerpt = await readBoundedExcerpt(repoRoot, hit.filePath, hit.line);
      if (!excerpt) continue;
      results.push({ path: hit.filePath, excerpt });
      if (results.length >= MAX_RESULTS) return results;
    }
  }
  return results.slice(0, MAX_RESULTS);
}
async function resolveRepoRoot(cwd) {
  try {
    const stdout = await git(["rev-parse", "--show-toplevel"], cwd);
    const repoRoot = stdout.trim();
    if (!repoRoot) return null;
    return repoRoot;
  } catch {
    return null;
  }
}
async function git(args, cwd) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    encoding: "utf8"
  });
  return stdout ?? "";
}
function extractExplicitFilePaths(prompt) {
  const candidates = /* @__PURE__ */ new Set();
  const tokenRegexes = [
    /`([^`]+)`/g,
    /"([^"]+)"/g,
    /'([^']+)'/g,
    /\b([A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+)\b/g
  ];
  for (const re of tokenRegexes) {
    for (const match of prompt.matchAll(re)) {
      const raw = (match[1] ?? "").trim();
      const normalized = raw.replaceAll("\\", "/").replaceAll(/^\.?\//, "");
      if (!normalized || normalized.length > 240) continue;
      if (!normalized.includes(".") || normalized.endsWith(".")) continue;
      if (isUnsafeRelativePath(normalized)) continue;
      candidates.add(normalized);
    }
  }
  return Array.from(candidates).slice(0, 5);
}
function extractFileNameHints(prompt) {
  const candidates = /* @__PURE__ */ new Set();
  const re = /\b([A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|json|md|css|txt|yml|yaml|toml|rs|py|go))\b/g;
  for (const match of prompt.matchAll(re)) {
    const name = (match[1] ?? "").trim();
    if (!name) continue;
    candidates.add(name);
  }
  return Array.from(candidates).slice(0, 5);
}
function extractSearchTerms(prompt) {
  const lower = prompt.toLowerCase();
  const stripped = lower.replaceAll(/`[^`]+`/g, " ").replaceAll(/"[^"]+"/g, " ").replaceAll(/'[^']+'/g, " ").replaceAll(/[^\p{L}\p{N}_\-./\s]/gu, " ");
  const stop = /* @__PURE__ */ new Set([
    "read",
    "file",
    "check",
    "code",
    "inspect",
    "look",
    "at",
    "the",
    "repo",
    "repository",
    "please",
    "show",
    "me"
  ]);
  const tokens = stripped.split(/\s+/).map((t) => t.trim()).filter(Boolean).filter((t) => !stop.has(t)).filter((t) => t.length >= 4).slice(0, 6);
  return tokens.slice(0, 3);
}
async function resolveTrackedPath(repoRoot, relPath) {
  if (!relPath) return null;
  if (isUnsafeRelativePath(relPath)) return null;
  try {
    const out = await git(["ls-files", "--", relPath], repoRoot);
    const candidate = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
    return candidate || null;
  } catch {
    return null;
  }
}
async function listTrackedFiles(repoRoot) {
  try {
    const out = await git(["ls-files"], repoRoot);
    return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
async function findFirstHits(repoRoot, terms, maxFiles) {
  const hits = [];
  const seen = /* @__PURE__ */ new Set();
  for (const term of terms) {
    const t = term.trim();
    if (!t) continue;
    if (t.length < MIN_SEARCH_TERM_LEN) continue;
    const batch = await gitGrepFirstHits(repoRoot, t, maxFiles);
    for (const hit of batch) {
      if (seen.has(hit.filePath)) continue;
      seen.add(hit.filePath);
      hits.push(hit);
      if (hits.length >= maxFiles) return hits;
    }
  }
  return hits;
}
async function gitGrepFirstHits(repoRoot, term, maxFiles) {
  try {
    const out = await git(
      ["grep", "-n", "-I", "-F", "-m", String(maxFiles), term],
      repoRoot
    );
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.map((line) => {
      const firstColon = line.indexOf(":");
      const secondColon = firstColon >= 0 ? line.indexOf(":", firstColon + 1) : -1;
      if (firstColon < 0 || secondColon < 0) return null;
      const filePath = line.slice(0, firstColon).trim().replaceAll("\\", "/");
      const lineNoRaw = line.slice(firstColon + 1, secondColon).trim();
      const lineNo = Number.parseInt(lineNoRaw, 10);
      if (!filePath || !Number.isFinite(lineNo) || lineNo <= 0) return null;
      return { filePath, line: lineNo };
    }).filter((v) => Boolean(v)).slice(0, maxFiles);
  } catch {
    return [];
  }
}
async function readBoundedExcerpt(repoRoot, relPath, matchLine) {
  if (!relPath) return null;
  if (isUnsafeRelativePath(relPath)) return null;
  const abs = safeResolveInside(repoRoot, relPath);
  if (!abs) return null;
  try {
    const stat = fs.statSync(abs);
    if (stat.size > 2e6) {
      return null;
    }
  } catch {
    return null;
  }
  const startLine = matchLine ? Math.max(1, matchLine - 10) : 1;
  const endLine = matchLine ? matchLine + 24 : MAX_EXCERPT_LINES;
  const excerptLines = await readLineRange(abs, startLine, endLine, MAX_EXCERPT_LINES);
  const rendered = excerptLines.map(({ no, text }) => `${String(no).padStart(4, " ")}| ${text}`).join("\n").trimEnd();
  if (!rendered) return null;
  return rendered.length > MAX_EXCERPT_CHARS ? `${rendered.slice(0, MAX_EXCERPT_CHARS - 3)}...` : rendered;
}
async function readLineRange(absPath, startLine, endLine, maxLines) {
  const lines = [];
  const stream = fs.createReadStream(absPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let current = 0;
  try {
    for await (const line of rl) {
      current += 1;
      if (current < startLine) continue;
      if (current > endLine) break;
      lines.push({ no: current, text: String(line).replace(/\r$/, "") });
      if (lines.length >= maxLines) break;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return lines;
}
function safeResolveInside(repoRoot, relPath) {
  const resolved = path2.resolve(repoRoot, relPath);
  const root = path2.resolve(repoRoot);
  const a = resolved.toLowerCase();
  const b = root.toLowerCase();
  if (!a.startsWith(b)) return null;
  return resolved;
}
function isUnsafeRelativePath(relPath) {
  const p = relPath.replaceAll("\\", "/").trim();
  if (!p) return true;
  if (p.includes("..")) return true;
  if (p.startsWith("/")) return true;
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  return false;
}

// src/services/tool-context-service.ts
async function collectToolContext(prompt, options = {}) {
  const { webApiKey, webMaxResults = 3 } = options;
  const results = [];
  if (shouldTriggerWebSearch(prompt)) {
    const items = await performWebSearch(prompt, {
      maxResults: webMaxResults,
      apiKey: webApiKey
    });
    results.push({ kind: "web", items });
  }
  if (shouldTriggerGitRead(prompt)) {
    const items = await readRepoContext(prompt);
    results.push({ kind: "git", items });
  }
  return results;
}

// src/services/llm-settings-resolution.ts
var OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
var GOOGLE_OPENAI_COMPAT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
var OPENAI_BASE_URL = "https://api.openai.com/v1";
function resolveExecutionSettings(settings) {
  const next = resolveFromLlmSettings(settings.llmSettings);
  if (!next) {
    return settings;
  }
  const resolvedOpenaiBaseUrl = resolveOpenaiBaseUrlForProvider(
    next.provider,
    settings.openaiBaseUrl
  );
  return {
    ...settings,
    activeProvider: next.provider,
    activeModel: next.modelId,
    ...resolvedOpenaiBaseUrl ? { openaiBaseUrl: resolvedOpenaiBaseUrl } : {},
    llmSettings: {
      ...settings.llmSettings,
      executionMode: next.executionMode,
      provider: next.provider,
      modelId: next.modelId,
      toolMode: next.toolMode
    }
  };
}
function isLocalProvider2(provider) {
  return provider === "ollama" || provider.startsWith("ollama");
}
function resolveToolMode(provider, explicit) {
  if (explicit === "enabled" || explicit === "disabled") {
    return explicit;
  }
  return provider === "openrouter" ? "disabled" : "enabled";
}
function resolveFromLlmSettings(llmSettings) {
  if (!llmSettings) {
    return void 0;
  }
  const provider = typeof llmSettings.provider === "string" ? llmSettings.provider.trim().toLowerCase() : "";
  const modelId = typeof llmSettings.modelId === "string" ? llmSettings.modelId.trim() : "";
  if (!provider || !modelId) {
    return void 0;
  }
  let executionMode = llmSettings.executionMode;
  if (executionMode !== "cloud" && executionMode !== "local") {
    executionMode = isLocalProvider2(provider) ? "local" : "cloud";
  }
  const toolMode = resolveToolMode(provider, llmSettings.toolMode);
  return {
    provider,
    modelId,
    toolMode,
    executionMode
  };
}
function resolveOpenaiBaseUrlForProvider(provider, currentBaseUrl) {
  if (provider === "google") {
    return GOOGLE_OPENAI_COMPAT_BASE_URL;
  }
  if (provider === "openrouter") {
    return OPENROUTER_BASE_URL;
  }
  if (provider === "openai") {
    return OPENAI_BASE_URL;
  }
  if (provider === "anthropic") {
    return currentBaseUrl;
  }
  return currentBaseUrl;
}

// src/routes/run-routes.ts
async function registerRunRoutes(app, context) {
  app.post("/api/run", async (request, reply) => {
    if (!request.body?.prompt?.trim()) {
      return sendApiError(reply, 400, "invalid_run_request", "prompt must not be empty");
    }
    try {
      const settings = await context.settingsService.getSettings();
      const executionSettings = resolveExecutionSettings(settings);
      const trimmedPrompt = request.body.prompt.trim();
      let webResults = [];
      let gitResults = [];
      const toolContext = await collectToolContext(trimmedPrompt, {
        webApiKey: process.env.WEB_SEARCH_API_KEY,
        webMaxResults: 3
      });
      for (const ctx of toolContext) {
        if (ctx.kind === "web") {
          webResults = ctx.items;
        } else if (ctx.kind === "git") {
          gitResults = ctx.items;
        }
      }
      const run = context.runService.startRun(
        {
          prompt: trimmedPrompt,
          permissionMode: normalizePermissionMode(request.body?.permissionMode),
          attachments: request.body.attachments,
          projectMemory: request.body.projectMemory,
          role: normalizeRole(request.body?.role),
          webResults,
          gitResults
        },
        executionSettings
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
    if (!isValidStopTimeoutMs(request.body.stopTimeoutMs)) {
      return sendApiError(
        reply,
        400,
        "invalid_settings",
        "stopTimeoutMs must be an integer between 100 and 600000"
      );
    }
    if (!isValidLlmSettings(request.body.llmSettings)) {
      return sendApiError(
        reply,
        400,
        "invalid_settings",
        "llmSettings must include executionMode/provider/modelId with valid optional fallback/profile fields"
      );
    }
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
function isValidStopTimeoutMs(value) {
  if (value === void 0) {
    return true;
  }
  return Number.isInteger(value) && value >= 100 && value <= 6e5;
}
function isValidLlmSettings(value) {
  if (value === void 0) {
    return true;
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const llm = value;
  const hasCoreFields = (llm.executionMode === "cloud" || llm.executionMode === "local") && typeof llm.provider === "string" && llm.provider.trim().length > 0 && typeof llm.modelId === "string" && llm.modelId.trim().length > 0;
  if (!hasCoreFields) {
    return false;
  }
  if (llm.fallbackProvider !== void 0 && typeof llm.fallbackProvider !== "string") {
    return false;
  }
  if (llm.fallbackModelId !== void 0 && typeof llm.fallbackModelId !== "string") {
    return false;
  }
  if (llm.profile !== void 0 && llm.profile !== "standard" && llm.profile !== "local" && llm.profile !== "advanced") {
    return false;
  }
  return true;
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
  stopTimeoutMs = 8e3;
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
          webResults: request.webResults,
          gitResults: request.gitResults
        },
        {
          onStatus: (status, patch) => {
            this.updateRun(run.id, status, patch);
            if (isTerminalStatus(status)) {
              this.clearStopTimeout(run.id);
              this.activeRuns.delete(run.id);
            }
          },
          onLog: (stream, message) => {
            this.appendLog(run.id, { ts: (/* @__PURE__ */ new Date()).toISOString(), stream, message });
          }
        }
      );
      const latest = this.runs.get(run.id);
      if (latest && !isTerminalStatus(latest.status)) {
        this.activeRuns.set(run.id, {
          handle,
          stopTimeoutMs: resolveStopTimeoutMs(settings.stopTimeoutMs, this.stopTimeoutMs)
        });
      }
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
      this.updateRun(id, "abnormal_exit", {
        finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
        errorMessage: "run process handle is missing while run is still active"
      });
      return this.runs.get(id);
    }
    if (current.status !== "stopping") {
      this.updateRun(id, "stopping");
    }
    try {
      active.handle.stop();
      this.armStopTimeout(id);
    } catch (error) {
      this.clearStopTimeout(id);
      this.appendLog(id, {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        stream: "system",
        message: `stop request failed: ${error instanceof Error ? error.message : String(error)}`
      });
      this.updateRun(id, "failed", {
        finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
        errorMessage: error instanceof Error ? error.message : "failed to stop run"
      });
      this.activeRuns.delete(id);
    }
    return this.runs.get(id);
  }
  updateRun(id, status, patch) {
    const current = this.runs.get(id);
    if (!current) {
      return;
    }
    if (!canTransition(current.status, status)) {
      return;
    }
    if (current.status === status && patch?.finalOutput === void 0 && patch?.errorMessage === void 0 && patch?.finishedAt === void 0) {
      return;
    }
    const nextStatus = normalizeTerminalFromStopping(current.status, status);
    if (current.status === nextStatus && !patch) {
      return;
    }
    this.runs.set(id, {
      ...current,
      status: nextStatus,
      ...patch
    });
  }
  appendLog(id, entry) {
    const existing = this.logs.get(id) ?? [];
    existing.push(entry);
    this.logs.set(id, existing);
  }
  armStopTimeout(id) {
    const active = this.activeRuns.get(id);
    if (!active) {
      return;
    }
    this.clearStopTimeout(id);
    active.stopTimeoutId = setTimeout(() => {
      const run = this.runs.get(id);
      if (!run || run.status !== "stopping") {
        return;
      }
      this.appendLog(id, {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        stream: "system",
        message: `stop timeout reached after ${active.stopTimeoutMs}ms`
      });
      this.updateRun(id, "failed", {
        finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
        errorMessage: "stop timed out before process termination"
      });
      this.activeRuns.delete(id);
    }, active.stopTimeoutMs);
  }
  clearStopTimeout(id) {
    const active = this.activeRuns.get(id);
    if (!active?.stopTimeoutId) {
      return;
    }
    clearTimeout(active.stopTimeoutId);
    active.stopTimeoutId = void 0;
  }
};
function resolveStopTimeoutMs(override, fallback) {
  if (!Number.isFinite(override)) {
    return fallback;
  }
  const ms = Math.trunc(override);
  if (ms < 100 || ms > 6e5) {
    return fallback;
  }
  return ms;
}
function isTerminalStatus(status) {
  return status === "completed" || status === "failed" || status === "abnormal_exit" || status === "stopped";
}
function canTransition(current, next) {
  if (current === next) {
    return true;
  }
  if (isTerminalStatus(current)) {
    return false;
  }
  switch (current) {
    case "idle":
      return next === "starting";
    case "starting":
      return next === "running" || next === "stopping" || next === "stopped" || next === "completed" || next === "failed" || next === "abnormal_exit";
    case "running":
      return next === "stopping" || next === "stopped" || next === "completed" || next === "failed" || next === "abnormal_exit";
    case "stopping":
      return next === "stopped" || next === "completed" || next === "failed" || next === "abnormal_exit";
    case "completed":
    case "failed":
    case "abnormal_exit":
    case "stopped":
      return false;
  }
}
function normalizeTerminalFromStopping(current, next) {
  if (current === "stopping" && next === "completed") {
    return "stopped";
  }
  return next;
}

// src/services/settings-service.ts
import { mkdir, readFile, writeFile } from "fs/promises";
import path3 from "path";
var DEFAULT_SETTINGS = {
  activeProvider: "google",
  activeModel: "gemini-2.5-flash",
  retryCount: 2,
  openaiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
  stopTimeoutMs: 8e3,
  llmSettings: {
    executionMode: "cloud",
    provider: "google",
    modelId: "gemini-2.5-flash",
    profile: "standard"
  }
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
    await mkdir(path3.dirname(this.filePath), { recursive: true });
  }
};
function isMissingFileError(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function resolveSettingsFilePath() {
  return path3.resolve(process.cwd(), "data", "settings.json");
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
