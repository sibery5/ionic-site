// Deniz trafiği: Şehir Hatları vapurları (Eminönü–Kadıköy–Üsküdar–Beşiktaş, iskelede bekleme), Boğaz'dan geçen
// konteyner gemileri ve tankerler, Marmara'da açık deniz gemileri, balıkçı tekneleri ve lüks yatlar.
// Ayrıntılı prosedürel modeller: yüksek çözünürlüklü gövde (bayraklı pruva, soğan baş, ayna kıç, renk bantları,
// usturmaça), çok katlı üst yapılar, pencere sıraları (gece yanar), oluklu konteynerler, tanker boru ağı ve
// köprüsü, vinçler, direkler ve seyir fenerleri. Her gemi 3-4 çizim çağrısı.
//
// Köprü: 15 Temmuz Köprüsü tabliyesi yükseltildi (bridge_profile.js); büyük gemiler köprünün ortasındaki iki
// şeritten (x≈301 ve x≈324) altından geçerek Karadeniz ile Marmara arasında akar. DECK_TOP < 15 ise eski
// davranış (köprü önünde U dönüşü) kullanılır. Gemi konumları deniz şaderine (OCEAN.uShipP/D) gönderilir:
// gövde köpüğü ve Kelvin dümen suyu.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lightize, makeLightsMat } from '../entities/vehicles.js';
import { Wakes } from '../entities/boats.js';
import { isLand, WATER_Y, ISLAND } from './map.js';
import { clamp, angleDiff, RNG } from '../core/util.js';
import { signTexture, containerTexture } from '../core/textures.js';
import { OCEAN, MAX_SHIPS, nightGlowMaterial, oceanObstacle } from './shaders.js';
import { DECK_TOP } from './bridge_profile.js';

const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 });
const winMat = nightGlowMaterial(0x161c22, 0xffd890, 1.5, { rough: 0.12, metal: 0.5 });
const boxMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: containerTexture(), roughness: 0.6, metalness: 0.25 });
const navMat = makeLightsMat();

// İskeleler (yanaşma noktası ve yön)
export const PIERS = {
  eminonu: { name: 'Eminönü', x: -95, z: 183.5, h: Math.PI / 2, side: 'z+' },
  karakoy: { name: 'Karaköy', x: -70, z: 76.5, h: -Math.PI / 2, side: 'z-' },
  kadikoy: { name: 'Kadıköy', x: 413.5, z: 548, h: 0, side: 'x+' },
  uskudar: { name: 'Üsküdar', x: 413.5, z: -40, h: Math.PI, side: 'x+' },
  besiktas: { name: 'Beşiktaş', x: 206.5, z: -385, h: Math.PI, side: 'x-' },
};
// Vapur hatları: iskele → ara noktalar → iskele (ileri-geri)
const FERRY_LINES = [
  ['eminonu', [-20, 140], [150, 135], [235, 205], [330, 420], [395, 520], 'kadikoy'],
  ['eminonu', [-20, 140], [150, 120], [300, 40], [392, -20], 'uskudar'],
  ['besiktas', [255, -340], [355, -120], [395, -60], 'uskudar', [380, 60], [372, 300], [398, 510], 'kadikoy'],
  ['karakoy', [40, 110], [235, 180], [330, 400], [395, 525], 'kadikoy'],
];

// ---------------- geometri yardımcıları ----------------
const _c = new THREE.Color();
function vc(g, hex, keepUV = false) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUV && k === 'uv')) n.deleteAttribute(k);
  _c.set(hex);
  const a = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = _c.r; a[i + 1] = _c.g; a[i + 2] = _c.b; }
  n.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return n;
}
const B3 = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const CY = (rt, rb, h, seg, x, y, z, axis) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2); return g.translate(x, y, z); };
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
function rod(ax, ay, az, bx, by, bz, r, seg = 4) {
  _d.set(bx - ax, by - ay, bz - az); const L = _d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  _q.setFromUnitVectors(_up, _d.normalize()); g.applyQuaternion(_q);
  return g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
}
// Korkuluk: üst ve orta tirizli dikme sırası (x sabit, z aralığı) ya da (z sabit, x aralığı)
function railing(P, col, x0, z0, x1, z1, y, h = 1.0, step = 1.6) {
  P.push(vc(rod(x0, y + h, z0, x1, y + h, z1, 0.035), col), vc(rod(x0, y + h * 0.5, z0, x1, y + h * 0.5, z1, 0.025), col));
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / step));
  for (let i = 0; i <= n; i++) { const t = i / n; P.push(vc(B3(0.05, h, 0.05, x0 + (x1 - x0) * t, y + h / 2, z0 + (z1 - z0) * t), col)); }
}
// Pencere sırası (yan duvar x=±xs boyunca z'de)
function winRow(W, xs, y, z0, z1, n, w, h) {
  const pitch = (z1 - z0) / n;
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) W.push(B3(0.06, h, w, s * xs, y, z0 + pitch * (i + 0.5)));
}
function winRowX(W, zs, y, x0, x1, n, w, h) {
  const pitch = (x1 - x0) / n;
  for (let i = 0; i < n; i++) W.push(B3(w, h, 0.06, x0 + pitch * (i + 0.5), y, zs));
}

