// Tekneler: oyuncunun kullanabildiği sürat teknesi, yat ve balıkçı teknesi. Su üstünde kaldırma (yalpa/baş kalkması),
// köpük izi, karaya/köprüye çarpma. Ayrıca gemiler için ortak gövde üreticisi ve köpük izi sistemi.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Vehicle, colorize, lightize, prep, bx, rbx, cyl, beam, darkMat, chromeMat, glassMat, paintMat, makeLightsMat } from './vehicles.js';
import { isLand, WATER_Y } from '../world/map.js';
import { clamp } from '../core/util.js';
import { audio } from '../core/audio.js';
import { makeCanvas } from '../core/textures.js';

// Mağaza kaydı (fiyat, istatistik, kurucu)
export const BOAT_TYPES = {
  surat: { name: 'Sürat Teknesi', price: 120000, maxSpeed: 32, accel: 9, len: 6.6, wid: 2.3, hei: 1.6, hp: 900, turn: 1.3, colors: ['#e8e8e8', '#c81010', '#111111', '#1d3d8e'], style: 'speedboat', draft: 0.25 },
  balikci: { name: 'Balıkçı Teknesi', price: 25000, maxSpeed: 11, accel: 3, len: 8, wid: 2.8, hei: 3.2, hp: 1200, turn: 0.8, colors: ['#2a6ab0', '#e8e8e8', '#2d7a4a'], style: 'fishing', draft: 0.5 },
  yat: { name: 'Lüks Yat', price: 1200000, maxSpeed: 18, accel: 3.5, len: 16, wid: 4.6, hei: 4.4, hp: 3000, turn: 0.55, colors: ['#f4f4f4', '#1a1a1a'], style: 'yacht', draft: 0.7 },
};

// ---------------- Köpük izi (örneklemeli, toplamalı) ----------------
export class Wakes {
  constructor(scene, max = 900) {
    this.max = max; this.i = 0;
    const c = makeCanvas(64, 64); const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.0)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.75)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    this.x = new Float32Array(max); this.z = new Float32Array(max); this.s = new Float32Array(max); this.gr = new Float32Array(max);
    this.life = new Float32Array(max); this.ml = new Float32Array(max); this.a = new Float32Array(max);
    this.m = new THREE.Matrix4(); this.col = new THREE.Color();
    const z0 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < max; k++) { this.mesh.setMatrixAt(k, z0); this.mesh.setColorAt(k, this.col.setRGB(0, 0, 0)); }
    scene.add(this.mesh);
  }
  spawn(x, z, size, grow, life, alpha = 0.6) {
    const k = this.i; this.i = (this.i + 1) % this.max;
    this.x[k] = x; this.z[k] = z; this.s[k] = size; this.gr[k] = grow; this.life[k] = life; this.ml[k] = life; this.a[k] = alpha;
  }
  update(dt) {
    const e = this.m.elements;
    let any = false;
    for (let k = 0; k < this.max; k++) {
      if (this.life[k] <= 0) { if (this.a[k] > 0) { this.a[k] = 0; this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(k, this.m); any = true; } continue; }
      this.life[k] -= dt; this.s[k] += this.gr[k] * dt;
      const sc = this.s[k];
      this.m.identity(); e[0] = sc; e[10] = sc; e[12] = this.x[k]; e[13] = WATER_Y + 0.05; e[14] = this.z[k];
      this.mesh.setMatrixAt(k, this.m);
      const f = Math.max(0, this.life[k] / this.ml[k]) * this.a[k];
      this.mesh.setColorAt(k, this.col.setRGB(f, f, f));
      any = true;
    }
    if (any) { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  }
}

