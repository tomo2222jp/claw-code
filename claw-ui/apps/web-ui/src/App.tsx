import { useEffect, useMemo, useState } from "react";

import type { AppSettings } from "../../../shared/contracts/index.js";
import { getHealth, getSettings, saveSettings, startRun, stopRun } from "./api/client.js";
import { Tabs } from "./components/tabs.js";
import { useRunPolling } from "./hooks/use-run-polling.js";
import { LogsPage } from "./pages/logs-page.js";
import { RunPage } from "./pages/run-page.js";
import { SettingsPage } from "./pages/settings-page.js";
import type { TabId } from "./types/ui.js";

const EMPTY_SETTINGS: AppSettings = {
  activeProvider: "",
  activeModel: "",
  retryCount: 0,
  openaiBaseUrl: "",
  apiKey: "",
  enableTools: false,
};

export function App() {
  const [currentTab, setCurrentTab] = useState<TabId>("run");
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("say hello briefly");
  const [runId, setRunId] = useState<string | null>(null);
  const [runLaunchError, setRunLaunchError] = useState<string | null>(null);
  const [runSubmitting, setRunSubmitting] = useState(false);
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [healthMessage, setHealthMessage] = useState<string>("Checking API health...");

  const { status, logs, error: pollingError } = useRunPolling(runId);

  useEffect(() => {
    void (async () => {
      try {
        const [health, nextSettings] = await Promise.all([getHealth(), getSettings()]);
        setHealthMessage(`${health.service} is healthy (${health.ts})`);
        setSettings(nextSettings);
        setSettingsLoaded(true);
        setSettingsError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setHealthMessage(`Health check failed: ${message}`);
        setSettingsError(message);
      }
    })();
  }, []);

  const runStatusLabel = useMemo(() => {
    if (runLaunchError) {
      return `failed to start: ${runLaunchError}`;
    }
    return status?.status ?? "idle";
  }, [runLaunchError, status?.status]);

  const finalOutput = status?.finalOutput;
  const canStop = status?.status === "starting" || status?.status === "running";
  const runPageStatus = runLaunchError ? "start-failed" : status?.status ?? "idle";

  const handleSaveSettings = async (nextSettings: AppSettings) => {
    setSaveError(null);
    const normalizedSettings: AppSettings = {
      ...nextSettings,
      retryCount: Math.max(0, Number(nextSettings.retryCount) || 0),
    };
    try {
      const saved = await saveSettings(normalizedSettings);
      setSettings(saved);
      setSaveMessage("Settings saved.");
      window.setTimeout(() => setSaveMessage(null), 2500);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(message);
    }
  };

  const handleRun = async () => {
    if (runSubmitting || status?.status === "starting" || status?.status === "running") {
      return;
    }
    setRunSubmitting(true);
    setRunLaunchError(null);
    try {
      const created = await startRun({ prompt });
      setRunId(created.id);
      setCurrentTab("run");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRunLaunchError(message);
    } finally {
      setRunSubmitting(false);
    }
  };

  const handleStop = async () => {
    if (!runId || stopSubmitting || !canStop) {
      return;
    }
    setStopSubmitting(true);
    try {
      await stopRun(runId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRunLaunchError(message);
    } finally {
      setStopSubmitting(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Claw UI</h1>
          <p className="hint">Minimal local web UI for local-api</p>
        </div>
        <div className="health">{healthMessage}</div>
      </header>

      <Tabs current={currentTab} onChange={setCurrentTab} />

      {settingsError ? <p className="message error">{settingsError}</p> : null}
      {currentTab === "run" ? (
        <RunPage
          prompt={prompt}
          onPromptChange={setPrompt}
          onRun={handleRun}
          onStop={handleStop}
          running={status?.status === "starting" || status?.status === "running"}
          canStop={canStop}
          runId={runId}
          status={runPageStatus}
          statusLabel={runStatusLabel}
          startedAt={status?.startedAt}
          finishedAt={status?.finishedAt}
          errorMessage={runLaunchError ?? status?.errorMessage ?? null}
          finalOutput={finalOutput}
        />
      ) : null}

      {currentTab === "settings" ? (
        <SettingsPage
          settings={settings}
          onSave={handleSaveSettings}
          saveMessage={saveMessage}
          saveError={saveError}
        />
      ) : null}

      {currentTab === "logs" ? (
        <LogsPage runId={runId} status={status?.status ?? "idle"} logs={logs} pollingError={pollingError} />
      ) : null}

      {!settingsLoaded ? <p className="hint">Loading settings...</p> : null}
    </main>
  );
}
