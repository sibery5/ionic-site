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
};
