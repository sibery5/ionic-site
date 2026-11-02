// Araç vitrini: verilen türler havalimanı apronunda (açık, düz alan) sıra hâlinde.
// Kullanım: TYPES='a,b' ROWS=2 VIEW=side|top EXTRA='js ifadesi' SHOTS=0
const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  await p.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
  const res = await p.evaluate(({ types, view, rows }) => {
    const g = game, pl = g.player;
    g.env.time = 12.5; g.env.weather = 'clear'; g.env.weatherTimer = 9999;
    for (const v of g.vehicles.list.slice()) g.vehicles.remove(v);
    g.vehicles.spawnT = 1e9;
    const list = types.split(',');
    const X0 = 820, Z0 = -640;
    const out = []; const made = []; const per = Math.ceil(list.length / rows);
    let s = 0, row = 0, maxS = 0;
    list.forEach((t, i) => {
      if (i > 0 && i % per === 0) { row++; maxS = Math.max(maxS, s); s = 0; }
      let v = null;
      try {
        const air = g.aircraft && g.aircraft.types && g.aircraft.types[t];
        const sea = g.boats && g.boats.types && g.boats.types[t];
        v = air ? g.aircraft.add(t, 0, 0, 0) : sea ? g.boats.add(t, 0, 0, 0) : g.vehicles.add(t, 0, 0, 0);
      } catch (err) { out.push(t + ':ERR ' + err.message + ' ' + (err.stack || '').split('\n').slice(1, 3).join(' ')); return; }
      const L = Math.max(v.def.wid, v.def.span || 0, v.def.len * 0.6);
      s += L / 2 + 0.8;
      v.pos.x = X0 + s; v.pos.z = Z0 - row * 9; v.pos.y = Math.max(0, v.pos.y);
      v.heading = Math.PI / 2 + 0.55;
      v.mission = 'prop';
      s += L / 2 + 0.8; made.push(v);
      let dc = 0; v.mesh.traverse((m) => { if (m.isMesh && m.visible) dc++; }); out.push(t + ':' + dc);
    });
    maxS = Math.max(maxS, s);
    pl.pos.set(X0 + maxS / 2, 0, Z0 + 30);
    sim(0.3);
    const cx = X0 + maxS / 2, cz = Z0 - row * 4.5;
    const dist = Math.max(8, maxS * 0.62);
    const V = (x, y, z) => ({ isVector3: true, x, y, z });
    g.cutsceneCam = view === 'top'
      ? { pos: V(cx, dist * 0.9, cz + dist * 0.6), look: V(cx, 0.5, cz) }
      : { pos: V(cx, Math.max(2.6, dist * 0.2 + row * 2), cz + dist), look: V(cx, 0.9, cz) };
    sim(0.05);
    window.__made = made;
    return out;
  }, { types: process.env.TYPES || 'kartal,taksi,sedan,suv,gt,police', view: process.env.VIEW || 'side', rows: +(process.env.ROWS || 1) });
  console.log('lineup', JSON.stringify(res));
  if (process.env.SHOTS !== '0' && process.env.MAINSHOT !== '0') { await H.shot(p, out + '-lineup.png'); console.log('shot', out + '-lineup.png'); }
  if (process.env.EXTRA) {
    const r = await p.evaluate(process.env.EXTRA); console.log('extra', JSON.stringify(r));
    if (process.env.SHOTS !== '0' && process.env.EXTRASHOT !== '0') { await H.shot(p, out + '-extra.png'); console.log('shot', out + '-extra.png'); }
  }
};
