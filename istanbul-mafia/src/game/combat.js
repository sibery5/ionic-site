// Savaş sistemi: anlık isabet (hitscan), yakın dövüş (bıçak: dürtme/kesme/arkadan/kanama), roket, el bombası,
// patlamalar ve görsel efektler (namlu alevi, kovanlar, izli mermiler, kan gölleri, isabet işaretleri).
import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { buildWeaponModel, buildRocketModel, WEAPONS } from './weapons.js';
import { inBridge, WATER_Y } from '../world/map.js';
import { BI } from '../entities/charParts.js';
import { resolveBullet, playerIncoming, playerBal, capBurst, knockHelmetOff, syncPlayerGear } from './body.js';
import { GlassFx } from './glassfx.js';

// NPC mermilerinin oyuncuya verdiği hasar: zorluk tablosu body.js PLAYER_BAL (mermi/patlama çarpanı, ani hasar tavanı)
// [savaş] oyuncu kanaması: seviye başına saniyede can kaybı, alt sınır; kısmi kendiliğinden iyileşme üst sınırı (maxHp oranı)
const PLAYER_BLEED_DPS = 0.45, PLAYER_BLEED_FLOOR = 8;
const HEAL_TIME = 1.6, FIRST_AID_HEAL = 40;
const _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _w3 = new THREE.Vector3(), _wl = new THREE.Vector3();
// [savaş] çarpışma kutusu etiketi -> mermi isabet yüzeyi
const SURF_TAG = {
  pole: 'metal', rail: 'metal', container: 'metal', crane: 'metal', hangar: 'metal', fender: 'metal', gatepost: 'metal', booth: 'metal',
  anchor: 'metal', playground: 'metal', guardtower: 'concrete', cabin: 'wood', fisher: 'wood', bench: 'wood', hedge: 'dirt', tree: 'wood', crate: 'wood',
};

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
    // [savaş] ek hedefler, oyuncu sağlık zamanlayıcıları
    this.targets = [];
    this.healT = 0; this.hbT = 0; this.pDrip = 0;
    // [savaş: beden] oyun saati, uçan kasklar, yerleşen cesetler, isabet istatistiği, delip geçme vektörleri, cam efektleri
    this.clock = 0; this.loose = []; this.corpses = []; this._penO = [];
    this.stats = { hits: 0, head: 0, pen: 0 };
    this.glass = new GlassFx(game);
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
    if (this.glass) this.glass.attach(scene);
  }
  clearTransient() {
    for (let i = 0; i < this.tracerMax; i++) { this.tracerData[i].on = false; this.tracers.setMatrixAt(i, ZERO_M); }
    this.tracers.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.shellMax; i++) { this.shellData[i].life = 0; this.shells.setMatrixAt(i, ZERO_M); }
    this.shells.instanceMatrix.needsUpdate = true;
    for (const f of this.flashes) f.m.visible = false;
    this.pools.length = 0;
    this.bleeding.length = 0;
    for (const L of this.loose) L.o.parent && L.o.parent.remove(L.o);
    this.loose.length = 0; this.corpses.length = 0;
    if (this.glass) this.glass.clear();
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
  rayActors(origin, dir, maxD, ignore, skip = null) {
    let best = null, bt = maxD, head = false, bk = 1;
    const list = this.actors();
    for (let n = 0; n < list.length; n++) {
      const a = list[n];
      if (a === ignore || a === skip || a.dead || a.vehicle || a.inInteriorOther) continue;
      const cr = a.crouch ? 0.3 : 0;
      // [savaş] yerde sürünen / yere savrulmuş: tek alçak küre (gövde)
      const low = a.downed || a.kdT > 0.5;
      const K = low ? 1 : 3;
      for (let k = 0; k < K; k++) {
        const h = low ? 0.28 : k === 0 ? 1.65 - cr : k === 1 ? 1.15 - cr : 0.55;
        const r = low ? 0.5 : k === 0 ? 0.16 : k === 1 ? 0.38 : 0.3;
        const cx = a.pos.x, cy = a.pos.y + h, cz = a.pos.z;
        const ox = origin.x - cx, oy = origin.y - cy, oz = origin.z - cz;
        const b = ox * dir.x + oy * dir.y + oz * dir.z;
        const c = ox * ox + oy * oy + oz * oz - r * r;
        const disc = b * b - c;
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < bt) { bt = t; best = a; head = !low && k === 0; bk = low ? 1 : k; }
      }
    }
    if (!best) return null;
    // [savaş] isabet bölgesi: baş / gövde / kol / bacak (yan: +1 sağ, -1 sol)
    const hx = origin.x + dir.x * bt - best.pos.x, hy = origin.y + dir.y * bt - best.pos.y, hz = origin.z + dir.z * bt - best.pos.z;
    const fx = Math.sin(best.heading), fz = Math.cos(best.heading);
    const lat = hx * -fz + hz * fx;
    const side = lat >= 0 ? 1 : -1;
    let zone = bk === 0 ? 'head' : bk === 2 ? 'leg' : 'torso';
    const lowB = best.downed || best.kdT > 0.5;
    if (zone === 'torso' && !lowB && Math.abs(lat) > 0.2 && hy > 0.85) zone = 'arm';
    if (zone === 'torso' && !lowB && hy < 0.86) zone = 'leg';
    return { actor: best, t: bt, head, zone, side };
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

  hitscan(attacker, origin, dir, def, muzzle) { this.trace(attacker, origin, dir, def, muzzle, 1, 0, null); }

  // [savaş] Tek mermi izi. k: hasar oranı (delip geçen mermide düşer), depth: kaçıncı beden, skip: delinen beden.
  trace(attacker, origin, dir, def, muzzle, k, depth, skip) {
    const g = this.game;
    const maxD = depth ? Math.min(def.range, 40) : def.range;
    const st = g.physics.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxD);
    let t = st ? st.t : maxD;
    const ah = this.rayActors(origin, dir, t, attacker, skip);
    if (ah) t = ah.t;
    const vh = this.rayVehicles(origin, dir, t, attacker.vehicle);
    if (vh) t = vh.t;
    // [savaş] ek hedefler (polis helikopteri vb.)
    const xh = this.rayTargets(origin, dir, t, attacker);
    if (xh) {
      t = xh.t;
      const hp2 = _hp.set(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
      if (!depth) this.addTracer(muzzle || origin, hp2, 0.02);
      _n.copy(dir).negate();
      g.particles.impact(hp2, _n, 'metal', dir);
      if (this.sndBudget-- > 0) audio.impactMetal(hp2.x, hp2.z);
      xh.target.onHit(def.dmg * k * (attacker.isPlayer ? (g.settings.damageDealt || 1) : 1), attacker, hp2);
      if (attacker.isPlayer) this.playerHit();
      return;
    }
    const hp = _hp.set(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
    if (!depth) {
      this.addTracer(muzzle || origin, hp, def.pellets ? 0.012 : def.sound === 'sniper' ? 0.03 : 0.02);
      if (!attacker.isPlayer) this.whizCheck(origin, dir, t, def, ah && ah.actor.isPlayer);
      this.nearMiss(origin, dir, t, attacker, ah && !vh ? ah.actor : null);
    }
    const loud = this.sndBudget-- > 0;
    if (vh) {
      const v = vh.vehicle;
      v.lastPaneHit = -1;
      v.damage(def.dmg * 1.2 * k, attacker);
      _n.copy(dir).negate();
      // [savaş cam] cama isabet: kıvılcım yok, cam tozu; kaporta: metal kıvılcımı
      if (v.lastPaneHit >= 0) this.glass.impactPuff(hp, _n);
      else { g.particles.impact(hp, _n, 'metal', dir); if (loud) audio.impactMetal(hp.x, hp.z); }
      if (attacker.isPlayer) g.wanted.onAttackVehicle(v);
    } else if (ah) {
      this.bodyHit(attacker, ah, hp, dir, def, k, depth, loud);
    } else if (st) {
      _n.set(st.nx, st.ny, st.nz);
      const surf = this.surfaceOf(st.box, hp);
      g.particles.impact(hp, _n, surf, dir);
      if (surf !== 'water') g.particles.bulletHole(hp, _n, surf);
      if (loud) {
        if (surf === 'water') audio.splash(hp.x, hp.z, 0.25);
        else if (surf === 'metal') { audio.impactMetal(hp.x, hp.z); if (Math.random() < 0.4) audio.ricochet(hp.x, hp.z); }
        else { audio.impact(hp.x, hp.z, surf); if (surf === 'concrete' && Math.random() < 0.22) audio.ricochet(hp.x, hp.z); }
      }
    }
  }

  // [savaş] çarpışma kutusu etiketinden yüzey türü (metal direk/konteyner kıvılcım, ahşap kıymık, çit yaprak)
  surfaceOf(box, hp) {
    if (box === 'water') return 'water';
    if (box === 'ground') return this.surfaceAt(hp.x, hp.z) === 'grass' ? 'dirt' : 'concrete';
    const tag = box && box.tag;
    if (tag && SURF_TAG[tag]) return SURF_TAG[tag];
    if (this.game.player && this.game.player.inInterior) return 'wood';
    return 'concrete';
  }

  // [savaş] Mermi bedende: bölge/kask/yelek çözümü, giriş-çıkış yarası, delip geçme, ölüm stili
  bodyHit(attacker, ah, hp, dir, def, k, depth, loud) {
    const g = this.game, target = ah.actor, zone = ah.zone;
    let raw = def.dmg * k, R;
    if (target.isPlayer && !attacker.isPlayer) {
      // helikopter kapı nişancısı: sallanan platform; mermilerin bir kısmı oyuncunun yanına düşer (zorluğa göre)
      if (attacker.lawShooter && attacker.owner && !depth && Math.random() < playerBal(g).heliMiss) { this.deflectNear(target, dir, loud); return; }
      R = playerIncoming(g, target, raw, zone, def, attacker);
    } else {
      if (attacker.isPlayer) raw *= g.settings.damageDealt || 1;
      R = resolveBullet(target, raw, zone, def, attacker);
    }
    const lethal = R.lethal, pen = R.pen, blocked = R.blocked, helmetOff = R.helmetOff, plate = R.plate, dmg = R.dmg;
    const L = target._lastHit || (target._lastHit = { zone: 'torso', side: 1, dx: 0, dz: 1, heavy: false, t: -9, lethal: false });
    L.zone = zone; L.side = ah.side; L.dx = dir.x; L.dz = dir.z; L.heavy = (def.dmg || 0) * k >= 60; L.t = this.clock; L.lethal = lethal;
    const dealt = target.takeDamage(dmg, attacker, 'bullet', zone === 'head', true);
    _w2.copy(dir).negate();
    if (blocked === 'helmet') {
      // kask: kıvılcım + metal çınlaması, baş geriye savrulur; tükenince kask uçar
      g.particles.sparks(hp, 5, _w2);
      if (loud) audio.impactMetal(hp.x, hp.z);
      if (helmetOff) knockHelmetOff(target, dir, g.activeScene(), this.loose);
      if (dealt > 0 && target.dead) this.fleshFx(target, hp, dir, 1.2, false, false);
    } else if (blocked === 'vest' && plate && pen <= 0.01) {
      // plaka durdurdu: kumaş/seramik tozu, tok darbe; kan yok
      g.particles.impact(hp, _w2, 'dirt', dir);
      if (loud) audio.plateHit(hp.x, hp.z);
    } else {
      const exits = pen > 0.08;
      this.fleshFx(target, hp, dir, zone === 'head' ? 1.6 : 1, loud, exits, zone);
    }
    if (blocked !== 'helmet' && !(blocked === 'vest' && plate && pen <= 0.01)) this.woundFx(target, zone, ah.side, hp, dir, attacker, def, dealt);
    else if (!target.dead && target.model && target.model.hitZone) target.model.hitZone(zone, ah.side, Math.min(1.4, 0.6 + dealt / 30), dir.x, dir.z);
    if (attacker.isPlayer) this.playerHit();
    if (target.isPlayer) { g.ui.damageFlash(attacker); this.playerHitFx(attacker, dir, dealt, zone); }
    this.stats.hits++;
    if (zone === 'head') this.stats.head++;
    // delip geçme: bedenden çıkan mermi arkadakine düşük hasarla devam eder
    if (pen > 0.08 && depth < 2) {
      const th = zone === 'head' ? 0.24 : zone === 'torso' ? 0.42 : 0.16;
      const o = this._penO[depth] || (this._penO[depth] = new THREE.Vector3());
      o.copy(hp).addScaledVector(dir, th);
      this.exitFx(target, o, dir, zone, ah.side);
      this.stats.pen++;
      this.trace(attacker, o, dir, def, null, k * pen, depth + 1, target);
    }
  }
  // helikopter mermisi oyuncunun yakınına (asfalt/duvar) isabet eder
  deflectNear(p, dir, loud) {
    const g = this.game;
    const a = Math.random() * Math.PI * 2, r = 0.7 + Math.random() * 1.3;
    _w1.set(p.pos.x + Math.cos(a) * r, (p.pos.y || 0) + 0.01, p.pos.z + Math.sin(a) * r);
    _n.set(0, 1, 0);
    const surf = this.surfaceAt(_w1.x, _w1.z) === 'grass' ? 'dirt' : 'concrete';
    g.particles.impact(_w1, _n, surf, dir);
    g.particles.bulletHole(_w1, _n, surf);
    if (loud) audio.impact(_w1.x, _w1.z, surf);
    this.whizT = 0; audio.whiz(0.8, Math.cos(a), Math.sin(a), true);
  }
  // çıkış yarası: sırtta/arkada daha büyük yara, ileri kan püskürmesi ve sis
  exitFx(target, p, dir, zone, side) {
    const g = this.game;
    g.particles.bloodSpray(p, dir, 12, target.pos.y + 0.005, 1.5);
    this.bloodMist(p, dir, 1.2);
    if (target.model && target.model.addWound && (target.isPlayer || this.nearCamera(target.pos, 45))) {
      _wl.copy(p).addScaledVector(dir, -0.06);
      this.woundAt(target, zone, side, _wl, dir, 1.25);
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

  // [mekanik tepki] mermi yakından geçti: siviller çömelir/kaçar, savaşanlar baskı altına girer (siper, çömelme),
  // sokak hayvanları ürker (sıyırırsa acıyla kaçar). Atış başına bir tarama; her karede maliyet yok.
  nearMiss(origin, dir, t, attacker, hitActor) {
    const g = this.game, L = g.npcs.list;
    for (let i = 0; i < L.length; i++) {
      const n = L[i];
      if (n === attacker || n === hitActor || n.dead || n.vehicle || n.passengerOf) continue;
      const lx = n.pos.x - origin.x, ly = n.pos.y + 1.2 - origin.y, lz = n.pos.z - origin.z;
      const sp = lx * dir.x + ly * dir.y + lz * dir.z;
      if (sp < 1 || sp > t + 1.5) continue;
      const cx = lx - dir.x * sp, cy = ly - dir.y * sp, cz = lz - dir.z * sp;
      const d2 = cx * cx + cy * cy + cz * cz;
      if (d2 > 6.25) continue;
      n.onNearMiss && n.onNearMiss(attacker, Math.sqrt(d2));
    }
    const A = g.animals;
    if (A && A.onBullet && !g.player.inInterior) A.onBullet(origin, dir, t);
  }

  // Et isabeti: giriş deliği kanı; mermi çıktıysa (exits) ileri püskürme + arkadaki duvara kan. Islak et sesi.
  fleshFx(target, hp, dir, k = 1, loud = true, exits = true, zone = 'torso') {
    const g = this.game;
    const fy = target.pos.y;
    // giriş: geri sıçrayan ince kan + kırmızı sis; çıkış yoksa ileri püskürme küçük kalır
    g.particles.bloodSpray(hp, dir, Math.round((exits ? 9 : 4) * k), fy + 0.005, exits ? k : 0.5 * k);
    if (exits) {
      const w = g.physics.raycast(hp.x, hp.y, hp.z, dir.x, dir.y, dir.z, 2.6);
      if (w && w.box !== 'water') {
        _a.set(hp.x + dir.x * w.t, hp.y + dir.y * w.t, hp.z + dir.z * w.t);
        _b.set(w.nx, w.ny, w.nz);
        g.particles.bloodSplat(_a, _b, 0.35 + Math.random() * 0.35 * k, w.ny > 0.5 ? 1 : 1.4);
      }
    }
    if (loud) audio.fleshImpact ? audio.fleshImpact(hp.x, hp.z, k, zone === 'head') : audio.bulletFlesh(hp.x, hp.z);
    if (target.dead) this.startPool(target);
  }
  // ince kan sisi (çıkış yarası, baş isabeti)
  bloodMist(p, dir, k = 1) {
    const N = this.game.particles.norm;
    for (let i = 0; i < 4; i++) N.emit(p.x + dir.x * 0.08 * i, p.y + (Math.random() - 0.5) * 0.1, p.z + dir.z * 0.08 * i, dir.x * (1.6 + i * 0.5) + (Math.random() - 0.5) * 0.5, 0.1 + Math.random() * 0.3, dir.z * (1.6 + i * 0.5) + (Math.random() - 0.5) * 0.5, 0.45 + Math.random() * 0.3, (0.13 + 0.05 * i) * k, 0.42, 0.02, 0.02, 0.5, 1.6);
  }

  // ---------------- [savaş: yaralar, bölgesel tepkiler, oyuncu vuruş hissi] ----------------
  // Ek isabet hedefleri (küre): { pos: Vector3, r, dead, owner, onHit(dmg, attacker, point) }
  rayTargets(origin, dir, maxD, attacker) {
    let best = null, bt = maxD;
    for (const T of this.targets) {
      if (T.dead || (attacker && T.owner === attacker)) continue;
      const ox = origin.x - T.pos.x, oy = origin.y - T.pos.y, oz = origin.z - T.pos.z;
      const b = ox * dir.x + oy * dir.y + oz * dir.z, c = ox * ox + oy * oy + oz * oz - T.r * T.r, disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < bt) { bt = t; best = T; }
    }
    return best ? { target: best, t: bt } : null;
  }

  // [savaş] yara izini kemiğe yerleştir: p = deliğin dünya konumu (giriş ya da çıkış), size: çıkışta daha büyük
  woundAt(target, zone, side, p, dir, size = 1) {
    const M = target.model;
    const S = side > 0 ? 'R' : 'L';
    const yy = p.y - target.pos.y;
    let bone, child = null, rad;
    if (target.downed) { bone = 'spine'; child = 'chest'; rad = 0.14; }
    else if (zone === 'head') { bone = 'head'; rad = 0.095; }
    else if (zone === 'arm') { if (yy > 1.22) { bone = 'sh' + S; child = 'el' + S; } else { bone = 'el' + S; child = 'wr' + S; } rad = 0.05; }
    else if (zone === 'leg') { if (yy > 0.5) { bone = 'hip' + S; child = 'kn' + S; rad = 0.075; } else { bone = 'kn' + S; child = 'an' + S; rad = 0.055; } }
    else { if (yy > 1.22) { bone = 'chest'; child = 'neck'; } else { bone = 'spine'; child = 'chest'; } rad = 0.14; }
    M.root.updateMatrixWorld(true);
    const Bn = M.bones[BI[bone]];
    Bn.getWorldPosition(_w1);
    if (child) {
      M.bones[BI[child]].getWorldPosition(_w2);
      _s.subVectors(_w2, _w1);
      const L2 = _s.lengthSq() || 1;
      const u = Math.max(0.15, Math.min(0.85, ((p.x - _w1.x) * _s.x + (p.y - _w1.y) * _s.y + (p.z - _w1.z) * _s.z) / L2));
      _w1.addScaledVector(_s, u);
    } else _w1.y += 0.09 * (M.body.scale.x || 1);
    _w3.set(p.x - _w1.x, (p.y - _w1.y) * 0.4, p.z - _w1.z);
    if (_w3.lengthSq() < 1e-6) _w3.set(-dir.x, 0, -dir.z);
    _w3.normalize();
    _w2.copy(_w1).addScaledVector(_w3, rad);
    const loc = Bn.worldToLocal(_wl.copy(_w2));
    _w3.add(_w2); Bn.worldToLocal(_w3); _w3.sub(loc);
    M.addWound(bone, loc, (0.8 + Math.random() * 0.5) * size, _w3);
  }

  // Kemiğe yara izi + bölgeye göre tepki (topallama, silah düşürme, sendeleme, kanama, yere yığılma)
  woundFx(target, zone, side, hp, dir, attacker, def, dealt = 0) {
    const g = this.game;
    if (!zone || !target.model) return;
    const M = target.model;
    if (M.addWound && (target.isPlayer || this.nearCamera(target.pos, 45))) this.woundAt(target, zone, side, hp, dir, 1);
    // giriş deliğinden geriye küçük kan pufu
    _w2.copy(dir).negate();
    g.particles.blood(hp, 3, _w2, target.pos.y + 0.005);
    if (target.dead) return;
    const strongZ = (def && def.stagger || 1) * Math.min(1.5, 0.5 + dealt / 35);
    if (M.hitZone) M.hitZone(zone, side, strongZ, dir.x, dir.z);
    if (zone === 'arm') {
      // kol yarası: nişan titrer, isabet düşer (oyuncuda saçılma artar)
      target.armHurt = Math.min(1, (target.armHurt || 0) + 0.5);
      if (!target.isPlayer) target.aimT = 0;
    }
    if (zone === 'leg') {
      target.limp = Math.min(1, (target.limp || 0) + 0.55); target.limpSide = side > 0 ? 1 : 0;
      M.setLimp && M.setLimp(target.limp, target.limpSide);
      if (!target.isPlayer) target.limpMul = 1 - 0.5 * target.limp;
    }
    if (target.isPlayer) return;
    const strong = strongZ;
    if (zone === 'arm' && !target.downed && target.wdef && target.wdef.type === 'gun' && Math.random() < 0.45) this.dropWeapon(target);
    if (zone === 'torso') target.knock = { x: dir.x * 1.1 * strong, z: dir.z * 1.1 * strong, t: 0.22 };
    if (zone === 'head') {
      // başa isabet (kask/zırh sayesinde hayatta): ağır sersemleme, geriye savrulma; güçlü darbede yere düşer
      target.knock = { x: dir.x * 1.8 * strong, z: dir.z * 1.8 * strong, t: 0.3 };
      target.stunT = Math.max(target.stunT || 0, 0.7 + 0.3 * strong);
      if (strong > 1.1 && Math.random() < 0.45 && target.knockdown) target.knockdown(dir.x, dir.z, 2.2);
    }
    if (zone === 'leg' && strong > 1.1) {
      target.knock = { x: dir.x * 0.6, z: dir.z * 0.6, t: 0.2 };
      // ağır bacak isabeti: dizinin üstüne çöker
      if (target.limp > 0.9 && Math.random() < 0.3 && target.knockdown) target.knockdown(dir.x, dir.z, 1.7);
    }
    const pb = zone === 'head' ? 1 : zone === 'torso' ? 0.65 : 0.45;
    if (Math.random() < pb) this.applyBleed(target, attacker, 0.8 + Math.random() * 1.6, 8 + Math.random() * 8);
    // ağır yaralı: yere yığılıp sürünür (görev hedefleri, patronlar ve sabit NPC'ler hariç)
    if (!target.downed && target.goDown && zone !== 'head' && target.hp < target.maxHp * 0.3 && !target.mission && target.kind !== 'boss' && !target.static && target.downable !== false && Math.random() < 0.5) target.goDown(attacker);
  }

  // NPC kolundan vurulunca silahını düşürür (yerden alınabilir)
  dropWeapon(n) {
    const g = this.game, id = n.weapon, w = n.weapons[id];
    if (!id || id === 'fists' || !w) return;
    const fx = Math.sin(n.heading), fz = Math.cos(n.heading);
    if (g.pickups) g.pickups.spawn('weapon', n.pos.x + fx * 0.7, n.pos.z + fz * 0.7, Math.max(6, Math.min(40, (w.ammo || 0) + (w.mag || 0))), id);
    delete n.weapons[id];
    const alt = Object.keys(n.weapons).find((k) => k !== 'fists' && WEAPONS[k] && WEAPONS[k].type === 'gun');
    n.setWeapon(alt || 'fists');
    n.disarmed = !alt;
    if (n.say) n.say(['Ah, kolum!', 'Silahım!', 'Vurdu beni!'], 1);
    if (!alt && n.faction !== 'police' && n.faction !== 'military' && n.state === 'attack') { n.state = 'flee'; n.fleeFrom = (n.target || g.player).pos.clone(); n.fleeT = 6; n.path = []; }
  }

  // Oyuncu vuruldu: yönlü gösterge, kamera irkilmesi, sendeleme, inleme, kanama
  playerHitFx(attacker, dir, dealt, zone) {
    const g = this.game, p = g.player;
    if (!p || p.dead) return;
    const ax = attacker && attacker.pos ? attacker.pos.x - p.pos.x : -dir.x, az = attacker && attacker.pos ? attacker.pos.z - p.pos.z : -dir.z;
    const yaw = p.camYaw || 0;
    const fwd = ax * Math.sin(yaw) + az * Math.cos(yaw), rgt = ax * -Math.cos(yaw) + az * Math.sin(yaw);
    const ang = Math.atan2(rgt, fwd);
    const k = Math.min(1, 0.3 + dealt / 22);
    if (g.ui.hitIndicator) g.ui.hitIndicator(ang, k);
    // bölge: baş -> sert sarsıntı ve geriye savrulan bakış; kol -> nişan kayar; bacak -> çöküş
    const zk = zone === 'head' ? 2 : zone === 'arm' ? 1.3 : 1;
    g.cameraShake(Math.min(1.6, (0.25 + k * 0.5) * zk));
    if (!p.vehicle) {
      p.camYaw -= Math.sin(ang) * 0.04 * k * zk;
      p.camPitch -= (zone === 'head' ? 0.07 : 0.02) * k;
      if (zone === 'arm') p.camYaw += (Math.random() - 0.5) * 0.05 * k;
      if (zone === 'leg') p.camDip = Math.max(p.camDip || 0, 0.12 * k);
      p.staggerT = 0.16 + 0.14 * k; p.staggerX = dir.x * 1.5 * k; p.staggerZ = dir.z * 1.5 * k;
    }
    audio.playerHurt(k);
    if (Math.random() < (zone === 'torso' ? 0.35 : zone === 'leg' ? 0.3 : zone === 'head' ? 0.5 : 0.25)) this.playerBleed(1);
  }
  playerBleed(n = 1) {
    const g = this.game, p = g.player;
    const first = !p.bleed;
    p.bleed = Math.min(3, (p.bleed || 0) + n);
    if (first) g.ui.notify(`Kanıyorsun! [B] ile İlk Yardım Çantası kullan${g.state && g.state.firstAid ? ` (${g.state.firstAid} adet)` : ' — bakkal/eczaneden al'}.`, 'warn');
  }
  useFirstAid() {
    const g = this.game, p = g.player, s = g.state;
    if (this.healT > 0 || p.dead) return false;
    if (!(s.firstAid > 0)) { g.ui.notify('İlk Yardım Çantan yok! Bakkaldan alabilirsin.', 'warn'); audio.error && audio.error(); return false; }
    if (p.hp >= p.maxHp - 0.5 && !p.bleed) { g.ui.notify('Yaran yok.', 'info'); return false; }
    this.healT = HEAL_TIME;
    audio.noiseBurst({ dur: 0.5, freq: 2400, q: 0.8, type: 'bandpass', gain: 0.25 });
    return true;
  }
  updatePlayerHealth(dt) {
    const g = this.game, p = g.player, s = g.state;
    if (!p || p.dead) { if (this.healT > 0) { this.healT = 0; g.ui.setProgress(null); } return; }
    p.lastHurtT = (p.lastHurtT || 0) + dt;
    if (p.staggerT > 0) { p.staggerT -= dt; if (!p.vehicle) { p.pos.x += p.staggerX * dt; p.pos.z += p.staggerZ * dt; } }
    if (p.bleed > 0) {
      if (p.hp > PLAYER_BLEED_FLOOR) p.hp = Math.max(PLAYER_BLEED_FLOOR, p.hp - PLAYER_BLEED_DPS * p.bleed * dt);
      this.pDrip -= dt;
      if (this.pDrip <= 0 && !p.vehicle && !p.swimming) {
        this.pDrip = 0.55 / p.bleed + Math.random() * 0.3;
        tmp.set(p.pos.x + (Math.random() - 0.5) * 0.25, p.pos.y + 0.85, p.pos.z + (Math.random() - 0.5) * 0.25);
        g.particles.blood(tmp, 2, null, p.pos.y + 0.005);
      }
    } else {
      // [savaş] kısmi kendiliğinden iyileşme: zorluğa göre gecikme, hız ve üst sınır (siperde nefes alınca toparlanır)
      const B = playerBal(g), cap = p.maxHp * B.regenCap;
      if (p.lastHurtT > B.regenDelay && p.hp < cap) p.hp = Math.min(cap, p.hp + B.regenRate * Math.min(1, (p.lastHurtT - B.regenDelay) / 2 + 0.3) * dt);
    }
    // tam iyileşince (hastane, yemek...) kanama ve yaralar temizlenir
    if (p.hp >= p.maxHp - 0.5 && (p.bleed || p.limp || (p.model.wounds && p.model.wounds.length))) this.healPlayerWounds();
    if (p.hp < 30) { this.hbT -= dt; if (this.hbT <= 0) { this.hbT = 0.7 + p.hp / 50; audio.heartbeat(1 - p.hp / 60); } }
    if (this.healT > 0) {
      this.healT -= dt;
      g.ui.setProgress('İLK YARDIM UYGULANIYOR', 1 - this.healT / HEAL_TIME);
      if (p.vehicle || p.swimming) { this.healT = 0; g.ui.setProgress(null); }
      else if (this.healT <= 0) {
        this.healT = 0; g.ui.setProgress(null);
        s.firstAid = Math.max(0, (s.firstAid || 0) - 1);
        p.hp = Math.min(p.maxHp, p.hp + FIRST_AID_HEAL);
        this.healPlayerWounds();
        g.ui.notify(`Yaralarını sardın (+${FIRST_AID_HEAL} can). Kalan çanta: ${s.firstAid}`, 'good');
      }
    } else if (g.input && g.input.hit && g.input.hit('KeyB') && !p.vehicle) this.useFirstAid();
  }
  healPlayerWounds() {
    const p = this.game.player;
    p.bleed = 0; p.limp = 0; p.armHurt = 0;
    if (p.model.setLimp) p.model.setLimp(0);
    if (p.model.clearWounds) p.model.clearWounds();
  }

  // 40 mm bomba: yay çizerek uçar, çarpınca patlar
  lobGrenade(attacker, from, dir, def) {
    const mesh = buildWeaponModel('gl40');
    mesh.scale.setScalar(1.6);
    mesh.position.copy(from);
    this.game.activeScene().add(mesh);
    const v = dir.clone().multiplyScalar(42); v.y += 2.2;
    this.projectiles.push({ kind: 'gl', mesh, pos: from.clone(), prev: from.clone(), vel: v, life: 6, attacker, def, bounceSnd: 0 });
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
    const floorY = g.physics.groundAt(x, z) > -1 ? g.physics.groundAt(x, z) : WATER_Y;
    g.particles.explosion({ x, y, z }, sc, { floorY: water ? WATER_Y : floorY, water });
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
        let ed = dmg * k;
        if (a.isPlayer) { const B = playerBal(g); ed = capBurst(a, ed * B.blast, B, k > 0.8); } // [savaş] oyuncu: zorluğa göre
        if (a._lastHit) a._lastHit.t = -9;
        a.takeDamage(ed, attacker, 'explosion');
        if (!a.dead) {
          const ux = (a.pos.x - x) / (d || 1), uz = (a.pos.z - z) / (d || 1);
          a.knock = { x: ux * 8 * k, z: uz * 8 * k, t: 0.3 };
          // [mekanik tepki] patlama dalgası: yakındakiler yere savrulur
          // oyuncu: yalnız yakın patlamada ve kalktıktan sonra kısa dokunulmazlıkla (art arda yere kilitlenmesin)
          if (a.isPlayer) { if (k > 0.45 && !(a.kdImmT > 0)) a.knockdown(ux, uz, 1.1 + 1.1 * k); }
          else if (k > 0.25 && a.knockdown) a.knockdown(ux, uz, 1.8 + 1.6 * k);
        } else {
          tmp.set(a.pos.x, a.pos.y + 1, a.pos.z);
          _a.set(a.pos.x - x, 0.6, a.pos.z - z).normalize();
          g.particles.bloodSpray(tmp, _a, 14, a.pos.y + 0.005, 1.5);
          this.startPool(a);
        }
        if (a.isPlayer) { g.ui.damageFlash(attacker); _w1.set(a.pos.x - x, 0, a.pos.z - z).normalize(); this.playerHitFx({ pos: { x, z } }, _w1, dmg * k * 0.5, 'torso'); }
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
    // [savaş] ek hedefler (helikopter vb.)
    for (const T of this.targets) {
      if (T.dead || T.owner === attacker) continue;
      const d = Math.hypot(T.pos.x - x, T.pos.y - y, T.pos.z - z);
      if (d < radius * 1.6) T.onHit(dmg * 3 * (1 - d / (radius * 1.6)), attacker, T.pos);
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
    if (source && !source.inInterior) this.trafficPanic(x, z, radius, source);
  }

  // [mekanik tepki] silah sesi / patlama: trafikteki sürücüler panikler — tehdit öndeyse geri kaçar, yanından gaza basar,
  // duran araçtan inip kaçan da olur. Seyrek tarama (otomatik silahta her mermide değil).
  // çığlık / korna / inleme gibi tepki sesleri için ortak seyreltme (kalabalıkta ses düğümü yığılmasın)
  voice() { if (this.vocT > 0) return false; this.vocT = 0.35; return true; }

  trafficPanic(x, z, radius, source) {
    const g = this.game, now = performance.now();
    if (now - (this.panicScan || 0) < 250) return;
    this.panicScan = now;
    const R = Math.min(45, radius * 0.7);
    for (const v of g.vehicles.list) {
      const ai = v.ai;
      if (!ai || ai.empty || ai.mode !== 'traffic' || v.driver || v.mission || v.police || v.destroyed || v.kind !== 'car') continue;
      const dx = x - v.pos.x, dz = z - v.pos.z, d = Math.hypot(dx, dz);
      if (d > R) continue;
      const f = v.fwd || { x: Math.sin(v.heading), z: Math.cos(v.heading) };
      const ahead = (dx * f.x + dz * f.z) / (d || 1);
      if (v.speed < 1.5 && d < 14 && v.type !== 'bus' && Math.random() < 0.35 && g.npcs.list.length < 80) {
        // sürücü kapıyı açıp tehditten uzak taraftan kaçar
        v.ai = { empty: true }; v.parked = true;
        if (v.controls) { v.controls.throttle = 0; v.controls.handbrake = true; }
        const rx = -f.z, rz = f.x, sd = (dx * rx + dz * rz) > 0 ? -1 : 1, off = v.def.wid / 2 + 0.8;
        const n = g.npcs.add('civilian', v.pos.x + rx * off * sd, v.pos.z + rz * off * sd);
        n.hearThreat(source, d);
        if (Math.random() < 0.5) g.ui.bark(n, ['Vuruyorlar!', 'Arabayı bırak, kaç!', 'Allah\'ım!'][Math.floor(Math.random() * 3)]);
        continue;
      }
      if (ahead > 0.55 && d < 22 && v.speed < 6) { ai.reverseT = Math.max(ai.reverseT || 0, 1.6); ai.panic = 0; }
      else ai.panic = Math.max(ai.panic || 0, 5 + Math.random() * 3);
      if (v.honkT <= 0 && Math.random() < 0.4 && this.voice()) { audio.horn(v.pos.x, v.pos.z); v.honkT = 2 + Math.random() * 2; }
    }
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
    if (this.vocT > 0) this.vocT -= dt;
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
    this.updatePlayerHealth(dt); // [savaş] kanama, kısmi iyileşme, ilk yardım (B)
    this.clock += dt;
    this.updateBodies(dt);
    this.glass.update(dt);
    // kanamalar
    for (let i = this.bleeding.length - 1; i >= 0; i--) {
      const b = this.bleeding[i];
      b.t -= dt;
      if (b.t <= 0 || b.a.dead) { if (b.a.dead) this.startPool(b.a); this.bleeding[i] = this.bleeding[this.bleeding.length - 1]; this.bleeding.pop(); continue; }
      b.a.takeDamage(b.dps * dt, b.attacker, 'bleed');
      if (b.a.dead) this.startPool(b.a);
      b.drip -= dt;
      if (b.drip <= 0) { b.drip = 0.18 + Math.random() * 0.2; tmp.set(b.a.pos.x + (Math.random() - 0.5) * 0.2, b.a.pos.y + (b.a.downed ? 0.3 : 0.9), b.a.pos.z + (Math.random() - 0.5) * 0.2); g.particles.blood(tmp, 2, null, b.a.pos.y + 0.005); }
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

  // ---------------- [savaş: ölüm stili, ceset yerleşmesi, uçan kask] ----------------
  // actor.die çağırır: son isabete göre yığılma biçimi (baş: dizden çökme, gövde önden: geriye, omuz: dönerek,
  // bacak: dize düşüp kapaklanma, arkada duvar: duvara yaslanıp kayma). Oyuncu için de aynı.
  onActorDeath(a, attacker, kind) {
    const M = a.model;
    if (!M) return;
    const L = a._lastHit, fresh = L && this.clock - L.t < 0.25 && kind === 'bullet';
    let zone = fresh ? L.zone : kind === 'explosion' ? 'blast' : kind === 'bleed' ? 'bleed' : kind === 'melee' ? 'torso' : 'torso';
    const dx = fresh ? L.dx : M.deathDir ? 0 : 0, dz = fresh ? L.dz : 0;
    // mermi yönünde (beden o yöne düşer) yakın duvar var mı? (göğüs ve bel hizası)
    let wall = 0;
    if (fresh && !a.downed && !a.swimming && kind !== 'explosion') {
      const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
      const h1 = this.game.physics.raycast(a.pos.x, a.pos.y + 1.1, a.pos.z, ux, 0, uz, 1.25);
      const h2 = h1 && this.game.physics.raycast(a.pos.x, a.pos.y + 0.55, a.pos.z, ux, 0, uz, 1.35);
      if (h1 && h2 && h1.box !== 'ground' && Math.abs(h1.ny) < 0.5) wall = Math.max(0.25, Math.min(h1.t, h2.t));
    }
    if (zone === 'arm') zone = 'shoulder';
    const S = M.deathStyle || (M.deathStyle = { zone: 'torso', side: 1, wall: 0, heavy: false, seed: 0 });
    S.zone = a.downed ? 'prone' : zone; S.side = fresh ? L.side : Math.random() < 0.5 ? 1 : -1; S.wall = wall; S.heavy = !!(fresh && L.heavy); S.seed = Math.random();
    // duvara yaslanma: beden duvara doğru (sırtı duvarda) — yalnız geriye düşüşte; kök yönünü duvara sırt verecek şekilde hizala
    if (wall) {
      const l = Math.hypot(dx, dz) || 1;
      const back = Math.atan2(-dx / l, -dz / l); // yüz mermiye (duvarın tersine) dönük
      const d = Math.atan2(Math.sin(back - a.heading), Math.cos(back - a.heading));
      if (Math.abs(d) < 1.3) { S.zone = 'wall'; S.yaw0 = d; } else S.wall = 0;
    }
    this.corpses.push(a);
  }
  updateBodies(dt) {
    const g = this.game;
    if (g.player) syncPlayerGear(g.player);
    // cesetler zemine oturur (havada / basamakta ölen: yere iner). Kısa süre izlenir, sonra bırakılır.
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const a = this.corpses[i];
      a._settleT = (a._settleT || 0) + dt;
      if (!a.dead || a._settleT > 4 || a.vehicle || a.passengerOf) { a._settleT = 0; this.corpses[i] = this.corpses[this.corpses.length - 1]; this.corpses.pop(); continue; }
      if (a.swimming || g.physics.inWater(a.pos.x, a.pos.z)) continue;
      const h = g.physics.raycastShared(a.pos.x, a.pos.y + 0.4, a.pos.z, 0, -1, 0, 60);
      const floor = h ? a.pos.y + 0.4 - h.t : g.physics.groundAt(a.pos.x, a.pos.z);
      if (a.pos.y > floor + 0.01) { a._cvy = (a._cvy || 0) - 18 * dt; a.pos.y = Math.max(floor, a.pos.y + a._cvy * dt); }
      else { a._cvy = 0; if (a.pos.y < floor - 0.01 && floor - a.pos.y < 0.45) a.pos.y = floor; }
      if (a.model) a.model.root.position.y = a.pos.y;
    }
    // başından fırlayan kasklar
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const L = this.loose[i], o = L.o;
      L.life -= dt;
      if (L.life <= 0) { o.parent && o.parent.remove(o); this.loose.splice(i, 1); continue; }
      if (L.rest) continue;
      L.vy -= 16 * dt;
      o.position.x += L.vx * dt; o.position.y += L.vy * dt; o.position.z += L.vz * dt;
      o.rotation.x += L.wx * dt; o.rotation.z += L.wz * dt;
      if (o.position.y < L.floor) {
        o.position.y = L.floor;
        if (L.vy < -2) { L.vy *= -0.3; L.vx *= 0.5; L.vz *= 0.5; L.wx *= 0.4; L.wz *= 0.4; if (this.sndBudget-- > 0) audio.impactMetal(o.position.x, o.position.z); }
        else { L.rest = true; o.rotation.x = Math.PI * (Math.random() < 0.5 ? 0 : 1) + (Math.random() - 0.5) * 0.4; o.rotation.z = (Math.random() - 0.5) * 0.5; }
      }
    }
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
      else if (p.kind === 'gl') p.vel.y -= 9.8 * dt;
      p.pos.addScaledVector(p.vel, dt);
      let boom = p.life <= 0;
      tmp.copy(p.pos).sub(p.prev);
      const len = tmp.length();
      if (len > 0) {
        tmp.divideScalar(len);
        const h = g.physics.raycast(p.prev.x, p.prev.y, p.prev.z, tmp.x, tmp.y, tmp.z, len + 0.1);
        if (h) {
          if (p.kind === 'rocket' || p.kind === 'gl') boom = true;
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
        if (p.kind === 'gl') {
          if (this.rayActors(p.prev, tmp, len + 0.3, p.attacker) || this.rayVehicles(p.prev, tmp, len + 0.3, p.attacker.vehicle) || this.rayTargets(p.prev, tmp, len + 0.3, p.attacker)) boom = true;
          if (Math.random() < 0.5) { _b.copy(tmp).negate(); g.particles.trail(p.pos, _b, 0.35); }
          p.mesh.lookAt(p.pos.x + tmp.x, p.pos.y + tmp.y, p.pos.z + tmp.z);
        }
        if (p.kind === 'rocket') {
          if (this.rayTargets(p.prev, tmp, len + 0.3, p.attacker)) boom = true;
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
