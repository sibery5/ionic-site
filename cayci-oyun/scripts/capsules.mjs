// Steam mağaza görselleri: anahtar sahneyi her kapak boyutunda çizer, logoyu HTML ile üstüne koyar.
// Kullanım: node scripts/capsules.mjs  → steam/capsules/*.png
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

mkdirSync('steam/capsules', { recursive: true });
const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// [dosya, genişlik, yükseklik, logo: 'left' | 'center' | 'none' | 'only']
const SIZES = [
  ['header_capsule', 920, 430, 'left'],
  ['small_capsule', 462, 174, 'left'],
  ['main_capsule', 1232, 706, 'left'],
  ['vertical_capsule', 748, 896, 'center'],
  ['library_capsule', 600, 900, 'center'],
  ['library_hero', 3840, 1240, 'none'],
  ['library_logo', 1280, 720, 'only'],
];
for (const [name, w, h, logo] of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('cayci-save-v2', JSON.stringify({ version: 2, tutorialDone: true, settings: { lang: 'tr', volume: 0, music: 0, sensitivity: 1, quality: 'high', invertY: false } })));
  await page.goto('http://localhost:5198/');
  await page.waitForTimeout(1500);
  await page.evaluate(([logo, w, h]) => {
    document.querySelectorAll('.hud, .menu').forEach((e) => (e.style.display = 'none'));
    if (logo !== 'only') window.__cayci.gallery('keyart');
    else {
      document.querySelector('#app > canvas').style.display = 'none';
      document.body.style.background = 'transparent';
      document.documentElement.style.background = 'transparent';
    }
    if (logo === 'none') return;
    const box = document.createElement('div');
    const small = h < 200;
    const size = logo === 'only' ? 300 : small ? h * 0.42 : Math.min(w * (logo === 'center' ? 0.24 : 0.17), h * 0.3);
    Object.assign(box.style, {
      position: 'fixed', zIndex: 99, textAlign: 'center', fontFamily: 'Georgia, serif', color: '#fff6dc',
      ...(logo === 'center' ? { left: '0', right: '0', top: `${h * 0.05}px` } : logo === 'only' ? { left: '0', right: '0', top: `${h / 2 - size * 0.7}px` } : { left: `${w * 0.045}px`, top: `${h * (small ? 0.12 : 0.1)}px`, textAlign: 'left' }),
    });
    box.innerHTML = `<div style="font-size:${size}px;font-weight:bold;letter-spacing:${size * 0.04}px;line-height:1;text-shadow:0 ${size * 0.05}px 0 #b3261e, 0 ${size * 0.09}px ${size * 0.12}px rgba(0,0,0,.7)">ÇAYCI</div>` +
      (small ? '' : `<div style="font-size:${size * 0.24}px;font-style:italic;color:#e9cf7a;margin-top:${size * 0.12}px;text-shadow:0 2px 6px rgba(0,0,0,.8)">Don't Spill the Tea</div>`);
    document.body.appendChild(box);
  }, [logo, w, h]);
  await page.waitForTimeout(logo === 'only' ? 300 : 2500);
  await page.screenshot({ path: `steam/capsules/${name}.png`, omitBackground: logo === 'only' });
  console.log(name, w, h, errors.length ? errors : 'ok');
  await page.close();
}
await browser.close();
await server.close();
