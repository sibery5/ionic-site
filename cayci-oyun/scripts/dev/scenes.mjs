// Bütün ara sahneleri oynatıp her birinden iki kare alır: shots/scene-<id>-<n>.png
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5208 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript((LANG) => localStorage.setItem('cayci-save-v2', JSON.stringify({ version: 2, tutorialDone: true, look: { tray: 'tray-brass', vest: 'vest-red', hat: 'hat-fez', glass: 'glass-gold' }, settings: { lang: LANG, volume: 0, music: 0, sensitivity: 1, quality: 'high', invertY: false } })), process.env.LANG_ID || 'tr');
await page.goto('http://localhost:5208/');
await page.waitForTimeout(1500);
const ids = process.argv.slice(2).length ? process.argv.slice(2) : await page.evaluate(async () => Object.keys((await import('/src/game/scenes.ts')).SCENES));
for (const id of ids) {
  await page.evaluate((id) => window.__cayci.scene(id), id);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `shots/${process.env.PREFIX || 'scene'}-${id}-1.png` });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `shots/${process.env.PREFIX || 'scene'}-${id}-2.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
await server.close();
