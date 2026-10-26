// Deniz trafiği: Şehir Hatları vapurları (Eminönü–Kadıköy–Üsküdar–Beşiktaş, iskelede bekleme), Boğaz'dan geçen
// yük gemileri/tankerler, Marmara'da açık deniz gemileri, balıkçı tekneleri ve lüks yatlar. Köpük izi, gece ışıkları, düdük.
//
// Köprü notu: 15 Temmuz Şehitler Köprüsü tabliyesi (z -461..-439) su seviyesinin hemen üstünde (y≈0) modellenmiş;
// büyük gemiler altından geçemez. Bu yüzden Boğaz trafiği iki bölümlüdür: güneyden (Marmara) gelen gemiler köprünün
// güneyinde (Ortaköy önü, z≈-400) geniş bir U dönüşüyle geri döner; kuzeyden (Karadeniz) gelenler köprünün
// kuzeyinde (z≈-560) döner. Haliç'te gemiler Galata Köprüsü'nün doğusunda kalır. Görüş dışındaki bölümler hızlandırılır.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { colorize, lightize, bx, rbx, cyl, beam, makeLightsMat } from '../entities/vehicles.js';
import { hullGeometry, deckGeometry, Wakes } from '../entities/boats.js';
import { isLand, WATER_Y, ISLAND } from './map.js';
import { clamp, angleDiff, RNG } from '../core/util.js';
import { signTexture } from '../core/textures.js';

const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
const partMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
const deckMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.85 });
const steelDeck = new THREE.MeshStandardMaterial({ color: 0x5a4a40, roughness: 0.8 });
const winMat = new THREE.MeshStandardMaterial({ color: 0x1a2228, emissive: 0xffd890, emissiveIntensity: 0, roughness: 0.2, metalness: 0.4 });
const navMat = makeLightsMat();

// İskeleler (yanaşma noktası ve yön)
export const PIERS = {
  eminonu: { name: 'Eminönü', x: -95, z: 183.5, h: Math.PI / 2, side: 'z+' },
  karakoy: { name: 'Karaköy', x: -70, z: 76.5, h: -Math.PI / 2, side: 'z-' },
  kadikoy: { name: 'Kadıköy', x: 413.5, z: 548, h: 0, side: 'x+' },
  uskudar: { name: 'Üsküdar', x: 413.5, z: -40, h: Math.PI, side: 'x+' },
  besiktas: { name: 'Beşiktaş', x: 206.5, z: -385, h: Math.PI, side: 'x-' },
};
// Vapur hatları: iskele → ara noktalar → iskele (ileri-geri)
const FERRY_LINES = [
  ['eminonu', [-20, 140], [150, 135], [235, 205], [330, 420], [395, 520], 'kadikoy'],
  ['eminonu', [-20, 140], [150, 120], [300, 40], [392, -20], 'uskudar'],
  ['besiktas', [255, -340], [355, -120], [395, -60], 'uskudar', [380, 60], [372, 300], [398, 510], 'kadikoy'],
  ['karakoy', [40, 110], [235, 180], [330, 400], [395, 525], 'kadikoy'],
];

