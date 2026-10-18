import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5202 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.goto('http://localhost:5202/');
await page.waitForTimeout(1500);
const out = await page.evaluate(() => {
  window.__cayci.startRun(1, 'free');
  const r = window.__cayci.game.run;
  const log = [];
  r.player.camYaw = Math.PI / 2;
  for (let k = 0; k < 8; k++) {
    window.__cayci.sim([[0.5, ['KeyW']]]);
    log.push(`${r.time.toFixed(2)} pos=${r.player.pos.x.toFixed(2)},${r.player.pos.z.toFixed(2)} cam=${r.player.camYaw.toFixed(2)} yaw=${r.player.yaw.toFixed(2)} v=${r.player.vel.x.toFixed(2)},${r.player.vel.z.toFixed(2)}`);
  }
  return log;
});
console.log(out.join('\n'));
await browser.close(); await server.close();
