// Hayvanlar: İstanbul'un sokak kedileri ve köpekleri, Boğaz martıları, meydan güvercinleri.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dampAngle, RNG } from '../core/util.js';
import { audio } from '../core/audio.js';
import { isLand } from './map.js';

const r = new RNG(2024);

function quadruped(size, color, dog) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * size, 0.35 * size, 4, 8), m);
  body.rotation.x = Math.PI / 2; body.position.y = 0.3 * size; g.add(body);
  const head = new THREE.Group(); head.position.set(0, 0.42 * size, 0.28 * size); g.add(head);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.1 * size, 10, 8), m); head.add(hm);
  if (dog) { const sn = new THREE.Mesh(new THREE.BoxGeometry(0.08 * size, 0.07 * size, 0.12 * size), m); sn.position.set(0, -0.02 * size, 0.1 * size); head.add(sn); }
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035 * size, (dog ? 0.08 : 0.07) * size, 4), m);
    ear.position.set(sx * 0.055 * size, 0.09 * size, 0); if (dog) { ear.rotation.z = sx * 0.8; } head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014 * size, 6, 4), new THREE.MeshBasicMaterial({ color: dog ? 0x221100 : 0x88cc33 }));
    eye.position.set(sx * 0.04 * size, 0.02 * size, 0.085 * size); head.add(eye);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.07 * size, 0.24 * size, sz * 0.17 * size);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * size, 0.022 * size, 0.24 * size, 5), m); l.position.y = -0.12 * size; piv.add(l);
    g.add(piv); legs.push(piv);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.34 * size, -0.25 * size); g.add(tail);
  const tm = new THREE.Mesh(new THREE.CylinderGeometry(0.015 * size, 0.02 * size, 0.28 * size, 5), m); tm.position.y = 0.13 * size; tail.add(tm);
  tail.rotation.x = dog ? -0.6 : -0.3;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, legs, tail, head };
}

function birdGeo(scale) {
  const body = new THREE.SphereGeometry(0.1 * scale, 8, 6); body.scale(0.7, 0.7, 1.6);
  const head = new THREE.SphereGeometry(0.06 * scale, 6, 6); head.translate(0, 0.04 * scale, 0.17 * scale);
  return mergeGeometries([body, head]);
}

