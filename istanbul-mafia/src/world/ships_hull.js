// [deniz] Gemi/yat gövdesi ve ortak geometri yardımcıları (ships.js, ships_yachts.js, ships_moored.js ortak kullanır).
// Gövde: istasyon kesitleri (düz/V taban, sintine yarıçapı, borda), pruvada omurga yükselir ve borda dışa açılır
// (bayrak/flare), güverte hattı kıçtan başa yükselir (sheer), isteğe bağlı soğan baş (bulbous bow), ayna kıç.
// Su hattı y=0. Renk bantları: zehirli boya, su hattı bandı, borda rengi, isteğe bağlı üst şerit.
import * as THREE from 'three';
import { clamp } from '../core/util.js';

const _c = new THREE.Color();
// köşe rengi ver (uv'yi istenirse korur)
export function vc(g, hex, keepUV = false) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUV && k === 'uv')) n.deleteAttribute(k);
  _c.set(hex);
  const a = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = _c.r; a[i + 1] = _c.g; a[i + 2] = _c.b; }
  n.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return n;
}
// yalnız konum+normal (tek renkli malzemeler için)
export function bare(g, keepUV = false) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUV && k === 'uv')) n.deleteAttribute(k);
  if (keepUV && !n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
}
export const B3 = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
export const CY = (rt, rb, h, seg, x, y, z, axis) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2); return g.translate(x, y, z); };
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
export function rod(ax, ay, az, bx, by, bz, r, seg = 4) {
  _d.set(bx - ax, by - ay, bz - az); const L = _d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  _q.setFromUnitVectors(_up, _d.normalize()); g.applyQuaternion(_q);
  return g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
}
// Korkuluk: üst ve orta tirizli dikme sırası
export function railing(P, col, x0, z0, x1, z1, y, h = 1.0, step = 1.6, r = 0.035) {
  P.push(vc(rod(x0, y + h, z0, x1, y + h, z1, r), col), vc(rod(x0, y + h * 0.5, z0, x1, y + h * 0.5, z1, r * 0.7), col));
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / step));
  for (let i = 0; i <= n; i++) { const t = i / n; P.push(vc(B3(r * 1.4, h, r * 1.4, x0 + (x1 - x0) * t, y + h / 2, z0 + (z1 - z0) * t), col)); }
}
// Pencere sırası (yan duvar x=±xs boyunca z'de)
export function winRow(W, xs, y, z0, z1, n, w, h) {
  const pitch = (z1 - z0) / n;
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) W.push(B3(0.06, h, w, s * xs, y, z0 + pitch * (i + 0.5)));
}
export function winRowX(W, zs, y, x0, x1, n, w, h) {
  const pitch = (x1 - x0) / n;
  for (let i = 0; i < n; i++) W.push(B3(w, h, 0.06, x0 + pitch * (i + 0.5), y, zs));
}

