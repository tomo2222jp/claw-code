import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useI18n } from "../i18n/index.js";
import type { ProjectMemory, ProjectMemoryCandidate } from "../store/studio-store.js";

type DurableMemorySection = "rules" | "decisions" | "currentFocus";

type ProjectMemoryOverlayProps = {
  candidates: ProjectMemoryCandidate[];
  isOpen: boolean;
  memory: ProjectMemory;
  projectName: string;
  onAcceptCandidate: (candidateId: string) => void;
  onClose: () => void;
  onDismissCandidate: (candidateId: string) => void;
  onRemoveDurableItem: (section: DurableMemorySection, content: string) => void;
  onRemovePinnedItem: (candidateId: string) => void;
  onSave: (memory: Omit<ProjectMemory, "updatedAt">) => void;
};

type ProjectMemoryDraft = {
  summary: string;
  rules: string;
  decisions: string;
  currentFocus: string;
};

export function ProjectMemoryOverlay({
  candidates,
  isOpen,
  memory,
  projectName,
  onAcceptCandidate,
  onClose,
  onDismissCandidate,
  onRemoveDurableItem,
  onRemovePinnedItem,
  onSave,
}: ProjectMemoryOverlayProps) {
  const { t } = useI18n();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ProjectMemoryDraft>(() => toDraft(memory));

  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setExpandedItems({});
    }
    setDraft(toDraft(memory));
  }, [isOpen, memory]);

  const updatedAtLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(memory.updatedAt)),
    [memory.updatedAt],
  );

  const pendingCandidates = candidates.filter((candidate) => candidate.status === "pending");
  const pinnedCandidates = candidates.filter(
    (candidate) => candidate.kind === "pinned" && candidate.status === "accepted",
  );
  const hasDurableMemory =
    Boolean(memory.summary.trim()) ||
    memory.rules.length > 0 ||
    memory.decisions.length > 0 ||
    memory.currentFocus.length > 0 ||
    pinnedCandidates.length > 0;

  const toggleExpanded = (itemKey: string) => {
    setExpandedItems((current) => ({
      ...current,
      [itemKey]: !current[itemKey],
    }));
  };

  return (
    <aside className={isOpen ? "project-memory-overlay open" : "project-memory-overlay"} aria-hidden={!isOpen}>
      <div className="project-memory-header">
        <div>
          <strong>{t("memory.title")}</strong>
          <p>{projectName}</p>
        </div>
        <button className="memory-close-button" onClick={onClose} type="button">
          {t("memory.close")}
        </button>
      </div>

      <div className="project-memory-body">
        {isEditing ? (
          <div className="memory-edit-form">
            <MemoryField
              label={t("memory.summary")}
              value={draft.summary}
              onChange={(value) => setDraft((current) => ({ ...current, summary: value }))}
            />
            <MemoryField
              label={t("memory.rules")}
              value={draft.rules}
              onChange={(value) => setDraft((current) => ({ ...current, rules: value }))}
            />
            <MemoryField
              label={t("memory.decisions")}
              value={draft.decisions}
              onChange={(value) => setDraft((current) => ({ ...current, decisions: value }))}
            />
            <MemoryField
              label={t("memory.currentFocus")}
              value={draft.currentFocus}
              onChange={(value) => setDraft((current) => ({ ...current, currentFocus: value }))}
            />
          </div>
        ) : (
          <>
            {!hasDurableMemory ? (
              <p className="memory-empty-state">{t("memory.empty")}</p>
            ) : null}

            {memory.summary.trim() ? (
              <MemorySection label={t("memory.summary")}>
                <ExpandableText
                  content={memory.summary}
                  expanded={Boolean(expandedItems.summary)}
                  itemKey="summary"
                  onToggleExpanded={toggleExpanded}
                />
              </MemorySection>
            ) : null}

            {memory.rules.length > 0 ? (
              <MemoryListSection
                expandedItems={expandedItems}
                items={memory.rules}
                itemKeyPrefix="rules"
                label={t("memory.rules")}
                onRemoveItem={(content) => onRemoveDurableItem("rules", content)}
                onToggleExpanded={toggleExpanded}
                removeLabel={t("memory.remove")}
              />
            ) : null}

            {memory.decisions.length > 0 ? (
              <MemoryListSection
                expandedItems={expandedItems}
                items={memory.decisions}
                itemKeyPrefix="decisions"
                label={t("memory.decisions")}
                onRemoveItem={(content) => onRemoveDurableItem("decisions", content)}
                onToggleExpanded={toggleExpanded}
                removeLabel={t("memory.remove")}
              />
            ) : null}

            {memory.currentFocus.length > 0 ? (
              <MemoryListSection
                expandedItems={expandedItems}
                items={memory.currentFocus}
                itemKeyPrefix="currentFocus"
                label={t("memory.currentFocus")}
                onRemoveItem={(content) => onRemoveDurableItem("currentFocus", content)}
                onToggleExpanded={toggleExpanded}
                removeLabel={t("memory.remove")}
              />
            ) : null}

            {pinnedCandidates.length > 0 ? (
              <MemorySection label={t("memory.pinned")}>
                <div className="memory-candidate-list">
                  {pinnedCandidates.map((candidate) => (
                    <MemoryCandidateCard
                      actionLabel={t("memory.unpin")}
                      candidate={candidate}
                      expanded={Boolean(expandedItems[candidate.id])}
                      onPrimaryAction={onRemovePinnedItem}
                      onToggleExpanded={toggleExpanded}
                      showSourceHint={false}
                    />
                  ))}
                </div>
              </MemorySection>
            ) : null}

            <MemorySection label={t("memory.pendingReview")}>
              {pendingCandidates.length === 0 ? (
                <p className="memory-section-paragraph">{t("memory.noPending")}</p>
              ) : (
                <div className="memory-candidate-list">
                  {pendingCandidates.map((candidate) => (
                    <MemoryCandidateCard
                      actionLabel={t("memory.accept")}
                      candidate={candidate}
                      expanded={Boolean(expandedItems[candidate.id])}
                      onPrimaryAction={onAcceptCandidate}
                      onSecondaryAction={onDismissCandidate}
                      onToggleExpanded={toggleExpanded}
                      secondaryActionLabel={t("memory.dismiss")}
                      showSourceHint
                    />
                  ))}
                </div>
              )}
            </MemorySection>
          </>
        )}
      </div>

      <div className="project-memory-footer">
        <span className="memory-updated-at">
          {t("memory.updatedAt")}: {updatedAtLabel}
        </span>
        <div className="memory-footer-actions">
          {isEditing ? (
            <>
              <button
                className="ghost-button"
                onClick={() => {
                  setDraft(toDraft(memory));
                  setIsEditing(false);
                }}
                type="button"
              >
                {t("memory.cancel")}
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  onSave({
                    summary: draft.summary,
                    rules: toList(draft.rules),
                    decisions: toList(draft.decisions),
                    currentFocus: toList(draft.currentFocus),
                  });
                  setIsEditing(false);
                }}
                type="button"
              >
                {t("memory.save")}
              </button>
            </>
          ) : (
            <button className="ghost-button" onClick={() => setIsEditing(true)} type="button">
              {t("memory.edit")}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function MemorySection({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <section className="memory-section">
      <span className="memory-section-label">{label}</span>
      {children}
    </section>
  );
}

function MemoryListSection({
  expandedItems,
  items,
  itemKeyPrefix,
  label,
  onRemoveItem,
  onToggleExpanded,
  removeLabel,
}: {
  expandedItems: Record<string, boolean>;
  items: string[];
  itemKeyPrefix: string;
  label: string;
  onRemoveItem: (content: string) => void;
  onToggleExpanded: (itemKey: string) => void;
  removeLabel: string;
}) {
  return (
    <MemorySection label={label}>
      <div className="memory-item-list">
        {items.map((item, index) => {
          const itemKey = `${itemKeyPrefix}-${index}`;
          return (
            <MemoryListCard
              content={item}
              expanded={Boolean(expandedItems[itemKey])}
              itemKey={itemKey}
              key={`${itemKey}-${item}`}
              onRemove={() => onRemoveItem(item)}
              onToggleExpanded={onToggleExpanded}
              removeLabel={removeLabel}
            />
          );
        })}
      </div>
    </MemorySection>
  );
}

function MemoryCandidateCard({
  actionLabel,
  candidate,
  expanded,
  onPrimaryAction,
  onSecondaryAction,
  onToggleExpanded,
  secondaryActionLabel,
  showSourceHint,
}: {
  actionLabel: string;
  candidate: ProjectMemoryCandidate;
  expanded: boolean;
  onPrimaryAction: (candidateId: string) => void;
  onSecondaryAction?: (candidateId: string) => void;
  onToggleExpanded: (itemKey: string) => void;
  secondaryActionLabel?: string;
  showSourceHint: boolean;
}) {
  const { t } = useI18n();

  return (
    <article className="memory-candidate-card">
      <div className="memory-candidate-meta">
        <div className="memory-candidate-tags">
          <span className={`memory-candidate-kind kind-${candidate.kind}`}>
            {getCandidateKindLabel(candidate.kind, t)}
          </span>
          {candidate.status === "pending" ? (
            <span className="memory-candidate-origin">
              {candidate.createdBy === "assistant_suggested"
                ? t("memory.originSuggested")
                : t("memory.originManual")}
            </span>
          ) : null}
        </div>
        <span>{formatShortTimestamp(candidate.createdAt)}</span>
      </div>
      {showSourceHint ? (
        <div className="memory-source-hint">{formatSourceHint(candidate, t)}</div>
      ) : null}
      <ExpandableText
        content={candidate.content}
        expanded={expanded}
        itemKey={candidate.id}
        onToggleExpanded={onToggleExpanded}
      />
      <div className="memory-candidate-actions">
        <button className="ghost-button memory-candidate-button" onClick={() => onPrimaryAction(candidate.id)} type="button">
          {actionLabel}
        </button>
        {onSecondaryAction && secondaryActionLabel ? (
          <button className="ghost-button memory-candidate-button" onClick={() => onSecondaryAction(candidate.id)} type="button">
            {secondaryActionLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function MemoryListCard({
  content,
  expanded,
  itemKey,
  onRemove,
  onToggleExpanded,
  removeLabel,
}: {
  content: string;
  expanded: boolean;
  itemKey: string;
  onRemove: () => void;
  onToggleExpanded: (itemKey: string) => void;
  removeLabel: string;
}) {
  return (
    <article className="memory-list-card">
      <ExpandableText
        content={content}
        expanded={expanded}
        itemKey={itemKey}
        onToggleExpanded={onToggleExpanded}
      />
      <div className="memory-item-actions">
        <button className="ghost-button memory-candidate-button" onClick={onRemove} type="button">
          {removeLabel}
        </button>
      </div>
    </article>
  );
}

function ExpandableText({
  content,
  expanded,
  itemKey,
  onToggleExpanded,
}: {
  content: string;
  expanded: boolean;
  itemKey: string;
  onToggleExpanded: (itemKey: string) => void;
}) {
  const { t } = useI18n();
  const canExpand = content.length > 140 || content.includes("\n");

  return (
    <div className="memory-expandable">
      <p className={expanded ? "memory-content expanded" : "memory-content"}>{content}</p>
      {canExpand ? (
        <button className="memory-expand-button" onClick={() => onToggleExpanded(itemKey)} type="button">
          {expanded ? t("memory.showLess") : t("memory.showMore")}
        </button>
      ) : null}
    </div>
  );
}

function MemoryField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="memory-field">
      <span className="memory-section-label">{label}</span>
      <textarea rows={label.length > 10 ? 4 : 3} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function toDraft(memory: ProjectMemory): ProjectMemoryDraft {
  return {
    summary: memory.summary,
    rules: memory.rules.join("\n"),
    decisions: memory.decisions.join("\n"),
    currentFocus: memory.currentFocus.join("\n"),
  };
}

function toList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCandidateKindLabel(
  kind: ProjectMemoryCandidate["kind"],
  t: (
    key:
      | "memory.kindPinned"
      | "memory.kindRule"
      | "memory.kindDecision"
      | "memory.kindCurrentFocus"
      | "memory.originSuggested"
      | "memory.originManual",
  ) => string,
): string {
  switch (kind) {
    case "pinned":
      return t("memory.kindPinned");
    case "rule":
      return t("memory.kindRule");
    case "decision":
      return t("memory.kindDecision");
    case "current_focus":
      return t("memory.kindCurrentFocus");
  }
}

function formatShortTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSourceHint(
  candidate: ProjectMemoryCandidate,
  t: (key: "memory.sourceLabel" | "memory.sourceUnknown") => string,
): string {
  const parts = [candidate.sourceSessionId, candidate.sourceTimelineEventId].filter(Boolean);
  return `${t("memory.sourceLabel")}: ${parts.length > 0 ? parts.join(" / ") : t("memory.sourceUnknown")}`;
}
