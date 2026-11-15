// Gerçekçi gövdeler oyunda: veri yüklendi mi, oyuncu ve sokaktaki insanlar nasıl görünüyor (gözle denetim için iki görüntü).
//   SETTINGS='{"quality":"medium"}' node scripts/test/play.js file://$PWD/app/index.html .testout/mhlook $PWD/scripts/test/mhlook-steps.js
const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const g = game;
    g.env.time = 13; g.env.update(0.01, g.camera.position); sim(1.0);
    g.player.camYaw += Math.PI; sim(0.6); // kamera oyuncunun önüne
    const m = g.player.model, geo = m.mesh.geometry;
    return { mhOk: g.mhOk, rigMH: m.rig.mh || null, tris: geo.userData.tris, shared: !!geo.userData.shared, npcs: g.npcs ? g.npcs.length : -1 };
  });
  console.log('mhlook', JSON.stringify(r));
  await H.shot(p, out + '/mh-oyuncu.png');
  await p.evaluate(() => { game.player.camYaw += Math.PI * 0.6; sim(4); });
  await H.shot(p, out + '/mh-sokak.png');
  if (!r.mhOk || !r.rigMH) throw new Error('gerçekçi gövde verisi yüklenmedi');
  await module.exports.aim(p, out);
};
// ek: nişan pozu yakın planı (silah ele oturuyor mu): kare çizilir çizilmez aynı görevde okunur
module.exports.aim = async (p, out) => {
  const shots = await p.evaluate(() => {
    const g = game, pl = g.player, res = [];
    pl.giveWeapon('pistol', 50); pl.setWeapon('pistol'); pl.heading = pl.camYaw; g.input.mouse.right = true; sim(1.2, () => { g.input.mouse.right = true; });
    const fx = Math.sin(pl.heading), fz = Math.cos(pl.heading);
    for (const [a, b] of [[1.5, 1.2], [0.2, -1.9]]) {
      const c = g.camera.clone();
      c.fov = 30; c.position.set(pl.pos.x + fx * a + fz * b, pl.pos.y + 1.5, pl.pos.z + fz * a - fx * b); c.lookAt(pl.pos.x + fx * 0.25, pl.pos.y + 1.32, pl.pos.z + fz * 0.25); c.updateProjectionMatrix(); c.updateMatrixWorld();
      g.renderer.setRenderTarget(null); g.renderer.render(g.scene, c);
      res.push(g.renderer.domElement.toDataURL('image/jpeg', 0.9));
    }
    return res;
  });
  shots.forEach((u, i) => require('fs').writeFileSync(out + '/mh-nisan' + i + '.jpg', Buffer.from(u.split(',')[1], 'base64')));
};
