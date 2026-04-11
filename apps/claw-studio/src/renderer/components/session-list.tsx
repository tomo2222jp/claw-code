import type { StudioSession } from "../store/studio-store.js";
import { useI18n } from "../i18n/index.js";

type SessionListProps = {
  sessions: StudioSession[];
  selectedSessionId: string;
  onSelect: (sessionId: string) => void;
  onCreateSession: () => void;
};

export function SessionList({
  sessions,
  selectedSessionId,
  onSelect,
  onCreateSession,
}: SessionListProps) {
  const { t } = useI18n();

  return (
    <section className="nav-section">
      <div className="nav-section-header">
        <h2>{t("sidebar.sessions")}</h2>
        <button className="ghost-button" onClick={onCreateSession} type="button">
          {t("sidebar.newSession")}
        </button>
      </div>
      <div className="nav-list">
        {sessions.map((session) => (
          <button
            key={session.id}
            className={session.id === selectedSessionId ? "nav-item active" : "nav-item"}
            onClick={() => onSelect(session.id)}
            type="button"
          >
            <span className="nav-item-title">{session.title}</span>
            <span className="nav-item-meta">{formatTimestamp(session.updatedAt)}</span>
          </button>
        ))}
      </div>
    </section>
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
