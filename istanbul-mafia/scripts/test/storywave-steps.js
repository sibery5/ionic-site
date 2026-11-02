// Hikâye dalgası testi: görev defteri (J), Reis'in çağrısı, kovalamaca görevi, sevgili (tanışma, yolcu koltuğu,
// randevu, el ele, sarılma, öpüşme), ödül avı, kapkaç, silahçı, kedi/köpekler.
//   node scripts/test/play.js file://$PWD/app/index.html .testout/sw $PWD/scripts/test/storywave-steps.js
// SHOTS=1 ile birkaç ana ekran görüntüsü alır (yavaş).
const path = require('path');
const fs = require('fs');
const H = require('./harness.js');

module.exports = async (p, out) => {
  fs.mkdirSync(path.dirname(out + 'x'), { recursive: true });
  p.setDefaultTimeout(300000);
  await p.evaluate(() => { window.__render = game.render.bind(game); game.render = () => {}; });
  const SHOTS = process.env.SHOTS === '1';
  const shot = async (n, cam) => {
    if (!SHOTS) return;
    await p.evaluate((c) => { if (c) { game.camera.position.set(c.x, c.y, c.z); game.camera.lookAt(c.lx, c.ly, c.lz); } window.__render(); window.__render(); }, cam || null);
    await p.screenshot({ path: out + n, timeout: 240000 });
  };
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  const dlg = () => p.evaluate(() => !document.querySelector('.dialog').classList.contains('hidden'));
  const hasChoices = () => p.evaluate(() => document.querySelectorAll('.dialog .dlg-choice').length > 0);
  const key = (n) => p.keyboard.press('Dig' + 'it' + n);
  // diyaloğu Enter ile ilerlet; seçim satırına gelince durur (choice verilirse o rakamı seçer)
  const advance = async (maxN = 30, choice) => {
    await p.waitForTimeout(200);
    for (let i = 0; i < maxN && await dlg(); i++) {
      if (await hasChoices()) { if (!choice) return; await p.waitForTimeout(260); await key(choice); choice = null; }
      else await p.keyboard.press('Enter');
      await p.waitForTimeout(90);
      await p.evaluate(() => sim(0.05));
    }
  };
  // seçenek satırına kadar ilerle ve etiketi eşleşen seçeneği seç
  const pick = async (re) => {
    for (let k = 0; k < 12; k++) {
      for (let w = 0; w < 8 && !(await hasChoices()); w++) await p.waitForTimeout(150);
      if (await hasChoices()) break;
      if (!(await dlg())) return -1;
      await p.keyboard.press('Enter'); await p.waitForTimeout(120);
    }
    await p.waitForTimeout(260);
    const idx = await p.evaluate((src) => { const r = new RegExp(src); const L = [...document.querySelectorAll('.dialog .dlg-choice')]; return L.findIndex((e) => r.test(e.textContent)); }, re);
    if (idx >= 0) await key(idx + 1);
    await p.waitForTimeout(150);
    await p.evaluate(() => sim(0.05));
    return idx;
  };

  await H.start(p); await H.install(p);
  await p.evaluate(() => { game.player.god = true; sim(1); });

  // ---------------- 1) Görev defteri ----------------
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(300);
  let j = await p.evaluate(() => ({ open: !!document.querySelector('.phone.journal'), obj: (document.querySelector('.jr-obj') || {}).textContent }));
  check(j.open && /konağına/.test(j.obj || ''), 'J ile görev defteri açıldı: ' + j.obj);
  const tabs = [];
  for (let k = 2; k <= 5; k++) { await key(k); await p.waitForTimeout(120); tabs.push(await p.evaluate(() => document.querySelectorAll('.phone.journal .ph-body > *').length)); }
  check(tabs.every((n) => n > 0), 'Defter sekmeleri dolu ' + JSON.stringify(tabs));
  await shot('journal.png');
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(200);
  check(!(await p.evaluate(() => !!document.querySelector('.phone.journal'))), 'J ile kapandı');

  // ---------------- 2) Görev 1 → konaktan çıkınca yanıp sönen hedef; Görev 3 sonrası Reis çağrısı ----------------
  await p.evaluate(() => { const d = game.city.doors.find((dd) => dd.building.type === 'konak'); game.interiors.enter(d); sim(0.5); });
  await advance();
  await p.evaluate(() => { sim(0.5); game.interiors.exit(); sim(0.2); });
  const blink = await p.evaluate(() => ({ story: game.state.storyIndex, blink: game.missions.blinkUntil > performance.now(), giver: game.missions.markers.some((m) => m.giver && m.blink) }));
  check(blink.story === 1 && blink.blink, 'Konaktan çıkınca hedef yanıp sönüyor ' + JSON.stringify(blink));
  // Reis çağrısı: harac bitmiş gibi yap (çağrısız sonraki görev → karabasan)
  const call = await p.evaluate(() => {
    const M = game.missions; game.state.completed.push('eski_dost', 'harac'); game.state.storyIndex = 3; M.offerT = 0; M.summonT = 0.2; M.objText = '';
    sim(1);
    const c = M.dialogue.call;
    return { ringing: !!c, who: c && c.caller, card: !!document.querySelector('.call-card') };
  });
  check(call.ringing && call.card, 'Telefon çalıyor (çağrı kartı): ' + call.who);
  await p.keyboard.press('KeyT'); await p.waitForTimeout(300);
  check(await dlg(), 'Çağrı açıldı (telefon diyaloğu)');
  await advance();
  const after = await p.evaluate(() => ({ gps: !!game.gpsTarget, obj: game.missions.objText, blink: game.missions.blinkUntil > performance.now() }));
  check(after.gps && /konağa/.test(after.obj || '') && after.blink, 'Çağrı sonrası konak hedefi + GPS: ' + after.obj);

  // ---------------- 3) Kovalamaca görevi (Kaçan Tahsildar) ----------------
  const ch = await p.evaluate(() => {
    const M = game.missions; const i = M.STORY.findIndex((d) => d.id === 'tahsildar');
    game.state.storyIndex = i; M.start(M.STORY[i], { fromStep: 3 }); sim(1);
    const r = { step: M.stepIdx, fcar: !!(M.data.fcar), inCar: !!game.player.vehicle, flee: M.data.fcar && M.data.fcar.ai && M.data.fcar.ai.mode };
    sim(16);
    r.esc = (M.data.gangCars || []).length;
    // aracı hurdaya çevir: Ferhat iner, yaklaşınca teslim olur
    const fc = M.data.fcar; fc.hp = fc.def.hp * 0.2; sim(0.5);
    r.onFoot = !M.data.t.vehicle;
    const t = M.data.t; if (game.player.vehicle) game.vehicles.ejectDriver(game.player.vehicle);
    game.player.pos.set(t.pos.x + 1.5, 0, t.pos.z); sim(0.6);
    r.step2 = M.stepIdx; r.dlg = M.dialogue.open;
    return r;
  });
  check(ch.step === 3 && ch.fcar && ch.flee === 'traffic', 'Kovalamaca başladı ' + JSON.stringify(ch));
  check(ch.esc >= 1, 'Kurtlar koruma araçları geldi (' + ch.esc + ')');
  check(ch.onFoot && ch.step2 === 4, 'Ferhat arabadan indi ve yakalandı');
  await advance(20, 1); await advance(10);
  const ch2 = await p.evaluate(() => { sim(0.5); const M = game.missions; return { step: M.stepIdx, flag: M.flag('ferhat') }; });
  check(ch2.step === 5 && ch2.flag, 'Ferhat seçimi yapıldı, teslimat adımı: ' + JSON.stringify(ch2));
  await p.evaluate(() => { const d = game.city.doors.find((dd) => dd.building.type === 'konak'); game.interiors.enter(d); sim(0.5); });
  await advance();
  const ch3 = await p.evaluate(() => { sim(0.5); return { done: game.state.completed.includes('tahsildar'), active: !!game.missions.active }; });
  check(ch3.done && !ch3.active, 'Kaçan Tahsildar tamamlandı');
  await p.evaluate(() => { game.interiors.exit(); sim(0.3); game.wanted.reset(); game.npcs.calmPolice(); });

  // ---------------- 4) Sevgili ----------------
  const rm = await p.evaluate(() => {
    const R = game.social.romance; const h = R.homeSpot('defne');
    game.player.pos.set(h.x + 1.2, 0, h.z); game.env.time = 14; sim(1);
    const n = R.npcs.defne;
    return { spawned: !!n, d: n && Math.hypot(n.pos.x - game.player.pos.x, n.pos.z - game.player.pos.z), prompt: (game.findInteraction() || {}).label };
  });
  check(rm.spawned && /Defne/.test(rm.prompt || ''), 'Defne sahnede, etkileşim: ' + rm.prompt);
  await p.evaluate(() => { game.social.romance.talk('defne'); });
  await pick('Ne okuyorsun');
  await advance();
  const met = await p.evaluate(() => game.social.romance.rel('defne'));
  check(met.met && met.love > 0, 'Tanışıldı, kalp: ' + met.love);
  await p.evaluate(() => { const r = game.social.romance.rel('defne'); r.love = 72; game.social.romance.join('defne', false); sim(0.3); });
  // araca bin: yolcu koltuğuna otomatik
  const car = await p.evaluate(() => {
    const pl = game.player, n = game.social.romance.npcs.defne;
    const v = game.vehicles.add('sedan', pl.pos.x + 3, pl.pos.z, 0); n.pos.set(pl.pos.x + 2, 0, pl.pos.z + 1);
    game.enterVehicle(v, true); sim(0.5);
    const r = { pass: n.passengerOf === v, seat: n.seatIndex, sit: n.sitting };
    game.vehicles.ejectDriver(v); sim(0.5);
    r.out = !n.passengerOf && n.state === 'follow';
    return r;
  });
  check(car.pass && car.seat > 0 && car.sit, 'Sevgili yolcu koltuğuna bindi ' + JSON.stringify(car));
  check(car.out, 'Araçtan inince tekrar yanında yürüyor');
  // el ele yürüme
  const hand = await p.evaluate(() => {
    const R = game.social.romance, n = R.npcs.defne, pl = game.player;
    n.pos.set(pl.pos.x + 0.6, 0, pl.pos.z); R.hand = true;
    hold('KeyW', true); sim(1.5); hold('KeyW', false);
    const d = Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z);
    const r = { d: +d.toFixed(2), pk: pl.couple && pl.couple.kind, nk: n.couple && n.couple.kind, nsp: +n.speed.toFixed(2) };
    sim(0.5); return r;
  });
  check(hand.pk === 'hand' && hand.nk === 'hand' && hand.d < 1.2, 'El ele yürüyüş ' + JSON.stringify(hand));
  // randevu: banka git, otur, sarıl, öp
  const dt = await p.evaluate(() => {
    const R = game.social.romance; R.hand = false; R.clearPose();
    if (!R.datePt) return { ok: false };
    const pl = game.player, n = R.npcs.defne;
    pl.pos.set(R.datePt.x, 0, R.datePt.z); n.pos.set(R.datePt.x + 1, 0, R.datePt.z); sim(0.3);
    const pr = (game.findInteraction() || {}).label;
    R.startDate(); sim(0.3);
    return { ok: true, pr, scene: !!R.scene, sit: pl.sitting && n.sitting, dlg: R.g.missions.dialogue.open };
  });
  check(dt.ok && dt.scene && dt.sit && /Otur/.test(dt.pr || ''), 'Randevu: bankta oturdular ' + JSON.stringify(dt));
  await shot('date-sit.png', await p.evaluate(() => { const c = game.social.romance.sceneCam('wide'); return c && { x: c.pos.x, y: c.pos.y, z: c.pos.z, lx: c.look.x, ly: c.look.y, lz: c.look.z }; }));
  await pick('Elini tut');
  const hd = await p.evaluate(() => { sim(0.6); return { p: game.player.couple && game.player.couple.kind, mode: game.social.romance.scene && game.social.romance.scene.mode }; });
  check(hd.p === 'hand' && hd.mode === 'hand', 'Bankta el ele');
  await advance(1);
  await pick('Sarıl');
  const hug = await p.evaluate(() => { sim(1); const R = game.social.romance, pl = game.player, n = R.npcs.defne; return { k: pl.couple && pl.couple.kind, d: +Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z).toFixed(2), sit: pl.sitting }; });
  check(hug.k === 'hug' && hug.d < 0.7 && !hug.sit, 'Sarılma sahnesi ' + JSON.stringify(hug));
  await advance(2);
  await pick('Öp');
  const kiss = await p.evaluate(() => { sim(1.2); const R = game.social.romance, pl = game.player, n = R.npcs.defne; return { k: pl.couple && pl.couple.kind, nk: n.couple && n.couple.kind, d: +Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z).toFixed(2), w: +(pl.model.w.couple || 0).toFixed(2) }; });
  check(kiss.k === 'kiss' && kiss.nk === 'kiss' && kiss.w > 0.5, 'Öpüşme sahnesi ' + JSON.stringify(kiss));
  await shot('kiss.png', await p.evaluate(() => { const c = game.social.romance.sceneCam('side'); return c && { x: c.pos.x, y: c.pos.y, z: c.pos.z, lx: c.look.x, ly: c.look.y, lz: c.look.z }; }));
  await advance(3);
  const kr = await p.evaluate(() => game.social.romance.rel('defne'));
  check(kr.kissed, 'İlk öpücük kaydedildi, kalp ' + kr.love);
  await pick('Kalkalım');
  await advance();
  check(await p.evaluate(() => { sim(0.3); return !game.social.romance.scene && !game.player.sitting; }), 'Randevu bitti, ayağa kalktılar');
  await p.evaluate(() => { game.social.romance.sendHome('defne', 'Görüşürüz!'); sim(0.2); });

  // ---------------- 5) Ödül avı ----------------
  const bt = await p.evaluate(() => {
    const B = game.social.bounties; B.hunt('kel_vedat'); sim(0.2);
    const h = B.hideout(B.list().find((b) => b.id === 'kel_vedat'));
    const mk = game.missions.markers.some((m) => m.icon === 'pin_skull' && m.area);
    game.player.pos.set(h.x + 30, 0, h.z); sim(1);
    const L = B.live;
    const r = { mk, live: !!L, guards: L && L.guards.length };
    if (!L) return r;
    for (const n of L.guards) n.takeDamage(999, game.player, 'bullet');
    const t = L.target; t.takeDamage(t.maxHp * 0.75, game.player, 'bullet'); sim(0.5);
    r.surr = t.state === 'surrender';
    if (t.vehicle) { t.vehicle = null; t.model.root.visible = true; }
    game.player.pos.set(t.pos.x + 1.2, 0, t.pos.z); sim(0.3);
    const it = game.findInteraction(); r.pr = it && it.label;
    const m0 = game.state.money; if (it) it.action(); sim(0.2);
    r.paid = game.state.money - m0; r.status = B.S.rec.kel_vedat.status;
    return r;
  });
  check(bt.mk && bt.live && bt.guards >= 1, 'Ödül avı: işaret + hedef ve korumalar ' + JSON.stringify(bt));
  check(bt.surr && bt.paid >= 90000 && bt.status === 'caught', 'Aranan teslim oldu, ödül alındı');

  // ---------------- 6) Kapkaç ----------------
  const pr = await p.evaluate(() => {
    game.wanted.reset(); game.npcs.calmPolice();
    const side = game.missions.side; if (side.event) side.endEvent(false);
    const ok = side.startEvent('mugging'); const ev = side.event;
    const v = ev.victim, th = ev.thief;
    th.pos.set(v.pos.x - 1, 0, v.pos.z); sim(1);
    const r = { ok, phase: ev.phase, bag: ev.bag.parent && ev.bag.parent.parent && ev.bag.parent.parent.name };
    sim(1.5);
    // koşarak üstüne atla
    const pl = game.player; pl.pos.set(th.pos.x - 1, 0, th.pos.z);
    pl.speed = 7; r.d = Math.hypot(th.pos.x - pl.pos.x, th.pos.z - pl.pos.z);
    sim(0.05); pl.pos.set(th.pos.x - 0.8, 0, th.pos.z); hold('KeyW', true); hold('ShiftLeft', true); pl.camYaw = Math.atan2(th.pos.x - pl.pos.x, th.pos.z - pl.pos.z);
    let caught = false; sim(1.5, () => { if (ev.phase === 'caught') caught = true; else { pl.camYaw = Math.atan2(th.pos.x - pl.pos.x, th.pos.z - pl.pos.z); } });
    hold('KeyW', false); hold('ShiftLeft', false);
    if (!caught && ev.phase === 'run') { th.takeDamage(35, pl, 'melee'); sim(0.2); caught = ev.phase === 'caught'; }
    r.caught = caught; r.phase2 = ev.phase;
    pl.pos.set(th.pos.x + 1.2, 0, th.pos.z); sim(0.2);
    const it = game.findInteraction(); r.pr = it && it.label;
    if (it) it.action();
    return r;
  });
  check(pr.ok && pr.phase === 'run', 'Kapkaççı çantayı kaptı ve kaçıyor ' + JSON.stringify(pr));
  check(pr.caught && /Kapkaççı/.test(pr.pr || ''), 'Kapkaççı yakalandı: ' + pr.pr);
  await pick('Polise');
  await advance();
  const cop = await p.evaluate(() => { const side = game.missions.side; const ev = side.event; const r0 = { phase: ev && ev.phase }; const m0 = game.state.money; sim(12); return { ...r0, done: !side.event, paid: game.state.money - m0 }; });
  check(cop.phase === 'cop' && cop.done && cop.paid > 0, 'Polise teslim edildi, ödül ' + JSON.stringify(cop));

  // ---------------- 7) Silahçı ----------------
  const gs = await p.evaluate(() => {
    const d = game.city.doors.find((dd) => dd.building.type === 'gun'); const ctx = game.interiors.enter(d); sim(0.3);
    const its = ctx.interact.map((i) => i.label);
    game.state.money = 1e6; game.state.respect = 1000;
    const it = ctx.interact.find((i) => /Silah|Tezgâh/.test(i.label)); if (it) it.action();
    const rows = document.querySelectorAll('.modal .item').length;
    game.ui.closeAll(); game.interiors.exit(); sim(0.2);
    return { its, rows, racks: ctx.weaponRacks || 0 };
  });
  check(gs.rows >= 15, 'Silahçı: dükkânda silah listesi (' + gs.rows + ' satır) ' + JSON.stringify(gs.its));

  // ---------------- 8) Kedi ve köpekler ----------------
  const an = await p.evaluate(() => { sim(25); const A = game.animals; return { cats: A.cats.length, dogs: A.dogs.length, states: [...new Set(A.cats.concat(A.dogs).map((a) => a.state))] }; });
  check(an.cats + an.dogs >= 4, 'Sokak hayvanları ' + JSON.stringify(an));

  console.log(fails.length ? `\n${fails.length} KONTROL BAŞARISIZ` : '\nTÜM KONTROLLER GEÇTİ');
};
