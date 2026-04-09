import type { RunStatus } from "../../../../shared/contracts/index.js";

const STATUS_LABELS: Record<RunStatus | "start-failed", string> = {
  idle: "Idle",
  starting: "Starting",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  stopped: "Stopped",
  "start-failed": "Start Failed",
};

type StatusBadgeProps = {
  status: RunStatus | "start-failed";
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge ${status}`}>{STATUS_LABELS[status]}</span>;
}
