import type { AppView } from "../store/app-store.js";
import type { StudioProject, StudioSession } from "../store/studio-store.js";
import { SidebarExpandedPanel } from "./sidebar-expanded-panel.js";
import { SidebarRail } from "./sidebar-rail.js";

type SidebarProps = {
  projects: StudioProject[];
  sessions: StudioSession[];
  selectedProjectId: string;
  selectedSessionId: string;
  currentView: AppView;
  sidebarCollapsed: boolean;
  isProjectMemoryOpen: boolean;
  onProjectSelect: (projectId: string) => void;
  onSessionSelect: (sessionId: string) => void;
  onCreateSession: () => void;
  onOpenWorkspace: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  onToggleProjectMemory: () => void;
};

export function Sidebar({
  projects,
  sessions,
  selectedProjectId,
  selectedSessionId,
  currentView,
  sidebarCollapsed,
  isProjectMemoryOpen,
  onProjectSelect,
  onSessionSelect,
  onCreateSession,
  onOpenWorkspace,
  onOpenSettings,
  onToggleSidebar,
  onToggleProjectMemory,
}: SidebarProps) {
  return (
    <aside className="sidebar-shell">
      <SidebarRail
        currentView={currentView}
        isProjectMemoryOpen={isProjectMemoryOpen}
        onOpenSettings={onOpenSettings}
        onOpenWorkspace={onOpenWorkspace}
        onToggleProjectMemory={onToggleProjectMemory}
        onToggleSidebar={onToggleSidebar}
        sidebarCollapsed={sidebarCollapsed}
      />
      <SidebarExpandedPanel
        open={currentView === "workspace" && !sidebarCollapsed}
        onCreateSession={onCreateSession}
        onProjectSelect={onProjectSelect}
        onSessionSelect={onSessionSelect}
        projects={projects}
        selectedProjectId={selectedProjectId}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
      />
    </aside>
  );
}
