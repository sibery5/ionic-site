const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => { sim(1); const v = game.vehicles.list.filter(v => v.mission === 'prop').map(v => v.type); return { props: v.length, types: [...new Set(v)] }; });
  console.log('military', JSON.stringify(r));
};