// ---------------- Gövde üretici (gemiler de kullanır) ----------------
// L uzunluk, B genişlik, D su altı derinliği, Hd güverte yüksekliği (su hattından); bow: pruva sivriliği
export function hullGeometry(L, B, D, Hd, { bow = 0.28, stern = 0.9, colTop = 0xf0f0f0, colBottom = 0x8a1a1a, stripe = 0x111111 } = {}) {
  const nL = 24, nC = 10;
  const pos = [], col = [], idx = [];
  const cT = new THREE.Color(colTop), cB = new THREE.Color(colBottom), cS = new THREE.Color(stripe);
  for (let i = 0; i <= nL; i++) {
    const u = i / nL; // 0 kıç, 1 pruva
    const z = -L / 2 + u * L;
    let w;
    if (u > 1 - bow) { const t = (u - (1 - bow)) / bow; w = Math.sqrt(Math.max(0, 1 - t * t)) * 0.98 + 0.02; }
    else w = stern + (1 - stern) * Math.min(1, u / 0.25);
    const sheer = Hd + (u > 0.7 ? (u - 0.7) * 0.9 : 0);
    for (let j = 0; j <= nC; j++) {
      const v = j / nC; // 0 sol güverte kenarı → 0.5 omurga → 1 sağ
      const a = (v - 0.5) * Math.PI;
      const sx = Math.sin(a) * (B / 2) * w;
      let y = -Math.cos(a) * D * (0.35 + 0.65 * w);
      if (Math.abs(v - 0.5) > 0.42) y = sheer * ((Math.abs(v - 0.5) - 0.42) / 0.08) + y * (1 - (Math.abs(v - 0.5) - 0.42) / 0.08);
      pos.push(-sx, y, z);
      const c = y < -0.05 ? cB : y < 0.18 ? cS : cT;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < nL; i++) for (let j = 0; j < nC; j++) {
    const a = i * (nC + 1) + j, b = a + 1, c = a + nC + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // ayna (kıç) kapağı
  const base = pos.length / 3;
  for (let j = 0; j <= nC; j++) { pos.push(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]); col.push(cT.r, cT.g, cT.b); }
  pos.push(0, Hd * 0.5, -L / 2); col.push(cT.r, cT.g, cT.b);
  const cen = base + nC + 1;
  for (let j = 0; j < nC; j++) idx.push(base + j, base + j + 1, cen);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const uv = new Float32Array((pos.length / 3) * 2); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// güverte düzlemi (gövde planı)
export function deckGeometry(L, B, Hd, bow = 0.28, stern = 0.9) {
  const s = new THREE.Shape();
  const N = 16;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N; const z = -L / 2 + u * L;
    let w;
    if (u > 1 - bow) { const t = (u - (1 - bow)) / bow; w = Math.sqrt(Math.max(0, 1 - t * t)) * 0.98 + 0.02; } else w = stern + (1 - stern) * Math.min(1, u / 0.25);
    pts.push([z, (B / 2) * w * 0.97]);
  }
  s.moveTo(pts[0][1], pts[0][0]);
  for (const p of pts) s.lineTo(p[1], p[0]);
  for (let i = pts.length - 1; i >= 0; i--) s.lineTo(-pts[i][1], pts[i][0]);
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(Math.PI / 2); // (x, y) → (x, 0, z=y); normal aşağı döner, sarım çevrilir
  g.translate(0, Hd - 0.02, 0);
  const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 });
const teakMat = new THREE.MeshStandardMaterial({ color: 0xa87a4a, roughness: 0.8 });

