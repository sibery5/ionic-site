import * as THREE from 'three';
import { ORDERS, TEA, TRAY, WIND } from '../config';
import { Grid } from '../physics/grid';
import { TraySim } from '../physics/tray';
import { SPIN, SpinDriver, meterAt, spinQuality } from '../physics/spin';
import { parseLevel } from './levels';
import { GREED, greedParams, greedTip, nextCombo } from './greedRules';
import { collideTray, followCamera } from './common';
import type { Venue } from './venues';
import type { Office } from './story';
import { Rng } from '../core/rng';
import type { InputLike as Input } from '../core/input';
import { getLang, t, tx } from '../core/i18n';
import { audio } from '../audio/Audio';
import { buildLevel, BuiltLevel } from '../world/LevelBuilder';
import { setupLights, type Quality } from '../world/environment';
import { Player } from '../entities/Player';
import { Npc } from '../entities/Npc';
import { Customer } from '../entities/Customer';
import { Cat } from '../entities/Cat';
import { TrayView } from '../entities/TrayView';
import { Particles } from '../fx/Particles';
import { TEA_COLORS, makeGlass, makeTipJar } from '../world/models';
import { emptyStats, type RunStats } from '../meta/stats';
import type { CosmeticSlot } from '../meta/progress';
import type { Hud } from '../ui/Hud';
import type { TrayAssist } from '../core/save';
import { repTipFactor } from '../meta/titles';
import { Intrigue } from './Intrigue';
import { TOPICS, vipRumor, type Topic } from './rumors';

// Bir vardiya: 90-120 saniye. Tepsiye istediğin kadar bardak koy, bahşişleri kavanozda taşı, ocakta kasaya geçir.
// Mekânın kuralları (renkli siparişler, Gülsüm Abla, karanlık, rüzgâr, Paşa) Venue'dan gelir.

export type TeaType = 'acik' | 'demli';
export type OrderKind = 'normal' | 'vip' | 'rush' | 'gossip';

export interface RunConfig {
  venue: Venue;
  mode: RunStats['mode'];
  seed: number;
  upgrades: Set<string>;
  look: Record<CosmeticSlot, string>;
  sensitivity: number;
  quality: Quality;
  tutorial: boolean;
  /** cep defterindeki dedikodular, daha önce yapılmış satışlar, kanıt sayısı */
  pocket: string[];
  sold: string[];
  evidence: number;
  rep: number;
  title: number;
  trayAssist: TrayAssist;
  camDist: number;
}

/** Tepsi zorluğu: fizik çarpanları ve skor çarpanı. */
export const ASSIST: Record<TrayAssist, { spill: number; tower: number; damping: number; score: number }> = {
  easy: { spill: 1.35, tower: 5, damping: 1.45, score: 0.8 },
  normal: { spill: 1, tower: 0, damping: 1, score: 1 },
  master: { spill: 0.8, tower: -3, damping: 0.85, score: 1.25 },
};

interface RunOrder {
  office: string;
  kind: OrderKind;
  items: TeaType[];
  createdAt: number;
  patience: number;
  perfect: boolean;
  topic?: Topic;
}

interface Debris {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  kind: 'glass' | 'jar';
}

const RUSH_HOUR = 20; // son 20 saniye: çay saati
const KIND_PAY: Record<OrderKind, number> = { normal: 1, vip: 3, rush: 2, gossip: 1 };

export class Run {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  readonly venue: Venue;
  private grid: Grid;
  private built: BuiltLevel;
  private player: Player;
  private tray = new TraySim();
  private trayView: TrayView;
  private npcs: Npc[] = [];
  private mopper: Npc | null = null;
  private customers = new Map<string, Customer>();
  private cat: Cat | null = null;
  private fx = new Particles();
  private rng: Rng;
  private camPos = new THREE.Vector3();
  private debris: Debris[] = [];
  private flashlight: THREE.SpotLight | null = null;
  private ferry: THREE.Object3D | null = null;

  private time = 0;
  private ended = false;
  private bank = 0;
  private jar = 0;
  private combo = 1;
  private spinBoostUntil = -1;
  private orders = new Map<string, RunOrder>();
  private orderTimer = 2;
  private vipTimes: number[];
  private pour: { type: TeaType; t: number; sound: { update: (p: number) => void; stop: () => void } } | null = null;
  private spin: { stage: 'meter' | 'spin'; t: number; driver?: SpinDriver } | null = null;
  private slowMo = 0;
  private shake = 0;
  private spillMsgCooldown = 0;
  private mopTimer = 0;
  private rushHour = false;
  private lockUsed = false;
  private pourBlocked = false;
  private bumpAngerCd = 0;
  /** son karedeki tepsi çarpması (m/s), denge ölçümü için */
  lastBump = 0;
  private wind = { t: 3, dir: new THREE.Vector3(), level: 0, target: 0, release: 0 };
  private stats: RunStats;
  private coachStep: number;
  readonly intrigue: Intrigue;
  private assist: (typeof ASSIST)[TrayAssist];

