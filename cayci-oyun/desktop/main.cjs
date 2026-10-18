// ÇAYCI masaüstü sarmalayıcısı. Web derlemesini (../dist → app/) Electron penceresinde açar.
// Steam: steam_appid.txt dosyasına kendi App ID'ni yaz; steamworks.js yoksa oyun yine çalışır.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let steam = null;
try {
  const idFile = path.join(__dirname, 'steam_appid.txt');
  const appId = fs.existsSync(idFile) ? Number(fs.readFileSync(idFile, 'utf8').trim()) : 480; // 480 = Valve'ın test uygulaması
  steam = require('steamworks.js').init(appId);
  require('steamworks.js').electronEnableSteamOverlay();
} catch (e) {
  console.log('Steam bağlantısı yok, çevrimdışı çalışılıyor:', e.message);
}

ipcMain.handle('steam:achievement', (_e, id) => {
  try {
    return steam ? steam.achievement.activate(id) : false;
  } catch {
    return false;
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#120c08',
    title: 'ÇAYCI — Don\'t Spill the Tea',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.on('ready-to-show', () => win.show());
}

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
