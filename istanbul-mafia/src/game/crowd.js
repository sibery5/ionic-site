// [şehir] Hafif kalabalık: AVM / market müşterileri için tam NPC (YZ, fizik, yol bulma) yerine yalın ajanlar.
// Her ajan tek SkinnedMesh (karakter modeli kendi LOD'unu seçer) + basit durum makinesi:
//   walk (yol noktaları, y dahil), ride (yürüyen merdiven: model taşıyıcıda sabit, ayak kaymaz),
//   idle/browse (vitrine bak), queue (sırada bekle), sit (otur; eat=true çatal/kaşık jesti), flee (kaçış, kaybolur).
// Performans: animasyon kamera uzaklığı ve görüş konisine göre seyreltilir (yakın her kare, orta 2, uzak 4 karede bir,
// görüş dışında 8); gölge yok; ajan sayısı üst sınırlı. Yalnızca oyuncu içerideyken güncellenir (ctx.update).
import * as THREE from 'three';
import { CharacterModel, randomLook } from '../entities/character.js';

const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere(new THREE.Vector3(), 1.2);

export function lookOf(rng, gender) {
  let L = randomLook(rng, 'civilian');
  for (let i = 0; i < 12 && gender && L.gender !== gender; i++) L = randomLook(rng, 'civilian');
  if (gender && L.gender !== gender) { L.gender = gender; if (gender === 'f') { L.beard = 'none'; L.hair = 'uzun'; } }
  return L;
}

function baseSt() {
  return { speed: 0, moveX: 0, moveZ: 1, aim: false, aimPitch: 0, aimYaw: 0, twoHanded: false, dead: false, swim: false, recoil: 0, downed: false, reload: 0, weapon: 'fists', crouch: false, hands_up: false, sit: false, talk: false, air: false, vy: 0, cower: false, phone: false, smoke: false, isPlayer: false, vault: 0, roll: 0, couple: null, dance: false };
}

// Yemek jesti: sağ kol ağza (yudum/çatal), arada tabağa iner
export function eatPost(a) {
  return function (dt) {
    const k = a.eatK || 0;
    if (k < 0.01) return;
    const arm = this.arms[1];
    arm.sh.rotation.x += (-0.55 - arm.sh.rotation.x) * k;
    arm.el.rotation.x += (-2.05 - arm.el.rotation.x) * k;
    arm.sh.rotation.z += (0.25 - arm.sh.rotation.z) * k * 0.6;
    void dt;
  };
}

export class Crowd {
  constructor(game, scene, { max = 60 } = {}) {
    this.game = game; this.scene = scene; this.max = max;
    this.agents = []; this.frame = 0; this.panicT = 0;
    this.stats = { animated: 0, spawned: 0 };
  }
  spawn(x, y, z, heading, look, opts = {}) {
    if (this.agents.length >= this.max) return null;
    const m = new CharacterModel(look);
    m.mesh.castShadow = false;
    const carrier = new THREE.Group();
    carrier.add(m.root);
    this.scene.add(carrier);
    const a = {
      m, carrier, x, y, z, h: heading, state: opts.state || 'idle', path: [], pi: 0, speed: 0, walk: opts.walk || (1.15 + Math.random() * 0.35),
      t: opts.t ?? (2 + Math.random() * 4), st: baseSt(), acc: 0, eatK: 0, eatT: Math.random() * 3, floor: opts.floor || 0, role: opts.role || 'shopper', data: opts.data || {},
      riding: null, gone: false, id: this.stats.spawned++,
    };
    m.post = eatPost(a);
    m.root.position.set(x, y, z); m.root.rotation.y = heading;
    this.agents.push(a);
    return a;
  }
  remove(a) {
    const i = this.agents.indexOf(a); if (i >= 0) this.agents.splice(i, 1);
    a.carrier.parent && a.carrier.parent.remove(a.carrier);
    if (a.seat) { a.seat.occupant = null; a.seat = null; }
    a.gone = true;
  }
  clear() { for (const a of this.agents.slice()) this.remove(a); }
  // yol ver: noktalar {x,y,z, ride?:hız(m/s)}; bitince state = then (varsayılan 'idle')
  go(a, pts, then = 'idle', t = 3) {
    a.path = pts; a.pi = 0; a.state = 'walk'; a.after = then; a.afterT = t; a.t = 0; a.faceH = undefined;
    if (a.seat) { a.seat.occupant = null; a.seat = null; a.st.sit = false; }
  }
  sit(a, seat, eat = false) {
    a.seat = seat; seat.occupant = a; a.state = 'sit'; a.eat = eat;
    a.x = seat.x; a.y = seat.y; a.z = seat.z; a.h = seat.heading;
    a.st.sit = true; a.st.speed = 0; a.faceH = seat.heading; a.riding = null; a.path = [];
  }
  panic(x, z, exits) {
    for (const a of this.agents) {
      if (a.state === 'flee') continue;
      if (a.seat) { a.seat.occupant = null; a.seat = null; }
      a.st.sit = false; a.eatK = 0;
      a.state = 'flee'; a.walk = 4.2 + Math.random() * 1.2; a.path = exits(a); a.pi = 0;
      a.t = Math.random() * 0.6; // tepki gecikmesi
    }
  }

