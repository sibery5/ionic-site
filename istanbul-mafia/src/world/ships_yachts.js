// [deniz] Ayrıntılı prosedürel yat ve tekne modelleri (marinada bağlı, sürülebilir ve deniz trafiği yatları).
// Motoryat (16 m) ve mega yat (28 m): V tabanlı bayraklı gövde, sheer hattı, borda pencereleri, tik güverte
// (prosedürel tahta + kalafat dokusu), yüzme platformu, kıç kokpit oturma grubu, eğik ön camlı salon, flybridge
// (dümen konsolu, koltuklar, güneşlenme minderleri), radar kemeri + kubbe radar + açık dizi anten, paslanmaz
// korkuluk ve baş küpeşte (pulpit), ırgat ve çapa, seyir fenerleri, su altı ışıkları. Mega yatta üç kat, sarmal
// köprüüstü camı, sert tente (hardtop), jakuzi, tender botu ve can salı kapsülleri.
// Balıkçı teknesi (8 m): ahşap kaik gövdesi, kaptan köşkü, direk + bum, ağ yığını.
// Malzemeler PBR: jelkot (köşe renkli), tik, renkli cam (opak yansıtıcı), paslanmaz, ışık. LOD: 0 (≤110 m tam),
// 1 (>110 m tek birleşik ağ + ışıklar).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shipHull, vc, bare, B3, CY, rod } from './ships_hull.js';
import { lightize, makeLightsMat } from '../entities/vehicles.js';
import { makeCanvas } from '../core/textures.js';
import { RNG } from '../core/util.js';

