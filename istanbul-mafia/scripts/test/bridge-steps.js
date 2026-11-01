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
    return { maxY: +maxY.toFixed(1), reached, end: [+v.pos.x.toFixed(0), +v.pos.y.toFixed(1), +v.pos.z.toFixed(0)], sinking: v.sinking, hp: Math.round(v.hp) };
  }, { sx, sz, h, axis, end });
  console.log('bosphorus', JSON.stringify(await run(150, -453, Math.PI / 2, 'x', 450)));
  console.log('galata', JSON.stringify(await run(-152, 30, 0, 'z', 210)));
};
