// Sürüş kare süresi sondası: hızlı sürüşte (trafik akışı, parça/araç akışı, gölge) her mantık adımının CPU süresi.
// Çıktı: p50/p95/max (ms), 8 ms üstü adım sayısı ve sıçramalarda en çok süre alan alt sistemler; seyrek çizim süresi ayrı.
// SwiftShader GPU süresi ölçülmez (yazılımsal) — CPU tarafı takılmalar (bellek ayırma, akış, yapay zekâ) ölçülür.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/dp $PWD/scripts/test/driveperf-steps.js
const H = require('./harness.js');
module.exports = async (p) => {
  p.setDefaultTimeout(1800000);
  await H.start(p); await H.install(p);
  const SEC = +(process.env.DP_SEC || 40), RN = +(process.env.DP_RENDER || 0);
  const r = await p.evaluate(([SEC, RN]) => {
    const g = game, pl = g.player;
    g.loop = () => {}; pl.god = true;
    // tekrarlanabilir rota/olaylar: önce/sonra karşılaştırması için sabit tohumlu Math.random
    let seed = +(window.__seed || 7); Math.random = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const acc = {};
    const wrap = (obj, fn, name) => { if (!obj || typeof obj[fn] !== 'function') return; const o = obj[fn].bind(obj); obj[fn] = (...a) => { const t = performance.now(); const r = o(...a); acc[name] = (acc[name] || 0) + performance.now() - t; return r; }; };
    for (const k of ['player', 'npcs', 'vehicles', 'combat', 'wanted', 'law', 'missions', 'social', 'life', 'ui', 'env', 'city', 'traffic', 'boats', 'aircraft', 'ships', 'animals', 'particles', 'pickups', 'nightLights']) wrap(g[k], 'update', k);
    wrap(g.vehicles, 'spawnTraffic', 'spawnTraffic'); wrap(g.vehicles, 'spawnParked', 'spawnParked'); wrap(g.npcs, 'spawnCivilian', 'spawnCivilian');
    wrap(g.audio, 'setEngine', 'audioEngine');
    // ayrıntılı: ses sentez bankaları, araç/karakter kurulumu, parçacık patlamaları, sokak eşyası kırılması
    for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(g.audio))) if (/bank|Bank|synth|crash|glass|prewarm|explosion|step$/.test(k)) wrap(g.audio, k, 'a.' + k);
    for (const k of ['explosion', 'sparks', 'dust', 'fire', 'smoke']) wrap(g.particles, k, 'p.' + k);
    if (g.physics) wrap(g.physics, 'breakProp', 'breakProp');
    for (const k of ['update', 'stream', 'updateChunks']) if (g.city) wrap(g.city, k, 'city.' + k);
    const VP = Object.getPrototypeOf(g.vehicles.list[0] || {}); if (VP && VP.damage) { for (const k of ['damage', 'impact', 'setPane', 'detach', 'updateSuspension', 'dent']) if (VP[k]) { const o = VP[k]; VP[k] = function (...a) { const t = performance.now(); const r = o.apply(this, a); acc['v.' + k] = (acc['v.' + k] || 0) + performance.now() - t; return r; }; } }
    wrap(g.vehicles, 'add', 'vehAdd');
    for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(g.combat))) if (k !== 'update' && k !== 'constructor' && typeof g.combat[k] === 'function') wrap(g.combat, k, 'c.' + k);
    if (g.combat.glass) wrap(g.combat.glass, 'update', 'c.glass');
    // otopilot: trafik YZ'si oyuncunun aracını yol ağında sürer (girdi tuşlara çevrilir) -> gerçekçi akış/yayılma
    let v = null; for (let k = 0; k < 40 && !v; k++) v = g.vehicles.spawnTraffic(pl.pos.x, pl.pos.z, 'sedan');
    const ai = v.ai; ai.cruise = 24; v.ai = null; g.enterVehicle(v, true); g.wanted.set(0);
    const pilot = () => { v.ai = ai; g.vehicles.driveAI(v, 1 / 30); v.ai = null; const c = v.controls; hold('KeyW', c.throttle > 0.05); hold('KeyS', c.throttle < -0.3); hold('KeyA', c.steer > 0.15); hold('KeyD', c.steer < -0.15); hold('Space', false); };
    for (let i = 0; i < 60; i++) { pilot(); sim(1 / 30); }
    g.render();
    let dist = 0, px = v.pos.x, pz = v.pos.z;
    const dt = 1 / 30, steps = [], spikes = [], rend = [];
    let gcGuess = 0;
    for (let i = 0; i < SEC * 30; i++) {
      for (const k in acc) acc[k] = 0;
      // yol boyunca yön: arada bir direksiyon, hızlı sürüş
      pilot();
      if (window.__dbg && i % 150 === 0) console.log('pilot', i, Math.round(v.fs), JSON.stringify(v.controls), ai.mode, ai.frozen || 0, (v.pos.x | 0) + ',' + (v.pos.z | 0));
      if (v.hp < v.def.hp * 0.5) v.hp = v.def.hp; // sondada araç bozulmasın
      const t = performance.now();
      window.T += dt; g.dt = dt; g.updateGame(dt, window.T); g.input.endFrame();
      const ms = performance.now() - t;
      steps.push(ms); dist += Math.hypot(v.pos.x - px, v.pos.z - pz); px = v.pos.x; pz = v.pos.z;
      if (ms > 8) { const top = Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0] + ':' + e[1].toFixed(1)).join(' '); const sum = Object.values(acc).reduce((a, b) => a + b, 0); if (ms - sum > 6) gcGuess++; spikes.push(ms.toFixed(1) + ' ' + top); }
      if (RN && i % RN === RN - 1) { const r0 = performance.now(); g.render(); rend.push(performance.now() - r0); }
    }
    for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) hold(k, false); g.wanted.set(0);
    const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(2); };
    const h2 = steps.slice(steps.length >> 1);
    return { n: steps.length, late: { p50: q(h2, 0.5), p95: q(h2, 0.95), max: q(h2, 1), over16: h2.filter((x) => x > 16).length }, p50: q(steps, 0.5), p95: q(steps, 0.95), p99: q(steps, 0.99), max: q(steps, 1), over8: steps.filter((x) => x > 8).length, over16: steps.filter((x) => x > 16).length, gcLike: gcGuess,
      render: rend.length ? { p50: q(rend, 0.5), max: q(rend, 1) } : null, speed: +Math.hypot(v.vx, v.vz).toFixed(1), avgKmh: +(dist / SEC * 3.6).toFixed(0), wanted: g.wanted.level, cars: g.vehicles.list.length, npcs: g.npcs.list.length, spikes: spikes.sort((a, b) => parseFloat(b) - parseFloat(a)).slice(0, 12) };
  }, [SEC, RN]);
  console.log('driveperf', JSON.stringify(r));
};
