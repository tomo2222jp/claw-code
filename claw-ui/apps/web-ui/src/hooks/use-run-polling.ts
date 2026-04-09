import { useEffect, useRef, useState } from "react";

import { getRunLogs, getRunStatus } from "../api/client.js";
import type { LogEntry } from "../../../../shared/contracts/index.js";
import type { RunStatusResponse } from "../types/ui.js";

const POLL_INTERVAL_MS = 2000;

export function useRunPolling(runId: string | null) {
  const [status, setStatus] = useState<RunStatusResponse | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    requestGenerationRef.current += 1;
    const generation = requestGenerationRef.current;

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!runId) {
      setStatus(null);
      setLogs([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled || generation !== requestGenerationRef.current) {
        return;
      }
      try {
        const [nextStatus, nextLogs] = await Promise.all([
          getRunStatus(runId),
          getRunLogs(runId),
        ]);
        if (cancelled || generation !== requestGenerationRef.current) {
          return;
        }
        setStatus(nextStatus);
        setLogs(nextLogs.logs);
        setError(null);

        const isTerminal =
          nextStatus.status === "completed" ||
          nextStatus.status === "failed" ||
          nextStatus.status === "stopped";

        if (!isTerminal) {
          timeoutRef.current = window.setTimeout(() => {
            void tick();
          }, POLL_INTERVAL_MS);
        }
      } catch (nextError) {
        if (!cancelled && generation === requestGenerationRef.current) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
          timeoutRef.current = window.setTimeout(() => {
            void tick();
          }, POLL_INTERVAL_MS);
        }
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [runId]);

  return { status, logs, error };
}
