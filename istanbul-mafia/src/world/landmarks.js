// İstanbul'un simge yapıları: Galata Kulesi, Sultanahmet, Ayasofya, Süleymaniye, Kapalıçarşı,
// Dolmabahçe, Haydarpaşa, Mihrimah Sultan, Taksim Anıtı, stadyum.
// Mimari ayrıntı: kaburgalı kurşun kubbeler (kenet dikişli kurşun dokusu), pencereli kasnaklar, yarım kubbe
// kademeleri, ağırlık kuleleri, iki sıra kemerli pencereler, şerefeli (balkonlu) yivli minareler ve kurşun külahlar,
// alemler, revaklı avlular, şadırvan. Gece: taş yüzeyler projektörle aydınlanır (floodMaterial), pencereler yanar,
// şerefelerde kandil ışıkları. Her yapı malzemeye göre birleştirilir (birkaç çizim çağrısı).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flagTexture, ashlarPBR, plasterPBR, leadPBR, brickPBR } from '../core/textures.js';
import { pbrMaterial, floodMaterial, nightGlowMaterial } from './shaders.js';
import { ledMaterial } from './bridges.js';

const mats = {};
function M(key, opts) {
  if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial(opts);
  return mats[key];
}
// Kesme taş / mermer (gece projektörlü)
function SM(key, hex, flood = 0.32) {
  if (!mats[key]) { const c = new THREE.Color(hex); c.multiplyScalar(1.05); mats[key] = floodMaterial(ashlarPBR(), { color: c, scale: 0.55, flood, floodTop: 70 }); }
  return mats[key];
}
function MM(key, hex = 0xf4f0e8) {
  if (!mats[key]) mats[key] = floodMaterial(plasterPBR(), { color: hex, scale: 0.4, rough: 0.7, flood: 0.3, floodTop: 40 });
  return mats[key];
}
function LEAD() { if (!mats.lead2) mats.lead2 = pbrMaterial(leadPBR(), { color: 0xc4cad0, scale: 0.45, rough: 0.6, metal: 0.12, wetK: 0.5 }); return mats.lead2; }
function WIN() { if (!mats.win2) mats.win2 = nightGlowMaterial(0x1a1f26, 0xffc070, 1.25); return mats.win2; }
function GOLD() { return M('gold', { color: 0xd4af37, metalness: 0.9, roughness: 0.3 }); }
function LAMP() { if (!mats.lamp) mats.lamp = ledMaterial('warm'); return mats.lamp; }

// Simge yapı grubunu malzemeye göre birleştir (yüzlerce mesh yerine birkaç çizim çağrısı)
function mergeByMaterial(g) {
  g.updateMatrixWorld(true);
  const buckets = new Map(), keep = [];
  for (const o of g.children) {
    if (!o.isMesh || o.isInstancedMesh || o.userData.flag) { keep.push(o); continue; }
    let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const key = o.material.uuid + (o.castShadow ? 's' : '');
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, shadow: o.castShadow, list: [] });
    buckets.get(key).list.push(geo);
  }
  g.clear();
  for (const o of keep) g.add(o);
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(b.list), b.mat);
    m.castShadow = b.shadow; m.receiveShadow = true;
    if (b.mat.userData && b.mat.userData.tick) m.onBeforeRender = () => b.mat.userData.tick();
    g.add(m);
  }
  return g;
}

export const landmarkDoors = [];

function add(g, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  g.add(m);
  return m;
}
// Kemerli pencere geometrisi (+z'ye bakar): dikdörtgen gövde + yarım daire tepe
function archGeo(w, h, d) {
  const r = w / 2, hb = Math.max(0.05, h - r);
  const a = new THREE.BoxGeometry(w, hb, d); a.translate(0, hb / 2, 0);
  const t = new THREE.CylinderGeometry(r, r, d, 10, 1, false, Math.PI / 2, Math.PI); t.rotateX(Math.PI / 2); t.translate(0, hb, 0);
  return mergeGeometries([a.toNonIndexed(), t.toNonIndexed()].map((x) => { x.deleteAttribute('uv'); return x; }));
}
// (x,z) noktasına, dışa doğru normal açısı a (xz'de (cos a, sin a)) olan bir duvar parçası yerleştir
function place(g, geo, mat, x, y, z, a, shadow = false) { const m = add(g, geo, mat, x, y, z, shadow); m.rotation.y = Math.PI / 2 - a; return m; }
// Düz duvar boyunca kemerli pencere sırası
function windowRow(g, cx, cz, half, side, y, n, w, h, axisX) {
  const geo = archGeo(w, h, 0.2), win = WIN();
  for (let i = 0; i < n; i++) {
    const t = -half + ((i + 0.5) / n) * half * 2;
    if (axisX) place(g, geo, win, cx + t, y, cz + side * (half + 0.05), side > 0 ? Math.PI / 2 : -Math.PI / 2);
    else place(g, geo, win, cx + side * (half + 0.05), y, cz + t, side > 0 ? 0 : Math.PI);
  }
}

