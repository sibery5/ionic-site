// Araç/trafik/deniz/hava testi.
// Kullanım: node scripts/test/build-vehicles-test.js && (cd app && python3 -m http.server 8791 &)
//           node scripts/test/play.js http://localhost:8791/index-veh.html /tmp/out/ ./scripts/test/vehicles-steps.js
const H = require('./harness.js');
const shot = async (p, path) => { await p.evaluate(() => { game.mode = 'paused'; game.render(); }); await p.screenshot({ path, timeout: 400000 }); };
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  const shots = process.env.SHOTS !== '0';
  const r = await p.evaluate(() => {
    const R = {};
    const g = game, pl = g.player;
    window.__wireVehicles();
    R.lights = g.traffic.count;
    // oyuncuya yakın, uzun kollu ışıklı kavşak
    let best = null, bd = 1e9;
    for (const info of g.traffic.byNode.values()) {
      const n = info.node;
      if (!info.ap.every((a) => Math.hypot(a.other.x - n.x, a.other.z - n.z) > 60)) continue;
      const d = Math.hypot(n.x - pl.pos.x, n.z - pl.pos.z);
      if (d < bd) { bd = d; best = info; }
    }
    const node = best.node, ap = best.ap[0], from = ap.other;
    R.node = [node.x, node.z, node.edges.length];
    // trafiği temizle, yaklaşan bir AI araç koy
    for (const v of g.vehicles.list.slice()) if (v.ai && v.ai.mode === 'traffic') g.vehicles.remove(v);
    g.vehicles.spawnT = 999;
    const vm = g.vehicles;
    const mk = (dist, type) => {
      const fx = (node.x - from.x), fz = (node.z - from.z), l = Math.hypot(fx, fz);
      const ux = fx / l, uz = fz / l;
      const x = node.x - ux * dist - uz * 2.5, z = node.z - uz * dist + ux * 2.5;
      const v = vm.add(type, x, z, Math.atan2(ux, uz));
      v.ai = { mode: 'traffic', from, to: node, next: vm.chooseNext(node, from), cruise: 12, outer: false };
      return v;
    };
    const lead = mk(55, 'taksi'), follow = mk(70, 'kartal');
    // ışığı bu yön için kırmızıya ayarla
    const axis = ap.axis;
    const st = () => g.traffic.lightState(node, from);
    let tries = 0; while (st() !== 'red' && tries++ < 200) g.traffic.update(0.5);
    g.traffic.t -= 0; R.startState = st();
    const distTo = (v) => Math.hypot(v.pos.x - node.x, v.pos.z - node.z);
    // kırmızıda kalacak kadar simüle et (en fazla ~12 sn)
    let maxRed = 0; for (let i = 0; i < 360 && st() === 'red'; i++) { sim(1 / 30); maxRed++; }
    R.redFrames = maxRed;
    R.leadAtRed = { dist: +distTo(lead).toFixed(1), stopOff: ap.stop, fs: +lead.fs.toFixed(2), ind: lead.ind };
    R.followAtRed = { dist: +distTo(follow).toFixed(1), fs: +follow.fs.toFixed(2) };
    R.stoppedBeforeLine = distTo(lead) > ap.stop - 0.5 && Math.abs(lead.fs) < 0.6;
    R.queued = distTo(follow) > distTo(lead) + 3 && Math.abs(follow.fs) < 0.8;
    // yeşili bekle ve geçiş
    for (let i = 0; i < 900 && st() !== 'green'; i++) sim(1 / 30);
    sim(8);
    R.afterGreen = { lead: +distTo(lead).toFixed(1), leadFrom: lead.ai.from === node, fs: +lead.fs.toFixed(1) };
    // oyuncu: kavşaktan araba sür
    const car = vm.add('sedan', node.x - (node.x - from.x) / Math.hypot(node.x - from.x, node.z - from.z) * 40, node.z - (node.z - from.z) / Math.hypot(node.x - from.x, node.z - from.z) * 40, Math.atan2(node.x - from.x, node.z - from.z));
    g.enterVehicle(car, true);
    hold('KeyW', true); sim(5); hold('KeyW', false);
    R.playerDrive = { fs: +car.fs.toFixed(1), gear: car.gear, rpm: +car.rpm.toFixed(2), pitch: +car.pitch.toFixed(3), passed: Math.hypot(car.pos.x - node.x, car.pos.z - node.z).toFixed(1) };
    hold('KeyA', true); hold('Space', true); sim(1.2); R.drift = { ls: +car.ls.toFixed(2), roll: +car.roll.toFixed(3) }; hold('KeyA', false); hold('Space', false);
    hold('KeyS', true); sim(3); hold('KeyS', false);
    g.vehicles.ejectDriver(car);
    // tekne
    const ws = __VEH.nearestWaterSpot(195, -200, 5);
    pl.pos.set(ws.x, -1.3, ws.z); pl.swimming = true;
    const boat = g.boats.add('surat', ws.x + 2, ws.z, Math.PI);
    g.enterVehicle(boat, true);
    const b0 = boat.pos.clone();
    hold('KeyW', true); sim(6); hold('KeyW', false);
    R.boat = { moved: +boat.pos.distanceTo(b0).toFixed(1), y: +boat.pos.y.toFixed(2), fs: +boat.fs.toFixed(1), hp: Math.round(boat.hp) };
    g.vehicles.ejectDriver(boat);
    // helikopter
    pl.pos.set(-300, 0, -60); pl.swimming = false;
    const heli = g.aircraft.add('helikopter', -305, -55, 0);
    g.enterVehicle(heli, true);
    hold('Space', true); sim(8); hold('Space', false);
    R.heliUp = +heli.pos.y.toFixed(1);
    hold('KeyW', true); sim(4); hold('KeyW', false);
    R.heliFwd = { y: +heli.pos.y.toFixed(1), fs: +heli.fs.toFixed(1), hp: Math.round(heli.hp), destroyed: heli.destroyed };
    // uçak (yol üzerinde kalkış)
    const plane = g.aircraft.add('ucak', -500, 400, Math.PI);
    R.planeY0 = plane.pos.y;
    // gemiler
    const fer = g.ships.ships.filter((s) => s.kind === 'ferry').map((s) => [Math.round(s.pos.x), Math.round(s.pos.z), s.mode]);
    sim(20);
    R.ferries0 = fer;
    R.ferries1 = g.ships.ships.filter((s) => s.kind === 'ferry').map((s) => [Math.round(s.pos.x), Math.round(s.pos.z), s.mode]);
    R.ships = g.ships.ships.length;
    R.cargo = g.ships.ships.filter((s) => s.kind === 'cargo' || s.kind === 'tanker').map((s) => [Math.round(s.pos.x), Math.round(s.pos.z)]);
    window.__T = { node: [node.x, node.z], heli };
    return R;
  });
  console.log(JSON.stringify(r, null, 1));
  if (!shots) return;
  // yazılımsal GPU'da çekimi hızlandır
  await p.evaluate(() => { const g = game; if (g.bloom) g.bloom.enabled = false; g.renderer.shadowMap.enabled = false; g.renderer.setPixelRatio(0.6); g.composer.setPixelRatio && g.composer.setPixelRatio(0.6); g.camera.far = 700; g.camera.updateProjectionMatrix(); g.camera.far = 700; g.settings.drawDistance = 600; g.applySettings(); g.camera.far = 700; g.camera.updateProjectionMatrix(); });
  // 1) kavşak + araç yakın çekim
  await p.evaluate(() => {
    const g = game, [nx, nz] = __T.node;
    const types = ['taksi', 'police', 'gt', 'suv', 'dolmus', 'motor', 'ambulans'];
    types.forEach((t, i) => { const v = g.vehicles.add(t, nx - 14 + i * 3.4, nz + 14, Math.PI * 0.85); v.parked = true; v.owned = true; v.ai = null; v.update(0.01); });
    g.env.time = 13; g.env.update(0.01, new THREE_V(nx, 0, nz));
  }).catch(() => {});
  await p.evaluate(() => {
    const g = game, [nx, nz] = __T.node;
    g.mode = 'playing'; g.player.vehicle = null; g.player.pos.set(nx, 0, nz - 30);
    g.env.time = 13; sim(0.1);
    g.camera.position.set(nx - 3, 3.2, nz + 24); g.camera.lookAt(nx - 3, 0.8, nz + 12); g.camera.fov = 55; g.camera.updateProjectionMatrix();
  });
  await shot(p, out + 'veh-cars-intersection.png');
  // 2) Boğaz'da vapur
  await p.evaluate(() => {
    const g = game; const f = g.ships.ships.find((s) => s.kind === 'ferry' && s.mode !== 'dock') || g.ships.ships[0];
    g.mode = 'playing'; g.player.pos.set(f.pos.x - 60, -1.3, f.pos.z); sim(0.1);
    g.camera.position.set(f.pos.x + Math.sin(f.heading + 1.1) * 55, 14, f.pos.z + Math.cos(f.heading + 1.1) * 55); g.camera.lookAt(f.pos.x, 3, f.pos.z); g.camera.fov = 55; g.camera.updateProjectionMatrix();
  });
  await shot(p, out + 'veh-ferry.png');
  // 3) helikopter
  await p.evaluate(() => {
    const g = game, h = __T.heli; g.mode = 'playing'; g.player.vehicle = h; g.player.pos.copy(h.pos); sim(0.1);
    g.camera.position.set(h.pos.x + 12, h.pos.y + 4, h.pos.z + 14); g.camera.lookAt(h.pos.x, h.pos.y + 1.5, h.pos.z); g.camera.fov = 55; g.camera.updateProjectionMatrix();
  });
  await shot(p, out + 'veh-heli.png');
};
