// Yan içerik: rastgele sokak olayları (kapkaç, polis kovalamacası, çete pususu), kontrat (suikast) panosu,
// bölge savaşı dalgaları (ele geçirilen bölgeye karşı saldırı). Ayrıca ortak dünya işaretçisi sınıfı.
import * as THREE from 'three';
import { randomLook } from '../entities/character.js';
import { GANGS } from './economy.js';
import { formatMoney, rng } from '../core/util.js';
import { districtAt } from '../world/map.js';

const markerGeo = new THREE.CylinderGeometry(1.2, 1.2, 2.5, 24, 1, true);
const arrowGeo = new THREE.ConeGeometry(0.5, 1, 4);
arrowGeo.rotateX(Math.PI);

// Dünya işaretçileri (silindir + dönen ok). {x,z | actor | vehicle, color, r, giver}
export class MarkerSet {
  constructor(game, parent) {
    this.g = game;
    this.list = [];
    this.meshes = [];
    this.group = new THREE.Group();
    parent.add(this.group);
    this.version = 0;
  }
  set(list) {
    this.list = list;
    this.version++;
    for (const m of this.meshes) m.parent && m.parent.remove(m);
    this.meshes = list.map((mk) => {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: mk.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      if (!mk.actor && !mk.vehicle) { const c = new THREE.Mesh(markerGeo, mat); c.position.y = 1.25; c.scale.setScalar((mk.r || 3) / 2.4); g.add(c); }
      const a = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: mk.color }));
      a.position.y = 4; g.add(a);
      g.userData.arrow = a;
      this.group.add(g);
      return g;
    });
  }
  update() {
    const g = this.g;
    const t = performance.now() * 0.001;
    this.group.visible = !g.player.inInterior;
    for (let i = 0; i < this.list.length; i++) {
      const mk = this.list[i], m = this.meshes[i];
      if (!m) continue;
      let x = mk.x, z = mk.z, y = mk.y || 0;
      if (mk.actor) { x = mk.actor.pos.x; z = mk.actor.pos.z; y = mk.actor.pos.y + 0.5; m.visible = !mk.actor.dead && !mk.actor.vehicle; }
      if (mk.vehicle) { x = mk.vehicle.pos.x; z = mk.vehicle.pos.z; y = mk.vehicle.def.hei; m.visible = !mk.vehicle.destroyed && g.player.vehicle !== mk.vehicle; }
      m.position.set(x, y, z);
      m.userData.arrow.position.y = 3.5 + Math.sin(t * 3) * 0.3;
      m.userData.arrow.rotation.y = t * 2;
    }
  }
}

// kapkaç çantası (prosedürel deri el çantası)
let BAG_GEO = null;
function bagMesh() {
  if (!BAG_GEO) {
    BAG_GEO = {
      body: new THREE.BoxGeometry(0.26, 0.19, 0.09),
      flap: new THREE.BoxGeometry(0.265, 0.07, 0.095),
      handle: new THREE.TorusGeometry(0.075, 0.011, 5, 14, Math.PI),
      clasp: new THREE.BoxGeometry(0.03, 0.025, 0.01),
    };
    for (const k of Object.keys(BAG_GEO)) BAG_GEO[k].userData.shared = true;
  }
  const g = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: [0x5a2014, 0x1a1a1a, 0x8a5a2a, 0x7a1a3a][Math.floor(Math.random() * 4)], roughness: 0.55 });
  const body = new THREE.Mesh(BAG_GEO.body, leather); body.position.y = -0.17; g.add(body);
  const flap = new THREE.Mesh(BAG_GEO.flap, leather); flap.position.y = -0.1; g.add(flap);
  const h = new THREE.Mesh(BAG_GEO.handle, leather); h.position.y = -0.075; g.add(h);
  const c = new THREE.Mesh(BAG_GEO.clasp, new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 })); c.position.set(0, -0.12, 0.05); g.add(c);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function holdBag(actor, bag) {
  bag.parent && bag.parent.remove(bag);
  const arm = actor.model.arms[0]; // sol el (sağ elde silah olabilir)
  bag.position.set(0, 0.02, 0); bag.rotation.set(0, 0, 0); bag.scale.setScalar(1 / (actor.model.rig ? actor.model.rig.height : 1));
  arm.socket.add(bag);
}

