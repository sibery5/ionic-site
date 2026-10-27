// Arayüz performansı + akıllı kayıt + duraklat/devam testi.
// Kullanım: SETTINGS='{"quality":"low"}' node scripts/test/play.js file://$PWD/app/index.html /tmp/out $PWD/scripts/test/ui-perf-steps.js
// SHOTS=<klasör> verilirse ana menü / duraklatma / karakter yaratma ekran görüntüleri alınır.
const H = require('./harness.js');
const ok = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); if (!cond) process.exitCode = 1; };

module.exports = async (p) => {
  const shots = process.env.SHOTS;
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Performance.enable');
  const metrics = async () => { const o = {}; for (const k of (await cdp.send('Performance.getMetrics')).metrics) o[k.name] = k.value; return o; };
  const K = ['LayoutCount', 'RecalcStyleCount', 'ScriptDuration'];
  const diff = (a, b) => { const o = {}; for (const k of K) o[k] = +(b[k] - a[k]).toFixed(3); return o; };
  // çizim sayacı
  await p.evaluate(() => { window.__rc = 0; const c = game.composer; const o = c.render.bind(c); c.render = (...a) => { window.__rc++; return o(...a); }; });
  await p.waitForTimeout(1500);

  // 1) ana menü: fare gezintisi
  const items = await p.$$('.mainmenu .nav-item');
  ok('mainmenu has nav items', items.length >= 6, items.length);
  if (shots) await p.screenshot({ path: shots + '/main-menu.png', timeout: 240000 });
  let m0 = await metrics();
  for (let i = 0; i < 14; i++) { const bb = await items[i % items.length].boundingBox(); await p.mouse.move(bb.x + 40, bb.y + bb.height / 2); }
  let m1 = await metrics();
  console.log('menu-hover-14', JSON.stringify(diff(m0, m1)));
  const menuPr = await p.evaluate(() => game.renderer.getPixelRatio());
  ok('menu renders at reduced pixel ratio', menuPr < 1, menuPr);
  // klavye gezinme
  await p.keyboard.press('ArrowDown');
  const hot = await p.evaluate(() => document.querySelector('.mainmenu .nav-item.hot .ni-l').textContent);
  ok('keyboard nav moves focus', !!hot, hot);

  // 2) karakter yaratma: sürükleyerek döndürme
  await p.click('text=YENİ OYUN', { timeout: 180000 });
  await p.waitForTimeout(500);
  const y0 = await p.evaluate(() => game.cc.yawT);
  await p.mouse.move(400, 400); await p.mouse.down(); await p.mouse.move(520, 400, { steps: 4 }); await p.mouse.up();
  const y1 = await p.evaluate(() => game.cc.yawT);
  ok('creator drag rotates preview', Math.abs(y1 - y0) > 0.5, { y0, y1 });
  await p.evaluate(() => document.getElementById('game').dispatchEvent(new WheelEvent('wheel', { deltaY: -300, bubbles: true })));
  ok('creator wheel zooms', await p.evaluate(() => game.cc.distT < 5.2), await p.evaluate(() => game.cc.distT));
  await p.evaluate(() => game.creatorView('reset'));
  if (shots) { await p.waitForTimeout(1500); await p.screenshot({ path: shots + '/creator.png', timeout: 240000 }); }
  await p.click('text=MACERAYA BAŞLA', { timeout: 180000 });
  await p.waitForTimeout(600);
  await H.install(p);
  await p.evaluate(() => { game.player.camPitch = 0.25; game.player.camYaw = game.player.heading + Math.PI; sim(3); });
  await p.evaluate(() => game.render()); // ısınma: gölgelendirici derlemesi (SwiftShader'da yavaş)

  // 3) HUD maliyeti: ui.update + mini harita
  const u = await p.evaluate(() => {
    const g = game; let t = 0, n = 0, tm = 0, nm = 0;
    const ou = g.ui.update.bind(g.ui), om = g.ui.drawMinimap.bind(g.ui);
    g.ui.drawMinimap = () => { const a = performance.now(); om(); tm += performance.now() - a; nm++; };
    g.ui.update = (dt) => { const a = performance.now(); ou(dt); t += performance.now() - a; n++; };
    sim(10); g.ui.update = ou; g.ui.drawMinimap = om;
    return { uiMsPerFrame: +(t / n).toFixed(3), minimapDrawsPerSec: +(nm / 10).toFixed(1), minimapMsPerDraw: +(tm / Math.max(1, nm)).toFixed(3), frames: n };
  });
  console.log('ui.update', JSON.stringify(u));
  ok('minimap throttled (~<=20 Hz)', u.minimapDrawsPerSec <= 20.5, u.minimapDrawsPerSec);
  // HUD stil/yerleşim geçersizlemeleri: değişmeyen değerler DOM'a yazılmaz
  m0 = await metrics();
  await p.evaluate(() => { for (let i = 0; i < 60; i++) game.ui.update(1 / 60); });
  m1 = await metrics();
  console.log('hud-60-updates', JSON.stringify(diff(m0, m1)));
  // çizim çağrıları (iki ardışık kare: gölge haritası kademe aralığıyla yenilenir)
  const dc = await p.evaluate(() => { const r = game.renderer; r.info.autoReset = false; const out = []; for (let i = 0; i < 3; i++) { r.info.reset(); game.render(); out.push(r.info.render.calls); } r.info.autoReset = true; return { callsPerFrame: out, pr: r.getPixelRatio(), shadows: r.shadowMap.enabled, shadowEvery: game.tier().shadowEvery }; });
  console.log('drawcalls', JSON.stringify(dc));

  // 4) duraklat -> donmuş kare -> devam
  await p.evaluate(() => { game.pause(); window.__rc = 0; });
  await p.waitForTimeout(2500);
  const paused = await p.evaluate(() => ({ mode: game.mode, renders: window.__rc }));
  ok('paused: no scene renders while menu open', paused.mode === 'paused' && paused.renders === 0, paused);
  // ESC çift geçiş koruması: duraklattıktan hemen sonra gelen ESC menüyü kapatmamalı
  const dbl = await p.evaluate(() => { game.resume(); game.ui.closeAll(); game.mode = 'playing'; game.toggleT = 0; game.pause(); game.onKey({ code: 'Escape' }); return game.mode; });
  ok('ESC debounce keeps pause menu', dbl === 'paused', dbl);
  if (shots) { await p.evaluate(() => { game.needsFrame = true; }); await p.waitForTimeout(2500); await p.screenshot({ path: shots + '/pause-menu.png', timeout: 240000 }).catch((e) => console.log('pause screenshot failed', e.message.slice(0, 80))); }
  m0 = await metrics();
  const pb = await p.$$('.pausemenu .nav-item');
  for (let i = 0; i < 10; i++) { const bb = await pb[i % pb.length].boundingBox(); await p.mouse.move(bb.x + 40, bb.y + bb.height / 2); }
  m1 = await metrics();
  console.log('pause-hover-10', JSON.stringify(diff(m0, m1)), 'renders', await p.evaluate(() => window.__rc));
  await p.waitForTimeout(400);
  await p.click('.pausemenu .nav-item >> text=DEVAM ET', { timeout: 180000 });
  await p.waitForTimeout(300);
  await p.evaluate(() => sim(0.2));
  const res = await p.evaluate(() => ({ mode: game.mode, enabled: game.input.enabled, blocking: game.ui.blocking() }));
  ok('pause -> DEVAM ET resumes', res.mode === 'playing' && res.enabled && !res.blocking, res);

  // 5) otomatik kayıt: zamanlayıcı, aranırken erteleme
  const auto = await p.evaluate(() => {
    const g = game; const key = 'istanbul-mafia-save-auto';
    localStorage.removeItem(key);
    g.wanted.level = 2; g.autoT = 119.5; sim(2);
    const whileWanted = !!localStorage.getItem(key);
    g.wanted.reset(); sim(1.5);
    const after = !!localStorage.getItem(key);
    return { whileWanted, after, ind: g.ui.saveEl.classList.contains('show') };
  });
  ok('timer autosave deferred while wanted, saved after', !auto.whileWanted && auto.after, auto);
  ok('save indicator shown', auto.ind);
  // 6) çıkışta kayıt (tarayıcı: beforeunload; masaüstü: quit())
  const q = await p.evaluate(async () => {
    const key = 'istanbul-mafia-save-auto';
    game.state.money = 77777; localStorage.removeItem(key);
    window.dispatchEvent(new Event('beforeunload'));
    const a = JSON.parse(localStorage.getItem(key) || 'null');
    game.state.money = 88888;
    await game.quit();
    const b = JSON.parse(localStorage.getItem(key) || 'null');
    return { onUnload: a && a.data.money, onQuit: b && b.data.money };
  });
  ok('autosave on beforeunload', q.onUnload === 77777, q);
  ok('autosave on quit()', q.onQuit === 88888, q);

  // 7) ana menü: kayıt varken YENİ OYUN -> onay penceresi
  await p.evaluate(() => game.toMainMenu());
  await p.waitForTimeout(800);
  await p.click('.mainmenu .nav-item >> text=YENİ OYUN', { timeout: 180000 });
  await p.waitForTimeout(400);
  const dlg = await p.evaluate(() => { const d = document.querySelector('.dlg'); return d && d.textContent; });
  ok('new game with save -> confirm dialog', !!dlg && dlg.includes('Kayıtlı bir oyunun var. Devam etmek ister misin?'), dlg);
  await p.click('.dlg >> text=Yeni Oyuna Başla', { timeout: 180000 });
  await p.waitForTimeout(400);
  const dlg2 = await p.evaluate(() => { const d = [...document.querySelectorAll('.dlg')].pop(); return d && d.textContent; });
  ok('second confirm asks to overwrite autosave', !!dlg2 && dlg2.includes('Otomatik kayıt'), dlg2);
  await p.click('.dlg >> text=Vazgeç', { timeout: 180000 });
  await p.waitForTimeout(400);
  await p.click('.mainmenu .nav-item >> text=YENİ OYUN', { timeout: 180000 });
  await p.waitForTimeout(400);
  await p.click('.dlg >> text=Devam Et', { timeout: 180000 });
  await p.waitForTimeout(1500);
  const cont = await p.evaluate(() => ({ mode: game.mode, money: game.state && game.state.money }));
  ok('Devam Et loads latest save', cont.mode === 'playing' && cont.money === 88888, cont);
};
