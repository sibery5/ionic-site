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

// Başlangıç tercihleri (VSync, GPU) — Chromium anahtarları ancak açılışta verilebilir
const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json');
function readPrefs() { try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')); } catch (e) { return {}; } }
const prefs = readPrefs();

function validJson(s) { try { const o = JSON.parse(s); return !!(o && o.data); } catch (e) { return false; } }

// Çıkış akışı: pencere kapatma (X / Alt+F4), app.quit(), sistem kapanışı -> önce oyuna "kaydet" de,
// oyun 'app:quit-ready' gönderince (ya da 3 sn zaman aşımında) gerçekten kapat.
let allowClose = false, asked = false, fallback = null;
function requestQuit() {
  if (allowClose) return false;
  if (!win || win.isDestroyed() || win.webContents.isCrashed()) { allowClose = true; return false; }
  if (!asked) {
    asked = true;
    win.webContents.send('app:quit-request');
    fallback = setTimeout(() => { allowClose = true; app.quit(); }, 3000);
  }
  return true;
}
function finishQuit() { allowClose = true; if (fallback) clearTimeout(fallback); app.quit(); }

function create() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 600, show: false,
    fullscreen: true, backgroundColor: '#000000', title: 'İstanbul Mafya',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  // yükleme ekranı çizilince göster (siyah pencerede beklenip oyun tekrar açılmasın)
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.type === 'keyDown' && input.key === 'F12' && input.control && input.shift) win.webContents.openDevTools();
  });
  win.on('close', (e) => { if (requestQuit()) e.preventDefault(); });
  win.webContents.on('render-process-gone', () => { allowClose = true; });
}

ipcMain.handle('save:write', (e, slot, json) => {
  // atomik yazım: geçici dosya -> yeniden adlandır; önceki geçerli kayıt .bak olarak saklanır
  const f = slotFile(slot), tmp = f + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  if (fs.existsSync(f)) { try { fs.copyFileSync(f, f + '.bak'); } catch (err) { /* yok say */ } }
  fs.renameSync(tmp, f);
  return true;
});
ipcMain.handle('save:read', (e, slot) => {
  const f = slotFile(slot);
  for (const c of [f, f + '.bak']) {
    if (!fs.existsSync(c)) continue;
    const s = fs.readFileSync(c, 'utf8');
    if (validJson(s)) return s;
  }
  return null;
});
ipcMain.handle('save:delete', (e, slot) => { const f = slotFile(slot); for (const c of [f, f + '.bak']) if (fs.existsSync(c)) fs.unlinkSync(c); return true; });
ipcMain.on('app:quit', () => finishQuit());
ipcMain.on('app:quit-ready', () => finishQuit());
ipcMain.on('app:fullscreen', (e, v) => { if (win) win.setFullScreen(!!v); });
ipcMain.on('app:prefs', (e, p) => {
  try {
    const cur = readPrefs();
    const next = { ...cur, vsync: p.vsync !== false, gpu: String(p.gpu || 'high') };
    if (JSON.stringify(cur) !== JSON.stringify(next)) fs.writeFileSync(prefsFile(), JSON.stringify(next), 'utf8');
  } catch (err) { /* yok say */ }
});

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
// GPU tercihi: çift ekran kartlı dizüstülerde harici kartı zorla (varsayılan)
if ((prefs.gpu || 'high') === 'high') app.commandLine.appendSwitch('force_high_performance_gpu');
if (prefs.gpu === 'low') app.commandLine.appendSwitch('force_low_power_gpu');
// VSync kapalı: kare hızı sınırı kalkar (oyun içi FPS sınırlayıcı kullanılabilir)
if (prefs.vsync === false) { app.commandLine.appendSwitch('disable-gpu-vsync'); app.commandLine.appendSwitch('disable-frame-rate-limit'); }
// Tek kopya: oyun zaten açıksa ikinci açılış mevcut pencereyi öne getirir
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
  });
  app.on('before-quit', (e) => { if (requestQuit()) e.preventDefault(); });
  app.whenReady().then(create);
}
app.on('window-all-closed', () => app.quit());
