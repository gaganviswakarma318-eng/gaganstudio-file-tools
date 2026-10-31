const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gsftDesktop", {
  openFiles: (kind, multiple) => ipcRenderer.invoke("gsft:open-files", kind, multiple),
  saveFile: (name, mimeType, data) => ipcRenderer.invoke("gsft:save-file", name, mimeType, data),
});

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.desktop = "true";
});
