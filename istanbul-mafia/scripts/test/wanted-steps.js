const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  await p.evaluate(() => sim(5));
  const r = await p.evaluate(() => {
    const pl = game.player; const n = game.npcs.list.filter(n => !n.dead && n.faction === 'civilian').sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos))[0];
    pl.pos.set(n.pos.x + 4, 0, n.pos.z); n.state = 'idle';
    for (let i = 0; i < 12; i++) { const o = pl.pos.clone(); o.y = 1.45; const d = n.pos.clone(); d.y += 1.2; d.sub(o).normalize(); pl.fireCd = 0; pl.reloadT = 0; pl.tryFire(o, d); sim(0.1); }
    const out = [game.wanted.level]; for (let k = 0; k < 4; k++) { sim(4); out.push(game.wanted.level); }
    return { dead: n.dead, wantedOverTime: out };
  });
  console.log('wanted', JSON.stringify(r));
};
