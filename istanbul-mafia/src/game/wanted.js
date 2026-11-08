// Aranma seviyesi (yıldız), kolluk sevkiyatı, görüş/arama, takip, barikat, özel harekât, jandarma ve tutuklama.
// [kanun] İlke: kolluk "belirmez".
//  - Suç anında görüşteki / yakındaki DEVRİYE (yaya polis, devriye aracı) tepki verir.
//  - Takviye her zaman görüş dışındaki bir yoldan ARAÇLA gelir (ekip aracı, zırhlı özel harekât aracı, jandarma
//    kamyonu/cipi, helikopter); yaklaşınca yavaşlayıp durur, ekip iner, aracın arkasında mevzi alır, sonra yakalama/çatışma.
//  - Oyuncu araçla kaçarsa ekip araçları kovalar: sıkıştırır (önünü/arkasını keser), PIT manevrasıyla arka çamurluğa vurur.
//  - Atlatma: görüş hattı + son görülen konum (LKP) + zamanla büyüyen arama alanı. Kimse görmüyorsa yıldız söner;
//    1 yıldızda kaçmak kolaydır. Görüş testleri kademeli (her karede NPC başına ışın yok), sahadaki birim sayısı sınırlı.
// 1★ yaya polis ("Dur! Polis!"), kelepçe (ateş etmez) · 2★ ekip araçlarından ateş · 3★ daha çok araç + yol barikatı
// 4★ ÖZEL HAREKAT (zırhlı araç, kask/yelek, taarruz tüfeği) · 5★ JANDARMA kamyonla, projektörlü helikopter, barikatta tank.
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

// [kanun] yıldıza göre sınırlar
export const LAW_CAP = [0, 4, 7, 10, 13, 16]; // sahadaki kolluk personeli (araç içindekiler dahil)
export const CAR_CAP = [0, 1, 2, 3, 4, 4]; // takipteki ekip aracı
const ESCAPE = [0, 9, 16, 26, 36, 48]; // görüşten çıkınca bir yıldızın sönme süresi (sn)
const BACKUP_DT = [0, 14, 8, 6, 5, 5]; // takviye sevki aralığı
const PATROL_R = 110; // suç yerine koşan devriye polis yarıçapı
const PATROL_CAR_R = 260; // olaya yönlendirilen devriye aracı yarıçapı
const UNIT_DEF = {
  police: { car: 'police', alt: 'polsuv', kind: 'police', crew: 2 },
  swat: { car: 'swat', kind: 'swat', crew: 4 },
  jandarma: { car: 'askkamyon', alt: 'cip', kind: 'jandarma', crew: 4 },
  army: { car: 'askkamyon', alt: 'cip', kind: 'army', crew: 4 },
};

export class Wanted {
  constructor(game) {
    this.game = game;
    this.level = 0;
    this.heat = 0; // 0..5 ondalık
    this.seenT = 0; // kolluğun oyuncuyu en son gördüğünden beri geçen süre
    this.lostT = 0; // görüşten çıkalı (yıldız sönme sayacı)
    this.lkp = new THREE.Vector3(); // son görülen konum
    this.lkpId = 0; // LKP her güncellendiğinde artar (devriyeler önce oraya gider)
    this.searchR = 20;
    this.sightT = 0; this.sightI = 0; this.seen = false;
    this.dispatchT = 0;
    this.arrestT = 0;
    this.carArrestT = 0;
    this.reportQueue = [];
    this.roadblocks = [];
    this.roadblockT = 8;
    this.backupT = 0;
    this.backupAt = null;
    this.swatT = 0;
    this.cuffBar = false;
    this.units = []; // araçla gelen birimler
    this.respondT = 0;
    this.incidents = []; // [kanun] oyuncu dışı olaylar (çete ateşi)
    this.lawLog = { arrests: 0, recorded: 0, gangEngaged: 0, responders: 0, dispatched: { police: 0, swat: 0, jandarma: 0, army: 0 }, deployed: 0, pit: 0, fines: 0 };
    // [savaş] yükselen müdahale
    this.prevLevel = 0;
    this.announceT = 4;
    this.armyT = 0;
    this.army = [];
    this.heli = null;
    this.heliT = 0;
    this.lowT = 0;
    this._wc = { t: -1, x: 1e9, z: 1e9, r: 0, v: false };
  }
  reset() {
    this.level = 0; this.heat = 0; this.seenT = 0; this.lostT = 0; this.arrestT = 0; this.carArrestT = 0; this.reportQueue = []; this.backupAt = null;
    this.clearRoadblocks();
    this.removeHeli(true);
    this.calmArmy();
    this.standDown();
    this.prevLevel = 0;
    if (this.game.missions && this.game.missions.dialogue) this.game.missions.dialogue.meter(null);
  }

