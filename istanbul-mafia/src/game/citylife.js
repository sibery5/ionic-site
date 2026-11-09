// [şehir] Şehir hayatı: bakkal/market/kafe alışverişi (küçük can), iç mekân oturma-yatma (kanepe, berjer,
// sandalye, yatak: E ile otur/uzan, E ya da WASD ile kalk), semt kafelerinin dış masa teraslarını kurar ve
// yakındaki kafeleri çay/kahve içen gruplarla doldurur (karışık çift, iki erkek, iki kadın, tek başına).
// main.js yalnızca: placeCityShops (harita sonrası), buildCafeTerraces (parklar sonrası), new CityLife, prompt(), update().
import * as THREE from 'three';
import { GROCERY } from './shop_interiors.js';
import { CAFES, CITY_SHOPS, cafeOnLot } from '../world/city_shops.js';
import { GeoBuilder } from '../world/instancer.js';
import { lookOf } from './crowd.js';
import { formatMoney } from '../core/util.js';
import { $, el } from '../ui/dom.js';

const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const SEAT_LABEL = { sofa: 'Kanepeye otur', armchair: 'Berjere otur', chair: 'Sandalyeye otur', bench: 'Banka otur', bed: 'Yatağa uzan' };
const GROUP_KINDS = ['mf', 'mm', 'ff', 'single', 'mf', 'mm', 'ff', 'mf'];

// ---------------------------------------------------------------- kafe terasları (dünya kurulurken)
export function buildCafeTerraces(city) {
  const cols = city.physics.city, out = [];
  for (const c of CAFES) {
    const gb = new GeoBuilder(), t = c.terrace, y = 0.15, nz = c.nz;
    const tint = [0x8a1a1a, 0x1d5a2d, 0x1d3d6e, 0xc98a1a, 0x5a2d5a][c.b.colorIdx % 5];
    // ahşap deck
    gb.box(t.x1 - t.x0, 0.04, t.z1 - t.z0, { x: (t.x0 + t.x1) / 2, y, z: (t.z0 + t.z1) / 2, uv: 'wood', color: 0xb08a60, rough: 0.8 });
    // tente (cepheden sarkan, çizgili)
    const fz = nz > 0 ? t.z0 : t.z1, dep = t.z1 - t.z0;
    for (let x = t.x0; x < t.x1 - 0.01; x += 0.5) {
      const w = Math.min(0.5, t.x1 - x);
      gb.box(w, 0.04, dep * 0.8, { x: x + w / 2, y: 2.5, z: fz + nz * dep * 0.4, rx: nz * 0.16, color: Math.round((x - t.x0) / 0.5) % 2 ? 0xf2efe6 : tint, rough: 0.9 });
    }
    gb.box(t.x1 - t.x0, 0.22, 0.04, { x: (t.x0 + t.x1) / 2, y: 2.05, z: fz + nz * dep * 0.8, color: tint, rough: 0.9 });
    // masalar ve sandalyeler
    for (const tb of c.tables) {
      gb.cyl(0.36, 0.36, 0.03, 18, { x: tb.x, y: y + 0.72, z: tb.z, color: 0xe8e4dc, rough: 0.25 });
      gb.cyl(0.03, 0.03, 0.72, 6, { x: tb.x, y, z: tb.z, color: 0x2a2a2a, metal: 0.7 });
      gb.cyl(0.2, 0.22, 0.03, 10, { x: tb.x, y, z: tb.z, color: 0x2a2a2a, metal: 0.7 });
      cols.addCircle(tb.x, tb.z, 0.36, y, y + 0.76, 'table');
    }
    for (const s of c.seats) {
      const cx = s.x - Math.sin(s.heading) * 0.05, cz = s.z - Math.cos(s.heading) * 0.05, ry = s.heading;
      gb.box(0.42, 0.05, 0.4, { x: cx, y: y + 0.42, z: cz, ry, color: 0x9a6a3a, rough: 0.9 });
      const bx = cx - Math.sin(ry) * 0.19, bz = cz - Math.cos(ry) * 0.19;
      gb.box(0.42, 0.42, 0.04, { x: bx, y: y + 0.47, z: bz, ry, color: 0x8a5a2a, rough: 0.9 });
      for (const [a, b] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) {
        const lx = cx + a * Math.cos(ry) + b * Math.sin(ry), lz = cz - a * Math.sin(ry) + b * Math.cos(ry);
        gb.box(0.03, 0.42, 0.03, { x: lx, y, z: lz, color: 0x2a2a2a, metal: 0.7 });
      }
    }
    // saksılar (kaldırım sınırı) + menü panosu
    for (const p of c.planters) {
      gb.box(0.9, 0.5, 0.4, { x: p.x, y, z: p.z, color: 0x6a6a64, rough: 0.9 });
      for (let i = 0; i < 3; i++) gb.sphere(0.24, { x: p.x - 0.25 + i * 0.25, y: y + 0.66, z: p.z, color: 0x3a7a32, rough: 0.9 }, 7, 5);
      cols.add(p.x - 0.45, p.z - 0.2, p.x + 0.45, p.z + 0.2, y, y + 0.6, 'planter');
    }
    const mx = c.b.door.x + 1.1, mz = fz + nz * (dep - 0.35);
    gb.box(0.6, 0.9, 0.06, { x: mx, y, z: mz, rx: 0.15, color: 0x1e2420, rough: 0.9 });
    const geo = gb.build();
    const mesh = new THREE.Mesh(geo, city.propsMat); mesh.castShadow = city.quality !== 'low'; mesh.receiveShadow = true;
    city.group.add(mesh);
    // oturma yerleri: Seating (city.seats) üzerinden oyuncu oturabilir
    for (const s of c.seats) {
      const st = { x: s.x, y, z: s.z, heading: s.heading, kind: 'kafe', bench: -1, bx: s.x, bz: s.z, actor: null, cafe: c };
      s.st = st;
      (city.seats || (city.seats = [])).push(st);
      if (city.seatGrid) { const k = Math.floor(st.x / 16) * 4096 + Math.floor(st.z / 16); let a = city.seatGrid.get(k); if (!a) city.seatGrid.set(k, (a = [])); a.push(st); }
    }
    // gece: tente altı sıcak ışık
    if (city.addLight) city.addLight((t.x0 + t.x1) / 2, 2.6, fz + nz * dep * 0.5, 0xffc27a, 0.8, true);
    out.push(mesh);
  }
  return out;
}

