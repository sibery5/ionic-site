// [C4] Atlatma süresi: oyuncu görüşten çıktıktan sonra yıldızın sönme süresi (14/24/36/50/65 tablosu) ve devriyelerin son görülen bölgeyi taraması.
// 1★: görülmeden saklanan oyuncu (arama alanı içinde) -> sönme süresi; 3★: ilk yıldızın düşme süresi.
const H = require('./harness.js');

module.exports = async (p, out) => {
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(e.message));
  p.setDefaultTimeout(600000);
  await H.start(p);
  await H.install(p);
  const r = await p.evaluate(() => {
    const g = game, pl = g.player, W = g.wanted;
    g.loop = () => {};
    pl.god = true;
    g.ui.closeAll(); g.ui.dialogEl.classList.add('hidden'); g.mode = 'playing';
    sim(0.5);
    const hideRun = (lvl, untilLevel, maxS) => {
      W.set(lvl);
      sim(0.2);
      // görünmez yap: kimse görmesin (polisin görüşünü test etmiyoruz, sayacı ölçüyoruz)
      const t0 = window.T; let scan = 0, near = 0;
      const step = 0.5;
      for (let s = 0; s < maxS; s += step) {
        sim(step);
        // devriye son görülen bölgeyi tarıyor mu: LKP'ye 40 m içinde kolluk sayısı
        for (const n of g.npcs.list) if (!n.dead && (n.faction === 'police' || n.lawUnit) && Math.hypot(n.pos.x - W.lkp.x, n.pos.z - W.lkp.z) < 40) { near++; break; }
        scan++;
        if (W.level <= untilLevel) break;
      }
      return { t: +(window.T - t0).toFixed(1), level: W.level, scanFrac: +(near / Math.max(1, scan)).toFixed(2) };
    };
    // görüş hesabı oyuncuyu görmesin: updateSight'ı devre dışı bırak (yalnız bu test için)
    const us = W.updateSight; W.updateSight = function (dt) { this.seen = false; this.seenT += dt; };
    const one = hideRun(1, 0, 40);
    const three = hideRun(3, 2, 60);
    W.updateSight = us;
    return { one, three };
  });
  console.log('KAÇIŞ', JSON.stringify(r));
  console.log('HATA', errs.length, errs.slice(0, 3).join(' | '));
  const ok = r.one.t >= 12 && r.one.t <= 18 && r.three.t >= 30 && r.three.t <= 45 && errs.length === 0;
  console.log(ok ? 'SONUÇ: GEÇTİ' : 'SONUÇ: KALDI');
};
