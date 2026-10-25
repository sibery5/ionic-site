// Araçlar: modeller, arcade sürüş fiziği, hasar/yangın/patlama, trafik ve polis yapay zekâsı.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CARS } from '../game/economy.js';
import { clamp, angleDiff, rng } from '../core/util.js';
import { decalTexture, signTexture } from '../core/textures.js';
import { audio } from '../core/audio.js';

const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a232c, metalness: 0.9, roughness: 0.08 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.15 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, metalness: 0.9, roughness: 0.3 });
const burntMat = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xc99572, roughness: 0.6 });
const bodyMats = new Map();
function bodyMat(c) {
  if (!bodyMats.has(c)) bodyMats.set(c, new THREE.MeshStandardMaterial({ color: c, metalness: 0.55, roughness: 0.3 }));
  return bodyMats.get(c);
}

function bx(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function wedge(w, h, d, x, y, z, slopeF, slopeB) {
  // üstü eğimli kabin (ön/arka cam eğimi)
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      const z0 = p.getZ(i);
      p.setZ(i, z0 > 0 ? z0 - slopeF : z0 + slopeB);
      p.setX(i, p.getX(i) * 0.92);
    }
  }
  g.computeVertexNormals();
  g.translate(x, y, z);
  return g;
}

export function buildCarModel(type, color) {
  const def = CARS[type];
  const g = new THREE.Group();
  const L = def.len, W = def.wid, H = def.hei;
  const body = [], glass = [], trim = [], chrome = [];
  const head = [], tail = [];
  const cl = 0.32; // yerden yükseklik
  const st = def.style;
  if (st === 'bus') {
    body.push(bx(W, H - cl - 0.2, L, 0, cl + (H - cl) / 2, 0));
    glass.push(bx(W + 0.02, 0.9, L * 0.85, 0, H - 1.0, -0.2));
    glass.push(bx(W * 0.9, 1.0, 0.05, 0, H - 1.1, L / 2 + 0.01));
    trim.push(bx(W + 0.03, 0.25, L + 0.05, 0, cl + 0.15, 0));
    head.push(bx(0.3, 0.15, 0.05, -W / 2 + 0.3, cl + 0.5, L / 2 + 0.02), bx(0.3, 0.15, 0.05, W / 2 - 0.3, cl + 0.5, L / 2 + 0.02));
    tail.push(bx(0.25, 0.25, 0.05, -W / 2 + 0.25, cl + 0.6, -L / 2 - 0.02), bx(0.25, 0.25, 0.05, W / 2 - 0.25, cl + 0.6, -L / 2 - 0.02));
  } else if (st === 'van' || st === 'swat') {
    body.push(bx(W, H * 0.55, L, 0, cl + H * 0.275, 0));
    body.push(wedge(W, H * 0.42, L * 0.82, 0, cl + H * 0.55 + H * 0.2, -L * 0.07, 0.35, 0.02));
    glass.push(bx(W + 0.02, H * 0.25, L * 0.6, 0, cl + H * 0.72, -L * 0.15));
    glass.push(bx(W * 0.85, H * 0.28, 0.05, 0, cl + H * 0.72, L * 0.34 - 0.18));
    trim.push(bx(W + 0.04, 0.2, L + 0.06, 0, cl + 0.1, 0));
    head.push(bx(0.3, 0.14, 0.05, -W / 2 + 0.3, cl + 0.45, L / 2 + 0.02), bx(0.3, 0.14, 0.05, W / 2 - 0.3, cl + 0.45, L / 2 + 0.02));
    tail.push(bx(0.2, 0.3, 0.05, -W / 2 + 0.2, cl + 0.6, -L / 2 - 0.02), bx(0.2, 0.3, 0.05, W / 2 - 0.2, cl + 0.6, -L / 2 - 0.02));
  } else {
    const sport = st === 'sport', suv = st === 'suv';
    const lowH = suv ? H * 0.5 : sport ? H * 0.45 : H * 0.42;
    body.push(bx(W, lowH, L, 0, cl + lowH / 2, 0));
    // kaput ve bagaj hafif eğim
    body.push(wedge(W * 0.98, 0.08, L * 0.3, 0, cl + lowH + 0.02, L * 0.33, 0.0, 0.0));
    const cabL = sport ? L * 0.42 : suv ? L * 0.62 : L * 0.5;
    const cabH = H - lowH - cl;
    const cabZ = sport ? -L * 0.05 : suv ? -L * 0.08 : -L * 0.04;
    body.push(wedge(W * 0.96, cabH, cabL, 0, cl + lowH + cabH / 2, cabZ, sport ? 0.55 : 0.35, sport ? 0.4 : suv ? 0.08 : 0.28));
    glass.push(wedge(W * 0.97, cabH * 0.7, cabL * 0.92, 0, cl + lowH + cabH * 0.42, cabZ, sport ? 0.5 : 0.32, sport ? 0.36 : suv ? 0.07 : 0.25));
    trim.push(bx(W + 0.04, 0.16, L * 0.1, 0, cl + 0.12, L / 2 - 0.02), bx(W + 0.04, 0.16, L * 0.1, 0, cl + 0.12, -L / 2 + 0.02));
    trim.push(bx(W + 0.02, 0.1, L * 0.62, 0, cl + 0.08, 0));
    chrome.push(bx(W * 0.5, 0.12, 0.04, 0, cl + lowH * 0.55, L / 2 + 0.01));
    head.push(bx(0.34, 0.12, 0.05, -W / 2 + 0.3, cl + lowH * 0.72, L / 2 + 0.01), bx(0.34, 0.12, 0.05, W / 2 - 0.3, cl + lowH * 0.72, L / 2 + 0.01));
    tail.push(bx(0.36, 0.12, 0.05, -W / 2 + 0.28, cl + lowH * 0.75, -L / 2 - 0.01), bx(0.36, 0.12, 0.05, W / 2 - 0.28, cl + lowH * 0.75, -L / 2 - 0.01));
    if (sport) { trim.push(bx(W * 0.9, 0.06, 0.3, 0, cl + lowH + 0.25, -L / 2 + 0.2), bx(0.06, 0.25, 0.1, -W * 0.4, cl + lowH + 0.12, -L / 2 + 0.2), bx(0.06, 0.25, 0.1, W * 0.4, cl + lowH + 0.12, -L / 2 + 0.2)); }
    if (suv) { trim.push(bx(W * 0.8, 0.05, cabL * 0.8, 0, H + 0.03, cabZ)); }
  }
  const color0 = color || def.colors[0];
  const bodyM = new THREE.Mesh(mergeGeometries(body), bodyMat(color0));
  bodyM.castShadow = true; g.add(bodyM);
  g.add(new THREE.Mesh(mergeGeometries(glass), glassMat));
  if (trim.length) g.add(new THREE.Mesh(mergeGeometries(trim), trimMat));
  if (chrome.length) g.add(new THREE.Mesh(mergeGeometries(chrome), chromeMat));
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfffff0, emissive: 0xfff2d0, emissiveIntensity: 0.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x880000, emissive: 0xff1010, emissiveIntensity: 0.3 });
  g.add(new THREE.Mesh(mergeGeometries(head), headMat));
  g.add(new THREE.Mesh(mergeGeometries(tail), tailMat));
  g.userData.bodyMesh = bodyM;
  g.userData.headMat = headMat; g.userData.tailMat = tailMat;

  // özel süslemeler
  if (st === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshStandardMaterial({ map: signTexture('TAKSİ', '#111111', '#f2c200', 256, 96), emissive: 0xf2c200, emissiveIntensity: 0.3 }));
    sign.position.set(0, H + 0.11, -L * 0.04); g.add(sign);
    const chk = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, 0.08, L * 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    chk.position.set(0, cl + H * 0.32, 0); g.add(chk);
  }
  if (st === 'police' || st === 'swat') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, 0.35, L * 0.9), new THREE.MeshStandardMaterial({ color: st === 'swat' ? 0x2a2a2a : 0xf0f0f0, metalness: 0.4, roughness: 0.4 }));
    stripe.position.set(0, cl + 0.42, 0); g.add(stripe);
    const decal = new THREE.MeshBasicMaterial({ map: decalTexture(st === 'swat' ? 'ÖZEL HAREKAT' : 'POLİS', st === 'swat' ? '#e8e8e8' : '#1d3d8e'), transparent: true });
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), decal);
      d.position.set(sx * (W / 2 + 0.03), cl + 0.42, 0); d.rotation.y = sx * Math.PI / 2; g.add(d);
    }
    const bar = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0000, emissiveIntensity: 0 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x0040ff, emissiveIntensity: 0 });
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.25), red); l1.position.x = -0.3;
    const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.25), blue); l2.position.x = 0.3;
    bar.add(l1, l2); bar.position.set(0, H + 0.07, -L * 0.05); g.add(bar);
    g.userData.siren = { red, blue };
  }
  if (st === 'bus') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, 0.5, L * 0.98), new THREE.MeshStandardMaterial({ color: 0x1d5aa8 }));
    stripe.position.set(0, cl + 0.9, 0); g.add(stripe);
    const dest = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.35), new THREE.MeshBasicMaterial({ map: signTexture('TAKSİM - KADIKÖY', '#111', '#ffb000', 512, 96) }));
    dest.position.set(0, H - 0.3, L / 2 + 0.03); g.add(dest);
  }
  if (st === 'van' && color0 === '#f2c200') {
    const dest = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('ÜSKÜDAR - BEŞİKTAŞ', '#f2c200', '#111', 512, 96) }));
    dest.position.set(0, H * 0.9, L / 2 - 0.1); g.add(dest);
  }

  // tekerlekler
  const r = st === 'bus' ? 0.5 : st === 'suv' || st === 'swat' ? 0.42 : 0.34;
  const wheelGeo = new THREE.CylinderGeometry(r, r, 0.26, 14); wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.27, 8); rimGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wz = L / 2 - Math.max(0.75, r * 2);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const piv = new THREE.Group(); piv.position.set(sx * (W / 2 - 0.12), r, sz * wz);
    const spin = new THREE.Group(); piv.add(spin);
    const t = new THREE.Mesh(wheelGeo, tireMat); t.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    spin.add(t, rim);
    g.add(piv);
    wheels.push({ piv, spin, front: sz > 0 });
  }
  g.userData.wheels = wheels;
  g.userData.wheelR = r;
  // sürücü maketi (kafa + gövde)
  const drv = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  torso.position.y = 0.25;
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skinMat); hd.position.y = 0.62;
  drv.add(torso, hd);
  drv.position.set(st === 'bus' ? -W / 2 + 0.6 : -W * 0.22, cl + (st === 'bus' ? 1.0 : 0.35), st === 'bus' ? L / 2 - 1.2 : -L * 0.02);
  drv.visible = false;
  g.add(drv);
  g.userData.driverDummy = drv;
  g.userData.driverTorso = torso;
  return g;
}

