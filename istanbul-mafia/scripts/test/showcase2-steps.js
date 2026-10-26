const H = require('./harness.js');
const shot = async (p, path) => { await p.evaluate(() => game.render()); await p.screenshot({ path, timeout: 600000 }); console.log('shot', path); };
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  await p.evaluate(() => { game.env.time = 11.5; game.env.weather = 'clear'; game.env.weatherTimer = 9999; sim(5); const pl = game.player; pl.camPitch = 0.35; pl.camYaw = pl.heading + 0.8; pl.camDist = 7; sim(0.4); });
  await shot(p, out + '-noon.png');
  // Galata ve Haliç'e yukarıdan bakış
  await p.evaluate(() => { const pl = game.player; pl.pos.set(-60, 0, 40); pl.camYaw = Math.PI * 1.25; pl.camPitch = 0.55; pl.camDist = 40; game.env.time = 16; sim(1.5); });
  await shot(p, out + '-galata.png');
};
