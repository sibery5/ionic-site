// NPC'ler: siviller, polisler, çete üyeleri, patronlar, dükkâncılar ve yapay zekâları.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { randomLook } from './character.js';
import { RNG, angleDiff, clamp, dampAngle, rng } from '../core/util.js';
import { districtAt, isLand } from '../world/map.js';
import { GANGS } from '../game/economy.js';
import { WEAPONS } from '../game/weapons.js';
import { audio } from '../core/audio.js';

const lookRng = new RNG(777);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

const CIV_NAMES = ['Ahmet', 'Mehmet', 'Ayşe', 'Fatma', 'Mustafa', 'Zeynep', 'Emre', 'Elif', 'Hasan', 'Hüseyin', 'Selin', 'Burak', 'Deniz', 'Cem', 'Merve', 'Kemal', 'Leyla', 'Okan', 'Canan', 'Yusuf'];

export class NPC extends Actor {
  constructor(game, kind, look, opts = {}) {
    super(game, look || randomLook(lookRng, kind === 'gang' ? 'gang' : kind === 'police' ? 'police' : kind === 'boss' ? 'boss' : 'civilian'));
    this.kind = kind;
    this.faction = kind === 'police' ? 'police' : kind === 'gang' || kind === 'boss' ? 'gang' : 'civilian';
    this.gang = opts.gang || null;
    this.state = opts.state || 'walk';
    this.target = null;
    this.path = [];
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.walkSpeed = 1.3 + Math.random() * 0.4;
    this.fleeT = 0;
    this.reactT = 0;
    this.thinkT = Math.random();
    this.accuracy = opts.accuracy || (kind === 'police' ? 1.0 : kind === 'gang' ? 0.8 : 0.6);
    this.name = opts.name || CIV_NAMES[Math.floor(Math.random() * CIV_NAMES.length)];
    this.money = opts.money ?? (kind === 'gang' ? 80 + Math.floor(Math.random() * 400) : kind === 'police' ? 40 : Math.floor(Math.random() * 90));
    this.mission = opts.mission || null;
    this.static = !!opts.static;
    this.home = opts.home ? opts.home.clone() : null;
    this.brave = kind !== 'civilian' || Math.random() < 0.08;
    this.removeT = 25;
    this.hostile = !!opts.hostile;
    if (kind === 'police') { this.maxHp = this.hp = 120; this.giveWeapon(Math.random() < 0.8 ? 'pistol' : 'shotgun', 200); this.setWeapon(this.weapons.pistol ? 'pistol' : 'shotgun'); }
    if (kind === 'swat') { this.faction = 'police'; this.maxHp = this.hp = 180; this.armor = 100; this.giveWeapon('m4', 400); this.setWeapon('m4'); }
    if (kind === 'gang') {
      const w = opts.weapon || (Math.random() < 0.5 ? 'pistol' : Math.random() < 0.5 ? 'uzi' : Math.random() < 0.5 ? 'bat' : 'ak');
      this.giveWeapon(w, 300); this.setWeapon(w);
    }
    if (kind === 'boss') { this.maxHp = this.hp = 450; this.armor = 100; this.giveWeapon(opts.weapon || 'revolver', 500); this.setWeapon(opts.weapon || 'revolver'); }
    if (kind === 'civilian' && this.brave && Math.random() < 0.5) { this.giveWeapon('pistol', 30); }
    if (opts.weapon && kind !== 'gang' && kind !== 'boss') { this.giveWeapon(opts.weapon, 300); this.setWeapon(opts.weapon); }
    if (opts.hp) this.maxHp = this.hp = opts.hp;
  }

