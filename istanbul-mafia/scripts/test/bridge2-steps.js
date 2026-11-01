const H = require('./harness.js');
module.exports = async (p) => {
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const pl = game.player; const out = {};
    const v = game.vehicles.add('sedan', -152, 30, 0); game.enterVehicle(v, true);
    const q = []; game.physics.active.query(-160, 25, -144, 40, q);
    out.near = q.map(b => [b.tag && (typeof b.tag === 'string' ? b.tag : 'obj'), +b.x0.toFixed(1), +b.z0.toFixed(1), +b.x1.toFixed(1), +b.z1.toFixed(1), +b.y0.toFixed(1), +b.y1.toFixed(1)]).slice(0, 12);
    hold('KeyW', true); const tr = [];
    sim(6, (i) => { if (i % 30 === 0) tr.push([+v.pos.x.toFixed(1), +v.pos.y.toFixed(2), +v.pos.z.toFixed(1), +v.fs.toFixed(1), Math.round(v.hp)]); });
    hold('KeyW', false); out.trace = tr; out.ai = !!v.ai; out.driver = v.driver === pl;
    // Boğaz: tabliyede hasar
    const w = game.vehicles.add('sedan', 150, -453, Math.PI / 2); game.vehicles.ejectDriver(v); game.enterVehicle(w, true);
    hold('KeyW', true); const tr2 = [];
    sim(14, (i) => { if (i % 60 === 0) tr2.push([+w.pos.x.toFixed(0), +w.pos.y.toFixed(1), +w.pos.z.toFixed(1), Math.round(w.hp)]); });
    hold('KeyW', false); out.bos = tr2;
    return out;
  });
  console.log('dbg', JSON.stringify(r));
};
