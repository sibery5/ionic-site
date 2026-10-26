// Havalimanı (pist, apron, hangarlar, terminal, kule, helipadlar), Bebek Marina (iskeleler, yat yerleri, kulüp)
// ve Boğaz kıyısındaki satılık yalı/villa parselleri (bahçe duvarı, havuz, palmiyeler).
import * as THREE from 'three';
import { AIRPORT as AP, MARINA as MR, VILLAS, WATER_Y } from './map.js';
import { GeoBuilder } from './instancer.js';

export const ZONE_PROP_DEFS = {
  ctower: () => {
    const g = new GeoBuilder();
    g.cyl(2.2, 2.8, 26, 14, { color: 0xe8e8e4, rough: 0.6 });
    g.cyl(4.2, 3.4, 4.0, 10, { y: 26, color: 0x1c2a34, rough: 0.05, metal: 0.6, emis: 0.2 });
    g.cyl(4.6, 4.6, 0.6, 10, { y: 30, color: 0xdddddd });
    g.cyl(0.08, 0.08, 6, 5, { y: 30.6, color: 0xcc2222, emis: 1.5 });
    return g.build();
  },
  windsock: () => {
    const g = new GeoBuilder();
    g.cyl(0.06, 0.08, 6, 6, { color: 0xdddddd, metal: 0.6 });
    const s = new THREE.CylinderGeometry(0.25, 0.45, 2.4, 10, 1, true); s.rotateZ(Math.PI / 2); s.translate(1.3, 0, 0);
    g.add(s, { y: 5.8, color: 0xff6a00, wind: 0.6, rough: 0.8 });
    return g.build();
  },
  rlight: () => new GeoBuilder().cyl(0.08, 0.1, 0.35, 6, { color: 0x666666, metal: 0.6 }).sphere(0.1, { y: 0.4, color: 0xffe8a0, emis: 3 }, 6, 4).build(),
  helipad: () => new GeoBuilder().add(new THREE.CircleGeometry(10, 32), { rx: -Math.PI / 2, y: 0.03, uv: 'helipad', rough: 0.7 }).build(),
  rwyNum: () => new GeoBuilder().add(new THREE.PlaneGeometry(14, 14), { rx: -Math.PI / 2, y: 0.02, uv: 'rwy36', rough: 0.6 }).build(),
  rwyNum2: () => new GeoBuilder().add(new THREE.PlaneGeometry(14, 14), { rx: -Math.PI / 2, y: 0.02, uv: 'rwy18', rough: 0.6 }).build(),
  yacht: () => {
    const g = new GeoBuilder();
    const hull = new THREE.CylinderGeometry(2.3, 1.4, 14, 12, 1, false); hull.rotateX(Math.PI / 2); hull.scale(1, 0.55, 1);
    const p = hull.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z > 4) { const k = 1 - (z - 4) / 3.2; p.setX(i, p.getX(i) * Math.max(0.05, k)); } }
    hull.computeVertexNormals();
    g.add(hull, { y: 0.9, color: 0xf4f4f0, rough: 0.25, metal: 0.1 });
    g.box(3.6, 0.15, 13, { y: 1.65, z: -0.6, uv: 'wood', rough: 0.6 });
    g.box(3.0, 1.4, 6, { y: 1.8, z: -1.5, color: 0xfafafa, rough: 0.3 });
    g.box(3.05, 0.6, 5.6, { y: 2.3, z: -1.5, color: 0x101820, rough: 0.05, metal: 0.6 });
    g.box(2.6, 1.0, 3.2, { y: 3.2, z: -2.0, color: 0xfafafa, rough: 0.3 });
    g.box(2.65, 0.45, 2.9, { y: 3.4, z: -2.0, color: 0x101820, rough: 0.05, metal: 0.6 });
    g.cyl(0.06, 0.06, 3, 5, { y: 4.2, z: -2.6, color: 0xdddddd, metal: 0.7 });
    g.box(3.7, 0.12, 0.12, { y: 1.1, z: 6.0, color: 0x1d3d6e });
    return g.build();
  },
  cleat: () => new GeoBuilder().cyl(0.12, 0.16, 0.45, 8, { color: 0x2a2a2a, metal: 0.6, rough: 0.4 }).build(),
  piling: () => new GeoBuilder().cyl(0.18, 0.18, 6.0, 7, { y: -5.5, uv: 'wood', rough: 0.9 }).build(),
  pool: () => new GeoBuilder().box(1, 0.4, 1, { color: 0xdcd6cc, rough: 0.6 }).box(0.9, 0.05, 0.9, { y: 0.33, color: 0x2aa0c8, rough: 0.03, emis: 0.15 }).build(),
  wallStone: () => new GeoBuilder().box(1, 1, 1, { color: 0xd6cdb8, rough: 0.85 }).box(1.04, 0.1, 1.15, { y: 1.0, color: 0xb8ae98 }).build(),
};
export const ZONE_PROP_OPTS = {
  ctower: { radius: 1200, shadow: true }, windsock: { radius: 300 }, rlight: { radius: 600 }, helipad: { radius: 700 }, rwyNum: { radius: 900 }, rwyNum2: { radius: 900 },
  yacht: { radius: 600, shadow: true }, cleat: { radius: 120 }, piling: { radius: 300 }, pool: { radius: 400 }, wallStone: { radius: 450, shadow: true },
};

