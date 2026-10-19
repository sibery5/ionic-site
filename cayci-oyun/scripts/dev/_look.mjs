import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5213 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => localStorage.setItem('cayci-save-v2', JSON.stringify({ version: 2, tutorialDone: true, settings: { lang: 'tr', volume: 0, music: 0, sensitivity: 1, quality: 'medium', invertY: false, autoQuality: false } })));
await page.goto('http://localhost:5213/');
await page.waitForTimeout(1500);
for (const i of (process.env.V || '0,4').split(',').map(Number)) {
  await page.evaluate((i) => { window.__cayci.startRun(i, 'free'); window.__cayci.game.state = 'overlay'; window.__cayci.sim([[1.5, ['KeyW']], [0.5, []]]); }, i);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/look-${i}.png` });
}
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close(); await server.close();
