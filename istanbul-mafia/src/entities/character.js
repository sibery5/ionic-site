// Prosedürel insan modeli + katmanlı prosedürel animasyon.
// Model: kemik grubu başına birleştirilmiş geometri (vertex color), malzemeler tüm karakterlerde ortak.
// Animasyon: poz kanalları (eklem başına x/y/z), ağırlıklı katmanlar, yumuşak geçişler, kol IK (nişan/şarjör).
import * as THREE from 'three';
import { buildWeaponModel, WEAPONS } from '../game/weapons.js';
import { RIG, buildBody, skullGeo, handGeo, faceTexture, weaveTexture, hairTexture, mergeGeometries, SKIN_UV } from './charParts.js';

export const SKIN_TONES = ['#f1d0b5', '#e0b493', '#c99572', '#a8754f', '#7d5236', '#5a3a26'];
export const HAIR_COLORS = ['#1a1410', '#3b2a1e', '#6b4a2e', '#a07040', '#d8b070', '#8a8a8a', '#5a1a10'];
export const HAIR_STYLES = ['kisa', 'arkaya', 'kel', 'uzun', 'kivircik', 'at_kuyrugu'];
export const BEARDS = ['none', 'stubble', 'mustache', 'full'];
const EYE_COLORS = ['#3b2414', '#5a3a1c', '#2e4a2a', '#3a5a7a', '#6a5030'];

export function defaultLook(gender = 'm') {
  return {
    gender, skin: SKIN_TONES[1], hair: gender === 'f' ? 'uzun' : 'kisa', hairColor: HAIR_COLORS[0], beard: gender === 'f' ? 'none' : 'stubble',
    top: 'leather', topColor: '#1c1c1c', shirtColor: '#e8e8e8', pants: 'jeans', pantsColor: '#2a3550', shoes: 'sneaker', shoesColor: '#eeeeee',
    hat: 'none', hatColor: '#222222', glasses: false, chain: false, tespih: false, build: 1.0, eyeColor: EYE_COLORS[1],
  };
}

export function randomLook(r, kind = 'civilian') {
  const gender = r.chance(kind === 'civilian' ? 0.45 : 0.08) ? 'f' : 'm';
  const L = defaultLook(gender);
  L.skin = r.pick(SKIN_TONES.slice(0, 5));
  L.hairColor = r.pick(HAIR_COLORS);
  L.hair = gender === 'f' ? r.pick(['uzun', 'at_kuyrugu', 'kivircik', 'kisa', 'uzun']) : r.pick(['kisa', 'arkaya', 'kel', 'kivircik', 'kisa']);
  L.beard = gender === 'f' ? 'none' : r.pick(BEARDS);
  L.eyeColor = r.pick(EYE_COLORS);
  L.top = r.pick(['tshirt', 'shirt', 'jacket', 'coat', 'track', 'tshirt', 'leather']);
  L.topColor = r.pick(['#8a1a1a', '#1d3d6e', '#2d5a2d', '#444444', '#c9b48a', '#e0e0e0', '#5a2d5a', '#b05a1a', '#1a1a1a', '#6e8a9e']);
  if (L.top === 'leather') L.topColor = r.pick(['#1c1c1c', '#4a2c1a', '#5a1a1a']);
  if (L.top === 'jacket') L.topColor = r.pick(['#3a4a6a', '#2a2a2a', '#6a5a4a']);
  L.shirtColor = r.pick(['#ffffff', '#d8d8e8', '#e8d8c8', '#a8c8e8']);
  L.pants = gender === 'f' && r.chance(0.3) ? 'skirt' : r.pick(['jeans', 'slacks', 'jeans', 'track']);
  L.pantsColor = r.pick(['#2a3550', '#1a1a1a', '#5a4a3a', '#3a3a3a', '#6a6a5a']);
  L.shoes = r.pick(['sneaker', 'polished', 'boots', 'sneaker']);
  L.shoesColor = r.pick(['#1a1a1a', '#3a2412', '#eeeeee']);
  L.hat = r.chance(0.15) ? r.pick(['kasket', 'bere']) : 'none';
  L.hatColor = r.pick(['#2a2a2a', '#5a4a3a', '#8a1a1a']);
  L.glasses = r.chance(0.1);
  L.build = r.float(0.92, 1.1);
  if (kind === 'police') {
    Object.assign(L, { top: 'police', topColor: '#1d2f5a', shirtColor: '#a8c0e0', pants: 'slacks', pantsColor: '#1a2440', shoes: 'boots', shoesColor: '#111111', hat: 'police', hatColor: '#1a2440', glasses: r.chance(0.3) });
  } else if (kind === 'gang') {
    Object.assign(L, { top: r.pick(['leather', 'track', 'suit']), pants: r.pick(['jeans', 'slacks', 'track']), glasses: r.chance(0.5), chain: r.chance(0.5), beard: r.pick(['stubble', 'full', 'mustache']) });
    if (L.top === 'leather') L.topColor = r.pick(['#1c1c1c', '#4a2c1a']);
  } else if (kind === 'boss') {
    Object.assign(L, { top: 'suit', topColor: '#111111', shirtColor: '#f0f0f0', pants: 'slacks', pantsColor: '#111111', shoes: 'polished', shoesColor: '#0a0a0a', hat: 'fedora', hatColor: '#151515', glasses: true, chain: true, tespih: true, beard: 'full', hairColor: '#8a8a8a', build: 1.12 });
  }
  return L;
}

// ---------------- ortak malzemeler ----------------
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, map: weaveTexture(), roughness: 0.82 }),
    gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.12 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.95 }),
    hair: new THREE.MeshStandardMaterial({ vertexColors: true, map: hairTexture(), roughness: 0.55, side: THREE.DoubleSide }),
    amber: new THREE.MeshStandardMaterial({ color: '#7a2a10', roughness: 0.2, metalness: 0.1 }),
  };
  return MATS;
}
const faceMats = new Map();
function faceMat(L) {
  const t = faceTexture(L);
  if (!faceMats.has(t)) faceMats.set(t, new THREE.MeshStandardMaterial({ map: t, roughness: 0.62 }));
  return faceMats.get(t);
}

