// Demo/tanıtım görselleri: her mekânda bot bir süre oynar, sonra kare alınır. Karakter ve dolap galerileri de çizilir.
// Kullanım: node scripts/demo.mjs  → shots/demo-*.png   (LANG_ID=en ile İngilizce arayüz)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

mkdirSync('shots', { recursive: true });
const W = Number(process.env.W || 1280);
const H = Number(process.env.H || 720);
const server = await createServer({ server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const lang = process.env.LANG_ID || 'tr';
await page.addInitScript((lang) => {
  const s = { version: 2, xp: 4200, wallet: 640, look: { tray: 'tray-brass', vest: 'vest-red', hat: 'hat-fez', glass: 'glass-gold' }, tutorialDone: true, playerName: 'Cemal', settings: { lang, volume: 0, music: 0, sensitivity: 1, quality: 'high', invertY: false } };
  localStorage.setItem('cayci-save-v2', JSON.stringify(s));
}, lang);
await page.goto('http://localhost:5197/');
await page.waitForTimeout(2500);
const prefix = process.env.PREFIX || 'demo';
await page.screenshot({ path: `shots/${prefix}-00-menu.png` });

const POL = { greed: 6, spin: true, timingError: 0.03, careful: true };
// [mekân, saniye, dosya, tohum]
const SCENES = [
  [0, 14, 'salon', 3],
  [1, 20, 'zemin-kat', 2],
  [2, 26, 'kat1-paspas', 4],
  [3, 18, 'kat2-pasa', 5],
  [4, 22, 'kat3-karanlik', 3],
  [5, 30, 'teras', 6],
];
let n = 1;
for (const [i, secs, name, seed] of SCENES) {
  await page.evaluate(([i, secs, pol, seed]) => window.__cayci.botScene(i, secs, pol, seed), [i, secs, POL, seed]);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `shots/${prefix}-${String(n++).padStart(2, '0')}-${name}.png` });
}
// kule: 10 bardakla ocaktan çıkış
await page.evaluate(() => {
  window.__cayci.botScene(5, 0.1, { greed: 0, spin: false, timingError: 0, careful: true }, 1);
  const r = window.__cayci.game.run;
  for (let k = 0; k < 10; k++) r.tray.addGlass(k % 3 ? 'demli' : 'acik', 0.92, 85, 1);
  window.__cayci.sim([[0.6, []], [1.2, ['KeyW', 'ControlLeft']]]);
});
await page.waitForTimeout(2200);
await page.screenshot({ path: `shots/${prefix}-${String(n++).padStart(2, '0')}-kule.png` });
// Fırıldak: gösterge açıkken ve dönüş anında
await page.evaluate(() => {
  window.__cayci.botScene(0, 0.1, { greed: 0, spin: false, timingError: 0, careful: true }, 1);
  const r = window.__cayci.game.run;
  for (let k = 0; k < 4; k++) r.tray.addGlass('demli', 0.92, 85, 1);
  r.player.place(10.5, 7.2, Math.PI / 2 + 0.6);
  r.tray.reset(r.player.hand);
  window.__cayci.sim([[0.3, []], [0.02, ['KeyF']], [0.255, []], [0.02, ['KeyF']], [0.68, []]]);
});
await page.waitForTimeout(2200);
await page.screenshot({ path: `shots/${prefix}-${String(n++).padStart(2, '0')}-firildak.png` });
for (const k of ['cast', 'wardrobe', 'props']) {
  await page.evaluate((k) => window.__cayci.gallery(k), k);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `shots/${prefix}-${String(n++).padStart(2, '0')}-${k === 'cast' ? 'karakterler' : k === 'wardrobe' ? 'dolap' : 'tepsi'}.png` });
}
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
await server.close();
