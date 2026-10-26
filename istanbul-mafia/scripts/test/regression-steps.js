const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  await p.evaluate(() => sim(8));
  // en yakın sivili vur
  const r = await p.evaluate(() => {
    const pl = game.player; const n = game.npcs.list.filter(n => !n.dead && n.faction === 'civilian').sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos))[0];
    if (!n) return 'no npc';
    pl.pos.set(n.pos.x + 4, 0, n.pos.z); n.state = 'idle'; n.home = null;
    const res = [];
    for (let i = 0; i < 12; i++) { const o = pl.pos.clone(); o.y = 1.45; const d = n.pos.clone(); d.y += 1.2; d.sub(o).normalize(); pl.fireCd = 0; pl.tryFire(o, d); sim(0.1); }
    return { dead: n.dead, hp: n.hp, wanted: game.wanted.level, kills: game.state.stats.kills, pickups: game.pickups.list.length };
  });
  console.log('shoot', JSON.stringify(r));
  await p.evaluate(() => sim(6));
  console.log('after6', JSON.stringify(await p.evaluate(() => info())), await p.evaluate(() => game.npcs.list.filter(n => n.faction === 'police').map(n => n.state).join(',')));
  // araç: en yakına bin ve sür
  const d = await p.evaluate(() => {
    game.wanted.reset(); const pl = game.player;
    const v = game.vehicles.list.filter(v => !v.destroyed).sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos))[0];
    pl.pos.set(v.pos.x + 2, 0, v.pos.z); game.enterVehicle(v);
    const start = v.pos.clone(); hold('KeyW', true); let maxS = 0; sim(5, () => { maxS = Math.max(maxS, v.fs); }); hold('KeyW', false);
    return { type: v.type, moved: +v.pos.distanceTo(start).toFixed(1), maxKmh: Math.round(maxS * 3.6), hp: Math.round(v.hp) };
  });
  console.log('drive', JSON.stringify(d));
  await p.evaluate(() => { game.player.camYaw = game.player.vehicle.heading; game.player.camPitch = 0.22; sim(0.5); });
  if (process.env.SHOTS === '1') await H.shot(p, out + '-drive.png');
  // kayıt / yükleme
  const sl = await p.evaluate(async () => { game.wanted.reset(); game.state.money = 12345; await game.saveGame('1'); game.state.money = 0; await game.loadGame('1'); return { money: game.state.money, mode: game.mode }; });
  console.log('saveload', JSON.stringify(sl));
  // ölüm
  await p.evaluate(() => { game.player.takeDamage(999, null, 'bullet'); });
  console.log('dead', JSON.stringify(await p.evaluate(() => info())));
  await p.waitForTimeout(5500);
  await p.evaluate(() => sim(0.2));
  console.log('respawn', JSON.stringify(await p.evaluate(() => info())));
};
