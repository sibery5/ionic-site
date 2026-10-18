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

/** rim: yaldız/kristal gibi kozmetik kenar rengi */
export function makeGlass(type: 'acik' | 'demli', rim?: number): GlassModel {
  const group = new THREE.Group();
  if (rim !== undefined) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.0315 * GLASS_SCALE, 0.0022, 4, 16), mat(rim, { metal: 0.9, rough: 0.2, flat: false }));
    r.rotation.x = Math.PI / 2;
    r.position.y = 0.008 + 0.097 * GLASS_SCALE;
    group.add(r);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0215 * GLASS_SCALE, 0.0018, 4, 16), mat(rim, { metal: 0.9, rough: 0.2, flat: false }));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.008 + 0.058 * GLASS_SCALE;
    group.add(band);
  }
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

export function makeTray(color = 0xc9ccd1, metal = 0.85): THREE.Group {
  const g = new THREE.Group();
  const nickel = mat(color, { rough: 0.28, metal, flat: false });
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

export type Mood = 'neutral' | 'happy' | 'angry';
export type HatKind = 'cap' | 'fez' | 'chef' | 'crown';

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
  hipY: number;
  setMood: (m: Mood) => void;
  blink: (dt: number) => void;
}

export interface PersonOpts extends CustomerLook {
  vest?: number;
  height?: number;
  briefcase?: boolean;
  mop?: boolean;
  apron?: number;
  hat?: HatKind;
  hatColor?: number;
}

const smooth = (color: number, rough = 0.7) => mat(color, { rough, flat: false });

function capsule(r: number, len: number, m: THREE.Material, y = 0) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m);
  mesh.position.y = y;
  mesh.castShadow = true;
  return mesh;
}

function sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, w = 12, h = 10) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Stilize karakter: büyük kafa, ifade değiştiren yüz (kaş + ağız), göz kırpma.
 * Kökü ayak tabanında, yüzü +Z yönüne bakar.
 */