// ---------------------------------------------------------------- içecek (bardak/fincan) + yudum jesti
const CUPS = {};
function cupMesh(kind) {
  if (!CUPS[kind]) {
    const gb = new GeoBuilder();
    if (kind === 'cay') { gb.cyl(0.024, 0.02, 0.075, 10, { color: 0xb8461a, rough: 0.15 }); gb.cyl(0.04, 0.04, 0.006, 12, { y: -0.004, color: 0xf2f2f2, rough: 0.3 }); }
    else { gb.cyl(0.036, 0.03, 0.07, 12, { color: 0xffffff, rough: 0.25 }); gb.cyl(0.03, 0.03, 0.003, 10, { y: 0.068, color: 0x5a3018 }); gb.cyl(0.06, 0.06, 0.006, 14, { y: -0.004, color: 0xffffff }); }
    const g = gb.build(); g.userData.shared = true;
    CUPS[kind] = g;
  }
  return CUPS[kind];
}
let CUP_MAT = null;

export class CityLife {
  constructor(game) {
    this.game = game;
    this.sit = null; this.standAt = null;
    this.groups = []; // oturan gruplar (kafe içi/dışı): { members:[npc], t, cups:[] }
    this.cafeT = 0;
    this.stats = { bought: 0, sits: 0, lies: 0, cafeSpawned: 0 };
    this._ctx = null;
    // silah sesi → iç mekân kalabalığı (AVM, market) panik: ctx.onNoise(x, z, yarıçap)
    const cmb = game.combat;
    if (cmb && cmb.noise && !cmb._cityHook) {
      const orig = cmb.noise; cmb._cityHook = true;
      cmb.noise = function (x, z, radius, source) { orig.call(this, x, z, radius, source); const ctx = game.player.inInterior; if (ctx && ctx.onNoise) ctx.onNoise(x, z, radius, source); };
    }
  }

  cafes() { return CAFES; }
  onLot(c) { return cafeOnLot(this.game.map, c); }

