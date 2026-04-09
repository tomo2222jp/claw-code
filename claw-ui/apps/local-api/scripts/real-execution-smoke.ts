import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ClawEngineAdapter } from "../src/adapters/claw-engine-adapter.js";
import type { EngineAdapterRun } from "../src/adapters/engine-adapter.js";

type ScenarioStatus = "passed" | "failed" | "skipped";

type ScenarioResult = {
  name: string;
  status: ScenarioStatus;
  details: string;
};

type RunOutcome = {
  status: "completed" | "failed" | "stopped";
  errorMessage?: string;
  finalOutput?: string;
  logs: Array<{ stream: "stdout" | "stderr" | "system"; message: string }>;
};

const BASE_SETTINGS: EngineAdapterRun["settings"] = {
  activeProvider: "openrouter",
  activeModel: "openai/test-model-from-local-api",
  retryCount: 7,
  openaiBaseUrl: "https://example.invalid/v1",
};

async function main(): Promise<void> {
  const results: ScenarioResult[] = [];

  results.push(await runMissingBinaryScenario());
  results.push(await runFixtureCompletedScenario());
  results.push(await runFixtureFailedScenario());
  results.push(await runFixtureStopScenario());
  results.push(await runRealAuthMissingScenario());
  results.push(await runRealInvalidModelScenario());
  results.push(await runRealCompletedScenario());

  for (const result of results) {
    console.log(`[${result.status}] ${result.name}: ${result.details}`);
  }

  if (results.some((result) => result.status === "failed")) {
    process.exitCode = 1;
  }
}

async function runMissingBinaryScenario(): Promise<ScenarioResult> {
  const missingPath = path.join(os.tmpdir(), "claw-ui-missing-binary-do-not-create.exe");
  const adapter = new ClawEngineAdapter({ clawCliPath: missingPath });
  try {
    await runAdapter(adapter, {
      id: "missing-binary",
      prompt: "ignored",
      settings: BASE_SETTINGS,
    });
    return fail("missing claw binary", "expected startRun to fail before a run started");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("claw cli is not readable")
      ? pass("missing claw binary", message)
      : fail("missing claw binary", `unexpected error: ${message}`);
  }
}

async function runFixtureCompletedScenario(): Promise<ScenarioResult> {
  const fixture = await createFixtureExecutable("completed");
  try {
    const outcome = await runAdapter(
      new ClawEngineAdapter({
        clawCliPath: process.execPath,
        clawCliArgsPrefix: [fixture.scriptPath],
      }),
      {
        id: "fixture-completed",
        prompt: "fixture prompt",
        settings: BASE_SETTINGS,
      },
    );
    if (outcome.status !== "completed") {
      return fail("fixture completed run", `expected completed, got ${outcome.status}`);
    }
    if (outcome.finalOutput !== "Final fixture answer") {
      return fail(
        "fixture completed run",
        `expected final output to be extracted, got ${JSON.stringify(outcome.finalOutput)}`,
      );
    }
    return pass("fixture completed run", "completed and extracted the final stdout block");
  } finally {
    await fixture.cleanup();
  }
}

async function runFixtureFailedScenario(): Promise<ScenarioResult> {
  const fixture = await createFixtureExecutable("failed");
  try {
    const outcome = await runAdapter(
      new ClawEngineAdapter({
        clawCliPath: process.execPath,
        clawCliArgsPrefix: [fixture.scriptPath],
      }),
      {
        id: "fixture-failed",
        prompt: "fixture prompt",
        settings: BASE_SETTINGS,
      },
    );
    if (outcome.status !== "failed") {
      return fail("fixture failed run", `expected failed, got ${outcome.status}`);
    }
    if (!outcome.errorMessage?.includes("fixture failure")) {
      return fail(
        "fixture failed run",
        `expected summarized stderr in error message, got ${JSON.stringify(outcome.errorMessage)}`,
      );
    }
    return pass("fixture failed run", outcome.errorMessage);
  } finally {
    await fixture.cleanup();
  }
}

async function runFixtureStopScenario(): Promise<ScenarioResult> {
  const fixture = await createFixtureExecutable("slow");
  try {
    const outcome = await runAdapter(
      new ClawEngineAdapter({
        clawCliPath: process.execPath,
        clawCliArgsPrefix: [fixture.scriptPath],
      }),
      {
        id: "fixture-stop",
        prompt: "fixture prompt",
        settings: BASE_SETTINGS,
      },
      {
        stopWhenRunning: true,
      },
    );
    if (outcome.status !== "stopped") {
      return fail("fixture stop during running", `expected stopped, got ${outcome.status}`);
    }
    return pass("fixture stop during running", "stop request won the terminal state");
  } finally {
    await fixture.cleanup();
  }
}

async function runRealAuthMissingScenario(): Promise<ScenarioResult> {
  return withEnvUnset(["OPENAI_API_KEY"], async () => {
    const outcome = await runAdapter(new ClawEngineAdapter(), {
      id: "real-auth-missing",
      prompt: "reply with READY only",
      settings: BASE_SETTINGS,
    });
    if (outcome.status !== "failed") {
      return fail("real auth missing", `expected failed, got ${outcome.status}`);
    }
    const stderrText = outcome.logs
      .filter((entry) => entry.stream === "stderr")
      .map((entry) => entry.message)
      .join("\n");
    return stderrText.includes("missing OpenAI credentials")
      ? pass("real auth missing", "failed with the expected auth message")
      : fail("real auth missing", "missing OpenAI credentials message was not observed");
  });
}

