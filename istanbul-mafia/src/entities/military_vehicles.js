// Askerî kara araçları (tank, 8x8 zırhlı, 6x6 kamyon) şablonları ve dünya araçlarının yerleştirilmesi
// (askerî üs doğma noktaları, havalimanı jeti, marina tekneleri). Silahlar Vehicle.updateTurret → combat API.
import * as THREE from 'three';
import * as MAP from '../world/map.js';
import { Parts, finishTemplate, extrudeSide, wheelGeo, bx, rbx, cyl, beam, polyGeo } from './vehicles.js';

const OLIVE = 0x3d4429, OLIVE_D = 0x2e3320, STEEL = 0x2a2a24;

// ---- Bozkurt A3 ana muharebe tankı ----
function buildTank(def) {
  const B = new Parts();
  const L = def.len, W = def.wid;
  // gövde: eğimli ön zırh (glasis), düz tavan, arka motor güvertesi
  const hull = [[L / 2, 0.95, 0.06], [L / 2 - 1.1, 1.52, 0.05], [-L / 2 + 0.25, 1.52, 0.05], [-L / 2, 1.2, 0.05], [-L / 2 + 0.3, 0.6, 0.05], [L / 2 - 0.55, 0.55, 0.05]];
  B.p(extrudeSide(hull, W - 1.1, 0.04, 2));
  for (const s of [1, -1]) {
    const x = s * (W / 2 - 0.31);
    // palet üstü çamurluk + yan etek zırhı (ön kısmı)
    B.p(rbx(0.64, 0.05, L - 0.15, 0.02, x, 1.14, 0));
    B.p(rbx(0.06, 0.42, L * 0.62, 0.02, s * (W / 2 + 0.01), 0.92, L * 0.12));
    for (let i = 0; i < 6; i++) B.d(bx(0.065, 0.02, 0.02, s * (W / 2 + 0.03), 0.96, L * 0.12 - L * 0.3 + i * L * 0.12), 0x24281a);
    // palet: üst/alt kayış + dış baklalar, çeker dişli, avare
    B.d(rbx(0.58, 0.14, L - 0.5, 0.05, x, 1.0, 0), STEEL);
    B.d(rbx(0.58, 0.14, L - 0.9, 0.05, x, 0.07, 0), STEEL);
    for (let i = 0; i < 30; i++) B.d(bx(0.6, 0.05, 0.09, x, 1.08, -L / 2 + 0.45 + i * (L - 0.9) / 29), 0x171713);
    for (let i = 0; i < 26; i++) B.d(bx(0.6, 0.05, 0.09, x, 0.0, -L / 2 + 0.7 + i * (L - 1.4) / 25), 0x171713);
    B.d(cyl(0.4, 0.4, 0.58, 16, 'x', x, 0.62, -L / 2 + 0.42), STEEL);
    B.d(cyl(0.36, 0.36, 0.58, 16, 'x', x, 0.6, L / 2 - 0.45), STEEL);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; B.d(bx(0.6, 0.08, 0.08, x, 0.62 + Math.sin(a) * 0.42, -L / 2 + 0.42 + Math.cos(a) * 0.42), 0x171713); }
    // dönüş makaraları
    for (let i = 0; i < 3; i++) B.d(cyl(0.07, 0.07, 0.2, 8, 'x', x, 1.03, -L / 2 + 1.6 + i * 1.6), STEEL);
    // kutular, kriko, çekme halatı
    B.d(rbx(0.5, 0.3, 0.9, 0.04, s * (W / 2 - 0.35), 1.31, -L / 2 + 1.2), OLIVE_D);
    B.d(rbx(0.5, 0.25, 0.6, 0.04, s * (W / 2 - 0.35), 1.28, L / 2 - 1.7), OLIVE_D);
  }
  // sürücü kapağı + periskoplar, motor güvertesi ızgaraları, egzoz, çeki kancaları
  B.d(cyl(0.3, 0.3, 0.06, 12, 'y', 0.55, 1.55, L / 2 - 1.35), OLIVE_D);
  for (let i = -1; i <= 1; i++) B.d(bx(0.12, 0.07, 0.06, 0.55 + i * 0.16, 1.58, L / 2 - 1.08), 0x111111);
  for (let i = 0; i < 6; i++) B.d(bx(W - 1.6, 0.03, 0.06, 0, 1.54, -L / 2 + 0.5 + i * 0.16), 0x1e2214);
  for (const s of [1, -1]) { B.d(rbx(0.5, 0.18, 0.08, 0.03, s * 0.7, 1.05, -L / 2 + 0.05), 0x111111); B.d(beam(s * 0.9, 0.8, L / 2 + 0.02, s * 0.9, 0.8, L / 2 + 0.18, 0.1, 0.1, true), 0x151515); }
  B.l(rbx(0.14, 0.1, 0.05, 0.02, W / 2 - 0.5, 1.22, L / 2 - 0.05), 0xdfe6ea, 0xfff2d8, 0);
  B.l(rbx(0.14, 0.1, 0.05, 0.02, -W / 2 + 0.5, 1.22, L / 2 - 0.05), 0xdfe6ea, 0xfff2d8, 0);
  B.l(rbx(0.12, 0.08, 0.05, 0.02, W / 2 - 0.4, 1.2, -L / 2 + 0.05), 0x5a0808, 0xff1a0a, 1);
  B.l(rbx(0.12, 0.08, 0.05, 0.02, -W / 2 + 0.4, 1.2, -L / 2 + 0.05), 0x5a0808, 0xff1a0a, 1);
  const T = { S: { st: 'tank', L, W, H: def.hei }, decals: [], extras: [], plates: [], siren: false, wheelR: 0.33, tank: true, matte: true };
  finishTemplate(T, B);
  // taret: kama zırhlı ön, arka sepet, komutan kubbesi + makineli, sis bombası atıcıları
  const TB = new Parts();
  const tur = [[1.45, 0.05, 0.05], [0.95, 0.66, 0.06], [-1.3, 0.66, 0.06], [-1.95, 0.42, 0.05], [-1.85, 0.05, 0.04]];
  TB.p(extrudeSide(tur, 2.35, 0.08, 2));
  for (const s of [1, -1]) {
    TB.p(beam(s * 1.0, 0.1, 1.3, s * 1.35, 0.35, 0.2, 0.12, 0.5, false));
    for (let i = 0; i < 3; i++) TB.d(cyl(0.05, 0.05, 0.22, 8, 'z', s * (0.85 + i * 0.1), 0.62, 0.6 + i * 0.02), 0x1e2214);
    TB.d(rbx(0.06, 0.3, 1.2, 0.02, s * 1.2, 0.36, -1.2), OLIVE_D);
  }
  TB.d(cyl(0.38, 0.4, 0.22, 14, 'y', 0.5, 0.78, -0.55), OLIVE_D);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; TB.d(bx(0.1, 0.06, 0.04, 0.5 + Math.cos(a) * 0.36, 0.8, -0.55 + Math.sin(a) * 0.36), 0x101010); }
  TB.d(beam(0.5, 1.0, -0.4, 0.5, 1.02, 0.55, 0.05, 0.05, true), 0x111111);
  TB.d(rbx(0.14, 0.14, 0.4, 0.02, 0.5, 0.98, -0.45), 0x151515);
  TB.d(rbx(0.42, 0.36, 0.4, 0.04, -0.55, 0.85, 0.2), OLIVE_D); // nişancı görüş kutusu
  TB.d(bx(0.3, 0.2, 0.02, -0.55, 0.85, 0.41), 0x0a1a2a);
  TB.d(cyl(0.035, 0.035, 2.4, 6, 'y', -0.8, 1.8, -1.4), 0x111111);
  TB.d(rbx(0.7, 0.45, 0.55, 0.04, 0, 0.38, -1.95), OLIVE_D);
  T.turretParts = TB;
  const BB = new Parts();
  BB.p(rbx(0.6, 0.5, 0.5, 0.06, 0, 0, 0.1)); // namlu kalkanı
  BB.p(cyl(0.11, 0.1, 4.6, 14, 'z', 0, 0, 2.6));
  BB.p(cyl(0.16, 0.16, 0.6, 14, 'z', 0, 0, 2.3)); // duman tahliye
  BB.d(cyl(0.13, 0.13, 0.3, 12, 'z', 0, 0, 4.95), STEEL);
  BB.d(bx(0.32, 0.08, 0.16, 0, 0, 4.98), STEEL);
  T.barrelParts = BB;
  finishTemplate(TB, TB); finishTemplate(BB, BB);
  T.turretPos = [0, 1.52, -0.3]; T.barrelPos = [0, 0.34, 1.3];
  T.weapon = { kind: 'cannon', muzzle: 6.4, height: 1.86, reload: 2.5, rot: 1.0, barrelZ: 1.3 };
  T.wheelGeo = wheelGeo(0.33, 0.5, 'steel');
  T.wheels = [];
  for (let i = 0; i < 6; i++) for (const s of [1, -1]) T.wheels.push({ x: s * (W / 2 - 0.31), z: -L / 2 + 1.05 + i * (L - 2.1) / 5, front: false, side: s, y: 0.36 });
  T.wheelbase = 4;
  T.driver = [0.55, 1.2, 1.5];
  T.seats = [{ x: 0.55, y: 1.25, z: 1.5 }, { x: 0.5, y: 1.4, z: -0.85 }];
  T.pool = { w: 4, d: 10, z: L / 2 + 5 };
  return T;
}

