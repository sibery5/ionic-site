// Araç işlev testi (ekran görüntüsüz): cam çatlama/kırılma, parça kopması, patlama taklası, yolcu API'si,
// tank/zırhlı/helikopter/jet silahları, jet kalkışı, teknenin köprü altından geçmesi, iki tekerlekli animasyonu.
const H = require('./harness.js');
module.exports = async (p) => {
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player, R = {}, err = [];
    const T = (name, fn) => { try { R[name] = fn(); } catch (e) { err.push(name + ': ' + e.message + ' ' + (e.stack || '').split('\n')[1]); } };
    g.vehicles.spawnT = 1e9;
    const X = 840, Z = -600;
    pl.pos.set(X, 0, Z + 20);
    sim(0.2);
    T('glass', () => {
      const v = g.vehicles.add('polsuv', X, Z, 0); v.mission = 'prop'; sim(0.1);
      const o = new (pl.pos.constructor)(X, 1.5, Z + 10), d = new (pl.pos.constructor)(0, 0, -1);
      const def = { range: 50, dmg: 10, sound: 'pistol' };
      const st = [];
      for (let i = 0; i < 6; i++) { g.combat.hitscan(pl, o, d, def, o); st.push(v.windows.find((w) => w.p.tag === 'g_ws').state); }
      return { panes: v.windows.length, ws: st, broken: v.glassBroken };
    });
    T('crash', () => {
      const v = g.vehicles.add('sedan', X + 10, Z, 0); v.mission = 'prop'; sim(0.1);
      v.impact(X + 10, Z + 2.4, 0, -1, 20); v.impact(X + 10 + 0.95, Z - 0.3, -1, 0, 16);
      return { detached: [...v.detached], parts: g.vehicles.parts.length };
    });
    T('passenger', () => {
      const v = g.vehicles.add('cabrio', X + 20, Z, 0.5); v.mission = 'prop';
      const n = g.npcs.add('civilian', X + 22, Z);
      const i = v.addPassenger(n); sim(0.5);
      const s1 = { seat: i, seats: v.seats.length, y: +n.pos.y.toFixed(2), d: +Math.hypot(n.pos.x - v.pos.x, n.pos.z - v.pos.z).toFixed(2), sitting: n.sitting };
      v.removePassenger(n);
      return { ...s1, after: !!n.passengerOf };
    });
    T('explode', () => {
      const v = g.vehicles.add('hatch', X + 30, Z, 0); v.mission = 'prop'; sim(0.1);
      v.damage(5000, pl); sim(5.2);
      const a = { destroyed: v.destroyed, flip: v.flip && [+v.flip.x.toFixed(2), +v.flip.z.toFixed(2)], y: +v.pos.y.toFixed(2), lift: +(v.flipLift || 0).toFixed(2), parts: g.vehicles.parts.length };
      sim(4); a.y2 = +v.pos.y.toFixed(2); a.flip2 = v.flip && [+v.flip.x.toFixed(2), +v.flip.z.toFixed(2)];
      return a;
    });
    T('susp', () => {
      const v = g.vehicles.add('offroad', X + 40, Z, 0); v.mission = 'prop';
      v.susp.pv = 0.5; sim(0.2); const a = +v.mesh.userData.chassis.rotation.x.toFixed(3); sim(2); return { kick: a, rest: +v.mesh.userData.chassis.rotation.x.toFixed(3) };
    });
    const ride = (type, x, z, h, keys, sec, mouse) => {
      const v = typeof type !== 'string' ? type : g.vehicles.add(type, x, z, h);
      g.enterVehicle(v, true);
      for (const k of keys) hold(k, true);
      sim(sec, (i) => { if (mouse) { g.input.mouse.left = true; if (i % 15 === 0) g.input.mouse.leftPressed = true; } if (mouse === 'Q' && i % 20 === 0) press('KeyQ'); });
      for (const k of keys) hold(k, false);
      g.input.mouse.left = false;
      return v;
    };
    T('tank', () => { const v = ride('tank', X + 60, Z, Math.PI, [], 1.2, true); const o = { hp: v.hp, reload: +v.reloadT.toFixed(2) }; g.vehicles.ejectDriver(v); return o; });
    T('apc', () => { const v = ride('apc', X + 75, Z, Math.PI, ['KeyW'], 1.5, true); const o = { fs: +v.fs.toFixed(1), yaw: +v.mesh.userData.turret.rotation.y.toFixed(2) }; g.vehicles.ejectDriver(v); return o; });
    T('bike', () => { const v = ride('bisiklet', X + 5, Z + 15, 0, ['KeyW'], 3, false); const o = { fs: +v.fs.toFixed(1), crank: +(v.crank || 0).toFixed(1), pose: !!v.riderPose.pedals, pos: [v.pos.x - X, v.pos.z - Z].map((a) => +a.toFixed(1)), thr: v.controls.throttle, drv: !!v.driver }; g.vehicles.ejectDriver(v); return o; });
    T('heli', () => {
      const v = g.aircraft.add('attackHeli', X + 90, Z + 30, 0);
      const n0 = g.combat.projectiles.length;
      ride(v, 0, 0, 0, ['Space'], 4, 'Q');
      const o = { y: +v.pos.y.toFixed(1), proj: g.combat.projectiles.length - n0 }; g.vehicles.ejectDriver(v); return o;
    });
    T('jet', () => {
      const rw = MAPDATA_RW();
      const v = g.aircraft.add('jet', rw.x, rw.z, rw.h);
      g.enterVehicle(v, true); hold('KeyW', true); hold('ShiftLeft', true);
      hold('Space', true); sim(10); hold('Space', false); hold('KeyW', false); hold('ShiftLeft', false);
      const o = { speed: +(v.speedA || 0).toFixed(1), y: +v.pos.y.toFixed(1), grounded: v.grounded, destroyed: v.destroyed };
      g.vehicles.ejectDriver(v); return o;
    });
    function MAPDATA_RW() { return { x: 946, z: -430, h: Math.PI }; }
    T('boatBridge', () => {
      const v = g.boats.add('surat', 312, -420, Math.PI);
      g.enterVehicle(v, true); pl.pos.set(312, 0, -420); hold('KeyW', true); sim(6); hold('KeyW', false);
      const o = { z: +v.pos.z.toFixed(1), passed: v.pos.z < -465, water: g.physics.inWater(312, -420), fs: +v.fs.toFixed(1), drv: !!v.driver, kind: v.kind }; g.vehicles.ejectDriver(v); return o;
    });
    R.err = err;
    return R;
  });
  console.log('vfunc', JSON.stringify(r, null, 0));
};
