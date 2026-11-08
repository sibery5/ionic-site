// Sahil yolu (Üsküdar–Kadıköy, Anadolu kıyısı x=420..427): arnavut taşı yürüyüş bandı, denize bakan belediye
// bankları (oturulabilir: city.benches → city.seats), klasik fenerler, çınar ağaçları, ara ara simitçi tezgâhı.
import * as THREE from 'three';
import { RNG } from '../core/util.js';
import { BRIDGES, HARBOR } from './map.js';

const SX = 420, RX = 427; // kıyı çizgisi, caddenin (x=435, 16 m) kenarı
const Z0 = -990, Z1 = 806;
const skip = (z) => {
  const B = BRIDGES.find((b) => b.axis === 'x');
  if (z > B.z0 - 8 && z < B.z1 + 8) return true; // köprü girişi
  if (z > HARBOR.box[1] - 10) return true;
  return false;
};

export function paintCoast(paint) {
  const COB = [0, 0, 0, 255], PAVE = [0, 255, 0, 0];
  paint.rect(SX, Z0, SX + 3.4, Z1, COB); // deniz tarafı arnavut taşı bant
  paint.rect(SX + 3.4, Z0, SX + 3.7, Z1, PAVE); // bordür taşı çizgisi
}

export function buildCoast(city) {
  const P = city.props, cols = city.physics.city, rng = new RNG(1846);
  const benches = city.benches || (city.benches = []);
  const halos = [];
  let n = 0;
  for (let z = Z0 + 6; z < Z1 - 4; z += 12) {
    if (skip(z)) continue;
    const k = Math.round((z - Z0) / 12) % 3;
    if (k === 0) {
      // klasik fener (deniz kenarında)
      const x = SX + 0.9;
      P.lampClassic.addTRS(x, 0, z, 0); cols.addCircle(x, z, 0.25, 0, 4.9, 'lamp');
      city.addLight(x, 4.75, z, 0xffc27a, 0.75, true, 0.02); halos.push(x, 4.75, z);
    } else {
      // denize bakan bank (yüzü -x: Boğaz ve Kız Kulesi)
      const x = SX + 1.9, rot = -Math.PI / 2;
      P.bench.addTRS(x, 0, z, rot);
      cols.breakable(cols.addLocal(x, z, rot, 0, -0.04, 1.8, 0.56, 0, 0.9, 'bench'), 'bench', 70, P.bench, x, 0, z, rot);
      benches.push([x, z, rot, 0, 'sahil']); n++;
      // bankın arkasında çöp kovası (her 4 bankta bir)
      if (n % 4 === 0) { const bx = x + 0.9, bz = z + 1.4, br = rng.float(0, 6.28); P.bin.addTRS(bx, 0, bz, br); cols.breakable(cols.addCircle(bx, bz, 0.28, 0, 1.05, 'bin'), 'bin', 25, P.bin, bx, 0, bz, br); }
    }
    // çınar sırası (yol tarafı), fenerlerin arasında
    if (k === 1 && city.addTree) city.addTree(rng.chance(0.8) ? 'plane' : 'linden', SX + 4.9, z + 6, rng.float(0.9, 1.25), 0);
    // simitçi / büfe
    if (k === 2 && rng.chance(0.08)) { const x = SX + 4.6, rot = Math.PI / 2; P.simit.addTRS(x, 0, z + 3, rot); cols.breakable(cols.addLocal(x, z + 3, rot, 0, 0.03, 1.35, 0.85, 0, 1.75, 'simit'), 'simit', 80, P.simit, x, 0, z + 3, rot); }
  }
  // fener haleleri (gece) — streetprops'un hale malzemesi
  if (halos.length && city.haloMat) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(halos, 3));
    const p = new THREE.Points(g, city.haloMat); p.renderOrder = 3; city.group.add(p);
  }
  return { benches: n };
}