// ---- Koçbaşı 8x8 zırhlı personel taşıyıcı (uzaktan kumandalı silah istasyonu) ----
function buildAPC(def) {
  const B = new Parts();
  const L = def.len, W = def.wid, r = 0.56;
  const hw = W - 0.9;
  const hull = [[L / 2, 1.05, 0.05], [L / 2 - 0.35, 1.55, 0.06], [L / 2 - 1.5, 2.15, 0.05], [-L / 2 + 0.15, 2.2, 0.05], [-L / 2, 1.95, 0.04], [-L / 2 + 0.05, 0.75, 0.04], [-L / 2 + 0.6, 0.6, 0.04], [L / 2 - 0.7, 0.6, 0.04]];
  B.p(extrudeSide(hull, hw, 0.05, 2));
  // eğimli yan zırh plakaları (tekerleklerin üstünde, V gövde)
  for (const s of [1, -1]) {
    const x0 = s * hw / 2, x1 = s * (W / 2 - 0.02);
    B.p(polyGeo([[x0, 2.15, L / 2 - 1.6], [x0, 2.15, -L / 2 + 0.2], [x1, 1.5, -L / 2 + 0.2], [x1, 1.5, L / 2 - 1.0]].map((p) => (s > 0 ? p : p)).slice()));
    B.p(polyGeo([[x1, 1.5, L / 2 - 1.0], [x1, 1.5, -L / 2 + 0.2], [x1, 1.25, -L / 2 + 0.2], [x1, 1.25, L / 2 - 0.9]]));
    B.p(polyGeo([[x1, 1.5, L / 2 - 1.0], [x1, 1.5, -L / 2 + 0.2], [x0, 2.15, -L / 2 + 0.2], [x0, 2.15, L / 2 - 1.6]]));
    B.p(polyGeo([[x1, 1.25, L / 2 - 0.9], [x1, 1.25, -L / 2 + 0.2], [x1, 1.5, -L / 2 + 0.2], [x1, 1.5, L / 2 - 1.0]]));
    // kapı, nişan mazgalları, tutamaklar, sis atıcılar
    for (const z of [-0.6, -1.8]) B.d(cyl(0.06, 0.06, 0.04, 8, 'x', s * (W / 2 - 0.0), 1.38, z), 0x101010);
    for (let i = 0; i < 4; i++) B.d(bx(0.04, 0.04, 0.3, s * (hw / 2 + 0.05), 2.18, -L / 2 + 0.8 + i * 1.3), 0x1e2214);
    for (let i = 0; i < 4; i++) B.d(cyl(0.05, 0.05, 0.22, 8, 'z', s * (W / 2 - 0.25 - i * 0.1), 2.05, L / 2 - 1.55), 0x1e2214);
  }
  // ön: ışık korumaları, çeki halkaları, sürücü camları (zırhlı, etiketli), arka rampa
  for (const s of [1, -1]) {
    B.l(rbx(0.16, 0.1, 0.05, 0.02, s * (hw / 2 - 0.2), 1.25, L / 2 - 0.12), 0xdfe6ea, 0xfff2d8, 0);
    B.d(bx(0.24, 0.03, 0.12, s * (hw / 2 - 0.2), 1.33, L / 2 - 0.08), 0x111111);
    B.d(new THREE.TorusGeometry(0.07, 0.02, 6, 10).rotateY(Math.PI / 2).translate(s * 0.5, 0.82, L / 2 + 0.02), 0x111111);
    B.l(rbx(0.12, 0.08, 0.04, 0.02, s * (hw / 2 - 0.15), 1.7, -L / 2 - 0.01), 0x5a0808, 0xff1a0a, 1);
  }
  B.gl(polyGeo([[-0.5, 1.72, L / 2 - 0.62], [0.5, 1.72, L / 2 - 0.62], [0.5, 1.95, L / 2 - 1.08], [-0.5, 1.95, L / 2 - 1.08]]), 'g_ws');
  B.d(rbx(1.6, 1.15, 0.08, 0.03, 0, 1.3, -L / 2 - 0.02), OLIVE_D);
  B.d(bx(0.08, 1.0, 0.03, 0, 1.3, -L / 2 - 0.07), 0x1e2214);
  for (let i = 0; i < 2; i++) B.d(cyl(0.3, 0.3, 0.05, 12, 'y', -0.5 + i * 1.0, 2.23, -L / 2 + 1.3 + i * 1.2), OLIVE_D);
  B.d(beam(-0.9, 2.2, -L / 2 + 0.4, -0.95, 4.0, -L / 2 + 0.5, 0.025, 0.025, true), 0x111111);
  const T = { S: { st: 'apc', L, W, H: def.hei }, decals: [], extras: [], plates: [], siren: false, wheelR: r, matte: true };
  T.wheelGeo = wheelGeo(r, 0.44, 'offroad');
  T.wheels = [];
  const axles = [L / 2 - 1.15, L / 2 - 2.45, -L / 2 + 2.25, -L / 2 + 0.95];
  axles.forEach((z, i) => { for (const s of [1, -1]) T.wheels.push({ x: s * (W / 2 - 0.28), z, front: i === 0, side: s }); });
  T.wheelbase = 3.4; T.track = W - 0.56;
  T.strut = { up: 0.75, inset: 0.28 }; T.travel = 0.18;
  finishTemplate(T, B);
  // silah istasyonu (taret) + ağır makineli (namlu)
  const TB = new Parts();
  TB.d(cyl(0.45, 0.5, 0.18, 14, 'y', 0, 0.09, 0), OLIVE_D);
  TB.p(rbx(0.75, 0.42, 0.7, 0.05, 0, 0.38, 0));
  TB.d(rbx(0.28, 0.24, 0.32, 0.03, 0.42, 0.42, 0.1), 0x1a1a1a);
  TB.d(bx(0.18, 0.12, 0.02, 0.42, 0.44, 0.27), 0x0a1a2a);
  TB.d(rbx(0.3, 0.28, 0.4, 0.03, -0.45, 0.32, -0.05), 0x2a2e20);
  T.turretParts = TB;
  const BB = new Parts();
  BB.d(rbx(0.2, 0.18, 0.7, 0.03, 0, 0, 0.1), 0x1a1a1a);
  BB.d(cyl(0.03, 0.03, 1.3, 8, 'z', 0, 0.02, 1.05), 0x111111);
  BB.d(cyl(0.05, 0.05, 0.16, 8, 'z', 0, 0.02, 1.68), 0x111111);
  T.barrelParts = BB;
  finishTemplate(TB, TB); finishTemplate(BB, BB);
  T.turretPos = [0, 2.2, 0.4]; T.barrelPos = [0, 0.42, 0.15];
  T.weapon = { kind: 'mg', muzzle: 2.3, height: 2.62, reload: 0.085, rot: 2.2, barrelZ: 0.15 };
  T.driver = [0.55, 1.15, L / 2 - 1.4];
  T.seats = [{ x: 0.55, y: 1.15, z: L / 2 - 1.4 }, { x: -0.55, y: 1.15, z: L / 2 - 1.4 }];
  for (let i = 0; i < 6; i++) T.seats.push({ x: (i % 2 ? -1 : 1) * 0.65, y: 1.0, z: -0.6 - Math.floor(i / 2) * 0.8 });
  T.pool = { w: 5, d: 10, z: L / 2 + 5 };
  return T;
}

