import { useEffect, useState } from "react";

import type { AppSettings, CustomProvider, ProviderCapability } from "../../../../shared/contracts/index.js";
import { getProviderCapability } from "../constants/provider-capabilities.js";

type SettingsPageProps = {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<AppSettings>;
  saveMessage: string | null;
  saveError: string | null;
};

type CapabilityDisplayProps = {
  capability: ProviderCapability | null;
};

function CapabilityDisplay({ capability }: CapabilityDisplayProps) {
  if (!capability) {
    return null;
  }

  const getStabilityColor = (stability: string) => {
    switch (stability) {
      case "recommended": return "#0d7a5f";
      case "supported": return "#325d9b";
      case "experimental": return "#8a5a1e";
      default: return "#6c8199";
    }
  };

  const formatCapabilityValue = (value: boolean | "depends") => {
    if (value === "depends") return "Depends";
    return value ? "Yes" : "No";
  };

  const getCapabilityColor = (value: boolean | "depends") => {
    if (value === "depends") return "#8a5a1e";
    return value ? "#0d7a5f" : "#6c8199";
  };

  return (
    <div className="capability-display">
      <div className="capability-header">
        <h4>{capability.label}</h4>
        <span 
          className="stability-badge" 
          style={{ backgroundColor: getStabilityColor(capability.stability) }}
        >
          {capability.stability.charAt(0).toUpperCase() + capability.stability.slice(1)}
        </span>
      </div>
      
      {/* Enhanced provider guidance */}
      {(capability.summary || capability.bestFor || capability.caution) && (
        <div className="provider-guidance">
          {capability.summary && (
            <div className="guidance-summary">
              <strong>Summary:</strong> {capability.summary}
            </div>
          )}
          
          {capability.bestFor && (
            <div className="guidance-best-for">
              <strong>Best for:</strong> {capability.bestFor}
            </div>
          )}
          
          {capability.caution && (
            <div className="guidance-caution">
              <strong>Note:</strong> {capability.caution}
            </div>
          )}
        </div>
      )}
      
      {capability.notes && !capability.summary && (
        <p className="hint">{capability.notes}</p>
      )}
      
      <div className="capability-grid">
        <div className="capability-item">
          <span className="capability-label">Tools</span>
          <span 
            className="capability-value" 
            style={{ color: getCapabilityColor(capability.supportsTools) }}
          >
            {formatCapabilityValue(capability.supportsTools)}
          </span>
        </div>
        <div className="capability-item">
          <span className="capability-label">Streaming</span>
          <span 
            className="capability-value" 
            style={{ color: getCapabilityColor(capability.supportsStreaming) }}
          >
            {formatCapabilityValue(capability.supportsStreaming)}
          </span>
        </div>
        <div className="capability-item">
          <span className="capability-label">Vision</span>
          <span 
            className="capability-value" 
            style={{ color: getCapabilityColor(capability.supportsVision) }}
          >
            {formatCapabilityValue(capability.supportsVision)}
          </span>
        </div>
        <div className="capability-item">
          <span className="capability-label">Custom Endpoint</span>
          <span 
            className="capability-value" 
            style={{ color: getCapabilityColor(capability.supportsCustomEndpoint) }}
          >
            {formatCapabilityValue(capability.supportsCustomEndpoint)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage({ settings, onSave, saveMessage, saveError }: SettingsPageProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; provider?: string; modelId?: string; baseUrl?: string } | null>(null);

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

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const response = await fetch('/api/settings/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          llmSettings: draft.llmSettings
        }),
      });
      
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        ok: false,
        message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
        provider: draft.llmSettings?.provider || 'unknown'
      });
    } finally {
      setTesting(false);
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

  const currentProvider = draft.llmSettings?.provider || '';
  const isCustomProvider = currentProvider === 'custom';

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
      
      {/* Mode Selector */}
      <div className="segmented-control">
        <button
          type="button"
          className={`segmented-option ${!showAdvanced && !isCustomProvider ? 'active' : ''}`}
          onClick={() => {
            setShowAdvanced(false);
            if (currentProvider === 'custom') {
              handleProviderChange('');
            }
          }}
        >
          Standard
        </button>
        <button
          type="button"
          className={`segmented-option ${showAdvanced && !isCustomProvider ? 'active' : ''}`}
          onClick={() => {
            setShowAdvanced(true);
            if (currentProvider === 'custom') {
              handleProviderChange('');
            }
          }}
        >
          Advanced
        </button>
        <button
          type="button"
          className={`segmented-option ${isCustomProvider ? 'active' : ''}`}
          onClick={() => {
            handleProviderChange('custom');
            setShowAdvanced(true);
          }}
        >
          Custom
        </button>
      </div>

{/* Standard Mode (Recommended Default) */}
      {!showAdvanced && !isCustomProvider && (
        <div className="settings-section">
          <h3>Standard Mode</h3>
          <p className="hint">
            <strong>Recommended starting point for most users.</strong> This balanced default 
            provides tools, streaming, and vision support optimized for Claude Code workflows.
          </p>
          
          <div className="standard-recommendation">
            <div className="recommendation-badge">
              <span className="badge-icon">★</span>
              <span className="badge-text">Default Recommendation</span>
            </div>
            <p className="recommendation-reason">
              Google/Gemini offers the best balance of capability, reliability, and 
              seamless integration for most development and coding tasks.
            </p>
          </div>
          
          <div className="standard-settings">
            <div className="standard-info">
              <strong>Provider:</strong> Google<br/>
              <strong>Model:</strong> gemini-2.5-flash<br/>
              <em className="hint">Product default - optimized for Claude Code workflows</em>
            </div>
            
            <div className="capability-section">
              <CapabilityDisplay capability={getProviderCapability('google')} />
            </div>
          </div>
        </div>
      )}

      {/* Advanced Mode (Built-in Providers) */}
      {showAdvanced && !isCustomProvider && (
        <div className="settings-section advanced-settings">
          <h3>Advanced Mode</h3>
          <p className="hint">
            Choose among built-in providers: Google, OpenRouter, OpenAI, or Anthropic.
          </p>
          
          <label className="field">
            <span className="field-label">
              <span>Provider</span>
            </span>
            <select
              value={currentProvider}
              onChange={(event) => handleProviderChange(event.target.value)}
            >
              <option value="">Select provider...</option>
              <option value="google">Google (Gemini)</option>
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="custom">Custom (OpenAI-compatible endpoint)</option>
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
              placeholder={
                currentProvider === 'google' ? 'gemini-2.5-flash' :
                currentProvider === 'openai' ? 'gpt-4o' :
                currentProvider === 'anthropic' ? 'claude-3-5-sonnet' :
                'model-id-here'
              }
            />
          </label>

          {/* Capability Display for Selected Provider */}
          {currentProvider && (
            <div className="capability-section">
              <h4>Provider Capabilities</h4>
              <CapabilityDisplay capability={getProviderCapability(currentProvider)} />
            </div>
          )}

          {/* Test Connection */}
          <div className="test-connection-section">
            <h4>Test Connection</h4>
            <p className="hint">
              Verify that your provider settings are correct before saving.
              This will test connectivity to the endpoint with your current configuration.
            </p>
            
            <div className="test-connection-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleTestConnection()}
                disabled={testing || !currentProvider}
              >
                {testing ? "Testing..." : "Test Connection"}
              </button>
              
              {testResult && !isCustomProvider && (
                <div className={`test-result ${testResult.ok ? 'success' : 'error'}`}>
                  <strong>{testResult.ok ? "✓" : "✗"}</strong> {testResult.message}
                  {testResult.modelId && <div className="hint">Model: {testResult.modelId}</div>}
                  {testResult.baseUrl && <div className="hint">Endpoint: {testResult.baseUrl}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Provider Mode */}
      {isCustomProvider && (
        <div className="settings-section custom-provider-settings">
          <h3>Custom Provider</h3>
          <p className="hint">
            Connect to an OpenAI-compatible endpoint. Base URL and Model ID are required.
            API key is optional only if the endpoint does not require authentication.
          </p>
          
          {/* Capability Info for Custom Provider */}
          <div className="capability-section">
            <h4>Custom Provider Information</h4>
            <div className="custom-provider-info">
              <p className="hint">
                <strong>Note:</strong> Capabilities depend entirely on the remote endpoint implementation.
                This provider type is experimental and requires manual configuration.
              </p>
            </div>
            <CapabilityDisplay capability={getProviderCapability('custom')} />
          </div>
          
          <div className="custom-fields">
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
                <span className="hint">Optional - only if endpoint requires authentication</span>
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

          {/* Test Connection for Custom Provider */}
          <div className="test-connection-section">
            <h4>Test Custom Provider Connection</h4>
            <p className="hint">
              Test connectivity to your custom OpenAI-compatible endpoint.
              This verifies that the base URL is reachable and API key is valid (if provided).
            </p>
            
            <div className="test-connection-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleTestConnection()}
                disabled={testing}
              >
                {testing ? "Testing..." : "Test Connection"}
              </button>
              
              {testResult && isCustomProvider && (
                <div className={`test-result ${testResult.ok ? 'success' : 'error'}`}>
                  <strong>{testResult.ok ? "✓" : "✗"}</strong> {testResult.message}
                  {testResult.modelId && <div className="hint">Model: {testResult.modelId}</div>}
                  {testResult.baseUrl && <div className="hint">Endpoint: {testResult.baseUrl}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Legacy Compatibility Section */}
      <div className="legacy-toggle">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowLegacy(!showLegacy)}
        >
          {showLegacy ? "▲ Hide" : "▼ Show Compatibility / Debug Fields"}
        </button>
        
        {!showLegacy && (
          <div className="legacy-collapsed-summary">
            Legacy fields kept for backward compatibility (most users won't need these)
          </div>
        )}
      </div>

      {showLegacy && (
        <div className="legacy-settings">
          <h3>Compatibility / Debug Fields</h3>
          
          <div className="legacy-note">
            <strong>Note:</strong> These fields are maintained for backward compatibility and debug purposes only. 
            The current recommended path uses the Standard, Advanced, or Custom settings above. 
            Most users should not change these fields.
          </div>
          
          <div className="legacy-fields">
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
          </div>
        </div>
      )}

      <div className="actions">
        <div className="actions-hint">
          <em className="hint">Save applies to all settings above, including compatibility fields if modified</em>
        </div>
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
