// Yayın derlemesini (dist/) gerçek tıklamalarla dener: menü → kariyer → salon → oyna. Konsol hatası sıfır olmalı.
import { chromium } from 'playwright-core';
import { preview } from 'vite';
const server = await preview({ preview: { port: 5206 }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5206/');
await page.waitForTimeout(2500);
console.log('hook yok:', await page.evaluate(() => typeof window.__cayci === 'undefined'));
await page.locator('.btn.primary').first().click(); // kariyer
await page.waitForTimeout(400);
await page.locator('.venue-card:not(.locked)').first().click();
await page.waitForTimeout(400);
await page.locator('.btn.primary').first().click(); // başla
await page.waitForTimeout(400);
await page.locator('.btn.primary').first().click(); // oynamak için tıkla
await page.keyboard.down('KeyE');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyE');
await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyW');
await page.screenshot({ path: 'shots/prod-smoke.png' });
const hud = await page.locator('.hud').first().isVisible().catch(() => false);
console.log('HUD görünür:', hud);
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
server.httpServer.close();
