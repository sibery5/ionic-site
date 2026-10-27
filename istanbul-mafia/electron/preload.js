const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  writeSave: (slot, json) => ipcRenderer.invoke('save:write', slot, json),
  readSave: (slot) => ipcRenderer.invoke('save:read', slot),
  deleteSave: (slot) => ipcRenderer.invoke('save:delete', slot),
  quit: () => ipcRenderer.send('app:quit'),
  // çıkış öncesi kayıt: ana süreç sorar, oyun kaydedip quitReady() der
  onQuitRequest: (cb) => ipcRenderer.on('app:quit-request', () => cb()),
  quitReady: () => ipcRenderer.send('app:quit-ready'),
  setFullscreen: (v) => ipcRenderer.send('app:fullscreen', v),
  setPrefs: (p) => ipcRenderer.send('app:prefs', { vsync: !!p.vsync, gpu: String(p.gpu || 'high') }),
});