// ---- Katır 6x6 askerî kamyon (branda örtülü kasa) ----
function buildMTruck(def) {
  const B = new Parts();
  const L = def.len, W = def.wid, r = 0.55;
  const cz0 = L / 2, cz1 = L / 2 - 2.1; // kabin
  for (const s of [1, -1]) B.d(bx(0.14, 0.24, L - 0.4, s * 0.5, 0.9, -0.1), 0x151515);
  // kabin: düz ön (cab-over), tavan kapağı, ön cam (iki parça), yan camlar
  B.p(rbx(W, 1.15, 2.0, 0.08, 0, 1.6, (cz0 + cz1) / 2 - 0.05));
  B.p(rbx(W - 0.1, 0.5, 0.25, 0.05, 0, 2.35, cz0 - 0.25));
  for (const s of [1, -1]) {
    B.gl(polyGeo([[s * 0.06, 1.75, cz0 - 0.02], [s * (W / 2 - 0.12), 1.75, cz0 - 0.02], [s * (W / 2 - 0.12), 2.22, cz0 - 0.14], [s * 0.06, 2.22, cz0 - 0.14]].map((p) => (s > 0 ? p : [p[0], p[1], p[2]]))), s > 0 ? 'g_ws' : 'g_ws2');
    B.gl(polyGeo([[s * (W / 2 + 0.004), 1.78, cz0 - 0.3], [s * (W / 2 + 0.004), 1.78, cz0 - 1.1], [s * (W / 2 + 0.004), 2.15, cz0 - 1.1], [s * (W / 2 + 0.004), 2.15, cz0 - 0.3]]), `g_${s > 0 ? 'L' : 'R'}0`);
    B.d(bx(0.03, 0.03, 0.06, s * (W / 2 + 0.02), 1.5, cz0 - 1.0), 0x111111);
    B.d(beam(s * (W / 2), 2.0, cz0 - 0.2, s * (W / 2 + 0.3), 2.1, cz0 - 0.15, 0.03, 0.03, true), 0x111111);
    B.d(rbx(0.08, 0.28, 0.2, 0.02, s * (W / 2 + 0.32), 2.0, cz0 - 0.15), 0x111111);
    B.d(rbx(0.3, 0.06, 0.6, 0.02, s * (W / 2 - 0.15), 1.02, cz0 - 1.0), 0x111111); // basamak
    B.l(cyl(0.11, 0.11, 0.05, 12, 'z', s * (W / 2 - 0.3), 1.25, cz0 + 0.02), 0xdfe6ea, 0xfff2d8, 0);
    B.l(rbx(0.12, 0.08, 0.05, 0.02, s * (W / 2 - 0.15), 1.1, -L / 2 + 0.05), 0x5a0808, 0xff1a0a, 1);
    // yakıt deposu
    B.d(cyl(0.25, 0.25, 0.9, 12, 'z', s * (W / 2 - 0.3), 0.9, cz1 - 0.6), OLIVE_D);
  }
  B.d(bx(0.04, 0.5, 0.02, 0, 2.0, cz0 - 0.06), 0x111111);
  B.d(rbx(W * 0.6, 0.35, 0.06, 0.02, 0, 1.3, cz0 + 0.02), 0x1a1a1a);
  for (let i = -3; i <= 3; i++) B.d(bx(0.04, 0.3, 0.03, i * 0.18, 1.3, cz0 + 0.05), 0x2a2e20);
  B.d(rbx(W + 0.1, 0.22, 0.2, 0.04, 0, 0.75, cz0 + 0.1), 0x151515);
  // kasa: taban + yan kapaklar + branda (yarım silindir) + kaburgalar
  const bz0 = cz1 - 0.15, bz1 = -L / 2 + 0.05, bl = bz0 - bz1, bzc = (bz0 + bz1) / 2;
  B.d(bx(W, 0.12, bl, 0, 1.2, bzc), OLIVE_D);
  for (const s of [1, -1]) B.p(bx(0.05, 0.55, bl, s * (W / 2 - 0.025), 1.53, bzc));
  B.p(bx(W, 0.55, 0.05, 0, 1.53, bz1 + 0.02));
  const can = new THREE.CylinderGeometry(W / 2, W / 2, bl, 16, 1, false, -Math.PI / 2, Math.PI);
  can.rotateX(Math.PI / 2); can.scale(1, 0.75, 1); can.translate(0, 1.8, bzc);
  B.d(can, 0x4a5030);
  for (let i = 0; i <= 4; i++) { const g = new THREE.TorusGeometry(W / 2 + 0.01, 0.025, 4, 12, Math.PI); g.scale(1, 0.75, 1); g.translate(0, 1.8, bz1 + 0.1 + i * (bl - 0.2) / 4); B.d(g, 0x3a4024); }
  B.d(bx(W - 0.02, W * 0.37, 0.02, 0, 1.8 + W * 0.18, bz1 - 0.01), 0x3a4024);
  B.d(cyl(r, r, 0.32, 16, 'x', 0, 1.0, cz1 - 0.05), 0x111111); // yedek lastik
  const T = { S: { st: 'mtruck', L, W, H: def.hei }, decals: [], extras: [], plates: [], siren: false, wheelR: r, matte: true };
  T.wheelGeo = wheelGeo(r, 0.4, 'offroad');
  T.wheels = [];
  [L / 2 - 1.2, -L / 2 + 2.5, -L / 2 + 1.25].forEach((z, i) => { for (const s of [1, -1]) T.wheels.push({ x: s * (W / 2 - 0.25), z, front: i === 0, side: s }); });
  T.wheelbase = L - 3.0; T.track = W - 0.5;
  T.strut = { up: 0.55, inset: 0.28 }; T.travel = 0.16;
  // çamurluklar
  for (const s of [1, -1]) B.d(rbx(0.5, 0.05, 1.3, 0.02, s * (W / 2 - 0.25), r * 2 + 0.12, L / 2 - 1.2), 0x1e2214);
  finishTemplate(T, B);
  T.driver = [0.5, 1.45, cz0 - 0.75];
  T.seats = [{ x: 0.5, y: 1.45, z: cz0 - 0.75 }, { x: -0.5, y: 1.45, z: cz0 - 0.75 }];
  for (let i = 0; i < 8; i++) T.seats.push({ x: (i % 2 ? -1 : 1) * 0.75, y: 1.62, z: bz0 - 0.6 - Math.floor(i / 2) * 0.9 });
  T.pool = { w: 4.5, d: 10, z: L / 2 + 5 };
  return T;
}