async function runRealInvalidModelScenario(): Promise<ScenarioResult> {
  if (!process.env.OPENAI_API_KEY) {
    return skip(
      "real invalid model",
      "set OPENAI_API_KEY to exercise a provider-backed invalid model failure",
    );
  }

  const outcome = await runAdapter(new ClawEngineAdapter(), {
    id: "real-invalid-model",
    prompt: "reply with READY only",
    settings: {
      ...BASE_SETTINGS,
      activeModel: "openai/not-a-real-model-for-local-api-smoke",
      openaiBaseUrl: "https://openrouter.ai/api/v1",
    },
  });

  return outcome.status === "failed"
    ? pass("real invalid model", outcome.errorMessage ?? "failed as expected")
    : fail("real invalid model", `expected failed, got ${outcome.status}`);
}

async function runRealCompletedScenario(): Promise<ScenarioResult> {
  if (process.env.LOCAL_API_SMOKE_RUN_COMPLETED !== "1") {
    return skip(
      "real completed run",
      "set LOCAL_API_SMOKE_RUN_COMPLETED=1 (and valid credentials) to run a live completion check",
    );
  }

  const liveModel = process.env.LOCAL_API_SMOKE_MODEL;
  if (!liveModel) {
    return skip("real completed run", "set LOCAL_API_SMOKE_MODEL to a known-good model");
  }

  const liveBaseUrl = process.env.LOCAL_API_SMOKE_BASE_URL;
  if (!liveBaseUrl) {
    return skip("real completed run", "set LOCAL_API_SMOKE_BASE_URL for the live provider endpoint");
  }

  if (!process.env.OPENAI_API_KEY) {
    return skip("real completed run", "set OPENAI_API_KEY before running the live completion check");
  }

  const outcome = await runAdapter(new ClawEngineAdapter(), {
    id: "real-completed",
    prompt: "Reply with READY only.",
    settings: {
      ...BASE_SETTINGS,
      activeModel: liveModel,
      openaiBaseUrl: liveBaseUrl,
    },
  });

  return outcome.status === "completed"
    ? pass(
        "real completed run",
        `completed with final output ${JSON.stringify(outcome.finalOutput ?? "<empty>")}`,
      )
    : fail("real completed run", outcome.errorMessage ?? `expected completed, got ${outcome.status}`);
}

async function runAdapter(
  adapter: ClawEngineAdapter,
  run: EngineAdapterRun,
  options: { stopWhenRunning?: boolean } = {},
): Promise<RunOutcome> {
  return new Promise<RunOutcome>((resolve, reject) => {
    const logs: RunOutcome["logs"] = [];
    let resolved = false;
    let handle: { stop: () => void } | undefined;

    try {
      handle = adapter.startRun(run, {
        onStatus: (status, patch) => {
          if (options.stopWhenRunning && status === "running" && handle) {
            setTimeout(() => handle?.stop(), 100);
          }
          if (status === "completed" || status === "failed" || status === "stopped") {
            if (!resolved) {
              resolved = true;
              resolve({
                status,
                errorMessage: patch?.errorMessage,
                finalOutput: patch?.finalOutput,
                logs,
              });
            }
          }
        },
        onLog: (stream, message) => {
          logs.push({ stream, message });
        },
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function createFixtureExecutable(mode: "completed" | "failed" | "slow"): Promise<{
  scriptPath: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "claw-ui-real-execution-smoke-"));
  const scriptPath = path.join(root, "fixture.mjs");

  await writeFile(
    scriptPath,
    [
      "const mode = process.env.CLAW_ADAPTER_FIXTURE_MODE;",
      "const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
      "process.stdout.write('fixture boot\\n');",
      "if (mode === 'completed') {",
      "  process.stdout.write('\\nFinal fixture answer\\n');",
      "  process.exit(0);",
      "}",
      "if (mode === 'failed') {",
      "  process.stderr.write('fixture failure: invalid fixture model\\n');",
      "  process.exit(1);",
      "}",
      "if (mode === 'slow') {",
      "  process.stdout.write('fixture running\\n');",
      "  await delay(5000);",
      "  process.stdout.write('\\nSlow fixture answer\\n');",
      "  process.exit(0);",
      "}",
      "process.stderr.write(`unknown fixture mode: ${mode}\\n`);",
      "process.exit(2);",
    ].join("\n"),
    "utf8",
  );
  process.env.CLAW_ADAPTER_FIXTURE_MODE = mode;

  return {
    scriptPath,
    cleanup: async () => {
      delete process.env.CLAW_ADAPTER_FIXTURE_MODE;
      await rm(root, { force: true, recursive: true });
    },
  };
}

async function withEnvUnset<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
  const original = new Map<string, string | undefined>();
  for (const key of keys) {
    original.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function pass(name: string, details: string): ScenarioResult {
  return { name, status: "passed", details };
}

function fail(name: string, details: string): ScenarioResult {
  return { name, status: "failed", details };
}

function skip(name: string, details: string): ScenarioResult {
  return { name, status: "skipped", details };
}

void main();
