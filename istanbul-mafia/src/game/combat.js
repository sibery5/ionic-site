// Savaş sistemi: anlık isabet (hitscan), yakın dövüş (bıçak: dürtme/kesme/arkadan/kanama), roket, el bombası,
// patlamalar ve görsel efektler (namlu alevi, kovanlar, izli mermiler, kan gölleri, isabet işaretleri).
import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { buildWeaponModel, buildRocketModel, WEAPONS } from './weapons.js';
import { inBridge } from '../world/map.js';

// NPC mermilerinin oyuncuya verdiği hasar çarpanı (denge: 3 yıldızda birkaç saniyede ölmemek için)
const NPC_TO_PLAYER_DMG = 0.45;

const tmp = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const ZAXIS = new THREE.Vector3(0, 0, 1);
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const SHELL_TYPES = { pistol: 0, rifle: 1, shotgun: 2 };
const SHELL_DIM = [[0.0045, 0.019], [0.0055, 0.042], [0.0105, 0.062]]; // yarıçap, boy
const SHELL_COL = [new THREE.Color(0xd2a043), new THREE.Color(0xc89a3e), new THREE.Color(0xa3161a)];

// Yıldız şeklinde namlu alevi geometrisi (ön yüz + iki yan alev dili), köşe renkleri merkezden dışa söner
function flashGeometry() {
  const geos = [];
  const star = new THREE.Shape();
  const N = 7;
  for (let i = 0; i < N * 2; i++) {
    const a = i / (N * 2) * Math.PI * 2, r = i % 2 ? 0.28 : 1;
    i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  geos.push(new THREE.ShapeGeometry(star));
  // yan alev dili: namlu ekseni (+Z) boyunca uzanan elmas/yıldız
  const tongue = new THREE.Shape();
  tongue.moveTo(0, -0.1); tongue.lineTo(0.32, 0.5); tongue.lineTo(0.12, 0.8); tongue.lineTo(0.22, 1.4); tongue.lineTo(0, 2.6);
  tongue.lineTo(-0.22, 1.4); tongue.lineTo(-0.12, 0.8); tongue.lineTo(-0.32, 0.5); tongue.closePath();
  for (let k = 0; k < 2; k++) {
    const g = new THREE.ShapeGeometry(tongue);
    g.rotateX(Math.PI / 2); // y -> z
    if (k) g.rotateZ(Math.PI / 2);
    geos.push(g);
  }
  // birleştir + köşe rengi
  let count = 0; for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const idx = [];
  let o = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      pos.set([x, y, z], (o + i) * 3);
      const d = Math.min(1, Math.hypot(x, y, z * 0.45));
      const c = Math.pow(1 - d, 1.4);
      col.set([1.6 * c + 0.05, 1.15 * c * c, 0.55 * c * c * c], (o + i) * 3);
    }
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + o);
    o += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

