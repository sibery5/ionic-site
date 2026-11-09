// [şehir] B3 Şehir Hayatı testi: semt başına dükkân sayıları, AVM (≥3 kat, yemek katında oturan/yiyenler,
// ilerleyen kasa sırası, yürüyen merdiven + asansör, çizim çağrısı / kare süresi), kafe terasları (yol/kaldırım dışı,
// çift/arkadaş/tek gruplar), bakkal alışverişi (can), oyuncu kanepeye oturur / yatağa uzanır, ev sahibi.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/city $PWD/scripts/test/city-steps.js
// SHOTS=1: AVM, kafe ve oturma odası ekran görüntüleri.
const H = require('./harness.js');

module.exports = async (p, out) => {
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  const shots = process.env.SHOTS === '1';
  await H.start(p); await H.install(p);
  await p.evaluate(() => { game.loop = () => {}; game.suppressPause = true; game.input.lock = () => {}; game.player.god = true; sim(0.5); });

  // ---------------- 1) dükkân sayıları
  const c1 = await p.evaluate(() => {
    const g = game, out = {};
    for (const b of g.map.buildings) {
      if (!['food', 'bakkal', 'market', 'kafe', 'avm', 'cafe'].includes(b.type)) continue;
      const d = b.district.id; out[d] = out[d] || { bakkal: 0, market: 0, kafe: 0, cafe: 0, avm: 0 };
      out[d][b.type === 'food' ? 'bakkal' : b.type]++;
    }
    const doors = {}; for (const d of g.city.doors) doors[d.building.type] = (doors[d.building.type] || 0) + 1;
    return { per: out, doors: { bakkal: (doors.bakkal || 0) + (doors.food || 0), market: doors.market, kafe: doors.kafe, avm: doors.avm } };
  });
  console.log('1 dükkânlar:', JSON.stringify(c1));
  const ds = Object.entries(c1.per);
  check(ds.length === 6 && ds.every(([, v]) => v.bakkal >= 2), '1a her semtte en az 2 bakkal: ' + ds.map(([k, v]) => k + '=' + v.bakkal).join(' '));
  const mk = ds.map(([, v]) => v.market).reduce((a, b) => a + b, 0);
  check(mk >= 3 && ds.filter(([, v]) => v.market > 0).length >= 3, '1b iki semtte en az bir market (toplam ' + mk + ')');
  check(c1.doors.avm === 1 && c1.doors.kafe >= 8, '1c AVM kapısı ve ' + c1.doors.kafe + ' kafe kapısı');

  // ---------------- 2) bakkal: iç mekân, raflar, kasiyer, alışveriş can verir
  const c2 = await p.evaluate(() => {
    const g = game, pl = g.player;
    const door = g.city.doors.find((d) => d.building.type === 'bakkal');
    g.interiors.enter(door); sim(0.3);
    const ctx = pl.inInterior;
    const keeper = g.npcs.list.find((n) => n.kind === 'shopkeeper');
    pl.hp = 60; g.state.money = 5000;
    const m = g.cityLife.openGrocery('bakkal'); const btns = document.querySelectorAll('.panel-body .item .btn'); btns[0] && btns[0].click(); g.ui.closeAll();
    const hp1 = pl.hp;
    const fr = ctx.interact.find((i) => /Dolaptan/.test(i.label)); fr.action();
    const r = { products: ctx.productCount, keeper: !!keeper, hp: hp1, hp2: pl.hp, rob: !!ctx.interact.find((i) => i.danger), seats: (ctx.furnSeats || []).length };
    void m; g.interiors.exit(); sim(0.2);
    return r;
  });
  console.log('2 bakkal:', JSON.stringify(c2));
  check(c2.products > 300 && c2.keeper, '2a bakkal rafları dolu (' + c2.products + ' ürün) + kasiyer');
  check(c2.hp > 60 && c2.hp2 > c2.hp, '2b su/atıştırmalık can verdi (60 → ' + c2.hp + ' → ' + c2.hp2 + ')');
  const c2b = await p.evaluate(() => {
    const g = game, pl = g.player;
    const door = g.city.doors.find((d) => d.building.type === 'market');
    g.interiors.enter(door); sim(0.3);
    const ctx = pl.inInterior; sim(14);
    const ML = ctx.marketLife, r = { products: ctx.productCount, cashiers: g.npcs.list.filter((n) => n.kind === 'shopkeeper').length, shoppers: ML.crowd.agents.length, served: ML.lanes.reduce((a, l) => a + l.served, 0) };
    g.interiors.exit(); sim(0.2);
    return r;
  });
  console.log('2c market:', JSON.stringify(c2b));
  check(c2b.products > 1500 && c2b.cashiers >= 2, '2c market: ' + c2b.products + ' ürün, ' + c2b.cashiers + ' kasiyer');
  check(c2b.shoppers >= 4 && c2b.served >= 1, '2d market müşterileri dolaşıyor (' + c2b.shoppers + '), kasa sırası işliyor (' + c2b.served + ' ödeme)');

  // ---------------- 3) AVM
  const c3 = await p.evaluate(() => {
    const g = game, pl = g.player;
    const door = g.city.doors.find((d) => d.building.type === 'avm');
    const t0 = performance.now();
    g.interiors.enter(door);
    const buildMs = performance.now() - t0;
    sim(0.5);
    const ctx = pl.inInterior, M = ctx.mall;
    const slabYs = [...new Set(ctx.cols.boxes ? ctx.cols.boxes.filter((b) => b.tag === 'slab').map((b) => b.y1) : [])];
    const floors = new Set(M.crowd.agents.map((a) => Math.round(a.y / 5)));
    const seated = M.crowd.agents.filter((a) => a.state === 'sit').length;
    const L = M.hyper.lanes, q0 = L.map((l) => l.q.length), head0 = L.map((l) => l.q[0] && l.q[0].id), served0 = M.stats.served;
    window.__mallT = performance.now();
    return { buildMs: Math.round(buildMs), agents: M.crowd.agents.length, floors: [...floors].sort(), seated, q0, head0, served0, stores: M.stores.length, kiosks: M.food.kiosks.length, slabYs };
  });
  console.log('3 AVM:', JSON.stringify(c3));
  check(c3.floors.length >= 3 && c3.floors.includes(2), '3a AVM ≥3 katta insan var: katlar ' + c3.floors.join(','));
  check(c3.seated >= 10, '3b yemek katında oturup yiyen: ' + c3.seated);
  // sıra ilerliyor mu? 25 sn
  const c3b = await p.evaluate(() => {
    const g = game, M = g.player.inInterior.mall, L = M.hyper.lanes;
    const before = L.map((l) => l.q.map((a) => a.id));
    const hist = []; const t0 = performance.now(); for (let k = 0; k < 5; k++) { sim(5); hist.push(L.map((l) => l.q.length).join('') + '/' + M.crowd.agents.filter((x) => x.hyper).length); } const ms = (performance.now() - t0) / (25 * 30);
    const after = L.map((l) => l.q.map((a) => a.id));
    const kioskServed = M.stats.kioskServed;
    const eating = M.crowd.agents.filter((a) => a.state === 'sit' && a.eat).length;
    const rode = M.crowd.agents.filter((a) => a.riding).length;
    return { hist, before, after, served: M.stats.served, kioskServed, eating, queueMax: M.stats.queueMax, agents: M.crowd.agents.length, msPerTick: +ms.toFixed(2), animated: M.crowd.stats.animated, rode };
  });
  console.log('3 sıra:', JSON.stringify(c3b));
  const moved = c3b.before.some((b, i) => b[0] !== undefined && b[0] !== c3b.after[i][0]);
  check(c3b.served >= 2 && moved, '3c hipermarket kasa sırası ilerledi (servis ' + c3b.served + ', baş değişti)');
  check(c3b.kioskServed >= 1 && c3b.eating >= 8, '3d büfe sırası işledi (' + c3b.kioskServed + ') ve masada yiyenler: ' + c3b.eating);
  // oyuncu yürüyen merdiven ve asansör
  const c3c = await p.evaluate(() => {
    const g = game, pl = g.player, ctx = pl.inInterior;
    pl.pos.set(2.0, 0, -4.0); pl.heading = Math.PI / 2; pl.camYaw = pl.heading;
    hold('KeyW', true); sim(9); hold('KeyW', false); sim(0.5);
    const esc = pl.pos.toArray().map((v) => +v.toFixed(2));
    // asansör: 1. kattan 2. kata
    pl.pos.set(-15.6, 5, 0); sim(0.3);
    const it = ctx.interact.find((i) => /Asansör: 2\. kata/.test(i.label) && i.cond());
    it && it.action(); sim(8);
    return { esc, elev: pl.pos.toArray().map((v) => +v.toFixed(2)), rides: ctx.elevator.rides, found: !!it };
  });
  console.log('3 merdiven/asansör:', JSON.stringify(c3c));
  check(c3c.esc[1] > 4.5, '3e yürüyen merdivenle 1. kata çıkıldı (y=' + c3c.esc[1] + ')');
  check(c3c.found && c3c.rides === 1 && Math.abs(c3c.elev[1] - 10) < 0.3, '3f asansörle 2. kata (y=' + c3c.elev[1] + ')');
  // çizim çağrısı + kare süresi (AVM içinde, atriumdan bakış)
  const c3d = await p.evaluate(() => {
    const g = game, pl = g.player, R = g.renderer;
    pl.pos.set(0, 5, -7); pl.heading = Math.PI; pl.camYaw = Math.PI; pl.camPitch = 0.25; sim(0.5);
    R.info.autoReset = false; R.info.reset();
    R.render(g.activeScene ? g.activeScene() : g.scene, g.camera);
    const calls = R.info.render.calls, tris = R.info.render.triangles;
    R.info.reset(); g.render(); const callsAll = R.info.render.calls; R.info.autoReset = true;
    // CPU: oyun mantığı karesi (kalabalık dahil) — yazılımsal GPU'da çizim süresi anlamsız
    const C = g.player.inInterior.mall.crowd, cu = C.update.bind(C); let crowdMs = 0, an = 0; C.update = (...x) => { const t = performance.now(); cu(...x); crowdMs += performance.now() - t; an += C.stats.animated; };
    const t0 = performance.now(); sim(4); const upd = (performance.now() - t0) / 120; C.update = cu;
    const crowdPer = +(crowdMs / 120).toFixed(2), animPer = +(an / 120).toFixed(1);
    const t1 = performance.now(); for (let i = 0; i < 3; i++) g.render(); const rnd = (performance.now() - t1) / 3;
    return { calls, callsAll, tris, updMs: +upd.toFixed(2), crowdMs: crowdPer, animPerFrame: animPer, renderMsSwiftShader: Math.round(rnd), agents: g.player.inInterior.mall.crowd.agents.length, lights: 0 };
  });
  console.log('3 performans:', JSON.stringify(c3d));
  check(c3d.calls < 260, '3g AVM çizim çağrısı: ' + c3d.calls + ' (tüm geçişler ' + c3d.callsAll + '), oyun mantığı ' + c3d.updMs + ' ms/kare');
  if (shots) {
    await p.evaluate(() => { const pl = game.player; pl.pos.set(-4, 10, 7.6); pl.heading = 2.6; pl.camYaw = 2.6; pl.camPitch = 0.32; sim(0.4); });
    await H.shot(p, out + '-avm-yemek.png');
    await p.evaluate(() => { const pl = game.player; pl.pos.set(-12, 0, -11); pl.heading = -2.2; pl.camYaw = -2.2 + Math.PI * 0; pl.camPitch = 0.2; sim(0.4); });
    await H.shot(p, out + '-avm-kasa.png');
  }
  // ateş: panik
  const c3e = await p.evaluate(() => {
    const g = game, M = g.player.inInterior.mall, n0 = M.crowd.agents.length;
    g.combat.noise(0, 0, 40, g.player); sim(6);
    const n1 = M.crowd.agents.length, fleeing = M.crowd.agents.filter((a) => a.state === 'flee').length;
    g.wanted.reset(); g.interiors.exit(); sim(0.3);
    return { n0, n1, fleeing, panic: M.panic, outside: !g.player.inInterior };
  });
  console.log('3 panik:', JSON.stringify(c3e));
  check(c3e.panic && c3e.n1 < c3e.n0, '3h silah sesinde kalabalık kaçıştı (' + c3e.n0 + ' → ' + c3e.n1 + ')');

  // ---------------- 4) kafeler
  const c4 = await p.evaluate(() => {
    const g = game, pl = g.player, map = g.map;
    const cafes = g.cityLife && window.__CAFES ? window.__CAFES : null; void cafes;
    const list = g.cityLife.cafes();
    const SW = 3.2;
    let bad = 0, onRoad = 0, onWalk = 0;
    for (const c of list) {
      const blk = map.blocks.find((k) => k.id === c.b.block);
      for (const s of [...c.seats, ...c.tables]) {
        if (map.onRoad(s.x, s.z)) onRoad++;
        if (!(s.x > blk.x0 && s.x < blk.x1 && s.z > blk.z0 && s.z < blk.z1)) onWalk++;
      }
      if (!g.cityLife.onLot(c)) bad++;
    }
    // en yakın kafeye git: doldur
    const c = list.slice().sort((a, b) => b.tables.length - a.tables.length)[0]; const nz = c.nz;
    pl.pos.set(c.b.door.x + 3, 0.15, c.b.door.z + nz * 9); pl.heading = nz > 0 ? Math.PI : 0; pl.camYaw = pl.heading;
    for (const k of list) k.pop = k.pop || null;
    sim(3);
    const grp = (k) => (k.pop || []).map((gp) => gp.kind + ':' + gp.members.map((n) => n.model.look.gender).join(''));
    const near = list.filter((k) => k.pop && k.pop.length);
    const kinds = near.flatMap(grp);
    const seated = near.flatMap((k) => k.pop.flatMap((gp) => gp.members)).filter((n) => n.state === 'sit' && n.sitting).length;
    window.__cafe = c;
    return { cafes: list.length, bad, onRoad, onWalk, populated: near.length, kinds, seated };
  });
  console.log('4 kafeler:', JSON.stringify(c4));
  check(c4.bad === 0 && c4.onRoad === 0 && c4.onWalk === 0, '4a ' + c4.cafes + ' kafe terası parselin içinde (yol: ' + c4.onRoad + ', kaldırım: ' + c4.onWalk + ')');
  const pairOK = c4.kinds.some((k) => /^mf:(mf|fm)$/.test(k)) && c4.kinds.some((k) => /^mm:mm$/.test(k) || /^ff:ff$/.test(k));
  check(pairOK && c4.seated >= 4, '4b masalarda çiftler/arkadaşlar oturuyor: ' + c4.kinds.join(' '));
  if (shots) {
    await p.evaluate(() => { const c = window.__cafe, pl = game.player, nz = c.nz; pl.pos.set(c.b.door.x + 4.5, 0.15, c.b.door.z + nz * 8.5); pl.heading = Math.atan2(-4.5 * 0.6, -nz * 7); pl.camYaw = pl.heading; pl.camPitch = 0.12; game.env.time = 15; sim(0.5); });
    await H.shot(p, out + '-kafe.png');
  }
  const c4b = await p.evaluate(() => {
    const g = game, pl = g.player, c = window.__cafe;
    const s = c.seats.find((x) => !x.occupant && !(x.st && x.st.actor));
    if (!s) return { none: true };
    pl.pos.set(s.x + Math.sin(s.heading) * 0.8, 0.15, s.z + Math.cos(s.heading) * 0.8); sim(0.2);
    const it = g.findInteraction(); const label = it && it.label; it && it.action(); sim(0.5);
    const sat = !!pl.seat && pl.sitting; const w = g.findInteraction(); const waiter = w && w.label;
    hold('KeyW', true); sim(0.3); hold('KeyW', false);
    return { label, sat, waiter, up: !pl.seat };
  });
  console.log('4 kafede otur:', JSON.stringify(c4b));
  check(c4b.sat && c4b.up && /Garson/.test(c4b.waiter || ''), '4c oyuncu boş kafe sandalyesine oturdu, garson istemi, WASD ile kalktı');

  // ---------------- 5) ev: kanepe, yatak, ev sahibi
  const c5 = await p.evaluate(() => {
    const g = game, pl = g.player;
    for (const n of g.npcs.list.slice()) if (!n.mission) g.npcs.remove(n);
    const door = g.city.doors.filter((d) => d.building.type === 'apartment')[3];
    g.interiors.enter(door); sim(0.3);
    const ctx = pl.inInterior;
    // ev sahibini çıkar (oturma testi için sessiz ev)
    for (const n of g.npcs.list.slice()) g.npcs.remove(n);
    const sofa = ctx.furnSeats.find((s) => s.kind === 'sofa' && !s.occupant), bed = ctx.furnSeats.find((s) => s.kind === 'bed');
    pl.pos.set(sofa.x + Math.sin(sofa.heading) * 0.7, 0, sofa.z + Math.cos(sofa.heading) * 0.7); sim(0.2);
    let it = g.findInteraction(); const l1 = it && it.label; it && it.action(); sim(1);
    const sat = pl.sitting && Math.hypot(pl.pos.x - sofa.x, pl.pos.z - sofa.z) < 0.05;
    const upLabel = (g.findInteraction() || {}).label;
    press('KeyE'); sim(0.1); const s1 = { sat, l1, upLabel, upE: !pl.sitting };
    pl.pos.set(bed.bedX + Math.sin(bed.bedH) * 1.4, 0, bed.bedZ + Math.cos(bed.bedH) * 1.4); sim(0.2); // ayak ucundan
    it = g.findInteraction(); const l2 = it && it.label; it && it.action(); sim(1);
    const lying = !!pl.lying && Math.abs(pl.model.body.rotation.x + Math.PI / 2) < 0.01 && pl.pos.y > 0.6;
    window.__bed = bed;
    return { ...s1, l2, lying, seats: ctx.furnSeats.length, kinds: [...new Set(ctx.furnSeats.map((s) => s.kind))] };
  });
  console.log('5 ev:', JSON.stringify(c5));
  check(c5.sat && /Kanepe/.test(c5.l1 || '') && c5.upLabel === 'Kalk' && c5.upE, '5a kanepeye oturdu (E), "Kalk" ile kalktı');
  check(c5.lying && /Yatağa/.test(c5.l2 || ''), '5b yatağa uzandı');
  const c5b = await p.evaluate(() => { const pl = game.player; hold('KeyS', true); sim(0.3); hold('KeyS', false); return { up: !pl.lying && game.player.model.body.rotation.x === 0, y: +pl.pos.y.toFixed(2) }; });
  check(c5b.up, '5c WASD ile yataktan kalktı (y=' + c5b.y + ')');
  if (shots) {
    await p.evaluate(() => { const pl = game.player; pl.pos.set(-1.6, 0, 4.4); pl.heading = -2.5; pl.camYaw = -2.5 + Math.PI; pl.camPitch = 0.3; sim(0.4); const s = pl.inInterior.furnSeats.find((x) => x.kind === 'sofa'); game.cityLife.sitDown(s); sim(0.6); pl.camYaw = 0.2 + Math.PI; sim(0.3); });
    await H.shot(p, out + '-salon.png');
    await p.evaluate(() => { game.cityLife.standUp(); const pl = game.player; game.cityLife.sitDown(window.__bed); pl.camYaw = 1.2; pl.camPitch = 0.5; sim(0.6); });
    await H.shot(p, out + '-yatak.png');
    await p.evaluate(() => { game.cityLife.standUp(); });
  }
  await p.evaluate(() => { game.interiors.exit(); sim(0.2); });

  console.log(fails.length ? 'BAŞARISIZ: ' + fails.length : 'TÜMÜ BAŞARILI');
};