// ---------------- Modeller ----------------
function addWin(arr, w, h, d, x, y, z) { arr.push(colorize(bx(w, h, d, x, y, z), 0xffffff)); }
function buildFerry() {
  const L = 46, B = 10;
  const parts = [], win = [], nav = [];
  const hull = hullGeometry(L, B, 1.8, 2.2, { bow: 0.18, stern: 0.85, colTop: 0xf2f0ea, colBottom: 0x101010, stripe: 0x101010 });
  const deck = deckGeometry(L, B, 2.2, 0.18, 0.85);
  // iki yolcu katı
  parts.push(colorize(rbx(B * 0.86, 2.6, L * 0.72, 0.2, 0, 3.5, 0), 0xf2f0ea));
  parts.push(colorize(rbx(B * 0.72, 2.4, L * 0.55, 0.2, 0, 6.0, 0), 0xf2f0ea));
  parts.push(colorize(bx(B * 0.9, 0.12, L * 0.74, 0, 4.85, 0), 0x2a2a2a));
  parts.push(colorize(bx(B * 0.76, 0.12, L * 0.57, 0, 7.25, 0), 0x2a2a2a));
  // pencere sıraları
  for (const s of [1, -1]) {
    for (let i = 0; i < 14; i++) addWin(win, 0.05, 1.0, 1.5, s * B * 0.432, 3.7, -L * 0.33 + i * 2.2);
    for (let i = 0; i < 10; i++) addWin(win, 0.05, 0.9, 1.6, s * B * 0.362, 6.2, -L * 0.25 + i * 2.4);
    // korkuluk
    parts.push(colorize(beam(s * B * 0.47, 3.0, -L * 0.42, s * B * 0.47, 3.0, L * 0.42, 0.05, 0.05, true), 0x333333));
    // cankurtaran
    for (let i = 0; i < 3; i++) parts.push(colorize(rbx(0.8, 0.6, 3.2, 0.2, s * B * 0.33, 7.65, -6 + i * 6), 0xff6a10));
  }
  for (const zz of [1, -1]) addWin(win, B * 0.6, 0.9, 0.05, 0, 6.2, zz * L * 0.276);
  // çift köprü üstü (iki yönlü vapur)
  for (const zz of [1, -1]) {
    parts.push(colorize(rbx(B * 0.5, 1.4, 2.6, 0.15, 0, 7.9, zz * L * 0.2), 0xf2f0ea));
    addWin(win, B * 0.46, 0.6, 0.05, 0, 8.05, zz * (L * 0.2 + 1.31));
  }
  // baca: siyah tepe, turuncu-krem gövde
  parts.push(colorize(cyl(1.1, 1.25, 3.2, 14, 'y', 0, 8.8, 0), 0xe8a020));
  parts.push(colorize(cyl(1.12, 1.12, 0.9, 14, 'y', 0, 10.8, 0), 0x111111));
  parts.push(colorize(cyl(0.08, 0.08, 4, 6, 'y', 0, 10.5, L * 0.25), 0x333333));
  nav.push(lightize(new THREE.SphereGeometry(0.2, 8, 6).translate(B * 0.45, 5.0, L * 0.3), 0x501010, 0xff2020, 0));
  nav.push(lightize(new THREE.SphereGeometry(0.2, 8, 6).translate(-B * 0.45, 5.0, L * 0.3), 0x105010, 0x20ff40, 0));
  nav.push(lightize(new THREE.SphereGeometry(0.22, 8, 6).translate(0, 12.5, L * 0.25), 0xdddddd, 0xffffff, 0));
  const g = finish(hull, deck, parts, win, nav, deckMat);
  // ad levhası
  const sign = new THREE.MeshBasicMaterial({ map: signTexture('ŞEHİR HATLARI', '#f2f0ea', '#1d3d6e', 512, 96) });
  for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), sign); m.position.set(s * (B * 0.434 + 0.02), 2.6, 0); m.rotation.y = s * Math.PI / 2; g.add(m); }
  return { g, L, B, kind: 'ferry' };
}
function buildCargo(rng, tanker) {
  const L = tanker ? 92 : 84, B = tanker ? 15 : 14;
  const parts = [], win = [], nav = [];
  const top = tanker ? 0x1e2a36 : rng.pick([0x1d3d6e, 0x2a4a2a, 0x7a1a1a, 0x222a30]);
  const hull = hullGeometry(L, B, 4, 4.5, { bow: 0.16, stern: 0.98, colTop: top, colBottom: 0x8a1e16, stripe: 0xe8e8e8 });
  const deck = deckGeometry(L, B, 4.5, 0.16, 0.98);
  // kıç üst yapısı
  const sz = -L * 0.38;
  parts.push(colorize(rbx(B * 0.9, 9, 10, 0.2, 0, 9, sz), 0xf0f0ea));
  parts.push(colorize(rbx(B * 1.04, 0.5, 3.2, 0.1, 0, 13.6, sz + 2.5), 0xf0f0ea));
  for (let k = 0; k < 4; k++) for (const s of [1, -1]) for (let i = 0; i < 4; i++) addWin(win, 0.05, 0.8, 1.4, s * B * 0.452, 6.5 + k * 2, sz - 3.5 + i * 2.3);
  addWin(win, B * 0.9, 1.0, 0.05, 0, 12.6, sz + 5.05);
  parts.push(colorize(rbx(3, 5, 3.5, 0.3, 0, 15, sz - 3), tanker ? 0x1e2a36 : 0x111111));
  parts.push(colorize(bx(3.05, 1, 3.55, 0, 16, sz - 3), 0xc81010));
  parts.push(colorize(cyl(0.12, 0.12, 6, 6, 'y', 0, 17, sz + 1), 0x333333));
  if (tanker) {
    for (let i = 0; i < 6; i++) parts.push(colorize(cyl(0.35, 0.35, L * 0.6, 8, 'z', (i - 2.5) * 1.2, 5.2, L * 0.08), 0x9a9a8a));
    parts.push(colorize(bx(B * 0.3, 3, 4, 0, 6, L * 0.1), 0xd0c8b0));
    parts.push(colorize(bx(B * 0.7, 2.2, 3.5, 0, 5.6, L * 0.42), 0xf0f0ea));
  } else {
    // konteynerler (renkli istif)
    const cols = [0xc81010, 0x1d5aa8, 0x2d7a3a, 0xe8a020, 0xd8d8d8, 0x7a3a8a, 0x5a3a2a];
    for (let bay = 0; bay < 9; bay++) {
      const z = -L * 0.22 + bay * 6.6;
      const h = rng.int(2, 4);
      for (let row = -2; row <= 2; row++) for (let tier = 0; tier < h; tier++) {
        if (bay === 8 && Math.abs(row) > 1) continue;
        parts.push(colorize(bx(2.4, 2.5, 6.1, row * 2.5, 5.75 + tier * 2.55, z), rng.pick(cols)));
      }
    }
    for (const z of [-L * 0.1, L * 0.18]) { parts.push(colorize(cyl(0.4, 0.5, 10, 8, 'y', B * 0.36, 9.5, z), 0xe8c020)); parts.push(colorize(beam(B * 0.36, 14, z, -B * 0.2, 11, z + 6, 0.4, 0.4), 0xe8c020)); }
  }
  nav.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(B * 0.5, 13.8, sz + 2.5), 0x501010, 0xff2020, 0));
  nav.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(-B * 0.5, 13.8, sz + 2.5), 0x105010, 0x20ff40, 0));
  nav.push(lightize(new THREE.SphereGeometry(0.35, 8, 6).translate(0, 20, sz + 1), 0xdddddd, 0xffffff, 0));
  nav.push(lightize(new THREE.SphereGeometry(0.35, 8, 6).translate(0, 8, L * 0.45), 0xdddddd, 0xffffff, 0));
  return { g: finish(hull, deck, parts, win, nav, steelDeck), L, B, kind: tanker ? 'tanker' : 'cargo' };
}
function buildFishing(rng) {
  const L = 9, B = 3;
  const parts = [], win = [], nav = [];
  const c = rng.pick([0x2a6ab0, 0x2d7a4a, 0xe8e8e8, 0xc84a1a]);
  const hull = hullGeometry(L, B, 0.8, 1.0, { bow: 0.3, stern: 0.75, colTop: c, colBottom: 0x8a1a1a, stripe: 0xf0f0f0 });
  const deck = deckGeometry(L, B, 1.0, 0.3, 0.75);
  parts.push(colorize(rbx(1.7, 1.6, 1.8, 0.06, 0, 1.8, -1.4), 0xf0f0ea));
  parts.push(colorize(bx(1.9, 0.1, 2.0, 0, 2.65, -1.4), 0xc81010));
  addWin(win, 1.5, 0.5, 0.05, 0, 2.1, -0.48);
  parts.push(colorize(cyl(0.06, 0.06, 4.5, 6, 'y', 0, 3.2, 1.5), 0x6a4a2a));
  parts.push(colorize(beam(0, 5.2, 1.5, 0, 1.2, 4.0, 0.03, 0.03, true), 0x333333));
  parts.push(colorize(rbx(1.8, 0.45, 1.4, 0.2, 0, 1.25, 2.0), 0x3a6a3a));
  for (let i = 0; i < 5; i++) parts.push(colorize(new THREE.SphereGeometry(0.13, 8, 6).translate(B * 0.45, 1.1, -2 + i * 0.8), 0xff7a10));
  nav.push(lightize(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 5.5, 1.5), 0xdddddd, 0xffffff, 0));
  return { g: finish(hull, deck, parts, win, nav, deckMat), L, B, kind: 'fishing' };
}
function buildYacht() {
  const L = 26, B = 6.5;
  const parts = [], win = [], nav = [];
  const hull = hullGeometry(L, B, 1.3, 2.2, { bow: 0.34, stern: 0.95, colTop: 0xf8f8f8, colBottom: 0x1a2a3a, stripe: 0x1a1a1a });
  const deck = deckGeometry(L, B, 2.2, 0.34, 0.95);
  parts.push(colorize(rbx(B * 0.8, 2.0, L * 0.5, 0.4, 0, 3.2, -L * 0.04), 0xf8f8f8));
  parts.push(colorize(rbx(B * 0.62, 1.5, L * 0.3, 0.35, 0, 4.9, -L * 0.1), 0xf8f8f8));
  parts.push(colorize(bx(B * 0.66, 0.1, L * 0.4, 0, 5.7, -L * 0.13), 0xf0f0f0));
  for (const s of [1, -1]) { addWin(win, 0.05, 0.8, L * 0.4, s * B * 0.401, 3.3, -L * 0.04); addWin(win, 0.05, 0.7, L * 0.24, s * B * 0.311, 5.0, -L * 0.1); }
  addWin(win, B * 0.7, 1.0, 0.05, 0, 3.5, L * 0.21 + 0.03);
  parts.push(colorize(cyl(0.06, 0.06, 3, 6, 'y', 0, 7.2, -L * 0.12), 0xcccccc));
  nav.push(lightize(new THREE.SphereGeometry(0.15, 8, 6).translate(B * 0.45, 2.6, L * 0.2), 0x501010, 0xff2020, 0));
  nav.push(lightize(new THREE.SphereGeometry(0.15, 8, 6).translate(-B * 0.45, 2.6, L * 0.2), 0x105010, 0x20ff40, 0));
  nav.push(lightize(new THREE.SphereGeometry(0.18, 8, 6).translate(0, 8.8, -L * 0.12), 0xdddddd, 0xffffff, 0));
  return { g: finish(hull, deck, parts, win, nav, deckMat), L, B, kind: 'yacht' };
}
function finish(hull, deck, parts, win, nav, dm) {
  const g = new THREE.Group();
  const hm = new THREE.Mesh(hull, hullMat); hm.castShadow = true; g.add(hm);
  g.add(new THREE.Mesh(deck, dm));
  const pm = new THREE.Mesh(mergeGeometries(parts), partMat); pm.castShadow = true; g.add(pm);
  if (win.length) g.add(new THREE.Mesh(mergeGeometries(win), winMat));
  if (nav.length) g.add(new THREE.Mesh(mergeGeometries(nav), navMat));
  return g;
}

