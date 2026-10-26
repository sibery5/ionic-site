// Birleşik sürümden vitrin ekran görüntüleri
const H = require('./harness.js');
const shot = async (p, path) => { await p.evaluate(() => game.render()); await p.screenshot({ path, timeout: 600000 }); console.log('shot', path); };
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  await p.evaluate(() => { game.env.time = 17.4; game.env.weather = 'clear'; game.env.weatherTimer = 9999; sim(4); const pl = game.player; pl.camPitch = 0.12; pl.camYaw = pl.heading; sim(0.3); });
  await shot(p, out + '-street.png');
  await p.evaluate(() => { game.env.time = 21.5; sim(3); });
  await shot(p, out + '-night.png');
};
