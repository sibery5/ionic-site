const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  await p.evaluate(() => {
    game.env.time = 11.5; game.env.weather = 'clear'; game.env.weatherTimer = 9999; sim(2); const pl = game.player; pl.camPitch = 0.35; pl.camYaw = pl.heading + 0.8; pl.camDist = 7; sim(0.3);
    window.lum = () => { game.render(); const gl = game.renderer.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(4 * 40); gl.readPixels(Math.floor(w * 0.5), Math.floor(h * 0.12), 40, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0; for (let i = 0; i < 40; i++) s += px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]; return Math.round(s / 120); };
    window.casters = []; game.scene.traverse(o => { if (o.isMesh && o.castShadow) casters.push(o); });
  });
  console.log('base', await p.evaluate(() => lum()), 'casters', await p.evaluate(() => casters.length));
  console.log('allOff', await p.evaluate(() => { casters.forEach(o => o.castShadow = false); const l = lum(); casters.forEach(o => o.castShadow = true); return l; }));
  const r = await p.evaluate(() => {
    const out = []; casters.forEach(o => o.castShadow = false);
    const desc = (o) => { o.geometry.computeBoundingBox(); const chain = []; let q = o; while (q) { chain.push(q.name || q.type); q = q.parent; } const m = Array.isArray(o.material) ? o.material[0] : o.material; return { idx: casters.indexOf(o), chain: chain.join('<'), inst: !!o.isInstancedMesh, count: o.count, mat: m.type, col: m.color && m.color.getHexString(), key: m.customProgramCacheKey && m.customProgramCacheKey(), bb: [o.geometry.boundingBox.min.toArray().map(v => +v.toFixed(1)), o.geometry.boundingBox.max.toArray().map(v => +v.toFixed(1))], verts: o.geometry.attributes.position.count }; };
    for (let k = 0; k < casters.length; k += 25) {
      const chunk = casters.slice(k, k + 25); chunk.forEach(o => o.castShadow = true); const l = lum(); chunk.forEach(o => o.castShadow = false);
      if (l < 50) for (const o of chunk) { o.castShadow = true; const l2 = lum(); o.castShadow = false; if (l2 < 50) out.push(desc(o)); }
    }
    return out;
  });
  console.log('found', JSON.stringify(r));
};
