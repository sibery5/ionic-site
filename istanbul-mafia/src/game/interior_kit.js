// [şehir] İç mekân donatı takımı: birleşik statik geometri (tek çizim çağrısı), örneklenmiş ürünler
// (kutu / kutu içecek / şişe / meyve — her biri tek InstancedMesh, örnek başına renk), raf, buzdolabı, tezgâh,
// yazar kasa, ışık panelleri ve oturma/yatma yerleri (ctx.furnSeats → citylife.js E istemi).
import * as THREE from 'three';
import { GeoBuilder } from '../world/instancer.js';
import { propsMaterial } from '../world/shaders.js';
import { makeCanvas, PROP_UV } from '../core/textures.js';

let MAT = null, GLASS = null, EMIS = null, LABEL = null;
const mats = () => {
  if (!MAT) {
    MAT = propsMaterial();
    GLASS = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false });
    EMIS = new THREE.MeshBasicMaterial({ vertexColors: true });
    // ürün etiketi: beyaz zemin üstünde koyu yazı çizgileri ve parlak bant; örnek rengiyle çarpılır
    const c = makeCanvas(64, 64), g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 64, 7); g.fillRect(0, 57, 64, 7);
    g.fillStyle = '#fbfbf4'; g.fillRect(0, 22, 64, 20);
    g.fillStyle = 'rgba(40,30,30,0.85)'; g.fillRect(8, 26, 40, 4); g.fillRect(8, 33, 28, 3);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(0, 12, 64, 3);
    LABEL = new THREE.CanvasTexture(c); LABEL.colorSpace = THREE.SRGBColorSpace;
  }
  return { MAT, GLASS, EMIS, LABEL };
};

// ürün biçimleri (taban y=0)
const PGEO = {};
function pgeo(kind) {
  if (PGEO[kind]) return PGEO[kind];
  let g;
  if (kind === 'box') { g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); }
  else if (kind === 'can') { g = new THREE.CylinderGeometry(0.5, 0.5, 1, 10); g.translate(0, 0.5, 0); }
  else if (kind === 'bottle') {
    const pts = [[0, 0], [0.5, 0], [0.5, 0.62], [0.42, 0.7], [0.2, 0.84], [0.2, 0.96], [0.24, 0.97], [0.24, 1], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y));
    g = new THREE.LatheGeometry(pts, 10);
  } else if (kind === 'fruit') g = new THREE.SphereGeometry(0.5, 8, 6);
  else if (kind === 'bag') { g = new THREE.CylinderGeometry(0.42, 0.5, 1, 8); g.translate(0, 0.5, 0); g.scale(1, 1, 0.55); }
  g.userData.shared = true;
  PGEO[kind] = g;
  return g;
}

// birim kutu şablonu (indekssiz, taban y=0): hızlı yol — her kutu için geometri nesnesi kurulmaz
let UB = null;
function unitBox() {
  if (!UB) { const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); g.translate(0, 0.5, 0); UB = { p: g.attributes.position.array, n: g.attributes.normal.array, uv: g.attributes.uv.array }; }
  return UB;
}
const _c2 = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);

// Ürün renk aileleri (kurgusal ambalajlar)
export const PALETTES = {
  snack: ['#d8241c', '#f2b800', '#1e5bc6', '#e86a10', '#7a2a8a', '#2d8a3d', '#c81060', '#3a2a1a', '#f0e6c8'],
  drink: ['#c8102e', '#1a1a1a', '#f2c200', '#2d8a3d', '#e86a10', '#5ab8ff', '#ffffff', '#7a1a4a'],
  water: ['#bfe4ff', '#d8f0ff', '#a8d8f8'],
  dairy: ['#ffffff', '#f4f0e0', '#bfe0ff', '#ffe8b0'],
  clean: ['#2a8ad8', '#e8f0f8', '#f05a9a', '#7ad84a', '#ffb000'],
  can: ['#c8102e', '#d8d8d8', '#1a5ad8', '#2d8a3d', '#f2c200', '#4a2a1a'],
  fruit: ['#d82a1a', '#f2a01a', '#f2d81a', '#5ac83a', '#7a1a3a', '#e8601a'],
  cig: ['#ffffff', '#c81a1a', '#1a3a8a', '#d8c8a0', '#1a1a1a', '#8a8a8a'],
};

