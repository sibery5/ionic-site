// Kariyer: yasal meslekler (taksi, kurye, otobüs, tamirci, koruma) ve suç işleri (sipariş üzerine
// araç hırsızlığı, dükkân soygunu, haraç, kiralık katillik). Yasal ve suç itibarı ayrı tutulur.
// Görev sistemiyle çakışmasın diye kendi işaretçileri, iş tabelaları ve HUD kanalını kullanır.
import * as THREE from 'three';
import { CARS, GANGS, LEGAL_RANKS, CRIME_RANKS, rankIn, ensureLifeState } from './economy.js';
import { WEAPONS } from './weapons.js';
import { randomLook } from '../entities/character.js';
import { districtAt } from '../world/map.js';
import { formatMoney, rng } from '../core/util.js';
import { signTexture } from '../core/textures.js';

const ringGeo = new THREE.CylinderGeometry(1.2, 1.2, 2.2, 28, 1, true);
const arrowGeo = new THREE.ConeGeometry(0.45, 0.9, 4); arrowGeo.rotateX(Math.PI);
const gemGeo = new THREE.OctahedronGeometry(0.42);
ringGeo.userData.shared = arrowGeo.userData.shared = gemGeo.userData.shared = true;

export const COL = { legal: 0x5ad1ff, crime: 0xff4a4a, pickup: 0xffcc33, drop: 0x7cff8a };
const SHOP_TYPES = ['food', 'clothes', 'cafe', 'trade', 'gun'];
const PAX_LINES = ['Abi acelem var, uçağa yetişeceğim!', 'Klimayı biraz açar mısın?', 'Köprü trafiği yok değil mi?', 'Şoför bey, kısa yoldan lütfen.', 'Ben söylerim, şuradan sağa...', 'Maçı dinliyor musunuz?'];
const HIT_NAMES = ['Kirli Necmi', 'Tefeci Sabri', 'Muhbir Cevdet', 'Kumarbaz Tahsin', 'Kaçakçı Rüstem', 'Sahtekâr Orhan', 'Hain Şükrü'];
const VIP_NAMES = ['Müteahhit Bey', 'Holding Varisi', 'Şarkıcı Süheyla', 'Milletvekili Adayı', 'Futbolcu Emre'];

// İş tanımları. need: gereken itibar (yasal ya da suç). base: temel kazanç ölçeği.
export const JOBS = {
  taxi: { name: 'Taksi Şoförlüğü', path: 'legal', icon: 'j_taxi', need: 0, board: 'TAKSİ DURAĞI', near: ['hospital', -480, 10], desc: 'Sarı taksiyle müşteri topla, mesafeye göre ücret ve hızlı teslimde bahşiş kazan.' },
  courier: { name: 'Kurye', path: 'legal', icon: 'j_courier', need: 0, board: 'KURYE DEPOSU', near: ['food', 30, -60], desc: 'Paketi dükkândan al, süre dolmadan adrese teslim et. Yaya, araçla ya da motorla.' },
  bus: { name: 'Otobüs Şoförlüğü', path: 'legal', icon: 'j_bus', need: 40, board: 'İETT GARAJI', near: ['bank', -350, -420], desc: 'Şehir otobüsüyle 5 duraklık hattı tamamla. Her durakta yolcu ücreti, hat sonunda prim.' },
  mechanic: { name: 'Yol Yardım Tamirciliği', path: 'legal', icon: 'j_mechanic', need: 0, board: 'YOL YARDIM', near: ['garage', 900, 700], desc: 'Yolda kalan araçlara git ve tamir et. Her tamir bir müşteri.' },
  guard: { name: 'Koruma (VIP)', path: 'legal', icon: 'j_guard', need: 150, board: 'GÜVENLİK ŞİRKETİ', near: ['club', -260, -520], desc: 'Önemli bir müşteriyi 75 saniye boyunca saldırganlardan koru. Ateşli silah şart.' },
  chop: { name: 'Siparişe Araç Hırsızlığı', path: 'crime', icon: 'j_chop', need: 0, board: 'TORNA ATÖLYESİ', near: ['warehouse', -40, 250], desc: 'Söküm atölyesi belirli bir model istiyor. Bul, çal, hasarsız getir.' },
  robbery: { name: 'Dükkân Soygunu', path: 'crime', icon: 'j_rob', need: 0, desc: 'İşaretli dükkânın kasasını boşalt ve polisi atlat. (Her dükkânda silahla kasa soyulabilir.)' },
  protection: { name: 'Haraç Turu', path: 'crime', icon: 'j_protect', need: 40, board: 'KIRAATHANE', near: ['cafe', -40, -260], desc: 'Semtteki üç esnaftan "koruma parası" topla. Bazıları polisi arayabilir.' },
  hit: { name: 'Kiralık Katil', path: 'crime', icon: 'j_hit', need: 150, board: 'KARANLIK KÖŞE', near: ['trade', -100, -40], desc: 'Hedefi ve korumalarını indir. Kontrat ücreti itibarınla artar.' },
};
export const JOB_ORDER = ['taxi', 'courier', 'bus', 'mechanic', 'guard', 'chop', 'robbery', 'protection', 'hit'];

export class Career {
  constructor(game) {
    this.game = game;
    this.job = null;
    this.markers = [];
    this.meshes = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.boards = [];
    this.boardGroup = new THREE.Group();
    game.scene.add(this.boardGroup);
    this.hold = null;
  }

