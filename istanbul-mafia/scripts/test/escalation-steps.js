// Savaş hissi + kolluk yükselmesi testi:
//  - bölgesel isabet (bacak: topallama, kol: silah düşürme, ağır yara: yere yığılma), kemiğe yara izi
//  - oyuncu: yönlü vuruş göstergesi, kanama, İlk Yardım Çantası (B)
//  - yeni silahlar ateşlenir
//  - 1→5 yıldız: yaya polis, araçtan ateş, barikat, özel harekât (kask), jandarma, helikopter, barikat tankı
//  - kışla: uyarı -> son uyarı -> alarm -> uzaklaşınca sakinleşme
//   SETTINGS='{"quality":"low"}' node scripts/test/play.js file://$PWD/app/index.html $PWD/.testout/esc $PWD/scripts/test/escalation-steps.js
const path = require('path');
const fs = require('fs');
const H = require('./harness.js');

module.exports = async (p, out) => {
  fs.mkdirSync(out, { recursive: true });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(e.message));
  p.setDefaultTimeout(600000);
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  const shot = async (n, cam) => {
    if (process.env.NOSHOT) return;
    await p.evaluate((c) => { if (c) { game.camera.position.set(c.x, c.y, c.z); game.camera.lookAt(c.lx, c.ly, c.lz); game.camera.fov = 60; game.camera.updateProjectionMatrix(); } game.render(); }, cam || null);
    try { await p.screenshot({ path: path.join(out, n), timeout: 600000 }); console.log('görüntü:', n); } catch (e) { console.log('görüntü alınamadı:', n, e.message.slice(0, 80)); }
  };
  await H.start(p);
  await H.install(p);
  await p.evaluate(() => { game.loop = () => {}; game.player.god = true; game.player.camYaw += Math.PI; game.player.heading = game.player.camYaw; sim(0.5); });

  // ---------------- bölgesel isabet ----------------
  const wound = await p.evaluate(() => {
    const g = game, pl = g.player;
    const f = { x: Math.sin(pl.camYaw), z: Math.cos(pl.camYaw) };
    const mk = (hp) => { const n = g.npcs.add('gang', pl.pos.x + f.x * 6, pl.pos.z + f.z * 6, null, { state: 'idle', heading: pl.camYaw + Math.PI, weapon: 'pistol' }); n.maxHp = 200; n.hp = hp; n.alertT = 99; return n; };
    const fire = (n, y, lat) => {
      pl.fireCd = 0; pl.reloadT = 0; pl.weapons.pistol.mag = 15;
      const o = pl.pos.clone(); o.y += 1.45;
      const d = n.pos.clone(); d.y += y; d.x += -f.z * lat; d.z += f.x * lat; d.sub(o).normalize();
      const def = Object.assign({}, g.combat && pl.wdef, { spread: 0, hipSpread: 0 });
      g.combat.hitscan(pl, o, d, def, o);
    };
    pl.giveWeapon('pistol', 200); pl.setWeapon('pistol'); sim(0.1);
    const a = mk(200); fire(a, 0.45, 0); sim(0.1);
    const leg = { limp: +a.limp.toFixed(2), wounds: (a.model.wounds || []).length };
    let dropped = false;
    for (let i = 0; i < 8 && !dropped; i++) { const b = mk(200); fire(b, 1.3, 0.3); sim(0.05); dropped = b.weapon === "fists"; g.npcs.remove(b); }
    let downed = null;
    for (let i = 0; i < 10 && !downed; i++) { const c = mk(60); fire(c, 1.1, 0); sim(0.05); if (c.downed) downed = c; else g.npcs.remove(c); }
    if (downed) sim(2);
    window.__downed = downed;
    return { leg, dropped, downed: !!downed, crawling: downed ? +downed.speed.toFixed(2) : 0, bleeding: g.combat.bleeding.length };
  });
  console.log('yara:', JSON.stringify(wound));
  check(wound.leg.limp > 0 && wound.leg.wounds > 0, 'Bacak isabeti: topallama + yara izi');
  check(wound.dropped, 'Kol isabeti: silah düştü');
  check(wound.downed, 'Ağır yaralı yere yığıldı (sürünüyor)');
  if (wound.downed) await shot('esc-1-wounded.png', await p.evaluate(() => { const n = window.__downed; return { x: n.pos.x + 2.2, y: n.pos.y + 1.6, z: n.pos.z + 2.2, lx: n.pos.x, ly: n.pos.y + 0.3, lz: n.pos.z }; }));

  // ---------------- oyuncu vuruş hissi + ilk yardım ----------------
  const ph = await p.evaluate(() => {
    const g = game, pl = g.player; for (const x of g.npcs.list.slice()) if (!x.mission) g.npcs.remove(x); g.combat.bleeding.length = 0; pl.god = false; pl.hp = 100; pl.armor = 0;
    const n = g.npcs.add('gang', pl.pos.x + 6, pl.pos.z, null, { state: 'idle' });
    const o = n.pos.clone(); o.y += 1.15; const d = pl.pos.clone(); d.y += 1.15; d.sub(o).normalize();
    const yaw0 = pl.camYaw;
    g.combat.hitscan(n, o, d, { dmg: 30, range: 100, sound: 'pistol' }, o);
    const ind = !!(g.ui.hitInd && g.ui.hitInd.els.length);
    const flinch = Math.abs(pl.camYaw - yaw0) > 0.0001;
    g.npcs.remove(n);
    g.combat.playerBleed(2);
    const hp0 = pl.hp; sim(4); const hp1 = pl.hp;
    g.state.firstAid = 1;
    press('KeyB'); sim(2.2);
    const res = { ind, flinch, bleedDrain: +(hp0 - hp1).toFixed(1), bleedAfter: pl.bleed, kits: g.state.firstAid, hp: Math.round(pl.hp) };
    pl.god = true; pl.hp = 100;
    return res;
  });
  console.log('oyuncu:', JSON.stringify(ph));
  check(ph.ind && ph.flinch, 'Yönlü vuruş göstergesi + kamera irkilmesi');
  check(ph.bleedDrain > 1, 'Kanama canı azaltıyor');
  check(ph.bleedAfter === 0 && ph.kits === 0, 'İlk Yardım Çantası (B) kanamayı durdurdu');

  // ---------------- yeni silahlar ----------------
  const wres = await p.evaluate(() => {
    const g = game, pl = g.player, log = [];
    for (const id of ['kilic', 'kartal', 'akrep', 'cifte', 'tufan', 'bozkurt', 'simsek']) {
      pl.giveWeapon(id, 50); pl.setWeapon(id); sim(0.05);
      let fired = 0;
      for (let k = 0; k < 2; k++) { pl.fireCd = 0; pl.reloadT = 0; const o = pl.pos.clone(); o.y += 1.45; const d = pl.pos.clone().set(Math.sin(pl.camYaw), -0.05, Math.cos(pl.camYaw)).normalize(); if (pl.tryFire(o, d)) fired++; sim(0.1); }
      if (id === 'simsek') sim(3);
      log.push(id + ':' + fired);
    }
    pl.setWeapon('pistol');
    return log.join(' ');
  });
  console.log('yeni silahlar:', wres);
  check(!/:0/.test(wres), 'Yeni silahların hepsi ateşlendi');

  // ---------------- 1 → 5 yıldız ----------------
  const esc = await p.evaluate(() => {
    const g = game, pl = g.player, W = g.wanted;
    for (const n of g.npcs.list.slice()) if (!n.mission) g.npcs.remove(n);
    const node = g.map.nearestNode(-150, -200); pl.pos.set(node.x + 8.5, 0, node.z + 8.5);
    let shots = 0; const ls = W.lawShot.bind(W); W.lawShot = (...a) => { shots++; return ls(...a); };
    const cnt = (f) => g.npcs.list.filter((n) => !n.dead && f(n)).length;
    const out = {};
    W.set(1); sim(4);
    // [kanun] 1★: yaya polis belirmez; devriye/ekip aracı (içindeki ekip dahil) yola çıkar
    out.l1 = { foot: cnt((n) => n.faction === 'police') + W.units.length, lvl: W.level };
    W.set(2); W.dispatchT = 0; sim(8);
    out.l2 = { cars: g.vehicles.list.filter((v) => v.police && v.ai && (v.ai.mode === 'chase' || v.ai.mode === 'halt' || v.lawUnit)).length, shots };
    W.set(3); W.roadblockT = 0.1; sim(4);
    out.l3 = { rb: W.roadblocks.length };
    W.set(4); W.swatT = 0.1; sim(4); // [kanun] özel harekât zırhlı araçla gelir (ekip araçta sayılır)
    out.l4 = { swat: cnt((n) => n.kind === 'swat'), gear: cnt((n) => n.kind === 'swat' && n.model.gear) };
    W.set(5); W.heliT = 0.1; W.armyT = 0.1; W.roadblockT = 0.1; W.clearRoadblocks(); sim(5);
    out.l5 = { heli: !!W.heli, army: W.army.filter((n) => !n.dead).length, tank: W.roadblocks.some((r) => r.tank), heliY: W.heli ? Math.round(W.heli.pos.y) : 0 };
    const s0 = shots; sim(10); out.l5.lawShots = shots - s0;

    W.lawShot = ls;
    return out;
  });
  console.log('yükselme:', JSON.stringify(esc));
  check(esc.l1.foot >= 1, '1★ devriye / ekip yolda (' + esc.l1.foot + ')');
  check(esc.l2.cars >= 1, '2★ ekip aracı takipte (' + esc.l2.cars + ')');
  check(esc.l3.rb >= 1, '3★ barikat (' + esc.l3.rb + ')');
  check(esc.l4.swat >= 1 && esc.l4.gear >= 1, '4★ kasklı özel harekât (' + esc.l4.swat + ')');
  check(esc.l5.heli, '5★ helikopter havada');
  check(esc.l5.army >= 1, '5★ jandarma (' + esc.l5.army + ')');
  console.log('   (bilgi) barikat tankı:', esc.l5.tank, '· kolluk atışı:', esc.l5.lawShots);
  // gece: helikopter projektörü + kasklı birlikler
  const cam = await p.evaluate(() => {
    const g = game, pl = g.player, W = g.wanted;
    g.env.time = 23; sim(0.3);
    const H = W.heli; if (H) { H.orbit = Math.atan2(-1, -1); }
    sim(1);
    const s = W.army.find((n) => !n.dead) || g.npcs.list.find((n) => n.kind === 'swat' && !n.dead);
    if (s) { s.pos.set(pl.pos.x + 3, pl.pos.y, pl.pos.z + 2); s.heading = Math.atan2(pl.pos.x - s.pos.x, pl.pos.z - s.pos.z); }
    const t = g.npcs.list.find((n) => n.kind === 'swat' && !n.dead && n !== s);
    if (t) { t.pos.set(pl.pos.x + 4.2, pl.pos.y, pl.pos.z + 3.5); t.heading = s ? s.heading : 0; }
    sim(0.1);
    return { x: pl.pos.x - 6, y: pl.pos.y + 3.2, z: pl.pos.z - 7, lx: pl.pos.x + 2, ly: 4, lz: pl.pos.z + 2 };
  });
  await shot('esc-2-night-heli-swat.png', cam);
  const calm = await p.evaluate(() => { game.wanted.reset(); game.npcs.calmPolice(); sim(2); return { heli: !!game.wanted.heli, army: game.wanted.army.length, lvl: game.wanted.level }; });
  check(!calm.heli && calm.army === 0 && calm.lvl === 0, 'Aranma bitince helikopter/jandarma çekildi');

  // ---------------- kışla uyarıları ----------------
  const mil = await p.evaluate(() => {
    const g = game, m = g.military, pl = g.player;
    g.env.time = 13;
    // [kanun] duvarın dışında (yoldan geçen gibi) uyarı yok; içeri girince uyarı -> son uyarı -> ateş
    pl.pos.set(m.zone.x1 + 20, 0, m.cz); sim(2);
    const soldiers = m.soldiers.filter((s) => !s.dead).length;
    pl.pos.set(m.zone.x1 + 20, 0, m.cz); sim(1.5);
    const s0 = m.stage || 0;
    pl.pos.set(m.zone.x1 - 3, 0, m.cz); sim(0.5);
    const s1 = m.stage;
    sim(3.5);
    const s2 = m.stage;
    sim(4);
    const alert = m.alert, lvl = g.wanted.level;
    pl.pos.set(m.zone.x1 + 200, 0, m.cz); m.alertT = 1; sim(2);
    return { soldiers, s0, s1, s2, alert, lvl, calm: !m.alert };
  });
  console.log('kışla:', JSON.stringify(mil));
  check(mil.soldiers >= 4, 'Kışla devriyesi (' + mil.soldiers + ')');
  check(mil.s0 === 0, 'Duvar dışında (yolda) uyarı yok');
  check(mil.s1 === 1 && mil.s2 >= 2, 'İçeride: uyarı -> son uyarı');
  check(mil.alert && mil.lvl >= 3, 'Uyarıya uyulmayınca ateş + aranma');
  check(mil.calm, 'Uzaklaşınca alarm sona erdi');

  await p.evaluate(() => { game.wanted.reset(); sim(3); });
  console.log('KONSOL HATALARI:', errs.length);
  for (const e of errs.slice(0, 10)) console.log('  ', e.slice(0, 300));
  console.log(fails.length ? `BAŞARISIZ: ${fails.length}` : 'TÜMÜ BAŞARILI');
  if (errs.length || fails.length) process.exitCode = 1;
};
