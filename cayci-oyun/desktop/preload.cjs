// Oyun koduna sadece güvenli, dar bir Steam köprüsü açılır.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('steamBridge', {
  achievement: (id) => ipcRenderer.invoke('steam:achievement', id),
});
