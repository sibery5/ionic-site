// v0.3 akışı için uçtan uca duman testi: kariyer (6 mekân) → han toplantısı → son,
// günlük mücadele, görevler, sıralama, dolap, çarşı, ayarlar. Konsol hatası sıfır olmalı.
// Kullanım: node scripts/flow.mjs  → shots/flow-*.png
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

mkdirSync('shots', { recursive: true });
const server = await createServer({ server: { port: 5193 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const lang = process.env.LANG_ID || 'tr';
await page.addInitScript((lang) => {
  if (!sessionStorage.getItem('init')) {
    localStorage.clear();
    sessionStorage.setItem('init', '1');
    Object.defineProperty(navigator, 'language', { get: () => (lang === 'tr' ? 'tr-TR' : 'en-US') });
  }
}, lang);
await page.goto('http://localhost:5193/');
await page.waitForTimeout(1500);
const ev = (f, a) => page.evaluate(f, a);
const shot = async (name, wait = 500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `shots/flow-${name}.png` }); };
const click = async (sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(250); };
const fail = (msg) => { console.log('HATA:', msg); process.exitCode = 1; };

await page.mouse.click(900, 300); // ses başlat
await shot('00-title');
// kariyer → harita
await click('.btn.primary');
await shot('01-map');
const STAR3 = await ev(async () => (await import('/src/game/venues.ts')).VENUES.map((v) => v.stars[2]));
for (let i = 0; i < 6; i++) {
  // en alttaki açık kart = sıradaki mekân (harita yukarıdan aşağı tersten dizili)
  const cards = page.locator('.venue-card:not(.locked)');
  const n = await cards.count();
  if (n !== i + 1) fail(`mekân ${i}: açık kart sayısı ${n}, beklenen ${i + 1}`);
  await cards.nth(0).click(); // en üstteki açık = en yeni
  await page.waitForTimeout(250);
  if (i === 0) await shot('02-intro');
  await click('.btn.primary'); // başla
  await click('.btn.primary'); // oynamak için tıkla
  // biraz gerçek oynanış: ocakta doldur
  await ev(() => window.__cayci.sim([[0.3, []], [1.5, ['KeyE']], [0.2, []]]));
  if (i === 0) await shot('03-run', 1200);
  await ev((score) => {
    const r = window.__cayci.game.run;
    r.bank = score;
    Object.assign(r.stats, { delivered: 20, maxDeliveryTower: 10, spins: 3, maxCombo: 5, coloredServed: 12, vipPerfect: 1, maxBank: 150, banks: 3 });
    for (const o of r.venue.offices) if (o.gossip) r.stats.gossip.push(`${r.venue.id}:${o.id}`);
    r.forceEnd();
  }, STAR3[i] + 5);
  await page.waitForTimeout(400);
  if (i === 0) await shot('04-results');
  const stars = await page.locator('.big-stars').textContent();
  if (!stars?.includes('★★★')) fail(`mekân ${i}: 3 yıldız yok (${stars})`);
  if (i < 5) {
    // harita
    await page.locator('button', { hasText: lang === 'tr' ? 'Harita' : 'Map' }).first().click();
    await page.waitForTimeout(250);
  }
}
// teras bitti → han toplantısı
await click('.btn.primary');
await shot('05-choice');
await click('.btn.primary'); // çayı dök
await shot('06-ending');
let save = await ev(() => JSON.parse(localStorage.getItem('cayci-save-v2')));
console.log('kariyer sonrası', { xp: save.xp, wallet: save.wallet, gossip: save.gossip.length, endings: save.endings, ach: save.achievements.length, stars: Object.fromEntries(Object.entries(save.venues).map(([k, v]) => [k, v.stars])) });
if (save.endings[0] !== 'saved') fail('son "saved" olmalıydı');
if (!save.achievements.includes('END_SAVED') || !save.achievements.includes('ALL_3STAR') || !save.achievements.includes('GOSSIP_ALL')) fail('başarımlar eksik');

// ana menü: günlük
await click('.btn.primary'); // harita
await page.locator('button', { hasText: lang === 'tr' ? 'Geri' : 'Back' }).last().click();
await page.waitForTimeout(300);
await page.locator('.btn-list .btn').nth(1).click(); // günlük
await page.waitForTimeout(250);
await shot('07-daily-intro');
await click('.btn.primary');
await click('.btn.primary');
await ev(() => { const r = window.__cayci.game.run; r.bank = 123; r.forceEnd(); });
await page.waitForTimeout(300);
save = await ev(() => JSON.parse(localStorage.getItem('cayci-save-v2')));
const dkey = Object.keys(save.dailyBest)[0];
if (save.dailyBest[dkey] !== 123) fail('günlük skor kaydedilmedi');
await page.locator('button', { hasText: lang === 'tr' ? 'Harita' : 'Map' }).first().click(); // günlükte ana menüye döner
await page.waitForTimeout(300);
// görevler
await page.locator('.btn-list .btn').nth(2).click();
await shot('08-missions');
await page.locator('button', { hasText: lang === 'tr' ? 'Geri' : 'Back' }).last().click();
await page.waitForTimeout(200);
// sıralama
await page.locator('.btn-row .btn').nth(0).click();
await shot('09-leaderboard');
const rows = await page.locator('table.board tr').count();
if (rows < 3) fail('sıralama tablosu boş');
await page.locator('button', { hasText: lang === 'tr' ? 'Geri' : 'Back' }).last().click();
await page.waitForTimeout(200);
// dolap: açılmış bir kıyafet giy
await page.locator('.btn-row .btn').nth(1).click();
await page.waitForTimeout(250);
const cos = page.locator('.cos-row .btn:not([disabled]):not(.active)');
if (await cos.count()) await cos.last().click();
await shot('10-wardrobe');
await page.locator('button', { hasText: lang === 'tr' ? 'Geri' : 'Back' }).last().click();
await page.waitForTimeout(200);
// çarşı: bir şey al
await page.locator('.btn-row').nth(1).locator('.btn').nth(0).click();
await page.waitForTimeout(250);
const buy = page.locator('.shop-item button:not([disabled])');
const before = (await ev(() => JSON.parse(localStorage.getItem('cayci-save-v2')))).wallet;
if (await buy.count()) await buy.first().click();
await shot('11-shop');
save = await ev(() => JSON.parse(localStorage.getItem('cayci-save-v2')));
if (!(save.upgrades.length >= 1 && save.wallet < before)) fail('çarşıdan alım olmadı');
await page.locator('button', { hasText: lang === 'tr' ? 'Geri' : 'Back' }).last().click();
await page.waitForTimeout(200);
// ayarlar: kalite düşük
await page.locator('.btn-row').nth(2).locator('.btn').nth(1).click();
await page.waitForTimeout(250);
await page.locator('button', { hasText: lang === 'tr' ? 'Düşük' : 'Low' }).first().click();
await shot('12-settings');
save = await ev(() => JSON.parse(localStorage.getItem('cayci-save-v2')));
if (save.settings.quality !== 'low') fail('kalite ayarı kaydedilmedi');
await page.locator('button', { hasText: lang === 'tr' ? 'Geri' : 'Back' }).last().click();
await page.waitForTimeout(400);
await shot('13-title-after', 900);
console.log('son kayıt', { level: save.xp, wallet: save.wallet, upgrades: save.upgrades, look: save.look, missions: save.daily.missions.map((m) => `${m.kind}:${m.progress}/${m.target}${m.done ? '✔' : ''}`) });
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
if (errors.length) process.exitCode = 1;
await browser.close();
await server.close();
