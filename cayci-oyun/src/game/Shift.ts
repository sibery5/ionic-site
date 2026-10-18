import * as THREE from 'three';
import { CELL, NPC, ORDERS, SHIFT, TEA, TRAY, WIND } from '../config';
import { Grid } from '../physics/grid';
import { TraySim } from '../physics/tray';
import { LEVELS, LevelDef, parseLevel } from './levels';
import { DAYS, Office } from './story';
import { OrderBook, Order, starsFor, TeaType } from './orders';
import { Rng } from '../core/rng';
import type { InputLike as Input } from '../core/input';
import { getLang, t, tx } from '../core/i18n';
import { audio } from '../audio/Audio';
import { buildLevel, BuiltLevel } from '../world/LevelBuilder';
import { Player } from '../entities/Player';
import { Npc } from '../entities/Npc';
import { Customer } from '../entities/Customer';
import { Cat } from '../entities/Cat';
import { TrayView } from '../entities/TrayView';
import { Particles } from '../fx/Particles';
import { TEA_COLORS, mat } from '../world/models';
import { skyTexture } from '../world/textures';
import type { Hud } from '../ui/Hud';

export interface ShiftConfig {
  dayIndex: number;
  mode: 'story' | 'free' | 'daily';
  seed: number;
  upgrades: Set<string>;
  knownGossip: Set<string>;
  sensitivity: number;
}

export interface ShiftResult {
  dayIndex: number;
  mode: ShiftConfig['mode'];
  earned: number;
  target: number;
  stars: number;
  delivered: number;
  spilled: number;
  broken: number;
  spins: number;
  gossip: string[]; // yeni duyulan ofis id'leri
}

interface Pour {
  type: TeaType;
  progress: number;
  sound: { update: (p: number) => void; stop: () => void };
}

const UP = new THREE.Vector3(0, 1, 0);

export class Shift {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private grid: Grid;
  private built: BuiltLevel;
  private player = new Player();
  private tray = new TraySim();
  private trayView = new TrayView();
  private npcs: Npc[] = [];
  private customers = new Map<string, Customer>();
  private cat: Cat | null = null;
  private fx = new Particles();
  private book: OrderBook;
  private rng: Rng;
  private offices: Office[];
  private time = 0;
  private duration: number = SHIFT.duration;
  private target: number;
  private earned = 0;
  private stats = { delivered: 0, spilled: 0, broken: 0, spins: 0 };
  private newGossip: string[] = [];
  private lastSpin = -99;
  private pour: Pour | null = null;
  private shoutCooldown = 0;
  private spillMsgCooldown = 0;
  private flashlight: THREE.SpotLight | null = null;
  private wind = { t: 3, dir: new THREE.Vector3(), level: 0, target: 0 };
  private ended = false;
  private camPos = new THREE.Vector3();
  private tutorialStep = 0;
  private def: LevelDef;

  constructor(
    private cfg: ShiftConfig,
    private hud: Hud,
    private onEnd: (r: ShiftResult) => void,
    aspect: number,
  ) {
    this.def = LEVELS[cfg.dayIndex];
    this.rng = new Rng(cfg.seed);
    const lv = parseLevel(this.def);
    this.grid = new Grid(lv);
    this.offices = DAYS[cfg.dayIndex].offices;
    this.target = SHIFT.targets[cfg.dayIndex];
    if (cfg.mode === 'daily') this.target = 120;
    this.built = buildLevel(this.def, this.grid, this.offices);
    this.scene.add(this.built.group);
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.05, 220);

    this.setupLights();

    // oyuncu: ocağa sırtını dönmüş, koridora bakar
    const [sx, sz] = Grid.center(...lv.start);
    const open = this.grid.neighborsWalkable(...lv.start);
    let yaw = 0;
    if (open.length) {
      const best = open.find(([x]) => x > lv.start[0]) ?? open[0];
      yaw = Math.atan2(best[0] - lv.start[0], best[1] - lv.start[1]);
    }
    this.player.place(sx, sz, yaw);
    this.scene.add(this.player.rig.root);
    this.tray.capacity = TRAY.baseCapacity + (cfg.upgrades.has('tray1') ? 1 : 0) + (cfg.upgrades.has('tray2') ? 1 : 0);
    this.tray.reset(this.player.hand);
    this.scene.add(this.trayView.group);

