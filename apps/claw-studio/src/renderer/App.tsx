import { useMemo, useState } from "react";

import { Sidebar } from "./components/sidebar.js";
import { Topbar } from "./components/topbar.js";
import { SettingsPage } from "./pages/settings-page.js";
import { WorkspacePage } from "./pages/workspace-page.js";
import { useI18n } from "./i18n/index.js";
import type { StudioState } from "./store/studio-store.js";
import type { AppView } from "./store/app-store.js";

type AppProps = {
  studio: StudioState;
};

export function App({ studio }: AppProps) {
  const { locale, setLocale, t } = useI18n();
  const [view, setView] = useState<AppView>("workspace");
  const [isProjectMemoryOpen, setIsProjectMemoryOpen] = useState(false);

  const currentProject = useMemo(
    () => studio.projects.find((project) => project.id === studio.selectedProjectId) ?? null,
    [studio.projects, studio.selectedProjectId],
  );
  const currentSession = useMemo(
    () => studio.sessions.find((session) => session.id === studio.selectedSessionId) ?? null,
    [studio.selectedSessionId, studio.sessions],
  );

  return (
    <div className="studio-shell">
      <Sidebar
        projects={studio.projects}
        sessions={studio.sessions}
        selectedProjectId={studio.selectedProjectId}
        selectedSessionId={studio.selectedSessionId}
        currentView={view}
        sidebarCollapsed={studio.sidebarCollapsed}
        isProjectMemoryOpen={isProjectMemoryOpen}
        onProjectSelect={studio.selectProject}
        onSessionSelect={studio.selectSession}
        onCreateSession={studio.createSession}
        onOpenSettings={() => setView("settings")}
        onOpenWorkspace={() => setView("workspace")}
        onToggleSidebar={() => studio.setSidebarCollapsed(!studio.sidebarCollapsed)}
        onToggleProjectMemory={() => setIsProjectMemoryOpen((current) => !current)}
      />
      <div className="studio-main">
        <Topbar
          healthLabel={studio.backendHealth.label}
          healthTone={studio.backendHealth.tone}
          currentProjectName={currentProject?.name ?? t("topbar.noProject")}
          currentSessionName={currentSession?.title ?? t("topbar.noSession")}
          locale={locale}
          activeModel={studio.backendSettings?.activeModel}
          onOpenSettings={() => {
            setIsProjectMemoryOpen(false);
            setView("settings");
          }}
          onLocaleChange={setLocale}
        />
        {view === "workspace" ? (
          <WorkspacePage
            composerValue={studio.composerValue}
            composerAttachments={studio.composerAttachments}
            currentProject={currentProject}
            currentProjectMemory={studio.currentProjectMemory}
            currentProjectMemoryCandidates={studio.currentProjectMemoryCandidates}
            currentProjectMemorySuggestions={studio.currentProjectMemorySuggestions}
            currentSession={currentSession}
            events={studio.currentTimeline}
            currentPermissionMode={studio.currentPermissionMode}
            currentAgentRole={studio.currentAgentRole}
            currentRunId={studio.currentRunId}
            isProjectMemoryOpen={isProjectMemoryOpen}
            onAddAttachment={studio.addComposerAttachment}
            onComposerChange={studio.setComposerValue}
            onCloseProjectMemory={() => setIsProjectMemoryOpen(false)}
            onCreateSession={studio.createSession}
            onDismissProjectMemoryCandidate={(candidateId) =>
              studio.dismissProjectMemoryCandidate(studio.selectedProjectId, candidateId)
            }
            onOpenProjectMemory={() => setIsProjectMemoryOpen(true)}
            onAcceptProjectMemoryCandidate={(candidateId) =>
              studio.acceptProjectMemoryCandidate(studio.selectedProjectId, candidateId)
            }
            onRemovePinnedProjectMemoryItem={(candidateId) =>
              studio.removePinnedProjectMemoryItem(studio.selectedProjectId, candidateId)
            }
            onRemoveProjectMemoryItem={(section, content) =>
              studio.removeProjectMemoryItem(studio.selectedProjectId, section, content)
            }
            onRemoveAttachment={studio.removeComposerAttachment}
            onCaptureProjectMemory={(kind, event) => {
              studio.createProjectMemoryCandidate({
                projectId: studio.selectedProjectId,
                kind,
                content: event.text,
                sourceSessionId: event.sessionId,
                sourceTimelineEventId: event.id,
              });
              setIsProjectMemoryOpen(true);
            }}
            onStageProjectMemorySuggestion={(suggestion) => {
              studio.stageProjectMemorySuggestion(suggestion);
              setIsProjectMemoryOpen(true);
            }}
            onPermissionModeChange={(permissionMode) =>
              studio.setSessionPermissionMode(studio.selectedSessionId, permissionMode)
            }
            onAgentRoleChange={(role) =>
              studio.setSessionAgentRole(studio.selectedSessionId, role)
            }
            onSaveProjectMemory={(memory) =>
              studio.updateProjectMemory(studio.selectedProjectId, memory)
            }
            onStop={studio.requestStop}
            onSubmitComposer={studio.submitComposer}
            canStop={studio.canStop}
          />
        ) : (
          <SettingsPage
            backendSettings={studio.backendSettings}
            onBack={() => setView("workspace")}
            onSaveModelSelection={studio.saveModelSelection}
          />
        )}
      </div>
    </div>
  );
}