export function makePerson(o: PersonOpts): PersonRig {
  const s = o.height ?? 1;
  const root = new THREE.Group();
  const hips = new THREE.Group();
  const hipY = 0.8 * s;
  hips.position.y = hipY;
  root.add(hips);
  const skin = smooth(o.skin, 0.65);
  const shirt = mat(o.shirt);
  const pants = mat(o.pants);
  const hairM = smooth(o.hair, 0.85);
  const shoeM = smooth(0x1b1410, 0.4);

  // bacaklar
  const leg = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.095, 0, 0);
    g.add(capsule(0.075, 0.6 * s, pants, -0.38 * s));
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.13, 3, 8), shoeM);
    shoe.rotation.x = Math.PI / 2;
    shoe.position.set(0, -0.78 * s, 0.05);
    shoe.castShadow = true;
    g.add(shoe);
    hips.add(g);
    return g;
  };
  const legL = leg(-1);
  const legR = leg(1);
  // kalça bağlantısı
  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.14, 12), pants);
  pelvis.scale.z = 0.7;
  pelvis.position.y = -0.02;
  hips.add(pelvis);

  // gövde
  const torso = new THREE.Group();
  hips.add(torso);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.52 * s, 14), shirt);
  chest.scale.z = 0.68;
  chest.position.y = 0.27 * s;
  chest.castShadow = true;
  torso.add(chest);
  const shoulders = sphere(0.2, shirt, 0, 0.52 * s, 0, 14, 8);
  shoulders.scale.set(1, 0.35, 0.68);
  torso.add(shoulders);
  if (o.vest !== undefined) {
    const vm = new THREE.MeshStandardMaterial({ color: o.vest, roughness: 0.6, side: THREE.DoubleSide });
    // önü açık yelek
    const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.212, 0.182, 0.46 * s, 16, 1, true, 0.42, Math.PI * 2 - 0.84), vm);
    vest.scale.z = 0.7;
    vest.position.y = 0.28 * s;
    vest.castShadow = true;
    torso.add(vest);
    const gold = mat(0xd4a83a, { metal: 0.8, rough: 0.3 });
    for (let i = 0; i < 4; i++) torso.add(sphere(0.012, gold, 0.06, 0.12 * s + i * 0.085 * s, 0.13, 6, 4));
  }
  if (o.apron !== undefined) {
    const ap = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5), new THREE.MeshStandardMaterial({ color: o.apron, roughness: 0.9, side: THREE.DoubleSide }));
    ap.position.set(0, 0.05, 0.13);
    torso.add(ap);
  }
  // yaka
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 12), smooth(0xf8f6f0));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.56 * s;
  torso.add(collar);
  if (o.tie !== undefined) {
    const tie = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.3, 4), smooth(o.tie, 0.5));
    tie.rotation.x = Math.PI;
    tie.position.set(0, 0.38 * s, 0.125);
    torso.add(tie);
  }

  // kafa
  const head = new THREE.Group();
  head.position.y = 0.6 * s;
  torso.add(head);
  head.add(capsule(0.05, 0.06, skin, 0.0)); // boyun
  const R = 0.165;
  const hy = 0.17; // kafa merkezi
  const skull = sphere(R, skin, 0, hy, 0, 18, 14);
  skull.scale.set(1, 1.07, 0.98);
  head.add(skull);
  for (const x of [-1, 1]) head.add(sphere(0.035, skin, x * R * 0.98, hy, 0, 8, 6));
  const nose = sphere(0.03, skin, 0, hy - 0.01, R * 0.97, 8, 6);
  nose.scale.set(0.9, 1.1, 1);
  head.add(nose);
  // gözler
  const eyeWhite = smooth(0xffffff, 0.3);
  const pupilM = smooth(0x1a120c, 0.2);
  const eyes = new THREE.Group();
  eyes.position.set(0, hy + 0.03, R * 0.86);
  for (const x of [-1, 1]) {
    const e = sphere(0.032, eyeWhite, x * 0.062, 0, 0, 10, 8);
    e.scale.z = 0.55;
    eyes.add(e);
    eyes.add(sphere(0.017, pupilM, x * 0.062, -0.002, 0.016, 8, 6));
  }
  head.add(eyes);
  // kaşlar
  const browM = smooth(o.hair === 0xffffff ? 0xbbbbbb : o.hair, 0.9);
  const brows: THREE.Mesh[] = [];
  for (const x of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.012), browM);
    b.position.set(x * 0.062, hy + 0.082, R * 0.92);
    head.add(b);
    brows.push(b);
  }
  // ağız: gülümseme, düz, somurtma
  const lipM = smooth(0x7a3a2a, 0.6);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.007, 4, 10, Math.PI), lipM);
  smile.rotation.z = Math.PI;
  smile.position.set(0, hy - 0.055, R * 0.9);
  const frown = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 4, 10, Math.PI), lipM);
  frown.position.set(0, hy - 0.085, R * 0.88);
  const flat = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.01, 0.01), lipM);
  flat.position.set(0, hy - 0.07, R * 0.9);
  head.add(smile, frown, flat);

  // saç ve başlık
  const style = o.bald ? 'bald' : (o.hairStyle ?? 'short');
  if (o.scarf !== undefined) {
    const sm = new THREE.MeshStandardMaterial({ color: o.scarf, roughness: 0.85, side: THREE.DoubleSide });
    const sc = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 18, 14, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.82), sm);
    sc.position.y = hy + 0.005;
    head.add(sc);
    const drape = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.22, 14, 1, true), sm);
    drape.position.y = -0.02;
    head.add(drape);
  } else if (style === 'bald') {
    for (const x of [-1, 1]) {
      const p = sphere(0.07, hairM, x * R * 0.85, hy - 0.01, -0.03, 8, 6);
      p.scale.set(0.5, 0.8, 1);
      head.add(p);
    }
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM);
    cap.position.set(0, hy + 0.01, -0.01);
    cap.rotation.x = -0.25;
    head.add(cap);
    if (style === 'side') {
      const fringe = sphere(0.08, hairM, 0.05, hy + 0.11, 0.11, 8, 6);
      fringe.scale.set(1.4, 0.45, 0.7);
      head.add(fringe);
    } else if (style === 'curly') {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        head.add(sphere(0.055, hairM, Math.cos(a) * R * 0.8, hy + 0.12 + Math.sin(i * 1.7) * 0.02, Math.sin(a) * R * 0.75, 8, 6));
      }
    } else if (style === 'bun') {
      head.add(sphere(0.07, hairM, 0, hy + 0.12, -0.15, 10, 8));
    } else if (style === 'long') {
      const back = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R * 0.95, 0.3, 14, 1, true, Math.PI / 2 + 0.6, Math.PI * 2 - 1.2), new THREE.MeshStandardMaterial({ color: o.hair, roughness: 0.85, side: THREE.DoubleSide }));
      back.position.y = hy - 0.08;
      head.add(back);
    }
  }
  if (o.mustache) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.06, 3, 6), smooth(o.hair === 0xffffff ? 0xdddddd : o.hair, 0.9));
    m.rotation.z = Math.PI / 2;
    m.position.set(0, hy - 0.04, R * 0.93);
    head.add(m);
  }
  if (o.beard) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(R * 0.92, 14, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.4), smooth(o.hair, 0.95));
    b.position.set(0, hy + 0.005, 0.015);
    head.add(b);
  }
  if (o.glasses) {
    const gm = smooth(0x222222, 0.3);
    for (const x of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 5, 14), gm);
      r.position.set(x * 0.062, hy + 0.03, R * 0.97);
      head.add(r);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.006), gm);
    bridge.position.set(0, hy + 0.035, R * 0.99);
    head.add(bridge);
  }
  if (o.hat) head.add(makeHat(o.hat, o.hatColor, R, hy));

  // kollar
  const arm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.24, 0.5 * s, 0);
    g.add(capsule(0.055, 0.42 * s, shirt, -0.26 * s));
    torso.add(g);
    return g;
  };
  // karakter +z'ye bakar: anatomik sağ kol -x tarafındadır (tepsiyi tutan el)
  const armL = arm(1);
  const armR = arm(-1);
  const hand = sphere(0.052, skin, 0, -0.56 * s, 0, 8, 6);
  armR.add(hand);
  armL.add(sphere(0.052, skin, 0, -0.56 * s, 0, 8, 6));
  if (o.briefcase) armL.add(box(0.34, 0.25, 0.08, mat(0x4a2a14, { rough: 0.5 }), 0, -0.72 * s, 0));
  if (o.mop) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 6), mat(0x8a6a3a));
    stick.position.set(0, -0.5, 0.25);
    stick.rotation.x = 0.5;
    armL.add(stick);
    const head2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 10), mat(0xe8e2d0, { rough: 1 }));
    head2.position.set(0, -1.05, 0.55);
    armL.add(head2);
  }

  root.traverse((m) => {
    if (m instanceof THREE.Mesh) m.castShadow = true;
  });

  // ifade ve göz kırpma
  let blinkT = 1 + Math.random() * 3;
  const setMood = (m: Mood) => {
    smile.visible = m === 'happy';
    frown.visible = m === 'angry';
    flat.visible = m === 'neutral';
    brows[0].rotation.z = m === 'angry' ? -0.45 : m === 'happy' ? 0.15 : 0;
    brows[1].rotation.z = m === 'angry' ? 0.45 : m === 'happy' ? -0.15 : 0;
    const y = hy + (m === 'happy' ? 0.09 : 0.082);
    brows[0].position.y = brows[1].position.y = y;
  };
  setMood(o.vest !== undefined ? 'happy' : 'neutral');
  const blink = (dt: number) => {
    blinkT -= dt;
    if (blinkT < 0) {
      eyes.scale.y = 0.15;
      if (blinkT < -0.12) {
        eyes.scale.y = 1;
        blinkT = 2 + Math.random() * 4;
      }
    }
  };
  return { root, hips, torso, head, legL, legR, armL, armR, hand, hipY, setMood, blink };
}

