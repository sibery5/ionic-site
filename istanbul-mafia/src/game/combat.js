// Savaş sistemi: anlık isabet (hitscan), yakın dövüş, roket, el bombası, patlamalar, efektler.
import * as THREE from 'three';
import { audio } from '../core/audio.js';

const tmp = new THREE.Vector3();

export class Combat {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    // izli mermi çizgileri
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerMax = 64;
    this.tracerPos = new Float32Array(this.tracerMax * 6);
    this.tracerLife = new Float32Array(this.tracerMax);
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(this.tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
    this.tracers.frustumCulled = false;
    this.tracerIdx = 0;
    // kurşun izleri
    this.decalMax = 80;
    this.decals = new THREE.InstancedMesh(new THREE.CircleGeometry(0.06, 6), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }), this.decalMax);
    this.decals.count = 0;
    this.decalIdx = 0;
    this.decals.frustumCulled = false;
    // namlu ışığı
    this.flashLight = new THREE.PointLight(0xffc070, 0, 12, 2);
    this.flashT = 0;
    this.expLight = new THREE.PointLight(0xff8030, 0, 40, 2);
    this.expT = 0;
    this.grenadeGeo = new THREE.SphereGeometry(0.07, 8, 6);
    this.rocketGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6).rotateX(Math.PI / 2);
    this.projMat = new THREE.MeshStandardMaterial({ color: 0x4a5a30 });
    this.attach(game.scene);
  }

  attach(scene) {
    scene.add(this.tracers); scene.add(this.decals); scene.add(this.flashLight); scene.add(this.expLight);
    for (const p of this.projectiles) scene.add(p.mesh);
  }
  reset() {
    for (const p of this.projectiles) p.mesh.parent && p.mesh.parent.remove(p.mesh);
    this.projectiles = [];
    this.decals.count = 0;
    this.tracerLife.fill(0);
  }

  actors() { return this.game.allActors(); }

  addTracer(a, b) {
    const i = this.tracerIdx; this.tracerIdx = (this.tracerIdx + 1) % this.tracerMax;
    this.tracerPos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    this.tracerLife[i] = 0.06;
  }
  addDecal(p, n) {
    const i = this.decalIdx; this.decalIdx = (this.decalIdx + 1) % this.decalMax;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    m.compose(new THREE.Vector3(p.x + n.x * 0.01, p.y + n.y * 0.01, p.z + n.z * 0.01), q, new THREE.Vector3(1, 1, 1));
    this.decals.setMatrixAt(i, m);
    this.decals.count = Math.max(this.decals.count, i + 1);
    this.decals.instanceMatrix.needsUpdate = true;
  }
  flash(p) { this.flashLight.position.copy(p); this.flashLight.intensity = 6; this.flashT = 0.05; }

  // ışın - karakter testi
  rayActors(origin, dir, maxD, ignore) {
    let best = null, bt = maxD, head = false;
    for (const a of this.actors()) {
      if (a === ignore || a.dead || a.vehicle || a.inInteriorOther) continue;
      // gövde ve kafa küreleri
      for (const [h, r, isHead] of [[1.65 - (a.crouch ? 0.3 : 0), 0.16, true], [1.15 - (a.crouch ? 0.3 : 0), 0.38, false], [0.55, 0.3, false]]) {
        const cx = a.pos.x, cy = a.pos.y + h, cz = a.pos.z;
        const ox = origin.x - cx, oy = origin.y - cy, oz = origin.z - cz;
        const b = ox * dir.x + oy * dir.y + oz * dir.z;
        const c = ox * ox + oy * oy + oz * oz - r * r;
        const disc = b * b - c;
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < bt) { bt = t; best = a; head = isHead; }
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
      // araç yerel uzayına dönüştür
      const c = Math.cos(-v.heading), s = Math.sin(-v.heading);
      const lx = (origin.x - v.pos.x), lz = (origin.z - v.pos.z);
      const ox = lx * c + lz * s, oz = -lx * s + lz * c;
      const ddx = dir.x * c + dir.z * s, ddz = -dir.x * s + dir.z * c;
      const hw = v.def.wid / 2, hl = v.def.len / 2;
      const box = { x0: -hw, x1: hw, y0: v.pos.y + 0.2, y1: v.pos.y + v.def.hei, z0: -hl, z1: hl };
      const r = rayBoxLocal(ox, origin.y, oz, ddx, dir.y, ddz, box);
      if (r !== null && r < bt) { bt = r; best = v; }
    }
    return best ? { vehicle: best, t: bt } : null;
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
    const hp = new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
    this.addTracer(muzzle || origin, hp);
    if (vh) {
      vh.vehicle.damage(def.dmg * 1.2, attacker);
      g.particles.sparks(hp, 4);
      audio.impact(hp.x, hp.z);
      if (attacker.isPlayer) g.wanted.onAttackVehicle(vh.vehicle);
    } else if (ah) {
      const target = ah.actor;
      target.takeDamage(def.dmg, attacker, 'bullet', ah.head);
      g.particles.blood(hp, ah.head ? 14 : 8);
      if (target.isPlayer) g.ui.damageFlash(attacker);
    } else if (st) {
      if (st.box === 'water') { g.particles.splash(hp); }
      else {
        g.particles.sparks(hp, 3);
        audio.impact(hp.x, hp.z);
        this.addDecal(hp, new THREE.Vector3(st.nx, st.ny, st.nz));
      }
    }
  }

  melee(attacker, def) {
    const f = { x: Math.sin(attacker.heading), z: Math.cos(attacker.heading) };
    let best = null, bd = def.range + 0.4;
    for (const a of this.actors()) {
      if (a === attacker || a.dead || a.vehicle) continue;
      const dx = a.pos.x - attacker.pos.x, dz = a.pos.z - attacker.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(a.pos.y - attacker.pos.y) > 1.2) continue;
      if ((dx * f.x + dz * f.z) / (d || 1) < 0.4) continue;
      best = a; bd = d;
    }
    if (best) {
      const dmg = def.dmg * (attacker.isPlayer && this.game.state ? 1 + this.game.state.stats.strength * 0.01 : 1);
      best.takeDamage(dmg, attacker, 'melee');
      audio.punch(best.pos.x, best.pos.z);
      tmp.set(best.pos.x, best.pos.y + 1.3, best.pos.z);
      if (attacker.weapon !== 'fists') this.game.particles.blood(tmp, 6);
      best.knock = { x: f.x * 3, z: f.z * 3, t: 0.2 };
      if (best.isPlayer) this.game.ui.damageFlash(attacker);
      this.noise(attacker.pos.x, attacker.pos.z, 20, attacker);
    }
  }

  rocket(attacker, from, dir, def) {
    const mesh = new THREE.Mesh(this.rocketGeo, this.projMat);
    mesh.position.copy(from);
    mesh.lookAt(from.x + dir.x, from.y + dir.y, from.z + dir.z);
    this.game.activeScene().add(mesh);
    this.projectiles.push({ kind: 'rocket', mesh, pos: from.clone(), vel: dir.clone().multiplyScalar(55), life: 6, attacker, def });
  }

  throwGrenade(attacker, from, dir) {
    const mesh = new THREE.Mesh(this.grenadeGeo, this.projMat);
    const p = attacker.pos.clone(); p.y += 1.6;
    mesh.position.copy(p);
    this.game.activeScene().add(mesh);
    const v = dir.clone().multiplyScalar(16); v.y += 4;
    this.projectiles.push({ kind: 'grenade', mesh, pos: p, vel: v, life: 2.6, attacker, def: { dmg: 180, radius: 7 } });
    audio.swing();
  }

  explosion(x, y, z, radius, dmg, attacker, sourceV) {
    const g = this.game;
    g.particles.explosion({ x, y, z }, radius / 7);
    audio.explosion(x, z);
    this.expLight.position.set(x, y + 2, z); this.expLight.intensity = 60; this.expT = 0.35;
    const pd = Math.hypot(g.player.pos.x - x, g.player.pos.z - z);
    g.cameraShake(Math.max(0, 1 - pd / 60));
    for (const a of this.actors()) {
      if (a.dead) continue;
      const d = Math.hypot(a.pos.x - x, a.pos.y + 1 - y, a.pos.z - z);
      if (d < radius && (a.vehicle ? true : true)) {
        const k = 1 - d / radius;
        if (a.vehicle) continue;
        a.takeDamage(dmg * k, attacker, 'explosion');
        if (!a.dead) a.knock = { x: (a.pos.x - x) / (d || 1) * 8 * k, z: (a.pos.z - z) / (d || 1) * 8 * k, t: 0.3 };
        if (a.isPlayer) g.ui.damageFlash(attacker);
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

  update(dt) {
    const g = this.game;
    for (let i = 0; i < this.tracerMax; i++) {
      if (this.tracerLife[i] > 0) { this.tracerLife[i] -= dt; if (this.tracerLife[i] <= 0) this.tracerPos.fill(0, i * 6, i * 6 + 6); }
    }
    this.tracerGeo.attributes.position.needsUpdate = true;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; }
    if (this.expT > 0) { this.expT -= dt; this.expLight.intensity = Math.max(0, this.expT / 0.35) * 60; }
    for (const p of this.projectiles.slice()) {
      p.life -= dt;
      const prev = p.pos.clone();
      if (p.kind === 'grenade') p.vel.y -= 18 * dt;
      p.pos.addScaledVector(p.vel, dt);
      let boom = p.life <= 0;
      // çarpışma
      const seg = p.pos.clone().sub(prev);
      const len = seg.length();
      if (len > 0) {
        seg.divideScalar(len);
        const h = g.physics.raycast(prev.x, prev.y, prev.z, seg.x, seg.y, seg.z, len + 0.1);
        if (h) {
          if (p.kind === 'rocket') boom = true;
          else {
            // sekme
            const n = new THREE.Vector3(h.nx, h.ny, h.nz);
            p.pos.copy(prev).addScaledVector(seg, Math.max(0, h.t - 0.05));
            p.vel.reflect(n).multiplyScalar(0.45);
            if (h.box === 'water') { p.vel.set(0, -1, 0); }
          }
        }
        if (p.kind === 'rocket') {
          if (this.rayActors(prev, seg, len + 0.3, p.attacker)) boom = true;
          if (this.rayVehicles(prev, seg, len + 0.3, p.attacker.vehicle)) boom = true;
          g.particles.smoke(p.pos, 0.6);
          g.particles.add.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.1, 0.4, 1, 0.6, 0.2);
        }
      }
      p.mesh.position.copy(p.pos);
      if (p.kind === 'grenade') p.mesh.rotation.x += dt * 10;
      if (boom) {
        g.combat.explosion(p.pos.x, p.pos.y, p.pos.z, p.def.radius, p.def.dmg, p.attacker, null);
        p.mesh.parent && p.mesh.parent.remove(p.mesh);
        this.projectiles.splice(this.projectiles.indexOf(p), 1);
      }
    }
  }
}

function rayBoxLocal(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const ax = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  for (const [o, d, lo, hi] of ax) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