const boatGeoCache = new Map();
function boatParts(type) {
  if (boatGeoCache.has(type)) return boatGeoCache.get(type);
  const d = BOAT_TYPES[type];
  const L = d.len, B = d.wid;
  const dark = [], chrome = [], glass = [], lights = [], paint = [];
  let hull, deck, driver;
  if (d.style === 'speedboat') {
    hull = hullGeometry(L, B, 0.55, 0.55, { bow: 0.42, stern: 0.92, colTop: 0xf4f4f4, colBottom: 0xf4f4f4, stripe: 0x1d3d8e });
    deck = deckGeometry(L, B, 0.55, 0.42, 0.92);
    paint.push(prep(rbx(B * 0.8, 0.25, 1.6, 0.1, 0, 0.62, 0.6)));
    glass.push(prep(beam(0, 0.72, 1.4, 0, 1.15, 0.85, 0.02, B * 0.75)));
    dark.push(colorize(rbx(0.5, 0.4, 0.5, 0.1, 0.45, 0.75, -0.2), 0xe8e0d0), colorize(rbx(0.5, 0.4, 0.5, 0.1, -0.45, 0.75, -0.2), 0xe8e0d0));
    dark.push(colorize(rbx(B * 0.8, 0.35, 0.8, 0.1, 0, 0.72, -1.6), 0xe8e0d0));
    dark.push(colorize(new THREE.TorusGeometry(0.16, 0.02, 6, 16).rotateX(-0.6).translate(0.45, 1.0, 0.35), 0x111111));
    dark.push(colorize(rbx(0.5, 0.7, 0.45, 0.08, 0, 0.2, -L / 2 - 0.15), 0x1a1a1a));
    chrome.push(prep(beam(-B * 0.42, 0.95, -0.6, -B * 0.42, 0.95, 1.8, 0.03, 0.03, true)), prep(beam(B * 0.42, 0.95, -0.6, B * 0.42, 0.95, 1.8, 0.03, 0.03, true)));
    driver = [0.45, 0.6, -0.1];
  } else if (d.style === 'fishing') {
    hull = hullGeometry(L, B, 0.7, 0.9, { bow: 0.3, stern: 0.75, colTop: 0x2a6ab0, colBottom: 0x8a1a1a, stripe: 0xf0f0f0 });
    deck = deckGeometry(L, B, 0.9, 0.3, 0.75);
    paint.push(prep(rbx(1.6, 1.5, 1.6, 0.06, 0, 1.6, -1.2)));
    dark.push(colorize(bx(1.8, 0.1, 1.8, 0, 2.4, -1.2), 0xc81010));
    glass.push(prep(bx(1.62, 0.5, 0.02, 0, 1.9, -0.39)), prep(bx(0.02, 0.5, 1.2, 0.81, 1.9, -1.2)), prep(bx(0.02, 0.5, 1.2, -0.81, 1.9, -1.2)));
    dark.push(colorize(cyl(0.05, 0.05, 4, 6, 'y', 0, 2.9, 1.2), 0x6a4a2a));
    dark.push(colorize(beam(0, 4.5, 1.2, 0, 1.2, 3.2, 0.03, 0.03, true), 0x333333));
    dark.push(colorize(rbx(1.6, 0.4, 1.2, 0.2, 0, 1.1, 1.8), 0x3a6a3a));
    for (let i = 0; i < 6; i++) dark.push(colorize(new THREE.SphereGeometry(0.12, 8, 6).translate(-B / 2 + 0.1, 1.0, -2 + i * 0.7), 0xff7a10));
    driver = [0, 1.0, -1.2];
  } else {
    hull = hullGeometry(L, B, 0.9, 1.3, { bow: 0.32, stern: 0.95, colTop: 0xf6f6f6, colBottom: 0x1a2a3a, stripe: 0x1a1a1a });
    deck = deckGeometry(L, B, 1.3, 0.32, 0.95);
    paint.push(prep(rbx(B * 0.82, 1.5, L * 0.5, 0.25, 0, 2.0, -L * 0.05)));
    paint.push(prep(rbx(B * 0.7, 1.0, L * 0.3, 0.2, 0, 3.1, -L * 0.1)));
    paint.push(prep(bx(B * 0.74, 0.06, L * 0.42, 0, 3.66, -L * 0.14)));
    glass.push(prep(beam(0, 1.4, L * 0.2 + 0.05, 0, 2.6, L * 0.17, 0.02, B * 0.78)));
    for (const s of [1, -1]) {
      glass.push(prep(bx(0.02, 0.5, L * 0.38, s * B * 0.411, 2.1, -L * 0.06)));
      glass.push(prep(bx(0.02, 0.45, L * 0.22, s * B * 0.351, 3.15, -L * 0.1)));
      chrome.push(prep(beam(s * B * 0.46, 1.95, -L * 0.45, s * B * 0.4, 1.95, L * 0.4, 0.03, 0.03, true)));
    }
    chrome.push(prep(cyl(0.05, 0.05, 1.6, 6, 'y', 0, 4.4, -L * 0.15)));
    dark.push(colorize(rbx(B * 0.6, 0.15, L * 0.16, 0.06, 0, 1.4, -L * 0.42), 0xe0d8c8));
    dark.push(colorize(new THREE.TorusGeometry(0.2, 0.025, 6, 16).rotateX(-0.6).translate(0.6, 3.3, L * 0.02), 0x111111));
    driver = [0.6, 2.75, -L * 0.04];
  }
  // seyir fenerleri: sol (+x) kırmızı, sağ (-x) yeşil, direk beyaz
  lights.push(lightize(new THREE.SphereGeometry(0.07, 8, 6).translate(B * 0.45, d.style === 'yacht' ? 2.2 : 0.95, L * 0.2), 0x501010, 0xff2020, 0));
  lights.push(lightize(new THREE.SphereGeometry(0.07, 8, 6).translate(-B * 0.45, d.style === 'yacht' ? 2.2 : 0.95, L * 0.2), 0x105010, 0x20ff40, 0));
  lights.push(lightize(new THREE.SphereGeometry(0.08, 8, 6).translate(0, d.style === 'yacht' ? 5.2 : d.style === 'fishing' ? 4.9 : 1.3, d.style === 'fishing' ? 1.2 : d.style === 'yacht' ? -L * 0.15 : 0.6), 0xdddddd, 0xffffff, 0));
  lights.push(lightize(new THREE.SphereGeometry(0.07, 8, 6).translate(0, d.style === 'yacht' ? 1.5 : 0.8, -L / 2 + 0.1), 0xdddddd, 0xffffff, 1));
  const P = {
    hull, deck, driver,
    paint: paint.length ? mergeGeometries(paint) : null,
    dark: dark.length ? mergeGeometries(dark) : null,
    chrome: chrome.length ? mergeGeometries(chrome) : null,
    glass: glass.length ? mergeGeometries(glass) : null,
    lights: mergeGeometries(lights),
  };
  boatGeoCache.set(type, P);
  return P;
}

