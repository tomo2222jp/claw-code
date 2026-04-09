import type { EngineAdapter, EngineAdapterCallbacks, EngineAdapterRun, RunningEngineHandle } from "./engine-adapter.js";

export class StubEngineAdapter implements EngineAdapter {
  startRun(run: EngineAdapterRun, callbacks: EngineAdapterCallbacks): RunningEngineHandle {
    let stopped = false;
    const timers: NodeJS.Timeout[] = [];

    const schedule = (delayMs: number, fn: () => void) => {
      const timer = setTimeout(() => {
        if (!stopped) {
          fn();
        }
      }, delayMs);
      timers.push(timer);
    };

    callbacks.onLog("system", `stub run ${run.id} created`);
    callbacks.onStatus("starting");

    schedule(150, () => {
      callbacks.onLog("stdout", "stub adapter booting");
      callbacks.onStatus("running");
    });

    schedule(350, () => {
      callbacks.onLog("stdout", `processing prompt: ${run.prompt}`);
    });

    schedule(700, () => {
      callbacks.onLog("stdout", "stub adapter completed");
      callbacks.onStatus("completed", {
        finishedAt: new Date().toISOString(),
        finalOutput: `Stub response for: ${run.prompt}`,
      });
    });

    return {
      stop: () => {
        if (stopped) {
          return;
        }
        stopped = true;
        for (const timer of timers) {
          clearTimeout(timer);
        }
        callbacks.onLog("system", `stub run ${run.id} stopped`);
        callbacks.onStatus("stopped", {
          finishedAt: new Date().toISOString(),
        });
      },
    };
  }
}
