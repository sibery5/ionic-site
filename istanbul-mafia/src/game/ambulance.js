// [kanun] Ambulans ve sağlıkçılar.
// Çatışma sonrası (yaralı / ölü varsa) ambulans görüş dışından sirenle gelir. Ateş sürüyorsa olay yerinin
// ~55 m uzağındaki güvenli bir noktada bekler; ortalık sakinleşince yaklaşır, iki sağlıkçı iner.
//  - Yerdeki yaralıyı tedavi eder: "Tamam, iyileştin, şimdi gidebilirsin." -> kişi kalkıp yürür
//    (polisin kelepçelediği şüpheli polis gözetiminde ambulansa biner).
//  - Hafif yaralı siviller kendileri sağlıkçıya yürür, pansuman yapılır.
//  - Ölü: ceset torbası, sedye, ambulansın arka kapısından içeri; kapılar kapanır, sağlıkçılar biner, hastaneye gider.
//  - Çatışma yeniden başlarsa sağlıkçılar ambulansın arkasına çekilip çömelir.
import * as THREE from 'three';
import { randomLook } from '../entities/character.js';
import { RNG } from '../core/util.js';

const medRng = new RNG(112);

const WAIT_D = 55; // ateş sürerken bekleme uzaklığı
const SAFE_NEED = 4; // sakinlik süresi (sn)
let MAT = null;
function mats() {
  if (MAT) return MAT;
  MAT = {
    bag: new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.55, metalness: 0.05 }),
    zip: new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.4, metalness: 0.6 }),
    frame: new THREE.MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.35, metalness: 0.7 }),
    pad: new THREE.MeshStandardMaterial({ color: 0xd8641e, roughness: 0.8 }),
    wheel: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
    door: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5, metalness: 0.1 }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xc81020, roughness: 0.6 }),
  };
  return MAT;
}
function bagMesh() {
  const M = mats(), g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 1.25, 4, 10), M.bag);
  body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.62); body.position.y = 0.15; body.castShadow = true;
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 1.35), M.zip); zip.position.y = 0.3;
  g.add(body, zip);
  return g;
}
function stretcherMesh() {
  const M = mats(), g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 1.95), M.frame); frame.position.y = 0.62;
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 1.85), M.pad); pad.position.y = 0.67;
  g.add(frame, pad);
  for (const sx of [-0.22, 0.22]) for (const sz of [-0.78, 0.78]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), M.frame); leg.position.set(sx, 0.36, sz); g.add(leg);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 10), M.wheel); w.rotation.z = Math.PI / 2; w.position.set(sx, 0.06, sz); g.add(w);
  }
  for (const sz of [-1.04, 1.04]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.08), M.frame); h.position.set(0, 0.64, sz); g.add(h); }
  return g;
}
export function medicLook() {
  return Object.assign(randomLook(medRng, 'civilian'), { top: 'jacket', topColor: '#24497e', shirtColor: '#e8edf2', pants: 'slacks', pantsColor: '#1b2a44', shoes: 'boots', shoesColor: '#222', hat: 'none', chain: false, glasses: false });
}

export class Ambulance {
  constructor(game) {
    this.g = game;
    this.fire = []; // son silah sesleri {x,z,t}
    this.clock = 0;
    this.unit = null;
    this.pending = null; // ambulans çağrılmış olay {x,z,t}
    this.scanT = 2;
    this.stats = { dispatched: 0, waited: 0, healed: 0, walkIn: 0, bagged: 0, loaded: 0, left: 0 };
  }
  noteGunfire(x, z) {
    const now = this.clock;
    for (const f of this.fire) if (Math.abs(f.x - x) < 15 && Math.abs(f.z - z) < 15) { f.t = now; return; }
    this.fire.push({ x, z, t: now });
    if (this.fire.length > 16) this.fire.shift();
  }
  // olay yeri güvenli mi: son 8 sn içinde silah sesi yok, yakında çatışan yok
  unsafe(x, z) {
    const now = this.clock, g = this.g;
    for (const f of this.fire) if (now - f.t < 8 && Math.hypot(f.x - x, f.z - z) < 60) return true;
    for (const n of g.npcs.list) {
      if (n.dead || n.downed || n.state !== 'attack' || !n.target || n.target.dead) continue;
      if (Math.abs(n.pos.x - x) < 45 && Math.abs(n.pos.z - z) < 45) return true;
    }
    return false;
  }
  casualty(n) { return (n.dead || n.downed) && !n.mission && !n.bagged && !n.medicTaken && !n.passengerOf && !n.cargoOf && !n.inInterior && !n.vehicle && !n.medic; }

