// Karakter dizisi görsel kontrolü (1.4): erkek ve kadın çeşitliliği, üniformalar (savaş modülü yelek/kask ağlarıyla),
// çete tarzları, vücut tipleri. Gerçek NPC'ler kurulur (teçhizat body.js'ten), yaratıcı sahnesine taşınır.
//   SETTINGS='{"quality":"low"}' node scripts/test/play.js file://$PWD/app/index.html .testout/cl $PWD/scripts/test/charlineup-steps.js
const H = require('./harness.js');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await H.start(p); await H.install(p);
  const rows = [
    ['erkek', [['civilian', 'is_adami'], ['civilian', 'bomberci'], ['civilian', 'yazlik_e'], ['gang', 'kartallar'], ['gang', 'kurtlar'], ['gang', 'carsi'], ['police', null], ['swat', null], ['soldier', null], ['soldier', 'jandarma']]],
    ['kadin', [['civilian', 'elbiseli'], ['civilian', 'yazlik_k'], ['civilian', 'sporcu_k'], ['civilian', 'sik_genc_k'], ['civilian', 'tesettur'], ['civilian', 'ogrenci_k'], ['civilian', 'sik_kadin'], ['civilian', 'basortulu'], ['civilian', 'universiteli'], ['civilian', 'turist_k']]],
  ];
  for (const [nm, list] of rows) {
    const info = await p.evaluate((list) => {
      const g = game, s = g.creatorScene, pl = g.player;
      g.loop = () => {};
      if (window.__cl) for (const m of window.__cl) s.remove(m.root);
      if (g.creatorModel) g.creatorModel.root.visible = false;
      const R = { s: 21, next() { this.s = (this.s * 16807) % 2147483647; return this.s / 2147483647; }, float(a, b) { return a + (b - a) * this.next(); }, pick(a) { return a[Math.floor(this.next() * a.length)]; }, chance(q) { return this.next() < q; } };
      const out = [];
      window.__cl = list.map(([kind, a], i) => {
        const look = kind === 'civilian' ? window.__randomLook(R, 'civilian', a) : kind === 'gang' ? window.__randomLook(R, 'gang', a) : null;
        const n = g.npcs.add(kind, pl.pos.x + 50, pl.pos.z + 50, look, { state: 'guard', jandarma: a === 'jandarma', vest: kind === 'police' ? true : undefined });
        g.npcs.remove(n);
        const m = n.model; m.forceLod = 0; m.setLod(0);
        m.root.position.set(-3.15 + i * 0.7, 0, -0.6); m.root.rotation.set(0, 0.15, 0);
        s.add(m.root);
        for (let k = 0; k < 40; k++) m.animate(1 / 30, { speed: 0, force: true, weapon: null });
        out.push((m.look.archetype || m.look.gang || kind) + ':' + m.mesh.geometry.userData.tris + (n.vest ? '+yelek' : '') + (n.helmet > 0 ? '+kask' : ''));
        return m;
      });
      g.creatorCam.clearViewOffset();
      g.creatorCam.position.set(0, 1.15, 6.2); g.creatorCam.lookAt(0, 0.92, -0.6); g.creatorCam.fov = 40; g.creatorCam.updateProjectionMatrix();
      document.querySelectorAll('.panel, .modal, #hud').forEach((e) => (e.style.visibility = 'hidden'));
      g.renderer.render(s, g.creatorCam);
      return out;
    }, list);
    console.log(nm, info.join(' '));
    await p.screenshot({ path: out + '-' + nm + '.png' });
  }
  console.log('HATALAR: ' + (errs.length ? errs.join(' | ') : 'yok'));
};
