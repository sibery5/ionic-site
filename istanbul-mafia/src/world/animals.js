// Hayvanlar: İstanbul'un sokak kedileri ve köpekleri (prosedürel model, yürüyüş döngüsü, kaç/takip/otur/yat),
// Boğaz martıları, meydan güvercinleri.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dampAngle, RNG } from '../core/util.js';
import { audio } from '../core/audio.js';
import { isLand } from './map.js';

const r = new RNG(2024);

// ---------------- sokak kedileri ve köpekleri ----------------
// Gövde/baş birleştirilmiş geometri (az çizim çağrısı), iki parçalı bacaklar (diz/bilek bükülür), üç parçalı
// kuyruk. Yürüyüş adım frekansı hıza bağlı (ayak kaymaz): kedi yanal sıralı yürüyüş, köpek tırıs, kaçarken dörtnala.
// Davranış: dolaş, otur, yalan (kedi), yat/uyu, kaç (silah sesi, koşan oyuncu, yaklaşan araç), sevilince takip.
// Uzaktakiler seyrek güncellenir, 45 m ötesinde bacak animasyonu yapılmaz.
const COATS = {};
function coatTex(kind) {
  if (COATS[kind]) return COATS[kind];
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  const base = { orange: '#d8873a', grey: '#8a8a8a', black: '#1e1c1c', white: '#efefe8', calico: '#efe8dc', cream: '#d8c8a0', brown: '#8a6040', sand: '#c9a878', dark: '#3a3028' }[kind] || '#888';
  x.fillStyle = base; x.fillRect(0, 0, 128, 64);
  const rr = new RNG(kind.length * 977);
  if (kind === 'orange' || kind === 'grey' || kind === 'brown') {
    // tekir çizgileri
    x.fillStyle = kind === 'orange' ? '#9a5418' : kind === 'grey' ? '#4a4a4a' : '#4a3020';
    for (let i = 0; i < 16; i++) { const u = i * 8 + rr.float(-2, 2); x.beginPath(); x.moveTo(u, 0); x.quadraticCurveTo(u + rr.float(-6, 6), 32, u + rr.float(-3, 3), 64); x.lineWidth = rr.float(1.5, 3.5); x.strokeStyle = x.fillStyle; x.stroke(); }
  }
  if (kind === 'calico' || kind === 'white') {
    for (let i = 0; i < (kind === 'calico' ? 9 : 3); i++) { x.fillStyle = kind === 'calico' ? (i % 2 ? '#1e1c1c' : '#d8873a') : '#2a2a2a'; x.beginPath(); x.ellipse(rr.float(0, 128), rr.float(0, 40), rr.float(6, 16), rr.float(5, 12), rr.float(0, 3), 0, 6.3); x.fill(); }
  }
  // karın açık renk (alt yarı)
  const gr = x.createLinearGradient(0, 40, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, kind === 'black' || kind === 'dark' ? 'rgba(60,55,50,0.6)' : 'rgba(250,245,235,0.75)');
  x.fillStyle = gr; x.fillRect(0, 40, 128, 24);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  COATS[kind] = t;
  return t;
}
const EYE_MAT = { cat: new THREE.MeshBasicMaterial({ color: 0x9acd32 }), dog: new THREE.MeshBasicMaterial({ color: 0x2a1a0a }) };
const DARK_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.5 });
const TAG_MAT = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.6 }); // belediye küpesi (İstanbul sokak köpekleri)
const GEO = {};
function quadGeo(dog) {
  const k = dog ? 'dog' : 'cat';
  if (GEO[k]) return GEO[k];
  const T = (g, x, y, z) => { g.translate(x, y, z); return g; };
  const S = (g, x, y, z) => { g.scale(x, y, z); return g; };
  let body, head;
  if (!dog) {
    // kedi: ince gövde, göğüs, kalça; baş yuvarlak, kısa burun, sivri kulaklar
    body = mergeGeometries([
      T(S(new THREE.SphereGeometry(0.1, 12, 8), 0.95, 0.95, 2.1), 0, 0, 0.17),
      T(S(new THREE.SphereGeometry(0.095, 10, 8), 1, 1.05, 1), 0, 0.01, 0.33),
      T(S(new THREE.SphereGeometry(0.1, 10, 8), 1.05, 1, 1.05), 0, 0, 0.02),
      T(new THREE.CylinderGeometry(0.045, 0.06, 0.1, 8).rotateX(-0.7), 0, 0.06, 0.4),
    ]);
    const ear = () => new THREE.ConeGeometry(0.03, 0.065, 4).rotateY(Math.PI / 4);
    head = mergeGeometries([
      S(new THREE.SphereGeometry(0.07, 12, 10), 1.05, 0.92, 1),
      T(S(new THREE.SphereGeometry(0.035, 8, 6), 1.3, 0.85, 1), 0, -0.022, 0.05),
      T(ear().rotateZ(0.25), -0.042, 0.06, -0.005), T(ear().rotateZ(-0.25), 0.042, 0.06, -0.005),
    ]);
  } else {
    // köpek: derin göğüs, uzun burun, yarı düşük kulaklar
    body = mergeGeometries([
      T(S(new THREE.SphereGeometry(0.13, 12, 8), 0.9, 1.0, 2.3), 0, 0, 0.26),
      T(S(new THREE.SphereGeometry(0.135, 10, 8), 0.92, 1.12, 1), 0, 0.0, 0.5),
      T(S(new THREE.SphereGeometry(0.125, 10, 8), 0.95, 0.95, 1), 0, 0.02, 0.03),
      T(new THREE.CylinderGeometry(0.07, 0.1, 0.22, 8).rotateX(-0.9), 0, 0.12, 0.62),
    ]);
    const ear = () => S(new THREE.SphereGeometry(0.045, 6, 5), 0.6, 1.3, 0.35);
    head = mergeGeometries([
      S(new THREE.SphereGeometry(0.095, 12, 10), 1, 0.95, 1.05),
      T(new THREE.CylinderGeometry(0.04, 0.055, 0.14, 8).rotateX(Math.PI / 2), 0, -0.025, 0.12),
      T(ear().rotateZ(0.5), -0.075, 0.03, -0.01), T(ear().rotateZ(-0.5), 0.075, 0.03, -0.01),
    ]);
  }
  const eyes = mergeGeometries([T(new THREE.SphereGeometry(dog ? 0.013 : 0.012, 6, 4), -0.03 * (dog ? 1.3 : 1), dog ? 0.02 : 0.012, dog ? 0.08 : 0.06), T(new THREE.SphereGeometry(dog ? 0.013 : 0.012, 6, 4), 0.03 * (dog ? 1.3 : 1), dog ? 0.02 : 0.012, dog ? 0.08 : 0.06)]);
  const nose = T(new THREE.SphereGeometry(dog ? 0.022 : 0.012, 6, 4), 0, dog ? -0.012 : -0.01, dog ? 0.19 : 0.085);
  const L = dog ? 0.2 : 0.115;
  const up = T(new THREE.CylinderGeometry(dog ? 0.035 : 0.022, dog ? 0.028 : 0.017, L, 6), 0, -L / 2, 0);
  const lo = mergeGeometries([T(new THREE.CylinderGeometry(dog ? 0.025 : 0.016, dog ? 0.022 : 0.014, L, 6), 0, -L / 2, 0), T(S(new THREE.SphereGeometry(dog ? 0.032 : 0.02, 6, 4), 1, 0.6, 1.4), 0, -L, 0.012)]);
  const tl = dog ? 0.13 : 0.1;
  const tail = T(new THREE.CylinderGeometry(dog ? 0.02 : 0.016, dog ? 0.03 : 0.02, tl, 5), 0, tl / 2, 0);
  const tag = dog ? T(new THREE.BoxGeometry(0.012, 0.03, 0.02), 0.085, 0.0, -0.01) : null;
  GEO[k] = { body, head, eyes, nose, up, lo, L, tail, tl, tag };
  return GEO[k];
}

