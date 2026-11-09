// [şehir] AVM (Boğaziçi Park AVM): 3 kat, ortada galeri boşluğu (atrium) ve tavan ışıklığı, iki yürüyen merdiven
// (zemin↔1, 1↔2; çift şerit, oyuncuyu ve kalabalığı taşır), camlı asansör, kurgusal markalı mağazalar,
// zemin katta hipermarket (3 kasa, ilerleyen sıra), en üst katta yemek katı (büfeler, sıra, masada yiyenler).
// Statik geometri tek birleşik ağ (interior_kit), tabelalar tek atlas ağı, ürünler örneklenmiş; kalabalık crowd.js.
// İç mekân yalnızca girilince kurulur, kalabalık yalnızca oyuncu içerideyken güncellenir (ctx.update).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit, PALETTES } from './interior_kit.js';
import { Crowd, lookOf as lookOf0 } from './crowd.js';
import { marbleTexture, makeCanvas } from '../core/textures.js';
import { GeoBuilder } from '../world/instancer.js';
import { propsMaterial } from '../world/shaders.js';

const W = 64, D = 44, FH = 5, NF = 3, H = NF * FH;
const AT = { x0: -12, x1: 12, z0: -5, z1: 5 };
const RUN = 8.66, RISE = 5, NSTEP = 20, ESC_V = 0.5;
// yürüyen merdivenler: dir = şeridin yatay yönü (+1: +x), y0 → y1 yükselir
export const ESC = [
  { id: 'E01', x0: 3.34, x1: 12, z0: -4.6, z1: -2.0, f0: 0, up: { z: -4.0, dir: 1 }, down: { z: -2.6, dir: -1 }, rise: 1 },
  { id: 'E12', x0: 14, x1: 22.66, z0: 2.0, z1: 4.6, f0: 1, up: { z: 4.0, dir: -1 }, down: { z: 2.6, dir: 1 }, rise: -1 },
];
const ELEV = { x0: -14.6, x1: -12.4, z0: -1.1, z1: 1.1, cx: -13.5, cz: 0, door: { x: -15.4, z: 0 } };
const E12H = { x0: 14, x1: 22.66, z0: 2.0, z1: 4.6 };
const STORES_N = ['LALE MODA', 'KUZEYRÜZGÂRI', 'ATLAS SPOR', 'PERA AYAKKABI', 'GALATA KİTAP', 'NAR KOZMETİK', 'TEKNOKULE', 'OYUNCAK ADASI', 'SEDEF KUYUMCULUK', 'BULUT ELEKTRONİK', 'ZEYTİN EV', 'PUSULA OPTİK', 'FISTIK ÇOCUK', 'DEFNE BUTİK', 'KARAKUŞ ÇANTA', 'MARTI SAAT', 'İNCİ PARFÜM', 'ÇINAR MOBİLYA', 'POYRAZ OUTDOOR', 'KUMSAL MAYO', 'ANKA MÜZİK', 'MOR SALKIM ÇİÇEK'];
const CAT = { 'LALE MODA': 'giyim', 'KUZEYRÜZGÂRI': 'giyim', 'ATLAS SPOR': 'spor', 'PERA AYAKKABI': 'ayakkabi', 'GALATA KİTAP': 'kitap', 'NAR KOZMETİK': 'kozmetik', 'TEKNOKULE': 'elektronik', 'OYUNCAK ADASI': 'oyuncak', 'SEDEF KUYUMCULUK': 'kuyumcu', 'BULUT ELEKTRONİK': 'elektronik', 'ZEYTİN EV': 'ev', 'PUSULA OPTİK': 'kuyumcu', 'FISTIK ÇOCUK': 'giyim', 'DEFNE BUTİK': 'giyim', 'KARAKUŞ ÇANTA': 'ayakkabi', 'MARTI SAAT': 'kuyumcu', 'İNCİ PARFÜM': 'kozmetik', 'ÇINAR MOBİLYA': 'ev', 'POYRAZ OUTDOOR': 'spor', 'KUMSAL MAYO': 'giyim', 'ANKA MÜZİK': 'elektronik', 'MOR SALKIM ÇİÇEK': 'ev' };
const KIOSKS = ['KÖFTE ÇARŞISI', 'LAHMACUN EVİ', 'PİDE DURAĞI', 'BURGER ADASI', 'MANTI KÖŞESİ', 'KUMPİR BAHÇESİ', 'TATLICI ŞEKER', 'NOODLE KULE'];
const SIGN_COL = ['#8a1a3a', '#1d3d6e', '#1a1a1a', '#5a2d1a', '#2d5a2d', '#c84a6a', '#0d2a4a', '#e8a01a', '#3a2a1a', '#1a5a8a', '#4a5a2a', '#2a2a5a'];

// görünüş havuzu: karakter geometrisi görünüş anahtarı başına önbellekte — kalabalık 18 görünüşü paylaşır
// (her yeni görünüş ayrı ağ kurulumu demek; AVM'ye girişte duraksama olmasın)
let POOL = null;
function lookOf(r, gender) {
  if (!POOL) { POOL = { m: [], f: [] }; for (let i = 0; i < 18; i++) { const L = lookOf0(r, i % 2 ? 'f' : 'm'); POOL[L.gender === 'f' ? 'f' : 'm'].push(L); } }
  const a = gender ? POOL[gender] : (r.next() < 0.5 ? POOL.m : POOL.f);
  return a[Math.floor(r.next() * a.length)];
}
const lane = (f, side) => side < 0 ? -9.5 : f === 2 ? 11.3 : 9.5;
const crossings = (f) => f === 0 ? [-20, 0, 26] : f === 1 ? [-20, 26] : [-22.4, 26]; // 2. katta masa araları
const fy = (f) => f * FH;

// dikdörtgenden delikleri çıkar → kalan dikdörtgenler (ızgara ayrıştırma + x boyunca birleştirme)
function rectsMinus(B, holes) {
  const xs = [...new Set([B.x0, B.x1, ...holes.flatMap((h) => [h.x0, h.x1])])].filter((v) => v >= B.x0 && v <= B.x1).sort((a, b) => a - b);
  const zs = [...new Set([B.z0, B.z1, ...holes.flatMap((h) => [h.z0, h.z1])])].filter((v) => v >= B.z0 && v <= B.z1).sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < zs.length - 1; j++) {
    let cur = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      const hole = holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1);
      if (hole) { if (cur) { out.push(cur); cur = null; } continue; }
      if (cur) cur.x1 = xs[i + 1]; else cur = { x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1] };
    }
    if (cur) out.push(cur);
  }
  return out;
}

// Tabela atlası: tüm mağaza/büfe tabelaları tek doku + tek ağ
class SignAtlas {
  constructor() { this.c = makeCanvas(2048, 2048); this.g = this.c.getContext('2d'); this.n = 0; this.geos = []; }
  add(text, bg, fg, w, h, x, y, z, rotY, sub) {
    const i = this.n++, col = i % 4, row = Math.floor(i / 4), g = this.g, X = col * 512, Y = row * 128;
    g.fillStyle = bg; g.fillRect(X, Y, 512, 128);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(X, Y, 512, 10);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 64; g.font = `bold ${fs}px Arial`;
    while (g.measureText(text).width > 470 && fs > 22) { fs -= 4; g.font = `bold ${fs}px Arial`; }
    g.fillText(text, X + 256, Y + (sub ? 52 : 66));
    if (sub) { g.font = '26px Arial'; g.fillText(sub, X + 256, Y + 104); }
    const p = new THREE.PlaneGeometry(w, h);
    const uv = p.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (X + uv.getX(k) * 512) / 2048, 1 - (Y + (1 - uv.getY(k)) * 128) / 2048);
    p.rotateY(rotY); p.translate(x, y, z);
    this.geos.push(p);
  }
  build(scene) {
    if (!this.geos.length) return;
    const t = new THREE.CanvasTexture(this.c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    scene.add(new THREE.Mesh(mergeGeometries(this.geos), new THREE.MeshBasicMaterial({ map: t })));
  }
}

