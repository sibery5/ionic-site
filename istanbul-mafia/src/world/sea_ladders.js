// [deniz] Rıhtım merdivenleri: yüzen oyuncunun sudan çıkış noktaları. Kıyı rıhtımları (Boğaz iki yaka, Haliç, Marmara
// sahili) boyunca ~96 m'de bir, liman rıhtımı ve tekne iskelesi, marina iskeleleri. Kıyı korkuluğunda merdiven
// hizasında boşluk bırakılır (city.js LADDER_GAPS). Galvanizli çelik merdiven: iki dikme, basamaklar, rıhtım
// kenarının üstüne kıvrılan tutunma kolları (tek InstancedMesh). Liman gemisinin kılavuz merdiveni (ip + tahta
// basamak) ships_moored.js'ten eklenir.
// Kayıt: { x, z (rıhtım yüzündeki taban noktası), nx, nz (denize bakan normal), top (çıkılan yüzey y) }
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WATER_Y, MARINA, HARBOR, BRIDGES, isLand } from './map.js';
import { rod, B3, bare } from './ships_hull.js';

const near = (v, list, r) => list.some(([a, b]) => v > a - r && v < b + r);
const BRZ = BRIDGES.filter((b) => b.axis === 'x').map((b) => [b.z0, b.z1]);
const BRX = BRIDGES.filter((b) => b.axis === 'z').map((b) => [b.x0, b.x1]);
export const LADDERS = [];
// kıyı segmentleri (city.js korkuluk segmentleriyle aynı çizgiler)
for (let z = -978; z < 810; z += 96) {
  if (!near(z, BRZ, 20) && !(z > MARINA.z0 - 12 && z < MARINA.z1 + 12) && !(z > 60 && z < 200)) LADDERS.push({ x: 200, z, nx: 1, nz: 0, top: 0, seg: 'z200' });
  if (!near(z, BRZ, 20) && z < HARBOR.box[1] - 20) LADDERS.push({ x: 420, z: z + 48, nx: -1, nz: 0, top: 0, seg: 'z420' });
}
for (let x = -820; x < 190; x += 96) {
  if (!near(x, BRX, 20) && !(x > 25 && x < 95)) LADDERS.push({ x, z: 70, nx: 0, nz: 1, top: 0, seg: 'x70' }); // Karaköy iskelesi hariç
  if (!near(x + 48, BRX, 20) && !(x + 48 > -130 && x + 48 < -60)) LADDERS.push({ x: x + 48, z: 190, nx: 0, nz: -1, top: 0, seg: 'x190' }); // Eminönü hariç
}
for (let x = -960; x < 190; x += 96) LADDERS.push({ x, z: 820, nx: 0, nz: 1, top: 0, seg: 'x820' });
// liman rıhtımı (deniz kenarı) ve tekne iskelesi uçları
{ const T = HARBOR.terminal; for (let x = T.x0 + 12; x < T.x1; x += 48) if (Math.abs(x - 660) > 62) LADDERS.push({ x, z: T.z1, nx: 0, nz: 1, top: 0, seg: 'harbor' }); }
{ const F = HARBOR.finger; LADDERS.push({ x: (F.x0 + F.x1) / 2, z: F.z1, nx: 0, nz: 1, top: 0, seg: 'finger' }); }
// marina iskeleleri: her iskelenin denize açık ucu
for (const p of MARINA.piers) if (p.x1 - p.x0 > p.z1 - p.z0 && p.x1 > 250) LADDERS.push({ x: p.x1, z: (p.z0 + p.z1) / 2, nx: 1, nz: 0, top: 0, seg: 'marina' });
// korkuluk boşlukları (city.js): segment anahtarına göre [a, b] aralıkları
export const LADDER_GAPS = {};
for (const L of LADDERS) { const v = L.nx !== 0 ? L.z : L.x; (LADDER_GAPS[L.seg] || (LADDER_GAPS[L.seg] = [])).push([v - 0.9, v + 0.9]); }

// tek merdiven geometrisi (yerel: +z denize, y=0 rıhtım üstü)
function ladderGeo(top, bottom) {
  const P = [];
  const h = top - bottom;
  for (const x of [-0.22, 0.22]) {
    P.push(B3(0.05, h, 0.05, x, bottom + h / 2, 0.14));
    // tutunma kolu: rıhtım kenarından yukarı ve içeri kıvrılır
    P.push(rod(x, top, 0.14, x, top + 0.95, 0.14, 0.024, 6), rod(x, top + 0.95, 0.14, x, top + 0.95, -0.35, 0.024, 6), rod(x, top + 0.95, -0.35, x, top, -0.35, 0.024, 6));
  }
  for (let y = bottom + 0.2; y < top - 0.05; y += 0.3) P.push(B3(0.44, 0.04, 0.04, 0, y, 0.14));
  for (const y of [bottom + 0.6, top - 0.6]) for (const x of [-0.22, 0.22]) P.push(B3(0.04, 0.04, 0.16, x, y, 0.06)); // duvar bağlantıları
  return mergeGeometries(P.map((g) => bare(g)));
}

export function buildLadders(game) {
  const extra = game.seaLadders || [];
  const cols = game.physics;
  // iniş noktası engelli (bank, direk, çit) olanları ele
  const tmp = new THREE.Vector3();
  const ok = LADDERS.filter((L) => {
    const lx = L.x - L.nx * 0.9, lz = L.z - L.nz * 0.9;
    if (!isLand(lx, lz) || isLand(L.x + L.nx * 1.0, L.z + L.nz * 1.0)) return false;
    tmp.set(lx, L.top, lz);
    const r = cols.resolveCircle(tmp, 0.35, L.top + 0.05);
    return !r.hit && Math.abs(tmp.x - lx) + Math.abs(tmp.z - lz) < 0.05;
  });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.42, metalness: 0.85 });
  const geo = ladderGeo(0, WATER_Y - 1.4);
  const im = new THREE.InstancedMesh(geo, steel, ok.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  ok.forEach((L, i) => { q.setFromAxisAngle(up, Math.atan2(L.nx, L.nz)); m.compose(new THREE.Vector3(L.x, L.top, L.z), q, one); im.setMatrixAt(i, m); });
  im.castShadow = true; im.receiveShadow = true;
  game.scene.add(im);
  // kılavuz merdiveni (ip + tahta basamak) — liman gemisi
  for (const L of extra) {
    if (!L.rope) continue;
    const P = [];
    for (const x of [-0.25, 0.25]) P.push(rod(x, WATER_Y - 0.8, 0.1, x, L.top + 0.1, 0.1, 0.02, 4));
    const wood = [];
    for (let y = WATER_Y - 0.6; y < L.top - 0.1; y += 0.32) wood.push(B3(0.6, 0.05, 0.1, 0, y, 0.12));
    const g1 = new THREE.Mesh(mergeGeometries(P.map((g) => bare(g))), new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.9 }));
    const g2 = new THREE.Mesh(mergeGeometries(wood.map((g) => bare(g))), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8 }));
    const grp = new THREE.Group(); grp.add(g1, g2); grp.position.set(L.x, 0, L.z); grp.rotation.y = Math.atan2(L.nx, L.nz);
    game.scene.add(grp);
  }
  game.seaLadders = ok.concat(extra);
  return game.seaLadders;
}
