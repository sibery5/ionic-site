// Dağ: araç dağ yolundan zirveye çıkabiliyor mu, araç arazide yere oturuyor mu (gömülme/havada kalma), yaya yamaçtan yukarı yürüyebiliyor mu.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/dag $PWD/scripts/test/mountain-steps.js
const H = require('./harness.js');
module.exports = async (p) => {
  p.setDefaultTimeout(900000);
  await H.start(p); await H.install(p);
  const r = await p.evaluate(async () => {
    const g = game, pl = g.player;
    g.loop = () => {}; pl.god = true; g.vehicles.spawnT = 1e9;
    const { MOUNTAIN: M, terrainHeight } = window.__terrain || {};
    const T = M || (g.mountain && g.mountain.M);
    const out = {};
    if (!T || !T.road || !T.road.length) return { err: 'dağ verisi yok (window.__terrain)' };
    const road = T.road;
    // 1) araç: yolun başından zirveye doğru yol noktalarını izle
    const a = road[0], b = road[Math.min(4, road.length - 1)];
    const v = g.vehicles.add('suv', a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z)); g.enterVehicle(v, true); sim(0.3);
    let maxY = v.pos.y, idx = 0, off = 0, bad = 0;
    for (let k = 0; k < 900; k++) { // 30 sn
      while (idx < road.length - 1 && Math.hypot(road[idx].x - v.pos.x, road[idx].z - v.pos.z) < 9) idx++;
      const t = road[idx], want = Math.atan2(t.x - v.pos.x, t.z - v.pos.z);
      let d = want - v.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      hold('KeyW', true); hold('KeyA', d > 0.08); hold('KeyD', d < -0.08);
      sim(1 / 30);
      const th = terrainHeight(v.pos.x, v.pos.z);
      if (th !== null) { off = Math.max(off, Math.abs(v.pos.y - th)); if (Math.abs(v.pos.y - th) > 0.6) bad++; }
      if (v.pos.y > maxY) maxY = v.pos.y;
    }
    for (const k of ['KeyW', 'KeyA', 'KeyD']) hold(k, false);
    out.car = { startY: +a.y.toFixed(1), maxY: +maxY.toFixed(1), summitY: +T.summit.y.toFixed(1), roadIdx: idx, of: road.length, maxOffGround: +off.toFixed(2), badFrames: bad, kmh: Math.round(Math.hypot(v.vx, v.vz) * 3.6) };
    g.vehicles.ejectDriver(v); sim(0.5);
    // 2) yaya: yoldan uzak bir yamaçta zirveye doğru yürü
    const s = T.summit, px = s.x + 60, pz = s.z + 20, py = terrainHeight(px, pz);
    pl.pos.set(px, py === null ? 0 : py, pz); pl.vy = 0; sim(0.5);
    const y0 = pl.pos.y;
    pl.heading = pl.camYaw = Math.atan2(s.x - px, s.z - pz);
    hold('KeyW', true); hold('ShiftLeft', true); sim(10); hold('KeyW', false); hold('ShiftLeft', false);
    out.foot = { y0: +y0.toFixed(1), y1: +pl.pos.y.toFixed(1), moved: +Math.hypot(pl.pos.x - px, pl.pos.z - pz).toFixed(1) };
    return out;
  });
  console.log('dag', JSON.stringify(r));
  const ok = r.car && r.car.maxY > r.car.startY + 15 && r.car.badFrames < 30 && r.foot && r.foot.moved > 20;
  console.log(ok ? 'DAĞ TAMAM' : 'DAĞ KALDI');
};
