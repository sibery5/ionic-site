// İnsan modeli için prosedürel geometri ve dokular: gövde, kafa, el, ayakkabı, saç, şapka, kıyafet katmanları.
// Tüm parçalar "bağlama pozunda" (ayakta, kollar aşağıda, +Z'ye bakış) dünya koordinatlarında üretilir,
// boyanır (vertex color) ve kemik grubuna göre birleştirilir. Hiçbir hazır varlık kullanılmaz.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeCanvas } from '../core/textures.js';
import { RNG } from '../core/util.js';

const _c = new THREE.Color();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------- iskelet ölçüleri (erkek, bağlama pozu) ----------------
export const RIG = {
  hips: 0.95, spine: 1.05, chest: 1.25, head: 1.56,
  shX: 0.2, shY: 1.45, elY: 1.16, wrY: 0.9,
  hipX: 0.095, hipY: 0.92, knY: 0.49, anY: 0.08,
};
// kafa merkezi (kafa kemiğine göre) ve yarıçaplar
export function headDims(f) { return f ? { cy: 0.112, cz: 0.012, rx: 0.073, ry: 0.108, rz: 0.094 } : { cy: 0.115, cz: 0.012, rx: 0.078, ry: 0.113, rz: 0.099 }; }

// ---------------- dokular ----------------
const texCache = new Map();
function cachedTex(key, fn) { if (!texCache.has(key)) texCache.set(key, fn()); return texCache.get(key); }
function canvasTex(c, repeat, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}

// Kumaş dokusu (gri tonlu, renk vertex'ten gelir). Deri için sabit UV tek bir açık teksel okur.
export function weaveTexture() {
  return cachedTex('weave', () => {
    const S = 64, c = makeCanvas(S, S), g = c.getContext('2d');
    const id = g.createImageData(S, S); const r = new RNG(5);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = Math.sin((x / S) * Math.PI * 32), wy = Math.sin((y / S) * Math.PI * 32);
      const diag = Math.sin(((x + y) / S) * Math.PI * 16);
      let v = 0.9 + 0.05 * (wx * (y % 4 < 2 ? 1 : -1)) + 0.03 * wy + 0.02 * diag + (r.next() - 0.5) * 0.05;
      if (x < 4 && y < 4) v = 0.97; // deri için düz teksel
      const k = (y * S + x) * 4; const b = Math.max(0, Math.min(255, v * 255));
      id.data[k] = id.data[k + 1] = id.data[k + 2] = b; id.data[k + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return canvasTex(c, [36, 30]);
  });
}
export function hairTexture() {
  return cachedTex('hairStrand', () => {
    const W = 128, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, W, H);
    const r = new RNG(11);
    for (let i = 0; i < 900; i++) {
      const x = r.float(0, W), l = r.float(20, 90), y = r.float(0, H), b = r.float(120, 255);
      g.strokeStyle = `rgba(${b},${b},${b},${r.float(0.25, 0.6)})`; g.lineWidth = r.float(0.5, 1.6);
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + r.float(-3, 3), y + l * 0.3, x + r.float(-3, 3), y + l * 0.6, x + r.float(-4, 4), y + l); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(0, 0, 3, 3);
    return canvasTex(c, [5, 2]);
  });
}

// Kafa UV eşlemesi: yüz önü (φ≈0) dokuda daha fazla piksel alır
export function headUV(dx, dy, dz) {
  const phi = Math.atan2(dx, dz);
  const lat = Math.asin(Math.max(-1, Math.min(1, dy)));
  const u = 0.5 + 0.5 * Math.sign(phi) * Math.pow(Math.abs(phi) / Math.PI, 0.6);
  return [u, (lat + Math.PI / 2) / Math.PI];
}

