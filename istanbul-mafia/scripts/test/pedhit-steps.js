// [hareket M8 + H3] Araçla yayaya çarpma: 20 sn'de 10 yayaya 12 m/s çarpma; adım süresi p95 / en kötü kare
// (güncelleme + çizim), alt adım süreleri (HIT_STATS), tepki türü ve savrulma mesafesi, gövdeye girme.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/pedhit $PWD/scripts/test/pedhit-steps.js
// SPEEDS=3,7,12 ile hız başına tepki denetimi (varsayılan da bu); RENDER=0 çizimi atlar.
const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  let fail = 0;
  const check = (name, ok, info) => { console.log((ok ? 'OK   ' : 'FAIL ') + name, info !== undefined ? JSON.stringify(info) : ''); if (!ok) fail++; };
  const render = process.env.RENDER !== '0';
  const r = await p.evaluate((render) => {
    const g = game, pl = g.player;
    pl.god = true; g.wanted.reset && g.wanted.reset();
    // düz yol kesiti: oyuncuya yakın, en az 40 m uzun kenar
    let s = null;
    for (let k = 0; k < 200 && !s; k++) { const c = g.map.randomEdgeNear(pl.pos.x, pl.pos.z, 20, 400); if (c && Math.hypot(c.e.a.x - c.e.b.x, c.e.a.z - c.e.b.z) > 40 && c.e.width >= 10) s = c; }
    const dx = s.e.b.x - s.e.a.x, dz = s.e.b.z - s.e.a.z, l = Math.hypot(dx, dz), fx = dx / l, fz = dz / l;
    const cx = (s.e.a.x + s.e.b.x) / 2, cz = (s.e.a.z + s.e.b.z) / 2, hd = Math.atan2(fx, fz);
    for (const n of g.npcs.list.slice()) if (Math.hypot(n.pos.x - cx, n.pos.z - cz) < 60) g.npcs.remove(n);
    for (const v of g.vehicles.list.slice()) if (v.kind === 'car' && Math.hypot(v.pos.x - cx, v.pos.z - cz) < 60) g.vehicles.remove(v);
    const car = g.vehicles.add('sedan', cx - fx * 12, cz - fz * 12, hd);
    g.enterVehicle(car, true); pl.god = true;
    const res = { frames: [], upd: [], rnd: [], peds: [] };
    const runAt = (spd, nPed, sec, gap) => {
      const peds = [];
      let next = 0.4, spawned = 0;
      for (let i = 0; i < sec * 30; i++) {
        const t = i / 30;
        if (spawned < nPed && t >= next) {
          next += gap;
          const n = g.npcs.add('civilian', car.pos.x + fx * (car.def.len / 2 + 2.5), car.pos.z + fz * (car.def.len / 2 + 2.5), null, {});
          if (n) { n.state = 'idle'; n.heading = hd + Math.PI / 2; peds.push({ n, hit: false }); spawned++; }
        }
        // araç sabit hızla gider, yol kesitinde kalır (her karede geri sarılır)
        car.vx = fx * spd; car.vz = fz * spd; car.heading = hd; car.yawRate = 0;
        car.pos.x = cx - fx * 12; car.pos.z = cz - fz * 12; car.prevX = car.pos.x - fx * spd / 30; car.prevZ = car.pos.z - fz * spd / 30;
        const t0 = performance.now(); sim(1 / 30); const t1 = performance.now();
        if (render) g.render();
        const t2 = performance.now();
        res.upd.push(t1 - t0); res.rnd.push(t2 - t1); res.frames.push(t2 - t0);
        for (const q of peds) {
          const n = q.n, F = n.flight;
          if (F) { q.hit = true; q.mode = F.mode; q.maxY = Math.max(q.maxY || 0, n.pos.y - car.pos.y); q.inCar = F.inCar; }
          // gövdenin içinde mi (yerel OBB, yarıçapsız)
          const ddx = n.pos.x - car.pos.x, ddz = n.pos.z - car.pos.z, lx = ddx * fz - ddz * fx, lz = ddx * fx + ddz * fz;
          if (Math.abs(lx) < car.def.wid / 2 - 0.05 && Math.abs(lz) < car.def.len / 2 - 0.05 && n.pos.y < car.pos.y + (car.def.hei || 1.4) - 0.3) q.inside = (q.inside || 0) + 1;
        }
      }
      sim(1.5);
      return peds.map((q) => ({ hit: q.hit || !!q.n.lastFlight || q.n.kdT > 0 || q.n.hp < q.n.maxHp, mode: q.mode || (q.n.lastFlight && q.n.lastFlight.mode) || 'stagger', dist: q.n.lastFlight ? +q.n.lastFlight.dist.toFixed(1) : null, maxY: +(q.maxY || 0).toFixed(2), inside: q.inside || 0, dead: q.n.dead, kd: q.n.kdT > 0 || !!q.n.model.kd }));
    };
    const pct = (a, k) => { const b = a.slice().sort((x, y) => x - y); return +b[Math.min(b.length - 1, Math.floor(b.length * k))].toFixed(1); };
    // ısınma (ilk çizimler) ölçüme girmesin
    runAt(0.0, 0, 1, 9); res.frames.length = res.upd.length = res.rnd.length = 0;
    // 20 sn'de 10 yaya, 12 m/s
    const p12 = runAt(12, 10, 20, 1.9);
    res.m = { n: res.frames.length, p50: pct(res.frames, 0.5), p95: pct(res.frames, 0.95), worst: pct(res.frames, 1), upd95: pct(res.upd, 0.95), updWorst: pct(res.upd, 1), rnd95: pct(res.rnd, 0.95), rndWorst: pct(res.rnd, 1) };
    res.p12 = p12;
    res.p7 = runAt(7, 3, 6, 1.9);
    res.p3 = runAt(3, 3, 6, 1.9);
    return res;
  }, render).catch((e) => ({ err: e.message }));
  if (r.err) { console.log('HATA', r.err); console.log('SONUÇ: FAIL'); return; }
  const hs = await p.evaluate(() => (window.__hitStats ? window.__hitStats() : null));
  console.log('ÖLÇÜM', JSON.stringify(r.m), 'alt adım', JSON.stringify(hs));
  console.log('12 m/s', JSON.stringify(r.p12)); console.log('7 m/s', JSON.stringify(r.p7)); console.log('3 m/s', JSON.stringify(r.p3));
  const h12 = r.p12.filter((q) => q.hit);
  check('M8 20 sn\'de 10 yayaya 12 m/s çarpıldı', h12.length >= 9, h12.length);
  check('M8 adım süresi p95 ve en kötü kare (güncelleme) makul: en kötü < 3×p95 + 15 ms', r.m.updWorst < r.m.upd95 * 3 + 15, r.m);
  check('H3 12 m/s: savrulma 4–9 m', h12.length && h12.every((q) => q.mode === 'fly' && q.dist >= 4 && q.dist <= 9), h12.map((q) => q.mode + ':' + q.dist));
  check('H3 7 m/s: kaputa yatıp yana yuvarlanma', r.p7.filter((q) => q.hit).every((q) => q.mode === 'hood' && q.maxY > 0.5) && r.p7.some((q) => q.hit), r.p7.map((q) => q.mode + ':' + q.maxY));
  check('H3 3 m/s: sendeleme (düşmez)', r.p3.some((q) => q.hit) && r.p3.every((q) => q.mode === 'stagger' && !q.kd), r.p3.map((q) => q.mode + ':' + q.kd));
  const ins = [...r.p12, ...r.p7, ...r.p3].reduce((a, q) => a + q.inside, 0);
  check('H3 yaya gövdenin içinden geçmez (içeride kare)', ins === 0, ins);
  console.log('SONUÇ: ' + (fail ? 'FAIL ' + fail : 'OK'));
};
