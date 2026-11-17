// [C2] Saldırı helikopteri: sağ tık nişan (tabanca ateşlenmez), top, füze kilidi ve güdüm, kilitsiz roket düz gider.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/heli $PWD/scripts/test/heli-steps.js
const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  let fail = 0;
  const check = (name, ok, info) => { console.log((ok ? 'OK   ' : 'FAIL ') + name, info !== undefined ? JSON.stringify(info) : ''); if (!ok) fail++; };
  await p.evaluate(() => {
    const g = game, pl = g.player; pl.god = true; g.wanted.reset && g.wanted.reset(); g.wanted.disabled = true;
    pl.giveWeapon('pistol', 60); pl.setWeapon('pistol');
    const h = g.aircraft.add('attackHeli', pl.pos.x, pl.pos.z, 0);
    g.enterVehicle(h, true);
    window.__h = h;
    // helikopter havada sabit (test: yalnız silah)
    window.__hold = () => { h.pos.y = 45; h.vx = h.vy = h.vz = 0; h.grounded = false; };
    // hedef aracı helikopterin 120 m önüne, yanlamasına 12 m/s ile giden
    window.__car = (dz) => { const c = g.vehicles.add('sedan', h.pos.x - 30, h.pos.z + dz, Math.PI / 2); c.hp = c.hp || 1000; return c; };
    window.__aimAt = (c) => { const cam = g.camera.position; const dx = c.pos.x - cam.x, dy = c.pos.y + 0.8 - cam.y, dz = c.pos.z - cam.z, d = Math.hypot(dx, dy, dz); pl.camYaw = Math.atan2(dx, dz); pl.camPitch = -Math.asin(dy / d); };
    window.__move = (c) => { c.pos.x += 12 / 30; c.vx = 12; c.vz = 0; };
  });
  // 1) sağ tık + sol tık: kişisel tabanca ateşlenmez, top ateşlenir
  const r1 = await p.evaluate(() => {
    const g = game, pl = g.player, h = window.__h; window.__hold();
    const ammo0 = JSON.stringify(pl.ammo || pl.weapons || {});
    g.input.mouse.right = true; sim(0.3, () => window.__hold());
    let shots = 0; const gt = h.gunT;
    g.input.mouse.left = true; sim(1, () => { window.__hold(); if (h.gunT > 0.08) shots++; }); g.input.mouse.left = false;
    const ammo1 = JSON.stringify(pl.ammo || pl.weapons || {});
    return { heliAim: pl.heliAim, aiming: pl.aiming, shots, pistolSame: ammo0 === ammo1, fov: +g.camera.fov.toFixed(1) };
  });
  check('Sağ tık: nişan kamerası (heliAim, FOV daralır)', r1.heliAim && r1.fov < 40, r1);
  check('Sol tık: burun topu ateşlenir', r1.shots > 5, r1);
  check('Nişanda kişisel tabanca ateşlenmez', r1.pistolSame, r1);
  // 2) kilit: hareketli araç nişangâhta ~1,5 sn tutulunca kilit
  const r2 = await p.evaluate(() => {
    const g = game, pl = g.player, h = window.__h; const c = window.__car(120); window.__c = c;
    let tLock = -1, t = 0;
    sim(3, () => { window.__hold(); window.__move(c); window.__aimAt(c); g.input.mouse.right = true; t += 1 / 30; if (tLock < 0 && h.lock && h.lock.on) tLock = t; });
    return { tLock: +tLock.toFixed(2), on: !!(h.lock && h.lock.on === c), k: h.lock && h.lock.k };
  });
  check('Kilit 1,3–2,2 sn içinde hareketli araca', r2.on && r2.tLock >= 1.3 && r2.tLock <= 2.2, r2);
  // 3) kilitli füze hareketli araca isabet eder
  const r3 = await p.evaluate(() => {
    const g = game, pl = g.player, h = window.__h, c = window.__c; const hp0 = c.hp; h.misT = 0;
    press('KeyQ'); let n = 0, minD = 1e9;
    sim(4, () => { window.__hold(); window.__move(c); window.__aimAt(c); g.input.mouse.right = true; const G = h.guided && h.guided[0]; if (G && G.dist !== undefined) minD = Math.min(minD, G.dist); n++; });
    return { hp0, hp1: c.hp, destroyed: !!c.destroyed, minD: +minD.toFixed(1) };
  });
  check('Kilitli füze hareketli araca isabet eder', r3.destroyed || r3.hp1 < r3.hp0, r3);
  // 4) kilitsiz roket düz gider (yön değişmez)
  const r4 = await p.evaluate(() => {
    const g = game, pl = g.player, h = window.__h; g.input.mouse.right = false; sim(0.2, () => window.__hold());
    const c = window.__car(160); h.misT = 0; g.input.mouse.right = true;
    sim(0.1, () => { window.__hold(); window.__aimAt(c); }); h.lock.t = 0; h.lock.on = null; h.lock.cand = null; // kilit yok
    press('KeyQ'); sim(1 / 30, () => window.__hold());
    const P = g.combat.projectiles, pr = P[P.length - 1]; if (!pr) return { none: true };
    const d0 = pr.vel.clone().normalize();
    sim(0.8, () => { window.__hold(); window.__move(c); h.lock.t = 0; h.lock.cand = null; });
    const d1 = pr.vel.clone().normalize();
    return { ang: +Math.acos(Math.min(1, d0.dot(d1))).toFixed(4), guided: (h.guided || []).length };
  });
  check('Kilitsiz roket düz gider', !r4.none && r4.ang < 0.01 && r4.guided === 0, r4);
  console.log('SONUÇ: ' + (fail ? 'FAIL ' + fail : 'OK'));
};
