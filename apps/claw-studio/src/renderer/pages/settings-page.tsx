import { useEffect, useState } from "react";

import type { AppSettings } from "../../../../../claw-ui/shared/contracts/index.js";
import { useI18n } from "../i18n/index.js";

// Curated list aligned with current OpenRouter-first project direction.
// Provider is openrouter for all v1 options; extend this list in later phases.
const MODEL_OPTIONS = [
  { provider: "openrouter", model: "openai/gpt-oss-120b:free", label: "GPT OSS 120B (free)" },
  { provider: "openrouter", model: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { provider: "openrouter", model: "openai/gpt-4o", label: "GPT-4o" },
  { provider: "openrouter", model: "meta-llama/llama-3.1-70b-instruct:free", label: "Llama 3.1 70B (free)" },
] as const;

function toOptionKey(provider: string, model: string): string {
  return `${provider}::${model}`;
}

type SettingsPageProps = {
  backendSettings: AppSettings | null;
  onBack: () => void;
  onSaveModelSelection: (provider: string, model: string) => Promise<void>;
};

export function SettingsPage({ backendSettings, onBack, onSaveModelSelection }: SettingsPageProps) {
  const { t } = useI18n();
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Sync local selection when backend settings arrive or change
  useEffect(() => {
    if (backendSettings) {
      setSelectedKey(toOptionKey(backendSettings.activeProvider, backendSettings.activeModel));
    }
  }, [backendSettings]);

  const currentKey = backendSettings
    ? toOptionKey(backendSettings.activeProvider, backendSettings.activeModel)
    : "";
  const isDirty = selectedKey !== "" && selectedKey !== currentKey;

  const handleSave = async () => {
    const option = MODEL_OPTIONS.find((opt) => toOptionKey(opt.provider, opt.model) === selectedKey);
    // If not in the curated list, the user selected the read-only current-value option — nothing to save
    if (!option) {
      return;
    }
    setSaveStatus("saving");
    try {
      await onSaveModelSelection(option.provider, option.model);
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      window.setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // If the currently-saved model is not in the curated list, show it as a disabled read-only entry
  const currentNotInList =
    backendSettings !== null &&
    !MODEL_OPTIONS.some((opt) => opt.model === backendSettings.activeModel);

  return (
    <section className="settings-page">
      <div className="settings-card">
        <h2>{t("settings.title")}</h2>

        <div className="settings-field">
          <label className="settings-field-label" htmlFor="settings-model-select">
            {t("settings.modelLabel")}
          </label>
          <select
            id="settings-model-select"
            className="settings-select"
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            disabled={saveStatus === "saving" || backendSettings === null}
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={toOptionKey(opt.provider, opt.model)} value={toOptionKey(opt.provider, opt.model)}>
                {opt.label} — {opt.provider}
              </option>
            ))}
            {currentNotInList && (
              <option value={currentKey}>
                {backendSettings!.activeModel} — {backendSettings!.activeProvider}
              </option>
            )}
          </select>
        </div>

        <div className="settings-actions">
          {saveStatus === "saved" && (
            <span className="settings-save-feedback">{t("settings.modelSaved")}</span>
          )}
          {saveStatus === "error" && (
            <span className="settings-save-feedback settings-save-error">{t("settings.modelSaveError")}</span>
          )}
          <button
            className="primary-button"
            onClick={() => void handleSave()}
            disabled={!isDirty || saveStatus === "saving"}
            type="button"
          >
            {saveStatus === "saving" ? "…" : t("settings.save")}
          </button>
          <button className="ghost-button" onClick={onBack} type="button">
            {t("settings.back")}
          </button>
        </div>
      </div>
    </section>
  );
}
