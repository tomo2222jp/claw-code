import { useState } from "react";

import type {
  ProjectMemoryCandidateKind,
  ProjectMemorySuggestion,
  TimelineEvent,
} from "../store/studio-store.js";
import { useI18n, type MessageKey } from "../i18n/index.js";
import { StatusPill } from "./status-pill.js";

type CapturableTimelineEvent = Extract<
  TimelineEvent,
  { type: "user_message" | "assistant_message" | "final_output" }
>;

type TimelineEventProps = {
  event: TimelineEvent;
  memorySuggestions?: ProjectMemorySuggestion[];
  runDetails?: TimelineEvent[];
  isDetailsOpen?: boolean;
  onToggleDetails?: () => void;
  onCaptureMemory?: (kind: ProjectMemoryCandidateKind, event: CapturableTimelineEvent) => void;
  onStageSuggestion?: (suggestion: ProjectMemorySuggestion) => void;
  summary?: string;
};

export function TimelineEventCard({
  event,
  memorySuggestions = [],
  runDetails = [],
  isDetailsOpen = false,
  onToggleDetails,
  onCaptureMemory,
  onStageSuggestion,
  summary,
}: TimelineEventProps) {
  const { t } = useI18n();
  const timeLabel = formatTimestamp(event.createdAt);
  const detailGroups = groupRunDetails(runDetails);

  switch (event.type) {
    case "user_message":
      return (
        <article className="timeline-user-wrap" title={timeLabel}>
          <div className="timeline-user">
            <TimelineCaptureActions
              event={event}
              memorySuggestions={memorySuggestions}
              onCaptureMemory={onCaptureMemory}
              onStageSuggestion={onStageSuggestion}
            />
            <div className="timeline-user-body">{event.text}</div>
          </div>
        </article>
      );
    case "assistant_message":
      return (
        <article className="timeline-ai" title={timeLabel}>
          <div className="timeline-ai-label-row">
            <div className="timeline-ai-label">{t("timeline.assistantMessage")}</div>
            <div className="timeline-ai-toolbar">
              <TimelineCaptureActions
                event={event}
                memorySuggestions={memorySuggestions}
                onCaptureMemory={onCaptureMemory}
                onStageSuggestion={onStageSuggestion}
              />
              <CopyButton text={event.text} />
            </div>
          </div>
          <div className="timeline-ai-body">{event.text}</div>
        </article>
      );
    case "run_status":
      return (
        <article className={`timeline-status-card status-${event.status}`} title={timeLabel}>
          <div className="timeline-status-header">
            <StatusPill tone={getStatusTone(event.status)}>{getStatusLabel(event.status, t)}</StatusPill>
            {runDetails.length > 0 ? (
              <button className="details-toggle-button" onClick={onToggleDetails} type="button">
                {isDetailsOpen ? t("timeline.hideDetails") : t("timeline.details")}
              </button>
            ) : null}
          </div>
          <div className="timeline-status-body">
            {summary && event.status === "failed" ? (
              <span className="timeline-status-summary">{summary}</span>
            ) : (
              <span className="timeline-run-id">{event.runId}</span>
            )}
          </div>
          {isDetailsOpen && runDetails.length > 0 ? (
            <div className="timeline-details-panel">
              {detailGroups.metadata.length > 0 ? (
                <DetailSection
                  items={detailGroups.metadata}
                  label={t("timeline.detailsMetadata")}
                />
              ) : null}
              {detailGroups.output.length > 0 ? (
                <DetailSection
                  items={detailGroups.output}
                  label={t("timeline.detailsOutput")}
                />
              ) : null}
              {detailGroups.diagnostics.length > 0 ? (
                <DetailSection
                  items={detailGroups.diagnostics}
                  label={t("timeline.detailsDiagnostics")}
                />
              ) : null}
            </div>
          ) : null}
        </article>
      );
    case "final_output":
      return (
        <article className="timeline-ai timeline-output-card" title={timeLabel}>
          <div className="timeline-output-header">
            <span>{t("timeline.finalOutput")}</span>
            <div className="timeline-output-actions">
              <TimelineCaptureActions
                event={event}
                memorySuggestions={memorySuggestions}
                onCaptureMemory={onCaptureMemory}
                onStageSuggestion={onStageSuggestion}
              />
              <button
                className="copy-button"
                onClick={() => void navigator.clipboard?.writeText(event.text)}
                type="button"
              >
                {t("timeline.copy")}
              </button>
            </div>
          </div>
          <div className="timeline-output-body">{event.text}</div>
        </article>
      );
    case "error":
      return (
        <article className="timeline-error-card" title={timeLabel}>
          <div className="timeline-event-header">
            <StatusPill tone="danger">{t("timeline.error")}</StatusPill>
          </div>
          <div className="timeline-event-body">
            <p>{event.message}</p>
          </div>
        </article>
      );
    case "system_note":
    case "run_started":
    case "log_stdout":
    case "log_stderr_meta":
    case "log_system":
    case "log_stderr":
      return null;
  }
}

