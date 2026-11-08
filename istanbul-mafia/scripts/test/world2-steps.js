// Dünya ve Yapılar (1.4 / A3) testi:
//  köprü bariyeri aracı durdurur · bariyer uçları şeritte değil · askeri üs duvarına tırmanılamaz ·
//  dağ yolu sürülebilir (groundY profili + zirveye ulaşan araç) · bankta oturma/kalkma · park araçları binaya gömülmez.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 node scripts/test/play.js file://$PWD/app/index.html .testout/w2 $PWD/scripts/test/world2-steps.js
// SHOTS=1: cami, gece Levent, dağ ekran görüntüleri (<out>-*.png)
const H = require('./harness.js');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  await p.evaluate(() => { game.loop = () => {}; game.player.god = true; });
  const fails = [];
  const ok = (name, cond, data) => { console.log(cond ? 'PASS' : 'FAIL', name, JSON.stringify(data)); if (!cond) fails.push(name); };

  // 1) köprü bariyeri aracı durdurur (15 Temmuz, açıklık ortası, 25 m/s yanal çarpma)
  const br = await p.evaluate(() => {
    const g = game; g.vehicles.clear(); g.vehicles.spawnT = 999;
    const zc = -450, res = [];
    for (const [x, s] of [[312, 1], [250, -1], [205, 1]]) {
      const pl = g.player; if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle);
      const v = g.vehicles.add('sedan', x, zc - s * 2, s > 0 ? 0 : Math.PI); g.enterVehicle(v, true);
      let vmax = 0; hold('KeyW', true);
      sim(3, () => { vmax = Math.max(vmax, Math.hypot(v.vx, v.vz)); });
      hold('KeyW', false);
      res.push({ x, z: +v.pos.z.toFixed(2), y: +v.pos.y.toFixed(1), off: +(Math.abs(v.pos.z - zc)).toFixed(2), vmax: +vmax.toFixed(1), sinking: v.sinking });
      g.vehicles.ejectDriver(v); g.vehicles.clear();
    }
    return res;
  });
  ok('bariyer-arac', br.every((r) => r.off < 9.3 && r.off > 6 && r.vmax > 6 && !r.sinking), br);
  // 2) bariyer uçları kavşak şeridinin dışında
  const ends = await p.evaluate(() => {
    const B = game.city.bridgeBarriers || [];
    const bos = B.filter((b) => b.z0 > -470 && b.z1 < -430), gal = B.filter((b) => b.x0 > -165 && b.x1 < -135), unk = B.filter((b) => b.x0 > -515 && b.x1 < -485);
    const inLane = bos.filter((b) => Math.min(Math.abs(b.z0 + 450), Math.abs(b.z1 + 450)) < 9.0).length
      + gal.filter((b) => Math.min(Math.abs(b.x0 + 150), Math.abs(b.x1 + 150)) < 8.0).length
      + unk.filter((b) => Math.min(Math.abs(b.x0 + 500), Math.abs(b.x1 + 500)) < 8.0).length;
    const r = (a, k0, k1) => a.length ? [+Math.min(...a.map((b) => b[k0])).toFixed(1), +Math.max(...a.map((b) => b[k1])).toFixed(1)] : null;
    return { n: B.length, bosX: r(bos, 'x0', 'x1'), galZ: r(gal, 'z0', 'z1'), unkZ: r(unk, 'z0', 'z1'), inLane };
  });
  ok('bariyer-uclari', ends.n > 100 && ends.inLane === 0 && ends.bosX[0] >= 198 && ends.bosX[1] <= 427 && ends.galZ[0] >= 68 && ends.galZ[1] <= 192 && ends.unkZ[0] >= 68 && ends.unkZ[1] <= 192, ends);
  // 3) askeri üs duvarı: tutunma reddi + duvar üstünde durulamaz
  const wall = await p.evaluate(() => {
    const g = game, pl = g.player, MB = g.city.physics ? null : null; void MB;
    const w = game.physics.city.boxes.find((b) => b.tag === 'milWall' && b.z1 - b.z0 < 2 && b.x1 - b.x0 > 50);
    const zw = (w.z0 + w.z1) / 2, xw = (w.x0 + w.x1) / 2, outZ = zw > -800 ? w.z1 + 0.7 : w.z0 - 0.7, dir = zw > -800 ? -1 : 1;
    pl.pos.set(xw, 3.0, outZ); pl.vy = 0; pl.grounded = true; pl.climbAttempt = null;
    const vault = pl.tryVault(0, dir, false);
    const att = !!pl.climbAttempt;
    pl.pos.set(xw, 4.1, zw); pl.vy = 0; sim(1.5);
    const top = { y: +pl.pos.y.toFixed(2), z: +pl.pos.z.toFixed(2), inWall: pl.pos.z > w.z0 && pl.pos.z < w.z1 };
    // zıplayarak tırmanma denemesi (yerden)
    pl.pos.set(xw, 0, outZ); pl.vy = 0; sim(0.5); hold('KeyW', true); pl.camYaw = dir > 0 ? 0 : Math.PI;
    for (let i = 0; i < 6; i++) { press('Space'); sim(0.6); }
    hold('KeyW', false);
    const side = Math.sign(pl.pos.z - zw) === Math.sign(outZ - zw);
    return { vault, att, top, jumpSideOk: side, y: +pl.pos.y.toFixed(2) };
  });
  ok('duvar-tirmanma', !wall.vault && wall.att && wall.top.y < 1 && !wall.top.inWall && wall.jumpSideOk, wall);
  // 4) dağ yolu: groundY profili ve zirveye sürüş
  const mt = await p.evaluate(() => {
    const g = game, M = g.city.mountainData, R = M.road;
    let maxDiff = 0, maxGrade = 0;
    for (let i = 1; i < R.length; i++) { const gy = g.physics.groundAt(R[i].x, R[i].z); if (R[i].x > M.x0 && R[i].z > M.z0 && R[i].z < M.z1) maxDiff = Math.max(maxDiff, Math.abs(gy - R[i].y)); maxGrade = Math.max(maxGrade, Math.abs(R[i].y - R[i - 1].y) / 2); }
    g.vehicles.clear(); g.vehicles.spawnT = 999;
    const pl = g.player; if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle);
    const v = g.vehicles.add('sedan', R[0].x, R[0].z, Math.atan2(R[1].x - R[0].x, R[1].z - R[0].z)); g.enterVehicle(v, true);
    let i = 2, maxY = 0, prof = [], gyErr = 0;
    hold('KeyW', true);
    sim(80, (k) => {
      while (i < R.length - 1 && Math.hypot(R[i].x - v.pos.x, R[i].z - v.pos.z) < 7) i++;
      const t = R[Math.min(R.length - 1, i + 1)], want = Math.atan2(t.x - v.pos.x, t.z - v.pos.z);
      let d = want - v.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      hold('KeyA', d > 0.04); hold('KeyD', d < -0.04); // oyuncu girdisi (A: +direksiyon)
      const sp = Math.hypot(v.vx, v.vz); if (sp > 10) hold('KeyW', false); else hold('KeyW', true);
      maxY = Math.max(maxY, v.pos.y);
      const gy = g.physics.groundAt(v.pos.x, v.pos.z); if (v.pos.x > M.x0 + 1) gyErr = Math.max(gyErr, Math.abs(v.pos.y - gy));
      if (k % 150 === 0) prof.push(+v.pos.y.toFixed(1));
      if (i >= M.summit.i) { hold('KeyW', false); }
    });
    hold('KeyW', false); hold('KeyA', false); hold('KeyD', false);
    const res = { summitY: +M.summit.y.toFixed(1), maxY: +maxY.toFixed(1), reachedIdx: i, summitIdx: M.summit.i, gyErr: +gyErr.toFixed(2), maxDiff: +maxDiff.toFixed(2), maxGrade: +maxGrade.toFixed(3), prof, hp: Math.round(v.hp) };
    g.vehicles.ejectDriver(v);
    return res;
  });
  ok('dag-yolu', mt.reachedIdx >= mt.summitIdx && mt.maxY > mt.summitY - 1.5 && mt.gyErr < 0.3 && mt.maxDiff < 0.3 && mt.maxGrade < 0.14, mt);
  // 5) bankta oturma (sahil bankı, denize bakar) ve kalkma
  const sit = await p.evaluate(() => {
    const g = game, pl = g.player, S = g.city.seats;
    const st = S.find((s) => s.kind === 'sahil' && s.z > -300 && g.seating.free(s));
    pl.pos.set(st.x + Math.sin(st.heading) * 0.8, st.y, st.z + Math.cos(st.heading) * 0.8); sim(0.3);
    const pr = g.findInteraction();
    press('KeyE'); sim(0.5);
    const seated = { sitting: pl.sitting, seat: !!pl.seat, d: +Math.hypot(pl.pos.x - st.x, pl.pos.z - st.z).toFixed(2), hd: +pl.heading.toFixed(2), anim: pl.animState().sit };
    sim(2); const still = +Math.hypot(pl.pos.x - st.x, pl.pos.z - st.z).toFixed(2);
    hold('KeyW', true); sim(0.6); hold('KeyW', false);
    return { seats: S.length, sahil: S.filter((s) => s.kind === 'sahil').length, prompt: pr && pr.label, seated, still, after: { sitting: pl.sitting, seat: !!pl.seat } };
  });
  ok('bank-oturma', sit.prompt && sit.prompt.startsWith('Banka otur') && sit.seated.sitting && sit.seated.anim && sit.seated.d < 0.05 && sit.still < 0.05 && !sit.after.sitting, sit);
  // 6) park araçları binaya gömülmez
  const pk = await p.evaluate(() => {
    const g = game, ph = g.physics.city;
    g.vehicles.clear();
    let made = 0, bad = [];
    const spots = [[-300, -60], [-150, -400], [-600, 300], [600, -300], [700, 500], [-450, -800], [-50, 600], [850, -100]];
    for (const [x, z] of spots) for (let k = 0; k < 40; k++) { const v = g.vehicles.spawnParked(x, z); if (v) made++; }
    const isBld = (b) => typeof b.tag === 'object' || ['zoneBuilding', 'galata', 'kizkulesi', 'cabin'].includes(b.tag) || (b.y1 > 4 && (b.x1 - b.x0) * (b.z1 - b.z0) > 30);
    for (const v of g.vehicles.list) {
      if (!v.parked) continue;
      const hit = ph.overlapsRect(v.pos.x, v.pos.z, v.def.wid / 2, v.def.len / 2, v.heading, 0, isBld);
      const inB = g.map.buildings.some((b) => v.pos.x > b.x0 && v.pos.x < b.x1 && v.pos.z > b.z0 && v.pos.z < b.z1);
      if (hit || inB) bad.push([+v.pos.x.toFixed(1), +v.pos.z.toFixed(1), hit && (typeof hit.tag === 'object' ? 'bina' : hit.tag)]);
    }
    return { made, parked: g.vehicles.list.filter((v) => v.parked).length, bad: bad.length, ex: bad.slice(0, 6) };
  });
  ok('park-araclari', pk.made > 20 && pk.bad === 0, pk);
  // 7) performans: dünya inşa ölçüleri
  const perf = await p.evaluate(() => {
    let tris = 0, meshes = 0; game.city.group.traverse((o) => { if (o.isMesh && o.geometry) { meshes++; const gm = o.geometry; tris += (gm.index ? gm.index.count : gm.attributes.position.count) / 3 * (o.isInstancedMesh ? 0 : 1); } });
    const t0 = performance.now(); for (let i = 0; i < 20000; i++) game.physics.groundAt(900 + (i % 100), 260 + (i % 540)); const gT = (performance.now() - t0) / 20000;
    const t1 = performance.now(); sim(3); const fr = (performance.now() - t1) / 90;
    return { meshes, staticTris: Math.round(tris), groundAtUs: +(gT * 1000).toFixed(2), simMsPerFrame: +fr.toFixed(2) };
  });
  console.log('perf', JSON.stringify(perf));
  if (process.env.SHOTS === '1') {
    const shot = async (name, x, y, z, yaw, pitch, t) => {
      await p.evaluate(([x, y, z, yaw, pitch, t]) => { const e = game.env; e.setWeather('clear', true); e.time = t; e.timeScale = 0; const pl = game.player; if (pl.vehicle) game.vehicles.ejectDriver(pl.vehicle); pl.pos.set(x, y, z); pl.camYaw = yaw; pl.camPitch = pitch; game.ui.hideBanner && game.ui.hideBanner(); sim(1.2); }, [x, y, z, yaw, pitch, t]);
      await H.shot(p, `${out}-${name}.png`);
    };
    const S = (process.env.SHOTLIST || 'mosque,levent,mountain').split(',');
    if (S.includes('mosque')) await shot('mosque', -160, 0, 668, Math.PI, 0.15, 10.5);
    if (S.includes('levent')) { const nd = await p.evaluate(() => { const n = game.map.nearestNode(-300, -760); return [n.x + 3, n.z + 3]; }); await shot('levent', nd[0], 0, nd[1], Math.PI, -0.3, 22.5); }
    if (S.includes('mountain')) { const m = await p.evaluate(() => { const R = game.city.mountainData.road; const q = R[40]; return [q.x, q.y, q.z, Math.atan2(R[60].x - q.x, R[60].z - q.z)]; }); await shot('mountain', m[0], m[1], m[2], m[3] + Math.PI, 0.1, 16.5); }
    if (S.includes('coast')) await shot('coast', 423, 0, -120, Math.PI / 2 + Math.PI, 0.1, 18.2);
  }
  console.log(fails.length ? 'WORLD2 FAIL ' + fails.join(',') : 'WORLD2 OK');
};