// Gövde. L boy, B en, D su altı derinliği, F güverte yüksekliği (su hattından), bow: pruva sivriliği (boy oranı),
// stern: kıç genişlik oranı, run: kıç omurga yükselişi, flare: baş bordasının dışa açılması, sheer: güverte hattı
// yükselişi, bulb: soğan baş boyu (m), vee: yat/sürat teknesi V tabanı (0 düz, 1 derin V), chine: borda kırığı.
export function shipHull({ L, B, D, F, bow = 0.22, stern = 0.85, run = 0.12, flare = 0.15, sheer = 0.25, bulb = 0, vee = 0, cBottom = 0x8a1e16, cBoot = 0x141414, cTop = 0x1d3d6e, cStripe = null, stripeH = 0.42, nL = 44, double = false, bootLo = -0.25, bootHi = 0.4 }) {
  const hb = B / 2;
  const width = (u) => {
    let w = 1;
    const ub = double ? Math.min(u, 1 - u) : u;
    if (!double && u < 0.18) w = stern + (1 - stern) * Math.sin((u / 0.18) * Math.PI / 2);
    if (u > 1 - bow) { const t = (u - (1 - bow)) / bow; w = Math.min(w, Math.pow(Math.max(0, 1 - t * t), 0.6 + 0.4 * (1 - vee))); }
    if (double && ub < bow) { const t = (bow - ub) / bow; w = Math.sqrt(Math.max(0, 1 - t * t)); }
    return Math.max(w, 0.015);
  };
  const keelY = (u) => {
    let k = -D;
    if (u > 1 - bow * 0.6) k = -D * (1 - Math.pow((u - (1 - bow * 0.6)) / (bow * 0.6), 2) * (0.55 + 0.3 * vee));
    if (!double && u < run) k = -D * (0.35 + 0.65 * (u / run));
    if (double && u < bow * 0.6) k = -D * (1 - Math.pow((bow * 0.6 - u) / (bow * 0.6), 2) * 0.55);
    return k;
  };
  const deckY = (u) => F + (u > 0.72 ? Math.pow((u - 0.72) / 0.28, 2) * F * sheer : 0) + (u < 0.1 ? (0.1 - u) * F * sheer * 0.6 : 0);
  // kesit noktaları (orta hattan güverteye): [x, y]
  const prof = (u) => {
    const w = width(u), ky = keelY(u), dy = deckY(u), r = Math.min(D * 0.45, hb * 0.35) * (1 - 0.7 * vee);
    const pts = [];
    pts.push([0, ky]);
    if (vee > 0) {
      // V taban: omurgadan borda kırığına (chine) eğimli düzlem
      const cy = ky + (D * 0.85) * vee * Math.min(1, w * 1.4);
      pts.push([hb * w * 0.5, ky + (cy - ky) * 0.45]);
      pts.push([hb * w * 0.92, cy]);
    } else {
      pts.push([Math.max(0, hb * w - r), ky]);
      for (let j = 1; j <= 4; j++) { const a = -Math.PI / 2 + (j / 4) * (Math.PI / 2); pts.push([Math.max(0, hb * w - r) + r * Math.cos(a) * Math.min(1, w * 2), ky + r + r * Math.sin(a)]); }
    }
    const last = pts[pts.length - 1][1];
    const ys = [bootLo - 0.35, bootLo + 0.02, bootLo, bootHi - 0.02, bootHi, dy - stripeH - 0.03, dy - stripeH, dy];
    for (const y of ys) if (y > last + 0.01) {
      const t = clamp((y + D) / (D + F), 0, 1);
      const fl = 1 + flare * Math.pow(clamp((u - 0.6) / 0.4, 0, 1), 1.5) * t * (double ? 0 : 1);
      pts.push([Math.min(hb * 1.04, hb * w * fl * (1 + 0.02 * t)), y]);
    }
    return pts;
  };
  const colAt = (y, dy) => (y < bootLo ? cBottom : y < bootHi ? cBoot : cStripe !== null && y > dy - stripeH - 0.01 ? cStripe : cTop);
  const rows = [];
  for (let i = 0; i <= nL; i++) { const u = i / nL; rows.push({ z: -L / 2 + u * L, pts: prof(u), dy: deckY(u) }); }
  const M = Math.max(...rows.map((r) => r.pts.length));
  for (const r of rows) while (r.pts.length < M) r.pts.push(r.pts[r.pts.length - 1]);
  const pos = [], col = [], idx = [];
  const C = new THREE.Color();
  for (const r of rows) {
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
  if (bulb > 0) parts.push(vc(new THREE.SphereGeometry(1, 14, 10).scale(hb * 0.3, D * 0.3, bulb).translate(0, -D * 0.62, L / 2 - bulb * 0.45), cBottom));
  // güverte örtüsü (uv = güverte düzlemi metre cinsinden: u = x, v = z)
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
  // küpeşte (bulwark) üst kenar hattı: [z, yarı genişlik, y]
  return { parts, deck: dg, deckY, width: (u) => width(u) * hb, edge: half };
}