  // ---------------- alışveriş
  openGrocery(kind) {
    const g = this.game, ui = g.ui, pl = g.player, list = GROCERY[kind] || GROCERY.bakkal;
    const title = { bakkal: 'BAKKAL', market: 'MARKET KASASI', kafe: 'SİPARİŞ' }[kind] || 'DÜKKÂN';
    const ctx = pl.inInterior;
    const p = ui.panel(title, (ctx && ctx.name) || 'Aç ayı oynamaz.');
    const m = ui.openModal(p, { cls: 'right' });
    $('.x', p).onclick = () => ui.closeModal(m);
    const body = $('.panel-body', p);
    for (const it of list) {
      const row = el('div', 'item');
      row.innerHTML = `<div class="in"><b>${it.name}</b><small>+${it.heal} can${it.stamina ? ' · dayanıklılık dolar' : ''}</small></div><div class="ia"></div>`;
      $('.ia', row).appendChild(ui.btn(formatMoney(it.price), () => this.buy(it), 'gold'));
      body.appendChild(row);
    }
    return m;
  }
  quickBuy(item, kind) {
    const it = typeof item === 'string' ? (GROCERY[kind] || []).find((i) => i.id === item) : item;
    if (it) this.buy(it);
  }
  buy(it) {
    const g = this.game, pl = g.player, s = g.state;
    if (s.money < it.price) { g.audio.error && g.audio.error(); g.ui.notify('Yetersiz bakiye!', 'warn'); return false; }
    s.money -= it.price; g.audio.cash && g.audio.cash();
    const before = pl.hp;
    pl.hp = Math.min(pl.maxHp, pl.hp + it.heal);
    if (it.stamina) pl.stamina = 100;
    this.stats.bought++;
    g.ui.notify(pl.hp > before ? `${it.name}: afiyet olsun! +${Math.round(pl.hp - before)} can` : `${it.name} aldın. Afiyet olsun!`, 'good');
    return true;
  }

