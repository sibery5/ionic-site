// Silah verileri ve 3D modelleri (hepsi koddan üretilir).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const WEAPONS = {
  fists: { name: 'Yumruk', type: 'melee', dmg: 9, range: 1.6, rate: 2.5, price: 0, slot: 0 },
  knife: { name: 'Sustalı Bıçak', type: 'melee', dmg: 28, range: 1.8, rate: 2.2, price: 350, slot: 1 },
  bat: { name: 'Beyzbol Sopası', type: 'melee', dmg: 34, range: 2.2, rate: 1.4, price: 600, slot: 1 },
  pistol: { name: 'Tabanca 9mm', type: 'gun', sound: 'pistol', dmg: 24, rate: 4, mag: 15, spread: 0.012, range: 90, price: 1500, ammoPrice: 6, slot: 2, oneHand: true, reload: 1.2 },
  revolver: { name: 'Altıpatlar', type: 'gun', sound: 'revolver', dmg: 60, rate: 1.6, mag: 6, spread: 0.008, range: 110, price: 3800, ammoPrice: 15, slot: 2, oneHand: true, reload: 2.0 },
  uzi: { name: 'Uzi', type: 'gun', sound: 'smg', dmg: 15, rate: 13, mag: 32, spread: 0.035, range: 70, price: 6500, ammoPrice: 4, slot: 3, oneHand: true, auto: true, reload: 1.5 },
  shotgun: { name: 'Pompalı Tüfek', type: 'gun', sound: 'shotgun', dmg: 13, pellets: 9, rate: 1.2, mag: 8, spread: 0.09, range: 40, price: 8500, ammoPrice: 20, slot: 4, reload: 2.4 },
  ak: { name: 'Kalaşnikof', type: 'gun', sound: 'rifle', dmg: 32, rate: 9, mag: 30, spread: 0.02, range: 150, price: 16000, ammoPrice: 10, slot: 5, auto: true, reload: 2.2 },
  m4: { name: 'Taarruz Tüfeği', type: 'gun', sound: 'rifle', dmg: 28, rate: 11, mag: 30, spread: 0.015, range: 160, price: 22000, ammoPrice: 12, slot: 5, auto: true, reload: 2.0 },
  sniper: { name: 'Keskin Nişancı', type: 'gun', sound: 'sniper', dmg: 150, rate: 0.8, mag: 5, spread: 0.001, range: 400, price: 30000, ammoPrice: 60, slot: 6, scope: true, reload: 3.0 },
  rpg: { name: 'Roketatar', type: 'launcher', sound: 'rpg', dmg: 250, radius: 8, rate: 0.6, mag: 1, spread: 0.005, range: 300, price: 65000, ammoPrice: 1500, slot: 7, reload: 3.0 },
  grenade: { name: 'El Bombası', type: 'throw', dmg: 180, radius: 7, rate: 1, mag: 1, price: 900, ammoPrice: 900, slot: 8 },
};
export const WEAPON_ORDER = ['fists', 'knife', 'bat', 'pistol', 'revolver', 'uzi', 'shotgun', 'ak', 'm4', 'sniper', 'rpg', 'grenade'];

const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.7, roughness: 0.35 });
const steel = new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.85, roughness: 0.3 });
const wood = new THREE.MeshStandardMaterial({ color: 0x6b3a1e, roughness: 0.6 });
const olive = new THREE.MeshStandardMaterial({ color: 0x4a5a30, roughness: 0.7 });
const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.25 });

function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function cyl(r, l, x, y, z, seg = 8) { const g = new THREE.CylinderGeometry(r, r, l, seg); g.rotateX(Math.PI / 2); g.translate(x, y, z); return g; }

