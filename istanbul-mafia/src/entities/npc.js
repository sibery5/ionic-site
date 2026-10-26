// NPC'ler: siviller, polisler, özel harekât, askerler, çete üyeleri, patronlar, dükkâncılar ve yapay zekâları.
// Savaş YZ'si: tepki gecikmesi, siper arama (bina köşeleri / araçlar), kuşatma, baskılama, mesafe/harekete göre isabet,
// atış slotları (aynı anda oyuncuya isabetli ateş eden NPC sayısı sınırlı). Siviller: günlük rutinler, kaçma/sinme, laf atma.
// Kalabalık LOD: uzak NPC'ler daha seyrek güncellenir, 60 m ötesinde animasyon atlanır.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { randomLook } from './character.js';
import { RNG, angleDiff, clamp, dampAngle, rng } from '../core/util.js';
import { districtAt, isLand } from '../world/map.js';
import { GANGS, rankOf } from '../game/economy.js';
import { WEAPONS } from '../game/weapons.js';
import { audio } from '../core/audio.js';
import { N_FREE, N_LOW, N_BLOCK } from '../world/navgrid.js';
import { actorVsVehicle } from './vehicle_physics.js';

const lookRng = new RNG(777);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const probe = new THREE.Vector3();
const coverBoxes = [];
const coverCand = [];

const CIV_NAMES = ['Ahmet', 'Mehmet', 'Ayşe', 'Fatma', 'Mustafa', 'Zeynep', 'Emre', 'Elif', 'Hasan', 'Hüseyin', 'Selin', 'Burak', 'Deniz', 'Cem', 'Merve', 'Kemal', 'Leyla', 'Okan', 'Canan', 'Yusuf'];

// Zorluk: NPC isabet çarpanı
export const DIFFICULTY = { easy: 0.6, normal: 1, hard: 1.35 };
// Taban isabet olasılığı (yakın mesafe, duran hedef)
const SKILL = { police: 0.15, swat: 0.26, soldier: 0.3, gang: 0.18, boss: 0.26, civilian: 0.12, resident: 0.1, shopkeeper: 0.14 };
// Tepki süresi (hedefi görünce ilk atışa kadar)
const REACT = { police: [0.6, 1.1], swat: [0.35, 0.7], soldier: [0.3, 0.6], gang: [0.5, 1.2], boss: [0.4, 0.8], civilian: [0.8, 1.6] };
// Siper kullanma eğilimi
const COVER_K = { police: 0.55, swat: 0.75, soldier: 0.8, gang: 0.35, boss: 0.3 };

