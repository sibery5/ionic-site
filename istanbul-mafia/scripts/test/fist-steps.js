// [B2] Yumruk dövüşü testi. Ölçülen:
//  1) oyuncu sol tıkla (gerçek girdi yolu) 10 yumruk atar → isabet sayısı (≥ 8), hasar isabet karesinde mi (tıktan sonra ~0,15–0,3 sn)
//  2) sivil kaç yumrukta yere düşer (3–5)
//  3) kavgacı çeteci yumrukla saldırır: 10 sn'de oyuncuya ≥ 2 isabet
//  4) sağ tık blok: hasar azalır
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/fist $PWD/scripts/test/fist-steps.js
const H = require('./harness.js');
module.exports = async (p) => {
  p.setDefaultTimeout(600000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player, I = g.input;
    pl.god = true; pl.setWeapon('fists'); sim(0.3);
    const face = (n) => { const a = Math.atan2(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z); pl.camYaw = a; };
    const put = (n, d) => { const f = { x: Math.sin(pl.camYaw), z: Math.cos(pl.camYaw) }; n.pos.set(pl.pos.x + f.x * d, pl.pos.y, pl.pos.z + f.z * d); };
    const out = {};
    // 1) 10 yumruk (dayanıklı çeteci: kaçmaz, karşılık verir)
    {
      const n = g.npcs.add('gang', pl.pos.x, pl.pos.z, null, { state: 'idle' }); put(n, 1.1); n.maxHp = n.hp = 5000; n.static = true; n.knockdown = () => false; // isabet ölçümü: yere düşme ayrı (2. bölüm)
      let hits = 0, lag = [], clickF = -1, F = 0; const diag = [];
      const td = n.takeDamage.bind(n); n.takeDamage = (a, b, k, h, r2) => { if (b === pl && k === 'melee') { hits++; if (clickF >= 0) lag.push(+((F - clickF) / 30).toFixed(3)); clickF = -1; } return td(a, b, k, h, r2); };
      const hp0 = n.hp;
      for (let k = 0; k < 10; k++) {
        face(n);
        const c0 = pl.model.combo;
        sim(0.5, (i) => { F++; if (i === 0) { I.mouse.leftPressed = true; clickF = F; } face(n); });
        diag.push([+Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z).toFixed(2), n.state, +(n.pos.y - pl.pos.y).toFixed(2), pl.model.combo - c0, +(pl.kdT || 0).toFixed(1), !!n.downed, +(n.kdT || 0).toFixed(1)]);
      }
      out.p = { hits, dmg: Math.round(hp0 - n.hp), lag, kinds: pl.model.combo, diag };
      n.takeDamage = td; g.npcs.remove(n);
    }
    // 2) sivil: kaç yumrukta düşer
    {
      const n = g.npcs.add('civilian', pl.pos.x, pl.pos.z, null, { state: 'idle' }); put(n, 1.0);
      let k = 0;
      for (; k < 12 && !(n.kdT > 0) && !n.downed && !n.dead; k++) {
        put(n, 1.0); face(n);
        sim(0.45, (i) => { if (i === 0) I.mouse.leftPressed = true; face(n); if (i < 6) put(n, 1.0); });
      }
      out.civ = { punches: k, down: n.kdT > 0 || !!n.downed || n.dead, hp: Math.round(n.hp), dead: n.dead };
      g.npcs.remove(n);
    }
    // 3) çeteci yumrukla saldırır
    {
      pl.god = false; pl.hp = 100; pl.armor = 0;
      const n = g.npcs.add('gang', pl.pos.x + 4, pl.pos.z, null, { state: 'idle' });
      n.giveWeapon && n.giveWeapon('fists'); n.setWeapon('fists'); n.maxHp = n.hp = 5000;
      n.target = pl; n.state = 'combat'; n.hostile = true;
      let hits = 0; const td = pl.takeDamage.bind(pl);
      pl.takeDamage = (a, b, k, h, r2) => { if (b === n && k === 'melee') hits++; return td(a, b, k, h, r2); };
      sim(10, () => { pl.hp = Math.max(pl.hp, 50); });
      out.npc = { hits, weapon: n.weapon, state: n.state, d: +Math.hypot(n.pos.x - pl.pos.x, n.pos.z - pl.pos.z).toFixed(2) };
      // 4) blok: sağ tık basılı, yüzü saldırgana dönük
      let dmgB = 0, hitsB = 0; pl.takeDamage = (a, b, k, h, r2) => { const x = td(a, b, k, h, r2); if (b === n && k === 'melee') { hitsB++; dmgB += x; } return x; };
      face(n); I.mouse.right = true;
      sim(6, () => { face(n); pl.hp = Math.max(pl.hp, 50); });
      I.mouse.right = false;
      out.block = { hits: hitsB, perHit: hitsB ? +(dmgB / hitsB).toFixed(2) : 0, blocking: false };
      pl.takeDamage = td; pl.god = true; pl.hp = 100; g.npcs.remove(n);
    }
    return out;
  });
  console.log('yumruk', JSON.stringify(r));
  const ok = r.p.hits >= 8 && r.p.dmg > 0 && r.civ.down && r.civ.punches >= 3 && r.civ.punches <= 5 && r.npc.hits >= 2 && (r.block.hits === 0 || r.block.perHit < 5);
  console.log('KONSOL HATALARI:', errs.length); for (const e of errs.slice(0, 5)) console.log('  ', e.slice(0, 300));
  console.log(ok && !errs.length ? 'YUMRUK TAMAM' : 'YUMRUK HATA');
};
