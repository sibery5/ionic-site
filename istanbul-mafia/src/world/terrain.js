// Aydos Dağı yükseklik alanı (three.js bağımlılığı yok; fizik, araçlar, NPC'ler ve modeller ortak kullanır).
//
// Orman bölgesi (FOREST, Anadolu yakasının doğu ucu) gerçek bir dağ yamacına dönüşür: doğuya (harita dışındaki
// sıradağlara) doğru yükselen kütle, sırt gürültüsü (ridged fBm), kuzey/güney uçlarda sokak seviyesine iner.
// Virajlı dağ yolu (7 m asfalt + 1.5 m çakıllı banket) kuzeyde 250 caddesinden girer, yamaç boyunca kıvrılarak
// zirve düzlüğüne (dağ evi) çıkar ve güneyde 810 caddesine iner. Yol boyunca arazi "yarma/dolgu" ile yola
// uydurulur: yol enine düz, boyuna eğim ≤ ~%12.
//
// API: terrainHeight(x,z) → yükseklik ya da alan dışında null · terrainSlope(x,z,out) · terrainRay(...) ·
//      MOUNTAIN (alan, yol örnekleri, zirve, dağ evi yeri). Izgara ilk sorguda (FOREST hazırsa) kurulur.
import { FOREST } from './map.js';

export const MOUNTAIN = {
  ready: false, x0: 0, x1: 0, z0: 0, z1: 0, res: 1, nx: 0, nz: 0, h: null, near: null,
  road: [], // {x, z, y, s, dx, dz} 2 m aralıklı yol ekseni örnekleri
  roadLen: 0, summit: null, cabin: null, hw: 3.5, shoulder: 1.5, maxH: 0,
};
const ROAD_HW = 3.5, SHOULDER = 1.5, CORE = ROAD_HW + SHOULDER + 0.3, FALL = 11;
const SUMMIT_Y = 23;

