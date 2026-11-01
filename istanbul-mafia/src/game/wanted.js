// Aranma seviyesi (yıldız) sistemi, polis sevkiyatı, ekip inişi, destek çağrısı, yol barikatı, özel harekât ve tutuklama.
// 1★ yaya polis ("Dur! Polis!"), kelepçe (ateş etmez) · 2★ ekip araçlarından ateş · 3★ daha çok araç + yol barikatı
// 4★ ÖZEL HAREKAT (zırhlı araç, kask/yelek, taarruz tüfeği) · 5★ JANDARMA/asker birlikleri, projektörlü saldırı helikopteri, barikatta tank.
// Megafon anonsları sentezlenmiş sesle (audio.voice) okunur.
import * as THREE from 'three';
import { copLook, swatLook, jandarmaLook } from '../entities/npc.js';
import { WEAPONS } from './weapons.js';
import { CARS } from './economy.js';
import { AIR_TYPES, buildAircraftModel } from '../entities/aircraft.js';
import { audio } from '../core/audio.js';

// [savaş] megafon anonsları (yıldıza göre)
const ANNOUNCE = {
  1: ['Dur! Polis!', 'Olduğun yerde kal!'],
  2: ['Teslim ol! Türk Polisinden kaçamazsın!', 'Silahını bırak!', 'Aracı durdur!'],
  3: ['Teslim ol! Türk Polisinden kaçamazsın!', 'Bütün ekipler, şüpheli silahlı!', 'Yere yat!'],
  4: ['Özel Harekat! Kıpırdama!', 'Silahını bırak! Yere yat!', 'Teslim ol, etrafın sarıldı!'],
  5: ['Jandarma! Teslim ol!', 'Helikopter seni görüyor! Kaçamazsın!', 'Silahını bırak! Yere yat!'],
};
const pickA = (a) => a[Math.floor(Math.random() * a.length)];
const HELI_GUN = { dmg: 26, range: 160, sound: 'lmg', flash: 1.1, shell: false, type: 'gun' };
const _down = new THREE.Vector3(0, -1, 0), _tmpv = new THREE.Vector3();

const WANT_CARS = [0, 1, 2, 3, 4, 5];
const WANT_FOOT = [0, 2, 3, 5, 6, 8];

export class Wanted {
  constructor(game) {
    this.game = game;
    this.level = 0;
    this.heat = 0; // 0..5 ondalık
    this.seenT = 0; // polisin oyuncuyu en son gördüğünden beri geçen süre
    this.dispatchT = 0;
    this.arrestT = 0;
    this.reportQueue = [];
    this.roadblocks = [];
    this.roadblockT = 8;
    this.backupT = 0;
    this.backupAt = null;
    this.swatT = 0;
    this.cuffBar = false;
    // [savaş] yükselen müdahale
    this.prevLevel = 0;
    this.announceT = 4;
    this.armyT = 0;
    this.army = [];
    this.heli = null;
    this.heliT = 0;
    this.lowT = 0;
  }
  reset() {
    this.level = 0; this.heat = 0; this.seenT = 0; this.arrestT = 0; this.reportQueue = []; this.backupAt = null;
    this.clearRoadblocks();
    this.removeHeli(true);
    this.calmArmy();
    this.prevLevel = 0;
    if (this.game.missions && this.game.missions.dialogue) this.game.missions.dialogue.meter(null);
  }

  policeNear(x, z, r = 55) {
    const g = this.game;
    for (const n of g.npcs.list) {
      if (n.dead || n.faction !== 'police') continue;
      if (Math.abs(n.pos.x - x) > r || Math.abs(n.pos.z - z) > r) continue;
      if (Math.hypot(n.pos.x - x, n.pos.z - z) < r && g.physics.lineOfSight(n.pos.x, n.pos.y + 1.6, n.pos.z, x, 1.5, z)) return true;
    }
    for (const v of g.vehicles.list) {
      if ((v.type === 'police' || v.type === 'swat') && v.ai && !v.ai.empty && !v.destroyed && Math.hypot(v.pos.x - x, v.pos.z - z) < r) return true;
    }
    return false;
  }