  constructor(
    private cfg: RunConfig,
    private hud: Hud,
    private onEnd: (s: RunStats) => void,
    aspect: number,
  ) {
    this.venue = cfg.venue;
    this.rng = new Rng(cfg.seed);
    this.stats = emptyStats(cfg.venue.id, cfg.mode);
    const def = cfg.venue.level;
    const lv = parseLevel(def);
    this.grid = new Grid(lv);
    this.built = buildLevel(def, this.grid, cfg.venue.offices);
    this.scene.add(this.built.group);
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.05, 220);
    this.flashlight = setupLights(this.scene, this.built, def, cfg.venue.rules.dark, cfg.quality).flashlight;
    this.ferry = this.scene.getObjectByName('ferry') ?? null;

    this.player = new Player(cfg.look);
    const [sx, sz] = Grid.center(...lv.start);
    const open = this.grid.neighborsWalkable(...lv.start);
    const best = open.find(([x]) => x > lv.start[0]) ?? open[0] ?? [lv.start[0] + 1, lv.start[1]];
    this.player.place(sx, sz, Math.atan2(best[0] - lv.start[0], best[1] - lv.start[1]));
    this.scene.add(this.player.rig.root);
    this.trayView = new TrayView(cfg.look);
    this.tray.capacity = GREED.capacity;
    this.tray.hasJar = true;
    this.tray.reset(this.player.hand);
    this.scene.add(this.trayView.group);

    for (const off of cfg.venue.offices) {
      const desk = this.built.desks.get(off.id);
      if (!desk) continue;
      const c = new Customer(off, desk);
      this.customers.set(off.id, c);
      this.scene.add(c.rig.root, c.bubble);
    }
    if (lv.npcPoints.length) {
      for (let i = 0; i < def.npcCount; i++) {
        const n = new Npc(this.grid, lv.npcPoints, this.rng);
        this.npcs.push(n);
        this.scene.add(n.rig.root);
      }
      if (cfg.venue.rules.mopper) {
        // Gülsüm Abla: yavaş yürür, arkasında ıslak iz bırakır
        this.mopper = new Npc(this.grid, lv.npcPoints, this.rng, { shirt: 0x8a9a5b, pants: 0x3b3b3b, skin: 0xc68a5f, hair: 0x2a1a10, scarf: 0x2d6a8a, mop: true }, 0.75);
        this.npcs.push(this.mopper);
        this.scene.add(this.mopper.rig.root);
      }
    }
    if (cfg.venue.rules.cat && lv.catStart) {
      this.cat = new Cat(this.grid, lv.catStart, this.rng);
      this.scene.add(this.cat.rig.root);
    }
    this.scene.add(this.fx.group);
    this.fx.onLand = (x, z, a) => {
      if (Math.random() < 0.35) this.fx.addPuddle(x, z, a * 3);
    };

    // VIP siparişlerinin zamanları (vardiyanın belli anlarında)
    const d = cfg.venue.duration;
    this.vipTimes = cfg.venue.id === 'salon' ? [d * 0.55] : cfg.venue.id === 'teras' ? [d * 0.2, d * 0.45, d * 0.7] : [d * 0.25, d * 0.6];
    this.coachStep = cfg.tutorial ? 1 : 0;
    this.assist = ASSIST[cfg.mode === 'daily' ? 'normal' : cfg.trayAssist];
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const run = this;
    this.intrigue = new Intrigue({
      get time() {
        return run.time;
      },
      mode: cfg.mode,
      hud: this.hud,
      player: this.player,
      tray: this.tray,
      grid: this.grid,
      rng: this.rng,
      fx: this.fx,
      stats: this.stats,
      npcs: this.npcs,
      mopper: this.mopper,
      pocket: cfg.pocket,
      soldBefore: cfg.sold,
      evidenceBefore: cfg.evidence,
      title: cfg.title,
      tutorial: cfg.tutorial,
      get spinning() {
        return !!run.spin;
      },
      nearOcak: () => run.built.ocak.some((o) => o.distanceTo(run.player.pos) < ORDERS.ocakRange),
      addJar: (v) => {
        run.jar += v;
      },
      fine: (v) => {
        const got = Math.min(v, Math.floor(run.bank));
        run.bank -= got;
        return got;
      },
      smashGlass: () => run.smashGlass(),
      loseJar: () => {
        run.tray.hasJar = false;
        run.loseJar();
      },
      cancelOrder: (id) => {
        run.orders.delete(id);
      },
      slowMo: (sec) => {
        run.slowMo = Math.max(run.slowMo, sec);
      },
      shake: (v) => {
        run.shake = Math.max(run.shake, v);
      },
    });

