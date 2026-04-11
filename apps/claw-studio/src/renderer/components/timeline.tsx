import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ProjectMemoryCandidateKind,
  ProjectMemorySuggestion,
  TimelineEvent,
} from "../store/studio-store.js";
import { useI18n } from "../i18n/index.js";
import { TimelineEventCard } from "./timeline-event.js";

type TimelineProps = {
  events: TimelineEvent[];
  suggestions: ProjectMemorySuggestion[];
  onCaptureMemory: (
    kind: ProjectMemoryCandidateKind,
    event: Extract<TimelineEvent, { type: "user_message" | "assistant_message" | "final_output" }>,
  ) => void;
  onStageSuggestion: (suggestion: ProjectMemorySuggestion) => void;
};

type VisibleTimelineEvent = Exclude<
  TimelineEvent,
  | { type: "run_started" }
  | { type: "log_stdout" }
  | { type: "log_stderr" }
  | { type: "log_stderr_meta" }
  | { type: "log_system" }
  | { type: "system_note" }
>;

type TimelineRenderItem =
  | {
      kind: "event";
      event: VisibleTimelineEvent;
    }
  | {
      kind: "run_status";
      event: Extract<TimelineEvent, { type: "run_status" }>;
      details: TimelineEvent[];
      summary?: string;
    };

export function Timeline({ events, suggestions, onCaptureMemory, onStageSuggestion }: TimelineProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const [expandedRunIds, setExpandedRunIds] = useState<Record<string, boolean>>({});
  const sessionKey = useMemo(() => events[0]?.sessionId ?? "empty", [events]);
  const renderItems = useMemo(() => buildRenderItems(events), [events]);
  const suggestionsByEventId = useMemo(
    () =>
      suggestions.reduce<Record<string, ProjectMemorySuggestion[]>>((accumulator, suggestion) => {
        if (!suggestion.sourceTimelineEventId) {
          return accumulator;
        }
        const current = accumulator[suggestion.sourceTimelineEventId] ?? [];
        current.push(suggestion);
        accumulator[suggestion.sourceTimelineEventId] = current;
        return accumulator;
      }, {}),
    [suggestions],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    if (isPinnedToBottom) {
      element.scrollTop = element.scrollHeight;
    }
  }, [isPinnedToBottom, renderItems]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
    setIsPinnedToBottom(true);
    setExpandedRunIds({});
  }, [sessionKey]);

  if (renderItems.length === 0) {
    return (
      <section className="timeline-empty">
        <h2>{t("timeline.emptyTitle")}</h2>
        <p>{t("timeline.emptyBody")}</p>
      </section>
    );
  }

  return (
    <div className="timeline-shell">
      <section
        ref={containerRef}
        className="timeline"
        onScroll={(event) => {
          const element = event.currentTarget;
          const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
          setIsPinnedToBottom(distanceFromBottom < 32);
        }}
      >
        {renderItems.map((item) => (
          <TimelineEventCard
            key={item.event.id}
            event={item.event}
            memorySuggestions={item.kind === "event" ? suggestionsByEventId[item.event.id] ?? [] : []}
            onCaptureMemory={item.kind === "event" ? onCaptureMemory : undefined}
            onStageSuggestion={item.kind === "event" ? onStageSuggestion : undefined}
            isDetailsOpen={item.kind === "run_status" ? Boolean(expandedRunIds[item.event.runId]) : undefined}
            onToggleDetails={
              item.kind === "run_status"
                ? () =>
                    setExpandedRunIds((current) => ({
                      ...current,
                      [item.event.runId]: !current[item.event.runId],
                    }))
                : undefined
            }
            runDetails={item.kind === "run_status" ? item.details : undefined}
            summary={item.kind === "run_status" ? item.summary : undefined}
          />
        ))}
      </section>
      {!isPinnedToBottom ? (
        <button
          className="jump-latest-button"
          onClick={() => {
            const element = containerRef.current;
            if (!element) {
              return;
            }
            element.scrollTop = element.scrollHeight;
            setIsPinnedToBottom(true);
          }}
          type="button"
        >
          {t("timeline.jumpLatest")}
        </button>
      ) : null}
    </div>
  );
}

function buildRenderItems(events: TimelineEvent[]): TimelineRenderItem[] {
  const detailsByRunId = new Map<string, TimelineEvent[]>();
  const summaryByRunId = new Map<string, string>();
  const items: TimelineRenderItem[] = [];

  for (const event of events) {
    switch (event.type) {
      case "user_message":
      case "assistant_message":
      case "final_output":
        items.push({ kind: "event", event });
        break;
      case "run_status":
        items.push({
          kind: "run_status",
          event,
          details: detailsByRunId.get(event.runId) ?? [],
          summary: summaryByRunId.get(event.runId),
        });
        break;
      case "error":
        if (event.runId) {
          const current = detailsByRunId.get(event.runId) ?? [];
          current.push(event);
          detailsByRunId.set(event.runId, current);
          if (!summaryByRunId.has(event.runId)) {
            summaryByRunId.set(event.runId, event.message);
          }
        } else {
          items.push({ kind: "event", event });
        }
        break;
      case "run_started":
      case "log_stdout":
      case "log_stderr":
      case "log_stderr_meta":
      case "log_system":
      case "system_note":
        if ("runId" in event) {
          const current = detailsByRunId.get(event.runId) ?? [];
          current.push(event);
          detailsByRunId.set(event.runId, current);
        }
        break;
    }
  }

  return items.map((item) =>
    item.kind === "run_status"
      ? {
          ...item,
          details: detailsByRunId.get(item.event.runId) ?? [],
          summary: summaryByRunId.get(item.event.runId),
        }
      : item,
  );
}
