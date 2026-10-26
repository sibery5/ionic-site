// Çarpışma denetimi ve araç fiziği testi.
//  1) Denetim: şehirdeki her görünür eşya örneğine (NearInstancer + trafik direkleri + binalar) 4 yönden yatay
//     ışın atılır; ışın eşyanın kendi taban kutusu içinde bir çarpışma şekline değmezse "çarpışmasız" sayılır.
//  2) Sürüş sondası: 200 km/s araç ağır eşyalara/binaya sürülür → içinden geçmemeli (alt adım, OBB).
//     Hafif eşyalar (kova, baba, levha) kırılıp enkaza dönmeli.
//  3) Araç-araç OBB çarpışması (dönme), yaya çarpması (tek hasar, itme).
//   node scripts/test/play.js file://$PWD/app/index.html /tmp/out $PWD/scripts/test/collision-steps.js
// AUDIT_ONLY=1 yalnız denetimi çalıştırır (eski sürümle kıyas için).
const H = require('./harness.js');

module.exports = async (p, out) => {
  p.setDefaultTimeout(600000);
  await H.start(p); await H.install(p);
  await p.evaluate(() => { game.loop = () => {}; game.player.god = true; sim(1); });
  const audit = await p.evaluate(() => {
    const g = game, ph = g.physics, city = g.city;
    const EXEMPT = new Set(['manhole', 'grate', 'helipad', 'helipadM', 'rwyNum', 'rwyNum2', 'rlight', 'cleat', 'door', 'awning', 'forsale', 'graf0', 'graf1', 'graf2', 'graf3',
      'laundry', 'sill', 'ac', 'balcony', 'railing', 'glassrail', 'potted', 'razor', 'dish', 'solar', 'pool', 'tulips', 'bed', 'crown']);
    const lists = [];
    for (const k in city.props) lists.push([k, city.props[k]]);
    for (const n of city.near) if (n.name && !Object.values(city.props).includes(n)) lists.push([n.name, n]);
    const res = {}, fails = [];
    const box = new (g.scene.position.constructor)();
    void box;
    const probe = (name, x, y, z, ext, hgt) => {
      // 4 yönden ışın; isabet noktası örnek tabanının (ext) içinde olmalı
      let hits = 0;
      const py = y + Math.max(0.25, Math.min(0.7, hgt * 0.5));
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + 0.3;
        const dx = Math.sin(a), dz = Math.cos(a);
        const D = ext + 2.5;
        const ox = x - dx * D, oz = z - dz * D;
        const h = ph.raycast(ox, py, oz, dx, 0, dz, D + ext, (b) => b.tag !== 'curb');
        if (!h || typeof h.box !== 'object') continue;
        const hx = ox + dx * h.t, hz = oz + dz * h.t;
        if (Math.abs(hx - x) <= ext + 0.35 && Math.abs(hz - z) <= ext + 0.35) hits++;
      }
      return hits;
    };
    const geoExt = (geo) => { if (!geo.boundingBox) geo.computeBoundingBox(); const bb = geo.boundingBox; return { ex: Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)), ez: Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z)), h: bb.max.y - Math.max(0, bb.min.y) }; };
    for (const [name, inst] of lists) {
      const base = name.split(':')[0];
      if (EXEMPT.has(base) || !inst.M) continue;
      const n = inst.M.length / 16;
      const E = geoExt(inst.geo);
      let ok = 0, bad = 0;
      for (let i = 0; i < n; i++) {
        const e = inst.M.subarray(i * 16, i * 16 + 16);
        const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
        if (sx < 1e-4) continue; // kırılmış / gizli
        const x = e[12], y = e[13], z = e[14];
        if (y > 2.5 && name !== 'yacht') continue; // çatı / cephe yüksekliği
        if (y < -3 && name !== 'yacht') continue;
        const ext = Math.min(name === 'hangar' ? 30 : 3, Math.max(0.15, Math.min(E.ex * sx, E.ez * sz)));
        let hits = probe(name, x, Math.max(y, 0), z, ext, E.h * sy);
        // eşya başka bir katı şeklin içine gömülüyse (ör. bina duvarı) yine çarpışmalı sayılır
        if (!hits && ph.city.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05, []).some((b) => b.y1 > 1.5 && b.y0 < 0.5 && b.tag !== 'curb' && (!b.shape ? (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) : true))) hits = 1;
        if (hits >= 1) ok++; else { bad++; if (fails.length < 60) fails.push([name, +x.toFixed(1), +z.toFixed(1)]); }
      }
      if (ok + bad) res[name] = { n: ok + bad, missing: bad };
    }
    // trafik ışığı direkleri
    if (g.traffic && g.traffic.poles) {
      const m = g.traffic.poles.instanceMatrix.array; let ok = 0, bad = 0;
      for (let i = 0; i < g.traffic.count; i++) { const x = m[i * 16 + 12], z = m[i * 16 + 14]; if (probe('trafficPole', x, 0, z, 0.2, 5) >= 1) ok++; else bad++; }
      res.trafficPole = { n: ok + bad, missing: bad };
    }
    // binalar: cephe ortasına doğru ışın
    { let ok = 0, bad = 0;
      const tagged = new Set(); for (const c of ph.city.boxes) if (c.tag && typeof c.tag === 'object') tagged.add(c.tag);
      for (const b of g.map.buildings) {
        // kapı cephesine dışarıdan dik ışın (3 m uzaktan) + binanın kendi çarpışma kutusu
        const d = b.door, nx = d.nx || 0, nz = d.nz || 0;
        let h = null;
        for (const off of [1.6, -1.6, 0, 3.2, -3.2]) {
          const ox = d.x + nx * 3 + (nz ? off : 0), oz = d.z + nz * 3 + (nx ? off : 0);
          h = ph.raycast(ox, 1.0, oz, -nx, 0, -nz, 3.6, (bb) => bb.tag !== 'curb');
          if (h && h.t > 1.5) break;
        }
        if (h && h.t > 1.5 && tagged.has(b)) ok++; else { bad++; if (fails.length < 60) fails.push(['building', +d.x.toFixed(1), +d.z.toFixed(1), h ? +h.t.toFixed(2) : -1]); }
      }
      res.building = { n: ok + bad, missing: bad }; }
    let total = 0, missing = 0;
    for (const k in res) { total += res[k].n; missing += res[k].missing; }
    return { total, missing, byType: res, fails: fails.slice(0, 25) };
  });
  console.log('audit', JSON.stringify({ total: audit.total, missing: audit.missing }));
  console.log('audit-types', JSON.stringify(Object.fromEntries(Object.entries(audit.byType).filter(([, v]) => v.missing > 0))));
  console.log('audit-all', JSON.stringify(audit.byType));
  if (audit.fails.length) console.log('audit-fails', JSON.stringify(audit.fails));
  if (process.env.AUDIT_ONLY) { if (audit.missing) console.log('FAIL: çarpışmasız eşya', audit.missing); return; }

  // 2) sürüş sondaları
  const drive = await p.evaluate(() => {
    const g = game, ph = g.physics, city = g.city;
    const out = [];
    const findInst = (name, pred) => {
      const inst = city.props[name]; if (!inst || !inst.M) return null;
      const n = inst.M.length / 16, pl = g.player.pos;
      let best = null, bd = 1e9;
      for (let i = 0; i < n; i++) {
        const e = inst.M.subarray(i * 16, i * 16 + 16);
        if (Math.hypot(e[0], e[1], e[2]) < 1e-4 || e[13] > 1) continue;
        const x = e[12], z = e[14];
        if (pred && !pred(x, z)) continue;
        const d = Math.hypot(x - pl.x, z - pl.z);
        if (d < bd) { bd = d; best = { x, z }; }
      }
      return best;
    };
    // araç önündeki 18 m'yi açık bulan yaklaşma yönü
    const approach = (x, z, tag) => {
      for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8;
        const dx = Math.sin(a), dz = Math.cos(a);
        const sx = x - dx * 16, sz = z - dz * 16;
        let clear = true;
        for (let s = 2; s < 15; s += 0.5) {
          const qx = sx + dx * s, qz = sz + dz * s;
          const bs = ph.city.query(qx - 1.3, qz - 1.3, qx + 1.3, qz + 1.3, []);
          if (bs.some((b) => b.y1 > 0.3 && b.tag !== tag && b.tag !== 'curb' && !b.removed)) { clear = false; break; }
          if (!ph.city.query(qx - 0.1, qz - 0.1, qx + 0.1, qz + 0.1, []).length && false) clear = false;
        }
        if (clear && !ph.inWater(sx, sz)) return { sx, sz, a };
      }
      return null;
    };
    const ram = (name, tag, speed = 55) => {
      const pl = g.player.pos;
      const t = findInst(name, (x, z) => !!approach(x, z, tag));
      if (!t) return { name, skip: 'yok' };
      const ap = approach(t.x, t.z, tag);
      const v = g.vehicles.add('sedan', ap.sx, ap.sz, ap.a);
      v.ai = null;
      pl.set(ap.sx + 30, 0, ap.sz + 30);
      v.vx = Math.sin(ap.a) * speed; v.vz = Math.cos(ap.a) * speed;
      const hp0 = v.hp;
      const before = ph.city.query(t.x - 0.5, t.z - 0.5, t.x + 0.5, t.z + 0.5, []).filter((b) => b.tag === tag).length;
      let minAlong = 1e9, maxAlong = -1e9;
      for (let i = 0; i < 30; i++) {
        v.controls.throttle = 0; v.controls.steer = 0;
        sim(1 / 30);
        const along = (v.pos.x - t.x) * Math.sin(ap.a) + (v.pos.z - t.z) * Math.cos(ap.a);
        minAlong = Math.min(minAlong, along); maxAlong = Math.max(maxAlong, along);
      }
      const after = ph.city.query(t.x - 0.5, t.z - 0.5, t.x + 0.5, t.z + 0.5, []).filter((b) => b.tag === tag).length;
      const r = { name, broke: before > 0 && after < before, passed: maxAlong > 0.5, maxAlong: +maxAlong.toFixed(2), dmg: Math.round(hp0 - v.hp), spd: +v.speed.toFixed(1) };
      g.vehicles.remove(v);
      return r;
    };
    for (const [n, tag] of [['lampModern', 'lamp'], ['kiosk', 'kiosk'], ['phone', 'phone'], ['busstop', 'busstop'], ['bin', 'bin'], ['bollard', 'bollard'], ['bench', 'bench'], ['hydrant', 'hydrant'], ['news', 'news'], ['scooter', 'scooter']]) out.push(ram(n, tag));
    // ağaç gövdesi
    // bina duvarı (200 km/s)
    {
      const pl = g.player.pos;
      let bb = null, bd = 1e9;
      for (const b of g.map.buildings) { const d = Math.hypot((b.x0 + b.x1) / 2 - pl.x, (b.z0 + b.z1) / 2 - pl.z); if (d < bd && b.x1 - b.x0 > 8) { bd = d; bb = b; } }
      const nz = bb.door.nz || 1;
      const x = (bb.x0 + bb.x1) / 2 + 2.5, z0 = nz > 0 ? bb.z1 + 22 : bb.z0 - 22;
      const v = g.vehicles.add('gt', x, z0, nz > 0 ? Math.PI : 0);
      v.ai = null; v.vx = 0; v.vz = -nz * 58;
      let inside = false;
      for (let i = 0; i < 40; i++) { sim(1 / 30); if (v.pos.z > bb.z0 + 0.3 && v.pos.z < bb.z1 - 0.3 && v.pos.x > bb.x0 && v.pos.x < bb.x1) inside = true; }
      out.push({ name: 'building200', passed: inside, dmg: Math.round(v.def.hp - v.hp), z: +v.pos.z.toFixed(1), wall: nz > 0 ? bb.z1 : bb.z0 });
      g.vehicles.remove(v);
    }
    return out;
  });
  console.log('drive', JSON.stringify(drive));

  // 3) araç-araç ve yaya
  const cc = await p.evaluate(() => {
    const g = game, pl = g.player;
    const x = pl.pos.x, z = pl.pos.z;
    // açık alan bul: oyuncu yakınındaki yol kavşağı
    const n = g.map.nearestNode(x, z);
    const a = g.vehicles.add('sedan', n.x - 12, n.z + 1.2, Math.PI / 2);
    const b = g.vehicles.add('sedan', n.x + 12, n.z - 0.2, -Math.PI / 2);
    for (const v of [a, b]) v.ai = null;
    pl.pos.set(n.x + 40, 0, n.z + 40);
    a.vx = 16; b.vx = -16;
    const h0a = a.heading, h0b = b.heading;
    let minD = 1e9, overlap = 0;
    for (let i = 0; i < 45; i++) {
      sim(1 / 30);
      const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z); minD = Math.min(minD, d);
      // OBB örtüşmesi: merkezler arası uzaklık, yarı genişlik toplamının altına inmemeli (yan yana gelirse)
      if (d < (a.def.wid) * 0.9) overlap++;
    }
    const r = { minD: +minD.toFixed(2), overlapFrames: overlap, spinA: +Math.abs(a.heading - h0a).toFixed(2), spinB: +Math.abs(b.heading - h0b).toFixed(2), dmgA: Math.round(a.def.hp - a.hp), dmgB: Math.round(b.def.hp - b.hp) };
    g.vehicles.remove(a); g.vehicles.remove(b);
    // yaya çarpması
    for (const o of g.vehicles.list.slice()) if (Math.hypot(o.pos.x - n.x, o.pos.z - n.z) < 60 && !o.external) g.vehicles.remove(o);
    for (const o of g.npcs.list.slice()) if (Math.hypot(o.pos.x - n.x, o.pos.z - n.z) < 30) g.npcs.remove(o);
    const ped = g.npcs.add('civilian', n.x, n.z + 1.0, null, { state: 'idle' });
    ped.maxHp = ped.hp = 5000;
    const c = g.vehicles.add('sedan', n.x - 25, n.z + 1.0, Math.PI / 2); c.ai = null; c.vx = 24;
    let hits = 0, lastHp = ped.hp, inside = 0;
    for (let i = 0; i < 40; i++) {
      sim(1 / 30);
      if (ped.hp < lastHp) { hits++; lastHp = ped.hp; }
      const f = c.fwd; const dx = ped.pos.x - c.pos.x, dz = ped.pos.z - c.pos.z;
      if (Math.abs(dx * f.x + dz * f.z) < c.def.len / 2 - 0.3 && Math.abs(dx * -f.z + dz * f.x) < c.def.wid / 2 - 0.3) inside++;
    }
    r.carEnd = [+c.pos.x.toFixed(1) - n.x, +c.pos.z.toFixed(1) - n.z, +c.speed.toFixed(1)]; r.pedPos = [+(ped.pos.x - n.x).toFixed(1), +(ped.pos.z - n.z).toFixed(1), ped.state];
    r.pedHits = hits; r.pedDmg = Math.round(5000 - ped.hp); r.pedInsideFrames = inside;
    g.vehicles.remove(c); g.npcs.remove(ped);
    return r;
  });
  console.log('carcar', JSON.stringify(cc));
  // değerlendirme
  const fails = [];
  if (audit.missing) fails.push('çarpışmasız eşya: ' + audit.missing);
  for (const d of drive) {
    if (d.skip) continue;
    const light = ['bin', 'bollard', 'bench', 'hydrant', 'news', 'scooter'].includes(d.name);
    if (light && !d.broke) fails.push(d.name + ' kırılmadı');
    if (!light && d.passed) fails.push(d.name + ' içinden geçildi');
  }
  if (cc.overlapFrames > 2) fails.push('araçlar iç içe geçti');
  if (cc.spinA + cc.spinB < 0.05) fails.push('çarpışmada dönme yok');
  if (cc.pedHits < 1 || cc.pedHits > 2) fails.push('yaya çarpma sayısı ' + cc.pedHits);
  if (cc.pedInsideFrames > 1) fails.push('yaya aracın içinde kaldı');
  console.log(fails.length ? 'FAIL ' + JSON.stringify(fails) : 'collision OK');
};