  // ---------- itibar & rütbe ----------
  get s() { return ensureLifeState(this.game.state); }
  rank(path) { return rankIn(path === 'legal' ? LEGAL_RANKS : CRIME_RANKS, path === 'legal' ? this.s.legalRep : this.s.crimeRep); }
  mult(path) { return 1 + this.rank(path).index * 0.15; }
  canDo(id) { const d = JOBS[id]; return (d.path === 'legal' ? this.s.legalRep : this.s.crimeRep) >= d.need; }
  addRep(path, n) {
    const s = this.s, key = path === 'legal' ? 'legalRep' : 'crimeRep';
    const before = this.rank(path).index;
    s[key] = Math.max(0, Math.round(s[key] + n));
    const r = this.rank(path);
    if (r.index > before) {
      this.game.ui.bigMessage('RÜTBE ATLADIN', `${path === 'legal' ? 'İş hayatı' : 'Yeraltı'}: ${r.name}`, path === 'legal' ? 'gold' : 'red', 3.5);
      this.game.audio.success();
    }
  }
  pay(amount, path, rep, label) {
    const g = this.game, s = this.s;
    const v = Math.round(amount * this.mult(path));
    s.money += v;
    if (this.job) { this.job.earned += v; this.job.count++; }
    const js = s.jobStats[this.job ? this.job.id : 'misc'] = s.jobStats[this.job ? this.job.id : 'misc'] || { count: 0, earned: 0 };
    js.count++; js.earned += v;
    if (rep) this.addRep(path, rep);
    if (path === 'crime') s.respect += Math.max(1, Math.round(rep / 2));
    g.audio.cash();
    g.ui.notify(`${label ? label + ' · ' : ''}+${formatMoney(v)}`, 'money');
    return v;
  }

  // ---------- HUD ----------
  objective(t) {
    const j = this.job;
    const extra = j && j.earned ? ` <small class="earn">Kazanç ${formatMoney(j.earned)}</small>` : '';
    this.game.ui.setObjective(t ? t + extra : '', 'job', j ? JOBS[j.id].path : 'legal');
  }
  timer(t) { this.game.ui.setJobTimer(t); }

