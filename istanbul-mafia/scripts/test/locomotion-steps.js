// Yürüme/koşu anatomi testi: oyuncu koşarken kemik açılarını örnekler, anatomik aralıkları ve ayak kaymasını doğrular.
//   SETTINGS='{"quality":"low"}' node scripts/test/play.js file://$PWD/app/index.html /tmp/out $PWD/scripts/test/locomotion-steps.js
const H = require('./harness.js');
module.exports = async (p) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player, m = pl.model, log = [], bad = [];
    pl.god = true;
    sim(1);
    pl.heading = Math.PI / 2; pl.camYaw = pl.heading; sim(0.2);
    const E = new THREE_E();
    function THREE_E() { return { x: 0, y: 0, z: 0 }; }
    const eul = (q) => { // XYZ Euler (three.js Euler.setFromQuaternion ile aynı)
      const x = q.x, y = q.y, z = q.z, w = q.w;
      const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - z * w), m13 = 2 * (x * z + y * w);
      const m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - x * w), m32 = 2 * (y * z + x * w), m33 = 1 - 2 * (x * x + y * y);
      const ey = Math.asin(Math.max(-1, Math.min(1, m13)));
      let ex, ez;
      if (Math.abs(m13) < 0.9999) { ex = Math.atan2(-m23, m33); ez = Math.atan2(-m12, m11); } else { ex = Math.atan2(m32, m22); ez = 0; }
      E.x = ex; E.y = ey; E.z = ez; return E;
    };
    // engelsiz yön bul (koşu yolu boyunca serbest)
    const freeDir = () => {
      let best = 0, bd = -1;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, x0 = pl.pos.x, z0 = pl.pos.z;
        pl.heading = a; pl.camYaw = a; pl.vx = pl.vz = 0; hold('KeyW', true); hold('ShiftLeft', true); sim(2.5); hold('KeyW', false); hold('ShiftLeft', false); sim(0.6);
        const d = Math.hypot(pl.pos.x - x0, pl.pos.z - z0);
        pl.pos.x = x0; pl.pos.z = z0; pl.vx = pl.vz = 0; sim(0.1);
        if (d > bd) { bd = d; best = a; }
        if (d > 22) break;
      }
      pl.heading = best; pl.camYaw = best; sim(0.3);
      return bd;
    };
    log.push('serbest yol=' + freeDir().toFixed(1) + ' m');
    const run = (label, keys, secs) => {
      const sx = pl.pos.x, sz = pl.pos.z, hd = pl.heading;
      for (const k of keys) hold(k, true);
      sim(1.2); // hızlan
      const R = { hip: [9, -9], kn: [9, -9], el: [9, -9], sh: [9, -9], lean: [9, -9], headP: [9, -9], pelvis: [9, -9], ankle: [9, -9], slide: 0, sp: 0 };
      const up = (a, v) => { if (v < a[0]) a[0] = v; if (v > a[1]) a[1] = v; };
      const prev = [null, null], wp = { x: 0, y: 0, z: 0 };
      const v = { x: 0, y: 0, z: 0 };
      let n = 0;
      sim(secs, () => {
        m.root.updateMatrixWorld(true);
        const gy = m.root.position.y;
        for (let i = 0; i < 2; i++) {
          const L = m.legs[i];
          up(R.hip, eul(L.hip.quaternion).x); up(R.kn, eul(L.kn.quaternion).x);
          const A = m.arms[i];
          up(R.el, eul(A.el.quaternion).x); up(R.sh, eul(A.sh.quaternion).x);
          const e = L.an.matrixWorld.elements; wp.x = e[12]; wp.y = e[13]; wp.z = e[14];
          up(R.ankle, wp.y - gy);
          // duruş fazının ortası: ayak dünyada sabit kalmalı
          const ph = (m.cyc + i * 0.5) % 1, beta = m._g ? m._g[2] : 0.3;
          if (ph > beta * 0.2 && ph < beta * 0.8) {
            if (prev[i]) R.slide = Math.max(R.slide, Math.hypot(wp.x - prev[i].x, wp.z - prev[i].z));
            else prev[i] = { x: wp.x, z: wp.z };
          } else prev[i] = null;
        }
        up(R.lean, eul(m.spine.quaternion).x + eul(m.chest.quaternion).x);
        // baş yatay kalmalı: kafa ileri vektörünün dünya eğimi
        const he = m.head.matrixWorld.elements; const fy = he[9], fl = Math.hypot(he[8], he[9], he[10]);
        up(R.headP, Math.asin(fy / fl));
        up(R.pelvis, m.hips.matrixWorld.elements[13] - gy);
        R.sp += pl.speed; n++;
      });
      for (const k of keys) hold(k, false);
      sim(1);
      R.real = +(Math.hypot(pl.pos.x - sx, pl.pos.z - sz) / (secs + 2.2)).toFixed(2);
      pl.pos.x = sx; pl.pos.z = sz; pl.heading = hd; pl.camYaw = hd; sim(0.3);
      R.sp = +(R.sp / n).toFixed(2);
      const f = (a) => a.map((x) => +x.toFixed(2));
      log.push(label + ' ' + JSON.stringify({ sp: R.sp, real: R.real, hip: f(R.hip), kn: f(R.kn), el: f(R.el), sh: f(R.sh), lean: f(R.lean), headP: f(R.headP), pelvis: f(R.pelvis), ankle: f(R.ankle), slide: +R.slide.toFixed(3) }));
      const ok = (c, msg) => { if (!c) bad.push(label + ': ' + msg); };
      // anatomik aralıklar (rad): kalça uzanması <= ~35°, fleksiyon <= ~85°; diz geri bükülmez; dirsek ters bükülmez
      ok(R.hip[0] > -1.5 && R.hip[1] < 0.62, 'kalça açısı ' + f(R.hip));
      ok(R.kn[0] > -0.06 && R.kn[1] < 2.5, 'diz açısı ' + f(R.kn));
      ok(R.el[1] < 0.06 && R.el[0] > -2.3, 'dirsek açısı ' + f(R.el));
      ok(R.sh[0] > -1.6 && R.sh[1] < 1.0, 'omuz açısı ' + f(R.sh));
      ok(R.lean[0] > -0.2 && R.lean[1] < 0.7, 'gövde eğimi ' + f(R.lean));
      ok(Math.abs(R.headP[0]) < 0.45 && Math.abs(R.headP[1]) < 0.45, 'baş sabit değil ' + f(R.headP));
      ok(R.pelvis[0] > 0.68 && R.pelvis[1] < 1.02, 'pelvis yüksekliği ' + f(R.pelvis));
      ok(R.ankle[0] > 0.02, 'ayak yere gömülüyor ' + f(R.ankle));
      ok(R.slide < 0.05, 'ayak kayması ' + R.slide.toFixed(3));
      return R;
    };
    run('yürü', ['KeyW'], 2.0);
    run('koş', ['KeyW', 'ShiftLeft'], 1.2);
    // 180° dönüş yumuşak olmalı (anlık değil)
    hold('KeyW', true); hold('ShiftLeft', true); sim(1.2);
    const h0 = pl.heading; pl.camYaw += Math.PI; let maxStep = 0, last = pl.heading;
    sim(1.2, () => { const d = Math.abs(Math.atan2(Math.sin(pl.heading - last), Math.cos(pl.heading - last))); maxStep = Math.max(maxStep, d); last = pl.heading; });
    hold('KeyW', false); hold('ShiftLeft', false); sim(1);
    log.push('dönüş maxAdım/kare=' + maxStep.toFixed(3) + ' toplam=' + Math.abs(Math.atan2(Math.sin(pl.heading - h0), Math.cos(pl.heading - h0))).toFixed(2));
    if (maxStep > 0.35) bad.push('dönüş anlık (kare başı ' + maxStep.toFixed(2) + ' rad)');
    return { log, bad };
  });
  console.log(r.log.join('\n'));
  console.log(r.bad.length ? 'BAŞARISIZ: ' + r.bad.join(' | ') : 'LOKOMOSYON TAMAM');
};