export function paintAirport(paint) {
  paint.rect(AP.x0, AP.z0, AP.x1, AP.z1, [0, 0, 255, 0]);
  const rw = AP.runway, tw = AP.taxiway, ap = AP.apron;
  paint.rect(rw.x0, rw.z0, rw.x1, rw.z1, [255, 0, 0, 0]);
  paint.rect(tw.x0, tw.z0, tw.x1, tw.z1, [255, 0, 0, 0]);
  for (const z of [-455, -700, -930]) paint.rect(tw.x0, z - 7, rw.x0 + 2, z + 7, [255, 0, 0, 0]);
  paint.rect(ap.x0, ap.z0, tw.x1, ap.z1, [255, 0, 0, 0]);
  paint.rect(AP.x0, -520, ap.x0 + 10, -490, [255, 0, 0, 0]); // giriş yolu
  paint.rect(AP.x0 + 5, -470, 890, -410, [255, 0, 0, 0]); // helipad alanı
  paint.rect(AP.x0 + 4, -770, 870, -725, [0, 255, 0, 0]); // terminal önü
}
export function paintVillas(paint) {
  for (const v of VILLAS) {
    const p = v.plot;
    paint.rect(p.x0, p.z0, p.x1, p.z1, [0, 0, 255, 0]);
    const x0 = Math.min(v.gate.x, v.door.x), x1 = Math.max(v.gate.x, v.door.x);
    paint.rect(x0, v.z - 1.6, x1, v.z + 1.6, [0, 255, 0, 0]);
    paint.rect(v.pool.x - v.pool.w / 2 - 2, v.pool.z - v.pool.d / 2 - 2, v.pool.x + v.pool.w / 2 + 2, v.pool.z + v.pool.d / 2 + 2, [0, 255, 0, 0]);
    paint.rect(v.garage.x - 3, v.garage.z - 4, v.garage.x + 3, v.garage.z + 4, [0, 255, 0, 0]);
  }
}