// İzli mermi çizgisi: kuyruk (z=0) karanlık, baş (z=1) parlak çapraz iki ince düzlem
function tracerGeometry() {
  const pos = new Float32Array([
    -0.5, 0, 0, 0.5, 0, 0, 0.5, 0, 1, -0.5, 0, 1,
    0, -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1,
  ]);
  const col = new Float32Array([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return g;
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.scene = null;
    // --- izli mermiler (havuzlu InstancedMesh) ---
    this.tracerMax = 96;
    this.tracers = new THREE.InstancedMesh(tracerGeometry(), new THREE.MeshBasicMaterial({ color: 0xffd9a0, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), this.tracerMax);
    this.tracers.frustumCulled = false;
    this.tracers.renderOrder = 12;
    this.tracerData = [];
    for (let i = 0; i < this.tracerMax; i++) { this.tracers.setMatrixAt(i, ZERO_M); this.tracerData.push({ o: new THREE.Vector3(), d: new THREE.Vector3(), len: 0, head: 0, speed: 0, w: 0.02, on: false }); }
    this.tracerIdx = 0;
    // --- namlu alevleri ---
    const fgeo = flashGeometry();
    this.flashes = [];
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffc888, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(fgeo, mat);
      m.visible = false; m.frustumCulled = false; m.renderOrder = 13;
      this.flashes.push({ m, mat, t: 0, dur: 0.05 });
    }
    this.flashIdx = 0;
    // --- kovanlar ---
    this.shellMax = 80;
    this.shells = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.95, roughness: 0.3 }), this.shellMax);
    this.shells.frustumCulled = false;
    this.shells.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.shellMax * 3).fill(1), 3);
    this.shellData = [];
    for (let i = 0; i < this.shellMax; i++) { this.shells.setMatrixAt(i, ZERO_M); this.shellData.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, delay: 0, actor: null, type: 0, floor: 0, bounces: 0, rest: false }); }
    this.shellIdx = 0;
    // --- ışıklar (sayıları sabit: gölgelendirici yeniden derlenmesin) ---
    this.flashLight = new THREE.PointLight(0xffb060, 0, 14, 2);
    this.flashT = 0;
    this.expLight = new THREE.PointLight(0xff8030, 0, 60, 2);
    this.expT = 0; this.expMax = 0.6; this.expI = 0;
    // --- el bombası yörünge önizlemesi ---
    this.arcN = 48;
    this.arcPos = new Float32Array(this.arcN * 3);
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.arc = new THREE.Line(ag, new THREE.LineDashedMaterial({ color: 0xffe08a, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.85, depthWrite: false }));
    this.arc.frustumCulled = false; this.arc.visible = false; this.arc.renderOrder = 14;
    this.arcMark = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5530, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    this.arcMark.visible = false; this.arcMark.renderOrder = 14;
    // --- kan gölleri, kanamalar ---
    this.pools = [];
    this.bleeding = [];
    this.poolCheckT = 0;
    this.whizT = 0;
    this.sndBudget = 0;
    this.hitMarkFrame = false;
    this.bulletHit = new THREE.Vector3();
    // ayak sesi yüzeyi kancası (audio.step bunu kullanır)
    audio.surfaceAt = (x, z) => this.surfaceAt(x, z);
    this.attach(game.scene);
  }

  attach(scene) {
    if (this.scene && this.scene !== scene) this.clearTransient();
    this.scene = scene;
    scene.add(this.tracers); scene.add(this.shells); scene.add(this.flashLight); scene.add(this.expLight);
    scene.add(this.arc); scene.add(this.arcMark);
    for (const f of this.flashes) scene.add(f.m);
    for (const p of this.projectiles) scene.add(p.mesh);
  }
  clearTransient() {
    for (let i = 0; i < this.tracerMax; i++) { this.tracerData[i].on = false; this.tracers.setMatrixAt(i, ZERO_M); }
    this.tracers.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.shellMax; i++) { this.shellData[i].life = 0; this.shells.setMatrixAt(i, ZERO_M); }
    this.shells.instanceMatrix.needsUpdate = true;
    for (const f of this.flashes) f.m.visible = false;
    this.pools.length = 0;
    this.bleeding.length = 0;
  }
  reset() {
    for (const p of this.projectiles) p.mesh.parent && p.mesh.parent.remove(p.mesh);
    this.projectiles = [];
    this.clearTransient();
    this.flashLight.intensity = 0; this.expLight.intensity = 0; this.expT = 0;
  }

  actors() { return this.game.allActors(); }

  // ---------------- görsel yardımcılar ----------------
  addTracer(a, b, w = 0.02) {
    const len = a.distanceTo(b);
    if (len < 0.5) return;
    const t = this.tracerData[this.tracerIdx]; this.tracerIdx = (this.tracerIdx + 1) % this.tracerMax;
    t.o.copy(a); t.d.copy(b).sub(a).divideScalar(len);
    t.len = len; t.speed = 380 + Math.random() * 80; t.head = Math.min(len, 3 + Math.random() * 3); t.w = w; t.on = true;
  }
  // eski arayüz: kurşun izi (duvar normali ile)
  addDecal(p, n) { this.game.particles.bulletHole(p, n); }
  flash(p) { this.flashLight.position.copy(p); this.flashLight.intensity = 6; this.flashT = 0.05; }

  // Namlu alevi + ışık + duman + kovan atma (actor.tryFire çağırır)
  muzzleFlash(attacker, muzzle, dir, def) {
    const g = this.game;
    const k = def.flash || 1;
    const f = this.flashes[this.flashIdx]; this.flashIdx = (this.flashIdx + 1) % this.flashes.length;
    f.m.position.copy(muzzle);
    _q.setFromUnitVectors(ZAXIS, dir);
    _q2.setFromAxisAngle(ZAXIS, Math.random() * Math.PI * 2);
    f.m.quaternion.copy(_q).multiply(_q2);
    const s = 0.11 * k * (0.8 + Math.random() * 0.45);
    f.m.scale.set(s, s, s * (0.7 + Math.random() * 0.6));
    f.m.visible = true; f.t = 0; f.dur = 0.035 + 0.02 * Math.min(1.5, k); f.mat.opacity = 1;
    this.flashLight.position.copy(muzzle).addScaledVector(dir, 0.35);
    this.flashLight.intensity = 4 + k * 6; this.flashT = 0.06;
    g.particles.muzzle(muzzle, dir, k);
    if (def.type === 'launcher') { tmp.copy(dir).negate(); _a.copy(muzzle).addScaledVector(dir, -1.1); g.particles.backblast(_a, tmp); }
    if (def.shell && this.nearCamera(attacker.pos, 40)) this.ejectShell(attacker, def);
  }
  nearCamera(p, r) { const c = this.game.camera.position; const dx = p.x - c.x, dz = p.z - c.z; return dx * dx + dz * dz < r * r; }

  ejectShell(attacker, def) {
    const s = this.shellData[this.shellIdx];
    const i = this.shellIdx; this.shellIdx = (this.shellIdx + 1) % this.shellMax;
    s.actor = attacker; s.type = SHELL_TYPES[def.shell] || 0; s.delay = def.shellDelay || 0; s.life = 7 + s.delay; s.bounces = 0; s.rest = false;
    this.shells.instanceColor.setXYZ(i, SHELL_COL[s.type].r, SHELL_COL[s.type].g, SHELL_COL[s.type].b);
    this.shells.instanceColor.needsUpdate = true;
    if (!s.delay) this.spawnShell(s);
    else this.shells.setMatrixAt(i, ZERO_M);
  }
  spawnShell(s) {
    const a = s.actor;
    const wm = a.model && a.model.weaponMesh;
    if (wm && wm.userData.ejector) wm.userData.ejector.getWorldPosition(s.p);
    else s.p.set(a.pos.x, a.pos.y + 1.4, a.pos.z);
    const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
    const rx = -fz, rz = fx;
    const sp = 1.6 + Math.random() * 1.2;
    s.v.set(rx * sp + fx * (Math.random() - 0.6) * 0.8 + (a.vx || 0) * 0.8, 1.8 + Math.random() * 1.4, rz * sp + fz * (Math.random() - 0.6) * 0.8 + (a.vz || 0) * 0.8);
    s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    s.w.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 40);
    s.floor = (a.pos.y || 0) + 0.006;
  }

  // ---------------- ışın testleri ----------------
  rayActors(origin, dir, maxD, ignore) {
    let best = null, bt = maxD, head = false;
    const list = this.actors();
    for (let n = 0; n < list.length; n++) {
      const a = list[n];
      if (a === ignore || a.dead || a.vehicle || a.inInteriorOther) continue;
      const cr = a.crouch ? 0.3 : 0;
      for (let k = 0; k < 3; k++) {
        const h = k === 0 ? 1.65 - cr : k === 1 ? 1.15 - cr : 0.55;
        const r = k === 0 ? 0.16 : k === 1 ? 0.38 : 0.3;
        const cx = a.pos.x, cy = a.pos.y + h, cz = a.pos.z;
        const ox = origin.x - cx, oy = origin.y - cy, oz = origin.z - cz;
        const b = ox * dir.x + oy * dir.y + oz * dir.z;
        const c = ox * ox + oy * oy + oz * oz - r * r;
        const disc = b * b - c;
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < bt) { bt = t; best = a; head = k === 0; }
      }
    }
    return best ? { actor: best, t: bt, head } : null;
  }

  rayVehicles(origin, dir, maxD, ignoreV) {
    let best = null, bt = maxD;
    for (const v of this.game.vehicles.list) {
      if (v === ignoreV) continue;
      const dx = v.pos.x - origin.x, dz = v.pos.z - origin.z;
      if (dx * dx + dz * dz > (maxD + 6) ** 2) continue;
      const c = Math.cos(-v.heading), s = Math.sin(-v.heading);
      const lx = (origin.x - v.pos.x), lz = (origin.z - v.pos.z);
      const ox = lx * c + lz * s, oz = -lx * s + lz * c;
      const ddx = dir.x * c + dir.z * s, ddz = -dir.x * s + dir.z * c;
      const hw = v.def.wid / 2, hl = v.def.len / 2;
      const r = rayBoxLocal(ox, origin.y, oz, ddx, dir.y, ddz, -hw, hw, v.pos.y + 0.2, v.pos.y + v.def.hei, -hl, hl);
      if (r !== null && r < bt) { bt = r; best = v; }
    }
    return best ? { vehicle: best, t: bt } : null;
  }

  // yüzey türü (isabet efekti ve ayak sesi için)
  surfaceAt(x, z) {
    const g = this.game;
    if (g.player && g.player.inInterior) return 'wood';
    if (g.physics.inWater(x, z)) return 'water';
    if (inBridge(x, z)) return 'metal';
    const parks = g.map && g.map.parks;
    if (parks) for (let i = 0; i < parks.length; i++) { const b = parks[i]; if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return 'grass'; }
    return 'concrete';
  }

  playerHit() {
    if (this.hitMarkFrame) return;
    this.hitMarkFrame = true;
    this.game.ui.hitMarker && this.game.ui.hitMarker();
  }

  hitscan(attacker, origin, dir, def, muzzle) {
    const g = this.game;
    const maxD = def.range;
    const st = g.physics.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxD);
    let t = st ? st.t : maxD;
    const ah = this.rayActors(origin, dir, t, attacker);
    if (ah) t = ah.t;
    const vh = this.rayVehicles(origin, dir, t, attacker.vehicle);
    if (vh) t = vh.t;
    const hp = _hp.set(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
    this.addTracer(muzzle || origin, hp, def.pellets ? 0.012 : def.sound === 'sniper' ? 0.03 : 0.02);
    if (!attacker.isPlayer) this.whizCheck(origin, dir, t, def, ah && ah.actor.isPlayer);
    const loud = this.sndBudget-- > 0;
    if (vh) {
      vh.vehicle.damage(def.dmg * 1.2, attacker);
      _n.copy(dir).negate();
      g.particles.impact(hp, _n, 'metal', dir);
      if (loud) audio.impactMetal(hp.x, hp.z);
      if (attacker.isPlayer) g.wanted.onAttackVehicle(vh.vehicle);
    } else if (ah) {
      const target = ah.actor;
      let dmg = def.dmg;
      if (target.isPlayer && !attacker.isPlayer) dmg *= NPC_TO_PLAYER_DMG;
      target.takeDamage(dmg, attacker, 'bullet', ah.head);
      this.fleshFx(target, hp, dir, ah.head ? 1.6 : 1, loud);
      if (attacker.isPlayer) this.playerHit();
      if (target.isPlayer) g.ui.damageFlash(attacker);
    } else if (st) {
      _n.set(st.nx, st.ny, st.nz);
      const surf = st.box === 'water' ? 'water' : st.box === 'ground' ? (this.surfaceAt(hp.x, hp.z) === 'grass' ? 'dirt' : 'concrete') : st.box === 'ceiling' ? 'concrete' : 'concrete';
      g.particles.impact(hp, _n, surf, dir);
      if (surf !== 'water') g.particles.bulletHole(hp, _n, surf);
      if (loud) {
        if (surf === 'water') audio.splash(hp.x, hp.z, 0.25);
        else { audio.impact(hp.x, hp.z, surf); if (Math.random() < 0.22) audio.ricochet(hp.x, hp.z); }
      }
    }
  }

  // Kurşun dinleyicinin yakınından geçtiyse vızıltı / süpersonik çatırtı
  whizCheck(origin, dir, t, def, hitPlayer) {
    const g = this.game;
    if (hitPlayer || this.whizT > 0 || !g.player || g.player.dead) return;
    const L = g.player.pos;
    const lx = L.x - origin.x, ly = L.y + 1.5 - origin.y, lz = L.z - origin.z;
    const s = lx * dir.x + ly * dir.y + lz * dir.z;
    if (s < 3 || s > t + 1) return;
    const cx = lx - dir.x * s, cy = ly - dir.y * s, cz = lz - dir.z * s;
    const d = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (d > 3) return;
    this.whizT = 0.07;
    // geçiş noktası dinleyicinin solunda/sağında
    audio.whiz(1 - d / 3, -cx, -cz, def.sound === 'rifle' || def.sound === 'sniper');
  }

  // Et isabeti: yönlü kan, duvara sıçrayan kan, ses, ölüm halinde kan gölü
  fleshFx(target, hp, dir, k = 1, loud = true) {
    const g = this.game;
    const fy = target.pos.y;
    g.particles.bloodSpray(hp, dir, Math.round(9 * k), fy + 0.005, k);
    // arkadaki duvara kan
    const w = g.physics.raycast(hp.x, hp.y, hp.z, dir.x, dir.y, dir.z, 2.6);
    if (w && w.box !== 'water') {
      _a.set(hp.x + dir.x * w.t, hp.y + dir.y * w.t, hp.z + dir.z * w.t);
      _b.set(w.nx, w.ny, w.nz);
      g.particles.bloodSplat(_a, _b, 0.35 + Math.random() * 0.35 * k, w.ny > 0.5 ? 1 : 1.4);
    }
    if (loud) audio.bulletFlesh(hp.x, hp.z);
    if (target.dead) this.startPool(target);
  }

  startPool(a) {
    if (a._bloodPool || a.swimming) return;
    a._bloodPool = true;
    const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
    const g = this.game;
    if (g.physics.inWater(a.pos.x, a.pos.z)) return;
    const idx = g.particles.bloodPool(a.pos.x - fx * 0.45, a.pos.y, a.pos.z - fz * 0.45, 1.1 + Math.random() * 0.6, 8 + Math.random() * 5);
    this.pools.push({ a, idx });
  }

  // kanama: saniyede dps hasar, t saniye; damlalar yere iz bırakır
  applyBleed(target, attacker, dps, t) {
    if (target.dead) return;
    if (target.isPlayer) t = Math.min(t, 2);
    for (const b of this.bleeding) if (b.a === target) { b.t = Math.max(b.t, t); b.dps = Math.max(b.dps, dps); return; }
    this.bleeding.push({ a: target, attacker, dps, t, drip: 0 });
  }

  // ---------------- yakın dövüş ----------------
  melee(attacker, def) {
    const g = this.game;
    const f = { x: Math.sin(attacker.heading), z: Math.cos(attacker.heading) };
    const knife = def === WEAPONS.knife;
    attacker._combo = (attacker._combo || 0) + 1;
    const slash = knife && attacker._combo % 2 === 0;
    const minDot = slash ? (def.slashArc || 0.1) : knife ? 0.55 : 0.4;
    const reach = def.range + (slash ? 0.5 : 0.4);
    const hits = [];
    const list = this.actors();
    for (let n = 0; n < list.length; n++) {
      const a = list[n];
      if (a === attacker || a.dead || a.vehicle) continue;
      const dx = a.pos.x - attacker.pos.x, dz = a.pos.z - attacker.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > reach || Math.abs(a.pos.y - attacker.pos.y) > 1.2) continue;
      if ((dx * f.x + dz * f.z) / (d || 1) < minDot) continue;
      hits.push({ a, d });
    }
    hits.sort((p, q) => p.d - q.d);
    const maxHits = slash ? 2 : 1;
    const strength = attacker.isPlayer && g.state ? 1 + g.state.stats.strength * 0.01 : 1;
    for (let h = 0; h < Math.min(maxHits, hits.length); h++) {
      const best = hits[h].a;
      let dmg = (knife ? (slash ? def.slash : def.stab) : def.dmg) * strength;
      // arkadan saldırı: hedefin baktığı yön ile saldırgana yön zıtsa
      let back = false;
      if (knife && attacker.isPlayer) {
        const tx = Math.sin(best.heading), tz = Math.cos(best.heading);
        const ax = attacker.pos.x - best.pos.x, az = attacker.pos.z - best.pos.z, al = Math.hypot(ax, az) || 1;
        if ((tx * ax + tz * az) / al < -0.3) { back = true; dmg *= def.backstab || 3; }
      }
      best.takeDamage(dmg, attacker, 'melee', false);
      tmp.set(best.pos.x, best.pos.y + 1.25, best.pos.z);
      if (knife) {
        // kesme: savuruş yönünde (sağdan sola), dürtme: ileri
        if (slash) _a.set(f.z, 0.1, -f.x); else _a.set(f.x, 0.05, f.z);
        g.particles.bloodSpray(tmp, _a, back ? 16 : 10, best.pos.y + 0.005, back ? 1.4 : 1);
        audio.fleshHit(best.pos.x, best.pos.z, back ? 1.3 : 1);
        if (def.bleed) this.applyBleed(best, attacker, def.bleed.dps * (back ? 1.5 : 1), def.bleed.t * (slash ? 1 : 0.5));
        if (back && attacker.isPlayer) g.ui.notify && Math.random() < 0.3 && g.ui.notify('Arkadan bıçaklama!', 'good');
      } else {
        audio.punch(best.pos.x, best.pos.z, attacker.weapon === 'bat' ? 1.4 : 1);
        if (attacker.weapon !== 'fists') g.particles.blood(tmp, 6, null, best.pos.y + 0.005);
      }
      const kb = def.knockback || 3;
      best.knock = { x: f.x * kb, z: f.z * kb, t: 0.2 };
      if (best.dead) this.startPool(best);
      if (best.isPlayer) g.ui.damageFlash(attacker);
      if (attacker.isPlayer) this.playerHit();
    }
    if (hits.length) this.noise(attacker.pos.x, attacker.pos.z, 20, attacker);
  }

  // ---------------- mermiler ----------------
  rocket(attacker, from, dir, def) {
    const mesh = buildRocketModel();
    mesh.position.copy(from);
    mesh.lookAt(from.x + dir.x, from.y + dir.y, from.z + dir.z);
    this.game.activeScene().add(mesh);
    this.projectiles.push({ kind: 'rocket', mesh, pos: from.clone(), prev: from.clone(), vel: dir.clone().multiplyScalar(55), life: 6, attacker, def, bounceSnd: 0 });
  }

  throwGrenade(attacker, from, dir) {
    const mesh = buildWeaponModel('grenade');
    mesh.scale.setScalar(1.3);
    const p = attacker.pos.clone(); p.y += 1.6;
    mesh.position.copy(p);
    this.game.activeScene().add(mesh);
    const v = dir.clone().multiplyScalar(16); v.y += 4;
    this.projectiles.push({ kind: 'grenade', mesh, pos: p, prev: p.clone(), vel: v, life: 2.6, attacker, def: { dmg: 180, radius: 7 }, bounceSnd: 0 });
    audio.swing('throw');
  }

  explosion(x, y, z, radius, dmg, attacker, sourceV) {
    const g = this.game;
    const sc = radius / 7;
    const water = g.physics.inWater(x, z) && y < 0.5;
    const floorY = g.physics.groundAt(x, z) > -1 ? g.physics.groundAt(x, z) : -1.4;
    g.particles.explosion({ x, y, z }, sc, { floorY: water ? -1.4 : floorY, water });
    if (!water && y - floorY < 2.5) g.particles.scorchMark(x, floorY, z, radius * 0.9);
    audio.explosion(x, z, sc);
    this.expLight.position.set(x, y + 2, z); this.expI = 28 * sc; this.expLight.intensity = this.expI; this.expT = this.expMax;
    const pd = Math.hypot(g.player.pos.x - x, g.player.pos.z - z);
    g.cameraShake(Math.min(1.6, Math.max(0, 1.3 - pd / (55 * Math.max(0.6, sc)))));
    const list = this.actors();
    for (let n = 0; n < list.length; n++) {
      const a = list[n];
      if (a.dead || a.vehicle) continue;
      const d = Math.hypot(a.pos.x - x, a.pos.y + 1 - y, a.pos.z - z);
      if (d < radius) {
        const k = 1 - d / radius;
        a.takeDamage(dmg * k, attacker, 'explosion');
        if (!a.dead) a.knock = { x: (a.pos.x - x) / (d || 1) * 8 * k, z: (a.pos.z - z) / (d || 1) * 8 * k, t: 0.3 };
        else {
          tmp.set(a.pos.x, a.pos.y + 1, a.pos.z);
          _a.set(a.pos.x - x, 0.6, a.pos.z - z).normalize();
          g.particles.bloodSpray(tmp, _a, 14, a.pos.y + 0.005, 1.5);
          this.startPool(a);
        }
        if (a.isPlayer) g.ui.damageFlash(attacker);
        else if (attacker && attacker.isPlayer) this.playerHit();
      }
    }
    for (const v of g.vehicles.list) {
      if (v === sourceV || v.destroyed) continue;
      const d = Math.hypot(v.pos.x - x, v.pos.z - z);
      if (d < radius * 1.3) {
        const k = 1 - d / (radius * 1.3);
        v.damage(dmg * 8 * k, attacker);
        v.vx += (v.pos.x - x) / (d || 1) * 10 * k; v.vz += (v.pos.z - z) / (d || 1) * 10 * k;
      }
    }
    this.noise(x, z, 150, attacker);
    if (attacker && attacker.isPlayer) g.wanted.crime('explosion', { x, z });
  }

  // silah sesleri vs: NPC'leri uyar
  noise(x, z, radius, source) {
    const g = this.game;
    for (const n of g.npcs.list) {
      if (n.dead) continue;
      const d = Math.hypot(n.pos.x - x, n.pos.z - z);
      if (d < radius) n.hearThreat && n.hearThreat(source, d);
    }
    if (source && source.isPlayer) g.wanted.onPlayerNoise(x, z, radius);
  }

  // ---------------- el bombası yörünge önizlemesi ----------------
  updateArc() {
    const g = this.game, pl = g.player;
    const show = pl && !pl.dead && !pl.vehicle && pl.weapon === 'grenade' && pl.aiming && pl.aimPoint;
    this.arc.visible = !!show; this.arcMark.visible = false;
    if (!show) return;
    _a.set(pl.pos.x, pl.pos.y + 1.45 - (pl.crouch ? 0.3 : 0), pl.pos.z);
    _b.copy(pl.aimPoint).sub(_a).normalize().multiplyScalar(16); _b.y += 4;
    _a.set(pl.pos.x, pl.pos.y + 1.6, pl.pos.z);
    const dt = 1 / 30;
    let n = 0, landed = false;
    for (; n < this.arcN; n++) {
      this.arcPos[n * 3] = _a.x; this.arcPos[n * 3 + 1] = _a.y; this.arcPos[n * 3 + 2] = _a.z;
      if (landed) continue;
      _b.y -= 18 * dt;
      const len = _b.length() * dt;
      tmp.copy(_b).divideScalar(_b.length() || 1);
      const h = g.physics.raycast(_a.x, _a.y, _a.z, tmp.x, tmp.y, tmp.z, len);
      if (h) {
        _a.addScaledVector(tmp, h.t);
        landed = true;
        this.arcMark.position.set(_a.x, _a.y + 0.03, _a.z);
        this.arcMark.visible = true;
        if (h.ny < 0.5) { this.arcMark.position.y = Math.max(0, _a.y - 1); }
      } else _a.addScaledVector(_b, dt);
    }
    this.arc.geometry.attributes.position.needsUpdate = true;
    this.arc.computeLineDistances();
  }

  // ---------------- kare güncellemesi ----------------
  update(dt) {
    const g = this.game;
    this.hitMarkFrame = false;
    this.sndBudget = 3;
    this.whizT -= dt;
    // izli mermiler
    let any = false;
    for (let i = 0; i < this.tracerMax; i++) {
      const t = this.tracerData[i];
      if (!t.on) continue;
      any = true;
      t.head += t.speed * dt;
      const streak = Math.min(7, t.len * 0.6);
      const tail = Math.max(0, t.head - streak);
      if (tail >= t.len) { t.on = false; this.tracers.setMatrixAt(i, ZERO_M); continue; }
      const head = Math.min(t.len, t.head);
      _a.copy(t.o).addScaledVector(t.d, tail);
      _q.setFromUnitVectors(ZAXIS, t.d);
      _s.set(t.w, t.w, Math.max(0.01, head - tail));
      _m.compose(_a, _q, _s);
      this.tracers.setMatrixAt(i, _m);
    }
    if (any) this.tracers.instanceMatrix.needsUpdate = true;
    // namlu alevleri
    for (const f of this.flashes) {
      if (!f.m.visible) continue;
      f.t += dt;
      if (f.t >= f.dur) f.m.visible = false; else f.mat.opacity = 1 - f.t / f.dur * 0.6;
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; }
    if (this.expT > 0) {
      this.expT -= dt;
      const k = Math.max(0, this.expT / this.expMax);
      this.expLight.intensity = this.expI * k * k * (0.8 + Math.random() * 0.4);
      this.expLight.color.setRGB(1, 0.45 + 0.25 * k, 0.15 + 0.15 * k);
      if (this.expT <= 0) this.expLight.intensity = 0;
    }
    this.updateShells(dt);
    this.updateProjectiles(dt);
    this.updateArc();
    // kanamalar
    for (let i = this.bleeding.length - 1; i >= 0; i--) {
      const b = this.bleeding[i];
      b.t -= dt;
      if (b.t <= 0 || b.a.dead) { if (b.a.dead) this.startPool(b.a); this.bleeding[i] = this.bleeding[this.bleeding.length - 1]; this.bleeding.pop(); continue; }
      b.a.takeDamage(b.dps * dt, b.attacker, 'bleed');
      if (b.a.dead) this.startPool(b.a);
      b.drip -= dt;
      if (b.drip <= 0) { b.drip = 0.18 + Math.random() * 0.2; tmp.set(b.a.pos.x + (Math.random() - 0.5) * 0.2, b.a.pos.y + 0.9, b.a.pos.z + (Math.random() - 0.5) * 0.2); g.particles.blood(tmp, 2, null, b.a.pos.y + 0.005); }
    }
    // kan gölleri: ceset kaldırılınca sönsün; ateşli silahla ölmeyen cesetlere de göl
    this.poolCheckT -= dt;
    if (this.poolCheckT <= 0) {
      this.poolCheckT = 0.5;
      const list = this.actors();
      for (let i = this.pools.length - 1; i >= 0; i--) {
        const p = this.pools[i];
        if (list.indexOf(p.a) < 0 || !p.a.dead || (p.a.removeT !== undefined && p.a.removeT < 2)) { g.particles.pools.expire(p.idx, 4); this.pools.splice(i, 1); }
      }
      for (let i = 0; i < list.length; i++) { const a = list[i]; if (a.dead && !a._bloodPool && a.lastAttacker) this.startPool(a); if (!a.dead && a._bloodPool) a._bloodPool = false; }
    }
    // gece/gündüz: duman ve kan parlaklığı
    if (g.env) g.particles.setLight(g.player && g.player.inInterior ? 0.8 : 1 - g.env.nightFactor);
    // ses: ortam, rüzgâr, lastik, dinleyici yönü (ses motorunun kare kancası)
    audio.update(dt, g);
  }

  updateShells(dt) {
    let any = false;
    for (let i = 0; i < this.shellMax; i++) {
      const s = this.shellData[i];
      if (s.life <= 0) continue;
      any = true;
      s.life -= dt;
      if (s.delay > 0) { s.delay -= dt; if (s.delay <= 0) this.spawnShell(s); continue; }
      if (s.life <= 0) { this.shells.setMatrixAt(i, ZERO_M); continue; }
      if (!s.rest) {
        s.v.y -= 13 * dt;
        s.p.addScaledVector(s.v, dt);
        s.r.addScaledVector(s.w, dt);
        if (s.p.y < s.floor) {
          s.p.y = s.floor;
          if (s.bounces < 3 && s.v.y < -0.8) audio.shell(s.p.x, s.p.z, s.type === 2, Math.min(1, -s.v.y / 4));
          s.bounces++;
          s.v.y *= -0.35; s.v.x *= 0.55; s.v.z *= 0.55; s.w.multiplyScalar(0.5);
          if (Math.abs(s.v.y) < 0.4) { s.rest = true; s.r.x = Math.PI / 2; s.r.z = 0; }
        }
      }
      const dim = SHELL_DIM[s.type];
      const sh = s.life < 0.5 ? s.life / 0.5 : 1;
      _e.set(s.r.x, s.r.y, s.r.z);
      _q.setFromEuler(_e);
      _a.copy(s.p); if (s.rest) _a.y += dim[0];
      _s.set(dim[0] * sh, dim[1] * sh, dim[0] * sh);
      _m.compose(_a, _q, _s);
      this.shells.setMatrixAt(i, _m);
    }
    if (any) this.shells.instanceMatrix.needsUpdate = true;
  }

  updateProjectiles(dt) {
    const g = this.game;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.prev.copy(p.pos);
      if (p.kind === 'grenade') p.vel.y -= 18 * dt;
      p.pos.addScaledVector(p.vel, dt);
      let boom = p.life <= 0;
      tmp.copy(p.pos).sub(p.prev);
      const len = tmp.length();
      if (len > 0) {
        tmp.divideScalar(len);
        const h = g.physics.raycast(p.prev.x, p.prev.y, p.prev.z, tmp.x, tmp.y, tmp.z, len + 0.1);
        if (h) {
          if (p.kind === 'rocket') boom = true;
          else {
            // sekme
            _n.set(h.nx, h.ny, h.nz);
            const sp = p.vel.length();
            p.pos.copy(p.prev).addScaledVector(tmp, Math.max(0, h.t - 0.05));
            p.vel.reflect(_n).multiplyScalar(0.45);
            if (h.box === 'water') { p.vel.set(0, -1, 0); if (p.bounceSnd < 1) { audio.splash(p.pos.x, p.pos.z, 0.4); p.bounceSnd = 1; } }
            else if (sp > 2.5) audio.grenadeBounce(p.pos.x, p.pos.z, Math.min(1, sp / 12));
          }
        }
        if (p.kind === 'rocket') {
          if (this.rayActors(p.prev, tmp, len + 0.3, p.attacker)) boom = true;
          if (this.rayVehicles(p.prev, tmp, len + 0.3, p.attacker.vehicle)) boom = true;
          // egzoz izi: yol boyunca aralıklı
          _b.copy(tmp).negate();
          const steps = Math.min(4, Math.ceil(len / 0.5));
          for (let k = 0; k < steps; k++) { _a.copy(p.prev).addScaledVector(tmp, len * k / steps - 0.35); g.particles.trail(_a, _b, 1); }
          this.flashLight.position.copy(p.pos); this.flashLight.intensity = 5; this.flashT = 0.05;
          p.mesh.rotateZ(dt * 12);
        }
      }
      p.mesh.position.copy(p.pos);
      if (p.kind === 'grenade') { p.mesh.rotation.x += dt * 10 * Math.min(1, p.vel.length() / 3); }
      if (boom) {
        this.explosion(p.pos.x, p.pos.y, p.pos.z, p.def.radius, p.def.dmg, p.attacker, null);
        p.mesh.parent && p.mesh.parent.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
}

function rayBoxLocal(ox, oy, oz, dx, dy, dz, x0, x1, y0, y1, z0, z1) {
  let tmin = 0, tmax = Infinity;
  for (let k = 0; k < 3; k++) {
    const o = k === 0 ? ox : k === 1 ? oy : oz, d = k === 0 ? dx : k === 1 ? dy : dz;
    const lo = k === 0 ? x0 : k === 1 ? y0 : z0, hi = k === 0 ? x1 : k === 1 ? y1 : z1;
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