// Kaburgalı kubbe: yarım küre (ya da basık, thetaMax<pi/2), meridyen kaburgaları, alem
function ribDome(g, cx, y0, cz, R, { ribs = 24, thetaMax = Math.PI / 2, mat = LEAD(), alem = true, ribK = 0.012 } = {}) {
  const Rs = R / Math.sin(thetaMax), cy = y0 - Rs * Math.cos(thetaMax);
  add(g, new THREE.SphereGeometry(Rs, 40, 14, 0, Math.PI * 2, 0, thetaMax), mat, cx, cy, cz);
  const rg = [];
  for (let i = 0; i < ribs; i++) {
    const phi = (i / ribs) * Math.PI * 2, pts = [];
    for (let k = 0; k <= 8; k++) { const th = thetaMax * (1 - k / 8) * 0.97; pts.push(new THREE.Vector3(Math.cos(phi) * Math.sin(th) * Rs * 1.006, Math.cos(th) * Rs * 1.006, Math.sin(phi) * Math.sin(th) * Rs * 1.006)); }
    const t = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, Math.max(0.05, R * ribK), 4); t.deleteAttribute('uv'); rg.push(t.toNonIndexed());
  }
  add(g, mergeGeometries(rg), mat, cx, cy, cz);
  const top = cy + Rs;
  if (alem) {
    add(g, new THREE.CylinderGeometry(0.06, 0.1, R * 0.12 + 0.8, 5), GOLD(), cx, top + (R * 0.12 + 0.8) / 2, cz, false);
    add(g, new THREE.SphereGeometry(0.22 + R * 0.012, 8, 6), GOLD(), cx, top + R * 0.06 + 0.3, cz, false);
    const cr = add(g, new THREE.TorusGeometry(0.35 + R * 0.015, 0.07, 5, 12, Math.PI * 1.4), GOLD(), cx, top + R * 0.12 + 1.1, cz, false);
    cr.rotation.z = Math.PI * 0.8;
  }
  return top;
}
// Pencereli kasnak (kubbe altı silindir), aralarda payandalar
function drum(g, mat, cx, y0, cz, R, h, n) {
  add(g, new THREE.CylinderGeometry(R * 1.02, R * 1.05, h, 40), mat, cx, y0 + h / 2, cz);
  const wgeo = archGeo(Math.min(1.6, (Math.PI * 2 * R) / n * 0.45), h * 0.72, 0.2), win = WIN();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    place(g, wgeo, win, cx + Math.cos(a) * R * 1.035, y0 + h * 0.12, cz + Math.sin(a) * R * 1.035, a);
    const b = (i + 0.5) / n * Math.PI * 2;
    place(g, new THREE.BoxGeometry(0.7, h * 0.95, 0.9), mat, cx + Math.cos(b) * R * 1.07, y0 + h * 0.48, cz + Math.sin(b) * R * 1.07, b, true);
  }
  // kasnak saçak silmesi
  add(g, new THREE.CylinderGeometry(R * 1.1, R * 1.06, 0.5, 40), mat, cx, y0 + h + 0.25, cz);
}
// Yarım kubbe: düz kesiti ana kubbeye bakar, yönü (dx,dz)
function semiDome(g, cx, y0, cz, r, dx, dz, mat = LEAD()) {
  const geo = new THREE.SphereGeometry(r, 24, 10, Math.PI / 2, Math.PI, 0, Math.PI / 2);
  const m = add(g, geo, mat, cx, y0, cz);
  m.rotation.y = Math.atan2(-dz, dx);
  // kemer (düz yüzü kapatan yay duvar)
  const arch = new THREE.CylinderGeometry(r, r, 0.6, 20, 1, false, Math.PI / 2, Math.PI);
  arch.rotateX(Math.PI / 2);
  const am = add(g, arch, SM('stoneLm', '#d8d0c0'), cx, y0, cz);
  am.rotation.y = Math.atan2(dx, dz);
  // küçük pencereler (yarım kubbe eteği)
  const win = WIN(), wg = archGeo(0.8, 1.6, 0.15);
  for (let i = 0; i < 5; i++) {
    const a = Math.atan2(dz, dx) + (i - 2) * 0.45;
    place(g, wg, win, cx + Math.cos(a) * r * 0.99, y0 + 0.2, cz + Math.sin(a) * r * 0.99, a);
  }
}

