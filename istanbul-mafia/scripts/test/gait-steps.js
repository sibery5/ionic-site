// Yürüme geçişleri testi: durma→yürüme→koşu→durma, çömelme yürüyüşü, zıplama inişi ve dönüşlerde
// yere basan ayağın dünyada ne kadar kaydığını ölçer (ayak bileği yere yakınken temas sayılır).
//   node scripts/test/play.js file://$PWD/app/index.html .testout/g $PWD/scripts/test/gait-steps.js
const H = require('./harness.js');
module.exports = async (p) => {
  p.setDefaultTimeout(600000);
  await p.evaluate(() => { game.render = () => {}; });
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player, m = pl.model;
    pl.god = true; sim(1);
    // engelsiz yön
    let best = 0, bd = -1;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, x0 = pl.pos.x, z0 = pl.pos.z;
      pl.heading = a; pl.camYaw = a; hold('KeyW', true); hold('ShiftLeft', true); sim(2); hold('KeyW', false); hold('ShiftLeft', false); sim(0.5);
      const d = Math.hypot(pl.pos.x - x0, pl.pos.z - z0); pl.pos.x = x0; pl.pos.z = z0; pl.vx = pl.vz = 0; sim(0.1);
      if (d > bd) { bd = d; best = a; } if (d > 15) break;
    }
    pl.heading = best; pl.camYaw = best; sim(0.5);
    const out = {};
    const st = [null, null];
    let label = '';
    const rec = () => {
      m.root.updateMatrixWorld(true);
      const gy = m.root.position.y;
      for (let i = 0; i < 2; i++) {
        // temas noktası: topuk (bilek) ya da parmak ucundan hangisi daha alçaksa
        const ea = m.legs[i].an.matrixWorld.elements, et = m.legs[i].toe.matrixWorld.elements;
        const heel = ea[13] - gy < et[13] - gy + 0.05;
        const e = heel ? ea : et, x = e[12], y = e[13] - gy, z = e[14];
        const R = out[label] || (out[label] = { max: 0, sum: 0, n: 0, jit: 0 });
        if (st[i] && st[i].heel !== heel) { R.max = Math.max(R.max, st[i].d); R.sum += st[i].d; R.n++; st[i] = null; } // pivot değişti
        const ph = (m.cyc + i * 0.5) % 1, stance = ph < (m._g ? m._g[2] : 0.6) || pl.speed < 0.3;
        if (y < (heel ? 0.11 : 0.06) && pl.grounded && stance) {
          if (st[i]) st[i].heel = heel;
          if (!st[i]) st[i] = { x, z, px: x, pz: z, d: 0, heel };
          else {
            const s = st[i];
            const d = Math.hypot(x - s.x, z - s.z); s.d = Math.max(s.d, d);
            // titreme: kare-kare ileri-geri hareket
            const step = Math.hypot(x - s.px, z - s.pz); R.jit = Math.max(R.jit, step);
            s.px = x; s.pz = z;
          }
        } else if (st[i]) { R.max = Math.max(R.max, st[i].d); R.sum += st[i].d; R.n++; st[i] = null; }
      }
    };
    const seg = (l, sec, keys, fn) => { label = l; for (const k of keys) hold(k, true); sim(sec, (i) => { if (fn) fn(i); rec(); }); for (const k of keys) hold(k, false); };
    seg('başla', 0.8, ['KeyW']);
    seg('yürü', 1.5, ['KeyW']);
    seg('yürü→koş', 0.9, ['KeyW', 'ShiftLeft']);
    seg('koş', 1.2, ['KeyW', 'ShiftLeft']);
    hold('KeyW', true); sim(0.6);
    seg('dönüş', 1.6, ['KeyW'], (i) => { pl.camYaw += 0.03; });
    seg('dur', 1.0, []);
    press('KeyC'); sim(0.3);
    seg('çömel-yürü', 1.5, ['KeyW']);
    press('KeyC'); sim(0.5);
    hold('KeyW', true); sim(0.8); press('Space');
    seg('zıpla-in', 1.4, ['KeyW']);
    hold('KeyW', false);
    seg('dur2', 1.0, []);
    for (const k of Object.keys(out)) { const R = out[k]; out[k] = { max: +R.max.toFixed(3), avg: +(R.n ? R.sum / R.n : 0).toFixed(3), n: R.n, jit: +R.jit.toFixed(3) }; }
    return out;
  });
  for (const [k, v] of Object.entries(r)) console.log(k.padEnd(12), JSON.stringify(v));
  // kararlı yürüyüş/koşu/geçiş/iniş sınırlı; başlama/dönüş/çömelme bilgi amaçlı (rastgele şehirde engele takılabilir)
  const STRICT = ['yürü', 'yürü→koş', 'koş', 'zıpla-in'];
  const bad = Object.entries(r).filter(([k, v]) => STRICT.includes(k) && (v.max > 0.08 || v.jit > 0.06)).map(([k, v]) => k + ' ' + v.max);
  console.log(bad.length ? 'KAYMA: ' + bad.join(' | ') : 'GEÇİŞLER TAMAM');
};
