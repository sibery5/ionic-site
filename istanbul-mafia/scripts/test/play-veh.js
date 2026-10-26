// play.js'in düşük kalite varyantı (yazılımsal GPU'da ekran görüntüsü için): kalite 'low', gölge/bloom kapalı, 960x540
const { chromium } = require('playwright');
(async () => {
  const [url, outPrefix, script] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.addInitScript(() => { try { localStorage.setItem('istanbul-mafia-settings', JSON.stringify({ quality: 'low', shadows: false, bloom: false, drawDistance: 600 })); } catch (e) { /* yok */ } });
  p.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 400)); });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack && e.stack.slice(0, 600)));
  await p.goto(url);
  await p.waitForFunction(() => window.__ready, null, { timeout: 400000 });
  await require(script)(p, outPrefix);
  await b.close();
})();
