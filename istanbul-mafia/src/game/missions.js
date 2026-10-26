// Görev motoru: adım tabanlı hikâye görevleri, kontrol noktaları ("Tekrar dene"), görev arşivi (tekrar oynama),
// sinematik kamera, seçimler/bayraklar, telefon çağrıları, eskort/yolcu, dalga savunması, gizlilik, sokak yarışı.
// Hikâye içeriği: story_data.js · Yan içerik: side_missions.js · Kışla ve karakollar: military.js
import * as THREE from 'three';
import { formatMoney, rng } from '../core/util.js';
import { randomLook } from '../entities/character.js';
import { copLook, soldierLook } from '../entities/npc.js';
import { GANGS } from './economy.js';
import { WEAPONS } from './weapons.js';
import { STORY, ACTS, LEYLA_LOOK, ALI_LOOK } from './story_data.js';
import { Dialogue, shotBetween, shotOver, shotWide } from './dialogue.js';
import { SideContent, MarkerSet } from './side_missions.js';
import { Military, PoliceStations } from './military.js';

export { STORY };

export class Missions {
  constructor(game) {
    this.g = game;
    this.active = null;
    this.stepIdx = 0;
    this.step = null;
    this.stage = 0;
    this.data = {};
    this.s = {};
    this.timer = 0;
    this.pendingPrompt = null;
    this.race = null;
    this.cpIdx = 0;
    this.retry = null;
    this.replay = false;
    this.spawned = { npcs: [], cars: [], objs: [] };
    this.escorts = [];
    this.cutscene = false;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.story = new MarkerSet(game, this.group);
    this.dialogue = new Dialogue(game);
    this.side = new SideContent(this);
    this.military = new Military(game);
    game.military = this.military;
    this.stations = new PoliceStations(game);
    this._markers = [];
    this._mv = -1;
    this.offerT = 0;
    this.camPos = new THREE.Vector3();
    this.STORY = STORY; // test/hata ayıklama erişimi
  }

  // ui (mini harita) tüm işaretçileri buradan okur
  get markers() {
    const v = this.story.version * 1000 + this.side.markers.version;
    if (v !== this._mv) { this._mv = v; this._markers = this.story.list.concat(this.side.markers.list); }
    return this._markers;
  }
  get index() { return this.g.state.storyIndex; }
  get flags() { const s = this.g.state; if (!s.storyFlags) s.storyFlags = {}; return s.storyFlags; }
  flag(k) { return this.flags[k]; }
  setFlag(k, v) { this.flags[k] = v; }

  // ---------------- yer bulma ----------------
  special(type, x, z) {
    const p = this.g.player.pos;
    return this.g.map.nearestOfType(type, x ?? p.x, z ?? p.z);
  }
  landmarkDoor(type) {
    const d = this.g.city.doors.find((dd) => dd.building.type === type);
    return d ? { door: { x: d.x, z: d.z, nz: 0 }, type } : null;
  }
  node(x, z) { return this.g.map.nearestNode(x, z); }
  // kaldırımda bir nokta (yol düğümünden ofsetli)
  curb(x, z, side = 1) { const n = this.node(x, z); return { x: n.x + 9 * side, z: n.z + 9 }; }
  roadSpot(x, z, min = 0, max = 40) {
    const s = this.g.map.randomEdgeNear(x, z, min, max);
    if (!s) { const n = this.node(x, z); return { x: n.x, z: n.z, h: 0 }; }
    const e = s.e, dx = e.b.x - e.a.x, dz = e.b.z - e.a.z, l = Math.hypot(dx, dz) || 1;
    return { x: s.x - dz / l * 2.7, z: s.z + dx / l * 2.7, h: Math.atan2(dx, dz) };
  }
  walk(x, z, min = 6, max = 30) { return this.g.npcs.sidewalkSpot(x, z, min, max) || { x: x + 3, z: z + 3 }; }
  doorFront(b, k = 3) { const nz = b.door.nz || 1; return { x: b.door.x, z: b.door.z + nz * k }; }