const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function h2(x, z, s) { let h = (x * 374761393 + z * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vn(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = h2(xi, zi, s), b = h2(xi + 1, zi, s), c = h2(xi, zi + 1, s), d = h2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// sırt gürültüsü: 1-|2n-1| keskinleştirilmiş, oktavlar arası ağırlıklı
function ridged(x, z) {
  let s = 0, amp = 0.55, f = 1 / 70, w = 1;
  for (let o = 0; o < 4; o++) {
    let n = 1 - Math.abs(vn(x * f, z * f, 31 + o) * 2 - 1); n *= n; n *= w; w = Math.min(1, n * 1.6);
    s += n * amp; amp *= 0.5; f *= 2.1;
  }
  return s;
}
// Doğal yamaç (yol etkisi olmadan). Harita dışı sıradağ silüeti de bunu kullanır (x > 1000 sürer).
export function naturalHeight(x, z) {
  const F = FOREST;
  const ex = Math.max(0, x - F.x0);
  const base = 3 + 0.9 * ex + 0.012 * ex * ex; // doğuya doğru dikleşen kütle
  const ez = ss(F.z0, F.z0 + 85, z) * ss(F.z1, F.z1 - 85, z);
  const ewest = 0.45 + 0.55 * ss(F.x0, F.x0 + 10, x);
  const rid = ridged(x, z) * 16 + (vn(x / 11, z / 11, 7) - 0.5) * 2.2;
  return Math.max(0, (base + rid) * ez * ewest);
}

// yol ekseni: kontrol noktaları (x, z) → Catmull-Rom → 2 m'lik yeniden örnekleme + yükseklik profili
function buildRoad() {
  const F = FOREST;
  const X = (u) => F.x0 + (995 - F.x0) * u; // kullanılabilir genişlik (oyuncu x ≤ 995)
  const L = F.z1 - F.z0, Z = (v) => F.z0 + L * v;
  const pts = [
    [X(0.16), F.z0 - 14], [X(0.16), Z(0.03)], [X(0.2), Z(0.1)], [X(0.6), Z(0.17)], [X(0.74), Z(0.24)], [X(0.46), Z(0.31)],
    [X(0.5), Z(0.38)], [X(0.78), Z(0.44)], [X(0.74), Z(0.5)], [X(0.46), Z(0.57)], [X(0.5), Z(0.64)], [X(0.78), Z(0.7)],
    [X(0.7), Z(0.78)], [X(0.3), Z(0.86)], [X(0.4), Z(0.95)], [X(0.4), F.z1 + 14],
  ];
  const raw = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      raw.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  raw.push(pts[pts.length - 1]);
  // 2 m'lik eşit aralık
  const out = [];
  let acc = 0, s = 0;
  out.push({ x: raw[0][0], z: raw[0][1], s: 0 });
  for (let i = 1; i < raw.length; i++) {
    const ax = raw[i - 1][0], az = raw[i - 1][1], bx = raw[i][0], bz = raw[i][1], d = Math.hypot(bx - ax, bz - az);
    let u = 0;
    while (acc + d * (1 - u) >= 2) { const need = 2 - acc; u += need / d; acc = 0; s += 2; out.push({ x: ax + (bx - ax) * u, z: az + (bz - az) * u, s }); }
    acc += d * (1 - u);
  }
  const total = s;
  // yükseklik profili: girişten 34 m düz, ~%11 tırmanış, zirvede 46 m düzlük, iniş
  let iTop = 0, best = -1;
  for (let i = 0; i < out.length; i++) { const v = (out[i].z - F.z0) / L; const k = -Math.abs(v - 0.5); if (k > best) { best = k; iTop = i; } }
  const sTop = out[iTop].s, a0 = 34, a1 = sTop - 23, b0 = sTop + 23, b1 = total - 34;
  const ramp = (t) => { t = Math.max(0, Math.min(1, t)); return 0.4 * t + 0.6 * t * t * (3 - 2 * t); };
  for (let i = 0; i < out.length; i++) {
    const p = out[i], q = out[Math.min(out.length - 1, i + 1)], r = out[Math.max(0, i - 1)];
    const dl = Math.hypot(q.x - r.x, q.z - r.z) || 1; p.dx = (q.x - r.x) / dl; p.dz = (q.z - r.z) / dl;
    p.y = p.s < sTop ? SUMMIT_Y * ramp((p.s - a0) / (a1 - a0)) : SUMMIT_Y * ramp((b1 - p.s) / (b1 - b0));
  }
  // y'yi hafifçe yumuşat (eğim süreksizliği yok)
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i < out.length - 1; i++) out[i].y = (out[i - 1].y + out[i].y * 2 + out[i + 1].y) / 4;
  MOUNTAIN.road = out; MOUNTAIN.roadLen = total;
  const top = out[iTop];
  MOUNTAIN.summit = { x: top.x, z: top.z, y: top.y, i: iTop };
  // dağ evi: zirve düzlüğünde yolun yamaç (doğu) tarafında küçük açıklık
  const side = top.x < (F.x0 + 995) / 2 ? 1 : -1;
  MOUNTAIN.cabin = { x: Math.min(984, Math.max(F.x0 + 9, top.x + side * 15)), z: top.z, y: top.y };
}

function build() {
  const F = FOREST;
  if (!(F.x1 > F.x0) || MOUNTAIN.ready) return;
  const M = MOUNTAIN;
  M.x0 = F.x0; M.x1 = 1000; M.z0 = F.z0; M.z1 = F.z1;
  buildRoad();
  const res = M.res, nx = Math.ceil((M.x1 - M.x0) / res) + 1, nz = Math.ceil((M.z1 - M.z0) / res) + 1;
  M.nx = nx; M.nz = nz;
  const H = new Float32Array(nx * nz), NR = new Float32Array(nx * nz);
  // yol örnekleri için ızgara kovası (8 m)
  const B = new Map(), BK = (i, j) => i * 4096 + j;
  for (const p of M.road) { const k = BK(Math.floor(p.x / 8), Math.floor(p.z / 8)); let a = B.get(k); if (!a) B.set(k, (a = [])); a.push(p); }
  const pads = [{ x: M.cabin.x, z: M.cabin.z, y: M.cabin.y, core: 11, fall: 9 }];
  const R = CORE + FALL;
  let maxH = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = M.x0 + i * res, z = M.z0 + j * res;
    const N = naturalHeight(x, z);
    let K = 0, sw = 0, sy = 0, dmin = 1e9;
    const bi = Math.floor(x / 8), bj = Math.floor(z / 8);
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      const arr = B.get(BK(bi + a, bj + b)); if (!arr) continue;
      for (const p of arr) {
        const d = Math.hypot(p.x - x, p.z - z); if (d > R) continue;
        if (d < dmin) dmin = d;
        const k = 1 - ss(CORE, R, d), w = k * k * k * k + 1e-6;
        if (k > K) K = k; sw += w; sy += w * p.y;
      }
    }
    for (const pd of pads) {
      const d = Math.hypot(pd.x - x, pd.z - z); if (d > pd.core + pd.fall) continue;
      const k = 1 - ss(pd.core, pd.core + pd.fall, d), w = k * k * k * k * 4 + 1e-6;
      if (k > K) K = k; sw += w; sy += w * pd.y;
    }
    const Y = sw > 0 ? sy / sw : 0;
    // dolgu tarafında şev biraz daha yayvan (yol kenarından ani düşüş yerine)
    const h = K > 0 ? N * (1 - K) + Y * K : N;
    H[j * nx + i] = Math.max(0, h);
    NR[j * nx + i] = Math.min(dmin, 255);
    if (h > maxH) maxH = h;
  }
  M.h = H; M.near = NR; M.maxH = maxH;
  M.ready = true;
  // eski API: orman yolu noktaları (görev/YZ yaklaşma noktaları)
  FOREST.road.length = 0;
  for (let i = 0; i < M.road.length; i += 3) FOREST.road.push({ x: M.road[i].x, z: M.road[i].z, y: M.road[i].y });
}
export function initMountain() { build(); return MOUNTAIN.ready; }