// ---------------- malzemeler ----------------
let _teak = null;
function teakTexture() {
  if (_teak) return _teak;
  const W = 256, c = makeCanvas(W, W), g = c.getContext('2d'), r = new RNG(77);
  const n = 8, pw = W / n; // 8 tahta / metre (12.5 cm)
  for (let i = 0; i < n; i++) {
    const base = [176 + r.int(-14, 10), 122 + r.int(-12, 8), 74 + r.int(-10, 8)];
    g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(i * pw, 0, pw, W);
    // damar (boyuna)
    for (let k = 0; k < 18; k++) {
      const x = i * pw + r.float(2, pw - 2), a = r.float(0.04, 0.14);
      g.strokeStyle = `rgba(${r.chance(0.5) ? '90,55,25' : '210,160,110'},${a})`; g.lineWidth = r.float(0.6, 1.6);
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= W; y += 32) g.lineTo(x + Math.sin(y * 0.05 + k) * r.float(0.3, 1.4), y);
      g.stroke();
    }
    // uç birleşimi (her tahtada bir/iki)
    for (let k = 0; k < r.int(0, 2); k++) { const y = r.float(0, W); g.fillStyle = 'rgba(30,22,14,0.85)'; g.fillRect(i * pw, y, pw, 2); }
    // kalafat (siyah dolgu)
    g.fillStyle = '#1a140e'; g.fillRect(i * pw, 0, 2.2, W);
  }
  // güneşte ağarmış hafif lekeler
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(230,210,180,${r.float(0.02, 0.06)})`; g.beginPath(); g.arc(r.float(0, W), r.float(0, W), r.float(8, 30), 0, 6.3); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  _teak = t;
  return t;
}
const MATS = {};
export function yachtMats() {
  if (MATS.gel) return MATS;
  MATS.gel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.05 });
  MATS.teak = new THREE.MeshStandardMaterial({ map: teakTexture(), roughness: 0.78, metalness: 0 });
  MATS.glass = new THREE.MeshStandardMaterial({ color: 0x0b1620, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.6 });
  MATS.steel = new THREE.MeshStandardMaterial({ color: 0xe2e4e6, roughness: 0.16, metalness: 1 });
  MATS.low = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.1 });
  return MATS;
}

// Yan profil (z, y) noktalarından x ekseni boyunca genişlik w kadar uzatılmış, yuvarlatılmış kenarlı gövde
function extProfile(pts, w, xc = 0, bevel = 0.05) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateY(-Math.PI / 2);
  g.translate(xc + w / 2 - bevel, 0, 0);
  return g;
}
// eğik düzlem (cam): (z0,y0)→(z1,y1) arasında genişlik w
function slab(z0, y0, z1, y1, w, t = 0.04, xc = 0) {
  const L = Math.hypot(z1 - z0, y1 - y0);
  const g = new THREE.BoxGeometry(w, t, L);
  g.rotateX(-Math.atan2(y1 - y0, z1 - z0));
  return g.translate(xc, (y0 + y1) / 2, (z0 + z1) / 2);
}
// korkuluk dikmeleri + üst boru (kenar listesi boyunca)
function rail(S, pts, h, step = 1.2, r = 0.022) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
    S.push(rod(ax, ay + h, az, bx, by + h, bz, r, 6), rod(ax, ay + h * 0.5, az, bx, by + h * 0.5, bz, r * 0.6, 4));
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) { const t = k / n; S.push(CY(r * 0.9, r * 0.9, h, 5, ax + (bx - ax) * t, ay + (by - ay) * t + h / 2, az + (bz - az) * t)); }
  }
  const [lx, ly, lz] = pts[pts.length - 1];
  S.push(CY(r * 0.9, r * 0.9, h, 5, lx, ly + h / 2, lz));
}

export const YACHT_SPECS = {
  // L boy, B en, F güverte (su hattından), D su altı
  yat: { L: 16, B: 4.6, F: 1.5, D: 0.95, decks: 2 },
  megayat: { L: 28, B: 6.6, F: 2.3, D: 1.5, decks: 3 },
};

const partsCache = new Map();
// Yat parçaları (malzemeye göre geometri) — kaynak: tip + gövde rengi
export function yachtParts(type, hullColor = 0xf6f6f4, accent = 0x1a2a3a) {
  const key = type + ':' + hullColor + ':' + accent;
  if (partsCache.has(key)) return partsCache.get(key);
  const S0 = YACHT_SPECS[type];
  const { L, B, F, D } = S0;
  const mega = type === 'megayat';
  const WHITE = 0xf7f7f5, CREAM = 0xe9e1cc, DARK = 0x20262c, GREY = 0x9aa2a8;
  const H = shipHull({ L, B, D, F, bow: mega ? 0.3 : 0.36, stern: 0.94, run: 0.08, flare: 0.36, sheer: 0.22, vee: 0.8, cBottom: 0x14243a, cBoot: accent, cTop: hullColor, cStripe: hullColor === WHITE || hullColor > 0xd00000 ? GREY : WHITE, stripeH: 0.14, nL: 40, bootLo: -0.05, bootHi: 0.16 });
  const G = [...H.parts], T = [], Gl = [], St = [], Li = [];
  const dy = F;
  const dk = (u) => H.deckY(u);
  const hw = (u) => H.width(u);
  const uz = (z) => (z + L / 2) / L;
  // tik güverte (uv metre) + yüzme platformu + kokpit masası
  T.push(bare(H.deck, true));
  T.push(bare(B3(B * 0.86, 0.12, 1.1, 0, 0.42, -L / 2 - 0.5), true));
  // borda pencereleri (gövde yüzeyinde uzun oval / bant)
  const zw0 = -L * 0.12, zw1 = L * (mega ? 0.2 : 0.14), nw = mega ? 5 : 3;
  for (let i = 0; i < nw; i++) {
    const z = zw0 + (zw1 - zw0) * (i + 0.5) / nw, u = uz(z), y = dk(u) - (mega ? 0.85 : 0.6);
    for (const s of [-1, 1]) Gl.push(bare(new THREE.SphereGeometry(1, 12, 6).scale(0.05, mega ? 0.13 : 0.09, (zw1 - zw0) / nw * 0.36).translate(s * (hw(u) * (1 + 0.36 * 0.3 * Math.max(0, (u - 0.6) / 0.4)) + 0.005), y, z)));
  }
  // salon (ana güverte üst yapısı): eğik ön cam, arkada gölgelik çıkıntı
  const sw = B * (mega ? 0.8 : 0.78), z0 = -L * (mega ? 0.3 : 0.26), z1 = L * (mega ? 0.12 : 0.1), hS = mega ? 2.3 : 1.75;
  G.push(vc(extProfile([[z0, 0], [z1 + 1.4, 0], [z1 + 1.4, 0.45], [z1, hS], [z0 + 0.4, hS + 0.05], [z0 - 0.6, hS]], sw, 0, 0.06).translate(0, dy, 0), WHITE));
  // camlar: ön (eğik), yan bant, arka sürgülü kapı
  Gl.push(bare(slab(z1 + 1.36, dy + 0.5, z1 + 0.04, dy + hS - 0.08, sw * 0.94, 0.05)));
  for (const s of [-1, 1]) {
    Gl.push(bare(B3(0.05, hS * 0.48, (z1 - z0) * 0.86, s * (sw / 2 + 0.005), dy + hS * 0.55, (z0 + z1) / 2)));
    // pencere dikmeleri (siyah çerçeve)
    for (let k = 1; k < 4; k++) G.push(vc(B3(0.07, hS * 0.5, 0.07, s * (sw / 2 + 0.03), dy + hS * 0.55, z0 + (z1 - z0) * k / 4), DARK));
  }
  Gl.push(bare(B3(sw * 0.8, hS * 0.8, 0.05, 0, dy + hS * 0.42, z0 - 0.005)));
  // kıç kokpit: U oturma grubu (krem minder) + tik masa
  const cz = -L / 2 + L * 0.12;
  G.push(vc(B3(B * 0.7, 0.42, 0.6, 0, dy + 0.21, -L / 2 + 0.55), CREAM));
  G.push(vc(B3(B * 0.7, 0.5, 0.14, 0, dy + 0.62, -L / 2 + 0.3), CREAM));
  for (const s of [-1, 1]) G.push(vc(B3(0.55, 0.42, L * 0.12, s * (B * 0.35 - 0.28), dy + 0.21, cz), CREAM));
  T.push(bare(B3(B * 0.32, 0.06, L * 0.08, 0, dy + 0.72, cz), true));
  St.push(CY(0.04, 0.04, 0.7, 6, 0, dy + 0.35, cz));
  // kıç basamakları (platformdan güverteye)
  for (let k = 0; k < 3; k++) T.push(bare(B3(0.7, 0.08, 0.28, B * 0.3, 0.6 + k * (dy - 0.55) / 3, -L / 2 + 0.1 + k * 0.25), true));
  // ön güverte: güneşlenme minderleri, kaporta camı, ırgat + çapa, babalar
  const fz = z1 + 1.4 + (mega ? 2.6 : 1.5);
  for (const s of [-1, 1]) G.push(vc(new THREE.BoxGeometry(B * 0.27, 0.16, mega ? 2.6 : 1.9).translate(s * B * 0.15, dk(uz(fz)) + 0.1, fz), CREAM));
  Gl.push(bare(B3(0.7, 0.05, 0.7, 0, dk(uz(fz + 2.2)) + 0.03, fz + (mega ? 2.6 : 1.9))));
  const bz = L / 2 - (mega ? 1.6 : 1.0);
  St.push(CY(0.16, 0.18, 0.22, 10, 0, dk(uz(bz)) + 0.1, bz), rod(0, dk(uz(bz)) + 0.05, bz + 0.1, 0, dk(1) - 0.4, L / 2 + 0.05, 0.05, 6));
  St.push(new THREE.BoxGeometry(0.16, 0.42, 0.06).translate(0, dk(1) - 0.55, L / 2 + 0.08));
  for (const z of [-L * 0.44, L * 0.05, L * 0.36]) for (const s of [-1, 1]) St.push(new THREE.BoxGeometry(0.06, 0.07, 0.32).translate(s * (hw(uz(z)) - 0.15), dk(uz(z)) + 0.04, z));
  // paslanmaz korkuluk: yan güverteler + baş pulpit (gövde kenarı boyunca)
  const edgePts = (s) => H.edge.filter((e) => e[0] > z0 + 0.3 && e[0] < L / 2 - 0.2).filter((_, i) => i % 3 === 0).map((e) => [s * (e[1] - 0.12), e[2], e[0]]);
  for (const s of [-1, 1]) { const pts = edgePts(s); pts.push([s * 0.12, dk(1) - 0.02, L / 2 - 0.25]); rail(St, pts, mega ? 0.95 : 0.7, 1.15); }
  // seyir fenerleri: iskele (+x) kırmızı, sancak (-x) yeşil, pupa beyaz, su altı mavi
  const ny = dy + hS * 0.5, nz = z1 + 0.7;
  Li.push(lightize(new THREE.BoxGeometry(0.06, 0.1, 0.22).translate(sw / 2 + 0.06, ny, nz), 0x501010, 0xff2020, 0));
  Li.push(lightize(new THREE.BoxGeometry(0.06, 0.1, 0.22).translate(-sw / 2 - 0.06, ny, nz), 0x105010, 0x20ff40, 0));
  Li.push(lightize(new THREE.SphereGeometry(0.07, 8, 6).translate(0, dy + 0.5, -L / 2 - 0.02), 0xdddddd, 0xffffff, 1));
  for (const s of [-1, 1]) Li.push(lightize(new THREE.SphereGeometry(0.1, 8, 6).scale(1, 1, 0.4).translate(s * B * 0.25, -0.25, -L / 2 + 0.05), 0x102040, 0x40a0ff, 0));
  // tavan aydınlatması (salon içi, gece sıcak)
  for (let k = 0; k < 4; k++) Li.push(lightize(new THREE.BoxGeometry(0.5, 0.04, 0.5).translate(0, dy + hS - 0.08, z0 + 0.8 + k * (z1 - z0 - 1) / 3), 0xeeeeee, 0xffd8a0, 0));
  let topY = dy + hS, driver;
  if (!mega) {
    // ---- flybridge (salon çatısı) ----
    const fy = dy + hS + 0.06;
    T.push(bare(B3(sw * 0.92, 0.05, (z1 - z0) * 0.95, 0, fy, (z0 + z1) / 2 - 0.2), true));
    // dümen konsolu + küçük rüzgârlık + direksiyon + koltuklar + minderler
    const hz = z1 - 1.1;
    G.push(vc(extProfile([[hz - 0.3, 0], [hz + 0.6, 0], [hz + 0.6, 0.55], [hz + 0.1, 0.95], [hz - 0.3, 0.95]], sw * 0.86, 0, 0.04).translate(0, fy, 0), WHITE));
    Gl.push(bare(slab(hz + 0.12, fy + 0.95, hz - 0.05, fy + 1.3, sw * 0.8, 0.03)));
    G.push(vc(new THREE.TorusGeometry(0.17, 0.025, 6, 16).rotateX(-0.9).translate(0.55, fy + 1.0, hz - 0.33), DARK));
    for (const x of [-0.45, 0.55]) G.push(vc(B3(0.55, 0.45, 0.55, x, fy + 0.23, hz - 0.95), CREAM), vc(B3(0.55, 0.6, 0.12, x, fy + 0.7, hz - 1.2), CREAM));
    G.push(vc(B3(sw * 0.8, 0.35, 1.6, 0, fy + 0.18, z0 + 1.6), CREAM));
    // radar kemeri (eğik iki ayak + üst kiriş) + kubbe radar + açık dizi + direk
    const az = z0 + 3.0;
    for (const s of [-1, 1]) G.push(vc(slab(az - 0.4, fy, az - 1.0, fy + 1.6, 0.18, 0.5, s * sw * 0.38), WHITE));
    G.push(vc(B3(sw * 0.86, 0.22, 0.75, 0, fy + 1.65, az - 1.0), WHITE));
    G.push(vc(CY(0.32, 0.32, 0.26, 16, 0.4, fy + 1.9, az - 1.0), WHITE));
    G.push(vc(B3(1.4, 0.08, 0.14, -0.4, fy + 1.95, az - 1.0), DARK));
    St.push(CY(0.03, 0.03, 1.4, 6, -0.9, fy + 2.4, az - 1.1), CY(0.025, 0.025, 1.1, 6, 1.0, fy + 2.3, az - 1.1));
    Li.push(lightize(new THREE.SphereGeometry(0.07, 8, 6).translate(0, fy + 2.1, az - 0.8), 0xdddddd, 0xffffff, 0));
    // flybridge korkuluğu
    rail(St, [[sw * 0.46, fy, z1 - 0.2], [sw * 0.46, fy, z0 + 0.2], [-sw * 0.46, fy, z0 + 0.2], [-sw * 0.46, fy, z1 - 0.2]], 0.8, 1.1);
    // flybridge merdiveni (kokpitten)
    for (let k = 0; k < 6; k++) St.push(B3(0.6, 0.04, 0.2, -B * 0.25, dy + 0.3 + k * (hS - 0.3) / 6, z0 - 0.5 - k * 0.12));
    topY = fy + 2.6; driver = [0.55, fy + 0.45, hz - 0.95];
  } else {
    // ---- üst güverte (köprüüstü + yaşam alanı) ----
    const y2 = dy + hS + 0.05, w2 = sw * 0.86, a0 = z0 + 1.6, a1 = z1 - 0.6, h2 = 2.0;
    T.push(bare(B3(sw * 0.98, 0.05, z1 - z0 + 0.5, 0, y2, (z0 + z1) / 2 - 0.3), true));
    G.push(vc(extProfile([[a0, 0], [a1 + 1.0, 0], [a1 + 1.0, 0.5], [a1, h2], [a0 + 0.3, h2 + 0.05], [a0 - 1.4, h2]], w2, 0, 0.06).translate(0, y2, 0), WHITE));
    Gl.push(bare(slab(a1 + 0.97, y2 + 0.52, a1 + 0.03, y2 + h2 - 0.08, w2 * 0.95, 0.05)));
    for (const s of [-1, 1]) Gl.push(bare(B3(0.05, h2 * 0.5, (a1 - a0) * 0.9, s * (w2 / 2 + 0.005), y2 + h2 * 0.55, (a0 + a1) / 2)));
    Gl.push(bare(B3(w2 * 0.8, h2 * 0.8, 0.05, 0, y2 + h2 * 0.42, a0 - 0.005)));
    // üst güverte arka teras: oturma + korkuluk
    G.push(vc(B3(w2 * 0.8, 0.42, 0.6, 0, y2 + 0.21, z0 - 0.0), CREAM));
    rail(St, [[sw * 0.48, y2, a0], [sw * 0.48, y2, z0 - 0.6], [-sw * 0.48, y2, z0 - 0.6], [-sw * 0.48, y2, a0]], 0.95, 1.1);
    // ---- güneş güvertesi (flybridge): sert tente, dümen, jakuzi, tender, can salları ----
    const y3 = y2 + h2 + 0.06;
    T.push(bare(B3(w2 * 0.96, 0.05, a1 - a0 + 0.8, 0, y3, (a0 + a1) / 2 - 0.2), true));
    const hz = a1 - 0.8;
    G.push(vc(extProfile([[hz - 0.3, 0], [hz + 0.6, 0], [hz + 0.6, 0.55], [hz + 0.1, 0.95], [hz - 0.3, 0.95]], w2 * 0.7, 0, 0.04).translate(0, y3, 0), WHITE));
    Gl.push(bare(slab(hz + 0.12, y3 + 0.95, hz - 0.05, y3 + 1.3, w2 * 0.65, 0.03)));
    G.push(vc(new THREE.TorusGeometry(0.18, 0.025, 6, 16).rotateX(-0.9).translate(0.6, y3 + 1.0, hz - 0.33), DARK));
    for (const x of [-0.6, 0.6]) G.push(vc(B3(0.6, 0.45, 0.6, x, y3 + 0.23, hz - 0.95), CREAM), vc(B3(0.6, 0.6, 0.12, x, y3 + 0.7, hz - 1.22), CREAM));
    // sert tente (4 dikme üstünde, ön kenarı eğik)
    const tz0 = a0 + 0.6, tz1 = a1 - 0.1;
    for (const x of [-1, 1]) for (const z of [tz0, tz1 - 0.6]) St.push(CY(0.05, 0.05, 2.2, 8, x * w2 * 0.38, y3 + 1.1, z));
    G.push(vc(extProfile([[tz0 - 0.3, 0], [tz1 + 0.4, 0.05], [tz1 + 0.2, 0.18], [tz0 - 0.3, 0.2]], w2 * 0.86, 0, 0.04).translate(0, y3 + 2.2, 0), WHITE));
    // radar direği (tente üstü): iki açık dizi + kubbe + fenerler
    G.push(vc(slab(tz0 + 0.6, y3 + 2.38, tz0 + 0.2, y3 + 3.4, 0.2, 0.5, 0), WHITE));
    G.push(vc(B3(2.2, 0.08, 0.16, 0, y3 + 3.45, tz0 + 0.2), DARK), vc(CY(0.34, 0.34, 0.3, 16, 0, y3 + 2.55, tz1 - 0.6), WHITE));
    Li.push(lightize(new THREE.SphereGeometry(0.08, 8, 6).translate(0, y3 + 3.7, tz0 + 0.2), 0xdddddd, 0xffffff, 0));
    // jakuzi (ön güneş güvertesi), tender bot (kıç teras üstünde), can salı kapsülleri
    G.push(vc(CY(0.9, 0.9, 0.5, 18, 0, y3 + 0.25, a1 + 0.0), WHITE), vc(CY(0.8, 0.8, 0.02, 18, 0, y3 + 0.45, a1), 0x2aa0c8));
    G.push(vc(new THREE.CapsuleGeometry(0.55, 2.4, 4, 10).rotateX(Math.PI / 2).scale(1, 0.6, 1).translate(0, y2 + 0.5, z0 - 2.2), 0x2a2d30));
    G.push(vc(B3(0.9, 0.3, 2.6, 0, y2 + 0.72, z0 - 2.2), 0xdddddd));
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) G.push(vc(new THREE.CapsuleGeometry(0.28, 0.6, 4, 10).rotateX(Math.PI / 2).translate(s * w2 * 0.4, y3 + 0.32, a0 + 0.2 + k * 0.9), WHITE));
    rail(St, [[w2 * 0.48, y3, a1 + 0.6], [w2 * 0.48, y3, a0], [-w2 * 0.48, y3, a0], [-w2 * 0.48, y3, a1 + 0.6]], 0.9, 1.1);
    // kıç bayrak direği
    St.push(CY(0.025, 0.025, 1.4, 6, 0, dy + 0.9, -L / 2 + 0.15));
    G.push(vc(B3(0.02, 0.5, 0.8, 0, dy + 1.35, -L / 2 - 0.25), 0xc8102e));
    topY = y3 + 3.8; driver = [0.6, y3 + 0.45, hz - 0.95];
  }
  const low = mergeGeometries([...G.map((x) => x.clone()), ...T.map((x) => vc(x.clone(), 0xb07a48)), ...Gl.map((x) => vc(x.clone(), 0x0d1820))].map((x) => { const n = x.index ? x.toNonIndexed() : x; if (n.attributes.uv) n.deleteAttribute('uv'); return n; }));
  const P = {
    L, B, F, topY, driver,
    gel: mergeGeometries(G.map((x) => { const n = x.index ? x.toNonIndexed() : x; if (n.attributes.uv) n.deleteAttribute('uv'); return n; })),
    teak: mergeGeometries(T.map((x) => bare(x, true))),
    glass: mergeGeometries(Gl.map((x) => bare(x))),
    steel: mergeGeometries(St.map((x) => bare(x))),
    lights: mergeGeometries(Li),
    low: simplifyLow(low),
  };
  partsCache.set(key, P);
  return P;
}
// LOD1: korkuluk ve küçük parçalar zaten çıkarılmış; yalnız konum+renk+normal
function simplifyLow(g) { return g; }

// Tam model (LOD'lu). Kök: güverte hattı y=0 su hattı. Dönen: { group, parts, body (jelkot ağı), glass }
export function buildYacht(type, hullColor, accent) {
  const M = yachtMats(), P = yachtParts(type, hullColor, accent);
  const hi = new THREE.Group();
  const body = new THREE.Mesh(P.gel, M.gel); body.castShadow = true; body.receiveShadow = true; hi.add(body);
  const teak = new THREE.Mesh(P.teak, M.teak); teak.receiveShadow = true; hi.add(teak);
  const glass = new THREE.Mesh(P.glass, M.glass); hi.add(glass);
  const steel = new THREE.Mesh(P.steel, M.steel); hi.add(steel);
  const lm = makeLightsMat();
  const lights = new THREE.Mesh(P.lights, lm);
  const loG = new THREE.Group();
  const lo = new THREE.Mesh(P.low, M.low); lo.castShadow = true; loG.add(lo);
  const lod = new THREE.LOD();
  lod.addLevel(hi, 0); lod.addLevel(loG, 110);
  const group = new THREE.Group();
  group.add(lod, lights);
  return { group, parts: P, body, glass, lightsMat: lm, lod };
}

// ---------------- Balıkçı kaiği (8 m, sürülebilir) ----------------
const fishCache = new Map();
export function fishingParts(color = 0x2a6ab0) {
  if (fishCache.has(color)) return fishCache.get(color);
  const L = 8, B = 2.8;
  const H = shipHull({ L, B, D: 0.7, F: 1.0, bow: 0.34, stern: 0.72, flare: 0.28, sheer: 0.65, cBottom: 0x8a1a1a, cBoot: 0xf0f0f0, cTop: color, cStripe: 0xf0f0f0, stripeH: 0.16, nL: 28, bootLo: -0.1, bootHi: 0.12 });
  const G = [...H.parts], T = [], Gl = [], Li = [];
  T.push(bare(H.deck, true));
  // ahşap küpeşte
  for (const s of [-1, 1]) G.push(vc(rod(s * B * 0.47, 1.06, -L * 0.44, s * B * 0.3, 1.5, L * 0.45, 0.05, 5), 0x6a4a2a));
  // kaptan köşkü
  G.push(vc(B3(1.5, 1.45, 1.6, 0, 1.75, -L * 0.18), 0xf0f0ea), vc(B3(1.7, 0.1, 1.8, 0, 2.52, -L * 0.18), 0xc81010));
  Gl.push(bare(B3(1.3, 0.5, 0.05, 0, 2.05, -L * 0.18 + 0.81)));
  for (const s of [-1, 1]) Gl.push(bare(B3(0.05, 0.45, 0.9, s * 0.76, 2.05, -L * 0.18)));
  // direk, bum, ağ yığını, şamandıralar, lastik usturmaçalar, bayrak
  G.push(vc(CY(0.06, 0.07, 4.0, 6, 0, 3.0, L * 0.12), 0x6a4a2a), vc(rod(0, 4.5, L * 0.12, 0, 1.3, L * 0.42, 0.03), 0x333333));
  G.push(vc(rod(0, 2.8, L * 0.12, 0, 1.4, -L * 0.36, 0.04), 0x6a4a2a));
  G.push(vc(new THREE.SphereGeometry(1, 10, 6).scale(1.0, 0.36, 1.2).translate(0, 1.15, L * 0.27), 0x3a6a3a));
  for (let i = 0; i < 5; i++) G.push(vc(new THREE.SphereGeometry(0.11, 8, 6).translate(B * 0.44, 1.1, -L * 0.3 + i * 0.8), 0xff7a10));
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) G.push(vc(new THREE.TorusGeometry(0.2, 0.07, 6, 12).rotateY(Math.PI / 2).translate(s * (B * 0.5 + 0.04), 0.75, -L * 0.25 + i * L * 0.25), 0x111111));
  G.push(vc(B3(0.02, 0.35, 0.55, 0, 2.95, -L * 0.18 - 0.55), 0xc8102e));
  Li.push(lightize(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 5.0, L * 0.12), 0xdddddd, 0xffffff, 0));
  Li.push(lightize(new THREE.SphereGeometry(0.16, 8, 6).translate(0, 3.6, L * 0.12 + 0.2), 0xeeeeee, 0xfff0d0, 0));
  Li.push(lightize(new THREE.SphereGeometry(0.06, 8, 6).translate(B * 0.45, 1.2, L * 0.2), 0x501010, 0xff2020, 0));
  Li.push(lightize(new THREE.SphereGeometry(0.06, 8, 6).translate(-B * 0.45, 1.2, L * 0.2), 0x105010, 0x20ff40, 0));
  const P = {
    L, B, F: 1.0, topY: 5.1, driver: [0, 0.9, -L * 0.18],
    gel: mergeGeometries(G.map((x) => { const n = x.index ? x.toNonIndexed() : x; if (n.attributes.uv) n.deleteAttribute('uv'); return n; })),
    teak: mergeGeometries(T.map((x) => bare(x, true))),
    glass: mergeGeometries(Gl.map((x) => bare(x))),
    steel: null,
    lights: mergeGeometries(Li),
  };
  P.low = mergeGeometries([P.gel, vc(P.teak.clone(), 0x9a7a54), vc(P.glass.clone(), 0x0d1820)].map((x) => { const n = x.index ? x.toNonIndexed() : x; if (n.attributes.uv) n.deleteAttribute('uv'); return n; }));
  fishCache.set(color, P);
  return P;
}
export function buildFishingBoat(color) {
  const M = yachtMats(), P = fishingParts(color);
  const hi = new THREE.Group();
  const body = new THREE.Mesh(P.gel, M.gel); body.castShadow = true; hi.add(body);
  hi.add(new THREE.Mesh(P.teak, M.teak));
  const glass = new THREE.Mesh(P.glass, M.glass); hi.add(glass);
  const lm = makeLightsMat();
  const lod = new THREE.LOD(); const lo = new THREE.Mesh(P.low, M.low);
  lod.addLevel(hi, 0); lod.addLevel(lo, 90);
  const group = new THREE.Group(); group.add(lod, new THREE.Mesh(P.lights, lm));
  return { group, parts: P, body, glass, lightsMat: lm, lod };
}
