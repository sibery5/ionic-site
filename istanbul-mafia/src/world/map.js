// İstanbul harita düzeni: Boğaz, Haliç, Marmara, köprüler, semtler, yollar, adalar ve parseller.
// Gerçek coğrafyadan esinlenen ölçekli, prosedürel bir yerleşim.
import { RNG, clamp } from '../core/util.js';

export const WORLD_MIN = -1000;
export const WORLD_MAX = 1000;
export const WATER_Y = -1.4;
export const SIDEWALK = 3.2;

const BOSPHORUS = { x0: 200, x1: 420 };
const HORN = { x0: -850, x1: 200, z0: 70, z1: 190 };
const MARMARA_Z = 820;

export const BRIDGES = [
  { name: 'Galata Köprüsü', x0: -160, x1: -140, z0: 60, z1: 200, axis: 'z' },
  { name: 'Unkapanı Köprüsü', x0: -510, x1: -490, z0: 60, z1: 200, axis: 'z' },
  { name: '15 Temmuz Şehitler Köprüsü', x0: 190, x1: 435, z0: -461, z1: -439, axis: 'x' },
];
export const ISLAND = { x: 312, z: 290, r: 16 }; // Kız Kulesi

// ---- Özel bölgeler (oyun sistemleri için dışa aktarılır) ----
// Askeri üs: Beşiktaş'ın kuzeybatı ucu (harita köşesi). Sınırlar yol çizgilerine hizalı, içi yolsuz.
const ZB = 5.5 + 3.2; // yol yarı genişliği + kaldırım
export const MILITARY_BASE = {
  name: 'Askeri Üs', lines: { x0: -985, x1: -700, z0: -985, z1: -760 },
  x0: -985 + ZB, x1: -700 - ZB, z0: -985 + ZB, z1: -760 - ZB,
  gate: { x: -760, z: -760 - ZB, nx: 0, nz: 1 }, // güney kenarındaki nizamiye kapısı
  helipad: { x: -930, z: -930 },
  spawnPoints: [], towers: [], barracks: [], hangar: null, restricted: true,
};
// Havalimanı (Anadolu yakası doğu ucu): pist kuzey-güney.
export const AIRPORT = {
  name: 'Boğaziçi Havalimanı', lines: { x0: 800, x1: 985, z0: -985, z1: -380 },
  x0: 800 + ZB, x1: 985 - ZB, z0: -985 + ZB, z1: -380 - ZB,
  // x0/z/heading: ana oyunun uçak doğma noktası (x0 + 20, z) — pist güney ucunda, kuzeye bakar
  runway: { x0: 930, x1: 962, z0: -965, z1: -415, z: -440, heading: Math.PI, start: { x: 946, z: -430 }, end: { x: 946, z: -955 }, width: 32 },
  taxiway: { x0: 898, x1: 912, z0: -940, z1: -440 },
  apron: { x0: 815, x1: 898, z0: -720, z1: -520 },
  helipads: [{ x: 835, z: -440 }, { x: 870, z: -440 }],
  hangars: [], shop: { x: 830, z: -505 }, planeSpawns: [], heliSpawns: [], terminal: null,
};
// Marina (Avrupa yakası, Boğaz kıyısı): iskeleler suyun üstünde, yürünebilir.
export const MARINA = {
  name: 'Bebek Marina', x0: 200, x1: 262, z0: -700, z1: -560,
  piers: [], berths: [], shop: { x: 217, z: -566 }, entrances: [{ z0: -664, z1: -657 }, { z0: -612, z1: -605 }],
};
// Boğaz kıyısındaki satılık lüks villa/yalı parselleri (CityMap kurulurken doldurulur)
export const VILLAS = [];
// Satılık mülkler (villalar + satın alınabilir apartmanlar)
export const PROPERTIES = [];
// Emniyet müdürlükleri (bayrak, otopark yerleri)
export const POLICE_STATIONS = [];

