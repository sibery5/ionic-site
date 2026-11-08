// [savaş] Beden / nişan / cam testi (A2): ölçülebilir doğrulamalar.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 node scripts/test/play.js file://$PWD/app/index.html .testout/body $PWD/scripts/test/body-steps.js
// Kafa vuruşu tek mermide öldürür, kask hayatta tutar, yelek gövde hasarını keser, delip geçme arkadakine düşük hasar,
// silaha göre yakınlaştırma, ≥80° yukarı bakış, cam çatlak -> kırılma, ölüm stili + yere oturma, oyuncu ani hasar tavanı.
const H = require('./harness.js');

module.exports = async (p, out) => {
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(e.message));
  p.setDefaultTimeout(600000);
  await H.start(p);
  await H.install(p);
  await p.evaluate(() => { game.loop = () => {}; window.__W = game.combat.WEAPONS; game.player.god = true; game.npcs.spawnT = 999; sim(0.5);
    // önü açık bir yön seç (16 m boyunca duvar yok, zemin düz)
    const pl = game.player;
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const h = game.physics.raycast(pl.pos.x, pl.pos.y + 1.2, pl.pos.z, Math.sin(a), 0, Math.cos(a), 16); const h2 = game.physics.raycast(pl.pos.x, pl.pos.y + 0.3, pl.pos.z, Math.sin(a), 0, Math.cos(a), 16); if (!h && !h2) { pl.camYaw = a; pl.heading = a; break; } }
    sim(0.2); });

  const r = await p.evaluate(() => {
    const g = game, pl = g.player, C = g.combat, W = (id) => window.__W[id];
    const res = {};
    const yaw = pl.camYaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const V = (x, y, z) => pl.pos.clone().set(x, y, z);
    // NPC'yi oyuncunun önüne koy, oyuncunun yüzüne dönük
    const place = (kind, d, opts = {}) => { const n = g.npcs.add(kind, pl.pos.x + fx * d, pl.pos.z + fz * d, null, Object.assign({ state: 'idle', heading: yaw + Math.PI }, opts)); n.static = true; n.thinkT = 99; return n; };
    const shoot = (n, h, id, from = pl) => {
      const o = V(pl.pos.x, pl.pos.y + h, pl.pos.z);
      const t = V(n.pos.x, n.pos.y + h, n.pos.z);
      const d = t.sub(o).normalize();
      C.sndBudget = 3;
      C.hitscan(from, o, d, W(id), o);
    };
    // 1) kasksız baş isabeti: tek tabanca mermisi öldürür (can 100)
    const a = place('gang', 6); a.weapons = { fists: a.weapons.fists }; a.setWeapon('fists');
    shoot(a, 1.65, 'pistol');
    res.headshotKill = { dead: a.dead, helmet: a.helmet, style: a.model.deathStyle && a.model.deathStyle.zone };
    g.npcs.remove(a);
    // 2) kasklı asker: aynı atış hayatta bırakır, kask yıpranır
    const b = place('soldier', 6);
    const hp0 = b.hp; shoot(b, 1.65, 'pistol');
    res.helmetSurvive = { dead: b.dead, hpLoss: Math.round(hp0 - b.hp), helmet: b.helmet, hasHelmetMesh: !!b.model._helmet, vest: !!b.vest, vestMesh: !!b.model._vest };
    g.npcs.remove(b);
    // 3) yelek: gövdeye AK, yelekli polis vs yeleksiz çeteci
    const v = place('police', 6, { vest: true }), nv = place('gang', 9, { vest: false });
    const v0 = v.hp; shoot(v, 1.15, 'ak'); const vl = v0 - v.hp; g.npcs.remove(v);
    const n0 = nv.hp; shoot(nv, 1.15, 'ak'); const nl = n0 - nv.hp; g.npcs.remove(nv);
    res.vest = { vestLoss: Math.round(vl), bareLoss: Math.round(nl), ratio: +(vl / nl).toFixed(2) };
    // 4) delip geçme: arka arkaya iki yeleksiz; tüfek arkadakine düşük hasar, saçma delmez
    const f1 = place('gang', 6, { vest: false }), f2 = place('gang', 7.2, { vest: false });
    f1.maxHp = f1.hp = 1000; f2.maxHp = f2.hp = 1000;
    const pen0 = C.stats.pen;
    shoot(f1, 1.15, 'ak');
    res.pen = { front: Math.round(1000 - f1.hp), behind: Math.round(1000 - f2.hp), exits: C.stats.pen - pen0 };
    const pistolStop = place('police', 13, { vest: true }), pb = place('gang', 14.2, { vest: false });
    pistolStop.maxHp = pistolStop.hp = 1000; pb.maxHp = pb.hp = 1000;
    shoot(pistolStop, 1.15, 'pistol');
    res.pen.vestStopsPistol = Math.round(1000 - pb.hp) === 0;
    for (const n of [f1, f2, pistolStop, pb]) g.npcs.remove(n);
    // 5) ölüm stili + yere oturma: önden gövde vuruşu, 4 sn sonra kalça yerde, T-pozu yok
    const dd = place('gang', 6, { vest: false }); dd.hp = 5;
    shoot(dd, 1.15, 'ak');
    sim(4);
    dd.model.root.updateMatrixWorld(true);
    const hw = dd.model.hips.getWorldPosition(V(0, 0, 0));
    res.death = { style: dd.model.deathStyle && dd.model.deathStyle.zone, hipsY: +(hw.y - dd.pos.y).toFixed(2), rootY: +dd.pos.y.toFixed(2), settled: dd.model.settled };
    g.npcs.remove(dd);
    return res;
  });
  console.log('beden:', JSON.stringify(r));

  // 6) oyuncu: ani hasar tavanı (Normal), yelekle gövde azaltması, yenilenme
  const pr = await p.evaluate(() => {
    const g = game, pl = g.player, C = g.combat, W = window.__W;
    pl.god = false; pl.hp = 100; pl.armor = 0; pl.bleed = 0; g.settings.difficulty = 'normal';
    const n = g.npcs.add('gang', pl.pos.x + 6, pl.pos.z, null, { state: 'idle' }); n.static = true;
    const fire = () => { const o = n.pos.clone(); o.y += 1.15; const d = pl.pos.clone(); d.y += 1.15; d.sub(o).normalize(); C.hitscan(n, o, d, W.ak, o); };
    for (let i = 0; i < 6; i++) { fire(); sim(0.05); }
    const burstHp = Math.round(pl.hp);
    pl.hp = 100; pl.armor = 100; sim(1.2);
    const vestOn = !!pl.model._vest && pl.model._vest.visible;
    fire(); const vestHit = Math.round(100 - pl.hp);
    g.npcs.remove(n);
    pl.hp = 30; pl.bleed = 0; pl.lastHurtT = 0; sim(12);
    const regen = Math.round(pl.hp);
    pl.god = true; pl.hp = 100; pl.armor = 0;
    return { burstHp, vestOn, vestHit, regenTo: regen };
  });
  console.log('oyuncu:', JSON.stringify(pr));

  // 7) nişan: silaha göre yakınlaştırma, dürbün, dikey bakış sınırı
  const ads = await p.evaluate(() => {
    const g = game, pl = g.player, base = g.settings.fov, out = {};
    for (const id of ['pistol', 'uzi', 'ak', 'sniper']) {
      pl.giveWeapon(id, 50); pl.setWeapon(id);
      g.input.mouse.right = true; sim(0.8);
      out[id] = { zoom: +(base / g.camera.fov).toFixed(2), scoped: !!pl.scoped };
      g.input.mouse.right = false; sim(0.6);
    }
    out.release = +(base / g.camera.fov).toFixed(2);
    // yukarı bak: fare ile
    for (let i = 0; i < 30; i++) { g.input.mouse.dy = -200; sim(1 / 30); }
    g.input.mouse.dy = 0;
    const d = g.camera.getWorldDirection(pl.pos.clone());
    out.lookUpDeg = +(Math.asin(d.y) * 180 / Math.PI).toFixed(1);
    out.camY = +(g.camera.position.y - pl.pos.y).toFixed(2);
    pl.camPitch = 0.25; sim(0.3);
    return out;
  });
  console.log('nişan:', JSON.stringify(ads));

  // 8) araç camı: yan cama art arda ateş -> çatlak (1), ağır çatlak (2), kırık (3) + parçalar
  const gl = await p.evaluate(() => {
    const g = game, pl = g.player, C = g.combat, W = window.__W;
    const yaw = pl.camYaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const v = g.vehicles.add('sedan', pl.pos.x + fx * 7, pl.pos.z + fz * 7, yaw + Math.PI / 2);
    sim(0.3);
    // en büyük yan pencere: merkezine dünya uzayında nişan
    const ch = v.mesh.userData.chassis; v.mesh.updateMatrixWorld();
    let wi = -1, best = 0;
    v.windows.forEach((w, i) => { const e = w.p.mx[2] - w.p.mn[2]; if (Math.abs(w.p.c[0]) > 0.3 && e > best) { best = e; wi = i; } });
    const states = [];
    for (let k = 0; k < 4 && wi >= 0; k++) {
      const c = ch.localToWorld(pl.pos.clone().set(v.windows[wi].p.c[0], v.windows[wi].p.c[1], v.windows[wi].p.c[2] + (k - 1.5) * 0.08));
      const o = pl.pos.clone(); o.y += 1.4;
      const d = c.clone().sub(o).normalize();
      C.sndBudget = 3; C.hitscan(pl, o, d, W.pistol, o);
      states.push(v.windows[wi].state);
      sim(0.1);
    }
    sim(1);
    const s = { panes: v.windows.length, pane: wi, states, cracks: C.glass.stats.cracks, shatters: C.glass.stats.shatters, shardsAlive: C.glass.shards.alive, decalsOnCar: ch.children.filter((m) => m.geometry === C.glass.decalGeo && m.visible).length, sfx: g.audio.sfxStats || null };
    g.vehicles.remove ? g.vehicles.remove(v) : 0;
    return s;
  });
  console.log('cam:', JSON.stringify(gl));
  if (process.env.SHOTS === '1') await H.shot(p, `${out}-body.png`);

  // --- doğrulamalar ---
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  ok(r.headshotKill.dead, 'kasksız baş isabeti öldürmedi');
  ok(!r.helmetSurvive.dead && r.helmetSurvive.helmet < 100 && r.helmetSurvive.hasHelmetMesh, 'kask hayatta tutmadı / görünmüyor');
  ok(r.helmetSurvive.vestMesh, 'asker yeleği görünmüyor');
  ok(r.vest.ratio <= 0.5, 'yelek gövde hasarını yeterince azaltmadı');
  ok(r.pen.exits >= 1 && r.pen.behind > 0 && r.pen.behind < r.pen.front, 'delip geçme hatalı');
  ok(r.pen.vestStopsPistol, 'yelek tabanca mermisini durdurmadı');
  ok(r.death.style === 'torso' || r.death.style === 'wall', 'ölüm stili kaydedilmedi');
  ok(r.death.hipsY < 0.45, 'ceset yere oturmadı (kalça yüksek)');
  ok(pr.burstHp > 0, 'oyuncu ani yaylımda öldü');
  ok(pr.vestOn && pr.vestHit < 10, 'oyuncu yeleği görünmüyor ya da azaltmıyor');
  ok(pr.regenTo >= 55, 'yenilenme yetersiz');
  ok(ads.pistol.zoom >= 1.15 && ads.pistol.zoom < ads.ak.zoom && ads.ak.zoom < ads.sniper.zoom && ads.sniper.zoom >= 4.5 && ads.sniper.scoped, 'silaha göre yakınlaştırma hatalı');
  ok(ads.release < 1.05, 'nişandan çıkınca görüş açısı dönmedi');
  ok(ads.lookUpDeg >= 80 && ads.camY > 0.1, 'yukarı bakış sınırı < 80°');
  ok(gl.pane >= 0 && gl.states[0] >= 1 && Math.max(...gl.states) === 3 && gl.shatters >= 1 && gl.cracks >= 1, 'cam durumları ilerlemedi');
  console.log('DOĞRULAMA:', fails.length ? 'BAŞARISIZ -> ' + fails.join('; ') : 'TAMAM');
  console.log('KONSOL HATALARI:', errs.length);
  for (const e of errs) console.log('  ', e.slice(0, 300));
  if (errs.length || fails.length) process.exitCode = 1;
};
