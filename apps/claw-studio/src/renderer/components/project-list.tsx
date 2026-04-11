import type { StudioProject } from "../store/studio-store.js";
import { useI18n } from "../i18n/index.js";

type ProjectListProps = {
  projects: StudioProject[];
  selectedProjectId: string;
  onSelect: (projectId: string) => void;
};

export function ProjectList({ projects, selectedProjectId, onSelect }: ProjectListProps) {
  const { t } = useI18n();

  return (
    <section className="nav-section">
      <div className="nav-section-header">
        <h2>{t("sidebar.projects")}</h2>
      </div>
      <div className="nav-list">
        {projects.map((project) => (
          <button
            key={project.id}
            className={project.id === selectedProjectId ? "nav-item active" : "nav-item"}
            onClick={() => onSelect(project.id)}
            type="button"
          >
            <span className="nav-item-title">{project.name}</span>
            {project.description ? <span className="nav-item-meta">{project.description}</span> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
