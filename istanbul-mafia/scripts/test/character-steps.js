// Karakter / animasyon / oyuncu kontrolü testi.
// Kullanım: node scripts/test/play.js file://$PWD/app/index.html /tmp/out ./scripts/test/character-steps.js
const H = require('./harness.js');
// yavaş makinelerde playwright click'in kararlılık beklemesini atla
const shot = async (p, path) => { await p.evaluate(() => { game.render(); }); await p.screenshot({ path, timeout: 400000 }); };
const clickText = (p, t) => p.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t).click(), t);
module.exports = async (p, out) => {
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.waitForTimeout(800);
  // karakter oluşturma ekranı
  await clickText(p, 'YENİ OYUN');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: out + '-creator.png', timeout: 180000 });
  await clickText(p, 'MACERAYA BAŞLA');
  await p.waitForTimeout(600);
  await p.evaluate(() => { game.input.mouse.dx = 0; game.player.camPitch = 0.25; game.player.camYaw = game.player.heading + Math.PI; });
  await H.install(p);
  const r = await p.evaluate(() => {
    const log = [], g = game, pl = g.player, ok = (c, m) => { if (!c) log.push('HATA: ' + m); };
    const st = () => ({ y: +pl.pos.y.toFixed(2), sp: +pl.speed.toFixed(2), cr: !!pl.crouch, gr: pl.grounded, st: Math.round(pl.stamina) });
    for (const id of ['pistol', 'ak', 'knife', 'm4', 'shotgun', 'uzi']) pl.giveWeapon(id, 200);
    sim(1);
    // yürüme
    hold('KeyW', true); sim(1.5); log.push('yürü ' + JSON.stringify(st())); ok(pl.speed > 3, 'yürüme hızı');
    // koşu
    hold('ShiftLeft', true); sim(1.5); log.push('koş ' + JSON.stringify(st())); ok(pl.speed > 6.5 && pl.stamina < 100, 'koşu');
    hold('ShiftLeft', false); hold('KeyW', false); sim(1);
    // çömelme
    press('KeyC'); sim(0.2); hold('KeyW', true); sim(1); log.push('çömel ' + JSON.stringify(st())); ok(pl.crouch && pl.speed < 2, 'çömelme');
    hold('KeyW', false); press('KeyC'); sim(0.5); ok(!pl.crouch, 'çömelmeden kalk');
    // zıplama
    press('Space'); let maxY = 0; sim(1.2, () => { maxY = Math.max(maxY, pl.pos.y); }); log.push('zıpla maxY=' + maxY.toFixed(2)); ok(maxY > 0.6 && pl.grounded, 'zıplama');
    // takla (koşarken C)
    hold('KeyW', true); hold('ShiftLeft', true); sim(1); press('KeyC'); let rolled = false; sim(0.5, () => { if (pl.rollT > 0) rolled = true; }); hold('ShiftLeft', false); hold('KeyW', false); sim(1);
    ok(rolled, 'takla');
    // tabanca ile nişan + ateş, yan adım
    pl.setWeapon('pistol'); g.input.mouse.right = true; sim(0.5);
    hold('KeyD', true); sim(0.8); log.push('yan adım local=' + (pl.moveLocalX || 0).toFixed(2)); ok(Math.abs(pl.moveLocalX) > 0.6, 'yan adım');
    hold('KeyD', false); hold('KeyS', true); sim(0.6); ok(pl.moveLocalZ < -0.5, 'geri adım'); hold('KeyS', false);
    g.input.mouse.leftPressed = true; sim(0.1); g.input.mouse.leftPressed = true; sim(0.3);
    press('KeyV'); sim(0.5); ok(pl.shoulder === -1, 'omuz değiştir');
    // tüfek
    pl.setWeapon('ak'); sim(0.4); g.input.mouse.left = true; sim(0.6); g.input.mouse.left = false; press('KeyR'); sim(1); ok(pl.reloadT > 0 || pl.wstate.mag === 30, 'şarjör');
    g.input.mouse.right = false; sim(2.5);
    // yumruk ve bıçak
    pl.setWeapon('fists'); for (let i = 0; i < 3; i++) { g.input.mouse.leftPressed = true; sim(0.45); }
    pl.setWeapon('knife'); for (let i = 0; i < 2; i++) { g.input.mouse.leftPressed = true; sim(0.5); }
    pl.model.stab(); sim(0.4); pl.model.slash(); sim(0.4);
    // NPC'ler: vuruş tepkisi ve ölüm
    const n = g.npcs.list.find((x) => !x.dead && !x.vehicle);
    if (n) { n.takeDamage(10, pl, 'bullet'); sim(0.3); n.takeDamage(999, pl, 'bullet'); sim(2); ok(n.dead, 'npc ölüm'); log.push('npc ölüm hips y=' + n.model.hips.position.y.toFixed(2)); }
    // engel aşma: oyuncunun önüne korkuluk koy
    pl.heading = Math.PI / 2; sim(0.1); // binadan uzağa (+X yönü)
    const P = pl.pos.clone(); const f = { x: Math.sin(pl.heading), z: Math.cos(pl.heading) };
    g.physics.active.add(P.x + f.x * 1.5 - 0.15, P.z + f.z * 1.5 - 0.15, P.x + f.x * 1.5 + 0.15, P.z + f.z * 1.5 + 0.15, 0, 1.05, 'rail');
    pl.camYaw = pl.heading; hold('KeyW', true); hold('ShiftLeft', true); let vaulted = false; sim(1.5, () => { if (pl.vault) vaulted = true; }); hold('KeyW', false); hold('ShiftLeft', false); sim(0.5);
    log.push('vault=' + vaulted); ok(vaulted, 'engel aşma');
    if (!vaulted) {
      const q = []; g.physics.active.query(pl.pos.x - 3, pl.pos.z - 3, pl.pos.x + 3, pl.pos.z + 3, q);
      log.push('tanı: pos=' + pl.pos.toArray().map((v) => v.toFixed(2)) + ' f=' + f.x.toFixed(2) + ',' + f.z.toFixed(2) + ' kutular=' + JSON.stringify(q.map((b) => [b.x0, b.z0, b.x1, b.z1, b.y1, b.tag].map((v) => (typeof v === 'number' ? +v.toFixed(2) : v)))));
    }
    // oyuncu ölümü
    pl.takeDamage(999, n || null, 'bullet'); sim(2.5); ok(pl.dead, 'oyuncu ölümü'); log.push('ölüm hips y=' + pl.model.hips.position.y.toFixed(2));
    return log;
  });
  console.log(r.join('\n'));
  // yakın plan: oyuncuyu canlandır, tüfekle nişan (oyun içi)
  await p.setViewportSize({ width: 960, height: 540 });
  await p.evaluate(() => {
    const g = game, pl = g.player;
    g.respawnAt('hospital'); g.ui.closeAll(); g.mode = 'playing';
    pl.setWeapon('ak'); sim(1);
    g.input.mouse.right = true; sim(0.8);
    pl.camYaw = pl.heading + 2.5; pl.camPitch = 0.05; sim(0.5);
    g.ui.closeAll(); g.mode = 'playing'; g.input.mouse.right = true; sim(0.1);
  });
  await shot(p, out + '-player-aim.png');
  // karakter dizisi: hafif sahnede (oluşturma ekranı sahnesi) farklı kıyafet ve pozlar
  await p.evaluate(() => {
    const g = game; const s = g.creatorScene;
    g.input.mouse.right = false;
    const CM = g.creatorModel.constructor;
    const base = { ...g.player.model.look };
    const looks = [
      { top: 'suit', topColor: '#1d2440', pants: 'slacks', pantsColor: '#1d2440', shoes: 'polished', shoesColor: '#0a0a0a', hat: 'fedora', hatColor: '#151515', beard: 'full', glasses: true, chain: true },
      { gender: 'f', hair: 'uzun', hairColor: '#6b4a2e', beard: 'none', top: 'leather', topColor: '#4a2c1a', pants: 'jeans', shoes: 'boots', shoesColor: '#1a1a1a' },
      { top: 'track', topColor: '#1d3d6e', pants: 'track', pantsColor: '#1d3d6e', hair: 'kivircik', beard: 'mustache', shoes: 'sneaker', hat: 'none' },
      { gender: 'f', hair: 'at_kuyrugu', hairColor: '#d8b070', beard: 'none', top: 'coat', topColor: '#8a7a6a', pants: 'skirt', pantsColor: '#2a2a2a', shoes: 'polished', skin: '#c99572' },
      { top: 'police', topColor: '#1d2f5a', pants: 'slacks', pantsColor: '#1a2440', hat: 'police', hatColor: '#1a2440', shoes: 'boots', shoesColor: '#111111', skin: '#7d5236' },
      { top: 'tshirt', topColor: '#8a1a1a', pants: 'shorts', pantsColor: '#c9b48a', hair: 'arkaya', beard: 'stubble', skin: '#f1d0b5', hat: 'kasket', hatColor: '#5a4a3a' },
    ];
    const states = [{ speed: 0, talk: true }, { speed: 3.6 }, { speed: 0, aim: true, twoHanded: true, aimPitch: 0.05 }, { speed: 1.4 }, { speed: 0, aim: true, twoHanded: false, aimPitch: 0 }, { speed: 0, crouch: true }];
    const weap = [null, null, 'ak', null, 'pistol', null];
    g.creatorModel.root.visible = false;
    window.__lineup = looks.map((o, i) => {
      const m = new CM({ ...base, ...o });
      m.root.position.set(-2.1 + i * 0.85, 0, -0.6); m.root.rotation.y = i === 2 || i === 4 ? 0.9 : 0.25;
      s.add(m.root); if (weap[i]) m.setWeapon(weap[i]);
      for (let k = 0; k < 40; k++) m.animate(1 / 30, { ...states[i], force: true });
      return m;
    });
    g.creatorCam.position.set(0, 1.35, 4.4); g.creatorCam.lookAt(0, 0.95, -0.6); g.creatorCam.fov = 40;
    g.creatorCam.aspect = innerWidth / innerHeight; g.creatorCam.updateProjectionMatrix();
    g.mode = 'creator'; g.ui.closeAll();
    document.querySelectorAll('#hud, .hud').forEach((e) => (e.style.display = 'none'));
    g.renderer.render(s, g.creatorCam);
  });
  await p.screenshot({ path: out + '-lineup.png', timeout: 400000 });
  console.log('HATALAR: ' + (errs.length ? errs.join(' | ') : 'yok'));
};
