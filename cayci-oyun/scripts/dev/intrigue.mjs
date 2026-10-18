// Entrika sistemini tarayıcıda dener: dedikodu paneli, ödül, kovalama, tepsiyle vurma. Ekran görüntüleri shots/intrigue-*.png
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5207 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript(() => localStorage.setItem('cayci-save-v2', JSON.stringify({ version: 2, tutorialDone: true, pocket: ['ferhat_vekalet', 'nevin_fal', 'f_ask', 'hayri_tapu'], settings: { lang: 'tr', volume: 0, music: 0, sensitivity: 1, quality: 'high', invertY: false } })));
await page.goto('http://localhost:5207/');
await page.waitForTimeout(1500);
const ev = (f, a) => page.evaluate(f, a);
const shot = async (n) => { await page.waitForTimeout(1400); await page.screenshot({ path: `shots/${process.env.PREFIX || 'intrigue'}-${n}.png` }); };
// 1. Av. Rıfat'a dedikodu siparişi
const setup = (office, topic) => ev(([office, topic]) => {
  const r = window.__cayci.game.run;
  r.orders.clear();
  const c = r.customers.get(office);
  r.orders.set(office, { office, kind: 'gossip', items: ['demli'], createdAt: r.time, patience: 30, perfect: true, topic });
  const p = c.desk.center.clone().addScaledVector(c.desk.dir, 1.3);
  r.player.place(p.x, p.z, Math.atan2(-c.desk.dir.x, -c.desk.dir.z));
  r.tray.glasses.length = 0;
  for (let i = 0; i < 4; i++) r.tray.addGlass('demli', 0.92, 85, 1);
  r.tray.reset(r.player.hand);
}, [office, topic]);
await ev(() => window.__cayci.startRun(2, 'career'));
await ev(() => { window.__cayci.game.state = 'overlay'; });
await setup('c', 'tapu');
await ev(() => window.__cayci.sim([[0.3, []], [0.02, ['KeyE']], [0.2, []]]));
const open1 = await ev(() => !!window.__cayci.game.run.intrigue.panel);
await shot('1-panel');
const before = await ev(() => window.__cayci.game.run.jar);
await ev(() => window.__cayci.game.run.intrigue.choose(0));
await ev(() => window.__cayci.sim([[0.4, []]]));
const after1 = await ev(() => { const r = window.__cayci.game.run; return { jar: r.jar, sales: r.stats.sales, ev: r.stats.evidence, rep: r.stats.repDelta }; });
await shot('2-reward');
console.log('panel açıldı:', open1, 'jar', before.toFixed(1), '→', after1.jar.toFixed(1), JSON.stringify(after1.sales), 'kanıt', after1.ev, 'itibar', after1.rep);
// 2. Şükran Hanım'a kendi hakkındaki laf → kovalama
await setup('b', 'kulis');
await ev(() => window.__cayci.sim([[0.3, []], [0.02, ['KeyE']], [0.2, []]]));
const idx = await ev(() => window.__cayci.game.run.intrigue.panel.cards.indexOf('f_ask'));
await ev((i) => window.__cayci.game.run.intrigue.choose(i), idx);
await ev(() => window.__cayci.sim([[0.8, []]]));
await shot('3-chase');
await ev(() => window.__cayci.sim([[3, []]]));
const chase = await ev(() => { const s = window.__cayci.game.run.stats; return { chases: s.chases, caught: s.caught, jarsLost: s.jarsLost, sales: s.sales.map((x) => x.verdict) }; });
console.log('kovalama:', JSON.stringify(chase));
// 3. sinir dolu, önde bir han sakini: R ile vur
await ev(() => {
  const r = window.__cayci.game.run;
  r.intrigue.anger = 100;
  r.intrigue.angerReady = true;
  const n = r.npcs[0];
  const f = r.player.forward();
  n.pos.set(r.player.pos.x + f.x * 1.1, 0, r.player.pos.z + f.z * 1.1);
  n.wait = 5;
});
await ev(() => window.__cayci.sim([[0.1, []], [0.02, ['KeyR']], [0.3, []]]));
await shot('4-bonk');
await ev(() => window.__cayci.sim([[2.2, []]]));
await shot('5-boss');
const b = await ev(() => { const r = window.__cayci.game.run; return { bonks: r.stats.bonks, down: r.npcs[0].isDown, rep: r.stats.repDelta, anger: r.intrigue.anger }; });
console.log('vurma:', JSON.stringify(b), 'telefon:', await page.locator('.phone-msg').count());
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
await server.close();