function inRect(x, z, r) { return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1; }
const PIERS = [
  { x0: 200, x1: 206, z0: -700, z1: -560 }, // kıyı iskelesi
  { x0: 206, x1: 262, z0: -692, z1: -688.5 },
  { x0: 206, x1: 262, z0: -657, z1: -653.5 },
  { x0: 206, x1: 262, z0: -622, z1: -618.5 },
  { x0: 206, x1: 262, z0: -587, z1: -583.5 },
  { x0: 206, x1: 228, z0: -578, z1: -560 }, // kulüp binası platformu
];
MARINA.piers = PIERS;
for (const pz of [-690.25, -655.25, -620.25, -585.25]) for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
  if (pz === -585.25 && side > 0 && i === 0) continue; // kulüp platformu
  MARINA.berths.push({ x: 218 + i * 16, z: pz + side * 6.4, heading: Math.PI / 2, length: 14, width: 5, decor: (i + (side > 0 ? 1 : 0)) % 3 === 0 });
}
export function onPier(x, z) { for (const p of PIERS) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return p; return null; }

export const DISTRICTS = [
  { id: 'besiktas', name: 'BEŞİKTAŞ', x0: -850, x1: 200, z0: -1000, z1: -300, floors: [3, 9], gang: 'kartallar' },
  { id: 'beyoglu', name: 'BEYOĞLU', x0: -850, x1: 200, z0: -300, z1: 70, floors: [4, 7], gang: 'yilanlar' },
  { id: 'eyup', name: 'EYÜPSULTAN', x0: -1000, x1: -850, z0: -1000, z1: 200, floors: [2, 4], gang: 'kurtlar' },
  { id: 'fatih', name: 'FATİH', x0: -1000, x1: 200, z0: 190, z1: 820, floors: [2, 5], gang: 'carsi' },
  { id: 'uskudar', name: 'ÜSKÜDAR', x0: 420, x1: 1000, z0: -1000, z1: 250, floors: [2, 6], gang: 'kurtlar' },
  { id: 'kadikoy', name: 'KADIKÖY', x0: 420, x1: 1000, z0: 250, z1: 820, floors: [4, 8], gang: 'bogaz' },
];

export function inBridge(x, z) {
  for (const b of BRIDGES) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b;
  return null;
}
export function isWater(x, z) {
  if (x < WORLD_MIN || x > WORLD_MAX || z < WORLD_MIN || z > WORLD_MAX) return true;
  if (z > MARMARA_Z) return true;
  if (x > BOSPHORUS.x0 && x < BOSPHORUS.x1) return true;
  if (x > HORN.x0 && x < HORN.x1 && z > HORN.z0 && z < HORN.z1) return true;
  return false;
}
export function isLand(x, z) {
  if (inBridge(x, z)) return true;
  if (x > 199 && x < 263 && z > -701 && z < -559 && onPier(x, z)) return true;
  const dx = x - ISLAND.x, dz = z - ISLAND.z;
  if (dx * dx + dz * dz < ISLAND.r * ISLAND.r) return true;
  return !isWater(x, z);
}
export function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  if (x > 300) return DISTRICTS[4];
  return DISTRICTS[1];
}

function genLines(rng, min, max, forced) {
  const out = [];
  let p = min;
  while (p < max) { out.push(p); p += rng.float(72, 108); }
  const res = forced.slice();
  for (const v of out) if (forced.every((f) => Math.abs(f - v) > 45) && v <= max) res.push(v);
  return res.sort((a, b) => a - b);
}

