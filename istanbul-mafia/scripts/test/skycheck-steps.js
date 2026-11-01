// Gökyüzü/deniz kontrol görüntüleri: öğle sokak, Boğaz gün batımı
const H = require('./harness.js');
const shot = async (p, path) => { await p.evaluate(() => game.render()); await p.screenshot({ path, timeout: 600000 }); console.log('shot', path); };
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  await p.evaluate(() => { if (game.env.setWeather) game.env.setWeather('clear'); game.env.time = 12; sim(3); const pl = game.player; pl.camPitch = -0.05; pl.camYaw = pl.heading; pl.camDist = 6; sim(0.3); });
  await shot(p, out + '-noon.png');
  await p.evaluate(() => { const pl = game.player; pl.pos.set(190, 0, -380); pl.camYaw = Math.PI * 0.75; pl.camPitch = 0.08; pl.camDist = 8; game.env.time = 18.2; sim(2); });
  await shot(p, out + '-bosphorus.png');
};
