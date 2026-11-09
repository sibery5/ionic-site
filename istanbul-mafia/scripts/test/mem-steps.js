// Bellek sızıntısı sondası: ~90 sn karışık oynanış (sürüş, 3★ çatışma, patlamalar) ve her 10 oyun sn'sinde örnek.
// Örnek: renderer.info.memory (geometri/doku), program sayısı, ses düğümü sayacı (oluşturulan / toplanan),
// JS yığını ve Node tarafından `ps` ile Chromium süreç ağacının RSS'i (renderer + gpu + ses hizmeti).
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/mem $PWD/scripts/test/mem-steps.js
// Ortam: MEM_ONLY (drive|fight|boom yalnız o dilim), MEM_SEC (varsayılan 90), MEM_RENDER (kaç sim adımında bir kare çizilir, varsayılan 6), MEM_RT (sonda gerçek zamanlı döngü sn'si)
const { execSync } = require('child_process');
const H = require('./harness.js');

// Node sürecinin altındaki tüm süreçler: tür (renderer/gpu/utility) -> RSS MB
function procTree() {
  const out = execSync('ps -eo pid=,ppid=,rss=,args=', { encoding: 'utf8', maxBuffer: 1 << 24 });
  const rows = out.trim().split('\n').map((l) => { const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/); return m && { pid: +m[1], ppid: +m[2], rss: +m[3], args: m[4] }; }).filter(Boolean);
  const kids = new Map();
  for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r); }
  const res = {};
  const walk = (pid) => { for (const r of kids.get(pid) || []) { const m = r.args.match(/--type=([a-z-]+)/); let k = m ? m[1] : (/chrom/i.test(r.args) ? 'browser' : null); if (k === 'utility') k = /audio/i.test(r.args) ? 'audio' : 'utility'; if (k) { res[k] = (res[k] || 0) + Math.round(r.rss / 1024); if (k === 'renderer' || k === 'gpu-process') { try { const st = require('fs').readFileSync('/proc/' + r.pid + '/status', 'utf8'); const g = (n) => Math.round(+((st.match(new RegExp(n + ':\\s+(\\d+)')) || [0, 0])[1]) / 1024); res[k.slice(0, 3) + 'Anon'] = g('RssAnon'); res[k.slice(0, 3) + 'Shm'] = g('RssShmem'); } catch (e) { /* yok */ } } } walk(r.pid); } };
  walk(process.pid);
  return res;
}

