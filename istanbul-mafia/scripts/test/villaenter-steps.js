// [V3] Villaya ilk giriş/çıkış ve ilk teras ziyareti donması: kare kare güncelleme + çizim süresi, en pahalı alt sistem (sarmalayıcı).
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/ve $PWD/scripts/test/villaenter-steps.js
// Yazılımsal çizicide tam kare çizimi zaten pahalıdır: kabul ölçütü olarak "sıçrama" = kare − aynı kamerada olağan kare ortancası
// (çizim) ve güncelleme süresi ayrı verilir. Ölçümden önce ses ön örnekleme kuyruğu boşaltılır (BEYIN 1.11).
const H = require('./harness.js');
module.exports = async (p) => {
  p.setDefaultTimeout(1800000);
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player, out = {};
    g.loop = () => {}; g.suppressPause = true; pl.god = true;
    { const q = g.audio._prewarm; let n = 0; while (q && q.length) { try { q.shift()(); } catch (e) { /* devam */ } n++; } out.prewarm = n; }
    if (window.__villaWarm) { const t = performance.now(); window.__villaWarm(); out.warmMs = Math.round(performance.now() - t); }
    const prof = {};
    const wrap = (obj, name, label) => {
      if (!obj || typeof obj[name] !== 'function' || obj[name].__w) return;
      const f = obj[name];
      const w = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t; const e = prof[label] || (prof[label] = { n: 0, ms: 0, max: 0 }); e.n++; e.ms += d; if (d > e.max) e.max = d; } };
      w.__w = true; obj[name] = w;
    };
    const R = g.renderer;
    { const C = Object.getPrototypeOf(g.combat); for (const k of Object.getOwnPropertyNames(C)) if (k !== 'constructor' && k !== 'update' && typeof C[k] === 'function') wrap(g.combat, k, 'combat.' + k); }
    if (g.combat.reticle) wrap(g.combat.reticle, 'update', 'reticle.update');
    wrap(g.interiors, 'enter', 'interiors.enter'); wrap(g.interiors, 'exit', 'interiors.exit');
    wrap(g.villa, 'buildInterior', 'villa.buildInterior'); wrap(g.villa, 'update', 'villa.update');
    wrap(R, 'compile', 'renderer.compile'); wrap(g, 'render', 'game.render');
    wrap(g.npcs, 'update', 'npcs.update'); wrap(g.npcs, 'add', 'npcs.add'); wrap(g.npcs, 'unstash', 'npcs.unstash'); wrap(g.npcs, 'stash', 'npcs.stash');
    for (const k of ['door', 'glassBreak', 'glassCrack']) wrap(g.audio, k, 'audio.' + k);
    for (const k of ['player', 'seating', 'cityLife', 'env', 'combat', 'particles', 'pickups', 'wanted', 'law', 'missions', 'social', 'life', 'ui', 'city', 'perf']) if (g[k]) wrap(g[k], 'update', k + '.update');
    wrap(g, 'autosaveTick', 'autosaveTick'); wrap(g.ui, 'locationBanner', 'ui.locationBanner'); wrap(g.missions, 'onEnter', 'missions.onEnter');
    if (g.villaGlass) for (const k of ['hit', 'update']) wrap(g.villaGlass, k, 'villaGlass.' + k);
    const top = () => Object.entries(prof).sort((a, b) => b[1].max - a[1].max).slice(0, 12).map(([k, e]) => `${k}: max ${e.max.toFixed(1)} ms, ${e.n}x`);
    const reset = () => { for (const k in prof) delete prof[k]; };
    // kare: güncelleme + çizim (ayrı ölçülür)
    const frames = (n, fn) => {
      const U = [], D = [];
      for (let i = 0; i < n; i++) {
        let t = performance.now();
        if (fn) fn(i); // giriş/çıkış işi de o karenin içindedir
        window.T += 1 / 30; g.dt = 1 / 30; g.updateGame(1 / 30, window.T); g.input.endFrame(); U.push(performance.now() - t);
        t = performance.now(); g.render(); D.push(performance.now() - t);
      }
      return { U, D };
    };
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    const sum = (F, base) => {
      const tot = F.U.map((u, i) => u + F.D[i]);
      const spike = F.D.map((d, i) => F.U[i] + Math.max(0, d - base));
      return { maxUpd: +Math.max(...F.U).toFixed(1), maxDraw: +Math.max(...F.D).toFixed(1), drawMed: +med(F.D).toFixed(1), maxSpike: +Math.max(...spike).toFixed(1), over100: spike.filter((x) => x > 100).length, maxTot: +Math.max(...tot).toFixed(1) };
    };
    const ent = () => { const it = g.findInteraction(); if (!it || !/Villan/.test(it.label)) return 'yok:' + (it && it.label); it.action(); if (pl.inInterior) { wrap(pl.inInterior, 'update', 'ctx.update'); wrap(pl.inInterior.scene, 'traverse', 'ctx.traverse'); } return 'ok'; };
    // kapı önü: olağan şehir karesi (taban)
    pl.pos.set(122, 0, -816.9); pl.heading = Math.PI; pl.camYaw = 0; frames(20);
    const base0 = med(frames(10).D);
    out.base = +base0.toFixed(1);
    // denetim: aynı yerde girmeden 40 kare (şehrin kendi sıçramaları: yaya üretimi vb.)
    reset(); { const F0 = frames(40); out.control = { ...sum(F0, base0), top: top().slice(0, 4) }; }
    // 1) ilk giriş
    reset();
    const progs0 = new Set(R.info.programs.map((x) => x.id));
    let enterR;
    const F1 = frames(40, (i) => { if (i === 2) enterR = ent(); });
    const baseIn = med(F1.D.slice(25));
    out.enter1 = { r: enterR, ...sum(F1, Math.max(base0, baseIn)), baseIn: +baseIn.toFixed(1), top: top(), tv: pl.inInterior && pl.inInterior.tvStats, ov: window.__ovMs, newProgs: R.info.programs.filter((x) => !progs0.has(x.id)).map((x) => (x.name || '') + ':' + (x.cacheKey || '').slice(0, 90)).slice(0, 8), warm: [g.villa.warmMs, g.villa.warmPlayerMs] };
    // 2) ilk teras ziyareti: merdivenle değil, doğrudan teras kapısı (dünya terasına çıkış ya da iç teras)
    reset();
    const ctx = pl.inInterior;
    const ter = ctx && ctx.interact.find((i) => /Teras/.test(i.label));
    let terR = 'yok';
    const F2 = frames(40, (i) => {
      if (i !== 2) return;
      if (ter) { ter.action(); terR = 'kapı'; } else if (ctx) { pl.pos.set(8, 8.4, -3); pl.vy = 0; terR = 'iç'; }
    });
    out.terrace = { r: terR, ...sum(F2, Math.max(base0, med(F2.D.slice(25)))), inside: !!pl.inInterior, pos: pl.pos.toArray().map((v) => +v.toFixed(1)), top: top() };
    // 3) dünyadaki terastan teras kapısıyla içeri gir, sonra ön kapıdan çık
    if (!pl.inInterior) {
      reset(); let r3 = 'yok';
      const F3a = frames(30, (i) => { if (i !== 2) return; const it = g.findInteraction(); r3 = it ? it.label : 'yok'; if (it && /teras/.test(it.label)) it.action(); });
      out.terraceIn = { r: r3, ...sum(F3a, Math.max(base0, med(F3a.D.slice(20)))), inside: !!pl.inInterior, pos: pl.pos.toArray().map((v) => +v.toFixed(1)), top: top().slice(0, 5) };
    }
    reset();
    if (pl.inInterior) { const F3 = frames(30, (i) => { if (i === 2) g.interiors.exit(); }); out.exit1 = { ...sum(F3, base0), pos: pl.pos.toArray().map((v) => +v.toFixed(1)), top: top() }; }
    else out.exit1 = 'içeride değil';
    // 4) ikinci giriş (karşılaştırma)
    pl.pos.set(122, 0, -816.9); pl.vy = 0; frames(10);
    reset();
    let e2;
    const F4 = frames(30, (i) => { if (i === 2) e2 = ent(); });
    out.enter2 = { r: e2, ...sum(F4, Math.max(base0, med(F4.D.slice(20)))), top: top() };
    if (pl.inInterior) g.interiors.exit();
    out.ovMs = window.__ovMs;
    return out;
  });
  console.log('villaenter', JSON.stringify(r, null, 1));
  const ok = (x) => x && typeof x === 'object' ? x.maxSpike <= 50 && x.over100 === 0 : true;
  console.log(ok(r.enter1) && ok(r.terrace) && ok(r.exit1) && ok(r.terraceIn) && r.terraceIn && r.terraceIn.inside ? 'VILLAENTER OK' : 'VILLAENTER FAIL');
};
