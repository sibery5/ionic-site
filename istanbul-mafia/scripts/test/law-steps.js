// [kanun] Kanun ve yapay zekâ testi (PLAN-1.4 A1): her madde için ölçülebilir kontroller.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/law $PWD/scripts/test/law-steps.js
// İsteğe bağlı: LAW_ONLY=1,4,8 yalnız seçilen bölümler.
const fs = require('fs');
const H = require('./harness.js');

module.exports = async (p, out) => {
  fs.mkdirSync(out, { recursive: true });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.setDefaultTimeout(900000);
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  const only = process.env.LAW_ONLY ? process.env.LAW_ONLY.split(',').map(Number) : null;
  const want = (k) => !only || only.includes(k);
  await H.start(p);
  await H.install(p);
  // ortak yardımcılar (sayfa içinde)
  await p.evaluate(() => {
    const g = game;
    g.loop = () => {};
    g.player.god = true;
    window.L = {
      barks: [],
      clear() {
        const W = g.wanted; W.reset(); g.npcs.calmPolice();
        if (g.player.vehicle) g.vehicles.ejectDriver(g.player.vehicle);
        g.player.scriptCtl = null;
        for (const n of g.npcs.list.slice()) if (!n.mission) g.npcs.remove(n);
        for (const v of g.vehicles.list.slice()) if (!v.owned && v !== g.player.vehicle && v.mission !== 'prop') g.vehicles.remove(v);
        if (g.ambulance) g.ambulance.cleanup();
        g.ambulance.fire.length = 0;
        for (const k of Object.keys(g.state.gangRel)) delete g.state.gangRel[k];
        g.input.mouse.right = false; g.player.aiming = false;
        g.ui.closeAll(); g.ui.dialogEl.classList.add('hidden'); g.mode = 'playing'; // açılan hikâye diyaloğu girişi kilitlemesin
        g.onBusted = () => { L.busted = (L.busted || 0) + 1; }; // testte gözaltı ekranı açılmasın
        L.barks.length = 0;
      },
      // uzun, düz bir yol kenarı (merkeze yakın)
      road(cx = 200, cz = -100, minL = 90) {
        let best = null;
        for (const n of g.map.nodes) for (const e of n.edges) {
          const o = g.map.other(e, n), Lg = Math.hypot(o.x - n.x, o.z - n.z);
          const k = Math.hypot(n.x - cx, n.z - cz);
          if (Lg > minL && e.width < 16 && (!best || k < best.k) && !(g.military && g.military.inZone(n.x, n.z, 40))) best = { n, o, L: Lg, k, e };
        }
        if (!best) return L.road(cx, cz, minL * 0.75);
        const { n, o, L: Lg, e } = best; const fx = (o.x - n.x) / Lg, fz = (o.z - n.z) / Lg;
        return { n, o, L: Lg, fx, fz, e, at: (s, lat) => ({ x: n.x + fx * s - fz * lat, z: n.z + fz * s + fx * lat }) };
      },
      place(x, z, yaw) { const pl = g.player; pl.pos.set(x, 0, z); if (yaw !== undefined) { pl.heading = yaw; pl.camYaw = yaw; } },
      lawNpcs() { return g.npcs.list.filter((n) => !n.dead && (n.faction === 'police' || n.lawUnit)); },
      d(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); },
    };
    const ob = g.ui.bark.bind(g.ui);
    g.ui.bark = (a, text) => { L.barks.push(text); return ob(a, text); };
  });

  // ---------------- 1) sihirli belirme yok: devriye önce, takviye araçla gelir, iner, mevzi alır ----------------
  if (want(1)) {
    const r = await p.evaluate(() => {
      const g = game, W = g.wanted, pl = g.player;
      L.clear();
      const R = L.road(200, -100, 100); const at = R.at(50, 8.5); L.place(at.x, at.z, Math.atan2(R.fx, R.fz));
      sim(0.5);
      // yakında görüşte bir devriye polis, 140 m'de trafikte devriye aracı
      const c0 = R.at(72, 8.5);
      const cop = g.npcs.add('police', c0.x, c0.z, null, { state: 'idle' });
      let pc = null; for (let k = 0; k < 20 && !pc; k++) pc = g.vehicles.spawnTraffic(pl.pos.x, pl.pos.z, 'police');
      const spawns = [];
      const oadd = g.npcs.add.bind(g.npcs);
      g.npcs.add = (kind, x, z, look, opts) => { const n = oadd(kind, x, z, look, opts); spawns.push({ n, d: Math.hypot(x - pl.pos.x, z - pl.pos.z) }); return n; };
      const units = [];
      const odu = W.dispatchUnit.bind(W);
      W.dispatchUnit = (t, o) => { const u = odu(t, o); if (u) units.push({ u, d: Math.hypot(u.v.pos.x - pl.pos.x, u.v.pos.z - pl.pos.z), los: g.physics.lineOfSight(pl.pos.x, 1.6, pl.pos.z, u.v.pos.x, 1.4, u.v.pos.z) }); return u; };
      W.crime('shoot', pl.pos);
      const lvl0 = W.level;
      sim(1);
      const copResp = cop.state === 'attack' || cop.state === 'arrest';
      const patrolUnit = W.units.some((u) => u.patrol);
      // 25 sn boyunca: birim gelip duruyor mu, ekip iniyor mu
      let deployedAt = null, carSpeedAtDeploy = null, near5 = 0, crewNearCar = 0;
      for (let k = 0; k < 70 && deployedAt === null; k++) {
        sim(0.5);
        for (const u of W.units) if ((u.phase === 'deploy' || u.phase === 'deployed') && deployedAt === null) {
          deployedAt = k * 0.5 + 1; carSpeedAtDeploy = +u.v.speed.toFixed(2);
          sim(1.2);
          crewNearCar = u.crew.filter((a) => !a.dead && !a.passengerOf && !a.cargoOf && L.d(a.pos, u.v.pos) < 6).length;
        }
      }
      // ilk 25 sn'de yaya olarak (araç dışında, 100 m içinde) doğan kolluk var mı
      const footSpawn = spawns.filter((s) => (s.n.faction === 'police' || s.n.kind === 'swat') && !s.n.lawUnit && !s.n.rbGuard && s.d < 100).length;
      const crewSpawned = spawns.filter((s) => s.n.lawUnit).length;
      const uinfo = W.units.map((u) => u.phase + ':' + Math.round(L.d(u.v.pos, pl.pos)) + ':' + u.v.speed.toFixed(1) + ':' + (u.v.ai && u.v.ai.mode));
      g.npcs.add = oadd; W.dispatchUnit = odu;
      void pc;
      return { lvl0, copResp, patrolUnit, units: units.map((x) => ({ t: x.u.type, d: Math.round(x.d), los: x.los })), deployedAt, carSpeedAtDeploy, crewNearCar, footSpawn, crewSpawned, deployed: W.lawLog.deployed, responders: W.lawLog.responders, uinfo, lvl: W.level };
    });
    console.log('1 sevkiyat:', JSON.stringify(r));
    check(r.lvl0 >= 1 && r.copResp, '1a Görüşteki devriye polis suça tepki verdi');
    check(r.patrolUnit, '1b Trafikteki devriye aracı olay yerine yönlendirildi');
    check(r.footSpawn === 0, '1c 100 m içinde yaya kolluk "belirmedi" (' + r.footSpawn + ')');
    check(r.units.every((u) => u.d >= 85 && !u.los), '1d Takviye görüş dışından ve uzaktan geldi (' + JSON.stringify(r.units) + ')');
    check(r.deployedAt !== null && r.carSpeedAtDeploy < 1.5, '1e Ekip aracı durdu, sonra ekip indi (t=' + r.deployedAt + ' sn, v=' + r.carSpeedAtDeploy + ')');
    check(r.crewNearCar >= 1, '1f İnen ekip aracın yanında mevzi aldı (' + r.crewNearCar + ')');
  }

  // ---------------- 1g) özel harekât / jandarma araçla gelir ----------------
  if (want(1)) {
    const r = await p.evaluate(() => {
      const g = game, W = g.wanted;
      L.clear();
      const R = L.road(200, -100, 100); const at = R.at(50, 8.5); L.place(at.x, at.z);
      sim(0.3);
      W.set(4); W.swatT = 0.1; W.dispatchT = 99; W.roadblockT = 99; sim(1);
      const swatU = W.units.filter((u) => u.type === 'swat');
      const swatInVan = swatU.length && swatU[0].crew.every((a) => a.passengerOf === swatU[0].v || a.cargoOf === swatU[0].v);
      const vanType = swatU.length ? swatU[0].v.type : null;
      W.set(5); W.armyT = 0.1; W.heliT = 0.1; sim(1);
      const jU = W.units.filter((u) => u.type === 'jandarma');
      const heli = W.heli ? Math.round(L.d(W.heli.pos, game.player.pos)) : -1;
      return { swat: swatU.length, swatInVan: !!swatInVan, vanType, jand: jU.length, jVeh: jU.length ? jU[0].v.type : null, jCrew: jU.length ? jU[0].crew.length : 0, heliDist: heli };
    });
    console.log('1g ağır birimler:', JSON.stringify(r));
    check(r.swat >= 1 && r.swatInVan && r.vanType === 'swat', '1g Özel harekât zırhlı araç içinde geliyor');
    check(r.jand >= 1 && r.jCrew >= 2 && /askkamyon|cip/.test(r.jVeh || ''), '1h Jandarma kamyon/cip ile geliyor (' + r.jVeh + ', ' + r.jCrew + ')');
    check(r.heliDist > 150, '1i Helikopter uzaktan uçarak geliyor (' + r.heliDist + ' m)');
  }

  // ---------------- 2) araç takibi: kovalar, PIT dener, sıkıştırır, araçtan indirir ----------------
  if (want(2)) {
    const r = await p.evaluate(() => {
      const g = game, W = g.wanted, pl = g.player;
      L.clear();
      const R = L.road(0, 0, 150);
      const a = R.at(20, 2.5);
      const car = g.vehicles.add('sedan', a.x, a.z, Math.atan2(R.fx, R.fz));
      g.enterVehicle(car, true);
      W.set(3); W.roadblockT = 999; W.dispatchT = 0;
      // iki ekip aracını oyuncunun arkasına koy (kovalamaca ortası)
      const mk = (s, lat) => { const u = W.dispatchUnit('police'); if (!u) return null; const q = R.at(s, lat); u.v.pos.set(q.x, 0, q.z); u.v.heading = Math.atan2(R.fx, R.fz); u.v.vx = R.fx * 12; u.v.vz = R.fz * 12; u.v.ai.from = R.n; u.v.ai.to = R.o; u.v.ai.next = g.vehicles.chooseNext(R.o, R.n); return u; };
      const u1 = mk(2, 2.5), u2 = mk(-6, -2.5);
      let pitting = false, minD = 1e9, chase = 0, direct = false;
      // oyuncu yolda ~11 m/s ile kaçıyor (şerit boyunca)
      sim(7, () => {
        car.heading = Math.atan2(R.fx, R.fz); car.vx = R.fx * 11; car.vz = R.fz * 11;
        for (const u of W.units) { if (u.v.ai && u.v.ai.pitting) pitting = true; if (u.v.ai && u.v.ai.direct) direct = true; minD = Math.min(minD, L.d(u.v.pos, car.pos)); }
        chase = Math.max(chase, W.units.filter((u) => u.v.ai && u.v.ai.mode === 'chase').length);
      });
      const pit = W.lawLog.pit;
      // oyuncu durdu: sıkıştırma + "Araçtan in" + 2★'da gözaltı
      W.set(2);
      car.vx = car.vz = 0; car.controls.throttle = 0; car.controls.handbrake = true;
      let boxing = false, busted = false;
      const ob = g.onBusted; g.onBusted = () => { busted = true; };
      sim(14, () => { for (const u of W.units) if (u.v.ai && u.v.ai.boxing) boxing = true; car.vx *= 0.5; car.vz *= 0.5; });
      g.onBusted = ob;
      const deployed = W.units.filter((u) => u.phase === 'deployed' || u.phase === 'deploy').length;
      const said = L.barks.includes('Araçtan in! Eller yukarı!');
      if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle);
      void u1; void u2;
      return { chase, direct, pitting, pit, minD: Math.round(minD), boxing, deployed, said, busted };
    });
    console.log('2 araç takibi:', JSON.stringify(r));
    check(r.chase >= 2 && r.direct, '2a Ekip araçları oyuncu aracını doğrudan kovaladı');
    check(r.pitting || r.pit > 0, '2b PIT manevrası denendi (pit=' + r.pit + ')');
    check(r.minD < 12, '2c Takip aracı oyuncuya yanaştı (en yakın ' + r.minD + ' m)');
    check(r.boxing && r.deployed >= 1, '2d Duran araç sıkıştırıldı, ekip indi');
    check(r.said && r.busted, '2e "Araçtan in!" ve 2★\'da araçtan gözaltı');
  }

  // ---------------- 3) atlatma: görüş + LKP + arama alanı; 1★ kolay ----------------
  if (want(3)) {
    const r = await p.evaluate(() => {
      const g = game, W = g.wanted, pl = g.player;
      L.clear();
      const R = L.road(200, -100, 100); const at = R.at(40, 8.5); L.place(at.x, at.z);
      sim(0.3);
      // görüşteki polis varken yıldız sönmez
      const c = R.at(46, 8.5);
      const cop = g.npcs.add('police', c.x, c.z, null, { state: 'idle', persistent: true }); cop.maxHp = cop.hp = 9999;
      W.set(2); W.dispatchT = 999; W.swatT = 999;
      sim(20);
      const keptWhileSeen = W.level;
      // 1★: polisi kaldır, oyuncu uzaklaşıp saklanır
      for (const n of g.npcs.list.slice()) if (n.faction === 'police') g.npcs.remove(n);
      W.standDown();
      W.set(1); W.dispatchT = 999;
      const lkp0 = W.lkp.clone();
      const far = R.at(5, -9);
      L.place(far.x + 160, far.z + 160);
      let t1 = 0;
      while (W.level > 0 && t1 < 40) { sim(1); t1++; }
      // 3★: görünmezken birimler oyuncunun GERÇEK yerine değil LKP / arama noktasına gider
      L.place(at.x, at.z); W.set(3); W.roadblockT = 999; W.dispatchT = 0; sim(2);
      const hideAt = R.at(5, -9);
      for (const n of g.npcs.list.slice()) if (n.faction === 'police' && !n.lawUnit) g.npcs.remove(n);
      L.place(hideAt.x + 110, hideAt.z + 110); W.seenT = 5;
      sim(1);
      const goals = W.units.map((u) => u.v.ai && u.v.ai.goal ? Math.round(L.d(u.v.ai.goal, W.lkp)) : -1);
      const goalsFromPlayer = W.units.map((u) => u.v.ai && u.v.ai.goal ? Math.round(L.d(u.v.ai.goal, pl.pos)) : -1);
      const searchR0 = W.searchR; sim(6); const searchR1 = W.searchR;
      let t3 = 0; while (W.level > 0 && t3 < 200) { sim(2); t3 += 2; }
      // ilk 5 sn: 3★ başlar başlamaz 40 m içinde kolluk yok (sarılma yok)
      L.clear(); L.place(at.x, at.z); sim(0.5);
      W.set(3); W.roadblockT = 999;
      let within40 = 0;
      sim(5, (i) => { if (i % 15 === 0) within40 = Math.max(within40, L.lawNpcs().filter((n) => !n.passengerOf && !n.cargoOf && L.d(n.pos, pl.pos) < 40).length); });
      W.reset();
      void lkp0;
      return { keptWhileSeen, t1, goals, goalsFromPlayer, searchR0: Math.round(searchR0), searchR1: Math.round(searchR1), t3, within40 };
    });
    console.log('3 atlatma:', JSON.stringify(r));
    check(r.keptWhileSeen >= 2, '3a Polis görürken yıldız sönmedi (' + r.keptWhileSeen + ')');
    check(r.t1 <= 15, '3b 1★ görüşten çıkınca kolay söndü (' + r.t1 + ' sn)');
    check(r.goals.length > 0 && r.goals.every((d) => d >= 0 && d < 130) && r.goalsFromPlayer.every((d) => d > 60), '3c Takip araçları LKP/arama alanına gidiyor, gerçek konuma değil');
    check(r.searchR1 > r.searchR0, '3d Arama alanı zamanla büyüdü (' + r.searchR0 + '→' + r.searchR1 + ' m)');
    check(r.t3 > 0 && r.t3 < 200, '3e 3★ görüş dışında kalınca söndü (' + r.t3 + ' sn)');
    check(r.within40 === 0, '3f 3★ başında 40 m içinde kolluk belirmedi (' + r.within40 + ')');
  }

  // ---------------- 4) kırmızı ışık: kovalamaca yok, telefon bildirimi + ceza; yaya devriye protokolü ----------------
  if (want(4)) {
    const r = await p.evaluate(() => {
      const g = game, W = g.wanted, pl = g.player, TL = g.traffic;
      L.clear();
      // ışıklı kavşak + yaklaşma kolu
      let node = null, from = null;
      for (const n of g.map.nodes) { if (!TL.hasLight(n) || (g.military && g.military.inZone(n.x, n.z, 60))) continue; for (const e of n.edges) { const o = g.map.other(e, n); if (Math.hypot(o.x - n.x, o.z - n.z) > 60) { node = n; from = o; break; } } if (node) break; }
      const ux = (node.x - from.x), uz = (node.z - from.z), ul = Math.hypot(ux, uz); const fx = ux / ul, fz = uz / ul;
      const run = (state) => {
        const ols = TL.lightState.bind(TL);
        TL.lightState = (n, f) => (n === node ? state : ols(n, f));
        const car = g.vehicles.add('sedan', node.x - fx * 30 - fz * 2.5, node.z - fz * 30 + fx * 2.5, Math.atan2(fx, fz));
        g.enterVehicle(car, true);
        car.vx = fx * 13; car.vz = fz * 13;
        const m0 = g.state.money;
        hold('KeyW', true); sim(3.5); hold('KeyW', false);
        TL.lightState = ols;
        const res = { paid: m0 - g.state.money, lvl: W.level };
        g.vehicles.ejectDriver(car); g.vehicles.remove(car);
        return res;
      };
      g.state.money = 10000;
      const green = run('green');
      g.law.traffic.cool = 0;
      const red = run('red');
      const toast = document.querySelector('.law-phone-toast');
      const toastText = toast ? toast.textContent : (g.law.traffic.lastToast || '');
      // yaya devriye: suç görünce koşar, "Teslim ol!", yaklaşır, kelepçe
      L.clear();
      const R = L.road(200, -100, 100); const at = R.at(40, 8.5); L.place(at.x, at.z);
      const c = R.at(62, 8.5);
      const cop = g.npcs.add('police', c.x, c.z, null, { state: 'walk' });
      sim(0.5);
      const d0 = L.d(cop.pos, pl.pos);
      const civ = g.npcs.add('civilian', pl.pos.x + 1.2, pl.pos.z, null, { state: 'idle' });
      civ.takeDamage(20, pl, 'melee');
      sim(3);
      const d1 = L.d(cop.pos, pl.pos);
      const st = cop.state;
      const teslim = L.barks.some((b) => /Teslim ol|Dur! Polis/.test(b));
      let cuffing = 0;
      sim(6, () => { cuffing = Math.max(cuffing, W.arrestT); });
      const shotAt = cop.shotT > 0;
      W.reset();
      return { green, red, toastText, d0: Math.round(d0), d1: Math.round(d1), st, teslim, cuffing: +cuffing.toFixed(2), shotAt };
    });
    console.log('4 trafik/protokol:', JSON.stringify(r));
    check(r.green.paid === 0, '4a Yeşilde geçiş: ceza yok');
    check(r.red.paid === 1500 && r.red.lvl === 0, '4b Kırmızıda geçiş: ₺1.500 ceza, aranma yok (lvl=' + r.red.lvl + ')');
    check(/Kırmızı ışık ihlali/.test(r.toastText) && /1\.500|1500/.test(r.toastText), '4c Telefon bildirimi: "' + r.toastText.slice(0, 60) + '"');
    check(r.st === 'arrest' && r.d1 < r.d0 && r.teslim, '4d Yaya polis suçu gördü, "Teslim ol!" deyip koştu (' + r.d0 + '→' + r.d1 + ' m)');
    check(r.cuffing > 0.3 && !r.shotAt, '4e Silahsız şüpheliye ateş yok, kelepçe (' + r.cuffing + ')');
  }

  // ---------------- 5) askerî üs: yoldan geçene ateş yok; yalnız izinsiz giriş / tırmanma / ateş ----------------
  if (want(5)) {
    const r = await p.evaluate(() => {
      const g = game, m = g.military, pl = g.player, W = g.wanted;
      L.clear();
      g.env.time = 13;
      let shots = 0;
      // dışarıdaki yoldan yürü ve araçla geç
      pl.pos.set(m.zone.x1 + 18, 0, m.cz - 40); sim(2);
      const soldiers = m.soldiers.filter((s) => !s.dead);
      for (const s of soldiers) { const tf = s.tryFire.bind(s); s.tryFire = (o, d) => { const ok = tf(o, d); if (ok) shots++; return ok; }; }
      let maxStage = 0;
      sim(12, (i) => { pl.pos.z = m.cz - 40 + i * 0.05; maxStage = Math.max(maxStage, m.stage || 0); });
      const car = g.vehicles.add('sedan', m.zone.x1 + 14, m.cz - 60, 0); g.enterVehicle(car, true);
      sim(8, () => { car.vx = 0; car.vz = 12; maxStage = Math.max(maxStage, m.stage || 0); });
      g.vehicles.ejectDriver(car); g.vehicles.remove(car);
      const passive = { shots, maxStage, alert: m.alert, lvl: W.level };
      // duvara tırmanma girişimi: uyarı -> son uyarı -> alarm
      pl.pos.set(m.zone.x1 + 0.9, 0, m.cz); sim(0.5);
      const cs = [];
      for (let k = 0; k < 3; k++) { pl.vy = 4; pl.grounded = false; sim(0.1); pl.pos.set(m.zone.x1 + 0.9, 0, m.cz); sim(1.6); cs.push(m.alert ? 3 : m.stage); }
      m.calm(); W.reset(); m.alertT = 0; sim(0.5);
      // içeri girme
      pl.pos.set(m.zone.x1 - 3, 0, m.cz); sim(0.5); const in1 = m.stage; sim(3.8); const in2 = m.stage; sim(3.5); const inAlert = m.alert;
      pl.pos.set(m.zone.x1 + 220, 0, m.cz); m.alertT = 1; sim(2);
      m.calm(); W.reset();
      // dışarıdan (35 m) ateş: önce son uyarı
      pl.pos.set(m.zone.x1 + 35, 0, m.cz); sim(1.5);
      g.combat.noise(pl.pos.x, pl.pos.z, 60, pl);
      const afterShot = { stage: m.stage, alert: m.alert };
      W.reset(); m.calm();
      return { passive, cs, in1, in2, inAlert, afterShot };
    });
    console.log('5 kışla:', JSON.stringify(r));
    check(r.passive.shots === 0 && r.passive.maxStage === 0 && !r.passive.alert && r.passive.lvl === 0, '5a Yoldan yürüyen/araçla geçen vurulmadı, uyarı yok');
    check(r.cs[0] === 1 && r.cs[1] === 2 && r.cs[2] === 3, '5b Duvara tırmanma: uyarı → son uyarı → ateş (' + r.cs.join(',') + ')');
    check(r.in1 === 1 && r.in2 >= 2 && r.inAlert, '5c İzinsiz giriş: uyarı → son uyarı → alarm');
    check(r.afterShot.stage === 2 && !r.afterShot.alert, '5d Üs yakınında ateş: önce son uyarı');
  }

  // ---------------- 6) çeteler ----------------
  if (want(6)) {
    const r = await p.evaluate(() => {
      const g = game, pl = g.player, W = g.wanted;
      L.clear();
      const R = L.road(200, -100, 100); const at = R.at(40, 8.5); L.place(at.x, at.z, Math.atan2(R.fx, R.fz));
      sim(0.3);
      const grp = (gang, s, n = 3) => { const out = []; for (let i = 0; i < n; i++) { const q = R.at(s + i * 1.2, 8.5 + (i % 2)); const m = g.npcs.add('gang', q.x, q.z, null, { gang, state: 'guard', home: g.player.pos.clone().set(q.x, 0, q.z) }); m.faceYaw = 0; out.push(m); } return out; };
      // tarafsız çete + yanında sivil: kimse saldırmaz
      const neutral = grp('yilanlar', 46);
      const civ = g.npcs.add('civilian', R.at(47, 10).x, R.at(47, 10).z, null, { state: 'idle' });
      sim(6);
      const neutralCalm = neutral.every((n) => n.state !== 'attack') && civ.hp === civ.maxHp;
      // nişan alma: önce uyarı, sürünce kavga
      pl.giveWeapon('pistol', 50); pl.setWeapon('pistol');
      const tgt = neutral[0];
      pl.camYaw = Math.atan2(tgt.pos.x - pl.pos.x, tgt.pos.z - pl.pos.z); pl.heading = pl.camYaw;
      g.input.mouse.right = true;
      let warnAim = false;
      sim(4, () => { pl.camYaw = Math.atan2(tgt.pos.x - pl.pos.x, tgt.pos.z - pl.pos.z); if (L.barks.some((b) => /İndir o silahı|doğrultuyorsun|Silahı indir/.test(b))) warnAim = true; });
      g.input.mouse.right = false;
      const aimFight = neutral.filter((n) => n.state === 'attack' && n.target === pl).length;
      // bu kavga yerel: çeteyle savaş başlamadı
      const relAfterAim = g.state.gangRel.yilanlar || 0;
      for (const n of neutral) g.npcs.remove(n);
      // omuz atma: ilk çarpmada uyarı, ikincide kavga
      const bumpG = grp('carsi', 44, 2);
      g.npcs.onBump(bumpG[0]); const b1 = bumpG[0].state;
      sim(2); g.npcs.onBump(bumpG[0]); sim(0.5); const b2 = bumpG[0].state;
      for (const n of bumpG) g.npcs.remove(n);
      // araçla çarpma
      const carG = grp('bogaz', 44, 2);
      carG[0].takeDamage(15, pl, 'car'); sim(0.5);
      const carFight = carG.filter((n) => n.state === 'attack').length;
      for (const n of carG) g.npcs.remove(n);
      // düşman çete: tanır, "Babanın oğlu bu, yakalayın!"
      g.state.gangRel.kartallar = -50;
      L.barks.length = 0;
      const enemy = grp('kartallar', 58);
      sim(3);
      const enemyAtk = enemy.filter((n) => n.state === 'attack').length;
      const recog = L.barks.some((b) => /Babanın oğlu/.test(b));
      for (const n of enemy) g.npcs.remove(n);
      delete g.state.gangRel.kartallar;
      // çete sivile ateş açar: devriye polis müdahale eder; yaralı kelepçelenir, ölü kayda geçer
      const civ2 = g.npcs.add('civilian', R.at(70, 8.5).x, R.at(70, 8.5).z, null, { state: 'idle' }); civ2.maxHp = civ2.hp = 9999;
      const thug = g.npcs.add('gang', R.at(60, 8.5).x, R.at(60, 8.5).z, null, { gang: 'kurtlar', weapon: 'pistol', state: 'idle' }); thug.maxHp = thug.hp = 9999;
      const cp = R.at(30, 9);
      const cop = g.npcs.add('police', cp.x, cp.z, null, { state: 'walk' });
      thug.engage(civ2, 0.1);
      sim(4);
      const copOnThug = cop.target === thug && cop.state === 'attack';
      const thugCrim = thug.lawT > 0;
      thug.hp = 30; thug.goDown(cop);
      let cuffed = false; sim(12, () => { if (thug.cuffed) cuffed = true; });
      const arrests = W.lawLog.arrests;
      const thug2 = g.npcs.add('gang', R.at(64, 8.5).x, R.at(64, 8.5).z, null, { gang: 'kurtlar', weapon: 'pistol', state: 'idle' });
      thug2.lawT = 30; thug2.takeDamage(9999, cop, 'bullet');
      const recorded = thug2.recorded && W.lawLog.recorded > 0;
      for (const n of g.npcs.list.slice()) if (!n.mission) g.npcs.remove(n);
      // olay yerinde devriye yoksa: telsizle araç gelir
      const thug3 = g.npcs.add('gang', R.at(60, 8.5).x, R.at(60, 8.5).z, null, { gang: 'kurtlar', weapon: 'pistol', state: 'idle' }); thug3.maxHp = thug3.hp = 9999;
      const civ3 = g.npcs.add('civilian', R.at(75, 8.5).x, R.at(75, 8.5).z, null, { state: 'idle' }); civ3.maxHp = civ3.hp = 9999;
      thug3.engage(civ3, 0.1);
      sim(14);
      const incUnit = W.units.find((u) => u.incident);
      // karakol önü: istasyon polisleri çatışmaya girer
      for (const n of g.npcs.list.slice()) if (!n.mission) g.npcs.remove(n);
      W.standDown();
      const st = g.map.specials.find((b) => b.type === 'police');
      L.place(st.door.x + 25, st.door.z + (st.door.nz || 1) * 12);
      g.missions.stations.t = 0; sim(1.5);
      const sc = g.missions.stations.near.get(st.id);
      const t4 = g.npcs.add('gang', st.door.x + 10, st.door.z + (st.door.nz || 1) * 8, null, { gang: 'kurtlar', weapon: 'pistol', state: 'idle' }); t4.maxHp = t4.hp = 9999;
      const c4 = g.npcs.add('civilian', st.door.x + 16, st.door.z + (st.door.nz || 1) * 9, null, { state: 'idle' }); c4.maxHp = c4.hp = 9999;
      t4.engage(c4, 0.1);
      sim(4);
      const stationEngaged = sc ? sc.cops.filter((c) => !c.dead && c.target === t4).length : -1;
      window.__st = { cops: sc ? sc.cops.map((c) => c.state + ':' + Math.round(L.d(c.pos, t4.pos)) + ':' + (c.target === t4)) : null, lawT: t4.lawT, tst: t4.state, ttgt: t4.target === c4, crim: g.npcs.lawCrim };
      W.reset();
      return { neutralCalm, warnAim, aimFight, relAfterAim, b1, b2, carFight, enemyAtk, recog, copOnThug, thugCrim, cuffed, arrests, recorded, incUnit: !!incUnit, incVeh: incUnit ? incUnit.v.type : null, stationEngaged, st: window.__st };
    });
    console.log('6 çeteler:', JSON.stringify(r));
    check(r.neutralCalm, '6a Tarafsız çete oyuncuya da sivile de saldırmadı');
    check(r.warnAim && r.aimFight >= 1 && r.relAfterAim === 0, '6b Nişan alınca önce uyarı, sürünce yerel kavga (çeteyle savaş değil)');
    check(r.b1 !== 'attack' && r.b2 === 'attack', '6c Omuz atma: ilk çarpmada uyarı, tekrarında kavga');
    check(r.carFight >= 2, '6d Araçla çarpılan çete grubu saldırdı');
    check(r.enemyAtk >= 2 && r.recog, '6e Düşman çete tanıdı: "Babanın oğlu bu, yakalayın!"');
    check(r.copOnThug && r.thugCrim, '6f Sivile ateş eden çeteciye devriye polis müdahale etti');
    check(r.cuffed && r.arrests >= 1, '6g Yaralı çeteci kelepçelendi');
    check(r.recorded, '6h Ölen çeteci kayda geçti');
    check(r.incUnit, '6i Devriye yoksa olay yerine ekip aracı yönlendirildi (' + r.incVeh + ')');
    check(r.stationEngaged >= 1, '6j Karakol önündeki çatışmaya karakol polisi müdahale etti (' + r.stationEngaged + ')');
  }

  // ---------------- 7) ambulans ----------------
  if (want(7)) {
    const r = await p.evaluate(() => {
      const g = game, pl = g.player, A = g.ambulance;
      L.clear();
      const R = L.road(200, -100, 100); const at = R.at(40, 8.5); L.place(at.x, at.z);
      sim(0.3);
      const q1 = R.at(55, 8.5), q2 = R.at(58, 9), q3 = R.at(60, 8.5);
      const w = g.npcs.add('civilian', q1.x, q1.z, null, { state: 'idle' }); w.hp = 30; w.goDown(null); w.persistent = true;
      g.combat.bleeding = g.combat.bleeding.filter((b) => b.a !== w); // testte kan kaybından ölmesin
      const dd = g.npcs.add('civilian', q2.x, q2.z, null, { state: 'idle' }); dd.takeDamage(9999, null, 'bullet');
      const hurt = g.npcs.add('civilian', q3.x, q3.z, null, { state: 'idle' }); hurt.hp = hurt.maxHp * 0.5; hurt.persistent = true;
      // çatışma sürüyor: ambulans uzakta bekler
      let held = false, holdDist = 0, medicsOutWhileFire = 0;
      sim(30, (i) => {
        if (i % 20 === 0) A.noteGunfire(q1.x, q1.z);
        const U = A.unit;
        if (U && U.phase === 'hold') { held = true; holdDist = Math.max(holdDist, L.d(U.v.pos, q1)); }
        if (U && i % 60 === 0) (window.__amb = window.__amb || []).push(U.phase + ':' + Math.round(L.d(U.v.pos, q1)) + ':' + Math.round(L.d(U.wait, q1)) + ':' + U.v.speed.toFixed(1) + ':' + A.unsafe(q1.x, q1.z));
        if (U) medicsOutWhileFire = Math.max(medicsOutWhileFire, U.medics.filter((m) => !m.passengerOf && !m.cargoOf).length);
      });
      const dispatched = A.stats.dispatched;
      // ateş kesildi: yaklaşır, sağlıkçılar iner, işini yapar, hastaneye gider
      let medicsOut = 0, doorsOpened = false, t = 0;
      while (t < 110 && !(A.stats.left > 0)) {
        sim(1); t++;
        const U = A.unit;
        if (U) { medicsOut = Math.max(medicsOut, U.medics.filter((m) => !m.passengerOf && !m.cargoOf && m.model.root.visible).length); if (U.doors && U.doors[0].ang > 1) doorsOpened = true; }
      }
      const s = Object.assign({}, A.stats);
      const tamam = L.barks.filter((b) => /Tamam, iyileştin/.test(b)).length;
      const wUp = !w.downed && !w.dead;
      const bodyGone = !g.npcs.list.includes(dd);
      sim(10);
      const U = A.unit;
      const drove = U ? Math.round(L.d(U.v.pos, q1)) : 999;
      return { amb: window.__amb, dispatched, held, holdDist: Math.round(holdDist), medicsOutWhileFire, medicsOut, doorsOpened, stats: s, tamam, wUp, hurtHp: Math.round(hurt.hp / hurt.maxHp * 100), bodyGone, t, drove };
    });
    console.log('7 ambulans:', JSON.stringify(r));
    check(r.dispatched >= 1, '7a Çatışma sonrası ambulans çağrıldı');
    check(r.held && r.holdDist > 35 && r.medicsOutWhileFire === 0, '7b Ateş sürerken güvenli noktada bekledi (' + r.holdDist + ' m), sağlıkçı inmedi');
    check(r.medicsOut >= 2, '7c Sakinleşince yaklaştı, iki sağlıkçı indi');
    check(r.stats.healed >= 2 && r.tamam >= 1 && r.wUp, '7d Yaralı tedavi edildi: "Tamam, iyileştin, şimdi gidebilirsin" ve kalktı');
    check(r.stats.walkIn >= 1 && r.hurtHp >= 85, '7e Ayaktaki yaralı sağlıkçıya yürüdü, pansuman yapıldı');
    check(r.stats.bagged >= 1 && r.stats.loaded >= 1 && r.bodyGone && r.doorsOpened, '7f Ölü: torba → sedye → arka kapıdan ambulansa');
    check(r.stats.left >= 1 && r.drove > 25, '7g Sağlıkçılar bindi, ambulans hastaneye doğru ayrıldı (' + r.drove + ' m)');
  }

  // ---------------- 8) araç gaspı ----------------
  if (want(8)) {
    const r = await p.evaluate(() => {
      const g = game, pl = g.player, CJ = g.law.carjack;
      L.clear();
      const R = L.road(0, 0, 150);
      const a = R.at(30, 2.5);
      const v = g.vehicles.add('sedan', a.x, a.z, Math.atan2(R.fx, R.fz));
      v.ai = { mode: 'traffic', from: R.n, to: R.o, next: g.vehicles.chooseNext(R.o, R.n), cruise: 9, outer: false, laneCur: 2.5 };
      v.vx = R.fx * 8; v.vz = R.fz * 8;
      sim(0.5);
      // yanında, hareket halindeyken F: binilmez
      const side = () => { const f = v.fwd; pl.pos.set(v.pos.x + f.z * (v.def.wid / 2 + 1.0), 0, v.pos.z - f.x * (v.def.wid / 2 + 1.0)); };
      side(); const sp0 = v.speed;
      press('KeyF'); sim(0.1);
      const inMoving = pl.vehicle === v;
      // silah doğrult: sürücü durur
      pl.giveWeapon('pistol', 50); pl.setWeapon('pistol');
      side();
      const tgtYaw = () => Math.atan2(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z);
      pl.camYaw = tgtYaw(); pl.heading = pl.camYaw; g.input.mouse.right = true;
      let stopT = -1;
      sim(3, (i) => { pl.camYaw = tgtYaw(); if (stopT < 0 && v.speed < 1.2) stopT = i / 30; });
      g.input.mouse.right = false;
      const stopped = v.speed < 1.2;
      // durmuş araçta F: kapı açılır, sürücü çekilir, oturulur
      side(); sim(0.05);
      press('KeyF');
      let tIn = -1, doorMax = 0, driver = null, drvDown = false, lock = false;
      sim(3, (i) => {
        if (pl.scriptCtl) lock = true;
        const D = v._doors && (v._doors.doorL0 || v._doors.doorR0); if (D) doorMax = Math.max(doorMax, D.ang);
        if (CJ.seq && CJ.seq.driver) driver = CJ.seq.driver;
        if (driver && driver.kdT > 0) drvDown = true;
        if (tIn < 0 && pl.vehicle === v) tIn = i / 30;
      });
      const D = v._doors && (v._doors.doorL0 || v._doors.doorR0);
      const doorClosed = D ? D.ang < 0.05 : false;
      const drvOutside = driver ? L.d(driver.pos, v.pos) > v.def.wid / 2 : false;
      const crime = g.wanted.level > 0 || g.wanted.reportQueue.length > 0;
      // önüne geçince sürücü fren yapar
      if (pl.vehicle) g.vehicles.ejectDriver(pl.vehicle);
      g.wanted.reset();
      const b = R.at(20, 2.5);
      const v2 = g.vehicles.add('sedan', b.x, b.z, Math.atan2(R.fx, R.fz));
      v2.ai = { mode: 'traffic', from: R.n, to: R.o, next: g.vehicles.chooseNext(R.o, R.n), cruise: 9, outer: false, laneCur: 2.5 };
      v2.vx = R.fx * 8; v2.vz = R.fz * 8;
      const fr = R.at(45, 2.5); pl.pos.set(fr.x, 0, fr.z);
      sim(4);
      const frontStop = v2.speed < 1 && L.d(v2.pos, pl.pos) > 2;
      return { sp0: +sp0.toFixed(1), inMoving, blocked: CJ.stats.blockedMoving, stopped, stopT: +stopT.toFixed(2), aimStops: CJ.stats.aimStops, tIn: +tIn.toFixed(2), lock, doorMax: +doorMax.toFixed(2), doorClosed, drvDown, drvOutside, crime, frontStop };
    });
    console.log('8 gasp:', JSON.stringify(r));
    check(r.sp0 > 3 && !r.inMoving && r.blocked >= 1, '8a Hareket eden araca F: ışınlanma yok (' + r.sp0 + ' m/s)');
    check(r.stopped && r.aimStops >= 1, '8b Silah doğrultulan sürücü durdu (' + r.stopT + ' sn)');
    check(r.frontStop, '8c Önüne geçilen araç durdu');
    check(r.tIn >= 1.4 && r.tIn <= 2.5 && r.lock, '8d Gasp normal hızda: ' + r.tIn + ' sn (kontrol kilitli)');
    check(r.doorMax > 0.9 && r.doorClosed, '8e Kapı açıldı ve kapandı (' + r.doorMax + ' rad)');
    check(r.drvDown && r.drvOutside, '8f Sürücü dışarı çekilip yere düştü');
    check(r.crime, '8g Gasp suç olarak işlendi');
  }

  // ---------------- 9) ev sahibi ----------------
  if (want(9)) {
    const r = await p.evaluate(() => {
      const g = game, pl = g.player;
      L.clear();
      const door = g.city.doors.find((d) => d.building && d.building.type === 'apartment');
      g.interiors.enter(door);
      const ctx = pl.inInterior;
      let owner = g.npcs.list.find((n) => n.kind === 'resident' && !n.dead);
      if (!owner) owner = g.interiors.npc(ctx, 'resident', 1.5, -1.5, 0);
      sim(1.5);
      const said = L.barks.some((b) => /Sen kimsin\? Evimden çık!/.test(b));
      const approach = g.law.home.owner === owner && owner.state === 'ext';
      sim(9);
      const attacking = owner.state === 'attack' && owner.target === pl;
      g.interiors.exit();
      sim(1);
      const gone = !g.npcs.list.includes(owner) && !pl.inInterior;
      return { said, approach, attacking, ost: owner.state, otg: owner.target === pl, odead: owner.dead, gone, stats: g.law.home.stats };
    });
    console.log('9 ev sahibi:', JSON.stringify(r));
    check(r.said && r.approach, '9a "Sen kimsin? Evimden çık!"');
    check(r.attacking, '9b Çıkmayınca ev sahibi saldırdı');
    check(r.gone, '9c Dışarı çıkınca peşini bıraktı');
  }

  // ---------------- 10) performans: ışın bütçesi, birim sınırı ----------------
  if (want(10)) {
    const r = await p.evaluate(() => {
      const g = game, W = g.wanted, pl = g.player, ph = g.physics;
      L.clear();
      const R = L.road(200, -100, 100); const at = R.at(40, 8.5); L.place(at.x, at.z);
      W.set(4); W.roadblockT = 999; sim(15);
      let rays = 0; const los = ph.lineOfSight.bind(ph); ph.lineOfSight = (...a) => { rays++; return los(...a); };
      let maxLaw = 0, maxCars = 0;
      const t0 = performance.now();
      sim(10, (i) => { if (i % 10 === 0) { maxLaw = Math.max(maxLaw, W.lawCount()); maxCars = Math.max(maxCars, W.chaseCars()); } });
      const ms = (performance.now() - t0) / 300;
      ph.lineOfSight = los;
      const law = L.lawNpcs().length;
      W.reset();
      return { raysPerFrame: +(rays / 300).toFixed(1), maxLaw, maxCars, law, msPerFrame: +ms.toFixed(2) };
    });
    console.log('10 performans:', JSON.stringify(r));
    check(r.maxLaw <= 13 + 4 && r.maxCars <= 4, '10a 4★ birim sınırı (kolluk ' + r.maxLaw + ', araç ' + r.maxCars + ')');
    check(r.raysPerFrame < 30, '10b Görüş ışını bütçesi: ' + r.raysPerFrame + ' / kare (' + r.msPerFrame + ' ms mantık)');
  }

  console.log('KONSOL HATALARI:', errs.length);
  for (const e of errs.slice(0, 10)) console.log('  ', e.slice(0, 300));
  console.log(fails.length ? `BAŞARISIZ: ${fails.length}` : 'TÜMÜ BAŞARILI');
  if (errs.length || fails.length) process.exitCode = 1;
};
