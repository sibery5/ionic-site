// [C3] Polis müdahalesi: ekip aracı gelir, 12-20 m'de durur, megafonla uyarır, araç arkasında siper alır, uyarıdan sonra ateş eder.
// Kabul: ≤25 sn'de araç ≤25 m; ilk atıştan önce uyarı (≥3 sn); ateş anında ekibin ≥%70'i araç arkasında.
const H = require('./harness.js');

module.exports = async (p, out) => {
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(e.message));
  p.setDefaultTimeout(600000);
  await H.start(p);
  await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player, W = g.wanted, C = g.combat;
    g.loop = () => {};
    pl.god = true;
    g.ui.closeAll(); g.ui.dialogEl.classList.add('hidden'); g.mode = 'playing';
    sim(0.5);
    pl.giveWeapon('ak', 100); pl.setWeapon('ak');
    W.set(2);
    const t0 = C.clock;
    let carNearAt = null, minCar = 999, firstHitAt = null;
    const hp0 = pl.hp;
    // oyuncuya gelen ilk polis mermisi (god açıkken bile takeDamage çağrılır)
    const td = pl.takeDamage.bind(pl);
    pl.takeDamage = function (amt, att, kind, ...rest) { if (firstHitAt === null && att && att.faction === 'police') firstHitAt = C.clock; return td(amt, att, kind, ...rest); };
    for (let i = 0; i < 90; i++) {
      g.ui.closeAll(); g.ui.dialogEl.classList.add('hidden'); g.mode = 'playing';
      sim(0.5);
      for (const u of W.units || []) { if (!u.v) continue; const d = Math.hypot(u.v.pos.x - pl.pos.x, u.v.pos.z - pl.pos.z); minCar = Math.min(minCar, d); if (d <= 25 && carNearAt === null) carNearAt = C.clock; }
      const U = W.lastWarn;
      if (U && U.firstShotAt && C.clock - U.firstShotAt > 1) break;
    }
    const U = W.lastWarn;
    return {
      carNear: carNearAt === null ? null : +(carNearAt - t0).toFixed(1), minCar: +minCar.toFixed(1),
      warned: !!U, warnAt: U ? +(U.warnFrom - t0).toFixed(1) : null, stopD: U ? +U.stopD.toFixed(1) : null,
      firstShot: U && U.firstShotAt ? +(U.firstShotAt - t0).toFixed(1) : null, gap: U && U.firstShotAt ? +(U.firstShotAt - U.warnFrom).toFixed(1) : null,
      coverFrac: U ? U.coverFrac : null, firstHit: firstHitAt === null ? null : +(firstHitAt - t0).toFixed(1), units: (W.units || []).length,
    };
  });
  console.log('POLİS', JSON.stringify(r));
  console.log('HATA', errs.length, errs.slice(0, 3).join(' | '));
  const ok = r.carNear !== null && r.carNear <= 25 && r.warned && r.gap >= 3 && r.stopD >= 10 && r.stopD <= 22 && r.coverFrac >= 0.7 && (r.firstHit === null || r.firstHit >= r.warnAt + 3) && errs.length === 0;
  console.log(ok ? 'SONUÇ: GEÇTİ' : 'SONUÇ: KALDI');
};
