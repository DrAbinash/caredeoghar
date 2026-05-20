/**
 * Preload script — bridges safe APIs from main to renderer.
 * Only exposes methods we've explicitly allowed.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("careDesktop", {
  // App info
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getPlatform: () => ipcRenderer.invoke("get-platform"),
  getApiDomain: () => ipcRenderer.invoke("get-api-domain"),

  // Desktop actions
  toggleDevTools: () => ipcRenderer.send("toggle-devtools"),
  minimizeToTray: () => ipcRenderer.send("minimize-to-tray"),
  showSaveDialog: (options) => ipcRenderer.invoke("show-save-dialog", options),

  // Check if running in Electron
  isDesktop: true,
});
