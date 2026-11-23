// [O1] Kademeli, adil kanun tırmanması:
//  A) 5★ verilen, zırhlı (god kapalı) ve yol ağında KOŞARAK kaçan oyuncu: birimlerin geliş zamanları, ilk 30 sn'de ölmez,
//     ilk tank atışı ≥ 60 sn, helikopter ≥ 30 sn, barikat ≥ 25 sn, özel harekât ≥ 35 sn.
//  B) Roket isabeti: duran oyuncuya 20 tank atışı; doğrudan isabet (patlama oyuncuya < 1,5 m) oranı ≤ %30, uyarı süresi ≥ 1,5 sn.
//  C) Roket hasarı: tam canlı yaya oyuncuya (zırhsız) doğrudan roket öldürmez; zırhlıda daha az.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/esc2 $PWD/scripts/test/escalate-steps.js
const H = require('./harness.js');

module.exports = async (p) => {
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.setDefaultTimeout(900000);
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  await H.start(p);
  await H.install(p);
  await p.evaluate(() => {
    const g = game; g.loop = () => {};
    window.E = {
      clear() {
        const W = g.wanted; W.reset(); g.npcs.calmPolice();
        if (g.player.vehicle) g.vehicles.ejectDriver(g.player.vehicle);
        g.player.scriptCtl = null;
        for (const n of g.npcs.list.slice()) if (!n.mission) g.npcs.remove(n);
        for (const v of g.vehicles.list.slice()) if (!v.owned && v.mission !== 'prop') g.vehicles.remove(v);
        g.ui.closeAll(); g.mode = 'playing'; g.onBusted = () => { E.busted = (E.busted || 0) + 1; };
      },
    };
  });

  // ---------------- A) kaçan oyuncu, 5★, 75 sn ----------------
  const A = await p.evaluate(() => {
    const g = game, W = g.wanted, pl = g.player;
    E.clear();
    // askerî üsten uzak bir düğüm
    let n0 = g.map.nearestNode(150, -150);
    pl.pos.set(n0.x, 0, n0.z); pl.god = false; pl.hp = 100; pl.armor = 100;
    let prev = null, cur = n0, nxt = null;
    const pick = () => { const opts = cur.edges.map((e) => g.map.other(e, cur)).filter((o) => o !== prev && !(g.military && g.military.inZone(o.x, o.z, 60))); nxt = opts.length ? opts[Math.floor(Math.random() * opts.length)] : prev; };
    pick();
    // yol ağında koşu (5,5 m/s); oyuncu kolluğun görüşünde sayılır: 5★ korunur (en ağır senaryo)
    pl.scriptCtl = (dt) => {
      const dx = nxt.x - pl.pos.x, dz = nxt.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d < 1) { prev = cur; cur = nxt; pick(); return; }
      const s = Math.min(d, 5.5 * dt); pl.pos.x += dx / d * s; pl.pos.z += dz / d * s; pl.pos.y = Math.max(0, g.physics.groundAt(pl.pos.x, pl.pos.z));
      pl.heading = Math.atan2(dx, dz); pl.speed = 5.5;
    };
    const ev = { rb: -1, swat: -1, heli: -1, army: -1, tankShot: -1, death: -1, lb: 0 };
    const rk = g.combat.rocket.bind(g.combat);
    let t = 0;
    g.combat.rocket = (a, o, d, def) => { if (ev.tankShot < 0 && a && a.vehicle && a.vehicle.type === 'tank') ev.tankShot = +t.toFixed(1); return rk(a, o, d, def); };
    W.set(5);
    const hp = [];
    sim(75, (i) => {
      t = i / 30;
      if (i % 15 === 0) W.spotted();
      if (ev.rb < 0 && W.roadblocks.length) ev.rb = +t.toFixed(1);
      if (ev.swat < 0 && W.units.some((u) => u.type === 'swat')) ev.swat = +t.toFixed(1);
      if (ev.heli < 0 && W.heli) ev.heli = +t.toFixed(1);
      if (ev.army < 0 && W.units.some((u) => u.type === 'jandarma')) ev.army = +t.toFixed(1);
      if (ev.death < 0 && pl.dead) ev.death = +t.toFixed(1);
      if (i % 150 === 0) hp.push(Math.round(pl.hp) + '/' + Math.round(pl.armor));
    });
    g.combat.rocket = rk;
    ev.lb = pl.lastBreaths || 0; ev.hp = hp.join(' '); ev.lvl = W.level;
    pl.scriptCtl = null; pl.god = true;
    if (pl.dead) { pl.dead = false; pl.hp = 100; }
    return ev;
  });
  console.log('kaçış:', JSON.stringify(A));
  check(A.death < 0 || A.death > 30, 'Kaçan zırhlı oyuncu ilk 30 sn ölmedi (ölüm ' + A.death + ' sn)');
  check(A.rb < 0 || A.rb >= 25, 'Barikat ≥ 25 sn (' + A.rb + ')');
  check(A.swat < 0 || A.swat >= 35, 'Özel Harekât ≥ 35 sn (' + A.swat + ')');
  check(A.heli < 0 || A.heli >= 30, 'Helikopter ≥ 30 sn (' + A.heli + ')');
  check(A.army < 0 || A.army >= 60, 'Jandarma ≥ 60 sn (' + A.army + ')');
  check(A.tankShot < 0 || A.tankShot >= 60, 'İlk tank atışı ≥ 60 sn (' + A.tankShot + ')');
  check(A.heli >= 30 || A.swat >= 35, 'Ağır birimler yine de geldi (kademe çalışıyor)');

  // ---------------- B) tank isabeti, duran oyuncu ----------------
  const B = await p.evaluate(() => {
    const g = game, W = g.wanted, pl = g.player;
    E.clear(); W.reset();
    const n0 = g.map.nearestNode(150, -150);
    pl.pos.set(n0.x, 0, n0.z); pl.god = true;
    const e = n0.edges.reduce((a, b) => (Math.hypot(g.map.other(b, n0).x - n0.x, g.map.other(b, n0).z - n0.z) > Math.hypot(g.map.other(a, n0).x - n0.x, g.map.other(a, n0).z - n0.z) ? b : a));
    const o = g.map.other(e, n0), L = Math.hypot(o.x - n0.x, o.z - n0.z), fx = (o.x - n0.x) / L, fz = (o.z - n0.z) / L;
    const D = Math.min(60, L - 5);
    const tk = g.vehicles.add('tank', n0.x + fx * D, n0.z + fz * D, Math.atan2(-fx, -fz));
    tk.ai = { empty: true }; tk.parked = true; tk.police = true; tk.lawTank = true; tk.reloadT = 0;
    W.roadblocks.push({ cars: [tk], cops: [], x: tk.pos.x, z: tk.pos.z, t: 999, tank: tk });
    W.set(5); W.hold[5] = 99;
    const ex = g.combat.explosion.bind(g.combat);
    const dist = []; let warnStart = -1, t = 0; const warns = [];
    g.combat.explosion = (x, y, z, r, d, a, s) => { if (a && a.vehicle === tk) dist.push(+Math.hypot(x - pl.pos.x, z - pl.pos.z).toFixed(1)); return ex(x, y, z, r, d, a, s); };
    const rk = g.combat.rocket.bind(g.combat);
    g.combat.rocket = (a, oo, d, def) => { if (a && a.vehicle === tk) { if (warnStart >= 0) warns.push(+(t - warnStart).toFixed(2)); warnStart = -1; tk.reloadT = 0.5; } return rk(a, oo, d, def); };
    const s0 = W.rocketStats.shots; W.rocketStats.minWarn = undefined;
    sim(80, (i) => { t = i / 30; if (warnStart < 0 && tk.warnT > 0) warnStart = t; if (i % 15 === 0) W.spotted(); W.hold[5] = 99; });
    g.combat.explosion = ex; g.combat.rocket = rk;
    const direct = dist.filter((d) => d < 1.5).length;
    const r = { D: Math.round(D), shots: W.rocketStats.shots - s0, booms: dist.length, direct, dist: dist.join(','), minWarn: +(W.rocketStats.minWarn || 0).toFixed(2), testWarn: Math.min(...warns), lvl: W.level };
    E.clear();
    return r;
  });
  console.log('tank isabeti:', JSON.stringify(B));
  check(B.booms >= 10, 'En az 10 tank atışı ölçüldü (' + B.booms + ')');
  check(B.direct / Math.max(1, B.booms) <= 0.3, 'Doğrudan isabet ≤ %30: ' + B.direct + '/' + B.booms);
  check(B.minWarn >= 1.5, 'Atıştan önce uyarı ≥ 1,5 sn (' + B.minWarn + ' sn)');

  // ---------------- C) roket hasarı ----------------
  const C = await p.evaluate(() => {
    const g = game, pl = g.player;
    E.clear();
    const fake = { pos: pl.pos.clone().set(pl.pos.x + 50, 0, pl.pos.z), isPlayer: false, vehicle: null };
    pl.god = false;
    const res = {};
    pl.hp = 100; pl.armor = 0; pl.lastBreaths = 0; pl._lbLast = -99; pl._lbUntil = 0; g.combat.clock += 30;
    g.combat.explosion(pl.pos.x, pl.pos.y + 1, pl.pos.z, 7, 200, fake, null);
    res.noArmor = { hp: Math.round(pl.hp), dead: pl.dead };
    if (pl.dead) { pl.dead = false; }
    pl.hp = 100; pl.armor = 100; g.combat.clock += 30;
    g.combat.explosion(pl.pos.x, pl.pos.y + 1, pl.pos.z, 7, 200, fake, null);
    res.armor = { hp: Math.round(pl.hp), armor: Math.round(pl.armor), dead: pl.dead };
    if (pl.dead) { pl.dead = false; }
    // son nefes: 5 canla ağır isabet → 1 can + pencere; pencerede ikinci ağır isabet öldürür
    pl.hp = 5; pl.armor = 0; g.combat.clock += 30; sim(0.05);
    g.combat.explosion(pl.pos.x, pl.pos.y + 1, pl.pos.z, 7, 200, fake, null);
    res.lb1 = { hp: Math.round(pl.hp), dead: pl.dead, window: +((pl._lbUntil || 0) - g.combat.clock).toFixed(1) };
    sim(0.5);
    g.combat.explosion(pl.pos.x, pl.pos.y + 1, pl.pos.z, 7, 200, fake, null);
    res.lb2 = { dead: pl.dead };
    pl.dead = false; pl.hp = 100; pl.god = true; if (pl.model && pl.model.revive) pl.model.revive();
    return res;
  });
  console.log('roket hasarı:', JSON.stringify(C));
  check(!C.noArmor.dead && C.noArmor.hp > 0, 'Tam can, zırhsız: doğrudan roket öldürmedi (can ' + C.noArmor.hp + ')');
  check(!C.armor.dead && C.armor.hp > C.noArmor.hp, 'Zırh emdi (can ' + C.armor.hp + ' > ' + C.noArmor.hp + ', zırh ' + C.armor.armor + ')');
  check(!C.lb1.dead && C.lb1.window > 1.5, 'Son nefes: ölümcül isabette 1 can + ' + C.lb1.window + ' sn pencere');
  check(C.lb2.dead, 'Son nefeste ikinci ağır isabet öldürdü');

  console.log('KONSOL HATALARI:', errs.length);
  for (const e of errs.slice(0, 10)) console.log('  ', e.slice(0, 300));
  console.log(fails.length ? `BAŞARISIZ: ${fails.length}` : 'TÜMÜ BAŞARILI');
  if (errs.length || fails.length) process.exitCode = 1;
};