export function buildBoatModel(type, color) {
  const d = BOAT_TYPES[type];
  const P = boatParts(type);
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const chassis = new THREE.Group(); root.add(chassis);
  const hull = new THREE.Mesh(P.hull, hullMat); hull.castShadow = true; chassis.add(hull);
  chassis.add(new THREE.Mesh(P.deck, d.style === 'fishing' ? teakMat : teakMat));
  const body = new THREE.Mesh(P.paint, paintMat(color || d.colors[0])); body.castShadow = true; chassis.add(body);
  if (P.dark) chassis.add(new THREE.Mesh(P.dark, darkMat));
  if (P.chrome) chassis.add(new THREE.Mesh(P.chrome, chromeMat));
  let gm = null; if (P.glass) { gm = new THREE.Mesh(P.glass, glassMat); chassis.add(gm); }
  const lm = makeLightsMat(); chassis.add(new THREE.Mesh(P.lights, lm));
  const drv = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.25).translate(0, 0.3, 0), darkMat);
  colorize(drv.geometry, 0x333333);
  drv.position.set(P.driver[0], P.driver[1], P.driver[2]); drv.visible = false; chassis.add(drv);
  const pool = new THREE.Object3D(); pool.visible = false;
  Object.assign(root.userData, { bodyMesh: body, glassMesh: gm, chassis, wheels: [], wheelR: 1, lights: lm.userData, lightsMat: lm, driverDummy: drv, driverTorso: drv, pool, siren: false });
  return root;
}