// Su bölgeleri (balıkçı/yat dolaşımı): [x0,z0,x1,z1]
const REGIONS = {
  hornEast: [-125, 85, 185, 175],
  bosSouth: [225, -400, 395, 800],
  bosNorth: [225, -980, 395, -500],
  marmara: [-900, 850, 900, 990],
};
function clearWater(x, z, m) {
  if (isLand(x, z)) return false;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (isLand(x + Math.cos(a) * m, z + Math.sin(a) * m)) return false; }
  return Math.hypot(x - ISLAND.x, z - ISLAND.z) > ISLAND.r + m + 6;
}
function segClear(ax, az, bx2, bz, m) {
  const n = Math.ceil(Math.hypot(bx2 - ax, bz - az) / 8);
  for (let i = 1; i <= n; i++) { const t = i / n; if (!clearWater(ax + (bx2 - ax) * t, az + (bz - az) * t, m)) return false; }
  return true;
}

export class ShipTraffic {
  constructor(game) {
    this.game = game;
    this.rng = new RNG(1453);
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.wakes = (game.boats && game.boats.wakes) || new Wakes(game.scene, 700);
    this.ownWakes = !(game.boats && game.boats.wakes);
    this.ships = [];
    this.t = 0;
    this.buildPiers();
    // vapurlar
    FERRY_LINES.forEach((line, i) => {
      const m = buildFerry();
      const pts = line.map((p) => (typeof p === 'string' ? { x: PIERS[p].x, z: PIERS[p].z, dock: p } : { x: p[0], z: p[1] }));
      const s = this.addShip(m, pts[0].x, pts[0].z, PIERS[line[0]].h, { route: pts, idx: 1, dir: 1, cruise: 7.5, mode: 'dock', wait: 4 + i * 9, turnR: 55 });
      s.heading = PIERS[line[0]].h;
    });
    // Boğaz transit gemileri: güney (Marmara ↔ köprü önü) ve kuzey (Karadeniz ↔ köprü arkası)
    const south = [{ x: 368, z: 1700 }, { x: 368, z: -300 }, { x: 345, z: -390 }, { x: 300, z: -405 }, { x: 268, z: -330 }, { x: 268, z: 1700, wrap: 0 }];
    const north = [{ x: 268, z: -1700 }, { x: 268, z: -650 }, { x: 290, z: -575 }, { x: 345, z: -570 }, { x: 368, z: -640 }, { x: 368, z: -1700, wrap: 0 }];
    for (let i = 0; i < 3; i++) { const m = buildCargo(this.rng, i === 1); const r = south.map((p) => ({ ...p })); const s = this.addShip(m, r[0].x, 1700 - i * 700, Math.PI, { route: r, idx: 1, cruise: 6.5, turnR: 60, loop: true }); if (i === 2) { s.pos.x = 268; s.pos.z = 300; s.idx = 5; s.heading = 0; } }
    for (let i = 0; i < 2; i++) { const m = buildCargo(this.rng, i === 0); const r = north.map((p) => ({ ...p })); const s = this.addShip(m, 268, -1700 + i * 500, 0, { route: r, idx: 1, cruise: 6.5, turnR: 60, loop: true }); void s; }
    // Marmara açıkları
    for (let i = 0; i < 2; i++) {
      const m = buildCargo(this.rng, i === 0);
      const z = 930 + i * 50, d = i ? 1 : -1;
      const r = [{ x: -1900 * d, z }, { x: 1900 * d, z, wrap: 0 }];
      this.addShip(m, -600 * d + i * 500, z, d > 0 ? Math.PI / 2 : -Math.PI / 2, { route: r, idx: 1, cruise: 7, turnR: 80, loop: true });
    }
    // balıkçılar ve yatlar
    const regs = ['hornEast', 'hornEast', 'bosSouth', 'bosSouth', 'bosNorth', 'marmara', 'marmara'];
    for (const rk of regs) { const p = this.randomIn(rk, 4); if (p) this.addShip(buildFishing(this.rng), p.x, p.z, this.rng.float(0, 6.28), { region: rk, cruise: this.rng.float(2.5, 4), turnR: 12, wander: true, margin: 4 }); }
    for (const rk of ['bosSouth', 'bosSouth', 'marmara']) { const p = this.randomIn(rk, 8); if (p) this.addShip(buildYacht(), p.x, p.z, this.rng.float(0, 6.28), { region: rk, cruise: this.rng.float(5, 8), turnR: 30, wander: true, margin: 8 }); }
  }