  // ---------------- tanıklar ----------------
  // (x,z) noktasını görebilen kolluk var mı? Olay başına çağrılır; sonuç kısa süre önbelleklenir, en çok 4 ışın.
  policeNear(x, z, r = 55) {
    const g = this.game, now = this.clockT || 0, C = this._wc;
    if (now - C.t < 0.25 && Math.abs(C.x - x) < 4 && Math.abs(C.z - z) < 4 && C.r >= r) return C.v;
    let rays = 0, v = false;
    const cand = this._cand || (this._cand = []);
    cand.length = 0;
    for (const n of g.npcs.list) {
      if (n.dead || n.downed || n.faction !== 'police' || n.cargoOf) continue;
      const dx = n.pos.x - x, dz = n.pos.z - z;
      if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
      const d = Math.hypot(dx, dz);
      if (d < r) cand.push([d, n]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [d, n] of cand) {
      if (d < 4) { v = true; break; }
      if (rays++ >= 3) break;
      const py = n.passengerOf ? n.pos.y + 1.1 : n.pos.y + 1.6;
      if (g.physics.lineOfSight(n.pos.x, py, n.pos.z, x, 1.5, z)) { v = true; break; }
    }
    if (!v) {
      for (const veh of g.vehicles.list) {
        if (!this.isLawCar(veh) || veh.destroyed) continue;
        const d = Math.hypot(veh.pos.x - x, veh.pos.z - z);
        if (d > r) continue;
        if (rays++ >= 4) break;
        if (g.physics.lineOfSight(veh.pos.x, veh.pos.y + 1.4, veh.pos.z, x, 1.5, z)) { v = true; break; }
      }
    }
    C.t = now; C.x = x; C.z = z; C.r = r; C.v = v;
    return v;
  }
  // devriye / takip aracı (içinde polis var sayılır)
  isLawCar(v) { return !!(v && (v.lawUnit || ((v.type === 'police' || v.type === 'polsuv' || v.type === 'swat') && v.ai && !v.ai.empty && !v.military))); }

  add(amount, immediate) {
    if (this.game.state.cheats && this.game.state.cheats.nowanted) return;
    const before = this.level;
    this.heat = Math.min(5.99, this.heat + amount);
    this.level = Math.min(5, Math.floor(this.heat + 0.001));
    if (immediate) this.spotted();
    if (this.level > before) {
      this.game.audio.setSiren(1);
      this.game.ui.flashWanted();
      this.lostT = 0;
      if (this.level >= 3 && before < 3) { this.roadblockT = Math.min(this.roadblockT, 6); this.game.ui.notify('Yollar kesiliyor: polis barikat kuruyor!', 'warn'); }
      if (this.level >= 4 && before < 4) { this.roadblockT = Math.min(this.roadblockT, 4); this.swatT = 2; this.game.ui.notify('ÖZEL HAREKAT yolda!', 'warn'); }
      if (this.level >= 5 && before < 5) { this.armyT = 3; this.heliT = 4; this.game.ui.notify('JANDARMA ve askerî birlikler yolda! Helikopter havalandı!', 'warn'); }
      if (before === 0) { this.respondT = 0; this.dispatchT = BACKUP_DT[this.level]; } // [kanun] önce devriye, takviye sonra
    }
  }
  set(level) { const was = this.level; this.heat = level; this.level = level; this.spotted(); this.lostT = 0; this.respondT = 0; if (!was && level > 0) this.dispatchT = Math.min(this.dispatchT, 3); if (level > 0) this.game.ui.flashWanted(); }
  // oyuncu şu an görüldü: LKP güncelle
  spotted(pos) {
    const p = pos || (this.game.player.vehicle || this.game.player).pos;
    this.seenT = 0; this.lostT = 0;
    if (Math.hypot(p.x - this.lkp.x, p.z - this.lkp.z) > 3) this.lkpId++;
    this.lkp.set(p.x, 0, p.z);
    this.searchR = 20;
  }

  // suç türleri
  crime(type, pos) {
    const g = this.game;
    const p = pos || g.player.pos;
    const seen = this.policeNear(p.x, p.z);
    const table = {
      assault: 0.35, kill_civilian: 1, kill_police: 1.5, kill_gang: 0.4, shoot: 1, carjack: 0.6, hit_police_car: 0.6,
      explosion: 1.2, hit_ped: 0.5, robbery: 1, assault_police: 0.6, kill_boss: 1, trespass: 0.5,
    };
    const amt = table[type] || 0.5;
    if (seen || type === 'kill_police' || type === 'assault_police' || type === 'explosion') this.add(Math.max(amt, this.level === 0 ? 1 : amt), true);
    else this.report(amt * 0.7, 4 + Math.random() * 6, p); // siviller polisi arar
    if (this.game.state && type === 'kill_police') this.game.state.stats.copsKilled++;
  }

  onPlayerNoise(x, z, r) {
    const g = this.game;
    if (g.ambulance) g.ambulance.noteGunfire(x, z);
    if (this.policeNear(x, z, 45)) { if (this.level < 1) this.add(1, true); else this.heat = Math.min(5.99, this.heat + 0.12); this.level = Math.min(5, Math.floor(this.heat + 0.001)); this.spotted(); }
    else if (Math.random() < 0.1) this.report(0.4, 8, { x, z });
    void r;
  }
  // sivil ihbarları birleştir: bekleyen bir ihbar varsa yenisi onunla birleşir (tek olay = tek ihbar)
  report(amt, t, pos) {
    const q = this.reportQueue[0];
    if (q) { q.amt = Math.min(1.5, Math.max(q.amt, amt) + 0.05); return; }
    const at = pos || this.game.player.pos;
    this.reportQueue.push({ t, amt, x: at.x, z: at.z });
  }
  onAttackVehicle(v) {
    if (v.type === 'police' || v.type === 'swat' || v.lawUnit) this.crime('hit_police_car', v.pos);
  }
  requestBackup(pos) {
    if (this.backupT > 0) return;
    this.backupT = 12;
    this.backupAt = { x: pos.x, z: pos.z };
    this.dispatchT = Math.min(this.dispatchT, 1.5);
  }

  // ---------------- [kanun] çete / NPC ateşi: devriye müdahalesi ----------------
  onNpcGunfire(n) {
    const g = this.game;
    if (g.ambulance) g.ambulance.noteGunfire(n.pos.x, n.pos.z);
    if (n.faction !== 'gang' || n.inInterior || n.isPlayer) return;
    const first = !(n.lawT > 0);
    n.lawT = 40;
    if (!first && (n.lawCallT || 0) > (this.clockT || 0)) return;
    n.lawCallT = (this.clockT || 0) + 1.5;
    // görüşteki devriye polisler doğrudan müdahale eder
    let engaged = 0;
    for (const c of g.npcs.list) {
      if (c.dead || c.downed || c.faction !== 'police' || c.passengerOf || c.cargoOf || c.inInterior) continue;
      if (c.state === 'attack' && c.target && !c.target.dead) continue;
      const d = Math.hypot(c.pos.x - n.pos.x, c.pos.z - n.pos.z);
      if (d > 70 || engaged >= 3) continue;
      if (d > 8 && !g.physics.lineOfSight(c.pos.x, c.pos.y + 1.6, c.pos.z, n.pos.x, n.pos.y + 1.3, n.pos.z)) continue;
      c.engage(n, 0.7); engaged++;
      if (engaged === 1) { c.barkT = 0; c.say(['Polis! Silahı bırak!', 'Ateş kesin! Polis!', 'Merkez, çatışma var, müdahale ediyorum!']); }
    }
    if (engaged) this.lawLog.gangEngaged += engaged;
    // olay kaydı: yakında devriye yoksa telsizle araç yönlendirilir
    let inc = this.incidents.find((i) => Math.hypot(i.x - n.pos.x, i.z - n.pos.z) < 50);
    if (!inc) { inc = { x: n.pos.x, z: n.pos.z, t: 0, culprit: n, unit: null, callT: engaged ? 12 : 5 + Math.random() * 3 }; this.incidents.push(inc); }
    inc.culprit = n; inc.t = 0; inc.x = n.pos.x; inc.z = n.pos.z;
  }
  updateIncidents(dt) {
    const g = this.game;
    for (let i = this.incidents.length - 1; i >= 0; i--) {
      const inc = this.incidents[i];
      inc.t += dt;
      if (inc.callT > 0) {
        inc.callT -= dt;
        if (inc.callT <= 0 && !inc.unit && !g.player.inInterior) {
          // önce devriye aracı, yoksa karakoldan ekip
          inc.unit = this.redirectPatrolCar(inc.x, inc.z, inc) || this.dispatchUnit('police', { at: inc, incident: inc });
        }
      }
      if (inc.t > 45) { if (inc.unit) inc.unit.incident = null; this.incidents.splice(i, 1); }
    }
  }

  // ---------------- [kanun] birimler: araçla gelen ekipler ----------------
  lawCount() {
    let c = 0;
    for (const n of this.game.npcs.list) if (!n.dead && (n.faction === 'police') && (n.lawUnit || n.state === 'attack' || n.state === 'arrest')) c++;
    return c;
  }
  chaseCars() { let c = 0; for (const u of this.units) if (u.phase === 'enroute' || u.phase === 'halt') c++; return c; }

  // görüş dışındaki uzak bir yol noktası (karakol / çıkış yönünü sever)
  entryPoint(tx, tz, from, minD = 110, maxD = 190) {
    const g = this.game, map = g.map, p = g.player;
    let best = null, bs = -1e9, rays = 0;
    for (let i = 0; i < 10; i++) {
      const s = map.randomEdgeNear(tx, tz, minD, maxD);
      if (!s) continue;
      if (g.military && g.military.inZone(s.x, s.z, 10)) continue;
      let sc = Math.random() * 15;
      if (from) sc -= Math.hypot(s.x - from.x, s.z - from.z) * 0.35;
      let crowded = false;
      for (const v of g.vehicles.list) if (Math.abs(v.pos.x - s.x) < 10 && Math.abs(v.pos.z - s.z) < 10) { crowded = true; break; }
      if (crowded) continue;
      const dp = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
      if (dp < minD * 0.8) continue;
      if (rays < 4) { rays++; if (g.physics.lineOfSight(p.pos.x, p.pos.y + 1.6, p.pos.z, s.x, 1.4, s.z)) sc -= 80; }
      if (sc > bs) { bs = sc; best = s; }
    }
    if (!best) return null;
    const e = best.e;
    // hedefe yaklaşan yön
    const da = Math.hypot(e.a.x - tx, e.a.z - tz), db = Math.hypot(e.b.x - tx, e.b.z - tz);
    const fromN = da > db ? e.a : e.b, toN = da > db ? e.b : e.a;
    return { x: best.x, z: best.z, e, from: fromN, to: toN };
  }
  nearestStation(x, z) { const m = this.game.map; return m.nearestOfType ? m.nearestOfType('police', x, z) : null; }

  // ekip oluştur: koltuk varsa yolcu olarak (camdan görünür), yoksa kasada
  makeCrew(u, v, kind, n) {
    const g = this.game, out = [];
    for (let i = 0; i < n; i++) {
      let a;
      if (kind === 'jandarma' || kind === 'army') {
        a = g.npcs.add('soldier', v.pos.x, v.pos.z, jandarmaLook(), { jandarma: kind === 'jandarma', name: kind === 'jandarma' ? 'Jandarma' : 'Er', persistent: true, state: 'idle' });
        if (kind === 'jandarma') { a.faction = 'police'; a.lawArmy = true; this.army.push(a); } else { a.hostile = true; }
      } else a = g.npcs.add(kind, v.pos.x, v.pos.z, kind === 'swat' ? swatLook() : copLook(), { persistent: true, state: 'idle' });
      a.lawUnit = u;
      if (v.addPassenger && v.addPassenger(a) >= 0) { /* koltukta */ } else { a.cargoOf = v; a.pos.set(v.pos.x, -30, v.pos.z); a.model.root.visible = false; }
      out.push(a);
    }
    return out;
  }
  // takip aracı oluştur ve olay yerine / oyuncuya yönlendir
  dispatchUnit(type, opts = {}) {
    const g = this.game, p = g.player;
    const D = UNIT_DEF[type] || UNIT_DEF.police;
    const carType = CARS[D.car] ? D.car : CARS[D.alt] ? D.alt : 'police';
    const tgt = opts.at || (this.seenT < 2 ? p.pos : this.lkp);
    const st = opts.from || (type === 'police' || type === 'swat' ? (this.nearestStation(tgt.x, tgt.z) || {}).door : null);
    const s = this.entryPoint(tgt.x, tgt.z, st || null, opts.minD || 110, opts.maxD || 190);
    if (!s) return null;
    const dx = s.to.x - s.from.x, dz = s.to.z - s.from.z, l = Math.hypot(dx, dz) || 1;
    const fx = dx / l, fz = dz / l;
    const lane = s.e.width >= 16 ? 2.1 : 2.5;
    const v = g.vehicles.add(carType, s.x - fz * lane, s.z + fx * lane, Math.atan2(fx, fz), type === 'army' || type === 'jandarma' ? '#4a5a30' : undefined);
    v.ai = { mode: 'chase', from: s.from, to: s.to, next: g.vehicles.chooseNext(s.to, s.from, tgt), cruise: v.def.maxSpeed * 0.8, outer: false, laneCur: lane };
    v.vx = fx * 12; v.vz = fz * 12;
    v.sirenOn = true; v.police = true;
    const u = { type, v, crew: [], phase: 'enroute', t: 0, incident: opts.incident || null, role: 'follow', deployT: 0 };
    v.lawUnit = u;
    u.crew = this.makeCrew(u, v, D.kind, opts.crew || D.crew);
    v.crew = u.crew.length; // eski API: araçtaki ekip sayısı (araçtan ateş için)
    this.units.push(u);
    this.assignRoles();
    this.lawLog.dispatched[type] = (this.lawLog.dispatched[type] || 0) + 1;
    return u;
  }
  // trafikteki devriye aracını olaya yönlendir (gerçek devriye: önce o gelir)
  redirectPatrolCar(x, z, incident) {
    const g = this.game;
    let best = null, bd = PATROL_CAR_R;
    for (const v of g.vehicles.list) {
      if (v.lawUnit || v.destroyed || v.driver || !v.ai || v.ai.mode !== 'traffic' || v.mission) continue;
      if (v.type !== 'police' && v.type !== 'polsuv') continue;
      const d = Math.hypot(v.pos.x - x, v.pos.z - z);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return null;
    const v = best;
    v.ai.mode = 'chase'; v.ai.cruise = v.def.maxSpeed * 0.8; v.ai.route = null; v.ai.next = g.vehicles.chooseNext(v.ai.to, v.ai.from, { x, z });
    v.sirenOn = true; v.police = true;
    const u = { type: 'police', v, crew: [], phase: 'enroute', t: 0, incident: incident || null, role: 'follow', deployT: 0, patrol: true };
    v.lawUnit = u;
    u.crew = this.makeCrew(u, v, 'police', 2);
    v.crew = u.crew.length;
    this.units.push(u);
    this.assignRoles();
    this.lawLog.responders++;
    return u;
  }
  // takip rolleri: ilk araç arkadan takip (PIT), ikincisi önünü keser, sonrakiler takip
  assignRoles() {
    let k = 0;
    for (const u of this.units) {
      if (u.phase !== 'enroute' || u.incident) continue;
      u.role = k === 0 ? 'pit' : k === 1 ? 'block' : 'follow';
      if (u.v.ai) u.v.ai.role = u.role;
      k++;
    }
  }
  unitGoal(u) {
    const p = this.game.player;
    if (u.incident) { const c = u.incident.culprit; return c && !c.dead && c.lawT > 0 ? c.pos : u.incident; }
    if (this.seenT < 1.5) return (p.vehicle || p).pos;
    // önce son görülen konuma git; varınca arama alanında rastgele noktalar
    if (u.spId !== this.lkpId) { u.spId = this.lkpId; u.sp = { x: this.lkp.x, z: this.lkp.z }; u.spT = 60; u.spLkp = true; }
    else if (Math.hypot(u.sp.x - u.v.pos.x, u.sp.z - u.v.pos.z) < (u.spLkp ? 20 : 14) || u.spT <= 0) {
      u.spT = 20; u.spLkp = false;
      const a = Math.random() * Math.PI * 2, r = this.searchR * (0.3 + 0.7 * Math.random());
      u.sp = { x: this.lkp.x + Math.sin(a) * r, z: this.lkp.z + Math.cos(a) * r };
    }
    return u.sp;
  }
  // ekip iner: koltuktan kapı tarafına, kasadan arkaya
  ejectCrewMember(u, a) {
    const g = this.game, v = u.v, p = g.player;
    if (a.passengerOf === v) v.removePassenger(a);
    else if (a.cargoOf === v) {
      a.cargoOf = null;
      const f = v.fwd, back = v.def.len / 2 + 0.8, k = u.crew.indexOf(a);
      a.pos.set(v.pos.x - f.x * back + -f.z * ((k % 2) - 0.5) * 1.4, Math.max(0, v.pos.y), v.pos.z - f.z * back + f.x * ((k % 2) - 0.5) * 1.4);
      g.physics.resolveCircle(a.pos, 0.35, a.pos.y);
      a.model.root.visible = true;
    } else return;
    a.sync();
    a.state = 'idle';
    const inc = u.incident;
    const tgt = inc ? inc.culprit : p;
    if (inc) { if (tgt && !tgt.dead) a.engage(tgt, 0.8); }
    else if ((this.level >= 2 && !(p.vehicle && this.level <= 2 && !p.aiming)) || a.kind === 'swat' || a.lawArmy || a.kind === 'soldier') a.engage(p, 1.1);
    else { a.state = 'arrest'; a.target = p; a.static = false; }
    // mevzi: aracın tehditten uzak tarafı (kapı / motor bloğu siper)
    if (a.state === 'attack' && tgt && tgt.pos) {
      const ux = v.pos.x - tgt.pos.x, uz = v.pos.z - tgt.pos.z, ul = Math.hypot(ux, uz) || 1;
      const f = v.fwd, k = u.crew.indexOf(a), along = ((k % 3) - 1) * v.def.len * 0.32;
      const cx = v.pos.x + ux / ul * (v.def.wid / 2 + 0.9) + f.x * along, cz = v.pos.z + uz / ul * (v.def.wid / 2 + 0.9) + f.z * along;
      a.tac = 'cover'; a.coverPt = { x: cx, z: cz, low: true }; a.peeking = false; a.peekT = 0.8 + Math.random(); a.tacT = 6 + Math.random() * 4; a.alertT = Math.min(a.alertT, 0.5);
    }
    this.lawLog.deployed++;
  }
  // ekip araca geri biner (oyuncu araçla kaçtığında)
  recallCrew(u) {
    const v = u.v;
    u.phase = 'recall'; u.t = 0;
    for (const a of u.crew) {
      if (a.dead || a.downed || a.passengerOf || a.cargoOf) continue;
      if (Math.hypot(a.pos.x - v.pos.x, a.pos.z - v.pos.z) > 28) { a.lawUnit = null; a.persistent = false; continue; }
      a.state = 'ext'; a.target = null; a.coverPt = null;
      a.ext = (dt, n) => {
        if (u.phase !== 'recall' || v.destroyed) { n.ext = null; n.state = n.restState(); return 0; }
        const f = v.fwd, s = (u.crew.indexOf(n) % 2) ? 1 : -1;
        const dx = v.pos.x + -f.z * s * (v.def.wid / 2 + 0.6), dz = v.pos.z + f.x * s * (v.def.wid / 2 + 0.6);
        const d = n.navTo(dx, dz, 5.2, dt, true);
        if (d < 1.2) { n.ext = null; n.state = 'idle'; if (!(v.addPassenger && v.addPassenger(n) >= 0)) { n.cargoOf = v; n.pos.y = -30; n.model.root.visible = false; } }
        return n.speed;
      };
    }
  }
  standDown() {
    const g = this.game;
    for (const u of this.units) this.releaseUnit(u, true);
    this.units.length = 0;
    for (const n of g.npcs.list) if (n.faction === 'police' && !n.dead && n.lawUnit) { n.lawUnit = null; n.persistent = false; }
    void g;
  }
  // birimi bırak: araç trafiğe döner (ekip içindeyse onlarla), dışarıdakiler devriyeye
  releaseUnit(u, calm) {
    const g = this.game, v = u.v;
    for (const a of u.crew) {
      if (a.dead) continue;
      a.lawUnit = null; a.persistent = false;
      if (a.kind === 'soldier' && calm) a.hostile = false;
      if (a.cargoOf === v && !g.vehicles.list.includes(v)) { a.cargoOf = null; a.removeMe = true; }
      if (a.state === 'ext') { a.ext = null; a.state = 'walk'; }
      if (calm && !a.passengerOf && !a.cargoOf && (a.state === 'attack' || a.state === 'arrest')) { if (!(a.target && a.target !== g.player && !a.target.dead)) { a.state = 'walk'; a.target = null; a.path = []; a.cur = null; a.coverPt = null; } }
    }
    if (v && g.vehicles.list.includes(v) && !v.destroyed && v !== g.player.vehicle) {
      v.lawUnit = null;
      const aboard = u.crew.some((a) => !a.dead && (a.passengerOf === v || a.cargoOf === v));
      if (aboard && v.ai) {
        v.sirenOn = false;
        const n = g.map.nearestNode(v.pos.x, v.pos.z);
        if (n && n.edges.length) { const o = g.map.other(n.edges[0], n); v.parked = false; v.ai = { mode: 'traffic', from: n, to: o, next: g.vehicles.chooseNext(o, n), cruise: 11, outer: false, laneCur: 2.5 }; }
      } else { v.sirenOn = false; }
    }
  }
  updateUnits(dt) {
    const g = this.game, p = g.player;
    this.unitChk = (this.unitChk || 0) - dt;
    const chk = this.unitChk <= 0;
    if (chk) this.unitChk = 1;
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i], v = u.v;
      u.t += dt;
      if (chk && (!g.vehicles.list.includes(v) || v.sinking > 0)) { for (const a of u.crew) if (a.cargoOf === v) { a.cargoOf = null; a.removeMe = true; } this.units.splice(i, 1); continue; }
      if (v.destroyed) { for (const a of u.crew) { if (a.cargoOf === v) { a.cargoOf = null; a.takeDamage && a.takeDamage(999, null, 'explosion'); } } this.units.splice(i, 1); continue; }
      if (v === p.vehicle) { this.releaseUnit(u, false); this.units.splice(i, 1); continue; } // oyuncu ekip aracını çaldı
      const goal = this.unitGoal(u);
      if (u.spT > 0) u.spT -= dt;
      if (v.ai && v.ai.mode === 'chase') { v.ai.goal = goal; v.ai.seen = u.incident ? true : this.seenT < 1.5; v.ai.role = u.role; }
      const dx = goal.x - v.pos.x, dz = goal.z - v.pos.z, d = Math.hypot(dx, dz);
      const footTarget = u.incident ? true : !p.vehicle;
      // uzakta, görülmeyen, işi bitmiş birim: sessizce bırak
      const dp = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
      if (u.phase === 'enroute') {
        const seenGoal = u.incident || this.seenT < 1.5;
        const haltD = seenGoal ? (p.vehicle && !u.incident ? 0 : 40 + v.def.len * 0.5) : 18;
        // araçtaki oyuncu sıkıştırıldı: dur, ekip iner
        const boxed = !u.incident && p.vehicle && p.vehicle.speed < 1.5 && dp < 14 && v.speed < 3 && this.boxT > 1.5;
        // yolda takıldı (trafik, kalabalık) ve olay yeri yakında: araçtan inip yaya devam
        u.slowT = Math.max(0, (u.slowT || 0) + (v.speed < 2 ? dt : -dt * 2));
        if ((footTarget && (d < haltD || (d < 75 && u.slowT > 2.5))) || boxed) { u.phase = 'halt'; u.t = 0; if (v.ai) { v.ai.mode = 'halt'; } }
      } else if (u.phase === 'halt') {
        if (v.speed < 1.2 || u.t > 4) {
          v.ai = { empty: true }; v.parked = true; v.sirenOn = true;
          u.phase = 'deploy'; u.t = 0; u.deployT = 0.15;
        }
      } else if (u.phase === 'deploy') {
        u.deployT -= dt;
        if (u.deployT <= 0) {
          u.deployT = 0.35;
          const a = u.crew.find((c) => !c.dead && (c.passengerOf === v || c.cargoOf === v));
          if (a) { this.ejectCrewMember(u, a); if (u.crew.indexOf(a) === 0) { a.barkT = 0; a.say(u.type === 'swat' ? 'Özel harekât! Silahını bırak!' : u.type === 'jandarma' ? 'Jandarma! Teslim ol!' : u.incident ? 'Polis! Silahını bırak!' : this.level >= 2 ? 'Teslim ol! Silahını bırak!' : 'Dur! Polis! Teslim ol!'); } }
          else { u.phase = 'deployed'; u.t = 0; v.crew = 0; }
        }
      } else if (u.phase === 'deployed') {
        // oyuncu araçla uzaklaşıyor: yakındaki ekip araca biner, takip sürer
        if (!u.incident && p.vehicle && p.vehicle.speed > 5 && dp > 25 && this.level > 0) this.recallCrew(u);
        if (u.incident && (!u.incident.culprit || u.incident.culprit.dead || u.incident.culprit.downed || !(u.incident.culprit.lawT > 0)) && u.t > 20) { this.recallCrew(u); u.leaving = true; }
      } else if (u.phase === 'recall') {
        const waiting = u.crew.some((a) => !a.dead && !a.downed && a.state === 'ext');
        if (!waiting || u.t > 7) {
          for (const a of u.crew) if (a.state === 'ext') { a.ext = null; a.lawUnit = null; a.persistent = false; a.state = 'walk'; }
          const aboard = u.crew.filter((a) => !a.dead && (a.passengerOf === v || a.cargoOf === v)).length;
          if (u.leaving || !aboard || this.level <= 0) { this.releaseUnit(u, true); this.units.splice(i, 1); continue; }
          const n = g.map.nearestNode(v.pos.x, v.pos.z);
          const o = n && n.edges.length ? g.map.other(n.edges[0], n) : null;
          if (n && o) { v.parked = false; v.ai = { mode: 'chase', from: n, to: o, next: g.vehicles.chooseNext(o, n, goal), cruise: v.def.maxSpeed * 0.8, outer: false, laneCur: 2.5 }; }
          v.crew = aboard; u.phase = 'enroute'; u.t = 0;
          this.assignRoles();
        }
      }
      // görevi biten / çok uzakta kalan birim
      if (dp > 300 && this.seenT > 5) { this.releaseUnit(u, true); this.units.splice(i, 1); continue; }
    }
    // oyuncu aracı sıkışma süresi
    if (p.vehicle && p.vehicle.speed < 1.5) {
      let near = 0;
      for (const u of this.units) if (Math.hypot(u.v.pos.x - p.vehicle.pos.x, u.v.pos.z - p.vehicle.pos.z) < 14) near++;
      this.boxT = near ? (this.boxT || 0) + dt : 0;
    } else this.boxT = 0;
  }

