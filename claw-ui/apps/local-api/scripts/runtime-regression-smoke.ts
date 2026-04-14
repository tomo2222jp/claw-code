import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import type { AppSettings, RunStatus } from "../../../shared/contracts/index.js";
import type {
  EngineAdapter,
  EngineAdapterCallbacks,
  EngineAdapterRun,
  RunningEngineHandle,
} from "../src/adapters/engine-adapter.js";
import { RunService } from "../src/services/run-service.js";

const SETTINGS: AppSettings = {
  activeProvider: "openrouter",
  activeModel: "openai/test-model",
  retryCount: 0,
  openaiBaseUrl: "https://example.invalid/v1",
  stopTimeoutMs: 8_000,
};

async function main(): Promise<void> {
  await testSynchronousTerminalBeforeReturnDoesNotRemainActive();
  await testStopTransition();
  await testAbnormalExit();
  await testStopTimeoutFallback();
  await testReverseAndDuplicateTransitionGuard();
  await testStopRaceNormalizesCompletedToStopped();
  console.log("[runtime-regression] all checks passed");
}

async function testSynchronousTerminalBeforeReturnDoesNotRemainActive(): Promise<void> {
  const adapter = new ScriptedAdapter({
    onStart(callbacks) {
      callbacks.onStatus("completed", { finishedAt: new Date().toISOString() });
      return { stop() {} };
    },
  });

  const service = new RunService(adapter);
  const run = service.startRun({ prompt: "sync terminal" }, SETTINGS);
  assert.equal(run.status, "completed");
  assert.equal((service as any).activeRuns.has(run.id), false);
}

async function testStopTransition(): Promise<void> {
  const adapter = new ScriptedAdapter({
    onStart(callbacks) {
      callbacks.onStatus("running");
      return {
        stop() {
          callbacks.onStatus("stopping");
          setTimeout(() => {
            callbacks.onStatus("stopped", { finishedAt: new Date().toISOString() });
          }, 20);
        },
      };
    },
  });

  const service = new RunService(adapter);
  const run = service.startRun({ prompt: "stop transition" }, SETTINGS);
  assert.ok(run.status === "starting" || run.status === "running");

  await delay(5);
  const beforeStop = service.getRunStatus(run.id);
  assert.equal(beforeStop?.status, "running");

  const afterStopRequest = service.stopRun(run.id);
  assert.equal(afterStopRequest?.status, "stopping");

  await delay(30);
  const terminal = service.getRunStatus(run.id);
  assert.equal(terminal?.status, "stopped");
}

async function testAbnormalExit(): Promise<void> {
  const adapter = new ScriptedAdapter({
    onStart(callbacks) {
      callbacks.onStatus("running");
      setTimeout(() => {
        callbacks.onStatus("abnormal_exit", {
          finishedAt: new Date().toISOString(),
          errorMessage: "abnormal exit (process error): simulated",
        });
      }, 10);
      return { stop() {} };
    },
  });

  const service = new RunService(adapter);
  const run = service.startRun({ prompt: "abnormal" }, SETTINGS);

  await delay(20);
  const terminal = service.getRunStatus(run.id);
  assert.equal(terminal?.status, "abnormal_exit");
  assert.match(terminal?.errorMessage ?? "", /abnormal exit/i);
}

async function testStopTimeoutFallback(): Promise<void> {
  const adapter = new ScriptedAdapter({
    onStart(callbacks) {
      callbacks.onStatus("running");
      return {
        stop() {
          // Intentionally does not emit any terminal status.
        },
      };
    },
  });

  const service = new RunService(adapter);
  const run = service.startRun(
    { prompt: "timeout" },
    {
      ...SETTINGS,
      stopTimeoutMs: 120,
    },
  );
  await delay(5);
  const afterStopRequest = service.stopRun(run.id);
  assert.equal(afterStopRequest?.status, "stopping");

  await delay(170);
  const terminal = service.getRunStatus(run.id);
  assert.equal(terminal?.status, "failed");
  assert.match(terminal?.errorMessage ?? "", /stop timed out/i);
}

async function testReverseAndDuplicateTransitionGuard(): Promise<void> {
  const adapter = new ScriptedAdapter({
    onStart(callbacks) {
      callbacks.onStatus("running");
      callbacks.onStatus("running");
      callbacks.onStatus("completed", { finishedAt: new Date().toISOString() });
      callbacks.onStatus("running");
      return { stop() {} };
    },
  });

  const service = new RunService(adapter);
  const run = service.startRun({ prompt: "guard" }, SETTINGS);
  await delay(10);

  const terminal = service.getRunStatus(run.id);
  assert.equal(terminal?.status, "completed");
  assert.ok(terminal?.finishedAt);
}

async function testStopRaceNormalizesCompletedToStopped(): Promise<void> {
  const adapter = new ScriptedAdapter({
    onStart(callbacks) {
      callbacks.onStatus("running");
      return {
        stop() {
          setTimeout(() => {
            callbacks.onStatus("completed", { finishedAt: new Date().toISOString() });
          }, 10);
        },
      };
    },
  });

  const service = new RunService(adapter);
  const run = service.startRun({ prompt: "race" }, SETTINGS);
  await delay(5);
  const stopping = service.stopRun(run.id);
  assert.equal(stopping?.status, "stopping");

  await delay(30);
  const terminal = service.getRunStatus(run.id);
  assert.equal(terminal?.status, "stopped");
}

class ScriptedAdapter implements EngineAdapter {
  constructor(
    private readonly script: {
      onStart: (callbacks: EngineAdapterCallbacks, run: EngineAdapterRun) => RunningEngineHandle;
    },
  ) {}

  startRun(run: EngineAdapterRun, callbacks: EngineAdapterCallbacks): RunningEngineHandle {
    return this.script.onStart(callbacks, run);
  }
}

void main().catch((error) => {
  console.error("[runtime-regression] failed");
  console.error(error);
  process.exitCode = 1;
});
