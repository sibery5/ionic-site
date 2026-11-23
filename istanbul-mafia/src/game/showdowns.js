// [O3] Mafya hesaplaşmaları: çete bölgelerinde açılan yan görevler. Görev = SHOWDOWNS tablosunda bir satır; tek yürütücü (Showdowns).
//  raid   — çete karargâhı baskını: nöbetçiler mevzide, oyuncu yaklaşınca kuşatır; sonda lider (ağır silah, çok can).
//  convoy — pusu: çetenin araç konvoyu yolda; durdur/devir, inen ekip çatışır.
//  feud   — iki çete hesaplaşıyor: birbirlerine ateş ederler; oyuncu birine ateş edince taraf seçmiş olur (diğeri müttefik).
// Polis çete bölgesinde geç gelir: görev sürerken yıldız en çok `wanted` (varsayılan 2) ve takviye 30 sn gecikir.
// Kare içinde bellek ayırma yok: NPC/araç ekleme yalnız görev başında (mevcut npcs.add / vehicles yolları).
import { GANGS } from './economy.js';
import { DISTRICTS, districtAt } from '../world/map.js';
import { randomLook } from '../entities/character.js';
import { rng, formatMoney } from '../core/util.js';
import { MarkerSet } from './side_missions.js';

export const SHOWDOWNS = [
  { id: 'raid', kind: 'raid', title: 'Karargâh Baskını', desc: '{g} karargâhını bas, liderlerini indir.', guards: 6, weapons: ['pistol', 'uzi', 'shotgun', 'ak'], leader: { hp: 380, weapon: 'ak' }, reward: { money: 9000, respect: 60 }, wanted: 2 },
  { id: 'convoy', kind: 'convoy', title: 'Konvoy Pususu', desc: '{g} mal taşıyor: konvoyu yolda kes.', cars: 2, crew: 3, weapons: ['uzi', 'pistol', 'ak'], reward: { money: 7000, respect: 45 }, wanted: 2 },
  { id: 'feud', kind: 'feud', title: 'Çete Hesaplaşması', desc: '{g} ile {r} sokakta hesaplaşıyor. Taraf seç.', each: 4, weapons: ['pistol', 'uzi', 'shotgun'], reward: { money: 6000, respect: 50 }, wanted: 2 },
];
export const SHOWDOWN_CFG = { offerDt: 25, offerR: 4.5, offerLife: 240, engageR: 34, fail: 180, cooldown: 60 };

export class Showdowns {
  constructor(M) {
    this.M = M; this.g = M.g; this.table = SHOWDOWNS;
    this.offer = null; this.job = null;
    this.offerT = 8; this.k = 0; this.done = 0;
    this.markers = M.addMarkerSet ? M.addMarkerSet(new MarkerSet(M.g, M.g.scene)) : new MarkerSet(M.g, M.g.scene);
  }
  get busy() { return !!this.job; }
  look(gang) { const l = randomLook(rng, 'gang'); if (GANGS[gang]) l.topColor = GANGS[gang].color; return l; }
  gname(gang) { return (GANGS[gang] && GANGS[gang].name) || 'Çete'; }

  // ---- teklif: oyuncunun bulunduğu (kendisinin olmayan) çete bölgesinde haritada işaret ----
  makeOffer(def, gang, at) {
    const g = this.g, p = g.player;
    const s = at || g.npcs.sidewalkSpot(p.pos.x, p.pos.z, 40, 80);
    if (!s) return null;
    const rival = def.kind === 'feud' ? Object.keys(GANGS).find((k) => k !== gang && k !== 'family' && !(g.state.storyFlags && g.state.storyFlags.ally === k)) : null;
    this.offer = { def, gang, rival, x: s.x, z: s.z, t: 0 };
    this.markers.set([{ x: s.x, z: s.z, color: 0xff7a00, r: 3, icon: 'pin_gang', blink: true }]);
    g.ui.notify(`Hesaplaşma: ${def.title} — ${def.desc.replace('{g}', this.gname(gang)).replace('{r}', this.gname(rival))} (turuncu işarete git)`, 'warn');
    return this.offer;
  }
  clearOffer() { this.offer = null; if (!this.job) this.markers.set([]); }