// Yivli minare: kare kaide, pabuç, 16 yivli gövde, şerefeler (konsollu balkon + korkuluk + kandil), petek, külah, alem
function minaret(g, cols, x, z, h, mat, r = 1.0, nSerefe = 3) {
  add(g, new THREE.BoxGeometry(r * 3, 5, r * 3), mat, x, 2.5, z);
  add(g, new THREE.CylinderGeometry(r * 1.15, r * 1.5, 3, 8), mat, x, 6.5, z);
  const shaft = new THREE.CylinderGeometry(r * 0.88, r * 1.02, h - 8, 16);
  // yivler: köşeleri dönüşümlü içe çek
  const p = shaft.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 - 0.04 * (0.5 + 0.5 * Math.cos(a * 16)); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  shaft.computeVertexNormals();
  add(g, shaft, mat, x, 8 + (h - 8) / 2, z);
  const lamp = LAMP();
  const fr = nSerefe === 3 ? [0.58, 0.76, 0.9] : nSerefe === 2 ? [0.68, 0.88] : [0.85];
  for (const f of fr) {
    const y = h * f;
    add(g, new THREE.CylinderGeometry(r * 1.65, r * 0.95, 1.4, 16), mat, x, y - 0.7, z); // mukarnas konsol
    add(g, new THREE.CylinderGeometry(r * 1.7, r * 1.7, 0.18, 16), mat, x, y + 0.05, z);
    add(g, new THREE.CylinderGeometry(r * 1.66, r * 1.66, 0.9, 16, 1, true), mat, x, y + 0.6, z, false); // korkuluk
    add(g, new THREE.TorusGeometry(r * 1.67, 0.08, 4, 20).rotateX(Math.PI / 2), lamp, x, y + 1.1, z, false); // kandiller
  }
  const topY = h * fr[fr.length - 1] + 1.0;
  add(g, new THREE.CylinderGeometry(r * 0.72, r * 0.8, h - topY + 1, 12), mat, x, (h + topY) / 2, z); // petek
  add(g, new THREE.ConeGeometry(r * 0.95, h * 0.2, 16), LEAD(), x, h + h * 0.1, z);
  add(g, new THREE.CylinderGeometry(0.05, 0.08, 2.4, 5), GOLD(), x, h + h * 0.2 + 1.2, z, false);
  add(g, new THREE.SphereGeometry(0.2, 8, 6), GOLD(), x, h + h * 0.2 + 0.6, z, false);
  cols.add(x - r * 1.5, z - r * 1.5, x + r * 1.5, z + r * 1.5, 0, h, 'minaret');
}

