// [ses/intro] İntro testi: adreste ?intro ile açılır (otomatik testlerde intro yalnız böyle oynar).
// Denetimler: intro başlıyor + intro müziği; planlar ilerliyor (kamera konumu değişiyor); 4 hikâye satırı sırayla;
// 2 sn sonra atlama ipucu; sonunda ana menü; yeniden izle + tuşla atlama; konsol hatası yok. 3 ekran görüntüsü.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js "file://$PWD/app/index.html?intro" .testout/intro $PWD/scripts/test/intro-steps.js
const path = require('path');
const fs = require('fs');
const H = require('./harness.js');

module.exports = async (p, out) => {
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const fails = [];
  const dir = path.join(process.cwd(), '.testout', 'intro'); fs.mkdirSync(dir, { recursive: true });
  // zamanı elle ilerlet (yazılımsal GPU'da gerçek zamanlı kare çok yavaş): menü güncellemesi = intro güncellemesi
  const adv = (to) => p.evaluate((to) => { const I = game.intro; let n = 0; while (I.active && I.t < to && n++ < 2000) game.updateMenu(0.05, performance.now() / 1000); return I.t; }, to);
  await p.waitForTimeout(300);
  const s0 = await p.evaluate(() => ({ active: !!(game.intro && game.intro.active), el: !!document.querySelector('.intro'), music: game.audio.musicMode, boot: window.__boot && window.__boot.ready, modals: game.ui.modalStack.length }));
  console.log('baslangic', JSON.stringify(s0));
  if (!s0.active || !s0.el || s0.music !== 'intro' || s0.modals !== 0) fails.push('baslamadi');
  await p.waitForTimeout(2300);
  const hint = await p.evaluate(() => getComputedStyle(document.querySelector('.intro .ix')).opacity);
  console.log('ipucu opaklik', hint);
  if (!(+hint > 0.5)) fails.push('ipucu');
  const cams = [];
  const snap = async (t, shot) => {
    await adv(t);
    const c = await p.evaluate(() => { const c = game.camera.position; return { t: +game.intro.t.toFixed(1), shot: game.intro.shot, x: Math.round(c.x), y: Math.round(c.y), z: Math.round(c.z), line: document.querySelector('.intro .il').textContent, lo: +document.querySelector('.intro .il').style.opacity, title: +document.querySelector('.intro .it').style.opacity, black: +document.querySelector('.intro .ik').style.opacity }; });
    cams.push(c);
    if (shot) await H.shot(p, path.join(dir, shot + '.png'));
  };
  await snap(2); await snap(8.5, '1-plan'); await snap(16, '2-yazi'); await snap(24); await snap(32); await snap(39.5, '3-baslik');
  console.log('planlar\n' + cams.map((c) => JSON.stringify(c)).join('\n'));
  const distinct = new Set(cams.map((c) => c.shot)).size;
  const moved = cams.slice(1).every((c, i) => Math.hypot(c.x - cams[i].x, c.y - cams[i].y, c.z - cams[i].z) > 20);
  if (distinct < 5 || !moved) fails.push('kamera');
  if (cams[0].black < 0.99) fails.push('studyo-karti');
  if (!(cams[5].title > 0.9)) fails.push('baslik');
  const lines = await p.evaluate(() => game.intro.lineShown.slice());
  console.log('satirlar', JSON.stringify(lines));
  if (lines.join() !== '0,1,2,3') fails.push('satirlar');
  await adv(60);
  // örtü 0,6 sn'de söner; yavaş yazılımsal GPU'da zamanlayıcı gecikebilir
  await p.waitForFunction(() => !document.querySelector('.intro'), null, { timeout: 5000 }).catch(() => {});
  const end = await p.evaluate(() => ({ active: game.intro.active, el: !!document.querySelector('.intro'), menu: !!document.querySelector('.mainmenu'), music: game.audio.musicMode, fov: game.camera.fov }));
  console.log('bitis', JSON.stringify(end));
  if (end.active || end.el || !end.menu || end.music !== 'menu' || end.fov !== 55) fails.push('bitis');
  // yeniden izle + tuşla atla
  await p.evaluate(() => game.intro.play());
  await adv(10);
  await p.waitForTimeout(500);
  await p.keyboard.press('Space');
  await p.waitForTimeout(800);
  const sk = await p.evaluate(() => ({ active: game.intro.active, skipped: game.intro.skipped, menu: !!document.querySelector('.mainmenu'), el: !!document.querySelector('.intro'), music: game.audio.musicMode }));
  console.log('atlama', JSON.stringify(sk));
  if (sk.active || !sk.skipped || !sk.menu || sk.el || sk.music !== 'menu') fails.push('atlama');
  console.log('konsol hatalari', errs.length, errs.slice(0, 3).join(' | '));
  if (errs.length) fails.push('konsol');
  console.log(fails.length ? 'INTRO BASARISIZ: ' + fails.join(', ') : 'INTRO TAMAM');
};