export function buildMall(I, ctx) {
  const g = I.game, r = ctx.rng;
  const marble = marbleTexture().clone(); marble.needsUpdate = true; marble.wrapS = marble.wrapT = THREE.RepeatWrapping;
  const floorMat = new THREE.MeshStandardMaterial({ map: marble, roughness: 0.18, metalness: 0.05, color: 0xf2efe8 });
  const fm0 = floorMat.clone(); fm0.map = marble.clone(); fm0.map.needsUpdate = true; fm0.map.repeat.set(W / 2.5, D / 2.5);
  I.room(ctx, W, D, H, fm0, new THREE.MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.9 }), 0xdcdcd8);
  ctx.peaceful = false;
  ctx.camMaxY = (py) => Math.floor((py + 0.6) / FH) * FH + (py > fy(NF - 1) - 0.6 ? 4.6 : 4.1); // kamera bulunduğu katın tavanını aşmasın
  const K = new Kit(I, ctx), S = new SignAtlas();
  const floors = [];
  // ---------------- kat döşemeleri (1 ve 2): üst yüz mermer (tek ağ), alt yüz + alın beyaz; çarpışma dikdörtgenleri
  const tops = [];
  for (let f = 1; f < NF; f++) {
    const y = fy(f);
    const holes = [AT, ELEV, ...(f === 2 ? [E12H] : [])];
    const rects = rectsMinus({ x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 }, holes);
    for (const R of rects) {
      const w = R.x1 - R.x0, d = R.z1 - R.z0, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
      const p = new THREE.PlaneGeometry(w, d); p.rotateX(-Math.PI / 2); p.translate(cx, y + 0.001, cz);
      const uv = p.attributes.uv, pos = p.attributes.position;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, pos.getX(k) / 2.5, pos.getZ(k) / 2.5);
      tops.push(p);
      K.box(w, 0.42, d, cx, y - 0.42, cz, 0xeeeeea, { rough: 0.8 });
      ctx.cols.add(R.x0, R.z0, R.x1, R.z1, y - 0.42, y, 'slab');
    }
    // delik alınları (parlak beyaz kaplama) — atrium ve E12
    for (const h of holes) if (h !== ELEV) {
      K.box(h.x1 - h.x0, 0.6, 0.06, (h.x0 + h.x1) / 2, y - 0.6, h.z0 - 0.03, 0xf8f8f6, { rough: 0.3 }).box(h.x1 - h.x0, 0.6, 0.06, (h.x0 + h.x1) / 2, y - 0.6, h.z1 + 0.03, 0xf8f8f6, { rough: 0.3 });
      K.box(0.06, 0.6, h.z1 - h.z0, h.x0 - 0.03, y - 0.6, (h.z0 + h.z1) / 2, 0xf8f8f6, { rough: 0.3 }).box(0.06, 0.6, h.z1 - h.z0, h.x1 + 0.03, y - 0.6, (h.z0 + h.z1) / 2, 0xf8f8f6, { rough: 0.3 });
    }
    floors.push(rects);
  }
  ctx.scene.add(new THREE.Mesh(mergeGeometries(tops), floorMat));
  // ---------------- korkuluklar (cam + paslanmaz küpeşte): açıklıklar merdiven inişlerinde
  const rail = (x0, z0, x1, z1, y) => {
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.05) return;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rot = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
    K.glass(len, 1.0, 0.03, cx, y, cz, { rot });
    K.box(len, 0.06, 0.08, cx, y + 1.0, cz, 0xc8ccd0, { rot, metal: 0.9, rough: 0.2 });
    ctx.cols.add(Math.min(x0, x1) - 0.05, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, Math.max(z0, z1) + 0.05, y, y + 1.1, 'rail');
  };
  for (let f = 1; f < NF; f++) {
    const y = fy(f);
    rail(AT.x0, AT.z0, AT.x1, AT.z0, y); rail(AT.x0, AT.z1, AT.x1, AT.z1, y); rail(AT.x0, AT.z0, AT.x0, AT.z1, y);
    if (f === 1) { rail(AT.x1, AT.z0, AT.x1, ESC[0].z0, y); rail(AT.x1, ESC[0].z1, AT.x1, AT.z1, y); } else rail(AT.x1, AT.z0, AT.x1, AT.z1, y);
    if (f === 2) { rail(E12H.x0, E12H.z0, E12H.x1, E12H.z0, y); rail(E12H.x0, E12H.z1, E12H.x1, E12H.z1, y); rail(E12H.x1, E12H.z0, E12H.x1, E12H.z1, y); }
  }
  // ---------------- yürüyen merdivenler
  for (const E of ESC) buildEscalator(K, ctx, E);
  // ---------------- asansör (cam kuyu + kabin)
  const shaftCol = 0xb8d8e8;
  for (const [x0, z0, x1, z1] of [[ELEV.x0, ELEV.z0, ELEV.x1, ELEV.z0], [ELEV.x0, ELEV.z1, ELEV.x1, ELEV.z1], [ELEV.x1, ELEV.z0, ELEV.x1, ELEV.z1], [ELEV.x0, ELEV.z0, ELEV.x0, ELEV.z1]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
    K.glass(len, H - 0.2, 0.04, (x0 + x1) / 2, 0, (z0 + z1) / 2, { rot, color: shaftCol });
    ctx.cols.add(Math.min(x0, x1) - 0.05, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, Math.max(z0, z1) + 0.05, 0, H, 'glass');
  }
  for (const [x, z] of [[ELEV.x0, ELEV.z0], [ELEV.x1, ELEV.z0], [ELEV.x0, ELEV.z1], [ELEV.x1, ELEV.z1]]) K.box(0.1, H, 0.1, x, 0, z, 0x8a9096, { metal: 0.8, rough: 0.3 });
  for (let f = 0; f < NF; f++) S.add(`KAT ${f === 0 ? 'Z' : f}`, '#1a1a1a', '#7fd6ff', 0.9, 0.22, ELEV.x0 - 0.03, fy(f) + 2.6, 0, -Math.PI / 2);
  const cabin = new THREE.Group();
  { const cb = new GeoBuilder(); cb.box(2.0, 0.12, 2.0, { color: 0x6a6a6a, metal: 0.6 }); cb.box(2.0, 0.08, 2.0, { y: 2.5, color: 0x8a8a8a, metal: 0.8 }); cb.box(1.6, 0.04, 1.6, { y: 2.46, color: 0xfff6e0, emis: 3 }); for (const [x, z] of [[-0.97, -0.97], [0.97, -0.97], [-0.97, 0.97], [0.97, 0.97]]) cb.box(0.06, 2.5, 0.06, { x, z, color: 0xb0b4b8, metal: 0.9, rough: 0.2 }); cb.box(0.04, 0.05, 1.8, { x: 0.97, y: 1.0, color: 0xc8ccd0, metal: 0.9 }); cabin.add(new THREE.Mesh(cb.build(), propsMaterial())); }
  cabin.position.set(ELEV.cx, 0, ELEV.cz); ctx.scene.add(cabin);
  const elev = ctx.elevator = { y: 0, target: 0, rider: false, phase: 'idle', t: 0, to: 0, rides: 0 };
  for (let f = 0; f < NF; f++) {
    [0, 1, 2].filter((t) => t !== f).forEach((t, k) => ctx.interact.push({
      x: ELEV.door.x - 0.2, z: k ? 0.6 : -0.6, y: fy(f), r: 1.2, cond: () => Math.abs(g.player.pos.y - fy(f)) < 1.2 && elev.phase === 'idle',
      label: `Asansör: ${t === 0 ? 'zemin kata in' : t + '. kata ' + (t > f ? 'çık' : 'in')}`, action: () => { elev.phase = 'call'; elev.from = f; elev.to = t; elev.target = fy(f); },
    }));
  }
  // ---------------- mağazalar (kuzey ve güney sıraları), hipermarket, yemek katı
  const stores = []; let si = 0;
  const addStore = (f, x0, x1, side) => {
    const name = STORES_N[si++ % STORES_N.length];
    stores.push(buildStore(K, S, ctx, f, x0, x1, side, name, CAT[name] || 'giyim', SIGN_COL[si % SIGN_COL.length]));
  };
  // zemin: kuzey batı hipermarket, kuzey doğu 5 mağaza; güney: girişin iki yanında 3'er
  const hyper = buildHyper(K, S, ctx);
  for (let i = 0; i < 5; i++) addStore(0, -8 + i * 8, -8 + (i + 1) * 8, -1);
  for (let i = 0; i < 3; i++) { addStore(0, -32 + i * 28 / 3, -32 + (i + 1) * 28 / 3, 1); addStore(0, 4 + i * 28 / 3, 4 + (i + 1) * 28 / 3, 1); }
  // giriş holü: döner kapı izlenimi + yönlendirme panosu
  S.add('BOĞAZİÇİ PARK AVM', '#0d1a2e', '#7fd6ff', 7, 1.4, 0, 4.2, D / 2 - 0.08, Math.PI, 'Hoş geldiniz · 10.00 – 22.00');
  K.box(1.2, 2.2, 0.3, 0, 0, 15.5, 0x1a1a1a, { col: true }).emis(1.0, 1.8, 0.02, 0, 0.3, 15.67, 0x2a6ab8);
  S.add('KAT 2 · YEMEK KATI', '#0d2a4a', '#ffffff', 0.95, 0.24, 0, 1.9, 15.69, 0); S.add('KAT 1 · MODA', '#0d2a4a', '#ffffff', 0.95, 0.24, 0, 1.55, 15.69, 0); S.add('Z · HİPERMARKET', '#0d2a4a', '#ffffff', 0.95, 0.24, 0, 1.2, 15.69, 0);
  // 1. kat: iki sıra mağaza
  for (let i = 0; i < 8; i++) { addStore(1, -32 + i * 8, -24 + i * 8, -1); addStore(1, -32 + i * 8, -24 + i * 8, 1); }
  // 2. kat: kuzey mağazalar, güney büfeler + masalar
  for (let i = 0; i < 8; i++) addStore(2, -32 + i * 8, -24 + i * 8, -1);
  const food = buildFoodCourt(K, S, ctx);
  // ---------------- tavan ışıklığı + aydınlatma
  K.emis(AT.x1 - AT.x0 - 1, 0.05, AT.z1 - AT.z0 - 1, 0, H - 0.08, 0, 0xd8ecff);
  for (let x = -10; x <= 10; x += 4) K.box(0.12, 0.3, AT.z1 - AT.z0, x, H - 0.35, 0, 0x8a9096, { metal: 0.8 });
  for (let f = 0; f < NF; f++) {
    const cy = fy(f + 1) - (f === NF - 1 ? 0.02 : 0.43);
    for (let x = -28; x <= 28; x += 7) for (const z of [-9.5, f === 2 ? 11.3 : 9.5]) K.light(2.4, 0.3, x, cy, z);
    for (let x = -28; x <= 28; x += 8) for (const z of [-18, 18]) if (!(f === 0 && z < 0 && x < -8)) K.light(1.2, 1.2, x, cy, z, 0xfff4e4);
  }
  // saksı ağaçlar (atrium tabanı) + oturma bankları
  for (const x of [-8, -3, 0]) { K.cyl(0.6, 0.5, 0.6, x, 0, 3.2, 0xd8d4cc, { col: true }); K.cyl(0.08, 0.1, 2.2, x, 0.6, 3.2, 0x5a3a20); for (let i = 0; i < 6; i++) K.sphere(0.6, x + Math.sin(i) * 0.4, 2.6 + (i % 3) * 0.35, 3.2 + Math.cos(i) * 0.4, 0x3a7a32, { rough: 0.9 }); }
  for (const x of [-6, 2]) { K.box(2.0, 0.45, 0.6, x, 0, -0.5, 0xb89a6a, { col: true, uv: 'wood' }); K.seat(x - 0.5, -0.22, 0, 'bench'); K.seat(x + 0.5, -0.22, 0, 'bench'); }
  K.finish();
  S.build(ctx.scene);
  ctx.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a4, 0.9)); ctx.scene.add(new THREE.AmbientLight(0xfff8f0, 0.35)); // AVM: eşit, parlak genel ışık
  I.light(ctx, 0, 4.0, -9, 0xfff6ea, 22, 36); I.light(ctx, 0, 9.0, 9.5, 0xfff6ea, 22, 36); I.light(ctx, 0, 13.8, 0, 0xeaf4ff, 26, 40); I.light(ctx, -20, 13.8, 10, 0xfff0d8, 14, 24);
  // ---------------- kalabalık
  const q = g.settings && g.settings.quality;
  const crowd = new Crowd(g, ctx.scene, { max: q === 'low' ? 58 : 76 });
  const M = ctx.mall = { crowd, stores, hyper, food, cabin, stats: { served: 0, kioskServed: 0, queueMax: 0, seated: 0 }, panic: false, spawnT: 0 };
  populate(ctx, M, r);
  ctx.update = (dt) => updateMall(g, ctx, M, dt);
  ctx.onNoise = (x, z, radius) => { if (radius > 8) mallPanic(g, M, x, z); }; // citylife.js silah sesi kancası
  return { x: 0, z: D / 2 - 2.2 };
}

