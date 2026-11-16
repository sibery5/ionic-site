// [vurulma tepkileri] Ölçüm: bölgeye göre sarsılma/sendeleme, bacak -> topallama, kol -> silah düşürme, ölümde yöne göre düşme,
// oyuncu vurulunca yön göstergesi + kamera sarsıntısı. Sayılar yazılır; eşikler altın kural 1'in asgari karşılığı.
const H = require('./harness.js');

module.exports = async (p, out) => {
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(e.message));
  p.setDefaultTimeout(600000);
  await H.start(p);
  await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player, C = g.combat;
    g.loop = () => {};
    pl.god = true;
    g.ui.closeAll(); g.ui.dialogEl.classList.add('hidden'); g.mode = 'playing';
    pl.camYaw += Math.PI; pl.heading = pl.camYaw; // önündeki engelden uzağa bak
    sim(0.5);
    pl.giveWeapon('ak', 500); pl.setWeapon('ak');
    const def = pl.wdef, sp0 = def.spread; def.spread = 0;
    const f = { x: Math.sin(pl.camYaw), z: Math.cos(pl.camYaw) };
    const mk = (hp = 100000) => { const n = g.npcs.add('gang', pl.pos.x + f.x * 7, pl.pos.z + f.z * 7, null, { state: 'idle', heading: pl.camYaw + Math.PI }); n.maxHp = n.hp = hp; n.helmet = 0; return n; };
    const shoot = (n, h) => { pl.fireCd = 0; pl.reloadT = 0; pl.weapons.ak.mag = 30; pl.bloom = 0; const o = pl.pos.clone(); o.y += 1.45; const d = n.pos.clone(); d.y += h; d.sub(o).normalize(); pl.tryFire(o, d); return d; };
    const res = {};
    // gövde: geri savrulma mesafesi + gövde irkilmesi (yay) tepe değeri
    for (const [zone, h] of [['torso', 1.15], ['leg', 0.5], ['head', 1.65]]) {
      const n = mk(); if (zone === 'head') n.helmet = 50;
      sim(0.1);
      const x0 = n.pos.x, z0 = n.pos.z;
      shoot(n, h);
      let fl = 0, hz = 0; const tr = [];
      sim(0.6, () => { const M = n.model; if (M.fl) fl = Math.max(fl, Math.hypot(M.fl.x, M.fl.z)); if (M.hz && M.hz.t > 0) hz = Math.max(hz, M.hz.k); });
      res[zone] = { push: +Math.hypot(n.pos.x - x0, n.pos.z - z0).toFixed(2), fl: +fl.toFixed(3), hzK: +hz.toFixed(2), limp: +(n.limp || 0).toFixed(2), stun: +(n.stunT || 0).toFixed(2), z: n._lastHit && n._lastHit.zone,  };
      n.dead = true; g.npcs.remove ? g.npcs.remove(n) : 0;
    }
    // kol: silah düşürme oranı (20 deneme)
    let drops = 0, armHits = 0;
    for (let i = 0; i < 20; i++) {
      const n = mk(); n.giveWeapon('pistol', 30); n.setWeapon('pistol'); sim(0.05);
      const fx = Math.sin(n.heading), fz = Math.cos(n.heading);
      // sağ kol: gövdenin 0,3 m yanı, omuz altı
      const lat = 0.3; const o = pl.pos.clone(); o.y += 1.45;
      const tx = n.pos.x - fz * lat, tz = n.pos.z + fx * lat;
      const d = o.clone(); d.set(tx - o.x, n.pos.y + 1.25 - o.y, tz - o.z).normalize();
      pl.fireCd = 0; pl.weapons.ak.mag = 30; pl.tryFire(o, d); sim(0.05);
      if (n._lastHit && n._lastHit.zone === 'arm') armHits++;
      if (n.weapon !== 'pistol') drops++;
      n.dead = true; g.npcs.remove ? g.npcs.remove(n) : 0;
    }
    res.arm = { armHits, drops };
    // ölüm: düşüş yönü mermi yönüyle hizalı mı
    { const n = mk(30); sim(0.1); const d = shoot(n, 1.15); sim(0.1); const D = n.model.deathDir; const h = n.model.root.rotation.y, c = Math.cos(h), s = Math.sin(h);
      const lx = d.x * c - d.z * s, lz = d.x * s + d.z * c, l = Math.hypot(lx, lz);
      res.death = { dead: n.dead, align: D ? +((D.x * lx + D.z * lz) / l).toFixed(2) : null }; }
    def.spread = sp0;
    // oyuncu vurulur: gösterge + kamera sarsıntısı
    pl.god = false; pl.hp = pl.maxHp = 5000;
    const e = mk(); e.giveWeapon('pistol', 30); e.setWeapon('pistol');
    let ind = 0; const hi = g.ui.hitIndicator.bind(g.ui); g.ui.hitIndicator = (a, k) => { ind++; hi(a, k); };
    let shake = 0; const cs = g.cameraShake.bind(g); g.cameraShake = (k) => { shake = Math.max(shake, k); cs(k); };
    const hp0 = pl.hp; const yaw0 = pl.camYaw, pit0 = pl.camPitch;
    const o = e.pos.clone(); o.y += 1.45; const dd = pl.pos.clone(); dd.y += 1.15; dd.sub(o).normalize();
    e.weapons.pistol.mag = 15; e.fireCd = 0; e.tryFire(o, dd); sim(0.05);
    res.player = { ind, shake: +shake.toFixed(2), camMove: +(Math.abs(pl.camYaw - yaw0) + Math.abs(pl.camPitch - pit0)).toFixed(3), stagger: +(pl.staggerT || 0).toFixed(2), dhp: hp0 - pl.hp, edead: e.dead, efire: e.weapons.pistol.mag };
    pl.god = true;
    return res;
  });
  console.log('TEPKİ', JSON.stringify(r));
  console.log('HATA', errs.length, errs.slice(0, 3).join(' | '));
  const ok = r.torso.push > 0.5 && r.torso.fl > 0.2 && r.leg.limp > 0.4 && r.head.push > 0.5 && r.arm.drops >= 4 && r.death.align > 0.7 && r.player.ind >= 1 && r.player.shake > 0.3 && errs.length === 0;
  console.log(ok ? 'SONUÇ: GEÇTİ' : 'SONUÇ: KALDI');
};
