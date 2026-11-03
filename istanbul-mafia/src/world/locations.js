// Yeni mekânlar:
//  - Kadıköy Konteyner Limanı (HARBOR): Marmara'ya uzanan beton rıhtım, STS konteyner vinçleri, konteyner
//    istifleri, projektör direkleri, nizamiye, ahşap tekne iskelesi ve oyuncu tekneleri için yanaşma yerleri.
//  - Aydos Ormanı (FOREST) + dağ evi (HIDEOUTS): harita doğu kenarında sık çam ormanı, toprak orman yolu,
//    izole ahşap dağ evi (yasa dışı anlaşmalar), harita dışında dağ silüeti.
// Dışa aktarılan veriler map.js'te: HARBOR.berths/cranes/gates, FOREST.road, HIDEOUTS.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HARBOR, FOREST, HIDEOUTS, WATER_Y } from './map.js';
import { GeoBuilder } from './instancer.js';
import { oceanObstacle, pbrMaterial } from './shaders.js';
import { granitePBR } from '../core/textures.js';
import { RNG } from '../core/util.js';
import { addBarrier } from './zones.js';
import { MOUNTAIN, initMountain } from './terrain.js';
import { buildMountainWorld, silhouetteHeight, mountainMaterial } from './mountain.js';

const CONT_COLS = [0xb8322a, 0x2a5aa0, 0x2f7d4a, 0xd08a2a, 0x8a8f94, 0x6a3a8a, 0xc8b030, 0x1e6e78, 0xe0e0dc, 0x9a4a2a];

