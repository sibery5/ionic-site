const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    game.env.time = 11.5; sim(1);
    const THREE = window.__THREE;
    const res = [];
    const pl = game.player;
    const o = { x: pl.pos.x + 3, y: 0.2, z: pl.pos.z + 3 };
    const d = game.env.sunDir;
    // tüm gölge düşüren meshler: dünya kutusu ışın üzerindeyse listele
    game.scene.traverse((m) => {
      if (!m.isMesh || !m.castShadow || !m.visible) return;
      const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      const c = g.boundingSphere.center.clone().applyMatrix4(m.matrixWorld);
      const rad = g.boundingSphere.radius * m.matrixWorld.getMaxScaleOnAxis();
      // ışına uzaklık
      const vx = c.x - o.x, vy = c.y - o.y, vz = c.z - o.z;
      const t = vx * d.x + vy * d.y + vz * d.z;
      if (t < 0) return;
      const px = o.x + d.x * t - c.x, py = o.y + d.y * t - c.y, pz = o.z + d.z * t - c.z;
      const dist = Math.hypot(px, py, pz);
      if (dist < rad) res.push({ verts: g.attributes.position.count, bbox: (g.computeBoundingBox(), [g.boundingBox.min.y, g.boundingBox.max.y].map(v=>+v.toFixed(1))), color: m.material.color && m.material.color.getHexString(), map: !!m.material.map, recv: m.receiveShadow, side: m.material.side, transparent: m.material.transparent, alphaTest: m.material.alphaTest,  name: m.name || m.type, inst: !!m.isInstancedMesh, count: m.count, rad: Math.round(rad), cy: Math.round(c.y), mat: m.material && (m.material.type + (m.material.name ? ':' + m.material.name : '')), parent: m.parent && (m.parent.name || m.parent.type) });
    });
    return res.slice(0, 40);
  });
  console.log(JSON.stringify(r, null, 0));
};