// Ayrıntılı gövde: istasyon kesitleri (düz taban, sintine yarıçapı, dikey borda), pruvada omurga yükselir ve
// borda dışa açılır (bayrak), kıçta ayna. Su hattı y=0. Renk bantları: zehirli boya (kırmızı), su hattı bandı
// (siyah), borda rengi, isteğe bağlı üst şerit.
function shipHull({ L, B, D, F, bow = 0.22, stern = 0.85, run = 0.12, flare = 0.15, sheer = 0.25, bulb = 0, cBottom = 0x8a1e16, cBoot = 0x141414, cTop = 0x1d3d6e, cStripe = null, nL = 44, double = false }) {
  const hb = B / 2;
  const width = (u) => {
    let w = 1;
    const ub = double ? Math.min(u, 1 - u) : u;
    if (!double && u < 0.18) w = stern + (1 - stern) * Math.sin((u / 0.18) * Math.PI / 2);
    if (u > 1 - bow) { const t = (u - (1 - bow)) / bow; w = Math.min(w, Math.sqrt(Math.max(0, 1 - t * t))); }
    if (double && ub < bow) { const t = (bow - ub) / bow; w = Math.sqrt(Math.max(0, 1 - t * t)); }
    return Math.max(w, 0.015);
  };
  const keelY = (u) => {
    let k = -D;
    if (u > 1 - bow * 0.6) k = -D * (1 - Math.pow((u - (1 - bow * 0.6)) / (bow * 0.6), 2) * 0.55);
    if (!double && u < run) k = -D * (0.35 + 0.65 * (u / run));
    if (double && u < bow * 0.6) k = -D * (1 - Math.pow((bow * 0.6 - u) / (bow * 0.6), 2) * 0.55);
    return k;
  };
  const deckY = (u) => F + (u > 0.72 ? Math.pow((u - 0.72) / 0.28, 2) * F * sheer : 0) + (u < 0.1 ? (0.1 - u) * F * sheer * 0.6 : 0);
  // kesit noktaları (orta hattan güverteye) : [x oranı, y] ; y'ler gerçek değer
  const prof = (u) => {
    const w = width(u), ky = keelY(u), dy = deckY(u), r = Math.min(D * 0.45, hb * 0.35);
    const pts = [];
    pts.push([0, ky]);
    pts.push([Math.max(0, hb * w - r) , ky]);
    for (let j = 1; j <= 4; j++) { const a = -Math.PI / 2 + (j / 4) * (Math.PI / 2); pts.push([Math.max(0, hb * w - r) + r * Math.cos(a) * Math.min(1, w * 2), ky + r + r * Math.sin(a)]); }
    const ys = [-0.6, -0.27, -0.23, 0.38, 0.42, dy - 0.45, dy - 0.38, dy];
    for (const y of ys) if (y > ky + r + 0.01) {
      const t = clamp((y + D) / (D + F), 0, 1);
      const fl = 1 + flare * Math.pow(clamp((u - 0.6) / 0.4, 0, 1), 1.5) * t * (double ? 0 : 1);
      pts.push([Math.min(hb * 1.02, hb * w * fl * (1 + 0.02 * t)), y]);
    }
    return pts;
  };
  const colAt = (y, dy) => (y < -0.25 ? cBottom : y < 0.4 ? cBoot : cStripe !== null && y > dy - 0.42 ? cStripe : cTop);
  const rows = [];
  for (let i = 0; i <= nL; i++) { const u = i / nL; rows.push({ z: -L / 2 + u * L, pts: prof(u), dy: deckY(u) }); }
  const M = Math.max(...rows.map((r) => r.pts.length));
  // tüm satırlar aynı nokta sayısına: eksikse son noktayı tekrarla
  for (const r of rows) while (r.pts.length < M) r.pts.push(r.pts[r.pts.length - 1]);
  const pos = [], col = [], idx = [];
  const C = new THREE.Color();
  for (const r of rows) {
    // sol borda (güverteden omurgaya) + sağ borda (omurgadan güverteye)
    for (let j = M - 1; j >= 0; j--) { const [x, y] = r.pts[j]; pos.push(-x, y, r.z); C.set(colAt(y, r.dy)); col.push(C.r, C.g, C.b); }
    for (let j = 1; j < M; j++) { const [x, y] = r.pts[j]; pos.push(x, y, r.z); C.set(colAt(y, r.dy)); col.push(C.r, C.g, C.b); }
  }
  const W = 2 * M - 1;
  for (let i = 0; i < nL; i++) for (let j = 0; j < W - 1; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // ayna kıç kapağı (yelpaze)
  if (!double) {
    const base = pos.length / 3, r0 = rows[0];
    const cy = (r0.pts[0][1] + r0.dy) / 2;
    for (let j = 0; j < W; j++) { pos.push(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]); C.set(colAt(pos[j * 3 + 1], r0.dy)); col.push(C.r, C.g, C.b); }
    pos.push(0, cy, -L / 2); C.set(cTop); col.push(C.r, C.g, C.b);
    for (let j = 0; j < W - 1; j++) idx.push(base + W, base + j, base + j + 1);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g = g.toNonIndexed(); g.computeVertexNormals();
  const parts = [g];
  if (bulb > 0) parts.push(vc(new THREE.SphereGeometry(1, 12, 8).scale(hb * 0.32, D * 0.32, bulb).translate(0, -D * 0.62, L / 2 - bulb * 0.55), cBottom));
  // güverte örtüsü
  const s = new THREE.Shape();
  const half = rows.map((r) => [r.z, r.pts[r.pts.length - 1][0] * 0.985, r.dy - 0.03]);
  s.moveTo(half[0][1], half[0][0]);
  for (const h of half) s.lineTo(h[1], h[0]);
  for (let i = half.length - 1; i >= 0; i--) s.lineTo(-half[i][1], half[i][0]);
  const dg = new THREE.ShapeGeometry(s); dg.rotateX(Math.PI / 2);
  const dp = dg.attributes.position;
  for (let i = 0; i < dp.count; i++) { const z = dp.getZ(i), u = clamp((z + L / 2) / L, 0, 1); dp.setY(i, deckY(u) - 0.03); }
  const ix = dg.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
  dg.computeVertexNormals();
  return { parts, deck: dg, deckY, width: (u) => width(u) * hb };
}

// ---------------- Modeller ----------------
// Şehir Hatları vapuru: çift başlı (iki yöne giden) gövde, siyah usturmaça bandı, iki kapalı yolcu salonu,
// açık üst güverte, iki uçta kaptan köşkü, sarı-siyah baca, cankurtaran salları, bayrak.
function buildFerry() {
  const L = 52, B = 11;
  const H = shipHull({ L, B, D: 2.0, F: 2.4, bow: 0.2, double: true, flare: 0, sheer: 0.18, cBottom: 0x7a1a14, cBoot: 0x111111, cTop: 0xf2f0ea, cStripe: 0x111111 });
  const P = [...H.parts], W = [], N = [];
  P.push(vc(H.deck, 0x8a7a64));
  const dy = 2.4, wht = 0xf2f0ea, dark = 0x2a2a2a;
  // usturmaça (siyah lastik bant) güverte seviyesinde
  for (const s of [-1, 1]) P.push(vc(rod(s * (B / 2 + 0.05), dy - 0.15, -L * 0.36, s * (B / 2 + 0.05), dy - 0.15, L * 0.36, 0.22, 6), 0x0e0e0e));
  // ana salon
  P.push(vc(B3(B * 0.9, 2.7, L * 0.74, 0, dy + 1.35, 0), wht));
  P.push(vc(B3(B * 0.94, 0.15, L * 0.78, 0, dy + 2.78, 0), dark));
  winRow(W, B * 0.45 + 0.01, dy + 1.55, -L * 0.35, L * 0.35, 16, 1.6, 1.15);
  for (const zz of [-1, 1]) winRowX(W, zz * (L * 0.37 + 0.01), dy + 1.55, -B * 0.4, B * 0.4, 5, 1.3, 1.1);
  // üst salon
  const y2 = dy + 2.85;
  P.push(vc(B3(B * 0.76, 2.4, L * 0.52, 0, y2 + 1.2, -L * 0.02), wht));
  P.push(vc(B3(B * 0.8, 0.14, L * 0.56, 0, y2 + 2.47, -L * 0.02), dark));
  winRow(W, B * 0.38 + 0.01, y2 + 1.35, -L * 0.27, L * 0.23, 12, 1.5, 1.0);
  // açık güverte korkulukları ve banklar
  for (const s of [-1, 1]) {
    railing(P, 0x3a3a3a, s * B * 0.46, -L * 0.38, s * B * 0.46, L * 0.38, y2 - 0.05, 1.0, 1.4);
    railing(P, 0x3a3a3a, s * B * 0.4, -L * 0.3, s * B * 0.4, L * 0.27, y2 + 2.52, 0.9, 1.6);
    for (let i = 0; i < 4; i++) P.push(vc(B3(0.5, 0.45, 2.2, s * B * 0.3, y2 + 0.23, L * 0.29 + (i - 1.5) * 0.01 + (s > 0 ? 0 : 0) - 0.0), 0x6a4a2a));
  }
  for (const zz of [-1, 1]) railing(P, 0x3a3a3a, -B * 0.44, zz * L * 0.38, B * 0.44, zz * L * 0.38, y2 - 0.05, 1.0, 1.4);
  // cankurtaran sal kapsülleri (beyaz silindirler) ve turuncu simitler
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) P.push(vc(CY(0.42, 0.42, 1.4, 10, s * B * 0.31, y2 + 2.95, -L * 0.18 + i * 3.2, 'z'), 0xf8f8f8));
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) P.push(vc(new THREE.TorusGeometry(0.32, 0.08, 6, 12).rotateY(Math.PI / 2).translate(s * (B * 0.451 + 0.06), dy + 2.3, -L * 0.25 + i * L * 0.25), 0xff6a10));
  // iki uçta kaptan köşkü
  for (const zz of [-1, 1]) {
    P.push(vc(B3(B * 0.46, 1.6, 2.8, 0, y2 + 3.35, zz * L * 0.19), wht));
    P.push(vc(B3(B * 0.5, 0.12, 3.1, 0, y2 + 4.2, zz * L * 0.19), dark));
    W.push(B3(B * 0.42, 0.75, 0.06, 0, y2 + 3.5, zz * (L * 0.19 + 1.41)));
    for (const s of [-1, 1]) W.push(B3(0.06, 0.75, 2.2, s * B * 0.231, y2 + 3.5, zz * L * 0.19));
    P.push(vc(CY(0.05, 0.05, 2.6, 5, 0, y2 + 5.4, zz * L * 0.19), 0x333333));
    N.push(lightize(new THREE.SphereGeometry(0.16, 8, 6).translate(0, y2 + 6.7, zz * L * 0.19), 0xdddddd, 0xffffff, 0));
  }
  // baca: krem-sarı gövde, siyah tepe, ince kırmızı şerit
  P.push(vc(CY(1.05, 1.25, 3.4, 16, 0, y2 + 4.1, -L * 0.04), 0xe8a020));
  P.push(vc(CY(1.07, 1.07, 0.9, 16, 0, y2 + 6.2, -L * 0.04), 0x111111));
  P.push(vc(CY(1.09, 1.09, 0.18, 16, 0, y2 + 5.55, -L * 0.04), 0xb01010));
  // bayrak direği + bayrak
  P.push(vc(CY(0.04, 0.04, 3.2, 5, 0, y2 + 4.1, -L * 0.33), 0xdddddd));
  P.push(vc(B3(0.03, 0.9, 1.4, 0, y2 + 5.2, -L * 0.33 - 0.7), 0xc8102e));
  // borda ışıkları
  N.push(lightize(new THREE.SphereGeometry(0.2, 8, 6).translate(B * 0.47, dy + 3.0, L * 0.3), 0x501010, 0xff2020, 0));
  N.push(lightize(new THREE.SphereGeometry(0.2, 8, 6).translate(-B * 0.47, dy + 3.0, L * 0.3), 0x105010, 0x20ff40, 0));
  // güverte lambaları (gece)
  for (let i = 0; i < 6; i++) N.push(lightize(new THREE.SphereGeometry(0.12, 6, 4).translate((i % 2 ? 1 : -1) * B * 0.38, y2 + 2.35, -L * 0.25 + i * 4), 0xeeeeee, 0xffe0b0, 0));
  const g = finish(P, W, N);
  const sign = new THREE.MeshBasicMaterial({ map: signTexture('ŞEHİR HATLARI', '#f2f0ea', '#1d3d6e', 512, 96) });
  const sg = mergeGeometries([new THREE.PlaneGeometry(7, 1.0).rotateY(Math.PI / 2).translate(B * 0.45 + 0.03, dy + 3.4, 0), new THREE.PlaneGeometry(7, 1.0).rotateY(-Math.PI / 2).translate(-B * 0.45 - 0.03, dy + 3.4, 0)]);
  g.add(new THREE.Mesh(sg, sign));
  return { g, L, B, kind: 'ferry' };
}