export const LOCATION_PROP_DEFS = {
  // STS konteyner vinci (yerel: +z denize doğru bom), bacaklar x=±8, z=0 ve z=-18
  stscrane: () => {
    const g = new GeoBuilder();
    const red = { color: 0xc8402a, metal: 0.4, rough: 0.5 }, wht = { color: 0xe8e8e2, metal: 0.4, rough: 0.5 };
    for (const x of [-8, 8]) for (const z of [0, -18]) g.box(1.2, 30, 1.2, { x, z, ...((z === 0) ? red : wht) });
    for (const x of [-8, 8]) { g.box(1.4, 1.6, 20, { x, y: 12, z: -9, ...red }); g.box(1.4, 1.8, 20, { x, y: 29, z: -9, ...wht }); }
    g.box(17.6, 1.6, 1.4, { y: 29, z: 0, ...red }).box(17.6, 1.6, 1.4, { y: 29, z: -18, ...red });
    // bom (denize 42 m, arkaya 24 m) + makine dairesi + kabin
    g.box(3.0, 2.2, 66, { y: 33, z: 3, ...red });
    g.box(7, 4, 9, { y: 35.2, z: -16, color: 0xd8d8d0, rough: 0.6 });
    g.box(2.6, 2.4, 2.6, { y: 30.2, z: 4, color: 0x30383c, rough: 0.3, metal: 0.3 });
    g.box(2.2, 1.0, 0.05, { y: 31.0, z: 5.32, uv: 'glass', rough: 0.05 });
    // A çerçevesi ve gergiler
    for (const x of [-1.5, 1.5]) { g.box(0.6, 14, 0.6, { x, y: 35, z: -6, ...wht }); }
    g.add(new THREE.CylinderGeometry(0.08, 0.08, 44, 4), { y: 42, z: 14, rx: 1.24, color: 0x333333, metal: 0.8 });
    g.add(new THREE.CylinderGeometry(0.08, 0.08, 28, 4), { y: 42, z: -16, rx: -1.0, color: 0x333333, metal: 0.8 });
    // yürüyen tekerlek takımları + uyarı lambası
    for (const x of [-8, 8]) for (const z of [0, -18]) g.box(1.8, 1.0, 3.2, { x, z, color: 0x2a2a2a, metal: 0.5 });
    g.sphere(0.4, { y: 49, z: -6, color: 0xff2a1a, emis: 3 }, 6, 4);
    return g.build();
  },
  container: () => {
    const g = new GeoBuilder();
    g.box(12.2, 2.6, 2.44, { color: 0xffffff, rough: 0.6, metal: 0.4 });
    for (let x = -5.6; x <= 5.6; x += 0.8) for (const z of [-1.23, 1.23]) g.box(0.12, 2.4, 0.04, { x, y: 0.1, z, color: 0xd0d0d0, rough: 0.6, metal: 0.4 });
    for (const x of [-6.08, 6.08]) g.box(0.06, 2.4, 2.3, { x, y: 0.1, color: 0xc0c0c0, metal: 0.4 });
    return g.build();
  },
  floodmast: () => {
    const g = new GeoBuilder();
    g.cyl(0.25, 0.4, 24, 8, { color: 0x8a9096, metal: 0.6, rough: 0.4 });
    g.box(3.2, 0.3, 1.0, { y: 24, color: 0x50565a, metal: 0.6 });
    for (const x of [-1.1, 0, 1.1]) g.box(0.8, 0.5, 0.25, { x, y: 23.6, z: 0.4, rx: 0.5, color: 0xfff6e0, emis: 3 });
    return g.build();
  },
  fender: () => new GeoBuilder().box(1.6, 1.6, 0.5, { color: 0x151515, rough: 0.95 }).build(),
  cabin: () => {
    const g = new GeoBuilder();
    const logC = 0x6a4a30, dark = 0x3a2a1c;
    // kütük duvarlar (yatay kütük bantları)
    for (let i = 0; i < 9; i++) {
      const y = i * 0.34, c = i % 2 ? logC : 0x5e4028;
      g.box(9.4, 0.34, 0.36, { y, z: 3.5, color: c, uv: 'wood', rough: 0.9 }).box(9.4, 0.34, 0.36, { y, z: -3.5, color: c, uv: 'wood', rough: 0.9 });
      g.box(0.36, 0.34, 7.4, { x: 4.7, y, color: c, uv: 'wood', rough: 0.9 }).box(0.36, 0.34, 7.4, { x: -4.7, y, color: c, uv: 'wood', rough: 0.9 });
    }
    // üçgen alınlıklar + beşik çatı
    const gable = new THREE.Shape(); gable.moveTo(-3.7, 0); gable.lineTo(3.7, 0); gable.lineTo(0, 2.4); gable.lineTo(-3.7, 0);
    for (const x of [-4.7, 4.7]) g.add(new THREE.ExtrudeGeometry(gable, { depth: 0.3, bevelEnabled: false }), { x: x - 0.15, y: 3.06, ry: Math.PI / 2, color: dark, uv: 'wood', rough: 0.9 });
    for (const s of [-1, 1]) g.box(10.6, 0.18, 5.0, { y: 4.15, z: s * 2.05, rx: s * 0.58, color: 0x2e3430, rough: 0.8 });
    // kapı, pencereler (gece sıcak ışık), baca, veranda
    g.box(1.1, 2.1, 0.08, { x: -1.5, y: 0, z: 3.72, color: 0x2a1c12, uv: 'wood' });
    for (const x of [1.5, 3.2]) g.box(1.0, 0.9, 0.06, { x, y: 1.2, z: 3.72, color: 0xffc070, emis: 1.6, rough: 0.2 });
    g.box(1.0, 0.9, 0.06, { x: 4.92, y: 1.2, color: 0xffc070, emis: 1.6, ry: Math.PI / 2 });
    g.box(0.9, 4.2, 0.9, { x: -3.6, y: 2.6, z: -1.5, color: 0x6a6460, rough: 0.95 });
    g.box(9.6, 0.15, 2.4, { y: 0.4, z: 4.9, color: 0x5a4028, uv: 'wood' });
    for (const x of [-4.5, -1.5, 1.5, 4.5]) g.box(0.18, 2.4, 0.18, { x, y: 0.5, z: 6.0, color: dark, uv: 'wood' });
    g.box(9.8, 0.12, 2.8, { y: 2.9, z: 5.0, rx: 0.18, color: 0x2e3430 });
    g.box(0.5, 0.25, 0.25, { x: -0.3, y: 2.6, z: 5.9, color: 0xffd080, emis: 2.5 }); // veranda lambası
    // odun yığını
    for (let i = 0; i < 4; i++) g.add(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 6), { x: 5.4, y: 0.18 + i * 0.3, z: -1 + (i % 2) * 0.1, rx: Math.PI / 2, color: 0x7a5a38, uv: 'wood' });
    return g.build();
  },
  rock: () => new GeoBuilder().add(new THREE.DodecahedronGeometry(1, 0), { y: 0.4, sy: 0.6, color: 0x7a7670, rough: 0.95 }).build(),
};
export const LOCATION_PROP_OPTS = {
  stscrane: { radius: 1500, shadow: true }, container: { radius: 650, shadow: true }, floodmast: { radius: 800, shadow: true },
  fender: { radius: 160 }, cabin: { radius: 600, shadow: true }, rock: { radius: 300, shadow: true },
};