module.exports = async (p) => {
  p.setDefaultTimeout(1800000);
  await H.start(p); await H.install(p);
  const SEC = +(process.env.MEM_SEC || 90), EVERY = +(process.env.MEM_RENDER || 6), RT = +(process.env.MEM_RT || 0);
  await p.evaluate(() => {
    const g = game;
    g.loop = () => {}; // sonda kareleri kendisi çizer
    g.player.god = true;
    // ses düğümü sayacı: oluşturulan / JS sarmalayıcısı toplanan
    const A = window.__aud = { made: 0, freed: 0, bufBytes: 0, byKind: {} };
    const fr = new FinalizationRegistry(() => { A.freed++; });
    const proto = Object.getPrototypeOf(Object.getPrototypeOf(g.audio.ctx || new OfflineAudioContext(1, 1, 44100)));
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (!/^create/.test(k) || typeof proto[k] !== 'function') continue;
      const f = proto[k];
      proto[k] = function (...a) { const n = f.apply(this, a); A.made++; A.byKind[k] = (A.byKind[k] || 0) + 1; if (k === 'createBuffer') A.bufBytes += a[0] * a[1] * 4; try { fr.register(n, 0); } catch (e) { /* ilkel */ } return n; };
    }
    window.__sample = (label) => {
      const m = g.renderer.info.memory, r = g.renderer.info.render;
      return { label, T: +window.T.toFixed(0), geo: m.geometries, tex: m.textures, prog: g.renderer.info.programs ? g.renderer.info.programs.length : -1, calls: r.calls,
        aud: A.made, audLive: A.made - A.freed, bufMB: +(A.bufBytes / 1048576).toFixed(1), heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
        scene: g.scene.children.length, parts: g.particles && g.particles.list ? g.particles.list.length : undefined, cars: g.vehicles.list.length, npcs: g.npcs.list.length };
    };
    // kare çizen sim: EVERY adımda bir render
    window.simR = (sec, every, fn) => { const n = Math.round(sec * 30); for (let i = 0; i < n; i += every) { sim(every / 30, fn ? (j) => fn(i + j) : null); g.render(); } };
  });
  const rows = [];
  const sample = async (label) => { const s = await p.evaluate((l) => window.__sample(l), label); Object.assign(s, procTree()); rows.push(s); console.log('mem', JSON.stringify(s)); };
  await sample('start');
  const per = SEC / 9; // 9 dilim: 3 sürüş, 3 çatışma, 3 patlama
  const t0 = Date.now();
  for (let k = 0; k < 9; k++) {
    const ONLY = { drive: 0, fight: 1, boom: 2 }[process.env.MEM_ONLY];
    const phase = ONLY !== undefined ? ONLY : k % 3;
    await p.evaluate(({ phase, per, EVERY }) => {
      const g = game, pl = g.player;
      if (phase === 0) {
        // sürüş: aracı al, gaz + periyodik direksiyon
        if (g.wanted.level) g.wanted.set(0);
        let v = pl.vehicle;
        if (!v) { v = g.vehicles.add('sedan', pl.pos.x + 3, pl.pos.z, pl.heading); g.enterVehicle(v, true); }
        hold('KeyW', true);
        simR(per, EVERY, (i) => { const s = Math.floor(i / 45) % 4; hold('KeyA', s === 1); hold('KeyD', s === 3); });
        hold('KeyW', false); hold('KeyA', false); hold('KeyD', false);
      } else if (phase === 1) {
        // 3★ çatışma: araçtan in, düşman çete, ateş
        if (pl.vehicle) { g.vehicles.ejectDriver(pl.vehicle); sim(0.5); }
        g.wanted.set(3);
        const f = { x: Math.sin(pl.heading), z: Math.cos(pl.heading) };
        for (let i = 0; i < 6; i++) { const n = g.npcs.add('gang', pl.pos.x + f.x * 16 + (i % 3) * 2, pl.pos.z + f.z * 16 + Math.floor(i / 3) * 2, null, { hostile: true, state: 'idle' }); n.engage(pl); }
        simR(per, EVERY, (i) => { g.input.mouse.left = i % 4 < 2; if (i % 6 === 0) { pl.fireCd = 0; g.input.mouse.leftPressed = true; } pl.ammo && (pl.ammo[pl.weapon] = 999); });
        g.input.mouse.left = false;
      } else {
        // patlamalar: araç patlat + roket/el bombası patlaması
        for (let i = 0; i < 3; i++) { const v = g.vehicles.add('hatch', pl.pos.x + 12 + i * 6, pl.pos.z + 8, 0); v.mission = 'prop'; v.damage(5000, pl); }
        simR(per, EVERY, (i) => { if (i % 45 === 0) g.combat.explosion(pl.pos.x + 10 + Math.random() * 10, 0.5, pl.pos.z - 10 + Math.random() * 10, 6, 0, null, null); });
      }
    }, { phase, per, EVERY });
    await sample(['drive', 'fight', 'boom'][phase] + k);
  }
  const wall = (Date.now() - t0) / 1000;
  // isteğe bağlı: oyunun kendi döngüsüyle gerçek zamanlı koşu (ses saati gerçek hızla ilerler)
  if (RT > 0) {
    await p.evaluate(() => { delete game.loop; requestAnimationFrame(game._loop); });
    for (let i = 0; i < RT / 10; i++) { await p.waitForTimeout(10000); await sample('rt' + i); }
  }
  const a = rows[1], b = rows[rows.length - 1];
  const d = {}; for (const k of ['renderer', 'gpu-process', 'audio', 'browser', 'geo', 'tex', 'audLive', 'heap']) if (a[k] !== undefined && b[k] !== undefined) d[k] = b[k] - a[k];
  console.log('memsum', JSON.stringify({ wall: Math.round(wall), first: a.label, last: b.label, delta: d }));
};