  update(dt) {
    const g = this.g, p = g.player;
    if (this.job) { this.updateJob(dt); this.markers.update(); return; }
    if (p.inInterior) return;
    const O = this.offer;
    if (O) {
      O.t += dt;
      const d = Math.hypot(p.pos.x - O.x, p.pos.z - O.z);
      if (d < SHOWDOWN_CFG.offerR) { this.start(O); return; }
      if (O.t > SHOWDOWN_CFG.offerLife || d > 320) this.clearOffer();
      this.markers.update();
      return;
    }
    if (this.M.active || this.M.side.busy) return;
    this.offerT -= dt;
    if (this.offerT > 0) return;
    this.offerT = SHOWDOWN_CFG.offerDt;
    const D = districtAt(p.pos.x, p.pos.z);
    const gang = D && D.gang;
    if (!GANGS[gang] || g.state.territories[gang] || (g.state.storyFlags && g.state.storyFlags.ally === gang) || g.wanted.level > 1) return;
    this.makeOffer(SHOWDOWNS[this.k++ % SHOWDOWNS.length], gang);
  }

  start(O) {
    const g = this.g, p = g.player, def = O.def;
    const J = this.job = { def, gang: O.gang, rival: O.rival, t: 0, enemies: [], friends: [], cars: [], phase: 'go', x: O.x, z: O.z };
    this.offer = null;
    // polis çete bölgesinde geç gelir
    g.wanted.dispatchT = Math.max(g.wanted.dispatchT || 0, 30);
    const W = (i) => def.weapons[i % def.weapons.length];
    if (def.kind === 'raid') {
      // karargâh: oyuncudan 60–90 m ötede; nöbetçiler karargâh çevresine dağılır, lider ortada
      const hq = g.npcs.sidewalkSpot(p.pos.x, p.pos.z, 60, 90) || { x: O.x + 60, z: O.z };
      J.x = hq.x; J.z = hq.z;
      for (let i = 0; i < def.guards; i++) {
        const a = (i / def.guards) * Math.PI * 2, r = 7 + (i % 3) * 4;
        const n = g.npcs.add('gang', hq.x + Math.sin(a) * r, hq.z + Math.cos(a) * r, this.look(J.gang), { gang: J.gang, mission: true, hostile: true, weapon: W(i), state: 'guard' });
        n.home = n.pos.clone(); n.faceYaw = a; n.raider = true;
        J.enemies.push(n);
      }
      const b = g.npcs.add('boss', hq.x, hq.z, null, { gang: J.gang, mission: true, hostile: true, weapon: def.leader.weapon, name: this.gname(J.gang) + ' Lideri', hp: def.leader.hp, state: 'guard' });
      b.home = b.pos.clone(); J.leader = b; J.enemies.push(b);
      g.setGps(hq.x, hq.z);
      g.ui.bigMessage('KARARGÂH BASKINI', `${this.gname(J.gang)} karargâhı. Siper al, liderlerini indir.`, 'red', 3.5);
    } else if (def.kind === 'convoy') {
      for (let c = 0; c < def.cars; c++) {
        let v = null;
        for (let k = 0; c === 0 && !v && k < 8; k++) v = g.vehicles.spawnTraffic(p.pos.x, p.pos.z, 'suv'); // yol bulunamazsa birkaç kez dene
        const lead = J.cars[0];
        const car = v || (lead ? g.vehicles.add('suv', lead.pos.x - lead.fwd.x * 11, lead.pos.z - lead.fwd.z * 11, lead.heading, '#151515') : null);
        if (!car) continue;
        car.mission = true;
        if (lead) car.ai = { mode: 'direct', target: lead.pos, cruise: 13 }; else { car.ai.cruise = 12; car.ai.panic = 999; }
        car.color = '#151515';
        J.cars.push(car);
        for (let i = 0; i < def.crew; i++) {
          const n = g.npcs.add('gang', car.pos.x, car.pos.z, this.look(J.gang), { gang: J.gang, mission: true, hostile: true, weapon: W(i + c) });
          n.vehicle = car; n.model.root.visible = false; n.convoyCar = car;
          J.enemies.push(n);
        }
      }
      if (!J.cars.length) { this.job = null; this.markers.set([]); return; }
      g.ui.bigMessage('KONVOY PUSUSU', `${this.gname(J.gang)} konvoyunu durdur. Araçlar durunca adamlar iner.`, 'red', 3.5);
    } else {
      // iki çete karşı karşıya: 26 m arayla, birbirine ateş eder
      const s = g.npcs.sidewalkSpot(p.pos.x, p.pos.z, 45, 70) || { x: O.x + 45, z: O.z };
      J.x = s.x; J.z = s.z;
      const side = (gang, sx, list) => { for (let i = 0; i < def.each; i++) { const n = g.npcs.add('gang', s.x + sx + (i % 2) * 2.5, s.z + (i - def.each / 2) * 3, this.look(gang), { gang, mission: true, weapon: W(i), state: 'guard' }); n.home = n.pos.clone(); n.feud = gang; list.push(n); } };
      J.a = []; J.b = [];
      side(J.gang, -13, J.a); side(J.rival, 13, J.b);
      for (const n of J.a) n.engage(J.b[J.a.indexOf(n) % J.b.length], 1.5);
      for (const n of J.b) n.engage(J.a[J.b.indexOf(n) % J.a.length], 1.5);
      g.setGps(s.x, s.z);
      g.ui.bigMessage('ÇETE HESAPLAŞMASI', `${this.gname(J.gang)} ile ${this.gname(J.rival)} çatışıyor. Hangisine ateş edersen o tarafa karşısın.`, 'gold', 4);
    }
    this.refreshMarkers();
  }
  refreshMarkers() {
    const J = this.job; if (!J) return;
    const L = [];
    if (J.def.kind === 'convoy') { for (const v of J.cars) if (!v.destroyed && J.enemies.some((n) => n.vehicle === v)) L.push({ vehicle: v, color: 0xff3030, blink: true }); }
    for (const n of J.enemies) if (!n.dead && !n.vehicle) L.push({ actor: n, color: 0xff3030, blink: n === J.leader });
    if (J.def.kind === 'feud' && !J.chosen) for (const n of J.a.concat(J.b)) if (!n.dead) L.push({ actor: n, color: 0xffaa30 });
    this.markers.set(L);
  }

