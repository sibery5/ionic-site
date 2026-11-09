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

  if (want('boat')) {
    const r = await p.evaluate(() => {
      const g = game, pl = g.player, res = {};
      const moored = (g.mooredBoats || []).filter((v) => g.vehicles.list.includes(v));
      res.moored = moored.map((v) => v.type).reduce((m, t) => { m[t] = (m[t] || 0) + 1; return m; }, {});
      const mega = moored.find((v) => v.type === 'megayat'), yat = moored.find((v) => v.type === 'yat');
      // iskeleden binme: oyuncu yatın yanına, iskele üstüne
      const board = (v) => {
        if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle);
        pl.swimming = false;
        const side = Math.sign((v.pos.z % 35 + 35) % 35 - 17.5) || 1;
        pl.pos.set(v.pos.x, 0, v.pos.z - Math.sign(v.pos.z - Math.round((v.pos.z + 690.25) / 35) * 35 + 690.25) * (v.def.wid / 2 + 1.2));
        void side;
        sim(0.3);
        const near = g.vehicles.nearestEnterable(pl.pos.x, pl.pos.z, 2.5);
        press('KeyF'); sim(0.2);
        return { near: near === v, inside: pl.vehicle === v };
      };
      const drive = (v, sec) => {
        // biniş marinada sınandı; dönüş karşılaştırması açık denizde (Marmara kıyı bandı)
        v.pos.set(-300, v.pos.y, 940); v.heading = Math.PI / 2; v.vx = v.vz = 0; v.yawRate = 0; v.sync();
        const h0 = v.heading, x0 = v.pos.x, z0 = v.pos.z;
        let maxYaw = 0, maxSp = 0, yawSum = 0;
        hold('KeyW', true); sim(sec * 0.5, () => { maxSp = Math.max(maxSp, Math.hypot(v.vx, v.vz)); });
        hold('KeyA', true); sim(sec * 0.5, () => { maxYaw = Math.max(maxYaw, Math.abs(v.yawRate)); yawSum += Math.abs(v.yawRate) / 30; maxSp = Math.max(maxSp, Math.hypot(v.vx, v.vz)); });
        hold('KeyA', false); hold('KeyW', false);
        return { moved: +Math.hypot(v.pos.x - x0, v.pos.z - z0).toFixed(1), maxSpeed: +maxSp.toFixed(1), maxYawRate: +maxYaw.toFixed(3), turned: +yawSum.toFixed(2), hp: Math.round(v.hp), wanted: g.wanted.level };
      };
      g.wanted.level = 0;
      res.megaBoard = mega ? board(mega) : null;
      res.megaDrive = mega && pl.vehicle === mega ? drive(mega, 16) : null;
      res.yatBoard = yat ? board(yat) : null;
      res.yatDrive = yat && pl.vehicle === yat ? drive(yat, 16) : null;
      if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle);
      g.wanted.level = 0;
      // liman gemisi: rıhtımdan iskele merdiveniyle güverteye çık, güvertede yürü
      const H = g.harborShip;
      pl.swimming = false; pl.vy = 0;
      pl.pos.set(H.gangway.bottomX, 0, H.gangway.z); pl.camYaw = Math.PI / 2; pl.heading = Math.PI / 2;
      let maxY = 0;
      let phase = 0;
      hold('KeyW', true);
      sim(8, () => { maxY = Math.max(maxY, pl.pos.y); if (phase === 0 && pl.pos.x > H.gangway.x) { phase = 1; pl.camYaw = 0; } });
      hold('KeyW', false); sim(0.5);
      res.ship = { deckY: +H.deckY.toFixed(2), y: +pl.pos.y.toFixed(2), x: +pl.pos.x.toFixed(1), z: +pl.pos.z.toFixed(1), onDeck: pl.pos.z > H.cz - H.B / 2 && Math.abs(pl.pos.y - H.deckY) < 0.3 && !pl.swimming, maxY: +maxY.toFixed(2) };
      return res;
    });
    console.log('boat', JSON.stringify(r));
    check('marinada bağlı yat/mega yat + liman tekneleri', (r.moored.megayat || 0) >= 2 && (r.moored.yat || 0) >= 3 && (r.moored.balikci || 0) >= 2, r.moored);
    check('mega yata F ile binildi', r.megaBoard && r.megaBoard.inside, r.megaBoard);
    check('mega yat sürüldü', r.megaDrive && r.megaDrive.moved > 15, r.megaDrive);
    check('yata F ile binildi ve sürüldü', r.yatBoard && r.yatBoard.inside && r.yatDrive && r.yatDrive.moved > 15, [r.yatBoard, r.yatDrive]);
    check('mega yat motoryattan geç döner (ağır)', r.megaDrive && r.yatDrive && r.megaDrive.maxYawRate < r.yatDrive.maxYawRate * 0.8, [r.megaDrive && r.megaDrive.maxYawRate, r.yatDrive && r.yatDrive.maxYawRate]);
    check('liman gemisine iskele merdiveniyle çıkılıp güvertede yürünür', r.ship.onDeck, r.ship);
    if (process.env.SHOTS === '1') {
      await p.evaluate(() => { const g = game, pl = g.player; if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle); g.env.time = 17.6; pl.pos.set(207, 0, -628); pl.camYaw = -2.2; pl.camPitch = 0.12; pl.heading = pl.camYaw + Math.PI; sim(0.2); });
      await H.shot(p, out + '-marina.png');
      await p.evaluate(() => { const g = game, pl = g.player, v = (g.mooredBoats || []).find((b) => b.type === 'megayat' && g.vehicles.list.includes(b)); pl.pos.set(v.pos.x - 8, 0, v.pos.z + (v.pos.z > -620 ? -10 : 10) * 0 - 4.5); pl.camYaw = 2.3; pl.camPitch = 0.05; sim(0.2); });
      await H.shot(p, out + '-yacht.png');
      await p.evaluate(() => { const g = game, pl = g.player, Hs = g.harborShip; pl.pos.set(Hs.cx - 70, 0, Hs.cz - 16); pl.camYaw = -2.0; pl.camPitch = 0.08; sim(0.2); });
      await H.shot(p, out + '-harbor.png');
    }
  }
  console.log(fail ? `SONUÇ: ${fail} hata` : 'SONUÇ: tümü geçti');
  void out;
};
