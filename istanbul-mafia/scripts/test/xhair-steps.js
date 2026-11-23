// [B5] Nişangâh kareleri: tabanca, tüfek, pompalı (nişanda); tüfekte ateş sırasında açıklık ve isabet işareti.
// Ekranın ortasından 160×160 kırpılmış kareler: <out>-xh-<silah>.png
//   SETTINGS='{"quality":"low"}' NOSHOT=1 node scripts/test/play.js file://$PWD/app/index.html .testout/xh $PWD/scripts/test/xhair-steps.js
const H = require('./harness.js');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  const vp = p.viewportSize() || { width: 1280, height: 720 };
  const clip = { x: vp.width / 2 - 80, y: vp.height / 2 - 80, width: 160, height: 160 };
  const res = {};
  for (const w of ['pistol', 'ak', 'shotgun']) {
    res[w] = await p.evaluate((w) => {
      const g = game, pl = g.player, R = g.combat.reticle;
      pl.god = true; pl.giveWeapon(w); pl.setWeapon(w); g.input.mouse.right = true; sim(0.8);
      R.update(); const g0 = +R.state.gap.toFixed(1);
      let gMax = g0;
      let shots = 0; if (w === 'ak') { const m0 = pl.wstate.mag; g.input.mouse.left = true; sim(0.4, () => { R.update(); gMax = Math.max(gMax, R.state.gap); }); g.input.mouse.left = false; shots = m0 - pl.wstate.mag; R.hit('body'); }
      R.key = ''; R.update();
      return { mode: R.state.mode, gap: g0, gapFire: +gMax.toFixed(1), shots, shown: R.state.mode !== 'none' };
    }, w);
    await p.screenshot({ path: out + '-xh-' + w + '.png', clip }).catch(() => {});
    if (w === 'ak') res.ak.gapBack = await p.evaluate(() => { const R = game.combat.reticle; sim(1.5, () => R.update()); return +R.state.gap.toFixed(1); });
  }
  console.log('nişangâh', JSON.stringify(res));
  const ok = res.pistol.mode === 'pistol' && res.ak.mode === 'cross' && res.shotgun.mode === 'ring' && res.ak.gapFire > res.ak.gap && res.ak.gapBack < res.ak.gapFire;
  console.log(ok ? 'NİŞANGÂH TAMAM' : 'NİŞANGÂH HATA');
};
