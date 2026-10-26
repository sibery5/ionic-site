const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  await p.evaluate(() => sim(2));
  console.log('start', JSON.stringify(await p.evaluate(() => info())));
  const sl = await p.evaluate(async () => { game.wanted.reset(); game.state.money = 12345; await game.saveGame('1'); game.state.money = 0; await game.loadGame('1'); return { money: game.state.money, mode: game.mode, props: Array.isArray(game.state.properties) }; });
  console.log('saveload', JSON.stringify(sl));
  await p.evaluate(() => { game.player.takeDamage(9999, null, 'bullet'); });
  console.log('dead', JSON.stringify(await p.evaluate(() => info())));
  await p.waitForTimeout(6000);
  await p.evaluate(() => sim(0.2));
  console.log('respawn', JSON.stringify(await p.evaluate(() => info())));
};
