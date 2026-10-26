// sayfa içi yardımcılar
module.exports.install = async (p) => p.evaluate(() => {
  window.T = 0;
  window.sim = (sec, fn) => { const g = window.game; const dt = 1 / 30; for (let i = 0; i < sec * 30; i++) { if (fn) fn(i); window.T += dt; g.dt = dt; if (g.mode === 'playing' || g.mode === 'dead') g.updateGame(dt, window.T); g.input.endFrame(); } };
  window.press = (code) => { game.input.pressed.add(code); };
  window.hold = (code, on) => { if (on) game.input.keys.add(code); else game.input.keys.delete(code); };
  window.info = () => { const g = game, pl = g.player; return { mode: g.mode, pos: pl.pos.toArray().map(v => +v.toFixed(1)), hp: Math.round(pl.hp), money: g.state && g.state.money, wanted: g.wanted.level, npcs: g.npcs.list.length, cars: g.vehicles.list.length, inside: pl.inInterior && pl.inInterior.type, veh: pl.vehicle && pl.vehicle.type, obj: document.getElementById('objective').textContent, story: g.state && g.state.storyIndex, dialog: !document.querySelector('.dialog').classList.contains('hidden') }; };
});
module.exports.start = async (p) => {
  await p.waitForTimeout(800);
  await p.click('text=YENİ OYUN', { timeout: 180000 });
  await p.waitForTimeout(600);
  await p.click('text=MACERAYA BAŞLA', { timeout: 180000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => { game.input.mouse.dx = 0; game.player.camPitch = 0.25; game.player.camYaw = game.player.heading + Math.PI; });
};
module.exports.shot = async (p, path) => { await p.evaluate(() => { game.render(); }); await p.screenshot({ path, timeout: 240000 }); };
