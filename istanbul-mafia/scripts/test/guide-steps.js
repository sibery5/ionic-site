// [E7] Canlı görev yönlendirmesi testi: ilk görevlerin kabulünden bitişine her adımda sarı ok + mesafe + GPS rotası;
// ok hedefin 1,5–3 m üstünde; hedef arkadayken ekran kenarı oku; ödül avı hedefi ve kız arkadaş için de sarı ok.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/guide $PWD/scripts/test/guide-steps.js
// SHOTS=1: hedefe bakan ve hedef arkada kalan iki görüntü.
const path = require('path');
const fs = require('fs');
const H = require('./harness.js');

module.exports = async (p, out) => {
  fs.mkdirSync(out, { recursive: true });
  p.setDefaultTimeout(240000);
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  const SHOTS = process.env.SHOTS === '1';
  await p.evaluate(() => { window.__render = game.render.bind(game); game.render = () => {}; });
  await H.start(p); await H.install(p);
  await p.evaluate(() => { game.player.god = true; sim(1); });
  const shot = async (n) => { if (!SHOTS) return; await p.evaluate(() => { window.__render(); window.__render(); }); await p.screenshot({ path: path.join(out, n), type: 'jpeg', quality: 72 }); };

  // 1) görev yokken yönlendirme kapalı
  const idle = await p.evaluate(() => { game.setGps(null); sim(0.3); return { ...game.ui.guide.stat }; });
  // görev yokken oyunun kendi sıradaki iş işaretçisi (konak) gösterilir; başka hedef yok
  check(!idle.on || /konak|Reis|uğra/i.test(idle.text), `Görev yokken yalnız sıradaki iş (konak) gösteriliyor (${idle.text || 'kapalı'})`);

  // 2) ilk üç görev: her adımda ok + mesafe + rota
  for (let mi = 0; mi < 3; mi++) {
    const r = await p.evaluate((mi) => {
      const M = game.missions, def = M.STORY[mi], rows = [];
      if (M.active) M.cleanup(true);
      M.dialogue && M.dialogue.hangup && M.dialogue.hangup();
      M.start(def);
      for (let i = 0; i < def.steps.length && M.active === def; i++) {
        if (i > 0) M.enterStep(i);
        sim(0.6);
        if (document.querySelector('.dialog') && !document.querySelector('.dialog').classList.contains('hidden')) { game.dialogue && game.dialogue.skip && game.dialogue.skip(); }
        const S = game.ui.guide.stat, box = document.querySelector('.guide-box');
        rows.push({ i, on: S.on, kind: S.kind, d: Math.round(S.d), above: +S.above.toFixed(2), route: S.route, text: S.text, box: box && box.style.display === 'block' && box.textContent.length > 0, inInt: !!game.player.inInterior });
      }
      const title = def.title;
      M.cleanup(true); M.active = null; game.setGps(null); sim(0.3);
      return { title, rows, after: { ...game.ui.guide.stat } };
    }, mi);
    const outside = r.rows.filter((x) => !x.inInt);
    const good = outside.filter((x) => x.on && x.above >= 1.5 && x.above <= 3.2 && x.route > 0 && x.box && x.text);
    console.log(`GÖREV ${mi + 1} ${r.title}: ` + JSON.stringify(r.rows));
    check(outside.length > 0 && good.length === outside.length, `Görev ${mi + 1} (${r.title}): dışarıdaki ${outside.length} adımın ${good.length}'inde ok (1,5–3 m üstte) + mesafe + rota + adım yazısı`);
    check(!r.after.on || /konak|Reis|uğra/i.test(r.after.text), `Görev ${mi + 1} bitince eski hedefin oku kalkıyor (kalan: ${r.after.text || 'yok'})`);
  }

  // 3) hedef arkada: ekran kenarı oku; hedefe bakınca kenar oku gizli; ok uzakta büyür (ekranda sabit boy)
  const e = await p.evaluate(() => {
    const M = game.missions, P = game.player;
    M.start(M.STORY[0]); sim(0.5);
    const S = game.ui.guide.stat, A = game.ui.guide.arrows[0];
    const res = { on: S.on };
    if (!S.on) return res;
    const T = game.ui.guide.main;
    // hedefe 60 m uzaktan, arkası dönük
    const dx = P.pos.x - T.x, dz = P.pos.z - T.z, l = Math.hypot(dx, dz) || 1;
    P.pos.set(T.x + dx / l * 60, P.pos.y, T.z + dz / l * 60);
    P.heading = Math.atan2(dx, dz); P.camYaw = P.heading; sim(0.6);
    const edgeEl = document.querySelector('.guide-edge');
    res.behind = { edge: S.edge, shown: edgeEl.style.display === 'block', scale: +A.scale.x.toFixed(2), d: Math.round(S.d) };
    P.heading = Math.atan2(-dx, -dz); P.camYaw = P.heading; sim(0.6);
    res.front = { edge: S.edge, shown: edgeEl.style.display === 'block', scale: +A.scale.x.toFixed(2) };
    return res;
  });
  console.log('KENAR ' + JSON.stringify(e));
  if (e.on) {
    check(e.behind.shown && e.behind.edge, `Hedef arkadayken ekran kenarında ok + mesafe (${e.behind.d} m)`);
    check(e.behind.scale > 1.5, `Uzakta ok büyüyor (ekranda sabit boy): ölçek ${e.behind.scale}`);
  } else check(false, 'Kenar oku denemesi için görev hedefi yok');
  await shot('guide-front.jpg');

  // 4) ödül avı hedefi ve kız arkadaş: sarı ok
  const o = await p.evaluate(() => {
    const M = game.missions; if (M.active) M.cleanup(true); M.active = null; game.setGps(null);
    const P = game.player, B = game.social.bounties, R = game.social.romance;
    const n1 = game.npcs.add('gang', P.pos.x + 30, P.pos.z + 5);
    const saveLive = B.live; B.live = { target: n1, def: {} };
    sim(0.4);
    const Gd = game.ui.guide, i = Gd.T.findIndex((t) => t.on && t.kind === 'ödül avı'), A = i >= 0 ? Gd.arrows[i] : null;
    const b = { on: !!(A && A.visible), kind: i >= 0 ? 'ödül avı' : '', above: A ? +(A.position.y - n1.pos.y).toFixed(2) : 0, col: A ? A.material.color.getHexString() : '' };
    B.live = saveLive; game.npcs.remove(n1);
    const id = Object.keys(R.S)[0];
    const n2 = game.npcs.add('civilian', P.pos.x + 40, P.pos.z - 10);
    const saveN = R.npcs[id], saveMet = R.rel(id).met;
    R.npcs[id] = n2; R.rel(id).met = true;
    sim(0.4);
    const vis = game.ui.guide.arrows.filter((a) => a.visible);
    const gf = { arrows: vis.length, y: vis.length ? +(vis[vis.length - 1].position.y - n2.pos.y).toFixed(2) : 0 };
    R.npcs[id] = saveN; R.rel(id).met = saveMet; game.npcs.remove(n2);
    sim(0.2);
    return { b, gf };
  });
  console.log('DİĞER ' + JSON.stringify(o));
  check(o.b.on && o.b.kind === 'ödül avı' && o.b.above >= 1.5 && o.b.above <= 3.2 && o.b.col === 'ffd21a', `Ödül avı hedefinde sarı ok (${o.b.above} m üstte, #${o.b.col})`);
  check(o.gf.arrows >= 1 && o.gf.y >= 1.5 && o.gf.y <= 3.2, `Kız arkadaşın üstünde sarı ok (${o.gf.y} m)`);
  console.log(fails.length ? `BAŞARISIZ ${fails.length}` : 'YÖNLENDİRME TAMAM');
};
