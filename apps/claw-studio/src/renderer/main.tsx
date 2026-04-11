import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { I18nProvider } from "./i18n/index.js";
import { useStudioState } from "./store/studio-store.js";
import "./styles/app.css";
import "./styles/workspace.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container not found");
}

function RootApp() {
  const studio = useStudioState();

  return (
    <I18nProvider locale={studio.locale} setLocale={studio.setLocale}>
      <App studio={studio} />
    </I18nProvider>
  );
}

createRoot(container).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
