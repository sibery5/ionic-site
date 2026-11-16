// Gözle denetim: denizdeki tekne/yat yakın görüntüsü (saydamlık, beyaz katman, çizim sırası).
const H = require('./harness.js');
const fs = require('fs');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  const shots = await p.evaluate(() => {
    const g = game, pl = g.player, res = [];
    g.loop = () => {}; pl.god = true; g.env.time = 13; g.env.update(0.01, g.camera.position); sim(0.5);
    const list = (g.boats && (g.boats.list || g.boats.boats)) || g.vehicles.list.filter((v) => v.kind === 'boat');
    const b = list.find((v) => /yat|megayat/.test(v.type)) || list[0];
    if (!b) return { err: 'tekne yok', n: list.length };
    pl.pos.set(b.pos.x + 25, 0, b.pos.z + 18); sim(1.0);
    for (const [ox, oy, oz] of [[16, 6, 12], [-14, 3, -10], [4, 1.2, 14]]) {
      const c = g.camera.clone(); c.position.set(b.pos.x + ox, (b.pos.y || 0) + oy, b.pos.z + oz); c.lookAt(b.pos.x, (b.pos.y || 0) + 2, b.pos.z); c.updateMatrixWorld();
      g.camera.position.copy(c.position); g.camera.quaternion.copy(c.quaternion); g.camera.updateMatrixWorld();
      if (g.composer) g.composer.render(); else g.renderer.render(g.scene, g.camera);
      res.push(g.renderer.domElement.toDataURL('image/jpeg', 0.88));
    }
    return { type: b.type, shots: res };
  });
  if (!shots.shots) { console.log('boatlook', JSON.stringify(shots)); return; }
  console.log('boatlook', shots.type);
  shots.shots.forEach((u, i) => fs.writeFileSync(out + '/tekne' + i + '.jpg', Buffer.from(u.split(',')[1], 'base64')));
};
