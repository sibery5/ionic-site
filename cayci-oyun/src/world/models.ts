import * as THREE from 'three';
import { TRAY } from '../config';
import type { CustomerLook } from '../game/story';
import { woodTexture } from './textures';

// Bütün 3D modeller burada, kodla üretilir. Low-poly, düz gölgelendirme.

const matCache = new Map<string, THREE.Material>();
export function mat(color: number, opts: { rough?: number; metal?: number; emissive?: number; flat?: boolean } = {}) {
  const key = `${color}-${opts.rough ?? 0.8}-${opts.metal ?? 0}-${opts.emissive ?? 0}-${opts.flat ?? true}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.8,
      metalness: opts.metal ?? 0,
      flatShading: opts.flat ?? true,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : undefined,
      emissiveIntensity: opts.emissive ? 1 : 0,
    });
    matCache.set(key, m);
  }
  return m;
}

let woodMat: THREE.Material | null = null;
export function wood() {
  if (!woodMat) woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.7, flatShading: true });
  return woodMat;
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 10, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------- ince belli çay bardağı ----------------

const GLASS_SCALE = 1.45; // oyunda görünür olsun diye gerçeğinden biraz büyük
const glassProfile = [
  [0.0, 0.0],
  [0.021, 0.0],
  [0.024, 0.006],
  [0.03, 0.026],
  [0.026, 0.045],
  [0.021, 0.058],
  [0.024, 0.075],
  [0.031, 0.095],
  [0.0315, 0.098],
].map(([r, y]) => new THREE.Vector2(r * GLASS_SCALE, y * GLASS_SCALE));

const teaProfile = [
  [0.0, 0.006],
  [0.02, 0.006],
  [0.0265, 0.026],
  [0.023, 0.045],
  [0.0185, 0.058],
  [0.021, 0.075],
  [0.0275, 0.09],
  [0.0, 0.09],
].map(([r, y]) => new THREE.Vector2(r * GLASS_SCALE, y * GLASS_SCALE));

export const GLASS_HEIGHT = 0.098 * GLASS_SCALE;
export const TEA_COLORS = { acik: 0xd9822b, demli: 0x8e1d10 };

const glassMat = new THREE.MeshStandardMaterial({
  color: 0xdff0f5,
  roughness: 0.08,
  metalness: 0.1,
  transparent: true,
  opacity: 0.32,
  depthWrite: false,
});
const glassGeo = new THREE.LatheGeometry(glassProfile, 14);
const teaGeo = new THREE.LatheGeometry(teaProfile, 14);
teaGeo.translate(0, -0.006 * GLASS_SCALE, 0);
const saucerGeo = new THREE.CylinderGeometry(0.05 * GLASS_SCALE, 0.04 * GLASS_SCALE, 0.008, 14);

export interface GlassModel {
  group: THREE.Group;
  tea: THREE.Mesh;
  teaMat: THREE.MeshStandardMaterial;
}

export function makeGlass(type: 'acik' | 'demli'): GlassModel {
  const group = new THREE.Group();
  const saucer = new THREE.Mesh(saucerGeo, mat(0xf4f1ea, { rough: 0.4 }));
  saucer.position.y = 0.004;
  saucer.castShadow = true;
  group.add(saucer);
  const teaMat = new THREE.MeshStandardMaterial({
    color: TEA_COLORS[type],
    roughness: 0.15,
    transparent: true,
    opacity: 0.92,
    emissive: new THREE.Color(TEA_COLORS[type]).multiplyScalar(0.25),
  });
  const tea = new THREE.Mesh(teaGeo, teaMat);
  tea.position.y = 0.008 + 0.006 * GLASS_SCALE;
  group.add(tea);
  const g = new THREE.Mesh(glassGeo, glassMat);
  g.position.y = 0.008;
  g.renderOrder = 2;
  group.add(g);
  return { group, tea, teaMat };
}

// ---------------- bahşiş kavanozu ----------------

export function makeTipJar(): THREE.Group {
  const g = new THREE.Group();
  const jarMat = new THREE.MeshStandardMaterial({ color: 0xe8f4f0, roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 16, 1, true), jarMat);
  body.position.y = 0.072;
  body.renderOrder = 2;
  g.add(body);
  const lid = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 16), mat(0xc9a54a, { metal: 0.8, rough: 0.3 }));
  lid.rotation.x = Math.PI / 2;
  lid.position.y = 0.137;
  g.add(lid);
  const coins = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.12, 14), mat(0xe9c046, { metal: 0.9, rough: 0.3, emissive: 0x3a2a00 }));
  coins.name = 'coins';
  coins.geometry.translate(0, 0.06, 0);
  coins.position.y = 0.01;
  g.add(coins);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0505, 0.0505, 0.03, 16, 1, true), mat(0xb3261e));
  label.position.y = 0.08;
  g.add(label);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

// ---------------- askılı tepsi ----------------

export function makeTray(): THREE.Group {
  const g = new THREE.Group();
  const nickel = mat(0xc9ccd1, { rough: 0.28, metal: 0.85, flat: false });
  const disc = cyl(TRAY.radius, TRAY.radius * 0.96, 0.012, nickel, 28);
  g.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(TRAY.radius, 0.008, 6, 32), nickel);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.008;
  g.add(rim);
  // üç askı çubuğu, tepede birleşir
  const top = new THREE.Vector3(0, TRAY.rodLength, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const base = new THREE.Vector3(Math.cos(a) * TRAY.radius * 0.97, 0.01, Math.sin(a) * TRAY.radius * 0.97);
    const len = base.distanceTo(top);
    const rod = cyl(0.004, 0.004, len, nickel, 5);
    rod.position.copy(base).lerp(top, 0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(base).normalize());
    g.add(rod);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), nickel);
  ring.position.copy(top).add(new THREE.Vector3(0, 0.025, 0));
  g.add(ring);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

// ---------------- insanlar ----------------

export interface PersonRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  hand: THREE.Mesh;
}

export interface PersonOpts extends CustomerLook {
  vest?: number;
  height?: number;
  briefcase?: boolean;
}

export function makePerson(o: PersonOpts): PersonRig {
  const s = o.height ?? 1;
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.86 * s;
  root.add(hips);
  const skin = mat(o.skin);
  const shirt = mat(o.shirt);
  const pants = mat(o.pants);

  const leg = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.1, 0, 0);
    g.add(box(0.15, 0.82 * s, 0.17, pants, 0, -0.41 * s, 0));
    g.add(box(0.16, 0.08, 0.27, mat(0x1b1410), 0, -0.82 * s, 0.04));
    hips.add(g);
    return g;
  };
  const legL = leg(-1);
  const legR = leg(1);

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(box(0.42, 0.56 * s, 0.24, shirt, 0, 0.28 * s, 0));
  if (o.vest !== undefined) {
    const vest = mat(o.vest);
    torso.add(box(0.44, 0.48 * s, 0.1, vest, 0, 0.3 * s, -0.08)); // sırt
    torso.add(box(0.15, 0.46 * s, 0.05, vest, -0.14, 0.29 * s, 0.11)); // ön sol
    torso.add(box(0.15, 0.46 * s, 0.05, vest, 0.14, 0.29 * s, 0.11)); // ön sağ
  }
  if (o.tie !== undefined) torso.add(box(0.06, 0.34 * s, 0.03, mat(o.tie), 0, 0.33 * s, 0.13));

  const head = new THREE.Group();
  head.position.y = 0.72 * s;
  torso.add(head);
  head.add(cyl(0.05, 0.06, 0.1, skin, 8, 0, -0.08, 0)); // boyun
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), skin);
  skull.scale.set(1, 1.12, 1);
  skull.castShadow = true;
  head.add(skull);
  // burun
  head.add(box(0.04, 0.06, 0.05, skin, 0, -0.01, 0.13));
  // gözler
  const eye = mat(0x1a1a1a);
  head.add(box(0.025, 0.025, 0.02, eye, -0.045, 0.03, 0.12));
  head.add(box(0.025, 0.025, 0.02, eye, 0.045, 0.03, 0.12));
  if (o.scarf !== undefined) {
    const sc = new THREE.Mesh(new THREE.IcosahedronGeometry(0.155, 1), mat(o.scarf));
    sc.scale.set(1.02, 1.12, 1);
    sc.position.set(0, 0.0, -0.025);
    head.add(sc);
    head.add(cyl(0.12, 0.2, 0.16, mat(o.scarf), 10, 0, -0.14, -0.01));
    // yüz açıklığı: ten rengi ön plaka
    head.add(box(0.17, 0.2, 0.04, skin, 0, -0.005, 0.12));
    head.add(box(0.025, 0.025, 0.02, eye, -0.045, 0.03, 0.145));
    head.add(box(0.025, 0.025, 0.02, eye, 0.045, 0.03, 0.145));
  } else if (!o.bald) {
    const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.138, 1), mat(o.hair));
    hair.scale.set(1.02, 0.7, 1.02);
    hair.position.set(0, 0.07, -0.02);
    head.add(hair);
  } else {
    head.add(box(0.27, 0.06, 0.2, mat(o.hair), 0, -0.01, -0.05)); // yan saçlar
  }
  if (o.mustache) head.add(box(0.09, 0.025, 0.03, mat(o.hair === 0xffffff ? 0xdddddd : o.hair), 0, -0.055, 0.125));
  if (o.glasses) {
    const gm = mat(0x222222);
    for (const x of [-0.048, 0.048]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 4, 10), gm);
      r.position.set(x, 0.03, 0.135);
      head.add(r);
    }
  }

  const arm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.26, 0.5 * s, 0);
    g.add(box(0.09, 0.58 * s, 0.1, shirt, 0, -0.29 * s, 0));
    torso.add(g);
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);
  const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), skin);
  hand.position.y = -0.6 * s;
  armR.add(hand);
  const handL = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), skin);
  handL.position.y = -0.6 * s;
  armL.add(handL);
  if (o.briefcase) {
    const bc = box(0.34, 0.25, 0.08, mat(0x4a2a14, { rough: 0.5 }), 0, -0.72 * s, 0);
    armL.add(bc);
  }
  root.traverse((m) => {
    if (m instanceof THREE.Mesh) m.castShadow = true;
  });
  return { root, hips, torso, head, legL, legR, armL, armR, hand };
}

/** Yürüme animasyonu (prosedürel). phase radyan, amount 0..1 */
export function animateWalk(r: PersonRig, phase: number, amount: number, skipRightArm = false) {
  const sw = Math.sin(phase) * 0.55 * amount;
  r.legL.rotation.x = sw;
  r.legR.rotation.x = -sw;
  r.armL.rotation.x = -sw * 0.8;
  if (!skipRightArm) r.armR.rotation.x = sw * 0.8;
  r.hips.position.y = 0.86 + Math.abs(Math.cos(phase)) * 0.035 * amount;
  r.torso.rotation.y = Math.sin(phase) * 0.06 * amount;
}

export function sitPose(r: PersonRig) {
  r.legL.rotation.x = -Math.PI / 2.1;
  r.legR.rotation.x = -Math.PI / 2.1;
  r.hips.position.y = 0.5;
  r.armL.rotation.x = -0.9;
  r.armR.rotation.x = -0.9;
}

// ---------------- Paşa ----------------

export interface CatRig {
  root: THREE.Group;
  tail: THREE.Group;
  head: THREE.Group;
  legs: THREE.Mesh[];
}

export function makeCat(): CatRig {
  const root = new THREE.Group();
  const fur = mat(0xd9822b);
  const dark = mat(0x9a4f16);
  root.add(box(0.18, 0.15, 0.42, fur, 0, 0.22, 0));
  for (let i = 0; i < 3; i++) root.add(box(0.185, 0.03, 0.04, dark, 0, 0.28, -0.12 + i * 0.1));
  const head = new THREE.Group();
  head.position.set(0, 0.32, 0.24);
  head.add(box(0.17, 0.14, 0.14, fur));
  const ear = new THREE.ConeGeometry(0.035, 0.07, 4);
  for (const x of [-0.055, 0.055]) {
    const e = new THREE.Mesh(ear, fur);
    e.position.set(x, 0.1, 0);
    head.add(e);
  }
  head.add(box(0.03, 0.03, 0.01, mat(0x2a6a2a), -0.04, 0.02, 0.075));
  head.add(box(0.03, 0.03, 0.01, mat(0x2a6a2a), 0.04, 0.02, 0.075));
  head.add(box(0.03, 0.02, 0.02, mat(0xe39aa0), 0, -0.02, 0.075));
  root.add(head);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [
    [-0.06, 0.15],
    [0.06, 0.15],
    [-0.06, -0.15],
    [0.06, -0.15],
  ]) {
    const l = box(0.05, 0.16, 0.05, fur, x, 0.08, z);
    legs.push(l);
    root.add(l);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.26, -0.21);
  const t1 = cyl(0.02, 0.025, 0.3, fur, 6, 0, 0.15, 0);
  tail.add(t1);
  tail.rotation.x = -0.6;
  root.add(tail);
  root.traverse((m) => {
    if (m instanceof THREE.Mesh) m.castShadow = true;
  });
  return { root, tail, head, legs };
}

// ---------------- mobilya ve dekor ----------------

export function makeDesk(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.0, 0.06, 0.62, wood(), 0, 0.78, 0));
  g.add(box(0.96, 0.7, 0.04, wood(), 0, 0.42, -0.28)); // ön panel
  for (const x of [-0.46, 0.46]) g.add(box(0.05, 0.75, 0.58, wood(), x, 0.38, 0));
  // masa üstü: dosyalar, kalemlik
  g.add(box(0.26, 0.04, 0.2, mat(0xe8e2d0), -0.25, 0.83, 0.05));
  g.add(box(0.24, 0.03, 0.18, mat(0x7a9a6a), -0.24, 0.865, 0.06));
  g.add(cyl(0.03, 0.03, 0.1, mat(0x333333), 8, 0.32, 0.86, -0.1));
  return g;
}

export function makeChair(): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0x3a2a1a);
  g.add(box(0.42, 0.05, 0.42, m, 0, 0.46, 0));
  g.add(box(0.42, 0.5, 0.05, m, 0, 0.72, -0.2));
  for (const [x, z] of [
    [-0.18, -0.18],
    [0.18, -0.18],
    [-0.18, 0.18],
    [0.18, 0.18],
  ])
    g.add(box(0.04, 0.46, 0.04, m, x, 0.23, z));
  return g;
}

export function makeCabinet(): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0x6f7a72, { rough: 0.5, metal: 0.3 });
  g.add(box(0.7, 1.9, 0.55, m, 0, 0.95, 0));
  for (let i = 0; i < 4; i++) {
    g.add(box(0.6, 0.38, 0.02, mat(0x7f8a82, { rough: 0.5, metal: 0.3 }), 0, 0.3 + i * 0.45, 0.28));
    g.add(box(0.14, 0.03, 0.03, mat(0xcccccc, { metal: 0.8, rough: 0.3 }), 0, 0.42 + i * 0.45, 0.3));
  }
  return g;
}

export function makePlant(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.15, 0.36, mat(0xb5543a), 8, 0, 0.18, 0));
  const leaf = mat(0x3f7a3a);
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + Math.random() * 0.08, 0), leaf);
    l.position.set((Math.random() - 0.5) * 0.25, 0.55 + i * 0.12, (Math.random() - 0.5) * 0.25);
    l.castShadow = true;
    g.add(l);
  }
  return g;
}

export function makeWaterCooler(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.36, 1.0, 0.36, mat(0xe8e8e8, { rough: 0.4 }), 0, 0.5, 0));
  const bottle = cyl(0.15, 0.15, 0.4, new THREE.MeshStandardMaterial({ color: 0x7fb7e0, transparent: true, opacity: 0.6, roughness: 0.1 }), 12, 0, 1.22, 0);
  g.add(bottle);
  g.add(box(0.06, 0.04, 0.05, mat(0x2d6a8a), -0.08, 0.75, 0.2));
  g.add(box(0.06, 0.04, 0.05, mat(0xb3261e), 0.08, 0.75, 0.2));
  return g;
}

export function makeCafeTable(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.42, 0.42, 0.04, mat(0xe8e2d0), 16, 0, 0.74, 0));
  g.add(cyl(0.03, 0.03, 0.72, mat(0x333333, { metal: 0.6 }), 8, 0, 0.37, 0));
  g.add(cyl(0.22, 0.22, 0.03, mat(0x333333, { metal: 0.6 }), 12, 0, 0.015, 0));
  // masa örtüsü deseni: kırmızı kare
  g.add(box(0.4, 0.005, 0.4, mat(0xb3261e), 0, 0.765, 0));
  return g;
}

export function makeStairs(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) g.add(box(1.1, 0.18 * (i + 1), 0.2, mat(0xa89a86), 0, 0.09 * (i + 1), -0.5 + i * 0.2));
  return g;
}

export interface OcakModel {
  group: THREE.Group;
  steamPoint: THREE.Vector3;
}

/** Ocak: tezgâh + çift katlı çaydanlık + bardak rafı */
export function makeOcak(): OcakModel {
  const g = new THREE.Group();
  g.add(box(1.15, 0.92, 1.0, wood(), 0, 0.46, 0));
  g.add(box(1.2, 0.05, 1.05, mat(0xd8d2c4, { rough: 0.35 }), 0, 0.945, 0)); // mermer
  // ocak gözü
  g.add(cyl(0.16, 0.16, 0.04, mat(0x222222, { metal: 0.6 }), 12, 0.15, 0.99, 0));
  const steel = mat(0xd0d3d8, { rough: 0.25, metal: 0.9, flat: false });
  // alt çaydanlık (su)
  g.add(cyl(0.13, 0.15, 0.2, steel, 16, 0.15, 1.11, 0));
  const spout = cyl(0.02, 0.025, 0.12, steel, 6, 0.3, 1.13, 0);
  spout.rotation.z = -0.9;
  g.add(spout);
  // üst demlik
  g.add(cyl(0.08, 0.1, 0.13, steel, 14, 0.15, 1.28, 0));
  g.add(cyl(0.03, 0.03, 0.03, mat(0x111111), 8, 0.15, 1.36, 0));
  // bardak rafı: ters bardaklar
  for (let i = 0; i < 6; i++) {
    const gl = makeGlass('acik');
    gl.tea.visible = false;
    gl.group.position.set(-0.4 + (i % 3) * 0.1, 0.97, -0.25 + Math.floor(i / 3) * 0.12);
    g.add(gl.group);
  }
  // şeker kâsesi
  g.add(cyl(0.06, 0.05, 0.06, mat(0xf4f1ea), 10, -0.15, 1.0, 0.25));
  return { group: g, steamPoint: new THREE.Vector3(0.15, 1.4, 0) };
}

export function makeWetSign(tex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.5), m);
    p.position.set(0, 0.25, s * 0.07);
    p.rotation.x = s * 0.25;
    p.rotation.y = s < 0 ? Math.PI : 0;
    p.castShadow = true;
    g.add(p);
  }
  return g;
}

export function makeCeilingLamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.008, 0.008, 0.5, mat(0x222222), 4, 0, -0.25, 0));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 12, 1, true), mat(0x2f5a3a, { rough: 0.5 }));
  shade.position.y = -0.55;
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xfff1c8, { emissive: 0xffd88a }));
  bulb.position.y = -0.6;
  g.add(bulb);
  return g;
}

export function makeRadiator(): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0xe6e1d6, { rough: 0.4 });
  for (let i = 0; i < 8; i++) g.add(box(0.06, 0.55, 0.12, m, -0.24 + i * 0.07, 0.4, 0));
  return g;
}
