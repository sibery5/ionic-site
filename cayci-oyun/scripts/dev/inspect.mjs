// Patron teftişi, "başka?" zinciri ve dedikodunun geri tepmesini tarayıcıda dener. Görüntüler shots/inspect-*.png
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5208 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const POCKET = ['hayri_tapu', 'sevim_evrak', 'ferhat_vekalet', 'rifat_rapor', 'lale_foto', 'nadir_rapor', 'nevin_fal'];
await page.addInitScript(([LANG, POCKET]) => localStorage.setItem('cayci-save-v2', JSON.stringify({ version: 2, tutorialDone: true, title: 2, pocket: POCKET, settings: { lang: LANG, volume: 0, music: 0, sensitivity: 1, quality: 'high', invertY: false } })), [process.env.LANG_ID || 'tr', POCKET]);
await page.goto('http://localhost:5208/');
await page.waitForTimeout(1500);
const ev = (f, a) => page.evaluate(f, a);
const shot = async (n) => { await page.waitForTimeout(1400); await page.screenshot({ path: `shots/${process.env.PREFIX || 'inspect'}-${n}.png` }); };
const setup = (office, kind, topic) => ev(([office, kind, topic]) => {
  const r = window.__cayci.game.run;
  r.orders.clear();
  const c = r.customers.get(office);
  r.orders.set(office, { office, kind, items: ['demli'], createdAt: r.time, patience: 30, perfect: true, topic });
  const p = c.desk.center.clone().addScaledVector(c.desk.dir, 1.3);
  r.player.place(p.x, p.z, Math.atan2(-c.desk.dir.x, -c.desk.dir.z));
  r.tray.glasses.length = 0;
  for (let i = 0; i < 3; i++) r.tray.addGlass('demli', 0.92, 85, 1);
  r.tray.reset(r.player.hand);
}, [office, kind, topic]);
const deliver = () => ev(() => window.__cayci.sim([[0.3, []], [0.02, ['KeyE']], [0.2, []]]));

// 1. "Başka?" zinciri: 1. katta Av. Rıfat
await ev(() => window.__cayci.startRun(2, 'career'));
await ev(() => { window.__cayci.game.state = 'overlay'; });
await setup('c', 'gossip', 'tapu');
await deliver();
await ev(() => window.__cayci.game.run.intrigue.choose(0));
const chain = await ev(() => { const p = window.__cayci.game.run.intrigue.panel; return p ? { chain: p.chain, cards: p.cards.length } : null; });
await shot('1-chain');
await ev(() => window.__cayci.game.run.intrigue.choose(0));
const chain2 = await ev(() => { const r = window.__cayci.game.run; return { panel: r.intrigue.panel?.chain ?? null, sales: r.stats.sales.map((s) => `${s.rumor}:${s.verdict}`), evidence: r.stats.evidence }; });
await ev(() => window.__cayci.game.run.intrigue.choose(-1));
console.log('zincir:', JSON.stringify(chain), '→', JSON.stringify(chain2), 'panel kapandı:', await ev(() => !window.__cayci.game.run.intrigue.panel));

// 2. Teftiş: 3. katta Nadir Bey gelir
await ev(() => window.__cayci.startRun(4, 'career'));
await ev(() => { window.__cayci.game.state = 'overlay'; window.__cayci.game.run.intrigue.inspAt = 0; });
await ev(() => window.__cayci.sim([[0.2, []]]));
const started = await ev(() => !!window.__cayci.game.run.intrigue.insp);
// patronu oyuncunun yanına getir, kusursuz teslim
const bossNear = () => ev(() => { const r = window.__cayci.game.run; const n = r.intrigue.insp.npc; const f = r.player.forward(); n.pos.set(r.player.pos.x + f.x * 1.6 + 0.6, 0, r.player.pos.z + f.z * 1.6); n.wait = 30; n.path = []; });
await setup('c', 'normal');
await bossNear();
await deliver();
await shot('2-inspect');
const i1 = await ev(() => { const i = window.__cayci.game.run.intrigue.insp; return { good: i.good, bad: i.bad, watching: window.__cayci.game.run.intrigue.watching() }; });
// Defne'ye Selim hakkında rapor dedikodusu → Selim aynı katta, duyar
await setup('c', 'gossip', 'rapor');
await deliver();
const nidx = await ev(() => window.__cayci.game.run.intrigue.panel.cards.indexOf('nadir_rapor'));
await ev((i) => window.__cayci.game.run.intrigue.choose(i), nidx);
await ev(() => { const it = window.__cayci.game.run.intrigue; if (it.panel) it.choose(-1); it.backfires = [{ pid: 'selim', at: window.__cayci.game.run.time + 0.3 }]; });
await ev(() => window.__cayci.sim([[1.0, []]]));
await shot('3-backfire');
const bf = await ev(() => { const s = window.__cayci.game.run.stats; return { backfires: s.backfires, chases: s.chases, bad: window.__cayci.game.run.intrigue.insp?.bad }; });
await ev(() => window.__cayci.sim([[4, []]]));
// patrona tepsiyle vur
await bossNear();
await ev(() => { const r = window.__cayci.game.run; r.intrigue.anger = 100; r.intrigue.angerReady = true; const n = r.intrigue.insp.npc; const f = r.player.forward(); n.pos.set(r.player.pos.x + f.x * 1.1, 0, r.player.pos.z + f.z * 1.1); });
await ev(() => window.__cayci.sim([[0.1, []], [0.02, ['KeyR']], [0.3, []]]));
await shot('4-bossbonk');
await ev(() => window.__cayci.sim([[2.2, []]]));
await shot('5-message');
const hit = await ev(() => { const r = window.__cayci.game.run; return { bossBonks: r.stats.bossBonks, fines: r.stats.fines, rep: r.stats.repDelta, over: r.intrigue.insp?.over ?? 'gone' }; });
await ev(() => window.__cayci.sim([[6, []]]));
const gone = await ev(() => !window.__cayci.game.run.intrigue.insp);
console.log('teftiş başladı:', started, JSON.stringify(i1), 'geri tepme:', JSON.stringify(bf), 'patrona vurma:', JSON.stringify(hit), 'kattan çıktı:', gone);
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
await server.close();
