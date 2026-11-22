// [V2] Villa/şehir görsel denetimi: iç mekân parlaklığı (önce/sonra), villa odaları, güvenlik kamerası TV maliyeti,
// camlardan dışarısı, kuşbakışı/sokak şehir görüntüleri ve çizim çağrısı sayısı. Görüntüler toDataURL ile çizildiği
// görevde okunur (BEYIN 1.6), 640 px JPEG olarak yazılır.
// Kullanım: V2=ic,villa,sehir,cim  (bölümler)  V2TAG=once|sonra (dosya adı öneki)
const H = require('./harness.js');
const fs = require('fs');
const path = require('path');

module.exports = async (p, out) => {
  fs.mkdirSync(out, { recursive: true });
  p.setDefaultTimeout(600000);
  const parts = (process.env.V2 || 'ic,villa,sehir').split(',');
  const tag = process.env.V2TAG || 'sonra';
  await H.start(p); await H.install(p);
  await p.evaluate(() => {
    window.__render = game.render.bind(game); game.render = () => {}; game.loop = () => {}; game.suppressPause = true; game.input.lock = () => {}; sim(0.5);
    // çiz + ölç + küçük JPEG: aynı görevde
    window.grab = (w = 640) => {
      const g = game; g.renderer.info.autoReset = false; g.renderer.info.reset();
      window.__render();
      const calls = g.renderer.info.render.calls, tris = g.renderer.info.render.triangles; g.renderer.info.autoReset = true;
      const c = g.renderer.domElement, h = Math.round(w * c.height / c.width);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const x = cv.getContext('2d'); x.drawImage(c, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data; let sum = 0, hot = 0;
      for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += l; if (l > 250) hot++; }
      return { luma: +(sum / (w * h)).toFixed(1), hot: +(hot / (w * h) * 100).toFixed(2), calls, tris, url: cv.toDataURL('image/jpeg', 0.78) };
    };
  });
  const save = (n, r) => { if (r && r.url) { fs.writeFileSync(path.join(out, tag + '-' + n + '.jpg'), Buffer.from(r.url.split(',')[1], 'base64')); delete r.url; } console.log('V2', n, JSON.stringify(r)); return r; };
  // V2ONLY=ad1,ad2: yalnız bu görüntüler (yazılımsal çizicide ikinci okuma tarayıcıyı düşürüyor → görüntü başına ayrı koşu)
  const only = process.env.V2ONLY ? process.env.V2ONLY.split(',') : null;
  const run = async (n, fn, arg) => { if (only && n !== 'villa-giris' && !only.includes(n)) return null; try { return save(n, await p.evaluate(fn, arg)); } catch (e) { console.log('V2HATA', n, String(e.message || e).slice(0, 300)); return null; } };

  if (parts.includes('ic')) {
    // iç mekânlar: güvenli ev, Reis konağı, köşk — oyuncu kapı önünde, kamera odaya (ve ikinci görüntü kapıya) bakar
    for (const type of (process.env.V2ICT || 'safehouse,konak,rival,apartment').split(',')) {
      for (const look of (process.env.V2LOOK || 'oda').split(',')) {
        await run('ic-' + type + '-' + look, ([type, look]) => {
          const g = game, pl = g.player;
          if (pl.inInterior) g.interiors.exit();
          const door = g.city.doors.find((d) => d.building.type === type);
          if (!door) return { err: 'kapı yok' };
          pl.pos.set(door.x, 0, door.z); sim(0.3);
          const ctx = g.interiors.enter(door);
          if (look === 'kapi') { pl.pos.set(0, 0, 0); pl.heading = 0; pl.camYaw = 0; } else { pl.heading = Math.PI; pl.camYaw = Math.PI; }
          pl.camPitch = 0.15; pl.camInit = false; sim(0.6);
          const r = grab();
          r.outsideMs = +(window.__ovMs || 0).toFixed(1);
          return r;
        }, [type, look]);
      }
    }
    await p.evaluate(() => { if (game.player.inInterior) game.interiors.exit(); sim(0.2); });
  }

  if (parts.includes('villa')) {
    const P = Math.PI;
    // ad, oyuncu konumu (x, y, z), bakış yönü (heading: 0 → +z, π → -z, π/2 → +x)
    const rooms = [
      ['hol', 0, 0, 6.2, P], ['salon', -5.6, 0, -2.0, -P / 2], ['salon2', 1.2, 0, -2.6, P], ['yemek', 8, 0, 0.8, P],
      ['merdiven', 2.6, 0, 5.4, P / 2], ['ofis', -6.2, 0, 3.6, -P / 2],
      ['yatak', 9.0, 4.2, 0.8, P], ['giyinme', 0.8, 4.2, -3.2, -P / 2], ['banyo', -5.0, 4.2, -3.0, -P / 2], ['misafir', -6.0, 4.2, 3.0, -0.62],
      ['galeri', 0.0, 4.2, 3.5, P / 2], ['calisma', -4.0, 8.4, -0.6, -2.27], ['bar', 2.8, 8.4, 1.5, -0.3], ['teras', 6.0, 8.4, 0.5, 2.36],
    ];
    await run('villa-giris', () => {
      const g = game, pl = g.player;
      if (pl.inInterior) g.interiors.exit();
      const door = g.city.doors.find((d) => d.building.villaPlayer);
      pl.pos.set(door.x, 0, door.z); sim(0.3);
      const ctx = g.interiors.enter(door);
      return { type: ctx.type, outsideMs2: +(window.__ovMs || 0).toFixed(1), interact: ctx.interact.length, seats: (ctx.furnSeats || []).length };
    });
    for (const [n, x, y, z, yaw] of rooms) {
      await run('villa-' + n, ([x, y, z, yaw]) => {
        const g = game, pl = g.player;
        pl.pos.set(x, y + 0.05, z); pl.vy = 0; pl.heading = yaw; pl.camYaw = yaw; pl.camPitch = 0.12; pl.camInit = false;
        sim(0.5);
        const r = grab();
        r.y = +pl.pos.y.toFixed(2); r.floor = pl.inInterior.villaFloor;
        r.it = (g.findInteraction() || {}).label || null;
        return r;
      }, [x, y, z, yaw]);
    }
    // merdivenden yürüyerek çık: A kolu (zemin → 1. kat), B kolu (1. kat → 2. kat)
    await run('villa-merdiven-yuru', () => {
      const g = game, pl = g.player;
      pl.pos.set(3.9, 0, 3.8); pl.vy = 0; pl.heading = Math.PI / 2; pl.camYaw = pl.heading; sim(0.3);
      hold('KeyW', true); sim(4.5, () => { pl.heading = Math.PI / 2; pl.camYaw = pl.heading; }); hold('KeyW', false);
      const a = { x: +pl.pos.x.toFixed(1), y: +pl.pos.y.toFixed(2), z: +pl.pos.z.toFixed(1) };
      pl.pos.set(11.2, 4.25, 5.8); pl.vy = 0; sim(0.3);
      hold('KeyW', true); sim(4.5, () => { pl.heading = -Math.PI / 2; pl.camYaw = pl.heading; }); hold('KeyW', false);
      const b = { x: +pl.pos.x.toFixed(1), y: +pl.pos.y.toFixed(2), z: +pl.pos.z.toFixed(1) };
      return { a, b };
    });
    // güvenlik kamerası: salonda 3 sn — çizim başına ve kare başına ortalama maliyet
    await run('villa-tv', () => {
      const g = game, pl = g.player, ctx = pl.inInterior;
      pl.pos.set(-7.0, 0.05, -3.5); pl.vy = 0; pl.heading = -Math.PI / 2; pl.camYaw = -Math.PI / 2; pl.camPitch = 0.05; pl.camInit = false;
      sim(0.2);
      const s0 = { ...ctx.tvStats };
      sim(3);
      const st = ctx.tvStats, n = st.n - s0.n, ms = st.ms - s0.ms, fr = st.frames - s0.frames;
      const r = grab();
      Object.assign(r, { renders: n, msPerRender: +(ms / Math.max(1, n)).toFixed(2), msPerFrame: +(ms / Math.max(1, fr)).toFixed(3) });
      return r;
    });
    await p.evaluate(() => { if (game.player.inInterior) game.interiors.exit(); sim(0.2); });
  }

  if (parts.includes('sehir')) {
    // kuşbakışı ve sokak: Levent kuleleri, mahalle çatıları, askeri bölge kuzey kıyısı, tabelalı cadde
    const views = [
      ['levent-kus', -270, -880, [-150, 190, -620], [-270, 30, -880]],
      ['levent-sokak', -270, -840, [-262, 1.7, -812], [-275, 40, -900]],
      ['catilar-kus', -300, -60, [-240, 90, 10], [-300, 5, -60]],
      ['askeri-cit', -860, -985, [-830, 9, -968], [-880, 1, -999]],
      ['tabela-cadde', -300, -60, [-320, 6, -40], [-280, 4, -70]],
    ];
    for (const [n, px, pz, c, l] of views) {
      await run('sehir-' + n, ([px, pz, c, l]) => {
        const g = game, pl = g.player;
        g.env.time = 13; g.env.update(0.01, pl.pos); g.uniforms.uNight.value = g.env.nightFactor;
        pl.pos.set(px, 0, pz); sim(0.6);
        g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(l[0], l[1], l[2]); g.camera.updateMatrixWorld(true);
        if (g.city.updateCamera) g.city.updateCamera(g.camera);
        g.city.update(0.01, window.T);
        g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(l[0], l[1], l[2]);
        window.__render();
        return grab();
      }, [px, pz, c, l]);
    }
    await run('sehir-levent-gece', () => {
      const g = game, pl = g.player;
      g.env.time = 22; g.env.update(0.01, pl.pos); g.uniforms.uNight.value = g.env.nightFactor; g.city.setNight(g.env.nightFactor);
      pl.pos.set(-270, 0, -880); sim(0.4);
      g.camera.position.set(-150, 160, -600); g.camera.lookAt(-270, 40, -880);
      if (g.city.updateCamera) g.city.updateCamera(g.camera); g.city.update(0.01, window.T);
      g.camera.position.set(-150, 160, -600); g.camera.lookAt(-270, 40, -880);
      window.__render(); return grab();
    });
  }

  if (parts.includes('cim')) {
    await run('villa-cim', () => {
      const g = game, pl = g.player;
      g.env.time = 11; g.env.update(0.01, pl.pos); g.uniforms.uNight.value = g.env.nightFactor;
      pl.pos.set(95, 0, -800); sim(0.6);
      g.camera.position.set(92, 1.7, -792); g.camera.lookAt(110, 0.2, -810);
      g.villa.w.group.visible = true;
      if (g.city.grass) g.city.grass.userData.update(g.camera.position);
      return grab();
    });
  }
  console.log('V2 bitti');
};