// Konteyner gemisi: soğan baş, baş kasarası ve dalgakıran, 9 sıra oluklu konteyner istifi, bağlama köprüleri,
// kıçta 5 katlı yaşam mahalli + köprüüstü kanatları, radar direği, şirket renkli baca. (yükseklik < 16.5 m)
function buildCargo(rng) {
  const L = 96, B = 16;
  const top = rng.pick([0x1d3d6e, 0x2a4a2a, 0x7a1a1a, 0x22303a, 0x16508a]);
  const H = shipHull({ L, B, D: 5.2, F: 4.6, bow: 0.2, stern: 0.82, flare: 0.22, sheer: 0.35, bulb: 4.5, cTop: top, cStripe: 0xe8e8e8 });
  const P = [...H.parts], W = [], N = [], K = [];
  P.push(vc(H.deck, 0x5a4a40));
  const dy = 4.6;
  // baş kasarası + dalgakıran + vinç/ırgat
  P.push(vc(B3(B * 0.82, 1.6, 8, 0, dy + 0.8 + H.deckY(0.95) - dy, L * 0.43), top));
  P.push(vc(B3(B * 0.7, 1.4, 0.3, 0, dy + 2.2, L * 0.39), 0xd8d8d8));
  for (const s of [-1, 1]) P.push(vc(CY(0.5, 0.5, 0.8, 10, s * 2.2, dy + 1.9, L * 0.44, 'x'), 0x2a2a2a));
  for (const s of [-1, 1]) P.push(vc(CY(0.55, 0.55, 0.3, 10, s * B * 0.42, dy - 0.6, L * 0.44, 'x'), 0x0a0a0a)); // demir loçası
  // konteyner istifi
  const cols = [0xc81010, 0x1d5aa8, 0x2d7a3a, 0xe8a020, 0xd8d8d8, 0x7a3a8a, 0x5a3a2a, 0x1a8a8a, 0xc85a10];
  for (let bay = 0; bay < 9; bay++) {
    const z = -L * 0.2 + bay * 6.55;
    const hgt = 2 + Math.floor(rng.next() * 3);
    for (let row = -2; row <= 2; row++) for (let tier = 0; tier < hgt; tier++) {
      if ((bay === 8 || bay === 0) && Math.abs(row) > 1) continue;
      if (rng.next() < 0.06) continue;
      K.push(vc(B3(2.44, 2.55, 6.06, row * 2.5, dy + 1.35 + tier * 2.6, z), rng.pick(cols), true));
    }
    // ambar kapağı + bağlama köprüsü
    P.push(vc(B3(B * 0.84, 0.35, 6.2, 0, dy + 0.1, z), 0x3a4a3a));
    if (bay < 8) P.push(vc(B3(B * 0.86, 3.2, 0.25, 0, dy + 1.8, z + 3.28), 0xb8b8b0));
  }
  // yaşam mahalli (kıç)
  const sz = -L * 0.39, sw = B * 0.86;
  for (let k = 0; k < 4; k++) {
    const w = sw - k * 0.6, d = 9 - k * 0.4;
    P.push(vc(B3(w, 2.45, d, 0, dy + 1.25 + k * 2.5, sz), 0xf0f0ea));
    P.push(vc(B3(w + 0.3, 0.1, d + 0.3, 0, dy + 2.5 + k * 2.5, sz), 0xc8c8c0));
    winRowX(W, sz + d / 2 + 0.01, dy + 1.4 + k * 2.5, -w * 0.42, w * 0.42, 7, 0.9, 0.8);
    winRow(W, w / 2 + 0.01, dy + 1.4 + k * 2.5, sz - d * 0.4, sz + d * 0.4, 4, 0.9, 0.8);
  }
  // köprüüstü ve kanatları
  const by = dy + 10.0 + 1.1;
  P.push(vc(B3(B * 0.7, 2.2, 6, 0, by, sz + 0.5), 0xf0f0ea));
  P.push(vc(B3(B * 1.04, 0.35, 2.6, 0, by + 0.7, sz + 2.2), 0xf0f0ea));
  P.push(vc(B3(B * 0.75, 0.15, 6.4, 0, by + 1.15, sz + 0.5), 0x2a2a2a));
  W.push(B3(B * 0.66, 1.0, 0.06, 0, by + 0.3, sz + 3.52));
  railing(P, 0xd8d8d8, -B * 0.52, sz + 3.4, B * 0.52, sz + 3.4, by + 0.88, 0.9, 1.2);
  // radar direği
  P.push(vc(CY(0.12, 0.15, 2.6, 6, 0, by + 2.45, sz), 0xd8d8d8));
  P.push(vc(B3(2.6, 0.12, 0.3, 0, by + 2.9, sz), 0x333333));
  // baca (şirket bandı)
  P.push(vc(B3(3.0, 4.0, 3.6, 0, dy + 12.0, sz - 3.6), 0xf0f0ea));
  P.push(vc(B3(3.05, 1.0, 3.65, 0, dy + 12.6, sz - 3.6), rng.pick([0xc81010, 0x1d5aa8, 0xe8a020, 0x2d7a3a])));
  P.push(vc(B3(3.06, 0.5, 3.66, 0, dy + 13.8, sz - 3.6), 0x111111));
  // kıç bayrak direği
  P.push(vc(CY(0.05, 0.05, 3, 5, 0, dy + 1.5 + H.deckY(0.02) - dy, -L * 0.49), 0xdddddd));
  N.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(B * 0.52, by + 0.75, sz + 2.2), 0x501010, 0xff2020, 0));
  N.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(-B * 0.52, by + 0.75, sz + 2.2), 0x105010, 0x20ff40, 0));
  N.push(lightize(new THREE.SphereGeometry(0.32, 8, 6).translate(0, by + 3.85, sz), 0xdddddd, 0xffffff, 0));
  N.push(lightize(new THREE.SphereGeometry(0.32, 8, 6).translate(0, dy + 3.2, L * 0.45), 0xdddddd, 0xffffff, 0));
  for (let i = 0; i < 4; i++) N.push(lightize(new THREE.SphereGeometry(0.16, 6, 4).translate(0, dy + 3.4, -L * 0.18 + i * 15), 0xeeeeee, 0xffe8c0, 0));
  return { g: finish(P, W, N, K), L, B, kind: 'cargo' };
}