  update(dt) {
    const g = this.g, p = g.player;
    this.clock += dt;
    if (p.inInterior) return; // şehir listesi saklı
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 1; this.scan(); }
    if (this.unit) this.updateUnit(dt);
  }
  scan() {
    const g = this.g, p = g.player;
    if (this.unit) return;
    let best = null, bd = 1e9;
    for (const n of g.npcs.list) {
      if (!this.casualty(n)) continue;
      const d = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
      if (d > 130) continue;
      if (n.dead) n.removeT = Math.max(n.removeT, 120); // ceset ambulans gelene kadar kalsın
      if (d < bd) { bd = d; best = n; }
    }
    if (!best) { this.pending = null; return; }
    if (!this.pending || Math.hypot(this.pending.x - best.pos.x, this.pending.z - best.pos.z) > 60) this.pending = { x: best.pos.x, z: best.pos.z, t: 0 };
    this.pending.t += 1;
    if (this.pending.t >= 6) this.dispatch(this.pending);
  }
  dispatch(at) {
    const g = this.g;
    if (!g.wanted.entryPoint) return;
    const hosp = g.map.nearestOfType && g.map.nearestOfType('hospital', at.x, at.z);
    const s = g.wanted.entryPoint(at.x, at.z, hosp ? hosp.door : null, 110, 190);
    if (!s) return;
    const dx = s.to.x - s.from.x, dz = s.to.z - s.from.z, l = Math.hypot(dx, dz) || 1, fx = dx / l, fz = dz / l;
    const lane = s.e.width >= 16 ? 2.1 : 2.5;
    const v = g.vehicles.add('ambulans', s.x - fz * lane, s.z + fx * lane, Math.atan2(fx, fz));
    v.ai = { mode: 'chase', from: s.from, to: s.to, next: g.vehicles.chooseNext(s.to, s.from, at), cruise: 16, outer: false, laneCur: lane, seen: false, goal: { x: at.x, z: at.z } };
    v.vx = fx * 10; v.vz = fz * 10; v.sirenOn = true; v.mission = 'ambulance';
    const medics = [];
    for (let i = 0; i < 2; i++) {
      const m = g.npcs.add('civilian', v.pos.x, v.pos.z, medicLook(), { persistent: true, state: 'ext', name: 'Sağlıkçı' });
      m.medic = true; m.ext = () => 0; m.brave = true;
      if (!(v.addPassenger && v.addPassenger(m) >= 0)) { m.cargoOf = v; m.pos.y = -30; m.model.root.visible = false; }
      medics.push(m);
    }
    // varış noktası: olaya en yakın yol kenarı; bekleme noktası: geliş yönünde ~55 m geride
    const ux = s.x - at.x, uz = s.z - at.z, ul = Math.hypot(ux, uz) || 1;
    const wait = g.map.nearestNode(at.x + ux / ul * WAIT_D, at.z + uz / ul * WAIT_D);
    this.unit = { v, medics, at: { x: at.x, z: at.z }, wait: wait ? { x: wait.x, z: wait.z } : { x: at.x + ux / ul * WAIT_D, z: at.z + uz / ul * WAIT_D }, phase: 'enroute', t: 0, safeT: 0, tasks: [], doors: null, load: [], hosp };
    this.pending = null;
    this.stats.dispatched++;
  }

  // arka kapılar (iki kanat) — menteşe dış kenarlarda
  rearDoors(U) {
    if (U.doors) return U.doors;
    const v = U.v, ud = v.mesh.userData, ch = ud.chassis || v.mesh;
    const bb = new THREE.Box3();
    if (ud.bodyMesh) { ud.bodyMesh.geometry.computeBoundingBox(); bb.copy(ud.bodyMesh.geometry.boundingBox); } else bb.set(new THREE.Vector3(-1, 0.3, -2.9), new THREE.Vector3(1, 2.5, 2.9));
    const W = bb.max.x - bb.min.x, y0 = bb.min.y + 0.32, y1 = bb.max.y - 0.25, hw = W / 2 - 0.08;
    const M = mats(), doors = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * hw, y0, bb.min.z - 0.015);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(hw, y1 - y0, 0.035), M.door); panel.position.set(-s * hw / 2, (y1 - y0) / 2, 0);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(hw, 0.12, 0.04), M.stripe); stripe.position.set(-s * hw / 2, (y1 - y0) * 0.38, 0);
      piv.add(panel, stripe); ch.add(piv); doors.push({ piv, s, ang: 0 });
    }
    U.doors = doors; U.rearZ = bb.min.z; U.floorY = y0;
    return doors;
  }
  setRear(U, ang) { for (const d of this.rearDoors(U)) { d.ang = ang; d.piv.rotation.y = d.s * ang; } }
  // dünya koordinatında aracın arkası (kapının 1.2 m gerisi)
  rearPoint(U, back = 1.3) {
    const v = U.v, f = v.fwd, rz = (U.rearZ !== undefined ? U.rearZ : -v.def.len / 2);
    return { x: v.pos.x + f.x * (rz - back), z: v.pos.z + f.z * (rz - back) };
  }

  updateUnit(dt) {
    const g = this.g, U = this.unit, v = U.v, p = g.player;
    U.t += dt;
    if (v.destroyed || !g.vehicles.list.includes(v) || U.t > 240) { this.abort(); return; }
    const unsafe = this.unsafe(U.at.x, U.at.z);
    U.safeT = unsafe ? 0 : U.safeT + dt;
    const dv = (q) => Math.hypot(q.x - v.pos.x, q.z - v.pos.z);
    if (U.phase === 'enroute') {
      const goal = unsafe || U.safeT < SAFE_NEED ? U.wait : U.at;
      if (v.ai && v.ai.mode === 'chase') { v.ai.goal = goal; v.ai.seen = false; }
      const close = goal === U.at ? dv(U.at) < 16 : dv(U.wait) < 12;
      if (close) { v.ai = { mode: 'halt' }; U.phase = goal === U.at ? 'arrive' : 'hold'; U.t0 = U.t; if (U.phase === 'hold') { this.stats.waited++; v.sirenOn = false; } }
    } else if (U.phase === 'hold') {
      // güvenli noktada bekle; sakinleşince olay yerine
      if (v.speed < 1 && v.ai && v.ai.mode === 'halt') { v.ai = { empty: true }; v.parked = true; }
      if (U.safeT > SAFE_NEED) this.resume(U, U.at);
    } else if (U.phase === 'arrive') {
      if (v.speed < 1 || U.t - U.t0 > 4) {
        v.ai = { empty: true }; v.parked = true; v.sirenOn = false;
        U.phase = 'work'; U.t0 = U.t;
        for (let i = 0; i < U.medics.length; i++) {
          const m = U.medics[i];
          if (m.passengerOf === v) v.removePassenger(m);
          else if (m.cargoOf === v) { m.cargoOf = null; const r = this.rearPoint(U, 0.8 + i * 0.6); m.pos.set(r.x, 0, r.z); m.model.root.visible = true; }
          m.sync(); this.idle(m);
        }
        this.planTasks(U);
      }
    } else if (U.phase === 'work') {
      this.updateWork(U, dt, unsafe);
    } else if (U.phase === 'board') {
      const out = U.medics.filter((m) => !m.dead && !m.passengerOf && !m.cargoOf);
      if (!out.length || U.t - U.t0 > 12) {
        for (const m of out) { m.cargoOf = v; m.pos.y = -30; m.model.root.visible = false; m.ext = () => 0; }
        this.setRear(U, 0);
        U.phase = 'leave'; U.t0 = U.t;
        const H = U.hosp || (g.map.nearestOfType && g.map.nearestOfType('hospital', v.pos.x, v.pos.z));
        const goal = H ? { x: H.door.x, z: H.door.z } : { x: v.pos.x + 300, z: v.pos.z };
        const n = g.map.nearestNode(v.pos.x, v.pos.z), o = n && n.edges.length ? g.map.other(n.edges[0], n) : null;
        v.parked = false;
        v.ai = { mode: 'chase', from: n, to: o, next: g.vehicles.chooseNext(o, n, goal), cruise: 14, outer: false, laneCur: 2.5, seen: false, goal };
        v.sirenOn = U.load.length > 0;
        this.stats.left++;
      }
    } else if (U.phase === 'leave') {
      const goal = v.ai && v.ai.goal;
      if ((goal && dv(goal) < 25) || Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) > 230 || U.t - U.t0 > 120) this.cleanup(true);
    }
  }
  resume(U, goal) {
    const g = this.g, v = U.v;
    const n = g.map.nearestNode(v.pos.x, v.pos.z), o = n && n.edges.length ? g.map.other(n.edges[0], n) : null;
    if (!n || !o) return;
    v.parked = false; v.sirenOn = true;
    v.ai = { mode: 'chase', from: n, to: o, next: g.vehicles.chooseNext(o, n, goal), cruise: 12, outer: false, laneCur: 2.5, seen: false, goal };
    U.phase = 'enroute';
  }
  idle(m) { m.state = 'ext'; m.extCrouch = false; m.ext = () => 0; m.task = null; }
  planTasks(U) {
    const g = this.g;
    U.tasks = [];
    for (const n of g.npcs.list) {
      if (!this.casualty(n)) continue;
      if (Math.hypot(n.pos.x - U.at.x, n.pos.z - U.at.z) > 45) continue;
      U.tasks.push({ n, kind: n.dead ? 'body' : 'wound', who: null });
      n.medicTaken = true;
    }
    // ayakta hafif yaralılar: sağlıkçıya yürür
    for (const n of g.npcs.list) {
      if (n.dead || n.downed || n.medic || n.mission || n.faction !== 'civilian' || n.state === 'attack' || n.passengerOf || n.cargoOf) continue;
      if (n.hp > n.maxHp * 0.8 || Math.hypot(n.pos.x - U.at.x, n.pos.z - U.at.z) > 50) continue;
      U.tasks.push({ n, kind: 'walkin', who: null }); n.medicTaken = true;
    }
    U.tasks.sort((a, b) => (a.kind === 'body') - (b.kind === 'body'));
  }
  say(m, text) { m.barkT = 0; m.say(text); }

  updateWork(U, dt, unsafe) {
    const g = this.g, v = U.v;
    // ateş yeniden başladı: aracın arkasına çekil, çömel
    if (unsafe) {
      for (const m of U.medics) {
        if (m.dead || m.carry) continue;
        const r = this.rearPoint(U, 0.9);
        m.state = 'ext'; m.extCrouch = true;
        m.ext = (dt2, n) => { const d = n.navTo(r.x, r.z, 4.5, dt2, true); return d > 0.6 ? n.speed : 0; };
        if (m.task) { m.task.who = null; m.task = null; }
      }
      U.hiding = true;
      return;
    }
    if (U.hiding) { U.hiding = false; for (const m of U.medics) if (!m.dead && !m.carry) this.idle(m); }
    for (const m of U.medics) {
      if (m.dead || m.downed) continue;
      if (!m.task) {
        const t = U.tasks.find((k) => !k.who && !k.done && (k.kind !== 'body' || !U.medics.some((o) => o !== m && o.task && o.task.kind === 'body')));
        if (t) this.assign(U, m, t);
      }
    }
    // bitti mi
    U.tasks = U.tasks.filter((k) => !k.done && !(k.n.removeMe) && g.npcs.list.includes(k.n));
    if (!U.tasks.length && U.medics.every((m) => m.dead || !m.task)) this.board(U);
    void dt; void v;
  }
  assign(U, m, task) {
    const g = this.g, v = U.v, n = task.n;
    task.who = m; m.task = task; m.state = 'ext'; m.extCrouch = false;
    let t = 0, stage = 0, st = null, bag = null;
    const done = () => { task.done = true; m.task = null; this.idle(m); };
    if (task.kind === 'wound') {
      m.ext = (dt, me) => {
        if (n.dead) { task.kind = 'body'; task.who = null; m.task = null; this.idle(m); return 0; } // yetişemedi
        const d = Math.hypot(n.pos.x - me.pos.x, n.pos.z - me.pos.z);
        if (stage === 0) { if (d > 1.0) { me.navTo(n.pos.x, n.pos.z, 3.6, dt, true); return me.speed; } stage = 1; this.say(me, ['Sakin ol, buradayız.', 'Kıpırdama, bakıyorum.']); }
        me.extCrouch = true; me.heading = Math.atan2(n.pos.x - me.pos.x, n.pos.z - me.pos.z);
        t += dt;
        if (t > 2.6) {
          g.combat.bleeding = g.combat.bleeding.filter((b) => b.a !== n);
          n.downed = false; n.model.setDowned && n.model.setDowned(false); n.hp = Math.max(n.hp, n.maxHp * 0.55); n.treated = true;
          this.say(me, 'Tamam, iyileştin, şimdi gidebilirsin.');
          this.stats.healed++;
          if (n.cuffed) this.escort(U, n);
          else { n.state = 'walk'; n.path = []; n.cur = null; n.target = null; n.medicTaken = false; n.hurtT = 0; }
          me.extCrouch = false; done();
        }
        return 0;
      };
    } else if (task.kind === 'walkin') {
      n.state = 'ext';
      n.ext = (dt, me) => { const d = me.navTo(m.pos.x, m.pos.z, 1.4, dt, true); return d > 1.3 ? me.speed : 0; };
      this.stats.walkIn++;
      m.ext = (dt, me) => {
        const d = Math.hypot(n.pos.x - me.pos.x, n.pos.z - me.pos.z);
        if (n.dead || n.downed) { n.ext = null; done(); return 0; }
        me.heading = Math.atan2(n.pos.x - me.pos.x, n.pos.z - me.pos.z);
        if (d > 1.6) { t += dt; if (t > 15) { n.ext = null; n.state = 'walk'; done(); } return 0; }
        stage += dt;
        if (stage > 2.0) {
          n.hp = Math.max(n.hp, n.maxHp * 0.9); n.treated = true;
          this.say(me, 'Tamam, iyileştin, şimdi gidebilirsin.');
          this.stats.healed++;
          n.ext = null; n.state = 'walk'; n.path = []; n.cur = null; n.medicTaken = false;
          done();
        }
        return 0;
      };
    } else {
      // ceset: torbala -> sedye -> ambulans
      const other = U.medics.find((o) => o !== m && !o.dead);
      m.ext = (dt, me) => {
        const d = Math.hypot(n.pos.x - me.pos.x, n.pos.z - me.pos.z);
        if (stage === 0) { if (d > 1.1) { me.navTo(n.pos.x, n.pos.z, 3.0, dt, true); return me.speed; } stage = 1; t = 0; }
        if (stage === 1) {
          me.extCrouch = true; me.heading = Math.atan2(n.pos.x - me.pos.x, n.pos.z - me.pos.z); t += dt;
          if (t > 2.2) {
            bag = bagMesh(); bag.position.set(n.pos.x, Math.max(0, n.pos.y), n.pos.z); bag.rotation.y = n.heading;
            g.npcs.group.add(bag); n.model.root.visible = false; n.bagged = true; n.removeT = 999; this.stats.bagged++;
            this.say(me, other ? 'Sedyeyi getir.' : 'Torbaladım.');
            stage = 2; t = 0; me.extCrouch = false;
            this.setRear(U, 0);
          }
          return 0;
        }
        const rear = this.rearPoint(U, 1.6);
        if (stage === 2) {
          // sedyeyi almaya arka kapıya
          const dd = Math.hypot(rear.x - me.pos.x, rear.z - me.pos.z);
          this.setRear(U, Math.min(1.9, this.rearDoors(U)[0].ang + dt * 3));
          if (dd > 0.8) { me.navTo(rear.x, rear.z, 3.4, dt, true); return me.speed; }
          st = stretcherMesh(); g.npcs.group.add(st); me.carry = st; stage = 3; t = 0;
        }
        // sedyeyi önünde iterek taşı (yardımcı karşı uçta)
        const carry = (tx, tz, sp) => {
          const dd = me.navTo(tx, tz, sp, dt, true);
          const h = me.heading, fx = Math.sin(h), fz = Math.cos(h);
          st.position.set(me.pos.x + fx * 1.35, 0, me.pos.z + fz * 1.35); st.rotation.y = h;
          if (bag && stage >= 5) { bag.position.set(st.position.x, 0.58, st.position.z); bag.rotation.y = h; }
          if (other && other.state === 'ext' && !other.task) { other.ext = (dt2, o) => { o.navTo(me.pos.x + fx * 2.75, me.pos.z + fz * 2.75, sp + 0.6, dt2, true); return o.speed; }; }
          return dd;
        };
        if (stage === 3) { if (carry(n.pos.x - Math.sin(me.heading) * 1.3, n.pos.z - Math.cos(me.heading) * 1.3, 2.4) > 0.6) return me.speed; stage = 4; t = 0; }
        if (stage === 4) {
          // torbayı sedyeye kaldır
          t += dt; const u = Math.min(1, t / 1.0);
          bag.position.y = 0.58 * u + Math.max(0, n.pos.y) * (1 - u);
          bag.position.x += (st.position.x - bag.position.x) * Math.min(1, dt * 6); bag.position.z += (st.position.z - bag.position.z) * Math.min(1, dt * 6);
          bag.rotation.y = st.rotation.y;
          if (t > 1.1) { stage = 5; t = 0; this.stats.loaded++; }
          return 0;
        }
        if (stage === 5) { if (carry(rear.x - v.fwd.x * 0.4, rear.z - v.fwd.z * 0.4, 2.2) > 0.7) return me.speed; stage = 6; t = 0; }
        if (stage === 6) {
          // sedye arka kapıdan içeri kayar
          t += dt; const f = v.fwd, u = Math.min(1, t / 1.1);
          const sx = rear.x + f.x * (1.4 + 2.0 * u), sz = rear.z + f.z * (1.4 + 2.0 * u);
          st.position.set(sx, (U.floorY || 0.5) * u, sz); st.rotation.y = v.heading;
          bag.position.set(sx, 0.58 + (U.floorY || 0.5) * u, sz); bag.rotation.y = v.heading;
          me.heading = v.heading;
          if (t > 1.2) {
            st.parent && st.parent.remove(st); bag.parent && bag.parent.remove(bag);
            me.carry = null; U.load.push(n);
            g.npcs.remove(n);
            if (other && other.state === 'ext' && !other.task) this.idle(other);
            done();
          }
          return 0;
        }
        return 0;
      };
    }
  }
  // tedavi edilen kelepçeli şüpheli: ambulansa biner (polis gözetimi)
  escort(U, n) {
    const v = U.v;
    n.state = 'ext';
    n.ext = (dt, me) => {
      const r = this.rearPoint(U, 0.6);
      const d = me.navTo(r.x, r.z, 1.3, dt, true);
      if (d < 0.9) { me.ext = null; me.removeMe = true; U.load.push(me); }
      return me.speed;
    };
    if (this.g.ui) this.g.ui.bark(n, 'Tamam... tamam, geliyorum.');
    void v;
  }
  board(U) {
    const v = U.v;
    U.phase = 'board'; U.t0 = U.t;
    this.setRear(U, 0);
    for (const m of U.medics) {
      if (m.dead || m.downed) continue;
      m.state = 'ext'; m.extCrouch = false;
      m.ext = (dt, me) => {
        const f = v.fwd, s = U.medics.indexOf(me) ? -1 : 1, off = v.def.wid / 2 + 0.6;
        const dx = v.pos.x + f.z * s * off + f.x * 1.2, dz = v.pos.z - f.x * s * off + f.z * 1.2;
        const d = me.navTo(dx, dz, 2.6, dt, true);
        if (d < 1.1) { me.ext = () => 0; if (!(v.addPassenger && v.addPassenger(me) >= 0)) { me.cargoOf = v; me.pos.y = -30; me.model.root.visible = false; } }
        return me.speed;
      };
    }
  }
  abort() { this.cleanup(false); }
  cleanup() {
    const g = this.g, U = this.unit;
    if (!U) return;
    for (const m of U.medics) { m.cargoOf = null; g.npcs.remove(m); }
    for (const k of U.tasks) if (k.n) { k.n.medicTaken = false; if (k.n.bagged && g.npcs.list.includes(k.n)) g.npcs.remove(k.n); }
    if (g.vehicles.list.includes(U.v) && U.v !== g.player.vehicle) g.vehicles.remove(U.v);
    this.unit = null;
  }
}
