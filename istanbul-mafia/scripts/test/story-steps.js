// Hikâye + polis/asker YZ başsız testi.
//   node scripts/test/play.js file://$PWD/app/index.html /tmp/out ./scripts/test/story-steps.js
// İlk 3 hikâye görevini programla oynar, 1→5 yıldız (barikat, özel harekât), 3 yıldızda hayatta kalma,
// kışla askerleri ve sokak olayı kontrol eder. outPrefix klasörüne ekran görüntüsü yazar.
const path = require('path');
const fs = require('fs');
const H = require('./harness.js');

module.exports = async (p, out) => {
  fs.mkdirSync(out, { recursive: true });
  // makine yavaşsa: sürekli render'ı kapat, sadece ekran görüntüsünde çiz
  await p.evaluate(() => { window.__render = game.render.bind(game); game.render = () => {}; });
  // cam: {x,y,z,lx,ly,lz} verilirse kamera oraya konur
  const shot = async (n, cam) => { await p.evaluate((c) => { game.render = window.__render; if (c) { game.camera.position.set(c.x, c.y, c.z); game.camera.lookAt(c.lx, c.ly, c.lz); game.camera.fov = 60; game.camera.updateProjectionMatrix(); } window.__render(); window.__render(); }, cam || null); await p.screenshot({ path: path.join(out, n), timeout: 180000 }); await p.evaluate(() => { game.render = () => {}; }); };
  p.setDefaultTimeout(240000);
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  const info = () => p.evaluate(() => info());
  const dlg = () => p.evaluate(() => !document.querySelector('.dialog').classList.contains('hidden'));
  // diyaloğu Enter ile ilerlet; choice verilirse rakam tuşu
  const advance = async (maxN = 40, choice) => {
    await p.waitForTimeout(220);
    for (let i = 0; i < maxN && await dlg(); i++) {
      const hasChoice = await p.evaluate(() => !!document.querySelector('.dialog .dlg-choices'));
      if (hasChoice && choice) { await p.keyboard.press('Enter'); await p.waitForTimeout(300); await p.keyboard.press('Digit' + choice); }
      else await p.keyboard.press('Enter');
      await p.waitForTimeout(90);
      await p.evaluate(() => sim(0.05));
    }
  };
  const enter = (type) => p.evaluate((t) => { const d = game.city.doors.find((dd) => dd.building.type === t); game.interiors.enter(d); }, type);
  const exitInt = () => p.evaluate(() => game.interiors.exit());
  const takeJob = async () => {
    await enter('konak');
    await p.evaluate(() => { sim(0.2); game.missions.talkToGiver('reis'); });
    await advance(3, 1); // menü: "İş var mı?"
    await advance(4);
    await p.waitForTimeout(200);
    await p.click('text=Kabul Et');
    await p.evaluate(() => sim(0.3));
  };

  await H.start(p); await H.install(p);
  await p.evaluate(() => { game.player.god = false; sim(1); });

  // ---------------- Görev 1: Eve Dönüş ----------------
  let i = await info();
  check(/konağına/.test(i.obj), 'Görev 1 başladı: ' + i.obj);
  await enter('konak');
  await p.evaluate(() => sim(0.5));
  check(await dlg(), 'Görev 1 diyaloğu açıldı');
  await advance();
  await p.evaluate(() => sim(0.5));
  i = await info();
  check(i.story === 1, 'Görev 1 tamamlandı (storyIndex=' + i.story + ')');

  // ---------------- Görev 2: Eski Dost (konaktan, seçim menüsüyle) ----------------
  await exitInt(); await p.evaluate(() => sim(0.3));
  await enter('konak');
  await p.evaluate(() => { sim(0.2); game.missions.talkToGiver('reis'); });
  await p.waitForTimeout(400);
  await shot('dialog-choices.png');
  await advance(3, 1); await advance(4); await p.waitForTimeout(200);
  await p.click('text=Kabul Et');
  await p.evaluate(() => sim(0.3));
  check(await p.evaluate(() => game.missions.active && game.missions.active.id === 'eski_dost'), 'Görev 2 başladı');
  await exitInt();
  await p.evaluate(() => { const M = game.missions, a = M.data.ali; game.player.pos.set(a.pos.x - 1.5, 0, a.pos.z); sim(0.5); });
  await advance();
  await p.evaluate(() => sim(0.3));
  await p.evaluate(() => { const M = game.missions; const c = M.data.car; M.data.ali.pos.set(c.pos.x + 2, 0, c.pos.z); game.player.pos.set(c.pos.x + 1.5, 0, c.pos.z); game.enterVehicle(c, true); sim(0.5); });
  check(await p.evaluate(() => game.missions.stepIdx === 3), 'Cin Ali ile araca binildi (takip adımı)');
  await p.evaluate(() => sim(7));
  await advance();
  const crews = await p.evaluate(() => (game.missions.data.gangCars || []).reduce((a, v) => a + v.crew.length, 0));
  check(crews >= 4, 'Yılanlar takip araçları geldi (' + crews + ' kişi)');
  await p.evaluate(() => { for (const v of game.missions.data.gangCars) for (const n of v.crew) { n.vehicle = null; n.model.root.visible = true; n.takeDamage(999, game.player, 'bullet'); } sim(0.5); });
  await p.evaluate(() => { const sh = game.map.nearestOfType('safehouse', -300, -60); const v = game.player.vehicle; v.pos.set(sh.door.x, 0, sh.door.z + sh.door.nz * 4); v.vx = v.vz = 0; sim(0.6); });
  await advance();
  await p.evaluate(() => sim(0.5));
  i = await info();
  check(i.story === 2, 'Görev 2 tamamlandı (storyIndex=' + i.story + ')');

  // ---------------- Görev 3: Haraç Turu ----------------
  await p.evaluate(() => { if (game.player.vehicle) game.vehicles.ejectDriver(game.player.vehicle); game.wanted.reset(); });
  await takeJob();
  check(await p.evaluate(() => game.missions.active && game.missions.active.id === 'harac'), 'Görev 3 başladı');
  await exitInt();
  for (let k = 0; k < 3; k++) {
    await p.evaluate((k) => {
      const k0 = game.map.nearestOfType('konak', 0, 0);
      const shops = game.map.specials.filter((b) => b.type === 'food' || b.type === 'clothes' || b.type === 'cafe').sort((a, b) => Math.hypot(a.door.x - k0.door.x, a.door.z - k0.door.z) - Math.hypot(b.door.x - k0.door.x, b.door.z - k0.door.z));
      const s = shops[k];
      game.player.pos.set(s.door.x, 0, s.door.z + s.door.nz * 1.2);
      sim(0.2); press('KeyE'); sim(0.2);
    }, k);
    await advance();
  }
  await p.evaluate(() => sim(0.5));
  const thugs = await p.evaluate(() => (game.missions.data.thugs || []).length);
  check(thugs === 3, 'Yılanlar tetikçileri çıktı (' + thugs + ')');
  await p.evaluate(() => sim(2));
  await p.evaluate(() => { for (const n of game.missions.data.thugs) n.takeDamage(999, game.player, 'bullet'); sim(0.5); });
  await advance();
  await p.evaluate(() => sim(0.5));
  i = await info();
  check(i.story === 3, 'Görev 3 tamamlandı (storyIndex=' + i.story + ')');

  // ---------------- 1 sivil öldürmek = 1 yıldız ----------------
  await p.evaluate(() => {
    game.wanted.reset(); game.npcs.calmPolice();
    for (const n of game.npcs.list.slice()) if (n.faction === 'police') game.npcs.remove(n);
    const c = game.npcs.add('civilian', game.player.pos.x + 3, game.player.pos.z, null, {});
    for (let k = 0; k < 12; k++) c.takeDamage(12, game.player, 'bullet');
    sim(12);
  });
  i = await info();
  check(i.wanted <= 1, 'Tek sivil öldürme ihbarı en fazla 1 yıldız (' + i.wanted + ')');

  // ---------------- 3 yıldızda hayatta kalma (zırh 100, yerinde) ----------------
  const surv = await p.evaluate(() => {
    game.wanted.reset();
    const n = game.map.nearestNode(-150, -200);
    game.player.pos.set(n.x + 8.5, 0, n.z + 8.5);
    game.player.hp = 100; game.player.armor = 100;
    game.wanted.set(3);
    const tally = {}; const td = game.player.takeDamage.bind(game.player);
    game.player.takeDamage = (a, att, kind, head) => { const r = td(a, att, kind, head); const k = kind + (att && att.kind ? ':' + att.kind : ''); tally[k] = Math.round((tally[k] || 0) + a); return r; };
    let t = 0;
    while (t < 25 && !game.player.dead) { sim(1); t += 1; }
    const cops = game.npcs.list.filter((x) => x.faction === 'police' && !x.dead).length;
    delete game.player.takeDamage;
    return { t, hp: Math.round(game.player.hp), armor: Math.round(game.player.armor), dead: game.player.dead, cops, tally };
  });
  check(!surv.dead && surv.t >= 20, `3 yıldızda 20+ sn hayatta: ${JSON.stringify(surv)}`);
  check(surv.cops >= 3, '3 yıldızda polis geldi (' + surv.cops + ')');
  if (surv.dead) await p.evaluate(() => { game.player.dead = false; game.player.hp = 100; game.mode = 'playing'; document.body.classList.remove('desat'); game.ui.overlayEl.className = 'overlay hidden'; });

  // ---------------- 4-5 yıldız: barikat + özel harekât ----------------
  const hi = await p.evaluate(() => {
    game.player.hp = 100; game.player.armor = 100; game.player.god = true;
    const n = game.map.nearestNode(-300, -300);
    if (game.player.vehicle) game.vehicles.ejectDriver(game.player.vehicle);
    const v = game.vehicles.add('sedan', n.x + 2.7, n.z + 10, 0);
    game.enterVehicle(v, true);
    game.wanted.set(4); game.wanted.roadblockT = 0.1; game.wanted.swatT = 0.1;
    sim(3);
    game.wanted.set(5); sim(3);
    const rb = game.wanted.roadblocks.length;
    const swat = game.npcs.list.filter((x) => x.kind === 'swat' && !x.dead).length;
    return { rb, swat, lvl: game.wanted.level };
  });
  check(hi.rb >= 1, 'Barikat kuruldu (' + hi.rb + ')');
  check(hi.swat >= 1, 'Özel harekât sahada (' + hi.swat + ')');
  await p.evaluate(() => { const rb = game.wanted.roadblocks[0]; const pl = game.player; const v = pl.vehicle; v.pos.set(rb.x + 25, 0, rb.z + 8); v.vx = v.vz = 0; pl.camYaw = Math.atan2(rb.x - v.pos.x, rb.z - v.pos.z); pl.camPitch = 0.15; sim(0.6); });
  const rbc = await p.evaluate(() => { const rb = game.wanted.roadblocks[0]; return rb && { x: rb.x + 14, y: 5, z: rb.z + 14, lx: rb.x, ly: 1, lz: rb.z }; });
  await shot('roadblock.png', rbc);

  // ---------------- kışla askerleri ----------------
  const mil = await p.evaluate(() => {
    if (game.player.vehicle) game.vehicles.ejectDriver(game.player.vehicle);
    game.wanted.reset(); game.npcs.calmPolice();
    const m = game.military;
    game.player.pos.set(m.zone.x1 + 15, 0, m.cz); game.player.heading = -Math.PI / 2;
    sim(1.5);
    const soldiers = m.soldiers.filter((s) => !s.dead).length;
    game.player.pos.set(m.zone.x1 - 8, 0, m.cz); sim(8);
    const alert = m.alert;
    return { soldiers, alert, lvl: game.wanted.level };
  });
  check(mil.soldiers >= 4, 'Kışlada asker devriyesi (' + mil.soldiers + ')');
  check(mil.alert, 'Yasak bölgede kalınca alarm verildi');
  await p.evaluate(() => { const m = game.military; const s = m.nearestSoldier(); const pl = game.player; pl.pos.set(s.pos.x + 9, 0, s.pos.z + 5); pl.camYaw = Math.atan2(s.pos.x - pl.pos.x, s.pos.z - pl.pos.z); pl.camPitch = 0.2; sim(0.4); });
  const mc = await p.evaluate(() => { const s = game.military.nearestSoldier(); return s && { x: s.pos.x + 7, y: s.pos.y + 3.5, z: s.pos.z + 7, lx: s.pos.x, ly: s.pos.y + 1, lz: s.pos.z }; });
  try { await shot('military.png', mc); } catch (e) { console.log('military.png alınamadı: ' + e.message); }

  // ---------------- sokak olayı ----------------
  const ev = await p.evaluate(() => {
    game.wanted.reset(); game.npcs.calmPolice(); game.player.god = false;
    game.player.pos.set(-150, 0, -200);
    sim(1);
    const ok = game.missions.side.startEvent('mugging');
    sim(1);
    const e = game.missions.side.event;
    if (e && e.thief) e.thief.takeDamage(999, game.player, 'bullet');
    sim(1);
    return { ok, cleared: !game.missions.side.event };
  });
  check(ev.ok && ev.cleared, 'Sokak olayı (kapkaç) başladı ve çözüldü');

  console.log(fails.length ? `\n${fails.length} KONTROL BAŞARISIZ` : '\nTÜM KONTROLLER GEÇTİ');
};
