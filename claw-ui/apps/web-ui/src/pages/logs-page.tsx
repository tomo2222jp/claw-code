import type { LogEntry, RunStatus } from "../../../../shared/contracts/index.js";

import { LogFeed } from "../components/log-feed.js";
import { StatusBadge } from "../components/status-badge.js";

type LogsPageProps = {
  runId: string | null;
  status: RunStatus | "idle";
  logs: LogEntry[];
  pollingError: string | null;
};

export function LogsPage({ runId, status, logs, pollingError }: LogsPageProps) {
  const counts = logs.reduce(
    (accumulator, entry) => {
      accumulator[entry.stream] += 1;
      return accumulator;
    },
    { system: 0, stdout: 0, stderr: 0 },
  );

  return (
    <section className="panel">
      <h2>Logs</h2>
      <div className="logs-toolbar">
        <p className="hint">Polling interval: 2 seconds</p>
        <div className="log-summary">
          <div>
            <span className="hint">Current run</span>
            <strong>{runId ?? "-"}</strong>
          </div>
          <div>
            <span className="hint">Run state</span>
            <StatusBadge status={status} />
          </div>
          <div>
            <span className="hint">System</span>
            <strong>{counts.system}</strong>
          </div>
          <div>
            <span className="hint">Stdout</span>
            <strong>{counts.stdout}</strong>
          </div>
          <div>
            <span className="hint">Stderr</span>
            <strong>{counts.stderr}</strong>
          </div>
        </div>
      </div>
      {pollingError ? <p className="message error">{pollingError}</p> : null}
      <div className="log-legend" aria-label="Log stream legend">
        <span className="legend-pill system">System lifecycle and adapter notes</span>
        <span className="legend-pill stdout">Process standard output</span>
        <span className="legend-pill stderr">Process standard error and failures</span>
      </div>
      <LogFeed logs={logs} status={status} />
    </section>
  );
}