const EYE_COLORS = ['#3b2414', '#5a3a1c', '#2e4a2a', '#3a5a7a', '#6a5030'];
// Yüz dokusu: göz (iris, göz kapağı, kirpik), kaş, burun gölgesi, dudak, sakal/kirli sakal, ten gölgeleri
export function faceTexture(look) {
  const f = look.gender === 'f';
  const eye = look.eyeColor || EYE_COLORS[0];
  const old = ['#8a8a8a', '#aaaaaa', '#cccccc'].includes(look.hairColor);
  const key = ['face', look.skin, look.gender, look.beard, look.hairColor, eye, old].join('|');
  return cachedTex(key, () => {
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
    const tint = (dr, dg, db, k = 1) => { const t = skin.clone(); t.r = Math.max(0, Math.min(1, t.r * (1 + dr * k))); t.g = Math.max(0, Math.min(1, t.g * (1 + dg * k))); t.b = Math.max(0, Math.min(1, t.b * (1 + db * k))); return t; };
    g.fillStyle = look.skin; g.fillRect(0, 0, W, H);
    const r = new RNG(7);
    // ten dalgalanması
    for (let i = 0; i < 260; i++) {
      const x = r.float(0, W), y = r.float(0, H), rad = r.float(6, 30);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const tc = r.chance(0.5) ? tint(0.06, -0.02, -0.04) : tint(-0.05, -0.05, -0.04);
      gr.addColorStop(0, `rgba(${(tc.r * 255) | 0},${(tc.g * 255) | 0},${(tc.b * 255) | 0},0.25)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const blob = (x, y, rx, ry, col, a) => {
      const [px, py] = P(x, y), [sx, sy] = sc(x, y);
      g.save(); g.translate(px, py); g.scale(1, (ry * sy) / (rx * sx));
      const R = rx * sx; const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${a})`); gr.addColorStop(1, `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill(); g.restore();
    };
    // yanak kızarıklığı, burun ucu, göz altı ve şakak gölgeleri
    for (const s of [-1, 1]) {
      blob(s * 0.04, -0.03, 0.025, 0.02, tint(0.25, -0.08, -0.08), f ? 0.35 : 0.2);
      blob(s * 0.031, 0.0, 0.018, 0.008, tint(-0.25, -0.25, -0.15), 0.35);
      blob(s * 0.034, 0.016, 0.02, 0.013, tint(-0.3, -0.3, -0.22), 0.4);
      blob(s * 0.06, 0.03, 0.02, 0.03, tint(-0.15, -0.15, -0.1), 0.3);
      blob(s * 0.045, -0.085, 0.025, 0.02, tint(-0.12, -0.12, -0.1), 0.25);
    }
    blob(0, -0.04, 0.014, 0.012, tint(0.18, -0.05, -0.05), 0.35);
    blob(0, -0.1, 0.03, 0.02, tint(-0.1, -0.1, -0.08), 0.25);
    // burun yan gölgeleri ve delikleri
    for (const s of [-1, 1]) {
      blob(s * 0.012, -0.015, 0.006, 0.02, tint(-0.3, -0.3, -0.25), 0.4);
      blob(s * 0.009, -0.043, 0.005, 0.003, new THREE.Color('#2a1510'), 0.75);
    }
    // gözler
    for (const s of [-1, 1]) {
      const ex = s * 0.031, ey = 0.012;
      const [px, py] = P(ex, ey), [sx, sy] = sc(ex, ey);
      const ew = 0.0135 * sx, eh = 0.0052 * sy;
      const almond = () => { g.beginPath(); g.moveTo(px - ew, py); g.bezierCurveTo(px - ew * 0.5, py - eh * 1.25, px + ew * 0.5, py - eh * 1.3, px + ew, py - eh * 0.1); g.bezierCurveTo(px + ew * 0.5, py + eh * 1.0, px - ew * 0.5, py + eh * 1.0, px - ew, py); g.closePath(); };
      g.save(); almond(); g.clip();
      const sg = g.createRadialGradient(px, py, 0, px, py, ew); sg.addColorStop(0, '#f4efe8'); sg.addColorStop(1, '#c8b8ac');
      g.fillStyle = sg; g.fillRect(px - ew, py - eh * 2, ew * 2, eh * 4);
      const ir = 0.0056 * sx, ix = px + s * ew * 0.04;
      const ig = g.createRadialGradient(ix, py, ir * 0.2, ix, py, ir); ig.addColorStop(0, hex(new THREE.Color(eye).lerp(new THREE.Color('#ffffff'), 0.25))); ig.addColorStop(0.75, eye); ig.addColorStop(1, '#100804');
      g.fillStyle = ig; g.beginPath(); g.arc(ix, py, ir, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#050302'; g.beginPath(); g.arc(ix, py, ir * 0.42, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(ix + ir * 0.35, py - ir * 0.35, ir * 0.18, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(40,20,10,0.35)'; g.fillRect(px - ew, py - eh * 2, ew * 2, eh * 1.15); // üst kapak gölgesi
      g.restore();
      // göz kapağı çizgisi + kirpik
      g.strokeStyle = f ? '#120a06' : '#2a1a12'; g.lineWidth = Math.max(1.5, 0.0012 * sy * (f ? 1.8 : 1)); g.lineCap = 'round';
      g.beginPath(); g.moveTo(px - ew, py); g.bezierCurveTo(px - ew * 0.5, py - eh * 1.25, px + ew * 0.5, py - eh * 1.3, px + ew * 1.05, py - eh * 0.2); g.stroke();
      g.strokeStyle = 'rgba(60,30,20,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(px - ew * 0.8, py + eh * 0.55); g.quadraticCurveTo(px, py + eh * 1.05, px + ew * 0.9, py + eh * 0.2); g.stroke();
      // kapak kıvrımı
      g.strokeStyle = hex(tint(-0.35, -0.35, -0.3)); g.globalAlpha = 0.5; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(px - ew * 0.9, py - eh * 1.1); g.quadraticCurveTo(px, py - eh * 2.3, px + ew * 0.95, py - eh * 1.0); g.stroke(); g.globalAlpha = 1;
      if (f) { g.fillStyle = 'rgba(90,50,70,0.18)'; g.beginPath(); g.ellipse(px, py - eh * 1.6, ew * 1.05, eh * 1.2, 0, 0, Math.PI * 2); g.fill(); }
      // kaş: kısa kıl darbeleri
      const bc = new THREE.Color(look.hairColor); if (bc.getHSL({}).l > 0.45) bc.multiplyScalar(0.7);
      g.strokeStyle = hex(bc); g.lineWidth = 1.3;
      const n = f ? 26 : 40;
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        const bx = s * (0.012 + t * 0.04), by = 0.031 + Math.sin(t * Math.PI * 0.85) * 0.006 - t * 0.002 + (f ? 0.002 : 0);
        const th = (f ? 0.0022 : 0.0042) * (1 - t * 0.5);
        const [qx, qy] = P(bx, by);
        for (let m = 0; m < 2; m++) {
          const oy = (r.next() - 0.5) * th * sy;
          g.globalAlpha = 0.55 + r.next() * 0.4;
          g.beginPath(); g.moveTo(qx, qy + oy + th * sy * 0.5); g.lineTo(qx + s * th * sx * (0.8 + t), qy + oy - th * sy * 0.5); g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
    // dudaklar
    {
      const [mx, my] = P(0, -0.062), [sx, sy] = sc(0, -0.062);
      const mw = (f ? 0.021 : 0.022) * sx, uh = (f ? 0.0055 : 0.0042) * sy, lh = (f ? 0.007 : 0.0055) * sy;
      const lip = f ? new THREE.Color('#a8404c').lerp(skin, 0.25) : tint(0.2, -0.18, -0.12).lerp(new THREE.Color('#8a4a40'), 0.3);
      g.fillStyle = hex(lip);
      g.beginPath(); g.moveTo(mx - mw, my); g.quadraticCurveTo(mx - mw * 0.5, my - uh * 1.1, mx - mw * 0.12, my - uh); g.quadraticCurveTo(mx, my - uh * 0.6, mx + mw * 0.12, my - uh); g.quadraticCurveTo(mx + mw * 0.5, my - uh * 1.1, mx + mw, my); g.closePath(); g.fill();
      g.fillStyle = hex(lip.clone().lerp(new THREE.Color('#ffffff'), 0.06));
      g.beginPath(); g.moveTo(mx - mw * 0.95, my); g.quadraticCurveTo(mx, my + lh * 1.5, mx + mw * 0.95, my); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,10,10,0.7)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(mx - mw, my); g.quadraticCurveTo(mx, my + 1.5, mx + mw, my); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(mx, my + lh * 0.6, mw * 0.4, lh * 0.25, 0, 0, Math.PI * 2); g.fill();
    }
    // yaşlılık kırışıkları
    if (old) {
      g.strokeStyle = hex(tint(-0.3, -0.3, -0.25)); g.globalAlpha = 0.35; g.lineWidth = 1.2;
      for (const yy of [0.05, 0.058, 0.066]) { const a = P(-0.03, yy), b = P(0, yy + 0.002), d = P(0.03, yy); g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], b[1], d[0], d[1]); g.stroke(); }
      for (const s of [-1, 1]) { const a = P(s * 0.016, -0.04), b = P(s * 0.028, -0.07); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      g.globalAlpha = 1;
    }
    // sakal: kirli sakal noktaları (bıyık/gür sakal geometriyle desteklenir)
    if (look.beard !== 'none') {
      const hc = new THREE.Color(look.hairColor);
      const dens = look.beard === 'stubble' ? 0.55 : 0.8;
      for (let i = 0; i < 9000; i++) {
        const x = r.float(-0.075, 0.075), y = r.float(-0.125, 0.0);
        const ax = Math.abs(x);
        const inBeard = y < -0.022 - Math.max(0, 0.03 - ax) * 0.6 && !(ax < 0.024 && Math.abs(y + 0.063) < 0.008) && (ax > 0.05 ? y < 0.005 : true);
        const mus = ax < 0.026 && y > -0.058 && y < -0.046;
        if (!inBeard && !mus) continue;
        if (look.beard === 'mustache' && !mus && r.next() > 0.25) continue;
        const [px, py] = P(x, y);
        g.fillStyle = `rgba(${(hc.r * 200) | 0},${(hc.g * 200) | 0},${(hc.b * 200) | 0},${dens * r.float(0.3, 0.9)})`;
        g.fillRect(px, py, 1.4, 1.4);
      }
    }
    // gövde şeridi (kulak, el, boyun için düz ten): dokunun alt-sol köşesi
    g.fillStyle = look.skin; g.fillRect(0, H - 24, 64, 24);
    g.fillStyle = hex(tint(-0.18, -0.2, -0.16)); g.fillRect(64, H - 24, 64, 24);
    const t = canvasTex(c, null); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1, 1);
    return t;
  });
}
export const SKIN_UV = [0.06, 0.02];
export const SKIN_DARK_UV = [0.18, 0.02];

// ---------------- geometri yardımcıları ----------------
// Geometriyi ortak formata getir: position, normal, uv, color (indeksli)
function norm(geo, color, uvFix) {
  if (!geo.index) { const n = geo.attributes.position.count; const idx = []; for (let i = 0; i < n; i++) idx.push(i); geo.setIndex(idx); }
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  const n = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (uvFix) { const uv = geo.attributes.uv; for (let i = 0; i < n; i++) uv.setXY(i, uvFix[0], uvFix[1]); }
  const col = new Float32Array(n * 3);
  if (color !== undefined) { _c.set(color); for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; } }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
// Konuma göre boyama: fn(x,y,z) -> renk (hex/Color) ya da null (değiştirme)
function paint(geo, fn) {
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    if (v !== null && v !== undefined) { _c.set(v); c.setXYZ(i, _c.r, _c.g, _c.b); }
  }
  return geo;
}
// Profil [yarıçap, y] listesinden döndürülmüş gövde; sx/sz eliptik ölçek, z ofset
function lathe(prof, seg, sx = 1, sz = 1, ox = 0, oz = 0) {
  const pts = prof.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.scale(sx, 1, sz); g.translate(ox, 0, oz);
  return g;
}
// profil aralığını örnekle ve yarıçapa ofset ekle
function sampleProf(prof, y0, y1, off = 0, n = 8, closeBottom = false, closeTop = false) {
  const at = (y) => {
    for (let i = 0; i < prof.length - 1; i++) {
      const a = prof[i], b = prof[i + 1];
      if (y >= a[1] && y <= b[1]) { const t = (y - a[1]) / (b[1] - a[1] || 1); const s = t * t * (3 - 2 * t) * 0.4 + t * 0.6; return a[0] + (b[0] - a[0]) * s; }
    }
    return y < prof[0][1] ? prof[0][0] : prof[prof.length - 1][0];
  };
  const out = [];
  if (closeBottom) out.push([0, y0]);
  for (let i = 0; i <= n; i++) { const y = y0 + (y1 - y0) * (i / n); out.push([at(y) + off, y]); }
  if (closeTop) out.push([0, y1]);
  return out;
}
function sph(rx, ry, rz, x, y, z, ws = 12, hs = 8) { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); g.translate(x, y, z); return g; }
function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function cyl(rt, rb, h, x, y, z, seg = 12, open = false, ts = 0, tl = Math.PI * 2) { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl); g.translate(x, y, z); return g; }
function caps(r, len, seg = 8) { const g = new THREE.CapsuleGeometry(r, len, 3, seg); return g; }
function mirrorX(geo) {
  const g = geo.clone(); g.scale(-1, 1, 1);
  const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  return g;
}

// ---------------- vücut profilleri ----------------
function torsoProf(f, b) {
  const w = b;
  return f
    ? [[0, 0.83], [0.12, 0.85], [0.165 * w, 0.9], [0.178 * w, 0.96], [0.165 * w, 1.02], [0.13 * w, 1.09], [0.128 * w, 1.13], [0.138 * w, 1.2], [0.15 * w, 1.28], [0.152 * w, 1.35], [0.155 * w, 1.4], [0.138, 1.445], [0.1, 1.475], [0.052, 1.495], [0.045, 1.52]]
    : [[0, 0.83], [0.13 * w, 0.85], [0.163 * w, 0.9], [0.172 * w, 0.96], [0.16 * w, 1.03], [0.15 * w, 1.09], [0.152 * w, 1.15], [0.165 * w, 1.24], [0.178 * w, 1.32], [0.185 * w, 1.39], [0.172 * w, 1.44], [0.12, 1.475], [0.062, 1.5], [0.054, 1.53]];
}
const DEPTH = 0.62;
const UPPER = [[0, 0.05], [0.035, 0.042], [0.05, 0.02], [0.056, -0.01], [0.051, -0.07], [0.047, -0.15], [0.041, -0.24], [0.038, -0.29], [0, -0.305]].reverse();
const FORE = [[0, 0.03], [0.034, 0.022], [0.04, -0.03], [0.038, -0.09], [0.031, -0.19], [0.025, -0.25], [0, -0.27]].reverse();
const THIGH = [[0, 0.07], [0.07, 0.055], [0.088, 0.0], [0.085, -0.1], [0.074, -0.24], [0.06, -0.37], [0.054, -0.42], [0, -0.45]].reverse();
const SHIN = [[0, 0.035], [0.05, 0.025], [0.056, -0.05], [0.056, -0.11], [0.045, -0.24], [0.034, -0.36], [0.031, -0.39], [0, -0.41]].reverse();

// kafa şekli: birim küre yönü -> kafa yüzeyi (kafa kemiği uzayında)
export function headPoint(f, dx, dy, dz, out) {
  const D = headDims(f);
  let x = dx * D.rx, y = dy * D.ry, z = dz * D.rz;
  // çene ve yanaklar: alt bölgede daralma
  const low = smooth(0.0, -0.95, dy);
  x *= 1 - low * (f ? 0.33 : 0.27);
  if (dz > 0) z *= 1 - low * 0.12; else z *= 1 - low * 0.45;
  // kafatası arkası
  if (dz < 0 && dy > -0.2) z *= 1.06;
  // yüz düzlüğü
  if (dz > 0.3) z -= (dz - 0.3) * 0.012;
  const fy = y, fx = x;
  if (dz > 0.2) {
    const g2 = (cx, cy, sx, sy) => Math.exp(-(((fx - cx) / sx) ** 2) - (((fy - cy) / sy) ** 2));
    // burun
    let nose = 0;
    if (fy > -0.05 && fy < 0.018) {
      const t = (0.018 - fy) / 0.068; // 0 köprü, 1 uç
      const A = (f ? 0.017 : 0.021) * (0.35 + 0.65 * Math.pow(t, 1.4)) * (fy < -0.04 ? Math.max(0, 1 - (-0.04 - fy) / 0.01) : 1);
      const wN = 0.008 + t * 0.008;
      nose = A * Math.exp(-((fx / wN) ** 2));
    }
    z += nose;
    z += (f ? 0.004 : 0.006) * g2(0, 0.03, 0.05, 0.008); // kaş kemeri
    for (const s of [-1, 1]) {
      z -= 0.006 * g2(s * 0.031, 0.012, 0.014, 0.009); // göz çukuru
      z += 0.004 * g2(s * 0.045, -0.02, 0.018, 0.014); // elmacık
    }
    z += (f ? 0.0055 : 0.004) * g2(0, -0.062, 0.02, 0.009); // dudak
    z -= 0.002 * g2(0, -0.075, 0.015, 0.005);
    z += (f ? 0.003 : 0.006) * g2(0, -0.098, 0.02, 0.015); // çene ucu
  }
  return out.set(x, y + D.cy, z + D.cz);
}

// ---------------- saç ve şapka ----------------
const HAIR_T = { kisa: 0.009, arkaya: 0.013, kel: 0, uzun: 0.012, kivircik: 0.026, at_kuyrugu: 0.008 };
function hairline(style, f, aphi) {
  const tbl = style === 'uzun'
    ? [[0, 0.062], [0.55, 0.068], [0.9, 0.03], [1.2, -0.06], [3.2, -0.07]]
    : [[0, f ? 0.062 : 0.057], [0.55, 0.068], [0.95, 0.034], [1.1, -0.018], [1.28, -0.02], [1.4, 0.028], [1.75, 0.035], [2.1, 0.0], [2.6, -0.062], [3.2, -0.068]];
  for (let i = 0; i < tbl.length - 1; i++) if (aphi <= tbl[i + 1][0]) { const t = (aphi - tbl[i][0]) / (tbl[i + 1][0] - tbl[i][0]); return tbl[i][1] + (tbl[i + 1][1] - tbl[i][1]) * t; }
  return -0.07;
}
// küre üzerinde örtü kabuğu (saç, sakal, şapka): cov(x,y,z,phi)->0..1, th -> kalınlık
function shell(f, covFn, thFn, ws = 40, hs = 30, mod) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position, uv = g.attributes.uv;
  const D = headDims(f);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  const cov = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
    headPoint(f, dx, dy, dz, v);
    const ly = v.y - D.cy, phi = Math.atan2(dx, dz);
    const c = covFn(v.x, ly, v.z - D.cz, phi);
    cov[i] = c;
    n.set(dx / D.rx, dy / D.ry, dz / D.rz).normalize();
    const t = c > 0.001 ? 0.0015 + thFn(v.x, ly, v.z - D.cz, phi) * c : 0;
    v.addScaledVector(n, t);
    if (mod) mod(v, ly, phi, dx, dy, dz);
    p.setXYZ(i, v.x, v.y, v.z);
    uv.setXY(i, phi / Math.PI * 0.5 + 0.5, dy * 0.5 + 0.5);
  }
  const idx = g.index.array, keep = [];
  for (let i = 0; i < idx.length; i += 3) if (cov[idx[i]] > 0.02 && cov[idx[i + 1]] > 0.02 && cov[idx[i + 2]] > 0.02) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  g.setIndex(keep);
  g.computeVertexNormals();
  return g;
}
function hairParts(L, f) {
  const hs = L.hair, out = [];
  if (hs === 'kel' || !HAIR_T[hs]) return out;
  const T = HAIR_T[hs];
  const rn = new RNG(3);
  const lumps = Array.from({ length: 10 }, () => [rn.float(2, 6), rn.float(2, 6), rn.float(0, 6)]);
  const cap = shell(f,
    (x, y, z, phi) => smooth(hairline(hs, f, Math.abs(phi)), hairline(hs, f, Math.abs(phi)) + 0.014, y),
    (x, y, z, phi) => {
      let t = T;
      if (hs === 'kisa') t += 0.004 * smooth(0.04, 0.1, y) * (z > 0 ? 1 : 0.5);
      if (hs === 'arkaya') t += 0.006 * smooth(0.0, 0.1, y) + (z < 0 ? 0.004 : 0);
      if (hs === 'kivircik') { let k = 0; for (const [a, b, c] of lumps) k += Math.sin(phi * a + c) * Math.sin(y * 60 * b / 4 + c); t += 0.006 * k / 3; }
      if (hs === 'uzun') t += 0.004 * smooth(0.0, 0.1, y);
      return t;
    });
  out.push(cap);
  if (hs === 'uzun') {
    // omuza dökülen saç perdesi (arka ve yanlar)
    const D = headDims(f);
    const g = new THREE.CylinderGeometry(1, 1, 1, 22, 6, true, Math.PI * 0.32, Math.PI * 1.36);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const ax = p.getX(i), ay = p.getY(i) + 0.5, az = p.getZ(i); // ay: 0 alt, 1 üst
      const y = -0.2 * (f ? 1 : 0.75) + ay * (D.cy + 0.02 + 0.2 * (f ? 1 : 0.75));
      const fl = 1 + (1 - ay) * 0.25;
      const wav = 1 + 0.03 * Math.sin(Math.atan2(ax, az) * 9 + ay * 3);
      p.setXYZ(i, ax * (D.rx + 0.016) * fl * wav, y, az * (D.rz + 0.012) * fl * wav + D.cz - 0.012);
    }
    g.computeVertexNormals();
    out.push(g);
  }
  if (hs === 'at_kuyrugu') {
    const D = headDims(f);
    const t = caps(0.026, 0.2, 8); t.scale(1, 1, 0.8); t.translate(0, -0.12, 0); t.rotateX(0.45); t.translate(0, D.cy + 0.03, D.cz - D.rz - 0.015);
    out.push(t);
    out.push(cyl(0.024, 0.024, 0.02, 0, D.cy + 0.035, D.cz - D.rz - 0.01, 10).rotateX(1.2));
  }
  return out;
}
function beardParts(L, f) {
  if (L.beard !== 'full' && L.beard !== 'mustache') return [];
  const full = L.beard === 'full';
  return [shell(f, (x, y, z) => {
    if (z < 0.0) return 0;
    const ax = Math.abs(x);
    const mus = ax < 0.027 && y > -0.058 && y < -0.044 ? 1 : 0;
    if (!full) return mus * smooth(0.03, 0.02, ax);
    if (ax < 0.024 && y > -0.072 && y < -0.054 && !mus) return 0;
    const top = -0.022 - Math.max(0, 0.032 - ax) * 0.7;
    return Math.max(mus, smooth(top, top - 0.012, y) * (ax > 0.055 && z < 0.03 ? smooth(-0.005, 0.03, z) : 1));
  }, (x, y) => (y < -0.08 ? 0.011 : 0.007), 44, 34)];
}
function hatParts(L, f) {
  const D = headDims(f);
  const T = HAIR_T[L.hair] || 0;
  const hc = L.hatColor, dark = '#101010';
  const main = [], gloss = [], metal = [];
  if (L.hat === 'bere') {
    main.push(norm(shell(f, (x, y) => smooth(0.035, 0.045, y), (x, y) => T + 0.012 + (y < 0.06 ? 0.006 : 0) + 0.01 * smooth(0.08, 0.12, y)), hc));
  } else if (L.hat === 'kasket') {
    main.push(norm(shell(f, (x, y, z) => smooth(0.04, 0.05, y + (z > 0 ? 0 : 0.01)), () => T + 0.01, 40, 30, (v, ly) => {
      if (ly > 0.07) { v.y = D.cy + 0.07 + (ly - 0.07) * 0.45; v.z += (ly - 0.07) * 0.35; v.x *= 1.04; }
    }), hc));
    const vis = cyl(0.1, 0.1, 0.008, 0, 0, 0, 20, false, -0.95, 1.9); vis.scale(1, 1, 0.75); vis.rotateX(0.22); vis.translate(0, D.cy + 0.052, D.cz + 0.025);
    main.push(norm(vis, hc));
  } else if (L.hat === 'fedora') {
    const cr = cyl(0.083 + T * 0.5, 0.093 + T * 0.5, 0.11, 0, 0, 0, 24); const p = cr.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.05) { const ax = Math.abs(p.getX(i)); p.setY(i, p.getY(i) - 0.016 * (1 - ax / 0.09) - (p.getZ(i) > 0.03 ? 0.01 : 0)); }
    cr.computeVertexNormals(); cr.scale(1, 1, 1.15); cr.translate(0, D.cy + 0.105, D.cz - 0.004);
    main.push(norm(cr, hc));
    const br = cyl(0.165, 0.165, 0.007, 0, 0, 0, 32); const bp = br.attributes.position;
    for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i); const r = Math.hypot(x, z); if (r > 0.1) bp.setY(i, bp.getY(i) + (Math.abs(x) / r) * (r - 0.1) * 0.35 - (Math.abs(z) / r) * (r - 0.1) * 0.25); }
    br.computeVertexNormals(); br.scale(1, 1, 1.12); br.translate(0, D.cy + 0.055, D.cz - 0.004);
    main.push(norm(br, hc));
    const band = cyl(0.096 + T * 0.5, 0.096 + T * 0.5, 0.024, 0, 0, 0, 24); band.scale(1, 1, 1.15); band.translate(0, D.cy + 0.07, D.cz - 0.004);
    main.push(norm(band, '#3a0c0c'));
  } else if (L.hat === 'police') {
    const cr = cyl(0.112 + T * 0.5, 0.092 + T * 0.5, 0.085, 0, 0, 0, 24); cr.scale(1, 1, 1.12); cr.translate(0, D.cy + 0.095, D.cz);
    main.push(norm(cr, hc));
    const band = cyl(0.094 + T * 0.5, 0.094 + T * 0.5, 0.026, 0, 0, 0, 24); band.scale(1, 1, 1.12); band.translate(0, D.cy + 0.066, D.cz);
    gloss.push(norm(band, dark));
    const vis = cyl(0.095, 0.095, 0.007, 0, 0, 0, 20, false, -0.9, 1.8); vis.scale(1, 1, 0.8); vis.rotateX(0.3); vis.translate(0, D.cy + 0.056, D.cz + 0.03);
    gloss.push(norm(vis, dark));
    metal.push(norm(box(0.03, 0.028, 0.008, 0, D.cy + 0.09, D.cz + D.rz + 0.02), '#d4af37'));
  }
  return { main, gloss, metal };
}

// ---------------- eller ----------------
function handGeo(fist, f) {
  const parts = [];
  const k = f ? 0.88 : 1;
  // avuç (sol el: avuç -X'e, başparmak +Z'ye bakar)
  parts.push(sph(0.017 * k, 0.046 * k, 0.04 * k, 0.002, -0.05 * k, 0.002, 12, 8));
  const fz = [0.027, 0.009, -0.009, -0.026], fl = [0.068, 0.076, 0.072, 0.058];
  for (let i = 0; i < 4; i++) {
    const r = 0.0085 * k * (i === 3 ? 0.9 : 1);
    if (!fist) {
      const c = caps(r, fl[i] * k - r * 2, 6); c.translate(0, -fl[i] * k / 2, 0); c.rotateZ(-0.15); c.translate(-0.003, -0.088 * k, fz[i] * k); parts.push(c);
    } else {
      const a = caps(r, 0.03 * k, 6); a.rotateZ(Math.PI / 2); a.translate(-0.016 * k, -0.096 * k, fz[i] * k); parts.push(a);
      const b = caps(r, 0.025 * k, 6); b.translate(-0.03 * k, -0.08 * k, fz[i] * k); parts.push(b);
    }
  }
  const th = caps(0.0095 * k, 0.04 * k, 6); th.translate(0, -0.025 * k, 0); th.rotateX(fist ? 0.9 : 0.55); th.rotateZ(fist ? 0.35 : 0.2); th.translate(-0.008, -0.03 * k, 0.03 * k); parts.push(th);
  return mergeGeometries(parts.map((p) => norm(p, undefined)));
}

// ---------------- ayakkabı ----------------
function shoeParts(L, f) {
  const type = L.shoes || 'sneaker', col = L.shoesColor || '#222222';
  const k = f ? 0.9 : 1;
  const m = [], gl = [];
  const up = sph(0.046 * k, 0.05, 0.13 * k, 0, -0.03, 0.045 * k, 16, 10);
  const p = up.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i); const z = p.getZ(i);
    if (y < -0.062) y = -0.062;
    if (z > 0.06 * k && y > -0.035) y = -0.035 + (y + 0.035) * (type === 'polished' ? 0.25 : 0.45); // burun basık
    if (type === 'polished' && z > 0.1 * k) p.setX(i, p.getX(i) * 0.82);
    p.setY(i, y);
  }
  up.computeVertexNormals();
  (type === 'polished' || type === 'boots' ? gl : m).push(norm(up, col));
  const soleCol = type === 'sneaker' ? (col === '#eeeeee' ? '#d8d8d8' : '#eeeeee') : '#1a1410';
  const st = type === 'sneaker' ? 0.026 : type === 'boots' ? 0.03 : 0.015;
  const sole = sph(0.05 * k, st / 2, 0.137 * k, 0, -0.07 + st / 2 - 0.008, 0.045 * k, 16, 6);
  const sp = sole.attributes.position; for (let i = 0; i < sp.count; i++) sp.setY(i, Math.max(sp.getY(i), -0.08));
  sole.computeVertexNormals();
  m.push(norm(sole, soleCol));
  if (type === 'sneaker') {
    for (let i = 0; i < 4; i++) m.push(norm(box(0.034 * k, 0.004, 0.008, 0, -0.01 - i * 0.006, (0.035 + i * 0.022) * k), '#f4f4f4'));
    m.push(norm(box(0.004, 0.022, 0.06, 0.047 * k, -0.045, 0.03), soleCol));
  }
  if (type === 'boots') {
    gl.push(norm(cyl(0.047, 0.05, 0.16, 0, 0.05, 0.0, 14), col));
    m.push(norm(sph(0.048 * k, 0.012, 0.06, 0, -0.072, -0.03, 12, 4), '#140c08'));
  }
  if (type === 'polished') m.push(norm(sph(0.042 * k, 0.012, 0.045, 0, -0.07, -0.04, 12, 4), '#140c08'));
  return { m, gl };
}

// ---------------- tüm vücut: kemik grubu -> {matte:[], gloss:[], metal:[], hair:[]} ----------------
const TOPS_LONG = ['shirt', 'jacket', 'leather', 'suit', 'coat', 'track', 'police'];
export function buildBody(L) {
  const f = L.gender === 'f';
  const b = Math.round((L.build || 1) / 0.06) * 0.06;
  const R = RIG;
  const skin = L.skin;
  const top = L.top || 'tshirt', tc = L.topColor || '#444444', sc = L.shirtColor || '#e8e8e8';
  const pants = L.pants || 'jeans', pc = L.pantsColor || '#2a3550';
  const tp = torsoProf(f, b);
  const tex = { tex: true };
  void tex;
  const G = {};
  const add = (grp, cls, geo) => { (G[grp] = G[grp] || { matte: [], gloss: [], metal: [], hair: [] })[cls].push(geo); };
  const leather = top === 'leather';
  const topCls = leather ? 'gloss' : 'matte';
  const shX = R.shX * (f ? 0.86 : 1) * (0.5 + b * 0.5);
  const hipX = R.hipX * (f ? 1.02 : 1) * (0.6 + b * 0.4);
  const longTop = TOPS_LONG.includes(top);
  const jacketLike = ['suit', 'coat'].includes(top);
  const vNeck = (x, y, z, y0) => z > 0 && Math.abs(x) < (y - y0) * 0.3 && y > y0;
  // gövde rengi (bağlama pozunda konuma göre)
  const torsoColor = (x, y, z) => {
    if (y > 1.476) return skin;
    if (jacketLike && vNeck(x, y, z, 1.13)) return sc;
    if ((top === 'leather' || top === 'jacket') && vNeck(x, y, z, 1.38)) return sc;
    if (top === 'track' && Math.abs(x) < 0.005 && z > 0) return '#bbbbbb';
    return tc;
  };
  // ---- kalça / pelvis (pantolon) ----
  const pelvis = lathe(sampleProf(tp, 0.83, 1.02, 0.004, 8, true), 22, 1, DEPTH);
  add('hips', 'matte', paint(norm(pelvis, pants === 'skirt' ? pc : pc), () => null));
  // kemer
  if (pants !== 'track' && pants !== 'skirt') {
    const belt = lathe(sampleProf(tp, 0.995, 1.025, 0.009, 2), 22, 1, DEPTH);
    add('hips', 'gloss', norm(belt, '#1c120c'));
    add('hips', 'metal', norm(box(0.04, 0.026, 0.01, 0, 1.01, tp[5][0] * DEPTH + 0.012), '#c0c0c0'));
  } else if (pants === 'track') add('hips', 'matte', norm(lathe(sampleProf(tp, 0.995, 1.025, 0.008, 2), 22, 1, DEPTH), pc));
  // ceket etekleri
  if (top === 'suit' || top === 'leather' || top === 'jacket' || top === 'coat' || top === 'police' || top === 'track') {
    const y0 = top === 'coat' ? 0.5 : top === 'suit' ? 0.82 : 0.95;
    const prof = sampleProf(tp, Math.max(0.86, y0), 1.06, 0.018, 6);
    if (top === 'coat') { prof.unshift([0.235 * b, 0.5], [0.21 * b, 0.65], [0.19 * b, 0.8]); }
    const hem = lathe(prof, 24, 1, top === 'coat' ? 0.8 : DEPTH + 0.02);
    paint(norm(hem, tc), (x, y, z) => (jacketLike && z > 0 && Math.abs(x) < 0.012 ? '#101010' : null));
    add('hips', top === 'leather' ? 'gloss' : 'matte', hem);
  }
  if (pants === 'skirt') {
    add('hips', 'matte', norm(lathe([[0.2 * b, 0.56], [0.19 * b, 0.7], [0.18 * b, 0.86], [0.175 * b, 0.98]], 24, 1, 0.72), pc));
  }
  // ---- karın (spine) ----
  const ab = lathe(sampleProf(tp, 1.0, 1.24, 0, 6), 22, 1, DEPTH);
  add('spine', topCls, paint(norm(ab, tc), torsoColor));
  if (L.top === 'tshirt') add('spine', 'matte', norm(lathe(sampleProf(tp, 1.0, 1.04, 0.008, 2), 22, 1, DEPTH), tc));
  // ---- göğüs ----
  const ch = lathe(sampleProf(tp, 1.2, 1.53, 0, 12, false, true), 22, 1, DEPTH, 0, 0.004);
  paint(norm(ch, tc), torsoColor);
  add('chest', topCls, ch);
  if (f) {
    for (const s of [-1, 1]) {
      const bu = sph(0.06 * b, 0.058, 0.05, s * 0.06 * b, 1.3, 0.055 * b, 12, 8);
      add('chest', topCls, paint(norm(bu, tc), (x, y, z) => torsoColor(x, y, z)));
    }
  }
  // boyun
  add('chest', 'matte', norm(lathe([[0, 1.44], [0.056, 1.45], [0.05 * (f ? 0.88 : 1), 1.5], [0.048 * (f ? 0.88 : 1), 1.57], [0.04, 1.62], [0, 1.625]], 14, 1, 0.95, 0, 0.0), skin, SKIN_UV));
  // yakalar
  if (['shirt', 'suit', 'coat', 'jacket', 'police'].includes(top)) {
    const cc = top === 'shirt' || top === 'police' ? tc : sc;
    const col = cyl(0.058, 0.064, 0.05, 0, 1.495, 0.004, 16, true); col.scale(1, 1, 0.95);
    add('chest', 'matte', norm(col, cc));
    for (const s of [-1, 1]) {
      const tip = box(0.035, 0.035, 0.006, s * 0.027, 1.47, 0.064); tip.rotateZ(0);
      const tg = tip.clone(); tg.translate(-s * 0.027, -1.47, -0.064); tg.rotateY(-s * 0.35); tg.rotateZ(s * 0.5); tg.translate(s * 0.03, 1.47, 0.06);
      add('chest', 'matte', norm(tg, cc));
    }
  }
  if (top === 'tshirt' || top === 'police') add('chest', 'matte', norm(cyl(0.064, 0.072, 0.014, 0, 1.47, 0.003, 18, true).scale(1, 1, 0.9), tc));
  if (top === 'leather' || top === 'track' || top === 'jacket') {
    const col = cyl(0.07, 0.082, 0.055, 0, 1.49, 0.0, 18, true, Math.PI * 0.12, Math.PI * 1.76); col.scale(1, 1, 0.92);
    add('chest', topCls, norm(col, tc));
  }
  // kravat, yaka devrikleri, düğmeler, fermuar
  const frontZ = (y) => { let r = 0; for (let i = 0; i < tp.length - 1; i++) if (y >= tp[i][1] && y <= tp[i + 1][1]) r = tp[i][0] + (tp[i + 1][0] - tp[i][0]) * (y - tp[i][1]) / (tp[i + 1][1] - tp[i][1]); return r * DEPTH + 0.004; };
  if (top === 'suit' || top === 'coat') {
    if (top === 'suit' || L.tie) {
      const tie = new THREE.BufferGeometry().copy(box(0.04, 0.3, 0.008, 0, 0, 0)); const p = tie.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); const w = y > 0 ? 0.6 : 1; p.setX(i, p.getX(i) * w); if (y < -0.14) p.setX(i, p.getX(i) * 0.5); }
      tie.translate(0, 1.29, 0); const tp2 = tie.attributes.position; for (let i = 0; i < tp2.count; i++) tp2.setZ(i, tp2.getZ(i) + frontZ(tp2.getY(i)) + 0.004);
      add('chest', 'matte', norm(tie, L.tieColor || '#7a0f14'));
      add('chest', 'matte', norm(box(0.03, 0.025, 0.02, 0, 1.445, frontZ(1.445) + 0.008), L.tieColor || '#7a0f14'));
    }
    for (const s of [-1, 1]) {
      // yaka devriği: V kenarı boyunca
      const pts = [];
      for (let i = 0; i <= 6; i++) { const y = 1.14 + i * 0.05; pts.push([s * ((y - 1.13) * 0.3 + 0.004), y]); }
      const lap = new THREE.BufferGeometry(); const pos = [], idx = [];
      pts.forEach(([x, y], i) => { const w = 0.012 + (i / 6) * 0.045 - (i === 5 ? 0.02 : 0); const z = frontZ(y) + 0.006; pos.push(x, y, z, x + s * w, y - 0.012, frontZ(y - 0.012) + 0.004 + (x !== 0 ? 0 : 0)); if (i) { const a = (i - 1) * 2; if (s > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
      lap.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lap.setIndex(idx); lap.computeVertexNormals();
      add('chest', 'matte', norm(lap, new THREE.Color(tc).multiplyScalar(0.8)));
    }
    for (const y of top === 'coat' ? [1.12, 1.0, 0.88] : [1.11, 1.03]) {
      add(y > 1.0 ? 'spine' : 'hips', 'gloss', norm(sph(0.007, 0.007, 0.004, 0.012, y, frontZ(Math.max(1.0, y)) + 0.012), '#111111'));
      if (top === 'coat') add(y > 1.0 ? 'spine' : 'hips', 'gloss', norm(sph(0.007, 0.007, 0.004, -0.04, y, frontZ(Math.max(1.0, y)) + 0.008), '#111111'));
    }
    add('chest', 'matte', norm(box(0.05, 0.012, 0.004, 0.09 * b, 1.33, frontZ(1.33) + 0.002).rotateY(0), '#e8e8e8'));
  }
  if (top === 'shirt' || top === 'police' || top === 'jacket') {
    for (const y of [1.42, 1.34, 1.26, 1.18, 1.1]) add(y > 1.22 ? 'chest' : 'spine', 'matte', norm(sph(0.0055, 0.0055, 0.003, 0, y, frontZ(y) + 0.002, 8, 6), top === 'jacket' ? '#b08a4a' : '#dddddd'));
    for (const s of [-1, 1]) if (top !== 'police' || s > 0) add('chest', 'matte', norm(box(0.065, 0.07, 0.008, s * 0.075 * b, 1.32, frontZ(1.32) + 0.002), new THREE.Color(tc).multiplyScalar(0.92)));
  }
  if (top === 'leather' || top === 'track') {
    const zip = box(0.008, 0.46, 0.006, top === 'leather' ? 0.02 : 0, 1.14, 0);
    const zp = zip.attributes.position; for (let i = 0; i < zp.count; i++) zp.setZ(i, zp.getZ(i) + frontZ(zp.getY(i)) + 0.003);
    add('chest', 'metal', norm(zip, '#8a8a8a'));
    add('chest', 'metal', norm(box(0.012, 0.025, 0.006, 0.02, 1.38, frontZ(1.38) + 0.008), '#b0b0b0'));
  }
  if (top === 'police') {
    add('chest', 'metal', norm(box(0.045, 0.055, 0.008, 0.075 * b, 1.37, frontZ(1.37) + 0.009), '#d4af37'));
    for (const s of [-1, 1]) add('chest', 'matte', norm(box(0.05, 0.01, 0.09, s * (shX - 0.02), 1.47, 0), '#0e1a33'));
    add('chest', 'matte', norm(box(0.26, 0.05, 0.006, 0, 1.3, -(tp[8][0] * DEPTH) - 0.004), '#e8e8e8'));
  }
  if (L.chain) {
    const t = new THREE.TorusGeometry(0.085, 0.0055, 5, 30); t.scale(1, 1.35, 1); t.rotateX(Math.PI / 2 - 0.55); t.translate(0, 1.425, 0.055);
    add('chest', 'metal', norm(t, '#d4af37'));
  }
  // ---- kollar ----
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const ax = s * shX;
    const k = f ? 0.84 : 1;
    const ug = lathe(UPPER.map(([r, y]) => [r * k * (0.6 + 0.4 * b), y + R.shY]), 14, 1, 1, ax, 0);
    const ucol = (x, y) => (top === 'tshirt' ? (y > R.shY - 0.15 ? tc : skin) : tc);
    let ucls = leather ? 'gloss' : 'matte';
    paint(norm(ug, tc), (x, y, z) => {
      const c = ucol(x, y);
      if (top === 'track' && Math.abs(x - ax) > 0.04 && x * s > ax * s && Math.abs(z) < 0.012) return '#f2f2f2';
      return c;
    });
    if (top === 'tshirt') {
      // ten kısmı ayrı UV ile: kumaş dokusu almasın diye ayrı geometri
      const skinPart = lathe(sampleProf(UPPER.map(([r, y]) => [r * k * (0.6 + 0.4 * b), y]), -0.3, -0.14, 0, 5, true), 14, 1, 1, ax, 0);
      skinPart.translate(0, R.shY, 0);
      const cloth = lathe(sampleProf(UPPER.map(([r, y]) => [r * k * (0.6 + 0.4 * b), y]), -0.15, 0.05, 0.006, 6, false, true), 14, 1, 1, ax, 0);
      cloth.translate(0, R.shY, 0);
      add('sh' + side, 'matte', norm(skinPart, skin, SKIN_UV));
      add('sh' + side, 'matte', norm(cloth, tc));
    } else add('sh' + side, ucls, ug);
    // önkol
    const fg = lathe(FORE.map(([r, y]) => [r * k * (0.6 + 0.4 * b), y + R.elY]), 14, 1, 0.92, ax, 0);
    if (longTop) {
      paint(norm(fg, tc), (x, y, z) => (top === 'track' && x * s > ax * s + 0.03 && Math.abs(z) < 0.011 ? '#f2f2f2' : null));
      add('el' + side, ucls, fg);
      const cuffC = jacketLike || top === 'leather' || top === 'jacket' ? sc : tc;
      const cuff = cyl(0.031 * k, 0.033 * k, 0.03, ax, R.wrY + 0.035, 0, 12, true);
      add('el' + side, 'matte', norm(cuff, top === 'track' ? tc : cuffC));
    } else add('el' + side, 'matte', norm(fg, skin, SKIN_UV));
    if (L.watch && s < 0) add('el' + side, 'metal', norm(cyl(0.03, 0.03, 0.015, ax, R.wrY + 0.03, 0, 12), '#c8c8c8'));
  }
  // ---- bacaklar ----
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const lx = s * hipX;
    const k = f ? 0.93 : 1;
    const shortP = pants === 'shorts' || pants === 'skirt';
    const tg = lathe(THIGH.map(([r, y]) => [r * k * (0.65 + 0.35 * b), y + R.hipY]), 16, 1, 1, lx, 0);
    if (shortP) {
      const cut = pants === 'skirt' ? R.hipY + 0.06 : R.hipY - 0.3;
      const cl = lathe(sampleProf(THIGH.map(([r, y]) => [r * k * (0.65 + 0.35 * b), y]), cut - R.hipY, 0.07, pants === 'shorts' ? 0.012 : 0, 6, false, true), 16, 1, 1, lx, 0).translate(0, R.hipY, 0);
      const sk = lathe(sampleProf(THIGH.map(([r, y]) => [r * k * (0.65 + 0.35 * b), y]), -0.45, cut - R.hipY + 0.01, 0, 6, true), 16, 1, 1, lx, 0).translate(0, R.hipY, 0);
      add('hip' + side, 'matte', norm(cl, pc));
      add('hip' + side, 'matte', norm(sk, skin, SKIN_UV));
      add('kn' + side, 'matte', norm(lathe(SHIN.map(([r, y]) => [r * k, y + R.knY]), 14, 1, 1, lx, 0), skin, SKIN_UV));
    } else {
      paint(norm(tg, pc), (x, y, z) => {
        if (pants === 'track' && x * s > lx * s + 0.06 && Math.abs(z) < 0.014) return '#f2f2f2';
        if (pants === 'jeans' && x * s > lx * s + 0.07 && Math.abs(z) < 0.008) return new THREE.Color(pc).multiplyScalar(1.35);
        return null;
      });
      add('hip' + side, 'matte', tg);
      const shg = lathe(SHIN.map(([r, y]) => [(r + (pants === 'slacks' ? 0.012 : 0.008)) * k, y + R.knY]), 14, 1, 1, lx, 0);
      paint(norm(shg, pc), (x, y, z) => (pants === 'track' && x * s > lx * s + 0.03 && Math.abs(z) < 0.014 ? '#f2f2f2' : null));
      add('kn' + side, 'matte', shg);
      // paça
      add('kn' + side, 'matte', norm(cyl(pants === 'track' ? 0.036 : 0.05, pants === 'track' ? 0.036 : 0.052, 0.05, lx, R.anY + 0.07, 0.005, 14, true), pc));
    }
    // ayakkabı (ayak bileği grubu)
    const sp = shoeParts(L, f);
    for (const g of sp.m) { g.translate(lx, R.anY, 0); add('an' + side, 'matte', g); }
    for (const g of sp.gl) { g.translate(lx, R.anY, 0); add('an' + side, 'gloss', g); }
  }
  // ---- kafa (yüz dokusu hariç kısımlar) ----
  const D = headDims(f);
  for (const s of [-1, 1]) {
    const ear = sph(0.011, 0.029 * (f ? 0.9 : 1), 0.019, 0, 0, 0, 10, 8); ear.rotateY(s * 0.35); ear.rotateZ(-s * 0.12);
    ear.translate(s * (D.rx - 0.002), D.cy - 0.005, D.cz - 0.012);
    const p = ear.attributes.position; const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { const outer = (p.getX(i) - s * (D.rx - 0.002)) * s > 0.004; uv[i * 2] = outer ? SKIN_DARK_UV[0] : SKIN_UV[0]; uv[i * 2 + 1] = 0.02; }
    norm(ear, skin); ear.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    add('head', 'matte', ear);
  }
  for (const g of hairParts(L, f)) add('head', 'hair', norm(g, L.hairColor));
  for (const g of beardParts(L, f)) add('head', 'hair', norm(g, L.hairColor));
  const hp = hatParts(L, f);
  hp.main.forEach((g) => add('head', 'matte', g)); hp.gloss.forEach((g) => add('head', 'gloss', g)); hp.metal.forEach((g) => add('head', 'metal', g));
  if (L.glasses) {
    const z = D.cz + D.rz + 0.004;
    for (const s of [-1, 1]) {
      const lens = cyl(0.019, 0.019, 0.004, 0, 0, 0, 16); lens.rotateX(Math.PI / 2); lens.scale(1.15, 0.78, 1); lens.translate(s * 0.032, D.cy + 0.013, z - 0.004);
      add('head', 'gloss', norm(lens, '#050505'));
      add('head', 'gloss', norm(box(0.004, 0.004, 0.1, s * (D.rx + 0.004), D.cy + 0.018, z - 0.055), '#080808'));
    }
    add('head', 'gloss', norm(box(0.11, 0.005, 0.005, 0, D.cy + 0.026, z - 0.002), '#080808'));
  }
  return { groups: G, shX, hipX, b, f };
}

// Kafatası (yüz dokulu) geometrisi
const skullCache = new Map();
export function skullGeo(f) {
  if (skullCache.has(f)) return skullCache.get(f);
  const g = new THREE.SphereGeometry(1, 44, 34);
  const p = g.attributes.position, uv = g.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
    headPoint(f, dx, dy, dz, v);
    p.setXYZ(i, v.x, v.y, v.z);
    const [u, w] = headUV(dx, dy, dz);
    uv.setXY(i, u, w * 0.94 + 0.055);
  }
  g.computeVertexNormals();
  // UV dikişi: arkada u 0/1 sıçraması küçük bir dokusal çizgi bırakır, saç örter
  skullCache.set(f, g);
  return g;
}
export { handGeo, mergeGeometries };
