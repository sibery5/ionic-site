// "Yolda hareket eden şey" ikinci teşhis: zemindeki camgöbeği lekeler ıslaklık/su birikintisi mi, deniz mi?
// Aynı kamera: (a) normal, (b) deniz gizli, (c) ıslaklık 0. Fark yüzdeleri + görüntüler (<out>-a/b/c.png).
const H = require('./harness.js');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  const r = await p.evaluate(async () => {
    game.loop = () => {};
    game.env.setWeather('clear', true); game.env.time = 15; game.env.timeScale = 0;
    const pl = game.player; pl.god = true;
    pl.pos.set(-120, 0, 40); pl.heading = 0; pl.camYaw = Math.PI * 0.75; pl.camPitch = 0.35;
    sim(1.5);
    game.perf.scale = 0.4; game.applyPixelRatio();
    const pu = game.postfx.update.bind(game.postfx); game.postfx.update = (...a) => { pu(...a); if (game.grade.uniforms.uGrain) game.grade.uniforms.uGrain.value = 0; };
    const cv = document.createElement('canvas'), g2 = cv.getContext('2d', { willReadFrequently: true });
    const grab = () => { game.render(); const s = game.renderer.domElement; cv.width = s.width; cv.height = s.height; g2.drawImage(s, 0, 0); return { img: g2.getImageData(0, 0, cv.width, cv.height) }; };
    const diff = (A, B) => { let n = 0; const a = A.img.data, b = B.img.data; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++; return +(100 * n / (a.length / 4)).toFixed(2); };
    const info = { wet: +game.uniforms.uWet.value.toFixed(3), rain: +game.uniforms.uRain.value.toFixed(3), weather: game.env.weatherType, envWet: +game.env.wetness.toFixed(3) };
    const a = grab();
    game.city.water.visible = false; const b = grab(); game.city.water.visible = true;
    game.env.forceWet = 0; game.env.update(0, pl.pos); const c = grab();
    game.env.forceWet = undefined; game.env.update(0, pl.pos);
    return { info, waterHidden: diff(a, b), dry: diff(a, c) };
  });
  if (process.env.SHOT) {
    await p.evaluate(() => { game.perf.scale = 0.6; game.applyPixelRatio(); });
    await H.shot(p, out + '-before.png');
    await p.evaluate(() => { game.env.forceWet = 0; game.env.update(0, game.player.pos); });
    await H.shot(p, out + '-dry.png');
  }
  console.log('artifact2', JSON.stringify(r));
};