export const BARKS = {
  ambient: ['Bu trafik bitmez ya!', 'Vapuru yine kaçırdım...', 'Martı simidimi kaptı be!', 'Kira yine artmış, bu maaş nasıl yetişsin?', 'Abi saat kaç?', 'Akşama balık mı yapsak?', 'Şu yokuş beni bitirecek.', 'Çay demlenmiştir şimdi.', 'Kardeşim yolu kapatma!', 'Yağmur yağacak, kokusu geliyor.', 'Yine mi zam gelmiş ekmeğe?'],
  chat: ['Duydun mu, Hüsnü\'nün oğlu evleniyormuş.', 'Ben sana demiştim, o iş olmaz!', 'Vallahi billahi doğru söylüyorum.', 'Hadi ya, şaka yapıyorsun!', 'Akşam bize gel, tavla atarız.', 'Bu mahalle eskiden böyle miydi be...'],
  gun: ['Abi silahı indir, korkutuyorsun!', 'Ne o elindeki? Aman!', 'Polis çağırayım mı?', 'Allah\'ım sen koru...'],
  wanted: ['Polis seni arıyor be adam!', 'Uzak dur benden!', 'Sirenleri duyuyor musun?', 'Haberlerde gördüm seni!'],
  suit: ['Hayırlı işler beyefendi.', 'Takım yakışmış abi.', 'Buyrun efendim, yol verelim.'],
  leather: ['Deri ceket, kara gözlük... Mahallenin yeni kabadayısı mı?', 'Kolay gelsin abi.'],
  track: ['Eşofmanla mı çıktın sokağa abi?', 'Sabah koşusu mu abi?'],
  respect: ['Bak bak, Reis\'in adamı bu!', 'Selamün aleyküm abi, bir emrin var mı?', 'Senin sayende mahalle rahatladı.', 'Abi, dükkânın önü sana emanet.'],
  night: ['Gece gece ne işin var burada?', 'Bu saatte sokak tekin değil.'],
  bump: ['Önüne baksana!', 'Hoop, dikkat!', 'Kör müsün kardeşim?'],
  flee: ['İmdat!', 'Kaçın!', 'Vuruyorlar!', 'Polis! Polis!', 'Anneciğim!'],
  cower: ['Ne olur vurma!', 'Benim çoluk çocuğum var!', 'Bir şey görmedim, yemin ederim!'],
  arrest: ['Polis! Kıpırdama!', 'Eller yukarı!', 'Yere yat, hemen!', 'Ellerini göreyim!'],
  cop: ['Ateş serbest!', 'Şüpheli silahlı!', 'Siper alın!', 'Teslim ol, etrafın sarıldı!'],
  backup: ['Merkez, destek istiyorum!', 'Ekip yaralandı, destek gönderin!', 'Ateş altındayız, takviye!'],
  flank: ['Sağdan çeviriyorum!', 'Arkasına dolaşın!', 'Ben soldan giriyorum!'],
  gang: ['Bu bizim mahallemiz!', 'Vurun şunu!', 'Hesabı ödeyeceksin!', 'Kaçamazsın!', 'Arkadan dolaşın!'],
  soldier: ['Temas! Ateş!', 'Hedef görüldü!', 'Mevzi al!', 'Bölgeyi tutun!'],
  ally: ['Arkandayım!', 'Bir tane de benden!', 'Dikkat et, solda!', 'Hallettim onu!'],
  friendly: ['Hey! Bizdeniz, dikkat et!', 'Abi bana sıkma!', 'Sakin ol, benim!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function copLook(r = lookRng) { return randomLook(r, 'police'); }
export function swatLook(r = lookRng) { return Object.assign(randomLook(r, 'police'), { top: 'jacket', topColor: '#1a1a1a', pantsColor: '#1a1a1a', hat: 'bere', hatColor: '#111111', glasses: true, shoes: 'boots' }); }
export function soldierLook(r = lookRng) { return Object.assign(randomLook(r, 'gang'), { top: 'jacket', topColor: '#4a5a30', shirtColor: '#3a4626', pants: 'slacks', pantsColor: '#3f4c2a', shoes: 'boots', shoesColor: '#2a2018', hat: 'bere', hatColor: '#3a4a28', chain: false, glasses: false, beard: 'stubble', hair: 'kisa', gender: 'm' }); }

export class NPC extends Actor {
  constructor(game, kind, look, opts = {}) {
    super(game, look || (kind === 'swat' ? swatLook() : kind === 'soldier' ? soldierLook() : randomLook(lookRng, kind === 'gang' ? 'gang' : kind === 'police' ? 'police' : kind === 'boss' ? 'boss' : 'civilian')));
    this.kind = kind;
    this.faction = kind === 'police' || kind === 'swat' ? 'police' : kind === 'gang' || kind === 'boss' ? 'gang' : kind === 'soldier' ? 'military' : 'civilian';
    this.gang = opts.gang || null;
    this.state = opts.state || 'walk';
    this.baseState = opts.baseState || this.state;
    this.target = null;
    this.path = [];
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.walkSpeed = 1.3 + Math.random() * 0.4;
    this.fleeT = 0;
    this.reactT = 0;
    this.thinkT = Math.random() * 0.5;
    this.skill = opts.skill || SKILL[kind] || 0.15;
    this.accuracy = 6; // tryFire saçılmasını daraltır; isabet olasılığı fireAt içinde hesaplanır
    this.name = opts.name || CIV_NAMES[Math.floor(Math.random() * CIV_NAMES.length)];
    this.money = opts.money ?? (kind === 'gang' ? 80 + Math.floor(Math.random() * 400) : kind === 'police' ? 40 : kind === 'soldier' ? 60 : Math.floor(Math.random() * 90));
    this.mission = opts.mission || null;
    this.static = !!opts.static;
    this.home = opts.home ? opts.home.clone() : null;
    this.brave = kind !== 'civilian' || Math.random() < 0.08;
    this.removeT = 25;
    this.hostile = !!opts.hostile;
    this.ally = !!opts.ally;
    this.patrol = opts.patrol || null;
    this.patrolIdx = 0;
    this.waitT = 0;
    this.alertT = 0;
    this.aimT = 0;
    this.shotT = 0;
    this.burst = 0;
    this.suppress = 0;
    this.hurtT = 0;
    this.tac = 'engage';
    this.tacT = 0;
    this.coverPt = null;
    this.flankPt = null;
    this.peekT = 0;
    this.detourT = 0;
    this.barkT = 4 + Math.random() * 10;
    this.lodAcc = 0;
    this.slotted = false;
    this.crouch = false;
    this.persistent = !!opts.persistent;
    if (kind === 'police') { this.maxHp = this.hp = 120; const w = opts.weapon || (Math.random() < 0.85 ? 'pistol' : 'shotgun'); this.giveWeapon(w, 200); this.setWeapon(w); }
    if (kind === 'swat') { this.maxHp = this.hp = 180; this.armor = 100; this.giveWeapon('m4', 400); this.setWeapon('m4'); }
    if (kind === 'soldier') { this.maxHp = this.hp = 160; this.armor = 60; const w = opts.weapon || (Math.random() < 0.7 ? 'm4' : 'ak'); this.giveWeapon(w, 500); this.setWeapon(w); }
    if (kind === 'gang') {
      const w = opts.weapon || (Math.random() < 0.5 ? 'pistol' : Math.random() < 0.5 ? 'uzi' : Math.random() < 0.5 ? 'bat' : 'ak');
      this.giveWeapon(w, 300); this.setWeapon(w);
    }
    if (kind === 'boss') { this.maxHp = this.hp = 450; this.armor = 100; this.giveWeapon(opts.weapon || 'revolver', 500); this.setWeapon(opts.weapon || 'revolver'); }
    if (kind === 'civilian' && this.brave && Math.random() < 0.5) { this.giveWeapon('pistol', 30); }
    if (opts.weapon && kind !== 'gang' && kind !== 'boss' && kind !== 'police' && kind !== 'soldier') { this.giveWeapon(opts.weapon, 300); this.setWeapon(opts.weapon); }
    if (opts.hp) this.maxHp = this.hp = opts.hp;
    if (opts.armor !== undefined) this.armor = opts.armor;
  }

  restState() {
    if (this.baseState === 'patrol' && this.patrol) return 'patrol';
    if (this.baseState === 'follow') return 'follow';
    if (this.home) return 'guard';
    return this.baseState === 'attack' ? 'walk' : this.baseState || 'walk';
  }
  say(list, chance = 1) {
    if (this.barkT > 0 || Math.random() > chance) return;
    this.barkT = 5 + Math.random() * 6;
    this.game.ui.bark(this, typeof list === 'string' ? list : pick(list));
  }

  // Düşmanca davranacak mı?
  hostileTo(a) {
    const g = this.game;
    if (!a || a.dead) return false;
    if (a.isPlayer) {
      if (this.ally) return false;
      if (this.faction === 'police') return g.wanted.level > 0;
      if (this.faction === 'military') return this.hostile || !!(g.military && g.military.alert);
      if (this.faction === 'gang') return this.hostile || g.gangHostile(this.gang);
      return false;
    }
    if (this.ally) return a.hostile || (a.state === 'attack' && a.target && (a.target.isPlayer || a.target.ally)) || (a.faction === 'gang' && !a.ally && g.gangHostile(a.gang));
    if (a.ally) return this.hostile || (this.faction === 'gang' && g.gangHostile(this.gang));
    return false;
  }

  engage(t, delayK = 1) {
    if (this.state !== 'attack' || this.target !== t) {
      const r = REACT[this.kind] || REACT.gang;
      this.alertT = (r[0] + Math.random() * (r[1] - r[0])) * delayK;
      this.aimT = 0;
      this.tac = 'engage'; this.tacT = 0.5 + Math.random();
      this.coverPt = null;
    }
    this.state = 'attack'; this.target = t;
    this.static = false;
  }

  hearThreat(source, d) {
    if (this.dead || (this.static && this.kind === 'shopkeeper')) return;
    if (!source) return;
    const g = this.game;
    if (this.faction === 'police') {
      if (source.isPlayer && g.wanted.level > 0) {
        if (g.wanted.level >= 2 || this.state !== 'arrest') this.engage(source);
        if (d < 18) this.suppress = Math.min(1, this.suppress + 0.25);
      }
      return;
    }
    if (this.faction === 'military') {
      if (source.isPlayer && g.military && g.military.inZone && g.military.inZone(source.pos.x, source.pos.z, 60)) { g.military.raiseAlert('Ateş açıldı!'); this.engage(source, 0.6); }
      else if (source.isPlayer && this.hostileTo(source)) this.engage(source);
      return;
    }
    if (this.faction === 'gang') {
      if (this.ally) {
        if (!source.isPlayer && this.hostileTo(source) && d < 40) this.engage(source);
        return;
      }
      if (source.isPlayer && (this.hostile || g.gangHostile(this.gang) || d < 15)) { this.engage(source); if (d < 18) this.suppress = Math.min(1, this.suppress + 0.2); }
      return;
    }
    if (this.kind === 'resident' || this.kind === 'civilian' || this.kind === 'shopkeeper') {
      if (this.brave && this.weapons.pistol && source.isPlayer && d < 20 && Math.random() < 0.5) { this.engage(source); this.setWeapon('pistol'); return; }
      if (this.state !== 'flee' && this.state !== 'cower') {
        this.reactT = 0.15 + Math.random() * 0.5;
        if (Math.random() < 0.3) audio.scream(this.pos.x, this.pos.z);
        if (Math.random() < 0.25) this.say(BARKS.flee, 1);
      }
      this.sitting = false; this.talking = false;
      this.state = 'flee'; this.fleeFrom = source.pos.clone(); this.fleeT = 3 + Math.random() * 4;
      this.static = false;
      this.path = []; this.cur = null;
    }
  }

  onDamaged(dmg, attacker) {
    this.hurtT = 2.5;
    this.suppress = Math.min(1, this.suppress + 0.5);
    if (!attacker) return;
    const g = this.game;
    if (attacker.isPlayer) {
      if (this.ally) { this.say(BARKS.friendly, 1); return; }
      if (this.faction === 'police') { g.wanted.crime('assault_police'); this.engage(attacker, 0.4); if (this.hp < this.maxHp * 0.6) { this.say(BARKS.backup, 0.5); g.wanted.requestBackup && g.wanted.requestBackup(this.pos); } }
      else if (this.faction === 'military') { if (g.military) g.military.raiseAlert('Askere ateş açıldı!'); g.wanted.crime('assault_police'); this.engage(attacker, 0.3); }
      else if (this.faction === 'gang') {
        g.angerGang(this.gang, this.pos);
        this.engage(attacker, 0.4);
      } else {
        // kurban başına tek saldırı suçu (her mermi ayrı ihbar olmasın)
        if (dmg > 5 && !this.assaulted) { this.assaulted = true; g.wanted.crime('assault', this.pos); }
        this.hearThreat(attacker, 1);
      }
    } else if (attacker !== this) {
      if (this.faction !== 'civilian' && (attacker.faction !== this.faction || (attacker.ally !== this.ally))) { if (!(this.ally && attacker.ally)) this.engage(attacker, 0.4); }
      else if (this.faction === 'civilian') this.hearThreat(attacker, 2);
    }
  }

  onDeath(attacker, kind) {
    const g = this.game;
    this.state = 'dead';
    this.removeT = 30;
    this.crouch = false; this.sitting = false; this.talking = false;
    g.npcs.onNpcDeath(this, attacker, kind);
  }

  // Kaldırım boyunca yürüme: düğüm çevresindeki dört blok köşesi (kadran) üzerinden; yol yalnız yaya geçidinden
  // (iki komşu kadran arası) geçilir, geçiş noktaları `cross` bilgisiyle işaretlenir (ışıkta bekleme).
  planWalk() {
    const map = this.game.map;
    if (!this.cur) {
      const n = map.nearestNode(this.pos.x, this.pos.z);
      if (!n || !n.edges.length) return;
      this.prev = n;
      this.cur = map.other(n.edges[Math.floor(Math.random() * n.edges.length)], n);
    }
    const from = this.prev, to = this.cur;
    const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
    const fx = dx / l, fz = dz / l;
    // sonraki kenar: geri dönmeyi sevme
    const opts = to.edges.map((ed) => map.other(ed, to)).filter((nn) => nn !== from);
    const next = opts.length ? opts[Math.floor(Math.random() * opts.length)] : from;
    const dx2 = next.x - to.x, dz2 = next.z - to.z, l2 = Math.hypot(dx2, dz2) || 1;
    const fx2 = dx2 / l2, fz2 = dz2 / l2;
    const sd = this.side;
    // kadran: (gidiş yönünün tersi + sağ*taraf) bileşen işaretleri; sağ = (-fz, fx)
    const q1x = Math.sign(-fx + -fz * sd) || 1, q1z = Math.sign(-fz + fx * sd) || 1;
    const q3x = Math.sign(fx2 + -fz2 * sd) || 1, q3z = Math.sign(fz2 + fx2 * sd) || 1;
    let hx = 5.5, hz = 5.5; // düğümdeki yolların yarı genişlikleri (x: dikey yollar, z: yatay yollar)
    for (const ed of to.edges) { const o = map.other(ed, to); if (Math.abs(o.x - to.x) > Math.abs(o.z - to.z)) hz = Math.max(hz, ed.width / 2); else hx = Math.max(hx, ed.width / 2); }
    const corner = (qx, qz) => ({ x: to.x + qx * (hx + 1.6), z: to.z + qz * (hz + 1.6) });
    const path = [corner(q1x, q1z)];
    const hasLight = to.edges.length >= 3;
    const step = (ax, az, bx, bz) => {
      const p = corner(bx, bz);
      // x işareti değişti → dikey (z boyunca akan) yolu geçiyor: o yoldaki araç ekseni 0
      if (ax !== bx || az !== bz) p.cross = { node: to, axis: ax !== bx ? 0 : 1, light: hasLight };
      path.push(p);
    };
    if (q1x !== q3x && q1z !== q3z) {
      // iki yol: önce birini sonra diğerini geç
      if (Math.random() < 0.5) { step(q1x, q1z, q3x, q1z); step(q3x, q1z, q3x, q3z); } else { step(q1x, q1z, q1x, q3z); step(q1x, q3z, q3x, q3z); }
    } else if (q1x !== q3x || q1z !== q3z) step(q1x, q1z, q3x, q3z);
    this.path = path;
    this.prev = to; this.cur = next;
  }

  // ---------------- gezinme: ızgara A* + yerel yönlendirme ----------------
  // (tx,tz)'ye git; engel varsa yol bul, duvara sürtme yok, alçak engellerin üstünden atla. Hedefe uzaklık döner.
  navTo(tx, tz, speed, dt, vaultOK = true) {
    const g = this.game, nav = g.physics.nav;
    const px = this.pos.x, pz = this.pos.z;
    const dist = Math.hypot(tx - px, tz - pz);
    if (dist < 0.05) { this.speed = 0; return dist; }
    const N = this.navS || (this.navS = { gx: 1e9, gz: 1e9, path: [], i: 0, t: 0, direct: true, chkT: 0, lx: px, lz: pz, stuck: 0, replan: false, macro: null, mx: 1e9, mz: 1e9 });
    // uzak / pencereye sığmayan hedef: kaldırım köşeleri üzerinden kaba rota (yol grafiği), yerel A* ara noktalara
    if (N.macro && (Math.abs(N.mx - tx) + Math.abs(N.mz - tz) > 4)) N.macro = null;
    if (N.macro && N.macro.length) {
      const m = N.macro[0];
      if (Math.hypot(m.x - px, m.z - pz) < 1.6) { N.macro.shift(); N.gx = 1e9; }
      if (N.macro.length) { const m2 = N.macro[0]; this._navLocal(N, m2.x, m2.z, speed, dt, vaultOK, true); return dist; }
      N.macro = null;
    }
    this._navLocal(N, tx, tz, speed, dt, vaultOK, false);
    if (N.wantMacro && !N.macro) {
      N.wantMacro = false;
      N.macro = g.npcs.sidewalkRoute(px, pz, tx, tz); N.mx = tx; N.mz = tz; N.gx = 1e9;
    }
    return dist;
  }
  _navLocal(N, tx, tz, speed, dt, vaultOK, isMacro) {
    const g = this.game, nav = g.physics.nav;
    const px = this.pos.x, pz = this.pos.z;
    const dist = Math.hypot(tx - px, tz - pz);
    N.t -= dt;
    const moved = Math.abs(N.gx - tx) + Math.abs(N.gz - tz);
    if (moved > (dist > 15 ? 3 : 1.0) || N.t <= 0 || N.replan) {
      N.gx = tx; N.gz = tz; N.t = 1.2 + Math.random() * 0.8;
      const forced = N.replan; N.replan = false;
      if (!forced && dist < 70 && nav.clearLine(px, pz, tx, tz, false)) { N.path.length = 0; N.direct = true; }
      else if (g.npcs.pathBudget > 0) {
        g.npcs.pathBudget--;
        const found = nav.findPath(px, pz, tx, tz, N.path, { lowCost: vaultOK ? 2.5 : 9, maxExpand: 4500 });
        N.i = 0; N.direct = N.path.length === 0;
        if (N.path.partial) N.t = 0.9;
        if (!found && !isMacro && dist > 8) N.wantMacro = true;
      } else { N.t = 0.1; N.replan = forced; }
    }
    let wx = tx, wz = tz, vseg = false;
    if (!N.direct && N.i < N.path.length) {
      let w = N.path[N.i];
      while (N.i < N.path.length - 1 && Math.hypot(w.x - px, w.z - pz) < 0.8) { N.i++; w = N.path[N.i]; }
      if (N.i === N.path.length - 1 && !N.path.partial && Math.hypot(w.x - px, w.z - pz) < 0.8) { N.direct = true; }
      else { wx = w.x; wz = w.z; vseg = w.vault; }
    }
    this.steerMove(wx, wz, speed, dt, vaultOK || vseg);
    // sıkışma: 1 sn'de 0.3 m'den az ilerleme → yeniden yol bul, yön değiştir
    N.chkT += dt;
    if (N.chkT >= 1) {
      const prog = Math.hypot(this.pos.x - N.lx, this.pos.z - N.lz);
      if (prog < 0.3 && speed > 0.5 && dist > 1.2 && !this.vault) {
        N.stuck++; N.replan = true; this.side = -this.side;
        if (N.stuck >= 3) { N.stuck = 0; if (this.onStuck) this.onStuck(); }
      } else if (prog > 0.6) N.stuck = 0;
      N.chkT = 0; N.lx = this.pos.x; N.lz = this.pos.z;
    }
  }
  navReset() { if (this.navS) { this.navS.path.length = 0; this.navS.direct = true; this.navS.gx = 1e9; this.navS.macro = null; } }

  // Yerel yönlendirme: bıyıklar (ızgarada ileri bakış), ayrışma (diğer yayalar), alçak engelde atlama
  steerMove(wx, wz, speed, dt, vaultOK) {
    const g = this.game, nav = g.physics.nav;
    const px = this.pos.x, pz = this.pos.z;
    const dx = wx - px, dz = wz - pz, d = Math.hypot(dx, dz);
    if (d < 0.03) { this.speed = 0; return; }
    let want = Math.atan2(dx, dz);
    const look = Math.min(1.1, d);
    const blocked = (a, L) => { const v = nav.at(px + Math.sin(a) * L, pz + Math.cos(a) * L); return v >= N_BLOCK || (v === N_LOW && !vaultOK); };
    if (look > 0.35 && (blocked(want, look) || blocked(want, look * 0.5))) {
      const sd = this.side;
      for (let k = 0; k < 6; k++) {
        const da = [0.45, -0.45, 0.9, -0.9, 1.4, -1.4][k] * sd;
        if (!blocked(want + da, look) && !blocked(want + da, look * 0.5)) { want += da; break; }
      }
    }
    // ayrışma: yakın yayalardan uzaklaş
    let sx = Math.sin(want), sz = Math.cos(want);
    const nb = g.npcs.neighbors(px, pz);
    if (nb) {
      for (let i = 0; i < nb.length; i++) {
        const o = nb[i];
        if (o === this || o.dead) continue;
        const ox = px - o.pos.x, oz = pz - o.pos.z, od2 = ox * ox + oz * oz;
        if (od2 > 0.85 * 0.85 || od2 < 1e-6) continue;
        const od = Math.sqrt(od2), k = (0.85 - od) / 0.85 * 1.4;
        sx += (ox / od) * k; sz += (oz / od) * k;
      }
    }
    want = Math.atan2(sx, sz);
    if (this.detourT > 0) { this.detourT -= dt; want += this.side * 1.25; }
    this.heading = dampAngle(this.heading, want, 10, dt);
    const s = Math.min(speed, d / Math.max(dt, 1e-3));
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    // alçak engel tam önde: üstünden atla
    if (vaultOK && s > 0.9 && !this.vault) {
      const v = nav.at(px + hx * 0.55, pz + hz * 0.55);
      if (v === N_LOW && this.startVault(hx, hz)) return;
    }
    this.pos.x += hx * s * dt;
    this.pos.z += hz * s * dt;
    this.speed = s;
  }

  // Alçak engelin (≤1.25 m: bank, çit, korkuluk, kova) üstünden atlama/tırmanma. vaultT 0..1 animasyon bayrağı.
  startVault(hx, hz) {
    const g = this.game, nav = g.physics.nav, px = this.pos.x, pz = this.pos.z;
    let e = -1;
    for (let s = 0.6; s <= 2.6; s += 0.2) {
      const v = nav.at(px + hx * s, pz + hz * s);
      if (v === N_FREE) { e = s; break; }
      if (v < 0 || v >= N_BLOCK) return false;
    }
    if (e < 0) return false;
    let top = 0.5;
    const boxes = g.physics.active.query(Math.min(px, px + hx * e) - 0.3, Math.min(pz, pz + hz * e) - 0.3, Math.max(px, px + hx * e) + 0.3, Math.max(pz, pz + hz * e) + 0.3, coverBoxes);
    for (const b of boxes) if (b.y1 <= 1.3 && b.y1 > top && b.y0 < 0.5) top = b.y1;
    const end = e + 0.3;
    this.vault = { t: 0, dur: 0.42 + top * 0.22, sx: px, sz: pz, sy: this.pos.y, ex: px + hx * end, ez: pz + hz * end, top };
    this.jumping = true;
    this.heading = Math.atan2(hx, hz);
    return true;
  }
  updateVault(dt) {
    const V = this.vault;
    V.t += dt;
    const u = Math.min(1, V.t / V.dur), e = u * u * (3 - 2 * u);
    this.pos.x = V.sx + (V.ex - V.sx) * e; this.pos.z = V.sz + (V.ez - V.sz) * e;
    this.pos.y = V.sy + Math.max(0, V.top + 0.1) * Math.sin(Math.PI * Math.min(1, u * 1.1));
    this.vaultT = Math.max(0.001, u);
    this.speed = Math.hypot(V.ex - V.sx, V.ez - V.sz) / V.dur;
    if (u >= 1) { this.vault = null; this.vaultT = 0; this.jumping = false; this.pos.y = V.sy; }
  }

  // Kaçış planı: (1) yakındaki, tehdide ters yöndeki bir binanın kapısından içeri, (2) siper, (3) sokak boyunca uzaklaş
  planFlee(cont) {
    const g = this.game, from = this.fleeFrom || g.player.pos;
    this.fleeSrc = this.fleeFrom;
    const canDoor = !this.mission && !this.persistent && !this.inInterior && (this.faction === 'civilian' || this.kind === 'resident');
    let F = null;
    if (canDoor && !cont && Math.random() < 0.6) { const d = g.npcs.doorAway(this.pos, from, 30); if (d) F = { x: d.x, z: d.z, door: true }; }
    if (!F && !cont && !this.mission && Math.random() < 0.2) { const c = this.findCover({ pos: from }); if (c) F = { x: c.x, z: c.z, cover: true }; }
    if (!F) { const p = g.npcs.streetAway(this.pos, from, 28 + Math.random() * 14, this); F = { x: p.x, z: p.z, street: true }; }
    this.flee = F;
    this.navReset();
  }
  onStuck() {
    if (this.state === 'flee') { const F = this.flee; if (F && F.door) this.flee = null; else this.planFlee(true); }
    else if (this.state === 'walk') { this.path = []; this.cur = null; this.side = -this.side; }
  }

  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { this.speed = 0; return d; }
    let want = Math.atan2(dx, dz);
    if (this.detourT > 0) { this.detourT -= dt; want += this.side * 1.25; }
    this.heading = dampAngle(this.heading, want, 8, dt);
    const s = Math.min(speed, d / dt);
    this.pos.x += Math.sin(this.heading) * s * dt;
    this.pos.z += Math.cos(this.heading) * s * dt;
    this.speed = s;
    return d;
  }
  // önü kapalıysa yana sap (duvarlarda takılmayı önler)
  avoid() {
    if (this.detourT > 0 || this.speed < 0.5) return;
    probe.set(this.pos.x + Math.sin(this.heading) * 0.9, this.pos.y, this.pos.z + Math.cos(this.heading) * 0.9);
    const bx = probe.x, bz = probe.z;
    this.game.physics.resolveCircle(probe, this.radius, this.pos.y);
    if (Math.abs(probe.x - bx) + Math.abs(probe.z - bz) > 0.05) { this.detourT = 0.7; if (Math.random() < 0.3) this.side = -this.side; }
  }

  // Siper noktası bul: tehdide göre bina köşesi / kutu arkası / park halindeki araç
  findCover(threat) {
    const g = this.game, ph = g.physics;
    const px = this.pos.x, pz = this.pos.z, tx = threat.pos.x, tz = threat.pos.z;
    const R = 14;
    coverCand.length = 0;
    const add = (cx, cz, low) => {
      const dSelf = Math.hypot(cx - px, cz - pz);
      if (dSelf > R + 2) return;
      const dT = Math.hypot(cx - tx, cz - tz);
      if (dT < 6) return;
      // tehdide çok yaklaşan siperleri sevme, mevcut mesafeyi koru
      const cur = Math.hypot(px - tx, pz - tz);
      coverCand.push({ x: cx, z: cz, low, s: dSelf + Math.max(0, cur - 4 - dT) * 0.8 + Math.max(0, 8 - dT) * 2 + (low ? 1.2 : 0) });
    };
    const boxes = ph.active.query(px - R, pz - R, px + R, pz + R, coverBoxes);
    for (const b of boxes) {
      if (b.y1 < 0.95 || b.y0 > 0.5) continue;
      const w = b.x1 - b.x0, d = b.z1 - b.z0;
      if (w < 0.7 && d < 0.7) continue;
      const low = b.y1 < 1.6;
      const o = 0.65;
      add(b.x0 - o, b.z0 - o, low); add(b.x1 + o, b.z0 - o, low); add(b.x0 - o, b.z1 + o, low); add(b.x1 + o, b.z1 + o, low);
      // tehdide göre arka yüz
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      let ux = cx - tx, uz = cz - tz; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      if (w < 30 && d < 30) {
        const k = Math.abs(ux) * w / 2 + Math.abs(uz) * d / 2 + o;
        add(cx + ux * k, cz + uz * k, low);
      } else {
        // büyük bina: oyuncuya göre en yakın kenar noktasını duvara yasla
        const qx = clamp(px, b.x0, b.x1), qz = clamp(pz, b.z0, b.z1);
        const nx = qx === b.x0 ? -1 : qx === b.x1 ? 1 : 0, nz = qz === b.z0 ? -1 : qz === b.z1 ? 1 : 0;
        if (nx || nz) add(qx + nx * o, qz + nz * o, low);
      }
    }
    if (!this.inInterior) {
      for (const v of g.vehicles.list) {
        if (v.destroyed || v.speed > 1) continue;
        const dx = v.pos.x - px, dz = v.pos.z - pz;
        if (dx * dx + dz * dz > R * R) continue;
        let ux = v.pos.x - tx, uz = v.pos.z - tz; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
        add(v.pos.x + ux * (v.def.wid / 2 + 0.9), v.pos.z + uz * (v.def.wid / 2 + 0.9), true);
      }
    }
    coverCand.sort((a, b) => a.s - b.s);
    let tests = 0;
    for (const c of coverCand) {
      if (tests++ > 9) break;
      probe.set(c.x, this.pos.y, c.z);
      g.physics.resolveCircle(probe, this.radius + 0.05, this.pos.y);
      if (Math.abs(probe.x - c.x) + Math.abs(probe.z - c.z) > 0.08) continue;
      if (!this.inInterior && !isLand(c.x, c.z)) continue;
      const h = c.low ? 0.8 : 1.2;
      if (ph.lineOfSight(tx, threat.pos.y + 1.4, tz, c.x, this.pos.y + h, c.z)) continue;
      return { x: c.x, z: c.z, low: c.low };
    }
    return null;
  }

  // Kuşatma noktası: hedefin yanına (grup merkezine dik)
  findFlank(t) {
    const dx = this.pos.x - t.pos.x, dz = this.pos.z - t.pos.z, l = Math.hypot(dx, dz) || 1;
    const side = this.side;
    const fx = t.pos.x + (-dz / l) * side * 13 + (dx / l) * 5, fz = t.pos.z + (dx / l) * side * 13 + (dz / l) * 5;
    probe.set(fx, 0, fz);
    this.game.physics.resolveCircle(probe, 0.5, 0);
    if (Math.abs(probe.x - fx) + Math.abs(probe.z - fz) > 0.1) return null;
    if (!this.inInterior && !isLand(fx, fz)) return null;
    return { x: fx, z: fz };
  }

  // Ateş: isabet olasılığı modeli
  fireAt(t, d) {
    const g = this.game;
    if (this.shotT > 0 || this.fireCd > 0 || this.reloadT > 0) return;
    if (g.missions && g.missions.cutscene) return;
    const def = this.wdef;
    let p = this.skill;
    const ref = def.pellets ? 9 : def.range > 120 ? 26 : 17;
    p *= 1 / (1 + (d / ref) * (d / ref));
    const ts = t.vehicle ? t.vehicle.speed : (t.speed || 0);
    p *= 1 / (1 + ts * 0.16);
    if (this.speed > 0.6) p *= 0.6;
    if (t.crouch) p *= 0.75;
    p *= Math.min(1, 0.3 + this.aimT * 0.35);
    p *= 1 - 0.55 * this.suppress;
    if (t.isPlayer) {
      p *= DIFFICULTY[g.settings.difficulty] || 1;
      if (!this.slotted) p *= 0.12;
    }
    if (def.pellets) p *= 0.6;
    const hit = Math.random() < p;
    const ey = this.pos.y + (this.crouch ? 1.15 : 1.45);
    tmp.set(this.pos.x, ey, this.pos.z);
    let ax = t.pos.x, ay = t.pos.y + (t.crouch ? 0.8 : 1.05), az = t.pos.z;
    if (t.vehicle) ay = t.vehicle.pos.y + 1.0;
    if (hit) { ax += (Math.random() - 0.5) * 0.2; ay += (Math.random() - 0.5) * 0.25; az += (Math.random() - 0.5) * 0.2; }
    else {
      const dx = ax - tmp.x, dz = az - tmp.z, l = Math.hypot(dx, dz) || 1;
      const s = (Math.random() < 0.5 ? -1 : 1) * (0.75 + Math.random() * 1.1);
      ax += (-dz / l) * s; az += (dx / l) * s; ay += (Math.random() - 0.3) * 1.1;
    }
    tmp2.set(ax - tmp.x, ay - ey, az - tmp.z).normalize();
    if (this.tryFire(tmp, tmp2)) {
      if (def.auto) {
        if (this.burst <= 0) this.burst = 2 + Math.floor(Math.random() * 4);
        this.burst--;
        this.shotT = this.burst > 0 ? 1 / def.rate : 0.8 + Math.random() * 1.1;
      } else this.shotT = (def.rate < 2 ? 1.2 : 0.85) + Math.random() * 0.8;
      if (this.wstate.mag <= 0 && Math.random() < 0.4) this.say(this.faction === 'police' ? ['Şarjör!', 'Örtün beni!'] : ['Mermi!', 'Örtün beni!'], 0.6);
    }
  }

  update(dt, full = true) {
    const g = this.game;
    this.updateWeapon(dt);
    if (this.dead) {
      this.removeT -= dt;
      if (full) this.model.animate(dt, this.animState());
      this.sync();
      return;
    }
    if (this.vehicle) return;
    const player = g.player;
    this.thinkT -= dt;
    this.barkT -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.shotT > 0) this.shotT -= dt;
    this.suppress = Math.max(0, this.suppress - dt * 0.25);
    this.aiming = false;
    let speed = 0;
    if (this.knock && this.knock.t > 0) {
      this.knock.t -= dt;
      this.pos.x += this.knock.x * dt * 3; this.pos.z += this.knock.z * dt * 3;
    }
    if (this.carHitT > 0) this.carHitT -= dt;
    // engel üstünden atlama sürüyor: yalnız hareketi oynat
    if (this.vault) {
      this.updateVault(dt);
      if (full) this.model.animate(dt, this.animState());
      this.sync();
      return;
    }
    if (this.thinkT <= 0) this.think();
    this.handsUp = false;
    let crouch = false;
    switch (this.state) {
      case 'walk': {
        if (!this.path.length) this.planWalk();
        const wp = this.path[0];
        if (wp) {
          // yaya geçidi: araç ışığı kırmızı olana kadar kaldırımda bekle (en çok 25 sn)
          if (wp.cross && wp.cross.light && !this.crossOK) {
            const tl = g.traffic;
            const n = wp.cross.node;
            const st = tl ? tl.lightState(n, wp.cross.axis ? { x: n.x + 10, z: n.z } : { x: n.x, z: n.z + 10 }) : 'red';
            this.crossWait = (this.crossWait || 0) + dt;
            if (st === 'red' || this.crossWait > 25) { this.crossOK = true; this.crossWait = 0; }
            else { this.heading = dampAngle(this.heading, Math.atan2(wp.x - this.pos.x, wp.z - this.pos.z), 4, dt); speed = 0; break; }
          }
          const d = this.navTo(wp.x, wp.z, wp.cross ? this.walkSpeed * 1.25 : this.walkSpeed, dt, false);
          speed = this.speed;
          if (d < 0.9) { this.path.shift(); this.crossOK = false; this.navReset(); }
        }
        break;
      }
      case 'move': {
        // betik yolu (görevler, kaçış, eskort)
        const wp = this.path[0];
        if (wp) {
          const d = this.navTo(wp.x, wp.z, this.moveSpeed || 4, dt, true); speed = this.speed;
          if (d < (wp.r || 0.7)) { this.path.shift(); if (!this.path.length) { this.state = this.afterMove || 'idle'; if (this.onArrive) { const f = this.onArrive; this.onArrive = null; f(this); } } }
        } else this.state = this.afterMove || 'idle';
        break;
      }
      case 'patrol': {
        const pts = this.patrol;
        if (!pts || !pts.length) { this.state = 'guard'; break; }
        if (this.waitT > 0) { this.waitT -= dt; this.heading += Math.sin(performance.now() * 0.001 + this.id) * dt * 0.6; break; }
        const wp = pts[this.patrolIdx % pts.length];
        const d = this.navTo(wp.x, wp.z, this.walkSpeed * 0.9, dt, true); speed = this.speed;
        if (d < 0.8) { this.patrolIdx++; this.waitT = 1.5 + Math.random() * 3; }
        break;
      }
      case 'follow': {
        const L = this.leader || player;
        if (!L || L.dead) { this.state = 'idle'; break; }
        if (L.vehicle) break; // araca binme görev tarafında
        const dx = L.pos.x - this.pos.x, dz = L.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d > 3.2) { this.navTo(L.pos.x - dx / d * 2.2 + this.side * 0.8, L.pos.z - dz / d * 2.2, d > 8 ? 5.5 : 3.6, dt, true); speed = this.speed; }
        else this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 4, dt);
        if (d > 60 && !L.inInterior) { this.pos.set(L.pos.x - 2, L.pos.y, L.pos.z - 2); }
        break;
      }
      case 'idle': case 'guard': {
        if (this.home && Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) > 1.5) { this.navTo(this.home.x, this.home.z, 1.5, dt, true); speed = this.speed; }
        else if (this.faceYaw !== undefined) this.heading = dampAngle(this.heading, this.faceYaw, 4, dt);
        this.talking = this.kind === 'gang' && Math.sin(performance.now() * 0.0005 + this.id) > 0.6;
        break;
      }
      case 'sit': {
        this.sitting = true;
        if (this.faceYaw !== undefined) this.heading = this.faceYaw;
        this.routineT -= dt;
        if (this.routineT <= 0) { this.sitting = false; this.state = 'walk'; this.path = []; this.cur = null; this.pos.x += Math.sin(this.heading) * 0.8; this.pos.z += Math.cos(this.heading) * 0.8; }
        this.sync();
        if (full) this.model.animate(dt, this.animState());
        return; // bankta otururken çarpışma çözme
      }
      case 'chat': {
        if (this.faceYaw !== undefined) this.heading = dampAngle(this.heading, this.faceYaw, 4, dt);
        this.talking = Math.sin(performance.now() * 0.0011 + this.id * 1.7) > 0.1;
        this.routineT -= dt;
        if (this.routineT <= 0) { this.talking = false; this.state = 'walk'; this.path = []; this.cur = null; }
        break;
      }
      case 'browse': {
        if (this.faceYaw !== undefined) this.heading = dampAngle(this.heading, this.faceYaw, 4, dt);
        this.routineT -= dt;
        if (this.routineT <= 0) {
          if (this.shopDoor && Math.random() < 0.4) { this.state = 'move'; this.path = [{ x: this.shopDoor.x, z: this.shopDoor.z, r: 0.6 }]; this.moveSpeed = 1.4; this.afterMove = 'gone'; }
          else { this.state = 'walk'; this.path = []; this.cur = null; }
        }
        break;
      }
      case 'gone': {
        // bir kapıdan içeri girdi: kaldır
        this.removeMe = true;
        break;
      }
      case 'handsup': {
        this.handsUp = true;
        this.handsUpT -= dt;
        if (this.handsUpT <= 0) { this.state = 'flee'; this.fleeFrom = player.pos.clone(); this.fleeT = 5; }
        break;
      }
      case 'surrender': {
        // görev: teslim olan hedef
        this.handsUp = true;
        this.heading = dampAngle(this.heading, Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), 4, dt);
        break;
      }
      case 'cower': {
        crouch = true;
        this.handsUp = Math.sin(performance.now() * 0.002 + this.id) > -0.2;
        this.fleeT -= dt;
        if (this.fleeT < 3 && Math.random() < dt * 0.15) this.say(BARKS.cower, 0.5);
        if (this.fleeT <= 0) { this.state = 'walk'; this.path = []; this.cur = null; }
        break;
      }
      case 'flee': {
        if (this.reactT > 0) { this.reactT -= dt; this.heading = dampAngle(this.heading, Math.atan2(this.pos.x - (this.fleeFrom || player.pos).x, this.pos.z - (this.fleeFrom || player.pos).z), 6, dt); break; }
        this.fleeT -= dt;
        // kaçış planı: kapıya / sipere / sokak boyunca (yeni tehdit gelince yeniden planla)
        if (!this.flee || this.fleeSrc !== this.fleeFrom) this.planFlee(false);
        const F = this.flee;
        const from = this.fleeFrom || player.pos;
        const dT = Math.hypot(this.pos.x - from.x, this.pos.z - from.z);
        const d = this.navTo(F.x, F.z, dT < 25 ? 5.4 : 4.4, dt, true); speed = this.speed;
        if (d < (F.door ? 0.9 : 1.4)) {
          if (F.door) { this.state = 'gone'; break; } // binaya girdi
          if (F.cover) { this.state = 'cower'; this.fleeT = 6 + Math.random() * 8; break; }
          if (this.fleeT > 0 && dT < 45) this.planFlee(true);
          else this.fleeT = 0;
        }
        if (this.fleeT <= 0 && !F.door) {
          if (this.faction === 'civilian' && !this.mission && Math.random() < 0.65) { this.state = 'cower'; this.fleeT = 6 + Math.random() * 8; }
          else { this.state = this.restState(); this.path = []; this.cur = null; }
          this.flee = null;
        }
        if (F.door && this.fleeT < -25) { this.flee = null; this.fleeT = 3; }
        break;
      }
      case 'arrest': case 'attack': {
        const r = this.updateCombat(dt);
        speed = r.speed; crouch = r.crouch;
        break;
      }
    }
    this.crouch = crouch;
    // statik çarpışma
    const res = g.physics.resolveCircle(this.pos, this.radius, this.pos.y);
    this.pos.y = Math.max(res.support, this.pos.y - 9 * dt);
    if (this.pos.y < res.support + 0.01) this.pos.y = res.support;
    if (!this.inInterior && !isLand(this.pos.x, this.pos.z)) {
      // suya düşen NPC boğulur
      this.swimming = true;
      this.pos.y = -1.2;
      this.drownT = (this.drownT || 0) + dt;
      if (this.drownT > 6) this.takeDamage(999, null, 'drown');
    } else this.swimming = false;
    this.speed = speed;
    if (full) this.model.animate(dt, this.animState());
    this.sync();
  }

  // Seyrek düşünme: hedef seçimi, fark etme, tepkiler
  think() {
    const g = this.game, player = g.player;
    this.thinkT = 0.35 + Math.random() * 0.3;
    const sameRoom = (player.inInterior || null) === (this.inInterior || null);
    const pd = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (!player.dead && sameRoom) {
      const lvl = g.wanted.level;
      if (this.faction === 'police' && lvl > 0 && pd < 60 && this.state !== 'attack' && this.state !== 'arrest') {
        if (lvl >= 2) this.engage(player); else { this.state = 'arrest'; this.target = player; this.static = false; }
      }
      if (this.faction === 'police' && lvl >= 2 && this.state === 'arrest') this.engage(player, 0.5);
      if (this.faction === 'police' && this.state === 'attack' && this.target === player && lvl === 1 && !player.aiming) { this.state = 'arrest'; }
      if ((this.faction === 'gang' || this.faction === 'military') && !this.ally && this.state !== 'attack' && pd < (this.faction === 'military' ? 45 : 28) && this.hostileTo(player)) {
        if (g.physics.lineOfSight(this.pos.x, this.pos.y + 1.6, this.pos.z, player.pos.x, player.pos.y + 1.6, player.pos.z)) {
          this.engage(player);
          this.say(this.faction === 'military' ? BARKS.soldier : BARKS.gang, 0.35);
        }
      }
      // müttefikler ve düşmanlar arası hedefleme
      if ((this.ally || this.hostile || this.faction === 'military') && (this.state !== 'attack' || !this.target || this.target.isPlayer)) {
        const t = g.npcs.nearestHostile(this, this.ally ? 38 : 22);
        if (t && (!this.target || this.ally || Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) < pd * 0.6)) this.engage(t, 0.8);
      }
      // oyuncu silah doğrultuyorsa siviller korkar
      if (this.faction === 'civilian' && player.aiming && player.weapon !== 'fists' && pd < 15 && this.state !== 'flee' && this.state !== 'cower' && !this.static) {
        const fx = Math.sin(player.camYaw), fz = Math.cos(player.camYaw);
        const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
        if ((dx * fx + dz * fz) / (pd || 1) > 0.85) { this.state = 'handsup'; this.handsUpT = 4; this.sitting = false; this.say(BARKS.cower, 0.6); }
      }
      // 1 yıldızda polise silah doğrultmak yıldızı artırır
      if (this.faction === 'police' && lvl === 1 && player.aiming && player.wdef.type === 'gun' && pd < 25 && player.aimTarget === this) g.wanted.add(1, true);
      // laf atma
      if (this.faction === 'civilian' && pd < 4.5 && !player.vehicle && this.state !== 'flee' && this.state !== 'cower') g.npcs.ambientBark(this, pd);
    }
    if (this.target && (this.target.dead || (this.target.inInterior || null) !== (this.inInterior || null))) {
      this.target = null; this.state = this.faction === 'civilian' ? 'flee' : this.restState(); this.fleeT = 4; this.coverPt = null;
    }
  }

  // Savaş davranışı. {speed, crouch} döndürür.
  updateCombat(dt) {
    const g = this.game, player = g.player;
    const out = { speed: 0, crouch: false };
    const t = this.target || player;
    if (!t || t.dead) { this.state = this.restState(); return out; }
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const def = this.wdef;
    const melee = def.type === 'melee';
    const want = Math.atan2(dx, dz);
    const ey = this.pos.y + 1.5;
    // görüş testi seyrek (pahalı)
    this.losT = (this.losT || 0) - dt;
    if (this.losT <= 0) { this.losT = 0.2 + Math.random() * 0.15; this.los = g.physics.lineOfSight(this.pos.x, ey, this.pos.z, t.pos.x, t.pos.y + 1.2, t.pos.z); }
    const los = this.los;
    if (los) { if (!this.lastSeen) this.lastSeen = new THREE.Vector3(); this.lastSeen.copy(t.pos); this.aimT += dt; } else this.aimT = Math.max(0, this.aimT - dt * 2);
    if (this.alertT > 0) { this.alertT -= dt; this.heading = dampAngle(this.heading, want, 6, dt); if (d > 30) { this.navTo(t.pos.x, t.pos.z, 3.5, dt, true); out.speed = this.speed; } return out; }
    if (this.state === 'arrest') {
      if (d > 1.3) { this.navTo(t.pos.x, t.pos.z, d > 6 ? 4.8 : 2.4, dt, true); out.speed = this.speed; }
      else this.heading = dampAngle(this.heading, want, 10, dt);
      if (d < 14) this.say(BARKS.arrest, dt * 3);
      if (d < 10) { this.aiming = this.wdef.type !== 'melee'; }
      return out;
    }
    if (melee) {
      if (d > def.range * 0.8) { this.navTo(t.pos.x, t.pos.z, 5.0, dt, true); out.speed = this.speed; }
      else this.heading = dampAngle(this.heading, want, 10, dt);
      if (d < def.range && this.fireCd <= 0 && !(g.missions && g.missions.cutscene)) this.tryFire(this.pos, tmp2.set(0, 0, 1));
      if (d > 120) { this.state = this.restState(); this.target = null; }
      return out;
    }
    // taktik seçimi
    this.tacT -= dt;
    if (this.tacT <= 0) this.chooseTactic(t, d, los);
    let moving = false;
    const ideal = Math.min(def.range * 0.45, this.kind === 'soldier' || this.kind === 'swat' ? 22 : 16);
    if (this.tac === 'cover' && this.coverPt) {
      const cd = Math.hypot(this.coverPt.x - this.pos.x, this.coverPt.z - this.pos.z);
      if (cd > 0.6) {
        this.navTo(this.coverPt.x, this.coverPt.z, 4.6, dt, true); out.speed = this.speed; moving = true;
      } else {
        // siperde: saklan / dışarı çık ve ateş et
        this.peekT -= dt;
        if (this.peekT <= 0) { this.peeking = !this.peeking; this.peekT = this.peeking ? 1.4 + Math.random() * 1.6 : 0.9 + Math.random() * 1.4 + this.suppress * 1.5; }
        out.crouch = !this.peeking && (this.coverPt.low || true);
        if (this.peeking && this.coverPt.low) out.crouch = false;
        this.heading = dampAngle(this.heading, want, 10, dt);
        if (!this.peeking) { this.aimT = Math.max(0.2, this.aimT); return out; }
      }
    } else if (this.tac === 'flank' && this.flankPt) {
      const fd = Math.hypot(this.flankPt.x - this.pos.x, this.flankPt.z - this.pos.z);
      if (fd > 1) { this.navTo(this.flankPt.x, this.flankPt.z, 5.0, dt, true); out.speed = this.speed; moving = true; }
      else { this.tac = 'engage'; this.tacT = 3; }
    } else if (d > ideal || !los) {
      let tx = t.pos.x, tz = t.pos.z;
      if (!los && this.lastSeen) { tx = this.lastSeen.x; tz = this.lastSeen.z; }
      this.navTo(tx, tz, d > 30 ? 4.8 : 3.6, dt, true); out.speed = this.speed; moving = true;
    } else if (d < ideal * 0.4 && this.kind !== 'boss') {
      // çok yakın: geri çekil
      this.steerMove(this.pos.x - dx / d * 3, this.pos.z - dz / d * 3, 2.2, dt, false); out.speed = this.speed; this.heading = dampAngle(this.heading, want, 10, dt);
    }
    if (!moving || this.tac === 'flank' || los) {
      if (!moving) this.heading = dampAngle(this.heading, want, 10, dt);
    }
    if (los && d < def.range && Math.abs(angleDiff(moving ? this.heading : this.heading, want)) < (moving ? 1.2 : 0.35)) {
      this.aiming = true;
      if (moving) this.heading = dampAngle(this.heading, want, 3, dt);
      this.fireAt(t, d);
    }
    if (d > 130) { this.state = this.restState(); this.target = null; }
    return out;
  }

  chooseTactic(t, d, los) {
    const g = this.game;
    this.tacT = 3.5 + Math.random() * 3;
    const k = COVER_K[this.kind] || 0.3;
    const wantsCover = this.hurtT > 0 || this.suppress > 0.4 || Math.random() < k;
    // kuşatma: kalabalık grupta bazıları yandan dolaşır
    if (!this.inInterior && d < 45 && d > 8 && Math.random() < (this.kind === 'gang' ? 0.25 : 0.3) && g.npcs.attackersOn(t) >= 3) {
      const f = this.findFlank(t);
      if (f) { this.tac = 'flank'; this.flankPt = f; this.tacT = 8; this.say(this.faction === 'police' ? BARKS.flank : BARKS.gang, 0.5); return; }
    }
    if (wantsCover && d < 50 && g.npcs.coverBudget > 0) {
      g.npcs.coverBudget--;
      const c = this.findCover(t);
      if (c) { this.tac = 'cover'; this.coverPt = c; this.peeking = false; this.peekT = 0.6; this.tacT = 6 + Math.random() * 5; return; }
    }
    this.tac = 'engage'; this.coverPt = null;
    void los;
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
    this.coverBudget = 3;
    this.slotT = 0;
    this.barkT = 3;
    this.counts = { civ: 0, police: 0, military: 0 };
    this.pathBudget = 4;
    this.hash = new Map(); this.hashPool = [];
    this.doorGrid = null;
    this.stats = { full: 0, lod: 0 };
  }

  // ---- uzamsal ızgara (ayrışma, araç çarpması): 2 m hücre, her kare yeniden ----
  buildHash() {
    const H = this.hash;
    for (const arr of H.values()) { arr.length = 0; this.hashPool.push(arr); }
    H.clear();
    const add = (a) => {
      const k = (Math.floor(a.pos.x / 2) + 2048) * 4096 + Math.floor(a.pos.z / 2) + 2048;
      let arr = H.get(k);
      if (!arr) { arr = this.hashPool.pop() || []; H.set(k, arr); }
      arr.push(a);
    };
    for (const n of this.list) if (!n.dead && !n.vehicle) add(n);
    const p = this.game.player;
    if (p && !p.vehicle && !p.dead) add(p);
  }
  // (x,z) çevresindeki 3x3 hücredeki aktörler (paylaşılan dizi)
  neighbors(x, z) {
    const out = this._nb || (this._nb = []);
    out.length = 0;
    const cx = Math.floor(x / 2), cz = Math.floor(z / 2);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const arr = this.hash.get((cx + i + 2048) * 4096 + cz + j + 2048);
      if (arr) for (let k = 0; k < arr.length; k++) out.push(arr[k]);
    }
    return out;
  }
  // tehdide ters yöndeki en yakın bina kapısı (city.doors, 32 m ızgarada dizinlenir)
  doorAway(pos, threat, R) {
    const g = this.game;
    if (!this.doorGrid) {
      this.doorGrid = new Map();
      for (const d of g.city.doors) { const k = Math.floor(d.x / 32) * 4096 + Math.floor(d.z / 32); if (!this.doorGrid.has(k)) this.doorGrid.set(k, []); this.doorGrid.get(k).push(d); }
    }
    const tx = threat.x - pos.x, tz = threat.z - pos.z, tl = Math.hypot(tx, tz) || 1;
    let best = null, bs = 1e9;
    const cx = Math.floor(pos.x / 32), cz = Math.floor(pos.z / 32);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const arr = this.doorGrid.get((cx + i) * 4096 + cz + j);
      if (!arr) continue;
      for (const d of arr) {
        const dx = d.x - pos.x, dz = d.z - pos.z, dd = Math.hypot(dx, dz);
        if (dd > R || dd < 0.5) continue;
        const cos = (dx * tx + dz * tz) / (dd * tl);
        if (cos > 0.25) continue; // tehdide doğru koşma
        if (Math.hypot(d.x - threat.x, d.z - threat.z) < 7) continue;
        if (d.building && (d.building.type === 'police' || d.building.villa)) continue;
        const sc = dd * (1.2 + cos);
        if (sc < bs) { bs = sc; best = d; }
      }
    }
    return best;
  }
  // Kaldırım köşeleri üzerinden kaba rota: yol grafiğinde A*, her düğümde bir önceki noktaya en yakın blok köşesi
  sidewalkRoute(sx, sz, tx, tz) {
    const map = this.game.map;
    const nodes = map.path(sx, sz, tx, tz);
    const out = [];
    let lx = sx, lz = sz;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      let hx = 5.5, hz = 5.5;
      for (const ed of n.edges) { const o = map.other(ed, n); if (Math.abs(o.x - n.x) > Math.abs(o.z - n.z)) hz = Math.max(hz, ed.width / 2); else hx = Math.max(hx, ed.width / 2); }
      // ilk düğüm: hedef yönündeki köşe; diğerleri: önceki noktaya yakın köşe
      let best = null, bd = 1e9;
      for (const qx of [-1, 1]) for (const qz of [-1, 1]) {
        const x = n.x + qx * (hx + 1.6), z = n.z + qz * (hz + 1.6);
        const d = Math.hypot(x - lx, z - lz) + Math.hypot(x - tx, z - tz) * 0.35;
        if (d < bd) { bd = d; best = { x, z }; }
      }
      out.push(best); lx = best.x; lz = best.z;
    }
    return out.slice(0, 8);
  }

  // Sokak boyunca tehditten uzaklaşan kaldırım noktası (köşeyi dönerek devam edebilir)
  streetAway(pos, threat, dist, npc) {
    const map = this.game.map;
    let best = null, bd = 1e9;
    for (const e of map.edges) {
      const ax = e.a.x, az = e.a.z, dx = e.b.x - ax, dz = e.b.z - az;
      if (Math.abs(pos.x - (ax + dx / 2)) > Math.abs(dx) / 2 + 30 || Math.abs(pos.z - (az + dz / 2)) > Math.abs(dz) / 2 + 30) continue;
      const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((pos.x - ax) * dx + (pos.z - az) * dz) / l2, 0, 1);
      const d = Math.hypot(ax + dx * t - pos.x, az + dz * t - pos.z);
      if (d < bd) { bd = d; best = { e, t }; }
    }
    const ax0 = pos.x - threat.x, az0 = pos.z - threat.z, al = Math.hypot(ax0, az0) || 1;
    if (!best || bd > 25) return { x: pos.x + (ax0 / al) * dist, z: pos.z + (az0 / al) * dist };
    const e = best.e, L = e.len;
    const ux = (e.b.x - e.a.x) / L, uz = (e.b.z - e.a.z) / L;
    // kaldırım tarafı: NPC'nin bulunduğu taraf
    const lat = (pos.x - e.a.x) * -uz + (pos.z - e.a.z) * ux;
    const side = lat >= 0 ? 1 : -1;
    const off = (e.width / 2 + 1.6) * side;
    let dir = Math.sign(ux * ax0 + uz * az0);
    if (!dir) dir = Math.random() < 0.5 ? 1 : -1;
    // tehdit kaldırım hattında önümüzdeyse karşı yöne
    let s = best.t * L + dir * dist;
    let cross = 6; for (const n of [e.a, e.b]) for (const ed of n.edges) cross = Math.max(cross, ed.width / 2);
    const lo = cross + 1.6, hi = L - cross - 1.6;
    if (s > hi || s < lo) {
      // köşeye kadar git, sonra tehditten en çok uzaklaşan kenara dön
      const node = s > hi ? e.b : e.a;
      const sc = s > hi ? hi : lo;
      let bestE = null, bdot = -2;
      for (const ed of node.edges) {
        if (ed === e) continue;
        const o = map.other(ed, node), ox = o.x - node.x, oz = o.z - node.z, ol = Math.hypot(ox, oz) || 1;
        const dot = (ox * ax0 + oz * az0) / (ol * al);
        if (dot > bdot) { bdot = dot; bestE = { ed, o, ox: ox / ol, oz: oz / ol }; }
      }
      if (bestE && bdot > -0.3) {
        const sideN = Math.sign((pos.x - node.x) * -bestE.oz + (pos.z - node.z) * bestE.ox) || side;
        const off2 = (bestE.ed.width / 2 + 1.6) * sideN;
        const run = Math.min(dist * 0.6, bestE.ed.len - cross * 2 - 4);
        return { x: node.x + bestE.ox * (cross + 1.6 + run) - bestE.oz * off2, z: node.z + bestE.oz * (cross + 1.6 + run) + bestE.ox * off2 };
      }
      s = sc;
    }
    void npc;
    return { x: e.a.x + ux * s - uz * off, z: e.a.z + uz * s + ux * off };
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
    else if (this.saved) { const j = this.saved.indexOf(n); if (j >= 0) this.saved.splice(j, 1); }
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

  // hedefe saldıran NPC sayısı
  attackersOn(t) {
    let c = 0;
    for (const n of this.list) if (!n.dead && n.state === 'attack' && n.target === t) c++;
    return c;
  }
  nearestHostile(me, r) {
    let best = null, bd = r * r;
    for (const o of this.list) {
      if (o === me || o.dead || o.vehicle) continue;
      const dx = o.pos.x - me.pos.x, dz = o.pos.z - me.pos.z, d2 = dx * dx + dz * dz;
      if (d2 >= bd) continue;
      if (!me.hostileTo(o)) continue;
      bd = d2; best = o;
    }
    return best;
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
    if (this.game.military && this.game.military.inZone(x, z, 10)) return null;
    return { x, z, e, side, fwd: Math.random() < 0.5 };
  }

  spawnCivilian(px, pz) {
    const g = this.game;
    const r = Math.random();
    // banklarda oturanlar
    if (r < 0.1 && g.city.benches && g.city.benches.length) {
      const near = [];
      for (const b of g.city.benches) { const d = Math.hypot(b[0] - px, b[1] - pz); if (d > 30 && d < 110) near.push(b); }
      if (near.length) {
        const [bx, bz, a] = near[Math.floor(Math.random() * near.length)];
        for (const o of this.list) if (o.state === 'sit' && Math.abs(o.pos.x - bx) < 1.5 && Math.abs(o.pos.z - bz) < 1.5) return;
        const n = this.add('civilian', bx + Math.sin(a) * 0.25, bz + Math.cos(a) * 0.25, null, { state: 'sit' });
        n.faceYaw = a; n.heading = a; n.routineT = 30 + Math.random() * 60; n.sitting = true;
        return;
      }
    }
    const s = this.sidewalkSpot(px, pz, 35, 110);
    if (!s) return;
    const d = districtAt(s.x, s.z);
    const gangHere = GANGS[d.gang];
    // çete bölgesi: grup halinde çete üyeleri
    if (gangHere && Math.random() < 0.12 && !g.state.territories[d.gang]) {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const look = randomLook(lookRng, 'gang');
        look.topColor = gangHere.color;
        const m = this.add('gang', s.x + Math.random() * 3 - 1.5, s.z + Math.random() * 3 - 1.5, look, { gang: d.gang, state: 'guard', home: new THREE.Vector3(s.x + i * 1.2, 0, s.z) });
        m.faceYaw = Math.random() * 6.28;
      }
      return;
    }
    // sohbet grubu
    if (r < 0.24) {
      const n = 2 + (Math.random() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const m = this.add('civilian', s.x + Math.sin(a) * 0.8, s.z + Math.cos(a) * 0.8, null, { state: 'chat' });
        m.faceYaw = a + Math.PI; m.routineT = 20 + Math.random() * 40;
      }
      return;
    }
    // vitrin bakan / dükkâna giren
    if (r < 0.32 && g.map.specials) {
      let best = null, bd = 1e9;
      for (const b of g.map.specials) {
        if (b.type !== 'food' && b.type !== 'clothes' && b.type !== 'cafe' && b.type !== 'gun') continue;
        const dd = Math.hypot(b.door.x - s.x, b.door.z - s.z);
        if (dd < bd && Math.hypot(b.door.x - px, b.door.z - pz) > 30) { bd = dd; best = b; }
      }
      if (best && bd < 90) {
        const nz = best.door.nz || 1;
        const bx = best.door.x + (Math.random() - 0.5) * 4, bz = best.door.z + nz * 1.6;
        const m = this.add('civilian', bx, bz, null, { state: 'browse' });
        m.faceYaw = nz > 0 ? Math.PI : 0; m.routineT = 8 + Math.random() * 20;
        m.shopDoor = { x: best.door.x, z: best.door.z + nz * 0.3 };
        return;
      }
    }
    const kind = Math.random() < 0.05 ? 'police' : 'civilian';
    const n = this.add(kind, s.x, s.z);
    // taraf yürüyüş yönüne göre (kenar a→b'ye göre değil)
    n.side = s.fwd ? s.side : -s.side;
    n.prev = s.fwd ? s.e.a : s.e.b; n.cur = s.fwd ? s.e.b : s.e.a;
    n.planWalk();
    if (kind === 'civilian' && Math.random() < 0.15) n.walkSpeed *= 1.5; // aceleci işe gidenler
  }

  spawnPoliceFoot(near) {
    const g = this.game;
    const p = g.player;
    const c = near || p.pos;
    const s = this.sidewalkSpot(c.x, c.z, near ? 8 : 35, near ? 25 : 70);
    if (!s) return null;
    const kind = g.wanted.level >= 4 && Math.random() < 0.5 ? 'swat' : 'police';
    const n = this.add(kind, s.x, s.z, kind === 'swat' ? swatLook() : copLook());
    if (g.wanted.level >= 2) n.engage(p); else { n.state = 'arrest'; n.target = p; }
    return n;
  }
  spawnSquad(kind, x, z, count, opts = {}) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const px = x + Math.sin(a) * (1.2 + Math.random()), pz = z + Math.cos(a) * (1.2 + Math.random());
      const look = kind === 'swat' ? swatLook() : kind === 'soldier' ? soldierLook() : kind === 'police' ? copLook() : null;
      const n = this.add(kind, px, pz, look, opts);
      out.push(n);
    }
    return out;
  }

  dispatchPoliceCar(type = 'police') {
    const g = this.game;
    const p = g.player;
    const v = g.vehicles.spawnTraffic(p.pos.x, p.pos.z, type);
    if (!v) return null;
    v.ai.mode = 'chase';
    v.ai.cruise = v.def.maxSpeed * 0.8;
    v.sirenOn = true;
    v.police = true;
    v.crew = type === 'swat' ? 4 : 2;
    return v;
  }

  calmPolice() {
    for (const n of this.list) if (n.faction === 'police' && !n.dead) { n.state = 'walk'; n.target = null; n.path = []; n.cur = null; n.coverPt = null; }
    for (const v of this.game.vehicles.list) if (v.ai && v.ai.mode === 'chase') { v.ai.mode = 'traffic'; v.ai.cruise = 12; v.sirenOn = false; }
  }

  // sivil laf atmaları: kıyafet, aranma, silah, saygınlık
  ambientBark(n, d) {
    const g = this.game, p = g.player, s = g.state;
    if (this.barkT > 0 || n.barkT > 0 || Math.random() > 0.35) return;
    this.barkT = 5 + Math.random() * 5;
    let list = BARKS.ambient;
    const top = s && s.look ? s.look.top : null;
    if (g.wanted.level > 0) list = BARKS.wanted;
    else if (p.weapon !== 'fists' && p.wdef.type === 'gun' && (p.aiming || Math.random() < 0.5)) list = BARKS.gun;
    else if (d < 1.2) list = BARKS.bump;
    else if (s && s.respect >= 700 && Math.random() < 0.5) list = BARKS.respect;
    else if (g.env.nightFactor > 0.6 && Math.random() < 0.5) list = BARKS.night;
    else if (top === 'suit' && Math.random() < 0.6) list = BARKS.suit;
    else if (top === 'leather' && Math.random() < 0.5) list = BARKS.leather;
    else if (top === 'track' && Math.random() < 0.4) list = BARKS.track;
    else if (n.state === 'chat') list = BARKS.chat;
    n.say(list, 1);
    void rankOf;
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
      else if (n.faction === 'military') { g.wanted.crime('kill_police', n.pos); if (g.military) g.military.raiseAlert('Asker vuruldu!'); }
      else if (n.faction === 'gang') { if (!n.ally) { g.wanted.crime('kill_gang', n.pos); g.onGangKill(n); } }
      else if (!n.mission || !n.scriptKill) g.wanted.crime(kind === 'car' ? 'hit_ped' : 'kill_civilian', n.pos);
      g.missions.onKill(n);
    } else g.missions.onKill(n);
    // çevredekiler paniğe kapılır
    for (const o of this.list) {
      if (o === n || o.dead) continue;
      if (Math.abs(o.pos.x - n.pos.x) < 25 && Math.abs(o.pos.z - n.pos.z) < 25) o.hearThreat(attacker, 10);
    }
  }

  // Oyuncuya isabetli ateş edebilecek NPC'ler (yakın ve görüşte olanlar öncelikli)
  assignSlots() {
    const g = this.game, p = g.player;
    const lvl = g.wanted.level;
    const copSlots = [0, 0, 2, 3, 4, 5][lvl] + (g.settings.difficulty === 'hard' ? 1 : 0);
    const otherSlots = g.settings.difficulty === 'easy' ? 2 : g.settings.difficulty === 'hard' ? 4 : 3;
    const cops = [], others = [];
    for (const n of this.list) {
      n.slotted = false;
      if (n.dead || n.state !== 'attack' || n.target !== p) continue;
      const d = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) + (n.los ? 0 : 40);
      (n.faction === 'police' ? cops : others).push([d, n]);
    }
    cops.sort((a, b) => a[0] - b[0]); others.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(copSlots, cops.length); i++) cops[i][1].slotted = true;
    for (let i = 0; i < Math.min(otherSlots, others.length); i++) others[i][1].slotted = true;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    this.coverBudget = 3;
    this.pathBudget = 4;
    if (g.physics.nav) g.physics.nav.tick();
    this.buildHash();
    this.barkT -= dt;
    this.slotT -= dt;
    if (this.slotT <= 0) { this.slotT = 0.5; this.assignSlots(); }
    let civCount = 0;
    for (const n of this.list) if (!n.dead && !n.mission) civCount++;
    if (!p.inInterior) {
      this.spawnT -= dt;
      const maxPed = g.settings.quality === 'low' ? 22 : g.settings.quality === 'medium' ? 32 : 42;
      const nightK = g.env.nightFactor > 0.6 ? 0.6 : 1;
      if (this.spawnT <= 0 && civCount < maxPed * nightK) { this.spawnT = 0.25; this.spawnCivilian(p.pos.x, p.pos.z); }
    }
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const n = L[i];
      if (!n) continue;
      const dx = n.pos.x - p.pos.x, dz = n.pos.z - p.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (n.removeMe || (!n.mission && !n.persistent && d > 170 && !p.inInterior) || (n.dead && n.removeT <= 0)) { this.remove(n); continue; }
      if (d > 140 && !n.mission && !n.persistent) { if (n.model.root.visible) n.model.root.visible = false; continue; }
      // kalabalık LOD: uzaktakiler seyrek, 60 m ötesinde animasyonsuz
      const busy = n.state === 'attack' || n.state === 'arrest' || n.state === 'move' || n.mission;
      const vis = (d < 130 || !!n.mission) && !n.vehicle;
      if (n.model.root.visible !== vis) n.model.root.visible = vis;
      if (d > 60 && !(busy && d < 100)) {
        n.lodAcc += dt;
        const step = d > 100 ? 0.5 : 0.22;
        if (n.lodAcc < step) continue;
        n.update(Math.min(n.lodAcc, 0.5), false);
        n.lodAcc = 0;
        continue;
      }
      n.lodAcc = 0;
      n.update(dt, true);
    }
    this.carHits();
  }

  // araç - yaya çarpışması: OBB (aracın içine girilmez), süpürülmüş test, bekleme süresiyle tek darbe
  carHits() {
    const g = this.game;
    const dt = g.dt || 1 / 60;
    const p = g.player;
    if (p.carHitT > 0) p.carHitT -= dt;
    for (const v of g.vehicles.list) {
      if (v.kind !== 'car' || v.pos.y > 1.5 || v.sinking > 0) continue;
      const R = v.def.len * 0.5 + 1 + Math.hypot(v.vx, v.vz) * dt;
      const cand = this.neighborsBox(v.pos.x, v.pos.z, R);
      for (let i = 0; i < cand.length; i++) {
        const a = cand[i];
        if (a.dead || a.vehicle || a.inInterior || a.vault) continue;
        if (a.isPlayer && (p.vehicle || p.dead)) continue;
        const sp = actorVsVehicle(g, v, a, dt);
        if (sp <= 0) continue;
        const f = v.fwd;
        const dmg = sp * sp * 0.35 + sp * 2;
        a.takeDamage(dmg, v.driver, 'car');
        const dx = a.pos.x - v.pos.x, dz = a.pos.z - v.pos.z, lat = dx * -f.z + dz * f.x;
        a.knock = { x: v.vx * 0.6 + (lat > 0 ? -f.z : f.z) * 3, z: v.vz * 0.6 + (lat > 0 ? f.x : -f.x) * 3, t: 0.4 };
        audio.punch(a.pos.x, a.pos.z);
        g.particles.blood({ x: a.pos.x, y: 1, z: a.pos.z }, 6);
        const m = v.def.mass || v.def.len * v.def.wid * 150;
        const k = m / (m + 80);
        v.vx *= k; v.vz *= k;
        if (a.isPlayer) g.ui.damageFlash();
        if (v.driver && v.driver.isPlayer && !a.dead && a.faction === 'civilian') g.wanted.crime('hit_ped', a.pos);
        if (!a.dead && a.hearThreat) a.hearThreat(v.driver || g.player, 2);
      }
    }
  }
  // kutu içindeki aktörler (ızgaradan)
  neighborsBox(x, z, R) {
    const out = this._nbb || (this._nbb = []);
    out.length = 0;
    const c0x = Math.floor((x - R) / 2), c1x = Math.floor((x + R) / 2), c0z = Math.floor((z - R) / 2), c1z = Math.floor((z + R) / 2);
    for (let i = c0x; i <= c1x; i++) for (let j = c0z; j <= c1z; j++) {
      const arr = this.hash.get((i + 2048) * 4096 + j + 2048);
      if (arr) for (let k = 0; k < arr.length; k++) out.push(arr[k]);
    }
    return out;
  }
}

export { clamp, rng };
