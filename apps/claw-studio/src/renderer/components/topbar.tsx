import type { Locale } from "../i18n/index.js";
import { useI18n } from "../i18n/index.js";
import { StatusPill } from "./status-pill.js";

type TopbarProps = {
  healthLabel: string;
  healthTone: "neutral" | "accent" | "success" | "danger";
  currentProjectName: string;
  currentSessionName: string;
  locale: Locale;
  activeModel?: string;
  onOpenSettings: () => void;
  onLocaleChange: (locale: Locale) => void;
};

// "openai/gpt-oss-120b:free" → "gpt-oss-120b"
function shortModelName(model: string): string {
  const afterSlash = model.split("/").pop() ?? model;
  return afterSlash.split(":")[0] ?? afterSlash;
}

export function Topbar({
  healthLabel,
  healthTone,
  currentProjectName,
  currentSessionName,
  locale,
  activeModel,
  onOpenSettings,
  onLocaleChange,
}: TopbarProps) {
  const { t } = useI18n();

  return (
    <header className="topbar">
      <div className="topbar-copy compact">
        <div className="topbar-crumbs">
          <span className="topbar-label-text">{currentProjectName}</span>
          <span className="topbar-separator">/</span>
          <strong>{currentSessionName}</strong>
        </div>
      </div>

      <div className="topbar-meta compact">
        <StatusPill tone={healthTone}>{healthLabel}</StatusPill>
        {activeModel ? (
          <button
            className="ghost-button topbar-settings topbar-model"
            onClick={onOpenSettings}
            title={t("settings.modelLabel")}
            type="button"
          >
            {shortModelName(activeModel)}
          </button>
        ) : null}
        <div className="locale-switcher" aria-label={t("topbar.locale")}>
          {(["ja", "en"] as const).map((option) => (
            <button
              key={option}
              className={option === locale ? "locale-button active" : "locale-button"}
              onClick={() => onLocaleChange(option)}
              type="button"
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="ghost-button topbar-settings" onClick={onOpenSettings} type="button">
          {t("sidebar.settings")}
        </button>
      </div>
    </header>
  );
}
