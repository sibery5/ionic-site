// Askeri Üs (Beşiktaş kuzeybatı köşesi): tel örgü + jiletli tel çevre çiti, nizamiye kapısı, gözetleme kuleleri,
// koğuşlar, hangar, helipad, tören alanı ve bayrak, park halinde askeri kamyon/tank yer tutucuları.
// Doğma noktaları MILITARY_BASE.spawnPoints içine yazılır (araç modelleri başka modülde).
import * as THREE from 'three';
import { MILITARY_BASE as MB } from './map.js';
import { GeoBuilder } from './instancer.js';
import { addBarrier } from './zones.js';

export const MILITARY_PROP_DEFS = {
  guardtower: () => {
    const g = new GeoBuilder();
    const steel = { color: 0x4a5040, metal: 0.5, rough: 0.6 };
    for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) g.box(0.2, 7, 0.2, { x, z, ...steel });
    g.box(3.2, 0.2, 3.2, { y: 7, color: 0x5a5f48 });
    g.box(3.2, 1.0, 0.1, { y: 7.2, z: 1.55, uv: 'camo' }).box(3.2, 1.0, 0.1, { y: 7.2, z: -1.55, uv: 'camo' }).box(0.1, 1.0, 3.2, { x: 1.55, y: 7.2, uv: 'camo' }).box(0.1, 1.0, 3.2, { x: -1.55, y: 7.2, uv: 'camo' });
    for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) g.box(0.1, 1.5, 0.1, { x, y: 8.2, z, ...steel });
    g.add(new THREE.ConeGeometry(2.6, 1.0, 4), { y: 10.2, ry: Math.PI / 4, color: 0x3e4630, rough: 0.7 });
    g.box(0.5, 0.35, 0.5, { y: 9.3, z: 1.4, color: 0xffffd8, emis: 1.5 });
    for (let i = 0; i < 12; i++) g.box(0.7, 0.05, 0.05, { y: 0.5 + i * 0.55, z: 1.35, color: 0x333333, metal: 0.6 });
    return g.build();
  },
  hangar: () => {
    const g = new GeoBuilder();
    const arch = new THREE.CylinderGeometry(14, 14, 50, 20, 1, true, -Math.PI / 2, Math.PI);
    arch.rotateX(-Math.PI / 2); // yay ekseni z, üst yarım
    g.add(arch, { y: 0, color: 0x8a9086, metal: 0.6, rough: 0.45, ry: 0 });
    const back = new THREE.CircleGeometry(14, 20, 0, Math.PI); g.add(back, { z: -25, ry: Math.PI, color: 0x6a7068, metal: 0.4 });
    g.add(new THREE.CircleGeometry(13.6, 20, 0, Math.PI), { z: -24.5, color: 0x1a1c1e, rough: 0.9 }); // iç karanlık
    g.box(30, 0.3, 50, { color: 0x555555, rough: 0.8 });
    return g.build();
  },
  mtruck: () => {
    const g = new GeoBuilder();
    g.box(2.5, 1.0, 7.5, { y: 0.9, color: 0x3e4630, rough: 0.7 });
    g.box(2.5, 1.6, 2.2, { y: 1.8, z: 2.6, color: 0x4a5238, rough: 0.6 });
    g.box(2.2, 0.6, 0.05, { y: 2.6, z: 3.72, color: 0x1a2228, rough: 0.1, metal: 0.4 });
    g.box(2.6, 2.2, 5.0, { y: 1.9, z: -1.2, uv: 'camo', rough: 0.9 });
    for (const z of [2.6, -1.2, -2.8]) for (const x of [-1.25, 1.25]) g.add(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12), { x, y: 0.55, z, rz: Math.PI / 2, color: 0x151515, rough: 0.9 });
    return g.build();
  },
  tank: () => {
    const g = new GeoBuilder();
    g.box(3.4, 1.1, 7.0, { y: 0.4, color: 0x4a5238, rough: 0.7 });
    for (const x of [-1.6, 1.6]) g.box(0.7, 0.9, 7.2, { x, y: 0.1, color: 0x222222, rough: 0.9 });
    g.box(2.6, 0.9, 3.2, { y: 1.5, z: -0.3, uv: 'camo', rough: 0.8 });
    g.add(new THREE.CylinderGeometry(0.12, 0.14, 5.0, 8), { y: 1.95, z: 3.4, rx: Math.PI / 2, color: 0x3e4630, metal: 0.4 });
    g.cyl(0.35, 0.35, 0.4, 8, { x: 0.7, y: 2.4, z: -0.8, color: 0x3e4630 });
    return g.build();
  },
  helipadM: () => new GeoBuilder().add(new THREE.CircleGeometry(11, 32), { rx: -Math.PI / 2, y: 0.03, uv: 'helipad', rough: 0.7 }).build(),
  milsign: () => new GeoBuilder().cyl(0.05, 0.05, 1.6, 6, { x: -0.8, color: 0x777777, metal: 0.6 }).cyl(0.05, 0.05, 1.6, 6, { x: 0.8, color: 0x777777, metal: 0.6 }).add(new THREE.PlaneGeometry(2.0, 1.0), { y: 1.9, uv: 'military' }).build(),
  chain: () => new GeoBuilder().plane(4, 1, { x: 2, y: 0.5, uv: 'chain', color: 0xffffff, metal: 0.7, rough: 0.5 })
    .box(0.09, 1.08, 0.09, { color: 0x7a8084, metal: 0.7, rough: 0.4 }).build(),
  razor: () => new GeoBuilder().add(new THREE.PlaneGeometry(4, 0.6), { x: 2, y: 0.3, uv: 'razor', metal: 0.7 }).build(),
  sandbag: () => {
    // U biçimli kum torbası mevzisi (yerel: açıklık -z), 4 x 3 m, 1.1 m
    const g = new GeoBuilder();
    const bag = { color: 0x8a7a58, rough: 0.95 };
    for (let r = 0; r < 3; r++) {
      const y = r * 0.36, o = (r % 2) * 0.3;
      for (let x = -1.8 + o; x <= 1.8; x += 0.6) g.add(new THREE.CapsuleGeometry(0.17, 0.32, 2, 6), { x, y: y + 0.17, z: 1.3, rz: Math.PI / 2, ...bag, sy: 0.8 });
      for (const sx of [-1.9, 1.9]) for (let z = -1.2 + o; z <= 1.0; z += 0.6) g.add(new THREE.CapsuleGeometry(0.17, 0.32, 2, 6), { x: sx, y: y + 0.17, z, rx: Math.PI / 2, ...bag, sy: 0.8 });
    }
    return g.build();
  },
  jetF: () => {
    // "SF-16 Şimşek" (kurgusal, F-16 benzeri tek motorlu avcı) — +z burun
    const g = new GeoBuilder();
    const grey = { color: 0x8a949c, metal: 0.45, rough: 0.45 };
    g.add(new THREE.CylinderGeometry(0.75, 0.9, 11, 12), { rx: Math.PI / 2, y: 1.9, ...grey });
    g.add(new THREE.ConeGeometry(0.75, 3.2, 12), { rx: Math.PI / 2, y: 1.9, z: 7.1, ...grey });
    g.add(new THREE.CylinderGeometry(0.85, 0.7, 1.2, 12), { rx: Math.PI / 2, y: 1.9, z: -6.0, color: 0x3a3a3a, metal: 0.7 });
    g.add(new THREE.SphereGeometry(0.62, 10, 6), { y: 2.55, z: 3.6, sz: 2.4, color: 0x3a4a3a, rough: 0.05, metal: 0.8 });
    const wing = new THREE.Shape(); wing.moveTo(0, 2.2); wing.lineTo(4.9, -1.4); wing.lineTo(4.9, -2.4); wing.lineTo(0, -2.6); wing.lineTo(0, 2.2);
    for (const s of [-1, 1]) {
      const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.14, bevelEnabled: false }); wg.rotateX(Math.PI / 2); if (s < 0) wg.scale(-1, 1, 1);
      g.add(wg, { y: 1.75, z: -0.6, ...grey });
      g.box(0.12, 0.12, 2.6, { x: s * 4.9, y: 1.6, z: -1.9, color: 0x5a5f64 }); // uç füze rayı
      const st = new THREE.Shape(); st.moveTo(0, 0); st.lineTo(2.1, -1.0); st.lineTo(2.1, -1.8); st.lineTo(0, -1.8);
      const sg = new THREE.ExtrudeGeometry(st, { depth: 0.1, bevelEnabled: false }); sg.rotateX(Math.PI / 2); if (s < 0) sg.scale(-1, 1, 1);
      g.add(sg, { y: 1.9, z: -4.0, ...grey });
    }
    const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-2.8, 0); fin.lineTo(-3.4, 3.0); fin.lineTo(-2.2, 3.0); fin.lineTo(0, 0);
    g.add(new THREE.ExtrudeGeometry(fin, { depth: 0.12, bevelEnabled: false }), { ry: Math.PI / 2, x: -0.06, y: 2.5, z: -2.6, ...grey });
    for (const [x, z] of [[0, 4.6], [-1.3, -0.8], [1.3, -0.8]]) { g.cyl(0.06, 0.06, 1.2, 5, { x, z, color: 0x333333 }); g.add(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), { x, y: 0.3, z, rz: Math.PI / 2, color: 0x151515 }); }
    return g.build();
  },
  aheli: () => {
    // "AH-9 Kartal" (kurgusal taarruz helikopteri): ince gövde, tandem kokpit, kanatçıklar, 4 pal
    const g = new GeoBuilder();
    const ol = { color: 0x4a5238, rough: 0.6, metal: 0.2 };
    g.box(1.3, 1.6, 6.0, { y: 0.9, z: 0.6, ...ol });
    g.add(new THREE.ConeGeometry(0.7, 1.8, 8), { rx: Math.PI / 2, y: 1.6, z: 4.4, ...ol });
    g.box(0.95, 0.85, 3.0, { y: 2.45, z: 1.9, color: 0x22302c, rough: 0.05, metal: 0.7 });
    g.box(0.55, 0.6, 7.0, { y: 1.9, z: -5.4, ...ol });
    g.box(0.12, 1.9, 1.4, { y: 2.2, z: -8.6, ...ol });
    g.box(2.2, 0.1, 0.6, { y: 2.0, z: -8.0, ...ol });
    for (const s of [-1, 1]) { g.box(2.0, 0.12, 0.9, { x: s * 1.6, y: 1.5, z: 0.4, ...ol }); g.cyl(0.18, 0.18, 1.4, 8, { x: s * 2.3, y: 1.3, z: 0.4, rx: Math.PI / 2, color: 0x333333 }); }
    g.cyl(0.25, 0.3, 0.7, 8, { y: 2.6, z: 0.2, color: 0x333333, metal: 0.6 });
    for (let i = 0; i < 4; i++) g.box(0.32, 0.05, 6.2, { y: 3.35, ry: i * Math.PI / 2 + 0.3, color: 0x1a1a1a, sz: 1 });
    g.box(0.06, 1.4, 0.18, { x: 0.32, y: 2.2, z: -8.6, color: 0x1a1a1a });
    for (const s of [-1, 1]) g.box(0.1, 0.1, 3.2, { x: s * 0.9, y: 0.05, z: 0.6, color: 0x333333, metal: 0.6 });
    g.cyl(0.12, 0.12, 0.6, 6, { y: 0.1, z: 4.4, color: 0x222222 });
    return g.build();
  },
  apc: () => {
    // 8x8 zırhlı personel taşıyıcı
    const g = new GeoBuilder();
    g.box(2.7, 1.5, 7.2, { y: 0.8, uv: 'camo', rough: 0.8 });
    g.add(new THREE.BoxGeometry(2.7, 0.9, 1.4), { y: 1.75, z: 3.3, rx: 0.5, color: 0x4a5238, rough: 0.7 });
    g.cyl(0.55, 0.6, 0.5, 8, { y: 2.3, z: -0.3, color: 0x4a5238 });
    g.add(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), { y: 2.6, z: 0.6, rx: Math.PI / 2, color: 0x222222 });
    for (const z of [-2.6, -1.0, 1.0, 2.6]) for (const x of [-1.35, 1.35]) g.add(new THREE.CylinderGeometry(0.55, 0.55, 0.42, 12), { x, y: 0.55, z, rz: Math.PI / 2, color: 0x151515, rough: 0.9 });
    return g.build();
  },
  wallSeg: () => new GeoBuilder().box(4, 3.2, 0.6, { x: 2, color: 0xcbc3ae, rough: 0.9 }).box(4, 0.25, 0.8, { x: 2, y: 3.2, color: 0x9a947f }).box(4, 0.35, 0.62, { x: 2, y: 2.6, color: 0x6a7a4a }).build(),
  searchlamp: () => new GeoBuilder().cyl(0.35, 0.45, 0.7, 10, { rx: Math.PI / 2 - 0.3, color: 0x2a2f2a, metal: 0.6 }).cyl(0.36, 0.36, 0.05, 10, { rx: Math.PI / 2 - 0.3, z: 0.36, y: 0.1, color: 0xf0f4ff, emis: 4 }).build(),
};
export const MILITARY_PROP_OPTS = { guardtower: { radius: 650, shadow: true }, hangar: { radius: 900, shadow: true }, mtruck: { radius: 400, shadow: true }, tank: { radius: 400, shadow: true }, helipadM: { radius: 600 }, milsign: { radius: 160, double: true }, chain: { radius: 330, double: true }, razor: { radius: 220, double: true },
  sandbag: { radius: 260, shadow: true }, jetF: { radius: 600, shadow: true }, aheli: { radius: 600, shadow: true }, apc: { radius: 400, shadow: true }, wallSeg: { radius: 700, shadow: true }, searchlamp: { radius: 400 } };

