const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  await p.evaluate(() => sim(6));
  console.log('smoke', JSON.stringify(await p.evaluate(() => ({ ...info(), ships: game.ships && game.ships.list ? game.ships.list.length : -1, lights: !!game.traffic, life: !!game.life }))));
  const lx = await p.evaluate(() => { const e = { id: 'atmaca', type: 'helicopter', name: 'Atmaca', color: '#111111' }; const v = game.spawnLuxury(e, 0); const b = game.spawnLuxury({ id: 'lodos', type: 'speedboat', name: 'Lodos', color: '#c81010' }, 0); sim(1); return { heli: !!v, boat: !!b }; });
  console.log('luxury', JSON.stringify(lx));
};
