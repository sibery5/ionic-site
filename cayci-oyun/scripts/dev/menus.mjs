// Menü ekranlarının görüntüsü (simgeler ve kaydırma çubuğu kontrolü): shots/menu-*.png
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5216 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const POCKET = ['hayri_tapu', 'sevim_evrak', 'ferhat_vekalet', 'rifat_rapor', 'lale_foto', 'nadir_rapor', 'nevin_fal', 'f_ask', 'f_balik'];
await page.addInitScript((P) => localStorage.setItem('cayci-save-v2', JSON.stringify({ version: 2, tutorialDone: true, xp: 4000, title: 3, rep: 62, pocket: P, evidence: ['hayri_tapu', 'rifat_rapor'], burned: ['lale_foto'], sales: ['hayri_tapu>rifat'], venues: { salon: { best: 140, stars: 3, objectives: [], plays: 3 }, zemin: { best: 70, stars: 2, objectives: [], plays: 2 }, kat1: { best: 50, stars: 1, objectives: [], plays: 1 } }, settings: { lang: 'tr', volume: 0, music: 0, sensitivity: 1, quality: 'low', invertY: false } })), POCKET);
await page.goto('http://localhost:5216/');
await page.waitForTimeout(1800);
const shot = async (n) => { await page.waitForTimeout(500); await page.screenshot({ path: `shots/menu-${n}.png` }); };
await shot('1-title');
const book = page.locator('button', { hasText: 'Dedikodu' }).first();
if (await book.count()) { await book.click(); await shot('3-notebook'); await page.mouse.move(640, 400); await page.mouse.wheel(0, 500); await shot('4-notebook-scroll'); }
await page.goto('http://localhost:5216/');
await page.waitForTimeout(1500);
await page.locator('.btn.primary').first().click();
await shot('2-career');
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
await server.close();
