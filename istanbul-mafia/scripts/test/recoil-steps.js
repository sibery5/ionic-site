// [C1] Silah hissi: sabit tepme deseni iki seride birebir aynı; 10. mermi dikey tepmesi tabloya ±%10; ilk mermi sapması ≤ 0,2°;
// bırakınca kamera merkeze döner; isabet işareti türleri (gövde/baş/öldürme); dürbün 2 kademe; nişangâh modları.
const H = require('./harness.js');

module.exports = async (p, out) => {
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(e.message));
  p.setDefaultTimeout(600000);
  await H.start(p);
  await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player, M = g.input.mouse;
    g.loop = () => {};
    pl.god = true;
    const clear = () => { g.ui.closeAll(); g.ui.dialogEl.classList.add('hidden'); g.mode = 'playing'; };
    clear(); sim(0.5);
    pl.giveWeapon('ak', 300); pl.setWeapon('ak'); sim(0.3);
    const spray = () => {
      clear();
      pl.weapons.ak.mag = 30; pl.reloadT = 0; pl.fireCd = 0;
      pl.camPitch = 0.1; pl.camYaw = 1.0; M.right = true; sim(0.6); clear();
      const p0 = pl.camPitch, y0 = pl.camYaw, seq = [];
      let last = pl.weapons.ak.mag;
      for (let i = 0; i < 120 && seq.length < 30; i++) {
        M.left = true; M.leftPressed = i === 0; sim(1 / 30);
        if (pl.weapons.ak.mag !== last) { last = pl.weapons.ak.mag; seq.push([+(p0 - pl.camPitch).toFixed(5), +(pl.camYaw - y0).toFixed(5)]); }
      }
      M.left = false; sim(1.2);
      const back = [+(pl.camPitch - p0).toFixed(4), +(pl.camYaw - y0).toFixed(4)];
      M.right = false; sim(0.2);
      return { seq, back };
    };
    const a = spray(), b = spray();
    let maxDiff = 0;
    for (let i = 0; i < Math.min(a.seq.length, b.seq.length); i++) maxDiff = Math.max(maxDiff, Math.abs(a.seq[i][0] - b.seq[i][0]), Math.abs(a.seq[i][1] - b.seq[i][1]));
    // tablo: ilk 10 merminin dikey toplamı (nişanda x0,7)
    const def = pl.wdef; let tab = 0;
    for (let i = 0; i < 10; i++) tab += (i < 9 ? 1 - i * 0.04 : 0.45) * def.recoil * 0.7;
    const v10 = a.seq[9] ? a.seq[9][0] : 0;
    // ilk mermi sapması (nişanda, dururken, bloom yok)
    pl.bloom = 0; pl.speed = 0; pl.adsK = 1; pl.aiming = true;
    const firstDeg = pl.spreadNow(def) * 180 / Math.PI;
    pl.speed = 6; const runDeg = pl.spreadNow(def) * 180 / Math.PI;
    pl.speed = 0; pl.grounded = false; const airDeg = pl.spreadNow(def) * 180 / Math.PI; pl.grounded = true;
    // isabet işareti: gövde, baş, öldürme
    const C = g.combat; C.hitStats = {};
    const f = { x: Math.sin(pl.camYaw), z: Math.cos(pl.camYaw) };
    const n = g.npcs.add('gang', pl.pos.x + f.x * 6, pl.pos.z + f.z * 6, null, { state: 'idle', heading: pl.camYaw + Math.PI });
    n.maxHp = n.hp = 100000;
    const shootAt = (h) => { pl.fireCd = 0; pl.reloadT = 0; pl.weapons.ak.mag = 30; pl.bloom = 0; const o = pl.pos.clone(); o.y += 1.45; const d = n.pos.clone(); d.y += h; d.sub(o).normalize(); pl.tryFire(o, d); sim(1 / 30); };
    const sp0 = def.spread; def.spread = 0; // isabet işareti testi: sapma kapalı
    n.helmet = 5; shootAt(1.65); shootAt(1.15); shootAt(1.15);
    const hn0 = C.reticle ? C.reticle.hitN || 0 : -1;
    
    n.hp = 1; shootAt(1.15); sim(0.3); def.spread = sp0;
    const hits = { ...C.hitStats, reticleN: C.reticle ? C.reticle.hitN : -1 };
    // dürbün kademesi + nişangâh modları
    pl.giveWeapon('sniper', 20); pl.setWeapon('sniper'); clear(); M.right = true; sim(0.8);
    const z1 = +(pl.zoomNow || 0).toFixed(2), scoped = !!pl.scoped, modeScope = C.reticle && C.reticle.state.mode;
    M.wheel = 1; sim(1 / 30); sim(0.6);
    const z2 = +(pl.zoomNow || 0).toFixed(2);
    M.right = false; M.left = false; sim(0.6);
    const modes = {};
    for (const w of ['pistol', 'shotgun', 'ak', 'sniper']) { pl.giveWeapon(w, 10); pl.setWeapon(w); M.right = true; clear(); sim(0.5); modes[w] = C.reticle && C.reticle.state.mode; M.right = false; sim(0.4); }
    return { n: [a.seq.length, b.seq.length], first5: a.seq.slice(0, 5), s10: a.seq[9], s20: a.seq[19], s30: a.seq[29], maxDiff, v10, tab10: +tab.toFixed(5), back: [a.back, b.back], firstDeg: +firstDeg.toFixed(3), runDeg: +runDeg.toFixed(3), airDeg: +airDeg.toFixed(3), hits, z1, z2, scoped, modeScope, modes };
  });
  console.log('TEPME', JSON.stringify(r));
  console.log('HATA', errs.length, errs.slice(0, 3).join(' | '));
  const tol = Math.abs(r.v10 - r.tab10) / r.tab10;
  const ok = r.n[0] === 30 && r.n[1] === 30 && r.maxDiff < 1e-4 && tol <= 0.1 && r.firstDeg <= 0.2 && Math.abs(r.back[0][0]) < 0.01 && r.hits.body > 0 && r.hits.head > 0 && r.hits.kill > 0 && r.z2 > r.z1 && errs.length === 0;
  console.log('10. mermi sapma farkı %', (tol * 100).toFixed(1));
  console.log(ok ? 'SONUÇ: GEÇTİ' : 'SONUÇ: KALDI');
};
