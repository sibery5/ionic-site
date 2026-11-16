// [villa] Oyuncunun villası: kapıdan gir, galeriden araç al, havuzda yüz, yatakta kayıt, helikoptere bin ve kalk,
// saldırı helikopteri hedefe hasar verir, korumalar karşılar ve saldırana tepki verir, parsel alanı, çarpışma denetimi,
// çizim çağrısı artışı. 4 ekran görüntüsü: genel, bina (akşam), havuz, galeri/pist.
const H = require('./harness.js');
const fs = require('fs');
const path = require('path');

module.exports = async (p, out) => {
  fs.mkdirSync(out, { recursive: true });
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  await p.evaluate(() => { window.__render = game.render.bind(game); game.render = () => {}; game.loop = () => {}; game.suppressPause = true; game.input.lock = () => {}; sim(0.5); });
  const fails = [];
  const T = async (name, fn, ok) => {
    let r;
    try { r = await p.evaluate(fn); } catch (e) { r = { err: String(e.message || e).slice(0, 300) }; }
    const pass = !r || r.err ? false : ok(r);
    const hp = await p.evaluate(() => [Math.round(game.player.hp), game.mode]);
    console.log((pass ? 'OK  ' : 'FAIL') + ' ' + name, JSON.stringify(r), 'hp', hp.join('/'));
    if (!pass) fails.push(name);
    return r;
  };
  const shot = async (n, cam, time) => {
    await p.evaluate(([c, tm]) => {
      const g = game; if (tm !== undefined) { g.env.time = tm; g.env.update(0.01, g.player.pos); g.uniforms.uNight.value = g.env.nightFactor; }
      g.player.pos.set(c.px, 0, c.pz); sim(0.4);
      g.render = window.__render; g.camera.position.set(c.x, c.y, c.z); g.camera.lookAt(c.lx, c.ly, c.lz); g.camera.fov = 60; g.camera.updateProjectionMatrix();
      g.villa.w.group.visible = true; window.__render(); window.__render(); g.render = () => {};
    }, [cam, time]);
    await p.screenshot({ path: path.join(out, n), timeout: 240000 });
  };

  await T('parsel', () => {
    const V = MAPDATA_V(); const w = game.villa.w;
    return { area: (V.x1 - V.x0) * (V.z1 - V.z0), solids: w.solids.length, pools: game.villa.w && window.game.physics.inWater(159, -833), guards: game.villa.guards.length, cars: game.villa.cars.length, helis: game.villa.helis.map((h) => h.type), boat: !!game.villa.boat };
    function MAPDATA_V() { return { x0: 77, x1: 177, z0: -873, z1: -773 }; }
  }, (r) => r.area >= 9500 && r.area <= 10500 && r.pools && r.guards === 8 && r.cars === 4 && r.helis.length === 2);

  // 1) kapı: uzaktayken kapalı (çarpışma var), yaklaşınca açılır, yürüyerek içeri girilir
  await T('kapıdan gir', () => {
    const g = game, pl = g.player, v = g.villa;
    pl.pos.set(122, 0, -740); sim(1.5);
    const closed = !!v.gateBox && v.gateOpen === 0;
    const blocked = g.physics.raycast(122, 1, -768, 0, 0, -1, 10, null);
    pl.pos.set(122, 0, -769); pl.heading = Math.PI; pl.camYaw = Math.PI; sim(5);
    const opened = v.gateOpen;
    hold('KeyW', true); sim(5); hold('KeyW', false);
    let z1 = pl.pos.z;
    if (z1 > -770) { pl.camYaw = 0; pl.heading = 0; hold('KeyW', true); sim(5); hold('KeyW', false); z1 = pl.pos.z; }
    return { closed, blockedT: blocked ? +blocked.t.toFixed(1) : -1, opened: +opened.toFixed(2), z: +z1.toFixed(1), x: +pl.pos.x.toFixed(1), inside: v.inside };
  }, (r) => r.closed && r.blockedT > 0 && r.opened > 0.9 && r.z < -776);

  // 2) korumalar karşılar
  await T('karşılama', () => {
    const g = game, pl = g.player, v = g.villa;
    pl.pos.set(122, 0, -779); sim(1);
    return { greeted: v.guards.filter((n) => n.greetT > 0).length, suit: (v.guards[0].model.look || {}).top, ally: v.guards.every((n) => n.ally) };
  }, (r) => r.greeted >= 1 && r.suit === 'suit' && r.ally);

  // 3) galeriden araç al ve kapıdan çık
  await T('galeri aracı', () => {
    const g = game, pl = g.player, v = g.villa, car = v.cars[0];
    pl.pos.set(car.pos.x + 1.8, 0, car.pos.z + 3); sim(0.2);
    g.enterVehicle(car, true);
    hold('KeyW', true); sim(1.4); hold('KeyW', false); sim(1.5);
    const o = { type: car.type, owned: car.owned, inCar: pl.vehicle === car, z: +car.pos.z.toFixed(1), moved: +(car.pos.z - (-795.2)).toFixed(1), hp: car.hp };
    g.vehicles.ejectDriver(car); sim(0.5);
    return o;
  }, (r) => r.owned && r.inCar && r.moved > 3);

  // 4) havuzda yüz
  await T('havuzda yüz', () => {
    const g = game, pl = g.player;
    pl.pos.set(149, 1.6, -844); sim(0.5);
    const deckY = +pl.pos.y.toFixed(2);
    pl.pos.set(156, 1.6, -833); pl.vy = 0; sim(1);
    const sw = pl.swimming, y = +pl.pos.y.toFixed(2);
    pl.camYaw = Math.PI / 2; pl.heading = Math.PI / 2; hold('KeyW', true); sim(2); hold('KeyW', false);
    const sw2 = pl.swimming, x2 = +pl.pos.x.toFixed(1);
    return { deckY, sw, y, sw2, x2 };
  }, (r) => r.deckY > 1.4 && r.sw && Math.abs(r.y - 1.45) < 0.3);

  // 5) eve gir, yatakta uyu = kayıt, çık
  await T('yatakta kayıt', () => {
    const g = game, pl = g.player;
    if (pl.swimming) pl.swimming = false; pl.scriptCtl = null;
    pl.pos.set(122, 0, -816.9); pl.vy = 0; sim(0.3);
    const it = g.findInteraction();
    if (!it || !/Villan/.test(it.label)) return { label: it && it.label, dead: pl.dead, hp: pl.hp, y: +pl.pos.y.toFixed(2), z: +pl.pos.z.toFixed(2), mode: g.mode, door: g.city.doors.filter((d) => d.building.villaPlayer).map((d) => [d.x, d.z]) };
    it.action(); sim(0.3);
    const ctx = pl.inInterior;
    let saved = 0; const sv = g.saveGame; g.saveGame = (...a) => { saved++; return Promise.resolve(); };
    const bed = ctx.interact.find((i) => /Kaydet/.test(i.label));
    bed.action();
    g.saveGame = sv;
    const o = { label: it.label, type: ctx.type, rooms: ctx.interact.map((i) => i.label.split(' ')[0]), saved, safeAuto: g.pendingAutosave || null };
    g.interiors.exit(); sim(0.2);
    o.out = pl.pos.toArray().map((a) => +a.toFixed(1));
    return o;
  }, (r) => r.type === 'villa_player' && r.saved >= 1 && r.rooms.length >= 4);

  // 6) sivil helikoptere bin ve kalk
  await T('helikopter kalkış', () => {
    const g = game, pl = g.player, h = g.villa.helis[0];
    pl.pos.set(h.pos.x + 3, 0, h.pos.z); sim(0.2);
    g.enterVehicle(h, true); hold('Space', true); sim(5); hold('Space', false);
    const o = { type: h.type, y: +h.pos.y.toFixed(1), hp: h.hp };
    hold('ControlLeft', true); sim(10, () => { if (h.pos.y < 6) hold('ControlLeft', false); }); hold('ControlLeft', false); sim(4);
    o.landY = +h.pos.y.toFixed(1); o.dmg = Math.round(o.hp - h.hp);
    g.vehicles.ejectDriver(h); sim(0.3);
    return o;
  }, (r) => r.y > 5);

  // 7) saldırı helikopteri: top + roket hedefe hasar verir
  await T('saldırı helikopteri', () => {
    const g = game, pl = g.player, h = g.villa.helis[1];
    if (pl.dead) return { dead: true };
    const fwd = { x: Math.sin(h.heading), z: Math.cos(h.heading) };
    const tgt = g.vehicles.add('sedan', h.pos.x + fwd.x * 24, h.pos.z + fwd.z * 24, 0); tgt.mission = 'test';
    const hp0 = tgt.hp, n0 = g.combat.projectiles.length;
    pl.pos.set(h.pos.x + 3, 0, h.pos.z); sim(0.2);
    g.enterVehicle(h, true); hold('Space', true); sim(0.6); hold('Space', false);
    sim(3, (i) => { g.input.mouse.left = true; if (i % 20 === 0) press('KeyQ'); });
    g.input.mouse.left = false; sim(1.5);
    const o = { hp0, hp: Math.round(tgt.hp), destroyed: !!tgt.destroyed, rockets: g.combat.projectiles.length - n0, heliY: +h.pos.y.toFixed(1) };
    g.vehicles.ejectDriver(h); sim(0.3);
    return o;
  }, (r) => r.destroyed || r.hp < r.hp0);

  // 8) korumalar saldırana tepki verir
  await T('koruma savunması', () => {
    const g = game, pl = g.player, v = g.villa;
    pl.pos.set(122, 0, -790); sim(0.3);
    const e = g.npcs.add('gang', 122, -762, null, { gang: 'kartallar', hostile: true, state: 'attack', weapon: 'pistol' });
    e.target = pl;
    sim(4);
    return { engaged: v.guards.filter((n) => n.target === e || (n.state === 'attack' && n.target)).length, enemyHp: Math.round(e.hp), enemyDead: !!(e.dead || e.downed), gateOpen: +v.gateOpen.toFixed(2) };
  }, (r) => r.engaged >= 2);

  // 9) çarpışma denetimi: her görünür katı nesnenin altında çarpışma kutusu
  await T('çarpışma', () => {
    const g = game, w = g.villa.w, ph = g.physics;
    let ok = 0; const miss = [];
    for (const [x, z, r, h, name] of w.solids) {
      const hit = ph.city.query(x - r - 0.05, z - r - 0.05, x + r + 0.05, z + r + 0.05, []).some((b) => b.y1 >= Math.min(h, 0.8) - 0.05);
      if (hit) ok++; else miss.push(name + '@' + x.toFixed(0) + ',' + z.toFixed(0));
    }
    return { total: w.solids.length, ok, missing: miss.length, miss: miss.slice(0, 10) };
  }, (r) => r.missing === 0);

  // 10) çizim çağrısı artışı (villa görünür / gizli, aynı kamera)
  await T('çizim çağrısı', () => {
    const g = game, w = g.villa.w, R = g.renderer;
    g.player.pos.set(122, 0, -800); sim(0.3);
    g.camera.position.set(220, 70, -720); g.camera.lookAt(122, 0, -823);
    const calls = (vis) => { w.group.visible = vis; R.info.autoReset = false; R.info.reset(); R.render(g.scene, g.camera); const c = R.info.render.calls; R.info.autoReset = true; return c; };
    const on = calls(true), off = calls(false); w.group.visible = true;
    return { on, off, delta: on - off };
  }, (r) => r.delta <= 120);

  console.log('info', JSON.stringify(await p.evaluate(() => info())));
  await shot('villa-genel.png', { px: 122, pz: -800, x: 250, y: 95, z: -700, lx: 122, ly: 0, lz: -825 }, 15);
  await shot('villa-bina.png', { px: 122, pz: -800, x: 122, y: 6, z: -780, lx: 122, ly: 6, lz: -830 }, 20.6);
  await shot('villa-havuz.png', { px: 150, pz: -830, x: 132, y: 9, z: -812, lx: 165, ly: 1, lz: -836 }, 13);
  await shot('villa-galeri.png', { px: 100, pz: -820, x: 104, y: 3.2, z: -784.5, lx: 88, ly: 1, lz: -797 }, 13);
  console.log(fails.length ? 'VILLA FAIL: ' + fails.join(', ') : 'VILLA OK');
};