  // ---------- işaretçiler ----------
  setMarkers(list) {
    this.markers = list;
    for (const m of this.meshes) m.parent && m.parent.remove(m);
    this.meshes = list.map((mk) => {
      const g = new THREE.Group();
      if (!mk.actor && !mk.vehicle) {
        const c = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: mk.color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        c.position.y = 1.1; c.scale.setScalar((mk.r || 3) / 2.4); g.add(c);
      }
      const a = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: mk.color }));
      a.position.y = 4; g.add(a);
      g.userData.arrow = a;
      this.group.add(g);
      return g;
    });
  }
  markerPos(mk) {
    if (mk.actor) return mk.actor.pos;
    if (mk.vehicle) return mk.vehicle.pos;
    return mk;
  }
  gpsTo(x, z) { this.game.setGps(x, z); }

  // ---------- yardımcılar ----------
  dist(a, x, z) { return Math.hypot(a.x - x, a.z - z); }
  playerPos() { const p = this.game.player; return p.vehicle ? p.vehicle.pos : p.pos; }
  spot(x, z, min, max) {
    const g = this.game;
    for (let i = 0; i < 8; i++) {
      const s = g.npcs.sidewalkSpot(x, z, min, max);
      if (s) return { x: s.x, z: s.z };
    }
    const e = g.map.randomEdgeNear(x, z, min, max);
    return e ? { x: e.x, z: e.z } : { x: x + min, z };
  }
  // yol kenarına araç bırak
  spawnCar(type, x, z, color, along = 10) {
    const g = this.game, map = g.map;
    const n = map.nearestNode(x, z);
    const e = n.edges[Math.floor(Math.random() * n.edges.length)] || n.edges[0];
    const o = map.other(e, n);
    const dx = o.x - n.x, dz = o.z - n.z, l = Math.hypot(dx, dz) || 1;
    const t = Math.min(along, l * 0.5);
    const px = n.x + (dx / l) * t + (-dz / l) * (e.width / 2 - 1.2), pz = n.z + (dz / l) * t + (dx / l) * (e.width / 2 - 1.2);
    return g.vehicles.add(type, px, pz, Math.atan2(dx, dz), color);
  }
  nearShop(x, z, min, max, types = SHOP_TYPES) {
    const c = this.game.map.specials.filter((b) => types.includes(b.type) && !b.ownedProp).map((b) => ({ b, d: Math.hypot(b.door.x - x, b.door.z - z) }));
    const ok = c.filter((o) => o.d >= min && o.d <= max);
    const pool = ok.length ? ok : c.sort((a, b) => a.d - b.d).slice(0, 3);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].b : null;
  }
  front(b, k = 1.6) { return { x: b.door.x, z: b.door.z + (b.door.nz || 0) * k }; }
  hasGun() { const p = this.game.player; return p.wdef && p.wdef.type !== 'melee' && p.weapon !== 'fists'; }

  // ---------- iş tabelaları (dünyada başlangıç noktaları) ----------
  buildBoards() {
    if (this.boardsBuilt || !this.game.map) return;
    this.boardsBuilt = true;
    const g = this.game;
    for (const id of JOB_ORDER) {
      const d = JOBS[id];
      if (!d.near) continue;
      const b = g.map.nearestOfType(d.near[0], d.near[1], d.near[2]);
      if (!b) continue;
      const x = b.door.x + 3.6, z = b.door.z + (b.door.nz || 1) * 2.4;
      const grp = new THREE.Group();
      const col = d.path === 'legal' ? COL.legal : COL.crime;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6 }));
      post.position.y = 1.2; grp.add(post);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: signTexture(d.board, d.path === 'legal' ? '#0d3a5a' : '#3a0d0d', d.path === 'legal' ? '#bfefff' : '#ffd0c0'), side: THREE.DoubleSide }));
      sign.position.y = 2.3; sign.rotation.y = (b.door.nz || 1) > 0 ? 0 : Math.PI; grp.add(sign);
      const gem = new THREE.Mesh(gemGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 }));
      gem.position.y = 3.1; grp.add(gem);
      grp.userData.gem = gem;
      grp.position.set(x, 0, z);
      this.boardGroup.add(grp);
      const bd = { id, x, z, grp };
      this.boards.push(bd);
      g.worldInteract.push({ x, z, r: 1.8, label: `${d.path === 'legal' ? 'İş ilanı' : 'Kirli iş'}: ${d.name}`, action: () => g.ui.jobOffer(id), careerBoard: true });
    }
  }

  // ---------- iş akışı ----------
  startJob(id) {
    const g = this.game, d = JOBS[id];
    if (!d) return false;
    // hikâye görevi açıkken de iş yapılabilir (ilk görev yeni oyunda otomatik başlar); GPS işe geçer
    if (g.missions && g.missions.active) g.ui.notify(`Reis'in işi (${g.missions.active.title}) beklemede. GPS artık bu işi gösteriyor.`, 'info');
    if (g.life && g.life.test) { g.ui.notify('Önce test sürüşünü bitir.', 'warn'); return false; }
    if (!this.canDo(id)) { g.ui.notify(`${d.name} için ${d.path === 'legal' ? 'yasal' : 'suç'} itibarın ${d.need} olmalı.`, 'warn'); g.audio.error(); return false; }
    if (this.job) this.endJob(true);
    this.job = { id, def: d, stage: '', t: 0, earned: 0, count: 0, npcs: [], cars: [], interacts: [] };
    g.ui.bigMessage(d.name.toUpperCase(), d.path === 'legal' ? 'Mesai başladı · bitirmek için Telefon › İşler' : 'Kirli iş başladı', d.path === 'legal' ? 'gold' : 'red', 2.4);
    const fn = this['start_' + id];
    fn.call(this, this.job);
    return true;
  }
  endJob(silent = false, reason = '') {
    const g = this.game, j = this.job;
    if (!j) return;
    for (const n of j.npcs) if (n) { n.mission = null; if (n.static && !n.dead && n.jobTemp) g.npcs.remove(n); }
    for (const v of j.cars) if (v && !v.owned) { v.mission = null; if (j.tempCar === v && g.player.vehicle !== v) g.vehicles.remove(v); }
    for (const it of j.interacts) { const i = g.worldInteract.indexOf(it); if (i >= 0) g.worldInteract.splice(i, 1); }
    if (this.hold && this.hold.job) this.hold = null;
    this.job = null;
    this.setMarkers([]);
    this.objective('');
    this.timer(0);
    g.setGps(null);
    if (!silent) {
      if (reason) { g.audio.fail(); g.ui.bigMessage('İŞ BAŞARISIZ', reason, 'red', 3); }
      else g.ui.notify(`${j.def.name} bitti · ${j.count} iş · toplam ${formatMoney(j.earned)}`, j.earned ? 'money' : 'info');
    }
  }
  fail(reason) { this.endJob(false, reason); }
  finish(title, sub) { const g = this.game; g.audio.success(); g.ui.bigMessage(title, sub, 'gold', 3.2); this.endJob(true); }

  onNewState() { this.job = null; this.setMarkers([]); this.hold = null; this.game.ui.setObjective('', 'job'); this.timer(0); this.buildBoards(); }

  update(dt) {
    const g = this.game;
    this.buildBoards();
    const t = performance.now() * 0.001;
    // tabelaların süzülen taşları
    for (const b of this.boards) { const gm = b.grp.userData.gem; gm.rotation.y = t * 1.6; gm.position.y = 3.1 + Math.sin(t * 2 + b.x) * 0.12; }
    this.boardGroup.visible = !g.player.inInterior;
    // basılı tutma işlemleri (tamir, soygun)
    if (this.hold) this.updateHold(dt);
    const j = this.job;
    if (j) {
      j.t += dt;
      if (g.player.dead) this.fail('Bayıldın, iş yarım kaldı');
      else this['update_' + j.id].call(this, j, dt);
    }
    // işaretçi animasyonu
    this.group.visible = !g.player.inInterior;
    this.markers.forEach((mk, i) => {
      const m = this.meshes[i];
      if (!m) return;
      const p = this.markerPos(mk);
      let y = 0;
      if (mk.actor) { y = mk.actor.pos.y + 0.6; m.visible = !mk.actor.dead && !mk.actor.inInterior; }
      if (mk.vehicle) { y = mk.vehicle.def.hei; m.visible = !mk.vehicle.destroyed && g.player.vehicle !== mk.vehicle; }
      m.position.set(p.x, y, p.z);
      m.userData.arrow.position.y = 3.4 + Math.sin(t * 3) * 0.3;
      m.userData.arrow.rotation.y = t * 2;
    });
  }

  // ---------- basılı tutma (E'ye bastıktan sonra yakında kal) ----------
  startHold(opts) { this.hold = { t: 0, ...opts }; this.game.ui.setProgress(opts.label, 0); }
  updateHold(dt) {
    const g = this.game, h = this.hold, p = g.player;
    if (p.dead || Math.hypot(p.pos.x - h.x, p.pos.z - h.z) > (h.r || 3) || (h.ctx && p.inInterior !== h.ctx)) {
      this.hold = null; g.ui.setProgress(null);
      g.ui.notify(h.cancelText || 'İşlem yarıda kaldı', 'warn');
      if (h.cancel) h.cancel();
      return;
    }
    h.t += dt;
    g.ui.setProgress(h.label, h.t / h.dur);
    if (h.tick) h.tick(h.t / h.dur, dt);
    if (h.t >= h.dur) { this.hold = null; g.ui.setProgress(null); h.done(); }
  }

  // iç mekâna girişte iş etkileşimleri (haraç, işaretli soygun)
  onEnterInterior(ctx) {
    const j = this.job;
    if (!j) return;
    if (j.id === 'protection' && j.shops && ctx.building === j.shops[j.idx]) {
      const it = { x: ctx.shopSpot ? ctx.shopSpot.x : 0, z: ctx.shopSpot ? ctx.shopSpot.z + 0.2 : 0, r: 1.8, label: 'Haraç iste: "Bu dükkân bizim koruma altında"', action: () => this.collectProtection(ctx, it) };
      ctx.interact.push(it);
    }
  }
  onRobbery(ctx) {
    const j = this.job;
    if (j && j.id === 'robbery' && j.shop === ctx.building) { j.stage = 'escape'; this.pay(1500, 'crime', 5, 'İşaretli dükkân primi'); }
  }

  // ======================= TAKSİ =======================
  start_taxi(j) {
    const p = this.game.player;
    if (p.vehicle && p.vehicle.type === 'taksi') j.car = p.vehicle;
    else { j.car = this.spawnCar('taksi', p.pos.x, p.pos.z); j.tempCar = j.car; }
    j.car.mission = j.car.mission || 'job';
    j.cars.push(j.car);
    j.stage = 'car';
  }
  update_taxi(j, dt) {
    const g = this.game, p = g.player, v = j.car;
    if (!v || v.destroyed) return this.fail('Taksi hurdaya döndü');
    const inCar = p.vehicle === v;
    if (j.stage === 'car') {
      if (inCar) { j.stage = 'seek'; j.pax = null; return; }
      if (!j.mkCar) { j.mkCar = true; this.setMarkers([{ vehicle: v, color: COL.legal }]); this.gpsTo(v.pos.x, v.pos.z); }
      this.objective('Taksi · Sarı taksine bin');
      return;
    }
    j.mkCar = false;
    if (j.stage === 'seek') {
      if (!inCar) { j.stage = 'car'; return; }
      if (!j.pax || j.pax.dead) {
        const s = this.spot(v.pos.x, v.pos.z, 70, 220);
        const n = g.npcs.add('civilian', s.x, s.z, null, { state: 'guard', static: true, home: new THREE.Vector3(s.x, 0, s.z), mission: 'job' });
        n.jobTemp = true;
        j.pax = n; j.npcs.push(n);
        this.setMarkers([{ actor: n, color: COL.pickup }]);
        this.gpsTo(s.x, s.z);
        j.waveT = 0;
      }
      const d = this.dist(v.pos, j.pax.pos.x, j.pax.pos.z);
      j.waveT -= dt;
      if (d < 40 && j.waveT <= 0) { g.ui.bark(j.pax, 'Taksi! Taksi!'); j.waveT = 6; }
      this.objective(`Taksi · Müşteriyi al <small>${Math.round(d)} m</small>`);
      if (d < 7 && Math.abs(v.fs) < 4) {
        g.npcs.remove(j.pax);
        const dst = this.spot(v.pos.x, v.pos.z, 260, 720);
        const dd = Math.hypot(dst.x - v.pos.x, dst.z - v.pos.z);
        j.dest = dst; j.fare = 60 + dd * 1.15; j.limit = dd / 11 + 25; j.left = j.limit; j.outT = 0;
        j.destName = districtAt(dst.x, dst.z).name;
        this.setMarkers([{ x: dst.x, z: dst.z, color: COL.drop, r: 4 }]);
        this.gpsTo(dst.x, dst.z);
        g.ui.notify(`Müşteri: "${PAX_LINES[Math.floor(Math.random() * PAX_LINES.length)]}"`, 'info');
        j.stage = 'ride';
      }
      return;
    }
    if (j.stage === 'ride') {
      j.left -= dt;
      this.timer(Math.max(0, j.left));
      if (!inCar) {
        j.outT += dt;
        this.objective(`Taksi · Müşteri bekliyor! Taksiye dön <small>${Math.ceil(12 - j.outT)} sn</small>`);
        if (j.outT > 12) { g.ui.notify('Müşteri sinirlenip indi. Ücret yok.', 'warn'); this.addRep('legal', -1); this.timer(0); j.stage = 'car'; j.mkCar = false; }
        return;
      }
      j.outT = 0;
      const d = this.dist(v.pos, j.dest.x, j.dest.z);
      this.objective(`Taksi · Müşteriyi bırak: ${j.destName} <small>${Math.round(d)} m · taksimetre ${formatMoney(j.fare * this.mult('legal'))}</small>`);
      if (d < 9 && Math.abs(v.fs) < 4) {
        const tip = j.left > 0 ? Math.round(j.fare * 0.25 + j.left * 3) : 0;
        const dmg = 1 - v.hp / v.def.hp;
        const fare = j.fare * (j.left > 0 ? 1 : 0.7) * (1 - Math.min(0.5, dmg * 0.6));
        this.pay(fare + tip, 'legal', 3, tip ? `Taksi ücreti + bahşiş ${formatMoney(tip)}` : 'Taksi ücreti (geç kaldın)');
        const n = g.npcs.add('civilian', v.pos.x - v.fwd.z * 2, v.pos.z + v.fwd.x * 2, null, {});
        g.ui.bark(n, j.left > 0 ? 'Eline sağlık usta!' : 'Bir daha seninle binmem!');
        this.timer(0);
        j.stage = 'seek'; j.pax = null;
      }
    }
  }

  // ======================= KURYE =======================
  start_courier(j) { j.stage = 'pickup'; this.newPackage(j); }
  newPackage(j) {
    const pp = this.playerPos();
    const shop = this.nearShop(pp.x, pp.z, 80, 450);
    if (!shop) return this.fail('Bugün paket yok');
    j.shop = shop; j.stage = 'pickup';
    const f = this.front(shop);
    this.setMarkers([{ x: f.x, z: f.z, color: COL.pickup, r: 2.5 }]);
    this.gpsTo(f.x, f.z);
    this.timer(0);
  }
  update_courier(j, dt) {
    const g = this.game, pp = this.playerPos();
    const near = g.player.vehicle ? 7 : 3;
    if (j.stage === 'pickup') {
      const f = this.front(j.shop);
      const d = this.dist(pp, f.x, f.z);
      this.objective(`Kurye · Paketi al: ${j.shop.name || 'Dükkân'} <small>${Math.round(d)} m</small>`);
      if (d < near) {
        const dst = this.spot(pp.x, pp.z, 220, 750);
        const dd = Math.hypot(dst.x - pp.x, dst.z - pp.z);
        j.dest = dst; j.pay = 120 + dd * 0.7; j.left = dd / 10 + 30; j.stage = 'deliver';
        j.destName = districtAt(dst.x, dst.z).name;
        this.setMarkers([{ x: dst.x, z: dst.z, color: COL.drop, r: 2.5 }]);
        this.gpsTo(dst.x, dst.z);
        g.audio.click();
        g.ui.notify(`Paket alındı · ${j.destName} adresine ${Math.round(j.left)} sn içinde teslim et`, 'info');
      }
      return;
    }
    j.left -= dt;
    this.timer(Math.max(0, j.left));
    const d = this.dist(pp, j.dest.x, j.dest.z);
    this.objective(`Kurye · Paketi teslim et: ${j.destName} <small>${Math.round(d)} m</small>`);
    if (j.left <= 0) { g.ui.notify('Süre doldu, paket iade edildi.', 'warn'); this.addRep('legal', -1); this.newPackage(j); return; }
    if (d < near) { this.pay(j.pay + j.left * 6, 'legal', 3, `Teslimat (${Math.round(j.left)} sn erken)`); this.newPackage(j); }
  }

  // ======================= OTOBÜS =======================
  start_bus(j) {
    const p = this.game.player;
    if (p.vehicle && p.vehicle.type === 'bus') j.car = p.vehicle;
    else { j.car = this.spawnCar('bus', p.pos.x, p.pos.z, null, 16); j.tempCar = j.car; }
    j.car.mission = j.car.mission || 'job';
    j.cars.push(j.car);
    j.stage = 'car';
  }
  newRoute(j) {
    const v = j.car;
    j.stops = [];
    let x = v.pos.x, z = v.pos.z;
    for (let i = 0; i < 5; i++) { const s = this.spot(x, z, 140, 280); j.stops.push(s); x = s.x; z = s.z; }
    j.idx = 0; j.dwell = 0;
    j.line = 'Hat ' + (20 + Math.floor(Math.random() * 80)) + ['A', 'B', 'T', 'E'][Math.floor(Math.random() * 4)];
    this.showStop(j);
  }
  showStop(j) {
    const s = j.stops[j.idx];
    this.setMarkers([{ x: s.x, z: s.z, color: COL.legal, r: 5 }]);
    this.gpsTo(s.x, s.z);
  }
  update_bus(j, dt) {
    const p = this.game.player, v = j.car;
    if (!v || v.destroyed) return this.fail('Otobüs kullanılamaz halde');
    const inCar = p.vehicle === v;
    if (!inCar) {
      if (j.stage !== 'car') { j.stage = 'car'; j.mk = false; }
      if (!j.mk) { j.mk = true; this.setMarkers([{ vehicle: v, color: COL.legal }]); this.gpsTo(v.pos.x, v.pos.z); }
      this.objective('Otobüs · Otobüse bin');
      return;
    }
    if (j.stage === 'car') { j.stage = 'route'; j.mk = false; if (!j.stops) this.newRoute(j); else this.showStop(j); }
    const s = j.stops[j.idx];
    const d = this.dist(v.pos, s.x, s.z);
    if (d < 10 && Math.abs(v.fs) < 2) {
      j.dwell += dt;
      this.objective(`Otobüs · ${j.line} · Yolcular iniyor/biniyor... <small>${Math.round(j.dwell / 2 * 100)}%</small>`);
      if (j.dwell >= 2) {
        const pax = 2 + Math.floor(Math.random() * 9);
        this.pay(pax * 22, 'legal', 1, `Durak ${j.idx + 1}/5 · ${pax} yolcu`);
        j.idx++; j.dwell = 0;
        if (j.idx >= j.stops.length) { this.pay(450, 'legal', 6, `${j.line} tamamlandı · prim`); this.newRoute(j); } else this.showStop(j);
      }
    } else {
      j.dwell = 0;
      this.objective(`Otobüs · ${j.line} · Durak ${j.idx + 1}/5 <small>${Math.round(d)} m · durakta tam dur</small>`);
    }
  }

  // ======================= TAMİRCİ =======================
  start_mechanic(j) { j.stage = 'goto'; this.newBreakdown(j); }
  newBreakdown(j) {
    const g = this.game, pp = this.playerPos();
    for (const it of j.interacts) { const i = g.worldInteract.indexOf(it); if (i >= 0) g.worldInteract.splice(i, 1); }
    j.interacts = [];
    const s = this.spot(pp.x, pp.z, 90, 320);
    const type = ['kartal', 'kartal', 'sedan', 'dolmus', 'suv'][Math.floor(Math.random() * 5)];
    const v = this.spawnCar(type, s.x, s.z, null, 12);
    v.parked = true; v.mission = 'job'; v.hp = v.def.hp * 0.25; v.jobBroken = true;
    j.car = v; j.cars.push(v); j.stage = 'goto';
    const owner = g.npcs.add('civilian', v.pos.x - v.fwd.z * 2.4, v.pos.z + v.fwd.x * 2.4, null, { state: 'guard', static: true, home: new THREE.Vector3(v.pos.x - v.fwd.z * 2.4, 0, v.pos.z + v.fwd.x * 2.4), mission: 'job' });
    owner.jobTemp = true; j.owner = owner; j.npcs.push(owner);
    const it = {
      x: v.pos.x, z: v.pos.z, r: 3.4, label: 'Arızalı aracı tamir et', action: () => {
        if (this.hold) return;
        this.startHold({
          label: 'Tamir ediliyor', dur: 4.5, x: v.pos.x, z: v.pos.z, r: 4, job: true, cancelText: 'Tamiri yarıda bıraktın',
          tick: () => { if (Math.random() < 0.08) g.audio.tone({ freq: 300 + Math.random() * 500, dur: 0.05, type: 'square', gain: 0.08 }); },
          done: () => {
            v.hp = v.def.hp; v.burnT = 0; v.jobBroken = false;
            const i = g.worldInteract.indexOf(it); if (i >= 0) g.worldInteract.splice(i, 1);
            this.pay(320 + Math.random() * 260, 'legal', 4, 'Yol yardım');
            if (j.owner && !j.owner.dead) g.ui.bark(j.owner, 'Allah razı olsun usta!');
            v.mission = null; v.parked = true;
            j.stage = 'next'; j.nextT = 2;
          },
        });
      },
    };
    g.worldInteract.push(it); j.interacts.push(it);
    this.setMarkers([{ vehicle: v, color: COL.legal }]);
    this.gpsTo(v.pos.x, v.pos.z);
  }
  update_mechanic(j, dt) {
    if (j.stage === 'next') { j.nextT -= dt; this.objective('Tamirci · Sıradaki çağrı bekleniyor...'); if (j.nextT <= 0) { if (j.owner) { j.owner.mission = null; j.owner.static = false; j.owner.state = 'walk'; } this.newBreakdown(j); } return; }
    const v = j.car;
    if (!v || v.destroyed) { this.game.ui.notify('Araç kullanılamaz hale geldi, çağrı iptal.', 'warn'); this.newBreakdown(j); return; }
    const d = this.dist(this.game.player.pos, v.pos.x, v.pos.z);
    this.objective(this.hold ? 'Tamirci · Tamir sürüyor, yanından ayrılma' : `Tamirci · Arızalı araca git ve E ile tamir et <small>${Math.round(d)} m</small>`);
  }

  // ======================= KORUMA =======================
  start_guard(j) {
    const g = this.game, pp = this.playerPos();
    const s = this.spot(pp.x, pp.z, 120, 320);
    const look = randomLook(rng, 'boss'); look.hat = 'none'; look.tespih = false;
    const vip = g.npcs.add('civilian', s.x, s.z, look, { state: 'guard', static: true, home: new THREE.Vector3(s.x, 0, s.z), mission: 'job', name: VIP_NAMES[Math.floor(Math.random() * VIP_NAMES.length)], hp: 260 });
    vip.brave = false;
    j.vip = vip; j.npcs.push(vip); j.stage = 'goto'; j.kills = 0; j.waves = [8, 30, 52]; j.attackers = [];
    this.setMarkers([{ actor: vip, color: COL.legal }]);
    this.gpsTo(s.x, s.z);
    if (!this.hasGun()) g.ui.notify('Uyarı: Korumalık için ateşli silah önerilir.', 'warn');
  }
  update_guard(j, dt) {
    const g = this.game, vip = j.vip;
    if (!vip || vip.dead) return this.fail(`${vip ? vip.name : 'Müşteri'} öldürüldü`);
    const d = this.dist(g.player.pos, vip.pos.x, vip.pos.z);
    if (j.stage === 'goto') {
      this.objective(`Koruma · ${vip.name} ile buluş <small>${Math.round(d)} m</small>`);
      if (d < 12) { j.stage = 'guard'; j.left = 75; g.ui.bark(vip, 'Sonunda geldin! Tehdit aldım, beni koru!'); g.setGps(null); }
      return;
    }
    j.left -= dt;
    this.timer(Math.max(0, j.left));
    const el = 75 - j.left;
    while (j.waves.length && el >= j.waves[0]) {
      j.waves.shift();
      const n = 2 + Math.floor(Math.random() * 2) + this.rank('legal').index;
      const gid = Object.keys(GANGS)[Math.floor(Math.random() * 5)];
      for (let i = 0; i < Math.min(5, n); i++) {
        const a = Math.random() * Math.PI * 2;
        const look = randomLook(rng, 'gang'); look.topColor = GANGS[gid].color;
        const m = g.npcs.add('gang', vip.pos.x + Math.cos(a) * 34, vip.pos.z + Math.sin(a) * 34, look, { gang: gid, hostile: true, state: 'attack', mission: 'job' });
        m.target = g.player; m.hostile = true;
        j.attackers.push(m); j.npcs.push(m);
      }
      g.ui.notify('Saldırganlar geliyor!', 'warn');
      this.setMarkers([{ actor: vip, color: COL.legal }, ...j.attackers.filter((a) => !a.dead).map((a) => ({ actor: a, color: COL.crime }))]);
    }
    const alive = j.attackers.filter((a) => !a.dead).length;
    this.objective(`Koruma · ${vip.name} hayatta kalsın <small>${alive} saldırgan</small>`);
    if (j.left <= 0) {
      const kills = j.attackers.filter((a) => a.dead).length;
      this.pay(2200 + kills * 250, 'legal', 14, `Koruma görevi · ${kills} saldırgan etkisiz`);
      g.ui.bark(vip, 'Hayatımı kurtardın. Kartımı al, yine ararım.');
      this.finish('MÜŞTERİ GÜVENDE', `${vip.name} sağ salim`);
    }
  }

  // ======================= SİPARİŞE ARAÇ =======================
  start_chop(j) {
    const g = this.game;
    const pool = ['kartal', 'kartal', 'sedan', 'sedan', 'suv', 'taksi', 'dolmus', 'gt'].filter((t) => CARS[t]);
    j.want = pool[Math.floor(Math.random() * pool.length)];
    j.reward = Math.max(1500, CARS[j.want].price * 0.22);
    j.left = 360;
    j.shop = g.map.nearestOfType('warehouse', -40, 250) || g.map.nearestOfType('garage', 0, 0);
    // garanti: yakına bir tane park edilmiş hedef
    const pp = this.playerPos();
    const s = this.spot(pp.x, pp.z, 160, 380);
    const v = this.spawnCar(j.want, s.x, s.z, null, 12);
    v.parked = true; j.bait = v; j.cars.push(v);
    j.stage = 'steal';
    this.setMarkers([{ vehicle: v, color: COL.crime }]);
    this.gpsTo(v.pos.x, v.pos.z);
    g.ui.notify(`Sipariş: ${CARS[j.want].name}. Trafikte gördüğünü de alabilirsin.`, 'info');
  }
  update_chop(j, dt) {
    const g = this.game, p = g.player;
    j.left -= dt;
    this.timer(Math.max(0, j.left));
    if (j.left <= 0) return this.fail('Sipariş zaman aşımına uğradı');
    const v = p.vehicle;
    const ok = v && v.type === j.want && !v.owned;
    if (j.stage === 'steal') {
      if (ok) { j.stage = 'deliver'; j.car = v; v.mission = 'job'; const f = this.front(j.shop, 4); this.setMarkers([{ x: f.x, z: f.z, color: COL.crime, r: 5 }]); this.gpsTo(f.x, f.z); return; }
      if (v && v.owned && v.type === j.want) this.objective('Siparişe araç · Kendi aracını parçalatamazsın!');
      else this.objective(`Siparişe araç · Bir ${CARS[j.want].name} çal`);
      return;
    }
    if (!ok) { j.stage = 'steal'; this.setMarkers(j.car && !j.car.destroyed ? [{ vehicle: j.car, color: COL.crime }] : []); return; }
    const f = this.front(j.shop, 4);
    const d = this.dist(v.pos, f.x, f.z);
    this.objective(`Siparişe araç · Atölyeye getir ${g.wanted.level ? '<small>Polisle gelme!</small>' : `<small>${Math.round(d)} m</small>`}`);
    if (d < 8 && Math.abs(v.fs) < 3) {
      if (g.wanted.level > 0) { this.objective('Siparişe araç · Usta kapıyı açmıyor: önce polisi atlat!'); return; }
      const hpk = Math.max(0.3, v.hp / v.def.hp);
      g.vehicles.ejectDriver(v);
      g.vehicles.remove(v);
      if (p.lastVehicle === v) p.lastVehicle = null;
      this.pay(j.reward * hpk, 'crime', 9, `${CARS[j.want].name} teslim · hasar %${Math.round((1 - hpk) * 100)}`);
      this.finish('ARAÇ TESLİM EDİLDİ', 'Parçalar sabaha kadar dağıtılır');
    }
  }

  // ======================= DÜKKÂN SOYGUNU =======================
  start_robbery(j) {
    const pp = this.playerPos();
    j.shop = this.nearShop(pp.x, pp.z, 100, 500, ['food', 'clothes', 'cafe']);
    if (!j.shop) return this.fail('Uygun dükkân yok');
    j.stage = 'goto';
    const f = this.front(j.shop);
    this.setMarkers([{ x: f.x, z: f.z, color: COL.crime, r: 2.5 }]);
    this.gpsTo(f.x, f.z);
    if (!this.hasGun()) this.game.ui.notify('Kasayı soymak için ateşli silah gerekir.', 'warn');
  }
  update_robbery(j) {
    const g = this.game, inside = g.player.inInterior;
    if (j.stage === 'goto') this.objective(inside && inside.building === j.shop ? 'Soygun · Kasaya git ve E ile soy' : `Soygun · İşaretli dükkâna gir: ${j.shop.name || 'Dükkân'}`);
    else if (j.stage === 'escape') {
      this.setMarkers([]);
      this.objective(g.wanted.level ? 'Soygun · Polisi atlat!' : 'Soygun · Temiz kaçış!');
      if (!g.wanted.level && !inside) { this.addRep('crime', 4); this.finish('TEMİZ İŞ', 'Polis izini kaybetti'); }
    }
  }

  // ======================= HARAÇ =======================
  start_protection(j) {
    const g = this.game, pp = this.playerPos();
    const shops = g.map.specials.filter((b) => ['food', 'cafe', 'clothes', 'trade'].includes(b.type)).map((b) => ({ b, d: Math.hypot(b.door.x - pp.x, b.door.z - pp.z) })).sort((a, b) => a.d - b.d).slice(0, 3).map((o) => o.b);
    if (shops.length < 1) return this.fail('Etrafta esnaf yok');
    j.shops = shops; j.idx = 0; j.stage = 'visit'; j.total = 0;
    this.showShop(j);
  }
  showShop(j) { const f = this.front(j.shops[j.idx]); this.setMarkers([{ x: f.x, z: f.z, color: COL.crime, r: 2.5 }]); this.gpsTo(f.x, f.z); }
  collectProtection(ctx, it) {
    const g = this.game, j = this.job;
    if (!j || j.id !== 'protection') return;
    const i = ctx.interact.indexOf(it); if (i >= 0) ctx.interact.splice(i, 1);
    const keeper = g.npcs.list.find((n) => n.kind === 'shopkeeper' && !n.dead);
    if (Math.random() < 0.25) {
      if (keeper) g.ui.bark(keeper, 'Polis! Bu adam haraç istiyor!');
      g.wanted.add(1, true);
      g.ui.notify('Esnaf direndi ve polisi aradı. Bir dahakine silah göster.', 'warn');
      this.addRep('crime', 1);
    } else {
      if (keeper) g.ui.bark(keeper, ['Tamam, tamam... al şunu.', 'Her ay aynı zarf, söz.', 'Dükkânıma dokunmayın yeter!'][Math.floor(Math.random() * 3)]);
      j.total += this.pay(500 + Math.random() * 900, 'crime', 4, 'Haraç');
    }
    j.idx++;
    if (j.idx >= j.shops.length) { this.pay(900, 'crime', 5, 'Tur primi'); this.finish('HARAÇ TOPLANDI', 'Semtte sözün geçiyor'); } else { j.wait = true; }
  }
  update_protection(j) {
    const inside = this.game.player.inInterior;
    if (j.wait && !inside) { j.wait = false; this.showShop(j); }
    const b = j.shops[j.idx];
    if (!b) return;
    this.objective(inside && inside.building === b ? 'Haraç · Dükkân sahibiyle konuş (E)' : `Haraç · Esnaf ${j.idx + 1}/${j.shops.length}: ${b.name || 'Dükkân'}`);
  }

  // ======================= KİRALIK KATİL =======================
  start_hit(j) {
    const g = this.game, pp = this.playerPos();
    const s = this.spot(pp.x, pp.z, 200, 480);
    const boss = this.rank('crime').index >= 4;
    const name = HIT_NAMES[Math.floor(Math.random() * HIT_NAMES.length)];
    const tgt = g.npcs.add(boss ? 'boss' : 'gang', s.x, s.z, null, { state: 'guard', home: new THREE.Vector3(s.x, 0, s.z), mission: 'job', name, hp: boss ? 320 : 180, weapon: 'pistol' });
    j.target = tgt; j.npcs.push(tgt);
    j.guards = [];
    for (let i = 0; i < 2 + (boss ? 1 : 0); i++) {
      const m = g.npcs.add('gang', s.x + (i - 1) * 2, s.z + 1.5, null, { state: 'guard', home: new THREE.Vector3(s.x + (i - 1) * 2, 0, s.z + 1.5), mission: 'job' });
      j.guards.push(m); j.npcs.push(m);
    }
    j.reward = (boss ? 9000 : 4500) + Math.random() * 2000;
    j.left = 300; j.stage = 'hunt';
    this.setMarkers([{ actor: tgt, color: COL.crime }]);
    this.gpsTo(s.x, s.z);
    g.ui.notify(`Kontrat: ${name}. Ödeme ${formatMoney(j.reward * this.mult('crime'))}`, 'info');
  }
  update_hit(j, dt) {
    const g = this.game, t = j.target;
    j.left -= dt;
    this.timer(Math.max(0, j.left));
    if (t.dead) {
      this.pay(j.reward, 'crime', 15, `Kontrat tamamlandı: ${t.name}`);
      this.finish('KONTRAT TAMAM', `${t.name} artık konuşamaz`);
      return;
    }
    if (j.left <= 0) return this.fail('Hedef şehirden kaçtı');
    const d = this.dist(g.player.pos, t.pos.x, t.pos.z);
    if (d < 30 && !t.hostile) { t.hostile = true; for (const m of j.guards) m.hostile = true; }
    this.objective(`Kiralık katil · Hedef: ${t.name} <small>${Math.round(d)} m</small>`);
  }
}

// silah gerektiren işler için yardımcı
export function isFirearm(id) { return WEAPONS[id] && WEAPONS[id].type !== 'melee'; }