  update(dt, camera, director) {
    this.frame++;
    if (camera) { _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm); }
    const cx = camera ? camera.position.x : 0, cy = camera ? camera.position.y : 0, cz = camera ? camera.position.z : 0;
    let animated = 0;
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i];
      this.step(a, dt, director);
      if (a.gone) continue;
      // konum: yürüyen merdivende taşıyıcı hareket eder (model kökü sabit: ayak kilidi kaymaz)
      if (a.riding) { a.carrier.position.set(a.x, a.y, a.z); a.m.root.position.set(0, 0, 0); }
      else { a.carrier.position.set(0, 0, 0); a.m.root.position.set(a.x, a.y, a.z); }
      a.m.root.rotation.y = a.h;
      // animasyon seyreltme
      const d = Math.hypot(a.x - cx, a.y - cy, a.z - cz);
      _sp.center.set(a.x, a.y + 0.9, a.z);
      const vis = !camera || _fr.intersectsSphere(_sp);
      const every = !vis ? 10 : d < 12 ? 1 : d < 24 ? 2 : d < 40 ? 3 : 5;
      a.acc += dt;
      if ((this.frame + a.id) % every === 0) {
        const st = a.st;
        st.speed = a.state === 'walk' || a.state === 'flee' ? a.speed : 0;
        st.talk = !!a.talk && a.state !== 'walk';
        st.phone = !!a.phone && a.state === 'idle';
        // yeme jesti: 3-6 sn'de bir ~1.6 sn ağza götür
        if (a.state === 'sit' && a.eat) { a.eatT -= a.acc; const ph = a.eatT; if (ph < 0) a.eatT = 3 + Math.random() * 3; a.eatK = ph > 0 && ph < 1.6 ? Math.sin((ph / 1.6) * Math.PI) : 0; } else a.eatK = 0;
        a.m.animate(Math.min(0.12, a.acc), st);
        a.acc = 0; animated++;
      }
    }
    this.stats.animated = animated;
  }

  step(a, dt, director) {
    if (a.state === 'walk' || a.state === 'flee') {
      if (a.t > 0) { a.t -= dt; a.speed = 0; return; } // kaçışta tepki gecikmesi
      const p = a.path[a.pi];
      if (!p) {
        if (a.state === 'flee') { this.remove(a); return; }
        a.riding = null; a.speed = 0; a.state = a.after || 'idle'; a.t = a.afterT ?? 3;
        if (a.faceAfter !== undefined) { a.faceH = a.faceAfter; a.faceAfter = undefined; }
        if (a.onArrive) { const f = a.onArrive; a.onArrive = null; f(a); }
        return;
      }
      const dx = p.x - a.x, dz = p.z - a.z, dy = (p.y ?? a.y) - a.y, dl = Math.hypot(dx, dz);
      const v = p.ride ? p.ride : a.walk;
      a.riding = p.ride ? p : null;
      const stp = v * dt;
      if (dl <= stp || dl < 0.05) { a.x = p.x; a.z = p.z; if (p.y !== undefined) a.y = p.y; a.pi++; return; }
      a.x += dx / dl * stp; a.z += dz / dl * stp; a.y += dy * (stp / dl);
      a.speed = p.ride ? 0 : v;
      if (!p.ride) this.turnTo(a, Math.atan2(dx, dz), dt, 7);
      return;
    }
    // durağan: otur / bak / bekle — süre dolunca yönetmen yeni iş verir (sıradakileri sıra yöneticisi taşır)
    if (a.faceH !== undefined) this.turnTo(a, a.faceH, dt);
    if (a.state === 'queue') return;
    a.t -= dt;
    if (a.t <= 0 && director) director(a);
  }
  turnTo(a, h, dt, k = 5) { let d = h - a.h; d = Math.atan2(Math.sin(d), Math.cos(d)); a.h += d * Math.min(1, dt * k); }
}
