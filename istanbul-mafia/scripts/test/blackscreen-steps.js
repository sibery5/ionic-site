// Siyah ekran regresyonu. Kök neden: HDR tamponda tek bir Inf/NaN piksel (yarı-float taşması: çok parlak eklemeli
// yüzey, yüzeye yapışık ışık) parlama bulanıklığıyla dev bir dikdörtgene yayılır, ton eşleme bunu siyaha çevirir.
// Temizleme geçişi (postfx.clean) açıkken ekran kararmamalı; kapalıyken kararma oranı kanıt olarak yazdırılır.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 node scripts/test/play.js file://$PWD/app/index.html .testout/bs $PWD/scripts/test/blackscreen-steps.js
const H = require('./harness.js');
module.exports = async (p) => {
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const g = game;
    g.env.time = 13; g.env.update(0.01, g.camera.position); sim(0.5);
    if (g.bloom) g.bloom.enabled = true; // düşük kalitede kapalı gelir; hata parlama açıkken oluşur
    const measure = () => {
      g.render();
      const gl = g.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b);
      let k = 0;
      for (let i = 0; i < b.length; i += 4) if (Math.max(b[i], b[i + 1], b[i + 2]) < 8) k++;
      return +(k / (w * h)).toFixed(3);
    };
    const base = measure();
    // helikopter projektör lekesini oyuncunun ayağına koy ve taşacak kadar parlat (eklemeli, 1e7 → Inf)
    g.wanted.spawnHeli(); const hh = g.wanted.heli, P = g.player.pos;
    hh.spot.material.color.setScalar(1e7); hh.spot.material.opacity = 1; hh.spot.visible = true;
    hh.spot.position.set(P.x, P.y + 0.3, P.z); hh.spot.updateMatrixWorld(true);
    const clean = g.postfx.clean;
    clean.enabled = false; const off = measure();
    clean.enabled = true; const on = measure();
    return { base, off, on, hasClean: !!clean };
  });
  console.log('blackscreen', JSON.stringify(r));
  if (!r.hasClean || r.on > r.base + 0.05) throw new Error('blackscreen FAIL: temizleme açıkken ekran karardı');
  console.log('blackscreen OK (siyah piksel oranı — temel ' + r.base + ', temizleme kapalı ' + r.off + ', açık ' + r.on + ')');
};