// Zemin maskesi boyaması (city.buildGround → paint): liman giriş bandı asfalt, orman toprağı ve orman yolu
export function paintLocations(paint) {
  const DIRT = [0, 0, 0, 0], GRASS = [0, 0, 255, 0], ASPH = [255, 0, 0, 0];
  for (const gt of HARBOR.gates) paint.rect(gt.x - 5, 812, gt.x + 5, 820, ASPH);
  // dağ arazisi kendi malzemesiyle çizilir (mountain.js); düz zemin maskesinde toprak (çim lifi çizilmez)
  paint.rect(FOREST.x0 - 2, FOREST.z0 - 2, 1000, FOREST.z1 + 2, DIRT);
  void GRASS;
}

export function buildHarbor(city) {
  const P = city.props, cols = city.physics.city;
  const T = HARBOR.terminal, Fg = HARBOR.finger;
  const rng = new RNG(2024);
  // güverte: beton rıhtım (su altına inen gövde) + ahşap tekne iskelesi
  const conc = pbrMaterial(granitePBR(city.quality), { color: 0x9a9690, scale: 0.25 });
  const deck = [];
  const bx = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  deck.push(bx(T.x1 - T.x0, 5.2, T.z1 - T.z0, (T.x0 + T.x1) / 2, -2.6, (T.z0 + T.z1) / 2));
  deck.push(bx(T.x1 - T.x0, 0.35, 0.6, (T.x0 + T.x1) / 2, 0.17, T.z1 - 0.3)); // kenar bordürü
  const dm = new THREE.Mesh(mergeGeometries(deck), conc); dm.receiveShadow = true; city.group.add(dm);
  const gb = new GeoBuilder();
  gb.box(Fg.x1 - Fg.x0, 0.4, Fg.z1 - Fg.z0, { x: (Fg.x0 + Fg.x1) / 2, y: -0.4, z: (Fg.z0 + Fg.z1) / 2, uv: 'wood', rough: 0.85 });
  const fm = new THREE.Mesh(gb.build(), city.propsMat); fm.receiveShadow = true; city.group.add(fm);
  for (let z = Fg.z0 + 2; z < Fg.z1; z += 6) for (const x of [Fg.x0 + 0.2, Fg.x1 - 0.2]) { P.piling.addTRS(x, 0, z, 0); cols.addCircle(x, z, 0.19, -6, 0.5, 'piling'); }
  oceanObstacle((T.x0 + T.x1) / 2, (T.z0 + T.z1) / 2, (T.x1 - T.x0) / 2, (T.z1 - T.z0) / 2);
  oceanObstacle((Fg.x0 + Fg.x1) / 2, (Fg.z0 + Fg.z1) / 2, (Fg.x1 - Fg.x0) / 2, (Fg.z1 - Fg.z0) / 2);
  // dış kenar: bordür çarpışması, usturmaçalar, babalar
  cols.add(T.x0, T.z1 - 0.6, T.x1, T.z1, 0, 0.35, 'curb');
  for (const [x0, x1, z] of [[T.x0, T.x0 + 0.6, 0], [T.x1 - 0.6, T.x1, 0]]) { void z; cols.add(x0, T.z0 + 1, x1, T.z1, 0, 0.35, 'curb'); }
  for (let x = T.x0 + 6; x < T.x1 - 2; x += 10) { P.fender.addTRS(x, -1.6, T.z1 + 0.3, 0); cols.add(x - 0.8, T.z1 + 0.05, x + 0.8, T.z1 + 0.55, WATER_Y - 0.4, 0.9, 'fender'); P.cleat.addTRS(x + 5, 0, T.z1 - 0.9, 0); }
  for (let z = Fg.z0 + 4; z < Fg.z1; z += 8) for (const x of [Fg.x0 + 0.3, Fg.x1 - 0.3]) P.cleat.addTRS(x, 0, z, 0);
  // yol çizgileri (sarı şerit + yaya yolu)
  const Y = new THREE.Color(0xe8c030), W = new THREE.Color(0xf0f0ea);
  city.mark((T.x0 + T.x1) / 2, T.z0 + 46, T.x1 - T.x0 - 8, 0.25, 0, Y, 0.006);
  city.mark((T.x0 + T.x1) / 2, T.z1 - 4.5, T.x1 - T.x0 - 4, 0.3, 0, Y, 0.006);
  for (let x = T.x0 + 6; x < T.x1 - 6; x += 6) city.mark(x, T.z0 + 49, 3, 0.15, 0, W, 0.006);
  // konteyner istifleri (3 blok × 2 sıra şerit)
  const col = new THREE.Color();
  for (let bxI = 0; bxI < 3; bxI++) {
    const x0 = T.x0 + 14 + bxI * 62;
    for (let i = 0; i < 4; i++) for (let row = 0; row < 8; row++) {
      if (rng.chance(0.12)) continue;
      const x = x0 + i * 13 + 6.1, z = T.z0 + 10 + row * 3.0 + (row >= 4 ? 4 : 0);
      const n = rng.int(1, 4);
      for (let k = 0; k < n; k++) P.container.addTRS(x, k * 2.6, z, 0, 1, 1, 1, col.setHex(CONT_COLS[rng.int(0, CONT_COLS.length - 1)]).multiplyScalar(rng.float(0.8, 1.05)));
      cols.add(x - 6.1, z - 1.22, x + 6.1, z + 1.22, 0, n * 2.6, 'container');
    }
  }
  // STS vinçleri (rıhtımın dış kenarında, bom denize)
  for (const x of [600, 660, 720]) {
    const z = T.z1 - 2;
    P.stscrane.addTRS(x, 0, z, 0);
    for (const lx of [-8, 8]) for (const lz of [0, -18]) cols.add(x + lx - 0.6, z + lz - 0.6, x + lx + 0.6, z + lz + 0.6, 0, 30, 'crane');
    HARBOR.cranes.push({ x, z, boomTip: { x, z: z + 45, y: 33 } });
  }
  // projektör direkleri (gece: gerçek ışık + geniş ışık havuzu)
  for (const [x, z] of [[T.x0 + 4, T.z0 + 30], [T.x0 + 100, T.z0 + 30], [T.x1 - 4, T.z0 + 30], [T.x0 + 50, T.z1 - 10], [T.x1 - 50, T.z1 - 10]]) {
    P.floodmast.addTRS(x, 0, z, 0); cols.addCircle(x, z, 0.45, 0, 24, 'mast');
    const L = city.addLight(x, 23.4, z, 0xfff0d8, 2.2, true, 0.03); L.r = 60;
  }
  // liman ofisi + nizamiye
  city.addZoneBuilding(T.x1 - 26, T.z0 + 2, T.x1 - 6, T.z0 + 12, 7.0, 2, '#d8d2c0', 0, 0);
  const g0 = HARBOR.gates[0];
  P.booth.addTRS(g0.x + 6.5, 0, 823, 0); cols.add(g0.x + 5.7, 822.2, g0.x + 7.3, 823.8, 0, 2.6, 'booth');
  P.barrier.addTRS(g0.x - 4.8, 0, 821.5, 0); addBarrier(city, g0.x - 4.8, 821.5, 0, 0);
  city.addSign('marina', g0.x, 3.0, 818.6, 0, 7, 0.8);
  for (const b of HARBOR.berths) b.y = WATER_Y;
}

