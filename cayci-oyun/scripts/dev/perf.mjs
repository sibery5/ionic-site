// Performans ölçümü: her mekânda çizim çağrısı, üçgen, ışık sayısı ve kare başına CPU süresi (güncelleme / çizim).
// Kullanım: node scripts/dev/perf.mjs   (QUALITY=high|medium|low)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5211 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 960), height: Number(process.env.H || 540) } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const Q = process.env.QUALITY || 'high';
await page.addInitScript((Q) => localStorage.setItem('cayci-save-v2', JSON.stringify({ version: 2, tutorialDone: true, settings: { lang: 'tr', volume: 0, music: 0, sensitivity: 1, quality: Q, invertY: false } })), Q);
await page.goto('http://localhost:5211/');
await page.waitForTimeout(1500);
const res = await page.evaluate(async (n) => {
  const g = window.__cayci.game;
  g.frozen = true;
  const out = [];
  const gl = g.renderer.getContext();
  const px = new Uint8Array(4);
  const finish = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  for (let i = 0; i < 6; i++) {
    window.__cayci.startRun(i, 'free');
    g.state = 'overlay';
    const r = g.run;
    let lights = 0, meshes = 0;
    r.scene.traverse((o) => { if (o.isLight) lights++; if (o.isMesh) meshes++; });
    const { ScriptedInput } = await import('/src/core/input.ts');
    const inp = new ScriptedInput();
    inp.press('KeyW');
    let tu = 0, tr = 0;
    for (let f = 0; f < n; f++) {
      const a = performance.now();
      r.update(1 / 60, inp);
      inp.endFrame();
      const b = performance.now();
      g.post.render(r.scene, r.camera, 1 / 60);
      finish();
      tr += performance.now() - b;
      tu += b - a;
    }
    g.renderer.info.autoReset = false;
    g.renderer.info.reset();
    g.post.render(r.scene, r.camera, 1 / 60);
    const info = g.renderer.info;
    g.renderer.info.autoReset = true;
    out.push({ venue: r.venue.id, calls: info.render.calls, tris: info.render.triangles, lights, meshes, geo: info.memory.geometries, tex: info.memory.textures, updateMs: +(tu / n).toFixed(2), renderMs: +(tr / n).toFixed(1) });
    g.endRun();
  }
  return out;
}, Number(process.env.N || 20));
console.table(res);
console.log('ERRORS:', errors.length ? errors.slice(0, 3).join('\n') : 'none');
await browser.close();
await server.close();
