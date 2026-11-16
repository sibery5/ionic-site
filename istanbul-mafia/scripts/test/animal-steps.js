// [C8] Hayvan koruması: kediye nişan alınca tetik çalışmaz + büyük uyarı; yumruk da iptal; doğrudan mermi hasar/kan vermez;
// üstüne sürülen araçtan hayvan kaçar.
const H = require('./harness.js');

module.exports = async (p, out) => {
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(e.message));
  p.setDefaultTimeout(600000);
  await H.start(p);
  await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player, A = g.animals;
    g.loop = () => {};
    pl.god = true;
    sim(0.5);
    let tries = 0; while (A.cats.length + A.dogs.length === 0 && tries++ < 40) { A.spawnStreetAnimal(pl.pos.x, pl.pos.z); }
    const cat = A.cats[0] || A.dogs[0];
    const put = () => { // kediyi nişan noktasına koy, kaçmasın (dik bakış: önde engel kalmasın)
      pl.camPitch = 0.55; pl.computeAim();
      const o = g.camera.position, d = pl.aimDir;
      const t = d.y < -0.02 ? (o.y - 0.25) / -d.y : 6;
      cat.x = o.x + d.x * t; cat.z = o.z + d.z * t; cat.state = 'sit'; cat.t = 99; cat.sp = 0; cat.g.position.set(cat.x, 0, cat.z);
    };
    pl.giveWeapon('ak', 300); pl.setWeapon('ak'); sim(0.3);
    g.ui.closeAll(); g.ui.dialogEl.classList.add('hidden'); g.mode = 'playing';
    g.input.mouse.right = true; sim(0.6); // nişan al: kamera omuz üstüne otursun
    put(); sim(0.3); put(); sim(1 / 30);
    const mag0 = pl.weapons.ak.mag + (pl.weapons.ak.ammo || 0);
    let blocked = 0;
    for (let k = 0; k < 20; k++) {
      g.ui.closeAll(); g.ui.dialogEl.classList.add('hidden'); g.mode = 'playing';
      put(); pl.fireCd = 0; pl.reloadT = 0;
      g.input.mouse.left = true; g.input.mouse.leftPressed = true;
      sim(1 / 30);
      if (pl.aimAnimal) blocked++;
    }
    g.input.mouse.left = false; g.input.mouse.right = false;
    const mag1 = pl.weapons.ak.mag + (pl.weapons.ak.ammo || 0);
    const bm = document.querySelector('.bigmsg');
    const msg = bm ? bm.textContent : '';
    const msgShown = bm && bm.classList.contains('show');
    // yumruk
    pl.setWeapon('fists');
    const w0 = A.warnN;
    for (let k = 0; k < 5; k++) {
      g.ui.closeAll(); g.ui.dialogEl.classList.add('hidden'); g.mode = 'playing';
      cat.x = pl.pos.x + Math.sin(pl.camYaw) * 0.9; cat.z = pl.pos.z + Math.cos(pl.camYaw) * 0.9; cat.state = 'sit'; cat.t = 99;
      pl.fireCd = 0; g.input.mouse.left = true; g.input.mouse.leftPressed = true; sim(1 / 30); g.input.mouse.left = false; sim(0.4);
    }
    const punchBlocked = A.warnN - w0;
    // doğrudan mermi (kapıyı atla): hasar/topallama yok
    const o = pl.pos.clone(); o.y += 1.4;
    cat.x = pl.pos.x + 5; cat.z = pl.pos.z; cat.state = 'sit'; cat.t = 99;
    const dir = pl.aimDir.clone().set(cat.x - o.x, 0.3 - o.y, cat.z - o.z).normalize();
    A.onBullet(o, dir, 10);
    const hurt = cat.hurtT || 0;
    // araç üstüne sürülür
    const v = g.vehicles.list.find(v => !v.destroyed && v.kind === 'car');
    let minD = 99, dodges0 = A.dodgeN || 0;
    if (v) {
      cat.x = v.pos.x + Math.sin(v.heading) * 8; cat.z = v.pos.z + Math.cos(v.heading) * 8; cat.state = 'sit'; cat.t = 99; cat.lod = 1;
      for (let i = 0; i < 45; i++) {
        v.vx = Math.sin(v.heading) * 9; v.vz = Math.cos(v.heading) * 9; v.speed = 9;
        v.pos.x += v.vx / 30; v.pos.z += v.vz / 30;
        A.think(cat, 1 / 30, 5, pl, g.vehicles.list); A.move(cat, 1 / 30, g);
        minD = Math.min(minD, Math.hypot(cat.x - v.pos.x, cat.z - v.pos.z));
      }
    }
    return { blocked, shotsUsed: mag0 - mag1, msg, msgShown, warnN: A.warnN, warnShown: A.warnShown, punchBlocked, hurt, carMinDist: +minD.toFixed(2), fled: cat.state, dodges: (A.dodgeN || 0) - dodges0 };
  });
  console.log('HAYVAN', JSON.stringify(r));
  console.log('HATA', errs.length, errs.slice(0, 3).join(' | '));
  const ok = r.blocked >= 18 && r.shotsUsed === 0 && /MASUM BİR HAYVANA/.test(r.msg) && r.punchBlocked >= 5 && r.hurt === 0 && r.carMinDist > 1.2 && errs.length === 0;
  console.log(ok ? 'SONUÇ: GEÇTİ' : 'SONUÇ: KALDI');
};