// ---------------------------------------------------------------- yürüyen merdiven
function buildEscalator(K, ctx, E) {
  const y0 = fy(E.f0), run = RUN / NSTEP, rs = RISE / NSTEP;
  const ang = Math.atan2(RISE, RUN) * E.rise, len = Math.hypot(RUN, RISE), mx = (E.x0 + E.x1) / 2, my = y0 + RISE / 2;
  for (const L of [E.up, E.down]) {
    // basamaklar (görsel + çarpışma), alüminyum diş çizgisi
    for (let i = 0; i < NSTEP; i++) {
      const xa = E.rise > 0 ? E.x0 + i * run : E.x1 - (i + 1) * run, yTop = y0 + (i + 1) * rs;
      K.box(run, rs, 1.0, xa + run / 2, yTop - rs, L.z, 0x3a3c40, { metal: 0.6, rough: 0.4 });
      K.box(run, 0.012, 0.98, xa + run / 2, yTop, L.z, 0x9aa0a6, { metal: 0.9, rough: 0.3 });
      ctx.cols.add(xa, L.z - 0.5, xa + run, L.z + 0.5, yTop - 0.4, yTop, 'step');
    }
    // giriş/çıkış tarak plakaları
    for (const [x, y] of [[E.rise > 0 ? E.x0 - 0.5 : E.x1 + 0.5, y0], [E.rise > 0 ? E.x1 + 0.5 : E.x0 - 0.5, y0 + RISE]]) K.box(1.0, 0.02, 1.1, x, y, L.z, 0xb8bcc0, { metal: 0.9, rough: 0.3 });
  }
  // korkuluklar: eğimli cam + kara küpeşte (yanlar ve orta) + alt kiriş
  const zs = [E.z0, (E.up.z + E.down.z) / 2, E.z1];
  for (const z of zs) {
    K.gl.add(new THREE.BoxGeometry(len, 0.9, 0.03), { x: mx, y: my + 0.55, z, rz: ang, color: 0xcfe6f0 });
    K.gb.add(new THREE.BoxGeometry(len + 0.6, 0.08, 0.1), { x: mx, y: my + 1.0, z, rz: ang, color: 0x111111, rough: 0.5 });
    K.gb.add(new THREE.BoxGeometry(len, 0.18, 0.12), { x: mx, y: my + 0.05, z, rz: ang, color: 0xc8ccd0, metal: 0.8, rough: 0.3 });
    for (let i = 0; i < NSTEP; i++) {
      const xa = E.rise > 0 ? E.x0 + i * run : E.x1 - (i + 1) * run, yTop = y0 + (i + 1) * rs;
      ctx.cols.add(xa, z - 0.06, xa + run, z + 0.06, yTop - 0.4, yTop + 1.0, 'rail');
    }
  }
  K.gb.add(new THREE.BoxGeometry(len, 0.6, E.z1 - E.z0), { x: mx, y: my - 0.45, z: (E.z0 + E.z1) / 2, rz: ang, color: 0xd8dadc, metal: 0.4, rough: 0.5 });
}