export function buildAirport(city) {
  const P = city.props, cols = city.physics.city;
  const rw = AP.runway, tw = AP.taxiway;
  AP.hangars.length = 0; AP.planeSpawns.length = 0; AP.heliSpawns.length = 0;
  const W = null, Y = new THREE.Color(0xe8b830);
  const cxr = (rw.x0 + rw.x1) / 2;
  // pist işaretleri
  for (let z = rw.z0 + 60; z < rw.z1 - 60; z += 50) city.mark(cxr, z, 0.9, 30, 0, W, 0.005);
  city.mark(rw.x0 + 1, (rw.z0 + rw.z1) / 2, 0.9, rw.z1 - rw.z0 - 4, 0, W, 0.005);
  city.mark(rw.x1 - 1, (rw.z0 + rw.z1) / 2, 0.9, rw.z1 - rw.z0 - 4, 0, W, 0.005);
  for (const [zEnd, dir] of [[rw.z1, -1], [rw.z0, 1]]) {
    for (let i = 0; i < 8; i++) { const x = rw.x0 + 3 + i * 3.6 + (i >= 4 ? 1.6 : 0); city.mark(x, zEnd + dir * 22, 1.8, 30, 0, W, 0.005); }
    for (const dx of [-8, 8]) city.mark(cxr + dx, zEnd + dir * 150, 4, 45, 0, W, 0.005);
  }
  P.rwyNum.addTRS(cxr, 0, rw.z1 - 52, 0);
  P.rwyNum2.addTRS(cxr, 0, rw.z0 + 52, Math.PI);
  for (let z = tw.z0; z < tw.z1; z += 6) city.mark((tw.x0 + tw.x1) / 2, z + 1.5, 0.3, 3.5, 0, Y, 0.005);
  for (let z = rw.z0 + 5; z < rw.z1; z += 30) for (const x of [rw.x0 - 1.2, rw.x1 + 1.2]) P.rlight.addTRS(x, 0, z, 0);
  for (let z = tw.z0; z < tw.z1; z += 40) for (const x of [tw.x0 - 0.8, tw.x1 + 0.8]) P.rlight.addTRS(x, 0, z, 0, 0.8, 0.8, 0.8);
  // hangarlar (açık ağız taksi yoluna, +x)
  for (let i = 0; i < 3; i++) {
    const hx = 842, hz = -560 - i * 60;
    P.hangar.addTRS(hx, 0, hz, Math.PI / 2);
    for (const s of [-1, 1]) cols.add(hx - 25, hz + s * 14 - 1, hx + 25, hz + s * 14 + 1, 0, 10, 'hangar');
    cols.add(hx - 26, hz - 14, hx - 24, hz + 14, 0, 14, 'hangar');
    city.addSign('hangar', hx + 25.2, 10.5, hz, Math.PI / 2, 12, 1.4);
    AP.hangars.push({ x: hx, z: hz, w: 50, d: 28, door: { x: hx + 26, z: hz }, heading: Math.PI / 2 });
    AP.planeSpawns.push({ x: hx + 40, z: hz, heading: Math.PI / 2, type: i === 2 ? 'jet' : 'prop' });
    for (const dz of [-10, 10]) city.mark(hx + 40, hz + dz, 12, 0.3, 0, Y, 0.005);
  }
  AP.planeSpawns.push({ x: rw.start.x, z: rw.start.z, heading: Math.PI, type: 'runway' });
  // helipadlar
  for (const h of AP.helipads) { P.helipad.addTRS(h.x, 0, h.z, 0); AP.heliSpawns.push({ x: h.x, z: h.z, heading: 0 }); }
  // terminal (cam cephe) + kule + rüzgâr tulumu
  city.addZoneBuilding(AP.x0 + 6, -800, 868, -772, 11.2, 4, '#7a8e9c', 0, 0);
  city.addSign('airport', (AP.x0 + 6 + 868) / 2, 9.0, -771.8, 0, 14, 1.6);
  AP.terminal = { x0: AP.x0 + 6, z0: -800, x1: 868, z1: -772, door: { x: 838, z: -771 } };
  P.ctower.addTRS(884, 0, -790, 0); cols.add(881, -793, 887, -787, 0, 30, 'ctower');
  P.windsock.addTRS(rw.x1 + 8, 0, -620, 0);
  // perimetre çiti (batı kapısı z -520..-490)
  city.fenceLine(AP.x0, AP.z0, AP.x1, AP.z0, 'chain', 2.6, 'razor');
  city.fenceLine(AP.x1, AP.z0, AP.x1, AP.z1, 'chain', 2.6, 'razor');
  city.fenceLine(AP.x0, AP.z1, AP.x1, AP.z1, 'chain', 2.6, 'razor');
  city.fenceLine(AP.x0, AP.z0, AP.x0, -522, 'chain', 2.6, 'razor');
  city.fenceLine(AP.x0, -488, AP.x0, AP.z1, 'chain', 2.6, 'razor');
  P.booth.addTRS(AP.x0 + 3, 0, -484, -Math.PI / 2);
  P.barrier.addTRS(AP.x0, 0, -520, Math.PI / 2);
  for (let z = -500; z > -700; z -= 40) P.lampModern.addTRS(899, 0, z, Math.PI / 2);
}

