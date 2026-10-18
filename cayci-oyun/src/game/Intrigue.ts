import * as THREE from 'three';
import { Grid } from '../physics/grid';
import type { TraySim } from '../physics/tray';
import type { Rng } from '../core/rng';
import type { InputLike as Input } from '../core/input';
import { t, tx } from '../core/i18n';
import { audio } from '../audio/Audio';
import type { Player } from '../entities/Player';
import type { Npc } from '../entities/Npc';
import type { Customer } from '../entities/Customer';
import type { Particles } from '../fx/Particles';
import type { Hud } from '../ui/Hud';
import { animateWalk } from '../world/models';
import type { RunStats } from '../meta/stats';
import type { Office, Text } from './story';
import { PEOPLE, RUMOR, TOPICS, EVIDENCE_NEEDED, judge, saleKey, vipRumor, type Topic } from './rumors';
import { BONK, BOSS_BONK, BOSS_CHASER, BOSS_GULSUM, CHASE, REACTION, SALE_MSG, SHIFT_START, VILLAIN_OFFER } from './lines';

// Vardiyanın "entrika" katmanı: dedikodu soran müşteriler, seçim paneli, kızıp bardak kıran ya da kovalayan müşteriler,
// sinir göstergesi ve tepsiyle vurma, patronun telefon mesajları. Run'ın içini bir host arayüzüyle görür.

export interface IntrigueHost {
  readonly time: number;
  readonly mode: RunStats['mode'];
  readonly hud: Hud;
  readonly player: Player;
  readonly tray: TraySim;
  readonly grid: Grid;
  readonly rng: Rng;
  readonly fx: Particles;
  readonly stats: RunStats;
  readonly npcs: Npc[];
  readonly mopper: Npc | null;
  readonly pocket: readonly string[];
  readonly soldBefore: readonly string[];
  readonly evidenceBefore: number;
  readonly title: number;
  readonly tutorial: boolean;
  readonly spinning: boolean;
  nearOcak(): boolean;
  addJar(v: number): void;
  /** kasadan ceza keser, kesilen tutarı döndürür */
  fine(v: number): number;
  /** tepsiden bir bardak kapıp kırar; bardak yoksa false */
  smashGlass(): boolean;
  loseJar(): void;
  cancelOrder(officeId: string): void;
  slowMo(sec: number): void;
  shake(v: number): void;
}

interface Panel {
  c: Customer;
  topic: Topic;
  cards: string[];
  sel: number;
  t: number;
}

interface Chase {
  c: Customer;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  path: [number, number][];
  replan: number;
  t: number;
  state: 'chase' | 'return' | 'down';
  phase: number;
  downT: number;
}

const PANEL_TIME = 12;
const CHASE_SPEED = 3.1; // yürüyüşten hızlı, koşudan yavaş
const CHASE_TIME = 16;
const ANGER_READY = 100;

export class Intrigue {
  panel: Panel | null = null;
  private chases: Chase[] = [];
  anger = 0;
  angerReady = false;
  private bonk: { t: number; hit: boolean; target: Npc | Chase | null } | null = null;
  private bonks = 0;
  private asks = 0;
  private askCooldown = 9;
  private msgs: { at: number; from: string; text: Text; kind: 'boss' | 'riza' | 'villain' | 'info' }[] = [];
  private once = new Set<string>();
  private angerHint = 0;

  constructor(private h: IntrigueHost) {
    if (h.mode === 'career') {
      const m = SHIFT_START[Math.min(SHIFT_START.length - 1, h.title)];
      this.queue(2.5, m.from, m.text);
    }
    // kanıtlar birikince Selim teklif eder
    const story = h.pocket.filter((id) => RUMOR[id]?.story && RUMOR[id]?.truth).length;
    if (h.mode !== 'daily' && story >= 3 && h.rng.next() < 0.5) this.queue(35, 'villain', VILLAIN_OFFER);
  }

  // ---------------- yardımcılar ----------------

  private name(pid: keyof typeof PEOPLE) {
    return tx(PEOPLE[pid].name);
  }