function quadruped(size, coat, dog) {
  const G = quadGeo(dog);
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ map: coatTex(coat), roughness: 0.92 });
  const hipH = (dog ? 0.42 : 0.24) * size;
  const torso = new THREE.Group(); torso.position.set(0, hipH, -(dog ? 0.25 : 0.17) * size); torso.scale.setScalar(size); g.add(torso);
  const body = new THREE.Mesh(G.body, m); torso.add(body);
  const neck = new THREE.Group(); neck.position.set(0, dog ? 0.16 : 0.09, dog ? 0.66 : 0.44); torso.add(neck);
  const head = new THREE.Group(); head.position.set(0, dog ? 0.05 : 0.03, dog ? 0.04 : 0.03); neck.add(head);
  head.add(new THREE.Mesh(G.head, m), new THREE.Mesh(G.eyes, EYE_MAT[dog ? 'dog' : 'cat']), new THREE.Mesh(G.nose, DARK_MAT));
  if (G.tag) head.add(new THREE.Mesh(G.tag, TAG_MAT));
  const legs = [];
  // sıra: sol ön, sağ ön, sol arka, sağ arka
  for (const [sx, front] of [[1, 1], [-1, 1], [1, 0], [-1, 0]]) {
    const up = new THREE.Group(); up.position.set(sx * (dog ? 0.08 : 0.055), dog ? -0.02 : -0.01, front ? (dog ? 0.52 : 0.33) : (dog ? 0.02 : 0.0)); torso.add(up);
    up.add(new THREE.Mesh(G.up, m));
    const lo = new THREE.Group(); lo.position.set(0, -G.L, 0); up.add(lo);
    lo.add(new THREE.Mesh(G.lo, m));
    legs.push({ up, lo, front, sx });
  }
  const tail = [];
  let parent = torso, py = dog ? 0.08 : 0.05, pz = dog ? -0.12 : -0.08;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group(); s.position.set(0, py, pz); parent.add(s);
    s.add(new THREE.Mesh(G.tail, m));
    tail.push(s); parent = s; py = G.tl; pz = 0;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, torso, neck, head, legs, tail, hipH, size, legL: G.L * 2 * size };
}

