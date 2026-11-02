// Araç vitrini ekran görüntüleri (havalimanı apronu): 1) yeni otomobiller 2) cabrio + yolcu, bisiklet, motosiklet 3) askerî
const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  await p.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
  const setup = (scene) => p.evaluate((scene) => {
    const g = game, pl = g.player;
    g.env.time = 13; g.env.weather = 'clear'; g.env.weatherTimer = 9999;
    g.vehicles.spawnT = 1e9;
    for (const v of g.vehicles.list.slice()) if (v !== pl.vehicle) g.vehicles.remove(v);
    const V = (x, y, z) => ({ isVector3: true, x, y, z });
    const Z0 = -650, X0 = 830;
    const row = (types, gap, h) => { let x = X0; return types.map((t) => {
      const air = g.aircraft.types[t];
      const v = air ? g.aircraft.add(t, 0, 0, 0) : g.vehicles.add(t, 0, 0, 0);
      const L = Math.max(v.def.wid, v.def.span || 0, v.def.len * 0.55); x += L / 2 + gap;
      v.pos.x = x; v.pos.z = Z0; v.heading = h; v.mission = 'prop'; x += L / 2 + gap; return v; }); };
    let cam;
    if (scene === 1) {
      const vs = row(['hatch3', 'hatch', 'estate', 'coupe', 'cabrio', 'offroad', 'polsuv'], 0.5, -Math.PI / 2 - 0.6);
      const cx = (vs[0].pos.x + vs[vs.length - 1].pos.x) / 2;
      pl.pos.set(cx, 0, Z0 - 25);
      cam = { pos: V(cx, 3.2, Z0 - 13.5), look: V(cx, 0.7, Z0) };
    } else if (scene === 2) {
      const vs = row(['cabrio', 'bisiklet', 'motor'], 1.0, -Math.PI / 2 - 0.9);
      const [c, b, m] = vs;
      const drv = g.npcs.add('civilian', c.pos.x, c.pos.z - 3); c.driver = drv; drv.model.root.visible = false;
      const gf = g.npcs.add('civilian', c.pos.x + 2, c.pos.z - 3); c.addPassenger(gf);
      for (const t of [b, m]) { const n = g.npcs.add('civilian', t.pos.x, t.pos.z - 3); t.driver = n; n.model.root.visible = false; t.controls.throttle = 1; }
      b.crank = 1.1;
      pl.pos.set(c.pos.x, 0, Z0 - 30);
      const cx = (c.pos.x + m.pos.x) / 2;
      cam = { pos: V(cx - 1, 2.6, Z0 - 7.5), look: V(cx, 0.8, Z0) };
      window.__s2 = { c, gf };
    } else {
      const vs = row(['tank', 'apc', 'askkamyon', 'jet'], 1.5, -Math.PI / 2 - 0.7);
      const hl = g.aircraft.add('attackHeli', vs[1].pos.x, Z0 + 18, -0.6); hl.mission = 'prop';
      const w = g.vehicles.add('hatch', vs[0].pos.x - 2, Z0 - 9, 0.3); w.mission = 'prop';
      w.damage(5000, null);
      const cx = (vs[0].pos.x + vs[3].pos.x) / 2;
      pl.pos.set(cx, 0, Z0 - 45);
      cam = { pos: V(cx - 4, 7, Z0 - 26), look: V(cx, 1.5, Z0 + 2) };
    }
    sim(scene === 3 ? 6.5 : 0.4);
    if (scene === 2) { const { c, gf } = window.__s2; c.placePassengers(); gf.model.root.visible = true; }
    g.cutsceneCam = cam;
    sim(0.03);
    if (scene === 2) window.__s2.c.placePassengers();
    let dc = 0; for (const v of g.vehicles.list) v.mesh.traverse((m) => { if (m.isMesh && m.visible) dc++; });
    return { n: g.vehicles.list.length, meshes: dc };
  }, scene);
  for (const s of (process.env.SCENES || '1,2,3').split(',').map(Number)) {
    console.log('scene', s, JSON.stringify(await setup(s)));
    await H.shot(p, `${out}-v${s}.png`); console.log('shot', `${out}-v${s}.png`);
  }
};
