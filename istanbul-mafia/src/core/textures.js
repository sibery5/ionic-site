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
