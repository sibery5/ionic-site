const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  writeSave: (slot, json) => ipcRenderer.invoke('save:write', slot, json),
  readSave: (slot) => ipcRenderer.invoke('save:read', slot),
  deleteSave: (slot) => ipcRenderer.invoke('save:delete', slot),
  quit: () => ipcRenderer.send('app:quit'),
  setFullscreen: (v) => ipcRenderer.send('app:fullscreen', v),
});
