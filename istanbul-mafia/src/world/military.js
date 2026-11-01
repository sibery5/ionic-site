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
};
export const MILITARY_PROP_OPTS = { guardtower: { radius: 650, shadow: true }, hangar: { radius: 900, shadow: true }, mtruck: { radius: 400, shadow: true }, tank: { radius: 400, shadow: true }, helipadM: { radius: 600 }, milsign: { radius: 160, double: true }, chain: { radius: 330, double: true }, razor: { radius: 220, double: true } };

export function paintMilitary(paint) {
  paint.rect(MB.x0, MB.z0, MB.x1, MB.z1, [0, 0, 0, 0]); // toprak
  paint.rect(MB.x0 + 20, MB.z0 + 20, MB.x0 + 120, MB.z0 + 90, [0, 0, 255, 0]);
  paint.rect(MB.gate.x - 5, MB.z0 + 40, MB.gate.x + 5, MB.z1, [255, 0, 0, 0]); // ana yol
  paint.rect(MB.x0 + 10, MB.z1 - 70, MB.x1 - 10, MB.z1 - 60, [255, 0, 0, 0]);
  paint.rect(-870, MB.z0 + 30, -790, MB.z0 + 110, [255, 0, 0, 0]); // tören alanı
  paint.rect(MB.x1 - 90, MB.z0 + 15, MB.x1 - 15, MB.z0 + 130, [255, 0, 0, 0]); // hangar önü
}

