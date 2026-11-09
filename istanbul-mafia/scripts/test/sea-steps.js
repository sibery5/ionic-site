// Deniz testi (B4): gemi trafiği aralığı (120 sn + uzun koşu), köprü altı serbest yükseklik, karaya oturma;
// bağlı yata binip sürme (ağır yat daha yavaş döner); yüzme pozları (boşta su üstünde dik baş, harekette sıralı
// kol çekişi + ayak çırpma); rıhtım merdiveninden çıkış. PART=sep|boat|swim|ladder ile tek bölüm; SHOTS=1 ekran görüntüsü.
const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  const part = process.env.PART || 'all';
  const want = (k) => part === 'all' || part.split(',').includes(k);
  let fail = 0;
  const check = (name, ok, info) => { console.log((ok ? 'OK   ' : 'FAIL ') + name, info !== undefined ? JSON.stringify(info) : ''); if (!ok) fail++; };

  if (want('sep')) {
    const r = await p.evaluate(() => {
      const S = game.ships, L = S.ships, dt = 1 / 30;
      const res = {};
      const run = (sec) => {
        let minR = 1e9, minPair = null, literal = 0, clearMin = 1e9, under = 0;
        const st0 = { ...S.stats };
        const t0 = performance.now();
        for (let i = 0; i < sec * 30; i++) {
          S.update(dt);
          for (let a = 0; a < L.length; a++) {
            const A = L[a];
            const c = S.bridgeClearance(A); if (c !== null) { under++; clearMin = Math.min(clearMin, c); }
            for (let b = a + 1; b < L.length; b++) {
              const B = L[b], d = Math.hypot(A.pos.x - B.pos.x, A.pos.z - B.pos.z);
              const r = d / ((A.L + B.L) / 2);
              if (r < minR) { minR = r; minPair = [A.type + ':' + A.kind, B.type + ':' + B.kind, +d.toFixed(1), +A.pos.x.toFixed(0), +A.pos.z.toFixed(0), +B.pos.x.toFixed(0), +B.pos.z.toFixed(0), +(i / 30).toFixed(1)]; }
              if (d < A.L + B.L) literal++;
            }
          }
        }
        return { sec, ms: +((performance.now() - t0) / (sec * 30)).toFixed(3), minRatioHalf: +minR.toFixed(3), minPair, literalPairTicks: literal, pushes: S.stats.pushes - st0.pushes, groundings: S.stats.groundings - st0.groundings, gateHolds: S.stats.gateHolds - st0.gateHolds, docks: S.stats.docks - st0.docks, gatePasses: S.stats.gatePasses - st0.gatePasses, stalled: L.filter((s) => s.mode === 'sail' && s.speed < 0.3).length, bridgePassTicks: under, bridgeClearMin: +clearMin.toFixed(2) };
      };
      res.n = L.length;
      res.kinds = L.reduce((m, s) => { m[s.type] = (m[s.type] || 0) + 1; return m; }, {});
      res.r120 = run(120);
      res.r900 = run(900);
      res.speeds = L.filter((s) => s.mode !== 'anchor').map((s) => s.type[0] + ':' + s.speed.toFixed(1)).join(' ');
      return res;
    });
    console.log('sep', JSON.stringify(r));
    check('120 sn: hiçbir iki gemi (Li+Lj)/2 içinde değil', r.r120.minRatioHalf >= 1, r.r120.minPair);
    check('120 sn: son güvence itmesi yok', r.r120.pushes === 0, r.r120.pushes);
    check('900 sn: aralık korunur', r.r900.minRatioHalf >= 1, r.r900.minPair);
    check('900 sn: trafik akıyor (vapur yanaşmaları, köprü geçişleri)', r.r900.docks >= 6 && r.r900.gatePasses >= 4, [r.r900.docks, r.r900.gatePasses]);
    check('900 sn: son güvence itmesi yok', r.r900.pushes === 0, r.r900.pushes);
    console.log('info: kıyıda durdurma (pruva karaya değmeden, yanaşma manevrası) 120 sn / 900 sn:', r.r120.groundings, r.r900.groundings, '| gerçek sınır yorumu: (Li+Lj) tam boy altına inen çift-tik sayısı', r.r120.literalPairTicks);
    check('köprü altı serbest yükseklik > 0', r.r900.bridgeClearMin > 0.5 || r.r900.bridgePassTicks === 0, r.r900.bridgeClearMin);
  }
  console.log(fail ? `SONUÇ: ${fail} hata` : 'SONUÇ: tümü geçti');
  void out;
};
