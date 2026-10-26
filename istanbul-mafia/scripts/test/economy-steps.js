// Ekonomi / dükkânlar / kariyer / telefon için headless test adımları.
// node scripts/test/play.js http://localhost:PORT/index.html /çıktı/öneki ./scripts/test/economy-steps.js
// Not: main.js entegrasyonu yoksa da çalışır (Life, UI.update içinden kendini kurar).
const H = require('./harness.js');

module.exports = async (p, out) => {
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await H.start(p); await H.install(p);
  // sürekli çizimi durdur (SwiftShader yavaş); ekran görüntüsünde tek kare çizilir
  // headless'ta işaretçi kilidi olayları duraklatma menüsünü açmasın
  await p.evaluate(() => { game.loop = () => {}; game.suppressPause = true; game.input.lock = () => {}; game.renderer.setPixelRatio(0.6); sim(1); });
  // STEPS_FROM="emlak" gibi bir önekle o adımdan başlanabilir (önceki adımlar atlanır, kurulum hariç)
  let skipping = !!process.env.STEPS_FROM;
  const step = async (name, fn) => {
    if (skipping && name.startsWith(process.env.STEPS_FROM)) skipping = false;
    if (skipping && !name.startsWith('yaşam')) return;
    try { const r = await p.evaluate(fn); console.log('OK  ', name, r === undefined ? '' : JSON.stringify(r)); } catch (e) { errs.push(name + ': ' + e.message); console.log('FAIL', name, e.message.slice(0, 300)); }
  };
  const ok = (c, m) => { if (!c) throw new Error(m); };
  void ok;

  await step('yaşam sistemleri kuruldu', () => { const g = game; if (!g.life || !g.career || !g.market || !g.properties) throw new Error('life yok'); g.state.money = 500000; g.state.bank = 60000000; return { boards: g.career.boards.length }; });

  // --- Butik: kabin, sepet, kasa ---
  await step('butik: içeri gir + sepet', () => {
    const g = game;
    const door = g.city.doors.find((d) => d.building.type === 'clothes');
    g.interiors.enter(door); sim(0.3);
    g.ui.openShop('clothes'); sim(0.2);
    const B = g.ui._boutique;
    B.add('suit', '#1d2440'); B.add('goldwatch'); B.add('aviator', '#d4af37'); B.add('chain');
    B.view('cart'); sim(0.2);
    const facing = Math.abs(((g.player.heading - g.player.camYaw - Math.PI) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) < 0.01;
    if (g.player.model.look.top !== 'suit') throw new Error('deneme görünümü uygulanmadı');
    return { cart: B.cart.length, total: document.querySelector('.bq-total b').textContent, facing, robInteract: !!g.player.inInterior.interact.find((i) => i.danger) };
  });
  if (!skipping) await H.shot(p, out + '1-butik-sepet.png');
  await step('butik: yetersiz bakiye', () => {
    const g = game, s = g.state; const m0 = s.money, b0 = s.bank; s.money = 10; s.bank = 10;
    g.ui._boutique.pay('cash');
    const err = document.querySelector('.boutique .err');
    s.money = m0; s.bank = b0;
    if (!err) throw new Error('hata mesajı yok');
    return err.textContent.slice(0, 40);
  });
  await step('butik: kasada öde (nakit)', () => {
    const g = game, s = g.state, m0 = s.money;
    g.ui._boutique.pay('cash');
    if (s.look.topStyle !== 'suit' || !s.owned['top:suit'] || s.look.watch !== 'goldwatch') throw new Error('satın alınanlar giyilmedi');
    g.ui.closeAll();
    return { spent: m0 - s.money, look: [s.look.top, s.look.watch, s.look.glassesStyle, s.look.chain] };
  });
  await step('butik: satın almadan çıkınca görünüm geri döner', () => {
    const g = game, s = g.state;
    g.ui.openShop('clothes'); g.ui._boutique.add('track', '#8a1a1a');
    if (g.player.model.look.top !== 'track') throw new Error('deneme yok');
    g.ui.closeAll();
    if (g.player.model.look.top !== s.look.top) throw new Error('geri dönmedi');
    g.ui.openShop('wardrobe'); const n = document.querySelectorAll('.bq-item').length; g.ui.closeAll();
    g.interiors.exit(); sim(0.3);
    return { wardrobeItems: n };
  });

  // --- Çanta ---
  await step('çanta (I)', () => {
    const g = game;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI' }));
    const tabs = document.querySelectorAll('.inventory .seg-tabs .btn');
    const res = [];
    tabs.forEach((t) => { t.click(); res.push(document.querySelectorAll('.inventory .inv-tile').length); });
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI' }));
    if (g.ui.modalStack.length) throw new Error('I ile kapanmadı');
    return res;
  });

  // --- Telefon ---
  await step('telefon (P) + uygulamalar', () => {
    const g = game;
    const diag = { blocking: g.ui.blocking(), modals: g.ui.modalStack.length, mode: g.mode };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    const apps = () => document.querySelectorAll('.ph-app');
    if (!apps().length) { console.log('P açmadı: ' + JSON.stringify(diag)); g.ui.openPhone(); }
    const seen = [];
    for (const i of [1, 2, 3, 4, 6, 5]) { apps()[i].click(); seen.push(document.querySelector('.ph-head b').textContent); if (i !== 5) document.querySelector('.ph-back').click(); }
    document.querySelector('.ph-li.stock').click();
    document.querySelectorAll('.ph-row.b .btn')[1].click(); // +10 lot
    const sym = document.querySelector('.ph-head b').textContent;
    return { seen, sym, hold: g.state.stocks.hold[sym] };
  });
  if (!skipping) await H.shot(p, out + '2-telefon-borsa.png');
  await step('borsa fiyatları + telefonu kapat', () => {
    const g = game; const st = g.market.m.px.GLTEK; sim(4);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
    return { before: st, after: g.market.m.px.GLTEK, open: g.ui.modalStack.length };
  });

  // --- Galeri: showroom, test sürüşü, satın alma ---
  await step('galeri showroom', () => {
    const g = game;
    const door = g.city.doors.find((d) => d.building.type === 'dealer');
    g.interiors.enter(door); sim(0.3);
    g.ui.openShop('dealer');
    document.querySelectorAll('.sr-row')[3].click();
    return { rows: document.querySelectorAll('.sr-row').length, name: document.querySelector('.sr-name').textContent };
  });
  if (!skipping) await H.shot(p, out + '3-galeri.png');
  await step('galeri: deniz/hava sekmeleri + taksit görünümü', () => {
    const tabs = document.querySelectorAll('.showroom .seg-tabs .btn');
    tabs[1].click(); const sea = document.querySelectorAll('.sr-row').length;
    document.querySelectorAll('.showroom .seg-tabs .btn')[0].click();
    document.querySelectorAll('.sr-acts .btn')[1].click(); // taksitli
    return { sea, fin: !!document.querySelector('.fin') };
  });
  await step('galeri: lüks araç satın al', () => {
    const g = game; g.ui.closeAll(); g.ui.shop_dealer('air');
    const ok = g.life.buyLuxury('atmaca', '#111111', 'bank');
    g.ui.closeAll();
    return { ok, luxury: g.state.luxury.length };
  });
  await step('test sürüşü (60 sn) ve geri dönüş', () => {
    const g = game;
    g.ui.openShop('dealer');
    g.life.startTest('gt', '#c81010'); sim(1);
    const inCar = g.player.vehicle && g.player.vehicle.type;
    g.life.test.t = 0.2; sim(0.5);
    return { inCar, ended: !g.life.test, inside: !!g.player.inInterior, cars: g.vehicles.list.filter((v) => v.testDrive).length };
  });
  await step('test sürüşünde satın al (banka) + taksitli', () => {
    const g = game, s = g.state, n0 = s.ownedCars.length;
    g.life.startTest('sedan', '#111111'); sim(0.5);
    g.life.buyCar('sedan', '#111111', 'bank');
    const owned = g.player.vehicle && g.player.vehicle.owned;
    g.life.buyCar('suv', '#0a0a0a', 'finance'); sim(0.5);
    return { owned, cars: s.ownedCars.length - n0, loans: s.loans.length };
  });

  // --- Emlak ---
  await step('emlak: konut al + güvenli ev', () => {
    const g = game;
    if (g.player.vehicle) { g.vehicles.ejectDriver(g.player.vehicle); }
    g.ui.openShop('estate');
    const cards = document.querySelectorAll('.estate .card').length;
    const ok = g.properties.buy('bebek', 'bank');
    const b = g.properties.building('bebek');
    g.ui.closeAll();
    g.interiors.enter(g.city.doors.find((d) => d.building === b)); sim(0.3);
    const labels = g.player.inInterior.interact.map((i) => i.label);
    g.interiors.exit();
    return { cards, ok, type: b.type, name: b.name, labels: labels.length };
  });
  await step('emlak: işletme al + geliştir', () => {
    const g = game; g.ui.shop_estate('biz');
    document.querySelector('.estate .card .acts .btn.gold').click();
    g.ui.closeAll(); g.ui.shop_estate('biz');
    document.querySelector('.estate .card .acts .btn.gold').click();
    g.ui.closeAll();
    return { biz: g.state.businesses, lvl: g.state.bizLevel };
  });

  // --- Banka ---
  await step('banka: vadeli + kredi', () => {
    const g = game, s = g.state;
    g.ui.shop_bank('sav'); document.querySelector('.panel .row .btn').click();
    g.ui.closeAll(); g.ui.shop_bank('loan');
    const lim = g.life.loanLimit(); g.life.takeLoan(10000);
    g.ui.closeAll();
    return { savings: s.savings, limit: lim, loans: s.loans.length };
  });

  // --- Taksi işi ---
  await step('taksi işi: müşteri al ve bırak', () => {
    const g = game, C = g.career, s = g.state;
    C.startJob('taxi'); sim(0.3);
    const j = C.job;
    g.enterVehicle(j.car, true); sim(0.4);
    if (j.stage !== 'seek' || !j.pax) throw new Error('müşteri yok: ' + j.stage);
    j.car.pos.set(j.pax.pos.x + 3, 0, j.pax.pos.z); j.car.vx = j.car.vz = 0; j.car.fs = 0; sim(0.3);
    if (j.stage !== 'ride') throw new Error('binmedi: ' + j.stage);
    const m0 = s.money;
    j.car.pos.set(j.dest.x, 0, j.dest.z); j.car.vx = j.car.vz = 0; j.car.fs = 0; sim(0.3);
    const earned = s.money - m0;
    const obj = document.getElementById('objective').textContent;
    C.endJob();
    if (earned <= 0) throw new Error('ücret ödenmedi');
    return { earned, legalRep: s.legalRep, obj: obj.slice(0, 60) };
  });
  await step('diğer işler: başlat / güncelle / bitir', () => {
    const g = game, C = g.career, s = g.state;
    if (g.player.vehicle) g.vehicles.ejectDriver(g.player.vehicle);
    s.legalRep = Math.max(s.legalRep, 600); s.crimeRep = 600;
    const out = {};
    for (const id of ['courier', 'bus', 'mechanic', 'guard', 'chop', 'robbery', 'protection', 'hit']) {
      const ok = C.startJob(id); sim(0.5);
      out[id] = ok && C.job ? C.job.stage : 'x';
      C.endJob(true);
    }
    return out;
  });
  await step('dükkân soygunu (kasayı soy)', () => {
    const g = game, s = g.state;
    g.player.giveWeapon('pistol', 50); g.player.setWeapon('pistol');
    const door = g.city.doors.find((d) => d.building.type === 'food');
    g.interiors.enter(door); sim(0.2);
    const it = g.player.inInterior.interact.find((i) => i.danger);
    g.player.pos.set(it.x, 0, it.z); it.action(); sim(5.5);
    const r = { robbed: s.robbed['shop:' + door.building.id] === g.env.day, wanted: g.wanted.level, crimeRep: s.crimeRep };
    g.interiors.exit(); g.wanted.reset();
    return r;
  });

  // --- Ayarlar ---
  await step('ayarlar: sekmeler + zorluk + HUD', () => {
    const g = game;
    g.ui.settingsMenu();
    const tabs = document.querySelectorAll('.settings .seg-tabs .btn');
    const rows = [];
    for (let i = 0; i < tabs.length; i++) { document.querySelectorAll('.settings .seg-tabs .btn')[i].click(); rows.push(document.querySelectorAll('.settings .srow').length); }
    document.querySelectorAll('.settings .seg-tabs .btn')[0].click();
    document.querySelector('.settings .srow .chip').click(); // hazır ayar: düşük
    g.settings.difficulty = 'hard';
    g.ui.closeAll();
    return { rows, preset: g.settings.preset, dmg: g.settings.damageTaken };
  });

  // --- Gün dönümü + kayıt/yükleme ---
  await step('gün dönümü: taksit, faiz, borsa', () => {
    const g = game, s = g.state, b0 = s.bank;
    g.env.time = 23.995; sim(1.5);
    return { day: g.env.day, bankDelta: Math.round(s.bank - b0), loans: s.loans.map((l) => l.remaining) };
  });
  await step('kayıt / yükleme sonrası mülk ve itibar', async () => {
    const g = game;
    await g.saveGame('3'); await g.loadGame('3'); sim(0.5);
    const b = g.properties.building('bebek');
    return { props: g.state.properties, type: b.type, legal: g.state.legalRep, cars: g.state.ownedCars.length };
  });

  console.log('\n==== HATALAR:', errs.length, '====');
  for (const e of errs) console.log(' -', e.slice(0, 400));
};