function makeHat(kind: HatKind, color: number | undefined, R: number, hy: number): THREE.Group {
  const g = new THREE.Group();
  g.position.y = hy + R * 0.72;
  if (kind === 'cap') {
    const m = mat(color ?? 0x4a4a52, { rough: 0.9 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.08, 0.07, 16), m);
    top.scale.z = 1.08;
    g.add(top);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.7, R * 0.7, 0.015, 12, 1, false, -Math.PI / 2, Math.PI), m);
    brim.position.set(0, -0.025, R * 0.75);
    g.add(brim);
  } else if (kind === 'fez') {
    const fez = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.8, 0.17, 16), mat(color ?? 0xb3261e, { rough: 0.8 }));
    fez.position.y = 0.06;
    g.add(fez);
    const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 0.12, 6), mat(0x111111));
    tassel.position.set(R * 0.5, 0.06, -0.02);
    tassel.rotation.z = -0.3;
    g.add(tassel);
  } else if (kind === 'chef') {
    const m = mat(color ?? 0xf4f1ea, { rough: 0.95, flat: false });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.95, 0.09, 16), m);
    g.add(band);
    const puff = new THREE.Mesh(new THREE.SphereGeometry(R * 1.15, 14, 10), m);
    puff.position.y = 0.13;
    puff.scale.y = 0.7;
    g.add(puff);
  } else {
    const m = mat(color ?? 0xf2c230, { metal: 1, rough: 0.25 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.85, R * 0.9, 0.06, 16, 1, true), m);
    ring.position.y = 0.02;
    g.add(ring);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), m);
      const a = (i / 6) * Math.PI * 2;
      sp.position.set(Math.cos(a) * R * 0.85, 0.09, Math.sin(a) * R * 0.85);
      g.add(sp);
    }
  }
  g.traverse((m) => {
    if (m instanceof THREE.Mesh) m.castShadow = true;
  });
  return g;
}

/** Yürüme animasyonu (prosedürel). phase radyan, amount 0..1 */
export function animateWalk(r: PersonRig, phase: number, amount: number, skipRightArm = false) {
  const sw = Math.sin(phase) * 0.55 * amount;
  r.legL.rotation.x = sw;
  r.legR.rotation.x = -sw;
  r.armL.rotation.x = -sw * 0.8;
  if (!skipRightArm) r.armR.rotation.x = sw * 0.8;
  r.hips.position.y = r.hipY + Math.abs(Math.cos(phase)) * 0.035 * amount;
  r.torso.rotation.y = Math.sin(phase) * 0.06 * amount;
  r.head.rotation.z = Math.sin(phase) * 0.03 * amount;
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