let VID = 1;

export class Vehicle {
  constructor(game, type, x, z, heading, color) {
    this.game = game;
    this.id = VID++;
    this.type = type;
    this.def = CARS[type];
    this.color = color || this.def.colors[Math.floor(Math.random() * this.def.colors.length)];
    this.mesh = buildCarModel(type, this.color);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.vx = 0; this.vz = 0;
    this.fs = 0;
    this.steerAng = 0;
    this.hp = this.def.hp;
    this.driver = null;
    this.ai = null;
    this.sirenOn = false;
    this.sirenT = 0;
    this.burnT = 0;
    this.destroyed = false;
    this.sinking = 0;
    this.wreckT = 0;
    this.owned = false;
    this.mission = null;
    this.controls = { throttle: 0, steer: 0, handbrake: false };
    this.radius = this.def.wid * 0.6;
    this.stuckT = 0;
    this.honkT = 0;
    this.sync();
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwd() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.heading, 0);
    if (this.sinking > 0) this.mesh.rotation.x = Math.min(0.5, this.sinking * 0.2);
  }

  damage(amount, attacker) {
    if (this.destroyed) return;
    this.hp -= amount;
    if (attacker && attacker.isPlayer && this.driver && !this.driver.isPlayer && this.ai) this.ai.panic = 10;
    if (this.hp <= 0 && this.burnT <= 0) { this.burnT = 4.5; this.lastAttacker = attacker; }
  }

  explode() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.wreckT = 40;
    const g = this.game;
    g.combat.explosion(this.pos.x, this.pos.y + 0.5, this.pos.z, 7, 140, this.lastAttacker, this);
    this.mesh.userData.bodyMesh.material = burntMat;
    this.mesh.traverse((o) => { if (o.isMesh && o.material !== tireMat) o.material = burntMat; });
    this.vx *= 0.3; this.vz *= 0.3;
    this.vy = 6;
    if (this.driver) {
      const d = this.driver;
      g.vehicles.ejectDriver(this);
      if (d.takeDamage) d.takeDamage(500, this.lastAttacker, 'explosion');
    }
  }

  update(dt) {
    const g = this.game;
    const phys = g.physics;
    // yangın
    if (this.burnT > 0 && !this.destroyed) {
      this.burnT -= dt;
      g.particles.fire({ x: this.pos.x + this.fwd.x * this.def.len * 0.35, y: this.pos.y + this.def.hei * 0.6, z: this.pos.z + this.fwd.z * this.def.len * 0.35 }, 1.2);
      if (this.burnT <= 0) this.explode();
    } else if (!this.destroyed && this.hp < this.def.hp * 0.3 && Math.random() < 0.3) {
      g.particles.smoke({ x: this.pos.x + this.fwd.x * this.def.len * 0.4, y: this.pos.y + this.def.hei * 0.7, z: this.pos.z + this.fwd.z * this.def.len * 0.4 }, 0.8);
    }
    if (this.destroyed) {
      this.wreckT -= dt;
      if (this.wreckT > 30 && Math.random() < 0.5) g.particles.fire({ x: this.pos.x, y: this.pos.y + 0.8, z: this.pos.z }, 1);
      if (this.vy !== undefined) { this.vy -= 20 * dt; this.pos.y = Math.max(0, this.pos.y + this.vy * dt); if (this.pos.y <= 0) this.vy = 0; }
    }

    const c = this.controls;
    const canDrive = !this.destroyed && this.sinking <= 0 && (this.driver || this.ai);
    const throttle = canDrive ? c.throttle : 0;
    const steer = canDrive ? c.steer : 0;
    const hb = canDrive ? c.handbrake : !this.destroyed && !this.driver;

    const f = this.fwd;
    const rx = -f.z, rz = f.x;
    let fs = this.vx * f.x + this.vz * f.z;
    let ls = this.vx * rx + this.vz * rz;
    const max = this.def.maxSpeed * (g.state && this.driver && this.driver.isPlayer && g.state.carUpgrade ? 1.15 : 1);
    if (throttle > 0) {
      if (fs < -0.5) fs += 22 * throttle * dt;
      else fs += this.def.accel * throttle * Math.max(0.1, 1 - fs / max) * dt;
    } else if (throttle < 0) {
      if (fs > 0.5) fs += 24 * throttle * dt;
      else if (fs > -10) fs += this.def.accel * 0.6 * throttle * dt;
    } else {
      fs -= Math.sign(fs) * Math.min(Math.abs(fs), 2.5 * dt);
    }
    if (hb) fs -= Math.sign(fs) * Math.min(Math.abs(fs), 9 * dt);
    fs -= fs * Math.abs(fs) * 0.0009 * dt * 60 * 0.016; // hava direnci
    const grip = hb ? 1.6 : 8;
    ls *= Math.exp(-grip * dt);
    this.steerAng += (steer * 0.62 - this.steerAng) * Math.min(1, dt * 8);
    const wb = this.def.len * 0.62;
    const yawRate = (fs * Math.tan(this.steerAng)) / wb / (1 + (fs * fs) / 900);
    this.heading += yawRate * dt * (hb ? 1.35 : 1);
    const f2 = this.fwd;
    const rx2 = -f2.z, rz2 = f2.x;
    this.vx = f2.x * fs + rx2 * ls;
    this.vz = f2.z * fs + rz2 * ls;
    this.fs = fs;
    // drift dumanı
    if (Math.abs(ls) > 5 && Math.random() < 0.5) g.particles.dust({ x: this.pos.x - f2.x * this.def.len * 0.4, y: 0.1, z: this.pos.z - f2.z * this.def.len * 0.4 });

    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;

    // statik çarpışmalar: iki çember (ön ve arka)
    if (this.pos.y < 1.5) {
      const half = this.def.len * 0.3;
      let pushX = 0, pushZ = 0;
      for (const s of [1, -1, 0]) {
        const p = { x: this.pos.x + f2.x * half * s, z: this.pos.z + f2.z * half * s };
        const px = p.x, pz = p.z;
        phys.resolveCircle(p, this.radius, 0.1, 1.4, 0.3);
        const dx = p.x - px, dz = p.z - pz;
        if (dx || dz) { this.pos.x += dx; this.pos.z += dz; pushX += dx; pushZ += dz; }
      }
      const pl = Math.hypot(pushX, pushZ);
      if (pl > 1e-4) {
        const nx = pushX / pl, nz = pushZ / pl;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          this.vx -= nx * vn * 1.25; this.vz -= nz * vn * 1.25;
          const imp = -vn;
          if (imp > 5) {
            this.damage(imp * imp * 0.9, null);
            audio.crash(this.pos.x, this.pos.z, Math.min(1.5, imp / 15));
            g.particles.sparks({ x: this.pos.x - nx * this.radius, y: 0.6, z: this.pos.z - nz * this.radius }, 8);
            if (this.driver && this.driver.isPlayer) g.cameraShake(Math.min(0.6, imp / 30));
          }
        }
      }
    }
    // suya düşme
    if (phys.inWater(this.pos.x, this.pos.z)) {
      if (this.sinking === 0) { audio.splash(this.pos.x, this.pos.z); g.particles.splash({ x: this.pos.x, y: -1.3, z: this.pos.z }); }
      this.sinking += dt;
      this.pos.y = Math.max(-6, -this.sinking * 1.2);
      this.vx *= 0.95; this.vz *= 0.95;
      if (this.sinking > 1.2 && this.driver) {
        const d = this.driver;
        g.vehicles.ejectDriver(this);
        if (d.isPlayer) d.pos.y = -1.2;
      }
      if (this.sinking > 8) { this.destroyed = true; this.wreckT = 0; }
    }
    void ox; void oz;

    // tekerlek animasyonu
    const W = this.mesh.userData.wheels;
    const spin = (fs * dt) / this.mesh.userData.wheelR;
    for (const w of W) { w.spin.rotation.x += spin; if (w.front) w.piv.rotation.y = this.steerAng; }
    // ışıklar
    const night = g.env ? g.env.nightFactor : 0;
    this.mesh.userData.headMat.emissiveIntensity = (this.driver || this.ai) && !this.destroyed ? 0.2 + night * 3 : 0;
    this.mesh.userData.tailMat.emissiveIntensity = throttle < 0 || hb ? 2.5 : (this.driver || this.ai) ? 0.3 + night * 1.2 : 0;
    const s = this.mesh.userData.siren;
    if (s) {
      this.sirenT += dt;
      const on = this.sirenOn && !this.destroyed && (this.ai || this.driver);
      const ph = Math.floor(this.sirenT * 6) % 2;
      s.red.emissiveIntensity = on && ph ? 4 : 0;
      s.blue.emissiveIntensity = on && !ph ? 4 : 0;
    }
    this.mesh.userData.driverDummy.visible = !!(this.driver && !this.driver.isPlayer) || !!(this.ai && !this.ai.empty) || !!(this.driver && this.driver.isPlayer);
    this.sync();
  }
}