  updateJob(dt) {
    const g = this.g, p = g.player, J = this.job, def = J.def;
    J.t += dt; J.mkT = (J.mkT || 0) - dt;
    if (p.dead) { this.end(false, 'Hesaplaşmayı kaybettin.'); return; }
    if (def.kind === 'raid') {
      // biri oyuncuyu görünce ya da yakına gelince bütün karargâh uyanır ve kuşatır
      const pd = Math.hypot(p.pos.x - J.x, p.pos.z - J.z);
      if (!J.alerted && (pd < SHOWDOWN_CFG.engageR || J.enemies.some((n) => n.state === 'attack' || n.hp < n.maxHp))) {
        J.alerted = true;
        J.enemies.forEach((n, i) => { if (!n.dead) n.engage(p, 0.6 + i * 0.25); });
        g.ui.bark(J.leader, 'Baskın var! Sarın etrafını!');
      }
    } else if (def.kind === 'convoy') {
      for (const v of J.cars) {
        const crew = J.enemies.filter((n) => n.vehicle === v);
        if (!crew.length) continue;
        const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
        v.slowT = v.speed < 1.5 ? (v.slowT || 0) + dt : 0;
        if (v.destroyed) { for (const n of crew) { n.vehicle = null; n.model.root.visible = true; n.pos.copy(v.pos); n.takeDamage(999, p, 'explosion'); } continue; }
        // durduruldu / ağır hasar / oyuncu yanında yavaşladı → ekip iner, araç siper olur
        if (v.slowT > 1.5 || v.hp < v.def.hp * 0.45 || (d < 14 && v.speed < 6)) {
          v.ai = { empty: true };
          const f = v.fwd;
          crew.forEach((n, i) => { n.vehicle = null; n.model.root.visible = true; const sd = i % 2 ? 1.7 : -1.7; n.pos.set(v.pos.x - f.z * sd - f.x * (i - 1) * 1.4, v.pos.y, v.pos.z + f.x * sd - f.z * (i - 1) * 1.4); n.engage(p, 0.7 + i * 0.3); });
          g.ui.bark(crew[0], 'Pusu! İnin, araçları siper alın!');
          J.mkT = 0;
        }
      }
      const lead = J.cars[0];
      if (lead && J.enemies.some((n) => n.vehicle) && Math.hypot(lead.pos.x - p.pos.x, lead.pos.z - p.pos.z) > 420) { this.end(false, 'Konvoy gözden kayboldu.'); return; }
    } else {
      // taraf seçimi: oyuncunun ilk vurduğu çete düşman olur, diğeri müttefik
      if (!J.chosen) {
        const hitA = J.a.some((n) => n.lastAttacker === p), hitB = J.b.some((n) => n.lastAttacker === p);
        if (hitA || hitB) {
          J.chosen = true;
          const foe = hitA ? J.a : J.b, fr = hitA ? J.b : J.a;
          J.enemies = foe; J.friends = fr;
          for (const n of foe) { if (n.dead) continue; n.hostile = true; n.engage(p, 0.8); }
          for (const n of fr) { if (n.dead) continue; n.ally = true; n.hostile = false; }
          const fg = fr[0] && fr[0].gang;
          g.ui.notify(`${this.gname(fg)} tarafını tuttun. ${this.gname(foe[0].gang)} sana döndü!`, 'warn');
          J.mkT = 0;
        } else {
          // seçim yapılmadan: iki taraf birbirine ateş eder (hedefi ölen yeniden seçer)
          J.feudT = (J.feudT || 0) - dt;
          if (J.feudT <= 0) {
            J.feudT = 1.5;
            for (const [L, R] of [[J.a, J.b], [J.b, J.a]]) for (const n of L) if (!n.dead && (!n.target || n.target.dead)) { const t = R.find((m) => !m.dead); if (t) n.engage(t, 0.8); }
          }
          if (J.a.every((n) => n.dead) || J.b.every((n) => n.dead)) { this.end(true, 'Hesaplaşma sen karışmadan bitti.', 0.3); return; }
        }
      }
    }
    if (J.mkT <= 0) { J.mkT = 1; this.refreshMarkers(); }
    const alive = J.enemies.filter((n) => !n.dead).length;
    if (J.enemies.length && alive === 0 && (def.kind !== 'feud' || J.chosen)) { this.end(true); return; }
    if (J.t > SHOWDOWN_CFG.fail + (def.kind === 'raid' ? 60 : 0)) this.end(false, 'Hesaplaşma dağıldı.');
  }

  end(ok, msg, k = 1) {
    const g = this.g, J = this.job;
    if (!J) return;
    for (const n of J.enemies.concat(J.friends, J.a || [], J.b || [])) { n.mission = false; if (n.ally) { n.ally = false; } n.feud = null; }
    for (const v of J.cars) v.mission = false;
    this.job = null; this.markers.set([]); g.setGps(null);
    this.offerT = SHOWDOWN_CFG.cooldown;
    if (ok) {
      const R = J.def.reward, m = Math.round(R.money * k), r = Math.round(R.respect * k);
      g.state.money += m; g.state.respect += r; this.done++;
      g.audio.cash && g.audio.cash();
      g.ui.bigMessage(J.def.title.toLocaleUpperCase('tr'), msg || `${this.gname(J.gang)} dize geldi.`, 'gold', 3);
      g.ui.notify(`+${formatMoney(m)} · Saygınlık +${r}`, 'money');
    } else g.ui.notify(msg || 'Hesaplaşma başarısız.', 'warn');
    J.ok = ok; this.last = J;
  }
}

export { DISTRICTS };
