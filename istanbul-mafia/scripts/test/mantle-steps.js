// [hareket] Duvara tutunup aşma (H1) ve yaya kamerası duvar içi (M6) testi.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/mantle $PWD/scripts/test/mantle-steps.js
// SHOTS=1: tutunma anının bir karesi.
const path = require('path');
const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  let fail = 0;
  const check = (name, ok, info) => { console.log((ok ? 'OK   ' : 'FAIL ') + name, info !== undefined ? JSON.stringify(info) : ''); if (!ok) fail++; };
  await p.evaluate(() => {
    const g = game, pl = g.player; pl.god = true; g.wanted.reset && g.wanted.reset();
    // boş alan bul: 10 m içinde çarpışma kutusu olmayan kara noktası
    const C = g.physics.city, tmp = [];
    let spot = null;
    for (let k = 0; k < 400 && !spot; k++) {
      const a = k * 2.4, rr = 5 + k * 1.5, x = pl.pos.x + Math.cos(a) * rr, z = pl.pos.z + Math.sin(a) * rr;
      if (g.physics.inWater(x, z) || g.physics.inWater(x + 9, z + 9) || g.physics.inWater(x - 9, z - 9)) continue;
      if (Math.abs(g.physics.groundAt(x, z)) > 0.05 || Math.abs(g.physics.groundAt(x, z + 5)) > 0.05) continue;
      if (C.query(x - 10, z - 10, x + 10, z + 10, tmp).length === 0) spot = { x, z };
    }
    window.__spot = spot;
    window.__wall = (h, thick, zf, tag, opt = {}) => { const s = window.__spot; const b = C.add(s.x - 3, s.z + zf, s.x + 3, s.z + zf + thick, 0, h, tag || 'testwall'); Object.assign(b, opt); return b; };
    for (const n of g.npcs.list.slice()) if (Math.hypot(n.pos.x - spot.x, n.pos.z - spot.z) < 25) g.npcs.remove(n);
  });
  const spot = await p.evaluate(() => window.__spot);
  check('Boş test alanı bulundu', !!spot, spot);
  if (!spot) { console.log('SONUÇ: FAIL'); return; }

  // ---- H1: 1,5 / 2,0 / 2,5 m ince duvar aşılır; 1,2–2,2 sn; duvarın içinden geçmez ----
  for (const h of [1.5, 2.0, 2.5]) {
    const r = await p.evaluate((h) => {
      const g = game, pl = g.player, s = window.__spot, th = 0.3, zf = 1.2;
      const b = window.__wall(h, th, zf);
      pl.pos.set(s.x, 0, s.z); pl.heading = 0; pl.vx = pl.vz = pl.vy = 0; pl.grounded = true; pl.vault = null;
      sim(0.2);
      const ok = h === 2.0 ? (press('Space'), sim(1 / 30), !!(pl.vault && pl.vault.mantle)) : pl.mantle(0, 1);
      let t = h === 2.0 ? 1 / 30 : 0, pen = 0, maxY = 0, hangF = 0;
      for (let i = 0; i < 150 && pl.vault; i++) {
        sim(1 / 30); t += 1 / 30; maxY = Math.max(maxY, pl.pos.y);
        if (pl.model.mantleHang > 0.5) hangF++;
        const inX = pl.pos.x > b.x0 - 0.05 && pl.pos.x < b.x1 + 0.05, inZ = pl.pos.z > b.z0 - pl.radius * 0.7 && pl.pos.z < b.z1 + pl.radius * 0.7;
        if (inX && inZ && pl.pos.y < b.y1 - 0.12) pen++;
      }
      sim(0.3);
      const res = { ok, t: +t.toFixed(2), pen, hangF, endZ: +(pl.pos.z - (s.z + zf + th)).toFixed(2), endY: +pl.pos.y.toFixed(2), maxY: +maxY.toFixed(2) };
      g.physics.city.remove(b);
      return res;
    }, h);
    check(`H1 ${h} m duvar: tutun→çek→aş→in, süre 1,2–2,2 sn, içinden geçmez`, r.ok && r.t >= 1.2 && r.t <= 2.2 && r.pen === 0 && r.endZ > 0.2 && Math.abs(r.endY) < 0.1 && r.hangF >= 2 && r.maxY >= h, r);
  }
  // kalın yapı (konteyner): üstüne çıkar
  const thick = await p.evaluate(() => {
    const g = game, pl = g.player, s = window.__spot, b = window.__wall(2.0, 2.5, 0.8);
    pl.pos.set(s.x, 0, s.z); pl.heading = 0; pl.vault = null; pl.grounded = true; sim(0.2);
    const ok = pl.mantle(0, 1); let t = 0; for (let i = 0; i < 150 && pl.vault; i++) { sim(1 / 30); t += 1 / 30; }
    sim(0.5); const r = { ok, t: +t.toFixed(2), y: +pl.pos.y.toFixed(2) }; g.physics.city.remove(b); pl.pos.set(s.x, 0, s.z); sim(0.3); return r;
  });
  check('H1 kalın 2 m yapı: üstüne çıkar', thick.ok && Math.abs(thick.y - 2.0) < 0.1 && thick.t >= 1.2 && thick.t <= 2.2, thick);
  // 3 m aşılamaz; askeri (noClimb) reddedilir
  const rej = await p.evaluate(() => {
    const g = game, pl = g.player, s = window.__spot;
    let b = window.__wall(3.0, 0.3, 0.8); pl.pos.set(s.x, 0, s.z); pl.vault = null; sim(0.1);
    const h3 = pl.mantle(0, 1); g.physics.city.remove(b);
    b = window.__wall(2.0, 0.3, 0.8, 'milwall', { noClimb: true }); pl.climbAttempt = null; sim(0.1);
    const mil = pl.mantle(0, 1), att = !!pl.climbAttempt; g.physics.city.remove(b);
    return { h3, mil, att };
  });
  check('H1 3 m duvar aşılamaz, askeri duvar (noClimb) reddedilir', !rej.h3 && !rej.mil && rej.att, rej);

  // ---- M6: kamera duvara yaslanınca near düzleminin dört köşesi duvarın önünde; dar sokakta titreme yok ----
  const cam = await p.evaluate(() => {
    const g = game, pl = g.player, s = window.__spot, cam = g.camera, C = g.physics.city;
    const walls = [C.add(s.x - 6, s.z + 0.6, s.x + 6, s.z + 0.9, 0, 6, 'testwall')];
    const NDC = [[-1, -1], [1, -1], [-1, 1], [1, 1]], v = cam.position.clone();
    const inside = (q) => walls.some((b) => q.x > b.x0 && q.x < b.x1 && q.z > b.z0 && q.z < b.z1 && q.y > b.y0 && q.y < b.y1);
    let bad = 0, frames = 0, worst = null;
    const T = new (cam.position.constructor)();
    const probe = () => {
      cam.updateMatrixWorld(); frames++;
      for (const [x, y] of NDC) {
        v.set(x, y, -1).unproject(cam);
        T.set(pl.pos.x, pl.pos.y + pl.cH, pl.pos.z);
        const d = v.distanceTo(T), dir = v.clone().sub(T).normalize();
        const h = g.physics.raycastShared(T.x, T.y, T.z, dir.x, dir.y, dir.z, d);
        if (inside(v) || (h && typeof h.box !== 'string' && h.t < d - 0.005)) { bad++; worst = [x, y, +d.toFixed(2)]; return; }
      }
    };
    // duvara sırtını dön (kamera duvara doğru), yaw taraması; oyuncu duvara 0,5–0,9 m
    for (const gap of [0.5, 0.9]) for (let a = -1.2; a <= 1.21; a += 0.3) {
      pl.pos.set(s.x, 0, s.z + 0.6 - gap); pl.heading = Math.PI; pl.camYaw = Math.PI + a; pl.camPitch = 0.25; pl.vault = null;
      sim(0.6); probe();
    }
    // yan duvar: duvara paralel dur, kamera yana kayar
    for (let a = Math.PI / 2 - 0.4; a <= Math.PI / 2 + 0.41; a += 0.2) { pl.pos.set(s.x, 0, s.z + 0.6 - 0.35); pl.camYaw = a; sim(0.6); probe(); }
    for (const b of walls) C.remove(b);
    // dar sokak: 1,8 m aralıklı iki duvar, yaw yavaşça döner; ardışık kare kamera sıçraması
    const A = C.add(s.x - 0.9 - 0.3, s.z - 8, s.x - 0.9, s.z + 8, 0, 8, 'testwall'), B = C.add(s.x + 0.9, s.z - 8, s.x + 0.9 + 0.3, s.z + 8, 0, 8, 'testwall');
    walls.length = 0; walls.push(A, B);
    pl.pos.set(s.x, 0, s.z); pl.camYaw = 0; sim(0.8);
    let jumps = 0, maxJ = 0; const prev = cam.position.clone();
    for (let i = 0; i < 120; i++) { pl.camYaw += 0.02; sim(1 / 30); const j = cam.position.distanceTo(prev); maxJ = Math.max(maxJ, j); if (j > 0.18) jumps++; prev.copy(cam.position); probe(); }
    C.remove(A); C.remove(B); pl.pos.set(s.x, 0, s.z); sim(0.3);
    return { frames, bad, worst, jumps, maxJ: +maxJ.toFixed(3) };
  });
  check('M6 kamera: near düzleminin 4 köşesi duvarın önünde (duvara yaslı, yan duvar, dar sokak)', cam.bad === 0 && cam.frames > 20, cam);
  check('M6 dar sokakta kamera titremez (kare başı sıçrama ≤ 0,18 m)', cam.jumps === 0, cam);

  if (process.env.SHOTS === '1') {
    await p.evaluate(() => { const pl = game.player, s = window.__spot; window.__wall(2.0, 0.3, 0.8); pl.pos.set(s.x, 0, s.z); pl.heading = 0; pl.camYaw = Math.PI + 0.6; sim(0.3); pl.mantle(0, 1); sim(0.5); });
    await H.shot(p, path.join(out, 'mantle.png'));
  }
  console.log('SONUÇ: ' + (fail ? 'FAIL ' + fail : 'OK'));
};
