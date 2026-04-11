import { app, BrowserWindow, ipcMain } from "electron";

import { loadStudioStateFile, saveStudioStateFile } from "./studio-state-file.js";
import { createMainWindow } from "./window.js";

function bootstrap(): void {
  app.whenReady().then(() => {
    ipcMain.handle("studio-state:load", async () => {
      return loadStudioStateFile();
    });
    ipcMain.handle("studio-state:save", async (_event, payload: unknown) => {
      await saveStudioStateFile(payload);
    });

    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

bootstrap();
