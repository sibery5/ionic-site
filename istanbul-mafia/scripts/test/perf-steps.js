// Fizik/YZ CPU profili: sakin şehir + kalabalık çatışma senaryosunda kare başına ms (sim adımı).
//   SETTINGS='{"quality":"low"}' node scripts/test/play.js file://$PWD/app/index.html /tmp/out $PWD/scripts/test/perf-steps.js
const H = require('./harness.js');
module.exports = async (p) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  const res = await p.evaluate(() => {
    const g = game;
    g.loop = () => {};
    g.player.god = true;
    // ölçüm sarmalayıcıları
    const acc = {};
    const wrap = (obj, fn, name) => { const o = obj[fn].bind(obj); acc[name] = 0; obj[fn] = (...a) => { const t = performance.now(); const r = o(...a); acc[name] += performance.now() - t; return r; }; };
    wrap(g.npcs, 'update', 'npcs');
    wrap(g.vehicles, 'update', 'vehicles');
    wrap(g.combat, 'update', 'combat');
    wrap(g.wanted, 'update', 'wanted');
    wrap(g.player, 'update', 'player');
    const measure = (sec, fn) => {
      for (const k in acc) acc[k] = 0;
      const n = Math.round(sec * 30);
      const t0 = performance.now();
      sim(sec, fn);
      const tot = performance.now() - t0;
      const o = { total: +(tot / n).toFixed(3) };
      for (const k in acc) o[k] = +(acc[k] / n).toFixed(3);
      o.npcs_n = g.npcs.list.length; o.cars_n = g.vehicles.list.length;
      return o;
    };
    sim(8);
    // kalabalık: ek siviller ve trafik
    const pl = g.player;
    for (let i = 0; i < 25; i++) g.npcs.spawnCivilian(pl.pos.x, pl.pos.z);
    for (let i = 0; i < 25; i++) g.vehicles.spawnTraffic(pl.pos.x, pl.pos.z);
    sim(2);
    const calm = measure(10);
    // çatışma: 3 yıldız + düşman çete grubu + ateş eden oyuncu
    g.wanted.set(3);
    const f = { x: Math.sin(pl.heading), z: Math.cos(pl.heading) };
    for (let i = 0; i < 10; i++) { const n = g.npcs.add('gang', pl.pos.x + f.x * 18 + (i % 5) * 2, pl.pos.z + f.z * 18 + Math.floor(i / 5) * 2, null, { hostile: true, state: 'idle' }); n.engage(pl); }
    for (const n of g.npcs.list) if (n.faction === 'civilian' && !n.dead) n.hearThreat(pl, 5);
    const fight = measure(10, (i) => { if (i % 6 === 0) { pl.fireCd = 0; g.wanted.onPlayerNoise && g.wanted.onPlayerNoise(pl.pos.x, pl.pos.z); } });
    return { calm, fight };
  });
  console.log('perf', JSON.stringify(res));
};