  buildPiers() {
    const parts = [];
    for (const p of Object.values(PIERS)) {
      // yüzer iskele + saçak
      const along = p.side[0] === 'z';
      const w = along ? 30 : 5, d = along ? 5 : 30;
      const ox = p.side === 'x+' ? 3.5 : p.side === 'x-' ? -3.5 : 0, oz = p.side === 'z+' ? 3.5 : p.side === 'z-' ? -3.5 : 0;
      parts.push(colorize(bx(w, 0.6, d, p.x + ox, WATER_Y + 0.5, p.z + oz), 0x6a6258));
      parts.push(colorize(bx(along ? 12 : 4, 0.3, along ? 4 : 12, p.x + ox, 3.4, p.z + oz), 0x2a4a5a));
      for (const s of [-1, 1]) parts.push(colorize(cyl(0.12, 0.12, 4.4, 6, 'y', p.x + ox + (along ? s * 5 : 0), 1.2, p.z + oz + (along ? 0 : s * 5)), 0x333333));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1), new THREE.MeshBasicMaterial({ map: signTexture(p.name.toUpperCase() + ' İSKELESİ', '#1d3d6e', '#f2f0ea', 512, 96), side: THREE.DoubleSide }));
      sign.position.set(p.x + ox * 1.1, 4.2, p.z + oz * 1.1); sign.rotation.y = along ? 0 : Math.PI / 2;
      this.group.add(sign);
    }
    this.group.add(new THREE.Mesh(mergeGeometries(parts), partMat));
  }

  randomIn(rk, m) {
    const [x0, z0, x1, z1] = REGIONS[rk];
    for (let i = 0; i < 30; i++) { const x = this.rng.float(x0, x1), z = this.rng.float(z0, z1); if (clearWater(x, z, m)) return { x, z }; }
    return null;
  }

  addShip(model, x, z, heading, o) {
    const s = { mesh: model.g, L: model.L, B: model.B, kind: model.kind, pos: new THREE.Vector3(x, WATER_Y, z), heading, speed: 0, phase: Math.random() * 10, wakeT: 0, hornT: 30 + Math.random() * 60, wait: 0, ...o };
    s.mesh.rotation.order = 'YXZ';
    this.group.add(s.mesh);
    this.ships.push(s);
    return s;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const night = g.env ? g.env.nightFactor : 0;
    winMat.emissiveIntensity = night * 1.4;
    navMat.userData.uA.value.set(1.5 + night * 4, 0, 0, 0);
    const pl = g.player ? g.player.pos : { x: 0, z: 0 };
    for (const s of this.ships) this.step(s, dt, pl);
    if (this.ownWakes) this.wakes.update(dt);
    this.collidePlayer();
  }

  target(s) {
    if (s.wander) return s.wp || (s.wp = this.pickWander(s));
    return s.route[s.idx];
  }
  pickWander(s) {
    for (let i = 0; i < 12; i++) {
      const p = this.randomIn(s.region, s.margin);
      if (p && Math.hypot(p.x - s.pos.x, p.z - s.pos.z) > 40 && segClear(s.pos.x, s.pos.z, p.x, p.z, s.margin)) return p;
    }
    return { x: s.pos.x + Math.sin(s.heading + Math.PI) * 30, z: s.pos.z + Math.cos(s.heading + Math.PI) * 30 };
  }

  step(s, dt, pl) {
    const g = this.game;
    const far = Math.hypot(s.pos.x - pl.x, s.pos.z - pl.z) > 1100;
    if (s.mode === 'dock') {
      // iskelede bekle, sonra düdük çal ve kalk
      s.speed = Math.max(0, s.speed - dt * 1.5);
      const p = PIERS[s.route[s.idx - s.dir] ? s.route[s.idx - s.dir].dock : ''] || null;
      if (p) s.heading += angleDiff(s.heading, p.h) * Math.min(1, dt * 0.5);
      s.wait -= dt;
      if (s.wait <= 0) { s.mode = 'sail'; s.wp = null; if (s.kind === 'ferry' && g.boats && g.boats.horn) g.boats.horn(s.pos.x, s.pos.z, 1); }
    } else {
      const tg = this.target(s);
      const dx = tg.x - s.pos.x, dz = tg.z - s.pos.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let desired = s.cruise;
      if (tg.dock) desired = Math.min(desired, 0.6 + d * 0.12);
      // önde başka gemi varsa yavaşla
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      for (const o of this.ships) {
        if (o === s) continue;
        const ox = o.pos.x - s.pos.x, oz = o.pos.z - s.pos.z;
        const fd = ox * fx + oz * fz;
        if (fd > 0 && fd < (s.L + o.L) * 0.6 + 20 && Math.abs(ox * -fz + oz * fx) < (s.B + o.B) * 0.6 + 4) { desired = Math.min(desired, Math.max(0, (fd - (s.L + o.L) * 0.55) * 0.1)); }
      }
      s.speed += clamp(desired - s.speed, -0.8 * dt, 0.5 * dt);
      const turnRate = Math.max(0.04, s.speed / s.turnR);
      s.heading += clamp(angleDiff(s.heading, want), -turnRate * dt, turnRate * dt);
      const arrive = tg.dock ? 2.5 : Math.max(12, s.speed * 3);
      if (d < arrive) {
        if (s.wander) { s.wp = null; if (s.kind === 'fishing' && Math.random() < 0.5) { s.mode = 'dock'; s.wait = 8 + Math.random() * 20; s.route = [{}]; s.idx = 0; s.dir = 0; } }
        else if (tg.dock) { s.mode = 'dock'; s.wait = 14; this.advance(s); }
        else if (tg.wrap !== undefined) { const r0 = s.route[tg.wrap]; s.pos.x = r0.x; s.pos.z = r0.z; s.idx = tg.wrap + 1; s.heading = Math.atan2(s.route[s.idx].x - r0.x, s.route[s.idx].z - r0.z); }
        else this.advance(s);
      }
    }
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const mul = far && s.mode !== 'dock' ? 4 : 1; // görüş dışında hızlandır
    s.pos.x += fx * s.speed * dt * mul; s.pos.z += fz * s.speed * dt * mul;
    // yalpa
    s.phase += dt;
    const k = 10 / s.L;
    s.mesh.position.set(s.pos.x, WATER_Y + Math.sin(s.phase * 0.9) * 0.12 * k, s.pos.z);
    s.mesh.rotation.set(Math.sin(s.phase * 0.7) * 0.02 * k, s.heading, Math.sin(s.phase * 0.55 + 1) * 0.04 * k);
    // köpük izi (yalnız görünür mesafede)
    if (!far && s.speed > 0.8) {
      s.wakeT -= dt;
      if (s.wakeT <= 0) {
        s.wakeT = s.L > 40 ? 0.12 : 0.18;
        const hl = s.L * 0.48;
        this.wakes.spawn(s.pos.x - fx * hl, s.pos.z - fz * hl, s.B * 0.8, 2 + s.speed * 0.3, 6 + s.L * 0.05, 0.5);
        this.wakes.spawn(s.pos.x + fx * hl * 0.8 - fz * s.B * 0.45, s.pos.z + fz * hl * 0.8 + fx * s.B * 0.45, s.B * 0.25, 1.5, 3, 0.35);
        this.wakes.spawn(s.pos.x + fx * hl * 0.8 + fz * s.B * 0.45, s.pos.z + fz * hl * 0.8 - fx * s.B * 0.45, s.B * 0.25, 1.5, 3, 0.35);
      }
    }
    // büyük gemi düdüğü (oyuncu yakınsa ara sıra)
    if (s.L > 40) {
      s.hornT -= dt;
      if (s.hornT <= 0) { s.hornT = 60 + Math.random() * 90; if (!far && Math.hypot(s.pos.x - pl.x, s.pos.z - pl.z) < 450 && g.boats && g.boats.horn) g.boats.horn(s.pos.x, s.pos.z, s.kind === 'ferry' ? 1 : 1.4); }
    }
  }

  advance(s) {
    if (s.loop) { s.idx = (s.idx + 1) % s.route.length; return; }
    s.idx += s.dir;
    if (s.idx >= s.route.length || s.idx < 0) { s.dir = -s.dir; s.idx += 2 * s.dir; }
  }

  // Gemiler oyuncu teknesini / yüzen oyuncuyu iter
  collidePlayer() {
    const g = this.game;
    const list = g.vehicles ? g.vehicles.list : [];
    const pushOne = (obj, rad, isBoat) => {
      for (const s of this.ships) {
        const dx = obj.pos.x - s.pos.x, dz = obj.pos.z - s.pos.z;
        if (Math.abs(dx) > s.L || Math.abs(dz) > s.L) continue;
        const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
        const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
        const hx = s.B / 2 + rad, hz = s.L / 2 + rad * 0.5;
        if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
          const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
          let nx, nz, pen;
          if (px < pz) { const sg = Math.sign(lx) || 1; nx = fz * sg; nz = -fx * sg; pen = px; } else { const sg = Math.sign(lz) || 1; nx = fx * sg; nz = fz * sg; pen = pz; }
          obj.pos.x += nx * pen; obj.pos.z += nz * pen;
          if (isBoat) {
            const vn = obj.vx * nx + obj.vz * nz;
            const sv = s.speed * (fx * nx + fz * nz);
            if (vn < sv) { const imp = sv - vn; obj.vx += nx * imp * 1.3; obj.vz += nz * imp * 1.3; if (imp > 4) { obj.damage(imp * imp * 2, null); g.audio && g.audio.crash && g.audio.crash(obj.pos.x, obj.pos.z, Math.min(1.5, imp / 10)); } }
          }
        }
      }
    };
    for (const v of list) if (v.kind === 'boat') pushOne(v, v.def.wid * 0.5, true);
    const p = g.player;
    if (p && p.swimming && !p.vehicle) pushOne(p, 0.5, false);
  }
}
