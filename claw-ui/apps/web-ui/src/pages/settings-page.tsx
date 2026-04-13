import { useEffect, useState } from "react";

import type { AppSettings } from "../../../../shared/contracts/index.js";

type SettingsPageProps = {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
  saveMessage: string | null;
  saveError: string | null;
};

export function SettingsPage({ settings, onSave, saveMessage, saveError }: SettingsPageProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <h2>Settings</h2>
      <label className="field">
        <span>activeProvider</span>
        <input
          value={draft.activeProvider}
          onChange={(event) =>
            setDraft((current) => ({ ...current, activeProvider: event.target.value }))
          }
        />
      </label>
      <label className="field">
        <span>activeModel</span>
        <input
          value={draft.activeModel}
          onChange={(event) =>
            setDraft((current) => ({ ...current, activeModel: event.target.value }))
          }
        />
      </label>
      <label className="field">
        <span>retryCount</span>
        <input
          type="number"
          min={0}
          value={draft.retryCount}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              retryCount: Number.parseInt(event.target.value || "0", 10),
            }))
          }
        />
      </label>
      <label className="field">
        <span>openaiBaseUrl</span>
        <input
          value={draft.openaiBaseUrl}
          onChange={(event) =>
            setDraft((current) => ({ ...current, openaiBaseUrl: event.target.value }))
          }
        />
      </label>
      <label className="field">
        <span>apiKey</span>
        <input
          type="password"
          value={draft.apiKey}
          onChange={(event) =>
            setDraft((current) => ({ ...current, apiKey: event.target.value }))
          }
        />
      </label>
      <label className="field">
        <span>enableTools</span>
        <input
          type="checkbox"
          checked={draft.enableTools}
          onChange={(event) =>
            setDraft((current) => ({ ...current, enableTools: event.target.checked }))
          }
        />
      </label>
      <div className="actions">
        <button onClick={() => void handleSave()} disabled={saving} type="button">
          {saving ? "Saving..." : "Save"}
        </button>
        {saveMessage ? <p className="message success">{saveMessage}</p> : null}
        {saveError ? <p className="message error">{saveError}</p> : null}
      </div>
    </section>
  );
}
