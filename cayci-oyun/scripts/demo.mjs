// Demo görselleri: her katta kısa bir senaryo oynatıp ekran görüntüsü alır.
// Kullanım: node scripts/demo.mjs  → shots/demo-*.png
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

mkdirSync('shots', { recursive: true });
const server = await createServer({ server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const lang = process.env.LANG_ID || 'tr';
await page.addInitScript((lang) => localStorage.setItem('cayci-save-v1', JSON.stringify({ version: 1, day: 5, wallet: 0, upgrades: [], gossip: [], stars: [3, 2, 2, 1, 0], dailyBest: {}, settings: { lang, volume: 0, music: 0, sensitivity: 1 } })), lang);
await page.goto('http://localhost:5197/');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/demo-00-menu.png' });

const POUR = [[0.1, []], [1.15, ['Digit2']], [0.1, []], [0.65, ['Digit1']], [0.1, []], [1.15, ['Digit2']], [0.2, []]];

async function scene(name, day, steps, setup) {
  await page.evaluate((d) => { window.__cayci.startDay(d); window.__cayci.game.state = 'overlay'; }, day);
  await page.evaluate((st) => window.__cayci.sim(st), POUR);
  if (setup) await page.evaluate(setup);
  await page.evaluate((st) => window.__cayci.sim(st), steps);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `shots/${name}.png` });
}

// oyuncuyu bir masanın önüne koy, o masaya sipariş aç
const atDesk = (id, back = 1.6, side = 0.0) => `(() => {
  const s = window.__cayci.game.shift; const d = s.built.desks.get('${id}');
  const p = d.center.clone().addScaledVector(d.dir, ${back});
  p.x += ${side}; s.player.place(p.x, p.z, Math.atan2(-d.dir.x, -d.dir.z));
  s.tray.reset(s.player.hand); s.book.active = []; s.book.spawn(s.time, '${id}');
  s.book.active[0].items = ['acik', 'demli'];
})()`;

await scene('demo-01-zemin-kat', 0, [[6, []], [1.2, ['KeyW']], [0.6, []]]);
await scene('demo-02-teslim', 0, [[0.4, ['KeyW']], [0.6, []], [0.02, ['KeyE']], [0.4, []]], atDesk('c', 2.4, 0));
await scene('demo-03-kaygan-zemin', 1, [[4, []], [0.3, [], -25], [1.6, ['KeyW']], [0.4, []]]);
await scene('demo-04-pasa', 2, [[2, []], [0.2, [], 25], [0.6, ['KeyW']], [0.4, []]], `(() => { const s = window.__cayci.game.shift; const f = s.player.forward(); s.cat.pos.set(s.player.pos.x + f.x * 1.3 + 0.4, 0, s.player.pos.z + f.z * 1.3); })()`);
await scene('demo-05-karanlik', 3, [[3, []], [1.4, ['KeyW']], [0.3, []]]);
await scene('demo-06-teras', 4, [[4, []], [0.4, [], 18], [1.4, ['KeyW']], [0.3, []]]);
await scene('demo-07-firildak', 0, [[0.5, []], [1.62, [], 0, 22, true]], `(() => { const s = window.__cayci.game.shift; s.player.place(12.6, 7.8, Math.PI / 2 + 0.5); s.tray.reset(s.player.hand); })()`);
for (const k of ['cast', 'props']) {
  await page.evaluate((k) => window.__cayci.gallery(k), k);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `shots/demo-0${k === 'cast' ? 8 : 9}-${k === 'cast' ? 'karakterler' : 'tepsi'}.png` });
}
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
await server.close();
