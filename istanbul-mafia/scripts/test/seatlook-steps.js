// [B1] Araçta model değişimi testi: oyuncu arabaya ve motosiklete binince, trafik sürücüsü koltukta ve gasp edilince
// binmeden önceki gövdeyle aynı görünüş mü? Ölçülen: görünüş (look) eşitliği, MH gövde varlığı, üçgen oranı (aynı LOD'da), maket gizli mi,
// eller direksiyonda/gidonda mı. SHOTS=0 değilse yandan iki kare (araba, motor).
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/seat $PWD/scripts/test/seatlook-steps.js
const H = require('./harness.js');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  const shots = process.env.SHOTS !== '0';
  const run = (type) => p.evaluate(([type]) => {
    const g = game, pl = g.player; pl.god = true; sim(0.3);
    const lk = (L) => JSON.stringify(Object.keys(L).sort().map((k) => [k, L[k]]));
    const tris = (M) => (M.mesh.geometry.userData.tris || (M.mesh.geometry.index ? M.mesh.geometry.index.count / 3 : 0));
    const before = { look: lk(pl.model.look), mh: !!pl.model.rig.mh, lod: pl.model.lod };
    pl.model.forceLod = 0; pl.model.setLod(0); before.tris = tris(pl.model); pl.model.forceLod = null;
    const v = g.vehicles.add(type, pl.pos.x + 3, pl.pos.z + 3, pl.heading);
    g.enterVehicle(v, true); sim(1.2);
    const ud = v.mesh.userData, M = ud.seatRider;
    const r = { type, before, rider: !!M, visible: !!(M && M.root.visible), dummy: ud.driverDummy.visible, ownHidden: !pl.model.root.visible };
    if (M) {
      r.same = lk(M.look) === before.look; r.mh = !!M.rig.mh; r.lod = M.lod;
      M.forceLod = 0; M.setLod(0); r.tris = tris(M); M.forceLod = null; r.triRatio = +(r.tris / (before.tris || 1)).toFixed(3);
      v.mesh.updateMatrixWorld(true); M.animate(0.016, ud.seatSt);
      const P = new (M.root.position.constructor)();
      r.hand = [0, 1].map((i) => +M.arms[i].wr.getWorldPosition(P).distanceTo(ud.seatSt.ride.grips[i]).toFixed(3));
      r.foot = [0, 1].map((i) => { const pd = ud.seatSt.ride.pedals[i]; const w = ud.chassis.localToWorld(new P.constructor(pd[0], pd[1], pd[2])); return +M.legs[i].an.getWorldPosition(P).distanceTo(w).toFixed(3); });
      const hp = M.hips.getWorldPosition(P), sd = ud.seatSt.ride.seat, sw = ud.chassis.localToWorld(new P.constructor(sd[0], sd[1], sd[2]));
      r.hipSeat = +hp.distanceTo(sw).toFixed(3);
    }
    // giysi değişince araçtaki gövde de değişir
    const L2 = { ...pl.model.look, topColor: '#11aa22' }; pl.model.setLook(L2); sim(0.2);
    r.follow = !!(M && lk(M.look) === lk(pl.model.look));
    window.__seatV = v;
    return r;
  }, [type]);
  const shot = async (name) => {
    if (!shots) return;
    await p.evaluate(() => {
      const g = game, v = window.__seatV, cam = g.camera, f = { x: Math.sin(v.heading), z: Math.cos(v.heading) };
      g.loop = () => {}; g.player.updateCamera = () => {};
      cam.position.set(v.pos.x + f.z * 3.2 + f.x * 1.2, (v.pos.y || 0) + 1.5, v.pos.z - f.x * 3.2 + f.z * 1.2); cam.lookAt(v.pos.x, (v.pos.y || 0) + 0.9, v.pos.z + f.z * 0.2);
      g.renderer.render(g.scene, cam);
    });
    await p.screenshot({ path: out + '-' + name + '.png' }).catch(() => {});
  };
  const res = [];
  const only = process.env.SEATONLY;
  for (const t of ['sedan', 'motor']) {
    if (only && only !== t && only !== 'npc') continue;
    if (only === 'npc') break;
    const r = await run(t); console.log('koltuk', JSON.stringify(r)); res.push(r);
    if (only) await shot(t);
    await p.evaluate(() => { const g = game; if (g.player.vehicle) g.vehicles.ejectDriver(g.player.vehicle); sim(0.3); });
  }
  // NPC: trafik sürücüsü koltukta gerçek gövde; gasp edilince aynı kişi iner
  let npc = null;
  if (!only || only === 'npc') npc = await p.evaluate(() => {
    const g = game, pl = g.player, lk = (L) => JSON.stringify(Object.keys(L).sort().map((k) => [k, L[k]]));
    const v = g.vehicles.add('sedan', pl.pos.x + 4, pl.pos.z + 2, pl.heading);
    v.ai = { mode: 'traffic', empty: false, frozen: true }; sim(0.5);
    const ud = v.mesh.userData, M = ud.seatRider;
    const r = { rider: !!M, visible: !!(M && M.root.visible), dummy: ud.driverDummy.visible, mh: !!(M && M.rig.mh) };
    const L0 = M ? lk(M.look) : null;
    // gasp: sürücüyü çekme anına kadar dizi
    const cj = g.law && g.law.carjack;
    if (cj) {
      v.speed = 0; v.fs = 0; pl.pos.set(v.pos.x + 2, 0, v.pos.z);
      const ok = cj.tryEnter(v); r.jack = ok;
      let n = null; for (let i = 0; i < 60 && !n; i++) { sim(0.05); n = cj.seq && cj.seq.driver; }
      if (n) { r.jacked = true; r.sameLook = lk(n.model.look) === L0; r.riderHidden = !M.root.visible; r.npcMh = !!n.model.rig.mh; }
    }
    return r;
  });
  if (npc) console.log('npc', JSON.stringify(npc));
  const okP = res.every((r) => r.rider && r.visible && !r.dummy && r.same && r.mh && r.triRatio > 0.99 && r.triRatio < 1.01 && r.follow && r.hand.every((d) => d < 0.08) && r.hipSeat < 0.12);
  const okN = !npc || (npc.rider && npc.visible && !npc.dummy && npc.mh && (!npc.jacked || (npc.sameLook && npc.riderHidden)));
  console.log(okP && okN ? 'KOLTUK TAMAM' : 'KOLTUK HATA');
};