  // ---------------- HUD / işaretçi ----------------
  objective(text) { this.objText = text; this.g.ui.setObjective(text); }
  goto(b, text, r = 3) {
    if (!b) return;
    this.data.target = b;
    const dz = b.door.nz || 0;
    this.setMarkers([{ x: b.door.x, z: b.door.z + dz * 1.0, color: 0xffcc00, r }]);
    this.objective(text);
    this.g.setGps(b.door.x, b.door.z + dz * 1.5);
  }
  gotoXZ(x, z, text, r = 4, extra = []) {
    this.s.goal = { x, z, r };
    this.setMarkers([{ x, z, color: 0xffcc00, r }, ...extra]);
    if (text) this.objective(text);
    this.g.setGps(x, z);
  }
  setMarkers(list) { this.story.set(list); this.markerMeshes = this.story.meshes; }
  prompt(label, action) { this.pendingPrompt = { label, action }; }
  reached(x, z, r = 4) { const p = this.g.player.pos; return Math.hypot(p.x - x, p.z - z) < r; }
  inside(type, b) { const i = this.g.player.inInterior; return !!i && i.type === type && (!b || i.building === b); }
  distTo(a) { const p = this.g.player.pos; return Math.hypot(p.x - a.pos.x, p.z - a.pos.z); }

  // ---------------- diyalog / kamera ----------------
  dialog(lines, done, opts = {}) {
    this.cutscene = true;
    this.dialogue.play(lines, (res) => { this.cutscene = false; if (done) done(res); }, { act: this.active ? this.active.title : '', onChoice: (k, v) => { if (k && !this.replay) this.setFlag(k, v); else if (k) this.data['choice_' + k] = v; }, ...opts });
  }
  // diyalog bitince adım ilerlesin
  talk(lines, then) { this.s.talked = false; this.dialog(lines, (r) => { this.s.talked = true; if (then) then(r); }); }
  camBetween(a, b, side, dist) { return () => shotBetween(a.pos || a, b.pos || b, side, dist); }
  camOver(a, b) { return () => shotOver(a.pos || a, b.pos || b); }
  camWide(x, y, z, lx, ly, lz) { return shotWide(x, y, z, lx, ly, lz); }
  say(actor, text) { if (actor && !actor.dead) this.g.ui.bark(actor, text); }
  big(t, s, c = 'gold', d = 3) { this.g.ui.bigMessage(t, s, c, d); }

