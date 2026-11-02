// Mekanik tepki testi (ALTIN KURAL 1 + 3): her karakter türü vurulunca bölgesel tepki verir, patlamada / araç çarpmasında
// yere savrulup kalkar; oyuncu: savrulma (kontrol kilidi), topallama yavaşlığı, yaralı kolda saçılma, başa isabette sert sarsıntı;
// siviller: yakından geçen kurşunla çömelip tehditten UZAĞA kaçar (içinden geçmez); trafik sürücüleri ateşe tepki verir; hayvanlar ürker.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 node scripts/test/play.js file://$PWD/app/index.html .testout/mech $PWD/scripts/test/mech-steps.js
const H = require('./harness.js');

module.exports = async (p) => {
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.setDefaultTimeout(600000);
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  await H.start(p);
  await H.install(p);
  await p.evaluate(() => {
    const g = game, pl = g.player;
    g.loop = () => {}; g.render = () => {};
    pl.god = true;
    for (const n of g.npcs.list.slice()) if (!n.mission) g.npcs.remove(n);
    const node = g.map.nearestNode(-150, -200); pl.pos.set(node.x + 8.5, 0, node.z + 8.5);
    window.__clear = () => { for (const n of g.npcs.list.slice()) if (!n.mission || n.__t) g.npcs.remove(n); g.wanted.reset && g.wanted.reset(); g.npcs.calmPolice && g.npcs.calmPolice(); g.combat.bleeding.length = 0; };
    // test yardımcısı: oyuncudan hedefe belli yükseklik/yan kaymayla tek mermi
    window.__shoot = (n, y, lat, dmg = 1) => {
      const o = pl.pos.clone(); o.y += 1.45;
      const fx = n.pos.x - pl.pos.x, fz = n.pos.z - pl.pos.z, l = Math.hypot(fx, fz) || 1;
      const d = n.pos.clone(); d.y += y; d.x += -fz / l * lat; d.z += fx / l * lat; d.sub(o).normalize();
      g.combat.hitscan(pl, o, d, { dmg, range: 150, sound: 'pistol', spread: 0 }, o);
      if (window.__noise) g.combat.noise(pl.pos.x, pl.pos.z, 60, pl); // gerçek atıştaki gibi silah sesi
    };
    sim(0.5);
  });

  // ---------------- her karakter türü: bölgesel tepki + savrulma ----------------
  const kinds = await p.evaluate(() => {
    const g = game, pl = g.player, out = {};
    const f = { x: Math.sin(pl.camYaw), z: Math.cos(pl.camYaw) };
    const specs = [
      ['sivil', () => g.npcs.add('civilian', 0, 0, null, { state: 'walk' })],
      ['polis', () => g.npcs.add('police', 0, 0, null, { state: 'idle' })],
      ['özel harekât', () => g.npcs.add('swat', 0, 0, null, { state: 'idle' })],
      ['asker', () => g.npcs.add('soldier', 0, 0, null, { state: 'idle' })],
      ['çete', () => g.npcs.add('gang', 0, 0, null, { state: 'idle', weapon: 'pistol' })],
      ['ödül hedefi', () => { const n = g.npcs.add('boss', 0, 0, null, { state: 'guard', persistent: true, mission: true, hp: 400, armor: 0, weapon: 'pistol' }); n.__t = 1; return n; }],
      ['kapkaççı', () => { const n = g.npcs.add('gang', 0, 0, null, { mission: true, weapon: 'knife', state: 'flee', name: 'Kapkaççı' }); n.__t = 1; return n; }],
      ['sevgili', () => { const n = g.social && g.social.romance ? (() => { const R = g.social.romance, m = R.spawn('defne', 0, 0); delete R.npcs.defne; return m; })() : g.npcs.add('civilian', 0, 0, null, { persistent: true }); n.__t = 1; return n; }],
    ];
    for (const [name, mk] of specs) {
      const r = {};
      const place = (n) => { n.pos.set(pl.pos.x + f.x * 7, 0, pl.pos.z + f.z * 7); n.heading = pl.camYaw + Math.PI; n.maxHp = n.hp = 5000; n.armor = 0; n.alertT = 0; n.home = null; n.sitting = false; n.faceYaw = undefined; if (n.state === 'walk' || n.state === 'sit' || (n.state === 'flee' && !n.__kd)) n.state = 'idle'; n.sync(); n.model.root.updateMatrixWorld(true); };
      // baş
      let n = mk(); place(n); sim(0.05);
      __shoot(n, 1.65, 0); r.head = !!(n.model.hz && n.model.hz.zone === 'head' && n.model.hz.t > 0);
      g.npcs.remove(n);
      // kol
      n = mk(); place(n); sim(0.05);
      __shoot(n, 1.3, 0.3); r.arm = n.model.hz && n.model.hz.zone === 'arm' && (n.armHurt > 0);
      g.npcs.remove(n);
      // bacak
      n = mk(); place(n); sim(0.05);
      __shoot(n, 0.45, 0); r.leg = n.model.hz && n.model.hz.zone === 'leg' && n.limpMul < 1;
      g.npcs.remove(n);
      // patlama: yere savrulur, sonra kalkar
      n = mk(); n.__kd = 1; place(n); sim(0.05);
      const p0 = n.pos.clone();
      g.combat.explosion(n.pos.x - f.x * 3, 0.5, n.pos.z - f.z * 3, 7, 1, null);
      r.kd = n.kdT > 0 && !!n.model.kd;
      sim(1);
      r.pushed = +Math.hypot(n.pos.x - p0.x, n.pos.z - p0.z).toFixed(1);
      sim(4.5);
      r.up = !n.dead && !(n.kdT > 0) && !n.model.kd;
      r.after = n.state;
      g.npcs.remove(n);
      out[name] = r;
      __clear();
    }
    return out;
  });
  for (const [k, r] of Object.entries(kinds)) {
    console.log('  ', k, JSON.stringify(r));
    check(r.head && r.arm && r.leg, `${k}: baş/kol/bacak bölgesel tepki (baş ${r.head}, kol ${r.arm}, bacak ${r.leg})`);
    check(r.kd && r.up && r.pushed > 0.5, `${k}: patlamada yere savrulup kalktı (itilme ${r.pushed} m, sonra ${r.after})`);
  }
  check(kinds['sivil'] && /flee|cower|gone/.test(kinds['sivil'].after), 'Sivil kalkınca kaçıyor/siniyor');

  // ---------------- araç çarpması ----------------
  const car = await p.evaluate(() => {
    const g = game, pl = g.player;
    const type = (g.vehicles.list.find((v) => v.kind === 'car' && !v.police && v.def.len < 5.5) || {}).type || 'taksi';
    const h = pl.camYaw;
    const v = g.vehicles.add(type, pl.pos.x + Math.sin(h) * 20, pl.pos.z + Math.cos(h) * 20, h + Math.PI);
    v.ai = { empty: true }; v.parked = false;
    const n = g.npcs.add('civilian', pl.pos.x + Math.sin(h) * 12, pl.pos.z + Math.cos(h) * 12, null, { state: 'idle' }); n.maxHp = n.hp = 5000;
    let kd = false, maxKd = 0;
    // aracı yayaya doğru 9 m/s sür (park freni etkisiz: konumu ve hızı her karede biz veriyoruz)
    sim(1.6, () => { if (!v.destroyed) { const f = { x: Math.sin(v.heading), z: Math.cos(v.heading) }; v.prevX = v.pos.x; v.prevZ = v.pos.z; v.pos.x += f.x * 9 / 30; v.pos.z += f.z * 9 / 30; v.vx = f.x * 9; v.vz = f.z * 9; v.yawRate = 0; } if (n.kdT > 0) { kd = true; maxKd = Math.max(maxKd, n.kdT); } });
    const r = { type, kd, hp: Math.round(n.hp), d: +Math.hypot(n.pos.x - v.pos.x, n.pos.z - v.pos.z).toFixed(1) };
    g.npcs.remove(n); g.vehicles.remove(v);
    return r;
  });
  console.log('araç:', JSON.stringify(car));
  check(car.kd, `Araç çarpan yaya yere savruldu (${car.type})`);

  // ---------------- oyuncu ----------------
  const pr = await p.evaluate(() => {
    const g = game, pl = g.player, r = {};
    __clear();
    const f = { x: Math.sin(pl.camYaw), z: Math.cos(pl.camYaw) };
    // patlama: savrulma, kontrol kilidi, kalkış
    g.combat.explosion(pl.pos.x + f.x * 3, 0.5, pl.pos.z + f.z * 3, 7, 1, null);
    r.kd = pl.kdT > 0;
    sim(0.6);
    const a = pl.pos.clone(); hold('KeyW', true); sim(0.6); hold('KeyW', false);
    r.lockedMove = +Math.hypot(pl.pos.x - a.x, pl.pos.z - a.z).toFixed(2);
    sim(3.5);
    r.up = !(pl.kdT > 0);
    const b = pl.pos.clone(); hold('KeyW', true); sim(1); hold('KeyW', false); sim(0.5);
    r.freeMove = +Math.hypot(pl.pos.x - b.x, pl.pos.z - b.z).toFixed(2);
    // topallama: aynı sürede daha az yol
    const run = () => { const c = pl.pos.clone(); hold('KeyW', true); sim(1.5); hold('KeyW', false); sim(0.6); pl.camYaw += Math.PI; return Math.hypot(pl.pos.x - c.x, pl.pos.z - c.z); };
    pl.hp = 60; // tam canda yaralar kendiliğinden temizlenir
    pl.limp = 0; const d0 = run(); pl.limp = 1; const d1 = run(); pl.limp = 0; pl.hp = 100;
    r.limpRatio = +(d1 / d0).toFixed(2);
    // yaralı kol: saçılma
    pl.giveWeapon('pistol', 999); pl.setWeapon('pistol'); sim(0.1);
    const spreadOf = (arm) => {
      pl.armHurt = arm; const hs = g.combat.hitscan; const dirs = [];
      g.combat.hitscan = (att, o, d) => { if (att === pl) dirs.push(d.clone()); };
      for (let i = 0; i < 40; i++) { pl.fireCd = 0; pl.reloadT = 0; pl.bloom = 0; pl.weapons.pistol.mag = 15; const o = pl.pos.clone(); o.y += 1.45; pl.tryFire(o, game.player.pos.clone().set(Math.sin(pl.camYaw), 0, Math.cos(pl.camYaw))); }
      g.combat.hitscan = hs; pl.armHurt = 0;
      let s = 0; for (const d of dirs) s += Math.abs(d.y); return s / Math.max(1, dirs.length);
    };
    const s0 = spreadOf(0), s1 = spreadOf(1);
    r.armSpread = +(s1 / Math.max(1e-6, s0)).toFixed(2);
    // baş isabeti oyuncuda daha sert sarsıntı
    const shakeOf = (zone) => { pl.camShake = 0; g.combat.playerHitFx({ pos: { x: pl.pos.x + 5, z: pl.pos.z } }, game.player.pos.clone().set(-1, 0, 0), 15, zone); return pl.camShake; };
    r.shakeHead = +shakeOf('head').toFixed(2); r.shakeTorso = +shakeOf('torso').toFixed(2);
    r.ind = !!(g.ui.hitInd && g.ui.hitInd.els.length);
    return r;
  });
  console.log('oyuncu:', JSON.stringify(pr));
  check(pr.kd && pr.lockedMove < 0.6 && pr.up && pr.freeMove > 1.5, `Oyuncu patlamada yere savruldu, kontrol kilitlendi (${pr.lockedMove} m) ve kalktı (${pr.freeMove} m)`);
  check(pr.limpRatio < 0.85, `Bacağından yaralı oyuncu yavaş (oran ${pr.limpRatio})`);
  check(pr.armSpread > 1.5, `Yaralı kolda saçılma arttı (x${pr.armSpread})`);
  check(pr.shakeHead > pr.shakeTorso && pr.ind, `Başa isabet daha sert sarsar (${pr.shakeHead} > ${pr.shakeTorso}), yön göstergesi`);

  // ---------------- siviller: çömel, tehditten uzağa kaç ----------------
  const civ = await p.evaluate(() => {
    const g = game, pl = g.player;
    __clear();
    const C = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, R = 6 + (i % 3) * 3;
      const n = g.npcs.add('civilian', pl.pos.x + Math.sin(a) * R, pl.pos.z + Math.cos(a) * R, null, { state: 'walk' });
      n.brave = false; n.weapons = { fists: n.weapons.fists }; n.setWeapon('fists');
      C.push(n);
    }
    sim(0.1);
    const d0 = C.map((n) => Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z));
    // her sivilin ~1 m yanından bir mermi
    window.__noise = true;
    for (const n of C) { pl.fireCd = 0; __shoot(n, 1.2, 1.0, 20); }
    window.__noise = false;
    sim(0.15);
    const ducked = C.filter((n) => n.state === 'cower').length;
    const minD = d0.slice();
    sim(7, (i) => { if (i % 5 === 0) C.forEach((n, k) => { minD[k] = Math.min(minD[k], Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z)); }); });
    const d1 = C.map((n) => Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z));
    const away = C.filter((n, k) => !n.removeMe && d1[k] > d0[k] + 4 || n.state === 'gone' || n.removeMe || !g.npcs.list.includes(n)).length;
    const through = C.filter((n, k) => minD[k] < Math.min(2.5, d0[k] - 1.5)).length;
    const why = C.map((n, k) => minD[k] < Math.min(2.5, d0[k] - 1.5) ? n.state + ':' + (n.flee ? Object.keys(n.flee).join('') : '-') : '').filter(Boolean);
    return { ducked, away, through, why, n: C.length, d0: d0.map(Math.round), d1: d1.map(Math.round), minD: minD.map((x) => +x.toFixed(1)) };
  });
  console.log('siviller:', JSON.stringify(civ));
  check(civ.ducked >= 7, `Yakından geçen kurşunla çömeldi (${civ.ducked}/${civ.n})`);
  check(civ.away >= 8, `Tehditten uzaklaştı (${civ.away}/${civ.n})`);
  check(civ.through === 0, `Kaçarken tehdidin içinden geçen yok (${civ.through})`);

  // ---------------- trafik sürücüleri + hayvanlar ----------------
  const tr = await p.evaluate(() => {
    const g = game, pl = g.player;
    __clear();
    sim(1);
    let cars = g.vehicles.list.filter((v) => v.ai && v.ai.mode === 'traffic' && !v.driver && !v.police && v.kind === 'car');
    if (!cars.length) { for (let i = 0; i < 6; i++) g.vehicles.spawnTraffic(pl.pos.x, pl.pos.z); cars = g.vehicles.list.filter((v) => v.ai && v.ai.mode === 'traffic' && !v.driver && !v.police && v.kind === 'car'); }
    const v = cars.sort((a, b) => Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z) - Math.hypot(b.pos.x - pl.pos.x, b.pos.z - pl.pos.z))[0];
    const r = { cars: cars.length };
    if (v) {
      g.combat.panicScan = 0;
      g.combat.noise(v.pos.x + 4, v.pos.z + 4, 60, pl);
      r.react = !!(v.ai.empty || v.ai.panic > 0 || v.ai.reverseT > 0);
      r.how = v.ai.empty ? 'indi' : v.ai.reverseT > 0 ? 'geri' : v.ai.panic > 0 ? 'panik' : 'yok';
    }
    // hayvan: yanından geçen mermi -> ateş edenden uzağa kaçar
    const A = g.animals; let an = null;
    for (let i = 0; i < 30 && !(A.cats.length + A.dogs.length); i++) A.spawnStreetAnimal(pl.pos.x, pl.pos.z);
    an = A.cats[0] || A.dogs[0];
    if (an) {
      an.state = 'sit'; an.t = 10;
      const o = game.player.pos.clone().set(an.x + 15, 1.45, an.z);
      const d = game.player.pos.clone().set(an.x - o.x, 0.35 - o.y, an.z + 0.8 - o.z).normalize();
      g.combat.nearMiss(o, d, 40, pl, null);
      const away = Math.sin(an.heading) * (an.x - o.x) + Math.cos(an.heading) * (an.z - o.z);
      r.animal = an.state; r.animalAway = away > 0;
    }
    return r;
  });
  console.log('trafik/hayvan:', JSON.stringify(tr));
  check(tr.react, `Trafik sürücüsü silah sesine tepki verdi (${tr.how})`);
  check(tr.animal === 'flee' && tr.animalAway, 'Sokak hayvanı ateş edenden uzağa kaçtı');

  console.log('KONSOL HATALARI:', errs.length); for (const e of errs.slice(0, 5)) console.log('  ', e.slice(0, 300));
  console.log(fails.length ? `BAŞARISIZ: ${fails.length}` : 'TÜMÜ BAŞARILI');
  if (errs.length || fails.length) process.exitCode = 1;
};