function mosque(g, cols, cx, cz, S, opt) {
  const wall = opt.wall;
  const H = S * 0.3;
  // kaide ve ana gövde
  add(g, new THREE.BoxGeometry(S + 3, 0.7, S + 3), wall, cx, 0.35, cz);
  add(g, new THREE.BoxGeometry(S, H, S), wall, cx, H / 2, cz);
  add(g, new THREE.BoxGeometry(S + 0.8, 0.6, S + 0.8), wall, cx, H - 0.1, cz); // saçak silmesi
  cols.add(cx - S / 2, cz - S / 2, cx + S / 2, cz + S / 2, 0, H + S * 0.3, 'mosque');
  // iki sıra kemerli pencere (alt sıra büyük, üst sıra küçük), dört cephe
  const n = Math.max(5, Math.round(S / 4.2));
  for (const side of [-1, 1]) for (const ax of [true, false]) {
    windowRow(g, cx, cz, S / 2, side, H * 0.14, n, 1.4, H * 0.28, ax);
    windowRow(g, cx, cz, S / 2, side, H * 0.56, n, 1.0, H * 0.22, ax);
  }
  // ana kubbe: kasnak + kaburgalı kurşun kubbe
  const R = opt.domeR || S * 0.26, dh = S * 0.07;
  drum(g, wall, cx, H, cz, R, dh, opt.drumN || 24);
  const top = ribDome(g, cx, H + dh + 0.5, cz, R, { thetaMax: opt.shallow ? Math.PI * 0.36 : Math.PI / 2, ribs: opt.ribs || 24 });
  void top;
  // ağırlık kuleleri (kubbe köşelerinde sekizgen kulecikler + kubbecik)
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = cx + dx * R * 0.92, z = cz + dz * R * 0.92;
    add(g, new THREE.CylinderGeometry(S * 0.035, S * 0.04, S * 0.1, 8), wall, x, H + S * 0.05, z);
    ribDome(g, x, H + S * 0.1, z, S * 0.035, { ribs: 8, alem: true });
  }
  // yarım kubbeler
  for (const [dx, dz] of opt.semi || [[1, 0], [-1, 0], [0, 1], [0, -1]]) semiDome(g, cx + dx * R * 0.98, H, cz + dz * R * 0.98, R * 0.92, dx, dz);
  // köşe kubbecikleri (eksedra kademesi)
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = cx + dx * S * 0.37, z = cz + dz * S * 0.37;
    add(g, new THREE.CylinderGeometry(S * 0.085, S * 0.085, S * 0.05, 16), wall, x, H + S * 0.025, z);
    ribDome(g, x, H + S * 0.05, z, S * 0.08, { ribs: 12 });
  }
  // revaklı avlu
  if (opt.courtyard) {
    const cz2 = cz + opt.courtyard * (S * 0.5 + S * 0.36);
    const cw = S * 0.9, cd = S * 0.66;
    for (const [w, d, x, z] of [[cw, 1.4, cx, cz2 + opt.courtyard * cd / 2], [1.4, cd, cx - cw / 2, cz2], [1.4, cd, cx + cw / 2, cz2]]) {
      add(g, new THREE.BoxGeometry(w, 6, d), wall, x, 3, z);
      cols.add(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, 6, 'wall');
    }
    // revak kubbecikleri ve sütunlar (üç kenar)
    const dg = 3.6;
    for (let i = 0; i < 9; i++) {
      const x = cx - cw / 2 + (cw / 9) * (i + 0.5), z = cz2 + opt.courtyard * (cd / 2 - dg / 2 - 0.7);
      ribDome(g, x, 6, z, dg * 0.48, { ribs: 8, alem: false });
      add(g, new THREE.CylinderGeometry(0.28, 0.32, 5.5, 10), wall, x, 2.75, z - opt.courtyard * dg / 2);
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) {
      const z = cz2 - cd / 2 + (cd / 5) * (i + 0.5), x = cx + sx * (cw / 2 - dg / 2 - 0.7);
      ribDome(g, x, 6, z, dg * 0.48, { ribs: 8, alem: false });
      add(g, new THREE.CylinderGeometry(0.28, 0.32, 5.5, 10), wall, x - sx * dg / 2, 2.75, z);
    }
    // şadırvan: sekizgen gövde, geniş saçak, kubbe
    add(g, new THREE.CylinderGeometry(2.6, 2.6, 2.6, 8), wall, cx, 1.3, cz2);
    add(g, new THREE.CylinderGeometry(4.0, 3.2, 0.5, 8), LEAD(), cx, 3.4, cz2);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(g, new THREE.CylinderGeometry(0.15, 0.15, 1.0, 6), wall, cx + Math.cos(a) * 3.1, 2.9, cz2 + Math.sin(a) * 3.1); }
    ribDome(g, cx, 3.65, cz2, 2.0, { ribs: 8 });
    cols.add(cx - 2.6, cz2 - 2.6, cx + 2.6, cz2 + 2.6, 0, 4, 'fountain');
  }
  // minareler
  const mh = opt.minaretH || S * 0.95;
  for (const [mx, mz, ns] of opt.minarets) minaret(g, cols, cx + mx * S, cz + mz * S, ns === 2 ? mh * 0.86 : mh, opt.minaretMat || wall, opt.minaretR || 1.1, ns || 3);
  // taç kapı (pişmaniye kemerli portal)
  const ds = opt.doorSide || 1;
  const doorZ = cz + ds * (S / 2 + 0.1);
  add(g, new THREE.BoxGeometry(7, 9, 1.2), wall, cx, 4.5, cz + ds * (S / 2 + 0.5));
  place(g, archGeo(3.2, 5.5, 0.3), M('mdoor', { color: 0x3a2412, roughness: 0.7 }), cx, 0, cz + ds * (S / 2 + 1.15), ds > 0 ? Math.PI / 2 : -Math.PI / 2);
  landmarkDoors.push({ x: cx, z: doorZ + ds * 1.6, type: 'mosque', name: opt.name });
}

