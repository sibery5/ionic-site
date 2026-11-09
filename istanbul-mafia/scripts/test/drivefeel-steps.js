// Sürüş hissi ölçümleri (düz, açık alan): 0-100 km/s süresi, 100'den fren mesafesi, düşük hızda dönüş yarıçapı,
// yüksek hızda yanal ivme ve direksiyon tepkisi, el freniyle kayma açısı ve toparlanma, fren burun dalışı.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/df $PWD/scripts/test/drivefeel-steps.js
const H = require('./harness.js');
module.exports = async (p) => {
  p.setDefaultTimeout(900000);
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player;
    g.loop = () => {}; pl.god = true;
    g.vehicles.spawnT = 1e9; // trafik yok
    // en uzun geniş yol; yüzey asfalt, çarpışma kapalı (yalnız sürüş dinamiği ölçülür)
    let E = null; for (const e of g.map.edges) if (e.width >= 16 && (!E || e.len > E.len)) E = e;
    const H0 = Math.atan2(E.b.x - E.a.x, E.b.z - E.a.z), X = E.a.x + Math.sin(H0) * 10, Z = E.a.z + Math.cos(H0) * 10;
    if (g.combat.surfaceAt) g.combat.surfaceAt = () => 'concrete';
    if (g.env) g.env.rainAmount = 0;
    const R = { road: [Math.round(E.len), E.width] };
    const step = (n, fn) => { for (let i = 0; i < n; i++) { if (fn) fn(i); window.T += 1 / 30; g.dt = 1 / 30; g.updateGame(1 / 30, window.T); g.input.endFrame(); } };
    const fresh = (type) => {
      if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle);
      for (const v of g.vehicles.list.slice()) if (v.mission === 'df') g.vehicles.remove(v);
      const v = g.vehicles.add(type, X, Z, H0); v.mission = 'df'; v.noCollide = true; g.enterVehicle(v, true);
      for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space']) hold(k, false);
      step(3); v.pos.set(X, 0, Z); v.vx = v.vz = 0; v.heading = H0; v.yawRate = 0; v.spin = 0; v.steerAng = 0;
      return v;
    };
    const kmh = (v) => Math.hypot(v.vx, v.vz) * 3.6;
    const setV = (v, sp) => { v.vx = Math.sin(H0) * sp; v.vz = Math.cos(H0) * sp; v.fs = sp; };
    const pin = (v) => { const l = (v.pos.x - X) * Math.cos(H0) - (v.pos.z - Z) * Math.sin(H0); v.pos.x -= l * Math.cos(H0); v.pos.z += l * Math.sin(H0); };
    for (const type of ['sedan', 'gt', 'bus']) {
      if (!g.vehicles.list || !window.game) break;
      let v;
      try { v = fresh(type); } catch (e) { R[type] = 'yok: ' + e.message; continue; }
      const o = {};
      // 0-100
      hold('KeyW', true); let t = 0; while (kmh(v) < 100 && t < 30) { step(1); t += 1 / 30; v.heading = H0; v.yawRate = 0; }
      o.t100 = +t.toFixed(2);
      // 100'den fren
      let pitchMin = 0; hold('KeyW', false); hold('KeyS', true);
      const x0 = v.pos.x, z0 = v.pos.z; t = 0; while (v.fs > 0.5 && t < 15) { step(1); t += 1 / 30; v.heading = H0; v.yawRate = 0; pitchMin = Math.max(pitchMin, Math.abs(v.pitch)); }
      hold('KeyS', false);
      o.brake100 = +Math.hypot(v.pos.x - x0, v.pos.z - z0).toFixed(1); o.brakeT = +t.toFixed(2); o.dive = +pitchMin.toFixed(3);
      // düşük hız dönüş: 10 m/s, tam direksiyon -> yarıçap
      v = fresh(type); setV(v, 10);
      const keep = (s) => () => { const d = s - v.fs; hold('KeyW', d > 0.3); hold('KeyS', false); };
      hold('KeyA', true); let rs = 0, rn = 0; step(60, (i) => { keep(10)(); if (i >= 30 && Math.abs(v.yawRate) > 1e-3) { rs += Math.abs(v.fs / v.yawRate); rn++; } });
      o.r10 = +(rs / Math.max(1, rn)).toFixed(1);
      hold('KeyA', false);
      // yüksek hız: 30 m/s, tam direksiyon -> yanal ivme, kayma
      v = fresh(type); setV(v, 30);
      let latMax = 0, lsMax = 0; hold('KeyA', true);
      step(45, (i) => { keep(30)(); latMax = Math.max(latMax, Math.abs(v.fs * v.yawRate)); lsMax = Math.max(lsMax, Math.abs(v.ls)); });
      hold('KeyA', false); hold('KeyW', false);
      o.lat30 = +(latMax / 9.81).toFixed(2); o.ls30 = +lsMax.toFixed(2);
      // direksiyon tepkisi: 20 m/s'de tam direksiyondan 0.25 sn sonra yaw (anlık sıçrama ölçüsü)
      v = fresh(type); setV(v, 20); hold('KeyD', true); step(8, keep(20)); o.yaw025 = +Math.abs(v.yawRate).toFixed(3); hold('KeyD', false);
      // el freni: 20 m/s, direksiyon + el freni 1 sn, sonra bırak -> kayma açısı ve toparlanma süresi
      v = fresh(type); setV(v, 20); hold('KeyA', true); hold('Space', true);
      let slipMax = 0; step(30, () => { slipMax = Math.max(slipMax, Math.atan2(Math.abs(v.ls), Math.max(1, Math.abs(v.fs))) * 57.3); });
      hold('Space', false); hold('KeyA', false);
      let rec = 0; while (Math.abs(v.ls) > 1 && rec < 5) { step(1); rec += 1 / 30; }
      o.hbSlip = +slipMax.toFixed(1); o.hbRecover = +rec.toFixed(2); o.hbSpeed = +kmh(v).toFixed(0);
      R[type] = o;
    }
    if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle);
    return R;
  });
  console.log('drivefeel', JSON.stringify(r));
};