// ---------------------------------------------------------------- mağaza
function buildStore(K, S, ctx, f, x0, x1, side, name, cat, col) {
  const y = fy(f), front = side * 14, back = side * (D / 2), cx = (x0 + x1) / 2, w = x1 - x0, r = ctx.rng;
  const zc = (front + back) / 2, dep = Math.abs(back - front);
  // bölme duvarları + vitrin camı (ortada 3 m kapı) + tabela bandı
  for (const x of [x0, x1]) { K.box(0.16, FH - 0.45, dep, x, y, zc, 0xe8e4dc, { col: true }); }
  const gap = 1.6;
  for (const [a, b] of [[x0 + 0.1, cx - gap], [cx + gap, x1 - 0.1]]) {
    K.glass(b - a, 3.0, 0.04, (a + b) / 2, y, front, {}).box(b - a, 0.08, 0.1, (a + b) / 2, y, front, 0x2a2a2a);
    ctx.cols.add(a, front - 0.05, b, front + 0.05, y, y + 3.0, 'glass');
  }
  K.box(w, FH - 0.45 - 3.0, 0.2, cx, y + 3.0, front, 0x1a1c20);
  S.add(name, col, '#ffffff', Math.min(w - 1, 5.4), 0.9, cx, y + 3.75, front - side * 0.12, side < 0 ? 0 : Math.PI);
  // iç: kategoriye göre
  const inner = (u, v) => [cx + u, front + side * v]; // v: içeri derinlik
  const fams = { giyim: ['#1a1a1a', '#e8e8e8', '#8a1a2a', '#1d3d6e', '#c9b48a', '#5a2d5a', '#d8a0b0'], spor: ['#1a1a1a', '#c81010', '#1a5ad8', '#f2c200', '#e8e8e8'] };
  K.box(w - 0.4, 0.02, dep - 0.2, cx, y + 0.002, zc, cat === 'kuyumcu' ? 0x2a1a1a : cat === 'elektronik' ? 0x3a3a40 : 0xd8c8a8, { rough: 0.6, uv: cat === 'ev' || cat === 'kitap' ? 'wood' : undefined });
  if (cat === 'giyim' || cat === 'spor') {
    for (const u of [-2.2, 0, 2.2]) {
      const [x, z] = inner(u, 3.6);
      K.box(1.6, 0.04, 0.04, x, y + 1.45, z, 0xc8ccd0, { metal: 0.9 }).box(0.04, 1.45, 0.04, x - 0.75, y, z, 0xc8ccd0, { metal: 0.9 }).box(0.04, 1.45, 0.04, x + 0.75, y, z, 0xc8ccd0, { metal: 0.9 });
      ctx.cols.add(x - 0.8, z - 0.3, x + 0.8, z + 0.3, y, y + 1.5, 'rack');
      for (let k = 0; k < 10; k++) K.box(0.05, r.float(0.6, 0.95), 0.42, x - 0.68 + k * 0.15, y + 1.45 - 0.95, z, r.pick(fams[cat]), { rough: 0.95 });
    }
    // duvar rafı + manken
    const [bx, bz] = inner(0, dep - 0.3); K.box(w - 1.2, 2.2, 0.4, bx, y, bz, 0xe8e4dc, { col: true });
    for (let k = 0; k < 18; k++) K.box(0.3, 0.12, 0.3, bx - (w - 1.6) / 2 + (k % 9) * ((w - 1.6) / 8), y + 0.6 + Math.floor(k / 9) * 0.6, bz - side * 0.05, r.pick(fams[cat]));
    for (const u of [-w / 2 + 1, w / 2 - 1]) { const [mx, mz] = inner(u, 1.0); K.cyl(0.04, 0.04, 0.9, mx, y, mz, 0x8a8a8a).box(0.36, 0.55, 0.2, mx, y + 0.95, mz, r.pick(fams.giyim)).box(0.3, 0.45, 0.18, mx, y + 0.5, mz, 0x2a3550).sphere(0.11, mx, y + 1.65, mz, 0xe8e0d8); }
  } else if (cat === 'ayakkabi') {
    for (const u of [-w / 2 + 0.3, w / 2 - 0.3]) { const [x, z] = inner(u, dep / 2); K.box(0.4, 2.2, dep - 1.4, x, y, z, 0xf0ece4, { col: true }); for (let lv = 0; lv < 5; lv++) for (let k = 0; k < 9; k++) K.box(0.22, 0.1, 0.3, x - Math.sign(u) * 0.05, y + 0.3 + lv * 0.4, z - (dep - 2) / 2 + k * ((dep - 2) / 8), r.pick(['#1a1a1a', '#5a3a1a', '#e8e8e8', '#8a1a1a', '#c9b48a'])); }
    const [x, z] = inner(0, 3.8); K.box(1.6, 0.42, 0.6, x, y, z, 0x3a2a1a, { col: true });
  } else if (cat === 'elektronik') {
    const [bx, bz] = inner(0, dep - 0.25);
    for (let k = 0; k < 4; k++) K.box(1.3, 0.75, 0.05, bx - 2.4 + k * 1.6, y + 1.4, bz, 0x0a0a0a).emis(1.22, 0.68, 0.01, bx - 2.4 + k * 1.6, y + 1.43, bz - side * 0.03, ['#2a6ab8', '#c84a2a', '#2a9a5a', '#8a2ab8'][k]);
    for (const u of [-1.8, 1.8]) { const [x, z] = inner(u, 3.4); K.box(1.8, 0.85, 0.9, x, y, z, 0xf0f0f0, { col: true }); for (let k = 0; k < 4; k++) K.box(0.3, 0.02, 0.18, x - 0.6 + k * 0.4, y + 0.86, z, 0x1a1a1a).emis(0.26, 0.005, 0.14, x - 0.6 + k * 0.4, y + 0.882, z, '#4a8ad8'); }
  } else if (cat === 'kitap') {
    for (const u of [-w / 2 + 0.3, w / 2 - 0.3]) { const [x, z] = inner(u, dep / 2); K.box(0.35, 2.3, dep - 1.2, x, y, z, 0x6a4a2a, { col: true, uv: 'wood' }); for (let lv = 0; lv < 6; lv++) for (let k = 0; k < 22; k++) K.box(0.22, r.float(0.2, 0.3), 0.04, x - Math.sign(u) * 0.05, y + 0.1 + lv * 0.37, z - (dep - 1.6) / 2 + k * ((dep - 1.6) / 21), r.pick(['#8a1a1a', '#1d3d6e', '#2d5a2d', '#e8dcc0', '#5a2d5a', '#1a1a1a', '#c9a020'])); }
    const [x, z] = inner(0, 3.6); K.box(2.0, 0.8, 1.0, x, y, z, 0x6a4a2a, { col: true, uv: 'wood' }); for (let k = 0; k < 8; k++) K.box(0.25, 0.04 + k * 0.01, 0.35, x - 0.8 + k * 0.23, y + 0.8, z, r.pick(['#c81010', '#1a5ad8', '#f2c200', '#e8e8e8']));
  } else if (cat === 'kozmetik' || cat === 'kuyumcu') {
    const glow = cat === 'kuyumcu' ? 0xf2d27a : 0xffffff;
    for (const u of [-1.8, 1.8]) { const [x, z] = inner(u, 3.0); K.box(1.6, 0.9, 0.6, x, y, z, cat === 'kuyumcu' ? 0x2a1a1a : 0xf4f0ec, { col: true }); K.glass(1.6, 0.35, 0.6, x, y + 0.9, z); for (let k = 0; k < 10; k++) K.sphere(0.03, x - 0.65 + k * 0.14, y + 0.95, z, glow, { metal: 0.9, rough: 0.2, emis: 0.5 }); }
    const [bx, bz] = inner(0, dep - 0.3); K.box(w - 1.4, 2.2, 0.35, bx, y, bz, 0xf4f0ec, { col: true });
    for (let lv = 0; lv < 4; lv++) for (let k = 0; k < 16; k++) K.product('bottle', bx - (w - 2) / 2 + k * ((w - 2) / 15), y + 0.5 + lv * 0.42, bz - side * 0.1, 0, r.pick(['#f0c0d0', '#d8b8f8', '#ffe8b0', '#1a1a1a', '#e8e8e8', '#c83a5a']), 0.07, 0.16, 0.07);
  } else if (cat === 'oyuncak') {
    for (const u of [-2, 0, 2]) { const [x, z] = inner(u, 3.4); K.box(1.2, 1.2, 1.2, x, y, z, 0xf2f2f2, { col: true }); for (let k = 0; k < 6; k++) K.product('box', x - 0.4 + (k % 3) * 0.4, y + 1.2, z - 0.2 + Math.floor(k / 3) * 0.4, r.next() * 3, r.pick(PALETTES.snack), 0.3, r.float(0.2, 0.45), 0.25); }
    const [bx, bz] = inner(0, dep - 0.6); K.sphere(0.6, bx + 2, y + 0.6, bz, 0xe84a2a).sphere(0.4, bx - 2, y + 0.4, bz, 0x2a8ad8);
  } else { // ev / mobilya / çiçek
    const [x, z] = inner(-1.2, 3.6); K.box(2.2, 0.45, 0.9, x, y, z, r.pick([0x5a6a7a, 0x8a5a3a, 0x3a5a4a]), { col: true }).box(2.2, 0.5, 0.2, x, y + 0.45, z + side * 0.35, 0x5a6a7a);
    const [tx, tz] = inner(1.8, 3.0); K.cyl(0.5, 0.5, 0.04, tx, y + 0.45, tz, 0x8a6a4a).cyl(0.05, 0.05, 0.45, tx, y, tz, 0x2a2a2a);
    ctx.cols.addCircle(tx, tz, 0.5, y, y + 0.5, 'table');
    for (let k = 0; k < 5; k++) K.sphere(0.25, tx - 0.2 + (k % 3) * 0.2, y + 0.6, tz, r.pick(['#e84a6a', '#f2c200', '#ffffff', '#c86ad8']));
  }
  // tezgâh (kasa) arka köşede
  const [kx, kz] = inner(w / 2 - 1.3, dep - 1.6);
  K.box(1.6, 1.0, 0.6, kx, y, kz, 0x2a2a2a, { col: true }).box(1.7, 0.04, 0.7, kx, y + 1.0, kz, 0xe8e4dc).register(kx, y + 1.04, kz, side < 0 ? Math.PI : 0);
  const browse = [inner(-1.1, 2.4), inner(1.1, 2.4), inner(0, 5.2)].map(([x, z]) => ({ x, z, h: side < 0 ? Math.PI : 0 }));
  return { f, x0, x1, cx, side, front, name, cat, browse, clerk: { x: kx, z: kz + (side < 0 ? -0.7 : 0.7), h: side < 0 ? 0 : Math.PI }, inside: { x: cx, z: front + side * 3 } };
}

