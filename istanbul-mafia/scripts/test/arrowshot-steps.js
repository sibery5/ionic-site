// [O4] Fotoğraftaki sahne: Taksim çay ocağı, Cin Ali hedef. Oyuncu Ali'ye 12 m ve 5 m uzaktayken omuz üstü görüntü + okun ekran oranı.
//   SETTINGS='{"quality":"low"}' OUT=docs/galeri node scripts/test/play.js file://$PWD/app/index.html .testout/ok $PWD/scripts/test/arrowshot-steps.js
const path = require('path');
const H = require('./harness.js');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  const dir = process.env.OUT || out;
  for (const d of [12, 5]) {
    const r = await p.evaluate((d) => {
      const g = game, M = g.missions, pl = g.player;
      g.loop = () => {}; pl.god = true; g.env.time = 15;
      if (!M.active || M.active.id !== 'eski_dost') M.start(M.STORY.find((x) => x.id === 'eski_dost'), { replay: true });
      sim(0.5);
      const a = M.data.ali; a.static = true;
      // oyuncu sokak tarafında, yüzü Ali'ye (çay ocağına) dönük: kamera arkada, sokakta (duvara sıkışmaz)
      const c = M.special('cafe', -40, -260), dn = c.door, ox = dn.nx || 0, oz = dn.nz || 1;
      pl.pos.set(a.pos.x + ox * d, a.pos.y, a.pos.z + oz * d);
      const yaw = Math.atan2(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z); pl.heading = pl.camYaw = yaw; pl.camPitch = 0.12; pl.camInit = false;
      sim(3);
      const A = g.ui.guide.arrows.find((x) => x.visible);
      let frac = 0;
      if (A) { g.camera.updateMatrixWorld(); const v = A.position.clone().project(g.camera), w = A.position.clone(); w.y += 1.05 * A.scale.y; w.project(g.camera); frac = Math.abs(w.y - v.y) / 2; }
      g.render();
      return { d, shown: !!A, frac: +frac.toFixed(3), a0: g.ui.guide.stat.a0, pd: +Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z).toFixed(1), cam: [g.camera.position.x - pl.pos.x, g.camera.position.y - pl.pos.y, g.camera.position.z - pl.pos.z].map((x) => +x.toFixed(1)) };
    }, d);
    console.log('çay ocağı:', JSON.stringify(r));
    await p.screenshot({ path: path.join(dir, `o-ok-cay-ocagi-${d}m.jpg`), type: 'jpeg', quality: 60 });
  }
};
