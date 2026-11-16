// Donma avı (Plan 2.0 A1/A2): çarpışma ve 5 yıldız senaryolarında her adımın süresi ve en pahalı alt sistem.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/fz $PWD/scripts/test/freeze-steps.js
//   FZ=crash | FZ=wanted | ikisi (varsayılan)
const H = require('./harness.js');
module.exports = async (p) => {
  const cars = process.env.FZCARS ? JSON.parse(process.env.FZCARS) : null;
  p.setDefaultTimeout(1800000);
  await H.start(p); await H.install(p);
  const which = process.env.FZ || 'crash,wanted';
  const r = await p.evaluate(([which, process_env_FZCARS]) => {
    const g = game, pl = g.player, out = {};
    g.loop = () => {}; pl.god = true;
    // ölçüm sarmalayıcısı: bir nesnenin yöntemlerine toplam süre sayacı
    const prof = {};
    const wrap = (obj, name, label) => {
      if (!obj || typeof obj[name] !== 'function' || obj[name].__w) return;
      const f = obj[name];
      const w = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t; const e = prof[label] || (prof[label] = { n: 0, ms: 0, max: 0 }); e.n++; e.ms += d; if (d > e.max) e.max = d; } };
      w.__w = true; obj[name] = w;
    };
    const step = (n, fn) => {
      const T = [];
      for (let i = 0; i < n; i++) { if (fn) fn(i); const t = performance.now(); window.T += 1 / 30; g.dt = 1 / 30; g.updateGame(1 / 30, window.T); g.input.endFrame(); T.push(performance.now() - t); }
      return T;
    };
    const stats = (T) => { const s = T.slice().sort((a, b) => a - b); return { n: T.length, p50: +s[s.length >> 1].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
    const top = () => Object.entries(prof).sort((a, b) => b[1].max - a[1].max).slice(0, 8).map(([k, e]) => `${k}: max ${e.max.toFixed(1)} ms, top ${e.ms.toFixed(0)} ms, ${e.n}x`);
    const reset = () => { for (const k in prof) delete prof[k]; };

    // gerçek oyunda ses ön örnekleme kuyruğu menüde boşta boşalır; testte boşta zaman yok: önce kuyruğu boşalt (yapay takılmaları ayıkla)
    { const q = g.audio._prewarm; let n = 0; const t = performance.now(); while (q && q.length) { try { q.shift()(); } catch (e) { /* devam */ } n++; } out.prewarm = { tasks: n, ms: Math.round(performance.now() - t) }; }
    // sarmalanacaklar: araç ve savaş yolundaki ağır adaylar
    const V = g.vehicles.list[0] && Object.getPrototypeOf(g.vehicles.list[0]);
    for (const m of ['impact', 'dent', 'detach', 'setPane', 'paneHit', 'damage', 'explode', 'setDoor', 'ownGeo', 'update']) wrap(V, m, 'Vehicle.' + m);
    for (const m of ['crash', 'crashMetal', 'glassBreak', 'glassCrack', 'impact', 'shot', 'explosion']) wrap(g.audio, m, 'audio.' + m);
    for (const m of ['explosion', 'fire', 'update']) wrap(g.combat, m, 'combat.' + m);
    for (const m of ['startPool', 'bleed']) wrap(g.combat, m, 'combat.' + m);
    if (g.combat.glass) wrap(g.combat.glass, 'update', 'glass.update');
    { const A = g.audio, names = new Set(); let o = A; while (o && o !== Object.prototype) { for (const k of Object.getOwnPropertyNames(o)) names.add(k); o = Object.getPrototypeOf(o); }
      for (const k of names) { if (k === 'constructor' || k === 'ctx') continue; let v; try { v = A[k]; } catch (e) { continue; } if (typeof v === 'function') wrap(A, k, 'audio.' + k); } }
    { const E = g.audio.engineSys || g.audio.eng || null; if (E) for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(E))) if (m !== 'constructor') wrap(E, m, 'engine.' + m); }
    if (g.combat.glass) for (const m of ['crack', 'shatter']) wrap(g.combat.glass, m, 'glass.' + m);
    for (const m of ['update', 'addPart']) wrap(g.vehicles, m, 'vehicles.' + m);
    if (g.npcs) for (const m of ['update', 'spawn', 'add', 'spawnAt']) wrap(g.npcs, m, 'npcs.' + m);
    { const n0 = g.npcs.list[0]; const NP = n0 && Object.getPrototypeOf(n0); if (NP) for (const m of ['think', 'update', 'build']) wrap(NP, m, 'npc.' + m); const M0 = n0 && n0.model && Object.getPrototypeOf(n0.model); if (M0) for (const m of ['build', 'animate', 'setLod']) wrap(M0, m, 'model.' + m); }
    if (g.wanted) for (const m of ['update', 'spawnHeli', 'updateHeli', 'dispatchUnit', 'spawnJandarma', 'updateUnits', 'updateTank', 'updateEscalation', 'placeRoadblock', 'lawShot', 'updateSight', 'assignRoles']) wrap(g.wanted, m, 'wanted.' + m);
    if (g.particles) for (const m of ['update', 'explosion', 'sparks', 'impact']) wrap(g.particles, m, 'particles.' + m);

    if (which.includes('crash')) {
      g.vehicles.spawnT = 1e9;
      let E = null; for (const e of g.map.edges) if (e.width >= 12 && (!E || e.len > E.len)) E = e;
      const H0 = Math.atan2(E.b.x - E.a.x, E.b.z - E.a.z);
      const C = [];
      for (const [type, sp] of (process_env_FZCARS || [['sedan', 14], ['sedan', 33], ['gt', 33], ['suv', 25], ['sedan', 20], ['sedan', 33]])) {
        if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle);
        const X = E.a.x + Math.sin(H0) * 30, Z = E.a.z + Math.cos(H0) * 30;
        const v = g.vehicles.add(type, X, Z, H0); g.enterVehicle(v, true); step(2);
        const w = g.vehicles.add('bus', X + Math.sin(H0) * 25, Z + Math.cos(H0) * 25, H0 + Math.PI / 2); // engel: yan duran otobüs
        v.vx = Math.sin(H0) * sp; v.vz = Math.cos(H0) * sp; v.fs = sp;
        reset();
        const T = step(75);
        C.push({ type, kmh: Math.round(sp * 3.6), ...stats(T), top: top().slice(0, 4), hp: Math.round(v.hp) });
        g.vehicles.ejectDriver(v); g.vehicles.remove(v); g.vehicles.remove(w); step(3);
      }
      out.crash = C;
    }
    if (which.includes('wanted')) {
      if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle);
      g.vehicles.spawnT = 0;
      reset();
      const W = g.wanted; const setStars = (s) => { if (W.level < s) W.set(s); else W.heat = Math.max(W.heat, s); W.seenT = 0; W.lostT = 0; };
      setStars(5);
      const T = [], heap = [];
      for (let k = 0; k < 12; k++) { setStars(5); T.push(...step(150)); heap.push(performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1); }
      const cnt = (f) => g.npcs.list.filter(f).length;
      out.wanted = { ...stats(T), over100: T.filter((x) => x > 100).length, top: top(), heapMB: heap, npcs: g.npcs.list.length, army: cnt((n) => n.kind === 'soldier' || n.kind === 'army'), swat: cnt((n) => n.kind === 'swat'), cars: g.vehicles.list.length, stars: W.level };
    }
    return out;
  }, [which, cars]);
  console.log('freeze', JSON.stringify(r, null, 1));
};
