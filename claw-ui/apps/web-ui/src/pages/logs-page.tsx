import { useDeferredValue, useMemo, useState } from "react";

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
  const [search, setSearch] = useState("");
  const [streamFilter, setStreamFilter] = useState<LogEntry["stream"] | "all">("all");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const counts = logs.reduce(
    (accumulator, entry) => {
      accumulator[entry.stream] += 1;
      return accumulator;
    },
    { system: 0, stdout: 0, stderr: 0 },
  );
  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (streamFilter !== "all" && entry.stream !== streamFilter) {
        return false;
      }
      if (!deferredSearch) {
        return true;
      }
      return entry.message.toLowerCase().includes(deferredSearch);
    });
  }, [deferredSearch, logs, streamFilter]);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Logs</h2>
          <p className="hint">Search and narrow the current run without losing raw stdout or stderr detail.</p>
        </div>
      </div>
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
      <div className="log-controls">
        <label className="field">
          <span>Search log lines</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by message text"
          />
        </label>
        <div className="segmented-control" role="tablist" aria-label="Log stream filter">
          {(["all", "system", "stdout", "stderr"] as const).map((option) => (
            <button
              key={option}
              className={option === streamFilter ? "segmented-option active" : "segmented-option"}
              onClick={() => setStreamFilter(option)}
              type="button"
            >
              {option === "all" ? "All streams" : option}
            </button>
          ))}
        </div>
        <p className="hint">
          Showing {filteredLogs.length} of {logs.length} lines
        </p>
      </div>
      {pollingError ? <p className="message error">{pollingError}</p> : null}
      <div className="log-legend" aria-label="Log stream legend">
        <span className="legend-pill system">System lifecycle and adapter notes</span>
        <span className="legend-pill stdout">Process standard output</span>
        <span className="legend-pill stderr">Process standard error and failures</span>
      </div>
      <LogFeed logs={filteredLogs} status={status} emptyMessage={buildEmptyMessage(logs.length, search, streamFilter)} />
    </section>
  );
}

function buildEmptyMessage(
  totalLogCount: number,
  search: string,
  streamFilter: LogEntry["stream"] | "all",
): string | undefined {
  if (totalLogCount === 0) {
    return undefined;
  }

  if (!search.trim() && streamFilter === "all") {
    return undefined;
  }

  return "No log lines match the current filters. Clear the search or switch streams to widen the view.";
}
