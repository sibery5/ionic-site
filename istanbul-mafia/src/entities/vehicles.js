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
// Çarpışma ve trafik YZ'si ayrı modüllerde (model kodundan bağımsız):
import { integrateVehicle, collideAllVehicles } from './vehicle_physics.js';
import { driveVehicleAI, maybePark, maybeUnpark } from '../world/traffic_ai.js';
import { Debris } from '../world/debris.js';
import { bridgeHeightAt, bridgeSlopeAt } from '../world/bridge_profile.js';
import { BIKE_BUILDERS } from './two_wheelers.js';
import { MIL_BUILDERS } from './military_vehicles.js';

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
export const burntMat = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1 });
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
export function polyGeo(pts) {
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
export function extrudeSide(pts, W, bevel, curveSeg = 4) {
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
    // [B1] kurgusal Türk tarzı ekip aracı kaplaması: lacivert alt bant (önde eğik), kırmızı ince şerit,
    // dama şerit, POLİS yazısı, 155 ve birim no; kurgusal arma (kalkan + defne), gerçek logo değil
    g.fillStyle = '#16307a';
    g.beginPath(); g.moveTo(0, 96); g.lineTo(1024, 70); g.lineTo(1024, 200); g.lineTo(0, 200); g.closePath(); g.fill();
    g.fillStyle = '#c81414'; g.beginPath(); g.moveTo(0, 86); g.lineTo(1024, 60); g.lineTo(1024, 66); g.lineTo(0, 92); g.closePath(); g.fill();
    for (let i = 0; i < 64; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#16307a' : '#f4f4f4'; g.fillRect(i * 16, 204 + j * 12, 16, 12); }
    g.fillStyle = '#fff'; g.font = 'bold 92px Arial'; g.fillText('POLİS', 520, 142);
    g.font = 'bold 40px Arial'; g.fillText('155', 900, 120); g.font = 'bold 22px Arial'; g.fillText('34 · 1207', 900, 162);
    // arma: kalkan + iki defne yayı + yıldız (kurgusal)
    g.save(); g.translate(160, 140);
    g.fillStyle = '#f4f4f4'; g.beginPath(); g.moveTo(-34, -40); g.lineTo(34, -40); g.lineTo(34, 2); g.quadraticCurveTo(30, 34, 0, 48); g.quadraticCurveTo(-30, 34, -34, 2); g.closePath(); g.fill();
    g.fillStyle = '#16307a'; g.beginPath(); g.moveTo(-27, -33); g.lineTo(27, -33); g.lineTo(27, 0); g.quadraticCurveTo(24, 27, 0, 39); g.quadraticCurveTo(-24, 27, -27, 0); g.closePath(); g.fill();
    g.fillStyle = '#e8c040';
    g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 7 : 16, a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r - 4); } g.closePath(); g.fill();
    g.strokeStyle = '#e8c040'; g.lineWidth = 3;
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(0, 4, 46, Math.PI / 2 + sx * 0.5, Math.PI / 2 + sx * 1.9, sx < 0); g.stroke(); for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + sx * (0.65 + k * 0.22); g.beginPath(); g.ellipse(Math.cos(a) * 46, 4 + Math.sin(a) * 46, 6, 2.5, a, 0, Math.PI * 2); g.fillStyle = '#e8c040'; g.fill(); } }
    g.restore();
  } else if (kind === 'policeHood') {
    g.fillStyle = '#1d3d8e'; g.font = 'bold 150px Arial'; g.fillText('POLİS', 512, 128);
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
export function wheelGeo(r, w, kind) {
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
    const t = kind === 'offroad' ? new THREE.BoxGeometry(w * 0.92, 0.045, 0.09) : new THREE.BoxGeometry(w * 0.78, 0.022, 0.05);
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
    const nS = kind === 'sport' ? 10 : kind === 'suv' || kind === 'offroad' ? 6 : kind === 'steel' || kind === 'bus' ? 0 : 5;
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
  } else if (st === 'hatch' || st === 'hatch3' || st === 'estate') {
    const est = st === 'estate', h3 = st === 'hatch3';
    Object.assign(S, { cl: 0.24, r: est ? 0.33 : 0.3, tw: 0.2, axles: [L * (h3 ? 0.33 : 0.32), -L * (est ? 0.31 : 0.3)], arch: 0.06, belt: 0.64 * H, hood: 0.6 * H, tumble: 0.18, taper: 0.08, interior: 0x26221e });
    const b = S.belt, hd = S.hood, rz = -L / 2 + (est ? 0.07 : 0.1);
    S.top = [[L / 2 - 0.05, S.cl, 0.08], [L / 2, S.cl + 0.17, 0.1], [L / 2, hd - 0.1, 0.13], [L / 2 - 0.16, hd, 0.17], [L * 0.29, b - 0.01, 0.13], [rz, b, 0.06], [-L / 2, b - 0.14, 0.08], [-L / 2, S.cl + 0.2, 0.1], [-L / 2 + 0.05, S.cl, 0.08]];
    S.cab = { ws: [L * 0.29, b], rf: [L * 0.29 - 1.55 * (H - b), H], rr: [-L / 2 + (est ? 0.13 : 0.22), H - 0.01], rw: [rz + 0.01, b], roofR: 0.1 };
    if (h3) {
      S.windows = [[99, -L * 0.13], [-L * 0.13 - 0.08, -99]]; S.pillars = [-L * 0.13 - 0.04];
      S.doorSeams = [S.axles[0] - 0.42, -L * 0.15]; S.handles = [-L * 0.11];
    } else {
      const q = est ? -L * 0.22 : -L * 0.27;
      S.windows = [[99, -0.02], [-0.1, q + 0.03], [q - 0.05, -99]]; S.pillars = [-0.06, q];
      S.doorSeams = [S.axles[0] - 0.42, -0.06, S.axles[1] + 0.42]; S.handles = [0.06, S.axles[1] + 0.55];
    }
  } else if (st === 'coupe' || st === 'cabrio') {
    const open = st === 'cabrio';
    Object.assign(S, { cl: 0.19, r: 0.33, tw: 0.24, axles: [L * 0.31, -L * 0.3], arch: 0.05, belt: (open ? 0.7 : 0.62) * H, hood: (open ? 0.64 : 0.54) * H, tumble: 0.26, cabW: 0.92, taper: 0.12, taperStart: 0.62, grille: 'sport', interior: open ? 0x6a3a22 : 0x1e1e1e });
    const b = S.belt, hd = S.hood;
    if (open) {
      // açık kokpit: gövde üstünde iki kademeli çukur (ön koltuklar alçakta, arka koltuklar arka kavis üstünde)
      const zW = L * 0.19, zM = -L * 0.2, zR = -L * 0.28, fy = S.cl + 0.2, fy2 = 2 * S.r + S.arch + 0.07;
      S.open = { zW, zM, zR, fy, fy2 };
      S.top = [[L / 2 - 0.06, S.cl, 0.08], [L / 2, S.cl + 0.14, 0.1], [L / 2 - 0.04, hd - 0.08, 0.14], [L / 2 - 0.3, hd, 0.25], [zW + 0.06, b - 0.03, 0.05], [zW, b - 0.03, 0], [zW, fy, 0], [zM, fy, 0], [zM, fy2, 0], [zR, fy2, 0], [zR, b + 0.03, 0.02], [-L * 0.36, b + 0.03, 0.1], [-L / 2 + 0.06, b + 0.01, 0.08], [-L / 2, b - 0.2, 0.1], [-L / 2, S.cl + 0.16, 0.08], [-L / 2 + 0.06, S.cl, 0.06]];
      S.cab = { ws: [zW, b], rf: [zW - 0.5, H], rr: [zR + 0.3, H], rw: [zR, b], roofR: 0.04 };
      S.windows = []; S.pillars = []; S.rearGlass = false;
    } else {
      S.top = [[L / 2 - 0.06, S.cl, 0.08], [L / 2, S.cl + 0.14, 0.1], [L / 2 - 0.04, hd - 0.08, 0.14], [L / 2 - 0.3, hd, 0.25], [L * 0.2, b - 0.02, 0.18], [-L * 0.36, b + 0.03, 0.1], [-L / 2 + 0.06, b + 0.01, 0.08], [-L / 2, b - 0.2, 0.1], [-L / 2, S.cl + 0.16, 0.08], [-L / 2 + 0.06, S.cl, 0.06]];
      S.cab = { ws: [L * 0.2, b], rf: [L * 0.2 - 1.6 * (H - b), H], rr: [-L * 0.17, H - 0.02], rw: [-L * 0.36, b + 0.03], roofR: 0.16 };
      S.windows = [[99, -L * 0.08], [-L * 0.08 - 0.06, -99]]; S.pillars = [-L * 0.08 - 0.03];
    }
    S.doorSeams = [S.axles[0] - 0.42, -L * 0.1]; S.handles = [-L * 0.07];
  } else if (st === 'offroad') {
    Object.assign(S, { cl: 0.42, r: 0.43, tw: 0.3, axles: [L * 0.31, -L * 0.29], arch: 0.11, belt: 0.6 * H, hood: 0.58 * H, tumble: 0.05, cabW: 0.97, taper: 0.03, bevel: 0.05, bumper: 'dark', grille: 'jeep', lights: 'old', interior: 0x2a2a22, wheelKind: 'offroad' });
    const b = S.belt, hd = S.hood;
    S.top = [[L / 2 - 0.04, S.cl, 0.05], [L / 2, S.cl + 0.12, 0.05], [L / 2, hd - 0.06, 0.06], [L / 2 - 0.06, hd, 0.06], [L * 0.22, hd + 0.03, 0.06], [L * 0.19, b, 0.04], [-L / 2 + 0.03, b, 0.05], [-L / 2, b - 0.06, 0.05], [-L / 2, S.cl + 0.12, 0.05], [-L / 2 + 0.04, S.cl, 0.05]];
    S.cab = { ws: [L * 0.19, b], rf: [L * 0.19 - 0.32, H], rr: [-L / 2 + 0.06, H], rw: [-L / 2 + 0.03, b], roofR: 0.07 };
    S.windows = [[99, -0.08], [-0.16, -L * 0.3 + 0.06], [-L * 0.3 - 0.04, -99]]; S.pillars = [-0.12, -L * 0.3];
    S.doorSeams = [S.axles[0] - 0.55, -0.12, S.axles[1] + 0.55]; S.handles = [-0.02, S.axles[1] + 0.68];
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

// Parça toplayıcı. tag verilirse birleşik geometrideki köşe/indeks aralığı kaydedilir: hasarda bu aralık
// koparılıp (tampon, kaput, kapı, ayna) ayrı uçan parça olur; cam aralıkları pencere başına çatlar/kırılır.
export class Parts {
  constructor() {
    this.paint = []; this.dark = []; this.chrome = []; this.glass = []; this.lights = []; this.decals = [];
    this.tags = { paint: [], dark: [], chrome: [], glass: [] }; this.cnt = { paint: [0, 0], dark: [0, 0], chrome: [0, 0], glass: [0, 0] };
  }
  _t(kind, g, tag) {
    const c = this.cnt[kind], nv = g.attributes.position.count, ni = g.index.count;
    if (tag) this.tags[kind].push({ tag, v0: c[0], nv, i0: c[1], ni });
    c[0] += nv; c[1] += ni; this[kind].push(g);
  }
  p(g, tag) { this._t('paint', prep(g), tag); }
  d(g, hex, tag) { this._t('dark', colorize(g, hex), tag); }
  c(g, tag) { this._t('chrome', prep(g), tag); }
  gl(g, tag) { this._t('glass', prep(g), tag); }
  l(g, lens, emi, ch) { this.lights.push(lightize(g, lens, emi, ch)); }
}
// profil çokgeninde z'deki en yüksek üst yüzey (kaput paneli için)
function topYAt(top, z) {
  let best = -1;
  for (let i = 0; i < top.length - 1; i++) {
    const a = top[i], b = top[i + 1];
    if ((a[0] - z) * (b[0] - z) > 0 || a[0] === b[0]) continue;
    const y = a[1] + (b[1] - a[1]) * ((z - a[0]) / (b[0] - a[0]));
    if (y > best) best = y;
  }
  return best;
}
// gövde yüzeyine oturan ızgara panel (kaput üstte, kapı yanda): hasarda kopan parça olarak etiketlenir
function hoodPanel(S, z0, z1, off = 0.012) {
  const NZ = 6, NX = 6, pos = [], idx = [];
  for (let j = 0; j <= NZ; j++) {
    const z = z0 + ((z1 - z0) * j) / NZ, y = topYAt(S.top, z) + off;
    const hw = S.hw(Math.min(y, S.belt), z) * 0.88;
    for (let i = 0; i <= NX; i++) { const u = (i / NX) * 2 - 1; pos.push(u * hw, y - u * u * 0.03, z); }
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
function doorPanel(S, s, z0, z1, y0, y1, off = 0.007) {
  const NZ = 5, NY = 4, pos = [], idx = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NZ; i++) {
    const y = y0 + ((y1 - y0) * j) / NY, z = z0 + ((z1 - z0) * i) / NZ;
    pos.push(s * (S.hw(y, z) + off), y, z);
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NZ; i++) {
    const a = j * (NZ + 1) + i, b = a + 1, c = a + NZ + 1, d = c + 1;
    if (s > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
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
// [B1] yan kaplamayı gerçek gövdeye oturt: S.hw pahlı/kabarık gövdeden dar kalıyordu, kaplama gövdenin içinde
// kalıp görünmüyordu. Her köşe, gövdenin o yükseklik/boydaki en dış |x| değerinin hemen dışına itilir (şablonda bir kez).
function fitSideDecal(geo, body) {
  if (!body || !geo.attributes.position) return;
  const bp = body.attributes.position, cell = new Map(), key = (y, z) => Math.round(y / 0.08) * 1000 + Math.round(z / 0.15);
  for (let i = 0; i < bp.count; i++) { const k = key(bp.getY(i), bp.getZ(i)), x = Math.abs(bp.getX(i)); if (!(cell.get(k) >= x)) cell.set(k, x); }
  const dp = geo.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i), y = dp.getY(i), z = dp.getZ(i);
    let m = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const c = cell.get(key(y + a * 0.08, z + b * 0.15)); if (c > m) m = c; }
    if (m > Math.abs(x) - 0.005) dp.setX(i, Math.sign(x) * (m + 0.012));
  }
  dp.needsUpdate = true; geo.computeBoundingBox();
}
export function sideDecal(S, z0, z1, y0, y1) {
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
      // [B1] sarım dışa bakmalı (eskisi içe bakıyordu: tüm yan kaplamalar arka yüz ayıklamasıyla görünmüyordu)
      if (s > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
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
  const open = S.open;
  const pw = S.pillar;
  const edgeAt = (a, c, y) => a[0] + (c[0] - a[0]) * ((y - a[1]) / (c[1] - a[1]));
  if (!open) {
    const roofPts = [[rf[0] + 0.02, rf[1] - T, 0], [rf[0], rf[1], cab.roofR * 0.6], [(rf[0] + rr[0]) / 2, H + 0.02, 0], [rr[0], rr[1], cab.roofR * 0.6], [rr[0] + 0.02, rr[1] - T, 0]];
    B.p(shapeX(extrudeSide(roofPts, W, 0.03, 3), S, true));
  }
  // A ve C direkleri (açık kasada yalnız ön cam çerçevesi)
  for (const s of [1, -1]) {
    const yA0 = b, yA1 = rf[1] - 0.02;
    B.p(beam(s * (S.hw(yA0 + 0.01, ws[0]) - pw * 0.4), yA0, ws[0] - 0.02, s * (S.hw(yA1, rf[0]) - pw * 0.4), yA1, rf[0] - 0.02, pw, pw));
    if (open) continue;
    B.p(beam(s * (S.hw(b + 0.01, rw[0]) - pw * 0.4), b, rw[0] + 0.02, s * (S.hw(rr[1] - 0.02, rr[0]) - pw * 0.4), rr[1] - 0.02, rr[0] + 0.02, pw * 1.3, pw));
    for (const zp of S.pillars) {
      const y1 = H - 0.03;
      B.p(beam(s * (S.hw(b + 0.01, zp) - pw * 0.4), b, zp, s * (S.hw(y1, zp) - pw * 0.4), y1, zp, pw * 1.2, pw));
    }
  }
  if (open) {
    // ön cam üst çıtası + kokpit yan duvarları (gövde kabuğu kokpitte çukur; kapılar ayrı ince duvar)
    const yT = rf[1] - 0.02, hwT = S.hw(yT, rf[0]) - pw * 0.4;
    B.d(beam(-hwT, yT, rf[0] - 0.02, hwT, yT, rf[0] - 0.02, 0.05, 0.05, true), 0x151515);
    const wallPts = [[open.zW + 0.01, open.fy - 0.02, 0], [open.zW + 0.01, b - 0.03, 0.02], [open.zR - 0.01, b + 0.03, 0.02], [open.zR - 0.01, open.fy2 - 0.02, 0], [open.zM, open.fy2 - 0.02, 0], [open.zM, open.fy - 0.02, 0]];
    for (const s of [1, -1]) {
      const g = extrudeSide(wallPts, 0.09, 0.015, 2); g.translate(s * (W / 2 - 0.045), 0, 0);
      B.p(shapeX(g, S, false));
      B.d(bx(0.02, 0.16, Math.abs(open.zW - open.zR) - 0.3, s * (S.hw(b - 0.2, 0) - 0.1), b - 0.2, (open.zW + open.zR) / 2), 0x3a2418);
    }
    B.d(bx(W - 0.2, 0.012, open.zW - open.zM, 0, open.fy + 0.005, (open.zW + open.zM) / 2), 0x1a1a1a);
    B.d(bx(W - 0.2, 0.012, open.zM - open.zR, 0, open.fy2 + 0.005, (open.zM + open.zR) / 2), 0x1a1a1a);
    // katlanmış tente (arka güvertede) ve devrilme çemberleri
    B.d(rbx(W * 0.78, 0.13, 0.42, 0.06, 0, b + 0.09, open.zR - 0.3), 0x181818);
    for (const s of [1, -1]) {
      const zh = open.zM + 0.05, x = s * W * 0.22;
      B.c(beam(x - 0.2, b, zh, x - 0.17, b + 0.32, zh, 0.035, 0.035, true));
      B.c(beam(x + 0.2, b, zh, x + 0.17, b + 0.32, zh, 0.035, 0.035, true));
      B.c(beam(x - 0.17, b + 0.32, zh, x + 0.17, b + 0.32, zh, 0.035, 0.035, true));
    }
  }
  // kapalı (camsız) bölümler
  if (!open) for (const [zHi, zLo] of S.solid) {
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
  if (S.windshield) B.gl(pane(ws, rf, pw * 0.9, 0.004), 'g_ws');
  if (S.rearGlass && !open) B.gl(pane(rw, rr, pw * 1.1, 0.004), 'g_rear');
  // yan camlar (pencere başına etiket: g_L0, g_R0 ...)
  const y0 = b + 0.035, y1 = H - cab.roofR * 0.6 - 0.05;
  const trap = [[edgeAt([ws[0], b], rf, y0) - pw * 0.9, y0], [edgeAt([ws[0], b], rf, y1) - pw * 0.9, y1], [edgeAt([rw[0], b], rr, y1) + pw * 1.2, y1], [edgeAt([rw[0], b], rr, y0) + pw * 1.2, y0]];
  if (!open) S.windows.forEach(([zHi, zLo], wi) => {
    const poly = clipZ(trap, zLo, zHi);
    if (poly.length < 3) return;
    for (const s of [1, -1]) B.gl(polyGeo(poly.map((p) => [s * (S.hw(p[1], p[0]) + 0.003), p[1], p[0]])), `g_${s > 0 ? 'L' : 'R'}${wi}`);
  });
  // iç mekân zemini (bel çizgisinde koyu kaplama)
  if (!open) B.d(bx(W - 0.3, 0.012, Math.abs(ws[0] - rw[0]) - 0.1, 0, b + 0.006, (ws[0] + rw[0]) / 2), S.interior);
  // cam çıtası ve kapı çizgileri
  sideStripH(B, S, b + 0.012, rw[0] + 0.05, ws[0] - 0.05, 0.022, 0x111111, S.st === 'sedan' || S.st === 'wagon' || S.st === 'cabrio');
  for (const z of S.doorSeams) sideStripV(B, S, z, cl + 0.1, b - 0.01, 0.012, 0x0a0a0a);
  for (const z of S.handles) for (const s of [1, -1]) B.c(rbx(0.025, 0.035, 0.15, 0.012, s * (S.hw(b - 0.1, z) + 0.008), b - 0.1, z));
  // kopabilir kapı panelleri (gövdeyle aynı renk, 7 mm dışarıda; kopunca altında koyu kapı boşluğu görünür)
  S.doors = [];
  const flat = S.st === 'bus' || S.st === 'truck';
  if (!flat && S.doorSeams.length >= 2) {
    for (let k = 0; k + 1 < S.doorSeams.length && k < 2; k++) {
      const zA = Math.max(S.doorSeams[k], S.doorSeams[k + 1]) - 0.02, zB = Math.min(S.doorSeams[k], S.doorSeams[k + 1]) + 0.02;
      if (zA - zB < 0.5) continue;
      for (const s of [1, -1]) {
        const tag = `door${s > 0 ? 'L' : 'R'}${k}`;
        const ya = cl + 0.13, yb = b - 0.03;
        const okArch = S.arches.every((az) => zB > az + S.archR + 0.02 || zA < az - S.archR - 0.02);
        const y0d = okArch ? ya : Math.max(ya, S.archY + S.archR + 0.03);
        B.p(doorPanel(S, s, zB, zA, y0d, yb), tag);
        S.doors.push({ tag, s, z0: zB, z1: zA, y0: y0d, y1: yb });
      }
    }
  }
  // aynalar
  if (S.mirrors) {
    const zm = ws[0] - 0.16, ym = b + 0.1;
    for (const s of [1, -1]) {
      const xm = s * (S.hw(b, zm) + 0.13), tag = s > 0 ? 'mirrorL' : 'mirrorR';
      B.p(rbx(0.12, 0.12, 0.16, 0.04, xm, ym, zm), tag);
      B.d(bx(0.14, 0.04, 0.05, s * (S.hw(b, zm) + 0.05), ym - 0.03, zm), 0x111111, tag);
      B.c(bx(0.1, 0.1, 0.01, xm, ym, zm - 0.082), tag);
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
  if (S.bumper === 'chrome') { B.c(bump(zFb - 0.04), 'bumperF'); B.c(bump(zRb + 0.04), 'bumperR'); }
  else if (S.bumper === 'dark') { B.d(bump(zFb - 0.04), 0x1a1a1a, 'bumperF'); B.d(bump(zRb + 0.04), 0x1a1a1a, 'bumperR'); }
  else { B.p(bump(zFb - 0.05), 'bumperF'); B.p(bump(zRb + 0.05), 'bumperR'); B.d(bx(bumpW * 0.6, 0.06, 0.04, 0, cl + 0.05, zFb - 0.04), 0x111111, 'bumperF'); }
  S.bumpers = { zF: zFb, zR: zRb, w: bumpW, y: cl + 0.13 };
  // ızgara
  const gy = isBox ? (S.st === 'bus' ? cl + 0.3 : cl + 0.42) : (yH + cl + 0.2) / 2;
  const gw = S.st === 'sport' ? W * 0.5 : S.st === 'bus' ? W * 0.5 : W * 0.42, gh = S.st === 'jeep' ? 0.36 : S.st === 'sport' ? 0.12 : isBox ? 0.22 : 0.15;
  const zG = S.frontZ(gy);
  B.d(rbx(gw, gh, 0.05, 0.02, 0, gy, zG - 0.015), 0x0b0b0b);
  if (S.grille === 'jeep') for (let i = -3; i <= 3; i++) B.d(bx(0.035, gh * 0.9, 0.03, i * gw / 7.5, gy, zG + 0.01), S.solidColor || 0x2a2a2a);
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
  const open = S.open;
  const seatY = open ? open.fy + 0.1 : Math.max(cl + 0.25, b - 0.42);
  const dz = ws - 0.75;
  const seats = [];
  // koltuk: minder + sırt + başlık. seats listesine oturma noktası (minder üstü, yerel) eklenir
  const seat = (x, z, wide, y = seatY, n = 1) => {
    B.d(rbx(wide ? W * 0.62 : 0.48, 0.14, 0.48, 0.05, x, y, z), ic);
    B.d(beam(x, y + 0.05, z - 0.25, x, y + 0.62, z - 0.34, 0.1, wide ? W * 0.62 : 0.46), ic);
    if (!wide) B.d(rbx(0.24, 0.16, 0.08, 0.03, x, y + 0.72, z - 0.36), ic);
    if (wide && n > 1) for (let i = 0; i < n; i++) seats.push({ x: (i - (n - 1) / 2) * W * 0.26, y: y + 0.07, z });
    else seats.push({ x, y: y + 0.07, z });
  };
  if (S.seats === 'bus') {
    for (let z = S.L / 2 - 2.6; z > -S.L / 2 + 1; z -= 1.3) for (const s of [1, -1]) seat(s * W * 0.27, z, false);
  } else {
    seat(W * 0.22, dz, false); seat(-W * 0.22, dz, false);
    if (open) seat(0, (open.zM + open.zR) / 2 + 0.12, true, open.fy2 + 0.08, 2);
    else if (S.seats === 'car' && S.cab.rw[0] < dz - 1.0) seat(0, dz - 0.95, true, seatY, 3);
    if (S.seats === 'van' && S.st === 'van') for (let z = dz - 1.0; z > -S.L / 2 + 0.6; z -= 0.9) seat(0, z, true, seatY, 3);
  }
  // gösterge paneli ve direksiyon (sürücü solda: +x)
  B.d(rbx(W - 0.35, 0.16, 0.38, 0.05, 0, b + 0.04, ws - 0.2), 0x141414);
  const dx = S.st === 'bus' ? W * 0.28 : W * 0.22, sy = b + 0.06, sz = ws - 0.48;
  const ring = new THREE.TorusGeometry(S.st === 'bus' ? 0.24 : 0.18, 0.022, 6, 18);
  ring.rotateX(-0.45); ring.translate(dx, sy, sz);
  B.d(ring, 0x0e0e0e);
  B.d(beam(dx, sy, sz, dx, sy - 0.12, sz + 0.25, 0.05, 0.05, true), 0x111111);
  if (open) {
    // açık kasada görünen ayrıntılar: vites kolu, orta konsol, gösterge kadranları
    B.d(rbx(0.22, 0.14, 0.9, 0.04, 0, open.fy + 0.08, dz + 0.15), 0x161616);
    B.c(cyl(0.012, 0.012, 0.18, 6, 'y', 0, open.fy + 0.24, dz + 0.35));
    for (const k of [-0.07, 0.07]) B.d(cyl(0.05, 0.05, 0.02, 12, 'z', dx + k, b + 0.1, ws - 0.39), 0x2a2a2a);
  }
  void def;
  return { driver: [dx, seatY + 0.07, dz], seats };
}

// ---- özel donanımlar ----
// [B1] polis tepe lambası: alçak profil gövde, ayaklar, 6 bölmeli kırmızı/mavi modül (kanal 5/6), ortada beyaz
// arama lambaları (kanal 0, far ile yanar), bölme araları koyu; anten
function policeBar(B, y, z, w) {
  for (const s of [1, -1]) B.d(rbx(0.08, 0.05, 0.3, 0.015, s * w * 0.42, y + 0.025, z), 0x1a1a1a);
  B.d(rbx(w, 0.06, 0.3, 0.025, 0, y + 0.075, z), 0x141414);
  const m = w / 7;
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1, k = i % 3, x = side * (w / 2 - m * (k + 0.55));
    B.l(rbx(m * 0.92, 0.085, 0.26, 0.03, x, y + 0.145, z), side > 0 ? 0x6a1414 : 0x14246a, side > 0 ? 0xff2020 : 0x2a5cff, side > 0 ? 5 : 6);
  }
  for (const s of [1, -1]) B.l(rbx(m * 0.4, 0.06, 0.2, 0.02, s * m * 0.24, y + 0.14, z), 0xbfc4c8, 0xffffff, 0);
  B.d(cyl(0.006, 0.01, 0.5, 5, 'y', -w * 0.6, y + 0.25, z - 0.8), 0x111111);
}
// [B1] itme tamponu (push bar): ön tamponun önünde boru çerçeve, iki dikme, iki yatay kiriş, flaşörler
function pushBar(B, W, cl, zf) {
  const z = zf + 0.2, y0 = cl + 0.12, y1 = cl + 0.7, x = W * 0.3;
  for (const s of [1, -1]) {
    B.d(beam(s * x, y0, z, s * x, y1, z, 0.06, 0.06, true), 0x0c0c0c);
    B.d(beam(s * x, y0 + 0.05, z, s * x, y0 + 0.1, zf - 0.05, 0.05, 0.05, true), 0x0c0c0c);
    B.l(rbx(0.05, 0.12, 0.03, 0.01, s * (x - 0.07), y1 - 0.1, z + 0.02), s > 0 ? 0x6a1414 : 0x14246a, s > 0 ? 0xff2020 : 0x2a5cff, s > 0 ? 5 : 6);
  }
  B.d(beam(-x, y1 - 0.06, z, x, y1 - 0.06, z, 0.05, 0.05, true), 0x0c0c0c);
  B.d(beam(-x, y0 + 0.2, z, x, y0 + 0.2, z, 0.05, 0.05, true), 0x0c0c0c);
  B.d(rbx(x * 2 - 0.08, 0.22, 0.02, 0.01, 0, y0 + 0.32, z + 0.01), 0x161616);
}
function lightbar(B, x, y, z, w, kindA = 0xd01010, kindB = 0x1040e0) {
  B.d(rbx(w, 0.07, 0.24, 0.03, x, y + 0.035, z), 0x151515);
  B.l(rbx(w * 0.46, 0.1, 0.2, 0.04, x + w * 0.25, y + 0.1, z), 0x601010, kindA, 5);
  B.l(rbx(w * 0.46, 0.1, 0.2, 0.04, x - w * 0.25, y + 0.1, z), 0x101860, kindB, 6);
}

const templates = new Map();
// Gövde stili → özel şablon kurucu (iki tekerlekliler ve askerî araçlar ayrı modüllerde; döngüsel içe aktarma
// güvenli: kurucular yalnız ilk model isteğinde çağrılır)
function getTemplate(type) {
  if (templates.has(type)) return templates.get(type);
  const def = CARS[type];
  const st = def.body || def.style;
  let T;
  if (BIKE_BUILDERS[st]) T = BIKE_BUILDERS[st](def, type);
  else if (MIL_BUILDERS[st]) T = MIL_BUILDERS[st](def, type);
  else T = buildCarTemplate(type, def);
  templates.set(type, T);
  return T;
}

const CAR_LIKE = new Set(['sedan', 'taxi', 'police', 'wagon', 'sport', 'suv', 'jeep', 'hatch', 'hatch3', 'estate', 'coupe', 'cabrio', 'offroad']);
function buildCarTemplate(type, def) {
  const S = specFor(type, def);
  const B = new Parts();
  buildGenericBody(B, S);
  const fr = buildFrontRear(B, S);
  const inter = buildInterior(B, S, def);
  const { L, W, H, cl } = S;
  const T = { S, decals: [], extras: [], plates: [], siren: false, wheelR: S.r, driver: inter.driver, seats: inter.seats };
  const st = S.st;
  const liv = def.livery || st;
  // plakalar
  if (S.plate) {
    T.plates.push([0, cl + 0.2, fr.zFb + 0.04, false]);
    const yP = st === 'truck' ? cl + 0.3 : st === 'bus' ? cl + 0.45 : (S.st === 'van' || st === 'swat' || st === 'ambulance') ? cl + 0.42 : (S.rearZ ? S.belt - 0.3 : cl + 0.3);
    T.plates.push([0, yP, (st === 'truck' ? -L / 2 : S.rearZ(yP)) - 0.012, true]);
    T.plateSlot = liv === 'taxi' ? [104, 119] : (liv === 'police' || st === 'swat') ? [120, 127] : [0, 103];
  }
  // kopabilir kaput paneli (+ kopunca görünen motor bölmesi)
  if (CAR_LIKE.has(st)) {
    const z0 = S.cab.ws[0] + 0.12, z1 = S.frontZ(S.hood - 0.02) - (st === 'sport' || st === 'coupe' || st === 'cabrio' ? 0.4 : 0.28);
    if (z1 - z0 > 0.35) {
      B.p(hoodPanel(S, z0, z1), 'hood');
      T.hood = { z0, z1, y: topYAt(S.top, (z0 + z1) / 2) };
      if (liv === 'police') T.decals.push({ geo: hoodDecalGeo(S, z0 + 0.05, z1 - 0.05), kind: 'policeHood', tag: 'hood' });
    }
  }
  T.doors = S.doors; T.bumpers = S.bumpers;
  if (liv === 'taxi') {
    T.extras.push({ geo: rbx(0.62, 0.2, 0.26, 0.05, 0, H + 0.1, S.cab.rf[0] - 0.35), mat: 'taxiSign' });
    B.d(bx(0.5, 0.03, 0.2, 0, H + 0.005, S.cab.rf[0] - 0.35), 0x111111);
    T.decals.push({ geo: sideDecal(S, S.axles[1] + 0.5, S.axles[0] - 0.5, S.belt - 0.28, S.belt - 0.12), kind: 'taxi' });
  }
  if (liv === 'police' || st === 'swat' || st === 'ambulance') {
    T.siren = true;
    const zl = liv === 'police' ? (S.cab.rf[0] + S.cab.rr[0]) / 2 + 0.15 : S.cab.rf[0] - 0.15;
    if (liv === 'police') policeBar(B, H, zl, Math.min(1.25, W * 0.72));
    else lightbar(B, 0, H, zl, 1.4, 0xd01010, st === 'ambulance' ? 0xd01010 : 0x1040e0);
    if (liv === 'police') {
      pushBar(B, W, cl, fr.zFb);
      // sürücü tarafı A direği arama projektörü
      B.c(cyl(0.05, 0.06, 0.12, 10, 'z', W / 2 - 0.02, S.belt + 0.12, S.cab.ws[0] - 0.05));
      T.decals.push({ geo: sideDecal(S, S.axles[1] + 0.2, S.axles[0] - 0.2, cl + 0.18, S.belt - 0.05), kind: 'police' });
      B.d(rbx(W * 0.7, 0.3, 0.08, 0.03, 0, cl + 0.3, fr.zFb + 0.1), 0x111111);
      // ızgara içi flaşörler ve tavan numarası
      for (const s of [1, -1]) B.l(rbx(0.12, 0.05, 0.04, 0.015, s * W * 0.2, cl + 0.42, fr.zFb + 0.12), 0x601010, s > 0 ? 0xff2020 : 0x2050ff, s > 0 ? 5 : 6);
      B.d(bx(0.5, 0.005, 0.35, 0, H + 0.006, (S.cab.rf[0] + S.cab.rr[0]) / 2 - 0.45), 0x1d3d8e);
    } else if (st === 'swat') {
      T.decals.push({ geo: sideDecal(S, -L / 2 + 0.3, S.axles[0] - 0.5, S.belt + 0.1, S.H - 0.2), kind: 'swat' });
      B.d(rbx(W * 0.85, 0.5, 0.1, 0.03, 0, cl + 0.4, fr.zFb + 0.12), 0x0d0d0d);
      B.d(bx(W * 0.8, 0.05, L * 0.5, 0, H + 0.04, -L * 0.1), 0x222222);
      // zırh: cam ızgaraları, yan basamaklar, tavan tareti kapağı, koçbaşı
      for (const s of [1, -1]) for (let i = 0; i < 4; i++) B.d(bx(0.02, 0.02, 0.7, s * (S.hw(S.belt + 0.2 + i * 0.12, 0) + 0.02), S.belt + 0.2 + i * 0.12, L / 2 - 1.2), 0x111111);
      for (const s of [1, -1]) B.d(rbx(0.22, 0.05, L * 0.45, 0.02, s * (W / 2 + 0.05), cl + 0.05, -L * 0.05), 0x2a2a2a);
      B.d(cyl(0.38, 0.42, 0.22, 14, 'y', 0, H + 0.15, -L * 0.15), 0x1e1e1e);
      B.d(rbx(W * 0.95, 0.12, 0.12, 0.03, 0, cl + 0.12, fr.zFb + 0.22), 0x0a0a0a);
      for (let k = -1; k <= 1; k++) B.d(rbx(0.1, 0.45, 0.1, 0.03, k * W * 0.35, cl + 0.35, fr.zFb + 0.25), 0x0a0a0a);
      // kurşungeçirmez mazgallar
      for (const s of [1, -1]) for (const z of [-0.6, -1.5]) B.d(cyl(0.05, 0.05, 0.03, 8, 'x', s * (S.hw(S.belt + 0.4, z) + 0.01), S.belt + 0.4, z), 0x050505);
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
  if (st === 'coupe') B.p(rbx(W * 0.7, 0.03, 0.12, 0.012, 0, S.belt + 0.04, -L / 2 + 0.12));
  if (st === 'coupe' || st === 'cabrio') for (const s of [1, -1]) B.d(rbx(0.05, 0.06, L * 0.42, 0.02, s * (S.hw(cl + 0.08, 0) + 0.01), cl + 0.08, 0), 0x0c0c0c);
  if (st === 'suv') {
    for (const s of [1, -1]) B.c(bx(0.04, 0.04, L * 0.55, s * W * 0.36, H + 0.04, -L * 0.08));
    sideStripH(B, S, cl + 0.12, -L / 2 + 0.3, L / 2 - 0.3, 0.16, 0x161616);
  }
  if (st === 'hatch' || st === 'hatch3') {
    B.p(rbx(W * 0.8, 0.04, 0.16, 0.015, 0, S.cab.rr[1] - 0.01, S.cab.rr[0] - 0.02)); // tavan rüzgârlığı
    sideStripH(B, S, cl + 0.14, S.axles[1] + 0.4, S.axles[0] - 0.4, 0.07, 0x161616);
  }
  if (st === 'estate') for (const s of [1, -1]) B.c(bx(0.035, 0.035, L * 0.5, s * W * 0.34, H + 0.035, -L * 0.1));
  if (st === 'jeep' || st === 'offroad') {
    const col = st === 'jeep' ? 0x3b4128 : 0x1a1a1a;
    B.d(cyl(0.4, 0.4, 0.25, 16, 'z', 0, S.belt + 0.05, -L / 2 - 0.14), 0x151515);
    B.d(cyl(0.22, 0.22, 0.27, 12, 'z', 0, S.belt + 0.05, -L / 2 - 0.14), st === 'jeep' ? 0x3b4128 : 0x8a8a8a);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; B.d(bx(0.06, 0.04, 0.27, Math.cos(a) * 0.4, S.belt + 0.05 + Math.sin(a) * 0.4, -L / 2 - 0.14), 0x0c0c0c); }
    B.d(rbx(W * 0.85, 0.35, 0.08, 0.03, 0, cl + 0.3, S.frontZ(cl + 0.3) + 0.08), st === 'jeep' ? 0x252820 : 0x121212);
    if (st === 'jeep') {
      for (const s of [1, -1]) B.d(rbx(0.14, 0.4, 0.3, 0.03, s * (W / 2 + 0.05), S.belt - 0.1, -L / 2 + 0.5), 0x3b4128);
      B.d(beam(-W * 0.35, S.belt, -L / 2 + 0.3, -W * 0.38, S.belt + 2.2, -L / 2 + 0.35, 0.02, 0.02, true), 0x111111);
      T.decals.push({ geo: sideDecal(S, -0.3, 0.6, S.belt - 0.45, S.belt - 0.15), kind: 'army' });
    } else {
      // koruma demiri, tavan sepeti, çamurluk genişletici, şnorkel, sis farları
      const zf = S.frontZ(cl + 0.3) + 0.14;
      for (const s of [1, -1]) B.d(beam(s * W * 0.32, cl + 0.12, zf, s * W * 0.3, S.hood - 0.05, zf - 0.05, 0.05, 0.05, true), col);
      B.d(beam(-W * 0.32, S.hood - 0.08, zf - 0.05, W * 0.32, S.hood - 0.08, zf - 0.05, 0.05, 0.05, true), col);
      B.d(bx(W * 0.82, 0.04, L * 0.5, 0, H + 0.14, -L * 0.12), 0x111111);
      for (const s of [1, -1]) { B.d(bx(0.04, 0.12, L * 0.5, s * W * 0.41, H + 0.08, -L * 0.12), 0x111111); for (const z of [-L * 0.3, L * 0.06]) B.d(bx(0.05, 0.12, 0.05, s * W * 0.41, H + 0.04, z), 0x111111); }
      for (const az of S.axles) for (const s of [1, -1]) {
        const g = new THREE.TorusGeometry(S.archR + 0.03, 0.05, 6, 14, Math.PI); g.rotateY(Math.PI / 2); g.translate(s * (S.hw(S.archY, az) + 0.02), S.archY, az);
        B.d(g, 0x111111);
      }
      B.d(beam(W * 0.48, S.belt - 0.2, S.cab.ws[0] - 0.05, W * 0.46, H + 0.05, S.cab.ws[0] - 0.25, 0.08, 0.08, true), 0x111111);
      for (const s of [1, -1]) B.l(cyl(0.07, 0.07, 0.05, 12, 'z', s * W * 0.26, cl + 0.22, zf + 0.01), 0xdfe6ea, 0xfff2d8, 0);
    }
  }
  if (st === 'bus') {
    T.extras.push({ geo: new THREE.PlaneGeometry(1.8, 0.32).translate(0, H - 0.25, L / 2 - 0.08 + 0.0), mat: 'busDest' });
    T.decals.push({ geo: sideDecal(S, -L / 2 + 0.3, L / 2 - 0.3, S.belt - 0.55, S.belt - 0.02), kind: 'bus' });
    B.d(rbx(W * 0.7, 0.3, 2.6, 0.08, 0, H + 0.15, -L * 0.15), 0xdcdcdc);
    for (const zc of [L / 2 - 0.9, -0.3]) B.gl(polyGeo([[-(S.hw(0.4, zc) + 0.006), 0.4, zc - 0.55], [-(S.hw(0.4, zc) + 0.006), 0.4, zc + 0.55], [-(S.hw(S.belt, zc) + 0.006), S.belt, zc + 0.55], [-(S.hw(S.belt, zc) + 0.006), S.belt, zc - 0.55]]), 'g_door' + zc.toFixed(1));
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
  // tekerlekler + süspansiyon bağlantı yüksekliği (amortisör üst noktası, tekerlek merkezine göre)
  T.wheels = [];
  const wx = S.wheelX || W / 2 - S.tw / 2 - 0.05;
  const wk = S.wheelKind || (st === 'sport' || st === 'coupe' || st === 'cabrio' ? 'sport' : st === 'suv' || st === 'estate' ? 'suv' : st === 'jeep' ? 'steel' : st === 'swat' ? 'black' : 'car');
  T.wheelGeo = wheelGeo(S.r, S.tw, wk);
  for (let i = 0; i < S.axles.length; i++) for (const s of [1, -1]) T.wheels.push({ x: s * wx, z: S.axles[i], front: i === 0, side: s });
  T.wheelbase = S.axles[0] - S.axles[S.axles.length > 2 ? 2 : 1];
  T.track = wx * 2;
  T.strut = { up: S.arch + S.r * 0.55, inset: S.tw / 2 + 0.06 };
  T.travel = st === 'offroad' || st === 'jeep' ? 0.16 : st === 'sport' || st === 'coupe' || st === 'cabrio' ? 0.07 : 0.1;
  T.pool = { w: W * 1.8, d: 9, z: L / 2 + 4.6 };
  T.open = !!S.open;
  finishTemplate(T, B);
  return T;
}

// kaputa POLİS yazısı (önden okunur)
function hoodDecalGeo(S, z0, z1) {
  const g = hoodPanel(S, z0, z1, 0.02);
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  let hx = 0; for (let i = 0; i < p.count; i++) hx = Math.max(hx, Math.abs(p.getX(i)));
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) / hx + 1) / 2; uv[i * 2 + 1] = (z1 - p.getZ(i)) / (z1 - z0); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Birleştir + etiket aralıklarından pencere kutuları (mermi isabetinde hangi camın vurulduğu)
export function finishTemplate(T, B) {
  T.paint = B.paint.length ? mergeGeometries(B.paint) : null;
  T.dark = B.dark.length ? mergeGeometries(B.dark) : null;
  T.chrome = B.chrome.length ? mergeGeometries(B.chrome) : null;
  T.glass = B.glass.length ? mergeGeometries(B.glass) : null;
  T.lights = B.lights.length ? mergeGeometries(B.lights) : null;
  if (T.paint) T.paint.computeBoundingSphere();
  T.tags = B.tags || null;
  T.panes = [];
  if (T.glass && B.tags) {
    const n = T.glass.attributes.position.count;
    T.glass.setAttribute('aCrack', new THREE.BufferAttribute(new Float32Array(n), 1));
    const p = T.glass.attributes.position;
    for (const r of B.tags.glass) {
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (let i = r.v0; i < r.v0 + r.nv; i++) { const v = [p.getX(i), p.getY(i), p.getZ(i)]; for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } }
      T.panes.push({ tag: r.tag, r, mn, mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], hp: r.tag === 'g_ws' ? 5 : 3 });
    }
  }
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

// Pencere başına çatlak dokusu: r kanalı = ilk isabet yıldızı, g kanalı = yoğun örümcek ağı
let crackTex = null;
function crackTexture() {
  if (crackTex) return crackTex;
  const c = makeCanvas(256, 256); const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  const r = new RNG(11);
  const star = (cx, cy, n, len, col, w) => {
    g.strokeStyle = col; g.lineWidth = w;
    for (let i = 0; i < n; i++) {
      let x = cx, y = cy; const a0 = (i / n) * Math.PI * 2 + r.float(-0.2, 0.2);
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 7; s++) { const a = a0 + r.float(-0.35, 0.35); x += Math.cos(a) * len; y += Math.sin(a) * len; g.lineTo(x, y); }
      g.stroke();
    }
    for (let ring = 1; ring < 4; ring++) { g.beginPath(); for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2, rr = ring * len * 0.9 * r.float(0.8, 1.2); if (k === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.stroke(); }
  };
  g.globalCompositeOperation = 'lighter';
  star(128, 128, 11, 16, 'rgb(255,0,0)', 1.6);
  star(60, 70, 9, 12, 'rgb(0,255,0)', 1.3); star(190, 60, 9, 12, 'rgb(0,255,0)', 1.3); star(80, 200, 9, 13, 'rgb(0,255,0)', 1.3); star(200, 190, 9, 12, 'rgb(0,255,0)', 1.3);
  for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgb(0,200,0)'; g.lineWidth = 0.8; g.beginPath(); const x = r.float(0, 256), y = r.float(0, 256); g.moveTo(x, y); g.lineTo(x + r.float(-30, 30), y + r.float(-30, 30)); g.stroke(); }
  crackTex = new THREE.CanvasTexture(c); crackTex.wrapS = crackTex.wrapT = THREE.RepeatWrapping;
  return crackTex;
}
// Araç camı: glassMat + köşe başı çatlak özniteliği
export const carGlassMat = glassMat.clone();
carGlassMat.onBeforeCompile = (sh) => {
  sh.uniforms.uCrack = { value: crackTexture() };
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCrack; varying float vCrack; varying vec2 vCrUv;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrack = aCrack; vCrUv = vec2(position.x + position.z, position.y) * 1.25;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uCrack; varying float vCrack; varying vec2 vCrUv;')
    .replace('#include <color_fragment>', `#include <color_fragment>
    if (vCrack > 0.01) { vec4 ct = texture2D(uCrack, vCrUv); float ck = clamp(ct.r + (vCrack > 1.5 ? ct.g : 0.0), 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.93), ck * 0.9); diffuseColor.a = max(diffuseColor.a, 0.6 + ck * 0.38); }`);
};
carGlassMat.customProgramCacheKey = () => 'aracCam1';

// Amortisör + helezon yay (birim yükseklik; ölçek y = boy)
let strutG = null;
function strutGeo() {
  if (strutG) return strutG;
  const parts = [colorize(cyl(0.022, 0.022, 1, 8, 'y', 0, 0.5, 0), 0x8c8c8c), colorize(cyl(0.035, 0.035, 0.45, 8, 'y', 0, 0.75, 0), 0x202020)];
  for (let i = 0; i < 7; i++) parts.push(colorize(new THREE.TorusGeometry(0.06, 0.009, 4, 12).rotateX(Math.PI / 2).translate(0, 0.25 + i * 0.1, 0), 0xb01818));
  strutG = mergeGeometries(parts);
  return strutG;
}

export function buildCarModel(type, color) {
  const def = CARS[type];
  const T = getTemplate(type);
  const st = T.S.st;
  const matte = !!T.matte || st === 'jeep' || st === 'tank';
  const color0 = color || def.colors[0];
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const chassis = new THREE.Group();
  root.add(chassis);
  const bodyM = new THREE.Mesh(T.paint, paintMat(color0, matte));
  bodyM.castShadow = true;
  chassis.add(bodyM);
  let darkM = null, chromeM = null;
  if (T.dark) { darkM = new THREE.Mesh(T.dark, darkMat); darkM.castShadow = true; chassis.add(darkM); }
  if (T.chrome) { chromeM = new THREE.Mesh(T.chrome, chromeMat); chassis.add(chromeM); }
  let glassM = null;
  if (T.glass) { glassM = new THREE.Mesh(T.glass, T.panes && T.panes.length ? carGlassMat : glassMat); glassM.renderOrder = 2; chassis.add(glassM); }
  const lightsMat = makeLightsMat();
  if (T.lights) chassis.add(new THREE.Mesh(T.lights, lightsMat));
  const decalMeshes = [];
  for (const d of T.decals) if (!d.fitted && !d.truck && d.tag !== 'hood') { fitSideDecal(d.geo, T.paint); d.fitted = true; }
  for (const d of T.decals) {
    const m = new THREE.Mesh(d.geo, decalMat(d.kind));
    if (d.truck) {
      for (const s of [1, -1]) { const mm = s > 0 ? m : m.clone(); mm.position.set(s * (d.truck.W / 2 + 0.01), d.truck.y, d.truck.z); mm.rotation.y = s * Math.PI / 2; chassis.add(mm); }
      continue;
    }
    chassis.add(m);
    decalMeshes.push({ m, tag: d.tag });
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
  // taret (tank, zırhlı): yatay dönen grup + dikey dönen namlu grubu
  let turret = null, barrel = null;
  if (T.turretParts) {
    const tp = T.turretPos || [0, 1.5, -0.3], bp = T.barrelPos || [0, 0.32, 1.25];
    turret = new THREE.Group(); turret.position.set(tp[0], tp[1], tp[2]); chassis.add(turret);
    if (T.turretParts.paint) turret.add(new THREE.Mesh(T.turretParts.paint, paintMat(color0, true)));
    if (T.turretParts.dark) turret.add(new THREE.Mesh(T.turretParts.dark, darkMat));
    if (T.turretParts.chrome) turret.add(new THREE.Mesh(T.turretParts.chrome, chromeMat));
    barrel = new THREE.Group(); barrel.position.set(bp[0], bp[1], bp[2]); turret.add(barrel);
    if (T.barrelParts.paint) barrel.add(new THREE.Mesh(T.barrelParts.paint, paintMat(color0, true)));
    if (T.barrelParts.dark) barrel.add(new THREE.Mesh(T.barrelParts.dark, darkMat));
  }
  // tekerlekler (kasadan bağımsız: süspansiyon/yalpa yalnız kasayı etkiler) + amortisörler
  const wheels = [];
  for (const w of T.wheels) {
    const piv = new THREE.Group(); piv.position.set(w.x, w.y || T.wheelR, w.z);
    const flip = new THREE.Group(); if (w.side < 0) flip.rotation.y = Math.PI;
    const spin = new THREE.Group();
    piv.add(flip); flip.add(spin);
    spin.add(new THREE.Mesh(T.wheelGeo, wheelMat));
    let strut = null;
    if (T.strut && !T.moto) {
      strut = new THREE.Mesh(strutGeo(), darkMat);
      strut.position.set(-Math.sign(w.x || 1) * T.strut.inset, 0, 0); strut.scale.y = T.strut.up; strut.visible = false;
      piv.add(strut);
    }
    (T.moto ? chassis : root).add(piv);
    wheels.push({ piv, spin, front: w.front, sign: w.side < 0 ? -1 : 1, x: w.x, z: w.z, y0: w.y || T.wheelR, strut, lift: 0 });
  }
  // sürücü maketi
  const drv = new THREE.Mesh(T.dummyGeo || dummyGeo(T.moto), darkMat);
  drv.position.set(T.driver[0], T.driver[1], T.driver[2]);
  drv.visible = false;
  chassis.add(drv);
  // gece far havuzu
  const pool = new THREE.Mesh(poolGeo, headPoolMat());
  pool.scale.set(T.pool.w, 1, T.pool.d); pool.position.set(0, 0.04, T.pool.z); pool.visible = false; pool.renderOrder = 1;
  root.add(pool);
  Object.assign(root.userData, {
    bodyMesh: bodyM, darkMesh: darkM, chromeMesh: chromeM, glassMesh: glassM, decalMeshes, chassis, wheels, wheelR: T.wheelR, lights: lightsMat.userData, lightsMat,
    driverDummy: drv, driverTorso: drv, siren: T.siren, pool, plateGeo, turret, barrel, template: T, moto: !!T.moto,
  });
  if (T.decorate) T.decorate(root, chassis, root.userData, color0);
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
const _q = [];
const PHYS = {
  // grip: yanal tutunma (m/s²), cs: yanal sertlik, steer: azami direksiyon açısı, gears: vites sayısı, rev: motor sesi çarpanı,
  // soft: süspansiyon yumuşaklığı, snd: motor sesi sınıfı (audio.setEngine opts.kind), horn: korna türü
  sedan: { grip: 13, cs: 11, steer: 0.62, gears: 5, rev: 1, soft: 1, snd: 'car' },
  wagon: { grip: 11.5, cs: 10, steer: 0.62, gears: 4, rev: 0.9, soft: 1.3, snd: 'old' },
  hatch: { grip: 12.5, cs: 11, steer: 0.65, gears: 5, rev: 1.1, soft: 1.1, snd: 'small' },
  hatch3: { grip: 12.5, cs: 11.5, steer: 0.66, gears: 5, rev: 1.15, soft: 1.05, snd: 'small' },
  estate: { grip: 12, cs: 10.5, steer: 0.62, gears: 5, rev: 0.95, soft: 1.2, snd: 'car' },
  taxi: { grip: 12.5, cs: 11, steer: 0.62, gears: 5, rev: 1, soft: 1.1, snd: 'car' },
  police: { grip: 14, cs: 12, steer: 0.62, gears: 5, rev: 1.05, soft: 0.9, snd: 'v8' },
  sport: { grip: 17, cs: 13, steer: 0.55, gears: 6, rev: 1.3, soft: 0.6, rwd: true, snd: 'sport', turbo: true },
  coupe: { grip: 16, cs: 13, steer: 0.56, gears: 6, rev: 1.25, soft: 0.7, rwd: true, snd: 'sport', turbo: true },
  cabrio: { grip: 15, cs: 12.5, steer: 0.58, gears: 6, rev: 1.2, soft: 0.8, rwd: true, snd: 'sport' },
  suv: { grip: 12, cs: 10, steer: 0.6, gears: 6, rev: 0.85, soft: 1.3, snd: 'v8', turbo: true },
  jeep: { grip: 11, cs: 9, steer: 0.6, gears: 4, rev: 0.8, soft: 1.4, snd: 'diesel', offroad: true },
  offroad: { grip: 11.5, cs: 9.5, steer: 0.6, gears: 5, rev: 0.8, soft: 1.6, snd: 'diesel', offroad: true },
  van: { grip: 10, cs: 9, steer: 0.6, gears: 5, rev: 0.85, soft: 1.4, snd: 'diesel' },
  swat: { grip: 11, cs: 9, steer: 0.58, gears: 5, rev: 0.75, soft: 1.1, snd: 'diesel', horn: 'truck' },
  ambulance: { grip: 10, cs: 9, steer: 0.6, gears: 5, rev: 0.85, soft: 1.4, snd: 'diesel' },
  bus: { grip: 7.5, cs: 7, steer: 0.62, gears: 4, rev: 0.6, soft: 1.2, snd: 'truck', horn: 'truck' },
  truck: { grip: 7, cs: 7, steer: 0.6, gears: 6, rev: 0.6, soft: 1.2, snd: 'truck', horn: 'truck' },
  mtruck: { grip: 8, cs: 7.5, steer: 0.58, gears: 6, rev: 0.6, soft: 1.4, snd: 'truck', horn: 'truck', offroad: true },
  apc: { grip: 9, cs: 8, steer: 0.5, gears: 5, rev: 0.55, soft: 0.9, snd: 'truck', horn: 'truck', offroad: true },
  moto: { grip: 15, cs: 13, steer: 0.7, gears: 5, rev: 1.6, soft: 0.8, snd: 'moto', horn: 'moto' },
  bike: { grip: 9, cs: 10, steer: 0.8, gears: 1, rev: 0, soft: 0.5, snd: 'bike', horn: 'bell' },
  tank: { grip: 30, cs: 20, steer: 0, gears: 3, rev: 0.5, soft: 0.3, snd: 'tank', horn: 'truck', offroad: true },
};
const rnd = (k = 1) => (Math.random() * 2 - 1) * k;

// birleşik geometriden etiket aralığını ayrı geometri olarak kopyala
function extractRange(geo, r) {
  const g = new THREE.BufferGeometry();
  for (const k of Object.keys(geo.attributes)) {
    const a = geo.attributes[k], n = a.itemSize;
    g.setAttribute(k, new THREE.BufferAttribute(a.array.slice(r.v0 * n, (r.v0 + r.nv) * n), n));
  }
  const ix = geo.index.array, out = new Uint32Array(r.ni);
  for (let i = 0; i < r.ni; i++) out[i] = ix[r.i0 + i] - r.v0;
  g.setIndex(new THREE.BufferAttribute(out, 1));
  return g;
}
// aralığın köşelerini tek noktaya çökert (üçgenler görünmez olur)
function collapseRange(geo, r) {
  const p = geo.attributes.position, x = p.getX(r.v0), y = p.getY(r.v0), z = p.getZ(r.v0);
  for (let i = r.v0; i < r.v0 + r.nv; i++) p.setXYZ(i, x, y, z);
  p.needsUpdate = true;
}

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
    const T = this.mesh.userData.template;
    this.T = T || null;
    // Yolcu koltukları (hikâye: kız arkadaş yanında). seats[0] sürücü. Yerel kasa koordinatı, y = minder üstü.
    this.seats = (T && T.seats ? T.seats : []).map((s, i) => ({ x: s.x, y: s.y, z: s.z, driver: i === 0, actor: null }));
    this.passengers = [];
    this.seatHipOffset = 0.45; // oturma pozunda kalça ile ayak tabanı arası (character.js sit)
    // Pencere durumları: 0 sağlam, 1 çatlak, 2 ağır çatlak, 3 kırık
    this.windows = T && T.panes ? T.panes.map((p) => ({ p, hits: 0, state: 0 })) : [];
    this.detached = new Set();
    this._own = {};
    this.susp = { h: 0, hv: 0, p: 0, pv: 0, r: 0, rv: 0 };
    // Sürücü pozu kancası (karakter mühendisi): yerel koordinatlar, iki tekerlekliler her kare günceller
    this.riderPose = T && T.riderPose ? JSON.parse(JSON.stringify(T.riderPose)) : (T && T.driver ? { seat: T.driver.slice(), lean: 0, steer: 0 } : null);
    this.sync();
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwd() { const o = this._fwd; o.x = Math.sin(this.heading); o.z = Math.cos(this.heading); return o; }

  setColor(col) {
    this.color = col;
    const T = this.mesh.userData.template;
    this.mesh.userData.bodyMesh.material = paintMat(col, T && (T.matte || T.S.st === 'jeep' || T.S.st === 'tank'));
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.order = 'YXZ'; // yönelim sonra yerel eğim (köprü rampası, batma)
    if (this.flip) { this.mesh.position.y += this.flipLift || 0; this.mesh.rotation.set(this.flip.x, this.heading, this.flip.z); return; }
    this.mesh.rotation.set(this.sinking > 0 ? Math.min(0.5, this.sinking * 0.2) : (this.roadPitch || 0), this.heading, this.lean);
  }

  dispose() {
    const ud = this.mesh.userData;
    if (ud.plateGeo) ud.plateGeo.dispose();
    for (const k in this._own) this._own[k].dispose();
    if (ud.lightsMat) ud.lightsMat.dispose();
    for (const a of this.passengers.slice()) this.removePassenger(a);
  }

  // araca özel (paylaşılmayan) geometri kopyası: göçük, kopan parça ve cam çatlağı için
  ownGeo(kind) {
    if (this._own[kind]) return this._own[kind];
    const ud = this.mesh.userData;
    const m = kind === 'paint' ? ud.bodyMesh : kind === 'dark' ? ud.darkMesh : kind === 'chrome' ? ud.chromeMesh : ud.glassMesh;
    if (!m) return null;
    const g = m.geometry.clone(); m.geometry = g; this._own[kind] = g;
    return g;
  }
  get dentGeo() { return this._own.paint || null; }

  damage(amount, attacker) {
    if (this.destroyed) return;
    this.hp -= amount;
    if (attacker && attacker.isPlayer && this.driver && !this.driver.isPlayer && this.ai) this.ai.panic = 10;
    const ray = this._ray; this._ray = null;
    if (amount >= 200) { for (let i = 0; i < this.windows.length; i++) if (Math.random() < 0.6) this.setPane(i, 3); }
    else if (ray) this.bulletHit(ray);
    else if (amount > 25 && Math.random() < 0.25) this.crackRandom();
    if (this.hp < this.def.hp * 0.3 && Math.random() < 0.1) this.crackRandom();
    if (this.burnT > 0) return;
    if (this.kind !== 'car') { if (this.hp <= 0) { this.burnT = 4.5; this.lastAttacker = attacker; } return; }
    // [B1 hasar dengesi] hp 0'da motor ölür ve yoğun duman çıkar ama hemen yanmaz. Alev ancak ağır hasarda
    // (hp <= -%30) ya da hurdaya dönmüş araca büyük tek darbede (patlama/roket) başlar; fitil uzun (~11 sn),
    // oyuncu inebilir. Çok büyük darbe (hp <= -%100) kısa fitille patlar.
    const H = this.def.hp;
    if (this.hp <= -H * 0.3 || (this.hp <= 0 && amount >= 150)) {
      this.burnT = this.hp <= -H ? 1.2 + Math.random() * 0.8 : 10 + Math.random() * 2.5;
      this.burnT0 = this.burnT;
      this.lastAttacker = attacker;
      if (this.driver && this.driver.isPlayer && this.burnT > 3 && this.game.ui) this.game.ui.notify('Araç alev aldı! Hemen in (F)!', 'warn');
    } else if (this.hp <= 0 && !this._deadNote && this.driver && this.driver.isPlayer && this.game.ui) { this._deadNote = true; this.game.ui.notify('Motor durdu — araç ağır hasarlı.', 'warn'); }
  }
  // eski API
  breakGlass() { this.crackRandom(3); }
  crackRandom(st) {
    if (!this.windows.length) { this.glassBroken = true; return; }
    const i = Math.floor(Math.random() * this.windows.length);
    if (st) this.setPane(i, st); else this.paneHit(i, 1);
  }
  toLocal(wx, wz, out) {
    const f = this.fwd, dx = wx - this.pos.x, dz = wz - this.pos.z;
    out.x = dx * f.z - dz * f.x; out.z = dx * f.x + dz * f.z;
    return out;
  }
  // mermi isabet noktası → hangi cam (kutusu genişletilmiş en yakın pencere)
  bulletHit(h) {
    if (!this.windows.length) return;
    // isabet noktasından mermi yönünde kutunun içine doğru: ilk kesilen pencere kutusu (yerel uzayda ışın-AABB)
    const l = this.toLocal(h.x, h.z, _push), oy = h.y - this.pos.y, ox = l.x, oz = l.z;
    const f = this.fwd, dx = h.dx * f.z - h.dz * f.x, dz = h.dx * f.x + h.dz * f.z, dy = h.dy;
    let best = -1, bt = this.def.len + this.def.wid;
    for (let i = 0; i < this.windows.length; i++) {
      const w = this.windows[i]; if (w.state >= 3) continue;
      const { mn, mx } = w.p;
      let t0 = -0.3, t1 = bt;
      const O = [ox, oy, oz], D = [dx, dy, dz], M = 0.06;
      for (let k = 0; k < 3 && t0 <= t1; k++) {
        const lo = mn[k] - M, hi = mx[k] + M;
        if (Math.abs(D[k]) < 1e-6) { if (O[k] < lo || O[k] > hi) t0 = 1e9; continue; }
        let a = (lo - O[k]) / D[k], b = (hi - O[k]) / D[k]; if (a > b) { const q = a; a = b; b = q; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      }
      if (t0 <= t1 && t0 < bt) { bt = t0; best = i; }
    }
    if (best >= 0) { this.lastPaneHit = best; this.paneHit(best, 1, h); } // [savaş cam] isabet noktası çatlak izine
  }
  paneHit(i, k, hit = null) {
    const w = this.windows[i]; if (!w || w.state >= 3) return;
    w.hits += k;
    const hp = w.p.hp;
    const st = w.hits >= hp ? 3 : w.hits >= hp * 0.5 ? 2 : 1;
    const G = this.game.combat && this.game.combat.glass; // [savaş cam] isabet noktasında çatlak izi
    if (G && hit && st < 3) G.crack(this, i, hit, st);
    if (st > w.state) this.setPane(i, st);
    else if (this.game.audio && this.game.audio.glassCrack) this.game.audio.glassCrack(this.pos.x, this.pos.z, 0.5);
  }
  setPane(i, st) {
    const w = this.windows[i]; if (!w || st <= w.state) return;
    const g = this.ownGeo('glass'); if (!g) return;
    const r = w.p.r, a = this.game.audio || audio;
    w.state = st;
    if (st < 3) {
      const cr = g.attributes.aCrack;
      if (cr) { for (let k = r.v0; k < r.v0 + r.nv; k++) cr.setX(k, st); cr.needsUpdate = true; }
      if (a.glassCrack) a.glassCrack(this.pos.x, this.pos.z, st === 2 ? 1 : 0.7);
      return;
    }
    collapseRange(g, r);
    this.glassBroken = true;
    // cam kırıkları: pencere merkezinden dışa ve aşağı saçılan parlak parçacıklar
    const ch = this.mesh.userData.chassis;
    this.mesh.updateMatrixWorld();
    _v0.set(w.p.c[0], w.p.c[1], w.p.c[2]); ch.localToWorld(_v0);
    const P = this.game.particles;
    const out = Math.sign(w.p.c[0]) || 0, f = this.fwd;
    const ox = f.z * out, oz = -f.x * out;
    const G = this.game.combat && this.game.combat.glass; // [savaş cam] dökülen cam parçaları (havuzlu)
    if (G) G.shatter(this, i, _v0);
    else if (P && P.debris && P.debris.emit) for (let k = 0; k < 18; k++) {
      const c = 0.7 + Math.random() * 0.25;
      P.debris.emit(_v0.x + rnd(0.3), _v0.y + rnd(0.15), _v0.z + rnd(0.3), ox * 2 + this.vx * 0.8 + rnd(1.6), Math.random() * 2.2, oz * 2 + this.vz * 0.8 + rnd(1.6), 0.015 + Math.random() * 0.03, (this.groundY || 0) + 0.01, 0, c * 0.85, c * 0.95, c);
    }
    if (P && P.sparks && !G) P.sparks(_v0, 3);
    if (a.glassBreak) a.glassBreak(_v0.x, _v0.z, w.p.tag === 'g_ws' ? 1.2 : 1);
  }

  // [kanun] kapı aç/kapa (araç gaspı, ekip inişi): kapı paneli ve camı menteşeli ayrı parçaya taşınır.
  // tag 'doorL0' (sol ön = sürücü) gibi; ang radyan (0 kapalı .. ~1.2 açık). Kapı yoksa false.
  setDoor(tag, ang) {
    const T = this.T;
    if (!T || !T.tags || !T.doors || this.kind !== 'car' || this.detached.has(tag)) return false;
    const doors = this._doors || (this._doors = {});
    let D = doors[tag];
    if (!D) {
      const dd = T.doors.find((x) => x.tag === tag);
      if (!dd) return false;
      const ud = this.mesh.userData, grp = new THREE.Group();
      const hx = dd.s * T.S.hw((dd.y0 + dd.y1) / 2, dd.z1), hz = dd.z1;
      let any = false;
      for (const kind of ['paint', 'dark', 'chrome']) {
        for (const r of T.tags[kind]) {
          if (r.tag !== tag) continue;
          const own = this.ownGeo(kind); if (!own) continue;
          const sub = extractRange(own, r); collapseRange(own, r); sub.translate(-hx, 0, -hz);
          grp.add(new THREE.Mesh(sub, kind === 'paint' ? ud.bodyMesh.material : kind === 'dark' ? darkMat : chromeMat));
          any = true;
        }
      }
      if (!any) return false;
      const gl = this.ownGeo('glass');
      if (gl) for (const w of this.windows) {
        const c = w.p.c;
        if (w.state >= 3 || Math.sign(c[0]) !== dd.s || c[2] >= dd.z1 || c[2] <= dd.z0) continue;
        const sub = extractRange(gl, w.p.r); collapseRange(gl, w.p.r); sub.translate(-hx, 0, -hz);
        const m = new THREE.Mesh(sub, ud.glassMesh.material); m.renderOrder = 2; grp.add(m);
      }
      for (const d of ud.decalMeshes || []) if (d.tag === tag) d.m.visible = false;
      grp.position.set(hx, 0, hz);
      ud.chassis.add(grp);
      D = doors[tag] = { grp, s: dd.s, ang: 0 };
    }
    D.ang = ang;
    D.grp.rotation.y = -D.s * ang;
    return true;
  }

  // Parça kopar (tampon/kaput/kapı/ayna): aralığı ayrı uçan parçaya taşı, gövdede çökert
  detach(tag, vx = 0, vy = 2, vz = 0, fire = 0) {
    const T = this.T;
    if (!T || !T.tags || this.detached.has(tag) || this.kind !== 'car') return false;
    const ud = this.mesh.userData;
    const grp = new THREE.Group();
    let any = false;
    for (const kind of ['paint', 'dark', 'chrome']) {
      for (const r of T.tags[kind]) {
        if (r.tag !== tag) continue;
        const own = this.ownGeo(kind); if (!own) continue;
        const sub = extractRange(own, r);
        collapseRange(own, r);
        const mat = kind === 'paint' ? ud.bodyMesh.material : kind === 'dark' ? darkMat : chromeMat;
        grp.add(new THREE.Mesh(sub, this.destroyed ? burntMat : mat));
        any = true;
      }
    }
    if (!any) return false;
    this.detached.add(tag);
    for (const d of ud.decalMeshes || []) if (d.tag === tag) d.m.visible = false;
    // kopan parçanın altı: motor bölmesi / kapı boşluğu
    if (tag === 'hood' && T.hood) {
      const S = T.S, zc = (T.hood.z0 + T.hood.z1) / 2, len = T.hood.z1 - T.hood.z0;
      const geo = mergeGeometries([colorize(bx(S.W * 0.78, 0.02, len, 0, T.hood.y - 0.12, zc), 0x111111), colorize(rbx(0.7, 0.3, len * 0.55, 0.05, 0, T.hood.y - 0.2, zc), 0x3a3a3a), colorize(cyl(0.12, 0.12, 0.25, 10, 'x', S.W * 0.25, T.hood.y - 0.12, zc + len * 0.25), 0x1a1a1a)]);
      ud.chassis.add(new THREE.Mesh(geo, darkMat));
    } else if (tag.startsWith('door') && T.doors) {
      const dd = T.doors.find((x) => x.tag === tag);
      if (dd) {
        ud.chassis.add(new THREE.Mesh(colorize(doorPanel(T.S, dd.s, dd.z0, dd.z1, dd.y0, dd.y1, -0.02), 0x151515), darkMat));
        for (let i = 0; i < this.windows.length; i++) { const c = this.windows[i].p.c; if (Math.sign(c[0]) === dd.s && c[2] < dd.z1 && c[2] > dd.z0) this.setPane(i, 3); }
      }
    }
    // dünya konumuna taşı (merkez etrafında dönsün)
    this.mesh.updateMatrixWorld();
    grp.children[0].geometry.computeBoundingBox();
    const bb = grp.children[0].geometry.boundingBox; bb.getCenter(_v0);
    const cx = _v0.x, cy = _v0.y, cz = _v0.z;
    for (const m of grp.children) m.geometry.translate(-cx, -cy, -cz);
    ud.chassis.localToWorld(_v0.set(cx, cy, cz));
    grp.position.copy(_v0);
    grp.quaternion.setFromRotationMatrix(ud.chassis.matrixWorld);
    const mgr = this.game.vehicles;
    if (mgr && mgr.addPart) mgr.addPart(grp, this.vx * 0.7 + vx, vy, this.vz * 0.7 + vz, (this.groundY || 0) + 0.04, fire);
    return true;
  }
  // patlamada tekerlek de fırlayabilir (yanan lastik)
  detachWheel(i, vx, vy, vz) {
    const ud = this.mesh.userData, w = ud.wheels[i];
    if (!w || w.gone) return;
    w.gone = true; this.mesh.updateMatrixWorld();
    w.piv.getWorldPosition(_v0);
    w.piv.visible = false;
    const m = new THREE.Mesh(this.T.wheelGeo, burntMat);
    const grp = new THREE.Group(); grp.add(m); grp.position.copy(_v0); grp.rotation.y = this.heading;
    if (this.game.vehicles.addPart) this.game.vehicles.addPart(grp, vx, vy, vz, (this.groundY || 0) + this.T.wheelR, 18);
  }

  // Yerel noktada göçük (köşe ötelemesi)
  dent(lx, ly, lz, nx, nz, depth) {
    if (this.kind !== 'car' || depth < 0.01) return;
    const g = this.ownGeo('paint'); if (!g) return;
    const p = g.attributes.position;
    const R = 0.9, d = Math.min(depth, 0.18);
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i) - lx, dy = p.getY(i) - ly, dz = p.getZ(i) - lz;
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd > R * R) continue;
      const k = (1 - Math.sqrt(dd) / R) ** 2 * d;
      p.setX(i, p.getX(i) + nx * k); p.setZ(i, p.getZ(i) + nz * k); p.setY(i, p.getY(i) - k * 0.25);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    this.dented = true;
    if (lz > this.def.len * 0.35 && depth > 0.06) this.headOK = Math.max(0, this.headOK - 0.5);
  }
  // dünya darbe noktası → yerel göçük + kopan parçalar + cam + süspansiyon sarsıntısı
  impact(wx, wz, nx, nz, speed) {
    const f = this.fwd;
    const dx = wx - this.pos.x, dz = wz - this.pos.z;
    const lx = dx * f.z - dz * f.x, lz = dx * f.x + dz * f.z;
    const nlx = nx * f.z - nz * f.x, nlz = nx * f.x + nz * f.z;
    this.dent(lx, this.def.hei * 0.45, lz, nlx, nlz, speed * 0.012);
    const S = this.susp; S.pv += rnd(speed * 0.012); S.rv += rnd(speed * 0.016); S.hv += speed * 0.01;
    if (this.kind !== 'car' || speed < 6) return;
    const L2 = this.def.len / 2, front = lz > L2 * 0.5, rear = lz < -L2 * 0.5;
    const side = lx > 0 ? 'L' : 'R';
    const pv = (k) => [-nx * k + rnd(1.5), 1.5 + Math.random() * k * 0.25, -nz * k + rnd(1.5)];
    if (front && speed > 9 && Math.random() < 0.35 + speed / 40) this.detach('bumperF', ...pv(speed * 0.25));
    if (front && speed > 15 && Math.random() < 0.5) this.detach('hood', ...pv(speed * 0.2));
    if (rear && speed > 9 && Math.random() < 0.35 + speed / 40) this.detach('bumperR', ...pv(speed * 0.25));
    if (!front && !rear && speed > 12 && Math.random() < 0.4) this.detach(`door${side}${lz > -0.1 ? 0 : 1}`, ...pv(speed * 0.2));
    if (!front && !rear && speed > 6 && Math.random() < 0.5) this.detach('mirror' + side, ...pv(speed * 0.2));
    // en yakın cam
    let best = -1, bd = 1e9;
    for (let i = 0; i < this.windows.length; i++) { const c = this.windows[i].p.c; const d = (c[0] - lx) ** 2 + (c[2] - lz) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best >= 0 && bd < 2.5) this.paneHit(best, speed > 16 ? 99 : speed > 10 ? 2 : 1);
    const a = this.game.audio || audio;
    if (speed > 10 && a.crashMetal) a.crashMetal(wx, wz, Math.min(1.5, speed / 18));
  }

  explode() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.wreckT = 40;
    const g = this.game;
    const big = this.kind === 'air' ? 1.7 : (this.def.mass || 0) > 8000 ? 1.3 : 1;
    g.combat.explosion(this.pos.x, this.pos.y + 0.5, this.pos.z, 7 * big, 140 * big, this.lastAttacker, this);
    if (big > 1.5) g.particles.explosion({ x: this.pos.x, y: this.pos.y + 2, z: this.pos.z }, 1.4);
    for (let i = 0; i < this.windows.length; i++) this.setPane(i, 3);
    this.mesh.traverse((o) => { if (o.isMesh && o.material !== wheelMat && o.material !== chromeMat) o.material = burntMat; });
    this.mesh.userData.pool.visible = false;
    // havaya fırlama + takla (kütleye göre)
    const mass = this.def.mass || 1400 * this.def.len * this.def.wid / 8;
    const k = clamp(2400 / mass, 0.15, 1.2);
    this.vx = this.vx * 0.4 + rnd(3 * k); this.vz = this.vz * 0.4 + rnd(3 * k);
    this.vy = 4 + 7 * k + Math.random() * 3 * k;
    if (this.kind === 'car' && !(this.P.steer === 0)) {
      this.flip = { x: this.roadPitch || 0, z: 0 };
      this.flipV = { x: rnd(2.2 * k), z: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 3.5) * k };
    }
    this.wreckTilt = rnd(0.15);
    // parçalar savrulur
    if (this.T && this.T.tags) {
      const tags = new Set(); for (const kind of ['paint', 'dark', 'chrome']) for (const r of this.T.tags[kind]) tags.add(r.tag);
      for (const t of tags) if (Math.random() < 0.8) this.detach(t, rnd(7 * k + 2), 5 + Math.random() * 9 * k, rnd(7 * k + 2), t === 'hood' ? 6 : 0);
    }
    const ud = this.mesh.userData;
    if (!ud.moto && ud.wheels.length <= 6) for (let i = 0; i < ud.wheels.length; i++) if (Math.random() < 0.25) this.detachWheel(i, rnd(8), 6 + Math.random() * 6, rnd(8));
    // ikincil: yakıt deposu, lastik yangınları
    this.fuelT = 0.5 + Math.random() * 0.9;
    this.tireFires = ud.wheels.map((w) => ({ w, t: 1 + Math.random() * 6, dur: 12 + Math.random() * 14 }));
    if (this.driver) {
      const d = this.driver;
      g.vehicles.ejectDriver(this);
      if (d.takeDamage) d.takeDamage(500, this.lastAttacker, 'explosion');
    }
    for (const a of this.passengers.slice()) { this.removePassenger(a); if (a.takeDamage) a.takeDamage(500, this.lastAttacker, 'explosion'); }
  }

  // ortak: yangın/duman/enkaz
  updateFire(dt) {
    const g = this.game, f = this.fwd, L = this.def.len;
    if (this.burnT > 0 && !this.destroyed) {
      this.burnT -= dt;
      // alev motor bölmesinden başlar, fitil kısaldıkça büyür; kara duman eşlik eder
      const k = this.burnT0 ? clamp(1 - this.burnT / this.burnT0, 0, 1) : 1;
      if (Math.random() < 0.45 + k * 0.55) g.particles.fire({ x: this.pos.x + f.x * L * 0.35, y: this.pos.y + this.def.hei * 0.6, z: this.pos.z + f.z * L * 0.35 }, 0.45 + k * 0.9);
      if (Math.random() < 0.35) g.particles.smoke({ x: this.pos.x + f.x * L * 0.3, y: this.pos.y + this.def.hei * 0.9, z: this.pos.z + f.z * L * 0.3 }, 1.1 + k * 0.6);
      if (this.burnT <= 0) this.explode();
    } else if (!this.destroyed && this.hp < this.def.hp * 0.6) {
      // duman kademeleri: %60 açık gri buhar, %35 koyu duman, 0'da (motor ölü) yoğun kara duman — alev yok
      const H = this.def.hp, dead = this.hp <= 0, heavy = this.hp < H * 0.35;
      if (Math.random() < (dead ? 0.6 : heavy ? 0.35 : 0.12)) {
        const p = { x: this.pos.x + f.x * L * 0.4, y: this.pos.y + this.def.hei * 0.7, z: this.pos.z + f.z * L * 0.4 };
        g.particles.smoke(p, dead ? 1.3 : heavy ? 0.9 : 0.5);
      }
    }
    if (!this.destroyed) return;
    this.wreckT -= dt;
    const gy = this.groundY || 0;
    // yanan enkaz: önce büyük alev, sonra kara duman sütunu
    if (this.wreckT > 22) { if (Math.random() < 0.7) g.particles.fire({ x: this.pos.x + rnd(L * 0.3) * f.x, y: this.pos.y + 0.6 + (this.flipLift || 0), z: this.pos.z + rnd(L * 0.3) * f.z }, 1.3); }
    else if (this.wreckT > 0 && Math.random() < 0.35) g.particles.smoke({ x: this.pos.x, y: this.pos.y + 1.2, z: this.pos.z }, 1.4);
    if (this.fuelT > 0) {
      this.fuelT -= dt;
      if (this.fuelT <= 0) {
        g.particles.explosion({ x: this.pos.x - f.x * L * 0.3, y: this.pos.y + 0.8, z: this.pos.z - f.z * L * 0.3 }, 0.55);
        (g.audio || audio).explosion(this.pos.x, this.pos.z, 0.5);
        g.cameraShake && g.cameraShake(0.25);
        if (this.flip) { this.vy = Math.max(this.vy, 3); this.flipV.x += rnd(1); }
      }
    }
    if (this.tireFires && this.wreckT > 0) {
      for (const tf of this.tireFires) {
        if (tf.w.gone) continue;
        tf.t -= dt;
        if (tf.t < 0 && tf.t > -tf.dur && Math.random() < 0.45) { tf.w.piv.getWorldPosition(_v0); _v0.y += 0.1; g.particles.fire(_v0, 0.55); }
      }
    }
    // uçuş + takla, iniş sekmesi, dengeli duruşa yerleşme
    if (this.kind !== 'car') { /* tekne/uçak kendi düşüşünü yönetir */ } else if (this.vy || this.pos.y > gy + 0.01) {
      this.vy -= 20 * dt; this.pos.y += this.vy * dt;
      if (this.flip) { this.flip.x += this.flipV.x * dt; this.flip.z += this.flipV.z * dt; }
      if (this.pos.y <= gy) {
        this.pos.y = gy;
        if (this.vy < -4) {
          this.vy = -this.vy * 0.28; this.vx *= 0.6; this.vz *= 0.6;
          if (this.flip) { this.flipV.x *= 0.5; this.flipV.z *= 0.55; }
          (g.audio || audio).crash(this.pos.x, this.pos.z, 0.8);
          g.particles.sparks({ x: this.pos.x, y: gy + 0.3, z: this.pos.z }, 10);
          g.particles.dust({ x: this.pos.x, y: gy + 0.1, z: this.pos.z });
        } else this.vy = 0;
      }
    } else if (this.flip) {
      const tz = Math.round(this.flip.z / Math.PI) * Math.PI, tx = Math.round(this.flip.x / Math.PI) * Math.PI;
      this.flip.z += (tz - this.flip.z) * Math.min(1, dt * 4); this.flip.x += (tx - this.flip.x) * Math.min(1, dt * 4);
      this.vx *= Math.exp(-3 * dt); this.vz *= Math.exp(-3 * dt);
    }
    if (this.flip) {
      // yere gömülmesin: dönmüş kutunun en alt köşesi
      const W2 = this.def.wid / 2, L2 = this.def.len / 2, H = this.def.hei;
      const cx = Math.cos(this.flip.x), sx = Math.sin(this.flip.x), cz = Math.cos(this.flip.z), sz = Math.sin(this.flip.z);
      let mn = 0;
      for (const x of [-W2, W2]) for (const y of [0, H * 0.85]) for (const z of [-L2, L2]) mn = Math.min(mn, (x * sz + y * cz) * cx - z * sx);
      this.flipLift = -mn;
    }
  }

  // ---- yolcu API'si (hikâye mühendisi) ----
  // addPassenger(actor[, seatIndex]) → koltuk no (-1 yer yok). Oyuncu sürücü koltuğunda (0), yolcular 1.. koltuklarda.
  addPassenger(actor, idx) {
    if (!actor || actor.passengerOf === this) return actor ? actor.seatIndex : -1;
    let i = idx;
    if (i === undefined || !this.seats[i] || this.seats[i].actor || this.seats[i].driver) i = this.seats.findIndex((s) => !s.driver && !s.actor);
    if (i < 0) return -1;
    if (actor.passengerOf) actor.passengerOf.removePassenger(actor);
    this.seats[i].actor = actor;
    actor.passengerOf = this; actor.seatIndex = i; actor.sitting = true;
    actor.speed = 0; actor.vx = 0; actor.vz = 0;
    this.passengers.push(actor);
    this.placePassengers();
    return i;
  }
  removePassenger(actor) {
    const i = this.passengers.indexOf(actor);
    if (i < 0) return false;
    this.passengers.splice(i, 1);
    const s = this.seats[actor.seatIndex]; if (s) s.actor = null;
    actor.passengerOf = null; actor.sitting = false;
    const f = this.fwd, side = s && s.x < 0 ? -1 : 1, off = this.def.wid / 2 + 0.6;
    // sol (+x) koltuk sola, sağ koltuk sağa iner
    actor.pos.set(this.pos.x + f.z * off * side + f.x * (s ? s.z : 0), Math.max(0, this.pos.y), this.pos.z - f.x * off * side + f.z * (s ? s.z : 0));
    if (this.game.physics) this.game.physics.resolveCircle(actor.pos, 0.35, actor.pos.y);
    if (actor.model && actor.model.root) { actor.model.root.visible = true; actor.model.root.position.copy(actor.pos); }
    return true;
  }
  placePassengers() {
    if (!this.passengers.length) return;
    const ch = this.mesh.userData.chassis;
    this.mesh.updateMatrixWorld();
    for (const a of this.passengers) {
      const s = this.seats[a.seatIndex];
      _v0.set(s.x, s.y, s.z); ch.localToWorld(_v0);
      a.pos.set(_v0.x, _v0.y - this.seatHipOffset, _v0.z);
      a.heading = this.heading; a.speed = 0; a.sitting = true;
      if (a.model && a.model.root) { a.model.root.position.copy(a.pos); a.model.root.rotation.y = this.heading; a.model.root.visible = !this.mesh.userData.moto || true; }
    }
  }

  // oyuncu girişi (player.updateDriving her kare çağırır): korna türü, siren, araç silahları
  readInput(input) {
    const a = this.game.audio || audio;
    a.hornKind = this.P.horn || (this.def.len > 6 ? 'truck' : 'car');
    if (this.def.siren && input.hit && input.hit('KeyN') && this.type !== 'police' && this.type !== 'swat') this.sirenOn = !this.sirenOn;
  }

  // Kurb (kaldırım) yüksekliği: fizik ızgarasındaki 'curb' kutuları
  curbAt(x, z) {
    const ph = this.game.physics;
    if (!ph || !ph.active || ph.interiorMode) return 0;
    const L = ph.active.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05, _q);
    for (let i = 0; i < L.length; i++) { const b = L[i]; if (b.tag === 'curb' && b.y1 < 0.4 && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b.y1; }
    return 0;
  }

  // Süspansiyon: tekerlekler yolu izler (kaldırımdan çıkar/iner), kasa yay-sönüm ile yükseklik/burun/yalpa
  updateSuspension(dt, near, showStruts) {
    const ud = this.mesh.userData, T = this.T, S = this.susp;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let hF = 0, hR = 0, hL = 0, hRt = 0, nF = 0, nR = 0, nL = 0, nRt = 0;
    for (const w of ud.wheels) {
      let h = 0;
      if (near) {
        const wx = this.pos.x + fz * w.x + fx * w.z, wz = this.pos.z - fx * w.x + fz * w.z;
        h = this.curbAt(wx, wz);
        if (this.P.offroad && this.surface === 'grass') h += Math.sin(wx * 2.3 + wz * 1.7) * 0.02;
      }
      w.lift += (h - w.lift) * Math.min(1, dt * 22);
      w.piv.position.y = w.y0 + w.lift;
      if (w.z > 0) { hF += w.lift; nF++; } else { hR += w.lift; nR++; }
      if (w.x > 0) { hL += w.lift; nL++; } else { hRt += w.lift; nRt++; }
    }
    hF /= nF || 1; hR /= nR || 1; hL /= nL || 1; hRt /= nRt || 1;
    const wb = (T && T.wheelbase) || this.def.len * 0.6, tr = (T && T.track) || this.def.wid * 0.8;
    const heave = (hF + hR) / 2, pT = this.pitch - (hF - hR) / wb, rT = this.roll + (hL - hRt) / tr;
    const fr = 1.7 / Math.sqrt(this.P.soft || 1), k = (Math.PI * 2 * fr) ** 2, c = 2 * 0.3 * Math.sqrt(k);
    const n = dt > 0.02 ? 2 : 1, h = dt / n;
    for (let i = 0; i < n; i++) {
      S.hv += (k * (heave - S.h) - c * S.hv) * h; S.h += S.hv * h;
      S.pv += (k * (pT - S.p) - c * S.pv) * h; S.p += S.pv * h;
      S.rv += (k * (rT - S.r) - c * S.rv) * h; S.r += S.rv * h;
    }
    const tv = (T && T.travel) || 0.1;
    S.h = clamp(S.h, -tv, tv + 0.2); S.p = clamp(S.p, -0.12, 0.12); S.r = clamp(S.r, -0.14, 0.14);
    const ch = ud.chassis;
    ch.position.y = S.h - Math.abs(S.p) * 0.25;
    ch.rotation.x = S.p; ch.rotation.z = S.r;
    if (T && T.strut) {
      const up = T.strut.up;
      for (const w of ud.wheels) {
        if (!w.strut) continue;
        w.strut.visible = showStruts;
        if (!showStruts) continue;
        const mount = ch.position.y + w.y0 + up - w.z * S.p + w.x * S.r;
        w.strut.scale.y = Math.max(0.08, mount - (w.y0 + w.lift));
      }
    }
  }

  update(dt) {
    const g = this.game;
    const phys = g.physics;
    const def = this.def, P = this.P, ud = this.mesh.userData;
    this.updateFire(dt);

    const c = this.controls;
    const canDrive = !this.destroyed && this.sinking <= 0 && (this.driver || this.ai);
    // [B1] motor ölü (hp <= 0, yalnız kara aracı): gaz yok, fren/direksiyon çalışır
    const engineDead = this.kind === 'car' && this.hp <= 0;
    const throttle = canDrive ? (engineDead ? Math.min(0, c.throttle) : c.throttle) : 0;
    const steer = canDrive ? c.steer : 0;
    const hb = canDrive ? c.handbrake : !this.destroyed && !this.driver;
    const isPlayer = !!(this.driver && this.driver.isPlayer);
    const camD = g.camera ? Math.hypot(g.camera.position.x - this.pos.x, g.camera.position.z - this.pos.z) : 0;

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let fs = this.vx * fx + this.vz * fz;
    let ls = this.vx * rx + this.vz * rz;
    const fs0 = fs;
    const max = def.maxSpeed * (g.state && isPlayer && g.state.carUpgrade ? 1.15 : 1) * (this.hp < def.hp * 0.25 ? 0.75 : 1);
    // zemin türü (oyuncu): çim/toprakta tutunma düşer, çakıl sesi
    if (isPlayer) {
      this.surfT = (this.surfT || 0) - dt;
      if (this.surfT <= 0) { this.surfT = 0.3; this.surface = g.combat && g.combat.surfaceAt && this.pos.y < 1 ? g.combat.surfaceAt(this.pos.x, this.pos.z) : 'concrete'; }
    } else this.surface = 'concrete';
    const offRoad = this.surface === 'grass' || this.surface === 'dirt';
    // vites ve devir
    const nG = P.gears, sp = Math.abs(fs);
    const top = (i) => max * Math.pow((i + 1) / nG, 0.8);
    if (this.shiftT > 0) this.shiftT -= dt;
    const g0 = this.gear;
    if (fs < -0.5) this.gear = 0;
    else if (this.gear < nG - 1 && sp > top(this.gear) * 0.95) { this.gear++; this.shiftT = 0.2; }
    else if (this.gear > 0 && sp < top(this.gear - 1) * 0.7) this.gear--;
    if (isPlayer && this.gear !== g0 && P.snd !== 'bike') {
      const a = g.audio || audio;
      if (a.gearShift) a.gearShift(this.gear > g0, P.snd);
      if (this.gear > g0 && P.turbo && a.turbo && throttle > 0.5 && this.rpm > 0.7) a.turbo(0.8);
      // [B1] vites küçültmede devir eşleme gazı (blip): devir anında yükselir
      if (this.gear < g0 && fs > 3) this.rpm = Math.min(1.05, this.rpm + 0.22);
    }
    const lo = this.gear > 0 ? top(this.gear - 1) * 0.55 : 0, hi = top(this.gear);
    let rpmT = 0.18 + 0.82 * clamp((sp - lo) / (hi - lo), 0, 1);
    if (throttle > 0 && sp < 2) rpmT = Math.max(rpmT, 0.45 + 0.35 * throttle);
    if (this.shiftT > 0) rpmT *= 0.72;
    if (isPlayer && this._thrPrev > 0.6 && throttle <= 0 && this.rpm > 0.65) {
      const a = g.audio || audio;
      if (P.turbo && a.turbo) a.turbo(0.6); // turbo boşaltma "pışşt"
      // [B1] egzoz patlamaları: spor/V8/motosiklet sınıfı gaz kesince
      if ((P.snd === 'sport' || P.snd === 'v8' || P.snd === 'moto') && a.exhaustPops && Math.random() < 0.8) a.exhaustPops(P.snd, Math.min(1, this.rpm));
    }
    // [B1] devir sınırlayıcı: vites sonunda tam gazda devir titrer (son vites hariç)
    if (throttle > 0.8 && this.gear === nG - 1 && sp > max * 0.97) rpmT = Math.min(rpmT, 0.97);
    else if (throttle > 0.8 && this.rpm > 0.96 && this.shiftT <= 0) rpmT = 0.9 + 0.08 * ((this._lim = !this._lim) ? 1 : 0);
    this._thrPrev = throttle;
    this.rpm += (rpmT - this.rpm) * Math.min(1, dt * (this.shiftT > 0 ? 18 : 8));
    // ===== [B1 sürüş hissi] boylamsal: vites/devir tork eğrisi, çekiş sınırı, kademeli fren, ağırlık aktarımı =====
    const terrain = offRoad && !P.offroad ? 0.8 : 1;
    const heavy = def.len > 6 || (def.mass || 0) > 6000;
    const wet = g.env && g.env.rainAmount ? 1 - g.env.rainAmount * 0.18 : 1;
    const muGrip = P.grip * wet * (offRoad ? (P.offroad ? 0.92 : 0.78) : 1);
    const muRoad = muGrip * 0.8; // yanal: binek ~1.05 g, spor ~1.35 g
    // fren basıncı ~0.1 sn'de oluşur (ani duvar etkisi yok); ABS'li ~1.1 g, ağır araç daha zayıf
    const brakeWant = throttle < 0 && fs > 0.5 ? -throttle : 0;
    this.brakeP = (this.brakeP || 0) + (brakeWant - (this.brakeP || 0)) * Math.min(1, dt * (brakeWant > (this.brakeP || 0) ? 10 : 16));
    this.brakeDecel = Math.min(muGrip * 0.85, heavy ? 7 : 10.5);
    if (throttle > 0) {
      if (fs < -0.5) fs += this.brakeDecel * throttle * dt; // geri giderken ileri gaz = fren
      else {
        // vites çarpanı (1. vites güçlü, son vites zayıf) x devir tork eğrisi (orta devirde tepe) x hava direnci
        const gm = 1.3 - 0.6 * (this.gear / Math.max(1, nG - 1));
        const tq = 0.72 + 0.4 * Math.sin(Math.PI * clamp(this.rpm, 0.15, 1));
        let a = def.accel * 0.5 * gm * tq * terrain * throttle * Math.max(0, 1 - (fs / max) ** 2);
        if (this.shiftT > 0) a *= 0.08; // vites geçişinde gaz kesilir (duyulur ve hissedilir)
        a = Math.min(a, muGrip * (P.rwd ? 0.8 : 0.72)); // çekiş sınırı (patinaj)
        fs += a * dt;
      }
    } else if (throttle < 0) {
      if (fs > 0.5) fs -= Math.min(fs, (this.brakeDecel + Math.min(1.5, sp * 0.04)) * this.brakeP * dt);
      else if (fs > -max * 0.3) fs += def.accel * 0.35 * throttle * dt;
    } else fs -= Math.sign(fs) * Math.min(Math.abs(fs), (0.7 + sp * 0.012 + (offRoad ? 1.5 : 0)) * dt); // motor freni + yuvarlanma
    if (throttle >= 0) this.brakeP *= Math.exp(-dt * 16);
    // el freni: arka tekerlekler kilitlenir -> ~0.45 g yavaşlama (eskiden aracı olduğu yerde durduruyordu)
    if (hb) fs -= Math.sign(fs) * Math.min(Math.abs(fs), (canDrive ? 3.2 : 7.5) * dt);
    fs -= fs * Math.abs(fs) * 0.0008 * dt;
    // ağırlık aktarımı (yumuşatılmış boylamsal ivme, g): fren -> ön lastik yükü artar (dönüşe girer), gaz -> arka
    const lAcc = clamp((fs - fs0) / Math.max(dt, 1e-3) / 9.81, -1.2, 1.2);
    this.lt = (this.lt || 0) + (lAcc - (this.lt || 0)) * Math.min(1, dt * 8);
    const front = clamp(1 - 0.28 * this.lt, 0.75, 1.3), rear = clamp(1 + 0.18 * this.lt, 0.8, 1.2);
    // el freni sonrası tutunma kademeli döner (ani "yapışma" ile savrulma yok)
    this.hbRec = hb && sp > 3 ? 0 : Math.min(1, (this.hbRec ?? 1) + dt * 2.2);
    // yanal tutunma eğrisi: tepe kaymaya kadar tam, kayarken ~%82 (kontrol edilebilir kayma)
    const slipPk = 1.4 + sp * 0.035, als = Math.abs(ls);
    const curve = als <= slipPk ? 1 : 0.82 + 0.18 * Math.exp(-(als - slipPk) / 2.5);
    let mu = muRoad * curve * (hb && sp > 3 ? 0.32 : 0.32 + 0.68 * this.hbRec) * rear;
    if (P.rwd && throttle > 0.5 && this.gear <= 1 && als > 2) mu *= 0.8; // güçlü arkadan itiş: gazla kuyruk kayar
    const dls = clamp(-ls * P.cs * dt, -mu * dt, mu * dt);
    ls += dls;
    // direksiyon: hıza göre kilit açısı ve yumuşatma (düşük hızda nazik, yüksek hızda sakin), merkeze dönüş hızlı
    let wT;
    if (P.steer === 0) {
      // palet: yerinde dönebilir
      this.steerAng = steer;
      wT = steer * 0.8 * (fs < -0.3 ? -1 : 1) / (1 + sp / 25);
    } else {
      const steerMax = P.steer / (1 + (fs * fs) / 520);
      const tgtA = steer * steerMax;
      const engaging = Math.abs(tgtA) > Math.abs(this.steerAng) && Math.sign(tgtA || 1) === Math.sign(this.steerAng || tgtA || 1);
      const tau = engaging ? 0.13 + sp * 0.006 : 0.07;
      this.steerAng += (tgtA - this.steerAng) * Math.min(1, dt / tau);
      const wb = this.T ? this.T.wheelbase || def.len * 0.6 : def.len * 0.6;
      wT = (fs * Math.tan(this.steerAng)) / wb;
      // ön lastik sınırı: frende daha keskin, gazda hafif önden kayma
      const wMax = (muRoad * curve * front * 1.05) / Math.max(3, sp);
      if (!hb || sp < 3) wT = clamp(wT, -wMax, wMax);
      else {
        // el freni kayması: kuyruk dışa açılır, direksiyon yönünde dönüş artar (sınırlı)
        // kayma açısı ~40°'yi aşınca dönüş kendini sınırlar (tam tur atıp durmak yerine tutulabilir drift)
        const slipA = Math.atan2(als, Math.max(1, Math.abs(fs)));
        wT = clamp(wT * 1.3 + Math.sign(this.steerAng) * Math.min(0.5, sp * 0.025), -1.6, 1.6) * clamp(1 - (slipA - 0.45) / 0.3, 0, 1);
      }
    }
    // yaw tepkisi: düşük hızda çevik, yüksek hızda sönümlü (savrulmaz)
    const yk = hb ? 5 : clamp(10 - sp * 0.15, 4.5, 10);
    this.yawRate += (wT - this.yawRate) * Math.min(1, dt * yk);
    // [çarpışma] darbe kaynaklı ek açısal hız (vehicle_physics.js), lastik sürtünmesiyle söner
    const spin = this.spin || 0;
    this.heading += (this.yawRate + spin) * dt;
    if (spin) { this.spin = spin * Math.exp(-dt * (hb || this.destroyed ? 1.4 : 2.6)); if (Math.abs(this.spin) < 0.005) this.spin = 0; }
    this.vx = fx * fs + rx * ls;
    this.vz = fz * fs + rz * ls;
    this.fs = fs; this.ls = ls;
    // ağırlık transferi: fren → burun dalar, viraj → gövde dışa yatar (yay-sönüm hedefi)
    const longAcc = (fs - fs0) / Math.max(dt, 1e-3), latAcc = fs * this.yawRate;
    const soft = P.soft;
    this.pitch += (clamp(-longAcc * 0.0045 * soft, -0.07, 0.07) - this.pitch) * Math.min(1, dt * 6);
    this.roll += (clamp(latAcc * 0.007 * soft, -0.08, 0.08) - this.roll) * Math.min(1, dt * 6);
    const ch = ud.chassis;
    if (ud.moto) {
      const want = this.driver || (this.ai && !this.ai.empty) ? clamp(-Math.atan(latAcc / 9.81), -0.75, 0.75) : (P.snd === 'bike' ? 0.0 : 0.12);
      this.lean += (want - this.lean) * Math.min(1, dt * 6);
      ch.rotation.x = this.pitch * 0.5;
    } else if (!this.destroyed) {
      if (P.steer === 0) { ch.rotation.x = this.pitch * 0.6; ch.rotation.z = this.roll * 0.4; ch.position.y = 0; }
      else this.updateSuspension(dt, isPlayer || camD < 50, camD < 22);
    } else { ch.rotation.z = this.wreckTilt || 0; ch.position.y = -0.12; }
    // kayma, lastik sesi ve izleri
    let slip = clamp((Math.abs(ls) - 2.2) / 5, 0, 1);
    if (hb && sp > 4) slip = Math.max(slip, 0.5);
    if (throttle > 0.6 && sp < 6 && def.accel >= 12 && fs > -0.5) slip = Math.max(slip, 0.45);
    if (throttle < 0 && fs > 12) slip = Math.max(slip, 0.3);
    if (P.steer === 0 || this.pos.y > 0.5 + (this.groundY || 0) || P.snd === 'bike') slip = 0;
    if (isPlayer) { const a = g.audio || audio; if (a.skid) a.skid(slip, this.surface, sp); else if (a.screech) a.screech(slip); }
    if (slip > 0.25 && canDrive) {
      this.skidT -= dt;
      if (this.skidT <= 0 && g.vehicles && g.vehicles.skids && !offRoad) {
        this.skidT = 0.05;
        const half = def.len * 0.3, wx = def.wid * 0.4, len = Math.max(0.4, sp * 0.06);
        const bx2 = this.pos.x - fx * half, bz = this.pos.z - fz * half;
        g.vehicles.skids.add(bx2 + rx * wx, bz + rz * wx, Math.atan2(this.vx, this.vz), len);
        if (!ud.moto) g.vehicles.skids.add(bx2 - rx * wx, bz - rz * wx, Math.atan2(this.vx, this.vz), len);
      }
      if (Math.random() < slip * (offRoad ? 1 : 0.6)) g.particles.dust({ x: this.pos.x - fx * def.len * 0.4, y: 0.1 + (this.groundY || 0), z: this.pos.z - fz * def.len * 0.4 });
    } else if (offRoad && sp > 6 && Math.random() < 0.3) g.particles.dust({ x: this.pos.x - fx * def.len * 0.45, y: 0.1, z: this.pos.z - fz * def.len * 0.45 });

    // konum + statik çarpışma (alt adımlı OBB çözücü)
    integrateVehicle(this, dt, phys, isPlayer);
    // köprü tabliyesi: yükseklik ve eğim (Boğaz köprüsü ~20 m, Galata 4.2 m)
    if (this.kind === 'car' && !this.sinking && !this.vy && !(this.destroyed && this.pos.y > (this.groundY || 0) + 0.01)) {
      const by = phys.interiorMode ? null : bridgeHeightAt(this.pos.x, this.pos.z);
      this.groundY = by === null ? 0 : by;
      this.pos.y = this.groundY;
      if (by !== null) {
        const sl = bridgeSlopeAt(this.pos.x, this.pos.z, this._slope || (this._slope = { x: 0, z: 0 }));
        this.roadPitch = -Math.atan(sl.x * Math.sin(this.heading) + sl.z * Math.cos(this.heading));
      } else this.roadPitch = 0;
    }
    // suya düşme
    if (phys.inWater(this.pos.x, this.pos.z) && this.pos.y < 2) {
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
    // taret (tank/zırhlı) ve atış
    if (ud.turret) this.updateTurret(dt, isPlayer);
    // tekerlekler
    const spinA = (fs * dt) / ud.wheelR;
    for (const w of ud.wheels) {
      w.spin.rotation.x += spinA * w.sign;
      if (w.front) w.piv.rotation.y = this.steerAng;
    }
    if (P.steer === 0) for (const w of ud.wheels) w.spin.rotation.x += (this.yawRate * 1.6 * dt / ud.wheelR) * (w.piv.position.x > 0 ? -1 : 1) * w.sign;
    if (this.T && this.T.animate) this.T.animate(this, dt);
    this.updateLights(dt, throttle, hb, isPlayer);
    // motor sesi (vites hissi + sınıfa özgü ses)
    if (isPlayer) {
      const r = this.rpm * P.rev;
      const o = this._snd || (this._snd = { kind: 'car', gear: 0, throttle: 0, speed: 0, surface: 'concrete', slip: 0 });
      // [B1] vites geçişinde gaz kesik: yük düşer (motor sesi kısa süre boşa çıkar)
      o.kind = P.snd || 'car'; o.gear = this.gear; o.throttle = this.shiftT > 0 ? 0 : Math.max(0, throttle); o.speed = sp; o.surface = this.surface; o.slip = slip; o.rpm01 = this.rpm;
      if (g.audio && g.audio.setEngine) g.audio.setEngine(!this.destroyed && this.sinking <= 0 && !engineDead, 0.15 + r * 1.05, 0.09 + Math.abs(throttle) * 0.04 + this.rpm * 0.05, undefined, o);
    }
    ud.driverDummy.visible = !!(this.driver && !this.driver.isPlayer) || !!(this.ai && !this.ai.empty) || isPlayer;
    this._ray = null;
    this.sync();
    if (this.passengers.length) this.placePassengers();
  }

  // [çarpışma] eski API: tek adımlık statik çözüm (vehicle_physics.js)
  collideStatic(phys, isPlayer) { integrateVehicle(this, 0, phys, isPlayer); }

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

  // Taret: kamera yönüne döner. Tank: sol tık top (anlık mermi + iz + patlama). Zırhlı: sol tık basılı makineli.
  updateTurret(dt, isPlayer) {
    const g = this.game, ud = this.mesh.userData, T = this.T;
    const wpn = (T && T.weapon) || { kind: 'cannon', muzzle: 6.2, height: 1.85, reload: 2.5, rot: 1.2, barrelZ: 1.25 };
    if (this.reloadT > 0) this.reloadT -= dt;
    this.recoil = Math.max(0, this.recoil - dt * (wpn.kind === 'mg' ? 8 : 1.5));
    ud.barrel.position.z = (wpn.barrelZ !== undefined ? wpn.barrelZ : 1.25) - this.recoil * (wpn.kind === 'mg' ? 0.06 : 0.6);
    if (!isPlayer) return;
    const pl = this.driver;
    const want = angleDiff(this.heading, pl.camYaw + Math.PI);
    const cur = ud.turret.rotation.y;
    ud.turret.rotation.y = cur + clamp(angleDiff(cur, want), -wpn.rot * dt, wpn.rot * dt);
    ud.barrel.rotation.x = clamp(-(pl.camPitch - 0.22) * 0.6, -0.3, 0.12);
    const inp = g.input;
    if (!inp || this.destroyed || inp.mouse.right) return;
    const fire = wpn.kind === 'mg' ? inp.mouse.left : inp.mouse.leftPressed;
    if (!fire || this.reloadT > 0) return;
    this.reloadT = wpn.reload; this.recoil = 1;
    const yaw = this.heading + ud.turret.rotation.y, pitch = -ud.barrel.rotation.x;
    const dx = Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
    const ox = this.pos.x + dx * wpn.muzzle, oy = this.pos.y + wpn.height + dy * wpn.muzzle, oz = this.pos.z + dz * wpn.muzzle;
    const o = _v0.set(ox, oy, oz);
    if (wpn.kind === 'mg') {
      const d = this._dir || (this._dir = new THREE.Vector3());
      d.set(dx + rnd(0.012), dy + rnd(0.008), dz + rnd(0.012)).normalize();
      const def = this._mgDef || (this._mgDef = { name: 'Ağır Makineli', type: 'rifle', range: 320, dmg: 38, sound: 'ak', flash: 2.2, shell: false });
      if (g.combat.muzzleFlash) g.combat.muzzleFlash(pl, o, d, def);
      g.combat.hitscan(pl, o, d, def, o);
      audio.gunshot('ak', ox, oz);
      g.cameraShake(0.05);
      return;
    }
    let t = 300;
    const hit = g.physics.raycast(ox, oy, oz, dx, dy, dz, t);
    if (hit) t = hit.t;
    if (g.combat.rayVehicles) { const vh = g.combat.rayVehicles({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }, t, this); if (vh) t = vh.t; }
    if (g.combat.rayActors) { const ah = g.combat.rayActors({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }, t, pl); if (ah) t = ah.t; }
    g.particles.explosion({ x: ox, y: oy - 0.5, z: oz }, 0.35);
    if (g.particles.backblast) g.particles.backblast({ x: ox - dx * 2, y: oy, z: oz - dz * 2 }, { x: -dx, y: 0, z: -dz });
    if (g.combat.addTracer) g.combat.addTracer(o.clone(), new THREE.Vector3(ox + dx * t, oy + dy * t, oz + dz * t), 0.09);
    audio.gunshot('rpg', ox, oz);
    if ((g.audio || audio).cannon) (g.audio || audio).cannon(ox, oz);
    g.cameraShake(0.5);
    g.combat.explosion(ox + dx * t, oy + dy * t, oz + dz * t, 6, 220, pl, this);
    this.vx -= dx * 2; this.vz -= dz * 2;
    this.susp.pv -= 0.3;
  }
}

// ======================================================================
// Trafik ve polis yöneticisi
// ======================================================================
const _sirens = [];
export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.spawnT = 0;
    this.skids = new SkidMarks(game.scene);
    this.debris = new Debris(game); // [çarpışma] kırılan eşyaların enkazı
    this.parts = []; // araçlardan kopan parçalar (tampon, kapı, kaput, tekerlek)
  }

  // Kopan parça: basit balistik + sekme + kıvılcım; fire > 0 ise yanar (lastik)
  addPart(obj, vx, vy, vz, rest, fire = 0) {
    if (this.parts.length >= 36) { const o = this.parts.shift(); this.group.remove(o.obj); }
    this.group.add(obj);
    this.parts.push({ obj, vx, vy, vz, wx: rnd(6), wy: rnd(4), wz: rnd(6), rest, fire, t: 0, still: false });
  }
  updateParts(dt) {
    const g = this.game;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i], o = p.obj;
      p.t += dt;
      if (p.fire > 0) { p.fire -= dt; if (Math.random() < 0.5) g.particles.fire(o.position, 0.45); }
      if (p.t > 70) { this.group.remove(o); this.parts.splice(i, 1); continue; }
      if (p.still) continue;
      p.vy -= 19 * dt;
      o.position.x += p.vx * dt; o.position.y += p.vy * dt; o.position.z += p.vz * dt;
      o.rotation.x += p.wx * dt; o.rotation.y += p.wy * dt; o.rotation.z += p.wz * dt;
      if (o.position.y < p.rest) {
        o.position.y = p.rest;
        const hs = Math.hypot(p.vx, p.vz);
        if (hs > 4 && Math.random() < 0.6) g.particles.sparks({ x: o.position.x, y: p.rest, z: o.position.z }, 3);
        if (p.vy < -3) { p.vy *= -0.3; if (p.t < 6) (g.audio || audio).impactMetal && (g.audio || audio).impactMetal(o.position.x, o.position.z); } else p.vy = 0;
        p.vx *= 0.55; p.vz *= 0.55; p.wx *= 0.5; p.wy *= 0.5; p.wz *= 0.5;
        // yassı dur: dönüşü en yakın yatay duruşa çek
        o.rotation.x += (Math.round(o.rotation.x / Math.PI) * Math.PI - o.rotation.x) * 0.3;
        o.rotation.z += (Math.round(o.rotation.z / Math.PI) * Math.PI - o.rotation.z) * 0.3;
        if (hs < 0.3 && Math.abs(p.vy) < 0.5) p.still = true;
      }
    }
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
    const outer = t === 'bus' || t === 'kamyon' || t === 'motor' || t === 'bisiklet' || Math.random() < 0.5;
    const lane = e.width >= 16 ? (outer ? 5.8 : 2.1) : 2.5;
    const x = s.x + -fz * lane, z = s.z + fx * lane;
    for (const v of this.list) if (Math.abs(v.pos.x - x) < 9 && Math.abs(v.pos.z - z) < 9) return null;
    const v = this.add(t, x, z, Math.atan2(fx, fz));
    v.ai = { mode: 'traffic', from, to, next: this.chooseNext(to, from), cruise: t === 'bisiklet' ? 5.5 : (t === 'bus' || t === 'kamyon') ? 9 : 10 + Math.random() * 5, outer, laneCur: lane };
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
    const t = r < 0.22 ? 'kartal' : r < 0.36 ? 'hatch' : r < 0.44 ? 'hatch3' : r < 0.53 ? 'sedan' : r < 0.6 ? 'estate' : r < 0.68 ? 'suv' : r < 0.73 ? 'offroad' : r < 0.78 ? 'coupe' : r < 0.82 ? 'cabrio' : r < 0.88 ? 'motor' : r < 0.91 ? 'bisiklet' : r < 0.95 ? 'gt' : 'taksi';
    // sağdan akan trafikte park: aracın sağ tarafı kaldırıma, yüzü trafik yönüne
    const hd = Math.atan2(fx, fz) + (side > 0 ? 0 : Math.PI);
    // [dünya] park yeri doğrulaması: bina/lamba/ağaç/eşya ile çakışan ya da kavşağa taşan yer reddedilir
    if (this.game.physics.city.overlapsRect(x, z, 1.05, 2.6, hd, 0.15) || this.game.city.parkSpotBad?.(x, z)) return null;
    const v = this.add(t, x, z, hd);
    v.parked = true; v.parkedAI = true;
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

  // [trafik YZ] traffic_ai.js
  driveAI(v, dt) { driveVehicleAI(this, v, dt); }

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
    this.sirens = _sirens;
    this.debris.update(dt);
    this.updateParts(dt);
    // [araç camı] mermi isabet noktası: combat.rayVehicles sonucunu araca not eder (combat.js değişmeden)
    if (!this._rayHook && g.combat && g.combat.rayVehicles) {
      this._rayHook = true;
      const orig = g.combat.rayVehicles.bind(g.combat);
      g.combat.rayVehicles = (o, d, m, ig) => { const r = orig(o, d, m, ig); if (r) r.vehicle._ray = { x: o.x + d.x * r.t, y: o.y + d.y * r.t, z: o.z + d.z * r.t, dx: d.x, dy: d.y, dz: d.z }; return r; };
    }
    this.parkTick(dt, px, pz, parkedCount);
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
      if (v.ai && !v.driver && !v.destroyed) {
        // [trafik YZ] uzak araçlar seyrek düşünür (zaman dilimleme); fizik her kare
        if (d > 150 && v.ai.mode === 'traffic') { v.aiAcc = (v.aiAcc || 0) + dt; if (v.aiAcc >= 0.2) { this.driveAI(v, v.aiAcc); v.aiAcc = 0; } }
        else this.driveAI(v, dt);
      }
      v.update(dt);
    }
    this.collideVehicles();
  }

  // [çarpışma] OBB araç-araç (vehicle_physics.js)
  collideVehicles() { collideAllVehicles(this); }

  // [trafik YZ] ara sıra bir trafik aracı kenara park eder, park etmiş biri trafiğe çıkar
  parkTick(dt, px, pz, parkedCount) {
    this.parkT = (this.parkT || 0) - dt;
    this.clock = (this.clock || 0) + dt;
    for (const v of this.list) if (v.bornAt === undefined) v.bornAt = this.clock;
    if (this.parkT > 0 || this.game.player.inInterior) return;
    this.parkT = 1;
    const L = this.list;
    if (!L.length) return;
    const v = L[Math.floor(Math.random() * L.length)];
    const d = Math.hypot(v.pos.x - px, v.pos.z - pz);
    if (d < 30 || d > 150) return;
    if (v.ai && v.ai.mode === 'traffic' && !v.ai.empty && parkedCount < 14 && Math.random() < 0.12) maybePark(this, v);
    else if (v.parked && v.parkedAI && d > 80 && v !== this.game.player.lastVehicle && this.clock - (v.bornAt ?? (v.bornAt = this.clock)) > 120 && Math.random() < 0.15) maybeUnpark(this, v);
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
  if (r < (night ? 0.36 : 0.24)) return 'taksi';
  const T = [[0.38, 'kartal'], [0.47, 'hatch'], [0.53, 'hatch3'], [0.6, 'sedan'], [0.64, 'estate'], [0.7, 'dolmus'], [0.74, 'suv'], [0.76, 'offroad'], [0.79, 'bus'], [0.83, 'motor'], [0.845, 'bisiklet'], [0.88, 'kamyon'], [0.9, 'gt'], [0.92, 'coupe'], [0.935, 'cabrio'], [0.955, 'ambulans'], [0.975, 'police'], [1, 'polsuv']];
  for (const [p, t] of T) if (r < p) return t;
  return 'kartal';
}

// [B1 performans] Açılış ısınması: her araç türünden bir model (şablon önbelleği dolar) + yanmış/çatlak cam
// malzemeleri. main.js yükleme ekranında sahneye ekler, gölgelendiricileri derler ve kaldırır. Böylece sürüş
// sırasında ilk kez görünen araç türü şablon kurma ve gölgelendirici derleme takılması yaratmaz.
export function vehicleWarmGroup(extraMats = []) {
  const grp = new THREE.Group();
  let i = 0;
  const put = (o) => { o.position.set((i % 8) * 6 - 21, 0, -12 - Math.floor(i / 8) * 7); i++; grp.add(o); };
  for (const type of Object.keys(CARS)) {
    try { put(buildCarModel(type)); } catch (e) { /* araç dışı tür (hava/deniz) kendi modülünde */ }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const m of [burntMat, crackedGlassMat(), ...extraMats]) put(new THREE.Mesh(box, m));
  return grp;
}