// Ham petrol/ürün tankeri: alçak uzun güverte, boru demeti, ortada manifold + hortum vinci, baştan kıça yükseltilmiş
// yürüme köprüsü, havalandırma direkleri, kıç üst yapısı. Gövde koyu, güverte kırmızı-kahve.
function buildTanker(rng) {
  const L = 104, B = 17;
  const top = rng.pick([0x1a1a1a, 0x4a1414, 0x14283a]);
  const H = shipHull({ L, B, D: 6, F: 4.2, bow: 0.18, stern: 0.86, flare: 0.18, sheer: 0.3, bulb: 5, cTop: top, cStripe: null });
  const P = [...H.parts], W = [], N = [];
  P.push(vc(H.deck, 0x7a3428));
  const dy = 4.2;
  // boru demeti ve yürüme köprüsü
  for (let i = 0; i < 5; i++) P.push(vc(CY(0.3, 0.3, L * 0.62, 8, (i - 2) * 0.9, dy + 0.55, L * 0.05, 'z'), 0xb0b0a0));
  P.push(vc(B3(1.4, 0.12, L * 0.66, 3.2, dy + 2.3, L * 0.06), 0x9a9a8a));
  for (let z = -L * 0.26; z < L * 0.38; z += 5) { P.push(vc(B3(0.12, 2.3, 0.12, 2.55, dy + 1.15, z), 0x9a9a8a), vc(B3(0.12, 2.3, 0.12, 3.85, dy + 1.15, z), 0x9a9a8a)); }
  railing(P, 0xd8c830, 2.5, -L * 0.26, 2.5, L * 0.38, dy + 2.36, 0.8, 2.5);
  railing(P, 0xd8c830, 3.9, -L * 0.26, 3.9, L * 0.38, dy + 2.36, 0.8, 2.5);
  // manifold + hortum vinci
  P.push(vc(B3(B * 0.7, 1.5, 3, 0, dy + 0.75, L * 0.02), 0xd0c8b0));
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) P.push(vc(CY(0.22, 0.22, 2.2, 8, s * (B * 0.25 + 1.1), dy + 0.9, L * 0.02 - 1.2 + i * 0.5, 'x'), 0xc81010));
  P.push(vc(CY(0.35, 0.45, 6, 8, -B * 0.32, dy + 3, L * 0.02), 0xe8c020));
  P.push(vc(rod(-B * 0.32, dy + 5.8, L * 0.02, B * 0.05, dy + 4.2, L * 0.02 + 5, 0.22), 0xe8c020));
  // havalandırma direkleri ve genleşme kubbeleri
  for (let z = -L * 0.22; z < L * 0.36; z += 9) { P.push(vc(CY(0.15, 0.15, 3.6, 6, -4.5, dy + 1.8, z), 0xd8d8c8), vc(new THREE.SphereGeometry(0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(5.5, dy, z), 0x9a9a8a)); }
  // baş kasarası
  P.push(vc(B3(B * 0.8, 1.6, 9, 0, H.deckY(0.95) + 0.8, L * 0.42), top));
  P.push(vc(B3(B * 0.66, 1.3, 0.3, 0, dy + 2.4, L * 0.37), 0xd8d8d8));
  // kıç üst yapısı
  const sz = -L * 0.4;
  for (let k = 0; k < 4; k++) {
    const w = B * 0.84 - k * 0.6, d = 10 - k * 0.5;
    P.push(vc(B3(w, 2.45, d, 0, dy + 1.25 + k * 2.5, sz), 0xf0f0ea));
    winRowX(W, sz + d / 2 + 0.01, dy + 1.4 + k * 2.5, -w * 0.42, w * 0.42, 8, 0.9, 0.8);
    winRow(W, w / 2 + 0.01, dy + 1.4 + k * 2.5, sz - d * 0.4, sz + d * 0.4, 4, 0.9, 0.8);
  }
  const by = dy + 11.1;
  P.push(vc(B3(B * 0.7, 2.2, 6.5, 0, by, sz + 0.8), 0xf0f0ea));
  P.push(vc(B3(B * 1.04, 0.35, 2.6, 0, by + 0.7, sz + 2.6), 0xf0f0ea));
  W.push(B3(B * 0.66, 1.0, 0.06, 0, by + 0.3, sz + 4.07));
  P.push(vc(CY(0.12, 0.15, 2.4, 6, 0, by + 2.3, sz), 0xd8d8d8));
  P.push(vc(B3(3.2, 4.2, 4, 0, dy + 12.4, sz - 4), 0x1a1a1a));
  P.push(vc(B3(3.25, 1.0, 4.05, 0, dy + 12.9, sz - 4), 0xc81010));
  N.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(B * 0.52, by + 0.75, sz + 2.6), 0x501010, 0xff2020, 0));
  N.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(-B * 0.52, by + 0.75, sz + 2.6), 0x105010, 0x20ff40, 0));
  N.push(lightize(new THREE.SphereGeometry(0.32, 8, 6).translate(0, by + 3.6, sz), 0xdddddd, 0xffffff, 0));
  N.push(lightize(new THREE.SphereGeometry(0.32, 8, 6).translate(0, dy + 3.4, L * 0.45), 0xdddddd, 0xffffff, 0));
  return { g: finish(P, W, N), L, B, kind: 'tanker' };
}