// ---------------- Tekne ----------------
export class Boat extends Vehicle {
  constructor(game, type, x, z, heading, color) {
    const def = BOAT_TYPES[type];
    super(game, type, x, z, heading, color, { def, kind: 'boat', mesh: buildBoatModel(type, color || def.colors[0]) });
    this.external = true;
    this.pos.y = WATER_Y;
    this.phase = Math.random() * 10;
    this.wakeT = 0;
    this.radius = def.wid * 0.5;
  }
  update(dt) {
    const g = this.game, d = this.def, ud = this.mesh.userData;
    this.updateFire(dt);
    const c = this.controls;
    const live = !this.destroyed && this.driver;
    const thr = live ? c.throttle : 0, st = live ? c.steer : 0;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let fs = this.vx * fx + this.vz * fz, ls = this.vx * -fz + this.vz * fx;
    const fs0 = fs;
    fs += d.accel * thr * (thr < 0 ? 0.45 : 1) * dt;
    fs -= fs * Math.abs(fs) * (d.accel / (d.maxSpeed * d.maxSpeed)) * dt + fs * 0.12 * dt;
    ls *= Math.exp(-2.6 * dt);
    const yawT = st * d.turn * clamp(Math.abs(fs) / 8, 0.18, 1) * (fs < -0.3 ? -1 : 1);
    this.yawRate += (yawT - this.yawRate) * Math.min(1, dt * 3);
    this.heading += this.yawRate * dt;
    this.vx = fx * fs - fz * ls; this.vz = fz * fs + fx * ls;
    this.fs = fs; this.ls = ls;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vx * dt; this.pos.z += this.vz * dt;
    // karaya / köprüye / adaya çarpma (gövde uç noktaları)
    const hl = d.len * 0.48, hw = d.wid * 0.48;
    const f2x = Math.sin(this.heading), f2z = Math.cos(this.heading);
    let hit = false;
    for (const [a, b] of [[hl, 0], [-hl, 0], [hl * 0.4, hw], [hl * 0.4, -hw], [-hl * 0.6, hw], [-hl * 0.6, -hw]]) {
      if (isLand(this.pos.x + f2x * a - f2z * b, this.pos.z + f2z * a + f2x * b)) { hit = true; break; }
    }
    if (hit) {
      this.pos.x = ox; this.pos.z = oz;
      const imp = Math.abs(fs);
      this.vx *= -0.3; this.vz *= -0.3;
      if (imp > 5) {
        this.damage(imp * imp * 1.2, null);
        audio.crash(this.pos.x, this.pos.z, Math.min(1.5, imp / 15));
        g.particles.splash({ x: this.pos.x + f2x * hl, y: WATER_Y, z: this.pos.z + f2z * hl });
        if (this.driver && this.driver.isPlayer) g.cameraShake(Math.min(0.6, imp / 25));
      }
    }
    // kaldırma: dalga yalpası, hızla baş kalkması (planing)
    const t = (this.phase += dt);
    const sp = Math.abs(fs) / d.maxSpeed;
    const accel = (fs - fs0) / Math.max(dt, 1e-3);
    if (this.destroyed) { this.sinking += dt; }
    const sinkY = this.destroyed ? Math.min(6, this.sinking * 0.5) : 0;
    this.pos.y = WATER_Y + Math.sin(t * 1.6) * 0.06 * (8 / d.len + 0.3) + sp * 0.18 - sinkY;
    this.pitch += ((-sp * 0.12 - accel * 0.006 + Math.sin(t * 1.3) * 0.025) - this.pitch) * Math.min(1, dt * 3);
    this.roll += ((this.yawRate * fs * 0.012 + Math.sin(t * 1.1 + 1) * 0.03) - this.roll) * Math.min(1, dt * 3);
    ud.chassis.rotation.x = this.pitch; ud.chassis.rotation.z = this.roll;
    // iz
    this.wakeT -= dt;
    if (this.wakeT <= 0 && Math.abs(fs) > 1.2 && g.boats && g.boats.wakes) {
      this.wakeT = 0.07;
      const W = g.boats.wakes, k = Math.abs(fs);
      W.spawn(this.pos.x - f2x * hl, this.pos.z - f2z * hl, d.wid * 0.7, 1.2 + k * 0.08, 2.5 + k * 0.05, Math.min(0.8, 0.25 + k * 0.03));
      W.spawn(this.pos.x + f2x * hl * 0.7 - f2z * hw, this.pos.z + f2z * hl * 0.7 + f2x * hw, 0.8, 1.5, 1.4, Math.min(0.5, k * 0.02));
      W.spawn(this.pos.x + f2x * hl * 0.7 + f2z * hw, this.pos.z + f2z * hl * 0.7 - f2x * hw, 0.8, 1.5, 1.4, Math.min(0.5, k * 0.02));
      if (k > 14 && Math.random() < 0.3) g.particles.splash({ x: this.pos.x - f2x * hl, y: WATER_Y + 0.1, z: this.pos.z - f2z * hl });
    }
    // ışıklar
    const night = g.env ? g.env.nightFactor : 0;
    const on = !!this.driver && !this.destroyed;
    ud.lights.uA.value.set(0.4 + night * 3, (on ? 0.4 : 0.1) + night * 2, 0, 0);
    if (this.driver && this.driver.isPlayer) {
      const rpm = 0.25 + Math.abs(thr) * 0.35 + sp * 0.7;
      if (g.audio && g.audio.setEngine) g.audio.setEngine(!this.destroyed, rpm, 0.1 + Math.abs(thr) * 0.06);
      if (g.input && g.input.hit('KeyH') && this.def.style !== 'speedboat') g.boats.horn(this.pos.x, this.pos.z, 0.6);
    }
    ud.driverDummy.visible = !!this.driver;
    if (this.destroyed && this.sinking > 12) this.wreckT = 0;
    this.sync();
  }
  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.heading, 0);
  }
}