    // müşteriler
    for (const off of this.offices) {
      const desk = this.built.desks.get(off.id);
      if (!desk) continue;
      const c = new Customer(off, desk);
      this.customers.set(off.id, c);
      this.scene.add(c.rig.root, c.bubble);
    }
    // NPC'ler
    if (lv.npcPoints.length) {
      for (let i = 0; i < this.def.npcCount; i++) {
        const n = new Npc(this.grid, lv.npcPoints, this.rng);
        this.npcs.push(n);
        this.scene.add(n.rig.root);
      }
    }
    if (this.def.cat && lv.catStart) {
      this.cat = new Cat(this.grid, lv.catStart, this.rng);
      this.scene.add(this.cat.rig.root);
    }
    this.scene.add(this.fx.group);
    this.fx.onLand = (x, z, a) => {
      if (Math.random() < 0.35) this.fx.addPuddle(x, z, a * 3);
    };

    this.book = new OrderBook(
      this.offices.map((o) => o.id),
      this.rng,
    );
    if (cfg.dayIndex >= 3) this.book.maxActive = ORDERS.maxActiveLate;

    this.updateCamera(1);
    audio.musicMood = this.def.dark ? 'tense' : 'calm';
    audio.startAmbience(!!this.def.wind);
    this.hud.show();
    this.hud.setDay(`${tx(DAYS[cfg.dayIndex].floor)} · ${tx(DAYS[cfg.dayIndex].obstacle)}`);
    if (cfg.mode === 'story' && cfg.dayIndex === 0) this.tutorialStep = 1;
  }

  private setupLights() {
    const s = this.scene;
    const { w, d } = this.built.size;
    if (this.def.theme === 'teras') {
      s.background = skyTexture();
      s.fog = new THREE.Fog(0xf2d7a8, 30, 140);
      s.add(new THREE.HemisphereLight(0xbfd8f0, 0xb79a7a, 1.1));
      const sun = new THREE.DirectionalLight(0xffd29a, 2.4);
      sun.position.set(w * 0.5 - 18, 14, d * 0.5 - 10);
      sun.target.position.set(w / 2, 0, d / 2);
      this.shadowSun(sun, Math.max(w, d));
      s.add(sun, sun.target);
      this.buildSkyline();
      return;
    }
    s.background = new THREE.Color(this.def.dark ? 0x05070a : 0x2a2018);
    if (this.def.dark) {
      s.fog = new THREE.Fog(0x05070a, 4, 16);
      s.add(new THREE.HemisphereLight(0x3a4a6a, 0x1a140c, 0.28));
      for (const b of this.built.bulbs) (b.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
      const fl = new THREE.SpotLight(0xfff0d0, 70, 16, 0.62, 0.5, 1.2);
      fl.castShadow = true;
      fl.shadow.mapSize.set(1024, 1024);
      this.flashlight = fl;
      s.add(fl, fl.target);
      // acil durum ışıkları masaların yanında
      for (const desk of this.built.desks.values()) {
        const pl = new THREE.PointLight(0xff6a3a, 2.2, 4.5, 1.5);
        pl.position.copy(desk.center).setY(2.4);
        s.add(pl);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.08), mat(0xff6a3a, { emissive: 0xff4a1a }));
        lamp.position.copy(pl.position);
        s.add(lamp);
      }
      for (const o of this.built.ocak) {
        const pl = new THREE.PointLight(0xffb060, 3, 5, 1.5); // ocak ateşi
        pl.position.copy(o).setY(2.4);
        s.add(pl);
      }
      return;
    }
    s.fog = new THREE.Fog(0x3a2a1a, 14, 34);
    s.add(new THREE.HemisphereLight(0xfff1dc, 0x6b4a33, 1.0));
    s.add(new THREE.AmbientLight(0xffe8c8, 0.25));
    const sun = new THREE.DirectionalLight(0xffe2b0, 1.6);
    sun.position.set(w * 0.35, 9, -4);
    sun.target.position.set(w / 2, 0, d / 2);
    this.shadowSun(sun, Math.max(w, d));
    s.add(sun, sun.target);
  }

  private shadowSun(sun: THREE.DirectionalLight, size: number) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -size * 0.75;
    c.right = size * 0.75;
    c.top = size * 0.75;
    c.bottom = -size * 0.75;
    c.near = 0.5;
    c.far = 80;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
  }

  /** Teras: Haliç, Galata Kulesi ve cami siluetleri. */
  private buildSkyline() {
    const { w, d } = this.built.size;
    const cx = w / 2;
    const cz = d / 2;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x3f6f8f, roughness: 0.2, metalness: 0.3 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, -14, cz);
    this.scene.add(water);
    const rng = new Rng(1923);
    const houseCols = [0xe8d6b8, 0xd9b48f, 0xc98f6b, 0xe6e0d0, 0xb5543a, 0xd8cbb3];
    for (let i = 0; i < 140; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(22, 70);
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      // Haliç'e boşluk bırak (güney tarafı)
      if (Math.sin(a) > 0.55 && r > 30) continue;
      const h = rng.range(6, 16);
      const b = new THREE.Mesh(new THREE.BoxGeometry(rng.range(4, 9), h, rng.range(4, 9)), mat(rng.pick(houseCols)));
      b.position.set(x, -14 + h / 2, z);
      b.rotation.y = rng.range(0, Math.PI);
      this.scene.add(b);
      if (rng.next() < 0.5) {
        const roof = new THREE.Mesh(new THREE.ConeGeometry(4, 2, 4), mat(0xa0442a));
        roof.position.set(x, -14 + h + 1, z);
        roof.rotation.y = Math.PI / 4 + b.rotation.y;
        this.scene.add(roof);
      }
    }
    // Galata Kulesi
    const tower = new THREE.Group();
    tower.add(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 38, 16), mat(0xcdbfa6)));
    tower.children[0].position.y = 19;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(4, 9, 16), mat(0x3f5a6a, { metal: 0.4, rough: 0.5 }));
    cap.position.y = 42.5;
    tower.add(cap);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 2, 16), mat(0xb8a98f));
    ring.position.y = 37;
    tower.add(ring);
    tower.position.set(cx + 26, -14, cz - 30);
    this.scene.add(tower);
    // cami: kubbe + iki minare (karşı kıyıda)
    const mosque = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 22), mat(0xe2dccd));
    body.position.y = 6;
    mosque.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8a9aa6, { metal: 0.3, rough: 0.5 }));
    dome.position.y = 12;
    mosque.add(dome);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 36, 10), mat(0xe2dccd));
      m.position.set(s * 15, 18, 0);
      mosque.add(m);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 10), mat(0x8a9aa6));
      tip.position.set(s * 15, 39, 0);
      mosque.add(tip);
    }
    mosque.position.set(cx - 10, -14, cz + 95);
    this.scene.add(mosque);
  }

  get remaining() {
    return Math.max(0, this.duration - this.time);
  }

  update(dt: number, input: Input) {
    if (this.ended) return;
    this.time += dt;
    const now = this.time;

    // ---- oyuncu ----
    const others = this.npcs.map((n) => ({ pos: n.pos, radius: n.radius }));
    for (const c of this.customers.values()) others.push({ pos: c.desk.seat, radius: 0.25 });
    const step = this.player.update(dt, input, this.grid, {
      slippery: (x, z) => (this.built.wet.has(`${x},${z}`) ? 1 : 0) || this.fx.puddleAt(this.player.pos.x, this.player.pos.z),
      shoes: this.cfg.upgrades.has('shoes'),
      sensitivity: this.cfg.sensitivity,
      others,
    });
    if (step.step) audio.footstep(step.step);
    if (step.slipped) this.hud.toast(t('slip'), 'warn');

    // ---- NPC + kedi ----
    for (const n of this.npcs) n.update(dt, this.player.pos);
    if (this.cat) {
      const sp = Math.hypot(this.player.vel.x, this.player.vel.z);
      if (this.cat.update(dt, this.player.pos, sp)) {
        this.player.stumble(1);
        audio.meow();
        this.hud.toast(t('trip'), 'warn');
      }
    }

    // ---- tepsi ----
    const arm = this.player.armMode;
    this.tray.params.grip = arm ? TRAY.gripArmMode : TRAY.grip * (this.cfg.upgrades.has('wrist') ? 0.75 : 1);
    this.tray.params.damping = arm ? TRAY.dampingArmMode : TRAY.damping * (this.cfg.upgrades.has('wrist') ? 1.35 : 1);
    this.updateWind(dt);
    const ev = this.tray.step(this.player.hand, dt);
    this.collideTray();
    this.tray.cool(dt, this.cfg.upgrades.has('thermos') ? TEA.coolRateThermos : TEA.coolRate);
    if (this.tray.glasses.length) audio.clink(Math.min(1, Math.max(0, (ev.jerk - 6) / 40)));
    if (ev.spilled > 0.0005) {
      this.stats.spilled += ev.spilled;
      const g = this.tray.glasses[0];
      this.fx.spill(this.tray.pos.clone().add(new THREE.Vector3(0, 0.12, 0)), this.tray.vel, ev.spilled, g ? TEA_COLORS[g.type] : TEA_COLORS.demli);
      this.spillMsgCooldown -= dt;
      if (ev.spilled > 0.01 && this.spillMsgCooldown <= 0) {
        audio.splash(ev.spilled * 4);
        this.hud.toast(t('spill'), 'bad');
        this.spillMsgCooldown = 1.2;
      }
    }
    this.spillMsgCooldown -= dt;
    if (ev.flewOff > 0) {
      this.stats.broken += ev.flewOff;
      this.earned = Math.max(0, this.earned - ORDERS.brokenGlassPenalty * ev.flewOff);
      this.fx.shatter(this.tray.pos.clone());
      this.fx.spill(this.tray.pos.clone(), this.tray.vel, 0.6, TEA_COLORS.demli);
      audio.shatter();
      this.hud.toast(`${t('broke')} −${ORDERS.brokenGlassPenalty * ev.flewOff}₺`, 'bad');
    }
    if (ev.loop) {
      this.stats.spins++;
      this.lastSpin = now;
      audio.whoosh();
      if (this.tray.glasses.length) audio.applause();
      this.fx.sparkle(this.tray.pos.clone());
      this.hud.toast(t('spin'), 'good');
      if (this.tutorialStep === 4) this.tutorialStep = 5;
    }

    // ---- ocak ----
    const nearOcak = this.built.ocak.some((o) => o.distanceTo(this.player.pos) < ORDERS.ocakRange);
    this.handlePour(dt, input, nearOcak);
    if (nearOcak && input.wasPressed('KeyQ') && this.tray.glasses.length) {
      this.tray.glasses = [];
      audio.splash(0.1);
    }

    // ---- siparişler ----
    this.book.update(
      dt,
      now,
      (o) => this.onNewOrder(o),
      (o) => {
        const c = this.customers.get(o.office);
        c?.angry();
        audio.fail();
        if (c) this.hud.toast(`${tx(c.office.person)} ${t('expired')}`, 'bad');
      },
    );

    // ---- teslim ----
    const desk = this.nearestDeskWithOrder();
    let hint: string | null = null;
    if (nearOcak) hint = t('ocakHint');
    if (desk) {
      hint = t('deliverHint');
      if (input.wasPressed('KeyE')) this.deliver(desk);
    }
    this.hud.hint(hint);

    // ---- bağırma ----
    this.shoutCooldown -= dt;
    if (input.wasPressed('KeyF') && this.shoutCooldown <= 0) {
      this.shoutCooldown = ORDERS.shoutCooldown;
      audio.shout();
      const near = [...this.customers.values()].filter((c) => c.desk.center.distanceTo(this.player.pos) < 9).map((c) => c.office.id);
      const o = this.book.shout(now, near);
      if (o) this.onNewOrder(o);
    }

    // ---- görsel güncellemeler ----
    for (const [id, c] of this.customers) {
      const o = this.book.orderFor(id);
      c.showOrder(o ? o.items : null, o ? (now - o.createdAt) / o.patience : 0);
      c.update(dt);
    }
    this.trayView.sync(this.tray);
    const hot = this.trayView.glassWorldPositions(this.tray).filter((_, i) => this.tray.glasses[i].temp > 55);
    this.fx.emitSteam(hot, 2.2, dt);
    this.fx.emitSteam(this.built.steamPoints, 5, dt);
    this.fx.update(dt);
    this.updateCamera(dt);
    if (this.flashlight) {
      const f = this.player.forward(new THREE.Vector3());
      this.flashlight.position.copy(this.player.pos).add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(f, 0.2);
      this.flashlight.target.position.copy(this.player.pos).addScaledVector(f, 4).setY(0.4);
    }

    // ---- HUD ----
    this.hud.setTime(this.remaining, this.duration);
    this.hud.setMoney(this.earned, this.target);
    this.hud.setTickets(
      this.book.active.map((o) => ({
        office: tx(this.customers.get(o.office)!.office.name),
        items: o.items,
        urgency: (now - o.createdAt) / o.patience,
      })),
    );
    this.hud.setTray(this.tray.glasses, this.tray.capacity);
    this.tutorial(nearOcak);

    if (this.remaining <= 0) this.finish();
  }

  private tutorial(nearOcak: boolean) {
    if (!this.tutorialStep) return;
    const tr = (a: string, b: string) => (getLang() === 'tr' ? a : b);
    let msg = '';
    switch (this.tutorialStep) {
      case 1:
        msg = tr('Ocağın başındasın. 1 veya 2 tuşunu basılı tut, renk hedefe gelince bırak.', "You're at the stove. Hold 1 or 2 and release when the color hits the target.");
        if (this.tray.glasses.length) this.tutorialStep = 2;
        break;
      case 2:
        msg = tr('Balonlu müşteriye yürü. Yumuşak hızlan, yumuşak dur. Masada E ile teslim et.', 'Walk to a customer with a bubble. Speed up and stop gently. Press E at the desk.');
        if (this.stats.delivered > 0) this.tutorialStep = 3;
        break;
      case 3:
        msg = tr('Harika! Kalabalıkta Boşluk ile tepsiyi kaldırabilirsin. F ile "Çaaay!" diye bağır.', 'Great! Hold Space to lift the tray over crowds. Press F to shout "Teaaa!".');
        if (this.time > 70 || this.stats.delivered > 2) this.tutorialStep = 4;
        break;
      case 4:
        msg = tr('Fırıldak: sol tıka basılı tut ve fareyle hızlı daireler çiz. Yavaş kalırsan tepede bardaklar uçar!', 'Spin: hold left click and draw fast circles with the mouse. Too slow and the glasses fly off at the top!');
        if (this.time > 130) this.tutorialStep = 5;
        break;
      default:
        msg = '';
    }
    void nearOcak;
    this.hud.coach(msg || null);
  }

  private onNewOrder(o: Order) {
    const c = this.customers.get(o.office);
    if (!c) return;
    audio.babble(c.voicePitch, 4);
    c.talk();
  }

  private handlePour(dt: number, input: Input, nearOcak: boolean) {
    if (!this.pour && nearOcak) {
      const type: TeaType | null = input.wasPressed('Digit1') || input.wasPressed('Numpad1') ? 'acik' : input.wasPressed('Digit2') || input.wasPressed('Numpad2') ? 'demli' : null;
      if (type) {
        if (this.tray.glasses.length >= this.tray.capacity) this.hud.toast(t('trayFull'), 'warn');
        else this.pour = { type, progress: 0, sound: audio.pour() };
      }
    }
    if (!this.pour) {
      this.hud.pourBar(null, 'acik');
      return;
    }
    const p = this.pour;
    const key = p.type === 'acik' ? ['Digit1', 'Numpad1'] : ['Digit2', 'Numpad2'];
    const holding = key.some((k) => input.isDown(k));
    p.progress = Math.min(1, p.progress + dt / TEA.pourTime);
    p.sound.update(p.progress);
    this.hud.pourBar(p.progress, p.type);
    if (!holding || p.progress >= 1 || !nearOcak) {
      p.sound.stop();
      const win = p.type === 'acik' ? TEA.acikWindow : TEA.demliWindow;
      const perfect = p.progress >= win[0] && p.progress <= win[1];
      const close = p.progress >= win[0] - 0.1 && p.progress <= win[1] + 0.1;
      const score = perfect ? 1.2 : close ? 1.0 : 0.8;
      if (p.progress > 0.12) {
        this.tray.addGlass(p.type, TEA.fillLevel, TEA.pourTemp, score);
        audio.clink(0.4);
        if (perfect) {
          this.hud.toast(t('perfectPour'), 'good');
          audio.coin(0);
        } else if (!close) this.hud.toast(t('okPour'), 'warn');
      }
      this.pour = null;
      this.hud.pourBar(null, 'acik');
    }
  }

  private nearestDeskWithOrder(): Customer | null {
    let best: Customer | null = null;
    let bd = ORDERS.deliverRange;
    for (const c of this.customers.values()) {
      if (!this.book.orderFor(c.office.id)) continue;
      const d = Math.hypot(c.desk.center.x - this.player.pos.x, c.desk.center.z - this.player.pos.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  private deliver(c: Customer) {
    const style = this.time - this.lastSpin < ORDERS.styleWindow && c.desk.center.distanceTo(this.player.pos) < ORDERS.styleRange;
    const res = this.book.deliver(c.office.id, this.tray.glasses, this.time, style);
    if (!res) return;
    if (res.delivered === 0) {
      this.hud.toast(t('noMatch'), 'warn');
      return;
    }
    this.stats.delivered += res.delivered;
    this.earned += res.tip;
    audio.coin(res.tip);
    audio.babble(c.voicePitch, 5);
    c.talk();
    this.hud.floatMoney(res.tip);
    if (res.completed) {
      const line = this.rng.pick(c.office.lines);
      this.hud.speech(tx(c.office.person), tx(line));
      if (style) this.hud.toast(t('showTip'), 'good');
      if (res.perfect && c.office.gossip) {
        const key = `${this.cfg.dayIndex}:${c.office.id}`;
        if (this.cfg.mode === 'story' && !this.cfg.knownGossip.has(key) && !this.newGossip.includes(key)) {
          this.newGossip.push(key);
          audio.jingle();
          this.hud.gossipCard(tx(c.office.person), tx(c.office.gossip));
        }
      }
    }
  }

  /** Tepsi duvara, masaya ya da insana çarpar. */
  private collideTray() {
    const pos = this.tray.pos;
    const hit = this.grid.resolveCircle(pos, TRAY.radius, pos.y);
    let bump = 0;
    if (hit.hit) {
      const n = new THREE.Vector3(hit.nx, 0, hit.nz).normalize();
      const vn = this.tray.vel.dot(n);
      if (vn < 0) this.tray.push(n, -vn * (1 + TRAY.collideRestitution));
      bump = Math.max(bump, -vn);
    }
    if (pos.y < NPC.trayHitHeight) {
      for (const npc of this.npcs) {
        const d = new THREE.Vector3(pos.x - npc.pos.x, 0, pos.z - npc.pos.z);
        const min = TRAY.radius + npc.radius;
        const l = d.length();
        if (l < min && l > 1e-4) {
          d.divideScalar(l);
          pos.addScaledVector(d, min - l);
          const rel = this.tray.vel.clone().sub(npc.vel);
          const vn = rel.dot(d);
          this.tray.push(d, Math.max(0.5, -vn * (1 + TRAY.collideRestitution)));
          bump = Math.max(bump, 1.5);
        }
      }
    }
    if (bump > 0.4 && this.tray.glasses.length) audio.clink(Math.min(1, bump / 3));
  }

  private updateWind(dt: number) {
    if (!this.def.wind) {
      this.tray.externalAccel.set(0, 0, 0);
      return;
    }
    const w = this.wind;
    w.t -= dt;
    if (w.t <= 0) {
      w.t = this.rng.range(WIND.gustMin, WIND.gustMax);
      const a = this.rng.range(0, Math.PI * 2);
      w.dir.set(Math.cos(a), 0, Math.sin(a));
      w.target = this.rng.range(0.4, 1);
      setTimeout(() => (w.target = 0.1), 1400);
    }
    w.level += (w.target - w.level) * (1 - Math.exp(-2.5 * dt));
    const low = this.player.raised ? 1.4 : 1;
    this.tray.externalAccel.copy(w.dir).multiplyScalar(WIND.strength * w.level * low);
    audio.setWind(w.level);
    this.hud.wind(w.level > 0.25 ? Math.atan2(w.dir.x, w.dir.z) - this.player.camYaw : null, w.level);
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const f = p.forward(new THREE.Vector3(), p.camYaw);
    const dist = p.armMode ? 2.6 : 3.2;
    const height = this.def.theme === 'teras' ? 2.4 : 2.1;
    const desired = p.pos.clone().addScaledVector(UP, height).addScaledVector(f, -dist);
    const head = p.pos.clone().addScaledVector(UP, 1.5);
    const frac = this.grid.rayFraction(head.x, head.z, desired.x, desired.z, desired.y);
    // arkada duvar varsa kamera yaklaşır ve yükselir (kafaya girmesin)
    const k = Math.max(0.12, frac - 0.06);
    desired.x = head.x + (desired.x - head.x) * k;
    desired.z = head.z + (desired.z - head.z) * k;
    desired.y += (1 - frac) * (this.def.theme === 'teras' ? 0 : 0.75);
    if (dt >= 1) this.camPos.copy(desired);
    else this.camPos.lerp(desired, 1 - Math.exp(-10 * dt));
    this.camera.position.copy(this.camPos);
    const look = p.pos.clone().addScaledVector(UP, 1.0 - (1 - frac) * 0.3).addScaledVector(f, 0.9 + (1 - frac) * 0.8);
    this.camera.lookAt(look);
  }

  /** HUD için dünya → ekran. */
  project(v: THREE.Vector3, w: number, h: number): [number, number] | null {
    const p = v.clone().project(this.camera);
    if (p.z > 1) return null;
    return [((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h];
  }

  trayScreen(w: number, h: number) {
    return this.project(this.tray.pos, w, h);
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.pour?.sound.stop();
    audio.stopAmbience();
    const r: ShiftResult = {
      dayIndex: this.cfg.dayIndex,
      mode: this.cfg.mode,
      earned: Math.round(this.earned),
      target: this.target,
      stars: starsFor(this.earned, this.target),
      ...this.stats,
      gossip: this.newGossip,
    };
    this.onEnd(r);
  }

  /** Test/demo amaçlı: vardiyayı hemen bitir. */
  forceEnd() {
    this.finish();
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.pour?.sound.stop();
    audio.stopAmbience();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry?.dispose();
    });
  }

  get cellSize() {
    return CELL;
  }
}