  private known(): string[] {
    return [...new Set([...this.h.pocket, ...this.h.stats.heard])].filter((id) => RUMOR[id]);
  }

  private sold(): string[] {
    return [...this.h.soldBefore, ...this.h.stats.sales.filter((s) => s.verdict === 'reward' || s.verdict === 'betray').map((s) => saleKey(s.rumor, s.buyer))];
  }

  private queue(delay: number, from: 'boss' | 'riza' | 'villain' | 'info', text: Text) {
    const who = from === 'boss' ? this.name('nadir') : from === 'riza' ? this.name('riza') : from === 'villain' ? this.name('selim') : '';
    this.msgs.push({ at: this.h.time + delay, from: who, text, kind: from });
    this.msgs.sort((a, b) => a.at - b.at);
  }

  /** Kovalayan müşteriler oyuncuya çarpabilen gövdeler. */
  bodies(): { pos: THREE.Vector3; radius: number }[] {
    return this.chases.filter((c) => c.state !== 'down').map((c) => ({ pos: c.pos, radius: 0.28 }));
  }

  /** En yakın kovalayanın yakınlığı (müzik ve HUD için) 0..1 */
  get chaseLevel() {
    let best = 0;
    for (const c of this.chases) if (c.state === 'chase') best = Math.max(best, 1 - c.pos.distanceTo(this.h.player.pos) / 9);
    return Math.max(0, best);
  }

  isChasing(officeId: string) {
    return this.chases.some((c) => c.c.office.id === officeId);
  }

  addAnger(v: number) {
    this.anger = Math.min(ANGER_READY, this.anger + v);
  }

  // ---------------- dedikodu soran müşteriler ----------------

  /** Yeni bir sipariş "dedikodu var mı?" diye mi gelsin? Konu döner ya da null. */
  askFor(office: Office): Topic | null {
    const h = this.h;
    if (h.mode === 'daily' || h.tutorial || this.asks >= 3 || this.askCooldown > 0) return null;
    const p = PEOPLE[office.pid];
    if (!p?.wants.length) return null;
    const known = this.known();
    if (!known.length && h.rng.next() > 0.35) return null;
    if (h.rng.next() > 0.32) return null;
    const match = p.wants.filter((tp) => known.some((id) => RUMOR[id].topic === tp));
    const topic = match.length && h.rng.next() < 0.65 ? h.rng.pick(match) : h.rng.pick(p.wants);
    this.asks++;
    this.askCooldown = 16;
    return topic;
  }

  /** Bir sipariş bütünüyle teslim edildi. */
  onOrderDone(c: Customer, kind: 'normal' | 'vip' | 'rush' | 'gossip', perfect: boolean, topic?: Topic) {
    const h = this.h;
    if (kind === 'gossip' && topic) {
      this.openPanel(c, topic);
      return;
    }
    const known = this.known();
    if (kind === 'vip' && h.mode === 'career') {
      const r = vipRumor(c.office.pid);
      if (r && !known.includes(r.id)) {
        this.hear(r.id, t('gossipCard'));
        return;
      }
    }
    if (perfect && h.mode !== 'daily' && h.rng.next() < 0.2) {
      const w = PEOPLE[c.office.pid]?.whispers.filter((id) => !known.includes(id)) ?? [];
      if (w.length) this.hear(h.rng.pick(w), t('whisperCard'));
    }
  }

  private hear(id: string, title: string) {
    const r = RUMOR[id];
    this.h.stats.heard.push(id);
    audio.jingle();
    this.h.hud.gossipCard(`${title} · ${TOPICS[r.topic].icon} ${this.name(r.source)}`, tx(r.text));
  }

  private openPanel(c: Customer, topic: Topic) {
    const cards = this.known()
      .sort((a, b) => Number(RUMOR[b].topic === topic) - Number(RUMOR[a].topic === topic))
      .slice(0, 9);
    this.panel = { c, topic, cards, sel: cards.length ? 0 : -1, t: PANEL_TIME };
    c.talk();
    audio.babble(c.voicePitch, 5);
    this.drawPanel();
  }

