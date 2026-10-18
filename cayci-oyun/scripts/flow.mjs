// Hikâye akışı ve ses motoru için uçtan uca duman testi.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5193 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript(() => localStorage.clear());
await page.goto('http://localhost:5193/');
await page.waitForTimeout(1500);
const clickText = async (txt) => { await page.locator('button', { hasText: txt }).first().click(); await page.waitForTimeout(400); };
await page.mouse.click(900, 300); // ses başlat
// ses motoru: her efekti çal
await page.evaluate(async () => {
  const { audio } = await import('/src/audio/Audio.ts');
  audio.init(); audio.startMusic();
  audio.clink(0.8); audio.footstep('walk'); audio.footstep('wet'); audio.splash(0.3); audio.shatter(); audio.coin(5);
  audio.whoosh(); audio.applause(); audio.babble(180, 5); audio.shout(); audio.meow(); audio.jingle(); audio.fail();
  const p = audio.pour(); p.update(0.5); p.stop(); audio.startAmbience(true); audio.setWind(0.8); audio.stopAmbience();
});
await page.waitForTimeout(800);
const lang = await page.evaluate(() => document.querySelector('.btn.active')?.textContent);
await clickText(lang === 'TR' ? 'Yeni Hikâye' : 'New Story');
await page.screenshot({ path: 'shots/flow-1-note.png' });
for (let day = 0; day < 5; day++) {
  await page.locator('.btn.primary').first().click(); // vardiyaya başla
  await page.waitForTimeout(300);
  await page.locator('.btn.primary').first().click(); // oynamak için tıkla
  await page.waitForTimeout(300);
  await page.evaluate((day) => { const s = window.__cayci.game.shift; s.earned = [90, 120, 150, 170, 280][day]; s.newGossip.push(...s.offices.filter(o => o.gossip).map(o => `${day}:${o.id}`)); s.forceEnd(); }, day);
  await page.waitForTimeout(400);
  if (day === 0) await page.screenshot({ path: 'shots/flow-2-summary.png' });
  await page.locator('.btn.primary').first().click(); // devam → çarşı
  await page.waitForTimeout(300);
  if (day === 1) await page.screenshot({ path: 'shots/flow-3-shop.png' });
  const buy = page.locator('.shop-item button:not([disabled])');
  if (await buy.count()) await buy.first().click();
  await page.waitForTimeout(200);
  await page.locator('.btn.primary').last().click(); // sonraki gün
  await page.waitForTimeout(400);
}
await page.screenshot({ path: 'shots/flow-4-choice.png' });
await page.locator('.btn.primary').first().click(); // çayı dök
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/flow-5-ending.png' });
const save = await page.evaluate(() => JSON.parse(localStorage.getItem('cayci-save-v1')));
console.log('save', { day: save.day, wallet: save.wallet, upgrades: save.upgrades, gossip: save.gossip.length, ending: save.ending, stars: save.stars });
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close(); await server.close();