export function buildMilitary(city) {
  const P = city.props;
  const cols = city.physics.city;
  MB.spawnPoints.length = 0; MB.towers.length = 0; MB.barracks.length = 0;
  // çevre çiti (kapı boşluklu) + jiletli tel
  const gx = MB.gate.x;
  const H = 3;
  city.fenceLine(MB.x0, MB.z0, MB.x1, MB.z0, 'chain', H, 'razor');
  city.fenceLine(MB.x0, MB.z0, MB.x0, MB.z1, 'chain', H, 'razor');
  city.fenceLine(MB.x1, MB.z0, MB.x1, MB.z1, 'chain', H, 'razor');
  city.fenceLine(MB.x0, MB.z1, gx - 6, MB.z1, 'chain', H, 'razor');
  city.fenceLine(gx + 6, MB.z1, MB.x1, MB.z1, 'chain', H, 'razor');
  // nizamiye
  P.booth.addTRS(gx + 8.5, 0, MB.z1 - 2.5, Math.PI); cols.add(gx + 7.7, MB.z1 - 3.3, gx + 9.3, MB.z1 - 1.7, 0, 2.6, 'booth');
  P.barrier.addTRS(gx - 5, 0, MB.z1, 0); addBarrier(city, gx - 5, MB.z1, 0, 0);
  for (const x of [gx - 6.4, gx + 6.4]) { P.gatepost.addTRS(x, 0, MB.z1, 0); cols.add(x - 0.35, MB.z1 - 0.35, x + 0.35, MB.z1 + 0.35, 0, 2.6, 'gatepost'); }
  city.addSign('military', gx, 3.4, MB.z1 + 0.25, 0, 6, 1.0);
  city.addTrimBox(13.6, 0.5, 0.5, gx, 2.6, MB.z1, [0.42, 0.46, 0.34]);
  for (const x of [gx - 14, gx + 16]) { P.milsign.addTRS(x, 0, MB.z1 + 1.2, 0); cols.breakable(cols.addOBB(x, MB.z1 + 1.2, 2.0, 0.14, 0, 0, 2.4, 'sign'), 'sign', 15, P.milsign, x, 0, MB.z1 + 1.2, 0); }
  for (const z of [MB.z0 + 60, MB.z0 + 140]) { P.milsign.addTRS(MB.x1 + 1.2, 0, z, Math.PI / 2); cols.breakable(cols.addOBB(MB.x1 + 1.2, z, 2.0, 0.14, Math.PI / 2, 0, 2.4, 'sign'), 'sign', 15, P.milsign, MB.x1 + 1.2, 0, z, Math.PI / 2); }
  // gözetleme kuleleri (köşeler + kapı yanları)
  for (const [x, z] of [[MB.x0 + 4, MB.z0 + 4], [MB.x1 - 4, MB.z0 + 4], [MB.x0 + 4, MB.z1 - 4], [MB.x1 - 4, MB.z1 - 4], [gx - 18, MB.z1 - 4], [(MB.x0 + MB.x1) / 2, MB.z0 + 4]]) {
    P.guardtower.addTRS(x, 0, z, z > MB.z0 + 100 ? 0 : Math.PI);
    cols.add(x - 1.6, z - 1.6, x + 1.6, z + 1.6, 0, 10, 'guardtower');
    MB.towers.push({ x, z, y: 7.2 });
  }
  // koğuşlar (cephe şaderi, resmi stil, haki-krem)
  const bx0 = MB.x0 + 30;
  for (let i = 0; i < 4; i++) {
    const x0 = bx0, z0 = MB.z0 + 110 + i * 22, x1 = x0 + 46, z1 = z0 + 12;
    city.addZoneBuilding(x0, z0, x1, z1, 7.0, 2, '#c8c0a0', 0, 4);
    MB.barracks.push({ x0, z0, x1, z1, door: { x: (x0 + x1) / 2, z: z1 + 0.8 } });
  }
  // karargâh binası
  city.addZoneBuilding(-880, MB.z1 - 56, -830, MB.z1 - 40, 10.2, 2, '#e0dccb', 0, 0);
  // hangar
  const hx = MB.x1 - 52, hz = MB.z0 + 50;
  P.hangar.addTRS(hx, 0, hz, 0);
  for (const s of [-1, 1]) cols.add(hx + s * 14 - 1, hz - 25, hx + s * 14 + 1, hz + 25, 0, 10, 'hangar');
  cols.add(hx - 14, hz - 26, hx + 14, hz - 24, 0, 14, 'hangar');
  cols.add(hx - 9, hz - 25, hx + 9, hz + 25, 9, 14, 'hangarRoof');
  MB.hangar = { x: hx, z: hz, w: 28, d: 50, door: { x: hx, z: hz + 25 } };
  // helipad
  P.helipadM.addTRS(MB.helipad.x, 0, MB.helipad.z, 0);
  // tören alanı bayrağı
  P.flagpole.addTRS(-830, 0, MB.z0 + 70, 0); cols.addCircle(-830, MB.z0 + 70, 0.12, 0, 9.2, 'pole');
  // park halindeki araçlar (yer tutucu) + doğma noktaları
  for (let i = 0; i < 5; i++) {
    const x = MB.x1 - 80 + i * 6, z = MB.z0 + 105;
    P.mtruck.addTRS(x, 0, z, Math.PI); cols.add(x - 1.3, z - 3.8, x + 1.3, z + 3.8, 0, 3, 'mtruck');
    MB.spawnPoints.push({ type: 'truck', x, z, heading: Math.PI, placeholder: true });
  }
  for (let i = 0; i < 3; i++) {
    const x = MB.x1 - 80 + i * 8, z = MB.z0 + 122;
    P.tank.addTRS(x, 0, z, Math.PI); cols.add(x - 1.8, z - 3.6, x + 1.8, z + 3.6, 0, 2.4, 'tank');
    MB.spawnPoints.push({ type: 'tank', x, z, heading: Math.PI, placeholder: true });
  }
  for (let i = 0; i < 4; i++) MB.spawnPoints.push({ type: 'jeep', x: gx + 12 + i * 4, z: MB.z1 - 14, heading: 0 });
  for (let i = 0; i < 10; i++) MB.spawnPoints.push({ type: 'soldier', x: -860 + (i % 5) * 8, z: MB.z0 + 60 + Math.floor(i / 5) * 8, heading: Math.PI });
  MB.spawnPoints.push({ type: 'helicopter', x: MB.helipad.x, z: MB.helipad.z, heading: 0 });
  // sınır çevresi aydınlatma
  for (let x = MB.x0 + 20; x < MB.x1; x += 40) { P.lampModern.addTRS(x, 0, MB.z0 + 6, Math.PI); cols.addCircle(x, MB.z0 + 6, 0.2, 0, 6.6, 'lamp'); }
}
