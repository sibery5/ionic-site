// [V3] Villa: korumalar (selam, kapı 8 m, saldırıda ≤ 2 sn çatışma, polise ateş yok, yenilenme, gece feneri), kırılan camlar
// (içeriden çatlak → dökülme, dışarıdan cepheye isabet), canlı dış görünüm (pencere arkasında şehir çizimi, içerideyken trafik/gemi
// hareketi), dünyadaki teras (üstünde durulur, hareketli araç/gemi, aşağıdaki hedefe atış). Görüntüler: V3SHOT=1.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/v3 $PWD/scripts/test/v3-steps.js
const H = require('./harness.js');
const fs = require('fs');
const path = require('path');
module.exports = async (p, out) => {
  fs.mkdirSync(out, { recursive: true });
  p.setDefaultTimeout(900000);
  await H.start(p); await H.install(p);
  await p.evaluate(() => {
    window.__render = game.render.bind(game); game.render = () => {}; game.loop = () => {}; game.suppressPause = true; game.input.lock = () => {};
    game.player.god = true; game.env.time = 13; sim(0.5);
    window.PISTOL = { dmg: 34, range: 150, sound: 'pistol' };
    window.shoot = (o, t) => { const d = new THREE_V(t[0] - o[0], t[1] - o[1], t[2] - o[2]).normalize(); game.combat.hitscan(game.player, new THREE_V(o[0], o[1], o[2]), d, window.PISTOL); };
    window.THREE_V = game.camera.position.constructor;
  });
  const fails = [];
  const T = async (name, fn, ok) => {
    let r;
    try { r = await p.evaluate(fn); } catch (e) { r = { err: String(e.message || e).slice(0, 300) }; }
    const pass = !r || r.err ? false : ok(r);
    console.log((pass ? 'OK  ' : 'FAIL') + ' ' + name, JSON.stringify(r));
    if (!pass) fails.push(name);
    return r;
  };

  await T('korumalar', () => {
    const v = game.villa;
    return { world: v.guards.length, gate: v.guards.filter((n) => n.gateGuard).length, patrol: v.guards.filter((n) => n.state === 'patrol').length, inside: (v.insideNPCs || []).length, total: v.guards.length + (v.insideNPCs || []).length };
  }, (r) => r.gate === 2 && r.patrol === 2 && r.inside === 2 && r.total >= 4 && r.total <= 6);

  // araçla kapıya: koruma selam verir, kapı 8 m'de açık, geçince kapanır
  await T('kapı ve selam', () => {
    const g = game, pl = g.player, v = g.villa;
    const car = g.vehicles.add('sedan', 122, -730, Math.PI); g.enterVehicle(car, true); sim(0.3);
    const greets0 = v.greets || 0;
    let at8 = null, bark = null; hold('KeyW', true);
    for (let i = 0; i < 30 * 12 && car.pos.z > -790; i++) {
      sim(1 / 30);
      const d = Math.hypot(car.pos.x - 122, car.pos.z - (-773));
      if (d < 18) hold('KeyW', Math.hypot(car.vx || 0, car.vz || 0) < 7);
      if (!at8 && d <= 8 && car.pos.z > -773) at8 = { d: +d.toFixed(1), open: +v.gateOpen.toFixed(2), box: !!v.gateBox };
    }
    hold('KeyW', false); hold('Space', true); sim(1); hold('Space', false);
    const passed = car.pos.z < -776;
    const wave = v.guards.some((n) => n.gateGuard && n.waveT > 0) || (v.greets || 0) > greets0;
    const bub = [...document.querySelectorAll('.bark, .speech, .bubble')].map((e) => e.textContent).join('|').slice(0, 80);
    sim(1); hold('KeyW', true); sim(2.5); hold('KeyW', false); sim(3);
    const after = { open: +v.gateOpen.toFixed(2), box: !!v.gateBox, carZ: +car.pos.z.toFixed(1) };
    g.vehicles.ejectDriver(car); sim(0.3);
    return { at8, passed, wave, greets: (v.greets || 0) - greets0, bub, bark, after };
  }, (r) => r.at8 && r.at8.open > 0.3 && !r.at8.box && r.passed && r.greets >= 1 && r.after.open < 0.1 && r.after.box);

  // 3 kişilik saldırgan çete parsele girer: korumalar ≤ 2 sn'de çatışır; polis saldırıyorsa ona ateş etmezler
  await T('saldırı savunması', () => {
    const g = game, pl = g.player, v = g.villa;
    pl.pos.set(122, 0, -800); pl.vy = 0; sim(0.5);
    const E = [[110, -786], [134, -786], [122, -781]].map(([x, z]) => { const e = g.npcs.add('gang', x, z, null, { gang: 'kartallar', hostile: true, state: 'attack', weapon: 'pistol' }); e.target = pl; return e; });
    const hs = g.combat.hitscan; let shots = 0; g.combat.hitscan = function (a, ...r) { if (a && a.villaGuard) shots++; return hs.call(this, a, ...r); };
    let t = 0, eng = 0;
    for (; t < 4; t += 1 / 30) { sim(1 / 30); eng = v.guards.filter((n) => n && !n.dead && E.includes(n.target)).length; if (eng >= 2) break; }
    const tEng = +t.toFixed(2);
    sim(8);
    g.combat.hitscan = hs;
    const o = { shots, st: v.guards.map((n) => n && [n.state, n.tac, +(n.alertT || 0).toFixed(1), n.target && n.target.kind]), tEng, eng, enemyHp: E.map((e) => Math.round(e.hp)), downed: E.filter((e) => e.dead || e.downed).length, alert: +v.alertT.toFixed(1), follow: v.guards.filter((n) => n && n.state === 'follow').length };
    for (const e of E) g.npcs.remove(e);
    // kolluk: polis saldırırsa korumalar hedef almaz
    const cop = g.npcs.add('police', 122, -784, null, { state: 'attack', weapon: 'pistol' }); cop.target = pl;
    sim(3);
    o.copTargeted = v.guards.filter((n) => n && n.target === cop).length;
    g.npcs.remove(cop); sim(0.5);
    return o;
  }, (r) => r.tEng <= 2 && r.eng >= 2 && r.copTargeted === 0);

  await T('yenilenme ve gece feneri', () => {
    const g = game, v = g.villa;
    const n = v.guards[2]; n.takeDamage(9999, null, 'bullet'); sim(0.2);
    const dead = !!n.dead;
    n.diedAt = v.t - 179.5; sim(1);
    const fresh = v.guards[2] !== n && !v.guards[2].dead;
    g.env.time = 23; g.env.update(0.01, g.player.pos); g.player.pos.set(122, 0, -800); sim(1);
    const torches = v.guards.filter((m) => m && m.torch && m.torch.visible && m.torch.parent).length;
    g.env.time = 13; g.env.update(0.01, g.player.pos); sim(0.5);
    const torchDay = v.guards.filter((m) => m && m.torch && m.torch.visible).length;
    return { dead, fresh, respawns: v.respawns, torches, torchDay };
  }, (r) => r.dead && r.fresh && r.torches >= 2 && r.torchDay === 0);

  // dışarıdan güney cephesine ateş: cam efekti ve aynı yerdeki iç cam çatlar
  await T('cam: dışarıdan', () => {
    const g = game, pl = g.player, G = g.villa.glass;
    pl.pos.set(119.5, 0, -806); sim(0.3);
    const o0 = G.stats.outside;
    shoot([119.5, 1.6, -806], [119.5, 1.6, -818]);
    const P = G.panes.find((q) => !q.thinX && q.z > 7 && q.y < 1 && -2.5 >= q.x - q.w / 2 && -2.5 <= q.x + q.w / 2);
    return { outside: G.stats.outside - o0, paneHits: P && P.hits, panes: G.panes.length };
  }, (r) => r.outside === 1 && r.paneHits === 1 && r.panes >= 20);

  // içeride: aynı cama iki atış daha (çatlak → dökülme); arka plan şehir çiziliyor; içerideyken trafik/gemi ilerliyor
  await T('cam: içeriden + canlı dış görünüm', () => {
    const g = game, pl = g.player, G = g.villa.glass, R = g.renderer;
    pl.pos.set(122, 0, -816.9); sim(0.2);
    const it = g.findInteraction(); it.action(); sim(0.3);
    const P = G.panes.find((q) => !q.thinX && q.z > 7 && q.y > 0.4 && q.y < 1 && q.x > -4 && q.x < -2.6);
    const s0 = { ...G.stats };
    const a = [P.hits, P.mesh.visible, P.decals.length];
    shoot([P.x, 1.6, 5], [P.x + 0.3, 1.7, 9]); // ikinci isabet: dökülür
    const b = [P.hits, P.mesh.visible, !!P.rim, P.decals.length];
    const Q = G.panes.find((q) => q.thinX && q.x > 11 && q.y < 1); // doğu (deniz) camı: ilk isabet çatlak
    shoot([8, 1.6, Q.z], [13, 1.7, Q.z + 0.2]);
    const c = [Q.hits, Q.mesh.visible, Q.decals.length];
    // çizim çağrısı: iç mekân tek başına / canlı geçiş (şehir + iç)
    pl.camYaw = 0; sim(0.1);
    R.info.autoReset = false; R.info.reset(); R.render(pl.inInterior.scene, g.camera); const inOnly = R.info.render.calls;
    R.info.reset(); window.__render(); const live = R.info.render.calls; R.info.autoReset = true;
    // içerideyken dünya ilerliyor mu
    const snap = () => [...g.vehicles.list.filter((v) => !v.parked && v.ai).slice(0, 40).map((v) => [v, v.pos.x, v.pos.z]), ...g.ships.list.slice(0, 20).map((s) => [s, s.pos.x, s.pos.z])];
    const S = snap(); sim(2);
    const moved = S.filter(([o, x, z]) => Math.hypot(o.pos.x - x, o.pos.z - z) > 0.5).length;
    return { a, b, c, cracks: G.stats.cracks - s0.cracks, shatters: G.stats.shatters - s0.shatters, inOnly, live, moved, of: S.length, bg: pl.inInterior.scene.background };
  }, (r) => r.b[0] === 2 && !r.b[1] && r.b[2] && r.c[0] === 1 && r.c[2] === 1 && r.live > r.inOnly + 20 && r.moved >= 3 && r.bg === null);

  if (process.env.V3SHOT) {
    await p.evaluate(() => { const g = game, pl = g.player; pl.pos.set(7, 0, -3.5); pl.heading = Math.PI / 2; pl.camYaw = Math.PI / 2; pl.camPitch = 0.05; sim(0.4); window.__render(); });
    await p.screenshot({ path: path.join(out, 'v3-ic-pencere.png') });
  }

  // teras: iç mekândan çık → gerçek dünyadaki terasta dur; hareketli araç/gemi; aşağıdaki hedefe atış
  await T('teras', () => {
    const g = game, pl = g.player, ctx = pl.inInterior;
    const it = ctx.interact.find((i) => /Terasa/.test(i.label));
    pl.pos.set(2.8, 8.4, -3.1); sim(0.3);
    const prompt = g.findInteraction(); const pl1 = prompt && prompt.label;
    it.action(); sim(1);
    const pos = pl.pos.toArray().map((v) => +v.toFixed(2));
    hold('KeyD', true); sim(0.6); hold('KeyD', false); sim(0.3);
    const walkY = +pl.pos.y.toFixed(2);
    pl.pos.set(134.5, 8.1, -828); pl.vy = 0; pl.heading = Math.PI / 2; pl.camYaw = Math.PI / 2 + Math.PI; sim(0.5);
    // kameranın görüş konisindeki hareketli araç/gemi (iki an farkı)
    // terastan denize (doğuya) bakan görüş konisi
    const cam = new g.camera.constructor(60, 16 / 9, 0.5, 2500); cam.position.set(134.5, 9.7, -828); cam.lookAt(400, 0, -828); cam.updateMatrixWorld();
    const F = new (cam.projectionMatrix.constructor)(); F.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const inView = (o) => { const v = o.pos.clone().applyMatrix4(F); return Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1; };
    const objs = [...g.vehicles.list.filter((v) => !v.parked), ...g.ships.list].filter(inView);
    const S = objs.map((o) => [o, o.pos.x, o.pos.z]);
    sim(3);
    const moved = S.filter(([o, x, z]) => Math.hypot(o.pos.x - x, o.pos.z - z) > 0.3).length;
    // aşağıdaki hedef (havuz güvertesi): terastan ateş, korkuluk mermiyi kesmez
    const e = g.npcs.add('gang', 148, -822, null, { gang: 'kartallar', state: 'idle', weapon: null, y: 1.6 }); e.pos.y = 1.6; sim(0.2);
    const hp0 = e.hp;
    shoot([134.5, pl.pos.y + 1.55, -828], [e.pos.x, e.pos.y + 1.25, e.pos.z]);
    const o = { pl1, pos, walkY, inside: !!pl.inInterior, inView: objs.length, moved, hp0: Math.round(hp0), hp: Math.round(e.hp), dead: !!e.dead };
    g.npcs.remove(e);
    // teras kapısından geri gir
    pl.pos.set(133.4, 8.1, -828); sim(0.2);
    const back = g.findInteraction(); o.back = back && back.label;
    if (back && /teras/.test(back.label)) { back.action(); sim(0.3); o.backIn = !!pl.inInterior; o.backY = +pl.pos.y.toFixed(1); g.interiors.exit(); sim(0.2); }
    return o;
  }, (r) => !r.inside && Math.abs(r.pos[1] - 8.1) < 0.3 && Math.abs(r.walkY - 8.1) < 0.3 && r.moved >= 1 && (r.hp < r.hp0 || r.dead) && r.backIn);

  if (process.env.V3SHOT) {
    await p.evaluate(() => { const g = game, pl = g.player; g.env.time = 17.5; g.env.update(0.01, pl.pos); pl.pos.set(134.2, 8.1, -826); pl.heading = Math.PI / 2; pl.camYaw = Math.PI / 2 + 0.3; pl.camPitch = 0.15; sim(0.5); window.__render(); });
    await p.screenshot({ path: path.join(out, 'v3-teras.png') });
  }
  console.log(fails.length ? 'V3 FAIL: ' + fails.join(', ') : 'V3 OK');
};