  // ---------------- oturan gruplar (iç mekân: I.npc; dış: npcs.add)
  // seats: [{x,z,y,heading,occupant}], kind: 'mf' | 'mm' | 'ff' | 'single'
  seatGroup(ctx, seats, kind, opts = {}) {
    const g = this.game, r = ctx ? ctx.rng : { next: Math.random, chance: (p) => Math.random() < p, pick: (a) => a[Math.floor(Math.random() * a.length)], float: (a, b) => a + Math.random() * (b - a), int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)) };
    const genders = kind === 'mf' ? ['m', 'f'] : kind === 'mm' ? ['m', 'm'] : kind === 'ff' ? ['f', 'f'] : [r.chance(0.5) ? 'm' : 'f'];
    const n = Math.min(seats.length, kind === 'single' ? 1 : Math.max(2, seats.length === 3 ? 3 : 2));
    const members = [];
    for (let i = 0; i < n; i++) {
      const s = seats[i]; if (!s || s.occupant) continue;
      const look = lookOf(r, genders[i % genders.length]);
      let npc;
      if (ctx) { npc = g.interiors.npc(ctx, 'resident', s.x, s.z, s.heading, { look }); }
      else { npc = g.npcs.add('civilian', s.x, s.z, look, { state: 'sit', y: s.y }); }
      npc.state = 'sit'; npc.sitting = true; npc.static = false; npc.faceYaw = s.heading; npc.heading = s.heading;
      npc.routineT = opts.stay || 1e9; npc.pos.y = s.y || 0; npc.cafeSeat = s;
      s.occupant = npc; if (s.st) s.st.actor = null;
      members.push(npc);
    }
    if (!members.length) return null;
    const grp = { members, kind, t: 2 + Math.random() * 3, talker: 0, cups: [], ctx, outdoor: !ctx };
    // içecek: çay bardağı ya da fincan masada; yudumda ele geçer
    const scene = ctx ? ctx.scene : g.scene;
    if (!CUP_MAT) CUP_MAT = this.game.city.propsMat;
    for (const npc of members) {
      const s = npc.cafeSeat, kindC = Math.random() < 0.6 ? 'cay' : 'kahve';
      const cup = new THREE.Mesh(cupMesh(kindC), CUP_MAT);
      const tx = s.x + Math.sin(s.heading) * 0.36, tz = s.z + Math.cos(s.heading) * 0.36;
      cup.userData.rest = new THREE.Vector3(tx, (s.y || 0) + 0.755, tz);
      cup.position.copy(cup.userData.rest); scene.add(cup);
      npc.cup = cup;
      const st = { sip: 0, next: 2 + Math.random() * 6 };
      npc.model.post = function (dt) {
        st.next -= dt;
        if (st.next < 0 && st.sip <= 0) { st.sip = 2.2; st.next = 6 + Math.random() * 8; }
        if (st.sip > 0) {
          st.sip -= dt;
          const k = Math.sin(Math.max(0, Math.min(1, (2.2 - st.sip) / 2.2)) * Math.PI);
          const arm = this.arms[1];
          arm.sh.rotation.x += (-0.6 - arm.sh.rotation.x) * k; arm.el.rotation.x += (-2.0 - arm.el.rotation.x) * k; arm.sh.rotation.z += (0.2 - arm.sh.rotation.z) * k * 0.5;
          if (k > 0.35 && cup.parent !== arm.socket) { arm.socket.add(cup); cup.position.set(0, -0.02, 0.03); cup.rotation.set(0, 0, 0); cup.scale.setScalar(1 / (this.rig.height || 1)); }
          if (k <= 0.35 && cup.parent === arm.socket) { scene.add(cup); cup.position.copy(cup.userData.rest); cup.scale.setScalar(1); }
        } else if (cup.parent !== scene) { scene.add(cup); cup.position.copy(cup.userData.rest); cup.scale.setScalar(1); }
      };
      grp.cups.push(cup);
    }
    if (ctx) (ctx.cafeGroups || (ctx.cafeGroups = [])).push(grp); else this.groups.push(grp);
    return grp;
  }
  dropGroup(grp, remove = true) {
    for (const n of grp.members) {
      if (n.cafeSeat) { n.cafeSeat.occupant = null; n.cafeSeat = null; }
      if (n.model) n.model.post = null;
      if (remove && this.game.npcs.list.includes(n)) this.game.npcs.remove(n);
    }
    for (const c of grp.cups) c.parent && c.parent.remove(c);
  }
  tickGroups(list, dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const grp = list[i];
      // biri kalktıysa (kaçış, saldırı, süre): bardağı masada bırak, koltuğu boşalt
      let alive = 0;
      for (const n of grp.members) {
        const sitting = !n.dead && n.state === 'sit' && (n.inInterior || null) === (grp.ctx || null);
        if (sitting) alive++;
        else if (n.cafeSeat) { n.cafeSeat.occupant = null; n.cafeSeat = null; n.model.post = null; n.talking = false; }
      }
      if (!alive) { if (grp.outdoor) for (const c of grp.cups) c.parent && c.parent.remove(c); list.splice(i, 1); continue; }
      // sohbet: sırayla konuşurlar
      grp.t -= dt;
      if (grp.t <= 0) { grp.t = 2.5 + Math.random() * 4; grp.talker = (grp.talker + 1) % Math.max(1, grp.members.length + (grp.members.length > 1 ? 0 : 1)); }
      grp.members.forEach((n, k) => { if (n.state === 'sit') n.talking = grp.members.length > 1 && k === grp.talker; });
    }
  }

  // ---------------- iç mekân oturma / uzanma
  setupInterior(ctx) {
    const g = this.game, p = g.player;
    if (!ctx.furnSeats || ctx._seatsReady) return;
    ctx._seatsReady = true;
    for (const s of ctx.furnSeats) {
      const bed = s.kind === 'bed';
      ctx.interact.push({
        x: bed ? s.bedX : s.x, z: bed ? s.bedZ : s.z, r: bed ? 1.6 : 0.85, label: SEAT_LABEL[s.kind] || 'Otur',
        cond: () => !this.sit && this.free(s) && Math.abs(p.pos.y - (bed ? s.y - 0.62 : s.y)) < 1.0 && !p.aiming,
        action: () => this.sitDown(s),
      });
    }
    const up = { x: 0, z: 0, r: 1.5, label: 'Kalk', cond: () => !!this.sit, action: () => this.standUp() };
    ctx.interact.push(up); this._up = up;
  }
  free(s) {
    const o = s.occupant;
    if (!o) return true;
    if (o === this.game.player) return false;
    if (o.dead || o.gone || (o.state !== 'sit' && !o.sitting) || Math.hypot(o.pos ? o.pos.x - s.x : o.x - s.x, o.pos ? o.pos.z - s.z : o.z - s.z) > 0.7) { s.occupant = null; return true; }
    return false;
  }
  sitDown(s) {
    const p = this.game.player;
    if (!this.free(s)) return false;
    this.standAt = p.pos.clone();
    this.sit = s; s.occupant = p;
    p.vx = p.vz = 0; p.speed = 0; p.aiming = false; p.crouch = false;
    if (s.kind === 'bed') { p.lying = true; p.sitting = false; this.stats.lies++; }
    else { p.sitting = true; this.stats.sits++; }
    this.hold();
    p.camYaw = s.kind === 'bed' ? s.heading + Math.PI : s.heading;
    return true;
  }
  hold() {
    const p = this.game.player, s = this.sit;
    if (s.kind === 'bed') {
      // sırtüstü: model gövdesi 90° yatar; kök ayak ucunda, baş başucuna bakar (heading = baş yönü)
      const fx = s.x - Math.sin(s.heading) * 0.92, fz = s.z - Math.cos(s.heading) * 0.92;
      p.pos.set(fx, s.y + 0.12, fz); p.heading = s.heading + Math.PI;
      p.model.body.rotation.x = -Math.PI / 2;
    } else { p.pos.set(s.x, s.y, s.z); p.heading = s.heading; p.sitting = true; }
    p.vy = 0; p.vx = 0; p.vz = 0; p.grounded = true;
    p.model.root.position.copy(p.pos); p.model.root.rotation.y = p.heading;
  }
  standUp() {
    const p = this.game.player, s = this.sit;
    if (!s) return;
    if (s.occupant === p) s.occupant = null;
    this.sit = null;
    p.sitting = false; p.lying = false; p.model.body.rotation.x = 0;
    if (this.standAt) { p.pos.copy(this.standAt); p.pos.y = s.kind === 'bed' ? s.y - 0.62 : s.y; }
    else { p.pos.x += Math.sin(s.heading) * 0.6; p.pos.z += Math.cos(s.heading) * 0.6; }
    p.model.root.position.copy(p.pos);
  }

  // ---------------- main.findInteraction (dış mekân, banklardan önce): kafede oturan oyuncuya garson
  prompt() {
    const g = this.game, p = g.player;
    if (p.inInterior || p.vehicle || p.dead) return null;
    if (p.seat && p.seat.kind === 'kafe') return { label: 'Garson: çay söyle (₺15) · kalkmak için WASD', action: () => this.buy(GROCERY.kafe[0]) };
    return null;
  }

  // ---------------- semt kafeleri: yakındakiler dolar, uzaktakiler boşalır
  updateCafes(dt) {
    const g = this.game, p = g.player;
    this.cafeT -= dt;
    if (this.cafeT > 0) return;
    this.cafeT = 1.5;
    const near = CAFES.map((c) => ({ c, d: Math.hypot(c.b.door.x - p.pos.x, c.b.door.z - p.pos.z) })).sort((a, b) => a.d - b.d);
    near.forEach(({ c, d }, i) => {
      if (d > 150 || i >= 3) { if (c.pop) { for (const grp of c.pop) this.dropGroup(grp); c.pop = null; } return; }
      if (d > 110) return;
      if (!c.pop) {
        c.pop = [];
        const r = { next: Math.random };
        c.tables.forEach((tb, ti) => {
          if (r.next() > 0.8) return;
          const seats = c.seats.filter((s) => s.table === ti);
          const kind = GROUP_KINDS[(ti + c.b.id) % GROUP_KINDS.length];
          const grp = this.seatGroup(null, kind === 'single' ? [seats[Math.random() < 0.5 ? 0 : 1]] : seats, kind, { stay: 90 + Math.random() * 240 });
          if (grp) { grp.cafe = c; c.pop.push(grp); this.stats.cafeSpawned += grp.members.length; }
        });
      } else if (d > 30) {
        // kalkıp gidenlerin yerine (oyuncu bakmıyorken) yeni gelenler
        c.pop = c.pop.filter((grp) => this.groups.includes(grp));
        c.tables.forEach((tb, ti) => {
          const seats = c.seats.filter((s) => s.table === ti);
          if (seats.some((s) => s.occupant || (s.st && s.st.actor)) || Math.random() > 0.08) return;
          const kind = GROUP_KINDS[Math.floor(Math.random() * GROUP_KINDS.length)];
          const grp = this.seatGroup(null, kind === 'single' ? [seats[0]] : seats, kind, { stay: 90 + Math.random() * 240 });
          if (grp) { grp.cafe = c; c.pop.push(grp); this.stats.cafeSpawned += grp.members.length; }
        });
      }
    });
  }

  update(dt, input) {
    const g = this.game, p = g.player, ctx = p.inInterior;
    if (ctx !== this._ctx) {
      if (this.sit && this._ctx) this.standUp();
      this._ctx = ctx;
      if (ctx) this.setupInterior(ctx);
    }
    if (ctx) { if (ctx.cafeGroups) this.tickGroups(ctx.cafeGroups, dt); }
    else { this.updateCafes(dt); this.tickGroups(this.groups, dt); }
    // oturan/yatan oyuncu: hareket tuşu, zıplama, hasar ya da ölüm kaldırır
    if (this.sit) {
      const hurt = p.hp < (this._hp ?? p.hp);
      this._hp = p.hp;
      if (p.dead || p.vehicle || hurt || (input && (MOVE_KEYS.some((k) => input.down(k)) || input.hit('Space')))) { this.standUp(); this._hp = undefined; return; }
      this.hold();
    }
    if (ctx && this._up) { this._up.x = p.pos.x; this._up.z = p.pos.z; } // "Kalk" istemi oyuncunun üstünde
  }
}
export { CITY_SHOPS };
