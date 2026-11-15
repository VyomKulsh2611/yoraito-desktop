"use strict";
// The only things the page can ask the desktop shell for. No file system, no Node, no arguments to validate.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yoraitoDesktop", Object.freeze({
  appInfo: () => ipcRenderer.invoke("yoraito:app-info"),
  openDataFolder: () => ipcRenderer.invoke("yoraito:open-data-folder"),
}));
