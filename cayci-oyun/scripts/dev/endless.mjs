// Sonsuz vardiyayı menüden başlatır, siparişleri kaçırarak üç canı bitirir, sonuç ekranını kontrol eder. shots/endless-*.png
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5218 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript(() => localStorage.setItem('cayci-save-v2', JSON.stringify({ version: 2, tutorialDone: true, scenes: ['intro'], venues: { salon: { best: 80, stars: 2, objectives: [], plays: 2 } }, settings: { lang: 'tr', volume: 0, music: 0, sensitivity: 1, quality: 'low', invertY: false } })));
await page.goto('http://localhost:5218/');
await page.waitForTimeout(1500);
await page.locator('button', { hasText: 'Sonsuz Vardiya' }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/endless-1-pick.png' });
await page.locator('.venue-card:not(.locked)').last().click(); // giriş salonu (en altta)
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/endless-2-intro.png' });
await page.locator('.btn.primary').first().click();
await page.waitForTimeout(300);
await page.locator('.btn.primary').first().click();
await page.evaluate(() => { window.__cayci.game.state = 'overlay'; window.__cayci.sim([[20, []]]); });
const mid = await page.evaluate(() => { const r = window.__cayci.game.run; return { mode: r.cfg.mode, t: Math.round(r.time), strikes: r.strikes, orders: r.orders.size, remaining: r.remaining }; });
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/endless-3-hud.png' });
// siparişleri kaçır: 3 can gidene kadar
await page.evaluate(() => window.__cayci.sim([[200, []]]));
await page.waitForTimeout(1200);
const ended = await page.evaluate(() => ({ run: !!window.__cayci.game.run && !window.__cayci.game.run.ended, results: !!document.querySelector('.results') }));
await page.screenshot({ path: 'shots/endless-4-results.png' });
const save = await page.evaluate(() => JSON.parse(localStorage.getItem('cayci-save-v2')));
console.log('orta:', JSON.stringify(mid), 'bitti:', JSON.stringify(ended), 'tablo:', JSON.stringify(save.boards['endless-salon']), 'salon rekoru değişmedi:', save.venues.salon.best === 80);
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
await server.close();
