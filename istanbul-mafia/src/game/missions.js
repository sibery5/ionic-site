// Hikâye görevleri, sokak yarışları, bölge savaşları ve dünya işaretçileri.
import * as THREE from 'three';
import { formatMoney, rng } from '../core/util.js';
import { randomLook } from '../entities/character.js';
import { GANGS } from './economy.js';

const markerGeo = new THREE.CylinderGeometry(1.2, 1.2, 2.5, 24, 1, true);
const arrowGeo = new THREE.ConeGeometry(0.5, 1, 4);
arrowGeo.rotateX(Math.PI);

export const STORY = [
  {
    id: 'eve_donus', title: 'Eve Dönüş', reward: 500, respect: 20,
    brief: 'Yıllar sonra cezaevinden çıktın. Reis Baba seni Beyoğlu\'ndaki konağında bekliyor.',
    start(M) { M.goto(M.special('konak'), 'Reis Baba\'nın konağına git'); },
    update(M) {
      if (M.stage === 0 && M.g.player.inInterior && M.g.player.inInterior.type === 'konak') {
        M.stage = 1;
        M.dialog([
          ['Reis Baba', 'Hoş geldin evlat. Yedi yıl... Sen içerideyken bu şehir çok değişti.'],
          ['Reis Baba', 'Kartallar Beşiktaş\'ı, Yılanlar Beyoğlu\'nun arka sokaklarını tuttu. Çarşı Ailesi Fatih\'te, Boğaz Kardeşler Kadıköy\'de at koşturuyor.'],
          ['Reis Baba', 'Ama İstanbul bizimdi, yine bizim olacak. Önce kendini kanıtla. Sana bir ev ayarladım, anahtar cebinde.'],
          ['Sen', 'Emrin olur Reis. Nereden başlıyoruz?'],
          ['Reis Baba', 'Biraz dolaş, şehrin havasını kokla. Hazır olunca gel, sana iş vereyim.'],
        ], () => M.complete());
      }
      return null;
    },
  },
  {
    id: 'harac', title: 'Haraç Turu', reward: 3000, respect: 60,
    brief: 'Mahalle esnafından bu ayın haracını topla. Kimseyi incitme... gerekmedikçe.',
    start(M) {
      const shops = M.g.map.specials.filter((b) => b.type === 'food' || b.type === 'clothes' || b.type === 'cafe');
      const p = M.g.player.pos;
      shops.sort((a, b) => Math.hypot(a.door.x - p.x, a.door.z - p.z) - Math.hypot(b.door.x - p.x, b.door.z - p.z));
      M.data.shops = shops.slice(0, 3);
      M.data.done = 0;
      M.nextHarac();
    },
    update(M) {
      const g = M.g;
      if (M.stage === 0) {
        const s = M.data.shops[M.data.done];
        const d = Math.hypot(g.player.pos.x - s.door.x, g.player.pos.z - (s.door.z + s.door.nz));
        if (d < 3.5 && !g.player.vehicle && !g.player.inInterior) {
          M.prompt('Haracı topla', () => {
            M.data.done++;
            if (M.data.done < 3) { g.state.money += 800; g.audio.cash(); g.ui.notify('+₺800 haraç', 'money'); M.nextHarac(); }
            else {
              M.stage = 1;
              g.ui.bark(g.player, 'Bu ay ödeme yok mu? Yanlış adama kafa tuttun.');
              M.dialog([['Esnaf', 'Ödemiyorum! Yılanlar\'a zaten veriyorum, size verecek param yok!'], ['Sen', 'Demek Yılanlar... Gelsinler bakalım.']], () => {
                M.data.thugs = [];
                for (let i = 0; i < 3; i++) {
                  const look = randomLook(rng, 'gang');
                  look.topColor = GANGS.yilanlar.color;
                  const n = g.npcs.add('gang', s.door.x + (i - 1) * 3, s.door.z + s.door.nz * 12, look, { gang: 'yilanlar', mission: true, hostile: true, weapon: i === 0 ? 'bat' : 'pistol' });
                  n.state = 'attack'; n.target = g.player;
                  M.data.thugs.push(n);
                }
                M.setMarkers(M.data.thugs.map((n) => ({ actor: n, color: 0xff3030 })));
                M.objective('Yılanlar\'ın tetikçilerini hallet');
              });
            }
          });
        }
      } else if (M.stage === 1 && M.data.thugs) {
        if (M.data.thugs.every((n) => n.dead)) { g.state.money += 1200; return 'done'; }
      }
      return null;
    },
  },
  {
    id: 'karabasan', title: 'Karabasan Teslimatı', reward: 8000, respect: 90,
    brief: 'Kartallar\'ın siyah SUV\'unu çal ve 4 dakika içinde Kadıköy\'deki oto tamirciye teslim et. Boğaz Köprüsü seni bekliyor.',
    start(M) {
      const g = M.g;
      const spot = g.map.nearestNode(-520, -620);
      const car = g.vehicles.add('suv', spot.x + 6, spot.z + 2, 0, '#0a0a0a');
      car.mission = true; car.parked = true;
      M.data.car = car;
      M.data.guards = [];
      for (let i = 0; i < 2; i++) {
        const look = randomLook(rng, 'gang');
        look.topColor = GANGS.kartallar.color;
        const n = g.npcs.add('gang', spot.x + 9, spot.z + 4 + i * 2, look, { gang: 'kartallar', mission: true, state: 'guard', home: new THREE.Vector3(spot.x + 9, 0, spot.z + 4 + i * 2) });
        n.hostile = true;
        M.data.guards.push(n);
      }
      M.setMarkers([{ vehicle: car, color: 0x3080ff }]);
      M.objective('Siyah Karabasan SUV\'u bul ve çal (Beşiktaş)');
    },
    update(M) {
      const g = M.g;
      const car = M.data.car;
      if (!car || car.destroyed || car.sinking > 0) return 'fail:Araç hasar gördü!';
      if (M.stage === 0 && g.player.vehicle === car) {
        M.stage = 1; M.timer = 240;
        const garage = M.special('garage');
        M.data.garage = garage;
        M.goto(garage, 'Aracı Kadıköy\'deki tamirciye götür', 8);
        g.wanted.add(1, true);
      }
      if (M.stage === 1) {
        if (M.timer <= 0) return 'fail:Süre doldu!';
        const gd = M.data.garage.door;
        if (g.player.vehicle === car && Math.hypot(car.pos.x - gd.x, car.pos.z - (gd.z + gd.nz * 6)) < 10 && Math.abs(car.fs) < 3) {
          if (g.wanted.level > 0) { M.objective('Önce polisleri atlat!'); return null; }
          g.vehicles.ejectDriver(car);
          car.ai = { empty: true }; car.parked = true;
          setTimeout(() => g.vehicles.remove(car), 1500);
          const bonus = Math.floor(car.hp / car.def.hp * 4000);
          g.state.money += bonus;
          g.ui.notify(`Araç durumu bonusu: +${formatMoney(bonus)}`, 'money');
          return 'done';
        }
      }
      return null;
    },
  },
  {
    id: 'liman', title: 'Liman Baskını', reward: 15000, respect: 140,
    brief: 'Çarşı Ailesi Eminönü\'ndeki depoda silah sevkiyatı saklıyor. Depoya gir, bekçileri temizle, sandığı al ve güvenli eve dön.',
    start(M) { M.goto(M.special('warehouse', -40, 250), 'Eminönü\'ndeki depoya git'); M.data.inside = false; },
    update(M) {
      const g = M.g;
      if (M.stage === 0 && g.player.inInterior && g.player.inInterior.type === 'warehouse' && g.player.inInterior.building === M.data.target) {
        M.stage = 1; M.objective('Depodaki bekçileri etkisiz hale getir');
      }
      if (M.stage === 1 && M.data.guards && M.data.guards.every((n) => n.dead)) {
        M.stage = 2; M.objective('Silah sandığını al');
      }
      if (M.stage === 3 && !g.player.inInterior) {
        M.stage = 4; g.wanted.add(2, true);
        M.goto(M.special('safehouse'), 'Güvenli eve dön (polis peşinde!)');
      }
      if (M.stage === 4 && g.player.inInterior && g.player.inInterior.type === 'safehouse') {
        g.player.giveWeapon('ak', 120); g.ui.notify('Kalaşnikof + 120 mermi', 'good');
        return 'done';
      }
      return null;
    },
    onPopulate(M, ctx, I) {
      if (ctx.building !== M.data.target) return;
      M.data.guards = [];
      const pos = [[-8, -6], [-4, 2], [0, -7], [5, -3], [8, 3], [-9, 4], [3, 5], [9, -7]];
      for (const [x, z] of pos) {
        const look = randomLook(ctx.rng, 'gang'); look.topColor = GANGS.carsi.color;
        const n = I.npc(ctx, 'guard', x, z, Math.random() * 6, { gang: 'carsi', mission: true, weapon: Math.random() < 0.5 ? 'uzi' : 'pistol', look });
        n.hostile = true; n.static = false;
        M.data.guards.push(n);
      }
      const crate = I.box(ctx, 1.2, 0.8, 0.8, 0, 0, -8.5, new THREE.MeshStandardMaterial({ color: 0x4a5a30 }));
      ctx.interact.push({
        x: 0, z: -7.6, r: 1.5, label: 'Silah sandığını al', cond: () => M.stage === 2, action: () => {
          ctx.scene.remove(crate);
          M.stage = 3; M.objective('Depodan çık');
          g_notify(M, 'Sandık alındı!');
        },
      });
    },
  },
  {
    id: 'hain', title: 'Hain', reward: 20000, respect: 180,
    brief: 'Ailenin muhasebecisi Sinan bizi Kartallar\'a satmış. Üsküdar sahilinde. Kaçmasına izin verme.',
    start(M) {
      const g = M.g;
      const node = g.map.nearestNode(600, -650);
      const look = randomLook(rng, 'civilian');
      Object.assign(look, { top: 'suit', topColor: '#5a4a3a', glasses: true, hair: 'kel', beard: 'mustache' });
      const t = g.npcs.add('civilian', node.x + 9, node.z + 9, look, { mission: true, name: 'Hain Sinan', hp: 140, state: 'idle', home: new THREE.Vector3(node.x + 9, 0, node.z + 9) });
      t.brave = false;
      M.data.traitor = t;
      M.data.guards = [];
      for (let i = 0; i < 3; i++) {
        const l = randomLook(rng, 'gang');
        l.topColor = GANGS.kartallar.color;
        const n = g.npcs.add('gang', node.x + 7 + i * 2, node.z + 12, l, { gang: 'kartallar', mission: true, state: 'guard', home: new THREE.Vector3(node.x + 7 + i * 2, 0, node.z + 12), weapon: 'uzi' });
        n.hostile = true;
        M.data.guards.push(n);
      }
      const car = g.vehicles.add('sedan', node.x + 12, node.z + 4, 0, '#6a6a6a');
      car.mission = true; car.parked = true;
      M.data.car = car;
      M.setMarkers([{ actor: t, color: 0xff3030 }]);
      M.objective('Hain Sinan\'ı bul (Üsküdar)');
    },
    update(M) {
      const g = M.g;
      const t = M.data.traitor, car = M.data.car;
      if (t.dead) return 'done';
      const d = Math.hypot(g.player.pos.x - t.pos.x, g.player.pos.z - t.pos.z);
      if (M.stage === 0 && d < 45) {
        M.stage = 1;
        g.ui.bark(t, 'O burada! Kaçmam lazım!');
        M.objective('Hain kaçıyor! Onu durdur!');
        if (car && !car.destroyed) {
          // haini arabaya bindir ve kaçır
          t.vehicle = car; t.model.root.visible = false; car.driver = null;
          car.ai = { mode: 'traffic', from: g.map.nearestNode(car.pos.x, car.pos.z), to: null, next: null, cruise: 26, panic: 999 };
          const n0 = car.ai.from; car.ai.to = g.map.other(n0.edges[0], n0); car.ai.next = g.vehicles.chooseNext(car.ai.to, n0);
          car.parked = false;
          M.setMarkers([{ vehicle: car, color: 0xff3030 }]);
          M.data.fleeing = true;
        }
      }
      if (M.data.fleeing && car) {
        if (car.destroyed || car.hp < car.def.hp * 0.25 || car.sinking > 0) {
          // hain arabadan iner
          t.vehicle = null; t.model.root.visible = true; car.ai = { empty: true };
          t.pos.set(car.pos.x + 2, 0, car.pos.z); t.state = 'flee'; t.fleeT = 60; t.fleeFrom = g.player.pos.clone();
          if (car.destroyed) t.takeDamage(999, g.player, 'explosion');
          M.data.fleeing = false;
          M.setMarkers([{ actor: t, color: 0xff3030 }]);
        } else { t.pos.copy(car.pos); }
        const fd = Math.hypot(g.player.pos.x - car.pos.x, g.player.pos.z - car.pos.z);
        if (fd > 300) return 'fail:Hain kaçtı!';
      }
      return null;
    },
  },
  {
    id: 'altin', title: 'Kapalıçarşı Pazarlığı', reward: 10000, respect: 120,
    brief: 'Ailenin kasasını büyütme zamanı. Kapalıçarşı\'dan en az 5 külçe altın al ve Kadıköy karaborsasında kârla sat.',
    start(M) { M.data.bought = 0; M.data.sold = 0; M.goto(M.landmarkDoor('bazaar'), 'Kapalıçarşı\'ya git ve 5 külçe altın al'); },
    update(M) {
      if (M.stage === 0 && M.data.bought >= 5) { M.stage = 1; M.goto(M.special('trade', 560, 650), 'Altınları Kadıköy karaborsasında sat'); }
      if (M.stage === 1 && M.data.sold >= 5) return 'done';
      return null;
    },
    onTrade(M, good, qty, action, district) {
      if (good !== 'altin') return;
      if (action === 'buy' && M.stage === 0) M.data.bought += qty;
      if (action === 'sell' && M.stage === 1 && district === 'kadikoy') M.data.sold += qty;
    },
  },
  {
    id: 'yaris', title: 'Sokak Yarışı: Kadıköy Turu', reward: 25000, respect: 150,
    brief: 'Boğaz Kardeşler\'in elebaşı Deli Murat seni yarışa davet etti. Birinci gel, saygıyı kazan.',
    start(M) { M.startRace('kadikoy'); },
    update(M) { return M.updateRace(); },
  },
  {
    id: 'final', title: 'Boğaz\'ın Kralı', reward: 100000, respect: 600,
    brief: 'Kartallar\'ın lideri Doğan Bey, Beşiktaş\'taki köşkünde. Bu savaşı bitir; İstanbul\'un tek bir babası olacak.',
    start(M) { M.goto(M.special('rival'), 'Doğan Bey\'in köşküne baskın yap'); },
    update(M) {
      const g = M.g;
      if (M.stage === 0 && g.player.inInterior && g.player.inInterior.type === 'rival') { M.stage = 1; M.objective('Doğan Bey\'i öldür'); }
      if (M.stage === 1 && M.data.boss && M.data.boss.dead) {
        M.stage = 2;
        g.state.territories.kartallar = true;
        M.dialog([
          ['Reis Baba', 'Duydum evlat... Doğan bitti. Artık Boğaz\'ın iki yakası da bize selam veriyor.'],
          ['Reis Baba', 'Ben yaşlandım. Bundan sonra aile senin. İstanbul senin.'],
          ['Sen', 'Bu şehir kimsenin değil Reis. Ama bundan sonra kurallar bizim.'],
        ], () => M.complete());
      }
      return null;
    },
    onPopulate(M, ctx, I) {
      if (M.stage < 1 && ctx.type !== 'rival') return;
      M.data.enemies = [];
      for (let i = 0; i < 10; i++) {
        const look = randomLook(ctx.rng, 'gang'); look.topColor = '#e8e8e8'; look.top = 'suit';
        const n = I.npc(ctx, 'guard', -7 + (i % 5) * 3.5, -4 + Math.floor(i / 5) * 7, Math.PI, { gang: 'kartallar', mission: true, weapon: i % 3 === 0 ? 'shotgun' : i % 3 === 1 ? 'ak' : 'uzi', look });
        n.hostile = true; n.static = false; n.state = 'attack'; n.target = M.g.player;
        M.data.enemies.push(n);
      }
      const boss = I.npc(ctx, 'boss', 0, -6.5, 0, { name: 'Doğan Bey', mission: true, weapon: 'm4', hp: 700, look: { ...randomLook(ctx.rng, 'boss'), topColor: '#e8e8e8', hatColor: '#e8e8e8' } });
      boss.hostile = true; boss.static = false; boss.state = 'attack'; boss.target = M.g.player; boss.gang = 'kartallar';
      M.data.boss = boss;
      M.setMarkers([{ actor: boss, color: 0xff3030 }]);
    },
  },
];