// Ahşap balıkçı teknesi (gırgır tipi): renkli bordalı gövde, kaptan köşkü, direk + bum, ağ yığını, şamandıralar,
// gece parlak lamba.
function buildFishing(rng) {
  const L = 12, B = 3.8;
  const c = rng.pick([0x2a6ab0, 0x2d7a4a, 0xe8e8e8, 0xc84a1a, 0x1d3d8e]);
  const H = shipHull({ L, B, D: 0.9, F: 1.2, bow: 0.32, stern: 0.7, flare: 0.25, sheer: 0.6, cBottom: 0x8a1a1a, cBoot: 0xf0f0f0, cTop: c, cStripe: 0xf0f0f0, nL: 28 });
  const P = [...H.parts], W = [], N = [];
  P.push(vc(H.deck, 0x9a7a54));
  // küpeşte (ahşap üst kenar)
  for (const s of [-1, 1]) P.push(vc(rod(s * B * 0.47, 1.35, -L * 0.42, s * B * 0.4, 1.6, L * 0.4, 0.06, 5), 0x6a4a2a));
  P.push(vc(B3(1.9, 1.7, 2.0, 0, 2.05, -L * 0.18), 0xf0f0ea));
  P.push(vc(B3(2.1, 0.12, 2.2, 0, 2.95, -L * 0.18), 0xc81010));
  W.push(B3(1.6, 0.55, 0.06, 0, 2.35, -L * 0.18 + 1.01));
  for (const s of [-1, 1]) W.push(B3(0.06, 0.5, 1.2, s * 0.96, 2.35, -L * 0.18));
  P.push(vc(CY(0.07, 0.08, 5.5, 6, 0, 3.9, L * 0.12), 0x6a4a2a));
  P.push(vc(rod(0, 5.6, L * 0.12, 0, 1.6, L * 0.38, 0.04), 0x333333));
  P.push(vc(rod(0, 3.4, L * 0.12, 0, 1.8, -L * 0.36, 0.05), 0x6a4a2a));
  P.push(vc(new THREE.SphereGeometry(1, 10, 6).scale(1.3, 0.45, 1.6).translate(0, 1.4, L * 0.25), 0x3a6a3a)); // ağ yığını
  for (let i = 0; i < 6; i++) P.push(vc(new THREE.SphereGeometry(0.14, 8, 6).translate(B * 0.44, 1.35, -L * 0.3 + i * 0.9), 0xff7a10));
  P.push(vc(B3(0.03, 0.4, 0.6, 0, 3.3, -L * 0.18 - 0.6), 0xc8102e));
  N.push(lightize(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 6.7, L * 0.12), 0xdddddd, 0xffffff, 0));
  N.push(lightize(new THREE.SphereGeometry(0.22, 8, 6).translate(0, 4.6, L * 0.12 + 0.2), 0xeeeeee, 0xfff0d0, 0));
  return { g: finish(P, W, N), L, B, kind: 'fishing' };
}

// Lüks motor yat: keskin pruva, koyu cam bantlı iki katlı üst yapı, flybridge + radar kemeri, yüzme platformu.
function buildYacht(rng) {
  const L = 30, B = 7;
  const hullC = rng.pick([0xf8f8f8, 0x1a2a3a, 0xf8f8f8]);
  const H = shipHull({ L, B, D: 1.6, F: 2.4, bow: 0.36, stern: 0.94, flare: 0.3, sheer: 0.35, cBottom: 0x1a2a3a, cBoot: 0x1a1a1a, cTop: hullC, cStripe: hullC === 0xf8f8f8 ? 0x1a1a1a : 0xf8f8f8, nL: 32 });
  const P = [...H.parts], W = [], N = [];
  P.push(vc(H.deck, 0xb48a5a));
  const dy = 2.4;
  P.push(vc(B3(B * 0.8, 2.1, L * 0.5, 0, dy + 1.05, -L * 0.05), 0xf8f8f8));
  for (const s of [-1, 1]) W.push(B3(0.06, 0.9, L * 0.44, s * B * 0.401, dy + 1.2, -L * 0.05));
  W.push(B3(B * 0.72, 1.0, 0.06, 0, dy + 1.25, L * 0.2 + 0.02));
  P.push(vc(B3(B * 0.66, 1.6, L * 0.32, 0, dy + 2.9, -L * 0.1), 0xf8f8f8));
  for (const s of [-1, 1]) W.push(B3(0.06, 0.7, L * 0.26, s * B * 0.331, dy + 3.0, -L * 0.1));
  P.push(vc(B3(B * 0.7, 0.1, L * 0.36, 0, dy + 3.75, -L * 0.12), 0xf0f0f0));
  // flybridge camı + radar kemeri
  P.push(vc(B3(B * 0.56, 0.5, 0.08, 0, dy + 4.05, -L * 0.0), 0x222a30));
  for (const s of [-1, 1]) P.push(vc(rod(s * B * 0.28, dy + 3.8, -L * 0.2, s * B * 0.18, dy + 5.4, -L * 0.24, 0.12), 0xf8f8f8));
  P.push(vc(B3(B * 0.42, 0.25, 0.8, 0, dy + 5.45, -L * 0.24), 0xf8f8f8));
  P.push(vc(CY(0.25, 0.25, 0.25, 12, 0, dy + 5.75, -L * 0.24), 0xdddddd));
  railing(P, 0xd8d8d8, -B * 0.4, L * 0.2, -B * 0.15, L * 0.42, dy, 0.8, 1.4);
  railing(P, 0xd8d8d8, B * 0.4, L * 0.2, B * 0.15, L * 0.42, dy, 0.8, 1.4);
  P.push(vc(B3(B * 0.86, 0.15, 2.0, 0, 0.45, -L / 2 - 0.9), 0xb48a5a)); // yüzme platformu
  N.push(lightize(new THREE.SphereGeometry(0.15, 8, 6).translate(B * 0.45, dy + 0.3, L * 0.22), 0x501010, 0xff2020, 0));
  N.push(lightize(new THREE.SphereGeometry(0.15, 8, 6).translate(-B * 0.45, dy + 0.3, L * 0.22), 0x105010, 0x20ff40, 0));
  N.push(lightize(new THREE.SphereGeometry(0.18, 8, 6).translate(0, dy + 6.0, -L * 0.24), 0xdddddd, 0xffffff, 0));
  for (let i = 0; i < 5; i++) N.push(lightize(new THREE.BoxGeometry(0.4, 0.06, 0.4).translate(0, dy + 2.06, -L * 0.25 + i * 3), 0xeeeeee, 0x8ab0ff, 0));
  return { g: finish(P, W, N), L, B, kind: 'yacht' };
}

