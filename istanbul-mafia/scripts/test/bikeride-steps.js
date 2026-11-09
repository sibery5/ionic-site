// Bisiklet sürücüsü testi: oyuncu bisiklete biner, pedal çevirir; sürücü gerçek karakter modeli mi, ayaklar pedalda mı,
// eller gidonda mı, krank hızla senkron mu ölçer; yandan bir ekran görüntüsü (SHOTS=0 ile atlanır).
//   SETTINGS='{"quality":"low"}' node scripts/test/play.js file://$PWD/app/index.html .testout/bk $PWD/scripts/test/bikeride-steps.js
const H = require('./harness.js');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player; pl.god = true; sim(0.5);
    const v = g.vehicles.add('bisiklet', pl.pos.x + 3, pl.pos.z + 3, pl.heading);
    g.enterVehicle(v, true);
    hold('KeyW', true); sim(2.5);
    const ud = v.mesh.userData, M = ud.rider, P = new (M.root.position.constructor)();
    const res = { rider: !!M, visible: M && M.root.visible, fs: +v.fs.toFixed(2), crank: +(v.crank || 0).toFixed(2), foot: [], hand: [], ratio: 0 };
    const c0 = v.crank, x0 = v.pos.x, z0 = v.pos.z; sim(1); res.ratio = +((v.crank - c0) / (Math.hypot(v.pos.x - x0, v.pos.z - z0) / 0.34 || 1)).toFixed(3); // krank / tekerlek dönüşü
    v.mesh.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const pd = v.riderPose.pedals[i]; const pw = ud.chassis.localToWorld(P.set(pd[0], pd[1], pd[2]));
      const an = M.legs[i].an.getWorldPosition(new P.constructor()); res.foot.push(+an.distanceTo(pw).toFixed(3));
      const wr = M.arms[i].wr.getWorldPosition(new P.constructor()), gp = ud.steerGrp.localToWorld(new P.constructor(i ? -0.25 : 0.25, 0.14, -0.06)); res.hand.push(+wr.distanceTo(gp).toFixed(3));
    }
    hold('KeyW', false);
    // yandan görünüm
    g.loop = () => {};
    const cam = g.camera, f = { x: Math.sin(v.heading), z: Math.cos(v.heading) };
    cam.position.set(v.pos.x - f.z * 2.6, (v.pos.y || 0) + 1.2, v.pos.z + f.x * 2.6); cam.lookAt(v.pos.x, (v.pos.y || 0) + 0.8, v.pos.z);
    g.player.updateCamera = () => {};
    g.renderer.render(g.scene, cam);
    return res;
  });
  console.log('bisiklet', JSON.stringify(r));
  const ok = r.rider && r.visible && r.foot.every((d) => d < 0.16) && r.hand.every((d) => d < 0.07) && r.ratio > 0.3 && r.ratio < 0.55;
  if (process.env.SHOTS !== '0') await p.screenshot({ path: out + '-bike.png' }).catch(() => {});
  console.log(ok ? 'BİSİKLET TAMAM' : 'BİSİKLET HATA');
};
