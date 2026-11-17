// [C2] Görünüş: GTA tarzı büyük yazı, ölüm yazısı, keskin nişancı dürbünü, helikopter nişanı (4 ekran görüntüsü).
//   SETTINGS='{"quality":"low"}' node scripts/test/play.js file://$PWD/app/index.html .testout/c2look $PWD/scripts/test/c2look-steps.js
const path = require('path');
const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  const shot = async (n) => { await p.waitForTimeout(700); await p.screenshot({ path: out + '-' + n + '.jpg', quality: 70, timeout: 90000 }).then(() => console.log('görüntü', n), (e) => console.log('görüntü HATA', n, e.message.slice(0, 80))); };
  await p.evaluate(() => { const g = game; g.player.god = true; g.ui.bigMessage('GERÇEKTEN MASUM BİR HAYVANA ZARAR MI VERECEKSİN?', 'Hayvanlar da can taşır.', 'red', 5); });
  await shot('c2-yazi-uzun');
  await p.evaluate(() => { const g = game; g.ui.bigMessage('GÖREV TAMAMLANDI', '+₺25.000 · Saygınlık +10', 'gold', 5); });
  await shot('c2-yazi');
  await p.evaluate(() => { const g = game; g.ui.wasted('ÖLDÜN', 'Hastane masrafı ₺1.500', () => {}); });
  await shot('c2-oldun');
  await p.waitForTimeout(4600);
  await p.evaluate(() => { const g = game, pl = g.player; pl.giveWeapon('sniper', 20); pl.setWeapon('sniper'); g.input.mouse.right = true; sim(1, () => { g.input.mouse.right = true; }); g.input.mouse.wheel = -3; sim(1 / 30); hold('ShiftLeft', true); sim(0.5, () => { g.input.mouse.right = true; }); hold('ShiftLeft', false); g.combat.reticle && g.combat.reticle.update(); });
  await shot('c2-durbun');
  await p.evaluate(() => { const g = game, pl = g.player; g.input.mouse.right = false; sim(0.3); const h = g.aircraft.add('attackHeli', pl.pos.x, pl.pos.z, 0); g.enterVehicle(h, true); sim(0.2, () => { h.pos.y = 50; }); const c = g.vehicles.add('sedan', pl.pos.x + 10, pl.pos.z + 80, 0); sim(1.0, () => { h.pos.y = 50; h.vx = h.vy = h.vz = 0; g.input.mouse.right = true; const cam = g.camera.position, dx = c.pos.x - cam.x, dy = c.pos.y + 0.8 - cam.y, dz = c.pos.z - cam.z, d = Math.hypot(dx, dy, dz); pl.camYaw = Math.atan2(dx, dz); pl.camPitch = -Math.asin(dy / d); }); g.combat.reticle && g.combat.reticle.update(); });
  await shot('c2-heli-nisan');
};
