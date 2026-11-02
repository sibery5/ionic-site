// Grafik ayar menüsü: hazır ayar kartları, yeniden başlatma uyarısı
const H = require('./harness.js');
module.exports = async (p, out) => {
  await H.start(p); await H.install(p);
  const r = await p.evaluate(() => {
    game.ui.settingsMenu('gfx');
    const cards = [...document.querySelectorAll('.qcard')];
    const res = { cards: cards.map((c) => c.dataset.v), before: game.settings.quality };
    document.querySelector('.qcard[data-v="high"]').click();
    res.afterHigh = { preset: game.settings.preset, quality: game.settings.quality, shadowQ: game.settings.shadowQuality, restartShown: !!document.querySelector('.qrestart') };
    document.querySelector(`.qcard[data-v="${res.before}"]`).click();
    res.back = { quality: game.settings.quality, restartShown: !!document.querySelector('.qrestart') };
    return res;
  });
  console.log('gfxmenu', JSON.stringify(r));
  if (r.cards.length !== 4 || r.afterHigh.quality !== 'high' || (r.before !== 'high' && !r.afterHigh.restartShown) || r.back.quality !== r.before) throw new Error('gfxmenu FAIL');
  console.log('gfxmenu OK');
};