// ---------------- geometri önbelleği (LRU) ----------------
const GROUPS = ['hips', 'spine', 'chest', 'head', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR'];
const geoCache = new Map();
function lookKey(L) {
  return [L.gender, Math.round((L.build || 1) / 0.06), L.skin, L.top, L.topColor, L.shirtColor, L.pants, L.pantsColor, L.shoes, L.shoesColor, L.chain, L.hair, L.hairColor, L.beard, L.hat, L.hatColor, L.glasses, L.tieColor].join('|');
}
function bodyGeos(L) {
  const k = lookKey(L);
  if (geoCache.has(k)) { const v = geoCache.get(k); geoCache.delete(k); geoCache.set(k, v); return v; }
  const B = buildBody(L);
  const pivots = pivotsFor(B);
  const out = { shX: B.shX, hipX: B.hipX, parts: {} };
  for (const gname of Object.keys(B.groups)) {
    const piv = pivots[gname];
    out.parts[gname] = {};
    for (const cls of ['matte', 'gloss', 'metal', 'hair']) {
      const list = B.groups[gname][cls];
      if (!list.length) continue;
      const m = mergeGeometries(list);
      if (gname !== 'head') m.translate(-piv.x, -piv.y, -piv.z);
      m.computeBoundingSphere();
      out.parts[gname][cls] = m;
    }
  }
  geoCache.set(k, out);
  if (geoCache.size > 120) { const [ok, ov] = geoCache.entries().next().value; geoCache.delete(ok); for (const g of Object.values(ov.parts)) for (const m of Object.values(g)) m.dispose(); }
  return out;
}
function pivotsFor(B) {
  const R = RIG, V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
  return {
    hips: V(0, R.hips), spine: V(0, R.spine), chest: V(0, R.chest), head: V(0, R.head),
    shL: V(B.shX, R.shY), elL: V(B.shX, R.elY), shR: V(-B.shX, R.shY), elR: V(-B.shX, R.elY),
    hipL: V(B.hipX, R.hipY), knL: V(B.hipX, R.knY), anL: V(B.hipX, R.anY), hipR: V(-B.hipX, R.hipY), knR: V(-B.hipX, R.knY), anR: V(-B.hipX, R.anY),
  };
}
const handCache = new Map();
function handFor(fist, f, right, skin) {
  const k = [fist, f, right, skin].join('|');
  if (!handCache.has(k)) {
    let g = handGeo(fist, f);
    if (right) { g = g.clone(); g.scale(-1, 1, 1); const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
    else g = g.clone();
    const c = new THREE.Color(skin), col = g.attributes.color, uv = g.attributes.uv;
    for (let i = 0; i < col.count; i++) { col.setXYZ(i, c.r, c.g, c.b); uv.setXY(i, SKIN_UV[0], SKIN_UV[1]); }
    handCache.set(k, g);
  }
  return handCache.get(k);
}

// ---------------- poz kanalları ----------------
const J = { hips: 0, spine: 1, chest: 2, head: 3, shL: 4, elL: 5, wrL: 6, shR: 7, elR: 8, wrR: 9, hipL: 10, knL: 11, anL: 12, hipR: 13, knR: 14, anR: 15 };
const NJ = 16, HP = NJ * 3, NCH = HP + 3;
const SIDE = [0, 0, 0, 0, 1, 1, 1, -1, -1, -1, 1, 1, 1, -1, -1, -1];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dmp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
function setJ(P, j, x, y, z) { P[j * 3] = x; P[j * 3 + 1] = y; P[j * 3 + 2] = z; }
function addJ(P, j, x, y, z) { P[j * 3] += x; P[j * 3 + 1] += y; P[j * 3 + 2] += z; }
function mixP(P, Q, w, from = 0, to = NCH) { if (w <= 0) return; if (w >= 1) { for (let i = from; i < to; i++) P[i] = Q[i]; return; } for (let i = from; i < to; i++) P[i] += (Q[i] - P[i]) * w; }

// Yürüyüş parametreleri: hız noktalarına göre ara değer
const GAIT = [
  // hız, adım, kalça salınımı, diz (salınım), diz (destek), kol, dirsek, eğilme, kalça dönüşü, yuvarlanma
  [0, 0.7, 0, 0, 0, 0, -0.14, 0.02, 0, 0],
  [1.4, 0.68, 0.36, 0.72, 0.1, 0.3, -0.28, 0.04, 0.08, 0.035],
  [3.6, 1.0, 0.62, 1.35, 0.22, 0.55, -1.1, 0.13, 0.12, 0.03],
  [7.5, 1.55, 0.92, 1.85, 0.3, 0.95, -1.45, 0.3, 0.16, 0.02],
];
const CROUCH = [[0, 0.5, 0, 0, 0, 0.05, -0.5, 0.34, 0, 0], [1.8, 0.5, 0.3, 0.5, 0.05, 0.12, -0.6, 0.38, 0.05, 0.02]];
function gait(tbl, sp, out) {
  let a = tbl[0], b = tbl[tbl.length - 1];
  for (let i = 0; i < tbl.length - 1; i++) if (sp <= tbl[i + 1][0]) { a = tbl[i]; b = tbl[i + 1]; break; }
  const t = clamp((sp - a[0]) / (b[0] - a[0] || 1), 0, 1);
  for (let i = 0; i < 10; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

const _eu = new THREE.Euler();
const UPV = new THREE.Vector3(0, 1, 0);
const v3 = () => new THREE.Vector3(), q4 = () => new THREE.Quaternion();
const IK = { S: v3(), E: v3(), W: v3(), d: v3(), b: v3(), u: v3(), e: v3(), f: v3(), x: v3(), y: v3(), z: v3(), m: new THREE.Matrix4(), qw: q4(), q1: q4(), q2: q4(), q3: q4(), q4: q4() };
const WV = { aim: v3(), fwd: v3(), right: v3(), dir: v3(), R: v3(), U: v3(), eye: v3(), shR: v3(), shL: v3(), G: v3(), F: v3(), t: v3(), x: v3(), y: v3(), z: v3(), wT: v3(), pole: v3(), mag: v3(), belt: v3(), qR: q4(), qL: q4() };
const LEN_T = 0.43, LEN_S = 0.41;

export class CharacterModel {
  constructor(look) {
    this.root = new THREE.Group();
    this.look = { ...look };
    this.phase = Math.random() * 10;
    this.seed = Math.random() * 100;
    this.weaponMesh = null;
    this.weaponId = null;
    this.deadT = 0;
    this.punchT = 0;
    this.P = new Float32Array(NCH);
    this.Q = new Float32Array(NCH);
    this.D0 = new Float32Array(NCH);
    this.w = { crouch: 0, aim: 0, air: 0, swim: 0, sit: 0, up: 0, talk: 0, dance: 0, idle: 1, reload: 0, hold: 0 };
    this.spd = 0; this.mvx = 0; this.mvz = 1;
    this.fl = { x: 0, z: 0, vx: 0, vz: 0 };
    this.landK = 0; this.landT = 9; this.wasAir = false; this.airVy = 0;
    this.combo = 0; this.meleeKind = 'R'; this.meleeDur = 0.4;
    this.deathDir = null;
    this.time = Math.random() * 50;
    this.buildRig();
    this.build();
  }

  // iskelet grupları (bir kez)
  buildRig() {
    const R = RIG;
    const G = (parent, x, y, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    this.body = G(this.root, 0, 0);
    this.hips = G(this.body, 0, R.hips);
    this.spine = G(this.hips, 0, R.spine - R.hips);
    this.chest = G(this.spine, 0, R.chest - R.spine);
    this.head = G(this.chest, 0, R.head - R.chest);
    this.arms = []; this.legs = [];
    for (const s of [1, -1]) {
      const sh = G(this.chest, s * 0.2, R.shY - R.chest);
      const el = G(sh, 0, R.elY - R.shY);
      const wr = G(el, 0, R.wrY - R.elY);
      const socket = G(wr, -s * 0.004, -0.072, 0.004);
      this.arms.push({ sh, el, wr, socket, s });
      const hip = G(this.hips, s * 0.095, R.hipY - R.hips);
      const kn = G(hip, 0, R.knY - R.hipY);
      const an = G(kn, 0, R.anY - R.knY);
      this.legs.push({ hip, kn, an, s });
    }
    this.joints = [this.hips, this.spine, this.chest, this.head, this.arms[0].sh, this.arms[0].el, this.arms[0].wr, this.arms[1].sh, this.arms[1].el, this.arms[1].wr,
      this.legs[0].hip, this.legs[0].kn, this.legs[0].an, this.legs[1].hip, this.legs[1].kn, this.legs[1].an];
    this.groupObj = { hips: this.hips, spine: this.spine, chest: this.chest, head: this.head, shL: this.arms[0].sh, elL: this.arms[0].el, shR: this.arms[1].sh, elR: this.arms[1].el,
      hipL: this.legs[0].hip, knL: this.legs[0].kn, anL: this.legs[0].an, hipR: this.legs[1].hip, knR: this.legs[1].kn, anR: this.legs[1].an };
    this.meshes = [];
  }

  build() {
    const L = this.look;
    const M = mats();
    for (const m of this.meshes) m.parent && m.parent.remove(m);
    this.meshes = [];
    const data = bodyGeos(L);
    const f = L.gender === 'f';
    this.body.scale.setScalar(f ? 0.955 : 1);
    // iskelet ölçüleri (omuz/kalça genişliği)
    for (const a of this.arms) a.sh.position.x = a.s * data.shX;
    for (const l of this.legs) l.hip.position.x = l.s * data.hipX;
    for (const gname of GROUPS) {
      const parts = data.parts[gname]; if (!parts) continue;
      for (const cls of Object.keys(parts)) {
        const mesh = new THREE.Mesh(parts[cls], M[cls]);
        mesh.castShadow = true;
        this.groupObj[gname].add(mesh); this.meshes.push(mesh);
      }
    }
    const skull = new THREE.Mesh(skullGeo(f), faceMat(L));
    skull.castShadow = true; this.head.add(skull); this.meshes.push(skull);
    this.hands = [];
    for (const a of this.arms) {
      const h = new THREE.Mesh(handFor(false, f, a.s < 0, L.skin), M.matte);
      h.castShadow = true; a.wr.add(h); this.meshes.push(h); this.hands.push(h);
      h.userData.fist = false;
    }
    if (L.tespih) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 14), M.amber);
      t.position.set(0.0, -0.11, 0.01); t.rotation.y = 1.2; this.arms[0].wr.add(t); this.meshes.push(t);
    }
    if (this.weaponId) { const w = this.weaponId; this.weaponId = null; this.setWeapon(w); }
  }

  setLook(look) { this.look = { ...look }; this.build(); }

  setWeapon(id) {
    if (this.weaponId === id) return;
    if (this.weaponMesh) { this.weaponMesh.parent && this.weaponMesh.parent.remove(this.weaponMesh); this.weaponMesh = null; }
    this.weaponId = id;
    if (!id || id === 'fists') return;
    const w = buildWeaponModel(id);
    if (!w) return;
    w.rotation.x = Math.PI / 2;
    this.arms[1].socket.add(w);
    this.weaponMesh = w;
  }

  muzzleWorld(out) {
    if (this.weaponMesh && this.weaponMesh.userData.muzzle) return this.weaponMesh.userData.muzzle.getWorldPosition(out);
    this.arms[1].socket.getWorldPosition(out);
    return out;
  }

  // vuruş tepkisi: (dirX, dirZ) merminin dünyadaki gidiş yönü
  hit(dirX, dirZ, k = 1) {
    const h = this.root.rotation.y, c = Math.cos(h), s = Math.sin(h);
    const lx = dirX * c - dirZ * s, lz = dirX * s + dirZ * c;
    const l = Math.hypot(lx, lz) || 1;
    this.fl.vx += (lx / l) * 7 * k; this.fl.vz += (lz / l) * 7 * k;
    this.deathDir = { x: lx / l, z: lz / l };
  }
  // ölüm yönü (dünya), hit() çağrılmadıysa kullanılır
  die(dirX, dirZ) {
    if (dirX === undefined) { const a = Math.random() * Math.PI * 2; this.deathDir = { x: Math.sin(a), z: Math.cos(a) }; return; }
    const h = this.root.rotation.y, c = Math.cos(h), s = Math.sin(h);
    const lx = dirX * c - dirZ * s, lz = dirX * s + dirZ * c, l = Math.hypot(lx, lz) || 1;
    this.deathDir = { x: lx / l, z: lz / l };
  }

  punch() {
    const id = this.weaponId || 'fists';
    this.combo++;
    if (id === 'knife') { this.meleeKind = this.combo % 2 ? 'stab' : 'slash'; this.meleeDur = 0.38; }
    else if (id === 'bat') { this.meleeKind = 'bat'; this.meleeDur = 0.55; }
    else if (id === 'fists') { this.meleeKind = this.combo % 2 ? 'R' : 'L'; this.meleeDur = 0.36; }
    else { this.meleeKind = 'R'; this.meleeDur = 0.36; }
    this.punchT = this.meleeDur;
  }

  // bıçak: ileri saplama / yatay kesme (combat doğrudan çağırabilir)
  stab() { this.combo++; this.meleeKind = 'stab'; this.meleeDur = 0.38; this.punchT = this.meleeDur; }
  slash() { this.combo++; this.meleeKind = 'slash'; this.meleeDur = 0.42; this.punchT = this.meleeDur; }

  setFist(i, on) {
    const h = this.hands[i];
    if (!h || h.userData.fist === on) return;
    h.userData.fist = on;
    h.geometry = handFor(on, this.look.gender === 'f', i === 1, this.look.skin);
  }

  // st: {speed, moveX, moveZ, aim, aimPitch, aimYaw, twoHanded, weapon, dead, swim, sit, crouch, recoil, reload,
  //      air, vy, hands_up, talk, dance, vault, roll}
  animate(dt, st) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const t = this.time, P = this.P, Q = this.Q, W = this.w;
    if (!this.root.parent && !st.force) return;
    // ---- ölüm ----
    if (st.dead) {
      if (this.deadT === 0) { this.D0.set(P); if (!this.deathDir) this.die(); }
      this.deadT += dt;
      this.poseDeath(P, this.deadT);
      this.apply(P, 0);
      this.setFist(0, false); this.setFist(1, !!this.weaponMesh);
      return;
    }
    if (this.deadT > 0) { this.deadT = 0; this.deathDir = null; }
    // ---- ağırlıklar ----
    const sp = st.speed || 0;
    this.spd = dmp(this.spd, sp, 10, dt);
    if (sp > 0.2) {
      const mx = st.moveX !== undefined ? st.moveX : 0, mz = st.moveZ !== undefined ? st.moveZ : 1;
      const l = Math.hypot(mx, mz) || 1;
      this.mvx = dmp(this.mvx, mx / l, 8, dt); this.mvz = dmp(this.mvz, mz / l, 8, dt);
    }
    const twoH = !!(st.twoHanded && this.weaponMesh);
    W.crouch = dmp(W.crouch, st.crouch ? 1 : 0, 9, dt);
    W.aim = dmp(W.aim, st.aim ? 1 : 0, 14, dt);
    W.air = dmp(W.air, st.air ? 1 : 0, st.air ? 8 : 20, dt);
    W.swim = dmp(W.swim, st.swim ? 1 : 0, 5, dt);
    W.sit = dmp(W.sit, st.sit ? 1 : 0, 6, dt);
    W.up = dmp(W.up, st.hands_up ? 1 : 0, 8, dt);
    W.talk = dmp(W.talk, st.talk ? 1 : 0, 3, dt);
    W.dance = dmp(W.dance, st.dance ? 1 : 0, 3, dt);
    W.reload = dmp(W.reload, st.reload > 0 ? 1 : 0, 10, dt);
    W.hold = dmp(W.hold, twoH ? 1 : 0, 10, dt);
    // iniş tespiti
    if (st.air) { this.airVy = Math.min(this.airVy, st.vy || 0); }
    if (this.wasAir && !st.air) { this.landK = clamp(-this.airVy / 11, 0.15, 1); this.landT = 0; this.airVy = 0; }
    this.wasAir = !!st.air;
    this.landT += dt;

    // ---- 1) hareket (yürüme/koşu/çömelme, yan adım, geri adım) ----
    P.fill(0);
    const gs = gait(GAIT, this.spd, this._g || (this._g = new Float32Array(10)));
    const gc = gait(CROUCH, this.spd, this._gc || (this._gc = new Float32Array(10)));
    const wc = W.crouch;
    for (let i = 1; i < 10; i++) gs[i] += (gc[i] - gs[i]) * wc;
    const [, step, stride, kSw, kSt, armA, elb, lean, hYaw, roll] = gs;
    this.phase += (dt * this.spd / Math.max(0.3, step)) * Math.PI;
    const ph = this.phase;
    const moving = clamp(this.spd / 0.8, 0, 1);
    // hareket yönü (gövdeye göre)
    let alpha = Math.atan2(this.mvx, this.mvz);
    let legYaw = 0, fs = 1, ls = 0;
    if (Math.abs(alpha) <= 1.9) { legYaw = clamp(alpha, -1.1, 1.1) * 0.8; const r = alpha - legYaw; fs = Math.cos(r); ls = Math.sin(r); }
    else { const beta = alpha - Math.PI * Math.sign(alpha); legYaw = beta * 0.6; const r = beta - legYaw; fs = -Math.cos(r); ls = -Math.sin(r); }
    legYaw *= moving;
    const baseHip = -1.02 * wc, baseKnee = 1.85 * wc;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const p = ph + (i ? Math.PI : 0);
      const sw = Math.sin(p), cs = Math.cos(p);
      const thx = baseHip - stride * sw * fs;
      const thz = 0.035 + stride * 0.75 * sw * ls * s;
      const kn = baseKnee + kSw * Math.pow(Math.max(0, Math.cos(p - 0.3)), 1.6) * moving + kSt * Math.max(0, -cs) * 0.6 * moving;
      const an = -(thx + kn) * 0.9 - 0.25 * stride * sw * fs;
      setJ(P, i ? J.hipR : J.hipL, thx, 0, thz);
      setJ(P, i ? J.knR : J.knL, kn, 0, 0);
      setJ(P, i ? J.anR : J.anL, an, 0, -thz * 0.6);
      // kollar (karşı bacakla)
      const ax = armA * sw * fs;
      setJ(P, i ? J.shR : J.shL, ax, 0, 0.1 + this.spd * 0.012 + wc * 0.1);
      setJ(P, i ? J.elR : J.elL, elb - 0.25 * armA * Math.max(0, -sw), 0, 0);
      setJ(P, i ? J.wrR : J.wrL, -0.1, 0, 0);
    }
    const ys = Math.sin(ph);
    setJ(P, J.hips, 0, -hYaw * ys * moving + legYaw, roll * Math.cos(ph) * moving);
    setJ(P, J.spine, lean * 0.5 + wc * 0.08, -legYaw * 0.55, 0);
    setJ(P, J.chest, lean * 0.5, hYaw * 1.6 * ys * moving - legYaw * 0.45, -roll * Math.cos(ph) * moving * 0.6);
    setJ(P, J.head, -lean * 0.75 - wc * 0.15, 0, 0);
    P[HP + 2] = -0.06 * wc;
    // boşta: nefes, ağırlık aktarma, etrafa bakma
    const idle = 1 - moving;
    const br = Math.sin(t * 1.7 + this.seed);
    addJ(P, J.chest, 0.014 * br, 0, 0);
    addJ(P, J.shL, 0, 0, 0.012 * br); addJ(P, J.shR, 0, 0, 0.012 * br);
    const sway = Math.sin(t * 0.45 + this.seed) * idle;
    addJ(P, J.hips, 0, 0, 0.03 * sway); addJ(P, J.spine, 0, 0, -0.025 * sway);
    addJ(P, J.hipL, 0, 0, -0.03 * sway); addJ(P, J.hipR, 0, 0, 0.03 * sway);
    P[HP] = 0.015 * sway;
    addJ(P, J.head, 0.04 * Math.sin(t * 0.37 + this.seed * 2) * idle, 0.22 * Math.sin(t * 0.23 + this.seed) * Math.sin(t * 0.11 + this.seed) * idle, 0);
    let lock = 1, hipsY = RIG.hips;

    // ---- 2) havada (kalkış, havada, iniş) ----
    if (W.air > 0.001) {
      Q.set(P);
      const up = clamp((st.vy || 0) / 5, -1, 1);
      const rise = clamp(up * 0.5 + 0.5, 0, 1);
      setJ(Q, J.hipL, -0.95 * rise - 0.35 * (1 - rise), 0, 0.06); setJ(Q, J.knL, 1.35 * rise + 0.45 * (1 - rise), 0, 0); setJ(Q, J.anL, 0.2, 0, 0);
      setJ(Q, J.hipR, 0.2 * rise - 0.25 * (1 - rise), 0, 0.06); setJ(Q, J.knR, 0.55 * rise + 0.35 * (1 - rise), 0, 0); setJ(Q, J.anR, 0.35, 0, 0);
      setJ(Q, J.shL, -0.5 * rise, 0, 0.35 + 0.35 * (1 - rise)); setJ(Q, J.shR, 0.25 * rise, 0, 0.35 + 0.35 * (1 - rise));
      setJ(Q, J.elL, -0.7, 0, 0); setJ(Q, J.elR, -0.5, 0, 0);
      addJ(Q, J.spine, 0.1 * rise, 0, 0);
      mixP(P, Q, W.air);
      lock -= W.air;
    }
    // iniş esnemesi
    if (this.landT < 0.6) {
      const a = this.landK * Math.exp(-this.landT * 7) * Math.min(1, this.landT * 30);
      for (const [h, k, an] of [[J.hipL, J.knL, J.anL], [J.hipR, J.knR, J.anR]]) { addJ(P, h, -0.55 * a, 0, 0); addJ(P, k, 1.1 * a, 0, 0); addJ(P, an, -0.5 * a, 0, 0); }
      addJ(P, J.spine, 0.25 * a, 0, 0); addJ(P, J.shL, 0, 0, 0.25 * a); addJ(P, J.shR, 0, 0, 0.25 * a);
    }

    // ---- 3) silah tutuşu (nişan almıyorken) ----
    const wid = this.weaponMesh ? this.weaponId : null;
    const wdef = wid ? WEAPONS[wid] : null;
    if (wdef && !twoH) {
      Q.set(P);
      if (wid === 'knife') { setJ(Q, J.shR, Q[J.shR * 3] * 0.5 - 0.15, 0, 0.12); setJ(Q, J.elR, -0.75, 0, 0); setJ(Q, J.wrR, -0.9, 0, 0); }
      else if (wid === 'bat') { setJ(Q, J.shR, -0.35, 0, 0.2); setJ(Q, J.elR, -1.75, 0.2, 0); setJ(Q, J.wrR, 0.9, 0, -0.2); }
      else { setJ(Q, J.shR, Q[J.shR * 3] * 0.4 + 0.05, 0, 0.14); setJ(Q, J.elR, -0.4 - this.spd * 0.08, 0, 0); setJ(Q, J.wrR, -0.25, 0, 0); }
      mixP(P, Q, 1, J.shR * 3, J.wrR * 3 + 3);
    }

    // ---- 4) nişan: gövde bükülmesi kameraya göre ----
    const pitch = clamp(st.aimPitch || 0, -1.2, 1.2), yawO = clamp(st.aimYaw || 0, -1.2, 1.2);
    const wa = Math.max(W.aim, W.hold * 0.25);
    if (wa > 0.001) {
      addJ(P, J.spine, -pitch * 0.2 * W.aim, yawO * 0.35 * W.aim, 0);
      addJ(P, J.chest, -pitch * 0.3 * W.aim, yawO * 0.35 * W.aim - (twoH ? 0.38 : 0.12) * W.aim, 0);
      addJ(P, J.head, -pitch * 0.4 * W.aim, yawO * 0.3 * W.aim + (twoH ? 0.36 : 0.1) * W.aim, 0);
    }
    const rec = st.recoil || 0;
    if (rec > 0) { addJ(P, J.chest, -0.05 * rec, 0, 0); addJ(P, J.head, -0.03 * rec, 0, 0); }

    // ---- 5) konuşma, oturma, dans, eller yukarı, yüzme ----
    if (W.talk > 0.01) {
      Q.set(P);
      const a = Math.sin(t * 2.3 + this.seed), b = Math.sin(t * 3.1 + this.seed * 1.7), c = Math.sin(t * 0.7 + this.seed);
      setJ(Q, J.shR, -0.45 + 0.22 * a, 0, 0.22); setJ(Q, J.elR, -1.25 + 0.3 * b, 0.3, 0); setJ(Q, J.wrR, -0.3 + 0.2 * b, 0, 0.3);
      if (c > 0.2) { setJ(Q, J.shL, -0.3 + 0.2 * b, 0, 0.2); setJ(Q, J.elL, -1.1 + 0.2 * a, 0.3, 0); }
      addJ(Q, J.head, 0.07 * Math.sin(t * 4.2 + this.seed), 0.25 * c, 0.05 * a);
      mixP(P, Q, W.talk * (1 - W.aim), J.spine * 3, J.wrR * 3 + 3);
    }
    if (W.sit > 0.01) {
      Q.set(P);
      for (const [h, k, an] of [[J.hipL, J.knL, J.anL], [J.hipR, J.knR, J.anR]]) { setJ(Q, h, -1.5, 0, 0.08); setJ(Q, k, 1.5, 0, 0); setJ(Q, an, 0, 0, 0); }
      setJ(Q, J.hips, 0, 0, 0); setJ(Q, J.spine, -0.06, 0, 0); setJ(Q, J.chest, 0.02 + 0.012 * br, 0, 0);
      if (W.talk < 0.5) { setJ(Q, J.shL, -0.5, 0, 0.12); setJ(Q, J.shR, -0.5, 0, 0.12); setJ(Q, J.elL, -0.85, 0, 0); setJ(Q, J.elR, -0.85, 0, 0); }
      Q[HP] = 0; Q[HP + 2] = 0;
      mixP(P, Q, W.sit);
    }
    if (W.dance > 0.01) {
      Q.set(P);
      const b = Math.abs(Math.sin(t * 6 + this.seed)), s2 = Math.sin(t * 3 + this.seed);
      for (const [h, k, an] of [[J.hipL, J.knL, J.anL], [J.hipR, J.knR, J.anR]]) { setJ(Q, h, -0.2 - 0.25 * b, 0, 0.1); setJ(Q, k, 0.35 + 0.5 * b, 0, 0); setJ(Q, an, -0.15 - 0.25 * b, 0, 0); }
      setJ(Q, J.hips, 0, 0.3 * s2, 0.12 * s2); setJ(Q, J.chest, 0.1, -0.3 * s2, -0.1 * s2);
      setJ(Q, J.shL, -2.4 + 0.5 * Math.sin(t * 6 + this.seed), 0, 0.3); setJ(Q, J.shR, -2.4 - 0.5 * Math.sin(t * 6 + this.seed), 0, 0.3);
      setJ(Q, J.elL, -0.6, 0, 0); setJ(Q, J.elR, -0.6, 0, 0); setJ(Q, J.head, 0.15 * b, 0, 0.1 * s2);
      mixP(P, Q, W.dance);
    }
    if (W.up > 0.01) {
      Q.set(P);
      setJ(Q, J.shL, -0.2, 0, 2.45); setJ(Q, J.shR, -0.2, 0, 2.45); setJ(Q, J.elL, -0.75, 0, 0); setJ(Q, J.elR, -0.75, 0, 0);
      setJ(Q, J.wrL, 0, 0, 0); setJ(Q, J.wrR, 0, 0, 0); addJ(Q, J.head, 0.1, 0, 0);
      mixP(P, Q, W.up, J.shL * 3, J.wrR * 3 + 3);
    }
    if (W.swim > 0.01) {
      Q.fill(0);
      const mv = clamp(this.spd / 1.2, 0, 1);
      const c = t * 3.2 + this.seed;
      const sc = Math.sin(c);
      setJ(Q, J.hips, 1.3 * mv + 0.18 * (1 - mv), 0, 0);
      setJ(Q, J.spine, -0.15 * mv, 0, 0); setJ(Q, J.chest, -0.25 * mv, 0, 0); setJ(Q, J.head, -0.6 * mv, 0, 0);
      // kurbağalama kolları / ayakta su çevirme
      const ax = -2.6 + 0.6 * sc, az = 0.3 + 0.9 * Math.max(0, sc), el = -0.3 - 1.0 * Math.max(0, -sc);
      for (const [sh, e] of [[J.shL, J.elL], [J.shR, J.elR]]) { setJ(Q, sh, ax * mv + (-0.4 + 0.3 * sc) * (1 - mv), 0, az * mv + 0.9 * (1 - mv)); setJ(Q, e, el * mv - 0.6 * (1 - mv), 0, 0); }
      for (const [h, k, an, s] of [[J.hipL, J.knL, J.anL, 1], [J.hipR, J.knR, J.anR, -1]]) {
        const kk = Math.max(0, Math.sin(c + Math.PI / 2));
        setJ(Q, h, -0.6 * kk * mv + (-0.4 + 0.4 * Math.sin(c * 1.3 + s)) * (1 - mv), 0, 0.4 * kk * mv);
        setJ(Q, k, 1.4 * kk * mv + (0.7 + 0.3 * Math.sin(c * 1.3 + s)) * (1 - mv), 0, 0); setJ(Q, an, 0.6, 0, 0);
      }
      mixP(P, Q, W.swim);
      lock -= W.swim;
      hipsY += (-0.55 * (1 - mv) + (0.12 - RIG.hips + 0.95) * mv - 0.95 + RIG.hips) * W.swim;
    }

    // ---- 6) yakın dövüş (yumruk kombosu, bıçak saplama/kesme, sopa) ----
    let meleeW = 0;
    if (this.punchT > 0) {
      this.punchT = Math.max(0, this.punchT - dt);
      const u = 1 - this.punchT / this.meleeDur;
      const e = u < 0.3 ? -0.35 * sm(u / 0.3) : u < 0.55 ? -0.35 + 1.35 * sm((u - 0.3) / 0.25) : 1 - sm((u - 0.55) / 0.45);
      meleeW = Math.sin(Math.PI * clamp(u, 0, 1)) * 1.4; meleeW = clamp(meleeW, 0, 1);
      Q.set(P);
      const k = this.meleeKind;
      if (k === 'R' || k === 'L') {
        const [sh, el, wr, osh, oel] = k === 'R' ? [J.shR, J.elR, J.wrR, J.shL, J.elL] : [J.shL, J.elL, J.wrL, J.shR, J.elR];
        const ee = Math.max(0, e);
        setJ(Q, sh, -0.75 - 0.85 * ee + 0.3 * Math.min(0, e), 0, 0.25 - 0.2 * ee); setJ(Q, el, -1.9 + 1.75 * ee, 0, 0); setJ(Q, wr, 0, 0, 0);
        setJ(Q, osh, -0.9, 0, 0.2); setJ(Q, oel, -2.0, 0, 0);
        const tw = (k === 'R' ? 1 : -1) * (0.55 * e);
        setJ(Q, J.chest, 0.08, tw, 0); setJ(Q, J.spine, 0.05, tw * 0.5, 0); addJ(Q, J.head, 0, -tw * 0.8, 0);
      } else if (k === 'stab') {
        const ee = Math.max(0, e);
        setJ(Q, J.shR, -0.5 - 0.95 * ee, 0, 0.15); setJ(Q, J.elR, -1.6 + 1.45 * ee, 0, 0); setJ(Q, J.wrR, -1.3 + 0.2 * ee, 0, 0);
        setJ(Q, J.chest, 0.15 * ee, 0.4 * e, 0); setJ(Q, J.spine, 0.1 * ee, 0.2 * e, 0); addJ(Q, J.head, 0, -0.3 * e, 0);
      } else {
        const big = k === 'bat' ? 1.4 : 1;
        const sweep = u < 0.3 ? sm(u / 0.3) : 1 - 2 * sm((u - 0.3) / 0.35);
        setJ(Q, J.shR, -1.25, 0, 0.35 + 0.85 * sweep * big); setJ(Q, J.elR, -0.45, 0, 0); setJ(Q, J.wrR, k === 'bat' ? -1.2 : -1.0, 0, 0);
        if (k === 'bat') { setJ(Q, J.shL, -1.1, 0, -0.1 + 0.4 * sweep); setJ(Q, J.elL, -1.2, 0, 0); }
        setJ(Q, J.chest, 0.05, 0.65 * sweep * big, 0); setJ(Q, J.spine, 0.05, 0.3 * sweep * big, 0); addJ(Q, J.head, 0, -0.45 * sweep, 0);
      }
      mixP(P, Q, meleeW, J.spine * 3, J.wrR * 3 + 3);
    }

    // ---- 7) tırmanma (engel aşma) ve takla ----
    if (st.vault > 0) {
      const u = st.vault, s1 = Math.sin(Math.PI * u);
      setJ(P, J.hipL, -1.25 * s1, 0, 0.45 * s1); setJ(P, J.hipR, -1.0 * s1, 0, 0.55 * s1);
      setJ(P, J.knL, 1.8 * s1, 0, 0); setJ(P, J.knR, 1.6 * s1, 0, 0);
      setJ(P, J.shL, -0.75 * s1, 0, 0.1); setJ(P, J.elL, -0.15, 0, 0);
      addJ(P, J.spine, 0.3 * s1, 0, -0.2 * s1); addJ(P, J.hips, 0, 0, -0.25 * s1);
      lock = 0;
    }
    let rollW = 0;
    if (st.roll > 0) {
      const u = st.roll, tuck = Math.sin(Math.PI * u);
      rollW = 1;
      for (const [h, k] of [[J.hipL, J.knL], [J.hipR, J.knR]]) { setJ(P, h, P[h * 3] * (1 - tuck) - 2.0 * tuck, 0, 0.1); setJ(P, k, P[k * 3] * (1 - tuck) + 2.3 * tuck, 0, 0); }
      addJ(P, J.spine, 0.7 * tuck, 0, 0); addJ(P, J.chest, 0.3 * tuck, 0, 0); addJ(P, J.head, 0.6 * tuck, 0, 0);
      setJ(P, J.shL, -1.0 * tuck, 0, 0.2); setJ(P, J.shR, -1.0 * tuck, 0, 0.2); setJ(P, J.elL, -1.3 * tuck, 0, 0); setJ(P, J.elR, -1.3 * tuck, 0, 0);
      P[J.hips * 3] = Math.PI * 2 * sm(u);
      lock = 0; hipsY = RIG.hips - 0.5 * tuck;
    }

    // ---- 8) vuruş sarsılması (yay) ----
    const F = this.fl;
    F.vx += (-140 * F.x - 13 * F.vx) * dt; F.vz += (-140 * F.z - 13 * F.vz) * dt;
    F.x += F.vx * dt; F.z += F.vz * dt;
    if (Math.abs(F.x) + Math.abs(F.z) > 0.002) {
      const m = Math.min(1, Math.hypot(F.x, F.z));
      addJ(P, J.spine, F.z * 0.35, 0, -F.x * 0.3); addJ(P, J.chest, F.z * 0.3, F.x * 0.2, -F.x * 0.25);
      addJ(P, J.head, F.z * 0.5, 0, -F.x * 0.45);
      addJ(P, J.shL, -0.2 * m, 0, 0.35 * m); addJ(P, J.shR, -0.2 * m, 0, 0.35 * m);
    }

    // ---- uygula ----
    this.apply(P, clamp(lock, 0, 1), hipsY);
    // ---- 9) kol IK: silah tutuşu / nişan / şarjör değiştirme ----
    const block = Math.max(W.swim, W.up, W.sit * (1 - W.aim), W.dance, meleeW, rollW, st.vault > 0 ? 1 : 0);
    const gunW = wdef && wdef.type !== 'melee' ? 1 - block : 0;
    if (gunW > 0.01) this.solveWeaponIK(st, wid, wdef, twoH, gunW, pitch, yawO, rec);
    this.setFist(1, !!this.weaponMesh || meleeW > 0.2 && this.meleeKind === 'R');
    this.setFist(0, (twoH && gunW > 0.5) || meleeW > 0.2 && (this.meleeKind === 'L' || this.meleeKind === 'R'));
  }

  // pozu kemiklere yaz; kalça yüksekliği bacaklardan hesaplanır (ayak yere basar)
  apply(P, lock, hipsY = RIG.hips) {
    const J3 = this.joints;
    for (let j = 0; j < NJ; j++) {
      const s = SIDE[j] || 1;
      J3[j].rotation.set(P[j * 3], P[j * 3 + 1] * s, P[j * 3 + 2] * s);
    }
    let y = hipsY + P[HP + 1];
    if (lock > 0) {
      const h = (a, k, z) => (LEN_T * Math.cos(a) + LEN_S * Math.cos(a + k)) * Math.cos(z);
      const hl = h(P[J.hipL * 3], P[J.knL * 3], P[J.hipL * 3 + 2]), hr = h(P[J.hipR * 3], P[J.knR * 3], P[J.hipR * 3 + 2]);
      const auto = RIG.hips - (LEN_T + LEN_S) + Math.max(hl, hr);
      y += (auto - RIG.hips) * lock;
    }
    this.hips.position.set(P[HP], y, P[HP + 2]);
  }

  poseDeath(P, T) {
    const d = this.deathDir || { x: 0, z: -1 };
    const fx = d.x, fz = d.z;
    const buckle = sm(T / 0.25);
    const fu = clamp((T - 0.1) / 0.55, 0, 1);
    let th = (Math.PI / 2) * fu * fu;
    if (fu >= 1) { const tb = T - 0.65; th -= 0.1 * Math.exp(-tb * 7) * Math.abs(Math.sin(tb * 14)); }
    const settle = sm((T - 0.35) / 0.7);
    // dinlenme pozu: sırtüstü / yüzüstü / yan
    const Q = this.Q; Q.fill(0);
    const wb = Math.max(0, -fz), wf = Math.max(0, fz), ws = Math.abs(fx);
    const tot = wb + wf + ws || 1;
    const b = wb / tot, f = wf / tot, s = ws / tot;
    const sg = this.seed % 2 > 1 ? 1 : -1;
    setJ(Q, J.shL, -0.3 * b - 0.6 * f - 1.0 * s, 0, 1.3 * b + 1.0 * f + 0.4 * s); setJ(Q, J.shR, -0.3 * b - 0.4 * f - 0.6 * s, 0, 1.1 * b + 0.6 * f + 0.2 * s);
    setJ(Q, J.elL, -0.5 * b - 1.2 * f - 0.6 * s, 0, 0); setJ(Q, J.elR, -0.3 * b - 0.4 * f - 0.9 * s, 0, 0);
    setJ(Q, J.hipL, -0.05 * b - 0.5 * s, 0, 0.14 * b + 0.1 * f); setJ(Q, J.hipR, -0.35 * b - 0.2 * s, 0, 0.1);
    setJ(Q, J.knL, 0.15 * b + 0.9 * s + 0.1 * f, 0, 0); setJ(Q, J.knR, 0.7 * b + 0.5 * s + 0.4 * f, 0, 0);
    setJ(Q, J.anL, 0.3 + 0.4 * f, 0, 0); setJ(Q, J.anR, 0.3 + 0.4 * f, 0, 0);
    setJ(Q, J.head, -0.15 * b + 0.1 * f, 0.75 * sg * (b + f), 0.3 * s);
    setJ(Q, J.spine, 0.2 * s, 0, 0);
    for (let i = 0; i < HP; i++) P[i] = this.D0[i] + (Q[i] - this.D0[i]) * clamp(settle + 0.08 * Math.sin(settle * Math.PI) * Math.sin(T * 9), 0, 1.05);
    // çökme: dizler bükülür
    const crumple = buckle * (1 - fu);
    addJ(P, J.knL, 0.8 * crumple, 0, 0); addJ(P, J.knR, 0.8 * crumple, 0, 0); addJ(P, J.hipL, -0.4 * crumple, 0, 0); addJ(P, J.hipR, -0.4 * crumple, 0, 0);
    addJ(P, J.spine, 0.3 * crumple * (f - b), 0, 0); addJ(P, J.head, 0.4 * crumple * (f - b), 0, 0);
    // devrilme: ayaklar etrafında dönme
    P[J.hips * 3] = th * fz; P[J.hips * 3 + 1] = 0; P[J.hips * 3 + 2] = -th * fx;
    const H = 0.82 - 0.2 * crumple;
    P[HP] = fx * H * Math.sin(th); P[HP + 2] = fz * H * Math.sin(th);
    P[HP + 1] = 0.13 + H * Math.cos(th) - RIG.hips;
  }

  // İki kemikli analitik IK (dünya uzayı)
  solveArm(arm, T, pole, qWrist, w) {
    const S = arm.sh.getWorldPosition(IK.S), E0 = arm.el.getWorldPosition(IK.E), W0 = arm.wr.getWorldPosition(IK.W);
    const L1 = S.distanceTo(E0), L2 = E0.distanceTo(W0);
    const dir = IK.d.subVectors(T, S); let d = dir.length(); dir.divideScalar(d || 1);
    d = clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
    const A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const bv = IK.b.subVectors(pole, S); bv.addScaledVector(dir, -bv.dot(dir));
    if (bv.lengthSq() < 1e-8) bv.set(0, -1, 0); bv.normalize();
    const u = IK.u.copy(dir).multiplyScalar(Math.cos(A)).addScaledVector(bv, Math.sin(A)).normalize();
    const elb = IK.e.copy(S).addScaledVector(u, L1);
    const fdir = IK.f.copy(S).addScaledVector(dir, d).sub(elb).normalize();
    const bend = Math.acos(clamp(u.dot(fdir), -1, 1));
    // omuz yönelimi: Y = -üst kol, Z = önkolun büküldüğü yön
    const Y = IK.y.copy(u).negate();
    const Z = IK.z.copy(fdir).addScaledVector(u, -fdir.dot(u));
    if (Z.lengthSq() < 1e-8) Z.copy(bv); Z.normalize();
    const X = IK.x.crossVectors(Y, Z);
    IK.m.makeBasis(X, Y, Z); IK.qw.setFromRotationMatrix(IK.m);
    arm.sh.parent.getWorldQuaternion(IK.q1);
    IK.q2.copy(IK.q1).invert().multiply(IK.qw);
    arm.sh.quaternion.slerp(IK.q2, w);
    IK.q3.setFromEuler(_eu.set(-bend, 0, 0));
    arm.el.quaternion.slerp(IK.q3, w);
    if (qWrist) {
      IK.q4.copy(IK.q1).multiply(arm.sh.quaternion).multiply(arm.el.quaternion).invert().multiply(qWrist);
      arm.wr.quaternion.slerp(IK.q4, w);
    }
  }

  solveWeaponIK(st, wid, wdef, twoH, gunW, pitch, yawO, rec) {
    const W = this.w, V = WV;
    this.root.updateMatrixWorld(true);
    const ry = this.root.rotation.y, h = ry + yawO * W.aim;
    const aimP = wid === 'rpg' ? Math.max(pitch, -0.2) : pitch;
    const aimDir = V.aim.set(Math.sin(h) * Math.cos(aimP), Math.sin(aimP), Math.cos(h) * Math.cos(aimP));
    if (rec > 0) aimDir.y += rec * 0.18;
    const fwd = V.fwd.set(Math.sin(ry), 0, Math.cos(ry));
    const right = V.right.crossVectors(fwd, UPV).normalize();
    const reload = clamp(st.reload || 0, 0, 1), rw = W.reload * Math.sin(Math.PI * reload);
    const aimK = wid === 'rpg' ? 1 : W.aim;
    // alçak hazır tutuş yönü -> nişan yönü
    const dir = V.dir.copy(fwd).multiplyScalar(0.72).addScaledVector(UPV, -0.55).addScaledVector(right, -0.3).normalize().lerp(aimDir, aimK).normalize();
    if (rw > 0) dir.addScaledVector(UPV, -0.5 * rw).addScaledVector(right, -0.25 * rw).normalize();
    const R = V.R.crossVectors(dir, UPV).normalize();
    const U = V.U.crossVectors(R, dir).normalize();
    const eye = this.head.localToWorld(V.eye.set(0, 0.125, 0.06));
    const shR = this.arms[1].sh.getWorldPosition(V.shR);
    const G = V.G;
    if (twoH) {
      if (wid === 'rpg') G.copy(eye).addScaledVector(dir, 0.1).addScaledVector(R, 0.13).addScaledVector(U, -0.11);
      else G.copy(eye).addScaledVector(dir, 0.24).addScaledVector(R, 0.07).addScaledVector(U, -0.13);
      if (aimK < 1) { V.t.copy(shR).addScaledVector(UPV, -0.24).addScaledVector(fwd, 0.2).addScaledVector(right, 0.03); G.lerp(V.t, 1 - aimK); }
    } else {
      G.copy(eye).addScaledVector(dir, wid === 'uzi' ? 0.44 : 0.47).addScaledVector(R, wid === 'uzi' ? 0.11 : 0.025).addScaledVector(U, -0.1);
      if (rw > 0) { V.t.copy(eye).addScaledVector(fwd, 0.32).addScaledVector(UPV, -0.22).addScaledVector(right, 0.06); G.lerp(V.t, rw); }
    }
    if (rec > 0) G.addScaledVector(dir, -0.05 * rec).addScaledVector(U, 0.03 * rec);
    // sağ bilek: namlu = dir, silah üstü = U
    V.y.copy(dir).negate(); V.x.crossVectors(V.y, U);
    IK.m.makeBasis(V.x, V.y, U); V.qR.setFromRotationMatrix(IK.m);
    V.wT.copy(G).addScaledVector(dir, -0.072 * this.body.scale.x);
    const rightW = twoH ? gunW : gunW * Math.max(W.aim, rw);
    V.pole.copy(shR).addScaledVector(UPV, -1).addScaledVector(R, 0.7).addScaledVector(dir, -0.4);
    if (rightW > 0.01) this.solveArm(this.arms[1], V.wT, V.pole, V.qR, rightW);
    // sol el: ön kabza / tabanca desteği / şarjör
    let leftW = 0;
    const F = V.F;
    if (twoH) {
      const off = { shotgun: 0.33, sniper: 0.32, ak: 0.27, m4: 0.28, rpg: 0.24 }[wid] || 0.27;
      F.copy(G).addScaledVector(dir, off).addScaledVector(U, -0.025);
      leftW = gunW;
    } else if (wid !== 'uzi' && wid !== 'grenade') {
      F.copy(G).addScaledVector(dir, -0.03).addScaledVector(U, -0.035).addScaledVector(R, -0.015);
      leftW = gunW * W.aim;
    }
    if (rw > 0) {
      const mag = V.mag.copy(G).addScaledVector(dir, twoH ? 0.1 : 0).addScaledVector(U, -0.13);
      const belt = this.hips.localToWorld(V.belt.set(0.14, 0.02, 0.1));
      const a = reload < 0.3 ? [F, mag, reload / 0.3] : reload < 0.55 ? [mag, belt, (reload - 0.3) / 0.25] : reload < 0.8 ? [belt, mag, (reload - 0.55) / 0.25] : [mag, F, (reload - 0.8) / 0.2];
      V.t.copy(a[0]).lerp(a[1], sm(a[2])); F.copy(V.t);
      leftW = Math.max(leftW, gunW * W.reload);
    }
    if (leftW > 0.01) {
      const shL = this.arms[0].sh.getWorldPosition(V.shL);
      V.pole.copy(shL).addScaledVector(UPV, -1).addScaledVector(R, -0.25).addScaledVector(dir, -0.3);
      // avuç yukarı/sağa, parmaklar silahı sarar
      const Xl = V.x.copy(R).multiplyScalar(twoH ? 0.35 : 0.75).addScaledVector(U, twoH ? 0.9 : 0.5).normalize().negate();
      const Yl = V.y.copy(R).multiplyScalar(-0.8).addScaledVector(dir, -0.3);
      Yl.addScaledVector(Xl, -Yl.dot(Xl)).normalize();
      const Zl = V.z.crossVectors(Xl, Yl);
      IK.m.makeBasis(Xl, Yl, Zl); V.qL.setFromRotationMatrix(IK.m);
      V.wT.copy(F).addScaledVector(Yl, 0.06 * this.body.scale.x);
      this.solveArm(this.arms[0], V.wT, V.pole, V.qL, leftW);
    }
  }
}