// ---------------------------------------------------------------- hipermarket (zemin, kuzey batı)
function buildHyper(K, S, ctx) {
  const y = 0, r = ctx.rng, front = -14;
  K.box(0.16, FH - 0.45, 8, -8, 0, -18, 0xe8e4dc, { col: true });
  K.box(24, FH - 0.45 - 3.4, 0.2, -20, 3.4, front, 0xc8401a);
  S.add('BOLLUK HİPERMARKET', '#c8401a', '#ffffff', 10, 1.2, -20, 3.95, front + 0.12, 0);
  // reyonlar (batı kısmı), dolaplar (arka duvar)
  const gx = [-30, -27, -24, -21, -18];
  gx.forEach((x, i) => K.gondola(x, -18.3, 4.0, Math.PI / 2, [['snack', 'can'], ['dairy', 'snack'], ['clean', 'snack'], ['drink', 'water'], ['snack', 'can']][i], [['can', 'snack'], ['snack', 'clean'], ['snack', 'dairy'], ['water', 'drink'], ['clean', 'snack']][i], { cap: [0xd8402a, 0x2a6ad8, 0x2a9a3a, 0xe8a01a, 0x8a2ab8][i], h: 1.7 }));
  for (let i = 0; i < 6; i++) K.fridge(-30.4 + i * 2.1, -D / 2 + 0.45, 2.0, 0, ['dairy', 'drink', 'water', 'dairy', 'can'], { trim: i % 2 ? 0x1a5ad8 : 0xc8202a });
  // kasalar: 3 şerit; müşteri şerit boyunca güneye (koridora) çıkar
  const lanes = [-15.2, -12.8, -10.4].map((x, i) => {
    K.box(0.7, 0.9, 1.9, x + 0.75, 0, -15.3, 0xe8e8e8, { col: true, rough: 0.4 }).box(0.45, 0.02, 1.5, x + 0.75, 0.9, -15.6, 0x1a1a1a);
    K.register(x + 0.85, 0.92, -14.7, -Math.PI / 2);
    K.box(0.08, 1.9, 0.08, x + 0.4, 0, -16.3, 0xc8ccd0, { metal: 0.8 }).emis(0.4, 0.3, 0.06, x + 0.4, 1.9, -16.3, 0x40ff90);
    S.add(String(i + 1), '#1a1a1a', '#40ff90', 0.32, 0.26, x + 0.4, 2.36, -16.25, 0);
    // şerit ayırıcı + kasa önü standı
    K.box(0.35, 1.25, 0.9, x - 0.55, 0, -16.9, 0x3a3a3a, { col: true });
    for (let k = 0; k < 12; k++) K.product('box', x - 0.55, 0.15 + Math.floor(k / 4) * 0.36, -17.25 + (k % 4) * 0.23, Math.PI / 2, r.pick(PALETTES.snack), 0.12, 0.16, 0.06);
    return { x, i, q: [], payT: 0, served: 0, cashier: { x: x + 1.45, z: -15.3, h: -Math.PI / 2 } };
  });
  // sepet/araba alanı
  for (let i = 0; i < 5; i++) K.box(0.55, 0.45, 0.85, -31 + i * 0.3, 0.45, -15.2, 0x9aa0a8, { metal: 0.8, rough: 0.4 });
  ctx.cols.add(-31.6, -15.7, -29.4, -14.6, 0, 1.0, 'furn');
  return { lanes, aisles: gx.flatMap((x) => [{ x: x + 0.9, z: -18.3, h: -Math.PI / 2 }, { x: x - 0.9, z: -18.3, h: Math.PI / 2 }]) };
}