  private drawPanel() {
    const p = this.panel;
    if (!p) return this.h.hud.rumorPanel(null);
    this.h.hud.rumorPanel({
      who: this.name(p.c.office.pid),
      ask: tx(TOPICS[p.topic].ask),
      topicIcon: TOPICS[p.topic].icon,
      cards: p.cards.map((id) => {
        const r = RUMOR[id];
        const text = tx(r.text);
        return { icon: TOPICS[r.topic].icon, text: text.length > 92 ? text.slice(0, 90) + '…"' : text, source: this.name(r.source) };
      }),
      sel: p.sel,
      timeLeft: p.t,
    });
  }

  /** Panel açıkken dünya durur; sadece bu çalışır. */
  updatePanel(realDt: number, input: Input) {
    const p = this.panel;
    if (!p) return;
    p.t -= realDt;
    const n = p.cards.length;
    for (let i = 1; i <= 9; i++) if (i <= n && (input.wasPressed(`Digit${i}`) || input.wasPressed(`Numpad${i}`))) return this.choose(i - 1);
    if (input.wasPressed('Digit0') || input.wasPressed('Numpad0') || input.wasPressed('Backspace') || input.wasPressed('KeyF')) return this.choose(-1);
    // W/S ile gez: kartlar ve en sonda "bilmiyorum"
    const order = [...p.cards.keys(), -1];
    let k = order.indexOf(p.sel);
    if (input.wasPressed('KeyW') || input.wasPressed('ArrowUp')) k = (k - 1 + order.length) % order.length;
    if (input.wasPressed('KeyS') || input.wasPressed('ArrowDown')) k = (k + 1) % order.length;
    p.sel = order[k];
    if (input.wasPressed('KeyE') || input.wasPressed('Enter') || input.wasPressed('Space')) return this.choose(p.sel);
    if (p.t <= 0) return this.choose(-1);
    this.drawPanel();
  }

  /** Testler ve bot için: paneli doğrudan seç. */
  choose(idx: number) {
    const p = this.panel;
    if (!p) return;
    const h = this.h;
    this.panel = null;
    h.hud.rumorPanel(null);
    const c = p.c;
    const pid = c.office.pid;
    const who = this.name(pid);
    if (idx < 0 || !p.cards[idx]) {
      h.hud.speech(who, tx(h.rng.pick(REACTION.dontKnow)));
      return;
    }
    const r = RUMOR[p.cards[idx]];
    const j = judge(r, pid, p.topic, this.sold());
    h.stats.sales.push({ rumor: r.id, buyer: pid, verdict: j.verdict, pay: j.pay });
    h.stats.repDelta += j.rep;
    h.hud.speech(who, tx(h.rng.pick(REACTION[j.verdict])));
    audio.babble(c.voicePitch, j.verdict === 'reward' ? 6 : 9);
    switch (j.verdict) {
      case 'reward': {
        h.addJar(j.pay);
        h.hud.floatMoney(j.pay);
        h.hud.toast(`+${j.pay}₺ ${t('newsPay')}`, 'good');
        audio.coin(j.pay);
        c.cheer();
        if (j.evidence) {
          h.stats.evidence.push(r.id);
          const n = h.evidenceBefore + new Set(h.stats.evidence).size;
          h.hud.toast(`${t('evidenceTo')} (${Math.min(n, EVIDENCE_NEEDED)}/${EVIDENCE_NEEDED})`, 'good');
          if (pid === 'nadir') this.queue(1.2, 'boss', SALE_MSG.nadir);
          else if (!this.once.has('evidence')) {
            this.once.add('evidence');
            this.queue(1.5, 'riza', SALE_MSG.evidence);
          }
        }
        break;
      }
      case 'betray':
        h.addJar(j.pay);
        h.hud.floatMoney(j.pay);
        h.hud.toast(`+${j.pay}₺`, 'warn');
        audio.coin(j.pay);
        c.talk();
        if (!this.once.has('betray')) {
          this.once.add('betray');
          this.queue(2, 'riza', SALE_MSG.betray);
        }
        break;
      case 'irrelevant':
        c.angry();
        if (h.rng.next() < 0.5 && h.smashGlass()) this.smashed(c);
        break;
      case 'lie':
        c.angry();
        if (h.smashGlass()) this.smashed(c);
        if (h.smashGlass()) this.smashed(c);
        if (h.rng.next() < 0.45) this.startChase(c);
        if (!this.once.has('lie')) {
          this.once.add('lie');
          this.queue(3, 'riza', SALE_MSG.lie);
        }
        break;
      case 'aboutThem':
        this.startChase(c);
        break;
      default:
        c.talk();
    }
  }