const CONTRACT_NAMES = ['Kasap Necmi', 'Tefeci Yaşar', 'Sarı Haydar', 'Kumarbaz Orhan', 'Şeytan Tahsin', 'Kel Vedat', 'Pala Ercan', 'Dişsiz Remzi', 'Tilki Suat', 'Çakal Fikret'];
const CONTRACT_WHY = ['Mahalle esnafını tefecilikle soyuyor.', 'Ailemizin kamyonlarını ihbar etti.', 'Okul önünde çocukları tehdit etmiş.', 'Bizim kahvehaneyi kundaklattı.', 'Rakiplere bilgi satıyor.', 'Dul kadınların evlerini zorla elinden almış.'];
const COND = [
  { id: 'none', label: '', bonus: 0 },
  { id: 'melee', label: 'Sadece yakın dövüş silahıyla', bonus: 0.6 },
  { id: 'nowanted', label: 'Aranma yıldızı almadan', bonus: 0.4 },
  { id: 'fast', label: '3 dakika içinde', bonus: 0.3 },
];

export class SideContent {
  constructor(M) {
    this.M = M;
    this.g = M.g;
    this.event = null;
    this.eventT = 70;
    this.markers = new MarkerSet(M.g, M.g.scene);
    this.contract = null;
    this.war = null;
    this.warT = 240;
  }
  get busy() { return !!(this.event || this.contract || this.war); }
  setMarkers(l) { this.markers.set(l); this.M.markersDirty = true; }

  // ---------------- yardımcılar ----------------
  gangLook(gang) { const l = randomLook(rng, 'gang'); if (GANGS[gang]) l.topColor = GANGS[gang].color; return l; }
  spot(min, max) { const p = this.g.player.pos; return this.g.npcs.sidewalkSpot(p.x, p.z, min, max); }
  reward(money, respect, text) {
    const s = this.g.state;
    s.money += money; s.respect += respect;
    this.g.audio.cash && this.g.audio.cash();
    this.g.ui.notify(`${text} +${formatMoney(money)} · Saygınlık +${respect}`, 'money');
  }
  endEvent(ok, msg) {
    const ev = this.event;
    if (!ev) return;
    for (const n of ev.npcs || []) n.mission = false;
    for (const v of ev.cars || []) v.mission = false;
    if (msg) this.g.ui.notify(msg, ok ? 'good' : 'warn');
    this.event = null;
    this.eventT = 90 + Math.random() * 90;
    this.setMarkers([]);
  }

  // ---------------- rastgele sokak olayları ----------------
  startEvent(type) {
    const g = this.g;
    const types = ['mugging', 'chase', 'ambush', 'footchase'];
    type = type || types[Math.floor(Math.random() * types.length)];
    if (type === 'ambush') {
      const d = districtAt(g.player.pos.x, g.player.pos.z);
      if (!GANGS[d.gang] || g.state.territories[d.gang]) type = 'mugging';
    }
    const s = this.spot(45, 85);
    if (!s) return false;
    const ev = { type, npcs: [], cars: [], t: 0 };
    if (type === 'mugging') {
      // Kapkaç: hırsız yürüyen bir kadının arkasından yaklaşır, çantayı kapıp koşar.
      const vl = randomLook(rng, 'civilian'); vl.gender = 'f'; vl.hair = Math.random() < 0.5 ? 'uzun' : 'topuz'; vl.beard = 'none';
      const victim = g.npcs.add('civilian', s.x, s.z, vl, { mission: true, state: 'walk', name: 'Nermin Hanım' });
      const tl = this.gangLook('none'); tl.top = 'hoodie'; tl.topColor = '#2a2a2a'; tl.hat = 'none';
      const thief = g.npcs.add('gang', s.x - 7, s.z - 5, tl, { mission: true, weapon: 'knife', state: 'move', name: 'Kapkaççı' });
      thief.maxHp = thief.hp = 70; thief.brave = false; thief.scriptKill = true; thief.static = false;
      thief.setWeapon('fists');
      thief.path = [{ x: victim.pos.x, z: victim.pos.z, r: 1.2 }]; thief.moveSpeed = 2.6; thief.afterMove = 'idle';
      ev.bag = bagMesh(); holdBag(victim, ev.bag);
      ev.cash = 300 + Math.floor(Math.random() * 1200);
      ev.victim = victim; ev.thief = thief; ev.npcs.push(victim, thief); ev.phase = 'stalk';
      this.setMarkers([{ actor: thief, color: 0xff3030, blink: true }]);
      g.ui.notify('Sokak olayı: Biri kadının peşine takıldı... Kapkaççıya dikkat!', 'warn');
    } else if (type === 'footchase') {
      const fug = g.npcs.add('civilian', s.x, s.z, null, { mission: true, name: 'Şüpheli', state: 'flee' });
      fug.fleeFrom = new THREE.Vector3(s.x - 5, 0, s.z - 5); fug.fleeT = 60; fug.brave = false;
      const cop = g.npcs.add('police', s.x - 6, s.z - 4, null, { mission: true });
      cop.state = 'arrest'; cop.target = fug;
      ev.fug = fug; ev.cop = cop; ev.npcs.push(fug, cop);
      this.setMarkers([{ actor: fug, color: 0xffaa30 }]);
      g.ui.notify('Sokak olayı: Polis bir şüpheliyi kovalıyor. İstersen yardım et ya da uzak dur.', 'info');
    } else if (type === 'chase') {
      const fv = g.vehicles.spawnTraffic(g.player.pos.x, g.player.pos.z, 'sedan');
      if (!fv) return false;
      fv.mission = true; fv.ai.cruise = 26; fv.ai.panic = 999;
      const pv = g.vehicles.add('police', fv.pos.x - fv.fwd.x * 14, fv.pos.z - fv.fwd.z * 14, fv.heading);
      pv.mission = true; pv.sirenOn = true; pv.police = true;
      pv.ai = { mode: 'direct', target: fv.pos, cruise: 30 };
      ev.fv = fv; ev.pv = pv; ev.cars.push(fv, pv);
      this.setMarkers([{ vehicle: fv, color: 0xffaa30 }]);
      g.ui.notify('Sokak olayı: Polis kaçak bir aracı kovalıyor! Aracı durdurursan ödül var.', 'info');
    } else if (type === 'ambush') {
      const d = districtAt(g.player.pos.x, g.player.pos.z);
      const gang = d.gang;
      const rs = g.map.randomEdgeNear(g.player.pos.x, g.player.pos.z, 50, 90);
      if (!rs) return false;
      const v = g.vehicles.add('suv', rs.x, rs.z, Math.atan2(g.player.pos.x - rs.x, g.player.pos.z - rs.z), '#1a1a1a');
      v.mission = true; v.ai = { mode: 'direct', target: g.player.pos, cruise: 18 };
      ev.car = v; ev.cars.push(v); ev.gang = gang;
      ev.crew = [];
      for (let i = 0; i < 3; i++) { const n = g.npcs.add('gang', v.pos.x, v.pos.z, this.gangLook(gang), { gang, mission: true, hostile: true, weapon: i ? 'uzi' : 'pistol' }); n.vehicle = v; n.model.root.visible = false; ev.crew.push(n); ev.npcs.push(n); }
      this.setMarkers([{ vehicle: v, color: 0xff3030 }]);
      g.ui.notify(`${GANGS[gang].name} pusu kurdu! Siyah araca dikkat!`, 'warn');
    }
    this.event = ev;
    return true;
  }