export function buildForest(city) {
  const F = FOREST;
  initMountain();
  // dağ: arazi, yol, bariyerler, istinat duvarı, çam ormanı, kayalar, dağ evi (mountain.js)
  city.mountain = buildMountainWorld(city);
  const cab = MOUNTAIN.cabin;
  void F;
  HIDEOUTS.length = 0;
  HIDEOUTS.push({
    id: 'dagevi', name: 'Dağ Evi (Aydos Ormanı)', kind: 'cabin', x: cab.x, z: cab.z,
    door: { x: cab.x - 1.5, z: cab.z + 4.3 }, porch: { x: cab.x, z: cab.z + 5.0 },
    parking: [{ x: cab.x - 10, z: cab.z + 12, heading: Math.PI / 2 }, { x: cab.x + 9, z: cab.z + 12, heading: -Math.PI / 2 }],
    dealSpots: [{ x: cab.x - 3, z: cab.z + 9 }, { x: cab.x + 3, z: cab.z + 9 }],
    lookouts: [{ x: cab.x + 14, z: cab.z - 6 }, { x: cab.x - 14, z: cab.z + 14 }],
    approach: FOREST.road.filter((_, i) => i % 3 === 0).map((p) => ({ x: p.x, z: p.z })), y: cab.y,
    entrances: [FOREST.road[0], FOREST.road[FOREST.road.length - 1]].map((p) => ({ x: p.x, z: p.z })),
    radius: 26, isolated: true,
  });
  // orman girişi tabelası
  const e0 = FOREST.road[0];
  city.addSign('military', e0.x + 5, 99, e0.z, 0, 0.01, 0.01); // atlas ısınması (görünmez)
  buildMountains(city);
}

