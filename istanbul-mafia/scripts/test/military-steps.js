// [O5] Askerî üs: nizamiyeden araçla giriş → uyarı → son uyarı → 15 sn'de alarm + arama → görülünce çatışma.
//  Kabul: ilk 10 sn oyuncuya ateş yok, alarm (arama) 15 sn'de, arama durumu gözlenir (askerler son görülen yere yaklaşır),
//  çatışmada oyuncu ilk 10 sn'de ölmez. Ayrıca çevre duvarı kesintisiz (kapı dışında boşluk yok) ve tırmanılamaz.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/mil $PWD/scripts/test/military-steps.js
const H = require('./harness.js');
module.exports = async (p) => {
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.setDefaultTimeout(600000);
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, m = g.military, pl = g.player, W = g.wanted;
    g.loop = () => {};
    g.env.time = 13; pl.god = true;
    const props = g.vehicles.list.filter((v) => v.mission === 'prop').length;
    // çevre duvarı: dışarıdan içeri ışın (kapı dışında her 10 m) → hepsi engelli olmalı
    const z = m.zone, gx = m.gate.x;
    let gaps = 0, probes = 0;
    for (let x = z.x0 + 5; x < z.x1 - 5; x += 10) {
      if (Math.abs(x - gx) < 10) continue;
      probes++; if (g.physics.lineOfSight(x, 1.2, z.z1 + 6, x, 1.2, z.z1 - 6)) gaps++;
      probes++; if (g.physics.lineOfSight(x, 1.2, z.z0 - 6, x, 1.2, z.z0 + 6)) gaps++;
    }
    for (let zz = z.z0 + 5; zz < z.z1 - 5; zz += 10) {
      probes++; if (g.physics.lineOfSight(z.x0 - 6, 1.2, zz, z.x0 + 6, 1.2, zz)) gaps++;
      probes++; if (g.physics.lineOfSight(z.x1 + 6, 1.2, zz, z.x1 - 6, 1.2, zz)) gaps++;
    }
    // nizamiyenin önüne yaklaş: garnizon kurulsun
    pl.pos.set(gx, 0, z.z1 + 40); sim(2);
    const soldiers = m.soldiers.filter((s) => !s.dead);
    let shots = 0, t = 0, firstShot = -1;
    for (const s of soldiers) { const tf = s.tryFire.bind(s); s.tryFire = (o, d) => { const ok = tf(o, d); if (ok && Math.hypot(s.target ? s.target.pos.x - pl.pos.x : 99, s.target ? s.target.pos.z - pl.pos.z : 99) < 5) { shots++; if (firstShot < 0) firstShot = +t.toFixed(1); } return ok; }; }
    // araçla nizamiyeden gir (kuzeye: -z), 25 m içeride dur
    const car = g.vehicles.add('sedan', gx + 2, z.z1 + 14, Math.PI); g.enterVehicle(car, true);
    pl.god = false; pl.hp = 100; pl.armor = 0;
    const tl = []; let enterT = -1, alarmT = -1, fightT = -1, gateWarn = false, d0 = -1, dMin = 1e9, searching = 0, deadT = -1;
    sim(60, (i) => {
      t = i / 30;
      if (car.pos.z > z.z1 - 25) { car.vx = 0; car.vz = -6; } else { car.vx *= 0.8; car.vz *= 0.8; }
      if ((m.stage || 0) >= 1 && car.pos.z > z.z1 - 2) gateWarn = true;
      if (enterT < 0 && m.inTrespass) enterT = +t.toFixed(1); // duvarların içine girdiği an
      if (i % 30 === 0) tl.push((m.alert ? 'Ç' : m.search ? 'A' : m.stage || 0));
      if (alarmT < 0 && (m.search || m.alert)) alarmT = +t.toFixed(1);
      if (fightT < 0 && m.alert) fightT = +t.toFixed(1);
      if (deadT < 0 && pl.dead) deadT = +t.toFixed(1);
    });
    // arama: oyuncu görüş dışında (üs içinde, son görülen yerden 60 m ötede, iç duvar arkasında sayılmaz: sightR dışında)
    if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle);
    m.calm(); W.reset(); pl.god = true; sim(1);
    const lkp = { x: m.cx, z: m.cz };
    pl.pos.set(lkp.x, 0, lkp.z); m.startSearch(pl); pl.pos.set(z.x1 + 8, 0, m.cz); // duvarın dışında ama uyarı alanında: arama sürer
    const sd = () => m.soldiers.filter((s) => s.searching && !s.dead).map((s) => Math.hypot(s.pos.x - lkp.x, s.pos.z - lkp.z));
    const a0 = sd(); sim(10); const a1 = sd();
    const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    searching = a0.length; d0 = avg(a0); dMin = avg(a1); const closer = a0.filter((x, k) => a1[k] < x - 8).length;
    const stillSearch = !!m.search && !m.alert;
    const res = { closer, stillSearch, enterT, probes, gaps, soldiers: soldiers.length, gateWarn, tl: tl.join(''), firstShot, shots, alarmT, fightT, searching, d0: Math.round(d0), dMin: Math.round(dMin), deadT, hp: Math.round(pl.hp), lvl: W.level, inside: Math.round(z.z1 - car.pos.z) };
    pl.god = true; if (pl.dead) pl.dead = false;
    if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle);
    m.calm(); W.reset();
    return res;
  });
  console.log('kışla:', JSON.stringify(r));
  check(r.gaps === 0, `Çevre duvarı kesintisiz (${r.probes} ışından ${r.gaps} boşluk)`);
  check(r.gateWarn, 'Nizamiyede "Dur! Burası askerî bölge" uyarısı');
  check(r.inside >= 15, `Araç nizamiyeden içeri girdi (${r.inside} m)`);
  check(r.firstShot < 0 || r.firstShot >= 10, `İlk 10 sn oyuncuya ateş yok (ilk atış ${r.firstShot} sn)`);
  check(r.alarmT - r.enterT >= 14 && r.alarmT - r.enterT <= 16, `Alarm + arama girişten ~15 sn sonra (giriş ${r.enterT}, alarm ${r.alarmT} sn)`);
  check(r.closer >= 3 && r.dMin < r.d0 && r.stillSearch, `Arama (oyuncu görünmezken): ${r.closer}/${r.searching} asker 10 sn'de son görülen yere 8 m+ yaklaştı (ort. ${r.d0} → ${r.dMin} m), çatışma yok`);
  check(r.fightT >= r.alarmT, `Çatışma alarmla/aramadan sonra, asker görünce: ${r.fightT} sn`);
  check(r.deadT < 0 || r.fightT < 0 || r.deadT - r.fightT > 10, `Çatışmanın ilk 10 sn'sinde ölüm yok (ölüm ${r.deadT}, can ${r.hp})`);
  console.log('KONSOL HATALARI:', errs.length);
  for (const e of errs.slice(0, 10)) console.log('  ', e.slice(0, 300));
  console.log(fails.length ? `BAŞARISIZ: ${fails.length}` : 'TÜMÜ BAŞARILI');
  if (errs.length || fails.length) process.exitCode = 1;
};