// ---------------- Yönetici ----------------
export class BoatManager {
  constructor(game) {
    this.game = game;
    this.wakes = new Wakes(game.scene);
  }
  get list() { return this.game.vehicles.list.filter((v) => v.kind === 'boat'); }
  add(type, x, z, heading = 0, color) {
    const v = new Boat(this.game, type, x, z, heading, color);
    this.game.vehicles.addVehicle(v);
    return v;
  }
  remove(v) { this.game.vehicles.remove(v); }
  nearestEnterable(x, z, maxD = 3) {
    let best = null, bd = maxD;
    for (const v of this.game.vehicles.list) {
      if (v.kind !== 'boat' || v.destroyed) continue;
      const d = Math.hypot(v.pos.x - x, v.pos.z - z) - v.def.len * 0.5;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  horn(x, z, k = 1) {
    const a = this.game.audio || audio;
    if (!a || !a.tone) return;
    a.tone({ freq: 110 / k, dur: 1.6, type: 'sawtooth', gain: 0.22, x, z, range: 600 });
    a.tone({ freq: 165 / k, dur: 1.6, type: 'sawtooth', gain: 0.14, x, z, range: 600 });
  }
  update(dt) {
    const L = this.game.vehicles.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const v = L[i];
      if (v.kind !== 'boat') continue;
      v.update(dt);
      if (v.destroyed && v.sinking > 14) this.game.vehicles.remove(v);
    }
    this.wakes.update(dt);
  }
}

// Kıyıya en yakın su noktası (mağaza teslimatı için): verilen noktadan dışa doğru tarar
export function nearestWaterSpot(x, z, margin = 6) {
  for (let r = 4; r < 400; r += 4) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      let ok = true;
      for (let m = 0; m < 8 && ok; m++) { const b = (m / 8) * Math.PI * 2; if (isLand(px + Math.cos(b) * margin, pz + Math.sin(b) * margin)) ok = false; }
      if (ok && !isLand(px, pz)) return { x: px, z: pz, heading: Math.atan2(px - x, pz - z) };
    }
  }
  return null;
}
