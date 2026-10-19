// oyna/CAYCI.html dosyasını sunucusuz (file://) açar, menüden kariyere girip vardiyayı başlatır. Hata sıfır olmalı.
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('file://' + resolve('oyna/CAYCI.html'));
await page.waitForTimeout(3000);
const buttons = await page.locator('button').allInnerTexts();
console.log('menü düğmeleri:', buttons.slice(0, 6).join(' | '));
await page.locator('.btn.primary').first().click(); // kariyer
await page.waitForTimeout(400);
await page.locator('.venue-card:not(.locked)').first().click();
await page.waitForTimeout(1500);
console.log('giriş sahnesi:', (await page.locator('.dialogue').count()) > 0);
await page.locator('.dlg-skip').click();
await page.waitForTimeout(400);
await page.locator('.btn.primary').first().click(); // başla
await page.waitForTimeout(400);
await page.locator('.btn.primary').first().click(); // oynamak için tıkla
await page.keyboard.down('KeyE');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyE');
await page.screenshot({ path: 'shots/file-smoke.png' });
console.log('HUD görünür:', await page.locator('.hud').first().isVisible().catch(() => false));
// kayıt file:// altında da kalıcı mı?
await page.reload();
await page.waitForTimeout(2500);
console.log('kayıt kaldı:', await page.evaluate(() => !!localStorage.getItem('cayci-save-v2')));
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