function TimelineCaptureActions({
  event,
  memorySuggestions,
  onCaptureMemory,
  onStageSuggestion,
}: {
  event: CapturableTimelineEvent;
  memorySuggestions: ProjectMemorySuggestion[];
  onCaptureMemory?: (kind: ProjectMemoryCandidateKind, event: CapturableTimelineEvent) => void;
  onStageSuggestion?: (suggestion: ProjectMemorySuggestion) => void;
}) {
  const { t } = useI18n();

  if (!onCaptureMemory) {
    return null;
  }

  const suggestionByKind = new Map(
    memorySuggestions.map((suggestion) => [suggestion.suggestedKind, suggestion]),
  );

  return (
    <div className="timeline-capture-actions" aria-label={t("timeline.captureActions")}>
      <button
        className="timeline-capture-button"
        onClick={() => onCaptureMemory("pinned", event)}
        type="button"
      >
        {t("timeline.pin")}
      </button>
      <button
        className={suggestionByKind.has("rule") ? "timeline-capture-button suggested" : "timeline-capture-button"}
        onClick={() => {
          const suggestion = suggestionByKind.get("rule");
          if (suggestion && onStageSuggestion) {
            onStageSuggestion(suggestion);
            return;
          }
          onCaptureMemory("rule", event);
        }}
        type="button"
      >
        {suggestionByKind.has("rule") ? t("timeline.suggestRule") : t("timeline.saveAsRule")}
      </button>
      <button
        className={suggestionByKind.has("decision") ? "timeline-capture-button suggested" : "timeline-capture-button"}
        onClick={() => {
          const suggestion = suggestionByKind.get("decision");
          if (suggestion && onStageSuggestion) {
            onStageSuggestion(suggestion);
            return;
          }
          onCaptureMemory("decision", event);
        }}
        type="button"
      >
        {suggestionByKind.has("decision") ? t("timeline.suggestDecision") : t("timeline.saveAsDecision")}
      </button>
      <button
        className={suggestionByKind.has("current_focus") ? "timeline-capture-button suggested" : "timeline-capture-button"}
        onClick={() => {
          const suggestion = suggestionByKind.get("current_focus");
          if (suggestion && onStageSuggestion) {
            onStageSuggestion(suggestion);
            return;
          }
          onCaptureMemory("current_focus", event);
        }}
        type="button"
      >
        {suggestionByKind.has("current_focus")
          ? t("timeline.suggestCurrentFocus")
          : t("timeline.saveAsCurrentFocus")}
      </button>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    const timeoutId = window.setTimeout(() => {
      setCopied(false);
    }, 1500);
    return () => window.clearTimeout(timeoutId);
  };

  return (
    <button
      className="copy-button"
      onClick={handleCopy}
      type="button"
      title={t("timeline.copy")}
    >
      {copied ? t("timeline.copied") : t("timeline.copy")}
    </button>
  );
}

function DetailSection({
  label,
  items,
}: {
  label: string;
  items: DetailItem[];
}) {
  return (
    <section className="timeline-detail-section">
      <span className="timeline-detail-section-label">{label}</span>
      <div className="timeline-detail-section-body">
        {items.map((item) => (
          <div
            className={`timeline-detail-row ${item.tone}`}
            key={item.id}
            title={formatTimestamp(item.createdAt)}
          >
            {item.text}
          </div>
        ))}
      </div>
    </section>
  );
}

function getStatusLabel(
  status: Extract<TimelineEvent, { type: "run_status" }>["status"],
  t: (key: MessageKey) => string,
): string {
  switch (status) {
    case "running":
      return t("timeline.statusRunning");
    case "completed":
      return t("timeline.statusCompleted");
    case "failed":
      return t("timeline.statusFailed");
    case "stopped":
      return t("timeline.statusStopped");
  }
}

function getStatusTone(
  status: Extract<TimelineEvent, { type: "run_status" }>["status"],
): "accent" | "success" | "danger" | "neutral" {
  switch (status) {
    case "running":
      return "accent";
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "stopped":
      return "neutral";
  }
}

type DetailGroup = "metadata" | "output" | "diagnostics";
type DetailTone = "meta" | "neutral" | "error";

type DetailItem = {
  id: string;
  createdAt: string;
  text: string;
  group: DetailGroup;
  tone: DetailTone;
};

function groupRunDetails(runDetails: TimelineEvent[]) {
  const groups: Record<DetailGroup, DetailItem[]> = {
    metadata: [],
    output: [],
    diagnostics: [],
  };

  for (const detail of runDetails) {
    const item = classifyDetailItem(detail);
    if (!item) {
      continue;
    }
    groups[item.group].push(item);
  }

  return groups;
}

function classifyDetailItem(detail: TimelineEvent): DetailItem | null {
  switch (detail.type) {
    case "run_started":
      return {
        id: detail.id,
        createdAt: detail.createdAt,
        text: `run started: ${detail.runId}`,
        group: "metadata",
        tone: "meta",
      };
    case "log_system":
      return {
        id: detail.id,
        createdAt: detail.createdAt,
        text: detail.text,
        group: isMetadataLine(detail.text) ? "metadata" : "output",
        tone: isMetadataLine(detail.text) ? "meta" : "neutral",
      };
    case "log_stdout":
      return {
        id: detail.id,
        createdAt: detail.createdAt,
        text: detail.text,
        group: "output",
        tone: "neutral",
      };
    case "log_stderr_meta":
      return {
        id: detail.id,
        createdAt: detail.createdAt,
        text: detail.text,
        group: isMetadataLine(detail.text) ? "metadata" : "diagnostics",
        tone: isMetadataLine(detail.text) ? "meta" : "neutral",
      };
    case "log_stderr":
      return {
        id: detail.id,
        createdAt: detail.createdAt,
        text: detail.text,
        group: "diagnostics",
        tone: "error",
      };
    case "error":
      return {
        id: detail.id,
        createdAt: detail.createdAt,
        text: detail.message,
        group: "diagnostics",
        tone: "error",
      };
    default:
      return null;
  }
}

function isMetadataLine(text: string): boolean {
  const normalized = text.trim().toLowerCase();

  return (
    normalized.startsWith("claw cwd:") ||
    normalized.startsWith("claw cli:") ||
    normalized.startsWith("claw settings:") ||
    normalized.startsWith("claw precedence:") ||
    normalized.startsWith("claw permission mode:") ||
    normalized.startsWith("[active-model]")
  );
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
