const { chromium } = require('playwright');
(async () => {
  const [url, outPrefix, script] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  // SETTINGS='{"quality":"low"}' ile ayar zorlanabilir (yazılımsal GPU için)
  if (process.env.SETTINGS) await p.addInitScript((js) => { try { localStorage.setItem('istanbul-mafia-settings', js); } catch (e) { /* yok */ } }, process.env.SETTINGS);
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { errs.push(m.text()); console.log('[console]', m.type(), m.text().slice(0, 400)); } });
  p.on('pageerror', e => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack && e.stack.slice(0, 600)); });
  await p.goto(url);
  await p.waitForFunction(() => window.__ready, null, { timeout: 240000 });
  const steps = require(script);
  await steps(p, outPrefix);
  await b.close();
})();