const PET_LINES = { cat: ['Mır...', 'Miyav!'], dog: ['Hav!', '*kuyruk sallar*'] };

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
    const coat = dog ? r.pick(['sand', 'cream', 'brown', 'dark', 'sand']) : r.pick(['orange', 'grey', 'black', 'white', 'calico', 'orange', 'grey']);
    const size = dog ? r.float(0.9, 1.1) : r.float(0.85, 1.08);
    const q = quadruped(size, coat, dog);
    q.g.position.set(s.x, 0, s.z);
    this.group.add(q.g);
    const a = { ...q, x: s.x, z: s.z, heading: Math.random() * 6.28, state: 'walk', t: 1 + Math.random() * 4, dog, sound: Math.random() * 20, petted: 0,
      sp: 0, cyc: Math.random(), sitW: 0, lieW: 0, groomW: 0, follow: 0, fleeT: 0, wag: 0, seed: Math.random() * 10, lod: 0 };
    a.g.rotation.y = a.heading;
    (dog ? this.dogs : this.cats).push(a);
  }

  nearestCat(x, z, d = 2) { return this.nearestPet(x, z, d, this.cats); }
  nearestPet(x, z, d = 2, list) {
    let best = null, bd = d;
    for (const L of list ? [list] : [this.cats, this.dogs]) for (const c of L) { if (c.state === 'flee') continue; const dd = Math.hypot(c.x - x, c.z - z); if (dd < bd) { bd = dd; best = c; } }
    return best;
  }
  // sevildi: kedi kısa, köpek uzun süre peşinden gelir
  pet(a) {
    a.petted = 2.2; a.state = a.dog ? 'stand' : 'sit'; a.t = 2.5;
    a.follow = a.dog ? 50 + Math.random() * 30 : 8 + Math.random() * 6;
    if (a.dog) audio.bark(a.x, a.z); else audio.meow(a.x, a.z);
    this.game.ui.bark({ pos: { x: a.x, y: -1.5, z: a.z } }, r.pick(PET_LINES[a.dog ? 'dog' : 'cat']));
  }
  // silah sesi / patlama: kediler hep, köpeklerin çoğu kaçar
  onNoise(x, z, radius) {
    for (const L of [this.cats, this.dogs]) for (const a of L) {
      const d = Math.hypot(a.x - x, a.z - z);
      if (d > radius) continue;
      if (a.dog && Math.random() < 0.3) { a.state = 'stand'; a.t = 2; a.barkAt = { x, z }; continue; }
      this.scare(a, x, z, 3 + Math.random() * 3);
    }
  }
  // [mekanik tepki] mermi hayvanın yanından geçti / sıyırdı: ateş yönünden uzağa kaçar; sıyrılan inler, kanar, topallar
  onBullet(o, dir, t) {
    for (const L of [this.cats, this.dogs]) for (const a of L) {
      const lx = a.x - o.x, ly = 0.35 - o.y, lz = a.z - o.z;
      const s = lx * dir.x + ly * dir.y + lz * dir.z;
      if (s < 0 || s > t + 0.5) continue;
      const cx = lx - dir.x * s, cy = ly - dir.y * s, cz = lz - dir.z * s, d = Math.sqrt(cx * cx + cy * cy + cz * cz);
      if (d > 3) continue;
      if (d < (a.dog ? 0.32 : 0.22)) {
        a.hurtT = 25;
        if (!this.game.combat.voice || this.game.combat.voice()) audio.yelp(a.x, a.z, a.dog);
        const gp = this.game.particles;
        if (gp && gp.blood) gp.blood({ x: a.x, y: 0.35, z: a.z }, 3, null, 0.005);
      }
      // ateş eden yönden uzağa (merminin gidiş yönüne değil, yana ve geriye)
      this.scare(a, o.x, o.z, 3 + Math.random() * 3);
    }
  }
  scare(a, x, z, t) { a.state = 'flee'; a.fleeT = t; a.follow = 0; a.heading = Math.atan2(a.x - x, a.z - z) + (Math.random() - 0.5) * 0.8; a.t = t; }

  updateStreet(dt, t) {
    const g = this.game, P = g.player, p = P.pos;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.cats.length + this.dogs.length < 14) { this.spawnT = 1.5; this.spawnStreetAnimal(p.x, p.z); }
    const vehs = g.vehicles.list;
    for (const list of [this.cats, this.dogs]) {
      for (let li = list.length - 1; li >= 0; li--) {
        const a = list[li];
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        if (d > 130) { this.group.remove(a.g); list.splice(li, 1); continue; }
        // uzaktakiler seyrek güncellenir
        a.lod += dt;
        const step = d > 60 ? 0.25 : d > 35 ? 0.1 : 0;
        if (a.lod < step) continue;
        const ddt = Math.min(0.3, a.lod); a.lod = 0;
        this.think(a, ddt, d, P, vehs);
        this.move(a, ddt, g);
        this.pose(a, ddt, t, d < 45);
      }
    }
  }
  think(a, dt, d, P, vehs) {
    const p = P.pos;
    a.t -= dt; a.sound -= dt; if (a.petted > 0) a.petted -= dt;
    if (a.follow > 0) a.follow -= dt;
    // tehlike: hızla gelen araç
    if (a.state !== 'flee') {
      for (let i = 0; i < vehs.length; i += 1) {
        const v = vehs[i]; if (v.speed < 4) continue;
        const dx = a.x - v.pos.x, dz = a.z - v.pos.z;
        if (Math.abs(dx) > 9 || Math.abs(dz) > 9) continue;
        const ahead = (dx * v.vx + dz * v.vz) / (v.speed * (Math.hypot(dx, dz) || 1));
        if (ahead > 0.5) { const sx = -v.vz, sz = v.vx, side = dx * sx + dz * sz > 0 ? 1 : -1; this.scare(a, a.x - sx * side, a.z - sz * side, 1.5); break; }
      }
      // koşan oyuncu kedileri ürkütür; köpekler havlar
      if (!a.dog && d < 3 && P.speed > 4.5 && a.follow <= 0) this.scare(a, p.x, p.z, 2);
      if (a.dog && d < 8 && P.speed > 4.5 && a.sound <= 0 && a.follow <= 0) { audio.bark(a.x, a.z); a.sound = 4 + Math.random() * 6; a.state = 'stand'; a.t = 1.5; a.barkAt = { x: p.x, z: p.z }; }
    }
    if (!a.dog && a.sound <= 0 && d < 10) { if (Math.random() < 0.2) audio.meow(a.x, a.z); a.sound = 8 + Math.random() * 10; }
    if (a.state === 'flee') { if (a.t <= 0) { a.state = 'walk'; a.t = 2; } return; }
    // takip: oyuncunun 1.5-2.5 m arkasında
    if (a.follow > 0 && !P.vehicle && !P.inInterior && d < 30) {
      if (d > 2.6) { a.state = d > 6 ? 'run' : 'walk'; a.heading = Math.atan2(p.x - a.x, p.z - a.z); a.t = 0.5; }
      else if (a.state === 'walk' || a.state === 'run') { a.state = a.dog ? 'stand' : 'sit'; a.t = 1 + Math.random() * 2; }
      return;
    }
    if (a.t <= 0) {
      const roll = Math.random();
      if (a.dog) a.state = roll < 0.25 ? 'lie' : roll < 0.4 ? 'stand' : roll < 0.9 ? 'walk' : 'run';
      else a.state = roll < 0.25 ? 'sit' : roll < 0.37 ? 'groom' : roll < 0.47 ? 'lie' : roll < 0.92 ? 'walk' : 'run';
      a.t = a.state === 'lie' ? 8 + Math.random() * 12 : 2 + Math.random() * 5;
      a.heading += (Math.random() - 0.5) * 2.2;
    }
  }
  move(a, dt, g) {
    let target = a.state === 'walk' ? (a.dog ? 1.1 : 0.55) : a.state === 'run' ? (a.dog ? 3.2 : 2.2) : a.state === 'flee' ? (a.dog ? 6.5 : 5.5) : 0;
    if (a.hurtT > 0) { a.hurtT -= dt; target *= 0.55; } // yaralı: topallayarak yavaş
    // hız yumuşak değişir: duruş/kalkış geçişi
    a.sp += (target - a.sp) * Math.min(1, dt * (target > a.sp ? 3 : 5));
    if (a.sp < 0.02) { a.sp = 0; }
    else {
      const nx = a.x + Math.sin(a.heading) * a.sp * dt, nz = a.z + Math.cos(a.heading) * a.sp * dt;
      const pp = { x: nx, z: nz };
      const res = g.physics.resolveCircle(pp, a.dog ? 0.3 : 0.18, 0, 0.5, 0.2);
      if (!isLand(pp.x, pp.z) || res.hit) { a.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI * 0.6; a.sp *= 0.5; }
      else { a.x = pp.x; a.z = pp.z; }
    }
    a.g.position.set(a.x, 0, a.z);
    a.g.rotation.y = dampAngle(a.g.rotation.y, a.heading, a.state === 'flee' ? 9 : 4, dt);
  }
  pose(a, dt, t, near) {
    const s = a.size;
    const sitT = a.state === 'sit' || a.state === 'groom' ? 1 : 0, lieT = a.state === 'lie' ? 1 : 0;
    const k = Math.min(1, dt * 3);
    a.sitW += (sitT - a.sitW) * k; a.lieW += (lieT - a.lieW) * Math.min(1, dt * 1.8);
    a.groomW += ((a.state === 'groom' ? 1 : 0) - a.groomW) * k;
    const sw = a.sitW, lw = a.lieW;
    // adım döngüsü: frekans = hız / adım uzunluğu (ayak kaymaz)
    const stride = a.legL * (a.state === 'flee' ? 2.6 : a.sp > 1.6 * s ? 1.9 : 1.25);
    a.cyc = (a.cyc + (a.sp / Math.max(0.05, stride)) * dt) % 1;
    const gallop = a.state === 'flee' && !a.dog;
    const trot = a.sp > 1.5 * s && !gallop;
    const amp = Math.min(0.75, a.sp / (a.dog ? 2.2 : 1.4)) * (1 - sw) * (1 - lw);
    const bounce = Math.abs(Math.sin(a.cyc * Math.PI * 2)) * (trot ? 0.015 : gallop ? 0.035 : 0.006) * Math.min(1, a.sp);
    // gövde: oturunca arka kalça çöker ve gövde yükselir; yatınca yere iner
    a.torso.position.y = a.hipH * (1 - 0.55 * sw - 0.62 * lw) + bounce * s;
    a.torso.rotation.x = -0.62 * sw + 0.04 * lw + (gallop ? Math.sin(a.cyc * Math.PI * 2) * 0.12 : 0);
    a.torso.rotation.z = lw * 0.35 * (a.seed > 5 ? 1 : -1);
    if (near) {
      for (let i = 0; i < 4; i++) {
        const L = a.legs[i];
        // faz: yanal sıralı yürüyüş (LH 0, LF .25, RH .5, RF .75) / tırıs (çaprazlar birlikte) / dörtnala (öndekiler, arkadakiler)
        const ph = gallop ? (L.front ? 0 : 0.5) + (L.sx > 0 ? 0 : 0.08) : trot ? [0, 0.5, 0.5, 0][i] : [0.25, 0.75, 0, 0.5][i];
        const c = (a.cyc + ph) * Math.PI * 2;
        let up = -Math.sin(c) * amp, lo = Math.max(0, Math.cos(c)) * amp * 1.3 * (L.front ? 1 : -1);
        // oturuş: arka bacaklar katlanır, ön bacaklar dik; yatış: hepsi katlanır
        if (!L.front) { up += sw * -1.25 + lw * -1.3; lo += sw * 2.2 + lw * 2.3; }
        else { up += sw * 0.62 + lw * -1.25; lo += lw * 2.2; }
        // yalanma: bir ön pati kalkar
        if (L.front && L.sx > 0 && a.groomW > 0.01) { up += -0.9 * a.groomW; lo += 1.3 * a.groomW; }
        L.up.rotation.x = up; L.lo.rotation.x = lo;
      }
      // kuyruk: kedi dik ve uçta kıvrık, köpek kıvrık ve sallanır
      const wag = a.dog ? Math.sin(t * (a.follow > 0 || a.petted > 0 ? 14 : 5) + a.seed) * (a.follow > 0 || a.petted > 0 ? 0.7 : 0.25) : Math.sin(t * 1.6 + a.seed) * 0.25;
      const T = a.tail;
      if (a.dog) { T[0].rotation.set(-0.9 + 0.5 * lw, 0, wag); T[1].rotation.set(0.5 - 0.4 * lw, 0, wag * 0.5); T[2].rotation.set(0.45 - 0.4 * lw, 0, 0); }
      else {
        const flee = a.state === 'flee' ? 1 : 0;
        T[0].rotation.set(-0.35 - 1.0 * lw - 0.9 * sw - 0.6 * flee, 0, wag * 0.6 + lw * 0.8);
        T[1].rotation.set(-0.15 - 0.5 * lw + 0.3 * sw, 0, wag * 0.6 + lw * 0.8);
        T[2].rotation.set(0.5 + 0.2 * Math.sin(t * 2.3 + a.seed) - 0.3 * lw, 0, lw * 0.6);
      }
    }
    // baş: yürürken hafif sallanır, oturunca etrafa bakar, yalanırken patiye eğilir, yatınca yere
    const look = Math.sin(t * 0.7 + a.seed) * 0.6 * (sw + (a.state === 'stand' ? 1 : 0));
    a.neck.rotation.x = 0.62 * sw * 0.9 + lw * 0.55 + a.groomW * 0.5 + (a.petted > 0 ? Math.sin(t * 6) * 0.15 : 0) + Math.sin(a.cyc * Math.PI * 4) * 0.04 * amp;
    a.neck.rotation.y = look * (1 - a.groomW) + a.groomW * 0.35;
    a.head.rotation.z = a.groomW * Math.sin(t * 7) * 0.2;
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
    this.updateStreet(dt, t);
  }
}
