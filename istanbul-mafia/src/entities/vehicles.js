// Araçlar: prosedürel detaylı modeller (yuvarlatılmış gövde, çamurluk kavisleri, jant, plaka, iç mekân, farlar),
// sürüş fiziği (ağırlık transferi, kayma açısı, el freni drift, vites/devir sesi), hasar (göçük, kırık cam, duman,
// yangın, patlama), trafik yapay zekâsı (şerit, trafik ışığı, sinyal, kuyruk) ve polis takibi/sıkıştırma.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CARS } from '../game/economy.js';
import { clamp, angleDiff, rng, RNG } from '../core/util.js';
import { makeCanvas, signTexture } from '../core/textures.js';
import { audio } from '../core/audio.js';

// ======================================================================
// Malzemeler
// ======================================================================
const paintCache = new Map();
export function paintMat(c, matte) {
  const k = c + (matte ? 'm' : '');
  if (!paintCache.has(k)) {
    paintCache.set(k, matte
      ? new THREE.MeshStandardMaterial({ color: c, metalness: 0.05, roughness: 0.85 })
      : new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.5, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 }));
  }
  return paintCache.get(k);
}
export const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x18222a, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });
export const darkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.12 });
export const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdadada, metalness: 1, roughness: 0.14 });
const burntMat = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1 });
let crackedGlass = null;
function crackedGlassMat() {
  if (crackedGlass) return crackedGlass;
  const c = makeCanvas(256, 256); const g = c.getContext('2d');
  g.fillStyle = 'rgba(180,195,200,0.35)'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.4;
  const r = new RNG(7);
  for (let k = 0; k < 3; k++) {
    const cx = r.float(40, 216), cy = r.float(40, 216);
    for (let i = 0; i < 14; i++) {
      let x = cx, y = cy; const a0 = r.float(0, Math.PI * 2);
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { const a = a0 + r.float(-0.4, 0.4); x += Math.cos(a) * 22; y += Math.sin(a) * 22; g.lineTo(x, y); }
      g.stroke();
    }
    for (let ring = 1; ring < 4; ring++) { g.beginPath(); g.arc(cx, cy, ring * 18, 0, Math.PI * 2); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  crackedGlass = new THREE.MeshStandardMaterial({ color: 0x9aa8ae, map: t, roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  return crackedGlass;
}

// Tekerlek: tek malzeme, gri tonlar metal (jant), koyu tonlar lastik
export const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
wheelMat.onBeforeCompile = (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  #ifdef USE_COLOR
  { float wl = max(max(vColor.r, vColor.g), vColor.b); float ws = wl - min(min(vColor.r, vColor.g), vColor.b);
    if (wl > 0.15 && ws < 0.05) { metalnessFactor = 0.92; roughnessFactor = 0.28; } }
  #endif`);
};
wheelMat.customProgramCacheKey = () => 'tekerlek1';

// Işık malzemesi: kanal başına parlaklık (0 far,1 stop/arka,2 üçüncü stop,3 sol sinyal,4 sağ sinyal,5 tepe A,6 tepe B,7 geri vites)
export function makeLightsMat() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.1 });
  const uA = { value: new THREE.Vector4() }, uB = { value: new THREE.Vector4() };
  m.userData.uA = uA; m.userData.uB = uB;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLvA = uA; sh.uniforms.uLvB = uB;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aEmi; attribute float aCh; varying vec3 vEmi; varying float vCh;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmi = aEmi; vCh = aCh;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uLvA; uniform vec4 uLvB; varying vec3 vEmi; varying float vCh;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float lv = vCh < 0.5 ? uLvA.x : vCh < 1.5 ? uLvA.y : vCh < 2.5 ? uLvA.z : vCh < 3.5 ? uLvA.w : vCh < 4.5 ? uLvB.x : vCh < 5.5 ? uLvB.y : vCh < 6.5 ? uLvB.z : uLvB.w;
      totalEmissiveRadiance += vEmi * lv;`);
  };
  m.customProgramCacheKey = () => 'aracIsik1';
  return m;
}

// Gece far ışık havuzu (sahte ışık, toplamalı)
let poolMat = null;
function headPoolMat() {
  if (poolMat) return poolMat;
  const c = makeCanvas(128, 128); const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 40, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,240,210,0.9)'); grd.addColorStop(0.5, 'rgba(255,230,190,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  poolMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  return poolMat;
}
const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);

// ======================================================================
// Geometri yardımcıları (hepsi indeksli, position/normal/uv ortak öznitelikleri)
// ======================================================================
const _c = new THREE.Color();
export function prep(g) {
  if (!g.index) { const n = g.attributes.position.count; const idx = new Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(idx); }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getZ(i); uv[i * 2 + 1] = p.getY(i); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  g.clearGroups();
  return g;
}
export function colorize(g, hex) {
  prep(g);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
export function lightize(g, lens, emi, ch) {
  colorize(g, lens);
  const n = g.attributes.position.count, e = new Float32Array(n * 3), c = new Float32Array(n);
  _c.set(emi);
  for (let i = 0; i < n; i++) { e[i * 3] = _c.r; e[i * 3 + 1] = _c.g; e[i * 3 + 2] = _c.b; c[i] = ch; }
  g.setAttribute('aEmi', new THREE.BufferAttribute(e, 3));
  g.setAttribute('aCh', new THREE.BufferAttribute(c, 1));
  return g;
}
export function bx(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
export function rbx(w, h, d, r, x, y, z) { const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)); g.translate(x, y, z); return g; }
// eksen: 'x' | 'y' | 'z'
export function cyl(rt, rb, h, seg, axis, x, y, z, open) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!open);
  if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z); return g;
}
const _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m4 = new THREE.Matrix4();
// iki nokta arasında kiriş (direk, boru, çerçeve)
export function beam(ax, ay, az, bx2, by, bz, w, d, round) {
  const len = Math.hypot(bx2 - ax, by - ay, bz - az);
  const g = round ? new THREE.CylinderGeometry(w / 2, w / 2, len, 6) : new THREE.BoxGeometry(d, w, len);
  if (round) g.rotateX(Math.PI / 2);
  const zA = _v0.set(bx2 - ax, by - ay, bz - az).normalize();
  const ref = Math.abs(zA.x) > 0.9 ? _v2.set(0, 1, 0) : _v2.set(1, 0, 0);
  const xA = _v1.copy(ref).addScaledVector(zA, -ref.dot(zA)).normalize();
  const yA = new THREE.Vector3().crossVectors(zA, xA);
  _m4.makeBasis(xA, yA, zA).setPosition((ax + bx2) / 2, (ay + by) / 2, (az + bz) / 2);
  g.applyMatrix4(_m4);
  return g;
}
function smoothGeo(g) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); const m = mergeVertices(g, 1e-4); m.computeVertexNormals(); return m; }
// dışbükey çokgen (3B noktalar) → yelpaze üçgenleme
function polyGeo(pts) {
  const pos = [], idx = [];
  for (const p of pts) pos.push(p[0], p[1], p[2]);
  for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Sutherland–Hodgman: z aralığına kırp (pts: [z,y])
function clipZ(pts, zLo, zHi) {
  const clip = (P, keep, isect) => {
    const out = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const ka = keep(a), kb = keep(b);
      if (ka) out.push(a);
      if (ka !== kb) out.push(isect(a, b));
    }
    return out;
  };
  const at = (z) => (a, b) => { const t = (z - a[0]) / (b[0] - a[0]); return [z, a[1] + (b[1] - a[1]) * t]; };
  let P = clip(pts, (p) => p[0] <= zHi, at(zHi));
  if (P.length) P = clip(P, (p) => p[0] >= zLo, at(zLo));
  return P;
}
function roundedShape(pts) {
  const P = [];
  for (const p of pts) { const q = P[P.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) P.push(p); }
  if (Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-4) P.pop();
  const s = new THREE.Shape(); const n = P.length;
  for (let i = 0; i < n; i++) {
    const p = P[i], a = P[(i - 1 + n) % n], b = P[(i + 1) % n], r = p[2] || 0;
    if (r <= 0) { if (i === 0) s.moveTo(p[0], p[1]); else s.lineTo(p[0], p[1]); continue; }
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ra = Math.min(r, la * 0.5), rb = Math.min(r, lb * 0.5);
    const x0 = p[0] + ((a[0] - p[0]) / la) * ra, y0 = p[1] + ((a[1] - p[1]) / la) * ra;
    const x1 = p[0] + ((b[0] - p[0]) / lb) * rb, y1 = p[1] + ((b[1] - p[1]) / lb) * rb;
    if (i === 0) s.moveTo(x0, y0); else s.lineTo(x0, y0);
    s.quadraticCurveTo(p[0], p[1], x1, y1);
  }
  s.closePath();
  return s;
}
// yan profil (z,y) → x boyunca genişliğe kalıp çıkar, yumuşak normaller
function extrudeSide(pts, W, bevel, curveSeg = 4) {
  const depth = Math.max(0.01, W - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(roundedShape(pts), { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: curveSeg, steps: 1 });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  return smoothGeo(g);
}

// ======================================================================
// Türk plakası atlası ("34 ABC 123", mavi TR şeridi)
// ======================================================================
let plateTex = null, plateMat = null;
const PL_COLS = 8, PL_ROWS = 16;
function plateMaterial() {
  if (plateMat) return plateMat;
  const CW = 256, CH = 64;
  const c = makeCanvas(CW * PL_COLS, CH * PL_ROWS); const g = c.getContext('2d');
  const r = new RNG(34);
  const LET = 'ABCDEFGHJKLMNPRSTUVYZ';
  for (let i = 0; i < PL_COLS * PL_ROWS; i++) {
    const x = (i % PL_COLS) * CW, y = Math.floor(i / PL_COLS) * CH;
    g.fillStyle = '#111'; g.fillRect(x + 2, y + 2, CW - 4, CH - 4);
    g.fillStyle = '#f3f3ee'; g.fillRect(x + 5, y + 5, CW - 10, CH - 10);
    g.fillStyle = '#1f3f9a'; g.fillRect(x + 5, y + 5, 30, CH - 10);
    g.fillStyle = '#fff'; g.font = 'bold 15px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('TR', x + 20, y + CH - 18);
    let txt;
    if (i < 104) {
      const city = r.pick(['34', '34', '34', '34', '34', '06', '35', '16', '41', '59']);
      const nL = r.int(1, 3); let L = ''; for (let k = 0; k < nL; k++) L += LET[r.int(0, LET.length - 1)];
      const nD = nL === 1 ? 4 : nL === 2 ? r.int(3, 4) : r.int(2, 3); let D = ''; for (let k = 0; k < nD; k++) D += r.int(k === 0 ? 1 : 0, 9);
      txt = `${city} ${L} ${D}`;
    } else txt = `34 ${i < 120 ? 'T' : 'A'} ${r.int(1000, 9999)}`;
    g.fillStyle = '#111'; let size = 40;
    g.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`;
    while (g.measureText(txt).width > CW - 52 && size > 20) { size -= 2; g.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`; }
    g.fillText(txt, x + 36 + (CW - 42) / 2, y + CH / 2 + 2);
  }
  plateTex = new THREE.CanvasTexture(c); plateTex.colorSpace = THREE.SRGBColorSpace; plateTex.anisotropy = 4;
  plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.4, metalness: 0.2 });
  return plateMat;
}
function plateQuad(slot, w, h, x, y, z, back) {
  const g = new THREE.PlaneGeometry(w, h);
  const u0 = (slot % PL_COLS) / PL_COLS, u1 = u0 + 1 / PL_COLS;
  const row = Math.floor(slot / PL_COLS), v1 = 1 - row / PL_ROWS, v0 = v1 - 1 / PL_ROWS;
  const uv = g.attributes.uv;
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
  if (back) g.rotateY(Math.PI);
  g.translate(x, y, z);
  return g;
}

// ======================================================================
// Dekal dokuları (polis, ambulans, taksi, otobüs, özel harekat)
// ======================================================================
const decalCache = new Map();
function liveryTex(kind) {
  if (decalCache.has(kind)) return decalCache.get(kind);
  const c = makeCanvas(1024, 256); const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'police') {
    g.fillStyle = '#1d3d8e'; g.fillRect(0, 70, 1024, 120);
    g.fillStyle = '#c81414'; g.fillRect(0, 196, 1024, 14);
    g.fillStyle = '#fff'; g.font = 'bold 96px Arial'; g.fillText('POLİS', 470, 132);
    g.font = 'bold 44px Arial'; g.fillText('155', 860, 132);
  } else if (kind === 'swat') {
    g.fillStyle = '#e8e8e8'; g.font = 'bold 84px Arial'; g.fillText('ÖZEL HAREKAT', 512, 110);
    g.fillStyle = '#c8a000'; g.fillRect(40, 175, 944, 12); g.font = 'bold 48px Arial'; g.fillStyle = '#e8e8e8'; g.fillText('POLİS', 512, 225);
  } else if (kind === 'ambulance') {
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#f2c200' : '#d21414'; g.fillRect(i * 64, 150, 64, 46); }
    g.fillStyle = '#d21414'; g.font = 'bold 86px Arial'; g.fillText('AMBULANS', 420, 80);
    g.font = 'bold 70px Arial'; g.fillText('112', 880, 80);
  } else if (kind === 'taxi') {
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; g.fillRect(i * 32, 108 + j * 20, 32, 20); }
  } else if (kind === 'bus') {
    g.fillStyle = '#1d5aa8'; g.fillRect(0, 40, 1024, 70);
    g.fillStyle = '#e8a000'; g.fillRect(0, 115, 1024, 18);
    g.fillStyle = '#1d5aa8'; g.font = 'bold 64px Arial'; g.fillText('İETT', 820, 190);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  decalCache.set(kind, m);
  return m;
}
let taxiSignMat = null;
function taxiSign() {
  if (!taxiSignMat) taxiSignMat = new THREE.MeshStandardMaterial({ map: signTexture('TAKSİ', '#111111', '#f2c200', 256, 96), emissive: 0xffffff, emissiveMap: signTexture('TAKSİ', '#111111', '#f2c200', 256, 96), emissiveIntensity: 0.3 });
  return taxiSignMat;
}

// ======================================================================
// Tekerlek geometrisi (lastik + diş + jant kolları + disk/kaliper)
// ======================================================================
const wheelCache = new Map();
function wheelGeo(r, w, kind) {
  const key = `${r}|${w}|${kind}`;
  if (wheelCache.has(key)) return wheelCache.get(key);
  const parts = [];
  const ri = r * (kind === 'moto' ? 0.82 : 0.66);
  // lastik: yuvarlak omuzlu dönel profil (Y ekseninde, sonra X'e çevrilir)
  const prof = [];
  const hw = w / 2;
  prof.push(new THREE.Vector2(ri, -hw * 0.9));
  for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + (k / 6) * Math.PI / 2; prof.push(new THREE.Vector2(r - 0.04 + Math.cos(a) * 0.04 - 0.0, -hw + 0.04 + Math.sin(a) * 0.04 + 0.04)); }
  for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; prof.push(new THREE.Vector2(r - 0.04 + Math.cos(a) * 0.04, hw - 0.04 + Math.sin(a) * 0.04)); }
  prof.push(new THREE.Vector2(ri, hw * 0.9));
  const tire = new THREE.LatheGeometry(prof, 22); tire.rotateZ(-Math.PI / 2);
  parts.push(colorize(tire, 0x141414));
  // diş blokları
  const nT = kind === 'moto' ? 16 : 20;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * Math.PI * 2;
    const t = new THREE.BoxGeometry(w * 0.78, 0.022, 0.05);
    t.translate(0, r + 0.004, 0); t.rotateX(a);
    parts.push(colorize(t, 0x0c0c0c));
  }
  const face = hw - 0.025;
  const silver = kind === 'steel' ? 0x6a6e58 : kind === 'black' ? 0x2a2a2a : 0xb9bcc0;
  // jant çanağı
  parts.push(colorize(cyl(ri, ri, w * 0.86, 18, 'x', 0, 0, 0, true), 0x3a3a3a));
  parts.push(colorize(new THREE.TorusGeometry(ri, 0.014, 6, 22).rotateY(Math.PI / 2).translate(face, 0, 0), silver));
  if (kind === 'moto') {
    // telli jant
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; parts.push(colorize(beam(0, 0, 0, 0, Math.cos(a) * ri, Math.sin(a) * ri, 0.008, 0.008, true), 0xc0c0c0)); }
    parts.push(colorize(cyl(0.05, 0.05, w, 10, 'x', 0, 0, 0), 0xa0a0a0));
    parts.push(colorize(cyl(r * 0.45, r * 0.45, 0.01, 18, 'x', face - 0.02, 0, 0), 0x8a8a8a));
  } else {
    parts.push(colorize(cyl(r * 0.16, r * 0.18, 0.06, 10, 'x', face - 0.01, 0, 0), silver));
    const nS = kind === 'sport' ? 10 : kind === 'suv' ? 6 : kind === 'steel' || kind === 'bus' ? 0 : 5;
    if (nS) {
      for (let i = 0; i < nS; i++) {
        const a = (i / nS) * Math.PI * 2;
        const s = new THREE.BoxGeometry(0.03, ri - r * 0.16, kind === 'sport' ? 0.03 : 0.07);
        s.translate(face - 0.015, r * 0.16 + (ri - r * 0.16) / 2, 0); s.rotateX(a);
        parts.push(colorize(s, silver));
      }
    } else {
      // çelik/otobüs jantı: disk + bijon
      parts.push(colorize(cyl(ri * 0.97, ri * 0.97, 0.02, 18, 'x', face - 0.03, 0, 0), silver));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; parts.push(colorize(cyl(0.02, 0.02, 0.03, 6, 'x', face - 0.01, Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3), 0x9a9a9a)); }
    }
    // fren diski ve kaliper
    parts.push(colorize(cyl(r * 0.52, r * 0.52, 0.025, 18, 'x', face - 0.11, 0, 0), 0x8c8c8c));
    parts.push(colorize(bx(0.06, r * 0.28, r * 0.2, face - 0.08, r * 0.38, 0), kind === 'sport' ? 0xc0141a : 0x505050));
  }
  const g = mergeGeometries(parts);
  wheelCache.set(key, g);
  return g;
}

// ======================================================================
// Gövde şablonları
// ======================================================================
// Stil parametreleri. top: [z,y,yarıçap] önden-alttan başlayıp üstten arkaya-alta.
function specFor(type, def) {
  const L = def.len, W = def.wid, H = def.hei;
  const st = def.body || def.style;
  const S = { st, L, W, H, cabW: 0.94, tumble: 0.22, taper: 0.1, taperStart: 0.72, barrel: 0.03, bevel: 0.08, pillar: 0.07, windshield: true, rearGlass: true,
    bumper: 'paint', grille: 'sedan', mirrors: true, plate: true, interior: 0x2b2622, seats: 'car', doorSeams: [], handles: [], lights: 'modern', solidColor: null };
  if (st === 'sedan' || st === 'taxi' || st === 'police') {
    Object.assign(S, { cl: 0.27, r: 0.33, tw: 0.22, axles: [L * 0.3, -L * 0.3], arch: 0.07, belt: 0.67 * H, hood: 0.6 * H });
    const b = S.belt, hd = S.hood, tr = 0.66 * H;
    S.top = [[L / 2 - 0.05, S.cl, 0.08], [L / 2, S.cl + 0.18, 0.1], [L / 2, hd - 0.12, 0.14], [L / 2 - 0.2, hd, 0.2], [L * 0.27, b - 0.01, 0.15], [-L * 0.3, b, 0.1], [-L / 2 + 0.18, tr, 0.18], [-L / 2, tr - 0.2, 0.12], [-L / 2, S.cl + 0.2, 0.1], [-L / 2 + 0.05, S.cl, 0.08]];
    S.cab = { ws: [L * 0.27, b], rf: [L * 0.27 - 1.75 * (H - b), H], rr: [-L * 0.17, H], rw: [-L * 0.3, b], roofR: 0.12 };
    S.windows = [[99, -0.01], [-0.09, -99]];
    S.pillars = [-0.05];
    S.doorSeams = [S.axles[0] - 0.47, -0.05, S.axles[1] + 0.47];
    S.handles = [0.08, S.axles[1] + 0.6];
  } else if (st === 'wagon') {
    Object.assign(S, { cl: 0.26, r: 0.31, tw: 0.19, axles: [L * 0.3, -L * 0.31], arch: 0.06, belt: 0.66 * H, hood: 0.6 * H, tumble: 0.12, taper: 0.04, bevel: 0.05, bumper: 'chrome', grille: 'old', lights: 'old', interior: 0x5a4632 });
    const b = S.belt, hd = S.hood;
    S.top = [[L / 2 - 0.04, S.cl, 0.05], [L / 2, S.cl + 0.15, 0.05], [L / 2, hd - 0.06, 0.06], [L / 2 - 0.08, hd, 0.08], [L * 0.25, b - 0.02, 0.06], [-L / 2 + 0.06, b, 0.06], [-L / 2, b - 0.1, 0.06], [-L / 2, S.cl + 0.15, 0.05], [-L / 2 + 0.04, S.cl, 0.05]];
    S.cab = { ws: [L * 0.25, b], rf: [L * 0.25 - 0.55, H], rr: [-L / 2 + 0.12, H], rw: [-L / 2 + 0.04, b], roofR: 0.05 };
    S.windows = [[99, 0.04], [-0.04, -L * 0.28 + 0.04], [-L * 0.28 - 0.04, -99]];
    S.pillars = [0, -L * 0.28];
    S.doorSeams = [S.axles[0] - 0.42, 0, S.axles[1] + 0.42];
    S.handles = [0.12, S.axles[1] + 0.55];
  } else if (st === 'sport') {
    Object.assign(S, { cl: 0.17, r: 0.34, tw: 0.28, axles: [L * 0.31, -L * 0.3], arch: 0.05, belt: 0.64 * H, hood: 0.5 * H, tumble: 0.32, cabW: 0.9, taper: 0.14, taperStart: 0.6, grille: 'sport', interior: 0x1a1a1a });
    const b = S.belt, hd = S.hood;
    S.top = [[L / 2 - 0.06, S.cl, 0.08], [L / 2, S.cl + 0.12, 0.1], [L / 2 - 0.05, S.cl + 0.3, 0.15], [L / 2 - 0.35, hd, 0.3], [L * 0.16, b - 0.02, 0.2], [-L * 0.4, b + 0.05, 0.1], [-L / 2 + 0.05, b + 0.02, 0.06], [-L / 2, b - 0.22, 0.1], [-L / 2, S.cl + 0.15, 0.08], [-L / 2 + 0.06, S.cl, 0.06]];
    S.cab = { ws: [L * 0.16, b], rf: [L * 0.16 - 0.85, H], rr: [-L * 0.14, H - 0.02], rw: [-L * 0.4, b + 0.03], roofR: 0.18 };
    S.windows = [[99, -L * 0.1 + 0.04], [-L * 0.1 - 0.04, -99]];
    S.pillars = [-L * 0.1];
    S.doorSeams = [S.axles[0] - 0.42, -L * 0.12];
    S.handles = [-L * 0.08];
  } else if (st === 'suv') {
    Object.assign(S, { cl: 0.36, r: 0.4, tw: 0.27, axles: [L * 0.3, -L * 0.3], arch: 0.09, belt: 0.62 * H, hood: 0.57 * H, tumble: 0.14, interior: 0x221e1a });
    const b = S.belt, hd = S.hood;
    S.top = [[L / 2 - 0.05, S.cl, 0.1], [L / 2, S.cl + 0.2, 0.1], [L / 2, hd - 0.15, 0.15], [L / 2 - 0.2, hd, 0.2], [L * 0.26, b - 0.02, 0.12], [-L / 2 + 0.08, b, 0.08], [-L / 2, b - 0.15, 0.08], [-L / 2, S.cl + 0.2, 0.1], [-L / 2 + 0.05, S.cl, 0.08]];
    S.cab = { ws: [L * 0.26, b], rf: [L * 0.26 - 0.6, H], rr: [-L / 2 + 0.18, H], rw: [-L / 2 + 0.06, b], roofR: 0.14 };
    S.windows = [[99, -0.01], [-0.09, -L * 0.3 + 0.04], [-L * 0.3 - 0.04, -99]];
    S.pillars = [-0.05, -L * 0.3];
    S.doorSeams = [S.axles[0] - 0.52, -0.05, S.axles[1] + 0.52];
    S.handles = [0.08, S.axles[1] + 0.65];
  } else if (st === 'jeep') {
    Object.assign(S, { cl: 0.45, r: 0.42, tw: 0.3, axles: [L * 0.3, -L * 0.29], arch: 0.12, belt: 0.58 * H, hood: 0.56 * H, tumble: 0.03, cabW: 0.97, taper: 0.02, bevel: 0.04, bumper: 'dark', grille: 'jeep', lights: 'old', plate: false, interior: 0x2a2a1e, solidColor: 0x3b4128 });
    const b = S.belt, hd = S.hood;
    S.top = [[L / 2 - 0.03, S.cl, 0.04], [L / 2, S.cl + 0.1, 0.04], [L / 2, hd - 0.05, 0.05], [L / 2 - 0.05, hd, 0.05], [L * 0.2, hd + 0.02, 0.05], [L * 0.18, b, 0.03], [-L / 2 + 0.02, b, 0.04], [-L / 2, b - 0.05, 0.04], [-L / 2, S.cl + 0.1, 0.04], [-L / 2 + 0.03, S.cl, 0.04]];
    S.cab = { ws: [L * 0.18, b], rf: [L * 0.14, H], rr: [-L / 2 + 0.04, H], rw: [-L / 2 + 0.02, b], roofR: 0.06 };
    S.windows = [[99, -0.1]];
    S.solid = [[-0.1, -99]];
    S.rearGlass = false;
    S.pillars = [];
    S.doorSeams = [S.axles[0] - 0.55, -0.1];
  } else if (st === 'van' || st === 'swat' || st === 'ambulance') {
    Object.assign(S, { cl: 0.3, r: 0.36, tw: 0.24, axles: [L * 0.33, -L * 0.31], arch: 0.07, belt: 0.47 * H, tumble: 0.05, cabW: 0.98, taper: 0.05, bevel: 0.07, bumper: st === 'swat' ? 'dark' : 'paint', grille: 'van', interior: 0x2a2a2a, seats: 'van' });
    const b = S.belt;
    S.top = [[L / 2 - 0.05, S.cl, 0.08], [L / 2, S.cl + 0.2, 0.1], [L / 2, 0.36 * H, 0.15], [L / 2 - 0.42, b - 0.03, 0.25], [-L / 2 + 0.04, b, 0.04], [-L / 2, b - 0.1, 0.04], [-L / 2, S.cl + 0.2, 0.08], [-L / 2 + 0.05, S.cl, 0.06]];
    S.cab = { ws: [L / 2 - 0.42, b], rf: [L / 2 - 1.15, H], rr: [-L / 2 + 0.08, H], rw: [-L / 2 + 0.02, b], roofR: 0.15 };
    const zB = L / 2 - 1.6;
    if (st === 'van') {
      S.windows = [[99, zB + 0.05], [zB - 0.05, -0.25], [-0.35, -L * 0.3 + 0.05], [-L * 0.3 - 0.05, -99]];
      S.pillars = [zB, -0.3, -L * 0.3];
    } else {
      S.windows = [[99, zB + 0.05]]; S.solid = [[zB + 0.05, -99]]; S.pillars = [zB]; S.rearGlass = st === 'ambulance';
    }
    S.doorSeams = [S.axles[0] - 0.45, zB, zB - 1.1];
    S.handles = [zB + 0.15];
  } else if (st === 'bus') {
    Object.assign(S, { cl: 0.3, r: 0.5, tw: 0.3, axles: [L / 2 - 2.4, -L / 2 + 3.0], arch: 0.08, belt: 0.36 * H, tumble: 0.03, cabW: 0.99, taper: 0.02, bevel: 0.1, bumper: 'dark', grille: 'bus', mirrors: true, interior: 0x2a3a5a, seats: 'bus', wheelKind: 'bus' });
    const b = S.belt;
    S.top = [[L / 2 - 0.08, S.cl, 0.08], [L / 2, S.cl + 0.15, 0.12], [L / 2, b, 0], [-L / 2, b, 0], [-L / 2, S.cl + 0.15, 0.12], [-L / 2 + 0.08, S.cl, 0.08]];
    S.cab = { ws: [L / 2 - 0.02, b], rf: [L / 2 - 0.18, H], rr: [-L / 2 + 0.12, H], rw: [-L / 2 + 0.02, b], roofR: 0.22 };
    S.windows = []; S.pillars = [];
    let z = L / 2 - 1.25;
    S.windows.push([99, z + 0.05]); S.pillars.push(z);
    while (z - 1.6 > -L / 2 + 0.5) { S.windows.push([z - 0.05, z - 1.55]); z -= 1.6; S.pillars.push(z); }
    S.windows.push([z - 0.05, -99]);
  } else if (st === 'truck') {
    const cz = L / 2 - 2.3;
    Object.assign(S, { cl: 0.55, r: 0.5, tw: 0.3, axles: [L / 2 - 1.2, -L / 2 + 2.9, -L / 2 + 1.6], arches: [L / 2 - 1.2], arch: 0.1, belt: 1.55, tumble: 0.04, cabW: 0.98, taper: 0.02, bevel: 0.08, bumper: 'dark', grille: 'truck', interior: 0x2a2a2a, seats: 'van', wheelKind: 'steel', cabRear: cz, wheelX: W / 2 - 0.2 });
    const b = S.belt, Hc = H - 0.25;
    S.top = [[L / 2 - 0.05, S.cl, 0.06], [L / 2, S.cl + 0.25, 0.08], [L / 2, b, 0.05], [cz, b, 0.04], [cz, S.cl, 0.04]];
    S.cab = { ws: [L / 2 - 0.04, b], rf: [L / 2 - 0.25, Hc], rr: [cz + 0.05, Hc], rw: [cz, b], roofR: 0.12 };
    S.windows = [[99, L / 2 - 1.2]]; S.solid = [[L / 2 - 1.2, cz]]; S.pillars = [L / 2 - 1.2]; S.rearGlass = false;
    S.doorSeams = [L / 2 - 0.15, L / 2 - 1.3];
    S.handles = [L / 2 - 1.15];
    S.Hc = Hc;
  }
  S.archR = S.r + S.arch; S.archY = S.r + 0.02;
  if (!S.arches) S.arches = S.axles;
  if (!S.solid) S.solid = [];
  // yarı genişlik fonksiyonu: önden-arkadan daralma + kabin içe eğimi
  const L2 = L / 2;
  S.hwK = (y, z) => {
    let k = 1;
    const az = Math.min(1.05, Math.abs(z) / L2);
    if (az > S.taperStart) k *= 1 - S.taper * ((az - S.taperStart) / (1 - S.taperStart)) ** 2;
    if (y > S.belt + 1e-3) k *= S.cabW * (1 - S.tumble * Math.min(1, (y - S.belt) / (H - S.belt)));
    else { const m = (S.cl + S.belt) / 2, hh = (S.belt - S.cl) / 2; k *= 1 - S.barrel * ((y - m) / hh) ** 2; }
    return k;
  };
  S.hw = (y, z) => (W / 2) * S.hwK(y, z);
  // ön/arka yüzey z'si (profil çokgeninden)
  S.frontZ = (y) => profileZ(S.top, y, 1);
  S.rearZ = (y) => profileZ(S.top, y, -1);
  return S;
}
function profileZ(top, y, side) {
  let best = side * 1e9;
  for (let i = 0; i < top.length - 1; i++) {
    const a = top[i], b = top[i + 1];
    if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
    const t = (y - a[1]) / (b[1] - a[1]); const z = a[0] + (b[0] - a[0]) * t;
    if (side > 0 ? z > 0 && (best === 1e9 || z > best) : z < 0 && (best === -1e9 || z < best)) best = z;
  }
  return Math.abs(best) > 1e8 ? side * top[0][0] : best;
}
function shapeX(g, S, cabin) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i);
    const k = cabin ? S.hwK(Math.max(y, S.belt + 2e-3), z) : S.hwK(Math.min(y, S.belt), z);
    p.setX(i, p.getX(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

class Parts {
  constructor() { this.paint = []; this.dark = []; this.chrome = []; this.glass = []; this.lights = []; this.decals = []; }
  p(g) { this.paint.push(prep(g)); }
  d(g, hex) { this.dark.push(colorize(g, hex)); }
  c(g) { this.chrome.push(prep(g)); }
  gl(g) { this.glass.push(prep(g)); }
  l(g, lens, emi, ch) { this.lights.push(lightize(g, lens, emi, ch)); }
}

// yan yüzeye yapışık şerit (kapı çizgisi, cam çıtası)
function sideStripV(B, S, z, y0, y1, w, hex, chrome) {
  for (const s of [1, -1]) {
    const pts = [];
    const N = 5;
    const pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const y = y0 + ((y1 - y0) * i) / N;
      const x = s * (S.hw(y, z) + 0.004);
      pos.push(x, y, z - w / 2, x, y, z + w / 2);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    void pts;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    if (chrome) B.c(g); else B.d(g, hex);
  }
}
function sideStripH(B, S, y, z0, z1, h, hex, chrome) {
  for (const s of [1, -1]) {
    const N = 8, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const z = z0 + ((z1 - z0) * i) / N;
      const x = s * (S.hw(y, z) + 0.005);
      pos.push(x, y - h / 2, z, x, y + h / 2, z);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    if (chrome) B.c(g); else B.d(g, hex);
  }
}
// yan yüzeye oturan dekal ızgarası (yazı okunur yönde)
function sideDecal(S, z0, z1, y0, y1) {
  const parts = [];
  for (const s of [1, -1]) {
    const NZ = 10, NY = 4, pos = [], uv = [], idx = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NZ; i++) {
      const y = y0 + ((y1 - y0) * j) / NY, z = z0 + ((z1 - z0) * i) / NZ;
      pos.push(s * (S.hw(y, z) + 0.008), y, z);
      // +x (sol) tarafta metin önden arkaya, -x tarafta arkadan öne okunur
      uv.push(s > 0 ? 1 - i / NZ : i / NZ, j / NY);
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NZ; i++) {
      const a = j * (NZ + 1) + i, b = a + 1, c = a + NZ + 1, d = c + 1;
      if (s > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function buildGenericBody(B, S) {
  const { L, W, H, cl } = S;
  // --- alt gövde (çamurluk kavisleriyle) ---
  const arches = S.arches.map((z) => ({ z, r: S.archR, y: S.archY })).sort((a, b) => a.z - b.z);
  const pts = [S.top[S.top.length - 1]];
  for (const a of arches) {
    pts.push([a.z - a.r, cl, 0]);
    if (a.y > cl + 1e-3) pts.push([a.z - a.r, a.y, 0]);
    for (let k = 1; k < 12; k++) { const t = Math.PI - (k / 12) * Math.PI; pts.push([a.z + Math.cos(t) * a.r, a.y + Math.sin(t) * a.r, 0]); }
    if (a.y > cl + 1e-3) pts.push([a.z + a.r, a.y, 0]);
    pts.push([a.z + a.r, cl, 0]);
  }
  for (let i = 0; i < S.top.length - 1; i++) pts.push(S.top[i]);
  B.p(shapeX(extrudeSide(pts, W, S.bevel), S, false));
  // kavis içi koyu astar
  for (const a of arches) {
    const g = new THREE.CylinderGeometry(a.r - 0.015, a.r - 0.015, W - 0.12, 14, 1, true, -Math.PI / 2, Math.PI);
    g.rotateZ(Math.PI / 2); g.rotateY(Math.PI); g.translate(0, a.y, a.z);
    const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
    B.d(g, 0x0c0c0c);
  }
  // --- kabin: tavan + direkler + camlar (içi boş, iç mekân görünür) ---
  const cab = S.cab, b = S.belt;
  const ws = cab.ws, rf = cab.rf, rr = cab.rr, rw = cab.rw;
  const cabPoly = [[ws[0], b], [rf[0], rf[1]], [rr[0], rr[1]], [rw[0], b]];
  const T = 0.06;
  const roofPts = [[rf[0] + 0.02, rf[1] - T, 0], [rf[0], rf[1], cab.roofR * 0.6], [(rf[0] + rr[0]) / 2, H + 0.02, 0], [rr[0], rr[1], cab.roofR * 0.6], [rr[0] + 0.02, rr[1] - T, 0]];
  B.p(shapeX(extrudeSide(roofPts, W, 0.03, 3), S, true));
  const pw = S.pillar;
  const edgeAt = (a, c, y) => a[0] + (c[0] - a[0]) * ((y - a[1]) / (c[1] - a[1]));
  // A ve C direkleri
  for (const s of [1, -1]) {
    const yA0 = b, yA1 = rf[1] - 0.02;
    B.p(beam(s * (S.hw(yA0 + 0.01, ws[0]) - pw * 0.4), yA0, ws[0] - 0.02, s * (S.hw(yA1, rf[0]) - pw * 0.4), yA1, rf[0] - 0.02, pw, pw));
    B.p(beam(s * (S.hw(b + 0.01, rw[0]) - pw * 0.4), b, rw[0] + 0.02, s * (S.hw(rr[1] - 0.02, rr[0]) - pw * 0.4), rr[1] - 0.02, rr[0] + 0.02, pw * 1.3, pw));
    for (const zp of S.pillars) {
      const y1 = H - 0.03;
      B.p(beam(s * (S.hw(b + 0.01, zp) - pw * 0.4), b, zp, s * (S.hw(y1, zp) - pw * 0.4), y1, zp, pw * 1.2, pw));
    }
  }
  // kapalı (camsız) bölümler
  for (const [zHi, zLo] of S.solid) {
    const poly = clipZ(cabPoly, Math.max(zLo, -99), Math.min(zHi, 99)).map((p) => [p[0], p[1], 0]);
    if (poly.length < 3) continue;
    poly[0] = [poly[0][0], poly[0][1] - 0.02, 0];
    const g = shapeX(extrudeSide(poly.map((p) => [p[0], p[1] < b + 0.01 ? b - 0.03 : p[1], 0.03]), W, 0.04, 2), S, true);
    if (S.solidColor) B.d(g, S.solidColor); else B.p(g);
  }
  // ön cam / arka cam
  const pane = (a, c, inset, out) => {
    const pts3 = [];
    const dz = c[0] - a[0], dy = c[1] - a[1], ln = Math.hypot(dz, dy);
    let nz = dy / ln, ny = -dz / ln; if (ny < 0) { nz = -nz; ny = -ny; }
    const t0 = 0.04 / ln, t1 = 1 - (cab.roofR * 0.7 + 0.03) / ln;
    for (const [t, s] of [[t0, -1], [t0, 1], [t1, 1], [t1, -1]]) {
      const y = a[1] + dy * t, z = a[0] + dz * t;
      pts3.push([s * (S.hw(y, z) - inset), y + ny * out, z + nz * out]);
    }
    return polyGeo(pts3);
  };
  if (S.windshield) B.gl(pane(ws, rf, pw * 0.9, 0.004));
  if (S.rearGlass) B.gl(pane(rw, rr, pw * 1.1, 0.004));
  // yan camlar
  const y0 = b + 0.035, y1 = H - cab.roofR * 0.6 - 0.05;
  const trap = [[edgeAt([ws[0], b], rf, y0) - pw * 0.9, y0], [edgeAt([ws[0], b], rf, y1) - pw * 0.9, y1], [edgeAt([rw[0], b], rr, y1) + pw * 1.2, y1], [edgeAt([rw[0], b], rr, y0) + pw * 1.2, y0]];
  for (const [zHi, zLo] of S.windows) {
    const poly = clipZ(trap, zLo, zHi);
    if (poly.length < 3) continue;
    for (const s of [1, -1]) B.gl(polyGeo(poly.map((p) => [s * (S.hw(p[1], p[0]) + 0.003), p[1], p[0]])));
  }
  // iç mekân zemini (bel çizgisinde koyu kaplama)
  B.d(bx(W - 0.3, 0.012, Math.abs(ws[0] - rw[0]) - 0.1, 0, b + 0.006, (ws[0] + rw[0]) / 2), S.interior);
  // cam çıtası ve kapı çizgileri
  sideStripH(B, S, b + 0.012, rw[0] + 0.05, ws[0] - 0.05, 0.022, 0x111111, S.st === 'sedan' || S.st === 'wagon');
  for (const z of S.doorSeams) sideStripV(B, S, z, cl + 0.1, b - 0.01, 0.012, 0x0a0a0a);
  for (const z of S.handles) for (const s of [1, -1]) B.c(rbx(0.025, 0.035, 0.15, 0.012, s * (S.hw(b - 0.1, z) + 0.008), b - 0.1, z));
  // aynalar
  if (S.mirrors) {
    const zm = ws[0] - 0.16, ym = b + 0.1;
    for (const s of [1, -1]) {
      const xm = s * (S.hw(b, zm) + 0.13);
      B.p(rbx(0.12, 0.12, 0.16, 0.04, xm, ym, zm));
      B.d(bx(0.14, 0.04, 0.05, s * (S.hw(b, zm) + 0.05), ym - 0.03, zm), 0x111111);
      B.c(bx(0.1, 0.1, 0.01, xm, ym, zm - 0.082));
    }
  }
  return { cabPoly };
}

function buildFrontRear(B, S) {
  const { L, W, cl } = S;
  const b = S.belt;
  const isBox = S.st === 'van' || S.st === 'swat' || S.st === 'ambulance' || S.st === 'bus' || S.st === 'truck';
  // farlar
  const yH = S.st === 'bus' ? cl + 0.55 : S.st === 'truck' ? cl + 0.45 : isBox ? 0.36 * S.H - 0.08 : (S.hood || b) - 0.1;
  const zF = S.frontZ(yH);
  const hwF = S.hw(yH, zF - 0.05);
  for (const s of [1, -1]) {
    const xh = s * (hwF - (S.st === 'bus' ? 0.35 : 0.27));
    if (S.lights === 'old') {
      B.c(cyl(0.11, 0.11, 0.05, 14, 'z', xh, yH, zF - 0.01));
      B.l(cyl(0.09, 0.09, 0.03, 14, 'z', xh, yH, zF + 0.02), 0xdfe6ea, 0xfff2d8, 0);
      B.l(rbx(0.1, 0.06, 0.04, 0.015, s * (hwF - 0.08), yH - 0.15, zF - 0.01), 0xc07a10, 0xff8a10, s > 0 ? 3 : 4);
    } else {
      const w = S.st === 'sport' ? 0.36 : 0.32, h = S.st === 'sport' ? 0.08 : 0.12;
      B.c(rbx(w + 0.02, h + 0.02, 0.07, 0.02, xh, yH, zF - 0.04));
      B.l(rbx(w, h, 0.06, 0.02, xh, yH, zF - 0.02), 0xcfd8de, 0xfff4e0, 0);
      B.l(cyl(0.035, 0.035, 0.02, 10, 'z', xh - s * w * 0.18, yH, zF + 0.012), 0xffffff, 0xffffff, 0);
      B.l(bx(w * 0.9, 0.018, 0.02, xh, yH - h / 2 - 0.02, zF - 0.005), 0xe8eef2, 0xffffff, 0);
      B.l(rbx(0.07, h * 0.8, 0.05, 0.015, s * (hwF - 0.07), yH, zF - 0.04), 0xc07a10, 0xff8a10, s > 0 ? 3 : 4);
    }
    // arka stop
    const yT = S.st === 'bus' ? cl + 0.75 : S.st === 'truck' ? cl + 0.35 : isBox ? b - 0.15 : b - 0.12;
    const zR = S.st === 'truck' ? -L / 2 : S.rearZ(yT);
    const hwR = S.st === 'truck' ? W / 2 : S.hw(yT, zR + 0.05);
    const xt = s * (hwR - 0.24);
    if (isBox) {
      B.l(rbx(0.16, 0.32, 0.05, 0.02, s * (hwR - 0.12), yT, zR + 0.0), 0x5a0808, 0xff1a0a, 1);
      B.l(rbx(0.16, 0.1, 0.05, 0.02, s * (hwR - 0.12), yT - 0.24, zR + 0.0), 0xb06a10, 0xff8a10, s > 0 ? 3 : 4);
      B.l(rbx(0.16, 0.08, 0.05, 0.02, s * (hwR - 0.12), yT + 0.22, zR + 0.0), 0xcccccc, 0xffffff, 7);
    } else {
      B.l(rbx(0.38, 0.12, 0.06, 0.025, xt, yT, zR + 0.015), 0x5a0808, 0xff1a0a, 1);
      B.l(rbx(0.1, 0.1, 0.06, 0.02, s * (hwR - 0.5), yT, zR + 0.012), 0xb06a10, 0xff8a10, s > 0 ? 3 : 4);
      B.l(rbx(0.1, 0.05, 0.05, 0.015, s * (hwR - 0.5), yT - 0.1, zR + 0.012), 0xcccccc, 0xffffff, 7);
    }
  }
  // üçüncü stop lambası
  if (S.cab && S.st !== 'truck') B.l(bx(0.4, 0.04, 0.03, 0, S.cab.rr[1] - 0.06, S.cab.rr[0] + 0.02), 0x5a0808, 0xff1a0a, 2);
  // tamponlar
  const bumpH = isBox ? 0.24 : 0.2;
  const zFb = S.frontZ(cl + 0.15), zRb = S.st === 'truck' ? -L / 2 : S.rearZ(cl + 0.15);
  const bumpW = S.hw(cl + 0.15, zFb - 0.1) * 2 - 0.04;
  const bump = (z) => rbx(bumpW, bumpH, 0.16, 0.06, 0, cl + 0.13, z);
  if (S.bumper === 'chrome') { B.c(bump(zFb - 0.04)); B.c(bump(zRb + 0.04)); }
  else if (S.bumper === 'dark') { B.d(bump(zFb - 0.04), 0x1a1a1a); B.d(bump(zRb + 0.04), 0x1a1a1a); }
  else { B.p(bump(zFb - 0.05)); B.p(bump(zRb + 0.05)); B.d(bx(bumpW * 0.6, 0.06, 0.04, 0, cl + 0.05, zFb - 0.04), 0x111111); }
  // ızgara
  const gy = isBox ? (S.st === 'bus' ? cl + 0.3 : cl + 0.42) : (yH + cl + 0.2) / 2;
  const gw = S.st === 'sport' ? W * 0.5 : S.st === 'bus' ? W * 0.5 : W * 0.42, gh = S.st === 'jeep' ? 0.36 : S.st === 'sport' ? 0.12 : isBox ? 0.22 : 0.15;
  const zG = S.frontZ(gy);
  B.d(rbx(gw, gh, 0.05, 0.02, 0, gy, zG - 0.015), 0x0b0b0b);
  if (S.grille === 'jeep') for (let i = -3; i <= 3; i++) B.d(bx(0.035, gh * 0.9, 0.03, i * gw / 7.5, gy, zG + 0.01), 0x3b4128);
  else if (S.grille !== 'sport') for (let i = 0; i < 3; i++) B.c(bx(gw * 0.94, 0.012, 0.02, 0, gy - gh * 0.3 + i * gh * 0.3, zG + 0.012));
  if (S.grille !== 'jeep' && S.grille !== 'bus') B.c(cyl(0.045, 0.045, 0.02, 14, 'z', 0, gy, zG + 0.02));
  if (S.st === 'sport') { B.d(bx(W * 0.8, 0.03, 0.2, 0, cl + 0.03, zFb + 0.02), 0x0a0a0a); B.d(bx(W * 0.6, 0.12, 0.12, 0, cl + 0.08, zRb - 0.02), 0x0a0a0a); }
  // egzoz
  const ex = S.st === 'sport' ? [-0.25, -0.15, 0.15, 0.25] : [-0.45 * W / 1.8];
  for (const x of ex) B.c(cyl(0.035, 0.035, 0.2, 10, 'z', x, cl + 0.06, zRb + 0.02));
  return { zFb, zRb };
}

function buildInterior(B, S, def) {
  const { W, cl } = S;
  const b = S.belt;
  const ws = S.cab.ws[0];
  const ic = S.interior;
  const seatY = Math.max(cl + 0.25, b - 0.42);
  const dz = ws - 0.75;
  const seat = (x, z, wide) => {
    B.d(rbx(wide ? W * 0.62 : 0.48, 0.14, 0.48, 0.05, x, seatY, z), ic);
    B.d(beam(x, seatY + 0.05, z - 0.25, x, seatY + 0.62, z - 0.34, 0.1, wide ? W * 0.62 : 0.46), ic);
    if (!wide) B.d(rbx(0.24, 0.16, 0.08, 0.03, x, seatY + 0.72, z - 0.36), ic);
  };
  if (S.seats === 'bus') {
    for (let z = S.L / 2 - 2.6; z > -S.L / 2 + 1; z -= 1.3) for (const s of [1, -1]) seat(s * W * 0.27, z, false);
  } else {
    seat(W * 0.22, dz, false); seat(-W * 0.22, dz, false);
    if (S.seats === 'car' && S.cab.rw[0] < dz - 1.0) seat(0, dz - 0.95, true);
    if (S.seats === 'van' && S.st === 'van') for (let z = dz - 1.0; z > -S.L / 2 + 0.6; z -= 0.9) seat(0, z, true);
  }
  // gösterge paneli ve direksiyon (sürücü solda: +x)
  B.d(rbx(W - 0.35, 0.16, 0.38, 0.05, 0, b + 0.04, ws - 0.2), 0x141414);
  const dx = S.st === 'bus' ? W * 0.28 : W * 0.22, sy = b + 0.06, sz = ws - 0.48;
  const ring = new THREE.TorusGeometry(S.st === 'bus' ? 0.24 : 0.18, 0.022, 6, 18);
  ring.rotateX(-0.45); ring.translate(dx, sy, sz);
  B.d(ring, 0x0e0e0e);
  B.d(beam(dx, sy, sz, dx, sy - 0.12, sz + 0.25, 0.05, 0.05, true), 0x111111);
  void def;
  return { driver: [dx, seatY + 0.07, dz] };
}

// ---- özel donanımlar ----
function lightbar(B, x, y, z, w, kindA = 0xd01010, kindB = 0x1040e0) {
  B.d(rbx(w, 0.07, 0.24, 0.03, x, y + 0.035, z), 0x151515);
  B.l(rbx(w * 0.46, 0.1, 0.2, 0.04, x + w * 0.25, y + 0.1, z), 0x601010, kindA, 5);
  B.l(rbx(w * 0.46, 0.1, 0.2, 0.04, x - w * 0.25, y + 0.1, z), 0x101860, kindB, 6);
}

const templates = new Map();
function getTemplate(type) {
  if (templates.has(type)) return templates.get(type);
  const def = CARS[type];
  const st = def.body || def.style;
  let T;
  if (st === 'moto') T = buildMotoTemplate(def);
  else if (st === 'tank') T = buildTankTemplate(def);
  else T = buildCarTemplate(type, def);
  templates.set(type, T);
  return T;
}

function buildCarTemplate(type, def) {
  const S = specFor(type, def);
  const B = new Parts();
  buildGenericBody(B, S);
  const fr = buildFrontRear(B, S);
  const inter = buildInterior(B, S, def);
  const { L, W, H, cl } = S;
  const T = { S, decals: [], extras: [], plates: [], siren: false, wheelR: S.r, driver: inter.driver };
  const st = S.st;
  // plakalar
  if (S.plate) {
    T.plates.push([0, cl + 0.2, fr.zFb + 0.04, false]);
    const yP = st === 'truck' ? cl + 0.3 : st === 'bus' ? cl + 0.45 : (S.st === 'van' || st === 'swat' || st === 'ambulance') ? cl + 0.42 : (S.rearZ ? S.belt - 0.3 : cl + 0.3);
    T.plates.push([0, yP, (st === 'truck' ? -L / 2 : S.rearZ(yP)) - 0.012, true]);
    T.plateSlot = st === 'taxi' ? [104, 119] : (st === 'police' || st === 'swat') ? [120, 127] : [0, 103];
  }
  if (st === 'taxi') {
    T.extras.push({ geo: rbx(0.62, 0.2, 0.26, 0.05, 0, H + 0.1, S.cab.rf[0] - 0.35), mat: 'taxiSign' });
    B.d(bx(0.5, 0.03, 0.2, 0, H + 0.005, S.cab.rf[0] - 0.35), 0x111111);
    T.decals.push({ geo: sideDecal(S, S.axles[1] + 0.5, S.axles[0] - 0.5, S.belt - 0.28, S.belt - 0.12), kind: 'taxi' });
  }
  if (st === 'police' || st === 'swat' || st === 'ambulance') {
    T.siren = true;
    const zl = st === 'police' ? (S.cab.rf[0] + S.cab.rr[0]) / 2 + 0.15 : S.cab.rf[0] - 0.15;
    lightbar(B, 0, H, zl, st === 'police' ? 1.1 : 1.4, 0xd01010, st === 'ambulance' ? 0xd01010 : 0x1040e0);
    if (st === 'police') {
      T.decals.push({ geo: sideDecal(S, S.axles[1] + 0.2, S.axles[0] - 0.2, cl + 0.18, S.belt - 0.05), kind: 'police' });
      B.d(rbx(W * 0.7, 0.3, 0.08, 0.03, 0, cl + 0.3, fr.zFb + 0.1), 0x111111);
    } else if (st === 'swat') {
      T.decals.push({ geo: sideDecal(S, -L / 2 + 0.3, S.axles[0] - 0.5, S.belt + 0.1, S.H - 0.2), kind: 'swat' });
      B.d(rbx(W * 0.85, 0.5, 0.1, 0.03, 0, cl + 0.4, fr.zFb + 0.12), 0x0d0d0d);
      B.d(bx(W * 0.8, 0.05, L * 0.5, 0, H + 0.04, -L * 0.1), 0x222222);
      // cam ızgaraları
      for (const s of [1, -1]) for (let i = 0; i < 4; i++) B.d(bx(0.02, 0.02, 0.7, s * (S.hw(S.belt + 0.2 + i * 0.12, 0) + 0.02), S.belt + 0.2 + i * 0.12, L / 2 - 1.2), 0x111111);
    } else {
      T.decals.push({ geo: sideDecal(S, -L / 2 + 0.2, L / 2 - 1.7, S.belt - 0.2, S.belt + 0.45), kind: 'ambulance' });
      B.l(rbx(0.2, 0.12, 0.12, 0.03, W * 0.4, H + 0.06, -L / 2 + 0.2), 0x601010, 0xff2020, 5);
      B.l(rbx(0.2, 0.12, 0.12, 0.03, -W * 0.4, H + 0.06, -L / 2 + 0.2), 0x601010, 0xff2020, 6);
    }
  }
  if (st === 'sport') {
    const zs = -L / 2 + 0.22, ys = S.belt + 0.2;
    B.p(rbx(W * 0.86, 0.035, 0.3, 0.015, 0, ys, zs));
    for (const s of [1, -1]) { B.d(bx(0.04, 0.2, 0.12, s * W * 0.3, ys - 0.1, zs), 0x111111); B.d(rbx(0.05, 0.12, 0.4, 0.02, s * (S.hw(S.belt - 0.2, -L * 0.12) + 0.01), S.belt - 0.2, -L * 0.16), 0x0a0a0a); }
  }
  if (st === 'suv') {
    for (const s of [1, -1]) B.c(bx(0.04, 0.04, L * 0.55, s * W * 0.36, H + 0.04, -L * 0.08));
    sideStripH(B, S, cl + 0.12, -L / 2 + 0.3, L / 2 - 0.3, 0.16, 0x161616);
  }
  if (st === 'jeep') {
    B.d(cyl(0.4, 0.4, 0.25, 16, 'z', 0, S.belt + 0.05, -L / 2 - 0.14), 0x151515);
    B.d(cyl(0.22, 0.22, 0.27, 12, 'z', 0, S.belt + 0.05, -L / 2 - 0.14), 0x3b4128);
    for (const s of [1, -1]) B.d(rbx(0.14, 0.4, 0.3, 0.03, s * (W / 2 + 0.05), S.belt - 0.1, -L / 2 + 0.5), 0x3b4128);
    B.d(beam(-W * 0.35, S.belt, -L / 2 + 0.3, -W * 0.38, S.belt + 2.2, -L / 2 + 0.35, 0.02, 0.02, true), 0x111111);
    B.d(rbx(W * 0.85, 0.35, 0.08, 0.03, 0, cl + 0.3, S.frontZ(cl + 0.3) + 0.08), 0x252820);
    T.decals.push({ geo: sideDecal(S, -0.3, 0.6, S.belt - 0.45, S.belt - 0.15), kind: 'army' });
  }
  if (st === 'bus') {
    T.extras.push({ geo: new THREE.PlaneGeometry(1.8, 0.32).translate(0, H - 0.25, L / 2 - 0.08 + 0.0), mat: 'busDest' });
    T.decals.push({ geo: sideDecal(S, -L / 2 + 0.3, L / 2 - 0.3, S.belt - 0.55, S.belt - 0.02), kind: 'bus' });
    B.d(rbx(W * 0.7, 0.3, 2.6, 0.08, 0, H + 0.15, -L * 0.15), 0xdcdcdc);
    // kapılar (sağ taraf: -x)
    for (const zc of [L / 2 - 0.9, -0.3]) B.gl(polyGeo([[-(S.hw(0.4, zc) + 0.006), 0.4, zc - 0.55], [-(S.hw(0.4, zc) + 0.006), 0.4, zc + 0.55], [-(S.hw(S.belt, zc) + 0.006), S.belt, zc + 0.55], [-(S.hw(S.belt, zc) + 0.006), S.belt, zc - 0.55]]));
    for (const zc of [L / 2 - 0.9, -0.3]) sideStripV(B, S, zc, 0.35, H - 0.2, 0.03, 0x111111);
  }
  if (st === 'van' && def.colors[0] === '#f2c200') T.extras.push({ geo: new THREE.PlaneGeometry(1.3, 0.22).rotateX(-0.6).translate(0, S.H - 0.25, S.cab.rf[0] + 0.2), mat: 'dolmusDest' });
  if (st === 'truck') {
    const cz = S.cabRear;
    const boxL = cz - (-L / 2) - 0.25, boxZ = (cz - 0.25 + -L / 2) / 2;
    B.d(rbx(W, H - 1.2, boxL, 0.06, 0, 1.2 + (H - 1.2) / 2, boxZ), 0xd8d2c2);
    B.d(bx(W + 0.02, 0.16, boxL - 0.1, 0, 1.25, boxZ), 0x1d5aa8);
    for (const s of [1, -1]) {
      B.d(bx(0.12, 0.25, L - 1.2, s * 0.45, 0.85, -0.3), 0x151515);
      B.d(bx(0.04, 0.08, boxL - 2.6, s * (W / 2 - 0.05), 0.55, boxZ + 0.6), 0x8a8a8a);
      B.d(rbx(0.35, 0.06, 1.0, 0.02, s * (W / 2 - 0.2), 1.08, -L / 2 + 2.25), 0x111111);
    }
    T.decals.push({ geo: new THREE.PlaneGeometry(boxL * 0.7, 0.9), kind: 'truckSide', truck: { W, z: boxZ, y: 2.1 } });
  }
  // tekerlekler
  T.wheels = [];
  const wx = S.wheelX || W / 2 - S.tw / 2 - 0.05;
  const wk = S.wheelKind || (st === 'sport' ? 'sport' : st === 'suv' ? 'suv' : st === 'jeep' ? 'steel' : st === 'swat' ? 'black' : 'car');
  T.wheelGeo = wheelGeo(S.r, S.tw, wk);
  for (let i = 0; i < S.axles.length; i++) for (const s of [1, -1]) T.wheels.push({ x: s * wx, z: S.axles[i], front: i === 0, side: s });
  T.wheelbase = S.axles[0] - S.axles[S.axles.length > 2 ? 2 : 1];
  T.pool = { w: W * 1.8, d: 9, z: L / 2 + 4.6 };
  finishTemplate(T, B);
  return T;
}

function finishTemplate(T, B) {
  T.paint = B.paint.length ? mergeGeometries(B.paint) : null;
  T.dark = B.dark.length ? mergeGeometries(B.dark) : null;
  T.chrome = B.chrome.length ? mergeGeometries(B.chrome) : null;
  T.glass = B.glass.length ? mergeGeometries(B.glass) : null;
  T.lights = B.lights.length ? mergeGeometries(B.lights) : null;
  if (T.paint) T.paint.computeBoundingSphere();
}

// ---- motosiklet ----
function buildMotoTemplate(def) {
  const B = new Parts();
  const r = 0.31, zf = 0.7, zr = -0.68;
  // gövde, depo, sele
  const tank = rbx(0.3, 0.22, 0.52, 0.1, 0, 0.92, 0.2); B.p(tank);
  B.p(rbx(0.22, 0.12, 0.5, 0.05, 0, 0.86, -0.55));
  B.p(rbx(0.26, 0.35, 0.3, 0.1, 0, 0.9, 0.58));
  B.d(rbx(0.27, 0.09, 0.55, 0.04, 0, 0.9, -0.22), 0x111111);
  // çerçeve
  B.d(beam(0, 1.0, 0.5, 0, 0.55, -0.05, 0.05, 0.05, true), 0x222222);
  B.d(beam(0, 0.55, -0.05, 0, r, zr, 0.05, 0.05, true), 0x222222);
  B.d(beam(0, 0.85, -0.2, 0, r + 0.05, zr, 0.04, 0.04, true), 0x222222);
  // motor bloğu
  B.c(rbx(0.3, 0.3, 0.38, 0.06, 0, 0.5, 0.05));
  B.d(rbx(0.32, 0.12, 0.3, 0.04, 0, 0.36, 0.05), 0x2a2a2a);
  // egzoz
  B.c(beam(-0.16, 0.38, 0.1, -0.16, 0.42, -0.75, 0.08, 0.08, true));
  // çatal ve gidon
  for (const s of [1, -1]) B.c(beam(s * 0.08, 1.05, 0.55, s * 0.08, r, zf, 0.04, 0.04, true));
  B.c(beam(-0.36, 1.12, 0.48, 0.36, 1.12, 0.48, 0.03, 0.03, true));
  for (const s of [1, -1]) B.d(cyl(0.022, 0.022, 0.12, 8, 'x', s * 0.36, 1.12, 0.48), 0x111111);
  for (const s of [1, -1]) { B.d(beam(s * 0.3, 1.12, 0.48, s * 0.36, 1.32, 0.46, 0.012, 0.012, true), 0x111111); B.c(cyl(0.05, 0.05, 0.015, 10, 'z', s * 0.36, 1.34, 0.45)); }
  // çamurluk
  B.p(rbx(0.14, 0.03, 0.5, 0.012, 0, r + 0.1, zf + 0.02));
  // ışıklar
  B.c(cyl(0.1, 0.1, 0.06, 14, 'z', 0, 1.0, 0.76));
  B.l(cyl(0.085, 0.085, 0.03, 14, 'z', 0, 1.0, 0.8), 0xdfe6ea, 0xfff2d8, 0);
  B.l(rbx(0.14, 0.06, 0.04, 0.015, 0, 0.88, -0.82), 0x5a0808, 0xff1a0a, 1);
  for (const s of [1, -1]) { B.l(rbx(0.05, 0.04, 0.05, 0.012, s * 0.16, 0.98, 0.7), 0xb06a10, 0xff8a10, s > 0 ? 3 : 4); B.l(rbx(0.05, 0.04, 0.05, 0.012, s * 0.14, 0.86, -0.78), 0xb06a10, 0xff8a10, s > 0 ? 3 : 4); }
  // ön cam
  B.gl(polyGeo([[-0.16, 1.12, 0.66], [0.16, 1.12, 0.66], [0.12, 1.32, 0.58], [-0.12, 1.32, 0.58]]));
  const T = { S: { st: 'moto', L: def.len, W: def.wid, H: def.hei }, decals: [], extras: [], plates: [[0, 0.7, -0.84, true]], plateSlot: [0, 103], plateSize: [0.24, 0.12], siren: false, wheelR: r, moto: true };
  T.wheelGeo = wheelGeo(r, 0.13, 'moto');
  T.wheels = [{ x: 0, z: zf, front: true, side: 1 }, { x: 0, z: zr, front: false, side: 1 }];
  T.wheelbase = zf - zr;
  T.driver = [0, 0.82, -0.25];
  T.pool = { w: 2.5, d: 8, z: 4.5 };
  finishTemplate(T, B);
  return T;
}

// ---- tank ----
function buildTankTemplate(def) {
  const B = new Parts();
  const L = def.len, W = def.wid;
  const hull = [[L / 2, 0.95, 0.06], [L / 2 - 1.0, 1.5, 0.05], [-L / 2 + 0.25, 1.5, 0.05], [-L / 2, 1.15, 0.05], [-L / 2 + 0.35, 0.55, 0.05], [L / 2 - 0.5, 0.55, 0.05]];
  B.p(extrudeSide(hull, W - 1.1, 0.04, 2));
  for (const s of [1, -1]) {
    B.p(rbx(0.62, 0.06, L - 0.2, 0.02, s * (W / 2 - 0.31), 1.12, 0));
    B.d(rbx(0.56, 0.18, L - 0.5, 0.06, s * (W / 2 - 0.31), 0.98, 0), 0x2a2a24);
    B.d(rbx(0.56, 0.18, L - 0.8, 0.06, s * (W / 2 - 0.31), 0.09, 0), 0x2a2a24);
    B.d(cyl(0.38, 0.38, 0.56, 14, 'x', s * (W / 2 - 0.31), 0.6, L / 2 - 0.45), 0x2a2a24);
    B.d(cyl(0.38, 0.38, 0.56, 14, 'x', s * (W / 2 - 0.31), 0.6, -L / 2 + 0.45), 0x2a2a24);
    for (let i = 0; i < 26; i++) B.d(bx(0.58, 0.05, 0.08, s * (W / 2 - 0.31), 1.08, -L / 2 + 0.5 + i * (L - 1) / 25), 0x1a1a16);
    // çamurluk kutuları
    B.d(rbx(0.5, 0.3, 0.8, 0.04, s * (W / 2 - 0.35), 1.3, -L / 2 + 1.2), 0x3d4429);
  }
  B.l(rbx(0.14, 0.1, 0.05, 0.02, W / 2 - 0.4, 1.2, L / 2 - 0.05), 0xdfe6ea, 0xfff2d8, 0);
  B.l(rbx(0.14, 0.1, 0.05, 0.02, -W / 2 + 0.4, 1.2, L / 2 - 0.05), 0xdfe6ea, 0xfff2d8, 0);
  B.l(rbx(0.12, 0.08, 0.05, 0.02, W / 2 - 0.4, 1.2, -L / 2 + 0.05), 0x5a0808, 0xff1a0a, 1);
  B.l(rbx(0.12, 0.08, 0.05, 0.02, -W / 2 + 0.4, 1.2, -L / 2 + 0.05), 0x5a0808, 0xff1a0a, 1);
  const T = { S: { st: 'tank', L, W, H: def.hei }, decals: [], extras: [], plates: [], siren: false, wheelR: 0.33, tank: true };
  finishTemplate(T, B);
  // taret (ayrı grup)
  const TB = new Parts();
  const tur = [[1.35, 0.0, 0.05], [0.9, 0.62, 0.08], [-1.3, 0.62, 0.08], [-1.75, 0.3, 0.05], [-1.5, 0.0, 0.05]];
  TB.p(extrudeSide(tur, 2.3, 0.08, 2));
  TB.p(cyl(0.45, 0.45, 0.15, 14, 'y', 0.5, 0.7, -0.5));
  TB.d(cyl(0.035, 0.035, 2.4, 6, 'y', -0.8, 1.8, -1.2), 0x111111);
  TB.d(rbx(0.6, 0.4, 0.5, 0.04, 0, 0.35, -1.7), 0x2e3320);
  TB.d(beam(0.5, 0.95, -0.5, 0.5, 0.95, 0.4, 0.05, 0.05, true), 0x151515);
  T.turretParts = TB;
  const BB = new Parts();
  BB.p(cyl(0.16, 0.16, 0.5, 12, 'z', 0, 0, 0.25));
  BB.p(cyl(0.09, 0.08, 4.4, 12, 'z', 0, 0, 2.6));
  BB.d(cyl(0.12, 0.12, 0.35, 12, 'z', 0, 0, 4.75), 0x2a2a24);
  T.barrelParts = BB;
  finishTemplate(TB, TB); finishTemplate(BB, BB);
  T.wheelGeo = wheelGeo(0.33, 0.5, 'steel');
  T.wheels = [];
  for (let i = 0; i < 6; i++) for (const s of [1, -1]) T.wheels.push({ x: s * (W / 2 - 0.31), z: -L / 2 + 1.0 + i * (L - 2.0) / 5, front: false, side: s, y: 0.36 });
  T.wheelbase = 4;
  T.driver = [0.6, 1.2, 1.5];
  T.pool = { w: 4, d: 10, z: L / 2 + 5 };
  return T;
}

// ======================================================================
// Model örneği
// ======================================================================
const dolmusDestMat = () => new THREE.MeshBasicMaterial({ map: signTexture('ÜSKÜDAR - BEŞİKTAŞ', '#f2c200', '#111', 512, 96) });
const busDestMat = () => new THREE.MeshBasicMaterial({ map: signTexture('34 TAKSİM - KADIKÖY', '#111', '#ffb000', 512, 96), color: 0xffffff });
let armyMat = null;
let truckMat = null;
function decalMat(kind) {
  if (kind === 'army') {
    if (!armyMat) {
      const c = makeCanvas(512, 128); const g = c.getContext('2d');
      g.fillStyle = '#e8e8e8'; g.font = 'bold 60px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('K.K.K.', 256, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      armyMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    }
    return armyMat;
  }
  if (kind === 'truckSide') {
    if (!truckMat) {
      const c = makeCanvas(1024, 256); const g = c.getContext('2d');
      g.fillStyle = '#1d5aa8'; g.font = 'bold 110px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BOĞAZ NAKLİYAT', 512, 100);
      g.font = 'bold 50px Arial'; g.fillText('İSTANBUL • ANKARA • İZMİR', 512, 200);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      truckMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    }
    return truckMat;
  }
  return liveryTex(kind);
}
const sharedExtra = new Map();
function extraMat(name) {
  if (!sharedExtra.has(name)) sharedExtra.set(name, name === 'taxiSign' ? taxiSign() : name === 'busDest' ? busDestMat() : dolmusDestMat());
  return sharedExtra.get(name);
}
function dummyGeo(moto) {
  const k = moto ? 'moto' : 'car';
  if (sharedExtra.has('dummy' + k)) return sharedExtra.get('dummy' + k);
  const parts = [];
  if (moto) {
    parts.push(colorize(rbx(0.36, 0.5, 0.24, 0.08, 0, 0.42, 0.05), 0x2a2a30));
    parts.push(colorize(new THREE.SphereGeometry(0.15, 12, 10).translate(0, 0.84, 0.1), 0x8a1010));
    parts.push(colorize(bx(0.2, 0.06, 0.04, 0, 0.84, 0.24), 0x111111));
    for (const s of [1, -1]) {
      parts.push(colorize(beam(s * 0.17, 0.6, 0.08, s * 0.34, 0.32, 0.7, 0.08, 0.08, true), 0x2a2a30));
      parts.push(colorize(beam(s * 0.12, 0.18, 0.05, s * 0.2, 0.0, 0.45, 0.12, 0.12, true), 0x1a1a24));
      parts.push(colorize(beam(s * 0.2, 0.0, 0.45, s * 0.2, -0.42, 0.35, 0.1, 0.1, true), 0x1a1a24));
    }
  } else {
    parts.push(colorize(rbx(0.42, 0.52, 0.24, 0.08, 0, 0.3, 0), 0x333333));
    parts.push(colorize(new THREE.SphereGeometry(0.12, 10, 8).translate(0, 0.68, 0.02), 0xc99572));
    parts.push(colorize(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, 1.4).translate(0, 0.7, 0.0), 0x2a1a10));
    for (const s of [1, -1]) parts.push(colorize(beam(s * 0.2, 0.48, 0.02, s * 0.16, 0.32, 0.4, 0.08, 0.08, true), 0x333333));
  }
  const g = mergeGeometries(parts);
  sharedExtra.set('dummy' + k, g);
  return g;
}

export function buildCarModel(type, color) {
  const def = CARS[type];
  const T = getTemplate(type);
  const st = T.S.st;
  const matte = st === 'jeep' || st === 'tank';
  const color0 = color || def.colors[0];
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const chassis = new THREE.Group();
  root.add(chassis);
  const bodyM = new THREE.Mesh(T.paint, paintMat(color0, matte));
  bodyM.castShadow = true;
  chassis.add(bodyM);
  if (T.dark) { const m = new THREE.Mesh(T.dark, darkMat); m.castShadow = true; chassis.add(m); }
  if (T.chrome) chassis.add(new THREE.Mesh(T.chrome, chromeMat));
  let glassM = null;
  if (T.glass) { glassM = new THREE.Mesh(T.glass, glassMat); glassM.renderOrder = 2; chassis.add(glassM); }
  const lightsMat = makeLightsMat();
  if (T.lights) chassis.add(new THREE.Mesh(T.lights, lightsMat));
  for (const d of T.decals) {
    const m = new THREE.Mesh(d.geo, decalMat(d.kind));
    if (d.truck) {
      for (const s of [1, -1]) { const mm = s > 0 ? m : m.clone(); mm.position.set(s * (d.truck.W / 2 + 0.01), d.truck.y, d.truck.z); mm.rotation.y = s * Math.PI / 2; chassis.add(mm); }
      continue;
    }
    chassis.add(m);
  }
  for (const e of T.extras) chassis.add(new THREE.Mesh(e.geo, extraMat(e.mat)));
  let plateGeo = null;
  if (T.plates.length) {
    const [s0, s1] = T.plateSlot;
    const slot = s0 + Math.floor(Math.random() * (s1 - s0 + 1));
    const [pw, ph] = T.plateSize || [0.52, 0.115];
    plateGeo = mergeGeometries(T.plates.map(([x, y, z, back]) => plateQuad(slot, pw, ph, x, y, z, back)));
    chassis.add(new THREE.Mesh(plateGeo, plateMaterial()));
  }
  let turret = null, barrel = null;
  if (T.tank) {
    turret = new THREE.Group(); turret.position.set(0, 1.5, -0.3); chassis.add(turret);
    turret.add(new THREE.Mesh(T.turretParts.paint, paintMat(color0, true)));
    turret.add(new THREE.Mesh(T.turretParts.dark, darkMat));
    barrel = new THREE.Group(); barrel.position.set(0, 0.32, 1.25); turret.add(barrel);
    barrel.add(new THREE.Mesh(T.barrelParts.paint, paintMat(color0, true)));
    barrel.add(new THREE.Mesh(T.barrelParts.dark, darkMat));
  }
  // tekerlekler (kasadan bağımsız: süspansiyon/yalpa yalnız kasayı etkiler)
  const wheels = [];
  for (const w of T.wheels) {
    const piv = new THREE.Group(); piv.position.set(w.x, w.y || T.wheelR, w.z);
    const flip = new THREE.Group(); if (w.side < 0) flip.rotation.y = Math.PI;
    const spin = new THREE.Group();
    piv.add(flip); flip.add(spin);
    spin.add(new THREE.Mesh(T.wheelGeo, wheelMat));
    (T.moto ? chassis : root).add(piv);
    wheels.push({ piv, spin, front: w.front, sign: w.side < 0 ? -1 : 1 });
  }
  // sürücü maketi
  const drv = new THREE.Mesh(dummyGeo(T.moto), darkMat);
  drv.position.set(T.driver[0], T.driver[1], T.driver[2]);
  drv.visible = false;
  chassis.add(drv);
  // gece far havuzu
  const pool = new THREE.Mesh(poolGeo, headPoolMat());
  pool.scale.set(T.pool.w, 1, T.pool.d); pool.position.set(0, 0.04, T.pool.z); pool.visible = false; pool.renderOrder = 1;
  root.add(pool);
  Object.assign(root.userData, {
    bodyMesh: bodyM, glassMesh: glassM, chassis, wheels, wheelR: T.wheelR, lights: lightsMat.userData, lightsMat,
    driverDummy: drv, driverTorso: drv, siren: T.siren, pool, plateGeo, turret, barrel, template: T, moto: !!T.moto,
  });
  return root;
}

// Lastik izi (halka tampon, tek çizim çağrısı)
class SkidMarks {
  constructor(scene) {
    this.max = 700; this.i = 0;
    const g = new THREE.PlaneGeometry(0.24, 1); g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), this.max);
    this.mesh.frustumCulled = false;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < this.max; k++) this.mesh.setMatrixAt(k, m);
    scene.add(this.mesh);
    this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1); this.up = new THREE.Vector3(0, 1, 0); this.m = new THREE.Matrix4();
  }
  add(x, z, h, len) {
    this.q.setFromAxisAngle(this.up, h); this.p.set(x, 0.022, z); this.s.set(1, 1, len);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.i, this.m); this.i = (this.i + 1) % this.max;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ======================================================================
// Araç
// ======================================================================
let VID = 1;
const _push = { x: 0, z: 0 };
const PHYS = {
  // grip: yanal tutunma (m/s²), cs: yanal sertlik, steer: azami direksiyon açısı, gears: vites sayısı, rev: motor sesi çarpanı, soft: süspansiyon yumuşaklığı
  sedan: { grip: 13, cs: 11, steer: 0.62, gears: 5, rev: 1, soft: 1 },
  wagon: { grip: 11.5, cs: 10, steer: 0.62, gears: 4, rev: 0.9, soft: 1.3 },
  taxi: { grip: 12.5, cs: 11, steer: 0.62, gears: 5, rev: 1, soft: 1.1 },
  police: { grip: 14, cs: 12, steer: 0.62, gears: 5, rev: 1.05, soft: 0.9 },
  sport: { grip: 17, cs: 13, steer: 0.55, gears: 6, rev: 1.3, soft: 0.6, rwd: true },
  suv: { grip: 12, cs: 10, steer: 0.6, gears: 6, rev: 0.85, soft: 1.3 },
  jeep: { grip: 11, cs: 9, steer: 0.6, gears: 4, rev: 0.8, soft: 1.4 },
  van: { grip: 10, cs: 9, steer: 0.6, gears: 5, rev: 0.85, soft: 1.4 },
  swat: { grip: 11, cs: 9, steer: 0.58, gears: 5, rev: 0.75, soft: 1.1 },
  ambulance: { grip: 10, cs: 9, steer: 0.6, gears: 5, rev: 0.85, soft: 1.4 },
  bus: { grip: 7.5, cs: 7, steer: 0.62, gears: 4, rev: 0.6, soft: 1.2 },
  truck: { grip: 7, cs: 7, steer: 0.6, gears: 6, rev: 0.6, soft: 1.2 },
  moto: { grip: 15, cs: 13, steer: 0.7, gears: 5, rev: 1.6, soft: 0.8 },
  tank: { grip: 30, cs: 20, steer: 0, gears: 3, rev: 0.5, soft: 0.3 },
};

export class Vehicle {
  constructor(game, type, x, z, heading, color, opts) {
    this.game = game;
    this.id = VID++;
    this.type = type;
    this.def = (opts && opts.def) || CARS[type];
    this.kind = (opts && opts.kind) || 'car';
    this.color = color || this.def.colors[Math.floor(Math.random() * this.def.colors.length)];
    this.mesh = (opts && opts.mesh) || buildCarModel(type, this.color);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.fs = 0; this.ls = 0;
    this.steerAng = 0; this.yawRate = 0;
    this.hp = this.def.hp;
    this.driver = null;
    this.ai = null;
    this.sirenOn = false;
    this.sirenT = 0;
    this.burnT = 0;
    this.destroyed = false;
    this.sinking = 0;
    this.wreckT = 0;
    this.owned = false;
    this.mission = null;
    this.controls = { throttle: 0, steer: 0, handbrake: false };
    this.radius = Math.min(this.def.wid * 0.6, 1.6);
    this.stuckT = 0;
    this.honkT = 0;
    this.ind = null;
    this.P = PHYS[this.def.body || this.def.style] || PHYS.sedan;
    this.gear = 0; this.rpm = 0.2; this.shiftT = 0;
    this.pitch = 0; this.roll = 0; this.lean = 0;
    this.headOK = 1; this.glassBroken = false; this.dented = false;
    this.skidT = 0; this.reloadT = 0; this.recoil = 0;
    this._fwd = { x: 0, z: 1 };
    this.sync();
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwd() { const o = this._fwd; o.x = Math.sin(this.heading); o.z = Math.cos(this.heading); return o; }

  setColor(col) {
    this.color = col;
    const T = this.mesh.userData.template;
    this.mesh.userData.bodyMesh.material = paintMat(col, T && (T.S.st === 'jeep' || T.S.st === 'tank'));
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(this.sinking > 0 ? Math.min(0.5, this.sinking * 0.2) : 0, this.heading, this.lean);
  }

  dispose() {
    const ud = this.mesh.userData;
    if (ud.plateGeo) ud.plateGeo.dispose();
    if (this.dentGeo) this.dentGeo.dispose();
    if (ud.lightsMat) ud.lightsMat.dispose();
  }

  damage(amount, attacker) {
    if (this.destroyed) return;
    this.hp -= amount;
    if (attacker && attacker.isPlayer && this.driver && !this.driver.isPlayer && this.ai) this.ai.panic = 10;
    if (amount > 25 && !this.glassBroken && Math.random() < 0.25) this.breakGlass();
    if (this.hp < this.def.hp * 0.55 && !this.glassBroken) this.breakGlass();
    if (this.hp <= 0 && this.burnT <= 0) { this.burnT = 4.5; this.lastAttacker = attacker; }
  }

  breakGlass() {
    const gm = this.mesh.userData.glassMesh;
    if (!gm || this.glassBroken) return;
    this.glassBroken = true;
    gm.material = crackedGlassMat();
    audio.impact && audio.impact(this.pos.x, this.pos.z);
  }

  // Yerel noktada göçük (köşe ötelemesi)
  dent(lx, ly, lz, nx, nz, depth) {
    if (this.kind !== 'car' || depth < 0.01) return;
    const bm = this.mesh.userData.bodyMesh;
    if (!this.dentGeo) { this.dentGeo = bm.geometry.clone(); bm.geometry = this.dentGeo; }
    const p = this.dentGeo.attributes.position;
    const R = 0.9, d = Math.min(depth, 0.18);
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i) - lx, dy = p.getY(i) - ly, dz = p.getZ(i) - lz;
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd > R * R) continue;
      const k = (1 - Math.sqrt(dd) / R) ** 2 * d;
      p.setX(i, p.getX(i) + nx * k); p.setZ(i, p.getZ(i) + nz * k); p.setY(i, p.getY(i) - k * 0.25);
    }
    p.needsUpdate = true;
    this.dentGeo.computeVertexNormals();
    if (lz > this.def.len * 0.35 && depth > 0.06) this.headOK = Math.max(0, this.headOK - 0.5);
  }
  // dünya darbe noktası → yerel göçük
  impact(wx, wz, nx, nz, speed) {
    const f = this.fwd;
    const dx = wx - this.pos.x, dz = wz - this.pos.z;
    const lx = dx * f.z - dz * f.x, lz = dx * f.x + dz * f.z;
    const nlx = nx * f.z - nz * f.x, nlz = nx * f.x + nz * f.z;
    this.dent(lx, this.def.hei * 0.45, lz, nlx, nlz, speed * 0.012);
  }

  explode() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.wreckT = 40;
    const g = this.game;
    g.combat.explosion(this.pos.x, this.pos.y + 0.5, this.pos.z, 7, 140, this.lastAttacker, this);
    this.mesh.traverse((o) => { if (o.isMesh && o.material !== wheelMat) o.material = burntMat; });
    this.mesh.userData.pool.visible = false;
    this.vx *= 0.3; this.vz *= 0.3;
    this.vy = 6;
    this.wreckTilt = (Math.random() - 0.5) * 0.3;
    if (this.driver) {
      const d = this.driver;
      g.vehicles.ejectDriver(this);
      if (d.takeDamage) d.takeDamage(500, this.lastAttacker, 'explosion');
    }
  }

  // ortak: yangın/duman/enkaz
  updateFire(dt) {
    const g = this.game, f = this.fwd, L = this.def.len;
    if (this.burnT > 0 && !this.destroyed) {
      this.burnT -= dt;
      g.particles.fire({ x: this.pos.x + f.x * L * 0.35, y: this.pos.y + this.def.hei * 0.6, z: this.pos.z + f.z * L * 0.35 }, 1.2);
      if (this.burnT <= 0) this.explode();
    } else if (!this.destroyed && this.hp < this.def.hp * 0.45 && Math.random() < (this.hp < this.def.hp * 0.25 ? 0.5 : 0.2)) {
      const p = { x: this.pos.x + f.x * L * 0.4, y: this.pos.y + this.def.hei * 0.7, z: this.pos.z + f.z * L * 0.4 };
      if (this.hp < this.def.hp * 0.25) g.particles.fire(p, 0.35);
      g.particles.smoke(p, this.hp < this.def.hp * 0.25 ? 1.2 : 0.7);
    }
    if (this.destroyed) {
      this.wreckT -= dt;
      if (this.wreckT > 30 && Math.random() < 0.5) g.particles.fire({ x: this.pos.x, y: this.pos.y + 0.8, z: this.pos.z }, 1);
      if (this.vy) { this.vy -= 20 * dt; this.pos.y = Math.max(0, this.pos.y + this.vy * dt); if (this.pos.y <= 0 && this.vy < 0) this.vy = 0; }
    }
  }

  update(dt) {
    const g = this.game;
    const phys = g.physics;
    const def = this.def, P = this.P, ud = this.mesh.userData;
    this.updateFire(dt);

    const c = this.controls;
    const canDrive = !this.destroyed && this.sinking <= 0 && (this.driver || this.ai);
    const throttle = canDrive ? c.throttle : 0;
    const steer = canDrive ? c.steer : 0;
    const hb = canDrive ? c.handbrake : !this.destroyed && !this.driver;
    const isPlayer = !!(this.driver && this.driver.isPlayer);

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let fs = this.vx * fx + this.vz * fz;
    let ls = this.vx * rx + this.vz * rz;
    const fs0 = fs;
    const max = def.maxSpeed * (g.state && isPlayer && g.state.carUpgrade ? 1.15 : 1) * (this.hp < def.hp * 0.25 ? 0.75 : 1);
    // vites ve devir
    const nG = P.gears, sp = Math.abs(fs);
    const top = (i) => max * Math.pow((i + 1) / nG, 0.8);
    if (this.shiftT > 0) this.shiftT -= dt;
    if (fs < -0.5) this.gear = 0;
    else if (this.gear < nG - 1 && sp > top(this.gear) * 0.95) { this.gear++; this.shiftT = 0.2; }
    else if (this.gear > 0 && sp < top(this.gear - 1) * 0.7) this.gear--;
    const lo = this.gear > 0 ? top(this.gear - 1) * 0.55 : 0, hi = top(this.gear);
    let rpmT = 0.18 + 0.82 * clamp((sp - lo) / (hi - lo), 0, 1);
    if (throttle > 0 && sp < 2) rpmT = Math.max(rpmT, 0.45 + 0.35 * throttle);
    if (this.shiftT > 0) rpmT *= 0.72;
    this.rpm += (rpmT - this.rpm) * Math.min(1, dt * (this.shiftT > 0 ? 18 : 8));
    // boylamsal kuvvetler
    if (throttle > 0) {
      if (fs < -0.5) fs += 22 * throttle * dt;
      else {
        const torque = (1.2 - 0.35 * this.rpm) * (1 + (nG - 1 - this.gear) * 0.1);
        fs += def.accel * throttle * torque * (this.shiftT > 0 ? 0.3 : 1) * Math.max(0, 1 - (fs / max) ** 2) * dt;
      }
    } else if (throttle < 0) {
      if (fs > 0.5) fs += 24 * throttle * dt;
      else if (fs > -max * 0.3) fs += def.accel * 0.6 * throttle * dt;
    } else fs -= Math.sign(fs) * Math.min(Math.abs(fs), 1.8 * dt);
    if (hb) fs -= Math.sign(fs) * Math.min(Math.abs(fs), 7.5 * dt);
    fs -= fs * Math.abs(fs) * 0.0008 * dt;
    // yanal tutunma (kayma açısı → sınırlı yanal kuvvet)
    const wet = g.env && g.env.rainAmount ? 1 - g.env.rainAmount * 0.18 : 1;
    let mu = P.grip * wet * (hb ? 0.33 : 1);
    if (P.rwd && throttle > 0.5 && Math.abs(ls) > 2.5) mu *= 0.78;
    const dls = clamp(-ls * P.cs * dt, -mu * dt, mu * dt);
    ls += dls;
    // direksiyon ve dönüş
    let wT;
    if (P.steer === 0) {
      // palet: yerinde dönebilir
      this.steerAng = steer;
      wT = steer * 0.8 * (fs < -0.3 ? -1 : 1) / (1 + sp / 25);
    } else {
      const steerMax = P.steer / (1 + (fs * fs) / 700);
      this.steerAng += (steer * steerMax - this.steerAng) * Math.min(1, dt * 7);
      const wb = this.mesh.userData.template ? this.mesh.userData.template.wheelbase || def.len * 0.6 : def.len * 0.6;
      wT = (fs * Math.tan(this.steerAng)) / wb;
      const wMax = (mu * 1.15) / Math.max(3, sp);
      if (!hb) wT = clamp(wT, -wMax, wMax); else wT *= 1.5;
    }
    this.yawRate += (wT - this.yawRate) * Math.min(1, dt * (hb ? 4 : 9));
    this.heading += this.yawRate * dt;
    // dünya hızı (eski çerçevede) → kayma bir sonraki karede yanal hız olarak görünür
    this.vx = fx * fs + rx * ls;
    this.vz = fz * fs + rz * ls;
    this.fs = fs; this.ls = ls;
    // ağırlık transferi (görsel): fren → burun dalar, viraj → gövde dışa yatar
    const longAcc = (fs - fs0) / Math.max(dt, 1e-3), latAcc = fs * this.yawRate;
    const soft = P.soft;
    this.pitch += (clamp(-longAcc * 0.0045 * soft, -0.07, 0.07) - this.pitch) * Math.min(1, dt * 6);
    this.roll += (clamp(latAcc * 0.007 * soft, -0.08, 0.08) - this.roll) * Math.min(1, dt * 6);
    const ch = ud.chassis;
    if (ud.moto) {
      const want = this.driver || (this.ai && !this.ai.empty) ? clamp(-Math.atan(latAcc / 9.81), -0.75, 0.75) : 0.12;
      this.lean += (want - this.lean) * Math.min(1, dt * 6);
      ch.rotation.x = this.pitch * 0.5;
    } else if (!this.destroyed) {
      ch.rotation.x = this.pitch; ch.rotation.z = this.roll;
      ch.position.y = -Math.abs(this.pitch) * 0.4;
    } else { ch.rotation.z = this.wreckTilt || 0; ch.position.y = -0.12; }
    // kayma, lastik sesi ve izleri
    let slip = clamp((Math.abs(ls) - 2.2) / 5, 0, 1);
    if (hb && sp > 4) slip = Math.max(slip, 0.5);
    if (throttle > 0.6 && sp < 6 && def.accel >= 12 && fs > -0.5) slip = Math.max(slip, 0.45);
    if (throttle < 0 && fs > 12) slip = Math.max(slip, 0.3);
    if (P.steer === 0 || this.pos.y > 0.5) slip = 0;
    if (isPlayer && audio.screech) audio.screech(slip);
    if (slip > 0.25 && canDrive) {
      this.skidT -= dt;
      if (this.skidT <= 0 && g.vehicles && g.vehicles.skids) {
        this.skidT = 0.05;
        const half = def.len * 0.3, wx = def.wid * 0.4, len = Math.max(0.4, sp * 0.06);
        const bx2 = this.pos.x - fx * half, bz = this.pos.z - fz * half;
        g.vehicles.skids.add(bx2 + rx * wx, bz + rz * wx, Math.atan2(this.vx, this.vz), len);
        if (!ud.moto) g.vehicles.skids.add(bx2 - rx * wx, bz - rz * wx, Math.atan2(this.vx, this.vz), len);
      }
      if (Math.random() < slip * 0.6) g.particles.dust({ x: this.pos.x - fx * def.len * 0.4, y: 0.1, z: this.pos.z - fz * def.len * 0.4 });
    }

    // konum
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;
    this.collideStatic(phys, isPlayer);
    // suya düşme
    if (phys.inWater(this.pos.x, this.pos.z)) {
      if (this.sinking === 0) { audio.splash(this.pos.x, this.pos.z); g.particles.splash({ x: this.pos.x, y: -1.3, z: this.pos.z }); }
      this.sinking += dt;
      this.pos.y = Math.max(-6, -this.sinking * 1.2);
      this.vx *= 0.95; this.vz *= 0.95;
      if (this.sinking > 1.2 && this.driver) {
        const d = this.driver;
        g.vehicles.ejectDriver(this);
        if (d.isPlayer) d.pos.y = -1.2;
      }
      if (this.sinking > 8) { this.destroyed = true; this.wreckT = 0; }
    }
    // tank tareti ve top atışı
    if (ud.turret) this.updateTurret(dt, isPlayer);
    // tekerlekler
    const spinA = (fs * dt) / ud.wheelR;
    for (const w of ud.wheels) {
      w.spin.rotation.x += spinA * w.sign;
      if (w.front) w.piv.rotation.y = this.steerAng;
    }
    if (ud.tankSpin) void 0;
    if (P.steer === 0) for (const w of ud.wheels) w.spin.rotation.x += (this.yawRate * 1.6 * dt / ud.wheelR) * (w.piv.position.x > 0 ? -1 : 1) * w.sign;
    this.updateLights(dt, throttle, hb, isPlayer);
    // motor sesi (vites hissi)
    if (isPlayer) {
      const r = this.rpm * P.rev;
      if (g.audio && g.audio.setEngine) g.audio.setEngine(!this.destroyed && this.sinking <= 0, 0.15 + r * 1.05, 0.09 + Math.abs(throttle) * 0.04 + this.rpm * 0.05);
    }
    ud.driverDummy.visible = !!(this.driver && !this.driver.isPlayer) || !!(this.ai && !this.ai.empty) || isPlayer;
    this.sync();
  }

  collideStatic(phys, isPlayer) {
    if (this.pos.y >= 1.5) return;
    const g = this.game;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const half = this.def.len * 0.3;
    let pushX = 0, pushZ = 0;
    for (let k = 0; k < 3; k++) {
      const s = k === 0 ? 1 : k === 1 ? -1 : 0;
      _push.x = this.pos.x + fx * half * s; _push.z = this.pos.z + fz * half * s;
      const px = _push.x, pz = _push.z;
      phys.resolveCircle(_push, this.radius, 0.1, 1.4, 0.3);
      const dx = _push.x - px, dz = _push.z - pz;
      if (dx || dz) { this.pos.x += dx; this.pos.z += dz; pushX += dx; pushZ += dz; }
    }
    const pl = Math.hypot(pushX, pushZ);
    if (pl > 1e-4) {
      const nx = pushX / pl, nz = pushZ / pl;
      const vn = this.vx * nx + this.vz * nz;
      if (vn < 0) {
        this.vx -= nx * vn * 1.25; this.vz -= nz * vn * 1.25;
        const imp = -vn;
        if (imp > 5) {
          this.damage(imp * imp * 0.9 * (this.P.steer === 0 ? 0.1 : 1), null);
          this.impact(this.pos.x - nx * this.radius * 1.2, this.pos.z - nz * this.radius * 1.2, nx, nz, imp);
          audio.crash(this.pos.x, this.pos.z, Math.min(1.5, imp / 15));
          g.particles.sparks({ x: this.pos.x - nx * this.radius, y: 0.6, z: this.pos.z - nz * this.radius }, 8);
          if (isPlayer) g.cameraShake(Math.min(0.6, imp / 30));
        }
      }
    }
  }

  updateLights(dt, throttle, hb, isPlayer) {
    const g = this.game, ud = this.mesh.userData;
    const L = ud.lights;
    const on = (this.driver || (this.ai && !this.ai.empty)) && !this.destroyed && this.sinking <= 0;
    const night = g.env ? g.env.nightFactor : 0;
    const t = (this.sirenT += dt);
    const blink = Math.sin(t * Math.PI * 2 * 1.4) > 0;
    const braking = (throttle < 0 && this.fs > 0.5) || (hb && on);
    let ind = this.ind;
    if (isPlayer && Math.abs(this.controls.steer) > 0.5 && Math.abs(this.fs) < 9 && Math.abs(this.fs) > 0.5) ind = this.controls.steer > 0 ? 'L' : 'R';
    const head = on ? (0.5 + night * 3.5) * this.headOK : 0;
    L.uA.value.set(head, on ? Math.max(0.15 + night * 1.2, braking ? 3 : 0) : 0, on && braking ? 3 : 0, on && blink && ind === 'L' ? 3.5 : 0);
    let sa = 0, sb = 0;
    if (ud.siren) {
      const sOn = this.sirenOn && on;
      const ph = Math.floor(t * 7) % 4;
      sa = sOn && (ph === 0 || ph === 2) ? 6 : 0;
      sb = sOn && (ph === 1 || ph === 3) ? 6 : 0;
    }
    L.uB.value.set(on && blink && ind === 'R' ? 3.5 : 0, sa, sb, on && this.fs < -0.5 && throttle < 0 ? 2 : 0);
    ud.pool.visible = on && night > 0.25 && this.headOK > 0;
  }

  // Tank: taret kamera yönüne döner, sol tık top atışı
  updateTurret(dt, isPlayer) {
    const g = this.game, ud = this.mesh.userData;
    if (this.reloadT > 0) this.reloadT -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 1.5);
    ud.barrel.position.z = 1.25 - this.recoil * 0.6;
    if (!isPlayer) return;
    const pl = this.driver;
    const want = angleDiff(this.heading, pl.camYaw + Math.PI);
    const cur = ud.turret.rotation.y;
    ud.turret.rotation.y = cur + clamp(angleDiff(cur, want), -1.2 * dt, 1.2 * dt);
    ud.barrel.rotation.x = clamp(-(pl.camPitch - 0.22) * 0.6, -0.25, 0.12);
    const inp = g.input;
    if (inp && inp.mouse.leftPressed && !inp.mouse.right && this.reloadT <= 0 && !this.destroyed) {
      this.reloadT = 2.5; this.recoil = 1;
      const yaw = this.heading + ud.turret.rotation.y, pitch = -ud.barrel.rotation.x;
      const dx = Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
      const ox = this.pos.x + dx * 6.2, oy = this.pos.y + 1.85 + dy * 6, oz = this.pos.z + dz * 6.2;
      let t = 300;
      const hit = g.physics.raycast(ox, oy, oz, dx, dy, dz, t);
      if (hit) t = hit.t;
      if (g.combat.rayVehicles) { const vh = g.combat.rayVehicles({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }, t, this); if (vh) t = vh.t; }
      g.particles.explosion({ x: ox, y: oy - 0.5, z: oz }, 0.35);
      audio.gunshot('rpg', ox, oz);
      g.cameraShake(0.5);
      g.combat.explosion(ox + dx * t, oy + dy * t, oz + dz * t, 6, 220, pl, this);
      this.vx -= dx * 2; this.vz -= dz * 2;
    }
  }
}

// ======================================================================
// Trafik ve polis yöneticisi
// ======================================================================
const CIRC = [-0.3, 0, 0.3];
const _sirens = [];
export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.spawnT = 0;
    this.skids = new SkidMarks(game.scene);
  }

  add(type, x, z, heading, color) {
    const v = new Vehicle(this.game, type, x, z, heading, color);
    return this.addVehicle(v);
  }
  addVehicle(v) {
    this.list.push(v);
    this.group.add(v.mesh);
    return v;
  }
  remove(v) {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
    this.group.remove(v.mesh);
    if (v.dispose) v.dispose();
  }
  clear() { for (const v of this.list.slice()) this.remove(v); }

  ejectDriver(v) {
    const d = v.driver;
    if (!d) return;
    v.driver = null;
    const f = v.fwd;
    const rx = -f.z, rz = f.x;
    const off = v.def.wid / 2 + 0.7;
    d.pos.set(v.pos.x - rx * off, v.kind === 'car' ? Math.max(0, v.pos.y) : v.pos.y + (v.kind === 'air' ? 0.2 : 0.3), v.pos.z - rz * off);
    d.vehicle = null;
    d.model.root.visible = true;
    if (d.isPlayer && v.kind !== 'car') d.vy = 0;
    if (this.game.physics && v.kind === 'car') this.game.physics.resolveCircle(d.pos, 0.35, 0);
    if (d.isPlayer) this.game.onPlayerExitVehicle && this.game.onPlayerExitVehicle(v);
  }

  laneFor(ai, a, b) {
    const w = this.edgeWidth(a, b);
    if (w >= 16) return ai.outer ? 5.8 : 2.1;
    return 2.5;
  }

  // Trafik aracını yol şeridine yerleştir
  spawnTraffic(px, pz, type) {
    const map = this.game.map;
    const s = map.randomEdgeNear(px, pz, 90, 180);
    if (!s) return null;
    const e = s.e;
    const forward = Math.random() < 0.5;
    const from = forward ? e.a : e.b, to = forward ? e.b : e.a;
    const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz);
    const fx = dx / l, fz = dz / l;
    const t = type || pickTrafficType(this.game);
    const outer = t === 'bus' || t === 'kamyon' || t === 'motor' || Math.random() < 0.5;
    const lane = e.width >= 16 ? (outer ? 5.8 : 2.1) : 2.5;
    const x = s.x + -fz * lane, z = s.z + fx * lane;
    for (const v of this.list) if (Math.abs(v.pos.x - x) < 9 && Math.abs(v.pos.z - z) < 9) return null;
    const v = this.add(t, x, z, Math.atan2(fx, fz));
    v.ai = { mode: 'traffic', from, to, next: this.chooseNext(to, from), cruise: (t === 'bus' || t === 'kamyon') ? 9 : 10 + Math.random() * 5, outer, laneCur: lane };
    if (t === 'ambulans' && Math.random() < 0.5) { v.sirenOn = true; v.ai.cruise = 16; }
    v.vx = fx * 6; v.vz = fz * 6;
    return v;
  }

  spawnParked(px, pz) {
    const map = this.game.map;
    const s = map.randomEdgeNear(px, pz, 60, 160);
    if (!s || s.e.width >= 16) return null;
    const e = s.e;
    const dx = e.b.x - e.a.x, dz = e.b.z - e.a.z, l = Math.hypot(dx, dz);
    if (l < 40) return null;
    const fx = dx / l, fz = dz / l;
    const side = Math.random() < 0.5 ? 1 : -1;
    const x = s.x - fz * side * (e.width / 2 - 1.0), z = s.z + fx * side * (e.width / 2 - 1.0);
    for (const v of this.list) if (Math.abs(v.pos.x - x) < 7 && Math.abs(v.pos.z - z) < 7) return null;
    const r = Math.random();
    const t = r < 0.55 ? 'kartal' : r < 0.72 ? 'sedan' : r < 0.82 ? 'suv' : r < 0.9 ? 'motor' : r < 0.95 ? 'gt' : 'taksi';
    const v = this.add(t, x, z, Math.atan2(fx, fz) + (side > 0 ? Math.PI : 0));
    v.parked = true;
    return v;
  }

  // Askerî üs vb. için sabit araç (tank/cip)
  spawnProp(type, x, z, heading, color) {
    const v = this.add(type, x, z, heading, color);
    v.parked = true; v.mission = 'prop';
    return v;
  }

  chooseNext(node, prev, target) {
    const opts = [];
    for (const e of node.edges) { const n = this.game.map.other(e, node); if (n !== prev) opts.push(n); }
    if (!opts.length) return prev;
    if (target) {
      let best = opts[0], bd = 1e18;
      for (const n of opts) { const d = (n.x - target.x) ** 2 + (n.z - target.z) ** 2; if (d < bd) { bd = d; best = n; } }
      return best;
    }
    return opts[Math.floor(Math.random() * opts.length)];
  }

  laneTarget(from, to, lane, out) {
    const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
    const fx = dx / l, fz = dz / l;
    const o = out || {};
    o.ax = from.x - fz * lane; o.az = from.z + fx * lane; o.bx = to.x - fz * lane; o.bz = to.z + fx * lane; o.fx = fx; o.fz = fz; o.l = l;
    return o;
  }

  driveAI(v, dt) {
    const ai = v.ai;
    const g = this.game;
    if (ai.empty || ai.frozen) { v.controls.throttle = 0; v.controls.handbrake = true; v.ind = null; return; }
    const player = g.player;
    let tx, tz, desired = ai.cruise;
    let lightStop = false;
    v.ind = null;
    if (ai.mode === 'direct' || ai.mode === 'race') {
      const tgt = ai.mode === 'race' ? ai.points[ai.idx] : ai.target;
      if (!tgt) { v.controls.throttle = 0; v.controls.handbrake = true; return; }
      tx = tgt.x; tz = tgt.z;
      desired = ai.mode === 'race' ? v.def.maxSpeed * (ai.skill || 0.85) : ai.cruise;
      if (ai.mode === 'race' && Math.hypot(tx - v.pos.x, tz - v.pos.z) < 14) { ai.idx++; if (ai.idx >= ai.points.length) { ai.finished = true; ai.idx = ai.points.length - 1; } }
      if (ai.mode === 'race' && ai.points[ai.idx + 1]) {
        const n = ai.points[ai.idx + 1];
        const a1 = Math.atan2(tx - v.pos.x, tz - v.pos.z), a2 = Math.atan2(n.x - tx, n.z - tz);
        const turn = Math.abs(angleDiff(a1, a2));
        const dd = Math.hypot(tx - v.pos.x, tz - v.pos.z);
        if (turn > 0.8 && dd < 40) desired = Math.min(desired, 14 + dd * 0.3);
      }
    } else {
      if (!ai.to) { ai.to = g.map.other(ai.from.edges[0], ai.from); }
      if (!ai.next) ai.next = this.chooseNext(ai.to, ai.from, ai.mode === 'chase' ? player.pos : null);
      if (ai.outer === undefined) ai.outer = Math.random() < 0.5;
      let L = this.laneTarget(ai.from, ai.to, ai.laneCur === undefined ? (ai.laneCur = this.laneFor(ai, ai.from, ai.to)) : ai.laneCur, this._L || (this._L = {}));
      let s = (v.pos.x - L.ax) * L.fx + (v.pos.z - L.az) * L.fz;
      // sonraki dönüş yönü ve şerit seçimi
      const turnInfo = () => {
        const n = ai.next;
        const nx = n.x - ai.to.x, nz = n.z - ai.to.z, nl = Math.hypot(nx, nz) || 1;
        return angleDiff(Math.atan2(L.fx, L.fz), Math.atan2(nx / nl, nz / nl));
      };
      let turn = turnInfo();
      const wantOuter = turn < -0.5 ? true : turn > 0.5 ? false : ai.outer;
      const remain0 = L.l - s;
      if (remain0 < 45) ai.outer = wantOuter;
      const laneWant = this.laneFor(ai, ai.from, ai.to) + (ai.yieldT > 0 ? 1.0 : 0) + (ai.dodge || 0);
      ai.laneCur += clamp(laneWant - ai.laneCur, -1.4 * dt, 1.4 * dt);
      const nextLane = this.laneFor(ai, ai.to, ai.next);
      let N = this.laneTarget(ai.to, ai.next, nextLane, this._N || (this._N = {}));
      // köşe noktası: iki şerit çizgisinin kesişimi
      const corner = () => {
        const cr = L.fx * N.fz - L.fz * N.fx;
        if (Math.abs(cr) < 0.2) return { px: L.bx, pz: L.bz, sP: L.l };
        const t = ((N.ax - L.ax) * N.fz - (N.az - L.az) * N.fx) / cr;
        const tc = clamp(t, L.l - 16, L.l + 16);
        return { px: L.ax + L.fx * tc, pz: L.az + L.fz * tc, sP: tc };
      };
      let C = corner();
      if (s >= C.sP - 0.6) {
        ai.from = ai.to; ai.to = ai.next;
        ai.next = this.chooseNext(ai.to, ai.from, ai.mode === 'chase' ? player.pos : null);
        ai.laneCur = nextLane;
        L = this.laneTarget(ai.from, ai.to, ai.laneCur, this._L);
        s = (v.pos.x - L.ax) * L.fx + (v.pos.z - L.az) * L.fz;
        N = this.laneTarget(ai.to, ai.next, this.laneFor(ai, ai.to, ai.next), this._N);
        C = corner();
        turn = turnInfo();
      }
      // ileri bakış noktası (yumuşak viraj)
      const look = 5 + Math.abs(v.fs) * 0.55;
      const sl = Math.max(0, s) + look;
      if (sl <= C.sP) { tx = L.ax + L.fx * sl; tz = L.az + L.fz * sl; }
      else { const rem = sl - C.sP; tx = C.px + N.fx * rem; tz = C.pz + N.fz * rem; }
      const toCorner = C.sP - s;
      if (Math.abs(turn) > 0.5) {
        if (toCorner < 30) desired = Math.min(desired, 5.5 + toCorner * 0.25);
        if (toCorner < 42) v.ind = turn > 0 ? 'L' : 'R';
      }
      // trafik ışığı
      const tl = g.traffic;
      if (tl && ai.mode === 'traffic' && !v.sirenOn && ai.to.edges.length >= 3) {
        const st = tl.lightState(ai.to, ai.from);
        if (st !== 'green') {
          const stopS = L.l - tl.stopOffset(ai.to, ai.from);
          const dStop = stopS - s - v.def.len * 0.5;
          if (dStop > -0.8) {
            const canStop = st === 'red' || dStop > (v.fs * v.fs) / (2 * 5.5) + 0.5;
            if (canStop) { lightStop = true; desired = Math.min(desired, Math.sqrt(Math.max(0, 2 * 4.5 * (dStop - 0.3)))); if (dStop < 0.8) desired = 0; }
          }
        }
      }
      ai.waitLight = lightStop;
      if (ai.mode === 'chase') {
        desired = v.def.maxSpeed * 0.85;
        const tg = player.vehicle || player;
        const d = Math.hypot(tg.pos.x - v.pos.x, tg.pos.z - v.pos.z);
        if (d < 60 && g.physics.lineOfSight(v.pos.x, 1, v.pos.z, tg.pos.x, 1, tg.pos.z)) {
          // takip/sıkıştırma: hedefin gelecekteki konumuna yönel
          const lead = clamp(d / 25, 0, 1.2);
          const tvx = player.vehicle ? player.vehicle.vx : 0, tvz = player.vehicle ? player.vehicle.vz : 0;
          tx = tg.pos.x + tvx * lead; tz = tg.pos.z + tvz * lead;
          desired = player.vehicle ? v.def.maxSpeed : Math.min(desired, d < 14 ? 0 : d);
          if (!player.vehicle && d < 14) desired = 0;
          ai.direct = true;
        } else ai.direct = false;
      }
    }
    // engeller: araç takibi (kuyruk), yayalar
    if (ai.mode !== 'race' && !(ai.mode === 'chase' && ai.direct)) {
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const range = 6 + Math.abs(v.fs) * 1.6;
      let gap = 1e9, blocker = null, oFs = 0;
      if (ai.ignoreT > 0) ai.ignoreT -= dt;
      for (const o of this.list) {
        if (o === v || o.kind === 'air' || o.pos.y > 2) continue;
        const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
        if (Math.abs(dx) > 35 || Math.abs(dz) > 35) continue;
        if (ai.ignoreT > 0 && o === ai.ignore) continue;
        const fd = dx * fx + dz * fz;
        if (fd < 0.5 || fd > range + v.def.len) continue;
        const lat = Math.abs(dx * -fz + dz * fx);
        const lim = (v.def.wid + o.def.wid) * 0.5 + (o.ai && !o.ai.empty ? 0.25 : 0.05);
        if (lat > lim) continue;
        const gp = fd - (v.def.len + o.def.len) * 0.5;
        if (gp < gap) { gap = gp; blocker = o; oFs = Math.max(0, o.vx * fx + o.vz * fz); }
      }
      const pedCheck = (x, z) => {
        const dx = x - v.pos.x, dz = z - v.pos.z;
        const fd = dx * fx + dz * fz;
        if (fd < 0.5 || fd > range + v.def.len * 0.5) return;
        if (Math.abs(dx * -fz + dz * fx) > v.def.wid * 0.5 + 0.6) return;
        const gp = fd - v.def.len * 0.5 - 0.4;
        if (gp < gap) { gap = gp; blocker = null; oFs = 0; ai.pedBlock = true; }
      };
      ai.pedBlock = false;
      if (!player.vehicle && !player.inInterior) pedCheck(player.pos.x, player.pos.z);
      if (ai.pedBlock) ai.honkFor = (ai.honkFor || 0) + dt;
      for (const n of g.npcs.list) if (!n.dead && !n.vehicle && Math.abs(n.pos.x - v.pos.x) < 30 && Math.abs(n.pos.z - v.pos.z) < 30) pedCheck(n.pos.x, n.pos.z);
      ai.blocker = blocker;
      if (gap < 1e8) {
        const follow = gap < 1.0 ? 0 : Math.max(0, (gap - 2.0) * 0.9 + oFs * 0.5);
        if (follow < desired) {
          desired = follow;
          if (desired < 0.6) {
            ai.blockT = (ai.blockT || 0) + dt;
            // kilitlenme çözümü
            const bl = blocker;
            if (bl && ai.blockT > 4 && !(bl.ai && bl.ai.waitLight)) {
              const mutual = bl.ai && (bl.ai.blocker === v || bl.ai.blockT > 4);
              if (mutual && v.id < bl.id) { ai.ignore = bl; ai.ignoreT = 2.5; }
              else if (!bl.ai || bl.ai.empty || bl.parked || bl.destroyed || (bl.driver && bl.speed < 0.3)) { ai.dodge = -3.2; ai.dodgeT = 3; }
            }
            if (ai.blockT > 12 && !(bl && bl.ai && bl.ai.waitLight)) { ai.ignore = bl; ai.ignoreT = 2; ai.blockT = 0; }
          }
        } else ai.blockT = 0;
        if (ai.honkFor > 1.2 && v.honkT <= 0) { audio.horn(v.pos.x, v.pos.z); v.honkT = 3; ai.honkFor = 0; }
      } else ai.blockT = 0;
      if (ai.dodgeT > 0) { ai.dodgeT -= dt; if (ai.dodgeT <= 0) ai.dodge = 0; }
      // siren duyunca kenara çekil
      if (ai.mode === 'traffic' && !v.sirenOn) {
        if (ai.yieldT > 0) ai.yieldT -= dt;
        for (const sv of _sirens) {
          const dx = sv.pos.x - v.pos.x, dz = sv.pos.z - v.pos.z;
          const fd = dx * fx + dz * fz;
          if (fd < -2 && fd > -40 && Math.abs(dx * -fz + dz * fx) < 5) { ai.yieldT = 2; break; }
        }
        if (ai.yieldT > 0) desired = Math.min(desired, 3);
      }
      if (ai.panic > 0) { ai.panic -= dt; desired = v.def.maxSpeed * 0.8; }
    }
    v.honkT -= dt;
    // saf takip direksiyonu
    const want = Math.atan2(tx - v.pos.x, tz - v.pos.z);
    const diff = angleDiff(v.heading, want);
    const reverse = ai.reverseT > 0;
    const ld = Math.max(3, Math.hypot(tx - v.pos.x, tz - v.pos.z));
    const wb = v.mesh.userData.template ? v.mesh.userData.template.wheelbase || v.def.len * 0.6 : v.def.len * 0.6;
    const steerMax = (v.P.steer || 0.6) / (1 + (v.fs * v.fs) / 700);
    const delta = Math.atan2(2 * wb * Math.sin(diff), ld);
    v.controls.steer = clamp(v.P.steer === 0 ? diff * 2 : delta / steerMax, -1, 1) * (reverse ? -1 : 1);
    const err = desired - v.fs;
    v.controls.throttle = reverse ? -1 : clamp(err * 0.35, -1, 1);
    v.controls.handbrake = desired === 0 && Math.abs(v.fs) < 2;
    // sıkışma tespiti
    if (desired > 3 && Math.abs(v.fs) < 0.8) { v.stuckT += dt; if (v.stuckT > 2.5) { ai.reverseT = 1.4; v.stuckT = 0; } } else v.stuckT = 0;
    if (ai.reverseT > 0) ai.reverseT -= dt;
    if (ai.rammedT > 0) { ai.rammedT -= dt; v.controls.throttle = -0.8; }
  }

  edgeWidth(a, b) {
    for (const e of a.edges) if (e.a === b || e.b === b) return e.width;
    return 11;
  }

  // Günün saatine göre trafik yoğunluğu
  densityFactor() {
    const h = this.game.env ? this.game.env.time : 12;
    if (h < 5) return 0.3;
    if (h < 7) return 0.6;
    if (h < 10) return 1.25;
    if (h < 16) return 0.9;
    if (h < 20) return 1.3;
    if (h < 23) return 0.7;
    return 0.45;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const px = p.pos.x, pz = p.pos.z;
    this.spawnT -= dt;
    let trafficCount = 0, parkedCount = 0;
    _sirens.length = 0;
    for (const v of this.list) {
      if (v.ai && v.ai.mode === 'traffic') trafficCount++;
      if (v.parked && !v.driver) parkedCount++;
      if (v.sirenOn && !v.destroyed) _sirens.push(v);
    }
    const base = g.settings.quality === 'low' ? 14 : g.settings.quality === 'medium' ? 20 : 28;
    const maxTraffic = Math.round(base * this.densityFactor());
    if (this.spawnT <= 0 && !p.inInterior) {
      this.spawnT = 0.4;
      if (trafficCount < maxTraffic) this.spawnTraffic(px, pz);
      if (parkedCount < 10) this.spawnParked(px, pz);
    }
    const night = g.env ? g.env.nightFactor : 0;
    headPoolMat().opacity = Math.min(0.55, night * 0.6);
    if (taxiSignMat) taxiSignMat.emissiveIntensity = 0.3 + night * 1.6;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      if (v.external) continue; // tekne/uçaklar kendi yöneticisinde
      const d = Math.hypot(v.pos.x - px, v.pos.z - pz);
      const keep = v.owned || v.mission || v === p.vehicle || v === p.lastVehicle || (v.ai && (v.ai.mode === 'chase' || v.ai.mode === 'race'));
      const excess = trafficCount > maxTraffic + 4 && v.ai && v.ai.mode === 'traffic' && d > 160;
      if ((d > 260 && !keep) || excess || (v.destroyed && v.wreckT <= 0 && d > 40) || (v.sinking > 8)) {
        if (excess) trafficCount--;
        if (v.driver && !v.driver.isPlayer) g.npcs.remove(v.driver);
        this.remove(v);
        continue;
      }
      if (d > 320 && !v.mission) continue;
      if (v.ai && !v.driver && !v.destroyed) this.driveAI(v, dt);
      v.update(dt);
    }
    this.collideVehicles();
  }

  collideVehicles() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const lim = (a.def.len + b.def.len) * 0.5;
        if (Math.abs(dx) > lim || Math.abs(dz) > lim) continue;
        if (Math.abs(a.pos.y - b.pos.y) > 2) continue;
        let hit = false;
        const afx = Math.sin(a.heading), afz = Math.cos(a.heading), bfx = Math.sin(b.heading), bfz = Math.cos(b.heading);
        for (const sa of CIRC) for (const sb of CIRC) {
          const ax = a.pos.x + afx * a.def.len * sa, az = a.pos.z + afz * a.def.len * sa;
          const bx2 = b.pos.x + bfx * b.def.len * sb, bz = b.pos.z + bfz * b.def.len * sb;
          const ddx = bx2 - ax, ddz = bz - az;
          const d = Math.hypot(ddx, ddz);
          const r = a.radius + b.radius;
          if (d < r && d > 1e-4) {
            const nx = ddx / d, nz = ddz / d, pen = (r - d) / 2;
            const ma = a.def.mass || a.def.hp, mb = b.def.mass || b.def.hp, tot = ma + mb;
            a.pos.x -= nx * pen * (mb / tot) * 2; a.pos.z -= nz * pen * (mb / tot) * 2;
            b.pos.x += nx * pen * (ma / tot) * 2; b.pos.z += nz * pen * (ma / tot) * 2;
            const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
            if (rv < 0 && !hit) {
              hit = true;
              const jimp = (-1.4 * rv) / (1 / ma + 1 / mb);
              a.vx -= (jimp / ma) * nx; a.vz -= (jimp / ma) * nz;
              b.vx += (jimp / mb) * nx; b.vz += (jimp / mb) * nz;
              const imp = -rv;
              if (imp > 4) {
                a.damage(imp * imp * 0.6 * (mb / tot) * 2, b.driver); b.damage(imp * imp * 0.6 * (ma / tot) * 2, a.driver);
                const cx = ax + nx * a.radius, cz = az + nz * a.radius;
                a.impact(cx, cz, -nx, -nz, imp); b.impact(cx, cz, nx, nz, imp);
                audio.crash(a.pos.x, a.pos.z, Math.min(1.5, imp / 12));
                this.game.particles.sparks({ x: cx, y: 0.6, z: cz }, 10);
                const pl = this.game.player;
                if (a.driver === pl || b.driver === pl) {
                  this.game.cameraShake(Math.min(0.6, imp / 25));
                  const other = a.driver === pl ? b : a;
                  if (other.type === 'police' || other.type === 'swat') this.game.wanted.crime('hit_police_car', other.pos);
                  if (other.ai && other.ai.mode === 'traffic') other.ai.panic = 3;
                  if (other.ai && other.ai.mode === 'chase') other.ai.rammedT = 0.7;
                }
              }
            }
          }
        }
      }
    }
  }

  // Yönlendirilmiş dikdörtgene uzaklıkla en yakın binilebilir araç (tekne/uçak dahil)
  nearestEnterable(x, z, maxD = 4, y) {
    const py = y !== undefined ? y : this.game.player ? this.game.player.pos.y : 0;
    let best = null, bd = maxD;
    for (const v of this.list) {
      if (v.destroyed || v.sinking > 0 || v.enterable === false) continue;
      if (Math.abs(v.pos.y - py) > 3.2) continue;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const dx = x - v.pos.x, dz = z - v.pos.z;
      const lz = Math.abs(dx * fx + dz * fz) - v.def.len * 0.5, lx = Math.abs(dx * fz - dz * fx) - v.def.wid * 0.5;
      const d = Math.hypot(Math.max(0, lx), Math.max(0, lz));
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
}

function pickTrafficType(game) {
  const r = rng.next();
  const night = game && game.env ? game.env.nightFactor > 0.5 : false;
  if (r < (night ? 0.42 : 0.3)) return 'taksi';
  if (r < 0.56) return 'kartal';
  if (r < 0.67) return 'sedan';
  if (r < 0.74) return 'dolmus';
  if (r < 0.79) return 'suv';
  if (r < 0.84) return 'bus';
  if (r < 0.89) return 'motor';
  if (r < 0.92) return 'kamyon';
  if (r < 0.94) return 'gt';
  if (r < 0.96) return 'ambulans';
  return 'police';
}