  // ---------------- [kanun] görüş: kademeli kontrol (her karede en çok 2 ışın) ----------------
  updateSight(dt) {
    const g = this.game, p = g.player;
    this.sightT -= dt;
    if (this.sightT > 0) { if (!this.seen) this.seenT += dt; return; }
    const step = 0.2;
    this.sightT = step;
    let seen = false;
    const tp = (p.vehicle || p).pos, ty = p.vehicle ? p.vehicle.pos.y + 1.2 : p.pos.y + 1.4;
    if (!p.inInterior && !p.dead) {
      // çatışmadaki kolluk: kendi görüş testleri (updateCombat) yeterli
      const near = this._near || (this._near = []);
      near.length = 0;
      for (const n of g.npcs.list) {
        if (n.dead || n.downed || n.faction !== 'police' || n.cargoOf) continue;
        const dx = n.pos.x - tp.x, dz = n.pos.z - tp.z;
        if (Math.abs(dx) > 80 || Math.abs(dz) > 80) continue;
        const d = Math.hypot(dx, dz);
        if (d > 80) continue;
        if (d < 3.5) { seen = true; break; }
        if (n.target === p && n.los && (n.state === 'attack' || n.state === 'arrest') && d < 75) { seen = true; break; }
        if (d < 50) near.push(n);
      }
      let rays = 0;
      // diğer yakın polisler: sırayla birer ışın
      if (!seen && near.length) {
        const n = near[this.sightI++ % near.length]; rays++;
        if (g.physics.lineOfSight(n.pos.x, n.pos.y + (n.passengerOf ? 1.1 : 1.6), n.pos.z, tp.x, ty, tp.z)) seen = true;
      }
      // ekip araçları (sürücü gözü)
      if (!seen) {
        const cars = this._cars || (this._cars = []);
        cars.length = 0;
        for (const v of g.vehicles.list) if (this.isLawCar(v) && !v.destroyed && Math.abs(v.pos.x - tp.x) < 65 && Math.abs(v.pos.z - tp.z) < 65) cars.push(v);
        if (cars.length) {
          const v = cars[this.sightI % cars.length]; rays++;
          if (Math.hypot(v.pos.x - tp.x, v.pos.z - tp.z) < 8 || g.physics.lineOfSight(v.pos.x, v.pos.y + 1.4, v.pos.z, tp.x, ty, tp.z)) seen = true;
        }
      }
      // helikopter (yukarıdan, geniş açı)
      const H = this.heli;
      if (!seen && H && !H.dying && !H.leaving && Math.hypot(H.pos.x - tp.x, H.pos.z - tp.z) < 110) {
        if (g.physics.lineOfSight(H.pos.x, H.pos.y - 1.5, H.pos.z, tp.x, ty + 0.4, tp.z)) seen = true;
      }
      void rays;
    }
    this.seen = seen;
    if (seen) this.spotted(tp);
    else this.seenT += step;
  }
  // arama: devriye için hedef nokta (görülmüyorsa önce LKP, sonra arama alanında rastgele)
  searchPoint(n) {
    const g = this.game, p = g.player;
    if (this.seenT < 1.5) return (p.vehicle || p).pos;
    const S = n.search || (n.search = { id: -1, x: 0, z: 0, t: 0, v: new THREE.Vector3() });
    const reached = Math.hypot(S.x - n.pos.x, S.z - n.pos.z) < 2.5;
    if (S.id !== this.lkpId) { S.id = this.lkpId; S.x = this.lkp.x + (Math.random() - 0.5) * 4; S.z = this.lkp.z + (Math.random() - 0.5) * 4; S.t = (this.clockT || 0) + 25; S.lkp = true; }
    else if (reached || (this.clockT || 0) > S.t) {
      const a = Math.random() * Math.PI * 2, r = this.searchR * (0.35 + Math.random() * 0.65);
      const pr = S.v.set(this.lkp.x + Math.sin(a) * r, 0, this.lkp.z + Math.cos(a) * r);
      g.physics.resolveCircle(pr, 0.5, 0);
      S.x = pr.x; S.z = pr.z; S.t = (this.clockT || 0) + 14; S.lkp = false;
      if (reached && Math.random() < 0.25) n.say(['Burada yok!', 'Merkez, şüpheliyi kaybettik.', 'Etrafı arayın!'], 0.5);
    }
    S.v.set(S.x, 0, S.z);
    return S.v;
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
    const ax = src.pos.x + hx * 130, az = src.pos.z + hz * 130;
    const node = map.nearestNode(ax, az);
    if (!node) return false;
    if (Math.hypot(node.x - p.pos.x, node.z - p.pos.z) < 70) return false;
    // [kanun] kurulduğu yer oyuncudan görünmesin (göz önünde belirmez)
    if (Math.hypot(node.x - p.pos.x, node.z - p.pos.z) < 160 && g.physics.lineOfSight(p.pos.x, p.pos.y + 1.6, p.pos.z, node.x, 1.4, node.z)) return false;
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
      n.state = 'guard'; n.home = new THREE.Vector3(x, 0, z); n.faceYaw = n.heading; n.rbGuard = true; // görünce çatışır
      rb.cops.push(n);
    }
    this.roadblocks.push(rb);
    return true;
  }

  // [kanun] suç yerine en yakın devriyeler koşar (yalnız birkaç kişi; sınır yıldıza göre)
  respondPatrols() {
    const g = this.game, p = g.player;
    const cap = LAW_CAP[this.level];
    let busy = 0;
    const free = [];
    for (const n of g.npcs.list) {
      if (n.dead || n.downed || n.faction !== 'police' || n.passengerOf || n.cargoOf || n.inInterior) continue;
      if ((n.state === 'attack' || n.state === 'arrest') && n.target === p) { busy++; continue; }
      if (n.state === 'attack' && n.target && !n.target.dead) continue; // başka olayla meşgul
      if (n.rbGuard) continue;
      const d = Math.hypot(n.pos.x - this.lkp.x, n.pos.z - this.lkp.z);
      if (d < PATROL_R) free.push([d, n]);
    }
    free.sort((a, b) => a[0] - b[0]);
    const want = Math.min(this.level === 1 ? 2 : 4, cap - busy);
    for (let i = 0; i < Math.min(want, free.length); i++) {
      const n = free[i][1];
      if (this.level >= 2) n.engage(p, 1); else { n.state = 'arrest'; n.target = p; n.static = false; }
      n.lawResp = true;
      if (i === 0 && free[i][0] < 45) { n.barkT = 0; n.say(this.level >= 2 ? 'Teslim ol! Silahını bırak!' : 'Dur! Polis! Teslim ol!'); }
      this.lawLog.responders++;
    }
    // devriye aracı: trafikteki en yakın ekip aracı olay yerine
    if (this.chaseCars() < CAR_CAP[this.level]) this.redirectPatrolCar(this.lkp.x, this.lkp.z, null);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    this.clockT = (this.clockT || 0) + dt;
    for (const r of this.reportQueue) r.t -= dt;
    if (this.reportQueue.length) {
      const due = this.reportQueue.filter((r) => r.t <= 0);
      if (due.length) {
        this.reportQueue = this.reportQueue.filter((r) => r.t > 0);
        for (const r of due) {
          if (this.level === 0) g.ui.notify('Bir vatandaş polisi aradı!', 'warn');
          this.add(Math.max(r.amt, this.level === 0 ? 1 : r.amt), false);
          // ihbar: polis olay yerini bilir, oyuncunun şu anki yerini değil
          this.lkp.set(r.x, 0, r.z); this.lkpId++; this.searchR = 25; this.seenT = Math.max(this.seenT, 2); this.respondT = 0;
        }
      }
    }
    if (this.backupT > 0) this.backupT -= dt;
    this.updateIncidents(dt);
    this.updateUnits(dt);
    // barikat ömrü
    for (const rb of this.roadblocks.slice()) {
      rb.t -= dt;
      const d = Math.hypot(rb.x - g.player.pos.x, rb.z - g.player.pos.z);
      if (rb.t <= 0 || d > 260 || this.level < 3) {
        for (const v of rb.cars) if (v !== g.player.vehicle && !v.driver && d > 80) g.vehicles.remove(v); else v.roadblock = false;
        for (const n of rb.cops) { n.persistent = false; n.rbGuard = false; }
        this.roadblocks.splice(this.roadblocks.indexOf(rb), 1);
      }
    }

    // [savaş] helikopter / tank / ordu: yıldız düşse de toparlanma
    this.updateHeli(dt);
    if (this.level < 5 && this.army.length) this.calmArmy();
    if (this.level <= 0) { g.audio.setSiren(0); this.arrestT = 0; this.carArrestT = 0; this.cuff(null); this.prevLevel = 0; return; }
    this.updateEscalation(dt);
    this.updateSight(dt);
    // arama alanı zamanla büyür; oyuncu alanın dışındaysa yıldız daha hızlı söner
    if (this.seenT > 1.5) this.searchR = Math.min(110, 20 + (this.seenT - 1.5) * 3.2);
    if (this.seenT > 1.5) {
      const away = Math.hypot(p.pos.x - this.lkp.x, p.pos.z - this.lkp.z) > this.searchR + 35;
      this.lostT += dt * (away ? 1.6 : 1) * (p.inInterior ? 1.3 : 1);
    } else this.lostT = 0;
    if (this.lostT > ESCAPE[this.level]) {
      this.lostT = 0;
      this.heat = Math.max(0, Math.floor(this.heat) - 1 + 0.0);
      this.level = Math.floor(this.heat);
      if (this.level <= 0) {
        this.heat = 0;
        g.ui.notify('Polisleri atlattın!', 'good');
        g.audio.setSiren(0);
        g.npcs.calmPolice();
        this.clearRoadblocks();
      } else g.ui.notify('Polis izini kaybediyor...', 'info');
    }
    g.audio.setSiren(this.level > 0 && this.seenT < 10 ? Math.min(1, this.level / 3) : 0.2 * (this.level > 0 ? 1 : 0));

    if (!p.inInterior) {
      // devriye tepkisi (en yakınlar), seyrek
      this.respondT -= dt;
      if (this.respondT <= 0) { this.respondT = 2.5; this.respondPatrols(); }
      // takviye: görüş dışından araçla
      this.dispatchT -= dt;
      if (this.dispatchT <= 0) {
        this.dispatchT = BACKUP_DT[this.level];
        const room = LAW_CAP[this.level] - this.lawCount();
        if (this.chaseCars() < CAR_CAP[this.level] && room >= 2) {
          const swat = this.level >= 4 && CARS.swat && Math.random() < 0.5;
          this.dispatchUnit(swat ? 'swat' : 'police', this.backupAt ? { at: this.backupAt } : {});
          this.backupAt = null;
        }
      }
      // özel harekât (4+): zırhlı araçla
      if (this.level >= 4) {
        this.swatT -= dt;
        if (this.swatT <= 0) {
          this.swatT = 28;
          if (LAW_CAP[this.level] - this.lawCount() >= 3) this.dispatchUnit('swat');
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
      for (const n of g.npcs.list) if (n.faction === 'police' && !n.dead && !n.downed && !n.passengerOf && !n.cargoOf && Math.abs(n.pos.x - p.pos.x) < 2 && Math.abs(n.pos.z - p.pos.z) < 2 && Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 1.7) { cop = n; break; }
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
    } else if (p.vehicle && !p.dead && p.vehicle.kind === 'car') {
      // [kanun] sıkıştırılan araçtaki oyuncu: polis kapıya gelir, "Araçtan in!"; 1-2★'da direnmezsen gözaltı
      const v = p.vehicle;
      let cop = null;
      if (v.speed < 1.2) for (const n of g.npcs.list) if (n.faction === 'police' && !n.dead && !n.downed && !n.passengerOf && !n.cargoOf && Math.hypot(n.pos.x - v.pos.x, n.pos.z - v.pos.z) < v.def.len * 0.5 + 2.2) { cop = n; break; }
      if (cop && this.level <= 2) {
        if (this.carArrestT === 0) { cop.barkT = 0; cop.say('Araçtan in! Eller yukarı!'); }
        this.carArrestT += dt;
        this.cuff(this.carArrestT / 3.5);
        if (this.carArrestT > 3.5) { this.carArrestT = 0; this.cuff(null); g.vehicles.ejectDriver(v); g.onBusted(); }
      } else if (this.carArrestT > 0) { this.carArrestT = Math.max(0, this.carArrestT - dt * 2); if (this.carArrestT <= 0) this.cuff(null); }
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
    if (L >= 2 && this.seenT < 1.5) {
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
        // [kanun] jandarma kamyonla gelir, iner (göz önünde belirmez)
        if (this.army.length < 8 && LAW_CAP[L] - this.lawCount() >= 3) {
          const u = this.dispatchUnit('jandarma');
          if (u && u.crew[0]) { u.crew[0].barkT = 0; }
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
      mesh, type, armed: !!AIR_TYPES.attackHeli, pos: new THREE.Vector3(p.pos.x + Math.sin(ang) * 280, 75, p.pos.z + Math.cos(ang) * 280),
      vel: new THREE.Vector3(), orbit: ang, hp: 1600, dying: false, fallT: 0, shootT: 3, burst: 0, rocketT: 9, chopT: 0, leaveT: 0, aim: new THREE.Vector3().copy(p.pos), heading: 0,
    };
    // projektör: saydam koni + zemin halkası (ek ışık yok: gölgelendirici sayısı sabit)
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 3.2, 1, 20, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.frustumCulled = false; cone.renderOrder = 11;
    const spot = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
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
    // [kanun] görmediği oyuncunun yerini bilmez: son görülen konum çevresinde arar
    const seen = this.seenT < 1.5;
    const tgt = seen ? (p.vehicle ? p.vehicle.pos : p.pos) : this.lkp;
    let wx, wy, wz;
    if (H.leaving) {
      const dx = H.pos.x - tgt.x, dz = H.pos.z - tgt.z, l = Math.hypot(dx, dz) || 1;
      wx = H.pos.x + dx / l * 60; wz = H.pos.z + dz / l * 60; wy = 90;
      if (l > 380) { this.removeHeli(true); return; }
    } else {
      H.orbit += dt * (seen ? 0.22 : 0.3);
      const R = seen ? 34 : Math.min(80, 30 + this.searchR * 0.5);
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
    H.cone.material.opacity = 0.015 + 0.045 * night;
    H.cone.visible = !p.inInterior;
    H.spot.position.set(H.aim.x, Math.max(0, g.physics.groundAt(H.aim.x, H.aim.z)) + 0.06, H.aim.z);
    H.spot.material.opacity = 0.08 + 0.4 * night;
    H.spot.visible = !p.inInterior;
    // pervane sesi
    H.chopT -= dt;
    if (H.chopT <= 0) { H.chopT = 0.3; audio.heliChop(H.pos.x, H.pos.z, 1); }
    if (H.leaving || p.inInterior || p.dead || !seen) return;
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
