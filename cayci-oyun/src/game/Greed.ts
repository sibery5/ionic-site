import * as THREE from 'three';
import { ORDERS, TEA, TRAY } from '../config';
import { Grid } from '../physics/grid';
import { TraySim } from '../physics/tray';
import { SPIN, SpinDriver, meterAt, spinQuality } from '../physics/spin';
import { ARENA, parseLevel } from './levels';
import { ARENA_OFFICES } from './story';
import { GREED, greedParams, greedTip, nextCombo } from './greedRules';
import { collideTray, followCamera } from './common';
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
import { TEA_COLORS, makeGlass, makeTipJar } from '../world/models';
import type { Hud } from '../ui/Hud';

// Açgözlü Çaycı: 90 saniye, tek salon. Tepsiye ne kadar bardak koyarsan o kadar kazanırsın,
// ama bahşişler tepsideki kavanozda durur: ocağa dönüp kasaya geçirmeden tepsiyi uçurursan hepsi gider.

export interface GreedResult {
  score: number;
  delivered: number;
  broken: number;
  spins: number;
  maxCombo: number;
  maxTower: number;
  jarsLost: number;
}

interface Debris {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  kind: 'glass' | 'jar';
}

interface GreedOrder {
  count: number;
  createdAt: number;
}

export class GreedShift {
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
  private rng: Rng;
  private camPos = new THREE.Vector3();
  private debris: Debris[] = [];

  private time = 0;
  private ended = false;
  private bank = 0;
  private jar = 0;
  private combo = 1;
  private spinBoostUntil = -1;
  private orders = new Map<string, GreedOrder>();
  private orderTimer = 2;
  private pourTimer = 0;
  private pourSound: { update: (p: number) => void; stop: () => void } | null = null;
  private spin: { stage: 'meter' | 'spin'; t: number; driver?: SpinDriver } | null = null;
  private slowMo = 0;
  private shake = 0;
  private spillMsgCooldown = 0;
  private stats = { delivered: 0, broken: 0, spins: 0, maxCombo: 1, maxTower: 0, jarsLost: 0 };
  private coachStep = 1;

  constructor(
    private hud: Hud,
    private onEnd: (r: GreedResult) => void,
    aspect: number,
    private sensitivity: number,
    seed: number,
    firstTime: boolean,
  ) {
    this.rng = new Rng(seed);
    const lv = parseLevel(ARENA);
    this.grid = new Grid(lv);
    this.built = buildLevel(ARENA, this.grid, ARENA_OFFICES);
    this.scene.add(this.built.group);
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.05, 120);
    this.setupLights();

    const [sx, sz] = Grid.center(...lv.start);
    this.player.place(sx, sz, Math.PI / 2);
    this.scene.add(this.player.rig.root);
    this.tray.capacity = GREED.capacity;
    this.tray.hasJar = true;
    this.tray.reset(this.player.hand);
    this.scene.add(this.trayView.group);

