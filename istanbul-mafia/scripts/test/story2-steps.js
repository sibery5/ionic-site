// Hikâye 1.4 testi: perde sırası, her görev sonrası çağrı + konakta değerlendirme sahnesi, güven/şüphe,
// eski kayıt uyumu, yeni görevlerin başlatılması, büyük harita (aç/yakınlaştır/rota), telefon uygulamaları, açılış süresi.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/s2 $PWD/scripts/test/story2-steps.js
// SHOTS=1 ile harita, telefon ve sinematik ekran görüntüsü alınır.
const path = require('path');
const fs = require('fs');
const H = require('./harness.js');

module.exports = async (p, out) => {
  fs.mkdirSync(out, { recursive: true });
  p.setDefaultTimeout(240000);
  const fails = [];
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
  const SHOTS = process.env.SHOTS === '1';
  // yazılımsal GPU'da sürekli çizim testi çok yavaşlatır: yalnızca ekran görüntüsünde çiz
  await p.evaluate(() => { window.__render = game.render.bind(game); game.render = () => {}; });
  const shot = async (n) => { if (!SHOTS) return; await p.evaluate(() => { if (game.mode === 'playing') { window.__render(); window.__render(); } }); await p.screenshot({ path: path.join(out, n), timeout: 240000 }); console.log('shot', n); };
  const dlg = () => p.evaluate(() => !document.querySelector('.dialog').classList.contains('hidden'));
  const advance = async (maxN = 60) => { await p.waitForTimeout(200); for (let i = 0; i < maxN && await dlg(); i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(70); await p.evaluate(() => sim(0.05)); } };

  // ---------------- 0) açılış süresi ----------------
  const boot = await p.evaluate(() => window.__boot);
  const gen = boot.phases.reduce((a, b) => a + b[1], 0);
  console.log('BOOT ' + JSON.stringify({ jsStart: boot.js, ready: boot.ready, gen, frames: boot.frames, phases: boot.phases }));
  check(boot && boot.ready > 0 && boot.phases.length > 5, `Açılış ölçüldü: hazır ${boot.ready} ms, ilk kareler ${JSON.stringify(boot.frames)}`);
  const warm = boot.phases.find((x) => x[0] === 'Isınma karesi');
  check(!!warm, 'Isınma karesi yükleme ekranında çizildi (' + (warm ? warm[1] : '?') + ' ms)');

  await H.start(p); await H.install(p);
  await p.evaluate(() => { game.player.god = true; sim(1); });

  // ---------------- 1) perde sırası ----------------
  const acts = await p.evaluate(() => {
    const S = game.missions.STORY;
    let mono = true; for (let i = 1; i < S.length; i++) if (S[i].act < S[i - 1].act) mono = false;
    const ids = S.map((d) => d.id);
    const per = {}; for (const d of S) per[d.act] = (per[d.act] || 0) + 1;
    return { n: S.length, mono, per, ids, steps: S.every((d) => Array.isArray(d.steps) && d.steps.length > 0) };
  });
  check(acts.mono && Object.keys(acts.per).length === 6, `Altı perde sıralı: ${JSON.stringify(acts.per)} (${acts.n} görev)`);
  check(['takip', 'sadakat', 'gizli', 'kurtarma', 'devrilme', 'dogan', 'murat', 'bolge', 'tek_hakim'].every((id) => acts.ids.includes(id)) && !acts.ids.includes('son'), 'Yeni görevler sırada, eski final kaldırıldı');
  check(acts.ids.indexOf('nevzat') > acts.ids.indexOf('savas') && acts.ids.indexOf('devrilme') < acts.ids.indexOf('dogan'), 'Nevzat itirafı Boğaz Savaşı\'ndan sonra, devrilme suikastlerden önce');
  check(acts.steps, 'Her görevin adımları var');

  // ---------------- 2) görev sonu: not, güven, çağrı, konakta sahne ----------------
  // Görev 1 (konakta biter) → çağrı yok, sahne konakta kendiliğinden başlar
  await p.evaluate(() => { const d = game.city.doors.find((dd) => dd.building.type === 'konak'); game.interiors.enter(d); sim(0.5); });
  await advance();
  const g1 = await p.evaluate(() => { const M = game.missions; return { idx: M.index, db: M.flags.debrief, auto: M.konakAutoT, trust: M.flags.trust }; });
  check(g1.idx === 1 && g1.db && g1.db.id === 'eve_donus' && g1.auto > 0, 'Görev 1 notlandı, konakta sahne bekliyor ' + JSON.stringify(g1));
  await p.evaluate(() => sim(7));
  check(await dlg(), 'Konakta değerlendirme + yeni iş sahnesi kendiliğinden açıldı');
  await p.evaluate(() => sim(0.3));
  const cine = await p.evaluate(() => ({ cam: !!game.cutsceneCam, who: (document.querySelector('.dialog .who') || {}).textContent, act: (document.querySelector('.dialog .dlg-act') || {}).textContent }));
  check(cine.cam && /Reis/.test(cine.who || ''), 'Sinematik kamera ve Reis konuşuyor ' + JSON.stringify(cine));
  await shot('cinematic.png');
  await advance();
  const conf = await p.evaluate(() => !!Array.from(document.querySelectorAll('button')).find((b) => /Kabul Et/.test(b.textContent)));
  check(conf, 'Sahne sonunda görev onayı (Kabul Et)');
  if (conf) { await p.click('text=Kabul Et'); await p.evaluate(() => sim(0.3)); }
  check(await p.evaluate(() => game.missions.active && game.missions.active.id === 'eski_dost'), 'Görev 2 konaktaki sahneden başladı');

  // Görev dışarıda biter → Reis arar (notla), cevaplanınca konağa çağırır; konağa girince sahne değerlendirmeyi içerir
  await p.evaluate(() => { game.interiors.exit(); const M = game.missions; M.baba.run.tries = 0; M.complete(); sim(0.2); });
  const c1 = await p.evaluate(() => { const M = game.missions; return { db: M.flags.debrief, summonT: M.summonT, idx: M.index }; });
  check(c1.db && c1.db.id === 'eski_dost' && c1.summonT > 0, 'Görev 2 sonrası çağrı zamanlandı ' + JSON.stringify(c1));
  await p.evaluate(() => { game.missions.summonT = 0.1; sim(0.6); });
  const ring = await p.evaluate(() => { const c = game.missions.dialogue.call; return { who: c && c.caller, lines: c && c.opts.lines && c.opts.lines.map((l) => l[1]).join(' | ') }; });
  check(ring.who === 'Reis Baba' && /konağ/i.test(ring.lines || ''), 'Reis arıyor, değerlendirip konağa çağırıyor: ' + ring.lines);
  await p.keyboard.press('KeyT'); await advance();
  const after = await p.evaluate(() => ({ obj: game.missions.objText, gps: !!game.gpsTarget, summoned: game.missions.summoned }));
  check(after.gps && /konağa/.test(after.obj || '') && after.summoned, 'Çağrı sonrası konak hedefi ' + JSON.stringify(after));
  const scene = await p.evaluate(() => { const M = game.missions; return M.baba.sceneLines(M.STORY[M.index], true).map((l) => l[0] + ': ' + l[1]); });
  check(scene.some((l) => /Ali'yle buluştun/.test(l)) && scene.length >= 4, 'Değerlendirme Görev 2\'ye özel satır içeriyor (' + scene.length + ' satır)');

  // Her görev için sahne üretilebiliyor (değerlendirme + brifing), hata yok
  const all = await p.evaluate(() => {
    const M = game.missions, S = M.STORY, bad = [];
    const f0 = JSON.stringify(M.flags);
    for (let i = 1; i < S.length; i++) {
      try {
        M.flags.debrief = { id: S[i - 1].id, g: ['A', 'B', 'C'][i % 3], score: 70 };
        if (i > S.findIndex((d) => d.id === 'devrilme')) { M.flags.babaDown = true; M.flags.baba = i % 2 ? 'sur' : 'oldur'; }
        const L = M.baba.sceneLines(S[i], false);
        if (!L.length || L.some((l) => !l[1])) bad.push(S[i].id);
        const c = M.baba.callLines(S[i]); if (!c.lines.length) bad.push('call:' + S[i].id);
      } catch (e) { bad.push(S[i].id + ':' + e.message); }
    }
    game.state.storyFlags = JSON.parse(f0);
    return bad;
  });
  check(!all.length, 'Tüm görevler için değerlendirme + brifing + çağrı satırları üretildi ' + JSON.stringify(all));

  // ---------------- 3) güven / şüphe ----------------
  const ts = await p.evaluate(() => {
    const M = game.missions, B = M.baba, S = M.STORY, f = M.flags;
    const r = {};
    f.trust = 40; f.susp = 0;
    const nev = S.find((d) => d.id === 'nevzat');
    r.gateLow = B.gate(nev).ok;
    f.trust = 70; r.gateHigh = B.gate(nev).ok;
    const dev = S.find((d) => d.id === 'devrilme');
    r.devLocked = !B.gate(dev).ok; f.conspiracy = true; r.devOpen = B.gate(dev).ok; f.conspiracy = undefined;
    // sadakat: infaz güveni büyütür, kaçırma şüphe getirir
    const sad = S.find((d) => d.id === 'sadakat');
    f.trust = 50; f.susp = 0; f.sadakat = 'infaz'; B.begin(sad); B.finish(sad); r.infaz = f.trust;
    f.trust = 50; f.susp = 0; f.sadakat = 'kacir'; B.begin(sad); B.finish(sad); r.kacir = [f.trust, f.susp];
    // savaşta Kenan'ı öldürmek Reis'i kırar
    const sav = S.find((d) => d.id === 'savas');
    f.trust = 70; f.susp = 0; f.kenan = 'oldur'; B.begin(sav); B.finish(sav); r.kenan = [f.trust, f.susp];
    // not: iki deneme + 3 yıldız = gürültülü
    const har = S.find((d) => d.id === 'harac');
    B.begin(har); B.run.tries = 2; B.run.maxW = 3; r.grade = B.grade(har).g;
    B.run = null; B.begin(har); r.gradeA = B.grade(har).g;
    // şüphe diyaloğu sertleştirir
    f.reisBack = true; f.susp = 70; r.cold = B.greeting('Reis Baba');
    f.susp = 0; f.trust = 80; r.warm = B.greeting('Reis Baba');
    delete f.sadakat; delete f.kenan; delete f.reisBack; f.trust = 30; f.susp = 0; f.debrief = null;
    return r;
  });
  check(!ts.gateLow && ts.gateHigh, 'Beşinci Perde güven 60 ister ' + JSON.stringify([ts.gateLow, ts.gateHigh]));
  check(ts.devLocked && ts.devOpen, 'Devrilme gizli görüşme bayrağıyla açılır');
  check(ts.infaz > 60 && ts.kacir[1] >= 12, `Sadakat seçimi güven/şüpheyi değiştirir: infaz=${ts.infaz} kaçır=${JSON.stringify(ts.kacir)}`);
  check(ts.kenan[0] < 70 && ts.kenan[1] >= 15, 'Kenan\'ı öldürmek Reis\'in güvenini düşürür ' + JSON.stringify(ts.kenan));
  check(ts.grade === 'C' && ts.gradeA === 'A', 'Performans notu ' + ts.grade + '/' + ts.gradeA);
  check(ts.cold !== ts.warm, 'Şüphe/güven Reis\'in selamını değiştirir: "' + ts.cold + '" / "' + ts.warm + '"');

  // ---------------- 4) eski kayıt uyumu ----------------
  const old = await p.evaluate(() => {
    const M = game.missions, s = game.state;
    const keep = { c: s.completed.slice(), i: s.storyIndex, f: JSON.stringify(s.storyFlags) };
    const oldIds = ['eve_donus', 'eski_dost', 'harac', 'karabasan', 'tahsildar', 'liman', 'hain', 'komiser', 'kuyumcu', 'yaris', 'galata', 'kara_yilan', 'ittifak', 'carsi', 'bomba', 'pusu', 'hastane', 'defter', 'sorgu', 'konteyner', 'kisla', 'banka', 'nevzat'];
    s.completed = oldIds.slice(); s.storyFlags = { reisWounded: true };
    M.syncStoryIndex();
    const r = { next: M.STORY[s.storyIndex].id, skipped: ['takip', 'sadakat'].every((id) => s.completed.includes(id)), trust: s.storyFlags.trust };
    s.completed = oldIds.concat(['bogaz', 'savas', 'son']); s.storyFlags = { reisWounded: true, reisBack: true };
    M.syncStoryIndex();
    r.next2 = M.STORY[s.storyIndex].id;
    s.completed = keep.c; s.storyIndex = keep.i; s.storyFlags = JSON.parse(keep.f);
    return r;
  });
  check(old.next === 'bogaz' && old.skipped && old.trust > 20, 'Eski kayıt: yeni İkinci Perde görevleri atlanır, kaldığı yerden ' + JSON.stringify(old));
  check(old.next2 === 'gizli', 'Eski kayıt (eski final bitmiş): Beşinci Perde\'den devam ' + old.next2);

  // ---------------- 5) yeni görevler başlıyor ----------------
  const starts = [];
  for (const id of ['takip', 'sadakat', 'gizli', 'kurtarma', 'devrilme', 'dogan', 'murat', 'bolge', 'tek_hakim']) {
    const r = await p.evaluate((id) => {
      const M = game.missions, def = M.STORY.find((d) => d.id === id);
      try {
        if (game.player.inInterior) game.interiors.exit();
        M.flags.leylaSoz = 'soz'; M.flags.trust = 80;
        M.start(def, { replay: true }); sim(2);
        // seçim diyaloğu açıksa ilk seçenekle ilerle
        const r = { id, active: !!M.active, step: M.stepIdx, obj: M.objText };
        if (M.active) M.cleanup(true);
        M.dialogue.hangup(); if (M.dialogue.open && M.dialogue._finish) M.dialogue._finish();
        return r;
      } catch (e) { return { id, err: e.message }; }
    }, id);
    starts.push(r);
  }
  check(starts.every((r) => !r.err && r.active), 'Yeni görevler hatasız başlıyor ' + JSON.stringify(starts.map((r) => r.id + ':' + (r.err || r.step + ' ' + (r.obj || '').slice(0, 28)))));
  await p.evaluate(() => { const M = game.missions; M.flags.trust = 30; delete M.flags.leylaSoz; game.wanted.reset(); game.npcs.calmPolice(); for (const n of game.npcs.list.slice()) if (n.faction === 'police') game.npcs.remove(n); sim(0.5); });

  // ---------------- 6) büyük harita ----------------
  await p.evaluate(() => { while (game.ui.modalStack.length) game.ui.closeModal(); game.ui.mapScreen(); });
  await p.waitForTimeout(400);
  const mp = await p.evaluate(() => {
    const m = game.ui.topModal();
    const base = !!game._mapBase;
    const z0 = m.view.zoom; m.zoomAt(1.6); const z1 = m.view.zoom;
    m.redraw();
    const t0 = performance.now(); for (let i = 0; i < 10; i++) m.redraw(); const ms = (performance.now() - t0) / 10;
    return { open: !!document.querySelector('.bigmap canvas'), legend: document.querySelectorAll('.bm-legend .li').length, base, baseMs: game._mapBaseMs, z0, z1, ms: Math.round(ms * 10) / 10 };
  });
  check(mp.open && mp.legend > 10 && mp.base, 'Harita açıldı, lejant ve önbellekli taban ' + JSON.stringify(mp));
  check(mp.z1 > mp.z0, 'Yakınlaştırma çalışıyor ' + mp.z0 + ' → ' + mp.z1);
  check(mp.ms < 60, 'Harita çizimi hızlı (' + mp.ms + ' ms/kare, yazılımsal GPU)');
  await p.evaluate(() => game.setWaypoint(null));
  const box = await p.evaluate(() => { const r = game.ui.topModal().canvas.getBoundingClientRect(); return { x: r.left + r.width * 0.4, y: r.top + r.height * 0.45 }; });
  await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.up();
  await p.mouse.move(box.x, box.y); await p.mouse.wheel(0, -300); await p.waitForTimeout(200);
  const wp = await p.evaluate(() => ({ wp: game.waypoint, gps: !!game.gpsTarget, zoom: game.ui.topModal().view.zoom }));
  check(!!wp.wp && wp.gps, 'Tıkla → rota işareti ' + JSON.stringify(wp));
  await p.waitForTimeout(300);
  await shot('map.png');
  await p.evaluate(() => game.ui.closeModal());

  // ---------------- 7) telefon ----------------
  const un0 = await p.evaluate(() => { const u = game.phone.unread; game.phone.notify('Kırmızı ışık ihlali', 'Beşiktaş kavşağında kırmızı ışıkta geçtin. ₺500 ceza kesildi.', { kind: 'fine', from: 'Trafik Denetim' }); game.ui.openPhone(); return u; });
  await p.waitForTimeout(500);
  const ph = await p.evaluate((u0) => ({ v2: !!document.querySelector('.phone.v2'), apps: Array.from(document.querySelectorAll('.phone .ph-app')).map((a) => a.dataset.app), badge: (document.querySelector('.ph-badge') || {}).textContent, want: String(u0 + 1), toast: !!document.querySelector('.ph-toast'), icons: Array.from(document.querySelectorAll('.ph-dock .ph-app i')).every((i) => i.querySelector('svg, img, .ico')) }), un0);
  check(ph.v2 && ['missions', 'contacts', 'messages', 'map', 'bank', 'settings'].every((a) => ph.apps.includes(a)), 'Telefon uygulamaları: ' + ph.apps.join(','));
  check(ph.badge === ph.want && ph.toast, `Bildirim: rozet ${ph.badge} ve kayan bildirim (game.phone.notify)`);
  check(ph.icons, 'Dock simgeleri görünüyor');
  await shot('phone.png');
  await p.click('.ph-app[data-app="messages"]'); await p.waitForTimeout(350);
  const msgs = await p.evaluate(() => Array.from(document.querySelectorAll('.ph-msg')).map((e) => e.textContent).join(' || '));
  check(/Kırmızı ışık/.test(msgs), 'Mesajlar uygulamasında ceza: ' + msgs.slice(0, 80));
  await p.keyboard.press('Backspace'); await p.waitForTimeout(350);
  check(await p.evaluate(() => !!document.querySelector('.ph-screen.app-home')), 'Backspace ile ana ekrana dönüldü');
  await p.click('.ph-app[data-app="contacts"]'); await p.waitForTimeout(350);
  const ct = await p.evaluate(() => Array.from(document.querySelectorAll('.ph-contact b')).map((e) => e.textContent));
  check(ct.includes('Reis Baba') && ct.includes('Usta Rıfat'), 'Rehber: ' + ct.join(', '));
  await p.click('.ph-contact >> nth=0'); await p.waitForTimeout(300);
  const call = await p.evaluate(() => ({ dlg: !document.querySelector('.dialog').classList.contains('hidden'), txt: (document.querySelector('.dialog .txt') || {}).textContent, phone: !!document.querySelector('.dialog .dlg-call') }));
  check(call.dlg && call.phone, 'Rehberden Reis aranıyor (telefonda: konağa çağırır)');
  await advance();
  await p.evaluate(() => { game.ui.openPhone(); });
  await p.waitForTimeout(300);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(100);
  const hot = await p.evaluate(() => { const h = document.querySelector('.phone .hot'); return h ? (h.dataset.app || h.className) : null; });
  check(!!hot, 'Klavye ile telefonda gezinme (vurgu: ' + hot + ')');
  await p.evaluate(() => { while (game.ui.modalStack.length) game.ui.closeModal(); });

  // ---------------- 8) görev defteri: güven göstergesi ----------------
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(300);
  const jt = await p.evaluate(() => (document.querySelector('.jr-trust') || {}).textContent || '');
  check(/Güven/.test(jt) && /Şüphe/.test(jt), 'Görev defterinde güven/şüphe: ' + jt.slice(0, 60));
  await p.keyboard.press('KeyJ');

  console.log(fails.length ? `\n${fails.length} HATA:\n- ` + fails.join('\n- ') : '\nTÜM KONTROLLER GEÇTİ');
};
