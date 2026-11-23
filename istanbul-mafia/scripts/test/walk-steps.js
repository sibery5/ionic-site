// [B4] Doğal yürüyüş ölçümü: düz yürüme, koşu ve yürürken kamera dönüşü (fare) sırasında
//  pelvis yanal salınımı (kök yoluna göre, cm), gövde (göğüs) yuvarlanması (°), baş yanal salınımı (cm), ayaklar arası yanal açıklık (cm),
//  bank (dönüşte yana yatma, °). Hedef: pelvis ≤ 3 cm, gövde ≤ 4°, baş ≤ 3 cm.
//  SHOTS=1 ile önden ve yandan birer kare (yürürken).
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/walk $PWD/scripts/test/walk-steps.js
const H = require('./harness.js');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  const shots = process.env.SHOTS === '1';
  if (!shots) await p.evaluate(() => { game.render = () => {}; });
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player, m = pl.model, V = m.root.position.constructor;
    pl.god = true; pl.setWeapon('fists'); sim(1);
    // engelsiz yön
    let best = 0, bd = -1;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, x0 = pl.pos.x, z0 = pl.pos.z;
      pl.heading = a; pl.camYaw = a; hold('KeyW', true); sim(2); hold('KeyW', false); sim(0.4);
      const d = Math.hypot(pl.pos.x - x0, pl.pos.z - z0); pl.pos.x = x0; pl.pos.z = z0; pl.vx = pl.vz = 0; sim(0.1);
      if (d > bd) { bd = d; best = a; } if (d > 5) break;
    }
    const x0 = pl.pos.x, z0 = pl.pos.z;
    const meas = (sec, run, yawFn) => {
      pl.pos.x = x0; pl.pos.z = z0; pl.vx = pl.vz = 0; pl.heading = best; pl.camYaw = best; sim(0.3);
      hold('KeyW', true); if (run) hold('ShiftLeft', true);
      sim(1.2, (i) => { if (yawFn) pl.camYaw = best + yawFn(i / 30); });
      const hp = new V(), hd = new V(), ch = new V(), a0 = new V(), a1 = new V(), up = new V();
      let cl = null, cStep = 0, spd = 0, pMin = 1e9, pMax = -1e9, hMin = 1e9, hMax = -1e9, rMax = 0, bank = 0, wSum = 0, wN = 0, hyMin = 1e9, hyMax = -1e9;
      sim(sec, (i) => {
        if (yawFn) pl.camYaw = best + yawFn(1.2 + i / 30);
        m.root.updateMatrixWorld(true);
        const e = m.root.matrixWorld.elements, rx = e[0], rz = e[2], ox = e[12], oz = e[14], ln = Math.hypot(rx, rz) || 1; // kökün yanal ekseni
        m.hips.getWorldPosition(hp); m.bones[m.bones.findIndex((b) => b.name === 'head')].getWorldPosition(hd);
        const lp = ((hp.x - ox) * rx + (hp.z - oz) * rz) / ln, lh = ((hd.x - ox) * rx + (hd.z - oz) * rz) / ln;
        pMin = Math.min(pMin, lp); pMax = Math.max(pMax, lp); hMin = Math.min(hMin, lh); hMax = Math.max(hMax, lh);
        hyMin = Math.min(hyMin, hd.y - e[13]); hyMax = Math.max(hyMax, hd.y - e[13]); spd = Math.max(spd, pl.speed);
        // göğüs yuvarlanması: göğüs kemiğinin yukarı ekseninin yanal eğimi
        const cb = m.bones[m.bones.findIndex((b) => b.name === 'chest')], ce = cb.matrixWorld.elements;
        up.set(ce[4], ce[5], ce[6]).normalize(); { const cy = ce[13] - e[13]; if (cl !== null) cStep = Math.max(cStep, Math.abs(cy - cl)); cl = cy; }
        const roll = Math.atan2((up.x * rx + up.z * rz) / ln, up.y) * 180 / Math.PI;
        rMax = Math.max(rMax, Math.abs(roll));
        bank = Math.max(bank, Math.abs((m.bank || 0) * 180 / Math.PI));
        m.legs[0].an.getWorldPosition(a0); m.legs[1].an.getWorldPosition(a1);
        wSum += Math.abs(((a0.x - a1.x) * rx + (a0.z - a1.z) * rz) / ln); wN++;
      });
      hold('KeyW', false); hold('ShiftLeft', false); sim(0.6);
      return { pelvisCm: +((pMax - pMin) * 50).toFixed(1), headCm: +((hMax - hMin) * 50).toFixed(1), chestRollDeg: +rMax.toFixed(1), bankDeg: +bank.toFixed(1), feetCm: +(wSum / wN * 100).toFixed(1), headBobCm: +((hyMax - hyMin) * 100).toFixed(1), speed: +spd.toFixed(2), chestStepCm: +(cStep * 100).toFixed(2) };
    };
    const res = {};
    res.walk = meas(3, false);
    res.run = meas(2, true);
    // yürürken fareyle dolaşma: kamera yönü 0,6 Hz'de ±0,5 rad (oyuncu etrafa bakınırken yürür)
    res.walkTurn = meas(3, false, (t) => 0.5 * Math.sin(t * Math.PI * 2 * 0.6));
    // yürü → koş → yürü geçişinde gövde sıçraması (göğüs yüksekliği kare farkı, cm)
    pl.pos.x = x0; pl.pos.z = z0; pl.heading = best; pl.camYaw = best; sim(0.3);
    hold('KeyW', true); sim(1);
    const cb = m.bones[m.bones.findIndex((b) => b.name === 'chest')], cp = new V(); let last = null, jump = 0;
    sim(2.4, (i) => { hold('ShiftLeft', i > 20 && i < 50); m.root.updateMatrixWorld(true); cb.getWorldPosition(cp); const ry = m.root.matrixWorld.elements[13]; if (last !== null) jump = Math.max(jump, Math.abs(cp.y - ry - last)); last = cp.y - ry; });
    hold('KeyW', false); hold('ShiftLeft', false); sim(0.5);
    res.transitionMaxStepCm = +(jump * 100).toFixed(2);
    window.__walkBest = { x0, z0, best };
    return res;
  });
  console.log('yürüyüş', JSON.stringify(r));
  const W = r.walk;
  const ok = W.pelvisCm <= 3 && W.chestRollDeg <= 4 && W.headCm <= 3 && r.walkTurn.chestRollDeg <= 6 && r.transitionMaxStepCm < Math.max(3, r.run.chestStepCm * 1.3);
  if (shots) {
    for (const [name, side] of [['onden', 0], ['yandan', 1]]) {
      await p.evaluate((side) => {
        const g = game, pl = g.player, B = window.__walkBest; pl.pos.x = B.x0; pl.pos.z = B.z0; pl.heading = B.best; pl.camYaw = B.best;
        hold('KeyW', true); sim(1.3); hold('KeyW', false);
        g.loop = () => {}; pl.updateCamera = () => {};
        const cam = g.camera, f = { x: Math.sin(pl.heading), z: Math.cos(pl.heading) }, d = 3.2;
        if (side) cam.position.set(pl.pos.x + f.z * d, pl.pos.y + 1.1, pl.pos.z - f.x * d); else cam.position.set(pl.pos.x + f.x * d, pl.pos.y + 1.2, pl.pos.z + f.z * d);
        cam.lookAt(pl.pos.x, pl.pos.y + 0.95, pl.pos.z); g.renderer.render(g.scene, cam);
      }, side);
      await p.screenshot({ path: out + '-' + name + '.png' }).catch(() => {});
    }
  }
  console.log(ok ? 'YÜRÜYÜŞ TAMAM' : 'YÜRÜYÜŞ HATA');
};
