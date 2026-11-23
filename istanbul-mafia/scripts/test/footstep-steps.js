// [ses S2] Ayak sesi zamanlaması: yürüyüş/koşu/çömelik yürüyüşte ayak sesi çağrısı ile ayağın gerçekten yere değdiği an
// (bilek yere yakın + aşağı iniyor -> ilk temas karesi) arasındaki farkı ölçer. Kabul: |fark| ≤ 40 ms, kaçan/fazla adım yok.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/fs $PWD/scripts/test/footstep-steps.js
const H = require('./harness.js');
module.exports = async (p) => {
  p.setDefaultTimeout(600000);
  await p.evaluate(() => { game.render = () => {}; });
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player, m = pl.model;
    pl.god = true; sim(1);
    let best = 0, bd = -1; // engelsiz yön (gait-steps ile aynı)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, x0 = pl.pos.x, z0 = pl.pos.z;
      pl.heading = a; pl.camYaw = a; hold('KeyW', true); hold('ShiftLeft', true); sim(2); hold('KeyW', false); hold('ShiftLeft', false); sim(0.5);
      const d = Math.hypot(pl.pos.x - x0, pl.pos.z - z0); pl.pos.x = x0; pl.pos.z = z0; pl.vx = pl.vz = 0; sim(0.1);
      if (d > bd) { bd = d; best = a; } if (d > 15) break;
    }
    pl.heading = best; pl.camYaw = best; sim(0.5);
    let T = 0; const upd = pl.update.bind(pl); pl.update = (dt, ...a) => { T += dt; return upd(dt, ...a); };
    const calls = []; const st = g.audio.step.bind(g.audio); g.audio.step = (...a) => { calls.push(T); return st(...a); };
    const out = {};
    for (const [name, keys] of [['yurume', ['KeyW']], ['kosu', ['KeyW', 'ShiftLeft']], ['comelik', ['KeyW']]]) {
      if (name === 'comelik') { pl.crouch = true; sim(0.4); }
      const hits = [], prev = [null, null]; calls.length = 0;
      keys.forEach((k) => hold(k, true));
      sim(0.8); calls.length = 0; const t0 = T;
      for (let f = 0; f < 150; f++) {
        sim(1 / 60);
        m.root.updateMatrixWorld(true);
        const gy = m.root.position.y;
        for (let i = 0; i < 2; i++) { const y = m.legs[i].an.matrixWorld.elements[13] - gy; if (prev[i] !== null && y < 0.115 && prev[i] >= 0.115) hits.push(T); prev[i] = y; }
      }
      const spd = pl.speed; keys.forEach((k) => hold(k, false)); sim(0.6);
      const cs = calls.filter((c) => c >= t0 && c <= T - 0.6);
      const errs = hits.map((h) => { let b = 9; for (const c of cs) if (Math.abs(c - h) < Math.abs(b)) b = c - h; return Math.round(b * 1000); });
      out[name] = { temas: hits.length, ses: cs.length, ms: errs, maxAbs: Math.max(...errs.map(Math.abs)), crouch: pl.crouch, hiz: +spd.toFixed(2) };
      pl.pos.x -= 0; // aynı yönde devam
      pl.heading = best; pl.camYaw = best;
      if (name === 'comelik') pl.crouch = false;
    }
    return out;
  });
  let ok = true;
  for (const [k, v] of Object.entries(r)) { const pass = v.maxAbs <= 40 && Math.abs(v.temas - v.ses) <= 1; ok = ok && pass; console.log(`${pass ? 'OK ' : 'HATA'} ${k}: temas ${v.temas}, ses ${v.ses}, hız ${v.hiz}, çömelik ${v.crouch}, fark ms [${v.ms.join(' ')}] en çok ${v.maxAbs}`); }
  console.log(ok ? 'FOOTSTEP TAMAM' : 'FOOTSTEP HATA');
};