// ---------------- Trafik ve polis yöneticisi ----------------
export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.spawnT = 0;
  }

  add(type, x, z, heading, color) {
    const v = new Vehicle(this.game, type, x, z, heading, color);
    this.list.push(v);
    this.group.add(v.mesh);
    return v;
  }
  remove(v) {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
    this.group.remove(v.mesh);
  }
  clear() { for (const v of this.list.slice()) this.remove(v); }

  ejectDriver(v) {
    const d = v.driver;
    if (!d) return;
    v.driver = null;
    const f = v.fwd;
    const rx = -f.z, rz = f.x;
    d.pos.set(v.pos.x - rx * (v.def.wid / 2 + 0.7), Math.max(0, v.pos.y), v.pos.z - rz * (v.def.wid / 2 + 0.7));
    d.vehicle = null;
    d.model.root.visible = true;
    if (this.game.physics) this.game.physics.resolveCircle(d.pos, 0.35, 0);
    if (d.isPlayer) this.game.onPlayerExitVehicle && this.game.onPlayerExitVehicle(v);
  }

  // Trafik aracını yol şeridine yerleştir
  spawnTraffic(px, pz, type) {
    const map = this.game.map;
    const s = map.randomEdgeNear(px, pz, 90, 180);
    if (!s) return null;
    const e = s.e;
    const forward = Math.random() < 0.5;
    const from = forward ? e.a : e.b, to = forward ? e.b : e.a;
    const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz);
    const fx = dx / l, fz = dz / l;
    const lane = e.width >= 16 ? 4.0 : 2.7;
    const x = s.x + -fz * lane, z = s.z + fx * lane;
    // yakında başka araç var mı?
    for (const v of this.list) if (Math.abs(v.pos.x - x) < 8 && Math.abs(v.pos.z - z) < 8) return null;
    const t = type || pickTrafficType();
    const v = this.add(t, x, z, Math.atan2(fx, fz));
    v.ai = { mode: 'traffic', from, to, next: this.chooseNext(to, from), cruise: t === 'bus' ? 9 : 10 + Math.random() * 5 };
    v.vx = fx * 6; v.vz = fz * 6;
    return v;
  }

  spawnParked(px, pz) {
    const map = this.game.map;
    const s = map.randomEdgeNear(px, pz, 60, 160);
    if (!s || s.e.width >= 16) return null;
    const e = s.e;
    const dx = e.b.x - e.a.x, dz = e.b.z - e.a.z, l = Math.hypot(dx, dz);
    if (l < 40) return null;
    const fx = dx / l, fz = dz / l;
    const side = Math.random() < 0.5 ? 1 : -1;
    const x = s.x - fz * side * (e.width / 2 - 1.1), z = s.z + fx * side * (e.width / 2 - 1.1);
    for (const v of this.list) if (Math.abs(v.pos.x - x) < 7 && Math.abs(v.pos.z - z) < 7) return null;
    const t = Math.random() < 0.7 ? 'kartal' : Math.random() < 0.6 ? 'sedan' : Math.random() < 0.6 ? 'suv' : 'gt';
    const v = this.add(t, x, z, Math.atan2(fx, fz) + (side > 0 ? Math.PI : 0));
    v.parked = true;
    return v;
  }

  chooseNext(node, prev, target) {
    const opts = node.edges.map((e) => this.game.map.other(e, node)).filter((n) => n !== prev);
    if (!opts.length) return prev;
    if (target) {
      let best = opts[0], bd = 1e18;
      for (const n of opts) { const d = (n.x - target.x) ** 2 + (n.z - target.z) ** 2; if (d < bd) { bd = d; best = n; } }
      return best;
    }
    return opts[Math.floor(Math.random() * opts.length)];
  }

  laneTarget(from, to, lane) {
    const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
    const fx = dx / l, fz = dz / l;
    return { ax: from.x - fz * lane, az: from.z + fx * lane, bx: to.x - fz * lane, bz: to.z + fx * lane, fx, fz, l };
  }

  driveAI(v, dt) {
    const ai = v.ai;
    const g = this.game;
    if (ai.empty || ai.frozen) { v.controls.throttle = 0; v.controls.handbrake = true; return; }
    const player = g.player;
    let tx, tz, desired = ai.cruise;
    if (ai.mode === 'direct' || ai.mode === 'race') {
      const tgt = ai.mode === 'race' ? ai.points[ai.idx] : ai.target;
      if (!tgt) { v.controls.throttle = 0; v.controls.handbrake = true; return; }
      tx = tgt.x; tz = tgt.z;
      desired = ai.mode === 'race' ? v.def.maxSpeed * (ai.skill || 0.85) : ai.cruise;
      if (ai.mode === 'race' && Math.hypot(tx - v.pos.x, tz - v.pos.z) < 14) { ai.idx++; if (ai.idx >= ai.points.length) { ai.finished = true; ai.idx = ai.points.length - 1; } }
      if (ai.mode === 'race' && ai.points[ai.idx + 1]) {
        const n = ai.points[ai.idx + 1];
        const a1 = Math.atan2(tx - v.pos.x, tz - v.pos.z), a2 = Math.atan2(n.x - tx, n.z - tz);
        const turn = Math.abs(angleDiff(a1, a2));
        const dd = Math.hypot(tx - v.pos.x, tz - v.pos.z);
        if (turn > 0.8 && dd < 40) desired = Math.min(desired, 14 + dd * 0.3);
      }
    } else {
      const lane = (ai.laneW || 0) || (this.edgeWidth(ai.from, ai.to) >= 16 ? 4.0 : 2.7);
      let L = this.laneTarget(ai.from, ai.to, lane);
      // segment üzerindeki ilerleme
      const s = (v.pos.x - L.ax) * L.fx + (v.pos.z - L.az) * L.fz;
      const look = 6 + Math.abs(v.fs) * 0.5;
      if (s > L.l - lane - 3) {
        // kavşak: sonraki kenara geç
        const prev = ai.from;
        ai.from = ai.to; ai.to = ai.next;
        const target = ai.mode === 'chase' ? player.pos : null;
        ai.next = this.chooseNext(ai.to, ai.from, target);
        void prev;
        L = this.laneTarget(ai.from, ai.to, lane);
      }
      const s2 = (v.pos.x - L.ax) * L.fx + (v.pos.z - L.az) * L.fz;
      const tt = Math.min(L.l, Math.max(0, s2) + look);
      tx = L.ax + L.fx * tt; tz = L.az + L.fz * tt;
      // dönüş öncesi yavaşla
      const remain = L.l - s2;
      if (ai.next && remain < 25) {
        const n = this.laneTarget(ai.to, ai.next, lane);
        const turn = Math.abs(angleDiff(Math.atan2(L.fx, L.fz), Math.atan2(n.fx, n.fz)));
        if (turn > 0.5) desired = Math.min(desired, 6 + remain * 0.2);
      }
      if (ai.mode === 'chase') {
        desired = v.def.maxSpeed * 0.85;
        const d = Math.hypot(player.pos.x - v.pos.x, player.pos.z - v.pos.z);
        if (d < 45 && g.physics.lineOfSight(v.pos.x, 1, v.pos.z, player.pos.x, 1, player.pos.z)) { tx = player.pos.x; tz = player.pos.z; if (d < 14 && !player.vehicle) desired = 0; }
      }
    }
    // engel kontrolü
    if (ai.mode !== 'chase' && ai.mode !== 'race') {
      const f = v.fwd;
      const range = 5 + Math.abs(v.fs) * 0.9;
      let block = false;
      const check = (x, z) => {
        const dx = x - v.pos.x, dz = z - v.pos.z;
        const fwdD = dx * f.x + dz * f.z;
        if (fwdD < 0.5 || fwdD > range + v.def.len / 2) return false;
        const lat = Math.abs(dx * -f.z + dz * f.x);
        return lat < v.def.wid * 0.9;
      };
      for (const o of this.list) {
        if (o === v) continue;
        if (Math.abs(o.pos.x - v.pos.x) > 30 || Math.abs(o.pos.z - v.pos.z) > 30) continue;
        if (check(o.pos.x, o.pos.z)) { block = true; break; }
      }
      if (!block && !player.vehicle && !player.inInterior && check(player.pos.x, player.pos.z)) { block = true; ai.honkFor = (ai.honkFor || 0) + dt; }
      if (!block) for (const n of g.npcs.list) { if (!n.dead && check(n.pos.x, n.pos.z)) { block = true; break; } }
      if (block) {
        desired = 0;
        ai.blockT = (ai.blockT || 0) + dt;
        if (ai.blockT > 4) desired = 4; // sonsuza kadar bekleme
        if (ai.honkFor > 1.2 && v.honkT <= 0) { audio.horn(v.pos.x, v.pos.z); v.honkT = 3; ai.honkFor = 0; }
      } else ai.blockT = 0;
      if (ai.panic > 0) { ai.panic -= dt; desired = v.def.maxSpeed * 0.8; }
    }
    v.honkT -= dt;
    const want = Math.atan2(tx - v.pos.x, tz - v.pos.z);
    const diff = angleDiff(v.heading, want);
    const reverse = ai.reverseT > 0;
    v.controls.steer = clamp(diff * 2.2, -1, 1) * (reverse ? -1 : 1);
    const err = desired - v.fs;
    v.controls.throttle = reverse ? -1 : clamp(err * 0.35, -1, 1);
    v.controls.handbrake = desired === 0 && Math.abs(v.fs) < 2;
    // sıkışma tespiti
    if (desired > 3 && Math.abs(v.fs) < 0.8) { v.stuckT += dt; if (v.stuckT > 2.5) { ai.reverseT = 1.4; v.stuckT = 0; } } else v.stuckT = 0;
    if (ai.reverseT > 0) ai.reverseT -= dt;
  }

  edgeWidth(a, b) {
    for (const e of a.edges) if (e.a === b || e.b === b) return e.width;
    return 11;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const px = p.pos.x, pz = p.pos.z;
    // trafik yoğunluğu
    this.spawnT -= dt;
    const trafficCount = this.list.filter((v) => v.ai && v.ai.mode === 'traffic').length;
    const parkedCount = this.list.filter((v) => v.parked && !v.driver).length;
    const maxTraffic = g.settings.quality === 'low' ? 14 : g.settings.quality === 'medium' ? 20 : 28;
    if (this.spawnT <= 0 && !p.inInterior) {
      this.spawnT = 0.4;
      if (trafficCount < maxTraffic) this.spawnTraffic(px, pz);
      if (parkedCount < 10) this.spawnParked(px, pz);
    }
    for (const v of this.list.slice()) {
      const d = Math.hypot(v.pos.x - px, v.pos.z - pz);
      const keep = v.owned || v.mission || v === p.vehicle || v === p.lastVehicle || (v.ai && (v.ai.mode === 'chase' || v.ai.mode === 'race'));
      if ((d > 260 && !keep) || (v.destroyed && v.wreckT <= 0 && d > 40) || (v.sinking > 8)) {
        if (v.driver && !v.driver.isPlayer) g.npcs.remove(v.driver);
        this.remove(v);
        continue;
      }
      if (d > 320 && !v.mission) continue; // uzaktakini güncelleme
      if (v.ai && !v.driver && !v.destroyed) this.driveAI(v, dt);
      v.update(dt);
    }
    this.collideVehicles();
  }

  collideVehicles() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const lim = (a.def.len + b.def.len) * 0.5;
        if (Math.abs(dx) > lim || Math.abs(dz) > lim) continue;
        if (Math.abs(a.pos.y - b.pos.y) > 2) continue;
        // her araç için 3 çember
        let hit = false;
        for (const sa of [-0.3, 0, 0.3]) for (const sb of [-0.3, 0, 0.3]) {
          const ax = a.pos.x + a.fwd.x * a.def.len * sa, az = a.pos.z + a.fwd.z * a.def.len * sa;
          const bx2 = b.pos.x + b.fwd.x * b.def.len * sb, bz = b.pos.z + b.fwd.z * b.def.len * sb;
          const ddx = bx2 - ax, ddz = bz - az;
          const d = Math.hypot(ddx, ddz);
          const r = a.radius + b.radius;
          if (d < r && d > 1e-4) {
            const nx = ddx / d, nz = ddz / d, pen = (r - d) / 2;
            const ma = a.def.hp, mb = b.def.hp, tot = ma + mb;
            a.pos.x -= nx * pen * (mb / tot) * 2; a.pos.z -= nz * pen * (mb / tot) * 2;
            b.pos.x += nx * pen * (ma / tot) * 2; b.pos.z += nz * pen * (ma / tot) * 2;
            const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
            if (rv < 0 && !hit) {
              hit = true;
              const jimp = -1.4 * rv / (1 / ma + 1 / mb);
              a.vx -= (jimp / ma) * nx; a.vz -= (jimp / ma) * nz;
              b.vx += (jimp / mb) * nx; b.vz += (jimp / mb) * nz;
              const imp = -rv;
              if (imp > 4) {
                a.damage(imp * imp * 0.6, b.driver); b.damage(imp * imp * 0.6, a.driver);
                audio.crash(a.pos.x, a.pos.z, Math.min(1.5, imp / 12));
                this.game.particles.sparks({ x: ax + nx * a.radius, y: 0.6, z: az + nz * a.radius }, 10);
                const pl = this.game.player;
                if (a.driver === pl || b.driver === pl) {
                  this.game.cameraShake(Math.min(0.6, imp / 25));
                  const other = a.driver === pl ? b : a;
                  if (other.type === 'police' || other.type === 'swat') this.game.wanted.crime('hit_police_car', other.pos);
                  if (other.ai && other.ai.mode === 'traffic') other.ai.panic = 3;
                }
              }
            }
          }
        }
      }
    }
  }

  nearestEnterable(x, z, maxD = 4) {
    let best = null, bd = maxD;
    for (const v of this.list) {
      if (v.destroyed || v.sinking > 0) continue;
      const d = Math.hypot(v.pos.x - x, v.pos.z - z) - v.def.wid * 0.5;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
}

function pickTrafficType() {
  const r = rng.next();
  if (r < 0.32) return 'taksi';
  if (r < 0.62) return 'kartal';
  if (r < 0.74) return 'sedan';
  if (r < 0.82) return 'dolmus';
  if (r < 0.88) return 'suv';
  if (r < 0.93) return 'bus';
  if (r < 0.96) return 'gt';
  return 'police';
}
