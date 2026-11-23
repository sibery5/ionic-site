// [O2 + O3] Görevde kanun tavanı ve mafya hesaplaşmaları:
//  O2: hikâye görevi sürerken yıldız en çok 3 (polisle görevlerde 4); görev dışında sınırsız.
//  O3: çete bölgesinde teklif → baskın (karargâh, kuşatma, lider), konvoy pususu (araçlar durunca ekip iner), iki çete hesaplaşması
//      (çeteler birbirine ateş eder, oyuncu taraf seçer); ödül para + saygı; hesaplaşmada polis en çok 2★.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/sd $PWD/scripts/test/showdown-steps.js
const H = require('./harness.js');
module.exports = async (p) => {
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.setDefaultTimeout(600000);
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  await p.evaluate(() => { window.__render = game.render.bind(game); game.render = () => {}; });
  await H.start(p); await H.install(p);
  await p.evaluate(() => {
    const g = game; g.loop = () => {}; g.player.god = true;
    window.SD = {
      clear() {
        const W = g.wanted, M = g.missions; if (M.active) M.cleanup(true); M.active = null; M.retry = { t: 1e9 }; // bekleyen 'tekrar dene' kaydı: ilk hikâye görevi kendiliğinden başlamasın
        W.reset(); g.npcs.calmPolice();
        if (g.player.vehicle) g.vehicles.ejectDriver(g.player.vehicle);
        for (const n of g.npcs.list.slice()) if (!n.mission) g.npcs.remove(n);
        g.ui.closeAll(); g.mode = 'playing';
      },
      kill(list) { for (const n of list) if (!n.dead) { if (n.vehicle) { n.vehicle = null; n.model.root.visible = true; } n.takeDamage(9999, g.player, 'bullet'); } },
    };
  });

  // ---------------- O2: görevde yıldız tavanı ----------------
  const cap = await p.evaluate(() => {
    const g = game, M = g.missions, W = g.wanted, out = {};
    SD.clear();
    for (const id of ['harac', 'banka']) {
      const def = M.STORY.find((d) => d.id === id);
      try { M.start(def, { replay: true }); } catch (e) { out[id] = 'hata ' + e.message; continue; }
      sim(0.2); W.add(5, true); sim(0.2);
      out[id] = W.level;
      M.cleanup(true); M.active = null; M.retry = { t: 1e9 }; W.reset(); sim(0.2);
    }
    sim(0.2); W.add(5, true); sim(0.1); out.free = W.level; out.freeActive = M.active && M.active.id; W.reset();
    SD.clear();
    return out;
  });
  console.log('tavan:', JSON.stringify(cap));
  check(cap.harac === 3, 'Görevde (Haraç Turu) yıldız en çok 3 (' + cap.harac + ')');
  check(cap.banka === 4, 'Polisle görevde (Büyük Vurgun) en çok 4 (' + cap.banka + ')');
  check(cap.free === 5, 'Görev dışında sınır yok (' + cap.free + ')');

  // ---------------- O3: hesaplaşmalar ----------------
  const run = (kind) => p.evaluate((kind) => {
    const g = game, M = g.missions, S = M.showdowns, W = g.wanted, pl = g.player;
    SD.clear();
    const def = window.__SHOW.find((d) => d.kind === kind);
    const n0 = g.map.nearestNode(-300, -120); pl.pos.set(n0.x + 7, 0, n0.z + 7); // Beyoğlu (Yılanlar)
    g.state.territories.yilanlar = false;
    const money0 = g.state.money, resp0 = g.state.respect;
    S.offer = null; S.job = null;
    const O = S.makeOffer(def, 'yilanlar', { x: pl.pos.x + 2, z: pl.pos.z });
    const mm = M.markers.some((m) => Math.abs(m.x - O.x) < 0.1 && Math.abs(m.z - O.z) < 0.1);
    sim(0.3);
    const J = S.job, r = { kind, offerOnMap: mm, started: !!J };
    if (!J) return r;
    W.add(5, true); sim(0.1); r.wanted = W.level; W.reset();
    pl.god = false; pl.hp = 100; pl.armor = 100;
    if (kind === 'raid') {
      r.enemies = J.enemies.length; r.leader = !!(J.leader && J.leader.maxHp >= 300);
      // karargâha 28 m'ye kadar yaklaş; 12 sn izle: kuşatma (açısal yayılım), siper, menzil
      const dx = J.x - pl.pos.x, dz = J.z - pl.pos.z, d = Math.hypot(dx, dz);
      pl.pos.set(J.x - dx / d * 28, 0, J.z - dz / d * 28);
      let cover = 0, atk = 0, minD = 1e9; const angs = new Set();
      sim(12, (i) => {
        if (i % 30) return;
        for (const n of J.enemies) {
          if (n.dead) continue;
          if (n.state === 'attack') atk++;
          if (n.coverPt || n.crouch) cover++;
          const e = Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z); minD = Math.min(minD, e);
          angs.add(Math.round(Math.atan2(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z) / 0.5));
        }
      });
      r.alerted = !!J.alerted; r.atk = atk; r.cover = cover; r.minD = Math.round(minD); r.spread = angs.size;
    } else if (kind === 'convoy') {
      const v = J.cars[0];
      r.cars = J.cars.length; r.inCar = J.enemies.filter((n) => n.vehicle).length;
      sim(3); const moved = Math.hypot(v.vx, v.vz);
      // oyuncu yolu keser: araç durur, oyuncu 12 m yanında
      v.vx = v.vz = 0; if (v.ai) v.ai.cruise = 0;
      pl.pos.set(v.pos.x + 10, 0, v.pos.z + 6);
      sim(3);
      r.moved = +moved.toFixed(1); r.out = J.enemies.filter((n) => !n.vehicle && !n.dead).length; r.atk = J.enemies.filter((n) => n.state === 'attack').length;
    } else {
      sim(6);
      r.cross = J.a.concat(J.b).filter((n) => !n.dead && n.target && n.target.feud && n.target.feud !== n.feud).length;
      const b0 = J.b.find((n) => !n.dead) || J.b[0];
      b0.takeDamage(15, pl, 'bullet'); sim(0.5);
      r.chosen = !!J.chosen; r.allies = J.a.filter((n) => n.ally).length; r.foesHostile = J.b.filter((n) => n.hostile).length;
    }
    pl.god = true;
    r.dead = pl.dead; if (pl.dead) { pl.dead = false; pl.hp = 100; }
    SD.kill(J.enemies); sim(1.5);
    r.done = !S.job && S.last === J && J.ok; r.money = g.state.money - money0; r.resp = g.state.respect - resp0;
    SD.clear();
    return r;
  }, kind);
  await p.evaluate(() => { window.__SHOW = game.missions.showdowns.table; });
  for (const kind of ['raid', 'convoy', 'feud']) {
    const r = await run(kind);
    console.log(kind + ':', JSON.stringify(r));
    check(r.started && r.offerOnMap, `${kind}: haritada teklif işareti, işarete gidince başladı`);
    check(r.wanted <= 2, `${kind}: çete bölgesinde polis en çok 2★ (${r.wanted})`);
    if (kind === 'raid') {
      check(r.enemies >= 6 && r.leader, `Baskın: ${r.enemies} düşman + lider`);
      check(r.alerted && r.atk > 0, 'Baskın: yaklaşınca karargâh uyandı ve saldırdı');
      check(r.spread >= 3 && r.minD > 3, `Baskın: kuşatma (açısal yayılım ${r.spread}, en yakın ${r.minD} m), siper/çömelme ${r.cover}`);
    }
    if (kind === 'convoy') check(r.cars >= 1 && r.inCar >= 3 && r.out >= 2 && r.atk >= 1, `Konvoy: ${r.cars} araç, ${r.inCar} kişi; durunca ${r.out} kişi indi, ${r.atk} saldırıyor (hız ${r.moved} m/s)`);
    if (kind === 'feud') check(r.cross >= 3 && r.chosen && r.allies >= 1 && r.foesHostile >= 1, `Hesaplaşma: ${r.cross} kişi karşı çeteye ateşte; taraf seçildi (${r.allies} müttefik)`);
    check(!r.dead, `${kind}: oyuncu (zırhlı) ölmedi`);
    check(r.done && r.money > 0 && r.resp > 0, `${kind}: ödül +${r.money} para, +${r.resp} saygı`);
  }
  console.log('KONSOL HATALARI:', errs.length);
  for (const e of errs.slice(0, 10)) console.log('  ', e.slice(0, 300));
  console.log(fails.length ? `BAŞARISIZ: ${fails.length}` : 'TÜMÜ BAŞARILI');
  if (errs.length || fails.length) process.exitCode = 1;
};