function g_notify(M, t) { M.g.ui.notify(t, 'good'); }

export class Missions {
  constructor(game) {
    this.g = game;
    this.active = null;
    this.stage = 0;
    this.data = {};
    this.markers = [];
    this.markerMeshes = [];
    this.timer = 0;
    this.pendingPrompt = null;
    this.race = null;
    this.group = new THREE.Group();
    game.scene.add(this.group);
  }

  get index() { return this.g.state.storyIndex; }

  special(type, x, z) {
    const p = this.g.player.pos;
    return this.g.map.nearestOfType(type, x ?? p.x, z ?? p.z);
  }
  landmarkDoor(type) {
    const d = this.g.city.doors.find((dd) => dd.building.type === type);
    return d ? { door: { x: d.x, z: d.z, nz: 0 }, type } : null;
  }

  objective(text) { this.objText = text; this.g.ui.setObjective(text); }
  goto(b, text, r = 3) {
    if (!b) return;
    this.data.target = b;
    const dz = b.door.nz || 0;
    this.setMarkers([{ x: b.door.x, z: b.door.z + dz * 1.0, color: 0xffcc00, r }]);
    this.objective(text);
    this.g.setGps(b.door.x, b.door.z + dz * 1.5);
  }
  setMarkers(list) {
    this.markers = list;
    for (const m of this.markerMeshes) m.parent && m.parent.remove(m);
    this.markerMeshes = list.map((mk) => {
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
  dialog(lines, done) { this.g.ui.dialog(lines.map(([who, text]) => ({ who, text })), done); }
  prompt(label, action) { this.pendingPrompt = { label, action }; }

  nextHarac() {
    const s = this.data.shops[this.data.done];
    this.setMarkers([{ x: s.door.x, z: s.door.z + s.door.nz * 1.0, color: 0xffcc00, r: 3 }]);
    this.objective(`Haraç topla (${this.data.done + 1}/3)`);
    this.g.setGps(s.door.x, s.door.z + s.door.nz * 2);
  }

  // Reis Baba ile konuşma: sıradaki görevi başlat
  talkToGiver() {
    const g = this.g;
    if (this.active) { g.ui.notify('Önce elindeki işi bitir: ' + this.active.title, 'warn'); return; }
    const def = STORY[this.index];
    if (!def) {
      this.dialog([['Reis Baba', 'İstanbul artık senin evlat. Bölgeleri koru, işletmelerini büyüt. Kapım sana her zaman açık.']]);
      return;
    }
    this.dialog([['Reis Baba', def.brief]], () => g.ui.confirm(`Görev: ${def.title}`, `Ödül: ${formatMoney(def.reward)} · Saygınlık +${def.respect}`, 'Kabul Et', () => this.start(def)));
  }

  start(def) {
    this.active = def; this.stage = 0; this.data = {}; this.timer = 0;
    this.g.ui.bigMessage(def.title.toUpperCase(), 'Görev Başladı', 'gold', 2.5);
    def.start(this);
  }

  complete() {
    const g = this.g, def = this.active;
    if (!def) return;
    g.state.money += def.reward;
    g.state.respect += def.respect;
    g.state.completed.push(def.id);
    g.state.storyIndex = Math.max(g.state.storyIndex, STORY.indexOf(def) + 1);
    g.audio.success();
    g.ui.bigMessage('GÖREV TAMAMLANDI', `${def.title}  ·  +${formatMoney(def.reward)}  ·  Saygınlık +${def.respect}`, 'gold', 4);
    this.cleanup();
    g.autosave();
    if (def.id === 'final') setTimeout(() => g.ui.credits(), 4500);
  }
  fail(reason) {
    const g = this.g, def = this.active;
    if (!def) return;
    g.audio.fail();
    g.ui.bigMessage('GÖREV BAŞARISIZ', reason || def.title, 'red', 3.5);
    this.cleanup();
  }
  cleanup() {
    const g = this.g;
    for (const k of ['thugs', 'guards', 'enemies']) if (this.data[k]) for (const n of this.data[k]) { n.mission = false; }
    if (this.data.traitor) this.data.traitor.mission = false;
    if (this.data.boss) this.data.boss.mission = false;
    if (this.data.car && !this.data.car.destroyed) this.data.car.mission = false;
    if (this.race) this.endRace();
    this.active = null; this.data = {}; this.timer = 0;
    this.setMarkers([]);
    this.objText = '';
    g.ui.setObjective('');
    g.setGps(null);
  }

  onKill(n) { void n; }
  onEnter(ctx) { if (this.active && this.active.onPopulate && ctx.type !== 'warehouse' && ctx.type !== 'rival') this.active.onPopulate(this, ctx, this.g.interiors); }
  onExit() {}
  onTrade(good, qty, action, district) { if (this.active && this.active.onTrade) this.active.onTrade(this, good, qty, action, district); }
  onPlayerDown() { if (this.active) this.fail(this.active.id === 'yaris' ? 'Yarış iptal' : 'Görev iptal oldu'); }

  populateWarehouse(ctx, I) { if (this.active && this.active.onPopulate) this.active.onPopulate(this, ctx, I); }
  populateRival(ctx, I) {
    if (this.active && this.active.id === 'final') this.active.onPopulate(this, ctx, I);
    else {
      // görev dışı: köşk korumaları
      for (let i = 0; i < 4; i++) { const n = I.npc(ctx, 'guard', -4 + i * 2.6, 0, Math.PI, { gang: 'kartallar' }); n.static = false; }
    }
  }

  // ---------------- Sokak yarışı ----------------
  startRace(district) {
    const g = this.g;
    const start = district === 'kadikoy' ? g.map.nearestNode(560, 700) : g.map.nearestNode(-300, -600);
    const end = district === 'kadikoy' ? g.map.nearestNode(900, -200) : g.map.nearestNode(-800, 600);
    const path = g.map.path(start.x, start.z, end.x, end.z);
    // ara noktaları seyrelt
    const pts = path.map((n) => ({ x: n.x, z: n.z }));
    const e0 = path[1] || path[0];
    const dx = e0.x - start.x, dz = e0.z - start.z, l = Math.hypot(dx, dz) || 1;
    const fx = dx / l, fz = dz / l;
    const h = Math.atan2(fx, fz);
    this.race = { pts, idx: 1, cars: [], countdown: 4, started: false, finished: [] };
    this.stage = 0;
    // oyuncu aracı
    if (g.player.vehicle) g.vehicles.ejectDriver(g.player.vehicle);
    const pc = g.vehicles.add('gt', start.x + -fz * 2.5 + fx * 3, start.z + fx * 2.5 + fz * 3, h, '#c81010');
    pc.mission = true;
    g.enterVehicle(pc, true);
    this.race.playerCar = pc;
    const colors = ['#1060c8', '#f2c200', '#111111'];
    for (let i = 0; i < 3; i++) {
      const c = g.vehicles.add(i === 2 ? 'sedan' : 'gt', start.x + -fz * (i % 2 ? 2.5 : -2.5) - fx * (4 + i * 6), start.z + fx * (i % 2 ? 2.5 : -2.5) - fz * (4 + i * 6), h, colors[i]);
      c.mission = true;
      c.ai = { mode: 'race', points: pts.slice(1), idx: 0, skill: 0.72 + i * 0.05, frozen: true };
      this.race.cars.push(c);
    }
    this.objective('Yarış başlıyor...');
    this.raceMarkers();
  }
  raceMarkers() {
    const r = this.race;
    const list = [];
    for (let i = r.idx; i < Math.min(r.pts.length, r.idx + 2); i++) list.push({ x: r.pts[i].x, z: r.pts[i].z, color: i === r.pts.length - 1 ? 0xffffff : i === r.idx ? 0xffcc00 : 0x886600, r: 7 });
    this.setMarkers(list);
    const n = r.pts[r.idx];
    if (n) this.g.setGps(n.x, n.z);
  }
  updateRace() {
    const g = this.g, r = this.race;
    if (!r) return null;
    if (!r.started) {
      const prev = Math.ceil(r.countdown);
      r.countdown -= g.dt;
      const now = Math.ceil(r.countdown);
      for (const c of r.cars) { c.controls.throttle = 0; c.vx = c.vz = 0; }
      if (r.playerCar) { r.playerCar.vx = r.playerCar.vz = 0; }
      if (now !== prev && now > 0) { g.ui.bigMessage(String(now), '', 'gold', 0.8); g.audio.tone({ freq: 440, dur: 0.2, type: 'square', gain: 0.2 }); }
      if (r.countdown <= 0) {
        r.started = true; g.ui.bigMessage('BAŞLA!', '', 'gold', 1); g.audio.tone({ freq: 880, dur: 0.5, type: 'square', gain: 0.25 });
        for (const c of r.cars) c.ai.frozen = false;
        this.objective(`Kontrol noktası ${r.idx}/${r.pts.length - 1}`);
      }
      return null;
    }
    const pc = g.player.vehicle;
    if (!pc) return 'fail:Araçtan indin!';
    const cp = r.pts[r.idx];
    if (Math.hypot(pc.pos.x - cp.x, pc.pos.z - cp.z) < 14) {
      r.idx++;
      g.audio.tone({ freq: 1200, dur: 0.12, type: 'triangle', gain: 0.2 });
      if (r.idx >= r.pts.length) {
        const place = 1 + r.cars.filter((c) => c.ai.finished).length;
        this.endRace();
        if (place === 1) return 'done';
        return `fail:${place}. oldun. Sadece birinci kazanır!`;
      }
      this.raceMarkers();
      this.objective(`Kontrol noktası ${r.idx}/${r.pts.length - 1}`);
    }
    for (const c of r.cars) {
      if (c.ai.finished && !r.finished.includes(c)) r.finished.push(c);
    }
    // sıralama
    const myScore = r.idx * 10000 - Math.hypot(pc.pos.x - cp.x, pc.pos.z - cp.z);
    let place = 1;
    for (const c of r.cars) {
      const t = c.ai.points[c.ai.idx] || cp;
      const sc = (c.ai.idx + 1) * 10000 - Math.hypot(c.pos.x - t.x, c.pos.z - t.z) + (c.ai.finished ? 1e6 : 0);
      if (sc > myScore) place++;
    }
    g.ui.setRacePos(place, 4);
    return null;
  }
  endRace() {
    const r = this.race;
    if (!r) return;
    for (const c of r.cars) { c.mission = false; if (c.ai) c.ai = { mode: 'traffic', from: this.g.map.nearestNode(c.pos.x, c.pos.z), to: null, next: null, cruise: 12 }; const n = c.ai.from; c.ai.to = this.g.map.other(n.edges[0], n); c.ai.next = this.g.vehicles.chooseNext(c.ai.to, n); }
    if (r.playerCar) r.playerCar.mission = false;
    this.race = null;
    this.g.ui.setRacePos(0);
  }

  update(dt) {
    const g = this.g;
    this.pendingPrompt = null;
    // görev yoksa Reis'in kapısında işaret
    if (!this.active) {
      const konak = this.g.map.nearestOfType('konak', 0, 0);
      if (STORY[this.index] && konak && !this.markers.length && !g.player.inInterior) {
        this.setMarkers([{ x: konak.door.x, z: konak.door.z + konak.door.nz, color: 0xffcc00, r: 2, giver: true }]);
        if (!this.objText) this.objective(this.index === 0 ? 'Reis Baba\'nın konağına git' : 'Yeni iş için Reis Baba\'ya uğra (sarı R)');
      }
      if (this.index === 0 && !this.active) this.start(STORY[0]);
    } else {
      if (this.timer > 0) { this.timer -= dt; g.ui.setTimer(this.timer); } else g.ui.setTimer(0);
      const r = this.active.update(this, dt);
      if (r === 'done') this.complete();
      else if (typeof r === 'string' && r.startsWith('fail')) this.fail(r.slice(5));
    }
    // işaretçi animasyonu
    const t = performance.now() * 0.001;
    this.group.visible = !g.player.inInterior;
    this.markers.forEach((mk, i) => {
      const m = this.markerMeshes[i];
      if (!m) return;
      let x = mk.x, z = mk.z, y = 0;
      if (mk.actor) { x = mk.actor.pos.x; z = mk.actor.pos.z; y = mk.actor.pos.y + 0.5; m.visible = !mk.actor.dead && !mk.actor.inInterior; }
      if (mk.vehicle) { x = mk.vehicle.pos.x; z = mk.vehicle.pos.z; y = mk.vehicle.def.hei; m.visible = !mk.vehicle.destroyed && g.player.vehicle !== mk.vehicle; }
      m.position.set(x, y, z);
      m.userData.arrow.position.y = 3.5 + Math.sin(t * 3) * 0.3;
      m.userData.arrow.rotation.y = t * 2;
    });
  }
}