// Dolmabahçe Sarayı (yerel koordinatta: uzun eksen x, cephe +z; çağıran döndürür)
function buildPalace(g, cols, W, D) {
  const cx = 0, cz = 0;
  // Dolmabahçe Sarayı: beyaz mermer neo-barok cephe, iki kat kemerli pencere, çift plasterler, korniş + balüstrad,
  // öne çıkan orta bölüm alınlığı, Muayede Salonu kubbesi, saat kulesi.
  const pw = W * 0.92, pd = Math.min(D * 0.5, 30), H = 16;
  const marble = MM('palace', 0xf6f2ea), lead = LEAD();
  add(g, new THREE.BoxGeometry(pw, H, pd), marble, cx, H / 2, cz);
  cols.add(cx - pw / 2, cz - pd / 2, cx + pw / 2, cz + pd / 2, 0, H, 'palace');
  add(g, new THREE.BoxGeometry(pw + 0.6, 0.7, pd + 0.6), marble, cx, 7.6, cz); // kat silmesi
  add(g, new THREE.BoxGeometry(pw + 1.4, 1.0, pd + 1.4), marble, cx, H + 0.4, cz); // korniş
  // balüstrad + vazolar
  const bal = [];
  for (let x = cx - pw / 2 + 1; x < cx + pw / 2; x += 0.9) for (const zz of [cz - pd / 2 - 0.4, cz + pd / 2 + 0.4]) bal.push(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 6).translate(x, H + 1.35, zz).toNonIndexed());
  for (const zz of [cz - pd / 2 - 0.4, cz + pd / 2 + 0.4]) bal.push(new THREE.BoxGeometry(pw, 0.2, 0.4).translate(cx, H + 1.9, zz).toNonIndexed());
  for (let x = cx - pw / 2 + 2; x < cx + pw / 2; x += 8) bal.push(new THREE.SphereGeometry(0.45, 8, 6).translate(x, H + 2.4, cz + pd / 2 + 0.4).toNonIndexed());
  add(g, mergeGeometries(bal.map((q) => { q.deleteAttribute('uv'); return q; })), marble, 0, 0, 0);
  // pencereler ve çift plasterler (ön ve arka cephe)
  const win = WIN(), w1 = archGeo(1.5, 3.6, 0.2), w2 = archGeo(1.4, 3.2, 0.2);
  const bays = Math.floor(pw / 4.2);
  for (let i = 0; i < bays; i++) {
    const x = cx - pw / 2 + (i + 0.5) * (pw / bays);
    for (const s of [-1, 1]) {
      const z = cz + s * (pd / 2 + 0.06), a = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      place(g, w1, win, x, 2.2, z, a); place(g, w2, win, x, 9.6, z, a);
      for (const o of [-1.45, -1.15]) add(g, new THREE.BoxGeometry(0.28, H - 1, 0.3), marble, x + o + (pw / bays) * 0, (H - 1) / 2 + 0.5, z + s * 0.12);
    }
  }
  // orta bölüm: öne çıkıntı, sütunlar, alınlık
  const cw = Math.min(30, pw * 0.25);
  add(g, new THREE.BoxGeometry(cw, H + 3, 3), marble, cx, (H + 3) / 2, cz + pd / 2 + 1.5);
  for (let i = 0; i < 8; i++) add(g, new THREE.CylinderGeometry(0.45, 0.5, H - 1, 12), marble, cx - cw / 2 + 1.6 + i * ((cw - 3.2) / 7), (H - 1) / 2 + 0.5, cz + pd / 2 + 3.4);
  add(g, new THREE.BoxGeometry(cw + 1, 1.2, 4), marble, cx, H + 3.6, cz + pd / 2 + 1.8);
  // Muayede Salonu kubbesi (kasnaklı, kaburgalı)
  const dR = Math.min(9, pd * 0.45);
  drum(g, marble, cx, H + 1, cz, dR, 3, 20);
  ribDome(g, cx, H + 4.5, cz, dR, { ribs: 24, mat: lead });
  // saat kulesi (neo-barok): kaide, saat kademesi (4 kadran), fener, külah
  const tx = cx - pw / 2 + 4, tz = cz + pd / 2 + 4;
  add(g, new THREE.BoxGeometry(5, 14, 5), marble, tx, 7, tz);
  add(g, new THREE.BoxGeometry(5.6, 0.6, 5.6), marble, tx, 14.3, tz);
  add(g, new THREE.BoxGeometry(4.4, 6, 4.4), marble, tx, 17.6, tz);
  const clock = nightGlowMaterial(0xf8f6ee, 0xfff4dc, 0.9, { rough: 0.5, metal: 0 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; place(g, new THREE.CylinderGeometry(1.5, 1.5, 0.15, 24).rotateX(Math.PI / 2), clock, tx + Math.cos(a) * 2.25, 18, tz + Math.sin(a) * 2.25, a); }
  add(g, new THREE.BoxGeometry(5.0, 0.5, 5.0), marble, tx, 20.85, tz);
  add(g, new THREE.CylinderGeometry(1.6, 1.9, 3.2, 8), marble, tx, 22.7, tz);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.39; place(g, archGeo(0.7, 1.8, 0.15), win, tx + Math.cos(a) * 1.75, 21.6, tz + Math.sin(a) * 1.75, a); }
  ribDome(g, tx, 24.3, tz, 1.9, { ribs: 8, mat: lead });
  windowRow(g, tx, tz, 2.5, 1, 4, 1, 1.2, 3, true);
  cols.add(tx - 2.5, tz - 2.5, tx + 2.5, tz + 2.5, 0, 26, 'clock');
  return { doorZ: pd / 2 + 4.2 };
}

