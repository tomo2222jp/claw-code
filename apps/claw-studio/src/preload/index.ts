import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("clawStudio", {
  loadStudioState: () => ipcRenderer.invoke("studio-state:load") as Promise<unknown>,
  platform: process.platform,
  saveStudioState: (payload: unknown) => ipcRenderer.invoke("studio-state:save", payload) as Promise<void>,
});