    followCamera({ camera: this.camera, pos: this.camPos }, this.player, this.grid, def.theme === 'teras', 1, 0, 0.55);
    audio.musicMood = cfg.venue.rules.dark ? 'tense' : 'calm';
    audio.setIntensity(0);
    audio.startAmbience(cfg.venue.rules.wind);
    this.hud.show();
    this.hud.setMode(true);
    this.hud.setDay(`${tx(cfg.venue.name)} · ${tx(cfg.venue.obstacle)}`);
  }

  get remaining() {
    return Math.max(0, this.venue.duration - this.time);
  }

  private has(u: string) {
    return this.cfg.mode !== 'daily' && this.cfg.upgrades.has(u);
  }

  update(realDt: number, input: Input) {
    if (this.ended) return;
    // dedikodu paneli açıkken dünya durur, sadece seçim yapılır
    if (this.intrigue.panel) {
      this.intrigue.updatePanel(realDt, input);
      this.hud.hint(null);
      return;
    }
    let dt = realDt;
    if (this.slowMo > 0) {
      this.slowMo -= realDt;
      dt = realDt * GREED.slowMoScale;
    }
    this.shake = Math.max(0, this.shake - realDt * 0.25);
    this.time += dt;
    const now = this.time;
    const rules = this.venue.rules;

    // ---- çay saati ----
    if (!this.rushHour && this.remaining <= RUSH_HOUR) {
      this.rushHour = true;
      this.hud.big(getLang() === 'tr' ? 'ÇAY SAATİ!' : 'TEA TIME!', getLang() === 'tr' ? 'Bahşişler ×1,5' : 'Tips ×1.5');
      audio.jingle();
      audio.musicMood = 'tense';
    }

    // ---- oyuncu ----
    const others = this.npcs.map((n) => ({ pos: n.pos, radius: n.radius }));
    for (const c of this.customers.values()) if (!c.standing) others.push({ pos: c.desk.seat, radius: 0.25 });
    others.push(...this.intrigue.bodies());
    const step = this.player.update(dt, input, this.grid, {
      slippery: (x, z) => (this.built.wet.has(`${x},${z}`) ? 1 : 0) || this.fx.puddleAt(this.player.pos.x, this.player.pos.z),
      shoes: this.has('shoes'),
      sensitivity: this.cfg.sensitivity,
      others,
      turnLimit: this.spin ? Infinity : Math.max(1.8, 5 - 0.3 * this.tray.glasses.length),
    });
    if (step.step) audio.footstep(step.step);
    if (step.slipped) {
      this.stats.slips++;
      this.intrigue.addAnger(10);
      this.hud.toast(t('slip'), 'warn');
    }
    for (const n of this.npcs) n.update(dt, this.player.pos, this.tray.pos);
    // han sakinleri birbirinin içinden geçmez
    for (let a = 0; a < this.npcs.length; a++)
      for (let b = a + 1; b < this.npcs.length; b++) {
        const A = this.npcs[a].pos;
        const B = this.npcs[b].pos;
        const dx = B.x - A.x;
        const dz = B.z - A.z;
        const l = Math.hypot(dx, dz);
        const min = this.npcs[a].radius + this.npcs[b].radius;
        if (l < min) {
          const nx = l > 1e-4 ? dx / l : 1;
          const nz = l > 1e-4 ? dz / l : 0;
          const push = (min - l) / 2;
          A.x -= nx * push;
          A.z -= nz * push;
          B.x += nx * push;
          B.z += nz * push;
        }
      }
    if (this.mopper) {
      this.mopTimer -= dt;
      if (this.mopTimer <= 0 && this.mopper.vel.lengthSq() > 0.05) {
        this.mopTimer = 0.45;
        const back = this.mopper.vel.clone().normalize().multiplyScalar(-0.5);
        this.fx.addPuddle(this.mopper.pos.x + back.x, this.mopper.pos.z + back.z, 0.5, true, 12);
      }
    }
    if (this.cat && this.cat.update(dt, this.player.pos, Math.hypot(this.player.vel.x, this.player.vel.z))) {
      this.stats.catTrips++;
      this.intrigue.addAnger(15);
      this.player.stumble(1);
      audio.meow();
      this.hud.toast(t('trip'), 'warn');
    }

    // ---- Fırıldak ----
    this.updateSpin(dt, input);
    // ---- entrika: kovalayanlar, sinir, tepsiyle vurma, mesajlar ----
    this.intrigue.update(dt, input);

    // ---- tepsi ----
    const n = this.tray.glasses.length;
    if (this.spin?.driver) {
      this.tray.params.grip = TRAY.gripArmMode;
      this.tray.params.damping = this.spin.driver.braking ? SPIN.brakeDamping : TRAY.dampingArmMode;
      this.tray.params.catchAssist = this.spin.driver.braking;
      this.tray.params.spillScale = 1;
    } else {
      const p = greedParams(n);
      if (this.has('wrist')) p.grip = Math.max(TRAY.grip * 0.8, p.grip - 0.08);
      if (this.has('plates')) p.towerAngle += 3;
      p.spillScale *= this.assist.spill;
      p.towerAngle += this.assist.tower;
      Object.assign(this.tray.params, p);
      this.tray.params.catchAssist = false;
      this.tray.params.damping = (this.player.armMode ? TRAY.dampingArmMode : TRAY.damping) * this.assist.damping;
      if (this.player.armMode) this.tray.params.grip = TRAY.gripArmMode;
    }
    this.updateWind(dt);
    const ev = this.tray.step(this.player.hand, dt);
    const bump = collideTray(this.tray, this.grid, this.npcs.filter((n) => !n.isDown));
    this.lastBump = bump;
    this.bumpAngerCd -= dt;
    if (bump >= 1.5 && this.bumpAngerCd <= 0) {
      // biri tepsiye çarptı: sinir
      this.intrigue.addAnger(25);
      this.bumpAngerCd = 1;
    }
    if (bump > 0.4 && this.tray.glasses.length) audio.clink(Math.min(1, bump / 3));
    this.tray.cool(dt, TEA.coolRate);
    if (this.tray.glasses.length) audio.clink(Math.min(1, Math.max(0, (ev.jerk - 6) / 40)));
    if (ev.spilled > 0.0005) {
      this.stats.spilled += ev.spilled;
      const g = this.tray.glasses[0];
      this.fx.spill(this.tray.pos.clone().add(new THREE.Vector3(0, 0.12, 0)), this.tray.vel, ev.spilled, g ? TEA_COLORS[g.type] : TEA_COLORS.demli);
      if (ev.spilled > 0.01 && this.spillMsgCooldown <= 0) {
        audio.splash(ev.spilled * 4);
        this.hud.toast(t('spill'), 'bad');
        this.spillMsgCooldown = 1.2;
      }
    }
    this.spillMsgCooldown -= dt;
    if (ev.fallen > 0) {
      this.stats.broken += ev.fallen;
      for (let i = 0; i < ev.fallen; i++) this.throwGlass(0.25 + i * 0.03);
      this.loseCombo();
      this.hud.toast(`${t('broke')} ×${ev.fallen}`, 'bad');
    }
    if (ev.flewOff > 0) {
      this.stats.broken += ev.flewOff;
      for (let i = 0; i < ev.flewOff; i++) this.throwGlass(0.1 + i * 0.02);
      this.loseCombo();
      this.disaster(ev.flewOff);
    }
    if (ev.jarLost) this.loseJar();
    if (ev.loop) {
      this.fx.sparkle(this.tray.pos.clone());
      audio.whoosh();
    }
    this.stats.maxTower = Math.max(this.stats.maxTower, this.tray.glasses.length);

    // ---- ocak ----
    const nearOcak = this.built.ocak.some((o) => o.distanceTo(this.player.pos) < ORDERS.ocakRange);
    if (nearOcak) {
      if (!this.tray.hasJar) {
        this.tray.hasJar = true;
        this.hud.toast(t('newJar'), 'warn');
      }
      if (this.jar > 0.05) {
        const amount = this.jar;
        this.bank += amount;
        this.stats.banks++;
        this.stats.maxBank = Math.max(this.stats.maxBank, Math.round(amount));
        this.hud.toast(`+${amount.toFixed(1)}₺ ${t('banked')}`, 'good');
        audio.coin(amount);
        setTimeout(() => audio.coin(amount + 2), 90);
        this.jar = 0;
      }
    }
    // ---- siparişler ----
    // ocağın dibindeki masaya da servis yapılabilsin: tepside uyan bardak varsa E önce teslim eder
    this.updateOrders(dt, now);
    const near = this.nearestDeskWithOrder();
    const desk = near && (!nearOcak || this.canServe(near)) ? near : null;
    if (desk && input.wasPressed('KeyE')) {
      this.deliver(desk, now);
      this.pourBlocked = true;
    }
    if (!input.isDown('KeyE')) this.pourBlocked = false;
    this.handlePour(dt, input, nearOcak && !this.pourBlocked);
    let hint: string | null = null;
    if (desk) hint = t('deliverHint');
    else if (nearOcak) hint = rules.colored ? t('pourHintColored') : t('pourHint');
    this.hud.hint(hint);

    // ---- görsel ----
    for (const [id, c] of this.customers) {
      const o = this.orders.get(id);
      if (!c.standing) c.showOrder(o ? o.items : null, o ? (now - o.createdAt) / o.patience : 0, o?.kind ?? 'normal', o?.topic ? TOPICS[o.topic].icon : '');
      c.update(dt);
    }
    this.trayView.sync(this.tray);
    this.trayView.setJar(this.tray.hasJar, this.jar);
    const hot = this.trayView.glassWorldPositions(this.tray).filter((_, i) => i % 2 === 0);
    this.fx.emitSteam(hot, 1.5, dt);
    this.fx.emitSteam(this.built.steamPoints, 5, dt);
    this.fx.update(dt);
    this.updateDebris(dt);
    followCamera({ camera: this.camera, pos: this.camPos }, this.player, this.grid, this.venue.level.theme === 'teras', realDt, this.shake, 0.55, this.cfg.camDist);
    if (this.flashlight) {
      const f = this.player.forward(new THREE.Vector3());
      this.flashlight.position.copy(this.player.pos).add(new THREE.Vector3(0, 1.6, 0)).addScaledVector(f, 0.2);
      this.flashlight.target.position.copy(this.player.pos).addScaledVector(f, 4).setY(0.4);
      // arada bir titreyen ışık
      this.flashlight.intensity = 70 * (Math.sin(now * 37) > 0.995 ? 0.3 : 1);
    }
    if (this.ferry) this.ferry.position.x += dt * 0.6;
    for (const sp of this.built.spinners) sp.obj.rotation[sp.obj.name === 'minute' ? 'z' : 'y'] += sp.speed * dt;
    audio.setIntensity(Math.min(1, Math.max(this.tray.glasses.length / 11 + (this.rushHour ? 0.35 : 0), this.intrigue.chaseLevel + 0.4 * Math.sign(this.intrigue.chaseLevel))));

    // ---- HUD ----
    this.hud.setTime(this.remaining, this.venue.duration);
    this.hud.setGreed({ bank: this.bank, jar: this.jar, hasJar: this.tray.hasJar, combo: this.combo, tower: this.tray.glasses.length, spinBoost: now < this.spinBoostUntil });
    this.hud.setTickets(
      [...this.orders.entries()].map(([id, o]) => ({
        office: `${o.topic ? `👂${TOPICS[o.topic].icon} ` : ''}${tx(this.customers.get(id)!.office.name)}`,
        items: o.items,
        kind: o.kind,
        label: this.venue.rules.colored ? undefined : `${o.items.length} ${t('greedOrder')}`,
        urgency: (now - o.createdAt) / o.patience,
      })),
    );
    this.hud.setTray(this.tray.glasses, this.tray.capacity);
    this.coach();
    if (this.remaining <= 0) this.finish();
  }

  // ---------------- öğretici ----------------

  private coach() {
    if (!this.coachStep) return;
    const tr = getLang() === 'tr';
    const lines = [
      '',
      tr ? 'Ocaktasın. E\'ye basılı tut: tepsiye bardak ekle. Çok bardak = çok bahşiş, ama tepsi ağırlaşır!' : "You're at the stove. Hold E to add glasses. More glasses = bigger tips, but a heavier tray!",
      tr ? 'Balonlu müşteriye git, E ile teslim et. Ctrl basılıyken parmak ucunda, Shift ile koşarak yürürsün.' : 'Walk to a customer with a bubble and press E. Hold Ctrl to tiptoe, Shift to run.',
      tr ? 'Bahşiş tepsideki kavanoza girdi. Ocağa dönünce kasaya geçer. Tepsi uçarsa kavanoz da gider!' : 'Tips go into the jar on your tray. Return to the stove to bank them. Crash and the jar is gone!',
      tr ? 'F: Fırıldak. İğne yeşildeyken tekrar F. Tutarsa sonraki teslim ×2!' : 'F: Spin. Press F again when the needle is on green. Nail it and the next delivery pays ×2!',
      tr ? 'Altın balon VIP: ×3 bahşiş. Kırmızı balon acele: ×2 ama çabuk sabrı tükenir.' : 'Gold bubble is VIP: ×3 tips. Red bubble is a rush order: ×2, but they lose patience fast.',
    ];
    if (this.coachStep === 1 && this.tray.glasses.length >= 2) this.coachStep = 2;
    if (this.coachStep === 2 && this.stats.delivered > 0) this.coachStep = 3;
    if (this.coachStep === 3 && this.bank > 0) this.coachStep = 4;
    if (this.coachStep === 4 && this.stats.spins > 0) this.coachStep = 5;
    if (this.coachStep === 5 && this.stats.ordersCompleted >= 4) this.coachStep = 0;
    this.hud.coach(this.coachStep ? lines[this.coachStep] : null);
  }

  // ---------------- doldurma ----------------

  private handlePour(dt: number, input: Input, nearOcak: boolean) {
    const colored = this.venue.rules.colored;
    const wantType: TeaType | null = !nearOcak || this.spin ? null : input.isDown('KeyE') ? 'demli' : colored && input.isDown('KeyQ') ? 'acik' : null;
    const full = this.tray.glasses.length >= this.tray.capacity;
    if (!wantType || full) {
      if (wantType && full && (input.wasPressed('KeyE') || input.wasPressed('KeyQ'))) this.hud.toast(t('trayFull'), 'warn');
      this.pour?.sound.stop();
      this.pour = null;
      this.hud.pourBar(null, 'demli');
      return;
    }
    if (!this.pour || this.pour.type !== wantType) {
      this.pour?.sound.stop();
      this.pour = { type: wantType, t: 0, sound: audio.pour() };
    }
    const time = GREED.pourTime * (this.has('kettle') ? 0.7 : 1);
    this.pour.t += dt;
    const p = this.pour.t / time;
    this.pour.sound.update(p);
    this.hud.pourBar(Math.min(1, p), wantType);
    if (this.pour.t >= time) {
      this.pour.t = 0;
      this.tray.addGlass(wantType, TEA.fillLevel, TEA.pourTemp, 1);
      audio.clink(0.3 + this.tray.glasses.length * 0.04);
    }
  }

  // ---------------- siparişler ----------------

  private makeItems(count: number): TeaType[] {
    const items: TeaType[] = [];
    for (let i = 0; i < count; i++) items.push(this.venue.rules.colored && this.rng.next() < 0.45 ? 'acik' : 'demli');
    return items.sort();
  }

  private spawnOrder(now: number, office: Office, kind: OrderKind) {
    // bazı müşteriler çay söylerken "dedikodu var mı?" diye de sorar
    const topic = kind === 'normal' ? this.intrigue.askFor(office) : null;
    if (topic) kind = 'gossip';
    const count = kind === 'vip' ? this.rng.int(3, 4) : kind === 'rush' ? this.rng.int(1, 2) : this.rng.int(GREED.orderMin, GREED.orderMax);
    const base = kind === 'vip' ? 30 : kind === 'rush' ? 15 : GREED.patience;
    this.orders.set(office.id, {
      office: office.id,
      kind,
      items: this.makeItems(count),
      createdAt: now,
      patience: base * (this.has('patience') ? 1.25 : 1),
      perfect: true,
      topic: kind === 'gossip' ? (topic ?? undefined) : undefined,
    });
    const c = this.customers.get(office.id)!;
    audio.babble(c.voicePitch, kind === 'vip' ? 7 : 4);
    c.talk();
    if (kind === 'vip') this.hud.toast(`★ VIP: ${tx(office.person)}`, 'good');
    if (kind === 'rush') this.hud.toast(`! ${tx(office.person)}`, 'warn');
    if (kind === 'gossip') this.hud.toast(`👂 ${tx(office.person)}: ${t('gossipAsk')}`, 'warn');
  }

  private updateOrders(dt: number, now: number) {
    const offices = this.venue.offices.filter((o) => this.customers.has(o.id) && !this.customers.get(o.id)!.standing);
    const free = () => offices.filter((o) => !this.orders.has(o.id));
    // planlı VIP
    if (this.vipTimes.length && now >= this.vipTimes[0]) {
      const f = free();
      if (f.length) {
        this.vipTimes.shift();
        // hikâyede, henüz duyulmamış dedikodusu olan müşteri önce gelir
        const known = (o: Office) => {
          const r = vipRumor(o.pid);
          return !r || this.cfg.pocket.includes(r.id) || this.stats.heard.includes(r.id);
        };
        const pick = (this.cfg.mode === 'career' && f.find((o) => !known(o))) || f.find((o) => vipRumor(o.pid)) || this.rng.pick(f);
        this.spawnOrder(now, pick, 'vip');
      }
    }
    this.orderTimer -= dt * (this.rushHour ? 2 : 1);
    if (this.orderTimer <= 0) {
      this.orderTimer = this.rng.range(GREED.orderInterval[0], GREED.orderInterval[1]);
      const f = free();
      if (f.length) this.spawnOrder(now, this.rng.pick(f), this.time > 12 && this.rng.next() < 0.2 ? 'rush' : 'normal');
    }
    for (const [id, o] of this.orders) {
      if (now - o.createdAt > o.patience) {
        this.orders.delete(id);
        this.stats.ordersExpired++;
        const c = this.customers.get(id)!;
        c.angry();
        audio.fail();
        this.hud.toast(`${tx(c.office.person)} ${t('expired')}`, 'bad');
        this.combo = Math.max(1, this.combo - GREED.comboStep);
        this.intrigue.addAnger(8);
      }
    }
  }

  /** Tepside bu müşterinin siparişine uyan en az bir bardak var mı. */
  private canServe(c: Customer): boolean {
    const o = this.orders.get(c.office.id);
    return !!o && this.tray.glasses.some((g) => o.items.includes(g.type));
  }

  private nearestDeskWithOrder(): Customer | null {
    let best: Customer | null = null;
    let bd = ORDERS.deliverRange;
    for (const c of this.customers.values()) {
      if (!this.orders.has(c.office.id) || c.standing) continue;
      const d = Math.hypot(c.desk.center.x - this.player.pos.x, c.desk.center.z - this.player.pos.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  private deliver(c: Customer, now: number) {
    const o = this.orders.get(c.office.id)!;
    const glasses = this.tray.glasses;
    const carried = glasses.length;
    // her istenen tip için en dolu uygun bardağı seç
    const used = new Set<number>();
    const served: TeaType[] = [];
    for (const want of o.items) {
      let bi = -1;
      glasses.forEach((g, i) => {
        if (!used.has(i) && g.type === want && (bi < 0 || g.fill > glasses[bi].fill)) bi = i;
      });
      if (bi >= 0) {
        used.add(bi);
        served.push(want);
      }
    }
    if (!used.size) {
      this.hud.toast(t('noMatch'), 'warn');
      return;
    }
    const spun = now < this.spinBoostUntil;
    const rush = this.rushHour ? 1.5 : 1;
    let tip = 0;
    for (const i of used) {
      const g = glasses[i];
      tip += greedTip(g.fill, this.combo, carried, spun) * KIND_PAY[o.kind] * rush * repTipFactor(this.cfg.rep);
      if (g.fill < 0.8) o.perfect = false;
    }
    [...used].sort((a, b) => b - a).forEach((i) => glasses.splice(i, 1));
    for (const s of served) o.items.splice(o.items.indexOf(s), 1);
    this.stats.delivered += used.size;
    this.stats.maxDeliveryTower = Math.max(this.stats.maxDeliveryTower, carried);
    if (this.venue.rules.colored) this.stats.coloredServed += used.size;
    this.jar += tip;
    if (spun) this.spinBoostUntil = -1;
    audio.coin(tip);
    audio.babble(c.voicePitch, 5);
    c.talk();
    this.hud.floatMoney(tip);
    if (!o.items.length) {
      this.orders.delete(c.office.id);
      this.stats.ordersCompleted++;
      this.combo = nextCombo(this.combo, o.perfect);
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      if (o.kind === 'vip') this.stats.vipServed++;
      if (o.kind === 'rush') this.stats.rushServed++;
      if (o.perfect) c.cheer();
      this.hud.speech(tx(c.office.person), tx(this.rng.pick(c.office.lines)));
      if (o.perfect && this.combo > 1) this.hud.toast(`×${this.combo.toFixed(1)}`, 'good');
      if (carried >= GREED.towerBonusFrom) this.hud.toast(`${t('tower')} ×${GREED.towerBonus}!`, 'good');
      if (!o.perfect) this.hud.toast(t('okPour'), 'warn');
      if (o.kind === 'vip' && o.perfect) this.stats.vipPerfect++;
      // VIP dedikodusu, fısıltılar ve "dedikodu var mı?" paneli
      this.intrigue.onOrderDone(c, o.kind, o.perfect, o.topic);
    }
  }

  // ---------------- Fırıldak ----------------

  private updateSpin(dt: number, input: Input) {
    if (!this.spin) {
      if (input.wasPressed('KeyF')) this.spin = { stage: 'meter', t: 0 };
      this.player.scriptedArm = null;
      return;
    }
    const s = this.spin;
    s.t += dt;
    if (s.stage === 'meter') {
      const needle = meterAt(s.t);
      this.hud.spinMeter(needle, SPIN.zone, t('spinPress'));
      if (input.wasPressed('KeyF')) {
        s.stage = 'spin';
        s.driver = new SpinDriver(spinQuality(needle));
        this.hud.spinMeter(null);
        audio.whoosh();
      } else if (s.t > SPIN.meterPeriod * 2.5) {
        this.spin = null;
        this.hud.spinMeter(null);
      }
      return;
    }
    const d = s.driver!;
    const low = this.tray.pos.y - this.tray.pivot.y < -0.36;
    this.player.scriptedArm = d.step(dt, low);
    if (d.done) {
      this.player.scriptedArm = null;
      if (d.speed > SPIN.badSpeed) {
        this.stats.spins++;
        this.spinBoostUntil = this.time + ORDERS.styleWindow * 2;
        audio.applause();
        this.hud.toast(`${t('spin')} ${t('spinReady')}`, 'good');
      } else this.stats.failedSpins++;
      this.spin = null;
    }
  }

  // ---------------- rüzgâr ----------------

  private updateWind(dt: number) {
    if (!this.venue.rules.wind) {
      this.tray.externalAccel.set(0, 0, 0);
      return;
    }
    const w = this.wind;
    w.t -= dt;
    w.release -= dt;
    if (w.t <= 0) {
      w.t = this.rng.range(WIND.gustMin, WIND.gustMax);
      const a = this.rng.range(0, Math.PI * 2);
      w.dir.set(Math.cos(a), 0, Math.sin(a));
      w.target = this.rng.range(0.4, 1);
      w.release = 1.4;
    }
    if (w.release <= 0) w.target = 0.1;
    w.level += (w.target - w.level) * (1 - Math.exp(-2.5 * dt));
    const low = this.player.raised ? 1.4 : 1;
    this.tray.externalAccel.copy(w.dir).multiplyScalar(WIND.strength * w.level * low);
    audio.setWind(w.level);
    this.hud.wind(w.level > 0.25 ? Math.atan2(w.dir.x, w.dir.z) - this.player.camYaw : null, w.level);
  }

  // ---------------- felaketler ----------------

  private loseCombo() {
    if (this.combo > 1) this.hud.toast('×1', 'bad');
    this.combo = 1;
  }

  private disaster(count: number) {
    this.slowMo = GREED.slowMoTime;
    this.shake = 0.12;
    audio.shatter();
    setTimeout(() => audio.shatter(), 180);
    this.hud.big(getLang() === 'tr' ? 'ŞANGIRRR!' : 'CRASH!', `${count} ${getLang() === 'tr' ? 'bardak' : 'glasses'}`);
    for (const c of this.customers.values()) if (c.desk.center.distanceTo(this.player.pos) < 6) c.angry();
  }

  private loseJar() {
    if (this.has('lock') && !this.lockUsed) {
      // Kavanoz Kilidi: kavanoz tepside kalır, paranın yarısı kurtulur
      this.lockUsed = true;
      this.tray.hasJar = true;
      this.jar *= 0.5;
      this.hud.toast(t('lockSaved'), 'warn');
      audio.clink(1);
      return;
    }
    this.stats.jarsLost++;
    const lost = this.jar;
    this.jar = 0;
    const obj = makeTipJar();
    obj.position.copy(this.tray.pos).add(new THREE.Vector3(0, 0.05, 0));
    this.scene.add(obj);
    this.debris.push({ obj, vel: this.tray.vel.clone().add(new THREE.Vector3(0, 1.5, 0)), spin: new THREE.Vector3(5, 2, 3), kind: 'jar' });
    this.slowMo = GREED.slowMoTime;
    this.shake = 0.15;
    this.hud.big(t('jarLost'), lost > 0 ? `−${lost.toFixed(1)}₺` : '');
    this.loseCombo();
  }

  /** Kızgın müşteri tepsiden bir bardak kapıp yere çalar. */
  private smashGlass(): boolean {
    const g = this.tray.glasses.pop();
    if (!g) return false;
    this.stats.broken++;
    this.throwGlass(0.6);
    audio.shatter();
    this.loseCombo();
    return true;
  }

  private throwGlass(up: number) {
    const g = makeGlass('demli');
    g.group.position.copy(this.tray.pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.1, (Math.random() - 0.5) * 0.2));
    this.scene.add(g.group);
    const v = this.tray.vel.clone().multiplyScalar(0.8).add(new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + up * 4, (Math.random() - 0.5) * 2));
    this.debris.push({ obj: g.group, vel: v, spin: new THREE.Vector3(Math.random() * 12, Math.random() * 8, Math.random() * 12), kind: 'glass' });
  }

  private updateDebris(dt: number) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.vel.y -= 9.81 * dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.y += d.spin.y * dt;
      d.obj.rotation.z += d.spin.z * dt;
      if (d.obj.position.y <= 0.04) {
        const p = d.obj.position.clone().setY(0.05);
        this.fx.shatter(p);
        if (d.kind === 'glass') {
          this.fx.spill(p, new THREE.Vector3(), 0.3, TEA_COLORS.demli);
          this.fx.addPuddle(p.x, p.z, 0.4);
          audio.shatter();
        } else {
          this.fx.sparkle(p, 0xe9c046);
          for (let k = 0; k < 4; k++) setTimeout(() => audio.coin(k), k * 70);
          audio.shatter();
        }
        this.scene.remove(d.obj);
        this.debris.splice(i, 1);
      }
    }
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.pour?.sound.stop();
    audio.stopAmbience();
    audio.setIntensity(0);
    // kavanozda kalan para kasaya geçmez: açgözlülüğün bedeli. Tepsi zorluğu skoru çarpar.
    this.stats.score = Math.round(this.bank * this.assist.score);
    this.onEnd(this.stats);
  }

  /** Testler için. */
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
    audio.setIntensity(0);
    this.hud.setMode(false);
    this.intrigue.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry?.dispose();
    });
  }
}
