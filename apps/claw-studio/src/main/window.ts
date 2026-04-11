import path from "node:path";

import { BrowserWindow } from "electron";

export function createMainWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "..", "preload", "index.js");
  const window = new BrowserWindow({
    width: 1460,
    height: 960,
    minWidth: 1080,
    minHeight: 760,
    title: "Claw Studio",
    backgroundColor: "#111827",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: "detach" });
    return window;
  }

  const rendererIndexPath = path.join(__dirname, "..", "renderer", "index.html");
  void window.loadFile(rendererIndexPath);
  return window;
}