  updateEvent(dt) {
    const g = this.g, ev = this.event, p = g.player;
    ev.t += dt;
    if (ev.type === 'mugging') { this.updatePurse(dt, ev); return; } else if (ev.type === 'footchase') {
      const { fug, cop } = ev;
      if (fug.dead) { if (fug.lastAttacker && fug.lastAttacker.isPlayer) g.ui.notify('Şüpheliyi vurdun... Polis bundan hoşlanmadı.', 'warn'); this.endEvent(true); return; }
      if (!cop.dead && Math.hypot(cop.pos.x - fug.pos.x, cop.pos.z - fug.pos.z) < 1.8) { g.ui.bark(cop, 'Yakalandın! Kelepçeleri tak!'); fug.state = 'surrender'; ev.caught = (ev.caught || 0) + dt; if (ev.caught > 2) { g.npcs.remove(fug); this.endEvent(true, 'Polis şüpheliyi yakaladı.'); } return; }
      if (Math.hypot(p.pos.x - fug.pos.x, p.pos.z - fug.pos.z) < 1.8 && !p.vehicle) { this.reward(600, 5, 'Şüpheliyi polise teslim ettin.'); fug.state = 'surrender'; this.endEvent(true); return; }
      fug.fleeT = 30; if (cop.dead || ev.t > 80) this.endEvent(false, 'Şüpheli kayıplara karıştı.');
    } else if (ev.type === 'chase') {
      const { fv, pv } = ev;
      if (pv.ai && pv.ai.mode === 'direct') pv.ai.target = fv.pos;
      if (fv.destroyed || fv.hp < fv.def.hp * 0.3 || (fv.speed < 1 && ev.t > 8 && Math.hypot(fv.pos.x - p.pos.x, fv.pos.z - p.pos.z) < 20)) { this.reward(1500, 10, 'Kaçak aracı durdurdun! Emniyetten teşekkür...'); if (fv.ai) fv.ai = { empty: true }; this.endEvent(true); return; }
      if (Math.hypot(fv.pos.x - p.pos.x, fv.pos.z - p.pos.z) > 280 || ev.t > 120) this.endEvent(false, 'Kovalamaca gözden kayboldu.');
    } else if (ev.type === 'ambush') {
      const v = ev.car;
      if (ev.crew.some((n) => n.vehicle)) {
        const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
        if (v.destroyed) for (const n of ev.crew) { n.vehicle = null; n.model.root.visible = true; n.pos.copy(v.pos); n.takeDamage(999, p, 'explosion'); }
        else if (d < 16 || ev.t > 30) {
          v.ai = { empty: true };
          const f = v.fwd;
          ev.crew.forEach((n, i) => { n.vehicle = null; n.model.root.visible = true; n.pos.set(v.pos.x + -f.z * (i % 2 ? 1.6 : -1.6), 0, v.pos.z + f.x * (i % 2 ? 1.6 : -1.6) - f.z * (i - 1)); n.engage(p, 0.8); });
          g.ui.bark(ev.crew[0], 'Selamın var mı lan? Vurun!');
          this.setMarkers(ev.crew.map((n) => ({ actor: n, color: 0xff3030 })));
        }
      } else if (ev.crew.every((n) => n.dead)) { this.reward(1200, 15, 'Pusuyu püskürttün.'); this.endEvent(true); }
      if (ev.t > 150) this.endEvent(false);
    }
  }

