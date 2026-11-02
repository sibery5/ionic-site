// NPC çatışma taktiği testi: etkili menzil dışındaki NPC'ler yaklaşır; ateş altındayken çoğunlukla tehdide dönük kalır.
//   SETTINGS='{"quality":"low"}' node scripts/test/play.js file://$PWD/app/index.html $PWD/.testout/tac $PWD/scripts/test/tactics-steps.js
const H = require('./harness.js');

module.exports = async (p) => {
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.setDefaultTimeout(600000);
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  await H.start(p);
  await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player;
    g.loop = () => {};
    g.render = () => {};
    pl.god = true;
    for (const n of g.npcs.list.slice()) if (!n.mission) g.npcs.remove(n);
    // uzun düz bir yol kenarı bul
    let best = null;
    for (const n of g.map.nodes) for (const e of n.edges) { const o = g.map.other(e, n); const L = Math.hypot(o.x - n.x, o.z - n.z); if (L > 75 && (!best || Math.hypot(n.x + 150, n.z + 200) < best.k)) best = { n, o, L, k: Math.hypot(n.x + 150, n.z + 200) }; }
    const { n, o, L } = best;
    const fx = (o.x - n.x) / L, fz = (o.z - n.z) / L;
    pl.pos.set(n.x + fx * 5, 0, n.z + fz * 5);
    const team = [];
    const mk = (kind, w, dist, lat) => { const a = g.npcs.add(kind, n.x + fx * dist - fz * lat, n.z + fz * dist + fx * lat, null, { weapon: w, hostile: true, state: 'idle', persistent: true, gang: 'test' }); a.hostile = true; a.maxHp = a.hp = 5000; a.engage(pl, 0.3); team.push(a); return a; };
    mk('gang', 'pistol', 60, 2); mk('gang', 'pistol', 62, -2); mk('gang', 'uzi', 64, 0);
    mk('gang', 'm4', 72, 3); mk('gang', 'ak', 74, -3);
    const dist = (a) => Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z);
    // atış mesafesi kaydı: her başarılı NPC atışında mesafe / etkili menzil oranı
    const shotsK = [], RGs = { pistol: 25, uzi: 22, m4: 45, ak: 45 };
    for (const a of team) { const tf = Object.getPrototypeOf(a).tryFire; const w = a.weapon; a.tryFire = function (o, d) { const ok = tf.call(this, o, d); if (ok) shotsK.push(dist(this) / RGs[w]); return ok; }; }
    const d0 = team.map(dist);
    const trace = []; sim(12, (i) => { if (i % 45 === 0) trace.push(team.map((a) => a.state[0] + a.tac[0] + Math.round(dist(a)) + (a.los ? "L" : "-")).join(" ")); });
    const d1 = team.map(dist);
    // ateş altında yönelme: oyuncu sırayla NPC'lerin yakınına ateş eder
    const nApproach = shotsK.length;
    let face = 0, tot = 0, k = 0, mFace = 0, mTot = 0, crouch = 0;
    const o3 = pl.pos.clone();
    sim(6, (i) => {
      if (i % 8 === 0) {
        const a = team[k++ % team.length];
        o3.set(pl.pos.x, pl.pos.y + 1.45, pl.pos.z);
        const d = a.pos.clone(); d.y += 1.1; d.x += (Math.random() - 0.5) * 0.4; d.sub(o3).normalize();
        g.combat.hitscan(pl, o3, d, { dmg: 5, range: 150, sound: 'pistol' }, o3);
        g.combat.noise(pl.pos.x, pl.pos.z, 60, pl);
      }
      if (i % 3 === 0) for (const a of team) {
        if (a.dead || a.downed) continue;
        const want = Math.atan2(pl.pos.x - a.pos.x, pl.pos.z - a.pos.z);
        let df = want - a.heading; df = Math.atan2(Math.sin(df), Math.cos(df));
        tot++; if (Math.abs(df) < 1.25) face++;
        if (a.speed > 0.8) { mTot++; if (Math.abs(df) < 1.25) mFace++; }
        if (a.crouch) crouch++;
      }
    });
    const far = shotsK.filter((x) => x > 1.35).length;
    return { d0: d0.map(Math.round), d1: d1.map(Math.round), face: +(face / Math.max(1, tot)).toFixed(2), mFace: +(mFace / Math.max(1, mTot)).toFixed(2), mTot, crouch: +(crouch / Math.max(1, tot)).toFixed(2),
      shots: shotsK.length, nApproach, far, maxK: +Math.max(0, ...shotsK).toFixed(2), tacs: team.map((a) => a.tac), states: team.map((a) => a.state), trace };
  });
  console.log('taktik:', JSON.stringify(r));
  const maxR = [25, 25, 22, 45, 45];
  const closed = r.d1.filter((d, i) => d <= maxR[i] + 8 || d < r.d0[i] * 0.6).length;
  check(closed >= 4, `Menzil dışındakiler yaklaştı (${closed}/5): ${r.d0} -> ${r.d1}`);
  check(r.face >= 0.6, `Ateş altında tehdide dönük (oran ${r.face})`);
  check(r.mTot >= 20 && r.mFace >= 0.75, `Ateş altında HAREKET EDERKEN tehdide dönük (oran ${r.mFace}, örnek ${r.mTot})`);
  check(r.shots >= 5 && r.far / r.shots <= 0.05, `Atışların etkili menzil içinde olanı (${r.shots - r.far}/${r.shots}, en uzak ${r.maxK}× menzil)`);
  console.log('   (bilgi) ateş altında çömelme oranı:', r.crouch);

  // ---------------- polis: uzaktan ateş etmez, siperden sipere yaklaşır ----------------
  const pol = await p.evaluate(() => {
    const g = game, pl = g.player;
    for (const n of g.npcs.list.slice()) if (!n.mission) g.npcs.remove(n);
    g.wanted.set(3); g.wanted.dispatchT = 999; g.wanted.swatT = 999; g.wanted.roadblockT = 999; g.wanted.heliT = 999;
    const f = { x: Math.sin(pl.camYaw), z: Math.cos(pl.camYaw) };
    let best = null;
    for (const n of g.map.nodes) for (const e of n.edges) { const o = g.map.other(e, n); const L = Math.hypot(o.x - n.x, o.z - n.z); if (L > 75 && (!best || Math.hypot(n.x - 200, n.z + 100) < best.k)) best = { n, o, L, k: Math.hypot(n.x - 200, n.z + 100) }; }
    const { n, o, L } = best; const fx = (o.x - n.x) / L, fz = (o.z - n.z) / L;
    pl.pos.set(n.x + fx * 4, 0, n.z + fz * 4);
    void f;
    const cops = [];
    for (let i = 0; i < 4; i++) { const c = g.npcs.add('police', n.x + fx * (66 + i * 3) - fz * (i % 2 ? 2 : -2), n.z + fz * (66 + i * 3) + fx * (i % 2 ? 2 : -2), null, { weapon: 'pistol', persistent: true, state: 'idle' }); c.maxHp = c.hp = 5000; c.engage(pl, 0.3); cops.push(c); }
    const dist = (a) => Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z);
    const shotD = [];
    for (const c of cops) { const tf = Object.getPrototypeOf(c).tryFire; c.tryFire = function (o2, d) { const ok = tf.call(this, o2, d); if (ok) shotD.push(dist(this)); return ok; }; }
    const d0 = cops.map(dist);
    let k = 0;
    const o3 = pl.pos.clone();
    // oyuncu ara ara polislere ateş eder (uzaktan): yine de yaklaşmalılar, menzil dışından karşılık vermemeliler
    sim(16, (i) => {
      if (i % 20 === 0) {
        const a = cops[k++ % cops.length];
        o3.set(pl.pos.x, pl.pos.y + 1.45, pl.pos.z);
        const d = a.pos.clone(); d.y += 1.1; d.x += 1.2; d.sub(o3).normalize();
        g.combat.hitscan(pl, o3, d, { dmg: 5, range: 150, sound: 'pistol' }, o3);
        g.combat.noise(pl.pos.x, pl.pos.z, 90, pl);
      }
    });
    const d1 = cops.map(dist);
    shotD.sort((a, b) => a - b);
    const res = { d0: d0.map(Math.round), d1: d1.map(Math.round), shots: shotD.length, maxShot: Math.round(shotD[shotD.length - 1] || 0), med: Math.round(shotD[shotD.length >> 1] || 0), tacs: cops.map((c) => c.tac), states: cops.map((c) => c.state[0] + (c.los ? 'L' : '-') + (c.slotted ? 'S' : '')), lvl: g.wanted.level };
    g.wanted.reset(); g.npcs.calmPolice();
    return res;
  });
  console.log('polis:', JSON.stringify(pol));
  check(pol.d1.filter((d) => d < 38).length >= 3, `Tabancalı polisler etkili menzile yaklaştı (${pol.d0} -> ${pol.d1})`);
  check(pol.maxShot <= 34, `Polis tabancayla çok uzaktan ateş etmedi (en uzak atış ${pol.maxShot} m, ortanca ${pol.med} m, ${pol.shots} atış)`);
  console.log('KONSOL HATALARI:', errs.length); for (const e of errs.slice(0, 5)) console.log('  ', e.slice(0, 300));
  if (errs.length || fails.length) process.exitCode = 1;
};