// Özel mekânlar: [tip, yaklaşık x, z]
const SPECIALS = [
  ['safehouse', -300, -60], ['konak', -60, -160],
  ['gun', -400, -200], ['gun', 650, -300], ['gun', -300, 520],
  ['clothes', -200, -110], ['clothes', 700, 480], ['clothes', -500, -650],
  ['food', -250, -240], ['food', 600, -100], ['food', -600, 400], ['food', 820, 620], ['food', -700, -480], ['food', -930, -100], ['food', 30, -60],
  ['trade', -100, -40], ['trade', 560, 650], ['trade', 800, -600], ['trade', -200, -720], ['trade', -930, -300],
  ['dealer', -600, -820], ['dealer', 760, 340],
  ['bank', -350, -420], ['bank', 600, 520], ['bank', -300, 700],
  ['hospital', -480, 10], ['hospital', 650, 10], ['hospital', -200, 650],
  ['police', -620, -120], ['police', -520, 650], ['police', 820, -220], ['police', -300, -880],
  ['estate', -150, -360],
  ['cafe', -40, -260], ['cafe', 560, -720], ['cafe', -800, 300], ['cafe', 900, 450],
  ['club', -260, -520], ['warehouse', -40, 250], ['warehouse', 950, 780], ['rival', -420, -920],
  ['garage', 900, 700], ['mosque_small', 600, -500], ['mosque_small', -750, -700], ['mosque_small', 850, 300],
];

export const LANDMARKS = [
  { type: 'galata', x: -110, z: 10 },
  { type: 'taksim', x: -250, z: -330 },
  { type: 'bluemosque', x: -160, z: 620 },
  { type: 'ayasofya', x: -20, z: 470 },
  { type: 'sultanahmet_park', x: -90, z: 545 },
  { type: 'bazaar', x: -450, z: 430 },
  { type: 'suleymaniye', x: -620, z: 290 },
  { type: 'dolmabahce', x: 150, z: -360 },
  { type: 'haydarpasa', x: 480, z: 520 },
  { type: 'mihrimah', x: 480, z: -60 },
  { type: 'stadium', x: 760, z: 620 },
  { type: 'park', x: -700, z: -250 },
  { type: 'park', x: 700, z: -800 },
  { type: 'park', x: 620, z: 200 },
];

export class CityMap {
  constructor(seed = 1453) {
    this.rng = new RNG(seed);
    this.nodes = [];
    this.nodeMap = new Map();
    this.edges = [];
    this.roads = []; // görsel/çizim için yol çizgileri
    this.blocks = [];
    this.buildings = [];
    this.parks = [];
    this.landmarkBlocks = [];
    this.build();
  }

  node(x, z) {
    const k = `${Math.round(x)},${Math.round(z)}`;
    let n = this.nodeMap.get(k);
    if (!n) { n = { id: this.nodes.length, x, z, edges: [] }; this.nodes.push(n); this.nodeMap.set(k, n); }
    return n;
  }
  addEdge(a, b, width) {
    if (a === b) return;
    const e = { id: this.edges.length, a, b, width, len: Math.hypot(a.x - b.x, a.z - b.z) };
    this.edges.push(e); a.edges.push(e); b.edges.push(e);
  }

  build() {
    const r = this.rng;
    VILLAS.length = 0; PROPERTIES.length = 0; POLICE_STATIONS.length = 0;
    // Avrupa yakası
    const exs = genLines(r, -985, 190, [-985, -860, -700, -500, -150, 190]).filter((v) => v <= 190);
    const ezN = genLines(r, -985, 60, [-985, -760, -450, 60]).filter((v) => v <= 60);
    const ezS = genLines(r, 200, 810, [200, 810]).filter((v) => v >= 200 && v <= 810);
    const ez = [...ezN, ...ezS];
    // Anadolu yakası
    const axs = genLines(r, 435, 985, [435, 800, 985]).filter((v) => v >= 435);
    const az = genLines(r, -985, 810, [-985, -450, -380, 250, 810]).filter((v) => v <= 810);
    this.mainX = new Set([-860, -500, -150, 190, 435]);
    this.mainZ = new Set([-450, 60, 200, 810, 250]);
    this.side = [
      { xs: exs, zs: ez },
      { xs: axs, zs: az },
    ];
    for (const s of this.side) this.buildGrid(s.xs, s.zs);
    // Boğaz köprüsü bağlantısı
    const a = this.nodeMap.get(`190,-450`), b = this.nodeMap.get(`435,-450`);
    if (a && b) { this.addEdge(a, b, 18); this.roads.push({ x0: 190, z0: -450, x1: 435, z1: -450, w: 18, bridge: true }); }
    // bağlantısız düğümleri temizle
    this.nodes = this.nodes.filter((n) => n.edges.length > 0);
    this.nodes.forEach((n, i) => (n.id = i));
    this.buildBlocks();
    this.assignSpecials();
  }

