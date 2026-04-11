import type { AppView } from "../store/app-store.js";
import { useI18n } from "../i18n/index.js";

type SidebarRailProps = {
  currentView: AppView;
  sidebarCollapsed: boolean;
  isProjectMemoryOpen: boolean;
  onToggleSidebar: () => void;
  onToggleProjectMemory: () => void;
  onOpenSettings: () => void;
  onOpenWorkspace: () => void;
};

export function SidebarRail({
  currentView,
  sidebarCollapsed,
  isProjectMemoryOpen,
  onToggleSidebar,
  onToggleProjectMemory,
  onOpenSettings,
  onOpenWorkspace,
}: SidebarRailProps) {
  const { t } = useI18n();

  return (
    <div className="sidebar-rail">
      <button
        aria-label={t("sidebar.toggleSessions")}
        className={!sidebarCollapsed && currentView === "workspace" ? "rail-button active" : "rail-button"}
        onClick={() => {
          if (currentView !== "workspace") {
            onOpenWorkspace();
          }
          onToggleSidebar();
        }}
        title={t("sidebar.toggleSessions")}
        type="button"
      >
        <span className="rail-icon rail-icon-text">WS</span>
      </button>

      <button
        aria-label={t("sidebar.toggleMemory")}
        className={isProjectMemoryOpen ? "rail-button active" : "rail-button"}
        onClick={() => {
          if (currentView !== "workspace") {
            onOpenWorkspace();
          }
          onToggleProjectMemory();
        }}
        title={t("sidebar.toggleMemory")}
        type="button"
      >
        <span className="rail-icon rail-icon-text">PM</span>
      </button>

      <div className="rail-divider" />

      <div className="rail-spacer" />

      <button
        aria-label={t("sidebar.settings")}
        className={currentView === "settings" ? "rail-button active" : "rail-button"}
        onClick={onOpenSettings}
        title={t("sidebar.settings")}
        type="button"
      >
        <span className="rail-icon rail-icon-text">ST</span>
      </button>
    </div>
  );
}
