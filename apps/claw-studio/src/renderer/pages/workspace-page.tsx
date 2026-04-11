import type {
  AgentRole,
  ProjectMemoryCandidate,
  ProjectMemoryCandidateKind,
  ProjectMemorySuggestion,
  PermissionMode,
  ProjectMemory,
  StudioProject,
  StudioSession,
  TimelineEvent,
} from "../store/studio-store.js";
import { useI18n } from "../i18n/index.js";
import { Composer } from "../components/composer.js";
import { ProjectMemoryOverlay } from "../components/project-memory-overlay.js";
import { Timeline } from "../components/timeline.js";

type WorkspacePageProps = {
  currentProject: StudioProject | null;
  currentProjectMemory: ProjectMemory;
  currentProjectMemoryCandidates: ProjectMemoryCandidate[];
  currentProjectMemorySuggestions: ProjectMemorySuggestion[];
  currentSession: StudioSession | null;
  events: TimelineEvent[];
  currentRunId: string | null;
  currentPermissionMode: PermissionMode;
  currentAgentRole: AgentRole;
  composerValue: string;
  composerAttachments: Array<{ id: string; data: string; mimeType: string }>;
  canStop: boolean;
  isProjectMemoryOpen: boolean;
  onAddAttachment: (attachment: { id: string; data: string; mimeType: string }) => void;
  onComposerChange: (value: string) => void;
  onCloseProjectMemory: () => void;
  onOpenProjectMemory: () => void;
  onCaptureProjectMemory: (
    kind: ProjectMemoryCandidateKind,
    event: Extract<TimelineEvent, { type: "user_message" | "assistant_message" | "final_output" }>,
  ) => void;
  onAcceptProjectMemoryCandidate: (candidateId: string) => void;
  onDismissProjectMemoryCandidate: (candidateId: string) => void;
  onPermissionModeChange: (permissionMode: PermissionMode) => void;
  onAgentRoleChange: (role: AgentRole) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onStageProjectMemorySuggestion: (suggestion: ProjectMemorySuggestion) => void;
  onRemovePinnedProjectMemoryItem: (candidateId: string) => void;
  onRemoveProjectMemoryItem: (
    section: "rules" | "decisions" | "currentFocus",
    content: string,
  ) => void;
  onSaveProjectMemory: (memory: Omit<ProjectMemory, "updatedAt">) => void;
  onSubmitComposer: () => void;
  onStop: () => void;
  onCreateSession: () => void;
};

export function WorkspacePage({
  currentProject,
  currentProjectMemory,
  currentProjectMemoryCandidates,
  currentProjectMemorySuggestions,
  currentSession,
  events,
  currentRunId,
  currentPermissionMode,
  currentAgentRole,
  composerValue,
  composerAttachments,
  canStop,
  isProjectMemoryOpen,
  onAddAttachment,
  onComposerChange,
  onCloseProjectMemory,
  onOpenProjectMemory,
  onCaptureProjectMemory,
  onAcceptProjectMemoryCandidate,
  onDismissProjectMemoryCandidate,
  onPermissionModeChange,
  onAgentRoleChange,
  onRemoveAttachment,
  onStageProjectMemorySuggestion,
  onRemovePinnedProjectMemoryItem,
  onRemoveProjectMemoryItem,
  onSaveProjectMemory,
  onSubmitComposer,
  onStop,
  onCreateSession,
}: WorkspacePageProps) {
  const { t } = useI18n();
  const memorySummary = currentProjectMemory.summary.trim();
  const currentFocus = currentProjectMemory.currentFocus;
  const sessionUpdatedAt = currentSession ? formatShortTimestamp(currentSession.updatedAt) : null;

  return (
    <main className="workspace-page">
      <section className="workspace-stage">
        <div className="workspace-center-pane">
          <section className="workspace-heading">
            <div>
              <span className="eyebrow">{t("workspace.timelineLabel")}</span>
              <h2>{currentSession?.title ?? t("topbar.noSession")}</h2>
              <p>{t("workspace.startPrompt")}</p>
            </div>
            <div className="workspace-heading-actions">
              {!isProjectMemoryOpen ? (
                <button className="ghost-button" onClick={onOpenProjectMemory} type="button">
                  {t("workspace.projectMemory")}
                </button>
              ) : null}
              <button className="ghost-button" onClick={onCreateSession} type="button">
                {t("workspace.newSession")}
              </button>
            </div>
          </section>

          <section className="workspace-context-strip" aria-label={t("workspace.contextLabel")}>
            <article className="workspace-context-card primary">
              <span className="workspace-context-label">{t("workspace.projectLabel")}</span>
              <strong>{currentProject?.name ?? t("topbar.noProject")}</strong>
              <p>{currentProject?.description ?? t("workspace.projectFallback")}</p>
            </article>

            <article className="workspace-context-card">
              <span className="workspace-context-label">{t("workspace.memoryLabel")}</span>
              <strong>{memorySummary || t("workspace.memoryEmpty")}</strong>
              <p>
                {currentFocus.length > 0
                  ? `${t("workspace.focusLabel")}: ${currentFocus.slice(0, 2).join(" / ")}`
                  : t("workspace.memoryHint")}
              </p>
            </article>

            <article className="workspace-context-card compact">
              <span className="workspace-context-label">{t("workspace.sessionLabel")}</span>
              <strong>{currentSession?.permissionMode ?? currentPermissionMode}</strong>
              <p>
                {sessionUpdatedAt
                  ? `${t("workspace.updatedLabel")} ${sessionUpdatedAt}`
                  : t("workspace.sessionFallback")}
              </p>
            </article>
          </section>

          <section className="workspace-timeline-panel">
            <Timeline
              events={events}
              onCaptureMemory={onCaptureProjectMemory}
              onStageSuggestion={onStageProjectMemorySuggestion}
              suggestions={currentProjectMemorySuggestions}
            />
          </section>

          <section className="workspace-composer-panel">
            <Composer
              attachments={composerAttachments}
              canStop={canStop}
              currentRunId={currentRunId}
              permissionMode={currentPermissionMode}
              agentRole={currentAgentRole}
              value={composerValue}
              onChange={onComposerChange}
              onAddAttachment={onAddAttachment}
              onPermissionModeChange={onPermissionModeChange}
              onAgentRoleChange={onAgentRoleChange}
              onRemoveAttachment={onRemoveAttachment}
              onStop={onStop}
              onSubmit={onSubmitComposer}
            />
          </section>
        </div>

        <ProjectMemoryOverlay
          candidates={currentProjectMemoryCandidates}
          isOpen={isProjectMemoryOpen}
          memory={currentProjectMemory}
          onAcceptCandidate={onAcceptProjectMemoryCandidate}
          onClose={onCloseProjectMemory}
          onDismissCandidate={onDismissProjectMemoryCandidate}
          onRemoveDurableItem={onRemoveProjectMemoryItem}
          onRemovePinnedItem={onRemovePinnedProjectMemoryItem}
          onSave={onSaveProjectMemory}
          projectName={currentProject?.name ?? t("topbar.noProject")}
        />
      </section>
    </main>
  );
}

function formatShortTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
