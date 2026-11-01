const H = require('./harness.js');
module.exports = async (p) => {
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => { const q = []; game.physics.active.query(-162, 50, -138, 95, q);
    return q.filter(b => b.tag !== 'bridgeDeck').map(b => [typeof b.tag === 'string' ? b.tag : 'obj', +b.x0.toFixed(1), +b.z0.toFixed(1), +b.x1.toFixed(1), +b.z1.toFixed(1), +b.y0.toFixed(1), +b.y1.toFixed(1), b.shape || '']); });
  console.log('cols', JSON.stringify(r));
};
