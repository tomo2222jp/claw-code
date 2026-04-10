import { useEffect, useState } from "react";

import type { AppSettings } from "../../../../shared/contracts/index.js";

type SettingsPageProps = {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<AppSettings>;
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
      const saved = await onSave(draft);
      setDraft(saved);
    } finally {
      setSaving(false);
    }
  };

  const isDirty =
    draft.activeProvider !== settings.activeProvider ||
    draft.activeModel !== settings.activeModel ||
    draft.retryCount !== settings.retryCount ||
    draft.openaiBaseUrl !== settings.openaiBaseUrl;

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Settings</h2>
          <p className="hint">
            These saved local-api values are authoritative for bridged execution fields on new runs.
          </p>
        </div>
      </div>
      <div className="callout">
        <h3>Precedence</h3>
        <p>`POST /api/run` uses these saved values for provider, model, retry count, and base URL.</p>
        <p>Repo-local `.claw/settings.local.json` can still affect unrelated runtime behavior.</p>
      </div>
      <label className="field">
        <span className="field-label">
          <span>activeProvider</span>
          <span className="hint">Bridged to `CLAW_ACTIVE_PROVIDER_OVERRIDE`</span>
        </span>
        <input
          value={draft.activeProvider}
          onChange={(event) =>
            setDraft((current) => ({ ...current, activeProvider: event.target.value }))
          }
          placeholder="openai"
        />
      </label>
      <label className="field">
        <span className="field-label">
          <span>activeModel</span>
          <span className="hint">Passed to the CLI as `--model`</span>
        </span>
        <input
          value={draft.activeModel}
          onChange={(event) =>
            setDraft((current) => ({ ...current, activeModel: event.target.value }))
          }
          placeholder="gpt-5.4"
        />
      </label>
      <label className="field">
        <span className="field-label">
          <span>retryCount</span>
          <span className="hint">Bridged to `CLAW_RETRY_COUNT_OVERRIDE`</span>
        </span>
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
        <span className="field-label">
          <span>openaiBaseUrl</span>
          <span className="hint">Exported as `OPENAI_BASE_URL` for the child process</span>
        </span>
        <input
          value={draft.openaiBaseUrl}
          onChange={(event) =>
            setDraft((current) => ({ ...current, openaiBaseUrl: event.target.value }))
          }
          placeholder="https://api.openai.com/v1"
        />
      </label>
      <div className="actions">
        <button onClick={() => void handleSave()} disabled={saving || !isDirty} type="button">
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          className="secondary-button danger-muted"
          onClick={() => setDraft(settings)}
          disabled={saving || !isDirty}
          type="button"
        >
          Reset
        </button>
        {saveMessage ? <p className="message success">{saveMessage}</p> : null}
        {saveError ? <p className="message error">{saveError}</p> : null}
      </div>
    </section>
  );
}
