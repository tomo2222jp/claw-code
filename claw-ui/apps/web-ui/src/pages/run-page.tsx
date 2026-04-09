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
  logCount: number;
  latestLogAt?: string;
  onOpenLogs: () => void;
  onOpenSettings: () => void;
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
  logCount,
  latestLogAt,
  onOpenLogs,
  onOpenSettings,
}: RunPageProps) {
  const promptLength = prompt.trim().length;

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Run</h2>
          <p className="hint">
            Start and stop a local-api owned run. Detailed process output remains in Logs.
          </p>
        </div>
        <div className="panel-actions">
          <button className="secondary-button" onClick={onOpenSettings} type="button">
            Review Settings
          </button>
          <button className="secondary-button" onClick={onOpenLogs} type="button">
            Open Logs
          </button>
        </div>
      </div>
      <label className="field">
        <span className="field-label">
          <span>Prompt</span>
          <span className="hint">{promptLength} characters</span>
        </span>
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
        <button className="danger-button" onClick={() => void onStop()} disabled={!canStop} type="button">
          Stop
        </button>
      </div>
      <div className="callout">
        <h3>Operator Notes</h3>
        <p>Saved local-api settings are authoritative for bridged execution fields on runs started here.</p>
        <p>Use Logs to inspect stdout, stderr, and stop behavior while the run is active.</p>
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
          <dd>{formatDateTime(startedAt)}</dd>
        </div>
        <div>
          <dt>Finished</dt>
          <dd>{formatDateTime(finishedAt)}</dd>
        </div>
        <div>
          <dt>Log Lines</dt>
          <dd>{logCount}</dd>
        </div>
        <div>
          <dt>Latest Activity</dt>
          <dd>{formatDateTime(latestLogAt)}</dd>
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

function formatDateTime(value?: string): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}