export class Animals {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.cats = []; this.dogs = []; this.gulls = []; this.pigeons = [];
    this.spawnT = 0;
    this.build();
  }

  build() {
    // martılar: Boğaz ve Haliç üstünde süzülür
    const gullBody = birdGeo(2.2);
    const wingGeo = new THREE.BoxGeometry(0.6, 0.02, 0.18); wingGeo.translate(0.3, 0, 0);
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.8 });
    const grey = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.8 });
    for (let i = 0; i < 40; i++) {
      const b = new THREE.Group();
      b.add(new THREE.Mesh(gullBody, white));
      const wl = new THREE.Mesh(wingGeo, grey); const wr = new THREE.Mesh(wingGeo, grey); wr.rotation.y = Math.PI;
      b.add(wl, wr);
      const zone = r.pick([[310, r.float(-900, 800)], [r.float(-800, 190), 130], [r.float(-900, 900), 900]]);
      const gull = { b, wl, wr, cx: zone[0], cz: zone[1], rad: r.float(20, 80), ang: r.float(0, 6.28), h: r.float(12, 45), sp: r.float(0.15, 0.35) * (r.chance(0.5) ? 1 : -1), ph: r.float(0, 6) };
      this.gulls.push(gull);
      this.group.add(b);
    }
    this.pigeonGeo = birdGeo(1);
    this.pigeonMat = new THREE.MeshStandardMaterial({ color: 0x8890a0, roughness: 0.9 });
    // Sultanahmet ve Eminönü güvercinleri
    for (const [cx, cz] of [[-90, 545], [-120, 230], [-250, -300], [480, 480]]) {
      for (let i = 0; i < 18; i++) {
        const m = new THREE.Mesh(this.pigeonGeo, this.pigeonMat);
        const p = { m, x: cx + r.float(-8, 8), z: cz + r.float(-8, 8), y: 0.1, vy: 0, fly: 0, hx: cx, hz: cz, peck: r.float(0, 6), heading: r.float(0, 6.28) };
        m.position.set(p.x, 0.1, p.z);
        this.pigeons.push(p); this.group.add(m);
      }
    }
  }

  spawnStreetAnimal(px, pz) {
    const g = this.game;
    const s = g.npcs.sidewalkSpot(px, pz, 25, 80);
    if (!s) return;
    const dog = Math.random() < 0.3;
    const color = dog ? r.pick(['#c9a878', '#8a6a4a', '#d8c8a8', '#3a3028']) : r.pick(['#d88a3a', '#3a3a3a', '#f0f0f0', '#8a8a8a', '#c9a878', '#5a4030']);
    const q = quadruped(dog ? 1.6 : 0.9, color, dog);
    q.g.position.set(s.x, 0, s.z);
    this.group.add(q.g);
    const a = { ...q, x: s.x, z: s.z, heading: Math.random() * 6.28, state: 'walk', t: 0, dog, sit: 0, sound: Math.random() * 20, petted: 0 };
    (dog ? this.dogs : this.cats).push(a);
  }

  nearestCat(x, z, d = 2) {
    let best = null, bd = d;
    for (const c of this.cats) { const dd = Math.hypot(c.x - x, c.z - z); if (dd < bd) { bd = dd; best = c; } }
    return best;
  }

  update(dt) {
    const g = this.game;
    const p = g.player.pos;
    this.group.visible = !g.player.inInterior;
    if (g.player.inInterior) return;
    const t = performance.now() * 0.001;
    for (const b of this.gulls) {
      b.ang += b.sp * dt;
      const x = b.cx + Math.cos(b.ang) * b.rad, z = b.cz + Math.sin(b.ang) * b.rad;
      const y = b.h + Math.sin(t * 0.5 + b.ph) * 3;
      b.b.position.set(x, y, z);
      b.b.rotation.y = b.ang + (b.sp > 0 ? Math.PI : 0);
      b.b.rotation.z = b.sp > 0 ? -0.3 : 0.3;
      const flap = Math.sin(t * 6 + b.ph) * 0.5 * (Math.sin(t * 0.3 + b.ph) > 0.2 ? 1 : 0.15);
      b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
      if (Math.random() < dt * 0.02 && Math.hypot(x - p.x, z - p.z) < 120) audio.seagull(x, z);
    }
    // güvercinler oyuncu yaklaşınca uçar
    for (const q of this.pigeons) {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < 4 && q.fly <= 0) { q.fly = 4 + Math.random() * 3; q.vy = 4; q.heading = Math.atan2(q.x - p.x, q.z - p.z) + (Math.random() - 0.5); }
      if (q.fly > 0) {
        q.fly -= dt;
        q.x += Math.sin(q.heading) * 6 * dt; q.z += Math.cos(q.heading) * 6 * dt;
        q.y = Math.min(12, q.y + q.vy * dt);
        if (q.fly <= 0) { q.x = q.hx + (Math.random() - 0.5) * 14; q.z = q.hz + (Math.random() - 0.5) * 14; q.y = 6; }
        q.m.rotation.z = Math.sin(t * 30) * 0.3;
      } else {
        q.y = Math.max(0.1, q.y - 4 * dt);
        q.peck += dt;
        if (Math.random() < dt * 0.5) q.heading += (Math.random() - 0.5) * 2;
        if (Math.sin(q.peck * 2) > 0.5) { q.x += Math.sin(q.heading) * 0.3 * dt; q.z += Math.cos(q.heading) * 0.3 * dt; }
        q.m.rotation.x = Math.sin(q.peck * 8) > 0.7 ? 0.5 : 0;
        q.m.rotation.z = 0;
      }
      q.m.position.set(q.x, q.y, q.z);
      q.m.rotation.y = q.heading;
    }
    // sokak kedileri/köpekleri
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.cats.length + this.dogs.length < 14) { this.spawnT = 1.5; this.spawnStreetAnimal(p.x, p.z); }
    for (const list of [this.cats, this.dogs]) {
      for (const a of list.slice()) {
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        if (d > 130) { this.group.remove(a.g); list.splice(list.indexOf(a), 1); continue; }
        a.t -= dt; a.sound -= dt;
        if (a.t <= 0) {
          a.t = 2 + Math.random() * 5;
          const roll = Math.random();
          a.state = roll < 0.4 ? 'sit' : roll < 0.85 ? 'walk' : 'run';
          a.heading += (Math.random() - 0.5) * 2.5;
        }
        // köpekler oyuncuyu takip edebilir, kediler yaklaşınca kaçar
        if (a.dog && d < 8 && g.player.speed > 3 && a.sound <= 0) { audio.bark(a.x, a.z); a.sound = 4 + Math.random() * 6; }
        if (!a.dog && a.sound <= 0 && d < 10) { if (Math.random() < 0.2) audio.meow(a.x, a.z); a.sound = 8 + Math.random() * 10; }
        if (!a.dog && d < 2.5 && g.player.speed > 4) { a.state = 'run'; a.heading = Math.atan2(a.x - p.x, a.z - p.z); a.t = 2; }
        const sp = a.state === 'walk' ? (a.dog ? 1.0 : 0.6) : a.state === 'run' ? (a.dog ? 4 : 3.5) : 0;
        const nx = a.x + Math.sin(a.heading) * sp * dt, nz = a.z + Math.cos(a.heading) * sp * dt;
        const pp = { x: nx, z: nz };
        const res = g.physics.resolveCircle(pp, 0.25, 0, 0.5, 0.2);
        if (!isLand(pp.x, pp.z) || res.hit) a.heading += Math.PI * 0.7;
        else { a.x = pp.x; a.z = pp.z; }
        a.g.position.set(a.x, 0, a.z);
        a.g.rotation.y = dampAngle(a.g.rotation.y, a.heading, 5, dt);
        const ph = t * (a.state === 'run' ? 14 : 7);
        a.legs.forEach((l, i) => { l.rotation.x = sp > 0 ? Math.sin(ph + (i % 2 === (i < 2 ? 0 : 1) ? 0 : Math.PI)) * 0.6 : 0; });
        const sitting = a.state === 'sit';
        a.g.children[0].rotation.x = sitting ? Math.PI / 2 - 0.6 : Math.PI / 2;
        a.legs[2].rotation.x = a.legs[3].rotation.x = sitting ? -1.2 : a.legs[2].rotation.x;
        a.tail.rotation.z = Math.sin(t * (a.dog ? 8 : 2) + a.x) * 0.4;
        if (a.petted > 0) { a.petted -= dt; a.head.rotation.x = Math.sin(t * 6) * 0.2; }
      }
    }
  }
}
