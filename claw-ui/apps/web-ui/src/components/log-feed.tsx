import type { LogEntry, RunStatus } from "../../../../shared/contracts/index.js";

type LogFeedProps = {
  logs: LogEntry[];
  status: RunStatus | "idle";
};

const STREAM_LABELS: Record<LogEntry["stream"], string> = {
  system: "System",
  stdout: "Stdout",
  stderr: "Stderr",
};

export function LogFeed({ logs, status }: LogFeedProps) {
  if (logs.length === 0) {
    return (
      <div className="logs-empty">
        <p className="hint">No logs yet.</p>
        <p className="hint">
          {status === "idle"
            ? "Start a run to see system, stdout, and stderr activity here."
            : "The run has started, but no log lines have arrived yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="logs">
      {logs.map((entry, index) => (
        <div className={`log-row ${entry.stream}`} key={`${entry.ts}-${entry.stream}-${index}`}>
          <div className="log-row-header">
            <span className="log-meta">{entry.ts}</span>
            <span className={`log-stream ${entry.stream}`}>{STREAM_LABELS[entry.stream]}</span>
          </div>
          <pre className="log-message">{entry.message}</pre>
        </div>
      ))}
    </div>
  );
}
