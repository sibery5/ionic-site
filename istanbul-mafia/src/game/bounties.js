// Aranan suçlular (ödül avı): emniyetin ve yeraltının başına ödül koyduğu kaçaklar. Görev defterinden (J)
// "Avla" ile seçilir; haritada son görüldüğü bölge işaretlenir, yaklaşınca hedef ve korumaları belirir.
// Ölü teslim: ödülün %60'ı · Diri (canı azalınca teslim olur, E ile kelepçele): tam ödül + itibar.
import * as THREE from 'three';
import { randomLook } from '../entities/character.js';
import { rng, formatMoney } from '../core/util.js';
import { GANGS } from './economy.js';

export const BOUNTY_POOL = [
  { id: 'kor_nuri', name: 'Kör Nuri', crime: 'Kuyumcu soygunları, üç cinayet', amount: 500000, district: 'eyup', guards: 4, weapon: 'ak', car: 'suv', hp: 520, armor: 100, desc: 'Tek gözü camdan. Eyüp sırtlarında bir depoda saklanıyor; adamları ağır silahlı.' },
  { id: 'cakal_suat', name: 'Çakal Suat', crime: 'Fidye için adam kaçırma', amount: 320000, district: 'uskudar', guards: 3, weapon: 'akrep', car: 'sedan', hp: 380, armor: 60, desc: 'Üsküdar sahilinde dolaşıyor. Sıkışınca araçla kaçar.' },
  { id: 'pala_ercan', name: 'Pala Ercan', crime: 'Silah kaçakçılığı', amount: 240000, district: 'fatih', guards: 3, weapon: 'cifte', car: null, hp: 340, armor: 40, desc: 'Fatih ara sokaklarında. Yakın dövüşü sever, pala taşır.' },
  { id: 'sari_haydar', name: 'Sarı Haydar', crime: 'Tefecilik, gasp', amount: 150000, district: 'kadikoy', guards: 2, weapon: 'pistol', car: 'gt', hp: 260, armor: 0, desc: 'Kadıköy çarşısında tefecilik yapıyor. Hızlı bir arabası var.' },
  { id: 'kel_vedat', name: 'Kel Vedat', crime: 'Kalpazanlık', amount: 90000, district: 'beyoglu', guards: 2, weapon: 'uzi', car: null, hp: 220, armor: 0, desc: 'Beyoğlu\'nda sahte para basıyor. Korkak, çabuk teslim olur.' },
  { id: 'dissiz_remzi', name: 'Dişsiz Remzi', crime: 'Oto hırsızlığı çetesi', amount: 60000, district: 'besiktas', guards: 1, weapon: 'pistol', car: 'sedan', hp: 200, armor: 0, desc: 'Beşiktaş\'ta çalıntı araç satıyor.' },
];
export const DISTRICT_C = { beyoglu: [-300, -120], besiktas: [-400, -650], fatih: [-450, 500], uskudar: [650, -400], kadikoy: [700, 550], eyup: [-930, 0] };
export const DISTRICT_N = { beyoglu: 'Beyoğlu', besiktas: 'Beşiktaş', fatih: 'Fatih', uskudar: 'Üsküdar', kadikoy: 'Kadıköy', eyup: 'Eyüp' };