// ---------------------------------------------------------------- yemek katı (2. kat, güney)
function buildFoodCourt(K, S, ctx) {
  const y = fy(2), r = ctx.rng, front = 14.6;
  const kiosks = KIOSKS.map((name, i) => {
    const x0 = -32 + i * 8, cx = x0 + 4;
    K.box(0.16, FH - 0.45, D / 2 - 14, x0, y, (14 + D / 2) / 2, 0xe8e4dc, { col: true });
    K.box(6.4, 1.05, 0.7, cx, y, front, SIGN_COL[i % SIGN_COL.length] === '#1a1a1a' ? 0x3a3a3a : new THREE.Color(SIGN_COL[i % SIGN_COL.length]).getHex(), { col: true });
    K.box(6.5, 0.05, 0.8, cx, y + 1.05, front, 0xd8d4cc, { rough: 0.2 });
    K.register(cx - 2.2, y + 1.1, front, Math.PI);
    K.box(3.5, 1.0, 0.7, cx + 0.8, y, front + 2.3, 0xc8ccd0, { metal: 0.8, rough: 0.3 }); // ocak/tezgâh
    K.emis(4.4, 1.1, 0.04, cx, y + 2.4, D / 2 - 0.1, ['#f2c200', '#e86a10', '#c84a2a', '#2a8ad8', '#2a9a5a', '#c84a6a', '#8a2ab8', '#e8a01a'][i], Math.PI);
    S.add(name, SIGN_COL[(i + 3) % SIGN_COL.length], '#ffffff', 4.6, 0.85, cx, y + 3.6, front - 0.36, Math.PI);
    for (let k = 0; k < 4; k++) K.box(0.38, 0.06, 0.26, cx - 1.2 + k * 0.5, y + 1.1, front - 0.15, 0x7a4a24).sphere(0.08, cx - 1.2 + k * 0.5, y + 1.18, front - 0.15, PALETTES.fruit[(i + k) % 6], { sy: 0.5 });
    return { i, cx, x: cx - 1.2, z: front - 0.75, q: [], payT: 0, served: 0, cook: { x: cx, z: front + 1.0, h: Math.PI } };
  });
  // masalar: 2 sıra × 14 masa, 4'er sandalye
  const seats = [], tables = [];
  for (let x = -29; x <= 29.5; x += 4.4) for (const z of [6.7, 9.5]) {
    K.table(x, z, 1.2, 0.8, 0xf0ece4, { y, leg: 0x4a4a4a });
    tables.push({ x, z });
    for (const [dx, dz, h] of [[-0.32, -0.62, 0], [0.32, -0.62, 0], [-0.32, 0.62, Math.PI], [0.32, 0.62, Math.PI]]) {
      const s = K.chair(x + dx, z + dz, h, r.pick([0xc8401a, 0x2a2a2a, 0x2a6ad8]), { y, legs: 0x8a8a8a, metal: false });
      s.tray = { x: x + dx, z: z + dz * 0.42 }; s.tx = x; s.approach = z + dz + (h === 0 ? -0.55 : 0.55);
      seats.push(s);
    }
  }
  // chair() y ofsetini koltuğa da yaz
  for (const s of seats) s.y = y;
  return { kiosks, seats, tables };
}

// ---------------------------------------------------------------- yollar
function route(f, a, b) {
  const y = fy(f), sa = a.z < 0 ? -1 : 1, sb = b.z < 0 ? -1 : 1, la = lane(f, sa), lb = lane(f, sb);
  const pts = [{ x: a.x, y, z: la }];
  if (sa !== sb) {
    const mid = (a.x + b.x) / 2; let cx = crossings(f)[0];
    for (const c of crossings(f)) if (Math.abs(c - mid) < Math.abs(cx - mid)) cx = c;
    pts.push({ x: cx, y, z: la }, { x: cx, y, z: lb });
  }
  pts.push({ x: b.x, y, z: lb }, { x: b.x, y, z: b.z });
  return pts;
}
// kat değiştirme: bir kat yukarı/aşağı yürüyen merdiven yolu
function floorHop(f, from, up) {
  const E = up ? ESC[f] : ESC[f - 1];
  const L = up ? E.up : E.down, fBase = E.f0, yb = fy(fBase), yt = fy(fBase + 1);
  const baseX = E.rise > 0 ? E.x0 : E.x1, topX = E.rise > 0 ? E.x1 : E.x0, out = E.rise > 0 ? 1 : -1;
  if (up) {
    const pre = { x: baseX - out * 0.9, z: L.z };
    return { f: f + 1, pts: [...route(f, from, pre), { x: baseX, y: yb, z: L.z }, { x: topX, y: yt, z: L.z, ride: ESC_V }, { x: topX + out * 0.9, y: yt, z: L.z }] };
  }
  const pre = { x: topX + out * 0.9, z: L.z };
  return { f: f - 1, pts: [...route(f, from, pre), { x: topX, y: yt, z: L.z }, { x: baseX, y: yb, z: L.z, ride: ESC_V }, { x: baseX - out * 0.9, y: yb, z: L.z }] };
}

// ---------------------------------------------------------------- nüfus
function populate(ctx, M, r) {
  const C = M.crowd, low = C.max < 70;
  // personel: büfe aşçıları, kasiyerler, birkaç tezgâhtar
  for (const k of M.food.kiosks) { const a = C.spawn(k.cook.x, fy(2), k.cook.z, k.cook.h, lookOf(r), { state: 'idle', t: 1e9, role: 'staff', floor: 2 }); if (a) { a.faceH = k.cook.h; a.talk = true; } }
  for (const L of M.hyper.lanes) { const a = C.spawn(L.cashier.x, 0, L.cashier.z, L.cashier.h, lookOf(r, L.i === 1 ? 'm' : 'f'), { state: 'idle', t: 1e9, role: 'staff' }); if (a) a.faceH = L.cashier.h; }
  M.stores.filter((s, i) => i % 3 === 0).slice(0, low ? 4 : 7).forEach((s) => { const a = C.spawn(s.clerk.x, fy(s.f), s.clerk.z, s.clerk.h, lookOf(r), { state: 'idle', t: 1e9, role: 'staff', floor: s.f }); if (a) a.faceH = s.clerk.h; });
  // gezenler
  const nW = low ? 10 : 18;
  for (let i = 0; i < nW; i++) { const f = i % 3; const s = r.pick(M.stores.filter((st) => st.f === f)); const b = s.browse[i % s.browse.length]; const a = C.spawn(b.x, fy(f), b.z, b.h, lookOf(r), { role: 'shopper', floor: f, state: 'idle', t: r.next() * 6 }); if (a) a.faceH = b.h; }
  // yemek katı: masada yiyenler (çiftler, aileler, arkadaşlar)
  const seats = M.food.seats, nEat = low ? 16 : 26;
  const order = seats.map((s, i) => i).sort(() => r.next() - 0.5);
  let eat = 0;
  for (const i of order) {
    if (eat >= nEat) break;
    const s = seats[i]; if (s.occupant) continue;
    const a = C.spawn(s.x, s.y, s.z, s.heading, lookOf(r), { role: 'diner', floor: 2 });
    if (!a) break;
    C.sit(a, s, true); a.t = 20 + r.next() * 70; a.talk = r.chance(0.3); eat++;
    // masa arkadaşı (karşısı ya da yanı)
    const mate = seats[i ^ 1]; if (mate && !mate.occupant && r.chance(0.6) && eat < nEat) { const b = C.spawn(mate.x, mate.y, mate.z, mate.heading, lookOf(r), { role: 'diner', floor: 2 }); if (b) { C.sit(b, mate, true); b.t = a.t + r.next() * 8; b.talk = true; eat++; } }
  }
  // büfe sıraları (2-3 kişi) ve hipermarket kasa sıraları (2-4 kişi)
  for (const k of M.food.kiosks) { const n = r.int(0, 2) + (k.i % 2); for (let j = 0; j < n; j++) joinQueue(M, k, spawnAt(M, r, 2, kioskSlot(k, k.q.length)), true); }
  for (const L of M.hyper.lanes) { const n = r.int(2, 4); for (let j = 0; j < n; j++) joinQueue(M, L, spawnAt(M, r, 0, laneSlot(L, L.q.length)), true); }
  updateTrays(ctx, M);
}
function spawnAt(M, r, f, p) { const a = M.crowd.spawn(p.x, fy(f), p.z, p.h || 0, lookOf(r), { role: 'shopper', floor: f }); return a; }
const kioskSlot = (k, i) => ({ x: k.x, z: k.z - i * 0.85, h: 0 });
const laneSlot = (L, i) => ({ x: L.x, z: -15.3 - i * 0.85, h: 0 });