function finish(P, W, N, K) {
  const g = new THREE.Group();
  const hm = new THREE.Mesh(mergeGeometries(P.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => { if (x.attributes.uv) x.deleteAttribute('uv'); return x; })), hullMat);
  hm.castShadow = true; hm.receiveShadow = true; g.add(hm);
  if (K && K.length) { const km = new THREE.Mesh(mergeGeometries(K), boxMat); km.castShadow = true; km.receiveShadow = true; g.add(km); }
  if (W.length) g.add(new THREE.Mesh(mergeGeometries(W.map((x) => { const n = x.index ? x.toNonIndexed() : x; if (n.attributes.uv) n.deleteAttribute('uv'); return n; })), winMat));
  if (N.length) g.add(new THREE.Mesh(mergeGeometries(N), navMat));
  return g;
}

// Su bölgeleri (balıkçı/yat dolaşımı): [x0,z0,x1,z1]
const REGIONS = {
  hornEast: [-125, 85, 185, 175],
  bosSouth: [225, -400, 395, 800],
  bosNorth: [225, -980, 395, -500],
  marmara: [-900, 850, 900, 990],
};
function clearWater(x, z, m) {
  if (isLand(x, z)) return false;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (isLand(x + Math.cos(a) * m, z + Math.sin(a) * m)) return false; }
  return Math.hypot(x - ISLAND.x, z - ISLAND.z) > ISLAND.r + m + 6;
}
function segClear(ax, az, bx2, bz, m) {
  const n = Math.ceil(Math.hypot(bx2 - ax, bz - az) / 8);
  for (let i = 1; i <= n; i++) { const t = i / n; if (!clearWater(ax + (bx2 - ax) * t, az + (bz - az) * t, m)) return false; }
  return true;
}
// küçük teknelerin köprü kuşağını (z -470..-430) kesmemesi için: köprü ayakları ve kirişi
const BRIDGE_BAND = [-472, -428];
const crossesBridge = (az, bz) => (Math.min(az, bz) < BRIDGE_BAND[1] && Math.max(az, bz) > BRIDGE_BAND[0]);

export class ShipTraffic {
  constructor(game) {
    this.game = game;
    this.rng = new RNG(1453);
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.wakes = (game.boats && game.boats.wakes) || new Wakes(game.scene, 700);
    this.ownWakes = !(game.boats && game.boats.wakes);
    this.ships = [];
    this.list = this.ships;
    this.t = 0;
    this.buildPiers();
    // vapurlar
    FERRY_LINES.forEach((line, i) => {
      const m = buildFerry();
      const pts = line.map((p) => (typeof p === 'string' ? { x: PIERS[p].x, z: PIERS[p].z, dock: p } : { x: p[0], z: p[1] }));
      const s = this.addShip(m, pts[0].x, pts[0].z, PIERS[line[0]].h, { route: pts, idx: 1, dir: 1, cruise: 7.5, mode: 'dock', wait: 4 + i * 9, turnR: 55 });
      s.heading = PIERS[line[0]].h;
    });
    if (DECK_TOP >= 15) {
      // Boğaz geçişi: köprünün altından iki şerit (kuzeye doğu şeridi, güneye batı şeridi). Uçlarda başa sar.
      const nb = [{ x: 368, z: 1700 }, { x: 368, z: -330 }, { x: 324, z: -410 }, { x: 324, z: -495 }, { x: 362, z: -590 }, { x: 362, z: -1700, wrap: 0 }];
      const sb = [{ x: 285, z: -1700 }, { x: 285, z: -590 }, { x: 301, z: -495 }, { x: 301, z: -410 }, { x: 268, z: -330 }, { x: 268, z: 1700, wrap: 0 }];
      const kinds = [0, 1, 0, 1, 0];
      kinds.forEach((k, i) => {
        const m = k ? buildTanker(this.rng) : buildCargo(this.rng);
        const north = i % 2 === 0, r = (north ? nb : sb).map((p) => ({ ...p }));
        const s = this.addShip(m, r[0].x, r[0].z, north ? Math.PI : 0, { route: r, idx: 1, cruise: 6.5, turnR: 70, loop: true });
        // başlangıçta rotaya dağıt
        const startZ = north ? 1200 - i * 380 : -1200 + i * 380;
        s.pos.x = r[1].x; s.pos.z = startZ;
        if (north && startZ < -330) { s.pos.x = r[5].x; s.idx = 5; }
        if (!north && startZ > -590) { s.pos.x = r[5].x; s.idx = 5; }
      });
    } else {
      // köprü alçak: güneyden gelenler köprü önünde, kuzeyden gelenler arkasında U dönüşü yapar
      const south = [{ x: 368, z: 1700 }, { x: 368, z: -300 }, { x: 345, z: -390 }, { x: 300, z: -405 }, { x: 268, z: -330 }, { x: 268, z: 1700, wrap: 0 }];
      const north = [{ x: 268, z: -1700 }, { x: 268, z: -650 }, { x: 290, z: -575 }, { x: 345, z: -570 }, { x: 368, z: -640 }, { x: 368, z: -1700, wrap: 0 }];
      for (let i = 0; i < 3; i++) { const m = i === 1 ? buildTanker(this.rng) : buildCargo(this.rng); const r = south.map((p) => ({ ...p })); const s = this.addShip(m, r[0].x, 1700 - i * 700, Math.PI, { route: r, idx: 1, cruise: 6.5, turnR: 60, loop: true }); if (i === 2) { s.pos.x = 268; s.pos.z = 300; s.idx = 5; s.heading = 0; } }
      for (let i = 0; i < 2; i++) { const m = i === 0 ? buildTanker(this.rng) : buildCargo(this.rng); const r = north.map((p) => ({ ...p })); this.addShip(m, 268, -1700 + i * 500, 0, { route: r, idx: 1, cruise: 6.5, turnR: 60, loop: true }); }
    }
    // Marmara açıkları
    for (let i = 0; i < 2; i++) {
      const m = i === 0 ? buildTanker(this.rng) : buildCargo(this.rng);
      const z = 930 + i * 50, d = i ? 1 : -1;
      const r = [{ x: -1900 * d, z }, { x: 1900 * d, z, wrap: 0 }];
      this.addShip(m, -600 * d + i * 500, z, d > 0 ? Math.PI / 2 : -Math.PI / 2, { route: r, idx: 1, cruise: 7, turnR: 80, loop: true });
    }
    // balıkçılar ve yatlar
    const regs = ['hornEast', 'hornEast', 'bosSouth', 'bosSouth', 'bosNorth', 'marmara', 'marmara'];
    for (const rk of regs) { const p = this.randomIn(rk, 4); if (p) this.addShip(buildFishing(this.rng), p.x, p.z, this.rng.float(0, 6.28), { region: rk, cruise: this.rng.float(2.5, 4), turnR: 12, wander: true, margin: 4 }); }
    for (const rk of ['bosSouth', 'bosSouth', 'marmara']) { const p = this.randomIn(rk, 8); if (p) this.addShip(buildYacht(this.rng), p.x, p.z, this.rng.float(0, 6.28), { region: rk, cruise: this.rng.float(5, 8), turnR: 30, wander: true, margin: 8 }); }
    this._near = [];
  }