// Harita dışında dağ silüeti (x > 1000): düşük çokgen yükseklik alanı, çarpışmasız (oyuncu oraya gidemez)
function buildMountains(city) {
  const nx = 70, nz = 110, X0 = 999, X1 = 1700, Z0 = 120, Z1 = 980;
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx, nz); g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  const hsh = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const u = (x - X0) / (X1 - X0);
    const edge = Math.min(1, (x - X0) / 60) * Math.min(1, (z - Z0) / 80) * Math.min(1, Math.max(0, (Z1 - 120 - z) / 160));
    let h = (Math.sin(z * 0.011) * 0.5 + 0.5) * 90 + (Math.sin(z * 0.031 + 1.3) * 0.5 + 0.5) * 40 + hsh(Math.round(x / 18), Math.round(z / 18)) * 18;
    h *= Math.min(1, u * 2.2 + 0.25) * edge;
    h = silhouetteHeight(x, z, h - 3) - 0.6 * Math.max(0, 1 - (x - X0) / 30);
    p.setY(i, Math.max(-6, h));
    const k = Math.min(1, h / 140);
    c[i * 3] = 0.16 + k * 0.18; c[i * 3 + 1] = 0.24 + k * 0.12; c[i * 3 + 2] = 0.14 + k * 0.1;
  }
  // dağın kendi zemin malzemesi (çim/kaya/toprak) → yamaç harita dışına kesintisiz uzanır
  g.setAttribute('aMt', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  g.deleteAttribute('uv'); void c;
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mountainMaterial(city.quality));
  m.receiveShadow = true; m.name = 'mountains';
  city.group.add(m);
}