export class Bounties {
  constructor(game) {
    this.g = game;
    this.markers = { list: [], version: 0 };
    this.live = null; // sahnedeki av {def, target, guards, car}
    game.missions.addMarkerSet(this.markers);
    this.mkT = 0;
  }
  get S() {
    const s = this.g.state;
    if (!s.bounties) s.bounties = { active: null, rec: {} };
    for (const b of BOUNTY_POOL) if (!s.bounties.rec[b.id]) s.bounties.rec[b.id] = { status: 'open', x: null, z: null };
    return s.bounties;
  }
  list() { const S = this.S; return BOUNTY_POOL.map((b) => ({ ...b, ...S.rec[b.id], active: S.active === b.id })); }
  // saklanma yeri: bölge merkezine yakın, kaldırım kenarında (bir kez seçilir, kayda yazılır)
  hideout(b) {
    const r = this.S.rec[b.id];
    if (r.x === null) {
      const [cx, cz] = DISTRICT_C[b.district];
      const s = this.g.map.randomEdgeNear(cx, cz, 20, 140);
      if (s) { const e = s.e, dx = e.b.x - e.a.x, dz = e.b.z - e.a.z, l = Math.hypot(dx, dz) || 1; r.x = s.x + (-dz / l) * (e.width / 2 + 2.2); r.z = s.z + (dx / l) * (e.width / 2 + 2.2); }
      else { r.x = cx; r.z = cz; }
    }
    return r;
  }
  hunt(id) {
    const g = this.g, S = this.S, b = BOUNTY_POOL.find((x) => x.id === id);
    if (!b || S.rec[id].status !== 'open') return;
    if (this.live) this.despawnLive(true);
    S.active = id;
    const h = this.hideout(b);
    // bölge kabaca bilinir: 60 m sapma
    S.rec[id].ax = h.x + (Math.random() - 0.5) * 70; S.rec[id].az = h.z + (Math.random() - 0.5) * 70;
    g.setGps(S.rec[id].ax, S.rec[id].az);
    g.ui.notify(`Ödül avı: ${b.name} (${formatMoney(b.amount)}). Son görüldüğü yer haritada işaretli.`, 'warn');
    this.updateMarkers(true);
  }
  cancel() { const S = this.S; if (this.live) this.despawnLive(true); S.active = null; this.g.setGps(null); this.updateMarkers(true); }

  spawnLive(b) {
    const g = this.g, h = this.hideout(b);
    const look = randomLook(rng, 'boss'); look.topColor = '#2a2420'; look.hat = Math.random() < 0.5 ? 'kasket' : 'none';
    const t = g.npcs.add('boss', h.x, h.z, look, { persistent: true, mission: true, name: b.name, state: 'guard', home: new THREE.Vector3(h.x, 0, h.z), hp: b.hp, armor: b.armor, weapon: b.weapon });
    t.hostile = false; t.scriptKill = true; t.bounty = b.id;
    const guards = [];
    for (let i = 0; i < b.guards; i++) {
      const a = (i / b.guards) * Math.PI * 2;
      const gl = randomLook(rng, 'gang'); gl.topColor = '#3a3226';
      const n = g.npcs.add('gang', h.x + Math.sin(a) * 2.5, h.z + Math.cos(a) * 2.5, gl, { persistent: true, mission: true, state: 'guard', home: new THREE.Vector3(h.x + Math.sin(a) * 2.5, 0, h.z + Math.cos(a) * 2.5), weapon: i % 2 ? 'uzi' : b.weapon === 'ak' ? 'ak' : 'pistol' });
      n.hostile = false; n.faceYaw = a;
      guards.push(n);
    }
    let car = null;
    if (b.car) {
      const rs = g.map.randomEdgeNear(h.x, h.z, 0, 14);
      if (rs) { car = g.vehicles.add(b.car, rs.x, rs.z, 0, '#202020'); car.parked = true; car.mission = true; }
    }
    this.live = { def: b, target: t, guards, car, alert: false, fled: false, t: 0 };
    this.updateMarkers(true);
  }
  despawnLive(remove) {
    const L = this.live;
    if (!L) return;
    const all = [L.target, ...L.guards];
    for (const n of all) { n.mission = false; n.persistent = false; if (remove && !n.dead) this.g.npcs.remove(n); }
    if (L.car) L.car.mission = false;
    this.live = null;
  }
  payout(b, alive) {
    const g = this.g, s = g.state, S = this.S;
    const amt = alive ? b.amount : Math.round(b.amount * 0.6);
    s.money += amt; s.respect += alive ? 40 : 25;
    if (alive) s.legalRep = (s.legalRep || 0) + 20; else s.crimeRep = (s.crimeRep || 0) + 15;
    S.rec[b.id].status = alive ? 'caught' : 'dead';
    S.active = null;
    g.audio.cash(); g.audio.success();
    g.ui.bigMessage(alive ? 'SUÇLU TESLİM EDİLDİ' : 'ARANAN ÖLÜ ELE GEÇTİ', `${b.name} · +${formatMoney(amt)}`, 'gold', 4);
    g.setGps(null);
    this.despawnLive(false);
    this.updateMarkers(true);
  }

