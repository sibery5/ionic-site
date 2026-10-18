// Oyun koduna sadece güvenli, dar bir Steam köprüsü açılır.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('steamBridge', {
  achievement: (id) => ipcRenderer.invoke('steam:achievement', id),
  cloudSave: (json) => ipcRenderer.send('steam:cloudSave', json),
  cloudLoad: () => ipcRenderer.invoke('steam:cloudLoad'),
  playerName: () => ipcRenderer.invoke('steam:playerName'),
});
