// NPC gezinme testi: çatışmada kaçış (sokak boyunca / kapıdan içeri), duvara yüklenme (sıkışma) ölçümü, engel
// üstünden atlama, binanın arkasına yol bulma, yürüyüşte yaya geçidi ve kalabalık ayrışması.
//   node scripts/test/play.js file://$PWD/app/index.html /tmp/out $PWD/scripts/test/npc-nav-steps.js
const H = require('./harness.js');

module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  await p.evaluate(() => { game.loop = () => {}; game.player.god = true; sim(2); });
  const helpers = () => {
    window.insideWall = (x, z) => {
      const q = { x, z };
      game.physics.resolveCircle(q, 0.1, 0.05, 1.7, 0.45);
      return Math.hypot(q.x - x, q.z - z) > 0.08;
    };
  };
  await p.evaluate(helpers);

  // 1) kaçış: oyuncu silah sesi → çevredeki siviller
  const flee = await p.evaluate(() => {
    const g = game, pl = g.player;
    g.npcs.clear();
    for (let i = 0; i < 40; i++) g.npcs.spawnCivilian(pl.pos.x, pl.pos.z);
    // yakına da sivil koy
    for (let i = 0; i < 14; i++) { const s = g.npcs.sidewalkSpot(pl.pos.x, pl.pos.z, 4, 22); if (s) { const n = g.npcs.add('civilian', s.x, s.z); n.side = s.fwd ? s.side : -s.side; n.prev = s.fwd ? s.e.a : s.e.b; n.cur = s.fwd ? s.e.b : s.e.a; n.planWalk(); } }
    sim(1);
    const civ = g.npcs.list.filter((n) => n.faction === 'civilian' && !n.dead && Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z) < 45);
    const d0 = new Map(civ.map((n) => [n, Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z)]));
    for (const n of civ) n.hearThreat(pl, 5);
    const st = new Map(civ.map((n) => [n, { push: 0, inside: 0, lx: n.pos.x, lz: n.pos.z, vault: 0, water: 0 }]));
    for (let f = 0; f < 30 * 14; f++) {
      sim(1 / 30);
      for (const n of civ) {
        if (!g.npcs.list.includes(n)) continue;
        const s = st.get(n);
        const mv = Math.hypot(n.pos.x - s.lx, n.pos.z - s.lz);
        // hareket etmeye çalışıp ilerleyemiyor (duvara yüklenme)
        if (n.state === 'flee' && n.reactT <= 0 && n.speed > 2 && mv < n.speed * (1 / 30) * 0.25) s.push++;
        if (insideWall(n.pos.x, n.pos.z)) s.inside++;
        if (n.vaultT > 0) s.vault++;
        if (n.swimming) s.water++;
        s.lx = n.pos.x; s.lz = n.pos.z;
      }
    }
    let gone = 0, push = 0, inside = 0, vault = 0, water = 0, gained = 0, cnt = 0, worstPush = 0;
    for (const n of civ) {
      const s = st.get(n);
      push += s.push; inside += s.inside; vault += s.vault; water += s.water; worstPush = Math.max(worstPush, s.push);
      if (!g.npcs.list.includes(n)) { gone++; continue; }
      gained += Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z) - d0.get(n); cnt++;
    }
    return { n: civ.length, enteredDoors: gone, avgDistGain: +(gained / Math.max(1, cnt)).toFixed(1), pushFrames: push, worstPushFrames: worstPush, insideFrames: inside, vaultFrames: vault, waterFrames: water };
  });
  console.log('flee', JSON.stringify(flee));

  // 2) alçak engel: NPC hedefe giderken önündeki uzun alçak çiti atlamalı
  const vault = await p.evaluate(() => {
    const g = game, pl = g.player, ph = g.physics;
    g.npcs.clear();
    // açık alan: oyuncunun yakınındaki düğüm (kavşak ortası)
    const node = g.map.nearestNode(pl.pos.x, pl.pos.z);
    pl.pos.set(node.x + 30, 0, node.z + 30);
    const fence = ph.city.add(node.x - 20, node.z - 0.15, node.x + 20, node.z + 0.15, 0, 1.0, 'testFence');
    const n = g.npcs.add('gang', node.x + 1, node.z - 3, null, { state: 'idle' });
    n.state = 'move'; n.path = [{ x: node.x + 1, z: node.z + 3, r: 0.6 }]; n.moveSpeed = 4.5; n.afterMove = 'idle';
    let vaulted = 0, arrived = -1, inside = 0;
    for (let f = 0; f < 30 * 6; f++) { sim(1 / 30); if (n.vaultT > 0) vaulted++; if (insideWall(n.pos.x, n.pos.z) && !n.vault) inside++; if (arrived < 0 && n.state === 'idle') arrived = f / 30; }
    ph.city.remove(fence);
    const r = { vaultFrames: vaulted, arrivedS: arrived, z: +(n.pos.z - node.z).toFixed(2), inside };
    g.npcs.remove(n);
    return r;
  });
  console.log('vault', JSON.stringify(vault));

  // 3) bina arkasına yol: NPC bir bina bloğunun bir yüzünden diğer yüzüne
  const around = await p.evaluate(() => {
    const g = game, pl = g.player;
    g.npcs.clear();
    // oyuncuya yakın, kısa kenarlı bir bina
    let bb = null, bd = 1e9;
    for (const b of g.map.buildings) { const w = b.x1 - b.x0; const d = Math.hypot((b.x0 + b.x1) / 2 - pl.pos.x, (b.z0 + b.z1) / 2 - pl.pos.z); if (w < 16 && d < bd) { bd = d; bb = b; } }
    const nz = bb.door.nz || 1;
    const sx = (bb.x0 + bb.x1) / 2, sz = nz > 0 ? bb.z1 + 2 : bb.z0 - 2;
    // hedef: binanın yan tarafının ötesi (bina dizisi boyunca köşeyi dönmek gerekebilir)
    const fr = { x: 0, z: 0 }; g.physics.nav.nearestFree(bb.x1 + 6, nz > 0 ? bb.z0 - 2.5 : bb.z1 + 2.5, 12, fr);
    const tx = fr.x, tz = fr.z;
    const n = g.npcs.add('police', sx, sz, null, { state: 'idle' });
    n.state = 'move'; n.path = [{ x: tx, z: tz, r: 1.2 }]; n.moveSpeed = 4.5; n.afterMove = 'idle';
    let arrived = -1, inside = 0, push = 0, lx = n.pos.x, lz = n.pos.z;
    for (let f = 0; f < 30 * 30; f++) {
      sim(1 / 30);
      if (insideWall(n.pos.x, n.pos.z) && !n.vault) inside++;
      if (n.speed > 2 && Math.hypot(n.pos.x - lx, n.pos.z - lz) < 0.03) push++;
      lx = n.pos.x; lz = n.pos.z;
      if (n.state === 'idle') { arrived = f / 30; break; }
    }
    const r = { arrivedS: arrived, inside, pushFrames: push, rem: +Math.hypot(n.pos.x - tx, n.pos.z - tz).toFixed(1), nav: g.physics.nav.stats };
    g.npcs.remove(n);
    return r;
  });
  console.log('around', JSON.stringify(around));

  // 4) sakin yürüyüş: 40 sn sivil trafiği; duvara girme, sıkışma, suya düşme
  const walk = await p.evaluate(() => {
    const g = game, pl = g.player;
    g.npcs.clear();
    pl.pos.set(-300, 0, -60);
    for (let i = 0; i < 40; i++) g.npcs.spawnCivilian(pl.pos.x, pl.pos.z);
    const st = new Map();
    let inside = 0, waits = 0, water = 0, stuck = 0, frames = 0;
    for (let f = 0; f < 30 * 40; f++) {
      sim(1 / 30);
      for (const n of g.npcs.list) {
        if (n.dead || n.state !== 'walk') continue;
        const d = Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z);
        if (d > 60) continue;
        frames++;
        let s = st.get(n); if (!s) { s = { lx: n.pos.x, lz: n.pos.z, still: 0 }; st.set(n, s); }
        if (insideWall(n.pos.x, n.pos.z)) inside++;
        if (n.swimming) water++;
        if (n.crossWait > 0) waits++;
        const mv = Math.hypot(n.pos.x - s.lx, n.pos.z - s.lz);
        if (n.speed > 0.8 && mv < 0.004) { s.still++; if (s.still === 45) stuck++; } else s.still = 0;
        s.lx = n.pos.x; s.lz = n.pos.z;
      }
    }
    return { npcFrames: frames, insideFrames: inside, crossWaitFrames: waits, waterFrames: water, stuckEvents: stuck };
  });
  console.log('walk', JSON.stringify(walk));

  const fails = [];
  if (flee.insideFrames > flee.n * 3) fails.push('kaçarken duvar içinde');
  if (flee.pushFrames > flee.n * 20) fails.push('kaçarken duvara yüklenme: ' + flee.pushFrames);
  if (flee.avgDistGain < 5 && flee.enteredDoors < flee.n * 0.3) fails.push('kaçış uzaklaşmıyor');
  if (flee.waterFrames > 0) fails.push('kaçan suya düştü');
  if (vault.vaultFrames < 3 || vault.arrivedS < 0) fails.push('alçak engel atlanmadı');
  if (around.arrivedS < 0) fails.push('bina arkasına yol bulunamadı');
  if (around.inside > 2) fails.push('bina içinden geçti');
  if (walk.insideFrames > walk.npcFrames * 0.01) fails.push('yürürken duvar içinde');
  if (walk.stuckEvents > 3) fails.push('yürürken sıkışma: ' + walk.stuckEvents);
  console.log(fails.length ? 'FAIL ' + JSON.stringify(fails) : 'npc-nav OK');
};