// Yerleşim (MB: x0..x1 ≈ -976..-709, z0..z1 ≈ -976..-769; kapı güneyde gx=-760):
//  kuzey şeridi: pist (z0+16..z0+32, doğu-batı) · altında apron (jetler, helipadlar) · doğuda iki hangar (kapıları piste)
//  batı: koğuşlar + kontrol kulesi · orta: tören alanı + bayrak · güney: karargâh, nizamiye
const RW = () => ({ x0: MB.x0 + 14, x1: MB.x1 - 14, z0: MB.z0 + 16, z1: MB.z0 + 32 });
const FENCE_IN = 6; // iç tel örgü hattının duvardan içeri mesafesi

export function paintMilitary(paint) {
  const DIRT = [0, 0, 0, 0], ASPH = [255, 0, 0, 0], GRASS = [0, 0, 255, 0], PAVE = [0, 255, 0, 0];
  paint.rect(MB.x0, MB.z0, MB.x1, MB.z1, DIRT); // toprak
  paint.rect(MB.x0 + 3, MB.z0 + 3, MB.x1 - 3, MB.z0 + 14, GRASS); // pist güvenlik şeridi
  const r = RW();
  paint.rect(r.x0, r.z0, r.x1, r.z1, ASPH); // pist
  paint.rect(-945, MB.z0 + 32, -770, MB.z0 + 60, ASPH); // apron + taksi yolu
  paint.rect(MB.gate.x - 5, MB.z0 + 40, MB.gate.x + 5, MB.z1, ASPH); // ana yol
  paint.rect(MB.x0 + 10, MB.z1 - 70, MB.x1 - 10, MB.z1 - 60, ASPH);
  paint.rect(-885, MB.z0 + 80, -815, MB.z0 + 140, PAVE); // tören alanı
  paint.rect(MB.x1 - 104, MB.z0 + 32, MB.x1 - 10, MB.z0 + 130, ASPH); // hangar önü
  paint.rect(MB.x0 + 8, MB.z0 + 64, MB.x0 + 72, MB.z0 + 108, ASPH); // helipad sahası
}