  add(amount, immediate) {
    if (this.game.state.cheats && this.game.state.cheats.nowanted) return;
    const before = this.level;
    this.heat = Math.min(5.99, this.heat + amount);
    this.level = Math.min(5, Math.floor(this.heat + 0.001));
    if (immediate) this.seenT = 0;
    if (this.level > before) {
      this.game.audio.setSiren(1);
      this.game.ui.flashWanted();
      if (this.level >= 3 && before < 3) { this.roadblockT = Math.min(this.roadblockT, 5); this.game.ui.notify('Yollar kesiliyor: polis barikat kuruyor!', 'warn'); }
      if (this.level >= 4 && before < 4) { this.roadblockT = 3; this.swatT = 2; this.game.ui.notify('ÖZEL HAREKAT sahada!', 'warn'); }
      if (this.level >= 5 && before < 5) { this.armyT = 3; this.heliT = 4; this.game.ui.notify('JANDARMA ve askerî birlikler devrede! Helikopter havada!', 'warn'); }
    }
  }
  set(level) { this.heat = level; this.level = level; this.seenT = 0; if (level > 0) this.game.ui.flashWanted(); }

  // suç türleri
  crime(type, pos) {
    const g = this.game;
    const p = pos || g.player.pos;
    const seen = this.policeNear(p.x, p.z);
    const table = {
      assault: 0.35, kill_civilian: 1, kill_police: 1.5, kill_gang: 0.4, shoot: 1, carjack: 0.6, hit_police_car: 0.6,
      explosion: 1.2, hit_ped: 0.5, robbery: 1, assault_police: 0.6, kill_boss: 1,
    };
    const amt = table[type] || 0.5;
    if (seen || type === 'kill_police' || type === 'assault_police' || type === 'explosion') this.add(Math.max(amt, this.level === 0 ? 1 : amt), true);
    else this.report(amt * 0.7, 4 + Math.random() * 6); // siviller polisi arar
    if (this.game.state && type === 'kill_police') this.game.state.stats.copsKilled++;
  }

  onPlayerNoise(x, z) {
    if (this.policeNear(x, z, 45)) { if (this.level < 1) this.add(1, true); else this.heat = Math.min(5.99, this.heat + 0.12); this.level = Math.min(5, Math.floor(this.heat + 0.001)); this.seenT = 0; }
    else if (Math.random() < 0.1) this.report(0.4, 8);
  }
  // sivil ihbarları birleştir: bekleyen bir ihbar varsa yenisi onunla birleşir (tek olay = tek ihbar)
  report(amt, t) {
    const q = this.reportQueue[0];
    if (q) { q.amt = Math.min(1.5, Math.max(q.amt, amt) + 0.05); return; }
    this.reportQueue.push({ t, amt });
  }
  onAttackVehicle(v) {
    if (v.type === 'police' || v.type === 'swat') this.crime('hit_police_car', v.pos);
  }
  requestBackup(pos) {
    if (this.backupT > 0) return;
    this.backupT = 12;
    this.backupAt = { x: pos.x, z: pos.z };
    this.dispatchT = Math.min(this.dispatchT, 1.5);
  }

  // ---------------- yol barikatı ----------------
  clearRoadblocks() {
    const g = this.game;
    for (const rb of this.roadblocks) {
      for (const v of rb.cars) if (g.vehicles.list.includes(v) && v !== g.player.vehicle) { v.roadblock = false; if (!v.driver) g.vehicles.remove(v); }
      for (const n of rb.cops) if (!n.dead) n.persistent = false;
    }
    this.roadblocks = [];
  }
  placeRoadblock() {
    const g = this.game, p = g.player, map = g.map;
    const src = p.vehicle || p;
    let hx, hz;
    if (p.vehicle && p.vehicle.speed > 3) { hx = p.vehicle.vx / p.vehicle.speed; hz = p.vehicle.vz / p.vehicle.speed; }
    else { hx = Math.sin(p.heading); hz = Math.cos(p.heading); }
    const ax = src.pos.x + hx * 120, az = src.pos.z + hz * 120;
    const node = map.nearestNode(ax, az);
    if (!node) return false;
    if (Math.hypot(node.x - p.pos.x, node.z - p.pos.z) < 55) return false;
    // oyuncunun geleceği kenar: düğümden oyuncuya en çok bakan kenar
    let best = null, bd = -2;
    for (const e of node.edges) {
      const o = map.other(e, node);
      const ex = o.x - node.x, ez = o.z - node.z, el = Math.hypot(ex, ez) || 1;
      const tx = p.pos.x - node.x, tz = p.pos.z - node.z, tl = Math.hypot(tx, tz) || 1;
      const dot = (ex * tx + ez * tz) / (el * tl);
      if (dot > bd) { bd = dot; best = { e, o, fx: ex / el, fz: ez / el, el }; }
    }
    if (!best || best.el < 40) return false;
    const off = Math.min(22, best.el * 0.35);
    const cx = node.x + best.fx * off, cz = node.z + best.fz * off;
    const rx = -best.fz, rz = best.fx;
    const half = best.e.width / 2;
    const rb = { cars: [], cops: [], x: cx, z: cz, t: 70 };
    const type = this.level >= 5 ? 'swat' : 'police';
    // araçlar yol boyunca çapraz
    for (const s of [-1, 1]) {
      const v = g.vehicles.add(s > 0 && this.level >= 5 ? 'swat' : 'police', cx + rx * s * half * 0.42, cz + rz * s * half * 0.42, Math.atan2(rx, rz) + (s > 0 ? 0.35 : -0.35));
      v.ai = { empty: true }; v.parked = true; v.sirenOn = true; v.police = true; v.roadblock = true;
      rb.cars.push(v);
    }
    // [savaş] 5★: barikatın arkasında tank (araç tipi varsa)
    if (this.level >= 5 && CARS.tank && !this.roadblocks.some((r) => r.tank && !r.tank.destroyed)) {
      const tk = g.vehicles.add('tank', cx - best.fx * 7, cz - best.fz * 7, Math.atan2(best.fx, best.fz));
      tk.ai = { empty: true }; tk.parked = true; tk.roadblock = true; tk.police = true; tk.reloadT = 3; tk.lawTank = true;
      rb.cars.push(tk); rb.tank = tk;
    }
    // arkada mevzi alan polisler
    const nCops = this.level >= 5 ? 4 : 3;
    for (let i = 0; i < nCops; i++) {
      const k = (i / (nCops - 1) - 0.5) * 2;
      const x = cx + rx * k * half * 0.7 + best.fx * 3.2, z = cz + rz * k * half * 0.7 + best.fz * 3.2;
      const kind = type === 'swat' || (this.level >= 4 && i % 2) ? 'swat' : 'police';
      const n = this.level >= 5 && i === 0 ? this.spawnJandarma(x, z, { persistent: true }) : g.npcs.add(kind, x, z, kind === 'swat' ? swatLook() : copLook(), { persistent: true });
      n.heading = Math.atan2(-best.fx, -best.fz);
      n.engage(p, 1.5);
      rb.cops.push(n);
    }
    this.roadblocks.push(rb);
    return true;
  }

