// Karakter performansı: oyuncunun önünde 40 NPC; draw call / üçgen ve animasyon + çizim süresi.
//   SETTINGS='{"quality":"medium"}' node scripts/test/play.js file://$PWD/app/index.html /tmp/out $PWD/scripts/test/charperf-steps.js
const H = require('./harness.js');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  const res = await p.evaluate(() => {
    const g = game, pl = g.player;
    g.loop = () => {};
    pl.god = true;
    sim(2);
    // mevcut sivilleri kaldır, 40 NPC'yi 4-34 m arasına diz
    for (const n of [...g.npcs.list]) g.npcs.remove(n);
    const f = { x: Math.sin(pl.heading), z: Math.cos(pl.heading) }, r = { x: -f.z, z: f.x };
    const list = [];
    for (let i = 0; i < 40; i++) {
      const row = Math.floor(i / 8), col = (i % 8) - 3.5;
      const d = 4 + row * 7.5;
      const n = g.npcs.add(i % 10 === 9 ? 'police' : 'civilian', pl.pos.x + f.x * d + r.x * col * 1.4, pl.pos.z + f.z * d + r.z * col * 1.4, null, { state: i % 3 ? 'walk' : 'chat' });
      n.persistent = true; list.push(n);
    }
    sim(1);
    const CM = pl.model.constructor.prototype;
    const orig = CM.animate; let acc = 0, calls = 0;
    CM.animate = function (dt, st) { const t = performance.now(); orig.call(this, dt, st); acc += performance.now() - t; calls++; };
    const frames = 90;
    const t0 = performance.now();
    sim(frames / 30);
    const tot = performance.now() - t0;
    CM.animate = orig;
    const R = g.renderer;
    R.info.autoReset = false;
    const draw = () => { R.info.reset(); R.shadowMap.needsUpdate = true; const t = performance.now(); g.render(); const ms = performance.now() - t; return { calls: R.info.render.calls, tris: R.info.render.triangles, ms: +ms.toFixed(1) }; };
    const avg = () => { const r = [draw(), draw(), draw()]; return { calls: r[2].calls, tris: r[2].tris, ms: +((r[0].ms + r[1].ms + r[2].ms) / 3).toFixed(1) }; };
    for (let i = 0; i < 4; i++) { sim(1 / 30); draw(); }
    const withN = avg();
    for (const n of list) n.model.root.visible = false;
    const without = avg();
    for (const n of list) n.model.root.visible = true;
    R.info.autoReset = true;
    let geoms = 0; const seen = new Set();
    for (const n of list) n.model.root.traverse((o) => { if (o.isMesh && !seen.has(o.geometry)) { seen.add(o.geometry); geoms++; } });
    return {
      animMsPerFrame: +(acc / frames).toFixed(3), animCallsPerFrame: +(calls / frames).toFixed(1), animMsPerCall: +(acc / calls).toFixed(4), simMsPerFrame: +(tot / frames).toFixed(2),
      drawWith: withN, drawWithout: without, npcDrawCalls: withN.calls - without.calls, npcTris: withN.tris - without.tris, uniqueGeoms: geoms,
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1,
    };
  });
  console.log('charperf', JSON.stringify(res));
};