  private smashed(c: Customer) {
    this.h.stats.smashed++;
    this.h.hud.toast(`${this.name(c.office.pid)}: ${tx(this.h.rng.pick(CHASE.smashLie))}`, 'bad');
    this.h.shake(0.06);
  }

  // ---------------- kovalama ----------------

  startChase(c: Customer) {
    const h = this.h;
    if (this.isChasing(c.office.id)) return;
    h.cancelOrder(c.office.id);
    c.standUp();
    const pos = c.desk.seat.clone().addScaledVector(c.desk.dir, 0.35).setY(0);
    h.grid.resolveCircle(pos, 0.28, 0);
    this.chases.push({ c, pos, vel: new THREE.Vector3(), yaw: c.rig.root.rotation.y, path: [], replan: 0, t: 0, state: 'chase', phase: 0, downT: 0 });
    h.stats.chases++;
    audio.shout();
    h.slowMo(0.6);
    h.hud.big(`🏃 ${this.name(c.office.pid)}`, t('chasing'));
    h.hud.speech(this.name(c.office.pid), tx(h.rng.pick(CHASE.shout)));
  }

  private stepTowards(ch: Chase, target: THREE.Vector3, speed: number, dt: number) {
    const h = this.h;
    ch.replan -= dt;
    if (ch.replan <= 0) {
      ch.replan = 0.35;
      const from = Grid.cellOf(ch.pos.x, ch.pos.z);
      const to = Grid.cellOf(target.x, target.z);
      ch.path = h.grid.path(from, to) ?? [];
      if (ch.path.length && ch.path[0][0] === from[0] && ch.path[0][1] === from[1]) ch.path.shift();
    }
    let tx0 = target.x;
    let tz0 = target.z;
    if (ch.path.length > 1 && ch.pos.distanceTo(target) > 1.4) {
      [tx0, tz0] = Grid.center(ch.path[0][0], ch.path[0][1]);
      if (Math.hypot(tx0 - ch.pos.x, tz0 - ch.pos.z) < 0.35) ch.path.shift();
    }
    const d = new THREE.Vector3(tx0 - ch.pos.x, 0, tz0 - ch.pos.z);
    const l = d.length();
    if (l > 1e-3) d.multiplyScalar(speed / l);
    ch.vel.lerp(d, 1 - Math.exp(-7 * dt));
    ch.pos.addScaledVector(ch.vel, dt);
    h.grid.resolveCircle(ch.pos, 0.28, 0);
    const sp = Math.hypot(ch.vel.x, ch.vel.z);
    if (sp > 0.1) {
      let dy = Math.atan2(ch.vel.x, ch.vel.z) - ch.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      ch.yaw += dy * (1 - Math.exp(-10 * dt));
    }
    ch.phase += sp * dt * 5.5;
    const rig = ch.c.rig;
    animateWalk(rig, ch.phase, Math.min(1, sp / 1.6));
    if (ch.state === 'chase') {
      // kollar havada, öfkeyle
      rig.armL.rotation.x = -2.5 + Math.sin(ch.phase * 2) * 0.35;
      rig.armR.rotation.x = -2.5 - Math.sin(ch.phase * 2) * 0.35;
    }
    rig.root.position.copy(ch.pos);
    rig.root.rotation.set(0, ch.yaw, 0);
  }