  roadWidth(axis, v) {
    return axis === 'x' ? (this.mainX.has(v) ? 16 : 11) : (this.mainZ.has(v) ? 16 : 11);
  }

  // Kenar özel bölgenin içinden mi geçiyor? (askeri üs / havalimanı içinde yol yok)
  inZoneEdge(x0, z0, x1, z1) {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    for (const zn of [MILITARY_BASE.lines, AIRPORT.lines]) if (inRect(mx, mz, { x0: zn.x0 + 1, x1: zn.x1 - 1, z0: zn.z0 + 1, z1: zn.z1 - 1 })) return true;
    return false;
  }

  buildGrid(xs, zs) {
    for (const x of xs) for (const z of zs) if (isLand(x, z)) this.node(x, z);
    // dikey (z boyunca)
    for (const x of xs) {
      const w = this.roadWidth('x', x);
      for (let i = 0; i < zs.length - 1; i++) {
        const z0 = zs[i], z1 = zs[i + 1];
        if (!isLand(x, z0) || !isLand(x, z1) || !isLand(x, (z0 + z1) / 2)) continue;
        if (this.inZoneEdge(x, z0, x, z1)) continue;
        this.addEdge(this.node(x, z0), this.node(x, z1), w);
        this.roads.push({ x0: x, z0, x1: x, z1, w });
      }
    }
    for (const z of zs) {
      const w = this.roadWidth('z', z);
      for (let i = 0; i < xs.length - 1; i++) {
        const x0 = xs[i], x1 = xs[i + 1];
        if (!isLand(x0, z) || !isLand(x1, z) || !isLand((x0 + x1) / 2, z)) continue;
        if (this.inZoneEdge(x0, z, x1, z)) continue;
        this.addEdge(this.node(x0, z), this.node(x1, z), w);
        this.roads.push({ x0, z0: z, x1, z1: z, w });
      }
    }
  }

  buildBlocks() {
    const r = this.rng;
    let bid = 0;
    for (const s of this.side) {
      for (let i = 0; i < s.xs.length - 1; i++) for (let j = 0; j < s.zs.length - 1; j++) {
        const xa = s.xs[i], xb = s.xs[i + 1], za = s.zs[j], zb = s.zs[j + 1];
        const x0 = xa + this.roadWidth('x', xa) / 2 + SIDEWALK, x1 = xb - this.roadWidth('x', xb) / 2 - SIDEWALK;
        const z0 = za + this.roadWidth('z', za) / 2 + SIDEWALK, z1 = zb - this.roadWidth('z', zb) / 2 - SIDEWALK;
        if (x1 - x0 < 12 || z1 - z0 < 12) continue;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (!isLand(cx, cz) || !isLand(x0, z0) || !isLand(x1, z1) || !isLand(x0, z1) || !isLand(x1, z0)) continue;
        const block = { id: bid++, x0, x1, z0, z1, cx, cz, district: districtAt(cx, cz), kind: 'city' };
        if (inRect(cx, cz, MILITARY_BASE.lines)) { block.kind = 'zone'; block.zone = 'military'; }
        else if (inRect(cx, cz, AIRPORT.lines)) { block.kind = 'zone'; block.zone = 'airport'; }
        else if ((xb === 190 && cz < -480 && cz > -990) || (xa === 435 && cz < -500 && cz > -990)) { block.kind = 'villa'; block.side = xb === 190 ? 'europe' : 'asia'; }
        this.blocks.push(block);
      }
    }
    // simge yapılar
    for (const lm of LANDMARKS) {
      let best = null, bd = 1e9;
      for (const b of this.blocks) {
        if (b.kind !== 'city') continue;
        const d = Math.hypot(b.cx - lm.x, b.cz - lm.z);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) {
        best.kind = lm.type === 'park' || lm.type === 'sultanahmet_park' ? 'park' : 'landmark';
        best.landmark = lm.type;
        if (best.kind === 'landmark') this.landmarkBlocks.push(best);
        else this.parks.push(best);
      }
    }
    // rastgele parklar
    for (const b of this.blocks) {
      if (b.kind === 'city' && r.chance(0.05)) { b.kind = 'park'; this.parks.push(b); }
    }
    // parseller ve binalar
    for (const b of this.blocks) if (b.kind === 'city') this.subdivide(b);
    for (const b of this.blocks) if (b.kind === 'villa') this.villaPlots(b);
  }

