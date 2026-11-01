// Karakter görsel kontrolü: yaratıcı yakın plan, 8 NPC dizisi, koşu orta adım.
//   SETTINGS='{"quality":"medium"}' node scripts/test/play.js file://$PWD/app/index.html <out> $PWD/scripts/test/charlook-steps.js
const clickText = (p, t) => p.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t).click(), t);
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setViewportSize({ width: 960, height: 540 });
  await p.waitForTimeout(800);
  await clickText(p, 'YENİ OYUN');
  await p.waitForTimeout(1500);
  // yaratıcı yakın plan (yüz + gövde)
  await p.evaluate(() => {
    const g = game, m = g.creatorModel;
    m.root.rotation.y = 0.35;
    for (let k = 0; k < 30; k++) m.animate(1 / 30, { speed: 0, force: true });
    g.creatorCam.position.set(-0.9 + 0.2, 1.7, 0.75); g.creatorCam.lookAt(-0.9, 1.64, 0); g.creatorCam.fov = 30; g.creatorCam.updateProjectionMatrix();
    document.querySelectorAll('.panel, .modal, #hud').forEach((e) => (e.style.visibility = 'hidden'));
    g.renderer.render(g.creatorScene, g.creatorCam); g.renderer.render(g.creatorScene, g.creatorCam);
  });
  await p.screenshot({ path: out + '-creator-face.png' });
  await p.evaluate(() => {
    const g = game;
    g.creatorCam.position.set(-0.9 + 0.6, 1.2, 3.2); g.creatorCam.lookAt(-0.9, 0.95, 0); g.creatorCam.updateProjectionMatrix();
    g.renderer.render(g.creatorScene, g.creatorCam);
  });
  await p.screenshot({ path: out + '-creator.png' });
  // 8 NPC dizisi
  const info = await p.evaluate(() => {
    const g = game, s = g.creatorScene, CM = g.creatorModel.constructor;
    g.creatorModel.root.visible = false;
    const looks = window.__looks;
    const R = { s: 7, next() { this.s = (this.s * 16807) % 2147483647; return this.s / 2147483647; }, float(a, b) { return a + (b - a) * this.next(); }, pick(a) { return a[Math.floor(this.next() * a.length)]; }, chance(q) { return this.next() < q; } };
    const L = [];
    const arch = ['is_adami', 'yasli_k', 'ogrenci_e', 'basortulu', 'turist_e', 'balikci', 'sik_kadin', 'yasli_e'];
    for (const a of arch) L.push(window.__randomLook(R, 'civilian', a));
    const stats = [];
    window.__lineup = L.map((o, i) => {
      const m = new CM(o); m.forceLod = 0; m.setLod(0);
      m.root.position.set(-2.45 + i * 0.7, 0, -0.6); m.root.rotation.y = 0.2;
      s.add(m.root);
      for (let k = 0; k < 40; k++) m.animate(1 / 30, { speed: i === 2 ? 1.4 : 0, talk: i === 0, force: true });
      stats.push(m.mesh.geometry.userData.tris);
      return m;
    });
    g.creatorCam.position.set(0, 1.25, 4.6); g.creatorCam.lookAt(0, 0.95, -0.6); g.creatorCam.fov = 40; g.creatorCam.updateProjectionMatrix();
    g.renderer.render(s, g.creatorCam);
    return { tris: stats, lods: [0, 1, 2].map((l) => { const m = window.__lineup[0]; m.forceLod = l; m.setLod(l); return m.mesh.geometry.userData.tris; }) };
  });
  console.log('lineup', JSON.stringify(info));
  await p.evaluate(() => { const m = window.__lineup[0]; m.forceLod = 0; m.setLod(0); game.renderer.render(game.creatorScene, game.creatorCam); });
  await p.screenshot({ path: out + '-lineup.png' });
  // koşu orta adım: yandan
  await p.evaluate(() => {
    const g = game, s = g.creatorScene;
    for (const m of window.__lineup) m.root.visible = false;
    const m = window.__lineup[2]; m.root.visible = true; m.root.position.set(0, 0, 0); m.root.rotation.y = Math.PI / 2;
    for (let k = 0; k < 60; k++) m.animate(1 / 30, { speed: 7.4, force: true });
    // orta adım: bir ayak önde
    for (let k = 0; k < 40 && Math.abs(Math.sin(m.cyc * 6.283 * 1)) < 0.9; k++) m.animate(1 / 60, { speed: 7.4, force: true });
    g.creatorCam.position.set(0, 1.0, 3.6); g.creatorCam.lookAt(0, 0.9, 0); g.creatorCam.fov = 40; g.creatorCam.updateProjectionMatrix();
    g.renderer.render(s, g.creatorCam);
  });
  await p.screenshot({ path: out + '-sprint.png' });
  console.log('HATALAR: ' + (errs.length ? errs.join(' | ') : 'yok'));
};
