// Açgözlü mod: kısa bir senaryo oynatır, görselleri ve olay sayaçlarını yazar.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
mkdirSync('shots', { recursive: true });
const server = await createServer({ server: { port: 5192 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript(() => localStorage.setItem('cayci-save-v1', JSON.stringify({ version: 1, day: 0, wallet: 0, upgrades: [], gossip: [], stars: [0, 0, 0, 0, 0], dailyBest: {}, greedPlays: 1, settings: { lang: 'tr', volume: 0, music: 0, sensitivity: 1 } })));
await page.goto('http://localhost:5192/');
await page.waitForTimeout(2000);
await page.screenshot({ path: 'shots/greed-00-menu.png' });
const ev = (f) => page.evaluate(f);
const sim = (st) => page.evaluate((st) => window.__cayci.sim(st), st);
const state = () => ev(() => { const s = window.__cayci.game.shift; return { glasses: s.tray.glasses.length, jar: +s.jar.toFixed(1), bank: +s.bank.toFixed(1), combo: s.combo, hasJar: s.tray.hasJar, spins: s.stats.spins, broken: s.stats.broken }; });
const shot = async (name) => { await page.waitForTimeout(1600); await page.screenshot({ path: `shots/${name}.png` }); };

await ev(() => { window.__cayci.startGreed(); window.__cayci.game.state = 'overlay'; });
await sim([[0.2, []], [2.1, ['KeyE']], [0.3, []]]);
console.log('doldurdu', await state());
// masa a'nın önüne geç, sipariş aç, teslim et
const atDesk = (id, cnt) => ev(`(() => { const s = window.__cayci.game.shift; const d = s.built.desks.get('${id}'); const p = d.center.clone().addScaledVector(d.dir, 1.5); s.player.place(p.x, p.z, Math.atan2(-d.dir.x, -d.dir.z)); s.tray.reset(s.player.hand); s.orders.clear(); s.orders.set('${id}', { count: ${cnt}, createdAt: s.time }); })()`);
await atDesk('a', 2);
await sim([[0.3, []], [0.02, ['KeyE']], [0.3, []]]);
console.log('teslim', await state());
await shot('greed-01-teslim');
// Fırıldak: F, iğne ortadayken F
await sim([[0.02, ['KeyF']], [0.255, []], [0.02, ['KeyF']], [0.75, []]]);
await shot('greed-02-firildak');
await sim([[1.5, []]]);
console.log('fırıldak sonrası', await state());
// ocağa dön, kasaya geçir, 10 bardaklık kule yap
await ev(() => { const s = window.__cayci.game.shift; const o = s.built.ocak[1]; s.player.place(o.x + 1.2, o.z, Math.PI / 2); s.tray.reset(s.player.hand); });
await sim([[0.2, []], [3.4, ['KeyE']], [0.4, []]]);
console.log('kule', await state());
await shot('greed-03-kule');
// açgözlülüğün bedeli: kuleyle koş ve dur
await sim([[0.9, ['KeyW', 'ShiftLeft']], [0.25, []]]);
console.log('felaket', await state());
await shot('greed-04-felaket');
await ev(() => window.__cayci.game.shift.forceEnd());
await shot('greed-05-sonuc');
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
await server.close();