export const MIL_BUILDERS = { tank: buildTank, apc: buildAPC, mtruck: buildMTruck };

// ----------------------------------------------------------------------
// Dünya araçları: askerî üs (MAP.MILITARY_BASE.spawnPoints), havalimanı jeti, marina tekneleri.
// main.js yükleme sonunda bir kez çağırır. spawnPoints türleri: 'tank','apc','jeep','truck','attackHeli','jet'.
// Nokta yoksa üs dikdörtgeni içinde yedek yerleşim; jet için pist yoksa havalimanı pisti kullanılır.
// ----------------------------------------------------------------------
export function spawnWorldVehicles(game) {
  const out = [];
  const mb = MAP.MILITARY_BASE, ap = MAP.AIRPORT;
  const prop = (v) => { if (v) { v.parked = true; v.mission = 'prop'; out.push(v); } return v; };
  const ground = { tank: 'tank', apc: 'apc', jeep: 'cip', truck: 'askkamyon', mtruck: 'askkamyon' };
  const pts = (mb && mb.spawnPoints) || [];
  const have = new Set();
  for (const sp of pts) {
    if (sp.placeholder) continue;
    const h = sp.heading || 0;
    try {
      if (ground[sp.type]) prop(game.vehicles.add(ground[sp.type], sp.x, sp.z, h));
      else if ((sp.type === 'attackHeli' || sp.type === 'jet') && game.aircraft) prop(game.aircraft.add(sp.type, sp.x, sp.z, h));
      have.add(sp.type);
    } catch (e) { console.warn('askerî araç yerleşimi', sp.type, e); }
  }
  if (mb && mb.x0 !== undefined) {
    const cx = (mb.x0 + mb.x1) / 2, cz = (mb.z0 + mb.z1) / 2;
    if (!have.has('tank')) prop(game.vehicles.add('tank', cx - 40, cz + 30, Math.PI));
    if (!have.has('apc')) prop(game.vehicles.add('apc', cx - 25, cz + 30, Math.PI));
    if (!have.has('truck') && !have.has('mtruck')) prop(game.vehicles.add('askkamyon', cx - 10, cz + 30, Math.PI));
    if (!have.has('attackHeli') && game.aircraft) { const hp = mb.helipad || { x: cx, z: cz }; prop(game.aircraft.add('attackHeli', hp.x, hp.z, 0)); }
  }
  if (!have.has('jet') && game.aircraft && ap && ap.runway) {
    const rw = ap.runway, st = rw.start || { x: (rw.x0 + rw.x1) / 2, z: rw.z1 - 15 };
    prop(game.aircraft.add('jet', st.x - 8, st.z, rw.heading !== undefined ? rw.heading : Math.PI));
  }
  // marina: iki boş tekne (çalınabilir)
  const berths = (MAP.HARBOR && MAP.HARBOR.berths) || (MAP.MARINA && MAP.MARINA.berths) || [];
  if (game.boats && berths.length) {
    ['surat', 'balikci'].forEach((t, i) => {
      const b = berths[(i * 5 + 2) % berths.length];
      try { const v = game.boats.add(t, b.x, b.z, b.heading || 0); v.parked = true; out.push(v); } catch (e) { console.warn('marina teknesi', e); }
    });
  }
  return out;
}
