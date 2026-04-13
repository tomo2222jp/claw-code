import path from "node:path";

import type { EngineAdapter, EngineAdapterCallbacks, EngineAdapterRun, RunningEngineHandle } from "./engine-adapter.js";
import { runPromptOnly, runToolEnabled } from "./execution-engine.js";

type DirectApiEngineAdapterOptions = {
  clawCliPath?: string;
  repoRoot?: string;
};

export class DirectApiEngineAdapter implements EngineAdapter {
  private readonly repoRoot: string;
  private readonly clawCliPath: string;

  constructor(options: DirectApiEngineAdapterOptions = {}) {
    this.repoRoot = options.repoRoot ?? path.resolve(process.cwd(), "../../..");
    const explicit = process.env.CLAW_CLI_PATH;
    this.clawCliPath =
      options.clawCliPath ??
      (explicit
        ? path.resolve(explicit)
        : path.resolve(
            this.repoRoot,
            "rust",
            "target",
            "debug",
            process.platform === "win32" ? "claw.exe" : "claw",
          ));
  }

  startRun(run: EngineAdapterRun, callbacks: EngineAdapterCallbacks): RunningEngineHandle {
    if (run.settings.enableTools) {
      return runToolEnabled(run, callbacks, {
        clawCliPath: this.clawCliPath,
        repoRoot: this.repoRoot,
      });
    }
    return runPromptOnly(run, callbacks);
  }
}
