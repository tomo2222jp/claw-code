import type { StudioProject, StudioSession } from "../store/studio-store.js";
import { useI18n } from "../i18n/index.js";

type SidebarExpandedPanelProps = {
  open: boolean;
  projects: StudioProject[];
  sessions: StudioSession[];
  selectedProjectId: string;
  selectedSessionId: string;
  onProjectSelect: (projectId: string) => void;
  onSessionSelect: (sessionId: string) => void;
  onCreateSession: () => void;
};

export function SidebarExpandedPanel({
  open,
  projects,
  sessions,
  selectedProjectId,
  selectedSessionId,
  onProjectSelect,
  onSessionSelect,
  onCreateSession,
}: SidebarExpandedPanelProps) {
  const { t } = useI18n();

  return (
    <div className={open ? "sidebar-expanded-panel open" : "sidebar-expanded-panel"} aria-hidden={!open}>
      <div className="sidebar-expanded-scroll">
        <section className="sidebar-section">
          <div className="sidebar-section-header">
            <span>{t("sidebar.projects")}</span>
          </div>
          <div className="sidebar-project-list">
            {projects.map((project) => (
              <button
                key={project.id}
                className={project.id === selectedProjectId ? "sidebar-project-item active" : "sidebar-project-item"}
                onClick={() => onProjectSelect(project.id)}
                type="button"
              >
                <span className="sidebar-project-dot" />
                <span className="sidebar-project-copy">
                  <strong>{project.name}</strong>
                  {project.description ? <small>{project.description}</small> : null}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="sidebar-section">
          <div className="sidebar-section-header">
            <span>{t("sidebar.sessions")}</span>
            <button className="ghost-button sidebar-mini-button" onClick={onCreateSession} type="button">
              {t("sidebar.newSession")}
            </button>
          </div>
          <div className="sidebar-session-list">
            {sessions.map((session) => (
              <button
                key={session.id}
                className={session.id === selectedSessionId ? "sidebar-session-item active" : "sidebar-session-item"}
                onClick={() => onSessionSelect(session.id)}
                type="button"
              >
                <strong>{session.title}</strong>
                <small>{formatTimestamp(session.updatedAt)}</small>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
