// Denge ölçümü: her mekânda üç oyuncu tipiyle birkaç vardiya oynatıp skor dağılımını basar.
// Kullanım: node scripts/balance.mjs [mekânIndex]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => localStorage.clear());
await page.goto('http://localhost:5199/');
await page.waitForTimeout(1500);
const POLICIES = {
  temkinli: { greed: 4, spin: false, timingError: 0.1, careful: true },
  orta: { greed: 7, spin: true, timingError: 0.06, careful: true },
  acgozlu: { greed: 11, spin: true, timingError: 0.03, careful: true },
  cesur: { greed: 7, spin: true, timingError: 0.04, careful: false },
  kosucu: { greed: 4, spin: true, timingError: 0.05, careful: true, run: true },
};
const SEEDS = (process.env.SEEDS || '11,22,33').split(',').map(Number);
const only = process.argv[2] !== undefined ? [Number(process.argv[2])] : null;
const venues = await page.evaluate(async () => (await import('/src/game/venues.ts')).VENUES.map((v) => ({ id: v.id, stars: v.stars, rivals: v.rivals, objectives: v.objectives })));
for (const i of only ?? venues.map((_, k) => k)) {
  const v = venues[i];
  console.log(`\n== ${v.id}  yıldız ${v.stars.join('/')}  rakipler ${v.rivals.map((r) => r.score).join('/')}`);
  const all = [];
  for (const [name, pol] of Object.entries(POLICIES)) {
    const rows = [];
    for (const seed of SEEDS) {
      const s = await page.evaluate(([i, pol, seed]) => window.__cayci.bot(i, pol, seed), [i, pol, seed]);
      rows.push(s);
    }
    all.push(...rows);
    const sc = rows.map((s) => s.score);
    const avg = (k) => (rows.reduce((a, s) => a + s[k], 0) / rows.length).toFixed(1);
    console.log(`${name.padEnd(9)} skor ${sc.join(', ').padEnd(16)} teslim ${avg('delivered')} sipariş ${avg('ordersCompleted')}/${avg('ordersExpired')}x kırık ${avg('broken')} kavanoz- ${avg('jarsLost')} fırıldak ${avg('spins')}/${avg('failedSpins')}x kule ${avg('maxDeliveryTower')} kombo ${avg('maxCombo')}`);
  }
  const rates = await page.evaluate(async ([objs, all]) => {
    const { objectiveDone } = await import('/src/game/venues.ts');
    return objs.map((o) => `${o.kind}:${o.target} ${Math.round((100 * all.filter((s) => objectiveDone(o, s)).length) / all.length)}%`);
  }, [v.objectives, all]);
  const sorted = all.map((s) => s.score).sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const avgAll = (k) => (all.reduce((a, s) => a + s[k], 0) / all.length).toFixed(2);
  console.log(`vip: geldi~${avgAll('vipServed')} kusursuz~${avgAll('vipPerfect')} acele=${avgAll('rushServed')} kedi=${avgAll('catTrips')} kayma=${avgAll('slips')} kombo=${avgAll('maxCombo')}`);
  console.log(`görevler: ${rates.join(' · ')}   skor p25=${q(0.25)} p50=${q(0.5)} p75=${q(0.75)} p90=${q(0.9)} max=${sorted[sorted.length - 1]}`);
}
console.log('ERRORS:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
await browser.close();
await server.close();