export class Kit {
  constructor(I, ctx) {
    this.I = I; this.ctx = ctx; this.r = ctx.rng;
    this.gb = new GeoBuilder(); this.gl = new GeoBuilder(); this.em = new GeoBuilder();
    this.P = { box: [], can: [], bottle: [], fruit: [], bag: [] };
    ctx.furnSeats = ctx.furnSeats || [];
  }
  // kutu: taban y; rot y ekseninde, merkez etrafında
  box(w, h, d, x, y, z, color, o = {}) {
    // hızlı yol: doğrudan dizilere yaz (AVM'de binlerce kutu)
    const U = unitBox(), F = this.fast || (this.fast = { p: [], n: [], uv: [], c: [], k: [] });
    const rot = o.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot), r = PROP_UV[o.uv || 'white'];
    _c2.set(color === undefined ? 0xffffff : color);
    const rough = o.rough ?? 0.7, metal = o.metal || 0, emis = o.emis || 0;
    for (let i = 0; i < 36; i++) {
      const px = U.p[i * 3] * w, py = U.p[i * 3 + 1] * h, pz = U.p[i * 3 + 2] * d;
      F.p.push(x + px * cs + pz * sn, y + py, z - px * sn + pz * cs);
      const nx = U.n[i * 3], ny = U.n[i * 3 + 1], nz = U.n[i * 3 + 2];
      F.n.push(nx * cs + nz * sn, ny, -nx * sn + nz * cs);
      const u = o.uv ? U.uv[i * 2] : 0.5, v = o.uv ? U.uv[i * 2 + 1] : 0.5;
      F.uv.push(r[0] + (r[2] - r[0]) * u, r[1] + (r[3] - r[1]) * v);
      F.c.push(_c2.r, _c2.g, _c2.b); F.k.push(rough, metal, emis, 0);
    }
    if (o.col) this.ctx.cols.addRotated(x, z, w + (o.pad || 0), d + (o.pad || 0), o.rot || 0, y, y + h, o.tag || 'furn');
    return this;
  }
  cyl(rt, rb, h, x, y, z, color, o = {}) { this.gb.cyl(rt, rb, h, o.seg || 12, { x, y, z, color, rough: o.rough ?? 0.6, metal: o.metal || 0, emis: o.emis || 0 }); if (o.col) this.ctx.cols.addCircle(x, z, Math.max(rt, rb), y, y + h, o.tag || 'furn'); return this; }
  sphere(r, x, y, z, color, o = {}) { this.gb.sphere(r, { x, y, z, color, rough: o.rough ?? 0.5, metal: o.metal || 0, emis: o.emis || 0, sx: o.sx, sy: o.sy, sz: o.sz }, o.ws || 10, o.hs || 6); return this; }
  glass(w, h, d, x, y, z, o = {}) { this.gl.box(w, h, d, { x, y, z, ry: o.rot || 0, color: o.color || 0xcfe6f0 }); if (o.col) this.ctx.cols.addRotated(x, z, w, d, o.rot || 0, y, y + h, 'glass'); return this; }
  light(w, d, x, y, z, color = 0xfff8ec) { this.em.box(w, 0.04, d, { x, y: y - 0.04, z, color }); return this; }
  emis(w, h, d, x, y, z, color, rot = 0) { this.em.box(w, h, d, { x, y, z, ry: rot, color }); return this; }
  // yerel → dünya (rot etrafında)
  static L(x, z, rot, lx, lz) { const c = Math.cos(rot), s = Math.sin(rot); return [x + lx * c + lz * s, z - lx * s + lz * c]; }
  product(kind, x, y, z, rot, color, sx, sy, sz) { this.P[kind].push([x, y, z, rot, color, sx, sy, sz]); }

  // Raf ünitesi (duvar rafı / tek yüzlü): ön yüz yerel +z; w uzunluk; ürün ailesi listesi
  shelf(x, z, w, rot, fams, o = {}) {
    const H = o.h || 1.95, D = o.d || 0.48, lv = o.levels || 5, frame = o.frame || 0xe8e8e4, r = this.r;
    const L = (lx, lz) => Kit.L(x, z, rot, lx, lz);
    // gövde: arka pano, yanlar, taban kaidesi
    let [px, pz] = L(0, -D / 2 + 0.02); this.box(w, H, 0.04, px, 0, pz, frame, { rot, rough: 0.5, metal: 0.3 });
    for (const sx of [-1, 1]) { [px, pz] = L(sx * (w / 2 - 0.02), 0); this.box(0.04, H, D, px, 0, pz, frame, { rot, rough: 0.5, metal: 0.3 }); }
    [px, pz] = L(0, 0.02); this.box(w, 0.12, D - 0.04, px, 0, pz, 0x3a3a3a, { rot });
    this.ctx.cols.addRotated(x, z, w, D, rot, 0, H, 'shelf');
    const step = (H - 0.25) / lv;
    for (let k = 0; k < lv; k++) {
      const y = 0.12 + k * step;
      [px, pz] = L(0, 0.02); this.box(w - 0.06, 0.025, D - 0.04, px, y, pz, frame, { rot, rough: 0.4, metal: 0.4 });
      // fiyat şeridi
      [px, pz] = L(0, D / 2 - 0.01); this.box(w - 0.06, 0.035, 0.012, px, y - 0.01, pz, k % 2 ? 0xf2d23a : 0xffffff, { rot, rough: 0.6 });
      if (o.empty) continue;
      // ürünler: aynı üründen 2-6 yüzlük gruplar
      const fam = fams[(k + Math.floor(r.next() * 2)) % fams.length];
      const maxH = step - 0.06;
      let lx = -w / 2 + 0.06;
      while (lx < w / 2 - 0.1) {
        const kind = fam === 'water' || fam === 'drink' ? (r.chance(0.7) ? 'bottle' : 'can') : fam === 'can' ? 'can' : fam === 'fruit' ? 'fruit' : 'box';
        const col = r.pick(PALETTES[fam] || PALETTES.snack);
        let pw, ph, pd;
        if (kind === 'bottle') { pw = fam === 'water' ? 0.085 : 0.075; ph = Math.min(maxH, fam === 'water' ? 0.32 : r.float(0.22, 0.3)); pd = pw; }
        else if (kind === 'can') { pw = 0.066; ph = Math.min(maxH, 0.12); pd = pw; }
        else if (kind === 'fruit') { pw = 0.08; ph = 0.08; pd = 0.08; }
        else { pw = r.float(0.07, 0.22); ph = Math.min(maxH, r.float(0.1, maxH)); pd = r.float(0.06, 0.2); }
        const n = r.int(2, 6), deep = Math.max(1, Math.floor((D - 0.08) / (pd + 0.01)));
        const rows = Math.min(deep, r.int(1, 3));
        for (let i = 0; i < n && lx + pw < w / 2 - 0.05; i++) {
          if (r.chance(0.06)) { lx += pw + 0.01; continue; } // eksik ürün (gerçekçi boşluk)
          for (let j = 0; j < rows; j++) {
            const [qx, qz] = L(lx + pw / 2, D / 2 - 0.04 - pd / 2 - j * (pd + 0.01));
            this.product(kind, qx, y + 0.025, qz, rot, col, pw, ph, pd);
          }
          lx += pw + 0.012;
        }
        lx += 0.02;
      }
    }
    return this;
  }
  // İki yüzlü reyon (gondol): uzun eksen yerel x, iki yüzü ±z
  gondola(x, z, w, rot, famsA, famsB, o = {}) {
    const D = 0.46;
    const [ax, az] = Kit.L(x, z, rot, 0, D / 2), [bx, bz] = Kit.L(x, z, rot, 0, -D / 2);
    this.shelf(ax, az, w, rot, famsA, { ...o, h: o.h || 1.6, d: D });
    this.shelf(bx, bz, w, rot + Math.PI, famsB, { ...o, h: o.h || 1.6, d: D });
    // uç başlık rafı + tabela
    for (const sx of [-1, 1]) { const [ex, ez] = Kit.L(x, z, rot, sx * (w / 2 + 0.2), 0); this.box(0.4, 1.4, D * 2, ex, 0, ez, o.cap || 0xd8402a, { rot, col: true }); }
    return this;
  }
  // Camlı içecek dolabı: ön yüz yerel +z
  fridge(x, z, w, rot, fams = ['drink', 'water', 'dairy', 'drink', 'can'], o = {}) {
    const H = 2.05, D = 0.7, L = (lx, lz) => Kit.L(x, z, rot, lx, lz), r = this.r;
    const body = o.body || 0xf2f2f0, trim = o.trim || 0xc8202a;
    let [px, pz] = L(0, 0); this.box(w, 0.18, D, px, 0, pz, 0x2a2a2a, { rot });
    [px, pz] = L(0, -D / 2 + 0.03); this.box(w, H, 0.06, px, 0, pz, body, { rot });
    for (const sx of [-1, 1]) { [px, pz] = L(sx * (w / 2 - 0.03), 0); this.box(0.06, H, D, px, 0, pz, body, { rot }); }
    [px, pz] = L(0, 0); this.box(w, 0.22, D, px, H - 0.22, pz, trim, { rot, emis: 0.6 });
    this.ctx.cols.addRotated(x, z, w, D, rot, 0, H, 'fridge');
    // iç aydınlatma (soğuk beyaz) + raflar + içecekler
    [px, pz] = L(0, -D / 2 + 0.07); this.emis(w - 0.14, H - 0.5, 0.01, px, 0.2, pz, 0xdff4ff, rot);
    const lv = 5, step = (H - 0.5) / lv;
    for (let k = 0; k < lv; k++) {
      const y = 0.22 + k * step;
      [px, pz] = L(0, 0); this.box(w - 0.14, 0.02, D - 0.12, px, y, pz, 0xd0d8dc, { rot, metal: 0.5, rough: 0.3 });
      const fam = fams[k % fams.length];
      let lx = -w / 2 + 0.1;
      while (lx < w / 2 - 0.12) {
        const kind = fam === 'can' ? 'can' : fam === 'dairy' ? (r.chance(0.5) ? 'box' : 'bottle') : 'bottle';
        const pw = kind === 'can' ? 0.066 : kind === 'box' ? 0.09 : 0.075, ph = kind === 'can' ? 0.12 : kind === 'box' ? 0.2 : Math.min(step - 0.05, r.float(0.24, 0.33));
        const col = r.pick(PALETTES[fam] || PALETTES.drink);
        const n = r.int(3, 6);
        for (let i = 0; i < n && lx < w / 2 - 0.12; i++) {
          for (let j = 0; j < 3; j++) { const [qx, qz] = L(lx + pw / 2, D / 2 - 0.12 - pw / 2 - j * (pw + 0.015)); this.product(kind, qx, y + 0.02, qz, rot, col, pw, ph, pw); }
          lx += pw + 0.012;
        }
      }
    }
    // cam kapılar (çerçeveli)
    const nd = Math.max(1, Math.round(w / 0.75));
    for (let i = 0; i < nd; i++) {
      const lx = -w / 2 + (i + 0.5) * (w / nd);
      [px, pz] = L(lx, D / 2 - 0.01); this.glass(w / nd - 0.04, H - 0.45, 0.02, px, 0.2, pz, { rot });
      [px, pz] = L(lx + (w / nd) / 2 - 0.06, D / 2 + 0.02); this.box(0.03, 0.5, 0.03, px, 0.9, pz, 0xb0b0b0, { rot, metal: 0.8, rough: 0.3 });
      [px, pz] = L(lx - (w / nd) / 2 + 0.01, D / 2); this.box(0.03, H - 0.4, 0.04, px, 0.18, pz, 0x9a9a9a, { rot, metal: 0.6 });
    }
    return this;
  }
  // Yazar kasa + kart okuyucu (tezgâh üstü, y = tezgâh yüksekliği); rot: kasiyerin baktığı yön
  register(x, y, z, rot) {
    const L = (lx, lz) => Kit.L(x, z, rot, lx, lz);
    let [px, pz] = L(0, 0); this.box(0.42, 0.1, 0.38, px, y, pz, 0x2a2a2e, { rot, rough: 0.4 });
    [px, pz] = L(0, 0.05); this.box(0.36, 0.08, 0.22, px, y + 0.1, pz, 0x1a1a1e, { rot });
    [px, pz] = L(0, -0.12); this.box(0.3, 0.2, 0.03, px, y + 0.18, pz, 0x1a1a1e, { rot });
    [px, pz] = L(0, -0.105); this.emis(0.26, 0.15, 0.005, px, y + 0.2, pz, 0x40d890, rot);
    [px, pz] = L(0.32, 0.12); this.box(0.08, 0.04, 0.15, px, y, pz, 0x3a3a3a, { rot }); // kart okuyucu
    return this;
  }
  // Oturma yeri kaydı: (x,z) oturanın ayak noktası, heading baktığı yön, y taban, kind: chair|sofa|armchair|bed
  seat(x, z, heading, kind = 'chair', y = 0, extra = {}) {
    const s = { x, z, y, heading, kind, occupant: null, ...extra };
    this.ctx.furnSeats.push(s);
    return s;
  }
  // Sandalye: (x,z) oturma merkezi, heading oturanın baktığı yön
  chair(x, z, heading, color = 0x5a3a20, o = {}) {
    const rot = heading, L = (lx, lz) => Kit.L(x, z, rot, lx, lz);
    const sh = o.h || 0.46, metal = o.metal ? 0.8 : 0, y0 = o.y || 0;
    let [px, pz] = L(0, 0); this.box(0.44, 0.05, 0.42, px, y0 + sh - 0.05, pz, color, { rot, metal, rough: 0.6 });
    [px, pz] = L(0, -0.2); this.box(0.42, 0.45, 0.04, px, y0 + sh, pz, color, { rot, metal });
    for (const [a, b] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) { [px, pz] = L(a, b); this.box(0.035, sh - 0.05, 0.035, px, y0, pz, o.legs || color, { rot, metal: metal || (o.legs ? 0.7 : 0) }); }
    // oturanın ayak noktası: oturağın merkezi (kalça üstünde, dizler öne)
    const [fx, fz] = L(0, 0.05);
    return this.seat(fx, fz, heading, 'chair', y0, { cx: x, cz: z });
  }
  table(x, z, w, d, color = 0x6a4a2a, o = {}) {
    const h = o.h || 0.75, y = o.y || 0;
    if (o.round) {
      this.cyl(w / 2, w / 2, 0.04, x, y + h - 0.04, z, color, { rough: 0.35, seg: 20 });
      this.cyl(0.04, 0.04, h - 0.04, x, y, z, o.leg || 0x2a2a2a, { metal: 0.7 });
      this.cyl(0.22, 0.24, 0.03, x, y, z, o.leg || 0x2a2a2a, { metal: 0.7 });
      this.ctx.cols.addCircle(x, z, w / 2, y, y + h, 'table');
    } else {
      this.box(w, 0.04, d, x, y + h - 0.04, z, color, { rot: o.rot || 0, rough: 0.4 });
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [px, pz] = Kit.L(x, z, o.rot || 0, a * (w / 2 - 0.05), b * (d / 2 - 0.05)); this.box(0.05, h - 0.04, 0.05, px, y, pz, o.leg || color, { rot: o.rot || 0 }); }
      this.ctx.cols.addRotated(x, z, w, d, o.rot || 0, y, y + h, 'table');
    }
    return this;
  }
  finish() {
    const { MAT, GLASS, EMIS, LABEL } = mats(), s = this.ctx.scene;
    if (this.fast && this.fast.p.length) {
      const F = this.fast, bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(F.p, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(F.n, 3));
      bg.setAttribute('uv', new THREE.Float32BufferAttribute(F.uv, 2)); bg.setAttribute('color', new THREE.Float32BufferAttribute(F.c, 3)); bg.setAttribute('aPBR', new THREE.Float32BufferAttribute(F.k, 4));
      this.gb.parts.push(bg); this.fast = null;
    }
    if (this.gb.parts.length) { const m = new THREE.Mesh(this.gb.build(), MAT); m.receiveShadow = true; m.castShadow = true; s.add(m); }
    if (this.gl.parts.length) { const m = new THREE.Mesh(this.gl.build(), GLASS); m.renderOrder = 3; s.add(m); }
    if (this.em.parts.length) s.add(new THREE.Mesh(this.em.build(), EMIS));
    this.ctx.productCount = (this.ctx.productCount || 0);
    for (const k of Object.keys(this.P)) {
      const L = this.P[k]; if (!L.length) continue;
      const mat = new THREE.MeshStandardMaterial({ map: k === 'fruit' ? null : LABEL, roughness: k === 'bottle' ? 0.25 : 0.55, metalness: k === 'can' ? 0.55 : 0 });
      const im = new THREE.InstancedMesh(pgeo(k), mat, L.length);
      L.forEach(([x, y, z, rot, col, sx, sy, sz], i) => {
        _q.setFromAxisAngle(_up, rot); _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
        im.setMatrixAt(i, _m); im.setColorAt(i, _c.set(col));
      });
      im.instanceColor.needsUpdate = true; im.computeBoundingSphere();
      s.add(im);
      this.ctx.productCount += L.length;
      this.P[k] = [];
    }
  }
}

// Duvara asılı tuval yazı/levha (menü panosu, afiş): fn(ctx2d, w, h) çizer
export function canvasPlane(scene, w, h, x, y, z, rotY, draw, px = 256) {
  const c = makeCanvas(px, Math.round(px * h / w)), g = c.getContext('2d');
  draw(g, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
  m.position.set(x, y, z); m.rotation.y = rotY; scene.add(m);
  return m;
}
