const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  await p.evaluate(() => { game.env.time = 11.5; game.env.weather = 'clear'; game.env.weatherTimer = 9999; sim(3); const pl = game.player; pl.camPitch = 0.35; pl.camYaw = pl.heading + 0.8; pl.camDist = 7; sim(0.4); });
  console.log(JSON.stringify(await p.evaluate(() => ({ wet: game.env.wetness, uWet: game.uniforms.uWet && game.uniforms.uWet.value, sun: game.env.sun.intensity, sunY: game.env.sunDir.y, shadows: game.renderer.shadowMap.enabled, castSun: game.env.sun.castShadow }))));
  await p.evaluate(() => { game.env.sun.castShadow = false; game.scene.traverse(o => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => x.needsUpdate = true); } }); game.render(); });
  await p.screenshot({ path: out + '-noshadow.png', timeout: 600000 });
};