// Silah modeli: namlu +Z yönünde, kabza orijinde.
export function buildWeaponModel(id) {
  const g = new THREE.Group();
  const parts = (list, m) => { const mesh = new THREE.Mesh(mergeGeometries(list), m); mesh.castShadow = true; g.add(mesh); };
  let muzzleZ = 0.2;
  switch (id) {
    case 'knife':
      parts([box(0.03, 0.03, 0.11, 0, 0, 0)], wood);
      parts([box(0.008, 0.03, 0.16, 0, 0.005, 0.13)], steel);
      break;
    case 'bat':
      g.add(new THREE.Mesh((() => { const c = new THREE.CylinderGeometry(0.045, 0.02, 0.85, 10); c.rotateX(Math.PI / 2); c.translate(0, 0, 0.38); return c; })(), wood));
      break;
    case 'pistol':
      parts([box(0.03, 0.035, 0.2, 0, 0.04, 0.06)], black);
      parts([box(0.028, 0.09, 0.045, 0, -0.01, -0.01)], black);
      muzzleZ = 0.17;
      break;
    case 'revolver':
      parts([cyl(0.012, 0.18, 0, 0.045, 0.12), box(0.03, 0.035, 0.08, 0, 0.04, 0.0)], steel);
      parts([cyl(0.025, 0.05, 0, 0.04, 0.03, 8)], steel);
      parts([box(0.028, 0.09, 0.04, 0, -0.01, -0.03)], wood);
      parts([box(0.004, 0.012, 0.01, 0, 0.065, 0.2)], gold);
      muzzleZ = 0.22;
      break;
    case 'uzi':
      parts([box(0.04, 0.06, 0.24, 0, 0.04, 0.06), box(0.03, 0.14, 0.035, 0, -0.04, 0.02), cyl(0.01, 0.05, 0, 0.05, 0.2)], black);
      muzzleZ = 0.23;
      break;
    case 'shotgun':
      parts([cyl(0.016, 0.62, 0, 0.05, 0.3), cyl(0.013, 0.5, 0, 0.025, 0.26)], black);
      parts([box(0.04, 0.05, 0.16, 0, 0.035, 0.0), box(0.035, 0.07, 0.25, 0, 0.0, -0.18)], wood);
      parts([box(0.035, 0.03, 0.14, 0, 0.022, 0.36)], wood);
      muzzleZ = 0.62;
      break;
    case 'ak':
      parts([box(0.04, 0.07, 0.3, 0, 0.04, 0.08), cyl(0.012, 0.32, 0, 0.055, 0.38), box(0.03, 0.06, 0.03, 0, -0.02, 0.0)], black);
      parts([box(0.035, 0.05, 0.22, 0, 0.03, -0.18), box(0.04, 0.04, 0.15, 0, 0.03, 0.29)], wood);
      parts([(() => { const c = box(0.03, 0.16, 0.05, 0, -0.06, 0.12); c.rotateX(-0.35); return c; })()], black);
      muzzleZ = 0.55;
      break;
    case 'm4':
      parts([box(0.04, 0.07, 0.34, 0, 0.04, 0.08), cyl(0.012, 0.28, 0, 0.05, 0.38), box(0.03, 0.06, 0.03, 0, -0.02, 0.0), box(0.035, 0.06, 0.2, 0, 0.03, -0.2), box(0.02, 0.03, 0.12, 0, 0.09, 0.05), box(0.03, 0.12, 0.04, 0, -0.04, 0.12)], olive);
      muzzleZ = 0.52;
      break;
    case 'sniper':
      parts([box(0.04, 0.06, 0.4, 0, 0.04, 0.12), cyl(0.012, 0.55, 0, 0.05, 0.55)], black);
      parts([cyl(0.025, 0.24, 0, 0.11, 0.1, 10)], black);
      parts([box(0.04, 0.06, 0.28, 0, 0.02, -0.2)], wood);
      muzzleZ = 0.82;
      break;
    case 'rpg':
      parts([cyl(0.045, 1.0, 0, 0.07, 0.2, 10)], olive);
      parts([(() => { const c = new THREE.ConeGeometry(0.06, 0.22, 10); c.rotateX(Math.PI / 2); c.translate(0, 0.07, 0.8); return c; })()], olive);
      parts([box(0.03, 0.1, 0.04, 0, -0.01, 0.02), box(0.03, 0.1, 0.04, 0, -0.01, 0.2)], black);
      muzzleZ = 0.9;
      break;
    case 'grenade':
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), olive));
      break;
    default:
      return null;
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.05, muzzleZ); g.add(muzzle);
  g.userData.muzzle = muzzle;
  return g;
}
