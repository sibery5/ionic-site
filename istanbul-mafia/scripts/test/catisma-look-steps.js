// Gözle denetim: hayvan uyarısı yazısı ve tüfek nişangâhı ekranda nasıl görünüyor (tek görüntü).
const H = require('./harness.js');
module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  await p.evaluate(() => {
    const g = game, pl = g.player, A = g.animals;
    g.loop = () => {}; pl.god = true; sim(0.5);
    let tries = 0; while (A.cats.length + A.dogs.length === 0 && tries++ < 40) A.spawnStreetAnimal(pl.pos.x, pl.pos.z);
    const cat = A.cats[0] || A.dogs[0];
    const put = () => { pl.camPitch = 0.55; pl.computeAim(); const o = g.camera.position, d = pl.aimDir, t = d.y < -0.02 ? (o.y - 0.25) / -d.y : 6; cat.x = o.x + d.x * t; cat.z = o.z + d.z * t; cat.state = 'sit'; cat.t = 99; cat.sp = 0; cat.g.position.set(cat.x, 0, cat.z); };
    pl.giveWeapon('ak', 300); pl.setWeapon('ak'); sim(0.3);
    g.ui.closeAll(); g.ui.dialogEl.classList.add('hidden'); g.mode = 'playing';
    g.input.mouse.right = true; sim(0.6); put(); sim(0.3); put(); sim(1 / 30);
    for (let k = 0; k < 3; k++) { put(); pl.fireCd = 0; g.input.mouse.left = true; g.input.mouse.leftPressed = true; sim(1 / 30); }
  });
  await H.shot(p, out + '/hayvan.png');
};