  private updateChases(dt: number) {
    const h = this.h;
    for (let i = this.chases.length - 1; i >= 0; i--) {
      const ch = this.chases[i];
      ch.t += dt;
      const rig = ch.c.rig;
      if (ch.state === 'down') {
        ch.downT -= dt;
        const f = ch.downT > 0.5 ? 1 : Math.max(0, ch.downT / 0.5);
        rig.root.rotation.set(-f * Math.PI * 0.48, ch.yaw, 0, 'YXZ');
        rig.root.position.set(ch.pos.x, f * 0.18, ch.pos.z);
        if (ch.downT <= 0) {
          ch.state = 'return';
          rig.root.rotation.set(0, ch.yaw, 0);
        }
        continue;
      }
      if (ch.state === 'chase') {
        const dist = ch.pos.distanceTo(h.player.pos);
        if (h.nearOcak()) {
          ch.state = 'return';
          h.stats.escapes++;
          h.hud.toast(t('escaped'), 'good');
          audio.jingle();
        } else if (ch.t > CHASE_TIME) {
          ch.state = 'return';
          h.hud.toast(`${this.name(ch.c.office.pid)} ${t('gaveUp')}`, 'good');
        } else if (dist < 0.8) {
          this.smack(ch);
          ch.state = 'return';
        } else this.stepTowards(ch, h.player.pos, Math.min(CHASE_SPEED, 1.4 + ch.t * 1.6), dt);
      }
      if (ch.state === 'return') {
        const seat = ch.c.desk.seat.clone().addScaledVector(ch.c.desk.dir, 0.35).setY(0);
        if (ch.pos.distanceTo(seat) < 0.35) {
          ch.c.sitDown();
          this.chases.splice(i, 1);
        } else this.stepTowards(ch, seat, 1.3, dt);
      }
    }
    const level = this.chaseLevel;
    const near = this.chases.find((c) => c.state === 'chase');
    h.hud.chase(near ? `🏃 ${this.name(near.c.office.pid)} ${t('chasing')}` : null, level);
  }

  /** Kovalayan yetişti: tepsiye şaplak, kavanoz uçar. */
  private smack(ch: Chase) {
    const h = this.h;
    const dir = new THREE.Vector3().subVectors(h.player.pos, ch.pos).setY(0).normalize();
    h.tray.push(new THREE.Vector3(dir.x, 0.7, dir.z).normalize(), 6.2);
    h.player.stumble(1.6);
    h.stats.caught++;
    h.stats.repDelta -= 3;
    h.hud.big(t('caught'), tx(h.rng.pick(CHASE.caught)));
    h.hud.speech(this.name(ch.c.office.pid), tx(h.rng.pick(CHASE.caught)));
    audio.shout();
    audio.bonk();
    h.shake(0.2);
    h.slowMo(0.9);
    if (h.tray.hasJar) h.loseJar();
  }

  // ---------------- sinir ve tepsiyle vurma ----------------

  private target(): Npc | Chase | null {
    const h = this.h;
    const f = h.player.forward();
    let best: Npc | Chase | null = null;
    let bd = 1.9;
    const consider = (pos: THREE.Vector3, who: Npc | Chase) => {
      const d = new THREE.Vector3().subVectors(pos, h.player.pos).setY(0);
      const l = d.length();
      if (l < bd && l > 1e-3 && d.dot(f) / l > Math.cos((80 * Math.PI) / 180)) {
        bd = l;
        best = who;
      }
    };
    for (const n of h.npcs) if (!n.isDown) consider(n.pos, n);
    for (const c of this.chases) if (c.state !== 'down') consider(c.pos, c);
    return best;
  }