  buildPiers() {
    const parts = [];
    for (const p of Object.values(PIERS)) {
      // yüzer iskele + saçak
      const along = p.side[0] === 'z';
      const w = along ? 30 : 5, d = along ? 5 : 30;
      const ox = p.side === 'x+' ? 3.5 : p.side === 'x-' ? -3.5 : 0, oz = p.side === 'z+' ? 3.5 : p.side === 'z-' ? -3.5 : 0;
      parts.push(vc(B3(w, 0.6, d, p.x + ox, WATER_Y + 0.5, p.z + oz), 0x6a6258));
      parts.push(vc(B3(along ? 12 : 4, 0.3, along ? 4 : 12, p.x + ox, 3.4, p.z + oz), 0x2a4a5a));
      for (const s of [-1, 1]) parts.push(vc(CY(0.12, 0.12, 4.4, 6, p.x + ox + (along ? s * 5 : 0), 1.2, p.z + oz + (along ? 0 : s * 5)), 0x333333));
      // usturmaça lastikleri
      for (let i = -2; i <= 2; i++) parts.push(vc(CY(0.25, 0.25, 0.9, 8, p.x + ox + (along ? i * 5 : (p.side === 'x+' ? -2.6 : 2.6)), WATER_Y + 0.7, p.z + oz + (along ? (p.side === 'z+' ? -2.6 : 2.6) : i * 5)), 0x111111));
      oceanObstacle(p.x + ox, p.z + oz, w / 2, d / 2);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1), new THREE.MeshBasicMaterial({ map: signTexture(p.name.toUpperCase() + ' İSKELESİ', '#1d3d6e', '#f2f0ea', 512, 96), side: THREE.DoubleSide }));
      sign.position.set(p.x + ox * 1.1, 4.2, p.z + oz * 1.1); sign.rotation.y = along ? 0 : Math.PI / 2;
      this.group.add(sign);
    }
    const m = new THREE.Mesh(mergeGeometries(parts), hullMat); m.receiveShadow = true;
    this.group.add(m);
  }

  randomIn(rk, m) {
    const [x0, z0, x1, z1] = REGIONS[rk];
    for (let i = 0; i < 30; i++) { const x = this.rng.float(x0, x1), z = this.rng.float(z0, z1); if (clearWater(x, z, m)) return { x, z }; }
    return null;
  }

  addShip(model, x, z, heading, o) {
    const s = { mesh: model.g, L: model.L, B: model.B, kind: model.kind, pos: new THREE.Vector3(x, WATER_Y, z), heading, speed: 0, phase: Math.random() * 10, wakeT: 0, hornT: 30 + Math.random() * 60, wait: 0, ...o };
    s.mesh.rotation.order = 'YXZ';
    this.group.add(s.mesh);
    this.ships.push(s);
    return s;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const night = g.env ? g.env.nightFactor : 0;
    navMat.userData.uA.value.set(1.5 + night * 4, 0, 0, 0);
    const pl = g.player ? g.player.pos : { x: 0, z: 0 };
    const sea = g.env && g.env.waveAmount !== undefined ? g.env.waveAmount / 0.12 : 1;
    for (const s of this.ships) this.step(s, dt, pl, sea);
    if (this.ownWakes) this.wakes.update(dt);
    this.collidePlayer();
    this.feedOcean();
  }

  // Deniz şaderine en yakın gemi/tekneleri gönder (gövde köpüğü + dümen suyu)
  feedOcean() {
    const g = this.game, cam = g.camera ? g.camera.position : (g.player ? g.player.pos : { x: 0, z: 0 });
    const near = this._near; near.length = 0;
    for (const s of this.ships) { const d = Math.abs(s.pos.x - cam.x) + Math.abs(s.pos.z - cam.z); if (d < 1500) near.push([d, s.pos.x, s.pos.z, s.heading, s.L * 0.5, s.B * 0.5, s.speed]); }
    const vl = g.vehicles ? g.vehicles.list : [];
    for (const v of vl) {
      if (v.kind !== 'boat' || !v.def) continue;
      const d = Math.abs(v.pos.x - cam.x) + Math.abs(v.pos.z - cam.z);
      if (d < 600) near.push([d, v.pos.x, v.pos.z, v.heading, v.def.len * 0.5, v.def.wid * 0.5, Math.hypot(v.vx || 0, v.vz || 0) * 0.6]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const P = OCEAN.uShipP.value, D = OCEAN.uShipD.value;
    for (let i = 0; i < MAX_SHIPS; i++) {
      const e = near[i];
      if (e) { P[i].set(e[1], e[2], Math.sin(e[3]), Math.cos(e[3])); D[i].set(e[4], e[5], e[6], 0); } else { P[i].set(1e5, 1e5, 0, 1); D[i].set(1, 1, 0, 0); }
    }
  }

  target(s) {
    if (s.wander) return s.wp || (s.wp = this.pickWander(s));
    return s.route[s.idx];
  }
  pickWander(s) {
    for (let i = 0; i < 12; i++) {
      const p = this.randomIn(s.region, s.margin);
      if (p && Math.hypot(p.x - s.pos.x, p.z - s.pos.z) > 40 && !crossesBridge(s.pos.z, p.z) && segClear(s.pos.x, s.pos.z, p.x, p.z, s.margin)) return p;
    }
    return { x: s.pos.x + Math.sin(s.heading + Math.PI) * 30, z: s.pos.z + Math.cos(s.heading + Math.PI) * 30 };
  }

  step(s, dt, pl, sea = 1) {
    const g = this.game;
    const far = Math.hypot(s.pos.x - pl.x, s.pos.z - pl.z) > 1100;
    if (s.mode === 'dock') {
      // iskelede bekle, sonra düdük çal ve kalk
      s.speed = Math.max(0, s.speed - dt * 1.5);
      const p = PIERS[s.route[s.idx - s.dir] ? s.route[s.idx - s.dir].dock : ''] || null;
      if (p) s.heading += angleDiff(s.heading, p.h) * Math.min(1, dt * 0.5);
      s.wait -= dt;
      if (s.wait <= 0) { s.mode = 'sail'; s.wp = null; if (s.kind === 'ferry' && g.boats && g.boats.horn) g.boats.horn(s.pos.x, s.pos.z, 1); }
    } else {
      const tg = this.target(s);
      const dx = tg.x - s.pos.x, dz = tg.z - s.pos.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let desired = s.cruise;
      if (tg.dock) desired = Math.min(desired, 0.6 + d * 0.12);
      // önde başka gemi varsa yavaşla
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      for (const o of this.ships) {
        if (o === s) continue;
        const ox = o.pos.x - s.pos.x, oz = o.pos.z - s.pos.z;
        const fd = ox * fx + oz * fz;
        if (fd > 0 && fd < (s.L + o.L) * 0.6 + 20 && Math.abs(ox * -fz + oz * fx) < (s.B + o.B) * 0.6 + 4) { desired = Math.min(desired, Math.max(0, (fd - (s.L + o.L) * 0.55) * 0.1)); }
      }
      s.speed += clamp(desired - s.speed, -0.8 * dt, 0.5 * dt);
      const turnRate = Math.max(0.04, s.speed / s.turnR);
      s.heading += clamp(angleDiff(s.heading, want), -turnRate * dt, turnRate * dt);
      const arrive = tg.dock ? 2.5 : Math.max(12, s.speed * 3);
      if (d < arrive) {
        if (s.wander) { s.wp = null; if (s.kind === 'fishing' && Math.random() < 0.5) { s.mode = 'dock'; s.wait = 8 + Math.random() * 20; s.route = [{}]; s.idx = 0; s.dir = 0; } }
        else if (tg.dock) { s.mode = 'dock'; s.wait = 14; this.advance(s); }
        else if (tg.wrap !== undefined) { const r0 = s.route[tg.wrap]; s.pos.x = r0.x; s.pos.z = r0.z; s.idx = tg.wrap + 1; s.heading = Math.atan2(s.route[s.idx].x - r0.x, s.route[s.idx].z - r0.z); }
        else this.advance(s);
      }
    }
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const mul = far && s.mode !== 'dock' ? 4 : 1; // görüş dışında hızlandır
    s.pos.x += fx * s.speed * dt * mul; s.pos.z += fz * s.speed * dt * mul;
    // yalpa (dalga yüksekliğiyle artar; büyük gemiler daha az)
    s.phase += dt;
    const k = (10 / s.L) * Math.min(3.5, 0.6 + sea * 0.4);
    s.mesh.position.set(s.pos.x, WATER_Y + Math.sin(s.phase * 0.9) * 0.12 * k, s.pos.z);
    s.mesh.rotation.set(Math.sin(s.phase * 0.7) * 0.02 * k, s.heading, Math.sin(s.phase * 0.55 + 1) * 0.04 * k);
    // köpük serpintisi (yalnız görünür mesafede; asıl dümen suyu deniz şaderinde)
    if (!far && s.speed > 0.8) {
      s.wakeT -= dt;
      if (s.wakeT <= 0) {
        s.wakeT = s.L > 40 ? 0.25 : 0.3;
        const hl = s.L * 0.48;
        this.wakes.spawn(s.pos.x - fx * hl, s.pos.z - fz * hl, s.B * 0.6, 1.5 + s.speed * 0.25, 4 + s.L * 0.03, 0.35);
        this.wakes.spawn(s.pos.x + fx * hl * 0.85, s.pos.z + fz * hl * 0.85, s.B * 0.35, 1.2, 2.5, 0.3);
      }
    }
    // büyük gemi düdüğü (oyuncu yakınsa ara sıra)
    if (s.L > 40) {
      s.hornT -= dt;
      if (s.hornT <= 0) { s.hornT = 60 + Math.random() * 90; if (!far && Math.hypot(s.pos.x - pl.x, s.pos.z - pl.z) < 450 && g.boats && g.boats.horn) g.boats.horn(s.pos.x, s.pos.z, s.kind === 'ferry' ? 1 : 1.4); }
    }
  }

  advance(s) {
    if (s.loop) { s.idx = (s.idx + 1) % s.route.length; return; }
    s.idx += s.dir;
    if (s.idx >= s.route.length || s.idx < 0) { s.dir = -s.dir; s.idx += 2 * s.dir; }
  }

  // Gemiler oyuncu teknesini / yüzen oyuncuyu iter
  collidePlayer() {
    const g = this.game;
    const list = g.vehicles ? g.vehicles.list : [];
    const pushOne = (obj, rad, isBoat) => {
      for (const s of this.ships) {
        const dx = obj.pos.x - s.pos.x, dz = obj.pos.z - s.pos.z;
        if (Math.abs(dx) > s.L || Math.abs(dz) > s.L) continue;
        const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
        const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
        const hx = s.B / 2 + rad, hz = s.L / 2 + rad * 0.5;
        if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
          const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
          let nx, nz, pen;
          if (px < pz) { const sg = Math.sign(lx) || 1; nx = fz * sg; nz = -fx * sg; pen = px; } else { const sg = Math.sign(lz) || 1; nx = fx * sg; nz = fz * sg; pen = pz; }
          obj.pos.x += nx * pen; obj.pos.z += nz * pen;
          if (isBoat) {
            const vn = obj.vx * nx + obj.vz * nz;
            const sv = s.speed * (fx * nx + fz * nz);
            if (vn < sv) { const imp = sv - vn; obj.vx += nx * imp * 1.3; obj.vz += nz * imp * 1.3; if (imp > 4) { obj.damage(imp * imp * 2, null); g.audio && g.audio.crash && g.audio.crash(obj.pos.x, obj.pos.z, Math.min(1.5, imp / 10)); } }
          }
        }
      }
    };
    for (const v of list) if (v.kind === 'boat') pushOne(v, v.def.wid * 0.5, true);
    const p = g.player;
    if (p && p.swimming && !p.vehicle) pushOne(p, 0.5, false);
  }
}
