// İstanbul Mafya — masaüstü (Electron) giriş noktası
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
const saveDir = () => {
  const d = path.join(app.getPath('userData'), 'saves');
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const slotFile = (slot) => path.join(saveDir(), `slot-${String(slot).replace(/[^a-z0-9]/gi, '')}.json`);

function create() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 600,
    fullscreen: true, backgroundColor: '#000000', title: 'İstanbul Mafya',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.type === 'keyDown' && input.key === 'F12' && input.control && input.shift) win.webContents.openDevTools();
  });
}

ipcMain.handle('save:write', (e, slot, json) => { fs.writeFileSync(slotFile(slot), json, 'utf8'); return true; });
ipcMain.handle('save:read', (e, slot) => { const f = slotFile(slot); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; });
ipcMain.handle('save:delete', (e, slot) => { const f = slotFile(slot); if (fs.existsSync(f)) fs.unlinkSync(f); return true; });
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:fullscreen', (e, v) => { if (win) win.setFullScreen(!!v); });

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