  // Boğaz kıyısı villa parselleri: blok başına 1-2 yalı, kıyı yoluna (denize) bakar
  villaPlots(b) {
    const r = this.rng;
    const n = (b.z1 - b.z0) > 70 ? 2 : 1;
    const seaX = b.side === 'europe' ? b.x1 : b.x0;
    const face = b.side === 'europe' ? 1 : -1; // kapı yönü (x ekseni)
    for (let i = 0; i < n; i++) {
      const pz0 = b.z0 + ((b.z1 - b.z0) / n) * i, pz1 = b.z0 + ((b.z1 - b.z0) / n) * (i + 1);
      const pw = Math.min(24, (b.x1 - b.x0) * 0.45), pd = Math.min(18, (pz1 - pz0) * 0.45);
      const cz = (pz0 + pz1) / 2;
      const hx0 = face > 0 ? seaX - 9 - pw : seaX + 9, hx1 = hx0 + pw;
      const floors = r.int(2, 3);
      const h = floors * 3.2 + 0.6;
      const doorX = face > 0 ? hx1 : hx0;
      const bl = {
        id: this.buildings.length, x0: hx0, x1: hx1, z0: cz - pd / 2, z1: cz + pd / 2, h, floors, tower: false, roof: 'pyramid',
        colorIdx: r.int(0, 999), door: { x: doorX + face * 0.05, z: cz, nx: face, nz: 0 }, type: 'villa', villa: true,
        district: b.district, block: b.id, sign: -1, style: r.chance(0.55) ? 'ottoman' : 'villa', name: b.side === 'europe' ? 'Boğaz Yalısı' : 'Kuzguncuk Köşkü',
      };
      this.buildings.push(bl);
      const v = {
        id: 'villa-' + VILLAS.length, buildingId: bl.id, name: bl.name + ' #' + (VILLAS.length + 1), side: b.side,
        x: (hx0 + hx1) / 2, z: cz, plot: { x0: b.x0, x1: b.x1, z0: pz0 + 1, z1: pz1 - 1 },
        door: { x: doorX + face * 1.0, z: cz }, gate: { x: seaX, z: cz },
        garage: { x: face > 0 ? seaX - 4 : seaX + 4, z: pz0 + 6, heading: face > 0 ? -Math.PI / 2 : Math.PI / 2 },
        pool: { x: face > 0 ? hx0 - 8 : hx1 + 8, z: cz, w: 6, d: 11 }, price: 2500000 + r.int(0, 30) * 100000, floors,
      };
      bl.villaInfo = v;
      VILLAS.push(v);
      PROPERTIES.push({ kind: 'villa', id: v.id, buildingId: bl.id, x: v.door.x, z: v.door.z, price: v.price, name: v.name });
    }
  }