  update(dt) {
    const g = this.game;
    for (const r of this.reportQueue) r.t -= dt;
    if (this.reportQueue.length) {
      const due = this.reportQueue.filter((r) => r.t <= 0);
      if (due.length) {
        this.reportQueue = this.reportQueue.filter((r) => r.t > 0);
        for (const r of due) { if (this.level === 0) g.ui.notify('Bir vatandaş polisi aradı!', 'warn'); this.add(Math.max(r.amt, this.level === 0 ? 1 : r.amt), true); }
      }
    }
    if (this.backupT > 0) this.backupT -= dt;
    // barikat ömrü
    for (const rb of this.roadblocks.slice()) {
      rb.t -= dt;
      const d = Math.hypot(rb.x - g.player.pos.x, rb.z - g.player.pos.z);
      if (rb.t <= 0 || d > 260 || this.level < 3) {
        for (const v of rb.cars) if (v !== g.player.vehicle && !v.driver && d > 80) g.vehicles.remove(v); else v.roadblock = false;
        for (const n of rb.cops) n.persistent = false;
        this.roadblocks.splice(this.roadblocks.indexOf(rb), 1);
      }
    }

    // [savaş] helikopter / tank / ordu: yıldız düşse de toparlanma
    this.updateHeli(dt);
    if (this.level < 5 && this.army.length) this.calmArmy();
    if (this.level <= 0) { g.audio.setSiren(0); this.arrestT = 0; this.cuff(null); this.prevLevel = 0; return; }
    const p = g.player;
    this.updateEscalation(dt);
    if (!p.inInterior && this.policeNear(p.pos.x, p.pos.z, 70)) this.seenT = 0;
    else this.seenT += dt;
    const escapeTime = 12 + this.level * 7;
    if (this.seenT > escapeTime) {
      this.seenT = 0;
      this.heat = Math.max(0, Math.floor(this.heat) - 1 + 0.0);
      this.level = Math.floor(this.heat);
      if (this.level <= 0) {
        this.heat = 0;
        g.ui.notify('Polisleri atlattın!', 'good');
        g.audio.setSiren(0);
        g.npcs.calmPolice();
        this.clearRoadblocks();
      }
    }
    g.audio.setSiren(this.level > 0 && this.seenT < 10 ? Math.min(1, this.level / 3) : 0.2 * (this.level > 0 ? 1 : 0));

    // polis sevkiyatı (kademeli)
    this.dispatchT -= dt;
    if (this.dispatchT <= 0 && !p.inInterior) {
      this.dispatchT = this.level >= 4 ? 3 : 4.5;
      let cars = 0, foot = 0;
      for (const v of g.vehicles.list) if ((v.type === 'police' || v.type === 'swat') && v.ai && v.ai.mode === 'chase') cars++;
      for (const n of g.npcs.list) if (n.faction === 'police' && !n.dead) foot++;
      if (cars < WANT_CARS[this.level]) g.npcs.dispatchPoliceCar(this.level >= 4 && CARS.swat && Math.random() < 0.6 ? 'swat' : 'police');
      if (foot < WANT_FOOT[this.level]) {
        const n = g.npcs.spawnPoliceFoot(this.backupAt);
        if (n && this.backupAt) this.backupAt = null;
      }
    }
    // gelen ekip araçları yaklaşınca polisler iner
    if (!p.inInterior) {
      for (const v of g.vehicles.list) {
        if (!v.police || !v.crew || v.destroyed || !v.ai || v.ai.mode !== 'chase') continue;
        const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
        // yaya oyuncuya yaklaşan ekip aracı fren yapıp durur (oyuncuyu ezmesin), ekip iner
        if (d < 30 && !p.vehicle) { v.ai = { empty: true }; v.parked = true; v.vx *= 0.5; v.vz *= 0.5; }
        if (d < 30 && (v.speed < 4 || !p.vehicle)) {
          const f = v.fwd;
          for (let i = 0; i < v.crew; i++) {
            const s = i % 2 ? 1 : -1;
            const kind = v.type === 'swat' ? 'swat' : 'police';
            const n = g.npcs.add(kind, v.pos.x + -f.z * s * 1.8 - f.x * (i > 1 ? 1.5 : 0), v.pos.z + f.x * s * 1.8 - f.z * (i > 1 ? 1.5 : 0), kind === 'swat' ? swatLook() : copLook());
            if (this.level >= 2) n.engage(p, 1.3); else { n.state = 'arrest'; n.target = p; }
          }
          v.crew = 0;
          if (v.type === 'swat') g.ui.bark(g.npcs.list[g.npcs.list.length - 1], 'Özel harekât! Silahını bırak!');
        }
      }
      // özel harekât timi indirme (4+)
      if (this.level >= 4) {
        this.swatT -= dt;
        if (this.swatT <= 0) {
          this.swatT = 28;
          const s = g.npcs.sidewalkSpot(p.pos.x, p.pos.z, 30, 55);
          if (s) { const team = g.npcs.spawnSquad('swat', s.x, s.z, 3); for (const n of team) n.engage(p, 1.2); if (team[0]) { team[0].barkT = 0; team[0].say('Özel Harekat! Kıpırdama!'); } }
        }
      }
      if (this.level >= 3) {
        this.roadblockT -= dt;
        if (this.roadblockT <= 0) {
          this.roadblockT = this.placeRoadblock() ? 22 : 4;
          if (this.roadblocks.length > 2) { const old = this.roadblocks.shift(); for (const v of old.cars) if (!v.driver) g.vehicles.remove(v); }
        }
      }
    }
    // tutuklama: 1 yıldızda (veya oyuncu yaya, elleri boş / ağır yaralı) polis kelepçe takar
    if (!p.vehicle && !p.dead) {
      let cop = null;
      for (const n of g.npcs.list) if (n.faction === 'police' && !n.dead && !n.downed && Math.abs(n.pos.x - p.pos.x) < 2 && Math.abs(n.pos.z - p.pos.z) < 2 && Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 1.7) { cop = n; break; }
      const canCuff = cop && (this.level <= 1 || p.weapon === 'fists' || p.hp < 25) && p.speed < 4.5;
      if (canCuff) {
        this.arrestT += dt;
        if (this.arrestT > 0.25) { p.handsUp = true; cop.aiming = false; }
        if (this.arrestT > 0.05 && this.arrestT - dt <= 0.05) { cop.barkT = 0; cop.say(p.weapon !== 'fists' ? 'Silahını bırak! Yere yat!' : 'Yere yat! Ellerini başının üstüne koy!'); }
        this.cuff(this.arrestT / 2.2);
        if (this.arrestT > 0.3 && Math.random() < dt) g.ui.bark(cop, ['Kelepçeleri tak!', 'Hakkını biliyorsun, sessiz kal.', 'Yürü bakalım karakola!'][Math.floor(Math.random() * 3)]);
        if (this.arrestT > 2.2) { this.arrestT = 0; this.cuff(null); g.onBusted(); }
      } else {
        if (this.arrestT > 0.3 && p.speed >= 4.5 && this.level === 1) { this.add(1, true); g.ui.notify('Kelepçeden sıyrıldın! Polis artık ateş edecek.', 'warn'); }
        if (this.arrestT > 0) { this.arrestT = Math.max(0, this.arrestT - dt * 2); if (this.arrestT <= 0) { p.handsUp = false; this.cuff(null); } }
      }
    }
  }
  // ---------------- [savaş: yükselen müdahale] ----------------
  // Jandarma eri: asker modeli + kask, kolluk tarafında (aranma bitince sakinleşir)
  spawnJandarma(x, z, opts = {}) {
    const g = this.game;
    const n = g.npcs.add('soldier', x, z, jandarmaLook(), Object.assign({ jandarma: true, name: 'Jandarma' }, opts));
    n.faction = 'police'; n.lawArmy = true;
    n.engage(g.player, 1.1);
    this.army.push(n);
    return n;
  }
  calmArmy() {
    for (const n of this.army) if (!n.dead) { n.hostile = false; n.state = 'walk'; n.target = null; n.path = []; n.persistent = false; }
    this.army.length = 0;
  }
  // araç / helikopter için sahte atıcı (combat.hitscan'e saldırgan olarak verilir)
  shooter(owner, x, y, z) {
    const s = owner._shooter || (owner._shooter = { pos: new THREE.Vector3(), isPlayer: false, faction: 'police', kind: 'police', vehicle: owner.isVehicle === false ? null : owner, heading: 0, dead: false, crouch: false, speed: 0, model: null, weapons: {}, lawShooter: true });
    s.pos.set(x, y, z);
    return s;
  }
  // tek mermi: isabet olasılığına göre hedefe ya da yanına
  lawShot(sh, ox, oy, oz, def, pHit) {
    const g = this.game, p = g.player;
    const tx = p.vehicle ? p.vehicle.pos : p.pos;
    let ax = tx.x, ay = (p.vehicle ? p.vehicle.pos.y + 1 : p.pos.y + 1.1), az = tx.z;
    const hit = Math.random() < pHit * ((g.settings && { easy: 0.6, normal: 1, hard: 1.35 }[g.settings.difficulty]) || 1);
    if (!hit) { const dx = ax - ox, dz = az - oz, l = Math.hypot(dx, dz) || 1, s = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.4); ax += -dz / l * s; az += dx / l * s; ay += (Math.random() - 0.4) * 1.2; }
    const o = this._o || (this._o = new THREE.Vector3()), d = this._d || (this._d = new THREE.Vector3());
    o.set(ox, oy, oz); d.set(ax - ox, ay - oy, az - oz).normalize();
    audio.gunshot(def.sound, ox, oz);
    g.combat.muzzleFlash(sh, o, d, def);
    g.combat.hitscan(sh, o, d, def, o);
  }

  updateEscalation(dt) {
    const g = this.game, p = g.player, L = this.level;
    // 0 -> 1: en yakın polis "Dur! Polis!"
    if (L >= 1 && this.prevLevel === 0) {
      let best = null, bd = 45;
      for (const n of g.npcs.list) if (n.faction === 'police' && !n.dead && !n.downed) { const d = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z); if (d < bd) { bd = d; best = n; } }
      if (best) { best.barkT = 0; best.say('Dur! Polis!'); }
    }
    this.prevLevel = L;
    if (p.inInterior) return;
    // megafon anonsları: yakındaki ekip aracından
    this.announceT -= dt;
    if (this.announceT <= 0) {
      this.announceT = 9 + Math.random() * 6;
      let src = null, bd = 70;
      for (const v of g.vehicles.list) {
        if (!v.police || v.destroyed || !(v.ai && (v.ai.mode === 'chase' || v.roadblock || v.parked))) continue;
        const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
        if (d < bd) { bd = d; src = v; }
      }
      const text = pickA(ANNOUNCE[Math.min(5, L)]);
      if (this.heli && !this.heli.dying && Math.random() < 0.5) src = this.heli;
      if (src) { g.ui.bark(src, text); audio.megaphone(text, src.pos.x, src.pos.z, { pitch: 108 }); }
    }
    // 2★+: ekip araçlarından ateş (yolcu camdan)
    if (L >= 2) {
      for (const v of g.vehicles.list) {
        if (!v.police || v.destroyed || !v.ai || v.ai.mode !== 'chase' || !v.crew || v.lawTank) continue;
        const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z, d = Math.hypot(dx, dz);
        if (d > 42 || d < 4) continue;
        v.shootT = (v.shootT === undefined ? 1 + Math.random() * 2 : v.shootT) - dt;
        if (v.shootT > 0) continue;
        const swat = v.type === 'swat';
        const def = swat ? WEAPONS.m4 : WEAPONS.pistol;
        if (v.burst === undefined || v.burst <= 0) v.burst = swat ? 4 + Math.floor(Math.random() * 4) : 2 + Math.floor(Math.random() * 2);
        v.burst--;
        v.shootT = v.burst > 0 ? 1 / def.rate : 1.6 + Math.random() * 1.8;
        const f = v.fwd || { x: Math.sin(v.heading), z: Math.cos(v.heading) };
        const side = (dx * -f.z + dz * f.x) >= 0 ? 1 : -1;
        const ox = v.pos.x + -f.z * side * 1.05, oy = v.pos.y + 1.35, oz = v.pos.z + f.x * side * 1.05;
        if (!g.physics.lineOfSight(ox, oy, oz, p.pos.x, p.pos.y + 1.2, p.pos.z)) continue;
        const sh = this.shooter(v, ox, oy, oz);
        const pHit = (swat ? 0.32 : 0.22) / (1 + (d / 18) * (d / 18)) / (1 + (v.speed || 0) * 0.05) * (p.vehicle ? 0.7 : 1);
        this.lawShot(sh, ox, oy, oz, def.shell ? Object.assign({}, def, { shell: false }) : def, pHit);
      }
    }
    // 5★: jandarma birlikleri her yerde
    if (L >= 5) {
      this.armyT -= dt;
      if (this.armyT <= 0) {
        this.armyT = 24;
        for (let i = this.army.length - 1; i >= 0; i--) if (this.army[i].dead || !g.npcs.list.includes(this.army[i])) this.army.splice(i, 1);
        if (this.army.length < 8) {
          const s = g.npcs.sidewalkSpot(p.pos.x, p.pos.z, 30, 60);
          if (s) {
            for (let i = 0; i < 4; i++) this.spawnJandarma(s.x + Math.sin(i * 1.6) * 1.6, s.z + Math.cos(i * 1.6) * 1.6);
            if (CARS.cip) { const v = g.vehicles.add('cip', s.x + 3, s.z + 3, Math.random() * 6.28); v.ai = { empty: true }; v.parked = true; }
            const lead = this.army[this.army.length - 1];
            if (lead) { lead.barkT = 0; lead.say('Jandarma! Teslim ol!'); }
          }
        }
      }
      this.heliT -= dt;
      if (!this.heli && this.heliT <= 0) this.spawnHeli();
    }
    // barikat tankları
    for (const rb of this.roadblocks) if (rb.tank) this.updateTank(rb.tank, dt);
  }

  updateTank(v, dt) {
    const g = this.game, p = g.player, ud = v.mesh && v.mesh.userData;
    if (!ud || !ud.turret || v.destroyed || v === p.vehicle) return;
    const tx = (p.vehicle || p).pos;
    const dx = tx.x - v.pos.x, dz = tx.z - v.pos.z, d = Math.hypot(dx, dz);
    if (d > 150) return;
    let want = Math.atan2(dx, dz) - v.heading; want = Math.atan2(Math.sin(want), Math.cos(want));
    let cur = ud.turret.rotation.y, diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
    ud.turret.rotation.y = cur + Math.max(-0.8 * dt, Math.min(0.8 * dt, diff));
    v.reloadT = (v.reloadT || 0) - dt;
    if (Math.abs(diff) < 0.08 && v.reloadT <= 0 && d > 12) {
      const yaw = v.heading + ud.turret.rotation.y;
      const ox = v.pos.x + Math.sin(yaw) * 6.2, oy = v.pos.y + 1.85, oz = v.pos.z + Math.cos(yaw) * 6.2;
      if (!g.physics.lineOfSight(ox, oy, oz, tx.x, 1.2, tx.z)) { v.reloadT = 1; return; }
      v.reloadT = 7 + Math.random() * 3; v.recoil = 1;
      const sh = this.shooter(v, ox, oy, oz);
      const miss = (1 - Math.min(1, 30 / d)) * 6 + 2;
      const o = new THREE.Vector3(ox, oy, oz), dir = new THREE.Vector3(tx.x + (Math.random() - 0.5) * miss - ox, 1.0 - oy, tx.z + (Math.random() - 0.5) * miss - oz).normalize();
      g.particles.explosion({ x: ox, y: oy - 0.3, z: oz }, 0.3);
      audio.gunshot('rpg', ox, oz); audio.explosion(ox, oz, 0.5);
      g.combat.rocket(sh, o, dir, { dmg: 200, radius: 7 });
      g.ui.bark(v, 'Tank ateş ediyor!');
    }
  }

  // ---- projektörlü polis/askerî helikopter ----
  spawnHeli() {
    const g = this.game, p = g.player;
    const type = AIR_TYPES.attackHeli ? 'attackHeli' : 'helikopter';
    const mesh = buildAircraftModel(type, AIR_TYPES.attackHeli ? undefined : '#1d3d6e');
    const ang = Math.random() * Math.PI * 2;
    const H = {
      mesh, type, armed: !!AIR_TYPES.attackHeli, pos: new THREE.Vector3(p.pos.x + Math.sin(ang) * 160, 60, p.pos.z + Math.cos(ang) * 160),
      vel: new THREE.Vector3(), orbit: ang, hp: 1600, dying: false, fallT: 0, shootT: 3, burst: 0, rocketT: 9, chopT: 0, leaveT: 0, aim: new THREE.Vector3().copy(p.pos), heading: 0,
    };
    // projektör: saydam koni + zemin halkası (ek ışık yok: gölgelendirici sayısı sabit)
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 4.2, 1, 20, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.frustumCulled = false; cone.renderOrder = 11;
    const spot = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    spot.renderOrder = 11;
    H.cone = cone; H.spot = spot;
    g.scene.add(mesh); g.scene.add(cone); g.scene.add(spot);
    H.target = { pos: H.pos, r: 3.4, dead: false, owner: null, onHit: (dmg, attacker) => this.heliDamage(dmg, attacker) };
    g.combat.targets.push(H.target);
    this.heli = H;
    g.ui.notify(H.armed ? 'Saldırı helikopteri geliyor!' : 'Polis helikopteri havada! Projektörle seni arıyor.', 'warn');
    return H;
  }
  heliDamage(dmg, attacker) {
    const H = this.heli;
    if (!H || H.dying) return;
    H.hp -= dmg;
    if (attacker && attacker.isPlayer) this.game.combat.playerHit();
    if (H.hp <= 0) {
      H.dying = true; H.target.dead = true;
      this.game.particles.explosion({ x: H.pos.x, y: H.pos.y, z: H.pos.z }, 0.8);
      audio.explosion(H.pos.x, H.pos.z, 1.2);
      this.game.ui.notify('Helikopter düşürüldü!', 'good');
      if (attacker && attacker.isPlayer) this.add(0.6, true);
    }
  }
  removeHeli(now) {
    const H = this.heli, g = this.game;
    if (!H) return;
    if (!now && !H.dying) { H.leaving = true; return; }
    for (const m of [H.mesh, H.cone, H.spot]) { m.parent && m.parent.remove(m); }
    H.cone.geometry.dispose(); H.spot.geometry.dispose();
    const i = g.combat.targets.indexOf(H.target); if (i >= 0) g.combat.targets.splice(i, 1);
    this.heli = null; this.heliT = 30;
  }
  updateHeli(dt) {
    const H = this.heli, g = this.game, p = g.player;
    if (!H) return;
    const ud = H.mesh.userData;
    if (ud.rotor) ud.rotor.rotation.y += dt * 28;
    if (ud.tail) ud.tail.rotation.x += dt * 40;
    if (H.dying) {
      H.fallT += dt;
      H.vel.y -= 9 * dt; H.pos.addScaledVector(H.vel, dt);
      H.mesh.rotation.y += dt * 4;
      if (Math.random() < 0.6) g.particles.smoke({ x: H.pos.x, y: H.pos.y, z: H.pos.z }, 1.5);
      const gy = Math.max(0, g.physics.groundAt(H.pos.x, H.pos.z));
      if (H.pos.y < gy + 1 || H.fallT > 6) { g.combat.explosion(H.pos.x, gy + 0.5, H.pos.z, 9, 160, null, null); this.removeHeli(true); return; }
      H.mesh.position.copy(H.pos); H.cone.visible = H.spot.visible = false;
      return;
    }
    if (this.level < 5) { this.lowT += dt; if (this.lowT > 8) H.leaving = true; } else { this.lowT = 0; H.leaving = false; }
    const tgt = p.vehicle ? p.vehicle.pos : p.pos;
    let wx, wy, wz;
    if (H.leaving) {
      const dx = H.pos.x - tgt.x, dz = H.pos.z - tgt.z, l = Math.hypot(dx, dz) || 1;
      wx = H.pos.x + dx / l * 60; wz = H.pos.z + dz / l * 60; wy = 90;
      if (l > 380) { this.removeHeli(true); return; }
    } else {
      H.orbit += dt * 0.22;
      const R = 34;
      wx = tgt.x + Math.sin(H.orbit) * R; wz = tgt.z + Math.cos(H.orbit) * R; wy = Math.max(30, (tgt.y || 0) + 30);
    }
    // yumuşak takip (hız sınırlı)
    const dx = wx - H.pos.x, dy = wy - H.pos.y, dz = wz - H.pos.z, dl = Math.hypot(dx, dy, dz) || 1;
    const sp = Math.min(32, dl * 0.9);
    H.vel.x += (dx / dl * sp - H.vel.x) * Math.min(1, dt * 1.2);
    H.vel.y += (dy / dl * sp - H.vel.y) * Math.min(1, dt * 1.2);
    H.vel.z += (dz / dl * sp - H.vel.z) * Math.min(1, dt * 1.2);
    H.pos.addScaledVector(H.vel, dt);
    const hs = Math.hypot(H.vel.x, H.vel.z);
    // burun hedefe dönük (çember üzerinde içe bakar), hıza göre öne eğilir ve yatar
    const face = Math.atan2(tgt.x - H.pos.x, tgt.z - H.pos.z);
    H.heading += Math.atan2(Math.sin(face - H.heading), Math.cos(face - H.heading)) * Math.min(1, dt * 1.5);
    H.mesh.position.copy(H.pos);
    H.mesh.rotation.set(Math.min(0.25, hs * 0.008), H.heading, -Math.sin(H.orbit) * 0.0 - 0.12 * Math.min(1, hs / 25));
    // projektör: hedefe gecikmeli yönelir
    H.aim.lerp(tgt, Math.min(1, dt * 1.6));
    const night = g.env ? g.env.nightFactor : 0;
    const bx = H.pos.x, by = H.pos.y - 0.4, bz = H.pos.z;
    const ax = H.aim.x - bx, ay = (H.aim.y || 0) + 0.05 - by, az = H.aim.z - bz, al = Math.hypot(ax, ay, az) || 1;
    H.cone.position.set(bx, by, bz);
    H.cone.quaternion.setFromUnitVectors(_down, _tmpv.set(ax / al, ay / al, az / al));
    H.cone.scale.set(1, al, 1);
    H.cone.material.opacity = 0.04 + 0.12 * night;
    H.cone.visible = !p.inInterior;
    H.spot.position.set(H.aim.x, Math.max(0, g.physics.groundAt(H.aim.x, H.aim.z)) + 0.06, H.aim.z);
    H.spot.material.opacity = 0.08 + 0.4 * night;
    H.spot.visible = !p.inInterior;
    // pervane sesi
    H.chopT -= dt;
    if (H.chopT <= 0) { H.chopT = 0.3; audio.heliChop(H.pos.x, H.pos.z, 1); }
    if (H.leaving || p.inInterior || p.dead) return;
    // kapı nişancısı: seri atış
    const d = Math.hypot(tgt.x - H.pos.x, tgt.z - H.pos.z, (tgt.y || 0) - H.pos.y);
    H.shootT -= dt;
    if (H.shootT <= 0 && d < 90) {
      if (H.burst <= 0) H.burst = 6 + Math.floor(Math.random() * 6);
      H.burst--;
      H.shootT = H.burst > 0 ? 0.11 : 2.2 + Math.random() * 1.5;
      const ox = H.pos.x, oy = H.pos.y - 1.2, oz = H.pos.z;
      if (g.physics.lineOfSight(ox, oy, oz, tgt.x, (tgt.y || 0) + 1.2, tgt.z)) {
        const sh = this.shooter(H, ox, oy, oz); sh.vehicle = null; sh.owner = H;
        H.target.owner = sh;
        this.lawShot(sh, ox, oy, oz, HELI_GUN, 0.16 / (1 + (d / 45) * (d / 45)) * (p.vehicle ? 0.8 : 1));
      }
    }
    // saldırı helikopteri: roket
    if (H.armed) {
      H.rocketT -= dt;
      if (H.rocketT <= 0 && d < 120) {
        H.rocketT = 8 + Math.random() * 4;
        const sh = this.shooter(H, H.pos.x, H.pos.y - 1.5, H.pos.z); sh.vehicle = null;
        const o = new THREE.Vector3(H.pos.x, H.pos.y - 1.5, H.pos.z);
        const dir = new THREE.Vector3(tgt.x + (Math.random() - 0.5) * 6 - o.x, (tgt.y || 0) - o.y, tgt.z + (Math.random() - 0.5) * 6 - o.z).normalize();
        audio.gunshot('rpg', o.x, o.z);
        g.combat.rocket(sh, o, dir, { dmg: 180, radius: 7 });
      }
    }
  }

  cuff(frac) {
    const dlg = this.game.missions && this.game.missions.dialogue;
    if (!dlg) return;
    if (frac === null) { if (this.cuffBar) { dlg.meter(null); this.cuffBar = false; } return; }
    this.cuffBar = true;
    dlg.meter('KELEPÇELENİYORSUN — KOŞARAK KAÇ!', frac, '#5a8aff');
  }
}

export { THREE };
