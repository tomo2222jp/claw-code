import type { RunStatus } from "../../../../shared/contracts/index.js";

import { StatusBadge } from "../components/status-badge.js";

type RunPageProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  onRun: () => Promise<void>;
  onStop: () => Promise<void>;
  running: boolean;
  canStop: boolean;
  runId: string | null;
  status: RunStatus | "idle" | "start-failed";
  statusLabel: string;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string | null;
  finalOutput?: string;
};

export function RunPage({
  prompt,
  onPromptChange,
  onRun,
  onStop,
  running,
  canStop,
  runId,
  status,
  statusLabel,
  startedAt,
  finishedAt,
  errorMessage,
  finalOutput,
}: RunPageProps) {
  return (
    <section className="panel">
      <h2>Run</h2>
      <label className="field">
        <span>Prompt</span>
        <textarea
          rows={8}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Type a prompt to send to local-api"
        />
      </label>
      <div className="actions">
        <button onClick={() => void onRun()} disabled={running || !prompt.trim()} type="button">
          {running ? "Running..." : "Run"}
        </button>
        <button onClick={() => void onStop()} disabled={!canStop} type="button">
          Stop
        </button>
      </div>
      <dl className="details">
        <div>
          <dt>Run ID</dt>
          <dd>{runId ?? "-"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={status} />
            <span className="detail-subcopy">{statusLabel}</span>
          </dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{startedAt ?? "-"}</dd>
        </div>
        <div>
          <dt>Finished</dt>
          <dd>{finishedAt ?? "-"}</dd>
        </div>
      </dl>
      {errorMessage ? (
        <div className="callout error">
          <h3>Run Error</h3>
          <p>{errorMessage}</p>
          <p className="hint">Detailed stdout and stderr lines remain available in the Logs tab.</p>
        </div>
      ) : null}
      <div className="output">
        <h3>Final Output</h3>
        <pre>{finalOutput || "No final output yet. During real runs, use the Logs tab for detailed progress."}</pre>
      </div>
    </section>
  );
}
