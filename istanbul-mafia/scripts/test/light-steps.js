const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  for (const t of [9, 12, 16, 17.4, 19, 22]) {
    const r = await p.evaluate((t) => { game.env.time = t; sim(0.5); const e = game.env; return { t, sun: +e.sun.intensity.toFixed(2), hemi: +e.hemi.intensity.toFixed(2), amb: +e.ambient.intensity.toFixed(2), exp: +game.renderer.toneMappingExposure.toFixed(2), night: +e.nightFactor.toFixed(2), sunY: +e.sunDir.y.toFixed(2), envI: game.scene.environmentIntensity }; }, t);
    console.log('light', JSON.stringify(r));
  }
};