  hearThreat(source, d) {
    if (this.dead || this.static && this.kind === 'shopkeeper') return;
    if (!source) return;
    if (this.faction === 'police') {
      if (source.isPlayer && this.game.wanted.level > 0) { this.state = 'attack'; this.target = source; }
      return;
    }
    if (this.faction === 'gang') {
      if (source.isPlayer && (this.hostile || this.game.gangHostile(this.gang) || d < 15)) { this.state = 'attack'; this.target = source; }
      return;
    }
    if (this.kind === 'resident' || this.kind === 'civilian' || this.kind === 'shopkeeper') {
      if (this.brave && this.weapons.pistol && source.isPlayer && d < 20 && Math.random() < 0.5) { this.state = 'attack'; this.target = source; this.setWeapon('pistol'); return; }
      if (this.state !== 'flee') { this.reactT = Math.random() * 0.5; if (Math.random() < 0.3) audio.scream(this.pos.x, this.pos.z); }
      this.state = 'flee'; this.fleeFrom = source.pos.clone(); this.fleeT = 8 + Math.random() * 6;
      this.static = false;
    }
  }

  onDamaged(dmg, attacker) {
    if (!attacker) return;
    if (attacker.isPlayer) {
      const g = this.game;
      if (this.faction === 'police') { g.wanted.crime('assault_police'); this.state = 'attack'; this.target = attacker; }
      else if (this.faction === 'gang') {
        g.angerGang(this.gang, this.pos);
        this.state = 'attack'; this.target = attacker;
      } else {
        if (dmg > 5) g.wanted.crime('assault', this.pos);
        this.hearThreat(attacker, 1);
      }
    } else if (attacker !== this) {
      if (this.faction !== 'civilian' && attacker.faction !== this.faction) { this.state = 'attack'; this.target = attacker; }
    }
  }

  onDeath(attacker, kind) {
    const g = this.game;
    this.state = 'dead';
    this.removeT = 30;
    g.npcs.onNpcDeath(this, attacker, kind);
  }