    for (const off of ARENA_OFFICES) {
      const desk = this.built.desks.get(off.id);
      if (!desk) continue;
      const c = new Customer(off, desk);
      this.customers.set(off.id, c);
      this.scene.add(c.rig.root, c.bubble);
    }
    for (let i = 0; i < ARENA.npcCount; i++) {
      const n = new Npc(this.grid, lv.npcPoints, this.rng);
      this.npcs.push(n);
      this.scene.add(n.rig.root);
    }
    if (lv.catStart) {
      this.cat = new Cat(this.grid, lv.catStart, this.rng);
      this.scene.add(this.cat.rig.root);
    }
    this.scene.add(this.fx.group);
    this.fx.onLand = (x, z, a) => {
      if (Math.random() < 0.35) this.fx.addPuddle(x, z, a * 3);
    };
    followCamera({ camera: this.camera, pos: this.camPos }, this.player, this.grid, false, 1, 0, 0.55);
    audio.musicMood = 'tense';
    audio.startAmbience(false);
    this.hud.show();
    this.hud.setMode(true);
    this.hud.setDay(t('greedMode'));
    if (!firstTime) this.coachStep = 0;
  }

  private setupLights() {
    const s = this.scene;
    const { w, d } = this.built.size;
    s.background = new THREE.Color(0x2a2018);
    s.fog = new THREE.Fog(0x3a2a1a, 16, 36);
    s.add(new THREE.HemisphereLight(0xfff1dc, 0x6b4a33, 1.0));
    s.add(new THREE.AmbientLight(0xffe8c8, 0.25));
    const sun = new THREE.DirectionalLight(0xffe2b0, 1.6);
    sun.position.set(w * 0.35, 9, -4);
    sun.target.position.set(w / 2, 0, d / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const size = Math.max(w, d) * 0.75;
    Object.assign(sun.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 0.5, far: 80 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    s.add(sun, sun.target);
  }

  get remaining() {
    return Math.max(0, GREED.duration - this.time);
  }

  update(realDt: number, input: Input) {
    if (this.ended) return;
    // felaket anında ağır çekim
    let dt = realDt;
    if (this.slowMo > 0) {
      this.slowMo -= realDt;
      dt = realDt * GREED.slowMoScale;
    }
    this.shake = Math.max(0, this.shake - realDt * 0.25);
    this.time += dt;
    const now = this.time;

    // ---- oyuncu ----
    const others = this.npcs.map((n) => ({ pos: n.pos, radius: n.radius }));
    for (const c of this.customers.values()) others.push({ pos: c.desk.seat, radius: 0.25 });
    const step = this.player.update(dt, input, this.grid, {
      slippery: (x, z) => (this.built.wet.has(`${x},${z}`) ? 1 : 0) || this.fx.puddleAt(this.player.pos.x, this.player.pos.z),
      shoes: false,
      sensitivity: this.sensitivity,
      others,
    });
    if (step.step) audio.footstep(step.step);
    if (step.slipped) this.hud.toast(t('slip'), 'warn');
    for (const n of this.npcs) n.update(dt, this.player.pos);
    if (this.cat && this.cat.update(dt, this.player.pos, Math.hypot(this.player.vel.x, this.player.vel.z))) {
      this.player.stumble(1);
      audio.meow();
      this.hud.toast(t('trip'), 'warn');
    }

    // ---- Fırıldak ----
    this.updateSpin(dt, input);

    // ---- tepsi ----
    const n = this.tray.glasses.length;
    if (this.spin?.driver) {
      this.tray.params.grip = TRAY.gripArmMode;
      this.tray.params.damping = this.spin.driver.braking ? SPIN.brakeDamping : TRAY.dampingArmMode;
      this.tray.params.catchAssist = this.spin.driver.braking;
      this.tray.params.spillScale = 1;
    } else {
      Object.assign(this.tray.params, greedParams(n));
      this.tray.params.catchAssist = false;
      this.tray.params.damping = this.player.armMode ? TRAY.dampingArmMode : TRAY.damping;
      if (this.player.armMode) this.tray.params.grip = TRAY.gripArmMode;
    }
    const ev = this.tray.step(this.player.hand, dt);
    const bump = collideTray(this.tray, this.grid, this.npcs);
    if (bump > 0.4 && this.tray.glasses.length) audio.clink(Math.min(1, bump / 3));
    this.tray.cool(dt, TEA.coolRate);
    if (this.tray.glasses.length) audio.clink(Math.min(1, Math.max(0, (ev.jerk - 6) / 40)));
    if (ev.spilled > 0.0005) {
      this.fx.spill(this.tray.pos.clone().add(new THREE.Vector3(0, 0.12, 0)), this.tray.vel, ev.spilled, TEA_COLORS.demli);
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

    // ---- ocak: kasa + doldurma ----
    const nearOcak = this.built.ocak.some((o) => o.distanceTo(this.player.pos) < ORDERS.ocakRange);
    if (nearOcak) {
      if (!this.tray.hasJar) {
        this.tray.hasJar = true;
        this.hud.toast(t('newJar'), 'warn');
      }
      if (this.jar > 0.05) {
        this.bank += this.jar;
        this.hud.toast(`+${this.jar.toFixed(1)}₺ ${t('banked')}`, 'good');
        audio.coin(this.jar);
        setTimeout(() => audio.coin(this.jar + 2), 90);
        this.jar = 0;
      }
    }
    this.handlePour(dt, input, nearOcak);

    // ---- siparişler ----
    this.updateOrders(dt, now);
    const desk = nearOcak ? null : this.nearestDeskWithOrder();
    if (desk && input.wasPressed('KeyE')) this.deliver(desk, now);
    this.hud.hint(nearOcak ? (getLang() === 'tr' ? 'E basılı tut: bardak ekle' : 'Hold E: add glasses') : desk ? t('deliverHint') : null);

    // ---- görsel ----
    for (const [id, c] of this.customers) {
      const o = this.orders.get(id);
      c.showOrder(o ? new Array(o.count).fill('demli') : null, o ? (now - o.createdAt) / GREED.patience : 0);
      c.update(dt);
    }
    this.trayView.sync(this.tray);
    this.trayView.setJar(this.tray.hasJar, this.jar);
    const hot = this.trayView.glassWorldPositions(this.tray).filter((_, i) => i % 2 === 0);
    this.fx.emitSteam(hot, 1.5, dt);
    this.fx.emitSteam(this.built.steamPoints, 5, dt);
    this.fx.update(dt);
    this.updateDebris(dt);
    followCamera({ camera: this.camera, pos: this.camPos }, this.player, this.grid, false, realDt, this.shake, 0.55);

    // ---- HUD ----
    this.hud.setTime(this.remaining, GREED.duration);
    this.hud.setGreed({
      bank: this.bank,
      jar: this.jar,
      hasJar: this.tray.hasJar,
      combo: this.combo,
      tower: this.tray.glasses.length,
      spinBoost: now < this.spinBoostUntil,
    });
    this.hud.setTickets(
      [...this.orders.entries()].map(([id, o]) => ({
        office: tx(this.customers.get(id)!.office.name),
        items: [],
        label: `${o.count} ${t('greedOrder')}`,
        urgency: (now - o.createdAt) / GREED.patience,
      })),
    );
    this.hud.setTray(this.tray.glasses, this.tray.capacity);
    this.coach();
    if (this.remaining <= 0) this.finish();
  }

  private coach() {
    if (!this.coachStep) return;
    const tr = getLang() === 'tr';
    const lines = [
      '',
      tr ? 'Ocaktasın. E\'ye basılı tut: tepsiye bardak ekle. Çok bardak = çok bahşiş, ama tepsi ağırlaşır!' : "You're at the stove. Hold E to add glasses. More glasses = bigger tips, but a heavier tray!",
      tr ? 'Balonlu müşteriye git, E ile teslim et. Ctrl basılıyken parmak ucunda yürürsün.' : 'Walk to a customer with a bubble and press E. Hold Ctrl to tiptoe.',
      tr ? 'Bahşiş tepsideki kavanoza girdi. Ocağa dönünce kasaya geçer. Tepsi uçarsa kavanoz da gider!' : 'Tips go into the jar on your tray. Return to the stove to bank them. Crash and the jar is gone!',
      tr ? 'F: Fırıldak. İğne yeşildeyken tekrar F. Tutarsa sonraki teslim ×2!' : 'F: Spin. Press F again when the needle is on green. Nail it and the next delivery pays ×2!',
    ];
    if (this.coachStep === 1 && this.tray.glasses.length >= 2) this.coachStep = 2;
    if (this.coachStep === 2 && this.stats.delivered > 0) this.coachStep = 3;
    if (this.coachStep === 3 && this.bank > 0) this.coachStep = 4;
    if (this.coachStep === 4 && this.stats.spins > 0) this.coachStep = 0;
    this.hud.coach(this.coachStep ? lines[this.coachStep] : null);
  }

  private handlePour(dt: number, input: Input, nearOcak: boolean) {
    const holding = nearOcak && input.isDown('KeyE') && !this.spin;
    if (!holding || this.tray.glasses.length >= this.tray.capacity) {
      if (holding && this.tray.glasses.length >= this.tray.capacity && input.wasPressed('KeyE')) this.hud.toast(t('trayFull'), 'warn');
      this.pourSound?.stop();
      this.pourSound = null;
      this.pourTimer = 0;
      this.hud.pourBar(null, 'demli');
      return;
    }
    if (!this.pourSound) this.pourSound = audio.pour();
    this.pourTimer += dt;
    const p = this.pourTimer / GREED.pourTime;
    this.pourSound.update(p);
    this.hud.pourBar(p, 'demli');
    if (this.pourTimer >= GREED.pourTime) {
      this.pourTimer = 0;
      this.tray.addGlass('demli', TEA.fillLevel, TEA.pourTemp, 1);
      audio.clink(0.3 + this.tray.glasses.length * 0.04);
    }
  }

  private updateOrders(dt: number, now: number) {
    this.orderTimer -= dt;
    if (this.orderTimer <= 0) {
      this.orderTimer = this.rng.range(GREED.orderInterval[0], GREED.orderInterval[1]);
      const free = ARENA_OFFICES.map((o) => o.id).filter((id) => !this.orders.has(id));
      if (free.length) {
        const id = this.rng.pick(free);
        this.orders.set(id, { count: this.rng.int(GREED.orderMin, GREED.orderMax), createdAt: now });
        const c = this.customers.get(id)!;
        audio.babble(c.voicePitch, 4);
        c.talk();
      }
    }
    for (const [id, o] of this.orders) {
      if (now - o.createdAt > GREED.patience) {
        this.orders.delete(id);
        const c = this.customers.get(id)!;
        c.angry();
        audio.fail();
        this.hud.toast(`${tx(c.office.person)} ${t('expired')}`, 'bad');
        this.combo = Math.max(1, this.combo - GREED.comboStep);
      }
    }
  }

  private nearestDeskWithOrder(): Customer | null {
    let best: Customer | null = null;
    let bd = ORDERS.deliverRange;
    for (const c of this.customers.values()) {
      if (!this.orders.has(c.office.id)) continue;
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
    if (!glasses.length) {
      this.hud.toast(t('noMatch'), 'warn');
      return;
    }
    const carried = glasses.length;
    const spun = now < this.spinBoostUntil;
    // en dolu bardakları ver
    const order = glasses.map((g, i) => [g.fill, i] as const).sort((a, b) => b[0] - a[0]);
    const give = order.slice(0, Math.min(o.count, glasses.length)).map(([, i]) => i);
    let tip = 0;
    let perfect = true;
    for (const i of give) {
      const g = glasses[i];
      tip += greedTip(g.fill, this.combo, carried, spun);
      if (g.fill < 0.8) perfect = false;
    }
    give.sort((a, b) => b - a).forEach((i) => glasses.splice(i, 1));
    o.count -= give.length;
    this.stats.delivered += give.length;
    this.jar += tip;
    if (spun) this.spinBoostUntil = -1;
    audio.coin(tip);
    audio.babble(c.voicePitch, 5);
    c.talk();
    this.hud.floatMoney(tip);
    if (o.count <= 0) {
      this.orders.delete(c.office.id);
      this.combo = nextCombo(this.combo, perfect);
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      this.hud.speech(tx(c.office.person), tx(this.rng.pick(c.office.lines)));
      if (perfect && this.combo > 1) this.hud.toast(`×${this.combo.toFixed(1)}`, 'good');
      if (carried >= GREED.towerBonusFrom) this.hud.toast(`${t('tower')} ×${GREED.towerBonus}!`, 'good');
      if (!perfect) this.hud.toast(t('okPour'), 'warn');
    }
  }

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
        const q = spinQuality(needle);
        s.stage = 'spin';
        s.driver = new SpinDriver(q);
        this.hud.spinMeter(null);
        audio.whoosh();
      } else if (s.t > SPIN.meterPeriod * 2.5) {
        // vazgeçti
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
      const ok = this.tray.hasJar || this.tray.glasses.length > 0;
      if (ok && d.speed > SPIN.badSpeed) {
        this.stats.spins++;
        this.spinBoostUntil = this.time + ORDERS.styleWindow * 2;
        audio.applause();
        this.hud.toast(`${t('spin')} ${t('spinReady')}`, 'good');
      }
      this.spin = null;
    }
  }

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
    this.pourSound?.stop();
    audio.stopAmbience();
    // kavanozda kalan para kasaya geçmez: açgözlülüğün bedeli
    this.onEnd({ score: Math.round(this.bank), ...this.stats });
  }

  forceEnd() {
    this.finish();
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.pourSound?.stop();
    audio.stopAmbience();
    this.hud.setMode(false);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry?.dispose();
    });
  }
}