  prompt() {
    const L = this.live, g = this.g, p = g.player;
    if (!L || p.vehicle) return null;
    const t = L.target;
    if (t.dead || t.state !== 'surrender') return null;
    if (Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) > 2.4) return null;
    return { label: `Kelepçele ve emniyete teslim et: ${t.name}`, action: () => { t.state = 'idle'; t.handsUp = true; g.ui.bark(t, 'Tamam, tamam! Avukatımı isterim!'); this.payout(L.def, true); setTimeout(() => { if (!t.dead) g.npcs.remove(t); }, 2500); } };
  }

  updateMarkers(force) {
    const S = this.S, list = [];
    for (const b of BOUNTY_POOL) {
      const r = S.rec[b.id];
      if (r.status !== 'open') continue;
      if (S.active === b.id) {
        if (this.live && !this.live.target.dead) {
          list.push({ x: r.ax ?? r.x, z: r.az ?? r.z, color: 0xff5030, area: 45, areaOnly: true });
          list.push({ actor: this.live.target, color: 0xff3030, icon: 'pin_skull', label: b.name, blink: true });
        }
        else list.push({ x: r.ax ?? r.x, z: r.az ?? r.z, color: 0xff5030, icon: 'pin_skull', label: `${b.name} · ${formatMoney(b.amount)}`, area: 45, blink: true });
      } else {
        const [cx, cz] = DISTRICT_C[b.district];
        list.push({ x: cx + 30, z: cz + 30, color: 0xb05040, icon: 'pin_skull', label: formatMoney(b.amount), mmHide: true });
      }
    }
    const key = list.map((m) => m.label + (m.actor ? 'a' : '') + ((m.x || 0) | 0)).join();
    if (force || key !== this._k) { this._k = key; this.markers.list = list; this.markers.version++; }
  }

  // D4: hedef 60 m içindeyken tepesinde ok; ekran dışındaysa ekran kenarında yön oku + mesafe [hareket]
  updateArrow() {
    const g = this.g, p = g.player, L = this.live;
    let d = 1e9, tp = null;
    if (L && !L.target.dead && !p.inInterior && g.mode === 'playing') {
      tp = L.target.vehicle ? L.target.vehicle.pos : L.target.pos;
      d = Math.hypot(p.pos.x - tp.x, p.pos.z - tp.z);
    }
    const on = d < 60;
    if (!this.arrow) {
      if (!on) return;
      const geo = new THREE.ConeGeometry(0.32, 0.75, 4); geo.rotateX(Math.PI); // uç aşağı
      this.arrow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.92, depthWrite: false }));
      this.arrow.renderOrder = 5; g.scene.add(this.arrow);
      const e = this.edgeEl = document.createElement('div');
      e.className = 'bounty-edge';
      e.style.cssText = 'position:fixed;left:0;top:0;z-index:20;pointer-events:none;display:none;font:bold 14px system-ui,sans-serif;color:#fff;text-shadow:0 0 4px #000,0 0 2px #000;text-align:center;will-change:transform';
      e.innerHTML = '<div style="width:0;height:0;margin:0 auto 2px;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:20px solid #ff3030;filter:drop-shadow(0 0 2px #000)"></div><span></span>';
      document.body.appendChild(e);
      this._ev = new THREE.Vector3(); this._ed = -1;
    }
    this.arrow.visible = on;
    if (!on) { if (this.edgeEl.style.display !== 'none') this.edgeEl.style.display = 'none'; return; }
    const tH = L.target.vehicle ? 2.6 : 2.55;
    this.arrow.position.set(tp.x, tp.y + tH + Math.sin(performance.now() * 0.006) * 0.15, tp.z);
    this.arrow.rotation.y += 0.04;
    const v = this._ev.set(tp.x, tp.y + tH, tp.z).project(g.camera);
    const W = innerWidth, Hh = innerHeight;
    const behind = v.z > 1;
    let x = v.x, y = v.y;
    const inView = !behind && Math.abs(x) < 0.94 && Math.abs(y) < 0.9;
    let ang = 180; // ekranda: ok aşağı (hedefe) bakar
    if (!inView) {
      if (behind) { x = -x; y = -y; }
      const k = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.82, 1e-3);
      x /= k; y /= k;
      ang = Math.atan2(x * W, y * Hh) * 180 / Math.PI;
    }
    const sx = (x * 0.5 + 0.5) * W, sy = (-y * 0.5 + 0.5) * Hh - (inView ? 42 : 0);
    const e = this.edgeEl;
    if (e.style.display === 'none') e.style.display = 'block';
    e.style.transform = `translate(${sx - 30}px,${sy - 18}px)`;
    e.firstChild.style.transform = `rotate(${ang}deg)`;
    e.firstChild.style.visibility = inView ? 'hidden' : 'visible';
    const dm = Math.round(d);
    if (dm !== this._ed) { this._ed = dm; e.lastChild.textContent = dm + ' m'; }
    e.style.width = '60px';
  }

  update(dt) {
    const g = this.g, p = g.player, S = this.S;
    this.mkT -= dt;
    if (this.mkT <= 0) { this.mkT = 0.6; this.updateMarkers(false); }
    // [E7] kırmızı ok yerine ui/guide.js sarı oku (aynı ok ve kenar oku tüm hedeflerde)
    if (p.inInterior || !S.active) return;
    const b = BOUNTY_POOL.find((x) => x.id === S.active);
    const h = this.hideout(b);
    const dh = Math.hypot(p.pos.x - h.x, p.pos.z - h.z);
    if (!this.live && dh < 110) { this.spawnLive(b); g.ui.notify(`${b.name} yakında! Dikkatli ol, korumaları var.`, 'warn'); }
    const L = this.live;
    if (!L) return;
    L.t += dt;
    const t = L.target;
    if (t.dead) { this.payout(b, false); return; }
    const d = Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z);
    // fark edilme: yakınlık, silah çekme ya da ateş
    if (!L.alert && (d < 18 || (d < 40 && p.aiming) || t.hp < t.maxHp || t.underFireT > 0 || L.guards.some((n) => n.hp < n.maxHp || n.dead || n.underFireT > 0))) {
      L.alert = true;
      for (const n of L.guards) if (!n.dead) { n.hostile = true; n.engage(p, 0.8); }
      g.ui.bark(t, 'Ödül avcısı! Vurun şunu!');
      if (L.car && !L.car.destroyed && Math.random() < 0.8) {
        // araçla kaç
        t.vehicle = L.car; t.model.root.visible = false; L.car.parked = false;
        const n0 = g.map.nearestNode(L.car.pos.x, L.car.pos.z);
        L.car.ai = { mode: 'traffic', from: n0, to: g.map.other(n0.edges[0], n0), next: null, cruise: 24, panic: 999 };
        L.car.ai.next = g.vehicles.chooseNext(L.car.ai.to, n0);
        L.fled = true;
        g.ui.notify(`${b.name} araçla kaçıyor! Aracı durdur.`, 'warn');
      } else { t.hostile = true; t.engage(p, 1); }
    }
    // araçtaki kaçak: araç hasar görünce iner ve savaşır/kaçar
    if (t.vehicle) {
      const c = t.vehicle;
      t.pos.copy(c.pos);
      if (c.destroyed || c.hp < c.def.hp * 0.4 || c.sinking > 0 || (c.speed < 0.6 && L.t > 6 && d < 25)) {
        t.vehicle = null; t.model.root.visible = true; c.ai = { empty: true };
        t.pos.set(c.pos.x + c.fwd.z * 2.2, 0, c.pos.z - c.fwd.x * 2.2);
        if (c.destroyed) t.takeDamage(80, null, 'explosion');
        t.hostile = true; t.engage(p, 0.6);
        g.ui.bark(t, 'Beni canlı alamazsın!');
      } else if (d > 420) { g.ui.notify(`${b.name} izini kaybettirdi. Bölgesine geri dönecek.`, 'warn'); this.despawnLive(true); return; }
      return;
    }
    // canı azalınca teslim olur (diri ödül)
    if (!t.dead && t.state !== 'surrender' && t.hp < t.maxHp * 0.3) {
      t.state = 'surrender'; t.target = null; t.hostile = false;
      g.ui.bark(t, 'Tamam! Teslim oluyorum! Vurma!');
      g.ui.notify(`${b.name} teslim oldu. Yanına git, E ile kelepçele (tam ödül) — ya da işini bitir (%60).`, 'info');
    }
    if (dh > 260 && !t.vehicle) this.despawnLive(true);
  }
}
