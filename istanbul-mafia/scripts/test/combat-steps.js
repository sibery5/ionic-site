// Savaş/efekt/ses testi: tüm silahları ateşler, bıçak (arkadan) dener, patlama tetikler,
// konsol hatası olmadığını kontrol eder ve namlu alevi / kan / patlama görüntüleri alır.
//   node scripts/test/play.js http://localhost:8766/index.html /çıktı/klasörü ./scripts/test/combat-steps.js
const H = require('./harness.js');

module.exports = async (p, out) => {
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(e.message));
  p.setDefaultTimeout(600000);
  const shot = async (name) => { await p.evaluate(() => game.render()); await p.screenshot({ path: `${out}/${name}`, timeout: 600000 }); console.log('görüntü:', name); };
  await H.start(p);
  await H.install(p);
  // gerçek zamanlı döngüyü durdur: zamanı yalnızca sim() ilerletsin (efekt anını yakalamak için)
  await p.evaluate(() => { game.loop = () => {}; game.player.god = true; game.player.camYaw += Math.PI; game.player.heading = game.player.camYaw; sim(0.5); });

  // görüntü 1: AK ile NPC'ye ateş -> namlu alevi + kan
  await p.evaluate(() => {
    const g = game, pl = g.player;
    const f = { x: Math.sin(pl.camYaw), z: Math.cos(pl.camYaw) };
    pl.heading = pl.camYaw; pl.aiming = true;
    const n = g.npcs.add('gang', pl.pos.x + f.x * 7, pl.pos.z + f.z * 7, null, { state: 'idle', heading: pl.camYaw + Math.PI });
    n.maxHp = n.hp = 10000;
    window.__target = n;
    pl.giveWeapon('ak', 200); pl.setWeapon('ak'); sim(0.2);
    for (let k = 0; k < 6; k++) {
      pl.fireCd = 0; pl.reloadT = 0; pl.weapons.ak.mag = 30;
      const o = pl.pos.clone(); o.y += 1.45;
      const d = n.pos.clone(); d.y += 1.2 + (k % 3) * 0.15; d.sub(o).normalize();
      pl.tryFire(o, d);
      sim(k === 5 ? 0.02 : 0.12);
    }
  });
  await shot('combat-1-muzzle-blood.png');

  // NPC'yi öldür, kan gölü büyüsün; sonra patlama
  await p.evaluate(() => {
    const n = window.__target; n.hp = 1;
    const pl = game.player;
    const o = pl.pos.clone(); o.y += 1.45; const d = n.pos.clone(); d.y += 1.2; d.sub(o).normalize();
    pl.fireCd = 0; pl.tryFire(o, d); sim(4);
    const f = { x: Math.sin(pl.camYaw), z: Math.cos(pl.camYaw) };
    game.combat.explosion(pl.pos.x + f.x * 13 - f.z * 2.5, 0.3, pl.pos.z + f.z * 13 + f.x * 2.5, 7, 0, null, null);
    sim(0.3);
  });
  await shot('combat-2-explosion.png');
  // her silahı ateşle
  const res = await p.evaluate(() => {
    const g = game, pl = g.player, log = [];
    const ids = ['knife', 'bat', 'pistol', 'revolver', 'uzi', 'shotgun', 'ak', 'm4', 'sniper', 'rpg', 'grenade'];
    for (const id of ids) {
      pl.giveWeapon(id, 100); pl.setWeapon(id); pl.aiming = false;
      sim(0.1);
      let fired = 0;
      for (let k = 0; k < 3; k++) {
        pl.fireCd = 0; pl.reloadT = 0;
        const o = new THREE_V(pl.pos.x, pl.pos.y + 1.45, pl.pos.z);
        const d = new THREE_V(Math.sin(pl.camYaw), -0.05, Math.cos(pl.camYaw)).normalize();
        if (pl.tryFire(o, d)) fired++;
        sim(0.1);
      }
      if (id === 'rpg' || id === 'grenade') sim(3);
      log.push(id + ':' + fired);
    }
    pl.startReload(); sim(0.5);
    return log.join(' ');
    function THREE_V(x, y, z) { const v = pl.pos.clone(); v.set(x, y, z); return v; }
  });
  console.log('ateşlenen:', res);

  // önüne bir NPC koy, arkadan bıçakla (×3) ve kanamayı izle
  const knife = await p.evaluate(() => {
    const g = game, pl = g.player;
    const f = { x: Math.sin(pl.camYaw), z: Math.cos(pl.camYaw) };
    pl.heading = pl.camYaw;
    const n = g.npcs.add('civilian', pl.pos.x + f.x * 1.2, pl.pos.z + f.z * 1.2, null, { heading: pl.camYaw, state: 'idle' });
    n.maxHp = n.hp = 300;
    pl.setWeapon('knife'); pl.fireCd = 0; pl._combo = 1; // sonraki saldırı kesme olsun
    const hp0 = n.hp; pl.tryFire(pl.pos, pl.aimDir); const afterSlash = n.hp; sim(1);
    const out = { slash: Math.round(hp0 - afterSlash), bleedTo: Math.round(n.hp), bleeding: g.combat.bleeding.length };
    g.npcs.remove(n);
    return out;
  });
  console.log('bıçak:', JSON.stringify(knife));

  // NPC -> oyuncu hasar çarpanı
  const bal = await p.evaluate(() => {
    const g = game, pl = g.player; pl.god = false; pl.hp = 100; pl.armor = 0;
    const n = g.npcs.add('gang', pl.pos.x + 5, pl.pos.z, null, { state: 'idle' });
    const o = n.pos.clone(); o.y += 1.15;
    const d = pl.pos.clone(); d.y += 1.15; d.sub(o).normalize();
    g.combat.hitscan(n, o, d, { dmg: 32, range: 100 }, o);
    const hp = pl.hp; g.npcs.remove(n); pl.god = true; pl.hp = 100;
    return { hpAfter32: Math.round(hp) };
  });
  console.log('denge:', JSON.stringify(bal));

  const st = await p.evaluate(() => ({ alive: game.particles.fireSys.alive + game.particles.smokeSys.alive, splats: game.particles.splats.alive, pools: game.particles.pools.alive, scorch: game.particles.scorch.alive, holes: game.particles.holes.alive }));
  console.log('efekt sayıları:', JSON.stringify(st));
  await p.evaluate(() => sim(6));
  console.log('KONSOL HATALARI:', errs.length);
  for (const e of errs) console.log('  ', e.slice(0, 300));
  if (errs.length) process.exitCode = 1;
};