// yer tutucu örneğini gizle (araç mühendisi gerçek aracı koyduğunda): matris sıfırlanır, çarpışmalar silinir
function hideInst(inst, x, z) {
  if (!inst || !inst.M) return false;
  const M = inst.M;
  for (let o = 0; o < M.length; o += 16) if (M[o] !== 0 && Math.abs(M[o + 12] - x) < 0.05 && Math.abs(M[o + 14] - z) < 0.05) { M.fill(0, o, o + 16); inst.last = null; return true; }
  return false;
}

export function buildMilitary(city) {
  const P = city.props;
  const cols = city.physics.city;
  MB.spawnPoints.length = 0; MB.towers.length = 0; MB.barracks.length = 0;
  MB.guardPosts = []; MB.patrolRoutes = []; MB.hangars = []; MB.walls = [];
  const gx = MB.gate.x;
  // ---- dış beton duvar (3.2 m, kapı boşluklu) ----
  const wall = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.5) return;
    const ry = Math.atan2(-(z1 - z0), x1 - x0), dx = (x1 - x0) / L, dz = (z1 - z0) / L;
    for (let s = 0; s < L - 0.05; s += 4) P.wallSeg.addTRS(x0 + dx * s, 0, z0 + dz * s, ry, Math.min(4, L - s) / 4, 1, 1);
    cols.add(Math.min(x0, x1) - 0.32, Math.min(z0, z1) - 0.32, Math.max(x0, x1) + 0.32, Math.max(z0, z1) + 0.32, 0, 3.45, 'milWall');
    MB.walls.push({ x0, z0, x1, z1, h: 3.45 });
  };
  wall(MB.x0, MB.z0, MB.x1, MB.z0);
  wall(MB.x0, MB.z0, MB.x0, MB.z1);
  wall(MB.x1, MB.z0, MB.x1, MB.z1);
  wall(MB.x0, MB.z1, gx - 7, MB.z1);
  wall(gx + 7, MB.z1, MB.x1, MB.z1);
  // ---- iç tel örgü + jiletli tel (duvardan 6 m içeride; kapı boşluklu) ----
  const fi = FENCE_IN, fx0 = MB.x0 + fi, fx1 = MB.x1 - fi, fz0 = MB.z0 + fi, fz1 = MB.z1 - fi;
  const H = 3;
  city.fenceLine(fx0, fz0, fx1, fz0, 'chain', H, 'razor');
  city.fenceLine(fx0, fz0, fx0, fz1, 'chain', H, 'razor');
  city.fenceLine(fx1, fz0, fx1, fz1, 'chain', H, 'razor');
  city.fenceLine(fx0, fz1, gx - 6, fz1, 'chain', H, 'razor');
  city.fenceLine(gx + 6, fz1, fx1, fz1, 'chain', H, 'razor');
  // ---- nizamiye: dış + iç bariyer, kulübe, kapı direkleri, kum torbası mevzileri, uyarı tabelaları ----
  P.booth.addTRS(gx + 9, 0, MB.z1 - 2.8, Math.PI); cols.add(gx + 8.2, MB.z1 - 3.6, gx + 9.8, MB.z1 - 2.0, 0, 2.6, 'booth');
  P.barrier.addTRS(gx - 5, 0, MB.z1, 0); addBarrier(city, gx - 5, MB.z1, 0, 0);
  P.barrier.addTRS(gx - 5, 0, fz1, 0); addBarrier(city, gx - 5, fz1, 0, 0);
  for (const x of [gx - 7.4, gx + 7.4]) { P.gatepost.addTRS(x, 0, MB.z1, 0); cols.add(x - 0.35, MB.z1 - 0.35, x + 0.35, MB.z1 + 0.35, 0, 2.6, 'gatepost'); }
  city.addSign('military', gx, 3.6, MB.z1 + 0.42, 0, 6, 1.0);
  city.addTrimBox(15.4, 0.5, 0.5, gx, 3.2, MB.z1, [0.42, 0.46, 0.34]);
  const sand = (x, z, rot, tag = 'sandbag') => { P.sandbag.addTRS(x, 0, z, rot); cols.addOBB(x, z, 4.2, 3.0, rot, 0, 1.1, tag); };
  sand(gx - 11, MB.z1 - 4, Math.PI); sand(gx + 14, MB.z1 - 9, Math.PI);
  const sign = (x, z, rot) => { P.milsign.addTRS(x, 0, z, rot); cols.breakable(cols.addOBB(x, z, 2.0, 0.14, rot, 0, 2.4, 'sign'), 'sign', 15, P.milsign, x, 0, z, rot); };
  for (const x of [gx - 16, gx + 18]) sign(x, MB.z1 + 1.4, 0);
  for (let x = MB.x0 + 30; x < MB.x1 - 20; x += 60) if (Math.abs(x - gx) > 30) sign(x, MB.z1 + 1.4, 0);
  for (let z = MB.z0 + 30; z < MB.z1 - 10; z += 55) sign(MB.x1 + 1.4, z, Math.PI / 2);
  // ---- gözetleme kuleleri + projektörler ----
  const cx = (MB.x0 + MB.x1) / 2, cz = (MB.z0 + MB.z1) / 2;
  const towerPts = [[MB.x0 + 3, MB.z0 + 3], [MB.x1 - 3, MB.z0 + 3], [MB.x0 + 3, MB.z1 - 3], [MB.x1 - 3, MB.z1 - 3], [gx - 18, MB.z1 - 3], [cx, MB.z0 + 3], [MB.x0 + 3, cz], [MB.x1 - 3, cz]];
  towerPts.forEach(([x, z], i) => {
    const face = Math.atan2(cx - x, cz - z);
    P.guardtower.addTRS(x, 0, z, z > MB.z0 + 100 ? 0 : Math.PI);
    cols.add(x - 1.6, z - 1.6, x + 1.6, z + 1.6, 0, 10, 'guardtower');
    MB.towers.push({ x, z, y: 7.2 });
    MB.guardPosts.push({ type: 'tower', x, z, y: 7.2, heading: face, id: 'kule' + i });
    const lx = x + Math.sin(face) * 1.2, lz = z + Math.cos(face) * 1.2;
    P.searchlamp.addTRS(lx, 8.4, lz, face);
    // projektör tarama merkezi: kuleden 'reach' m, ±sweep rad (çiftler dışarıyı, tekler içeriyi tarar)
    const out = Math.atan2(x - cx, z - cz);
    city.searchlights.push({ x: lx, y: 8.7, z: lz, baseA: i % 2 ? out : face, sweep: 0.9, reach: 40, speed: 0.35 + (i % 3) * 0.08, phase: i * 1.7, tx: x, tz: z });
  });
  MB.guardPosts.push({ type: 'gate', x: gx + 9, z: MB.z1 - 4.5, heading: 0, id: 'nizamiye' }, { type: 'gate', x: gx - 3, z: MB.z1 - 2.5, heading: 0, id: 'nizamiye2' });
  MB.guardPosts.push({ type: 'bunker', x: gx - 11, z: MB.z1 - 6, heading: 0, id: 'mevzi1' }, { type: 'bunker', x: gx + 14, z: MB.z1 - 11, heading: 0, id: 'mevzi2' });
  // ---- pist: işaretler + kenar ışıkları ----
  const r = RW(), rzc = (r.z0 + r.z1) / 2, W = new THREE.Color(0xf2f2ea), Yc = new THREE.Color(0xe8b830);
  for (let x = r.x0 + 30; x < r.x1 - 30; x += 16) city.mark(x, rzc, 8, 0.45, 0, W, 0.005);
  city.mark((r.x0 + r.x1) / 2, r.z0 + 0.7, r.x1 - r.x0 - 2, 0.35, 0, W, 0.005);
  city.mark((r.x0 + r.x1) / 2, r.z1 - 0.7, r.x1 - r.x0 - 2, 0.35, 0, W, 0.005);
  for (const [xe, dir] of [[r.x0, 1], [r.x1, -1]]) {
    for (let i = 0; i < 6; i++) city.mark(xe + dir * 9, r.z0 + 2.2 + i * 2.3, 12, 1.1, 0, W, 0.005); // eşik çizgileri
    for (const dz of [-3.5, 3.5]) city.mark(xe + dir * 45, rzc + dz, 18, 1.6, 0, W, 0.005); // temas bölgesi
    city.mark(xe + dir * 2.5, rzc, 0.6, r.z1 - r.z0 - 1, 0, Yc, 0.005);
  }
  city.mark(-860, MB.z0 + 46, 0.3, 26, 0, Yc, 0.005); // taksi yolu orta çizgisi
  for (let x = r.x0; x <= r.x1; x += 20) for (const z of [r.z0 - 0.8, r.z1 + 0.8]) P.rlight.addTRS(x, 0, z, 0);
  // ---- hangarlar (kapılar kuzeye, piste bakar) ----
  for (const hx of [MB.x1 - 52, MB.x1 - 88]) {
    const hz = MB.z0 + 66;
    P.hangar.addTRS(hx, 0, hz, Math.PI);
    for (const s2 of [-1, 1]) cols.add(hx + s2 * 14 - 1, hz - 25, hx + s2 * 14 + 1, hz + 25, 0, 10, 'hangar');
    cols.add(hx - 14, hz + 24, hx + 14, hz + 26, 0, 14, 'hangar');
    cols.add(hx - 9, hz - 25, hx + 9, hz + 25, 9, 14, 'hangarRoof');
    MB.hangars.push({ x: hx, z: hz, w: 28, d: 50, door: { x: hx, z: hz - 25 } });
    MB.guardPosts.push({ type: 'hangar', x: hx + 10, z: hz - 28, heading: Math.PI, id: 'hangar' + MB.hangars.length });
    city.addLight(hx, 9.5, hz - 27, 0xfff0d8, 1.6, true, 0.03).r = 40;
  }
  MB.hangar = MB.hangars[0];
  // ---- kontrol kulesi, koğuşlar, karargâh ----
  const ctx = MB.x0 + 22, ctz = MB.z0 + 56;
  P.ctower.addTRS(ctx, 0, ctz, 0); cols.addCircle(ctx, ctz, 2.8, 0, 26, 'ctower'); cols.addCircle(ctx, ctz, 4.4, 26, 30.6, 'ctower');
  MB.controlTower = { x: ctx, z: ctz, h: 30 };
  const bx0 = MB.x0 + 30;
  for (let i = 0; i < 4; i++) {
    const x0 = bx0, z0 = MB.z0 + 116 + i * 20, x1 = x0 + 46, z1 = z0 + 11;
    city.addZoneBuilding(x0, z0, x1, z1, 7.0, 2, '#c8c0a0', 0, 4);
    MB.barracks.push({ x0, z0, x1, z1, door: { x: (x0 + x1) / 2, z: z1 + 0.8 } });
  }
  city.addZoneBuilding(-880, MB.z1 - 56, -830, MB.z1 - 40, 10.2, 2, '#e0dccb', 0, 0);
  MB.hq = { x0: -880, z0: MB.z1 - 56, x1: -830, z1: MB.z1 - 40, door: { x: -855, z: MB.z1 - 39.2 } };
  // ---- helipadlar ----
  P.helipadM.addTRS(MB.helipad.x, 0, MB.helipad.z, 0);
  const pads = [{ x: MB.x0 + 34, z: MB.z0 + 86 }, { x: MB.x0 + 60, z: MB.z0 + 86 }];
  for (const pd of pads) P.helipadM.addTRS(pd.x, 0, pd.z, 0);
  // ---- tören alanı + bayrak ----
  P.flagpole.addTRS(-850, 0, MB.z0 + 110, 0); cols.addCircle(-850, MB.z0 + 110, 0.12, 0, 9.2, 'pole');
  // ---- kum torbası mevzileri (pist uçları, hangar önü, kuzey orta) ----
  sand(r.x0 + 4, r.z1 + 8, 0); sand(r.x1 - 4, r.z1 + 8, 0); sand(MB.x1 - 70, MB.z0 + 98, Math.PI); sand(cx + 12, MB.z0 + 11, 0);
  // ---- doğma noktaları (yer tutucu modeller; MB.removePlaceholder(sp) gerçek araç konunca gizler) ----
  const DIMS = { jetF: [10, 15, 1.6], aheli: [3.6, 13, 3.5], apc: [2.8, 7.4, 2.6], mtruck: [2.6, 7.6, 3], tank: [3.6, 7.2, 2.4] };
  const ph = (type, propKey, x, z, heading, extra = {}) => {
    const sp = { type, x, z, heading, placeholder: !!propKey, ...extra };
    if (propKey) {
      P[propKey].addTRS(x, 0, z, heading);
      const d = DIMS[propKey];
      sp.colliders = [cols.addOBB(x, z, d[0], d[1], heading, 0, d[2], 'milVehicle')];
      sp.prop = propKey;
    }
    MB.spawnPoints.push(sp);
    return sp;
  };
  for (let i = 0; i < 3; i++) ph('jet', 'jetF', -905 + i * 22, MB.z0 + 50, Math.PI, { model: 'SF-16 Şimşek', runway: { x: r.x0 + 20, z: rzc, heading: Math.PI / 2 } });
  for (const pd of pads) ph('attackHeli', 'aheli', pd.x, pd.z, Math.PI, { model: 'AH-9 Kartal' });
  ph('helicopter', null, MB.helipad.x, MB.helipad.z, 0);
  for (let i = 0; i < 5; i++) ph('truck', 'mtruck', MB.x1 - 80 + i * 6, MB.z0 + 108, Math.PI);
  for (let i = 0; i < 3; i++) ph('tank', 'tank', MB.x1 - 80 + i * 8, MB.z0 + 124, Math.PI);
  for (let i = 0; i < 3; i++) ph('apc', 'apc', MB.x1 - 50 + i * 6, MB.z0 + 124, Math.PI, { model: 'ZPT-8 Pars' });
  for (let i = 0; i < 4; i++) MB.spawnPoints.push({ type: 'jeep', x: gx + 12 + i * 4, z: MB.z1 - 18, heading: 0 });
  for (let i = 0; i < 10; i++) MB.spawnPoints.push({ type: 'soldier', x: -870 + (i % 5) * 8, z: MB.z0 + 100 + Math.floor(i / 5) * 8, heading: Math.PI });
  MB.removePlaceholder = (sp) => {
    if (!sp || !sp.placeholder) return false;
    if (sp.prop) hideInst(P[sp.prop], sp.x, sp.z);
    for (const c of sp.colliders || []) cols.remove(c);
    sp.placeholder = false; sp.colliders = [];
    return true;
  };
  // ---- devriye rotaları (YZ): iç çit boyunca tur, pist turu, koğuş/karargâh turu, duvar dışı (güney+doğu) ----
  const ins = 4;
  MB.patrolRoutes.push({ id: 'cevre', loop: true, points: [{ x: fx0 + ins, z: fz0 + ins }, { x: fx1 - ins, z: fz0 + ins }, { x: fx1 - ins, z: fz1 - ins }, { x: gx + 8, z: fz1 - ins }, { x: gx - 8, z: fz1 - ins }, { x: fx0 + ins, z: fz1 - ins }] });
  MB.patrolRoutes.push({ id: 'pist', loop: true, points: [{ x: r.x0 + 4, z: r.z1 + 4 }, { x: r.x1 - 4, z: r.z1 + 4 }, { x: MB.x1 - 70, z: MB.z0 + 94 }, { x: -905, z: MB.z0 + 62 }] });
  MB.patrolRoutes.push({ id: 'kogus', loop: true, points: [{ x: bx0 - 4, z: MB.z0 + 112 }, { x: bx0 + 52, z: MB.z0 + 112 }, { x: bx0 + 52, z: MB.z0 + 190 }, { x: -855, z: MB.z1 - 36 }, { x: bx0 - 4, z: MB.z0 + 190 }] });
  MB.patrolRoutes.push({ id: 'dis', loop: false, points: [{ x: MB.x0 + 10, z: MB.z1 + 5 }, { x: gx - 14, z: MB.z1 + 5 }, { x: gx + 14, z: MB.z1 + 5 }, { x: MB.x1 + 5, z: MB.z1 + 5 }, { x: MB.x1 + 5, z: MB.z0 + 10 }] });
  // ---- bölgeler: uyarı (dış, duvarın 40 m çevresi) ve ölümcül (iç çitin içi) ----
  MB.warnZone = { x0: MB.x0 - 40, z0: MB.z0 - 40, x1: MB.x1 + 40, z1: MB.z1 + 40, label: 'ASKERİ YASAK BÖLGE' };
  MB.lethalZone = { x0: fx0, z0: fz0, x1: fx1, z1: fz1 };
  MB.runway = { ...r, heading: Math.PI / 2, start: { x: r.x0 + 15, z: rzc }, end: { x: r.x1 - 15, z: rzc } };
  // ---- aydınlatma: çevre lambaları + apron projektörleri ----
  for (let x = MB.x0 + 20; x < MB.x1; x += 40) { P.lampModern.addTRS(x, 0, MB.z0 + 9, Math.PI); cols.addCircle(x, MB.z0 + 9, 0.2, 0, 6.6, 'lamp'); city.addLight(x, 6.4, MB.z0 + 10.6, 0xe8f0ff, 1); }
  for (let x = MB.x0 + 30; x < MB.x1; x += 60) if (Math.abs(x - gx) > 14) { P.lampModern.addTRS(x, 0, MB.z1 - 9, 0); cols.addCircle(x, MB.z1 - 9, 0.2, 0, 6.6, 'lamp'); city.addLight(x, 6.4, MB.z1 - 10.6, 0xe8f0ff, 1); }
  for (const [x, z] of [[-920, MB.z0 + 64], [-850, MB.z0 + 64], [MB.x0 + 47, MB.z0 + 100]]) { P.floodmast.addTRS(x, 0, z, 0); cols.addCircle(x, z, 0.45, 0, 24, 'mast'); city.addLight(x, 23.4, z, 0xf0f4ff, 2.2, true, 0.03).r = 60; }
}
