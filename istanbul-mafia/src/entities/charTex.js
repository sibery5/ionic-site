// İnsan modeli dokuları ve malzemesi (tamamı prosedürel).
// - Kumaş/deri/saç atlası: 4x4 karo, her karo 256 px; albedo (gri ton, renk vertex'ten) + alfa + normal haritası.
//   Karo seçimi vertex niteliği `matp.x` ile yapılır (fract ile döşeme, textureGrad ile mip seçimi -> dikiş yok).
// - Yüz dokusu (kişiye özel): ten, kaş, dudak, kirli sakal, göz çevresi gölgesi, göz küresi (iris/göz bebeği/parlama).
// - Tek MeshStandardMaterial: tüm vücut + kıyafet + saç tek draw call. Pürüzlülük/metallik vertex başına (`matp.yz`).
import * as THREE from 'three';
import { makeCanvas } from '../core/textures.js';
import { RNG } from '../core/util.js';

// karo indeksleri (100 eklenirse döşenmez: clamp — saç kartları)
export const TILE = {
  face: -1, skin: 0, jersey: 1, weave: 2, denim: 3, wool: 4, leather: 5, rib: 6, felt: 7, poly: 8, canvas: 9, rubber: 10, haircap: 11, flat: 12,
  hairCard: 113, curlCard: 114, fineCard: 115,
};
// karo başına dünya ölçeği (m): UV = mesafe / ölçek
export const TILE_SIZE = { 0: 0.05, 1: 0.07, 2: 0.06, 3: 0.09, 4: 0.08, 5: 0.12, 6: 0.06, 7: 0.1, 8: 0.1, 9: 0.06, 10: 0.05, 11: 0.06, 12: 1 };

const T = 256, G = 4, S = T * G;