  // kaldırım boyunca yürüme yol noktaları
  planWalk() {
    const map = this.game.map;
    if (!this.cur) {
      const n = map.nearestNode(this.pos.x, this.pos.z);
      if (!n || !n.edges.length) return;
      this.prev = n;
      this.cur = map.other(n.edges[Math.floor(Math.random() * n.edges.length)], n);
    }
    const from = this.prev, to = this.cur;
    const e = from.edges.find((ed) => map.other(ed, from) === to);
    const hw = e ? e.width / 2 : 6;
    const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
    const fx = dx / l, fz = dz / l;
    const rx = -fz, rz = fx;
    const off = hw + 1.5;
    let cross = 6;
    for (const ed of to.edges) if (ed !== e) cross = Math.max(cross, ed.width / 2);
    this.path = [
      { x: to.x - fx * (cross + 1.5) + rx * off * this.side, z: to.z - fz * (cross + 1.5) + rz * off * this.side },
    ];
    // sonraki kenar
    const opts = to.edges.map((ed) => map.other(ed, to)).filter((nn) => nn !== from);
    const next = opts.length ? opts[Math.floor(Math.random() * opts.length)] : from;
    const e2 = to.edges.find((ed) => map.other(ed, to) === next);
    const hw2 = e2 ? e2.width / 2 : 6;
    const dx2 = next.x - to.x, dz2 = next.z - to.z, l2 = Math.hypot(dx2, dz2) || 1;
    const fx2 = dx2 / l2, fz2 = dz2 / l2;
    this.path.push({ x: to.x + fx2 * (cross + 1.5) + -fz2 * (hw2 + 1.5) * this.side, z: to.z + fz2 * (cross + 1.5) + fx2 * (hw2 + 1.5) * this.side });
    this.prev = to; this.cur = next;
  }

  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { this.speed = 0; return d; }
    const want = Math.atan2(dx, dz);
    this.heading = dampAngle(this.heading, want, 8, dt);
    const s = Math.min(speed, d / dt);
    this.pos.x += Math.sin(this.heading) * s * dt;
    this.pos.z += Math.cos(this.heading) * s * dt;
    this.speed = s;
    return d;
  }

  update(dt) {
    const g = this.game;
    this.updateWeapon(dt);
    if (this.dead) {
      this.removeT -= dt;
      this.model.animate(dt, this.animState());
      this.sync();
      return;
    }
    if (this.vehicle) return;
    const player = g.player;
    this.thinkT -= dt;
    this.aiming = false;
    let speed = 0;
    if (this.knock && this.knock.t > 0) {
      this.knock.t -= dt;
      this.pos.x += this.knock.x * dt * 3; this.pos.z += this.knock.z * dt * 3;
    }
    // çete düşmanlığı ve polis: oyuncuyu fark et
    if (this.thinkT <= 0) {
      this.thinkT = 0.4 + Math.random() * 0.3;
      const pd = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      if (!player.dead && (player.inInterior || null) === (this.inInterior || null)) {
        if (this.faction === 'police' && g.wanted.level > 0 && pd < 60 && this.state !== 'attack' && this.state !== 'arrest') {
          this.state = g.wanted.level >= 2 ? 'attack' : 'arrest'; this.target = player;
        }
        if (this.faction === 'police' && g.wanted.level >= 2 && this.state === 'arrest') this.state = 'attack';
        if (this.faction === 'gang' && this.state !== 'attack' && pd < 28 && (this.hostile || g.gangHostile(this.gang)) && g.physics.lineOfSight(this.pos.x, 1.6, this.pos.z, player.pos.x, 1.6, player.pos.z)) {
          this.state = 'attack'; this.target = player;
          if (Math.random() < 0.3) g.ui.bark(this, ['Bu bizim mahallemiz!', 'Vurun şunu!', 'Hesabı ödeyeceksin!'][Math.floor(Math.random() * 3)]);
        }
        // oyuncu silah doğrultuyorsa siviller korkar
        if (this.faction === 'civilian' && player.aiming && player.weapon !== 'fists' && pd < 15 && this.state !== 'flee' && !this.static) {
          const f = { x: Math.sin(player.camYaw), z: Math.cos(player.camYaw) };
          const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
          if ((dx * f.x + dz * f.z) / (pd || 1) > 0.85) { this.state = 'handsup'; this.handsUpT = 4; }
        }
      }
      if (this.target && (this.target.dead || (this.target.inInterior || null) !== (this.inInterior || null))) { this.target = null; this.state = this.faction === 'civilian' ? 'flee' : this.home ? 'guard' : 'walk'; this.fleeT = 4; }
    }
    this.handsUp = false;
    switch (this.state) {
      case 'walk': {
        if (!this.path.length) this.planWalk();
        const wp = this.path[0];
        if (wp) {
          const d = this.moveToward(wp.x, wp.z, this.walkSpeed, dt);
          speed = this.speed;
          if (d < 0.8) this.path.shift();
        }
        break;
      }
      case 'idle': case 'guard': {
        if (this.home && Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) > 1.5) { this.moveToward(this.home.x, this.home.z, 1.5, dt); speed = this.speed; }
        else if (this.faceYaw !== undefined) this.heading = dampAngle(this.heading, this.faceYaw, 4, dt);
        this.talking = this.kind === 'gang' && Math.sin(performance.now() * 0.0005 + this.id) > 0.6;
        break;
      }
      case 'handsup': {
        this.handsUp = true;
        this.handsUpT -= dt;
        if (this.handsUpT <= 0) { this.state = 'flee'; this.fleeFrom = player.pos.clone(); this.fleeT = 8; }
        break;
      }
      case 'flee': {
        if (this.reactT > 0) { this.reactT -= dt; break; }
        this.fleeT -= dt;
        const from = this.fleeFrom || player.pos;
        const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
        const d = Math.hypot(dx, dz) || 1;
        let tx = this.pos.x + (dx / d) * 5, tz = this.pos.z + (dz / d) * 5;
        // engelden kaçınma: sağa sola sap
        const look = { x: this.pos.x + (dx / d) * 1.5, z: this.pos.z + (dz / d) * 1.5 };
        g.physics.resolveCircle(look, 0.4, 0);
        if (Math.hypot(look.x - this.pos.x - (dx / d) * 1.5, look.z - this.pos.z - (dz / d) * 1.5) > 0.2) { tx = this.pos.x - dz / d * 5; tz = this.pos.z + dx / d * 5; }
        this.moveToward(tx, tz, 5.2, dt); speed = this.speed;
        if (this.fleeT <= 0) { this.state = this.home ? 'guard' : 'walk'; this.path = []; this.cur = null; }
        break;
      }
      case 'arrest': case 'attack': {
        const t = this.target || player;
        if (!t || t.dead) { this.state = this.home ? 'guard' : 'walk'; break; }
        const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        const def = this.wdef;
        const melee = def.type === 'melee';
        const want = Math.atan2(dx, dz);
        const ey = this.pos.y + 1.5;
        const los = g.physics.lineOfSight(this.pos.x, ey, this.pos.z, t.pos.x, t.pos.y + 1.2, t.pos.z);
        if (this.state === 'arrest') {
          if (d > 1.3) { this.moveToward(t.pos.x, t.pos.z, 4.6, dt); speed = this.speed; }
          else this.heading = dampAngle(this.heading, want, 10, dt);
          if (d < 12 && Math.random() < dt * 0.3) g.ui.bark(this, ['Polis! Kıpırdama!', 'Eller yukarı!', 'Yere yat!'][Math.floor(Math.random() * 3)]);
          break;
        }
        const ideal = melee ? 1.2 : Math.min(def.range * 0.5, 14);
        if (d > ideal || !los) {
          let tx = t.pos.x, tz = t.pos.z;
          if (!los && this.lastSeen) { tx = this.lastSeen.x; tz = this.lastSeen.z; }
          this.moveToward(tx, tz, melee ? 5.0 : 4.2, dt); speed = this.speed;
          // basit engel kaçınma
          const before = this.pos.clone();
          g.physics.resolveCircle(this.pos, this.radius, this.pos.y);
          if (before.distanceTo(this.pos) > 0.001 && speed > 0) {
            this.pos.x += Math.cos(this.heading) * dt * 3; this.pos.z -= Math.sin(this.heading) * dt * 3;
          }
        } else this.heading = dampAngle(this.heading, want, 10, dt);
        if (los) this.lastSeen = t.pos.clone();
        if (!melee && los && d < def.range && Math.abs(angleDiff(this.heading, want)) < 0.3) {
          this.aiming = true;
          if (Math.random() < dt * (def.auto ? 4 : 2.2)) {
            tmp.set(this.pos.x, ey, this.pos.z);
            tmp2.set(t.pos.x - tmp.x, t.pos.y + 1.1 - ey, t.pos.z - tmp.z).normalize();
            // isabet: mesafe ve hedef hızına göre sapma
            const miss = (0.02 + d * 0.0025 + (t.speed || 0) * 0.006) / this.accuracy;
            tmp2.x += (Math.random() - 0.5) * miss * 2; tmp2.y += (Math.random() - 0.5) * miss; tmp2.z += (Math.random() - 0.5) * miss * 2;
            tmp2.normalize();
            this.tryFire(tmp, tmp2);
          }
        } else if (melee && d < def.range) {
          if (this.fireCd <= 0) this.tryFire(this.pos, tmp2.set(0, 0, 1));
        }
        if (d > 120) { this.state = this.home ? 'guard' : 'walk'; this.target = null; }
        break;
      }
    }
    // statik çarpışma
    if (!this.inInterior || true) {
      const r = g.physics.resolveCircle(this.pos, this.radius, this.pos.y);
      this.pos.y = Math.max(r.support, this.pos.y - 9 * dt);
      if (this.pos.y < r.support + 0.01) this.pos.y = r.support;
    }
    if (!this.inInterior && !isLand(this.pos.x, this.pos.z)) {
      // suya düşen NPC boğulur
      this.swimming = true;
      this.pos.y = -1.2;
      this.drownT = (this.drownT || 0) + dt;
      if (this.drownT > 6) this.takeDamage(999, null, 'drown');
    } else this.swimming = false;
    this.speed = speed;
    this.model.animate(dt, this.animState());
    this.sync();
  }

  sync() {
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.heading;
  }
}