  subdivide(b) {
    const r = this.rng;
    const d = b.district;
    const rows = (b.z1 - b.z0) >= 34 ? [[b.z0, (b.z0 + b.z1) / 2, -1], [(b.z0 + b.z1) / 2, b.z1, 1]] : [[b.z0, b.z1, r.chance(0.5) ? -1 : 1]];
    const towerZone = d.id === 'besiktas' && b.cz < -720 && b.cx > -600 && b.cx < 60; // Levent
    for (const [rz0, rz1, face] of rows) {
      let x = b.x0;
      while (x < b.x1 - 6) {
        let lw = towerZone ? r.float(22, 34) : r.float(11, 22);
        if (b.x1 - (x + lw) < 9) lw = b.x1 - x;
        const gap = r.chance(0.25) ? r.float(1, 3) : 0;
        const x0 = x, x1 = x + lw - gap;
        const inset = r.float(0, 1.2);
        const bz0 = rz0 + (face === -1 ? inset : 0.4), bz1 = rz1 - (face === 1 ? inset : 0.4);
        let floors = r.int(d.floors[0], d.floors[1]);
        if (towerZone) floors = r.int(12, 40);
        else if (r.chance(0.04)) floors += r.int(2, 6);
        const h = floors * 3.2 + 0.6;
        const doorX = (x0 + x1) / 2;
        const doorZ = face === -1 ? bz0 : bz1;
        this.buildings.push({
          id: this.buildings.length, x0, x1, z0: bz0, z1: bz1, h, floors,
          tower: towerZone,
          roof: towerZone ? 'flat' : r.chance(0.45) ? 'pyramid' : 'flat',
          colorIdx: r.int(0, 999),
          door: { x: doorX, z: doorZ + face * 0.05, nx: 0, nz: face },
          type: 'apartment', district: d, block: b.id,
          sign: !towerZone && r.chance(0.5) ? r.int(0, 999) : -1,
          style: towerZone ? 'glass' : ((d.id === 'uskudar' || d.id === 'fatih' || d.id === 'eyup') && floors <= 3 && r.chance(0.4)) ? 'ottoman' : r.chance(d.id === 'beyoglu' || d.id === 'fatih' ? 0.3 : 0.15) ? 'brick' : 'plaster',
        });
        x += lw;
      }
    }
  }

  assignSpecials() {
    const used = new Set();
    for (const [type, sx, sz] of SPECIALS) {
      let best = null, bd = 1e9;
      for (const bl of this.buildings) {
        if (used.has(bl.id) || bl.tower) continue;
        const dd = Math.hypot(bl.door.x - sx, bl.door.z - sz);
        if (dd < bd) { bd = dd; best = bl; }
      }
      if (best) {
        used.add(best.id); best.type = type; best.sign = -1;
        if (type === 'konak' || type === 'rival' || type === 'safehouse') { best.floors = Math.min(best.floors, 3); best.h = best.floors * 3.2 + 0.6; best.roof = 'pyramid'; }
        if (type === 'mosque_small') { best.floors = 2; best.h = 7; best.roof = 'dome'; }
        if (best.style === 'ottoman' || best.style === 'brick') best.style = 'plaster';
        if (type === 'police' || type === 'bank' || type === 'hospital') best.style = 'official';
        if (type === 'police') this.policeCompound(best);
      }
    }
    this.specials = this.buildings.filter((b) => b.type !== 'apartment');
    // satın alınabilir apartmanlar
    const r = this.rng;
    for (const b of this.buildings) {
      if (b.type !== 'apartment' || b.tower || !r.chance(0.02)) continue;
      b.forSale = { price: 400000 + b.floors * 90000 + r.int(0, 20) * 10000 };
      PROPERTIES.push({ kind: 'apartment', id: 'apt-' + b.id, buildingId: b.id, x: b.door.x, z: b.door.z + b.door.nz * 0.8, price: b.forSale.price, name: 'Apartman #' + b.id });
    }
  }

  // Emniyet binası: cepheyi geri çekip ön avlu (çit, nizamiye kapısı, bayrak, otopark) açar
  policeCompound(b) {
    const nz = b.door.nz, setback = 9;
    if (b.z1 - b.z0 < 22) return;
    const frontZ = nz > 0 ? b.z1 : b.z0;
    if (nz > 0) b.z1 -= setback; else b.z0 += setback;
    b.floors = Math.max(3, Math.min(b.floors, 5)); b.h = b.floors * 3.2 + 0.6; b.roof = 'flat';
    b.door = { x: b.door.x, z: (nz > 0 ? b.z1 : b.z0) + nz * 0.05, nx: 0, nz };
    const parking = [];
    const yz = frontZ - nz * (setback / 2 + 0.3);
    for (let x = b.x0 + 2.5; x < b.x1 - 2; x += 3) if (Math.abs(x - b.door.x) > 3.4 && x > b.x0 + 2.4) parking.push({ x, z: yz, heading: nz > 0 ? Math.PI : 0 });
    b.compound = { frontZ, nz, setback, gateX: b.door.x, gateW: 5, flag: { x: b.x0 + 1.2, z: frontZ - nz * 1.2 }, parking };
    POLICE_STATIONS.push({ buildingId: b.id, x0: b.x0, x1: b.x1, z0: Math.min(frontZ, nz > 0 ? b.z1 : b.z0), z1: Math.max(frontZ, nz > 0 ? b.z1 : b.z0), door: b.door, gate: { x: b.door.x, z: frontZ }, parking, flag: b.compound.flag });
  }