function joinQueue(M, Q, a, instant = false) {
  if (!a) return;
  Q.q.push(a); a.queue = Q; a.role = Q.cook ? 'kiosk' : 'checkout';
  const slot = Q.cook ? kioskSlot(Q, Q.q.length - 1) : laneSlot(Q, Q.q.length - 1);
  const y = Q.cook ? fy(2) : 0;
  if (instant) { a.x = slot.x; a.z = slot.z; a.y = y; a.state = 'queue'; a.faceH = 0; }
  else if (Q.cook) { M.crowd.go(a, route(2, a, { x: slot.x, z: slot.z }), 'queue', 0); a.faceAfter = 0; }
  else { M.crowd.go(a, [{ x: slot.x, y: 0, z: slot.z }], 'queue', 0); a.faceAfter = 0; } // arka koridordan şeride
  M.stats.queueMax = Math.max(M.stats.queueMax, Q.q.length);
}
// sıra ilerler: baştaki ödeme yapınca ayrılır, arkadakiler bir adım öne gelir
function tickQueue(M, Q, dt, r) {
  const head = Q.q[0];
  if (!head) return;
  if (head.state !== 'queue') return; // henüz yerine varmadı
  Q.payT += dt;
  head.faceH = Q.cook ? 0 : Math.PI / 2; // büfeye / kasiyere dön
  head.talk = Q.payT > 1 && Q.payT < 3.5;
  if (Q.payT < (Q.cook ? 5.5 : 4.5) + (head.id % 3)) return;
  Q.payT = 0; Q.served++; Q.q.shift(); head.queue = null; head.talk = false;
  if (Q.cook) { M.stats.kioskServed++; goSitEat(M, head, r); } else { M.stats.served++; const s = r.pick(M.stores.filter((st) => st.f === 0)); M.crowd.go(head, [{ x: Q.x, y: 0, z: -12.5 }, ...route(0, { x: Q.x, z: -12.5 }, s.browse[0])], 'idle', 4); head.faceAfter = s.browse[0].h; }
  Q.q.forEach((a, i) => {
    const s = Q.cook ? kioskSlot(Q, i) : laneSlot(Q, i);
    if (a.state === 'queue') { M.crowd.go(a, [{ x: s.x, y: a.y, z: s.z }], 'queue', 0); a.faceAfter = 0; }
    else if (a.path.length) { const last = a.path[a.path.length - 1]; last.x = s.x; last.z = s.z; }
  });
}
function goSitEat(M, a, r) {
  const free = M.food.seats.filter((s) => !s.occupant);
  if (!free.length) { wander(M, a, r); return; }
  // tepsiyle en yakın boş sandalyeye
  let best = free[0], bd = 1e9;
  for (const s of free) { const d = Math.hypot(s.x - a.x, s.z - a.z) + r.next() * 4; if (d < bd) { bd = d; best = s; } }
  best.occupant = a; // yolda başkası kapmasın
  const col = best.tx + 2.2, y = a.y; // masa arası sütundan sandalyenin arkasına
  M.crowd.go(a, [{ x: a.x, y, z: 11.3 }, { x: col, y, z: 11.3 }, { x: col, y, z: best.approach }, { x: best.x, y, z: best.approach }], 'idle', 0);
  a.onArrive = (b) => { best.occupant = null; M.crowd.sit(b, best, true); b.t = 30 + r.next() * 50; b.role = 'diner'; updateTrays(null, M); };
}
function wander(M, a, r) {
  const f = a.floor;
  const roll = r.next();
  if (roll < 0.22 && f < 2) { const h = floorHop(f, a, true); a.floor = h.f; M.crowd.go(a, h.pts, 'idle', 0.5); return; }
  if (roll < 0.36 && f > 0) { const h = floorHop(f, a, false); a.floor = h.f; M.crowd.go(a, h.pts, 'idle', 0.5); return; }
  if (f === 2 && roll < 0.6) { const k = r.pick(M.food.kiosks); if (k.q.length < 3) { joinQueue(M, k, a); return; } }
  if (f === 0 && roll < 0.55) { const b = r.pick(M.hyper.aisles); M.crowd.go(a, [...route(0, a, { x: -22, z: -13.2 }), { x: -22, y: 0, z: -15.4 }, { x: b.x, y: 0, z: -15.4 }, { x: b.x, y: 0, z: b.z }], 'idle', 5 + r.next() * 6); a.faceAfter = b.h; a.hyper = true; return; }
  const s = r.pick(M.stores.filter((st) => st.f === f)), b = r.pick(s.browse);
  M.crowd.go(a, route(f, a, { x: b.x + (r.next() - 0.5), z: b.z }), 'idle', 5 + r.next() * 9); a.faceAfter = b.h;
}
// yönetmen: süresi dolan ajana yeni iş
function director(M, r) {
  return (a) => {
    if (a.role === 'staff') { a.t = 1e9; return; }
    if (a.state === 'sit') { // yemeğini bitirdi: kalk, gez
      const s = a.seat; a.st.sit = false; if (s) { s.occupant = null; a.seat = null; }
      a.role = 'shopper'; updateTrays(null, M);
      if (s && s.tx !== undefined) { const col = s.tx + 2.2; M.crowd.go(a, [{ x: s.x, y: a.y, z: s.approach }, { x: col, y: a.y, z: s.approach }, { x: col, y: a.y, z: 11.3 }], 'idle', 0.2); }
      else M.crowd.go(a, [{ x: a.x, y: a.y, z: a.z }], 'idle', 0.2);
      return;
    }
    if (a.hyper) { a.hyper = false; let L = M.hyper.lanes[0]; for (const l of M.hyper.lanes) if (l.q.length < L.q.length) L = l; if (L.q.length < 6) { M.crowd.go(a, [{ x: a.x, y: 0, z: -20.85 }, { x: L.x, y: 0, z: -20.85 }], 'idle', 0); a.onArrive = (b) => joinQueue(M, L, b); return; } }
    wander(M, a, r);
  };
}