export class NPCManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.cityGroup = this.group;
    this.spawnT = 0;
    this.saved = null;
  }

  add(kind, x, z, look, opts) {
    const n = new NPC(this.game, kind, look, opts);
    n.pos.set(x, opts && opts.y || 0, z);
    n.heading = opts && opts.heading !== undefined ? opts.heading : Math.random() * Math.PI * 2;
    if (opts && opts.inInterior) n.inInterior = opts.inInterior;
    this.list.push(n);
    this.group.add(n.model.root);
    n.sync();
    return n;
  }
  remove(n) {
    const i = this.list.indexOf(n);
    if (i >= 0) this.list.splice(i, 1);
    n.model.root.parent && n.model.root.parent.remove(n.model.root);
  }
  clear() { for (const n of this.list.slice()) this.remove(n); }

  // İç mekâna girerken şehir NPC'lerini sakla
  stash(interiorGroup) {
    this.saved = this.list;
    for (const n of this.saved) n.model.root.parent && n.model.root.parent.remove(n.model.root);
    this.list = [];
    this.group = interiorGroup;
  }
  unstash(cityScene) {
    this.clear();
    this.group = this.cityGroup;
    this.list = this.saved || [];
    this.saved = null;
    for (const n of this.list) this.group.add(n.model.root);
    void cityScene;
  }

  sidewalkSpot(px, pz, minD, maxD) {
    const map = this.game.map;
    const s = map.randomEdgeNear(px, pz, minD, maxD);
    if (!s) return null;
    const e = s.e;
    const dx = e.b.x - e.a.x, dz = e.b.z - e.a.z, l = Math.hypot(dx, dz) || 1;
    const side = Math.random() < 0.5 ? 1 : -1;
    const x = s.x + (-dz / l) * (e.width / 2 + 1.5) * side, z = s.z + (dx / l) * (e.width / 2 + 1.5) * side;
    if (!isLand(x, z)) return null;
    return { x, z, e, side, fwd: Math.random() < 0.5 };
  }

  spawnCivilian(px, pz) {
    const s = this.sidewalkSpot(px, pz, 35, 110);
    if (!s) return;
    const d = districtAt(s.x, s.z);
    const gangHere = GANGS[d.gang];
    // çete bölgesi: grup halinde çete üyeleri
    if (gangHere && Math.random() < 0.12 && !this.game.state.territories[d.gang]) {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const look = randomLook(lookRng, 'gang');
        look.topColor = gangHere.color;
        const m = this.add('gang', s.x + Math.random() * 3 - 1.5, s.z + Math.random() * 3 - 1.5, look, { gang: d.gang, state: 'guard', home: new THREE.Vector3(s.x + i * 1.2, 0, s.z) });
        m.faceYaw = Math.random() * 6.28;
      }
      return;
    }
    const kind = Math.random() < 0.06 ? 'police' : 'civilian';
    const n = this.add(kind, s.x, s.z);
    const map = this.game.map;
    n.side = s.side;
    n.prev = s.fwd ? s.e.a : s.e.b; n.cur = s.fwd ? s.e.b : s.e.a;
    n.planWalk();
    void map;
  }

  spawnPoliceFoot() {
    const p = this.game.player;
    const s = this.sidewalkSpot(p.pos.x, p.pos.z, 35, 70);
    if (!s) return;
    const kind = this.game.wanted.level >= 4 && Math.random() < 0.5 ? 'swat' : 'police';
    const look = randomLook(lookRng, 'police');
    if (kind === 'swat') Object.assign(look, { topColor: '#1a1a1a', pantsColor: '#1a1a1a', hat: 'bere', hatColor: '#111111', glasses: true });
    const n = this.add(kind, s.x, s.z, look);
    n.state = 'attack'; n.target = p;
  }

  dispatchPoliceCar(type = 'police') {
    const g = this.game;
    const p = g.player;
    const v = g.vehicles.spawnTraffic(p.pos.x, p.pos.z, type);
    if (!v) return;
    v.ai.mode = 'chase';
    v.ai.cruise = v.def.maxSpeed * 0.8;
    v.sirenOn = true;
    v.police = true;
  }

  calmPolice() {
    for (const n of this.list) if (n.faction === 'police' && !n.dead) { n.state = 'walk'; n.target = null; n.path = []; n.cur = null; }
    for (const v of this.game.vehicles.list) if (v.ai && v.ai.mode === 'chase') { v.ai.mode = 'traffic'; v.ai.cruise = 12; v.sirenOn = false; }
  }

  onNpcDeath(n, attacker, kind) {
    const g = this.game;
    const pk = g.pickups;
    if (n.money > 0) pk.spawn('money', n.pos.x + 0.5, n.pos.z, n.money);
    for (const id of Object.keys(n.weapons)) {
      if (id === 'fists') continue;
      const w = n.weapons[id];
      if (WEAPONS[id].type === 'melee') { if (Math.random() < 0.5) pk.spawn('weapon', n.pos.x - 0.5, n.pos.z, 0, id); }
      else pk.spawn('weapon', n.pos.x - 0.5, n.pos.z + 0.3, Math.max(10, Math.min(60, (w.ammo || 0) + (w.mag || 0))), id);
      break;
    }
    if (attacker && attacker.isPlayer) {
      g.state.stats.kills++;
      if (n.faction === 'police') { g.wanted.crime('kill_police', n.pos); }
      else if (n.faction === 'gang') { g.wanted.crime('kill_gang', n.pos); g.onGangKill(n); }
      else g.wanted.crime(kind === 'car' ? 'hit_ped' : 'kill_civilian', n.pos);
      g.missions.onKill(n);
    } else g.missions.onKill(n);
    // çevredekiler paniğe kapılır
    for (const o of this.list) {
      if (o === n || o.dead) continue;
      if (Math.hypot(o.pos.x - n.pos.x, o.pos.z - n.pos.z) < 25) o.hearThreat(attacker, 10);
    }
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p.inInterior) {
      this.spawnT -= dt;
      const civCount = this.list.filter((n) => !n.dead && !n.mission).length;
      const maxPed = g.settings.quality === 'low' ? 22 : g.settings.quality === 'medium' ? 32 : 42;
      const nightK = g.env.nightFactor > 0.6 ? 0.6 : 1;
      if (this.spawnT <= 0 && civCount < maxPed * nightK) { this.spawnT = 0.25; this.spawnCivilian(p.pos.x, p.pos.z); }
    }
    for (const n of this.list.slice()) {
      const d = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
      if (!n.mission && !n.persistent && ((d > 170 && !p.inInterior) || (n.dead && n.removeT <= 0))) { this.remove(n); continue; }
      if (n.mission && n.dead && n.removeT <= 0) { this.remove(n); continue; }
      if (d > 140 && !n.mission) { continue; }
      n.update(dt);
    }
    this.carHits();
  }

  // araç - yaya çarpışması
  carHits() {
    const g = this.game;
    const actors = [g.player, ...this.list];
    for (const v of g.vehicles.list) {
      const sp = v.speed;
      if (sp < 3 || v.pos.y > 1.5) continue;
      const f = v.fwd;
      for (const a of actors) {
        if (a.dead || a.vehicle || a.inInterior) continue;
        const dx = a.pos.x - v.pos.x, dz = a.pos.z - v.pos.z;
        if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
        const lon = dx * f.x + dz * f.z, lat = dx * -f.z + dz * f.x;
        if (Math.abs(lon) < v.def.len / 2 + 0.3 && Math.abs(lat) < v.def.wid / 2 + 0.3) {
          const dmg = sp * sp * 0.35 + sp * 2;
          a.takeDamage(dmg, v.driver, 'car');
          a.knock = { x: v.vx * 0.6 + (lat > 0 ? -f.z : f.z) * 3, z: v.vz * 0.6 + (lat > 0 ? f.x : -f.x) * 3, t: 0.4 };
          audio.punch(a.pos.x, a.pos.z);
          g.particles.blood({ x: a.pos.x, y: 1, z: a.pos.z }, 6);
          v.vx *= 0.85; v.vz *= 0.85;
          if (a.isPlayer) g.ui.damageFlash();
          if (v.driver && v.driver.isPlayer && !a.dead && a.faction === 'civilian') g.wanted.crime('hit_ped', a.pos);
          if (!a.dead && a.hearThreat) a.hearThreat(v.driver || g.player, 2);
          // itme
          a.pos.x += (lat > 0 ? -f.z : f.z) * 0.6; a.pos.z += (lat > 0 ? f.x : -f.x) * 0.6;
        }
      }
    }
  }
}

export { clamp, rng };