  private updateBonk(dt: number, input: Input) {
    const h = this.h;
    if (!this.bonk) {
      if (!input.wasPressed('KeyR') || h.spinning) return;
      const target = this.target();
      const isChaser = !!target && 'state' in target;
      if (!this.angerReady && !isChaser) {
        if (h.time > this.angerHint) {
          this.angerHint = h.time + 4;
          h.hud.toast('😤 …', 'warn');
        }
        return;
      }
      this.bonk = { t: 0, hit: false, target };
      audio.whoosh();
    }
    const b = this.bonk;
    b.t += dt;
    // tepsi öne savrulur: kısa, sert bir hamle
    const k = Math.min(1, b.t / 0.32);
    h.player.scriptedArm = [Math.sin(k * Math.PI) * 0.5, Math.sin(k * Math.PI) * 0.18];
    if (!b.hit && b.t >= 0.15) {
      b.hit = true;
      this.hit(b.target);
    }
    if (b.t >= 0.32) {
      this.bonk = null;
      h.player.scriptedArm = null;
    }
  }

  private hit(target: Npc | Chase | null) {
    const h = this.h;
    if (!target) {
      h.hud.toast(tx(BONK.whiff[0]), 'warn');
      return;
    }
    const pos = target.pos;
    const dir = new THREE.Vector3().subVectors(pos, h.player.pos).setY(0).normalize();
    audio.bonk();
    audio.shout();
    h.fx.sparkle(pos.clone().setY(1.7), 0xfff3a0);
    h.hud.big(t('bonk'));
    h.slowMo(0.5);
    h.shake(0.12);
    this.anger = 0;
    this.angerReady = false;
    this.bonks++;
    h.stats.bonks++;
    const isMopper = target === h.mopper;
    h.stats.repDelta -= isMopper ? 8 : 5;
    let msg: Text = BOSS_BONK[Math.min(this.bonks - 1, BOSS_BONK.length - 1)];
    if ('state' in target) {
      // kovalayanı devirdin: kovalama biter ama patron yine kızar
      target.state = 'down';
      target.downT = 2.2;
      target.vel.copy(dir).multiplyScalar(2.5);
      msg = BOSS_CHASER;
      h.hud.speech(this.name(target.c.office.pid), tx(h.rng.pick(BONK.victim)));
    } else {
      target.knock(dir);
      h.hud.speech(isMopper ? this.name('gulsum') : t('passerby'), tx(h.rng.pick(BONK.victim)));
      if (isMopper) msg = BOSS_GULSUM;
    }
    this.queue(1.4, isMopper ? 'riza' : 'boss', msg);
    if (this.bonks >= 3) {
      const got = h.fine(10);
      h.stats.fines += got;
      if (got > 0) setTimeout(() => h.hud.toast(`−${got}₺ ${t('fine')}`, 'bad'), 1600);
    }
  }

  private updateAnger(dt: number, input: Input) {
    const h = this.h;
    this.anger = Math.max(0, this.anger - 3 * dt);
    // yolu tıkanınca sinir artar: ileri basıyor ama yürüyemiyor, önünde biri var
    const pushing = input.isDown('KeyW') || input.isDown('ArrowUp');
    const sp = Math.hypot(h.player.vel.x, h.player.vel.z);
    if (pushing && sp < 0.45 && h.npcs.some((n) => !n.isDown && n.pos.distanceTo(h.player.pos) < 1.0)) this.anger += 22 * dt;
    if (this.anger >= ANGER_READY) {
      this.anger = ANGER_READY;
      if (!this.angerReady) {
        this.angerReady = true;
        audio.shout();
      }
    }
    if (this.angerReady && this.anger < 70) this.angerReady = false;
    h.hud.anger(this.anger / ANGER_READY, this.angerReady);
  }

  // ---------------- her kare ----------------

  update(dt: number, input: Input) {
    const h = this.h;
    this.askCooldown -= dt;
    this.updateChases(dt);
    this.updateAnger(dt, input);
    this.updateBonk(dt, input);
    while (this.msgs.length && this.msgs[0].at <= h.time) {
      const m = this.msgs.shift()!;
      h.hud.phone(m.from, tx(m.text), m.kind);
      audio.click();
    }
  }

  dispose() {
    this.h.hud.rumorPanel(null);
    this.h.hud.chase(null);
    this.h.hud.anger(0, false);
  }
}