  // ---------------- kapkaç ----------------
  snatch(ev) {
    const g = this.g, { victim, thief } = ev;
    ev.phase = 'run'; ev.runT = 0;
    holdBag(thief, ev.bag);
    g.ui.bark(victim, 'Hırsız var! Çantam! Tutun şunu!');
    g.audio.scream && g.audio.scream(victim.pos.x, victim.pos.z);
    victim.state = 'cower'; victim.fleeT = 3; victim.home = new THREE.Vector3(victim.pos.x, 0, victim.pos.z);
    thief.state = 'flee'; thief.fleeFrom = g.player.pos.clone(); thief.fleeT = 60; thief.reactT = 0;
    g.ui.bark(thief, 'Çekil yolumdan!');
    g.ui.notify('KAPKAÇ! Hırsızı kovala: yakala (koşarak üstüne atla), döv ya da vur.', 'warn');
    for (const o of g.npcs.list) if (o.faction === 'civilian' && o !== victim && !o.dead && Math.hypot(o.pos.x - victim.pos.x, o.pos.z - victim.pos.z) < 12) o.hearThreat(thief, 8);
  }
  updatePurse(dt, ev) {
    const g = this.g, p = g.player, { victim, thief } = ev;
    if (ev.phase === 'stalk') {
      // hırsız kadını izler; yakalayınca çantayı kapar
      if (thief.state === 'move' && thief.path[0]) { thief.path[0].x = victim.pos.x; thief.path[0].z = victim.pos.z; }
      if (Math.hypot(thief.pos.x - victim.pos.x, thief.pos.z - victim.pos.z) < 1.4 || ev.t > 14 || thief.hp < thief.maxHp) this.snatch(ev);
      return;
    }
    if (thief.dead) {
      // çanta yere düşer: alıp sahibine götürebilirsin
      const bag = ev.bag; bag.parent && bag.parent.remove(bag);
      bag.scale.setScalar(1); bag.position.set(thief.pos.x + 0.4, 0.2, thief.pos.z); bag.rotation.set(Math.PI / 2, 0, Math.random() * 3);
      g.scene.add(bag);
      this.lostBag = { mesh: bag, x: bag.position.x, z: bag.position.z, victim, cash: ev.cash, t: 0 };
      g.ui.notify('Kapkaççı öldü. Çanta yerde: al (E) ve sahibine götür — ya da kendine sakla.', 'info');
      this.endEvent(true);
      this.purseMarkers();
      return;
    }
    const pd = Math.hypot(p.pos.x - thief.pos.x, p.pos.z - thief.pos.z);
    if (ev.phase === 'run') {
      ev.runT += dt;
      if (thief.state === 'flee') { thief.fleeFrom = p.pos.clone(); thief.fleeT = 60; }
      // yakalama: koşarak üstüne atla ya da dövülünce teslim olur
      const tackle = pd < 1.3 && !p.vehicle && p.speed > 4.5;
      if (tackle || thief.hp < thief.maxHp * 0.6) {
        if (tackle) { thief.takeDamage(12, p, 'melee'); g.cameraShake(0.25); g.audio.punch && g.audio.punch(thief.pos.x, thief.pos.z, 1); }
        if (!thief.dead) {
          ev.phase = 'caught'; thief.state = 'surrender'; thief.target = null; thief.knock = null;
          g.ui.bark(thief, 'Tamam abi, tamam! Al çantayı, vurma!');
          g.ui.notify('Kapkaççı yakalandı. Yanına git (E): polise teslim et, çantayı geri al ya da...', 'info');
          this.setMarkers([{ actor: thief, color: 0xffaa30 }]);
        }
        return;
      }
      if (pd > 140 || ev.runT > 100) { const b = ev.bag; b.parent && b.parent.remove(b); this.endEvent(false, 'Kapkaççı çantayla birlikte kayboldu.'); }
    } else if (ev.phase === 'caught') {
      if (pd > 60) { thief.state = 'flee'; ev.phase = 'run'; ev.runT = 60; g.ui.notify('Hırsızı bırakıp gittin, kaçtı!', 'warn'); }
    } else if (ev.phase === 'cop') {
      const cop = ev.cop;
      if (!cop || cop.dead) { this.endEvent(false); return; }
      if (cop.state === 'move' && cop.path[0]) { cop.path[0].x = thief.pos.x; cop.path[0].z = thief.pos.z; }
      if (Math.hypot(cop.pos.x - thief.pos.x, cop.pos.z - thief.pos.z) < 1.8) {
        ev.copT = (ev.copT || 0) + dt;
        cop.state = 'idle'; cop.faceYaw = Math.atan2(thief.pos.x - cop.pos.x, thief.pos.z - cop.pos.z);
        if (ev.copT > 0.1 && !ev.cuffed) { ev.cuffed = true; g.ui.bark(cop, 'Kelepçeleri tak! Sağ olun beyefendi, gerisi bizde.'); }
        if (ev.copT > 3) {
          g.npcs.remove(thief);
          cop.state = 'walk'; cop.path = []; cop.mission = false;
          const b = ev.bag; b.parent && b.parent.remove(b);
          if (!victim.dead) { g.ui.bark(victim, 'Çantam! Allah razı olsun evladım!'); victim.state = 'walk'; victim.path = []; }
          this.reward(1500, 8, 'Kapkaççıyı polise teslim ettin.');
          g.state.legalRep = (g.state.legalRep || 0) + 6;
          this.endEvent(true);
        }
      }
    }
  }
  purseOptions(ev) {
    const g = this.g, { victim, thief } = ev, D = this.M.dialogue;
    D.play([
      { who: 'Kapkaççı', text: 'Abi kurban olayım... Üç gündür aç geziyorum. Çanta burada, al!', choice: [
        { label: 'Polise teslim et', value: 'cop', hint: 'Yasal itibar + polis ödülü. Çanta sahibine döner.' },
        { label: 'Çantayı al, sahibine kendin götür', value: 'return', hint: 'Kadın sana bahşiş verir. Hırsız kaçar.' },
        { label: 'Çanta artık benim', value: 'keep', hint: `İçindeki parayı al (yeraltı itibarı).` },
        { label: 'Bir daha görmeyeyim seni (dövüp sal)', value: 'scare', hint: 'Mahallede sözün geçer.' },
      ], key: 'k' },
    ], (r) => {
      const v = r.k || 'scare';
      const bag = ev.bag;
      if (v === 'cop') {
        const sp = g.npcs.sidewalkSpot(thief.pos.x, thief.pos.z, 18, 35) || { x: thief.pos.x + 20, z: thief.pos.z };
        const cop = g.npcs.add('police', sp.x, sp.z, null, { mission: true, state: 'move' });
        cop.path = [{ x: thief.pos.x, z: thief.pos.z, r: 1.4 }]; cop.moveSpeed = 4.4; cop.afterMove = 'idle';
        ev.cop = cop; ev.npcs.push(cop); ev.phase = 'cop';
        g.ui.notify('155 arandı. Devriye geliyor; hırsızı tut.', 'info');
        this.setMarkers([{ actor: thief, color: 0x5a8aff }]);
      } else {
        thief.state = 'flee'; thief.fleeFrom = g.player.pos.clone(); thief.fleeT = 20; thief.mission = false;
        if (v === 'return') { bag.parent && bag.parent.remove(bag); this.bagCarry = { victim, cash: ev.cash, bag }; holdBag(g.player, bag); this.endEvent(true, 'Çanta sende. Sahibine götür.'); this.purseMarkers(); }
        else if (v === 'keep') { bag.parent && bag.parent.remove(bag); g.state.money += ev.cash; g.state.crimeRep = (g.state.crimeRep || 0) + 5; g.audio.cash(); g.ui.notify(`Çantadan ${formatMoney(ev.cash)} çıktı. Kadın arkandan beddua ediyor.`, 'money'); if (!victim.dead) { g.ui.bark(victim, 'Sen de mi?! Allah belanı versin!'); victim.state = 'walk'; victim.path = []; } this.endEvent(true); }
        else { bag.parent && bag.parent.remove(bag); g.state.respect += 3; g.ui.bark(thief, 'Tamam abi, bir daha bu mahalleye adım atmam!'); if (!victim.dead) { g.ui.bark(victim, 'Çantam geri geldi! Sağ ol evladım!'); victim.state = 'walk'; victim.path = []; } this.reward(300, 4, 'Hırsıza gözdağı verdin.'); this.endEvent(true); }
      }
    });
  }
  purseMarkers() {
    const v = (this.bagCarry || this.lostBag || {}).victim;
    const list = [];
    if (this.lostBag) list.push({ x: this.lostBag.x, z: this.lostBag.z, color: 0xffcc40, icon: 'c_bag', label: 'Çanta' });
    if (v && !v.dead) list.push({ actor: v, color: 0x7cdd6a, label: 'Çantanın sahibi', blink: !!this.bagCarry });
    this.setMarkers(list);
  }
  // kapkaç etkileşimleri (main.findInteraction → social.prompt üzerinden)
  prompt() {
    const g = this.g, p = g.player;
    if (p.vehicle || p.inInterior) return null;
    const ev = this.event;
    if (ev && ev.type === 'mugging' && ev.phase === 'caught' && Math.hypot(ev.thief.pos.x - p.pos.x, ev.thief.pos.z - p.pos.z) < 2.4) return { label: 'Kapkaççıyla ilgilen', action: () => this.purseOptions(ev) };
    const L = this.lostBag;
    if (L && Math.hypot(L.x - p.pos.x, L.z - p.pos.z) < 1.8) return { label: 'Çantayı al', action: () => { this.lostBag = null; this.bagCarry = { victim: L.victim, cash: L.cash, bag: L.mesh }; holdBag(p, L.mesh); g.ui.notify('Çanta sende. Sahibine götür ya da içindekini al (tekrar E).', 'info'); this.purseMarkers(); } };
    const C = this.bagCarry;
    if (C) {
      const v = C.victim;
      if (v && !v.dead && Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) < 2.4) return { label: 'Çantayı sahibine ver', action: () => {
        this.bagCarry = null; holdBag(v, C.bag);
        g.ui.bark(v, 'Çantam! Annemin yadigârı içindeydi... Al evladım, bu senin hakkın.');
        this.reward(600 + Math.floor(C.cash * 0.4), 10, 'Çantayı sahibine verdin.');
        g.state.legalRep = (g.state.legalRep || 0) + 4;
        v.state = 'walk'; v.path = []; v.mission = false;
        setTimeout(() => { C.bag.parent && C.bag.parent.remove(C.bag); }, 20000);
        this.setMarkers([]);
      } };
    }
    return null;
  }
  updateBag(dt) {
    const L = this.lostBag;
    if (L) { L.t += dt; if (L.t > 150 || !L.victim || L.victim.dead) { L.mesh.parent && L.mesh.parent.remove(L.mesh); this.lostBag = null; if (!this.event) this.setMarkers([]); } }
    const C = this.bagCarry;
    if (C && (!C.victim || C.victim.dead || C.victim.removeMe)) {
      // sahibi yok: içindekini al
      C.bag.parent && C.bag.parent.remove(C.bag);
      this.g.state.money += C.cash; this.g.ui.notify(`Çantanın sahibi ortada yok. İçinden ${formatMoney(C.cash)} çıktı.`, 'money');
      this.bagCarry = null; if (!this.event) this.setMarkers([]);
    }
    if (C && C.victim && !C.victim.dead) { C.victim.mission = true; if (C.victim.state === 'walk' && !C.victim.home) { C.victim.state = 'idle'; C.victim.home = C.victim.pos.clone(); } }
  }

  // ---------------- kontrat panosu ----------------
  openBoard() {
    const g = this.g, ui = g.ui, s = g.state;
    if (this.contract) { ui.notify('Elinde zaten bir kontrat var: ' + this.contract.name, 'warn'); return; }
    const day = g.env.day;
    if (!s.contracts || s.contracts.day !== day) {
      s.contracts = { day, done: [], list: [] };
      const r = new (rng.constructor)(day * 977 + 31);
      for (let i = 0; i < 4; i++) {
        const dist = r.pick(['beyoglu', 'besiktas', 'fatih', 'uskudar', 'kadikoy', 'eyup']);
        s.contracts.list.push({ id: i, name: r.pick(CONTRACT_NAMES), why: r.pick(CONTRACT_WHY), district: dist, pay: 3000 + r.int(0, 8) * 1000 + i * 1500, guards: r.int(1, 3) + Math.floor(i / 2), cond: r.pick(COND).id });
      }
    }
    const p = ui.panel('KONTRAT PANOSU', 'Kimsenin bilmediği işler. Kimse sormaz, kimse söylemez.');
    const m = ui.openModal(p);
    p.querySelector('.x').onclick = () => ui.closeModal(m);
    const body = p.querySelector('.panel-body');
    body.classList.add('story-replay');
    for (const c of s.contracts.list) {
      const row = document.createElement('div'); row.className = 'rp';
      const done = s.contracts.done.includes(c.id);
      const cond = COND.find((k) => k.id === c.cond);
      row.innerHTML = `<span><b>${c.name}</b> — ${c.why}<small>${c.district.toUpperCase()} · ${c.guards} koruma${cond.label ? ' · Şart: ' + cond.label + ` (+%${Math.round(cond.bonus * 100)})` : ''}</small></span>`;
      if (done) row.insertAdjacentHTML('beforeend', '<small>TAMAM</small>');
      else row.appendChild(ui.btn(formatMoney(c.pay), () => { ui.closeModal(m); this.startContract(c); }, 'gold'));
      body.appendChild(row);
    }
  }
  startContract(c) {
    const g = this.g;
    const D = { beyoglu: [-300, -120], besiktas: [-400, -650], fatih: [-450, 500], uskudar: [650, -400], kadikoy: [700, 550], eyup: [-930, 0] }[c.district];
    const s = g.map.randomEdgeNear(D[0], D[1], 0, 120);
    if (!s) return;
    const e = s.e, dx = e.b.x - e.a.x, dz = e.b.z - e.a.z, l = Math.hypot(dx, dz) || 1;
    const x = s.x + (-dz / l) * (e.width / 2 + 2), z = s.z + (dx / l) * (e.width / 2 + 2);
    const look = randomLook(rng, 'boss'); look.hat = 'kasket';
    const target = g.npcs.add('boss', x, z, look, { mission: true, name: c.name, state: 'guard', home: new THREE.Vector3(x, 0, z), hp: 220, weapon: 'pistol' });
    target.hostile = false;
    const guards = [];
    for (let i = 0; i < c.guards; i++) { const n = g.npcs.add('gang', x + 2 + i, z + 1.5, this.gangLook('none'), { mission: true, state: 'guard', home: new THREE.Vector3(x + 2 + i, 0, z + 1.5), weapon: i % 2 ? 'uzi' : 'pistol' }); guards.push(n); }
    this.contract = { ...c, target, guards, t: 0, wantedAtStart: g.wanted.level, ok: true };
    this.setMarkers([{ actor: target, color: 0xff3030 }]);
    g.setGps(x, z);
    g.ui.notify(`Kontrat: ${c.name} (${c.district.toUpperCase()}). Hedef haritada işaretlendi.`, 'warn');
  }
  updateContract(dt) {
    const g = this.g, c = this.contract;
    c.t += dt;
    const t = c.target;
    if (Math.hypot(t.pos.x - g.player.pos.x, t.pos.z - g.player.pos.z) < 30) for (const n of c.guards) if (!n.dead && n.state !== 'attack') { n.hostile = true; }
    if (c.cond === 'nowanted' && g.wanted.level > 0) c.ok = false;
    if (c.cond === 'fast' && c.t > 180) c.ok = false;
    if (t.dead) {
      if (c.cond === 'melee' && (!t.lastAttacker || !t.lastAttacker.isPlayer || g.player.wdef.type !== 'melee')) c.ok = false;
      const cond = COND.find((k) => k.id === c.cond);
      const pay = Math.round(c.pay * (1 + (c.ok ? cond.bonus : 0)));
      this.reward(pay, 25, `Kontrat tamam: ${c.name}.${cond.bonus && !c.ok ? ' (Şart tutmadı, bonus yok)' : ''}`);
      g.state.contracts.done.push(c.id);
      // [hikâye] kontratlar Reis'in adamlarınca izlenir: güven kazandırır
      if (this.M.baba && !(this.M.flags && this.M.flags.babaDown)) this.M.baba.adjust(3, 0, 'Kontrat temiz bitti');
      this.endContract();
    } else if (c.t > 600) { g.ui.notify('Kontrat süresi doldu. Hedef şehri terk etti.', 'warn'); this.endContract(); }
  }
  endContract() {
    const c = this.contract;
    if (!c) return;
    c.target.mission = false; for (const n of c.guards) n.mission = false;
    this.contract = null; this.setMarkers([]); this.g.setGps(null);
  }

  // ---------------- bölge savaşı dalgaları ----------------
  startWar(gang) {
    const g = this.g;
    const center = { beyoglu: [-300, -120], besiktas: [-400, -650], fatih: [-450, 500], uskudar: [650, -400], kadikoy: [700, 550], eyup: [-930, 0] }[GANGS[gang].district];
    const node = g.map.nearestNode(center[0], center[1]);
    this.war = { gang, x: node.x + 8, z: node.z + 8, wave: 0, waves: [3, 5, 7], enemies: [], t: 0, gap: 3, hold: 0 };
    this.setMarkers([{ x: this.war.x, z: this.war.z, color: 0xff3030, r: 12 }]);
    g.setGps(this.war.x, this.war.z);
    g.ui.bigMessage('BÖLGE SALDIRI ALTINDA', `${GANGS[gang].name} bölgeni geri almak istiyor! Meydanı savun.`, 'red', 4);
  }
  updateWar(dt) {
    const g = this.g, w = this.war, p = g.player;
    w.t += dt;
    const pd = Math.hypot(p.pos.x - w.x, p.pos.z - w.z);
    if (w.wave === 0 && pd > 70) { if (w.t > 240) { g.state.territories[w.gang] = false; g.ui.bigMessage('BÖLGE KAYBEDİLDİ', `${GANGS[w.gang].name} bölgeyi geri aldı.`, 'red', 4); this.endWar(); } return; }
    if (w.enemies.every((n) => n.dead)) {
      w.gap -= dt;
      if (w.gap > 0) return;
      if (w.wave >= w.waves.length) { this.reward(8000, 120, `${GANGS[w.gang].name} püskürtüldü. Bölge senin!`); g.ui.bigMessage('BÖLGE SAVUNULDU', '', 'gold', 3); this.endWar(); return; }
      const count = w.waves[w.wave++];
      w.enemies = [];
      for (let i = 0; i < count; i++) {
        const s = g.npcs.sidewalkSpot(w.x, w.z, 45, 70);
        if (!s) continue;
        const n = g.npcs.add('gang', s.x, s.z, this.gangLook(w.gang), { gang: w.gang, mission: true, hostile: true, weapon: w.wave >= 3 ? (i % 2 ? 'ak' : 'shotgun') : i % 3 ? 'pistol' : 'uzi' });
        n.engage(p, 1.5);
        w.enemies.push(n);
      }
      if (w.wave === w.waves.length) { const s = g.npcs.sidewalkSpot(w.x, w.z, 50, 70); if (s) { const b = g.npcs.add('boss', s.x, s.z, null, { gang: w.gang, mission: true, hostile: true, weapon: 'ak', name: GANGS[w.gang].name + ' Komutanı', hp: 350 }); b.engage(p, 1.2); w.enemies.push(b); } }
      g.ui.notify(`Dalga ${w.wave}/${w.waves.length}: ${w.enemies.length} düşman`, 'warn');
      this.setMarkers([{ x: w.x, z: w.z, color: 0xff3030, r: 12 }, ...w.enemies.map((n) => ({ actor: n, color: 0xff3030 }))]);
      w.gap = 6;
    }
    if (pd > 120) { w.hold += dt; if (w.hold > 25) { g.state.territories[w.gang] = false; g.ui.bigMessage('BÖLGE KAYBEDİLDİ', 'Meydanı terk ettin.', 'red', 4); this.endWar(); } } else w.hold = 0;
  }
  endWar() {
    const w = this.war;
    if (!w) return;
    for (const n of w.enemies) n.mission = false;
    this.war = null; this.warT = 400 + Math.random() * 300; this.setMarkers([]); this.g.setGps(null);
  }

  cleanupAll() { if (this.event) this.endEvent(false); this.endContract(); this.endWar(); }

  update(dt) {
    const g = this.g;
    if (g.player.inInterior) return;
    const storyBusy = !!this.M.active;
    if (this.event) this.updateEvent(dt);
    else if (!storyBusy && !this.contract && !this.war && !this.lostBag && !this.bagCarry) {
      this.eventT -= dt;
      if (this.eventT <= 0) { if (!this.startEvent()) this.eventT = 10; }
    }
    if (this.contract) this.updateContract(dt);
    if (this.lostBag || this.bagCarry) this.updateBag(dt);
    if (this.war) this.updateWar(dt);
    else if (!storyBusy && !this.event && !this.contract) {
      this.warT -= dt;
      if (this.warT <= 0) {
        this.warT = 300;
        const owned = Object.keys(GANGS).filter((k) => g.state.territories[k] && !(g.state.storyFlags && g.state.storyFlags.ally === k));
        if (owned.length && Math.random() < 0.5) this.startWar(owned[Math.floor(Math.random() * owned.length)]);
      }
    }
    this.markers.update();
  }
}
