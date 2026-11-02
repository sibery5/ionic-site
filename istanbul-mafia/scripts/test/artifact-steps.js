// Yolda "hareket eden şey" teşhisi: kamera sabit, yalnız bir etken değiştirilerek iki kare çizilir ve
// piksel farkı ölçülür (zaman/su, gölge kamerası kayması). Çıktı: değişen piksel yüzdesi (alt %45 = zemin).
//   SETTINGS='{"quality":"medium"}' node scripts/test/play.js file://$PWD/app/index.html $PWD/.testout/art $PWD/scripts/test/artifact-steps.js
const H = require('./harness.js');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  await p.evaluate(() => {
    game.loop = () => {};
    game.env.setWeather('clear', true); game.env.time = 15; game.env.timeScale = 0;
    const pl = game.player; pl.god = true;
    pl.pos.set(-120, 0, 40); pl.heading = 0; pl.camYaw = Math.PI * 0.75; pl.camPitch = 0.35;
    sim(1.5);
    game.perf.scale = 0.4; game.applyPixelRatio();
    // film greni her karede değişir: ölçüm için kapat
    const pu = game.postfx.update.bind(game.postfx); game.postfx.update = (...a) => { pu(...a); if (game.grade.uniforms.uGrain) game.grade.uniforms.uGrain.value = 0; };
    const cv = document.createElement('canvas'), g2 = cv.getContext('2d', { willReadFrequently: true });
    window.grab = () => { game.render(); const s = game.renderer.domElement; cv.width = s.width; cv.height = s.height; g2.drawImage(s, 0, 0); return g2.getImageData(0, 0, cv.width, cv.height); };
    window.diff = async (A, B) => {
      const da = A.data, db = B.data, c = A;
      let n = 0, tot = 0; const y0 = Math.floor(c.height * 0.55);
      for (let y = y0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; tot++; if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) n++; }
      return +(100 * n / tot).toFixed(3);
    };
    // fark haritası: değişen pikseller kırmızı, gerisi soluk görüntü
    window.diffImg = (A, B) => {
      const c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const g = c.getContext('2d');
      const o = g.createImageData(A.width, A.height), da = A.data, db = B.data, d = o.data;
      for (let i = 0; i < da.length; i += 4) { const ch = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24; d[i] = ch ? 255 : da[i] * 0.5; d[i + 1] = ch ? 0 : da[i + 1] * 0.5; d[i + 2] = ch ? 0 : da[i + 2] * 0.5; d[i + 3] = 255; }
      g.putImageData(o, 0, 0); return c.toDataURL('image/png');
    };
  });
  const r = await p.evaluate(async () => {
    const res = {};
    const sm = game.renderer.shadowMap;
    res.shadowsOn = sm.enabled;
    { sm.needsUpdate = true; const a0 = grab(); sm.needsUpdate = true; const b0 = grab(); res.baseline = await diff(a0, b0); }
    const time = (v) => { game.city.waterMat.uniforms.uTime.value = v; };
    // 1) yalnız zaman (su dalgaları + zamanla oynayan şader animasyonları)
    sm.needsUpdate = true; time(100); const a = grab();
    sm.needsUpdate = true; time(100.7); const b = grab();
    res.timeOnly = await diff(a, b);
    game.city.water.visible = false;
    sm.needsUpdate = true; time(100); const a2 = grab();
    sm.needsUpdate = true; time(100.7); const b2 = grab();
    res.timeNoWater = await diff(a2, b2);
    game.city.water.visible = true; time(100);
    // 2) odak (oyuncu) birkaç cm ilerler → güneş/gölge kamerası onu izler; sahne sabit. Eski (noSnap) ve yeni.
    const env = game.env;
    for (const mode of ['old', 'new']) {
      env.noSnap = mode === 'old';
      const f = game.player.pos.clone();
      const move = (dx) => { f.x += dx; f.z += dx * 0.37; env.update(0, f); env.sun.updateMatrixWorld(); env.sun.target.updateMatrixWorld(); };
      move(0); sm.needsUpdate = true; const c = grab();
      let worst = 0, sum = 0;
      for (let k = 0; k < 4; k++) { move(0.045); sm.needsUpdate = true; const d = grab(); const v = await diff(c, d); worst = Math.max(worst, v); sum += v; }
      res['walk_' + mode] = { mean: +(sum / 4).toFixed(3), worst };
      window['__img_' + mode] = diffImg(c, grab());
    }
    env.noSnap = false;
    return res;
  });
  console.log('artifact', JSON.stringify(r));
  const fs = require('fs');
  for (const m of ['old', 'new']) { const u = await p.evaluate((m) => window['__img_' + m], m); if (u) fs.writeFileSync(out + '-walk-' + m + '.png', Buffer.from(u.split(',')[1], 'base64')); }
  if (process.env.SHOT) await H.shot(p, out + '-view.png');
};
