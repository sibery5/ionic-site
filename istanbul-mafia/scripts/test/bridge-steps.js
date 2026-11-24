// Köprü testi: trafiği temizleyip oyuncu aracıyla Boğaz ve Galata köprülerinden geçiş (yükseltilmiş tabliye)
const H = require('./harness.js');
module.exports = async (p) => {
  await H.start(p); await H.install(p);
  const run = (sx, sz, h, axis, end) => p.evaluate(({ sx, sz, h, axis, end }) => {
    const pl = game.player;
    if (pl.vehicle) game.vehicles.ejectDriver(pl.vehicle);
    game.vehicles.clear(); game.vehicles.spawnT = 999;
    const v = game.vehicles.add('sedan', sx, sz, h); game.enterVehicle(v, true);
    let maxY = 0, reached = false;
    // [deniz] D2: geçişte darbe sesleri (derz) ve tabliyede ayak sesi yüzeyi
    const A = game.audio; A.sfxStats = {}; const c0 = axis === 'x' ? v.pos.x : v.pos.z;
    let metal = 0; for (let i = 0; i <= 60; i++) { const u = sx + (axis === 'x' ? (end - sx) * i / 60 : 0), w = sz + (axis === 'z' ? (end - sz) * i / 60 : 0); if (game.combat.surfaceAt(u, w) === 'metal') metal++; }
    hold('KeyW', true);
    sim(14, () => {
      maxY = Math.max(maxY, v.pos.y);
      const c = axis === 'x' ? v.pos.x : v.pos.z;
      if (c > end) reached = true;
      // şerit ortasında tut
      const lat = axis === 'x' ? -(v.pos.z - sz) : (v.pos.x - sx);
      v.controls.steer = Math.max(-1, Math.min(1, lat * 0.2 - Math.sin(v.heading - h) * 3));
      if (reached) hold('KeyW', false);
    });
    hold('KeyW', false);
    const dist = Math.abs((axis === 'x' ? v.pos.x : v.pos.z) - c0), joints = (A.sfxStats && A.sfxStats.bridgeJoint) || 0;
    return { joints, mPerJoint: joints ? +(dist / joints).toFixed(0) : null, metalSteps: metal, maxY: +maxY.toFixed(1), reached, end: [+v.pos.x.toFixed(0), +v.pos.y.toFixed(1), +v.pos.z.toFixed(0)], sinking: v.sinking, hp: Math.round(v.hp) };
  }, { sx, sz, h, axis, end });
  const b = await run(150, -453, Math.PI / 2, 'x', 450), gl = await run(-152, 30, 0, 'z', 210);
  console.log('bosphorus', JSON.stringify(b));
  console.log('galata', JSON.stringify(gl));
  for (const [n, r] of [['bosphorus', b], ['galata', gl]]) {
    const ok = r.metalSteps === 0 && r.joints >= 1 && r.joints <= 2 && r.mPerJoint >= 20;
    console.log((ok ? 'OK   ' : 'FAIL ') + n + ': darbe sesi yalnız gerçek derzlerde (≥ 20 m arayla), tabliyede metalik ayak sesi yok', JSON.stringify([r.joints, r.mPerJoint, r.metalSteps]));
  }
};