export function buildLandmark(type, b, cols) {
  const g = new THREE.Group();
  const cx = b.cx, cz = b.cz;
  const W = b.x1 - b.x0, D = b.z1 - b.z0;
  const S = Math.min(W, D);
  const stone = SM('stoneLm', '#c9bba0');
  const white = MM('whiteLm');
  const lead = LEAD();
  switch (type) {
    case 'galata': {
      // meydan
      add(g, new THREE.CylinderGeometry(S * 0.45, S * 0.45, 0.15, 32), SM('cobble', '#8a7f6e', 0.1), cx, 0.07, cz, false);
      const R = 6.5;
      const gs = SM('galataStone', '#b9ab92', 0.45);
      // kaide, gövde (taş sıraları dokudan), kat silmeleri
      add(g, new THREE.CylinderGeometry(R + 0.7, R + 0.9, 4, 32), gs, cx, 2, cz);
      add(g, new THREE.CylinderGeometry(R, R + 0.25, 42, 32), gs, cx, 25, cz);
      for (const y of [12, 24, 36]) add(g, new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.35, 32), gs, cx, y, cz);
      // kemerli pencereler (katlara dağılmış, sıralar kaydırılmış)
      const wg = archGeo(0.9, 2.0, 0.25), win = WIN();
      for (let k = 0; k < 6; k++) for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + k * 0.52;
        place(g, wg, win, cx + Math.cos(a) * (R + 0.1), 7 + k * 6, cz + Math.sin(a) * (R + 0.1), a);
      }
      // konsollu balkon: taş konsollar (mahfuz), balkon tablası 46..47.1 (main.js teras çarpışması ile uyumlu)
      for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; place(g, new THREE.BoxGeometry(0.45, 1.6, 1.1), gs, cx + Math.cos(a) * (R + 0.5), 44.6, cz + Math.sin(a) * (R + 0.5), a, true); }
      add(g, new THREE.CylinderGeometry(R + 1.3, R + 0.4, 1.1, 32), gs, cx, 46.55, cz);
      add(g, new THREE.CylinderGeometry(R + 1.25, R + 1.25, 0.9, 32, 1, true), M('galRail', { color: 0x2a2a2a, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }), cx, 47.55, cz, false);
      // seyir galerisi: 16 kemer, sütunlar ve kemer üstü duvar halkası
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        add(g, new THREE.CylinderGeometry(0.22, 0.26, 2.9, 8), gs, cx + Math.cos(a) * (R + 0.55), 48.55, cz + Math.sin(a) * (R + 0.55));
        const b2 = a + Math.PI / 16;
        const arc = new THREE.TorusGeometry(1.3, 0.22, 4, 8, Math.PI);
        place(g, arc, gs, cx + Math.cos(b2) * (R + 0.55), 50.0, cz + Math.sin(b2) * (R + 0.55), b2, true);
      }
      add(g, new THREE.CylinderGeometry(R + 0.85, R + 0.85, 1.0, 32, 1, true), gs, cx, 50.9, cz);
      add(g, new THREE.CylinderGeometry(R + 1.0, R + 0.85, 0.35, 32), gs, cx, 51.5, cz);
      add(g, new THREE.CylinderGeometry(R - 0.3, R - 0.3, 3.2, 24), win, cx, 48.9, cz, false); // iç cam (gece yanar)
      // külah: kurşun konik çatı + küçük çatı pencereleri + alem
      add(g, new THREE.ConeGeometry(R + 0.95, 14, 32), lead, cx, 58.6, cz);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; place(g, new THREE.BoxGeometry(0.9, 1.3, 0.9), lead, cx + Math.cos(a) * (R - 1.4), 54.6, cz + Math.sin(a) * (R - 1.4), a, true); }
      add(g, new THREE.CylinderGeometry(0.07, 0.1, 3, 5), GOLD(), cx, 67, cz, false);
      add(g, new THREE.SphereGeometry(0.28, 8, 6), GOLD(), cx, 66.2, cz, false);
      // kapı
      place(g, archGeo(2.4, 3.6, 0.4), M('mdoor', { color: 0x3a2412 }), cx, 0, cz + R + 0.55, Math.PI / 2);
      cols.add(cx - R, cz - R, cx + R, cz + R, 0, 66, 'galata');
      landmarkDoors.push({ x: cx, z: cz + R + 1.5, type: 'tower', name: 'Galata Kulesi' });
      break;
    }
    case 'taksim': {
      add(g, new THREE.BoxGeometry(W, 0.12, D), SM('taksimFloor', '#b0a796', 0.05), cx, 0.06, cz, false);
      // Cumhuriyet Anıtı (soyut)
      add(g, new THREE.BoxGeometry(8, 1.2, 8), stone, cx, 0.6, cz);
      add(g, new THREE.BoxGeometry(5, 9, 5), white, cx, 5.7, cz);
      add(g, new THREE.BoxGeometry(6, 1, 6), stone, cx, 10.7, cz);
      cols.add(cx - 4, cz - 4, cx + 4, cz + 4, 0, 11, 'monument');
      add(g, new THREE.CylinderGeometry(0.15, 0.2, 24, 8), M('pole', { color: 0xdddddd, metalness: 0.7 }), cx + 18, 12, cz - 12);
      const flag = add(g, new THREE.PlaneGeometry(9, 6), M('flag', { map: flagTexture(), side: THREE.DoubleSide }), cx + 22.6, 20.5, cz - 12, false);
      flag.userData.flag = true;
      g.userData.flag = flag;
      cols.add(cx + 17.8, cz - 12.2, cx + 18.2, cz - 11.8, 0, 24, 'pole');
      const akmW = W * 0.8;
      add(g, new THREE.BoxGeometry(akmW, 14, 12), M('akm', { color: 0x2b2b2b, roughness: 0.4, metalness: 0.4 }), cx, 7, b.z0 + 7);
      add(g, new THREE.BoxGeometry(akmW * 0.98, 10, 0.2), nightGlowMaterial(0x223344, 0xffd8a0, 0.9), cx, 7, b.z0 + 13.1, false);
      cols.add(cx - akmW / 2, b.z0 + 1, cx + akmW / 2, b.z0 + 13, 0, 14, 'akm');
      break;
    }
    case 'bluemosque':
      mosque(g, cols, cx, cz - D * 0.12, S * 0.62, {
        wall: SM('bmWall', '#ddd6c8', 0.4), drumN: 28,
        minarets: [[0.62, 0.62, 3], [-0.62, 0.62, 3], [0.62, -0.62, 3], [-0.62, -0.62, 3], [0.62, 1.55, 2], [-0.62, 1.55, 2]], courtyard: 1, doorSide: -1, name: 'Sultanahmet Camii', minaretH: 64,
      });
      break;
    case 'suleymaniye':
      mosque(g, cols, cx, cz, S * 0.66, {
        wall: SM('sWall', '#e2dacb', 0.4), semi: [[0, 1], [0, -1]], drumN: 32,
        minarets: [[0.62, 0.62, 3], [-0.62, 0.62, 3], [0.62, -0.62, 2], [-0.62, -0.62, 2]], doorSide: 1, name: 'Süleymaniye Camii', minaretH: 62,
      });
      break;
    case 'mihrimah':
      mosque(g, cols, cx, cz, S * 0.5, {
        wall: SM('mWall', '#d9d0bc', 0.38), drumN: 20,
        minarets: [[0.6, -0.6, 1], [-0.6, -0.6, 1]], doorSide: -1, semi: [[0, 1]], name: 'Mihrimah Sultan Camii', minaretH: 40,
      });
      break;
    case 'ayasofya': {
      const pink = SM('aya', '#c99a7c', 0.42);
      const SS = S * 0.64;
      mosque(g, cols, cx, cz, SS, {
        wall: pink, shallow: true, domeR: SS * 0.3, drumN: 40, ribs: 40, semi: [[1, 0], [-1, 0]], doorSide: 1, name: 'Ayasofya', minaretH: 52, minaretR: 1.25,
        minarets: [[0.6, 0.6, 1], [-0.6, 0.6, 1], [0.6, -0.6, 2], [-0.6, -0.6, 1]], minaretMat: SM('ayaMin', '#e6dccc', 0.4),
      });
      // devasa payandalar (kuzey-güney cephelerde) ve kırmızı tuğla minare kaidesi
      for (const sx of [-1, 1]) for (const sz of [-0.3, 0.3]) {
        add(g, new THREE.BoxGeometry(4, 18, 7), pink, cx + sx * SS * 0.33, 9, cz + sz * SS * 1.08);
        add(g, new THREE.BoxGeometry(4.4, 1.2, 7.6), pink, cx + sx * SS * 0.33, 18.4, cz + sz * SS * 1.08);
      }
      add(g, new THREE.BoxGeometry(4.2, 9, 4.2), pbrMaterial(brickPBR(), { color: 0xb8705a, scale: 0.6 }), cx + 0.6 * SS, 4.5, cz - 0.6 * SS);
      break;
    }
    case 'bazaar': {
      // Kapalıçarşı: kubbeli uzun çarşı
      const bw = W * 0.9, bd = D * 0.75;
      const wall = SM('bzWall', '#d2b48c', 0.25);
      add(g, new THREE.BoxGeometry(bw, 8, bd), wall, cx, 4, cz);
      cols.add(cx - bw / 2, cz - bd / 2, cx + bw / 2, cz + bd / 2, 0, 8, b);
      const nx = Math.floor(bw / 8), nz = Math.floor(bd / 8);
      const domes = [];
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) domes.push([cx - bw / 2 + (i + 0.5) * (bw / nx), cz - bd / 2 + (j + 0.5) * (bd / nz)]);
      const dg = new THREE.SphereGeometry(3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const im = new THREE.InstancedMesh(dg, lead, domes.length);
      const m = new THREE.Matrix4();
      domes.forEach(([x, z], i) => { m.makeTranslation(x, 8, z); im.setMatrixAt(i, m); });
      im.castShadow = true;
      g.add(im);
      windowRow(g, cx, cz, bd / 2, 1, 1.2, Math.floor(bw / 5), 1.2, 2.4, true);
      add(g, new THREE.BoxGeometry(8, 10, 2), MM('bzGate'), cx, 5, cz + bd / 2 + 0.5);
      place(g, archGeo(3.2, 5, 0.3), M('mdoor', { color: 0x3a2412 }), cx, 0, cz + bd / 2 + 1.6, Math.PI / 2);
      landmarkDoors.push({ x: cx, z: cz + bd / 2 + 2.6, type: 'bazaar', name: 'Kapalıçarşı' });
      break;
    }
    case 'dolmabahce': {
      // saray Boğaz kıyısı boyunca (z ekseni) uzanır, cephesi suya (+x) bakar
      const sub = new THREE.Group();
      const lc = { add: (x0, z0, x1, z1, y0, y1, tag) => cols.add(cx + Math.min(z0, z1), cz - Math.max(x0, x1), cx + Math.max(z0, z1), cz - Math.min(x0, x1), y0, y1, tag) };
      const r = buildPalace(sub, lc, D, W);
      sub.rotation.y = Math.PI / 2; sub.position.set(cx, 0, cz); sub.updateMatrixWorld(true);
      for (const o of [...sub.children]) { o.applyMatrix4(sub.matrixWorld); g.add(o); }
      landmarkDoors.push({ x: cx + r.doorZ, z: cz, type: 'palace', name: 'Dolmabahçe Sarayı' });
      break;
    }
    case 'haydarpasa': {
      const hw = W * 0.8, hd = 22;
      const brick = SM('hay', '#c8a888', 0.3);
      add(g, new THREE.BoxGeometry(hw, 18, hd), brick, cx, 9, cz);
      cols.add(cx - hw / 2, cz - hd / 2, cx + hw / 2, cz + hd / 2, 0, 18, 'station');
      for (const sx of [-1, 1]) {
        add(g, new THREE.CylinderGeometry(4, 4, 26, 16), brick, cx + sx * hw / 2, 13, cz - hd / 2);
        add(g, new THREE.ConeGeometry(4.4, 9, 16), lead, cx + sx * hw / 2, 30.5, cz - hd / 2);
        cols.add(cx + sx * hw / 2 - 4, cz - hd / 2 - 4, cx + sx * hw / 2 + 4, cz - hd / 2 + 4, 0, 26, 'station');
      }
      add(g, new THREE.BoxGeometry(hw * 0.98, 1.4, hd * 1.05), M('hroof', { color: 0x5a6e78, metalness: 0.4 }), cx, 18.6, cz);
      for (const s of [-1, 1]) { windowRow(g, cx, cz, hd / 2, s, 3, Math.floor(hw / 4), 1.6, 4, true); windowRow(g, cx, cz, hd / 2, s, 10.5, Math.floor(hw / 4), 1.4, 3.6, true); }
      landmarkDoors.push({ x: cx, z: cz + hd / 2 + 1, type: 'station', name: 'Haydarpaşa Garı' });
      break;
    }
    case 'stadium': {
      const R = S * 0.45;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.9, 18, 40, 1, true), M('stad', { color: 0xf0c000, roughness: 0.6, side: THREE.DoubleSide }));
      ring.position.set(cx, 9, cz); ring.castShadow = true; g.add(ring);
      const pitch = new THREE.Mesh(new THREE.PlaneGeometry(R * 1.1, R * 0.7), M('pitch', { color: 0x2f7a2f }));
      pitch.rotation.x = -Math.PI / 2; pitch.position.set(cx, 0.05, cz); g.add(pitch);
      for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95 - i * 3, R * 0.95 - i * 3, 1.5, 40, 1, true), M('seats', { color: 0x1d3d8e, side: THREE.DoubleSide }));
        t.position.set(cx, 3 + i * 3.5, cz); g.add(t);
      }
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
        cols.add(x - 4, z - 4, x + 4, z + 4, 0, 18, 'stadium');
      }
      break;
    }
    default:
      return null;
  }
  return mergeByMaterial(g);
}