  // ---- Yol grafiği yardımcıları ----
  nearestNode(x, z) {
    let best = null, bd = 1e18;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  other(e, n) { return e.a === n ? e.b : e.a; }

  path(fromX, fromZ, toX, toZ) {
    const s = this.nearestNode(fromX, fromZ), t = this.nearestNode(toX, toZ);
    if (!s || !t) return [];
    const open = new Map([[s.id, s]]);
    const g = new Map([[s.id, 0]]);
    const f = new Map([[s.id, Math.hypot(s.x - t.x, s.z - t.z)]]);
    const came = new Map();
    const closed = new Set();
    let guard = 0;
    while (open.size && guard++ < 20000) {
      let cur = null, cf = Infinity;
      for (const n of open.values()) { const v = f.get(n.id); if (v < cf) { cf = v; cur = n; } }
      if (cur === t) {
        const out = [cur];
        while (came.has(cur.id)) { cur = came.get(cur.id); out.unshift(cur); }
        return out;
      }
      open.delete(cur.id); closed.add(cur.id);
      for (const e of cur.edges) {
        const nb = this.other(e, cur);
        if (closed.has(nb.id)) continue;
        const ng = g.get(cur.id) + e.len;
        if (ng < (g.get(nb.id) ?? Infinity)) {
          came.set(nb.id, cur); g.set(nb.id, ng);
          f.set(nb.id, ng + Math.hypot(nb.x - t.x, nb.z - t.z));
          open.set(nb.id, nb);
        }
      }
    }
    return [];
  }

  // Yol üzerinde mi? (araç sürüşü ve yaya güvenliği için)
  onRoad(x, z) {
    for (const rd of this.roads) {
      const hw = rd.w / 2;
      if (x >= Math.min(rd.x0, rd.x1) - hw && x <= Math.max(rd.x0, rd.x1) + hw && z >= Math.min(rd.z0, rd.z1) - hw && z <= Math.max(rd.z0, rd.z1) + hw) return true;
    }
    return false;
  }

  randomEdgeNear(x, z, minD, maxD, rnd = Math.random) {
    // önce yarıçap içinden geçen kenarları süz
    const cand = [];
    for (const e of this.edges) {
      const ax = e.a.x, az = e.a.z, bx = e.b.x, bz = e.b.z;
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const near = Math.hypot(ax + dx * t - x, az + dz * t - z);
      const far = Math.max(Math.hypot(ax - x, az - z), Math.hypot(bx - x, bz - z));
      if (near <= maxD && far >= minD) cand.push(e);
    }
    if (!cand.length) return null;
    for (let i = 0; i < 25; i++) {
      const e = cand[Math.floor(rnd() * cand.length)];
      const t = rnd();
      const px = e.a.x + (e.b.x - e.a.x) * t, pz = e.a.z + (e.b.z - e.a.z) * t;
      const d = Math.hypot(px - x, pz - z);
      if (d >= minD && d <= maxD) return { e, t, x: px, z: pz };
    }
    return null;
  }

  buildingsOfType(type) { return this.buildings.filter((b) => b.type === type); }
  nearestOfType(type, x, z) {
    let best = null, bd = 1e18;
    for (const b of this.specials) {
      if (b.type !== type) continue;
      const d = (b.door.x - x) ** 2 + (b.door.z - z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
}

export function clampWorld(v) { return clamp(v, WORLD_MIN + 2, WORLD_MAX - 2); }
