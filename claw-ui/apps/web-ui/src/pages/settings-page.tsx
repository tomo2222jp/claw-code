import { useEffect, useState } from "react";

import type { AppSettings, CustomProvider } from "../../../../shared/contracts/index.js";

type SettingsPageProps = {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<AppSettings>;
  saveMessage: string | null;
  saveError: string | null;
};

export function SettingsPage({ settings, onSave, saveMessage, saveError }: SettingsPageProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const handleCustomProviderChange = (field: keyof CustomProvider, value: string) => {
    setDraft((current) => {
      const llmSettings = current.llmSettings || {};
      const customProvider = llmSettings.customProvider || { providerId: '', baseUrl: '', modelId: '' };
      
      return {
        ...current,
        llmSettings: {
          ...llmSettings,
          customProvider: {
            ...customProvider,
            [field]: value,
          },
        },
      };
    });
  };

  const handleProviderChange = (value: string) => {
    setDraft((current) => {
      const llmSettings = current.llmSettings || {};
      
      return {
        ...current,
        llmSettings: {
          ...llmSettings,
          provider: value,
        },
      };
    });
  };

  const handleModelIdChange = (value: string) => {
    setDraft((current) => {
      const llmSettings = current.llmSettings || {};
      
      return {
        ...current,
        llmSettings: {
          ...llmSettings,
          modelId: value,
        },
      };
    });
  };

  const isDirty =
    draft.activeProvider !== settings.activeProvider ||
    draft.activeModel !== settings.activeModel ||
    draft.retryCount !== settings.retryCount ||
    draft.openaiBaseUrl !== settings.openaiBaseUrl ||
    draft.llmSettings?.provider !== settings.llmSettings?.provider ||
    draft.llmSettings?.modelId !== settings.llmSettings?.modelId ||
    draft.llmSettings?.customProvider?.providerId !== settings.llmSettings?.customProvider?.providerId ||
    draft.llmSettings?.customProvider?.baseUrl !== settings.llmSettings?.customProvider?.baseUrl ||
    draft.llmSettings?.customProvider?.modelId !== settings.llmSettings?.customProvider?.modelId ||
    draft.llmSettings?.customProvider?.apiKey !== settings.llmSettings?.customProvider?.apiKey ||
    draft.llmSettings?.customProvider?.displayName !== settings.llmSettings?.customProvider?.displayName;

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
      
      {/* Basic Settings */}
      <h3>Basic Settings</h3>
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

      {/* Advanced Settings Toggle */}
      <div className="advanced-toggle">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? "Hide" : "Show"} Advanced Settings
        </button>
      </div>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className="advanced-settings">
          <h3>Advanced LLM Settings</h3>
          <p className="hint">
            Phase 9C: Custom provider support. Set provider to "custom" to use custom provider configuration.
          </p>
          
          <label className="field">
            <span className="field-label">
              <span>Provider</span>
              <span className="hint">LLM provider (google, openrouter, openai, anthropic, custom)</span>
            </span>
            <select
              value={draft.llmSettings?.provider || ''}
              onChange={(event) => handleProviderChange(event.target.value)}
            >
              <option value="">Select provider...</option>
              <option value="google">Google</option>
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">
              <span>Model ID</span>
              <span className="hint">Model identifier for the selected provider</span>
            </span>
            <input
              value={draft.llmSettings?.modelId || ''}
              onChange={(event) => handleModelIdChange(event.target.value)}
              placeholder="gemini-2.5-flash"
            />
          </label>

          {/* Custom Provider Settings - only show when provider is "custom" */}
          {draft.llmSettings?.provider === 'custom' && (
            <div className="custom-provider-settings">
              <h4>Custom Provider Configuration</h4>
              <p className="hint">
                Required for custom provider: providerId, baseUrl, modelId
              </p>
              
              <label className="field">
                <span className="field-label">
                  <span>Provider ID</span>
                  <span className="hint required">Required</span>
                </span>
                <input
                  value={draft.llmSettings?.customProvider?.providerId || ''}
                  onChange={(event) => handleCustomProviderChange('providerId', event.target.value)}
                  placeholder="my-custom-provider"
                />
              </label>

              <label className="field">
                <span className="field-label">
                  <span>Display Name</span>
                  <span className="hint">Optional display name</span>
                </span>
                <input
                  value={draft.llmSettings?.customProvider?.displayName || ''}
                  onChange={(event) => handleCustomProviderChange('displayName', event.target.value)}
                  placeholder="My Custom Provider"
                />
              </label>

              <label className="field">
                <span className="field-label">
                  <span>Base URL</span>
                  <span className="hint required">Required - must be a valid URL</span>
                </span>
                <input
                  value={draft.llmSettings?.customProvider?.baseUrl || ''}
                  onChange={(event) => handleCustomProviderChange('baseUrl', event.target.value)}
                  placeholder="https://api.example.com/v1"
                />
              </label>

              <label className="field">
                <span className="field-label">
                  <span>API Key</span>
                  <span className="hint">Optional API key for the custom provider</span>
                </span>
                <input
                  type="password"
                  value={draft.llmSettings?.customProvider?.apiKey || ''}
                  onChange={(event) => handleCustomProviderChange('apiKey', event.target.value)}
                  placeholder="sk-..."
                />
              </label>

              <label className="field">
                <span className="field-label">
                  <span>Model ID</span>
                  <span className="hint required">Required - model identifier for custom provider</span>
                </span>
                <input
                  value={draft.llmSettings?.customProvider?.modelId || ''}
                  onChange={(event) => handleCustomProviderChange('modelId', event.target.value)}
                  placeholder="custom-model-1"
                />
              </label>
            </div>
          )}
        </div>
      )}

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