export function buildMarina(city) {
  const P = city.props, cols = city.physics.city;
  const gb = new GeoBuilder();
  for (const p of MR.piers) gb.box(p.x1 - p.x0, 0.4, p.z1 - p.z0, { x: (p.x0 + p.x1) / 2, y: -0.4, z: (p.z0 + p.z1) / 2, uv: 'wood', rough: 0.8 });
  const mesh = new THREE.Mesh(gb.build(), city.propsMat); mesh.receiveShadow = true; city.group.add(mesh);
  // kazıklar, babalar, lambalar
  for (const p of MR.piers) {
    const horiz = p.x1 - p.x0 > p.z1 - p.z0;
    if (horiz) for (let x = p.x0 + 2; x < p.x1; x += 6) for (const z of [p.z0 + 0.2, p.z1 - 0.2]) { P.piling.addTRS(x, 0, z, 0); P.cleat.addTRS(x + 3, 0, z, 0); }
    else for (let z = p.z0 + 2; z < p.z1; z += 6) for (const x of [p.x0 + 0.2, p.x1 - 0.2]) P.piling.addTRS(x, 0, z, 0);
    if (horiz) P.lampClassic.addTRS(p.x1 - 1.2, 0, (p.z0 + p.z1) / 2, 0);
  }
  for (let z = MR.z0 + 8; z < MR.z1; z += 22) P.lampClassic.addTRS(203, 0, z, 0);
  // kulüp binası (beyaz villa üslubu, kıyıya bakar)
  city.addZoneBuilding(209, -577, 226, -563, 7.0, 5, '#f4f2ec', 3, 0);
  city.addSign('marina', 208.8, 5.6, -570, -Math.PI / 2, 9, 0.9);
  // dekor yatlar (bazı yerler dolu), diğerleri yat satın alma/doğma noktası
  for (const b of MR.berths) if (b.decor) P.yacht.addTRS(b.x, WATER_Y - 0.3, b.z, b.heading, 1, 1, 1);
  P.flagpole.addTRS(205, 0, -578, 0);
  void cols;
}

export function buildVillas(city) {
  const P = city.props, cols = city.physics.city;
  for (const v of VILLAS) {
    const p = v.plot;
    const wall = (x0, z0, x1, z1) => {
      const w = Math.max(0.4, x1 - x0), d = Math.max(0.4, z1 - z0);
      P.wallStone.addTRS((x0 + x1) / 2, 0.15, (z0 + z1) / 2, 0, w, 1.9, d);
      cols.add(x0, z0, x1, z1, 0, 2.1, 'villaWall');
    };
    const t = 0.4, gx = v.gate.x, gz = v.z;
    // deniz tarafı duvarında kapı boşluğu
    const seaLeft = gx <= p.x0 + 1;
    const sx = seaLeft ? p.x0 : p.x1 - t;
    wall(sx, p.z0, sx + t, gz - 2.5); wall(sx, gz + 2.5, sx + t, p.z1);
    const ox = seaLeft ? p.x1 - t : p.x0;
    wall(ox, p.z0, ox + t, p.z1);
    wall(p.x0, p.z0, p.x1, p.z0 + t); wall(p.x0, p.z1 - t, p.x1, p.z1);
    for (const z of [gz - 2.7, gz + 2.7]) P.gatepost.addTRS(sx + t / 2, 0.15, z, 0);
    city.addSign('villa', sx + (seaLeft ? -0.05 : t + 0.05), 1.3, gz - 4.2, seaLeft ? -Math.PI / 2 : Math.PI / 2, 2.2, 0.55);
    // havuz, ağaçlar, çit
    P.pool.addTRS(v.pool.x, 0.15, v.pool.z, 0, v.pool.w, 1, v.pool.d);
    cols.add(v.pool.x - v.pool.w / 2, v.pool.z - v.pool.d / 2, v.pool.x + v.pool.w / 2, v.pool.z + v.pool.d / 2, 0, 0.4, 'pool');
    for (let i = 0; i < 4; i++) city.addTree(i % 2 ? 'palm' : 'cypress', v.pool.x + (i < 2 ? -1 : 1) * (v.pool.w / 2 + 2.5), v.pool.z + (i % 2 ? -1 : 1) * (v.pool.d / 2 - 1), 0.9 + i * 0.05);
    for (const z of [p.z0 + 3, p.z1 - 3]) city.addTree('pine', (p.x0 + p.x1) / 2, z, 0.9);
    city.addBed(v.x + (seaLeft ? -15 : 15) * 0, v.z + (v.z > (p.z0 + p.z1) / 2 ? -11 : 11), 6, 1.6, 0);
  }
}