// periyodik değer gürültüsü (karo kenarlarında dikişsiz)
function pnoise(px, py, seed) {
  const r = new RNG(seed), g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = r.next();
  return (u, v) => {
    const x = u * px, y = v * py, i = Math.floor(x), j = Math.floor(y);
    let fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const i0 = ((i % px) + px) % px, i1 = (i0 + 1) % px, j0 = ((j % py) + py) % py, j1 = (j0 + 1) % py;
    const a = g[j0 * px + i0], b = g[j0 * px + i1], c = g[j1 * px + i0], d = g[j1 * px + i1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
function fbm(list) { return (u, v) => { let s = 0, w = 0; for (const [n, k] of list) { s += n(u, v) * k; w += k; } return s / w; }; }
// periyodik hücre gürültüsü: (F2-F1) -> deri kırışıkları
function cells(n, seed) {
  const r = new RNG(seed), pts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push([(i + r.next()) / n, (j + r.next()) / n]);
  return (u, v) => {
    const ci = Math.floor(u * n), cj = Math.floor(v * n);
    let f1 = 9, f2 = 9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = (ci + di + n) % n, jj = (cj + dj + n) % n;
      const p = pts[jj * n + ii];
      let dx = p[0] + (ci + di - ((ci + di + n) % n)) / n - u, dy = p[1] + (cj + dj - ((cj + dj + n) % n)) / n - v;
      const d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return Math.sqrt(f2) - Math.sqrt(f1);
  };
}
const fr = (x) => x - Math.floor(x);
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

// saç kartı: u boyunca tel demetleri, v kökten (0) uca (1)
function strandCard(seed, n, curl, minLen) {
  const r = new RNG(seed);
  const st = [];
  for (let i = 0; i < n; i++) st.push({ u: r.next(), w: 0.006 + r.next() * 0.012, len: minLen + r.next() * (1 - minLen), b: 0.7 + r.next() * 0.45, ph: r.next() * TAU, amp: curl * (0.5 + r.next()) });
  return (u, v) => {
    let a = 0, h = 0, br = 0;
    for (const s of st) {
      if (v > s.len) continue;
      let cu = s.u + s.amp * Math.sin(v * TAU * (curl > 0 ? 2.5 : 0.6) + s.ph);
      let du = Math.abs(fr(u - cu + 0.5) - 0.5);
      const taper = 1 - sst(s.len * 0.65, s.len, v) * 0.75;
      const w = s.w * taper;
      if (du < w) { const k = 1 - du / w; if (k > a) { a = k; br = s.b; } h = Math.max(h, k); }
    }
    const edge = sst(0, 0.08, u) * sst(1, 0.92, u); // kart kenarları yumuşak
    return { a: Math.min(1, a * 1.6) * edge, h, alb: br * (0.78 + 0.3 * v) };
  };
}

function buildTiles() {
  const n1 = pnoise(16, 16, 1), n2 = pnoise(48, 48, 2), n3 = pnoise(96, 96, 3), n4 = pnoise(8, 8, 4);
  const streak = pnoise(64, 6, 5), fuzz = fbm([[pnoise(32, 32, 6), 1], [pnoise(64, 64, 7), 0.6], [pnoise(128, 128, 8), 0.4]]);
  const cl = cells(10, 9), pore = pnoise(128, 128, 10), hairN = pnoise(140, 5, 11), hairN2 = pnoise(70, 3, 12);
  const card = strandCard(21, 70, 0, 0.55), curly = strandCard(22, 46, 0.05, 0.4), fine = strandCard(23, 110, 0, 0.3);
  // her karo: (u,v) -> {h: yükseklik 0..1, alb: albedo çarpanı, a: alfa}
  const tiles = [];
  tiles[0] = (u, v) => { const p = sst(0.72, 0.9, pore(u, v)); return { h: 0.5 + 0.12 * n2(u, v) - 0.35 * p, alb: 0.93 + 0.1 * n4(u, v) - 0.05 * p }; };
  tiles[1] = (u, v) => { // jarse örgü: V ilmekleri
    const cx = fr(u * 28), cy = fr(v * 36 + Math.abs(cx - 0.5) * 0.9);
    const h = 0.55 * (1 - Math.abs(2 * cy - 1)) + 0.45 * Math.sqrt(1 - Math.abs(2 * cx - 1));
    return { h, alb: 0.86 + 0.12 * h + 0.04 * n3(u, v) };
  };
  tiles[2] = (u, v) => { // bez dokuma
    const a = fr(u * 44), b = fr(v * 44), chk = (Math.floor(u * 44) + Math.floor(v * 44)) & 1;
    const h = chk ? Math.sin(Math.PI * b) : Math.sin(Math.PI * a);
    return { h: 0.3 + 0.7 * h, alb: 0.9 + 0.08 * h + 0.03 * n3(u, v) };
  };
  tiles[3] = (u, v) => { // kot: diyagonal dimi + yıkanmış çizgiler + beyaz atkı
    const d = Math.sin(TAU * (54 * u + 27 * v)), h = 0.5 + 0.5 * d;
    const s = streak(u, v), sp = sst(0.8, 0.95, n3(u, v));
    return { h, alb: 0.72 + 0.22 * s + 0.08 * h + 0.18 * sp };
  };
  tiles[4] = (u, v) => { // yün takım: balıksırtı
    const band = Math.floor(u * 10) & 1, d = band ? 40 * u + 40 * v : 40 * u - 40 * v;
    const h = 0.5 + 0.5 * Math.sin(TAU * d);
    return { h, alb: 0.9 + 0.07 * h + 0.04 * n2(u, v) };
  };
  tiles[5] = (u, v) => { // deri: hücre kırışıkları
    const c = cl(u, v), cr = sst(0.0, 0.09, c);
    return { h: 0.25 + 0.6 * cr + 0.15 * n3(u, v), alb: 0.78 + 0.2 * cr + 0.06 * n1(u, v) };
  };
  tiles[6] = (u, v) => { const h = 0.5 + 0.5 * Math.sin(TAU * 18 * u) * (0.85 + 0.15 * Math.sin(TAU * 48 * v)); return { h, alb: 0.82 + 0.18 * h }; };
  tiles[7] = (u, v) => { const h = fuzz(u, v); return { h, alb: 0.86 + 0.16 * h }; };
  tiles[8] = (u, v) => { const h = 0.5 + 0.1 * Math.sin(TAU * 90 * u + 6 * n1(u, v)) + 0.1 * n3(u, v); return { h, alb: 0.95 + 0.05 * n2(u, v) }; };
  tiles[9] = (u, v) => { const a = Math.sin(TAU * 24 * u), b = Math.sin(TAU * 24 * v); const h = 0.5 + 0.25 * (a + b) * 0.7 + 0.15 * n3(u, v); return { h, alb: 0.86 + 0.14 * h }; };
  tiles[10] = (u, v) => { const h = 0.5 + 0.5 * Math.sin(TAU * 14 * u) * Math.sin(TAU * 14 * v); return { h, alb: 0.85 + 0.1 * h }; };
  tiles[11] = (u, v) => { const h = 0.6 * hairN(u, v) + 0.4 * hairN2(u, v); return { h, alb: 0.62 + 0.5 * h }; };
  tiles[12] = () => ({ h: 0.5, alb: 1 });
  tiles[13] = (u, v) => card(u, v);
  tiles[14] = (u, v) => curly(u, v);
  tiles[15] = (u, v) => fine(u, v);
  return tiles;
}

let ATLAS = null;
export function charAtlas() {
  if (ATLAS) return ATLAS;
  const tiles = buildTiles();
  const ca = makeCanvas(S, S), cn = makeCanvas(S, S);
  const ga = ca.getContext('2d'), gn = cn.getContext('2d');
  const ia = ga.createImageData(S, S), inn = gn.createImageData(S, S);
  const H = new Float32Array(T * T), A = new Float32Array(T * T), AL = new Float32Array(T * T);
  const STR = [2.2, 3, 3, 3, 2.5, 4, 3, 2.5, 1.5, 3, 3, 3, 0, 3, 3, 3];
  for (let id = 0; id < 16; id++) {
    const fn = tiles[id];
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const r = fn(x / T, y / T);
      H[y * T + x] = r.h; A[y * T + x] = r.alb; AL[y * T + x] = r.a === undefined ? 1 : r.a;
    }
    const cx = id % G, cy = Math.floor(id / G);
    const rep = id < 13;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const k = y * T + x;
      const xl = rep ? (x + T - 1) % T : Math.max(0, x - 1), xr = rep ? (x + 1) % T : Math.min(T - 1, x + 1);
      const yd = rep ? (y + T - 1) % T : Math.max(0, y - 1), yu = rep ? (y + 1) % T : Math.min(T - 1, y + 1);
      const s = STR[id];
      const dx = (H[y * T + xr] - H[y * T + xl]) * s, dy = (H[yu * T + x] - H[yd * T + x]) * s;
      const il = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      // tuval satırı: v yukarı (flipY ile UV'de alt satır = v 0)
      const px = cx * T + x, py = S - 1 - (cy * T + y);
      const o = (py * S + px) * 4;
      const b = Math.max(0, Math.min(255, A[k] * 235));
      ia.data[o] = ia.data[o + 1] = ia.data[o + 2] = b; ia.data[o + 3] = Math.round(AL[k] * 255);
      inn.data[o] = Math.round((-dx * il * 0.5 + 0.5) * 255); inn.data[o + 1] = Math.round((-dy * il * 0.5 + 0.5) * 255); inn.data[o + 2] = Math.round((il * 0.5 + 0.5) * 255); inn.data[o + 3] = 255;
    }
  }
  ga.putImageData(ia, 0, 0); gn.putImageData(inn, 0, 0);
  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  ATLAS = { albedo: mk(ca, true), normal: mk(cn, false) };
  return ATLAS;
}

// ---------------- kafa UV + yüz dokusu ----------------
export function headDims(f) { return f ? { cy: 0.112, cz: 0.012, rx: 0.073, ry: 0.108, rz: 0.094 } : { cy: 0.115, cz: 0.012, rx: 0.078, ry: 0.113, rz: 0.099 }; }
export function headUV(dx, dy, dz) {
  const phi = Math.atan2(dx, dz);
  const lat = Math.asin(Math.max(-1, Math.min(1, dy)));
  const u = 0.5 + 0.5 * Math.sign(phi) * Math.pow(Math.abs(phi) / Math.PI, 0.6);
  return [u, ((lat + Math.PI / 2) / Math.PI) * 0.94 + 0.055];
}
// göz küresi dokusu yüz dokusunun görünmeyen köşesinde (çene altı arkası)
export const EYE_UV = { cx: 32 / 512, cy: 1 - 454 / 512, r: 28 / 512 };
const EYE_COLORS = ['#3b2414', '#5a3a1c', '#2e4a2a', '#3a5a7a', '#6a5030'];
const texCache = new Map();
export function faceKey(look) {
  const old = (look.age || 0) > 0.55 || ['#8a8a8a', '#aaaaaa', '#cccccc'].includes(look.hairColor);
  return ['face2', look.skin, look.gender, look.beard, look.hairColor, look.eyeColor || EYE_COLORS[0], old, !!look.makeup].join('|');
}
export function faceTexture(look) {
  const key = faceKey(look);
  if (texCache.has(key)) return texCache.get(key);
  const f = look.gender === 'f';
  const eye = look.eyeColor || EYE_COLORS[0];
  const old = (look.age || 0) > 0.55 || ['#8a8a8a', '#aaaaaa', '#cccccc'].includes(look.hairColor);
  const W = 512, H = 512, c = makeCanvas(W, H), g = c.getContext('2d');
  const D = headDims(f);
  const P = (x, y) => {
    const dx = x / D.rx, dy = y / D.ry, dz = Math.sqrt(Math.max(0.04, 1 - dx * dx - dy * dy));
    const l = Math.hypot(dx, dy, dz); const [u, v] = headUV(dx / l, dy / l, dz / l);
    return [u * W, (1 - v) * H];
  };
  const sc = (x, y) => { const a = P(x, y), b = P(x + 0.002, y), d = P(x, y + 0.002); return [(b[0] - a[0]) / 0.002, (a[1] - d[1]) / 0.002]; };
  const skin = new THREE.Color(look.skin);
  const hex = (col) => '#' + col.getHexString();
  const rgba = (col, a) => `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${a})`;
  const tint = (dr, dg, db) => { const t = skin.clone(); t.r = Math.max(0, Math.min(1, t.r * (1 + dr))); t.g = Math.max(0, Math.min(1, t.g * (1 + dg))); t.b = Math.max(0, Math.min(1, t.b * (1 + db))); return t; };
  g.fillStyle = look.skin; g.fillRect(0, 0, W, H);
  const r = new RNG(7);
  for (let i = 0; i < 320; i++) {
    const x = r.float(0, W), y = r.float(0, H), rad = r.float(5, 26);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const tc = r.chance(0.5) ? tint(0.07, -0.02, -0.04) : tint(-0.05, -0.05, -0.04);
    gr.addColorStop(0, rgba(tc, 0.22)); gr.addColorStop(1, rgba(tc, 0));
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // gözenek benekleri
  for (let i = 0; i < 2600; i++) { const x = r.float(0, W), y = r.float(0, H); g.fillStyle = rgba(tint(-0.12, -0.12, -0.1), r.float(0.05, 0.15)); g.fillRect(x, y, 1, 1); }
  const blob = (x, y, rx, ry, col, a) => {
    const [px, py] = P(x, y), [sx, sy] = sc(x, y);
    g.save(); g.translate(px, py); g.scale(1, (ry * sy) / (rx * sx));
    const R = rx * sx; const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); g.restore();
  };
  for (const s of [-1, 1]) {
    blob(s * 0.042, -0.03, 0.026, 0.02, tint(0.28, -0.08, -0.08), f ? 0.38 : 0.22); // yanak
    blob(s * 0.031, 0.012, 0.022, 0.014, tint(-0.32, -0.32, -0.22), 0.5); // göz çukuru
    blob(s * 0.033, -0.004, 0.016, 0.008, tint(-0.22, -0.26, -0.12), 0.45); // göz altı
    blob(s * 0.063, 0.03, 0.02, 0.03, tint(-0.15, -0.15, -0.1), 0.3); // şakak
    blob(s * 0.045, -0.088, 0.025, 0.02, tint(-0.12, -0.12, -0.1), 0.22);
    blob(s * 0.02, -0.048, 0.008, 0.016, tint(-0.18, -0.2, -0.15), 0.35); // nazolabial
    blob(s * 0.012, -0.018, 0.006, 0.02, tint(-0.3, -0.3, -0.25), 0.35); // burun yanı
    blob(s * 0.0095, -0.041, 0.0055, 0.0035, new THREE.Color('#2a1510'), 0.8); // burun deliği
  }
  blob(0, -0.036, 0.013, 0.011, tint(0.2, -0.05, -0.05), 0.35);
  blob(0, -0.1, 0.03, 0.02, tint(-0.1, -0.1, -0.08), 0.25);
  // göz kapağı çizgisi ve kıvrımı (kirpikler geometride)
  for (const s of [-1, 1]) {
    const ex = s * 0.031, ey = 0.012;
    const [px, py] = P(ex, ey), [sx, sy] = sc(ex, ey);
    const ew = 0.014 * sx, eh = 0.0055 * sy;
    g.strokeStyle = hex(tint(-0.4, -0.4, -0.35)); g.globalAlpha = 0.55; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(px - ew * 0.95, py - eh * 1.4); g.quadraticCurveTo(px, py - eh * 2.9, px + ew, py - eh * 1.3); g.stroke(); g.globalAlpha = 1;
    if (f || look.makeup) { g.fillStyle = 'rgba(90,50,70,0.2)'; g.beginPath(); g.ellipse(px, py - eh * 1.9, ew * 1.1, eh * 1.4, 0, 0, TAU); g.fill(); }
    // kaş: kısa kıl darbeleri
    const bc = new THREE.Color(look.hairColor); if (bc.getHSL({}).l > 0.45) bc.multiplyScalar(0.7);
    g.strokeStyle = hex(bc); g.lineWidth = 1.2;
    const n = f ? 34 : 56;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const bx = s * (0.011 + t * 0.042), by = 0.032 + Math.sin(t * Math.PI * 0.85) * (f ? 0.008 : 0.005) - t * 0.002 + (f ? 0.002 : 0);
      const th = (f ? 0.0024 : 0.0044) * (1 - t * 0.5);
      const [qx, qy] = P(bx, by);
      for (let m = 0; m < 2; m++) {
        const oy = (r.next() - 0.5) * th * sy;
        g.globalAlpha = 0.5 + r.next() * 0.45;
        g.beginPath(); g.moveTo(qx - s * th * sx * 0.3, qy + oy + th * sy * 0.5); g.lineTo(qx + s * th * sx * (0.9 + t), qy + oy - th * sy * 0.4); g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
  // dudaklar
  {
    const [mx, my] = P(0, -0.06), [sx, sy] = sc(0, -0.06);
    const mw = (f ? 0.021 : 0.022) * sx, uh = (f ? 0.0058 : 0.0045) * sy, lh = (f ? 0.0075 : 0.006) * sy;
    const lip = f || look.makeup ? new THREE.Color('#a8404c').lerp(skin, 0.3) : tint(0.18, -0.2, -0.12).lerp(new THREE.Color('#8a4a40'), 0.3);
    g.fillStyle = hex(lip);
    g.beginPath(); g.moveTo(mx - mw, my); g.quadraticCurveTo(mx - mw * 0.5, my - uh * 1.1, mx - mw * 0.12, my - uh); g.quadraticCurveTo(mx, my - uh * 0.6, mx + mw * 0.12, my - uh); g.quadraticCurveTo(mx + mw * 0.5, my - uh * 1.1, mx + mw, my); g.closePath(); g.fill();
    g.fillStyle = hex(lip.clone().lerp(new THREE.Color('#ffffff'), 0.05));
    g.beginPath(); g.moveTo(mx - mw * 0.95, my); g.quadraticCurveTo(mx, my + lh * 1.6, mx + mw * 0.95, my); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,10,10,0.75)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(mx - mw, my); g.quadraticCurveTo(mx, my + 1.2, mx + mw, my); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.ellipse(mx, my + lh * 0.65, mw * 0.4, lh * 0.25, 0, 0, TAU); g.fill();
  }
  if (old) {
    g.strokeStyle = hex(tint(-0.3, -0.3, -0.25)); g.globalAlpha = 0.38; g.lineWidth = 1.2;
    for (const yy of [0.05, 0.058, 0.066]) { const a = P(-0.03, yy), b = P(0, yy + 0.002), d = P(0.03, yy); g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], b[1], d[0], d[1]); g.stroke(); }
    for (const s of [-1, 1]) {
      const a = P(s * 0.016, -0.04), b = P(s * 0.03, -0.075); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      for (let k = 0; k < 3; k++) { const a2 = P(s * 0.05, 0.01 + k * 0.006), b2 = P(s * 0.062, 0.006 + k * 0.008); g.beginPath(); g.moveTo(a2[0], a2[1]); g.lineTo(b2[0], b2[1]); g.stroke(); }
    }
    g.globalAlpha = 1;
  }
  if (look.beard && look.beard !== 'none') {
    const hc = new THREE.Color(look.hairColor);
    const dens = look.beard === 'stubble' ? 0.55 : 0.85;
    for (let i = 0; i < 11000; i++) {
      const x = r.float(-0.078, 0.078), y = r.float(-0.128, 0.0);
      const ax = Math.abs(x);
      const inBeard = y < -0.022 - Math.max(0, 0.03 - ax) * 0.6 && !(ax < 0.024 && Math.abs(y + 0.062) < 0.008) && (ax > 0.05 ? y < 0.005 : true);
      const mus = ax < 0.026 && y > -0.057 && y < -0.045;
      if (!inBeard && !mus) continue;
      if (look.beard === 'mustache' && !mus && r.next() > 0.2) continue;
      if (look.beard === 'keci' && !mus && !(ax < 0.022 && y < -0.065) && r.next() > 0.2) continue;
      const [px, py] = P(x, y);
      g.fillStyle = rgba(hc.clone().multiplyScalar(0.8), dens * r.float(0.3, 0.9));
      g.fillRect(px, py, 1.4, 1.4);
    }
  }
  // göz küresi: sklera, iris lifleri, göz bebeği, limbus, parlama
  {
    const cx = EYE_UV.cx * W, cy = (1 - EYE_UV.cy) * H, R = EYE_UV.r * W;
    g.fillStyle = '#d8d0c8'; g.fillRect(cx - R - 3, cy - R - 3, R * 2 + 6, R * 2 + 6);
    const sg = g.createRadialGradient(cx, cy, 0, cx, cy, R); sg.addColorStop(0, '#f6f2ec'); sg.addColorStop(0.7, '#ece4dc'); sg.addColorStop(1, '#d4b8b0');
    g.fillStyle = sg; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
    const ir = R * 0.46, ec = new THREE.Color(eye);
    const ig = g.createRadialGradient(cx, cy, ir * 0.25, cx, cy, ir);
    ig.addColorStop(0, hex(ec.clone().lerp(new THREE.Color('#e0c080'), 0.35))); ig.addColorStop(0.55, eye); ig.addColorStop(0.92, hex(ec.clone().multiplyScalar(0.55))); ig.addColorStop(1, '#100804');
    g.fillStyle = ig; g.beginPath(); g.arc(cx, cy, ir, 0, TAU); g.fill();
    g.strokeStyle = rgba(ec.clone().lerp(new THREE.Color('#ffffff'), 0.4), 0.35); g.lineWidth = 0.7;
    for (let k = 0; k < 40; k++) { const a = (k / 40) * TAU; g.beginPath(); g.moveTo(cx + Math.cos(a) * ir * 0.38, cy + Math.sin(a) * ir * 0.38); g.lineTo(cx + Math.cos(a + 0.1) * ir * 0.9, cy + Math.sin(a + 0.1) * ir * 0.9); g.stroke(); }
    g.fillStyle = '#040302'; g.beginPath(); g.arc(cx, cy, ir * 0.38, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(cx + ir * 0.32, cy - ir * 0.34, ir * 0.16, 0, TAU); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

// ---------------- malzeme ----------------
const VERT_PARS = `
attribute vec3 matp;
flat varying vec3 vMatp;
varying vec2 vDuv;
`;
const FRAG_PARS = `
uniform sampler2D tAtlas;
uniform sampler2D tAtlasN;
flat varying vec3 vMatp;
varying vec2 vDuv;
vec4 atlasSample(sampler2D t, vec2 uv, float tile) {
  float nr = step(99.5, tile);
  float id = tile - nr * 100.0;
  vec2 cell = vec2(mod(id, 4.0), floor(id / 4.0 + 0.001));
  vec2 f = nr > 0.5 ? clamp(uv, 0.0, 1.0) : fract(uv);
  const float PAD = 3.0 / 256.0;
  vec2 a = (cell + PAD + f * (1.0 - 2.0 * PAD)) * 0.25;
  vec2 gx = dFdx(uv) * (0.25 - 0.5 * PAD), gy = dFdy(uv) * (0.25 - 0.5 * PAD);
  return textureGrad(t, a, gx, gy);
}
`;
function patchShader(sh, depthOnly) {
  sh.uniforms.tAtlas = { value: charAtlas().albedo };
  if (!depthOnly) sh.uniforms.tAtlasN = { value: charAtlas().normal };
  sh.vertexShader = VERT_PARS + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vMatp = matp; vDuv = uv;');
  if (depthOnly) {
    sh.fragmentShader = FRAG_PARS.replace('uniform sampler2D tAtlasN;', '') + sh.fragmentShader.replace('#include <alphatest_fragment>',
      'if (vMatp.x > 99.5 && atlasSample(tAtlas, vDuv, vMatp.x).a < 0.5) discard;');
    return;
  }
  sh.fragmentShader = FRAG_PARS + sh.fragmentShader
    .replace('#include <map_fragment>', `
      vec4 texel;
      if (vMatp.x < -0.5) texel = texture2D(map, vDuv);
      else texel = atlasSample(tAtlas, vDuv, vMatp.x);
      if (texel.a < 0.5) discard;
      diffuseColor.rgb *= texel.rgb;`)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMatp.y;')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMatp.z;')
    .replace('#include <normal_fragment_maps>', `
      if (vMatp.x > -0.5 && vMatp.x != 12.0) {
        vec3 mapN = atlasSample(tAtlasN, vDuv, vMatp.x).xyz * 2.0 - 1.0;
        vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
        vec2 st0 = dFdx(vDuv), st1 = dFdy(vDuv);
        vec3 N = normal;
        vec3 q1p = cross(q1, N), q0p = cross(N, q0);
        vec3 Tg = q1p * st0.x + q0p * st1.x, Bg = q1p * st0.y + q0p * st1.y;
        float det = max(dot(Tg, Tg), dot(Bg, Bg));
        float sc = det == 0.0 ? 0.0 : inversesqrt(det);
        normal = normalize(Tg * sc * mapN.x + Bg * sc * mapN.y + N * mapN.z);
      }`);
}
const matCache = new Map();
let depthMat = null;
export function charMaterial(look) {
  const key = faceKey(look);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ map: faceTexture(look), vertexColors: true, roughness: 0.7, metalness: 0 });
  m.onBeforeCompile = (sh) => patchShader(sh, false);
  m.customProgramCacheKey = () => 'charMat2';
  matCache.set(key, m);
  return m;
}
// gölge: saç kartlarının alfa kesimi
export function charDepthMaterial() {
  if (depthMat) return depthMat;
  depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depthMat.onBeforeCompile = (sh) => patchShader(sh, true);
  depthMat.customProgramCacheKey = () => 'charDepth2';
  return depthMat;
}
// uzak LOD / taklit için (yüz dokusu gerekmez)
let farMat = null;
export function charFarMaterial() {
  if (farMat) return farMat;
  farMat = new THREE.MeshStandardMaterial({ map: faceTexture({ skin: '#c99572', gender: 'm', beard: 'none', hairColor: '#1a1410' }), vertexColors: true, roughness: 0.75 });
  farMat.onBeforeCompile = (sh) => patchShader(sh, false);
  farMat.customProgramCacheKey = () => 'charMat2';
  return farMat;
}