// Bilinear yükseklik; alan dışında null
export function terrainHeight(x, z) {
  const M = MOUNTAIN;
  if (!M.ready) { if (!(FOREST.x1 > FOREST.x0)) return null; build(); if (!M.ready) return null; }
  if (x < M.x0 || x > M.x1 || z < M.z0 || z > M.z1) return null;
  const fx = (x - M.x0) / M.res, fz = (z - M.z0) / M.res;
  const i = Math.min(M.nx - 2, Math.floor(fx)), j = Math.min(M.nz - 2, Math.floor(fz));
  const u = fx - i, v = fz - j, nx = M.nx, H = M.h, k = j * nx + i;
  return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + nx] * (1 - u) + H[k + nx + 1] * u) * v;
}
// Yol eksenine uzaklık (ızgara yaklaşığı, m; 255 = uzak)
export function roadDistance(x, z) {
  const M = MOUNTAIN;
  if (!M.ready || x < M.x0 || x > M.x1 || z < M.z0 || z > M.z1) return 255;
  const i = Math.round((x - M.x0) / M.res), j = Math.round((z - M.z0) / M.res);
  return M.near[Math.min(M.nz - 1, j) * M.nx + Math.min(M.nx - 1, i)];
}
export function terrainSlope(x, z, out = { x: 0, z: 0 }) {
  out.x = 0; out.z = 0;
  const h = terrainHeight(x, z); if (h === null) return out;
  const e = 0.6;
  out.x = ((terrainHeight(x + e, z) ?? h) - (terrainHeight(x - e, z) ?? h)) / (2 * e);
  out.z = ((terrainHeight(x, z + e) ?? h) - (terrainHeight(x, z - e) ?? h)) / (2 * e);
  return out;
}
// Işın - arazi: ilk kesişme mesafesi ya da -1 (yalnız alanın içinden geçen kısım yürünür)
export function terrainRay(ox, oy, oz, dx, dy, dz, maxD) {
  const M = MOUNTAIN;
  if (!M.ready) return -1;
  // alan kutusuna kırp
  let t0 = 0, t1 = maxD;
  for (const [o, d, lo, hi] of [[ox, dx, M.x0, M.x1], [oz, dz, M.z0, M.z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    let a = (lo - o) / d, b = (hi - o) / d; if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1;
  }
  if (oy + dy * t0 > M.maxH + 1 && dy >= 0) return -1;
  const step = 0.75;
  let prev = t0, pd = oy + dy * t0 - (terrainHeight(ox + dx * t0, oz + dz * t0) ?? 0);
  if (pd < 0) return t0;
  for (let t = t0 + step; t <= t1 + step; t += step) {
    const tt = Math.min(t, t1);
    const y = oy + dy * tt;
    if (y > M.maxH + 1 && dy >= 0) return -1;
    const d = y - (terrainHeight(ox + dx * tt, oz + dz * tt) ?? 0);
    if (d < 0) return prev + (tt - prev) * (pd / (pd - d));
    prev = tt; pd = d;
    if (tt >= t1) break;
  }
  return -1;
}