  // ---------------- varlık yaratma (görev sonunda temizlenir) ----------------
  track(n) { this.spawned.npcs.push(n); return n; }
  npc(kind, x, z, opts = {}) {
    const g = this.g;
    const k = kind;
    let look = opts.look;
    if (!look) look = k === 'police' ? copLook() : k === 'soldier' ? soldierLook() : randomLook(rng, k === 'gang' ? 'gang' : k === 'boss' ? 'boss' : 'civilian');
    if (opts.lookOver) Object.assign(look, opts.lookOver);
    if (opts.gang && GANGS[opts.gang] && !opts.lookOver?.topColor && (k === 'gang')) look.topColor = GANGS[opts.gang].color;
    const n = g.npcs.add(k, x, z, look, { mission: true, ...opts, look: undefined });
    if (opts.inInterior) n.inInterior = opts.inInterior;
    if (opts.god) n.god = true;
    return this.track(n);
  }
  enemy(gang, x, z, opts = {}) {
    const n = this.npc(opts.kind || 'gang', x, z, { gang, hostile: true, state: opts.state || 'attack', ...opts });
    n.hostile = true;
    if ((opts.state || 'attack') === 'attack') n.engage(this.g.player, opts.delay || 1);
    return n;
  }
  squad(gang, x, z, count, opts = {}) {
    const out = [];
    const weps = opts.weapons || ['pistol', 'uzi', 'pistol', 'shotgun', 'ak'];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const s = opts.spread ?? 2.2;
      out.push(this.enemy(gang, x + Math.sin(a) * s, z + Math.cos(a) * s, { weapon: weps[i % weps.length], ...opts }));
    }
    return out;
  }
  ally(x, z, opts = {}) {
    const n = this.npc(opts.kind || 'gang', x, z, { gang: 'family', ally: true, state: 'follow', baseState: 'follow', weapon: 'pistol', hp: 220, lookOver: { topColor: '#1a1a1a' }, ...opts });
    n.ally = true; n.leader = this.g.player;
    return n;
  }
  car(type, x, z, h = 0, color) {
    const v = this.g.vehicles.add(type, x, z, h, color);
    v.mission = true;
    this.spawned.cars.push(v);
    return v;
  }
  // takipçi çete aracı: yakına gelince ekip iner ve saldırır
  gangCar(gang, n = 2, opts = {}) {
    const g = this.g, p = g.player;
    const ref = opts.at || p.pos;
    const rs = g.map.randomEdgeNear(ref.x, ref.z, opts.min || 60, opts.max || 110) || { x: ref.x + 60, z: ref.z };
    const v = this.car(opts.type || 'suv', rs.x, rs.z, 0, opts.color || '#151515');
    v.ai = { mode: 'direct', target: p.pos, cruise: opts.cruise || 24 };
    v.crew = [];
    for (let i = 0; i < n; i++) {
      const m = this.enemy(gang, v.pos.x, v.pos.z, { state: 'guard', weapon: (opts.weapons || ['uzi', 'pistol', 'ak'])[i % 3], kind: opts.kind });
      m.vehicle = v; m.model.root.visible = false;
      v.crew.push(m);
    }
    if (!this.data.gangCars) this.data.gangCars = [];
    this.data.gangCars.push(v);
    return v;
  }
  updateGangCars() {
    const g = this.g, p = g.player;
    let alive = 0;
    for (const v of this.data.gangCars || []) {
      for (const m of v.crew) if (!m.dead) alive++;
      if (!v.crew.some((m) => m.vehicle)) continue;
      if (v.ai && v.ai.mode === 'direct') v.ai.target = (p.vehicle || p).pos;
      const d = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
      if (v.destroyed || v.sinking > 0) { for (const m of v.crew) if (m.vehicle) { m.vehicle = null; m.model.root.visible = true; m.pos.copy(v.pos); m.takeDamage(999, p, 'explosion'); } continue; }
      const slow = (p.vehicle ? p.vehicle.speed : 0) < 5;
      v.dropT = (v.dropT || 0) + g.dt;
      if ((d < 18 && (slow || v.speed < 3)) || (d < 30 && v.dropT > 40)) {
        v.ai = { empty: true };
        const f = v.fwd;
        v.crew.forEach((m, i) => {
          if (!m.vehicle) return;
          m.vehicle = null; m.model.root.visible = true;
          m.pos.set(v.pos.x + -f.z * (i % 2 ? 1.7 : -1.7) - f.x * (i > 1 ? 1.5 : 0), 0, v.pos.z + f.x * (i % 2 ? 1.7 : -1.7) - f.z * (i > 1 ? 1.5 : 0));
          m.engage(p, 0.8);
        });
        g.ui.bark(v.crew[0], 'İnin! Vurun şunu!');
      } else if (d < 14 && !v.shotT) {
        // araçtan ateş: yanından geçerken
        v.shotT = 1;
        const m = v.crew.find((c) => !c.dead);
        if (m && Math.random() < 0.25 && p.vehicle) p.vehicle.damage(40, m);
      }
      if (v.shotT) v.shotT = Math.max(0, v.shotT - g.dt);
    }
    return alive;
  }
  allDead(list) { return !list || list.every((n) => n.dead); }
  object(mesh, scene) { (scene || this.g.scene).add(mesh); this.spawned.objs.push(mesh); return mesh; }

  // oyuncuyu ışınla (yeniden denemelerde)
  place(x, z, h = 0, opts = {}) {
    const g = this.g, p = g.player;
    if (p.inInterior) g.interiors.exit();
    if (p.vehicle) g.vehicles.ejectDriver(p.vehicle);
    p.pos.set(x, opts.y || 0, z); p.vy = 0; p.heading = h; p.camYaw = h; p.camInit = false;
    if (opts.car) {
      const n = this.node(x, z);
      const v = this.car(opts.car, n.x + 2.7, n.z + 12, 0, opts.color);
      if (opts.enter) g.enterVehicle(v, true);
      return v;
    }
    return null;
  }

  // ---------------- eskort / yolcu ----------------
  escort(n) { if (!this.escorts.includes(n)) this.escorts.push(n); n.state = 'follow'; n.baseState = 'follow'; n.leader = this.g.player; return n; }
  updateEscorts() {
    const g = this.g, p = g.player;
    for (const n of this.escorts) {
      if (n.dead) continue;
      const v = p.vehicle;
      if (v && !n.vehicle && !p.inInterior && Math.hypot(n.pos.x - v.pos.x, n.pos.z - v.pos.z) < 9) { n.vehicle = v; n.model.root.visible = false; n.state = 'follow'; }
      if (n.vehicle) {
        if (n.vehicle !== v || n.vehicle.destroyed) {
          const c = n.vehicle; n.vehicle = null; n.model.root.visible = true;
          n.pos.set(c.pos.x + c.fwd.z * 2, 0, c.pos.z - c.fwd.x * 2);
          if (c.destroyed) n.takeDamage(120, null, 'explosion');
        } else n.pos.copy(v.pos);
      }
    }
  }
  escortsIn(v) { return this.escorts.filter((n) => !n.dead).every((n) => n.vehicle === v); }

  // ---------------- dalga savunması ----------------
  waves(cfg) {
    // cfg: {x, z, gang, waves:[n...], kind, weapons, boss:fn, minD, maxD, defendR, defendHp}
    this.s.wv = { ...cfg, i: 0, enemies: [], gap: cfg.firstGap ?? 2, hp: cfg.defendHp || 0, maxHp: cfg.defendHp || 0 };
  }
  updateWaves(dt) {
    const g = this.g, w = this.s.wv;
    if (!w) return null;
    if (w.maxHp) {
      let near = 0;
      for (const n of w.enemies) if (!n.dead && Math.hypot(n.pos.x - w.x, n.pos.z - w.z) < (w.defendR || 7)) near++;
      w.hp -= near * dt * 4;
      this.dialogue.meter(w.hpLabel || 'SAVUNMA', w.hp / w.maxHp, '#ff5a46');
      if (w.hp <= 0) { this.dialogue.meter(null); return 'fail:' + (w.failText || 'Savunma düştü!'); }
    }
    if (w.enemies.every((n) => n.dead)) {
      w.gap -= dt;
      if (w.gap > 0) return null;
      if (w.i >= w.waves.length) { this.dialogue.meter(null); return 'done'; }
      const count = w.waves[w.i++];
      w.enemies = [];
      for (let k = 0; k < count; k++) {
        const s = g.npcs.sidewalkSpot(w.x, w.z, w.minD || 40, w.maxD || 65);
        if (!s) continue;
        const weps = w.weapons || ['pistol', 'uzi', 'ak', 'shotgun'];
        const n = this.enemy(w.gang, s.x, s.z, { kind: w.kind, weapon: weps[(k + w.i) % weps.length], delay: 1.5 });
        if (w.maxHp && k % 2 === 0) { n.state = 'move'; n.path = [{ x: w.x + (Math.random() - 0.5) * 4, z: w.z + (Math.random() - 0.5) * 4 }]; n.moveSpeed = 4.2; n.afterMove = 'attack'; n.target = g.player; }
        w.enemies.push(n);
      }
      if (w.i === w.waves.length && w.boss) { const b = w.boss(this, w); if (b) w.enemies.push(b); }
      this.objective(`${w.title || 'Saldırıyı püskürt'} — Dalga ${w.i}/${w.waves.length}`);
      this.setMarkers([...(w.maxHp ? [{ x: w.x, z: w.z, color: 0x30a0ff, r: w.defendR || 7 }] : []), ...w.enemies.map((n) => ({ actor: n, color: 0xff3030 }))]);
      w.gap = w.waveGap || 5;
    }
    return null;
  }

  // ---------------- gizlilik ----------------
  // Gözcülerin görüş konisi (70°, 24 m) ve görüş hattı. Çömelmek, gece ve mesafe tespit hızını düşürür.
  stealth(watchers, dt, opts = {}) {
    const g = this.g, p = g.player;
    const st = this.s.stealth || (this.s.stealth = { det: 0 });
    let best = 0;
    for (const w of watchers) {
      if (w.dead || w.state === 'attack') continue;
      const dx = p.pos.x - w.pos.x, dz = p.pos.z - w.pos.z, d = Math.hypot(dx, dz);
      const range = (opts.range || 24) * (g.env.nightFactor > 0.6 && !p.inInterior ? 0.65 : 1) * (p.crouch ? 0.6 : 1);
      if (d > range) continue;
      const fx = Math.sin(w.heading), fz = Math.cos(w.heading);
      const cos = (dx * fx + dz * fz) / (d || 1);
      const close = d < 2.2;
      if (cos < 0.55 && !close) continue;
      if (!g.physics.lineOfSight(w.pos.x, w.pos.y + 1.6, w.pos.z, p.pos.x, p.pos.y + (p.crouch ? 0.9 : 1.4), p.pos.z)) continue;
      const k = (1 - d / range) * 1.6 + 0.35 + (p.speed > 4 ? 0.6 : 0);
      best = Math.max(best, k);
    }
    if (best > 0) st.det = Math.min(1, st.det + best * dt * 0.9);
    else st.det = Math.max(0, st.det - dt * 0.25);
    this.dialogue.meter(st.det > 0.02 ? (st.det > 0.7 ? 'FARK EDİLİYORSUN!' : 'ŞÜPHE') : 'GÖRÜNMÜYORSUN', st.det, st.det > 0.7 ? '#ff3b3b' : '#ffb347');
    if (st.det >= 1) { this.dialogue.meter(null); this.s.spotted = true; return true; }
    return false;
  }

  // ---------------- akış ----------------
  // Reis Baba (veya hikâyeye göre Leyla) ile konuşma: sıradaki görevi başlat
  talkToGiver() {
    const g = this.g;
    if (this.active) { g.ui.notify('Önce elindeki işi bitir: ' + this.active.title, 'warn'); return; }
    const def = STORY[this.index];
    const giver = this.flags.reisWounded && !this.flags.reisBack ? 'Leyla' : 'Reis Baba';
    const menu = [{ label: 'İş var mı?', value: 'job', hint: def ? `Sıradaki: ${def.title}` : 'Hikâye tamamlandı' }, { label: 'Görev arşivi (tekrar oyna)', value: 'replay' }, { label: 'Kontrat panosu', value: 'board' }, { label: 'Hoşça kal', value: 'bye' }];
    this.dialogue.play([{ who: giver, text: giver === 'Leyla' ? 'Babam hâlâ hastanede. İşleri ben yürütüyorum. Ne istiyorsun?' : 'Gel evlat, otur. Ne var ne yok?', choice: menu, key: '_menu' }], (r) => {
      if (r._menu === 'replay') return this.replayMenu();
      if (r._menu === 'board') return this.side.openBoard();
      if (r._menu !== 'job') return;
      if (!def) { this.dialog([[giver, 'İstanbul artık senin evlat. Bölgeleri koru, işletmelerini büyüt. Kapım sana her zaman açık.']]); return; }
      this.offer(def, giver);
    });
  }
  offer(def, who) {
    const g = this.g;
    const brief = typeof def.brief === 'function' ? def.brief(this) : def.brief;
    this.dialog([[def.giver || who || 'Reis Baba', brief]], () => g.ui.confirm(`Görev ${STORY.indexOf(def) + 1}/${STORY.length}: ${def.title}`, `Ödül: ${formatMoney(def.reward)} · Saygınlık +${def.respect}`, 'Kabul Et', () => this.start(def)));
  }
  replayMenu() {
    const g = this.g, ui = g.ui;
    const p = ui.panel('GÖREV ARŞİVİ', 'Tamamlanan görevleri tekrar oyna (ödülün %25\'i, seçimler kalıcı olmaz)');
    const m = ui.openModal(p);
    p.querySelector('.x').onclick = () => ui.closeModal(m);
    const body = p.querySelector('.panel-body');
    body.classList.add('story-replay');
    let act = -1;
    STORY.forEach((def, i) => {
      if (def.act !== act) { act = def.act; body.insertAdjacentHTML('beforeend', `<h3>${ACTS[act] || ''}</h3>`); }
      const row = document.createElement('div'); row.className = 'rp';
      const done = g.state.completed.includes(def.id);
      row.innerHTML = `<span>${i + 1}. ${def.title}<small>${done ? (def.short || '') : 'Kilitli'}</small></span>`;
      if (done) row.appendChild(ui.btn('Oyna', () => { ui.closeModal(m); this.start(def, { replay: true }); }));
      body.appendChild(row);
    });
  }

  start(def, opts = {}) {
    const g = this.g;
    if (this.active) this.cleanup(true);
    this.retry = null;
    this.dialogue.hangup();
    this.active = def; this.stage = 0; this.data = {}; this.timer = 0;
    this.replay = !!opts.replay;
    if (this.replay) this.flagSnap = JSON.stringify(this.flags);
    this.cpIdx = opts.fromStep || 0;
    if (!opts.fromStep) g.ui.bigMessage(def.title.toUpperCase(), (ACTS[def.act] || '') + (this.replay ? ' · Tekrar' : ''), 'gold', 2.5);
    else g.ui.bigMessage('KONTROL NOKTASI', def.steps[this.cpIdx].cp || def.title, 'gold', 2);
    if (def.steps) this.enterStep(this.cpIdx, !!opts.fromStep);
    else if (def.start) def.start(this);
  }
  enterStep(i, isRetry) {
    const def = this.active;
    this.stepIdx = i;
    this.step = def.steps[i];
    this.s = {};
    this.pendingPrompt = null;
    if (!this.step) { this.complete(); return; }
    if (this.step.cp !== undefined || i === 0) {
      this.cpIdx = i;
      const p = this.g.player;
      this.cpSnap = { weapons: JSON.parse(JSON.stringify(p.weapons, (k, v) => (v === Infinity ? 1e9 : v))), armor: p.armor };
      if (i > 0 && !isRetry) this.g.ui.notify('Kontrol noktası: ' + this.step.cp, 'info');
    }
    if (isRetry && this.step.place) this.step.place(this);
    if (this.step.time) this.timer = this.step.time;
    if (this.step.start) this.step.start(this);
  }
  next() {
    const def = this.active;
    if (!def) return;
    if (this.step && this.step.end) this.step.end(this);
    if (this.stepIdx + 1 >= def.steps.length) this.complete();
    else this.enterStep(this.stepIdx + 1);
  }

  complete() {
    const g = this.g, def = this.active;
    if (!def) return;
    if (this.step && this.step.end) this.step.end(this);
    const reward = this.replay ? Math.floor(def.reward * 0.25) : def.reward;
    g.state.money += reward;
    if (!this.replay) {
      g.state.respect += def.respect;
      if (!g.state.completed.includes(def.id)) g.state.completed.push(def.id);
      g.state.storyIndex = Math.max(g.state.storyIndex, STORY.indexOf(def) + 1);
      if (def.onComplete) def.onComplete(this);
    } else if (this.flagSnap) g.state.storyFlags = JSON.parse(this.flagSnap);
    g.audio.success();
    g.ui.bigMessage('GÖREV TAMAMLANDI', `${def.title}  ·  +${formatMoney(reward)}${this.replay ? '' : `  ·  Saygınlık +${def.respect}`}`, 'gold', 4);
    const wasReplay = this.replay;
    this.cleanup(false);
    g.autosave();
    if (!wasReplay) {
      const nd = STORY[g.state.storyIndex];
      const prevAct = def.act;
      if (nd && nd.act !== prevAct) setTimeout(() => g.ui.bigMessage(ACTS[nd.act].toUpperCase(), 'Yeni perde başlıyor', 'gold', 4), 4600);
      if (nd && nd.call) this.offerT = 9; else this.offerT = 0;
      if (def.credits) setTimeout(() => g.ui.credits(), 6000);
    }
  }
  fail(reason) {
    const g = this.g, def = this.active;
    if (!def) return;
    g.audio.fail();
    g.ui.bigMessage('GÖREV BAŞARISIZ', reason || def.title, 'red', 3.5);
    const dead = g.player.dead || g.mode === 'dead';
    const cp = this.cpIdx;
    const snap = this.cpSnap;
    const replay = this.replay;
    if (replay && this.flagSnap) g.state.storyFlags = JSON.parse(this.flagSnap);
    this.cleanup(true);
    if (def.steps) this.retry = { def, cp, snap, reason, t: dead ? 5.5 : 3.6, replay };
  }
  askRetry() {
    const g = this.g, r = this.retry;
    this.retry = null;
    const cpName = r.cp > 0 ? (r.def.steps[r.cp].cp || 'son kontrol noktası') : 'baştan';
    g.ui.confirm('TEKRAR DENE?', `${r.def.title} — ${r.reason || ''} · Başlangıç: ${cpName}`, 'Tekrar dene', () => {
      const p = g.player;
      if (r.snap) {
        for (const [id, w] of Object.entries(r.snap.weapons)) { if (!WEAPONS[id]) continue; if (WEAPONS[id].type === 'melee') p.giveWeapon(id); else p.weapons[id] = { mag: w.mag, ammo: w.ammo }; }
        p.armor = Math.max(p.armor, r.snap.armor);
      }
      p.hp = p.maxHp;
      g.wanted.reset(); g.npcs.calmPolice();
      this.start(r.def, { fromStep: r.cp, replay: r.replay });
    }, 'Vazgeç');
  }
  removeSpawned() {
    const g = this.g;
    for (const n of this.spawned.npcs) g.npcs.remove(n);
    for (const v of this.spawned.cars) {
      if (v === g.player.vehicle) { v.mission = false; continue; }
      g.vehicles.remove(v);
    }
  }
  cleanup(hard) {
    const g = this.g;
    if (this.active && this.step && this.step.cleanup) this.step.cleanup(this);
    if (this.active && this.active.cleanup) this.active.cleanup(this);
    if (hard) this.removeSpawned();
    else {
      for (const n of this.spawned.npcs) { n.mission = false; if (n.ally) { n.ally = false; n.baseState = 'walk'; n.state = n.dead ? 'dead' : 'walk'; } }
      for (const v of this.spawned.cars) v.mission = false;
    }
    for (const o of this.spawned.objs) o.parent && o.parent.remove(o);
    if (this.data.colliders) for (const b of this.data.colliders) { b.y0 = -101; b.y1 = -100; }
    this.spawned = { npcs: [], cars: [], objs: [] };
    this.escorts = [];
    if (this.race) this.endRace();
    this.active = null; this.data = {}; this.s = {}; this.timer = 0; this.step = null;
    this.cutscene = false; this.g.cutsceneCam = null;
    this.dialogue.meter(null);
    this.setMarkers([]);
    this.objText = '';
    if (g.ui && g.ui.setObjective) g.ui.setObjective('');
    if (g.ui && g.ui.setTimer) g.ui.setTimer(0);
    g.setGps(null);
    this.replay = false;
  }

  onKill(n) { if (this.active && this.active.onKill) this.active.onKill(this, n); }
  onEnter(ctx) {
    const g = this.g;
    // görev içerikleri (depo ve köşk kendi kurucularında çağırır)
    if (this.active && ctx.type !== 'warehouse' && ctx.type !== 'rival') this.populate(ctx);
    // ek etkileşimler
    if (ctx.type === 'safehouse') {
      ctx.interact.push({ x: -2, z: 3.4, r: 1.5, label: 'Kontrat panosu', action: () => this.side.openBoard() });
      ctx.interact.push({ x: 2, z: 3.4, r: 1.4, label: 'Görev arşivi (tekrar oyna)', action: () => this.replayMenu() });
    }
    if (ctx.type === 'cafe') ctx.interact.push({ x: 3, z: -3.6, r: 1.4, label: 'Ocakçıdan iş sor (kontratlar)', action: () => this.side.openBoard() });
    void g;
  }
  populate(ctx) {
    const I = this.g.interiors;
    if (this.step && this.step.populate) this.step.populate(this, ctx, I);
    else if (this.active && this.active.populate) this.active.populate(this, ctx, I);
  }
  onExit() {}
  onTrade(good, qty, action, district) {
    const st = this.step;
    if (st && st.onTrade) st.onTrade(this, good, qty, action, district);
  }
  onPlayerDown() { if (this.active) this.fail(this.race ? 'Yarış iptal' : 'Görev iptal oldu'); }

  populateWarehouse(ctx, I) { if (this.active && ((this.step && this.step.populate) || this.active.populate)) this.populate(ctx); void I; }
  populateRival(ctx, I) {
    if (this.active && ((this.step && this.step.populate) || this.active.populate)) this.populate(ctx);
    else {
      // görev dışı: köşk korumaları
      for (let i = 0; i < 4; i++) { const n = I.npc(ctx, 'guard', -4 + i * 2.6, 0, Math.PI, { gang: 'kartallar' }); n.static = false; }
    }
  }
  // konak kurucusundan çağrılır: hikâyeye göre konaktakiler
  populateKonak(ctx, I, reis) {
    const f = this.flags;
    const idx = this.index;
    if (f.reisWounded && !f.reisBack && reis) { this.g.npcs.remove(reis); const it = ctx.interact.find((i) => i.label === 'Reis Baba ile konuş'); if (it) it.label = 'Leyla ile konuş'; }
    if (idx >= 1 && !(f.reisWounded && !f.reisBack && false)) {
      const l = I.npc(ctx, 'resident', f.reisWounded && !f.reisBack ? 0 : 1.6, f.reisWounded && !f.reisBack ? -5.2 : -4.6, 0, { name: 'Leyla', look: LEYLA_LOOK() });
      l.god = true;
    }
    if (idx >= 2) { const a = I.npc(ctx, 'resident', -4, 0.2, Math.PI / 2, { name: 'Cin Ali', look: ALI_LOOK() }); a.sitting = true; a.god = true; }
    if (this.active && this.active.konak) this.active.konak(this, ctx, I, reis);
  }

  // ---------------- Sokak yarışı ----------------
  startRace(district) {
    const g = this.g;
    const start = district === 'kadikoy' ? g.map.nearestNode(560, 700) : g.map.nearestNode(-300, -600);
    const end = district === 'kadikoy' ? g.map.nearestNode(900, -200) : g.map.nearestNode(-800, 600);
    const path = g.map.path(start.x, start.z, end.x, end.z);
    const pts = path.map((n) => ({ x: n.x, z: n.z }));
    const e0 = path[1] || path[0];
    const dx = e0.x - start.x, dz = e0.z - start.z, l = Math.hypot(dx, dz) || 1;
    const fx = dx / l, fz = dz / l;
    const h = Math.atan2(fx, fz);
    this.race = { pts, idx: 1, cars: [], countdown: 4, started: false, finished: [] };
    this.stage = 0;
    if (g.player.inInterior) g.interiors.exit();
    if (g.player.vehicle) g.vehicles.ejectDriver(g.player.vehicle);
    const pc = this.car('gt', start.x + -fz * 2.5 + fx * 3, start.z + fx * 2.5 + fz * 3, h, '#c81010');
    g.enterVehicle(pc, true);
    this.race.playerCar = pc;
    const colors = ['#1060c8', '#f2c200', '#111111'];
    for (let i = 0; i < 3; i++) {
      const c = this.car(i === 2 ? 'sedan' : 'gt', start.x + -fz * (i % 2 ? 2.5 : -2.5) - fx * (4 + i * 6), start.z + fx * (i % 2 ? 2.5 : -2.5) - fz * (4 + i * 6), h, colors[i]);
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
    for (const c of r.cars) {
      c.mission = false;
      if (!c.ai || c.ai.empty) continue;
      const n = this.g.map.nearestNode(c.pos.x, c.pos.z);
      c.ai = { mode: 'traffic', from: n, to: this.g.map.other(n.edges[0], n), next: null, cruise: 12 };
      c.ai.next = this.g.vehicles.chooseNext(c.ai.to, n);
    }
    if (r.playerCar) r.playerCar.mission = false;
    this.race = null;
    this.g.ui.setRacePos(0);
  }

  update(dt) {
    const g = this.g;
    this.pendingPrompt = null;
    this.cutscene = this.dialogue.open;
    this.dialogue.update(dt);
    // görev yoksa Reis'in kapısında işaret
    if (!this.active) {
      if (this.retry) {
        this.retry.t -= dt;
        if (this.retry.t <= 0 && g.mode === 'playing' && !g.player.dead && !g.ui.blocking()) this.askRetry();
      }
      const konak = this.g.map.nearestOfType('konak', 0, 0);
      if (STORY[this.index] && konak && !this.story.list.length && !g.player.inInterior) {
        this.setMarkers([{ x: konak.door.x, z: konak.door.z + konak.door.nz, color: 0xffcc00, r: 2, giver: true }]);
        if (!this.objText) this.objective(this.index === 0 ? 'Reis Baba\'nın konağına git' : 'Yeni iş için Reis Baba\'ya uğra (sarı R)');
      }
      if (this.index === 0 && !this.retry) this.start(STORY[0]);
      // sıradaki görev için telefon
      if (this.offerT > 0) {
        this.offerT -= dt;
        const nd = STORY[this.index];
        if (this.offerT <= 0 && nd && nd.call && !g.ui.blocking() && g.mode === 'playing') this.dialogue.ring(nd.call, () => this.offer(nd, nd.call));
      }
    } else {
      if (this.timer > 0) { this.timer -= dt; g.ui.setTimer(this.timer); if (this.timer <= 0 && this.step && this.step.time) { this.fail(this.step.timeFail || 'Süre doldu!'); return this.post(dt); } } else g.ui.setTimer(0);
      this.updateEscorts();
      let r = null;
      if (this.active.check) r = this.active.check(this, dt);
      if (!r) r = this.step ? (this.step.update ? this.step.update(this, dt) : (this.s.talked ? 'next' : null)) : this.active.update(this, dt);
      if (r === 'next') this.next();
      else if (r === 'done') this.complete();
      else if (typeof r === 'number') this.enterStep(r);
      else if (typeof r === 'string' && r.startsWith('fail')) this.fail(r.slice(5));
    }
    this.post(dt);
  }
  post(dt) {
    const g = this.g;
    this.side.update(dt);
    this.military.update(dt);
    this.stations.update(dt);
    this.story.update();
    // sinematik kamera (player.updateCamera'dan sonra çalışır, render'dan önce)
    const cc = g.cutsceneCam;
    if (cc && cc.pos) {
      if (!this.camOn) { this.camPos.copy(cc.pos); this.camOn = true; }
      this.camPos.lerp(cc.pos, 1 - Math.exp(-4 * dt));
      g.camera.position.copy(this.camPos);
      g.camera.lookAt(cc.look);
    } else this.camOn = false;
  }
}

