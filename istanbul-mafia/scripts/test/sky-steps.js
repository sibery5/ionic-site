// Gökyüzü parlaklık denetimi: öğle / gün batımı / gece (açık) + öğle (kapalı) ve gece sokağı ölçümü.
// Ekranın üst %35'i (gök) ve alt %40'ı (zemin) için ortalama ekran parlaklığı (0-255, Rec.709) ve doygunluk.
//   SETTINGS='{"quality":"low"}' node scripts/test/play.js file://$PWD/app/index.html $PWD/.testout/sky $PWD/scripts/test/sky-steps.js
// SHOT=1: gece sokağı ekran görüntüsü (<out>-night.png)
const H = require('./harness.js');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  await p.evaluate(() => {
    game.loop = () => {};
    game.player.god = true;
    game.perf.scale = 0.5; game.applyPixelRatio();
    const cv = document.createElement('canvas'), g2 = cv.getContext('2d', { willReadFrequently: true });
    window.measure = () => {
      game.render(); const s = game.renderer.domElement; cv.width = s.width; cv.height = s.height; g2.drawImage(s, 0, 0);
      const d = g2.getImageData(0, 0, cv.width, cv.height).data, W = cv.width, Hh = cv.height;
      const reg = (y0, y1) => { let L = 0, S = 0, n = 0; for (let y = Math.floor(y0 * Hh); y < Math.floor(y1 * Hh); y += 2) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2]; L += 0.2126 * r + 0.7152 * g + 0.0722 * b; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); S += mx ? (mx - mn) / mx : 0; n++; } return { lum: +(L / n).toFixed(1), sat: +(S / n).toFixed(2) }; };
      return { sky: reg(0, 0.35), ground: reg(0.6, 1) };
    };
  });
  if (process.env.KILL) await p.evaluate((k) => { window.__kill = k; }, process.env.KILL);
  const cases = [['noon', 12, 'clear'], ['sunset', 17.9, 'clear'], ['night', 23, 'clear'], ['noonOvercast', 12, 'overcast'], ['nightRain', 23, 'rain']];
  for (const [name, t, w] of cases.filter((c) => !process.env.CASES || process.env.CASES.split(',').includes(c[0]))) {
    const r = await p.evaluate(([t, w]) => {
      const e = game.env; e.setWeather(w, true); e.time = t; e.timeScale = 0; e.forceWet = undefined;
      const pl = game.player, nd = game.map.nearestNode(-300, -60); pl.pos.set(nd.x + 2, 0, nd.z + 2); pl.camYaw = 0; pl.camPitch = 0.05;
      sim(1.2);
      if (window.__kill) { const u = game.env.skyMat.uniforms; if (__kill.includes('moon')) { u.uMoonK.value = 0; game.env.update = () => {}; } if (__kill.includes('stars')) { u.uStars.value = 0; game.env.update = () => {}; } if (__kill.includes('lights')) game.nightLights.update = () => {}, game.nightLights.points.forEach((q) => { q.light.intensity = 0; }), game.nightLights.spots.forEach((q) => { q.light.intensity = 0; }); }
      const m = measure();
      return { ...m, exposure: +game.renderer.toneMappingExposure.toFixed(2), sun: +e.sun.intensity.toFixed(2), hemi: +e.hemi.intensity.toFixed(2), moonPhase: +game.env.moonFrac.toFixed(2), lightsOn: game.nightLights.points.filter((q) => q.light.intensity > 0.5).length };
    }, [t, w]);
    console.log('sky', name, JSON.stringify(r));
  }
  if (process.env.SHOT) {
    await p.evaluate(() => { const e = game.env; e.setWeather('clear', true); e.time = 22.5; const pl = game.player, nd = game.map.nearestNode(-300, -60); pl.pos.set(nd.x + 2, 0, nd.z + 2); pl.camYaw = 0; pl.camPitch = 0.12; game.ui.hideBanner && game.ui.hideBanner(); sim(1.5); game.perf.scale = 1; game.applyPixelRatio(); });
    await H.shot(p, out + '-night.png');
  }
  // MILSHOT=1: askerî üs (gece, projektörler) kuşbakışı — <out>-military.png
  if (process.env.MILSHOT) {
    await p.evaluate(() => {
      const e = game.env; e.setWeather('clear', true); e.time = 20.6; const pl = game.player; pl.pos.set(-760, 0, -740); sim(1);
      game.perf.scale = 1; game.applyPixelRatio();
      const c = game.camera; c.position.set(-700, 95, -690); c.lookAt(-850, 0, -890); c.updateMatrixWorld();
      game.nightLights.update(0.1, c.position);
      if (game.city.updateCamera) game.city.updateCamera(c);
    });
    await H.shot(p, out + '-military.png');
  }
};
