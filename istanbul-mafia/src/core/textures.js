// Tüm dokular kod ile üretilir (canvas). Hiçbir hazır görsel yoktur.
import * as THREE from 'three';
import { RNG } from './util.js';

const cache = new Map();

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTex(c, { repeat = 1, srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 4;
  return t;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export function signTexture(text, bg = '#8b1a1a', fg = '#f5d76e', w = 512, h = 128) {
  return cached(`sign:${text}:${bg}:${fg}:${w}`, () => {
    const c = makeCanvas(w, h); const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, bg); grd.addColorStop(1, shade(bg, -0.35));
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = h * 0.06; g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
    g.fillStyle = fg;
    let size = h * 0.55;
    g.font = `bold ${size}px "Trebuchet MS", Arial, sans-serif`;
    while (g.measureText(text).width > w * 0.86 && size > 10) { size -= 2; g.font = `bold ${size}px "Trebuchet MS", Arial, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6;
    g.fillText(text, w / 2, h / 2 + 2);
    const t = toTex(c, { wrap: false });
    return t;
  });
}

export function shade(hex, amt) {
  const c = new THREE.Color(hex);
  if (amt < 0) c.multiplyScalar(1 + amt); else c.lerp(new THREE.Color(1, 1, 1), amt);
  return '#' + c.getHexString();
}

// Türk kilimi deseni
export function carpetTexture(seed = 1) {
  return cached('carpet' + seed, () => {
    const r = new RNG(seed);
    const c = makeCanvas(256, 384); const g = c.getContext('2d');
    const pal = [['#7a1414', '#e0b04a', '#1b2a52', '#f0e6d0'], ['#1c3b6b', '#c23b22', '#f0d79a', '#2b1a10'], ['#8a2a1a', '#2f5d3a', '#e8c070', '#f3ead8']][seed % 3];
    g.fillStyle = pal[0]; g.fillRect(0, 0, 256, 384);
    g.strokeStyle = pal[1]; g.lineWidth = 10; g.strokeRect(12, 12, 232, 360);
    g.strokeStyle = pal[2]; g.lineWidth = 4; g.strokeRect(26, 26, 204, 332);
    // göbek motifleri (elmas)
    for (let i = 0; i < 3; i++) {
      const cy = 90 + i * 102;
      g.fillStyle = i % 2 ? pal[2] : pal[1];
      g.beginPath(); g.moveTo(128, cy - 45); g.lineTo(190, cy); g.lineTo(128, cy + 45); g.lineTo(66, cy); g.closePath(); g.fill();
      g.fillStyle = pal[3];
      g.beginPath(); g.moveTo(128, cy - 22); g.lineTo(158, cy); g.lineTo(128, cy + 22); g.lineTo(98, cy); g.closePath(); g.fill();
      g.fillStyle = pal[0]; g.fillRect(124, cy - 4, 8, 8);
    }
    // kenar süsleri
    g.fillStyle = pal[3];
    for (let y = 40; y < 350; y += 16) { g.fillRect(16, y, 6, 6); g.fillRect(234, y, 6, 6); }
    // dokuma gürültüsü
    const id = g.getImageData(0, 0, 256, 384);
    for (let i = 0; i < id.data.length; i += 4) {
      const n = (r.next() - 0.5) * 30;
      id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n;
    }
    g.putImageData(id, 0, 0);
    return toTex(c, { wrap: false });
  });
}

// İznik çinisi
export function iznikTexture() {
  return cached('iznik', () => {
    const c = makeCanvas(256, 256); const g = c.getContext('2d');
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 256, 256);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const ox = tx * 128, oy = ty * 128;
      g.strokeStyle = '#1d4e9e'; g.lineWidth = 3; g.strokeRect(ox + 2, oy + 2, 124, 124);
      g.fillStyle = '#1d4e9e';
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.beginPath(); g.ellipse(ox + 64 + Math.cos(a) * 28, oy + 64 + Math.sin(a) * 28, 14, 6, a, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#c0392b'; g.beginPath(); g.arc(ox + 64, oy + 64, 14, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a9d8f';
      [[16, 16], [112, 16], [16, 112], [112, 112]].forEach(([x, y]) => { g.beginPath(); g.arc(ox + x, oy + y, 9, 0, Math.PI * 2); g.fill(); });
    }
    return toTex(c, { repeat: 1 });
  });
}

export function woodTexture(base = '#6b4226') {
  return cached('wood' + base, () => {
    const c = makeCanvas(256, 256); const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const r = new RNG(7);
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = shade(base, r.float(-0.15, 0.1)); g.fillRect(0, y, 256, 31);
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(0, y + r.float(2, 30)); g.bezierCurveTo(80, y + r.float(0, 32), 170, y + r.float(0, 32), 256, y + r.float(2, 30)); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + 31, 256, 1);
    }
    return toTex(c, { repeat: 2 });
  });
}

export function tileTexture(a = '#d9d4c7', b = '#bfb8a8', n = 8) {
  return cached(`tile${a}${b}${n}`, () => {
    const c = makeCanvas(256, 256); const g = c.getContext('2d');
    const s = 256 / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * s, y * s, s, s);
    }
    g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(256, i * s); g.stroke(); }
    return toTex(c, { repeat: 4 });
  });
}

export function wallpaperTexture(base = '#e8dcc0', motif = '#c9b48a') {
  return cached(`wp${base}${motif}`, () => {
    const c = makeCanvas(128, 128); const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    g.fillStyle = motif;
    for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) {
      const ox = (y / 32) % 2 ? 16 : 0;
      g.beginPath(); g.moveTo(x + ox + 16, y + 6); g.lineTo(x + ox + 24, y + 16); g.lineTo(x + ox + 16, y + 26); g.lineTo(x + ox + 8, y + 16); g.closePath(); g.fill();
    }
    return toTex(c, { repeat: 3 });
  });
}

// Karakter yüzü (göz, kaş, ağız, sakal)
export function faceTexture(skin, gender, beard, hairColor) {
  return cached(`face${skin}${gender}${beard}${hairColor}`, () => {
    const W = 512, H = 256;
    const c = makeCanvas(W, H); const g = c.getContext('2d');
    g.fillStyle = skin; g.fillRect(0, 0, W, H);
    const cx = W * 0.25, cy = H * 0.5;
    // hafif yanak gölgesi
    const grd = g.createRadialGradient(cx, cy + 10, 10, cx, cy + 10, 90);
    grd.addColorStop(0, 'rgba(255,170,150,0.0)'); grd.addColorStop(1, 'rgba(120,60,40,0.12)');
    g.fillStyle = grd; g.fillRect(cx - 120, 0, 240, H);
    // gözler
    for (const s of [-1, 1]) {
      const ex = cx + s * 24, ey = cy - 12;
      g.fillStyle = '#f7f3ee'; g.beginPath(); g.ellipse(ex, ey, 10, 6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3b2414'; g.beginPath(); g.arc(ex, ey, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#000'; g.beginPath(); g.arc(ex, ey, 2.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.fillRect(ex + 1, ey - 3, 2, 2);
      // kaş
      g.strokeStyle = hairColor; g.lineWidth = gender === 'f' ? 3 : 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ex - 11, ey - 13 + (s > 0 ? 1 : 0)); g.quadraticCurveTo(ex, ey - 18, ex + 11, ey - 12); g.stroke();
      if (gender === 'f') { g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.ellipse(ex, ey, 10, 6, 0, Math.PI, Math.PI * 2); g.stroke(); }
    }
    // burun
    g.strokeStyle = 'rgba(90,50,30,0.45)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - 3, cy - 4); g.lineTo(cx - 6, cy + 14); g.lineTo(cx + 4, cy + 16); g.stroke();
    // ağız
    g.fillStyle = gender === 'f' ? '#b0303a' : '#8a4a3c';
    g.beginPath(); g.ellipse(cx, cy + 34, 13, gender === 'f' ? 4.5 : 3, 0, 0, Math.PI * 2); g.fill();
    // sakal / bıyık
    if (beard === 'mustache' || beard === 'full' || beard === 'stubble') {
      g.fillStyle = beard === 'stubble' ? hexA(hairColor, 0.35) : hairColor;
      if (beard !== 'stubble') { g.beginPath(); g.ellipse(cx, cy + 26, 20, 5, 0, 0, Math.PI * 2); g.fill(); }
      if (beard === 'full' || beard === 'stubble') {
        g.beginPath(); g.moveTo(cx - 52, cy - 2); g.quadraticCurveTo(cx - 50, cy + 70, cx, cy + 76);
        g.quadraticCurveTo(cx + 50, cy + 70, cx + 52, cy - 2); g.lineTo(cx + 36, cy + 20); g.quadraticCurveTo(cx, cy + 50, cx - 36, cy + 20); g.closePath(); g.fill();
      }
    }
    return toTex(c, { wrap: false });
  });
}

function hexA(hex, a) {
  const c = new THREE.Color(hex);
  return `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`;
}

export function cloudTexture() {
  return cached('cloud', () => {
    const c = makeCanvas(256, 256); const g = c.getContext('2d');
    const r = new RNG(42);
    for (let i = 0; i < 40; i++) {
      const x = r.float(50, 206), y = r.float(80, 176), rad = r.float(20, 60);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    return toTex(c, { wrap: false });
  });
}

export function waterNormalTexture() {
  return cached('waterN', () => {
    const S = 256;
    const c = makeCanvas(S, S); const g = c.getContext('2d');
    const h = new Float32Array(S * S);
    const r = new RNG(3);
    const waves = Array.from({ length: 10 }, () => ({ kx: r.int(1, 6), ky: r.int(-6, 6), p: r.float(0, 6.28), a: r.float(0.3, 1) }));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = 0;
      for (const w of waves) v += w.a * Math.sin((w.kx * x + w.ky * y) / S * Math.PI * 2 + w.p);
      h[y * S + x] = v;
    }
    const id = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
      const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
      const n = new THREE.Vector3(-dx * 0.5, -dy * 0.5, 1).normalize();
      const i = (y * S + x) * 4;
      id.data[i] = (n.x * 0.5 + 0.5) * 255; id.data[i + 1] = (n.y * 0.5 + 0.5) * 255; id.data[i + 2] = (n.z * 0.5 + 0.5) * 255; id.data[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return toTex(c, { srgb: false, repeat: 220 });
  });
}

export function marbleTexture() {
  return cached('marble', () => {
    const c = makeCanvas(256, 256); const g = c.getContext('2d');
    g.fillStyle = '#e9e5dc'; g.fillRect(0, 0, 256, 256);
    const r = new RNG(11);
    g.strokeStyle = 'rgba(120,110,100,0.25)';
    for (let i = 0; i < 25; i++) {
      g.lineWidth = r.float(0.5, 2.5);
      g.beginPath(); let x = r.float(0, 256), y = 0; g.moveTo(x, y);
      while (y < 256) { x += r.float(-12, 12); y += r.float(8, 20); g.lineTo(x, y); }
      g.stroke();
    }
    return toTex(c, { repeat: 3 });
  });
}

export function stoneTexture(base = '#b7a98f') {
  return cached('stone' + base, () => {
    const c = makeCanvas(256, 256); const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const r = new RNG(5);
    for (let y = 0; y < 256; y += 32) {
      const off = (y / 32) % 2 ? 32 : 0;
      for (let x = -64; x < 256; x += 64) {
        g.fillStyle = shade(base, r.float(-0.12, 0.08));
        g.fillRect(x + off + 2, y + 2, 60, 28);
      }
    }
    return toTex(c, { repeat: 4 });
  });
}

// Araç yan yazısı
export function decalTexture(text, color = '#1d4e9e', bg = 'rgba(0,0,0,0)') {
  return cached(`decal${text}${color}${bg}`, () => {
    const c = makeCanvas(512, 128); const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
    g.fillStyle = color; g.font = 'bold 84px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 68);
    return toTex(c, { wrap: false });
  });
}

// Türk bayrağı (dekor)
export function flagTexture() {
  return cached('flag', () => {
    const c = makeCanvas(300, 200); const g = c.getContext('2d');
    g.fillStyle = '#e30a17'; g.fillRect(0, 0, 300, 200);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(112, 100, 50, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e30a17'; g.beginPath(); g.arc(125, 100, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? 10 : 25;
      g.lineTo(178 + Math.cos(a + Math.PI / 2) * rad, 100 + Math.sin(a + Math.PI / 2) * rad);
    }
    g.closePath(); g.fill();
    return toTex(c, { wrap: false });
  });
}

export function glowTexture() {
  return cached('glow', () => {
    const c = makeCanvas(64, 64); const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return toTex(c, { wrap: false });
  });
}

// =====================================================================
// PBR prosedürel doku setleri (DataTexture): albedo (rgb) + pürüzlülük (a),
// normal (rgb) + yükseklik (a). Hepsi döşenebilir (tileable), kodla üretilir.
// =====================================================================
function hashI(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// döşenebilir değer gürültüsü (periyot = kafes hücre sayısı)
export function vnoise(x, y, period, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hashI(x0, y0, seed), b = hashI(x1, y0, seed), c = hashI(x0, y1, seed), d = hashI(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// u,v 0..1 aralığında; taban frekans f hücre
export function fbm(u, v, f, oct = 4, seed = 0) {
  let s = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(u * f, v * f, f, seed + o * 17);
    tot += amp; amp *= 0.5; f *= 2;
  }
  return s / tot;
}

function dataTex(data, S, srgb, aniso = 8) {
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// fn(u, v, out) -> out = [r, g, b, yükseklik, pürüzlülük]
function makePBR(S, strength, fn) {
  const col = new Uint8Array(S * S * 4), nrm = new Uint8Array(S * S * 4);
  const H = new Float32Array(S * S);
  const o = [0, 0, 0, 0, 0];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    fn(x / S, y / S, o, x, y);
    const i = y * S + x;
    col[i * 4] = Math.max(0, Math.min(255, o[0] * 255)); col[i * 4 + 1] = Math.max(0, Math.min(255, o[1] * 255)); col[i * 4 + 2] = Math.max(0, Math.min(255, o[2] * 255));
    col[i * 4 + 3] = Math.max(0, Math.min(255, o[4] * 255));
    H[i] = o[3];
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const dx = (H[y * S + ((x + 1) % S)] - H[y * S + ((x - 1 + S) % S)]) * strength;
    const dy = (H[((y + 1) % S) * S + x] - H[((y - 1 + S) % S) * S + x]) * strength;
    const l = Math.hypot(dx, dy, 1);
    nrm[i * 4] = (-dx / l * 0.5 + 0.5) * 255; nrm[i * 4 + 1] = (dy / l * 0.5 + 0.5) * 255; nrm[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255;
    nrm[i * 4 + 3] = Math.max(0, Math.min(255, H[i] * 255));
  }
  return { map: dataTex(col, S, true), normalMap: dataTex(nrm, S, false) };
}

// Döşenebilir çatlak maskesi (rastgele yürüyüş)
function crackMask(S, n, seed) {
  const m = new Float32Array(S * S);
  const r = new RNG(seed);
  for (let k = 0; k < n; k++) {
    let x = r.float(0, S), y = r.float(0, S), a = r.float(0, 6.28);
    const len = r.int(80, 260), w = r.float(0.6, 1.6);
    for (let s = 0; s < len; s++) {
      a += r.float(-0.5, 0.5); x += Math.cos(a) * 1.4; y += Math.sin(a) * 1.4;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const d = Math.hypot(ox, oy);
        if (d > w + 1) continue;
        const px = (((x + ox) | 0) % S + S) % S, py = (((y + oy) | 0) % S + S) % S;
        m[py * S + px] = Math.max(m[py * S + px], 1 - Math.max(0, d - w));
      }
      if (r.chance(0.01)) a += r.float(-1.5, 1.5);
    }
  }
  return m;
}

const SQ = (q) => (q === 'low' ? 256 : 512);

// Asfalt: agrega taneleri, çatlaklar, aşınma
export function asphaltPBR(q) {
  return cached('pbr:asphalt', () => {
    const S = SQ(q), cr = crackMask(S, 7, 31);
    return makePBR(S, 2.2, (u, v, o, x, y) => {
      const n = fbm(u, v, 8, 4, 3), f = fbm(u, v, 64, 2, 9);
      const sp = hashI(x, y, 5);
      const stone = sp > 0.9 ? (sp - 0.9) * 2.2 : 0;
      let c = 0.16 + n * 0.07 + f * 0.04 + stone - (sp < 0.06 ? 0.04 : 0);
      const k = cr[y * S + x];
      c *= 1 - k * 0.55;
      o[0] = c; o[1] = c; o[2] = c * 1.03;
      o[3] = 0.45 + f * 0.25 + stone * 1.2 - k * 0.6 + n * 0.1;
      o[4] = 0.82 + f * 0.1 + k * 0.1 - stone * 0.3;
    });
  });
}
// Kaldırım taşı: kare beton/taş plakalar, derz, kırık köşeler
export function pavementPBR(q) {
  return cached('pbr:pave', () => {
    const S = SQ(q), N = 6;
    return makePBR(S, 3, (u, v, o) => {
      const cu = u * N, cv = v * N;
      const ix = Math.floor(cu), iy = Math.floor(cv), fx = cu - ix, fy = cv - iy;
      const e = Math.min(fx, fy, 1 - fx, 1 - fy);
      const rnd = hashI(ix, iy, 11), rnd2 = hashI(ix, iy, 12);
      const chip = fbm(u, v, 48, 2, 4);
      const joint = e < 0.025 + chip * 0.02 ? 1 : 0;
      const tone = 0.5 + rnd * 0.1 + (iy % 2 ? 0.03 : -0.02);
      const n = fbm(u, v, 32, 3, 2);
      let c = tone + (n - 0.5) * 0.08;
      const stain = fbm(u, v, 4, 3, 8);
      c *= 0.92 + stain * 0.12;
      if (joint) c *= 0.55;
      o[0] = c * 1.02; o[1] = c; o[2] = c * 0.95;
      o[3] = joint ? 0.05 : 0.55 + (rnd2 - 0.5) * 0.15 + n * 0.12 + Math.min(e * 6, 0.25);
      o[4] = joint ? 0.98 : 0.78 + n * 0.12;
    });
  });
}
// Arnavut kaldırımı: düzensiz yuvarlak taşlar (Voronoi)
export function cobblePBR(q) {
  return cached('pbr:cobble', () => {
    const S = SQ(q), N = 9;
    return makePBR(S, 3.2, (u, v, o) => {
      const cu = u * N, cv = v * N, ix = Math.floor(cu), iy = Math.floor(cv);
      let f1 = 9, f2 = 9, id = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = ((ix + i) % N + N) % N, gy = ((iy + j) % N + N) % N;
        const px = ix + i + 0.15 + hashI(gx, gy, 1) * 0.7, py = iy + j + 0.15 + hashI(gx, gy, 2) * 0.7;
        const d = Math.hypot(cu - px, (cv - py) * 1.15);
        if (d < f1) { f2 = f1; f1 = d; id = gx * 31 + gy; } else if (d < f2) f2 = d;
      }
      const edge = f2 - f1;
      const st = Math.min(1, edge / 0.16);
      const rnd = hashI(id, 7, 3), n = fbm(u, v, 40, 2, 6);
      const dome = Math.sqrt(Math.max(0, st)) * (0.7 + rnd * 0.3);
      let c = 0.27 + rnd * 0.17 + (n - 0.5) * 0.08;
      const warm = hashI(id, 9, 4);
      o[0] = c * (1 + warm * 0.12); o[1] = c * (1 + warm * 0.05); o[2] = c * 0.95;
      if (st < 0.25) { const s = 0.25 + n * 0.1; o[0] = s * 1.1; o[1] = s; o[2] = s * 0.85; }
      o[3] = dome * 0.9 + n * 0.08;
      o[4] = st < 0.25 ? 0.95 : 0.6 + (1 - dome) * 0.25 + n * 0.1;
    });
  });
}
// Çim: ot lifleri, sararmış lekeler, toprak
export function grassPBR(q) {
  return cached('pbr:grass', () => {
    const S = SQ(q);
    return makePBR(S, 2.5, (u, v, o, x, y) => {
      const n = fbm(u, v, 6, 4, 21), b = vnoise(u * 160, v * 40, 160, 5) * 0.6 + hashI(x, y, 7) * 0.4;
      const dry = Math.max(0, fbm(u, v, 3, 3, 23) - 0.55) * 2;
      const dirt = Math.max(0, 0.32 - fbm(u, v, 10, 3, 25)) * 3;
      let r = 0.17 + b * 0.1, g = 0.32 + b * 0.18 + n * 0.08, bl = 0.08 + b * 0.05;
      r += dry * 0.18; g += dry * 0.05;
      r = r * (1 - dirt) + 0.32 * dirt; g = g * (1 - dirt) + 0.26 * dirt; bl = bl * (1 - dirt) + 0.18 * dirt;
      o[0] = r; o[1] = g; o[2] = bl;
      o[3] = b * 0.8 + n * 0.2; o[4] = 0.9;
    });
  });
}
// Sıva: ince kum dokusu + mala izleri (renk binaya göre çarpılır, açık gri tabanlı)
export function plasterPBR(q) {
  return cached('pbr:plaster', () => {
    const S = SQ(q);
    return makePBR(S, 1.6, (u, v, o, x, y) => {
      const n = fbm(u, v, 6, 4, 41), g = hashI(x, y, 3), t = fbm(u, v, 20, 3, 43);
      const c = 0.86 + (n - 0.5) * 0.12 + (g - 0.5) * 0.05;
      o[0] = c; o[1] = c; o[2] = c;
      o[3] = t * 0.6 + g * 0.25 + n * 0.15; o[4] = 0.88 + g * 0.08;
    });
  });
}
// Tuğla: kırmızı-turuncu tuğlalar, açık harç
export function brickPBR(q) {
  return cached('pbr:brick', () => {
    const S = SQ(q), rows = 28, cols = 8;
    return makePBR(S, 3, (u, v, o) => {
      const rv = v * rows, iy = Math.floor(rv), fy = rv - iy;
      const ru = u * cols + (iy % 2) * 0.5, ix = Math.floor(ru), fx = ru - ix;
      const ixw = ((ix % cols) + cols) % cols;
      const mort = fy < 0.13 || fx < 0.035;
      const rnd = hashI(ixw, iy, 13), n = fbm(u, v, 48, 2, 17);
      if (mort) { const m = 0.62 + n * 0.1; o[0] = m; o[1] = m * 0.97; o[2] = m * 0.92; o[3] = 0.1; o[4] = 0.95; return; }
      const burnt = hashI(ixw, iy, 14) < 0.12;
      let r = 0.55 + rnd * 0.15, g = 0.25 + rnd * 0.08, b = 0.17 + rnd * 0.05;
      if (burnt) { r *= 0.6; g *= 0.6; b *= 0.7; }
      const k = 0.9 + n * 0.2;
      o[0] = r * k; o[1] = g * k; o[2] = b * k;
      o[3] = 0.6 + n * 0.3; o[4] = 0.82 + n * 0.1;
    });
  });
}
// Alaturka kiremit (oluklu), yosun ve kararmalar
export function roofTilePBR(q) {
  return cached('pbr:roof', () => {
    const S = SQ(q), cols = 10, rows = 5;
    return makePBR(S, 4, (u, v, o) => {
      const rv = v * rows, iy = Math.floor(rv), fy = rv - iy;
      const ru = u * cols + (iy % 2) * 0.5, ix = Math.floor(ru), fx = ru - ix;
      const ixw = ((ix % cols) + cols) % cols;
      const prof = Math.sin(fx * Math.PI);
      const rnd = hashI(ixw, iy, 21), n = fbm(u, v, 30, 3, 22), moss = Math.max(0, fbm(u, v, 5, 3, 23) - 0.58) * 2.5;
      const step = 1 - fy; // sıra alt kenarı kalın
      let r = 0.62 + rnd * 0.14, g = 0.28 + rnd * 0.07, b = 0.16 + rnd * 0.04;
      const sh = 0.55 + prof * 0.45;
      r *= sh; g *= sh; b *= sh;
      r = r * (1 - moss) + 0.28 * moss; g = g * (1 - moss) + 0.3 * moss; b = b * (1 - moss) + 0.16 * moss;
      const k = 0.9 + n * 0.2;
      o[0] = r * k; o[1] = g * k; o[2] = b * k;
      o[3] = prof * 0.7 + step * 0.25 + n * 0.05; o[4] = 0.7 + n * 0.2 + moss * 0.1;
    });
  });
}
// Granit (bordür taşı, rıhtım)
export function granitePBR(q) {
  return cached('pbr:granite', () => {
    const S = SQ(q);
    return makePBR(S, 1.2, (u, v, o, x, y) => {
      const g = hashI(x, y, 51), n = fbm(u, v, 12, 3, 52);
      let c = 0.5 + n * 0.12 + (g > 0.85 ? 0.2 : g < 0.12 ? -0.2 : 0);
      const sl = Math.min(1, Math.abs(((u * 4) % 1) - 0.5) * 40); // blok derzleri
      if (sl < 0.6) c *= 0.6;
      o[0] = c; o[1] = c; o[2] = c * 1.02;
      o[3] = 0.5 + n * 0.3 + g * 0.1 - (sl < 0.6 ? 0.4 : 0); o[4] = 0.55 + n * 0.2;
    });
  });
}
// Kesme taş (yığma rıhtım duvarı, simge yapılar). Tonu malzemede çarpılır.
export function ashlarPBR(q) {
  return cached('pbr:ashlar', () => {
    const S = SQ(q), rows = 4, cols = 2;
    return makePBR(S, 3, (u, v, o) => {
      const rv = v * rows, iy = Math.floor(rv), fy = rv - iy;
      const ru = u * cols + (iy % 2) * 0.5, ix = Math.floor(ru), fx = ru - ix;
      const ixw = ((ix % cols) + cols) % cols;
      const e = Math.min(fy, 1 - fy, fx * 2, (1 - fx) * 2);
      const rnd = hashI(ixw, iy, 61), n = fbm(u, v, 24, 4, 62);
      let c = 0.8 + rnd * 0.12 + (n - 0.5) * 0.15;
      const joint = e < 0.035;
      if (joint) c *= 0.55;
      o[0] = c; o[1] = c * 0.97; o[2] = c * 0.9;
      o[3] = joint ? 0 : 0.5 + Math.min(e * 4, 0.3) + n * 0.2; o[4] = joint ? 0.95 : 0.75 + n * 0.15;
    });
  });
}
// Ağaç kabuğu (çınar: alacalı lekeler)
export function barkPBR(q) {
  return cached('pbr:bark', () => {
    const S = q === 'low' ? 128 : 256;
    return makePBR(S, 3, (u, v, o) => {
      const s = vnoise(u * 24, v * 4, 24, 71) * 0.6 + fbm(u, v, 8, 3, 72) * 0.4;
      const patch = fbm(u, v, 5, 3, 73);
      let r = 0.32 + s * 0.15, g = 0.27 + s * 0.12, b = 0.2 + s * 0.08;
      if (patch > 0.62) { r = 0.5; g = 0.47; b = 0.37; }
      o[0] = r; o[1] = g; o[2] = b; o[3] = s; o[4] = 0.9;
    });
  });
}

// Döşenebilir çok kanallı gürültü (RGBA, doğrusal): şader makro varyasyon & bulutlar
export function noiseTexture() {
  return cached('noiseRGBA', () => {
    const S = 256, d = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = (y * S + x) * 4;
      d[i] = fbm(u, v, 4, 5, 101) * 255; d[i + 1] = fbm(u, v, 8, 5, 102) * 255;
      d[i + 2] = fbm(u, v, 16, 4, 103) * 255; d[i + 3] = hashI(x, y, 104) * 255;
    }
    return dataTex(d, S, false, 1);
  });
}

// Yaprak kümesi (alfa) — ağaç taçları için
export function leafTexture(kind = 'broad') {
  return cached('leaf' + kind, () => {
    const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
    const r = new RNG(kind === 'broad' ? 81 : kind === 'needle' ? 82 : 83);
    g.clearRect(0, 0, S, S);
    const n = kind === 'needle' ? 900 : kind === 'palm' ? 1 : 260;
    if (kind === 'palm') {
      // palmiye yaprağı: orta damar + yan yaprakçıklar
      g.strokeStyle = '#4a6a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(8, S / 2); g.quadraticCurveTo(S / 2, S / 2 - 20, S - 6, S / 2 + 10); g.stroke();
      for (let i = 0; i < 46; i++) {
        const t = i / 46, x = 8 + t * (S - 14), y = S / 2 - 20 * 4 * t * (1 - t) + t * 10;
        for (const s of [-1, 1]) {
          g.strokeStyle = `rgb(${50 + r.int(0, 30)},${90 + r.int(0, 40)},${30 + r.int(0, 20)})`; g.lineWidth = 3;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18 + t * 10, y + s * (70 - t * 50)); g.stroke();
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        const x = r.float(8, S - 8), y = r.float(8, S - 8);
        const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
        if (dx * dx + dy * dy > 1 && r.chance(0.85)) continue;
        const l = 0.25 + r.next() * 0.35;
        const gg = kind === 'needle' ? 70 + r.int(0, 40) : 90 + r.int(0, 70);
        g.fillStyle = `rgb(${(gg * l * 0.55 + 20) | 0},${(gg * (0.6 + l)) | 0},${(gg * l * 0.35 + 10) | 0})`;
        g.save(); g.translate(x, y); g.rotate(r.float(0, 6.28));
        if (kind === 'needle') g.fillRect(-1, -7, 2, 14);
        else { g.beginPath(); g.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(-8, -0.5, 16, 1); }
        g.restore();
      }
    }
    const t = toTex(c, { wrap: false });
    t.anisotropy = 4;
    return t;
  });
}

// Tabela atlası: 4 sütun x 16 satır, her hücre 512x128. Dönüş: {tex, uv(name)->[u0,v0,u1,v1]}
export function signAtlas(entries) {
  return cached('signAtlas', () => {
    const W = 2048, CH = 128, CW = 512, C = makeCanvas(W, 2048), g = C.getContext('2d');
    const idx = new Map();
    entries.forEach(([key, text, bg, fg, style], i) => {
      const cx = (i % 4) * CW, cy = Math.floor(i / 4) * CH;
      g.save(); g.translate(cx, cy);
      const grd = g.createLinearGradient(0, 0, 0, CH); grd.addColorStop(0, shade(bg, 0.12)); grd.addColorStop(1, shade(bg, -0.3));
      g.fillStyle = grd; g.fillRect(0, 0, CW, CH);
      if (style === 'police') { g.fillStyle = '#ffffff'; g.fillRect(0, CH * 0.78, CW, CH * 0.08); g.fillStyle = '#c8102e'; g.fillRect(0, CH * 0.86, CW, CH * 0.14); }
      else { g.strokeStyle = fg; g.globalAlpha = 0.7; g.lineWidth = 5; g.strokeRect(8, 8, CW - 16, CH - 16); g.globalAlpha = 1; }
      g.fillStyle = fg;
      let size = CH * 0.52;
      const font = (s) => `bold ${s}px "Trebuchet MS", Arial, sans-serif`;
      g.font = font(size);
      while (g.measureText(text).width > CW * 0.88 && size > 10) { size -= 2; g.font = font(size); }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6;
      g.fillText(text, CW / 2, CH * (style === 'police' ? 0.42 : 0.52));
      g.restore();
      idx.set(key, [cx / W, 1 - (cy + CH) / 2048, (cx + CW) / W, 1 - cy / 2048]);
    });
    const t = toTex(C, { wrap: false }); t.anisotropy = 8;
    return { tex: t, uv: (k) => idx.get(k) || [0, 0, 0.001, 0.001] };
  });
}

// Uydurma reklam afişi (kurgusal markalar)
const ADS = [
  ['TURKUAZ KOLA', 'Serinliğin rengi', '#0aa5a5', '#ffffff', 'bottle'],
  ['KÖPRÜ BANK', 'Kıtalar arası kredi %0,99', '#13294b', '#f2c14e', 'bridge'],
  ['LALE TELEKOM', '5G İstanbul\'un her yerinde', '#7a1fa2', '#ffffff', 'tulip'],
  ['SULTAN LOKUM', '1869\'dan beri', '#b3122e', '#ffe9b0', 'box'],
  ['MARTI GAZETESİ', 'Doğru haber, her sabah', '#f4f1e6', '#111111', 'bird'],
  ['BOSFOR OTOMOTİV', 'Yeni Kartal GT', '#1a1a1a', '#ff3d00', 'car'],
  ['HALİÇ EMLAK', 'Boğaz manzaralı rezidans', '#2f5d3a', '#f4e3b2', 'tower'],
  ['GALATA MODA', 'Sonbahar koleksiyonu', '#e8d8c8', '#2a1a12', 'stripe'],
];
export const AD_COUNT = ADS.length;
function drawAd(g, x, y, w, h, ad, r) {
  const [title, sub, bg, fg, icon] = ad;
  g.save(); g.translate(x, y);
  const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, shade(bg, 0.15)); grd.addColorStop(1, shade(bg, -0.25));
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = shade(bg, 0.25); g.globalAlpha = 0.5;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(r.float(0, w), r.float(0, h), r.float(20, 90), 0, 6.28); g.fill(); }
  g.globalAlpha = 1;
  // simge
  g.fillStyle = fg; g.strokeStyle = fg; g.lineWidth = 6;
  const ix = w * 0.8, iy = h * 0.5;
  if (icon === 'bottle') { g.fillRect(ix - 18, iy - 40, 36, 90); g.fillRect(ix - 8, iy - 70, 16, 34); }
  else if (icon === 'bridge') { g.beginPath(); g.moveTo(ix - 70, iy + 30); g.quadraticCurveTo(ix, iy - 70, ix + 70, iy + 30); g.stroke(); g.fillRect(ix - 50, iy - 40, 8, 80); g.fillRect(ix + 42, iy - 40, 8, 80); }
  else if (icon === 'tulip') { g.beginPath(); g.moveTo(ix, iy + 60); g.lineTo(ix, iy); g.stroke(); g.beginPath(); g.ellipse(ix, iy - 15, 24, 34, 0, 0, 6.28); g.fill(); }
  else if (icon === 'box') { g.fillRect(ix - 50, iy - 25, 100, 60); g.fillStyle = bg; g.fillRect(ix - 50, iy - 5, 100, 8); }
  else if (icon === 'bird') { g.beginPath(); g.moveTo(ix - 60, iy); g.quadraticCurveTo(ix - 30, iy - 40, ix, iy); g.quadraticCurveTo(ix + 30, iy - 40, ix + 60, iy); g.stroke(); }
  else if (icon === 'car') { g.beginPath(); g.moveTo(ix - 80, iy + 25); g.lineTo(ix - 60, iy - 5); g.lineTo(ix - 20, iy - 25); g.lineTo(ix + 40, iy - 25); g.lineTo(ix + 80, iy + 5); g.lineTo(ix + 80, iy + 25); g.closePath(); g.fill(); }
  else if (icon === 'tower') { for (let i = 0; i < 3; i++) g.fillRect(ix - 50 + i * 36, iy - 60 + i * 20, 26, 110 - i * 20); }
  else { for (let i = 0; i < 6; i++) g.fillRect(ix - 70 + i * 24, iy - 50, 10, 100); }
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = `900 ${h * 0.2}px "Arial Black", Arial, sans-serif`; g.fillStyle = fg;
  let s = h * 0.2; while (g.measureText(title).width > w * 0.62 && s > 10) { s -= 2; g.font = `900 ${s}px "Arial Black", Arial, sans-serif`; }
  g.fillText(title, w * 0.05, h * 0.45);
  g.font = `italic ${h * 0.1}px Georgia, serif`; g.fillText(sub, w * 0.05, h * 0.68);
  g.restore();
}

// Sokak eşyası atlası (2048x2048): reklamlar, grafiti, çamaşır, korkuluk/çit desenleri, durak, büfe, simit,
// ATM, bayrak, ızgara, kepenk... Bölge koordinatları PROP_UV ile dışarı verilir (u0,v0,u1,v1).
export const PROP_UV = {};
export function propAtlas() {
  return cached('propAtlas', () => {
    const W = 2048, C = makeCanvas(W, W), g = C.getContext('2d');
    const r = new RNG(77);
    const reg = (k, x, y, w, h) => { PROP_UV[k] = [x / W, 1 - (y + h) / W, (x + w) / W, 1 - y / W]; };
    g.clearRect(0, 0, W, W);
    // beyaz bölge (dokusuz parçalar)
    g.fillStyle = '#ffffff'; g.fillRect(0, 1984, 64, 64); reg('white', 8, 1992, 48, 48);
    // reklamlar: 4x2, 512x256
    ADS.forEach((ad, i) => { drawAd(g, (i % 4) * 512, Math.floor(i / 4) * 256, 512, 256, ad, r); reg('ad' + i, (i % 4) * 512 + 2, Math.floor(i / 4) * 256 + 2, 508, 252); });
    // grafiti: 8 x 256x128 (y=512)
    const tags = ['34', 'İST', 'ÇARŞI', 'KAOS', 'BOĞAZ', 'MAHALLE', 'ŞEHİR', 'YOK'];
    tags.forEach((t, i) => {
      const x = i * 256, y = 512;
      g.save(); g.translate(x, y);
      const cols = ['#ff3d7f', '#3dd6ff', '#ffe23d', '#7dff3d', '#ff8a3d', '#c43dff'];
      g.font = `900 ${64 - t.length * 3}px "Arial Black", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = '#111'; g.strokeText(t, 128, 66);
      g.fillStyle = cols[i % cols.length]; g.fillText(t, 128, 64);
      g.lineWidth = 3; g.strokeStyle = cols[(i + 2) % cols.length]; g.strokeText(t, 128, 64);
      g.globalAlpha = 0.6; g.fillStyle = cols[i % cols.length];
      for (let k = 0; k < 10; k++) g.fillRect(r.float(20, 236), r.float(80, 100), 2, r.float(8, 26)); // damlalar
      g.restore();
      reg('graf' + i, x, y, 256, 128);
    });
    // çamaşırlar: 1024x256 (y=640) — renkli tişört, havlu, pantolon, çarşaf
    g.save(); g.translate(0, 640);
    let cx = 6;
    while (cx < 1000) {
      const w = r.float(50, 110), h = r.float(90, 230), col = `hsl(${r.int(0, 360)},${r.int(30, 80)}%,${r.int(40, 80)}%)`;
      g.fillStyle = col;
      const kind = r.int(0, 2);
      if (kind === 0) { g.fillRect(cx, 6, w, h * 0.75); g.fillRect(cx - 14, 6, w + 28, 30); }
      else if (kind === 1) { g.fillRect(cx, 6, w * 0.45, h); g.fillRect(cx + w * 0.55, 6, w * 0.45, h); g.fillRect(cx, 6, w, 30); }
      else { g.fillRect(cx, 6, w, h); g.fillStyle = 'rgba(255,255,255,0.3)'; for (let k = 0; k < 4; k++) g.fillRect(cx, 20 + k * 40, w, 6); }
      g.fillStyle = '#ddd'; g.fillRect(cx + 6, 0, 5, 14); g.fillRect(cx + w - 11, 0, 5, 14);
      cx += w + r.float(14, 40);
    }
    g.restore(); reg('laundry', 0, 640, 1024, 256);
    // balkon korkuluğu (dövme demir) 256x128 @ (1024,640)
    g.save(); g.translate(1024, 640);
    g.strokeStyle = '#1e1e1e'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 122);
    g.lineWidth = 4;
    for (let x = 16; x < 250; x += 16) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x, 122); g.stroke(); }
    for (let x = 8; x < 250; x += 32) { g.beginPath(); g.arc(x + 8, 64, 10, 0, 6.28); g.stroke(); }
    g.restore(); reg('railing', 1024, 640, 256, 128);
    // modern cam korkuluk 256x128 @ (1280,640)
    g.save(); g.translate(1280, 640);
    g.fillStyle = 'rgba(150,180,190,0.55)'; g.fillRect(0, 10, 256, 118);
    g.fillStyle = '#9aa0a4'; g.fillRect(0, 0, 256, 12); g.fillRect(0, 0, 8, 128); g.fillRect(248, 0, 8, 128);
    g.restore(); reg('glassrail', 1280, 640, 256, 128);
    // tel örgü çit 256x256 @ (1536,640)
    g.save(); g.translate(1536, 640);
    g.strokeStyle = '#8f969a'; g.lineWidth = 2.5;
    for (let i = -256; i < 512; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i + 256, 0); g.lineTo(i, 256); g.stroke(); }
    g.restore(); reg('chain', 1536, 640, 256, 256);
    // jiletli tel 256x64 @ (1792,640)
    g.save(); g.translate(1792, 640);
    g.strokeStyle = '#a0a6aa'; g.lineWidth = 3;
    for (let x = 0; x < 256; x += 22) { g.beginPath(); g.ellipse(x + 11, 32, 14, 26, 0.5, 0, 6.28); g.stroke(); }
    g.restore(); reg('razor', 1792, 640, 256, 64);
    // demir parmaklık çit 256x128 @ (1792,704)
    g.save(); g.translate(1792, 704);
    g.fillStyle = '#20262a';
    g.fillRect(0, 14, 256, 8); g.fillRect(0, 108, 256, 8);
    for (let x = 6; x < 256; x += 18) { g.fillRect(x, 0, 6, 128); g.beginPath(); g.moveTo(x - 3, 4); g.lineTo(x + 3, -6); g.lineTo(x + 9, 4); g.fill(); }
    g.restore(); reg('ironfence', 1792, 704, 256, 128);
    // İETT durak tabelası 256x128 @ (0,896)
    g.save(); g.translate(0, 896);
    g.fillStyle = '#e0e4e8'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#c8102e'; g.fillRect(0, 0, 256, 40);
    g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText('İETT', 128, 31);
    g.fillStyle = '#1a2a4a'; g.font = 'bold 22px Arial'; g.fillText('OTOBÜS DURAĞI', 128, 72);
    g.font = '18px Arial'; g.fillText('25E · 28T · 30D · 40T · 559C', 128, 104);
    g.restore(); reg('iett', 0, 896, 256, 128);
    // büfe önü 256x128 @ (256,896)
    g.save(); g.translate(256, 896);
    g.fillStyle = '#1d4e9e'; g.fillRect(0, 0, 256, 34);
    g.fillStyle = '#fff'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText('BÜFE · TOST · AYRAN', 128, 26);
    g.fillStyle = '#2a3238'; g.fillRect(0, 34, 256, 94);
    for (let i = 0; i < 26; i++) { g.fillStyle = `hsl(${r.int(0, 360)},70%,55%)`; g.fillRect(10 + (i % 13) * 18, 44 + Math.floor(i / 13) * 40, 14, 30); }
    g.restore(); reg('kiosk', 256, 896, 256, 128);
    // simit tezgâhı camı 256x128 @ (512,896)
    g.save(); g.translate(512, 896);
    g.fillStyle = '#d02020'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = 'rgba(220,240,255,0.9)'; g.fillRect(10, 10, 236, 80);
    for (let i = 0; i < 14; i++) { const x = 30 + (i % 7) * 32, y = 34 + Math.floor(i / 7) * 34; g.strokeStyle = '#b5712a'; g.lineWidth = 9; g.beginPath(); g.arc(x, y, 11, 0, 6.28); g.stroke(); }
    g.fillStyle = '#fff'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText('SİMİT', 128, 118);
    g.restore(); reg('simit', 512, 896, 256, 128);
    // gazete standı 256x128 @ (768,896)
    g.save(); g.translate(768, 896);
    g.fillStyle = '#333'; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 8; i++) { const x = 6 + (i % 4) * 62, y = 6 + Math.floor(i / 4) * 62; g.fillStyle = '#f2efe6'; g.fillRect(x, y, 56, 56); g.fillStyle = i % 3 ? '#b3122e' : '#13294b'; g.fillRect(x + 4, y + 4, 48, 12); g.fillStyle = '#555'; for (let k = 0; k < 5; k++) g.fillRect(x + 4, y + 22 + k * 6, 48, 3); }
    g.restore(); reg('news', 768, 896, 256, 128);
    // ATM paneli 128x128 @ (1024,896)
    g.save(); g.translate(1024, 896);
    g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#0d3a2a'; g.fillRect(0, 0, 128, 26);
    g.fillStyle = '#d4af37'; g.font = 'bold 18px Arial'; g.textAlign = 'center'; g.fillText('ATM 7/24', 64, 19);
    g.fillStyle = '#123a6a'; g.fillRect(24, 34, 80, 46); g.fillStyle = '#9fd4ff'; g.fillRect(30, 40, 68, 6);
    g.fillStyle = '#333'; for (let i = 0; i < 12; i++) g.fillRect(36 + (i % 3) * 20, 86 + Math.floor(i / 3) * 9, 14, 6);
    g.restore(); reg('atm', 1024, 896, 128, 128);
    // telefon kulübesi paneli 128x256 @ (1152,896)
    g.save(); g.translate(1152, 896);
    g.fillStyle = '#0a7fa0'; g.fillRect(0, 0, 128, 256); g.fillStyle = 'rgba(200,230,240,0.85)'; g.fillRect(14, 40, 100, 170);
    g.fillStyle = '#fff'; g.font = 'bold 20px Arial'; g.textAlign = 'center'; g.fillText('TELEFON', 64, 28);
    g.restore(); reg('phone', 1152, 896, 128, 256);
    // Türk bayrağı 300x200 @ (1280,896)
    g.save(); g.translate(1280, 896);
    g.fillStyle = '#e30a17'; g.fillRect(0, 0, 300, 200);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(112, 100, 50, 0, 6.28); g.fill();
    g.fillStyle = '#e30a17'; g.beginPath(); g.arc(125, 100, 40, 0, 6.28); g.fill();
    g.fillStyle = '#fff'; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? 10 : 25; g.lineTo(178 + Math.cos(a + Math.PI / 2) * rad, 100 + Math.sin(a + Math.PI / 2) * rad); }
    g.closePath(); g.fill();
    g.restore(); reg('flag', 1281, 897, 298, 198);
    // klima ızgarası 128x128 @ (1600,896)
    g.save(); g.translate(1600, 896);
    g.fillStyle = '#e8e8e4'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#9a9a96';
    g.beginPath(); g.arc(78, 64, 40, 0, 6.28); g.fill(); g.fillStyle = '#d8d8d4'; for (let i = 0; i < 12; i++) g.fillRect(40, 26 + i * 6.5, 76, 3);
    g.restore(); reg('ac', 1600, 896, 128, 128);
    // kepenk (oluklu metal) 128x128 @ (1728,896)
    g.save(); g.translate(1728, 896);
    for (let y = 0; y < 128; y += 8) { const grd = g.createLinearGradient(0, y, 0, y + 8); grd.addColorStop(0, '#9aa0a4'); grd.addColorStop(1, '#5a6064'); g.fillStyle = grd; g.fillRect(0, y, 128, 8); }
    g.restore(); reg('shutter', 1728, 896, 128, 128);
    // ahşap (bank, büfe) 128x128 @ (1856,896)
    g.save(); g.translate(1856, 896);
    for (let y = 0; y < 128; y += 16) { g.fillStyle = shade('#8a5a32', r.float(-0.15, 0.1)); g.fillRect(0, y, 128, 14); }
    g.restore(); reg('wood', 1856, 896, 128, 128);
    // helipad "H" 256x256 @ (0,1152)
    g.save(); g.translate(0, 1152);
    g.fillStyle = '#3a3d40'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#f0f0f0'; g.lineWidth = 14; g.beginPath(); g.arc(128, 128, 104, 0, 6.28); g.stroke();
    g.fillStyle = '#f0f0f0'; g.fillRect(84, 66, 22, 124); g.fillRect(150, 66, 22, 124); g.fillRect(84, 117, 88, 22);
    g.strokeStyle = '#f2c14e'; g.lineWidth = 6; g.strokeRect(6, 6, 244, 244);
    g.restore(); reg('helipad', 0, 1152, 256, 256);
    // askeri uyarı tabelası 256x128 @ (256,1152)
    g.save(); g.translate(256, 1152);
    g.fillStyle = '#c8102e'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#fff'; g.fillRect(6, 6, 244, 116); g.fillStyle = '#c8102e'; g.fillRect(12, 12, 232, 104);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 30px Arial'; g.fillText('ASKERİ BÖLGE', 128, 52); g.font = 'bold 18px Arial'; g.fillText('GİRMEK YASAKTIR', 128, 80); g.font = '14px Arial'; g.fillText('Ateş açılabilir', 128, 104);
    g.restore(); reg('military', 256, 1152, 256, 128);
    // kamuflaj 256x256 @ (512,1152)
    g.save(); g.translate(512, 1152);
    g.fillStyle = '#5a6040'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) { g.fillStyle = ['#3e4630', '#7a7450', '#2e3224', '#6a7048'][i % 4]; g.beginPath(); g.ellipse(r.float(0, 256), r.float(0, 256), r.float(10, 34), r.float(6, 20), r.float(0, 3), 0, 6.28); g.fill(); }
    g.restore(); reg('camo', 512, 1152, 256, 256);
    // pist numaraları "36" 256x256 @ (768,1152)
    g.save(); g.translate(768, 1152);
    g.fillStyle = '#ffffff'; g.font = 'bold 200px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('36', 128, 135);
    g.restore(); reg('rwy36', 768, 1152, 256, 256);
    g.save(); g.translate(1024, 1152);
    g.fillStyle = '#ffffff'; g.font = 'bold 200px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('18', 128, 135);
    g.restore(); reg('rwy18', 1024, 1152, 256, 256);
    // logar kapağı (yuvarlak, döküm) 128x128 @ (1280,1152)
    g.save(); g.translate(1280, 1152);
    g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(64, 64, 62, 0, 6.28); g.fill();
    g.strokeStyle = '#4a4a4a'; g.lineWidth = 3; for (let k = 1; k < 5; k++) { g.beginPath(); g.arc(64, 64, k * 13, 0, 6.28); g.stroke(); }
    for (let a = 0; a < 8; a++) { g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a * 0.785) * 58, 64 + Math.sin(a * 0.785) * 58); g.stroke(); }
    g.fillStyle = '#555'; g.font = 'bold 14px Arial'; g.textAlign = 'center'; g.fillText('İSKİ', 64, 69);
    g.restore(); reg('manhole', 1280, 1152, 128, 128);
    // ızgara (yağmur suyu) 128x64 @ (1408,1152)
    g.save(); g.translate(1408, 1152);
    g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#0a0a0a'; for (let x = 8; x < 124; x += 12) g.fillRect(x, 6, 6, 52);
    g.restore(); reg('grate', 1408, 1152, 128, 64);
    // "SATILIK" pankartı 256x128 @ (1536,1152)
    g.save(); g.translate(1536, 1152);
    g.fillStyle = '#d01818'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#fff'; g.fillRect(8, 8, 240, 112);
    g.fillStyle = '#d01818'; g.font = 'bold 46px Arial'; g.textAlign = 'center'; g.fillText('SATILIK', 128, 66); g.font = 'bold 18px Arial'; g.fillStyle = '#222'; g.fillText('Sahibinden · 0 212 ...', 128, 100);
    g.restore(); reg('forsale', 1536, 1152, 256, 128);
    // oyun parkı renkli plastik 128x128 @ (1792,1152) - düz kırmızı/sarı/mavi şeritler
    g.save(); g.translate(1792, 1152);
    ['#e63946', '#f4c430', '#1d7fd8', '#2a9d50'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * 32, 128, 32); });
    g.restore(); reg('play0', 1792, 1152, 128, 32); reg('play1', 1792, 1184, 128, 32); reg('play2', 1792, 1216, 128, 32); reg('play3', 1792, 1248, 128, 32);
    // tente kumaşı (şeritli) 256x128 @ (0,1408)
    g.save(); g.translate(0, 1408);
    for (let x = 0; x < 256; x += 32) { g.fillStyle = (x / 32) % 2 ? '#ffffff' : '#cccccc'; g.fillRect(x, 0, 32, 112); }
    g.fillStyle = '#ffffff'; for (let x = 0; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 112); g.lineTo(x + 16, 128); g.lineTo(x + 32, 112); g.fill(); }
    g.restore(); reg('awning', 0, 1408, 256, 128);
    // cam (durak / vitrin) yarı saydam 64x64 @ (256,1408)
    g.save(); g.translate(256, 1408); g.fillStyle = 'rgba(170,200,215,0.45)'; g.fillRect(0, 0, 64, 64); g.restore(); reg('glass', 262, 1414, 52, 52);
    // kapı paneli (ahşap çift kanat + cam) 128x256 @ (320,1408)
    g.save(); g.translate(320, 1408);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#bdbdbd'; g.fillRect(10, 10, 50, 120); g.fillRect(68, 10, 50, 120); g.fillRect(10, 140, 50, 106); g.fillRect(68, 140, 50, 106);
    g.fillStyle = '#2a3440'; g.fillRect(16, 16, 38, 108); g.fillRect(74, 16, 38, 108);
    g.fillStyle = '#d4af37'; g.fillRect(56, 150, 4, 24); g.fillRect(68, 150, 4, 24);
    g.restore(); reg('door', 320, 1408, 128, 256);
    // pencere panjuru (ahşap pervaz) 64x128 @ (448,1408)
    g.save(); g.translate(448, 1408);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#c0c0c0'; for (let y = 8; y < 120; y += 7) g.fillRect(6, y, 52, 3);
    g.restore(); reg('louver', 448, 1408, 64, 128);
    // çiçek (lale) için yumuşak gradyan 64x64 @ (512,1408)
    g.save(); g.translate(512, 1408);
    const lg = g.createLinearGradient(0, 0, 0, 64); lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#b0b0b0'); g.fillStyle = lg; g.fillRect(0, 0, 64, 64);
    g.restore(); reg('petal', 516, 1412, 56, 56);
    // ot yaprağı (alfa) 64x128 @ (576,1408)
    g.save(); g.translate(576, 1408);
    for (let i = 0; i < 7; i++) {
      const bx = 6 + i * 8.5, top = r.float(4, 40);
      const grd = g.createLinearGradient(0, 128, 0, top); grd.addColorStop(0, '#2c4a18'); grd.addColorStop(1, '#9ac860');
      g.fillStyle = grd; g.beginPath(); g.moveTo(bx - 3, 128); g.quadraticCurveTo(bx + r.float(-6, 6), (128 + top) / 2, bx + r.float(-5, 5), top); g.lineTo(bx + 3, 128); g.fill();
    }
    g.restore(); reg('grass', 576, 1408, 64, 128);
    const t = toTex(C, { wrap: false }); t.anisotropy = 8;
    return t;
  });
}
