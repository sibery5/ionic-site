// Aranma seviyesi (yıldız) sistemi, polis sevkiyatı, ekip inişi, destek çağrısı, yol barikatı, özel harekât ve tutuklama.
// 1 yıldız: polis yaklaşır ve kelepçe takmaya çalışır (ateş etmez). 2+: ateş serbest. 4-5: barikat + özel harekât. 5: kışla yakınında asker.
import * as THREE from 'three';
import { copLook, swatLook } from '../entities/npc.js';

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
  }
  reset() {
    this.level = 0; this.heat = 0; this.seenT = 0; this.arrestT = 0; this.reportQueue = []; this.backupAt = null;
    this.clearRoadblocks();
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
      if (this.level >= 4 && before < 4) { this.roadblockT = 3; this.swatT = 2; this.game.ui.notify('Özel harekât sahada! Yollar kesiliyor.', 'warn'); }
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
    // arkada mevzi alan polisler
    const nCops = this.level >= 5 ? 4 : 3;
    for (let i = 0; i < nCops; i++) {
      const k = (i / (nCops - 1) - 0.5) * 2;
      const x = cx + rx * k * half * 0.7 + best.fx * 3.2, z = cz + rz * k * half * 0.7 + best.fz * 3.2;
      const kind = type === 'swat' || (this.level >= 4 && i % 2) ? 'swat' : 'police';
      const n = g.npcs.add(kind, x, z, kind === 'swat' ? swatLook() : copLook(), { persistent: true });
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

    if (this.level <= 0) { g.audio.setSiren(0); this.arrestT = 0; this.cuff(null); return; }
    const p = g.player;
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
      if (cars < WANT_CARS[this.level]) g.npcs.dispatchPoliceCar(this.level >= 4 && Math.random() < 0.4 ? 'swat' : 'police');
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
          if (s) { const team = g.npcs.spawnSquad('swat', s.x, s.z, 3); for (const n of team) n.engage(p, 1.2); }
        }
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
      for (const n of g.npcs.list) if (n.faction === 'police' && !n.dead && Math.abs(n.pos.x - p.pos.x) < 2 && Math.abs(n.pos.z - p.pos.z) < 2 && Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 1.7) { cop = n; break; }
      const canCuff = cop && (this.level <= 1 || p.weapon === 'fists' || p.hp < 25) && p.speed < 4.5;
      if (canCuff) {
        this.arrestT += dt;
        if (this.arrestT > 0.25) { p.handsUp = true; cop.aiming = false; }
        this.cuff(this.arrestT / 2.2);
        if (this.arrestT > 0.3 && Math.random() < dt) g.ui.bark(cop, ['Kelepçeleri tak!', 'Hakkını biliyorsun, sessiz kal.', 'Yürü bakalım karakola!'][Math.floor(Math.random() * 3)]);
        if (this.arrestT > 2.2) { this.arrestT = 0; this.cuff(null); g.onBusted(); }
      } else {
        if (this.arrestT > 0.3 && p.speed >= 4.5 && this.level === 1) { this.add(1, true); g.ui.notify('Kelepçeden sıyrıldın! Polis artık ateş edecek.', 'warn'); }
        if (this.arrestT > 0) { this.arrestT = Math.max(0, this.arrestT - dt * 2); if (this.arrestT <= 0) { p.handsUp = false; this.cuff(null); } }
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