// tepsiler (yemek katında oturanların önünde): tek InstancedMesh, boş sandalyede gizli
function updateTrays(ctx, M) {
  if (!M.trays) {
    if (!ctx) return;
    const gb = new GeoBuilder();
    gb.box(0.36, 0.02, 0.27, { color: 0x7a4a24, rough: 0.6 }); gb.cyl(0.11, 0.09, 0.02, 14, { y: 0.02, color: 0xffffff, rough: 0.3 });
    gb.sphere(0.06, { x: 0.02, y: 0.05, color: 0xb8602a, sy: 0.5 }, 8, 5); gb.sphere(0.04, { x: -0.04, y: 0.05, z: 0.03, color: 0x3a8a2a, sy: 0.6 }, 6, 4);
    gb.cyl(0.035, 0.03, 0.12, 10, { x: 0.13, z: -0.08, color: 0xc81a1a, rough: 0.5 });
    const im = new THREE.InstancedMesh(gb.build(), propsMaterial(), M.food.seats.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    ctx.scene.add(im); M.trays = im;
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  let n = 0;
  M.food.seats.forEach((s, i) => {
    const on = s.occupant && s.occupant.state === 'sit';
    if (on) n++;
    q.setFromAxisAngle(up, s.heading);
    m.compose(new THREE.Vector3(s.tray.x, s.y + 0.751, s.tray.z), q, on ? new THREE.Vector3(1, 1, 1) : new THREE.Vector3(0, 0, 0));
    M.trays.setMatrixAt(i, m);
  });
  M.trays.instanceMatrix.needsUpdate = true;
  M.stats.seated = n;
}

// ---------------------------------------------------------------- kare güncellemesi
function updateMall(game, ctx, M, dt) {
  const p = game.player, r = ctx.rng;
  M.dir = M.dir || director(M, r);
  if (!M.panic) {
    for (const L of M.hyper.lanes) tickQueue(M, L, dt, r);
    for (const k of M.food.kiosks) tickQueue(M, k, dt, r);
    // sıralar boşalmasın: hipermarket reyonundan / yemek katı koridorundan yeni müşteri (oyuncunun görmediği yerden)
    M.queueT = (M.queueT || 0) - dt;
    if (M.queueT <= 0) {
      M.queueT = 2.5;
      const hidden = (x, y, z) => Math.abs(y - p.pos.y) > 2 || Math.hypot(x - p.pos.x, z - p.pos.z) > 12;
      // kalabalık tavandaysa görünmeyen bir gezgini "AVM'den çıkmış" say (yer aç)
      if (M.crowd.agents.length >= M.crowd.max - 1) { const v = M.crowd.agents.find((a) => a.role === 'shopper' && !a.queue && !a.seat && !a.hyper && (a.state === 'idle' || a.state === 'walk') && hidden(a.x, a.y, a.z)); if (v) M.crowd.remove(v); }
      const L = M.hyper.lanes.reduce((a, b) => (b.q.length < a.q.length ? b : a));
      const pending = M.crowd.agents.filter((a) => a.hyper).length;
      if (L.q.length < 3 && pending < 3) { const b = r.pick(M.hyper.aisles); if (hidden(b.x, 0, b.z)) { const a = M.crowd.spawn(b.x, 0, b.z, b.h, lookOf(r), { role: 'shopper', floor: 0, state: 'idle', t: 2 + r.next() * 4 }); if (a) { a.hyper = true; a.faceH = b.h; } } }
      const k = M.food.kiosks.reduce((a, b) => (b.q.length < a.q.length ? b : a));
      if (k.q.length < 2) { const x = k.x + (r.next() < 0.5 ? -6 : 6); if (hidden(x, fy(2), 11.3)) joinQueue(M, k, M.crowd.spawn(x, fy(2), 11.3, 0, lookOf(r), { role: 'shopper', floor: 2 })); }
    }
    // nüfus dengesi: eksilen müşteri bir mağazadan çıkar (oyuncu bakmıyorken)
    M.spawnT -= dt;
    if (M.spawnT <= 0) {
      M.spawnT = 3;
      const shoppers = M.crowd.agents.filter((a) => a.role !== 'staff').length;
      if (shoppers < M.crowd.max - 14) {
        const s = r.pick(M.stores), b = s.inside;
        if (Math.abs(fy(s.f) - p.pos.y) > 2 || Math.hypot(b.x - p.pos.x, b.z - p.pos.z) > 14) { const a = M.crowd.spawn(b.x, fy(s.f), b.z, 0, lookOf(r), { role: 'shopper', floor: s.f, state: 'idle', t: 0.5 }); void a; }
      }
    }
  }
  M.crowd.update(dt, game.camera, M.dir);
  // yürüyen merdiven: oyuncuyu taşı
  if (!p.vehicle && !p.dead) for (const E of ESC) for (const L of [E.up, E.down]) {
    if (p.pos.x < E.x0 - 0.3 || p.pos.x > E.x1 + 0.3 || Math.abs(p.pos.z - L.z) > 0.5) continue;
    const yb = fy(E.f0); if (p.pos.y < yb - 0.1 || p.pos.y > yb + RISE + 0.3) continue;
    const dir = (L === E.up ? 1 : -1) * E.rise; // +1: +x yönünde taşı
    p.pos.x += dir * ESC_V * dt;
  }
  updateElevator(game, ctx, M, dt, p);
}
function mallPanic(game, M, x, z) {
  if (M.panic) return;
  M.panic = true;
  for (const Q of [...M.hyper.lanes, ...M.food.kiosks]) { Q.q.length = 0; }
  M.crowd.panic(x, z, (a) => {
    // en yakın mağazanın arka tarafına koş ve kaybol
    let best = M.stores[0], bd = 1e9;
    for (const s of M.stores) { if (s.f !== a.floor) continue; const d = Math.hypot(s.inside.x - a.x, s.inside.z - a.z) - Math.hypot(s.inside.x - x, s.inside.z - z) * 0.5; if (d < bd) { bd = d; best = s; } }
    return [...route(a.floor, a, best.inside), { x: best.cx, y: fy(a.floor), z: best.side * (D / 2 - 1) }];
  });
  if (M.trays) { M.trays.visible = false; }
  game.ui.notify('AVM\'de panik! Müşteriler kaçışıyor.', 'warn');
}

function updateElevator(game, ctx, M, dt, p) {
  const E = ctx.elevator, cab = M.cabin, V = 2.2;
  const move = (ty) => { const d = ty - E.y; const s = Math.sign(d) * Math.min(Math.abs(d), V * dt); E.y += s; return Math.abs(ty - E.y) < 0.01; };
  if (E.phase === 'call') { if (move(fy(E.from))) { E.phase = 'board'; E.t = 0.6; } }
  else if (E.phase === 'board') { E.t -= dt; if (E.t <= 0) { E.phase = 'ride'; E.rides++; game.audio && game.audio.click && game.audio.click(); } }
  else if (E.phase === 'ride') { const done = move(fy(E.to)); p.pos.set(ELEV.cx, E.y + 0.12, ELEV.cz); p.vy = 0; p.vx = 0; p.vz = 0; p.heading = -Math.PI / 2; if (done) { E.phase = 'exit'; E.t = 0.4; } }
  else if (E.phase === 'exit') { E.t -= dt; p.pos.set(ELEV.cx, E.y + 0.12, ELEV.cz); p.vy = 0; if (E.t <= 0) { p.pos.set(ELEV.door.x - 0.6, fy(E.to), ELEV.door.z); p.vy = 0; p.camInit = false; E.phase = 'idle'; } }
  cab.position.y = E.y;
}

export const MALL = { W, D, FH, NF, ESC, ELEV, AT };
