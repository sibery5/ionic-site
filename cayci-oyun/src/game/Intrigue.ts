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
import { DAYS, type Office, type Text } from './story';
import type { PersonOpts } from '../world/models';
import { PEOPLE, RUMOR, TOPICS, EVIDENCE_NEEDED, judge, saleKey, vipRumor, type PersonId, type Topic } from './rumors';
import { ASK_MORE, BACKFIRE, BONK, BOSS_BONK, BOSS_CHASER, BOSS_GULSUM, CHASE, INSPECT, REACTION, SALE_MSG, SHIFT_START, VILLAIN_OFFER } from './lines';

// Vardiyanın "entrika" katmanı: dedikodu soran müşteriler, seçim paneli, kızıp bardak kıran ya da kovalayan müşteriler,
// sinir göstergesi ve tepsiyle vurma, patronun telefon mesajları. Run'ın içini bir host arayüzüyle görür.

export interface IntrigueHost {
  readonly time: number;
  readonly duration: number;
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
  /** katta yürüyen biri ekler (teftişteki patron); yürüyecek yer yoksa null */
  spawnWalker(look: PersonOpts, speed: number): Npc | null;
  removeWalker(n: Npc): void;
  /** bu katta oturan kişi */
  customerOf(pid: PersonId): Customer | null;
}

interface Inspection {
  npc: Npc;
  t: number;
  good: number;
  bad: number;
  over: boolean;
  /** son "gördü" anı (aynı olayı iki kez saymasın) */
  lastBroken: number;
  lastJars: number;
}

interface Panel {
  c: Customer;
  topic: Topic;
  cards: string[];
  sel: number;
  t: number;
  /** kaçıncı "başka?" (0: ilk soru) */
  chain: number;
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
const INSPECT_TIME = 45;
const INSPECT_SIGHT = 6.5;
const NADIR_LOOK: PersonOpts = { ...DAYS[4].offices[0].look };

export class Intrigue {
  panel: Panel | null = null;
  private chases: Chase[] = [];
  anger = 0;
  angerReady = false;
  private bonk: { t: number; hit: boolean; target: Npc | Chase | null } | null = null;
  private bonks = 0;
  private asks = 0;
  private villainAsks = 0;
  private askCooldown = 9;
  private msgs: { at: number; from: string; text: Text; kind: 'boss' | 'riza' | 'villain' | 'info' }[] = [];
  private once = new Set<string>();
  private angerHint = 0;
  private inspAt = Infinity;
  insp: Inspection | null = null;
  private backfires: { pid: PersonId; at: number }[] = [];

  constructor(private h: IntrigueHost) {
    if (h.mode === 'career') {
      const m = SHIFT_START[Math.min(SHIFT_START.length - 1, h.title)];
      this.queue(2.5, m.from, m.text);
    }
    // kanıtlar birikince Selim teklif eder
    const story = h.pocket.filter((id) => RUMOR[id]?.story && RUMOR[id]?.truth).length;
    if (h.mode !== 'daily' && story >= 3 && h.rng.next() < 0.5) this.queue(35, 'villain', VILLAIN_OFFER);
    // patron teftişi: Ocakçı olduktan sonra kariyer vardiyalarının çoğunda bir kez
    if (h.mode === 'career' && !h.tutorial && h.title >= 1 && h.rng.next() < 0.6) this.inspAt = h.duration * h.rng.range(0.25, 0.5);
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

  /** Yeni bir sipariş "dedikodu var mı?" diye mi gelsin? Konu döner ya da null.
   *  Laf, lafı bilenin ayağına gelir: cebinde bu kişinin merak ettiği bir şey varsa çok daha sık sorar. */
  askFor(office: Office): Topic | null {
    const h = this.h;
    if (h.mode === 'daily' || h.tutorial || this.asks >= 5 || this.askCooldown > 0) return null;
    const p = PEOPLE[office.pid];
    if (!p?.wants.length) return null;
    // kötü adamlar bir vardiyada en fazla iki kez ayartır
    if (p.side === 'villain' && this.villainAsks >= 2) return null;
    const known = this.known();
    const sold = this.sold();
    const juicy = known.filter((id) => {
      const v = judge(RUMOR[id], office.pid, RUMOR[id].topic, sold).verdict;
      return v === 'reward' || v === 'betray';
    });
    const chance = juicy.length ? 0.8 : known.length ? 0.2 : 0.12;
    if (h.rng.next() > chance) return null;
    const topic = juicy.length && h.rng.next() < 0.75 ? RUMOR[h.rng.pick(juicy)].topic : h.rng.pick(p.wants);
    this.asks++;
    if (p.side === 'villain') this.villainAsks++;
    h.stats.asked++;
    this.askCooldown = 9;
    return topic;
  }

  /** Bir sipariş bütünüyle teslim edildi. */
  onOrderDone(c: Customer, kind: 'normal' | 'vip' | 'rush' | 'gossip', perfect: boolean, topic?: Topic) {
    const h = this.h;
    if (perfect && this.watching()) {
      this.insp!.good++;
      h.hud.toast(`👔 👍 ${t('inspectGood')}`, 'good');
    }
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
    if (perfect && h.mode !== 'daily' && h.rng.next() < 0.3) {
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
    this.panel = { c, topic, cards, sel: cards.length ? 0 : -1, t: PANEL_TIME, chain: 0 };
    c.talk();
    audio.babble(c.voicePitch, 5);
    this.drawPanel();
  }

  private drawPanel() {
    const p = this.panel;
    if (!p) return this.h.hud.rumorPanel(null);
    this.h.hud.rumorPanel({
      who: this.name(p.c.office.pid),
      ask: p.chain ? tx(ASK_MORE.ask[(p.chain - 1 + p.c.office.pid.length) % ASK_MORE.ask.length]) : tx(TOPICS[p.topic].ask),
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
      h.hud.speech(who, tx(h.rng.pick(p.chain ? ASK_MORE.done : REACTION.dontKnow)));
      return;
    }
    const r = RUMOR[p.cards[idx]];
    const j = judge(r, pid, p.topic, this.sold());
    h.stats.sales.push({ rumor: r.id, buyer: pid, verdict: j.verdict, pay: j.pay });
    if (j.verdict === 'reward' || j.verdict === 'betray') this.maybeBackfire(r.about, pid);
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
        // han tarafı doğru lafı alınca üsteler: "başka?" (en fazla iki kez, kalan kartlarla)
        const rest = p.cards.filter((id) => id !== r.id);
        if (PEOPLE[pid].side === 'han' && p.chain < 2 && rest.length) {
          this.panel = { c, topic: p.topic, cards: rest, sel: 0, t: PANEL_TIME * 0.75, chain: p.chain + 1 };
          this.drawPanel();
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

  startChase(c: Customer, shout?: Text[]) {
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
    h.hud.speech(this.name(c.office.pid), tx(h.rng.pick(shout ?? CHASE.shout)));
    if (this.watching()) this.saw();
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
    const isBoss = !!this.insp && target === this.insp.npc;
    h.stats.repDelta -= isMopper ? 8 : 5;
    if (isBoss) {
      // patronun ta kendisine vurdun
      const npc = this.insp!.npc;
      npc.knock(dir);
      h.stats.bossBonks++;
      h.stats.repDelta -= 15;
      h.hud.big(t('bossHit'), '👔💥');
      h.hud.speech(this.name('nadir'), tx(h.rng.pick(INSPECT.bossOuch)));
      h.shake(0.3);
      h.slowMo(1.2);
      this.queue(1.6, 'boss', INSPECT.hitBoss);
      const got = h.fine(30);
      h.stats.fines += got;
      if (got > 0) setTimeout(() => h.hud.toast(`−${got}₺ ${t('fine')}`, 'bad'), 1800);
      this.endInspection(true);
      return;
    }
    if (this.watching()) this.saw(2);
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

  // ---------------- patron teftişi ----------------

  /** Nadir Bey katta ve Cemal'i görecek kadar yakın mı? */
  watching() {
    const i = this.insp;
    return !!i && !i.over && !i.npc.isDown && i.npc.pos.distanceTo(this.h.player.pos) < INSPECT_SIGHT;
  }

  private saw(n = 1) {
    this.insp!.bad += n;
    this.h.hud.toast(`👔 👎 ${t('inspectBad')}`, 'bad');
  }

  private startInspection() {
    const h = this.h;
    const npc = h.spawnWalker(NADIR_LOOK, 0.8);
    if (!npc) return;
    this.insp = { npc, t: 0, good: 0, bad: 0, over: false, lastBroken: h.stats.broken, lastJars: h.stats.jarsLost };
    h.stats.inspections++;
    h.hud.phone(this.name('nadir'), tx(h.rng.pick(INSPECT.start)), 'boss');
    h.hud.big(`👔 ${t('inspection')}`, t('inspectionSub'));
    audio.click();
  }

  private endInspection(hitBoss = false) {
    const i = this.insp;
    const h = this.h;
    if (!i || i.over) return;
    i.over = true;
    i.t = 0;
    h.hud.inspect(null);
    if (hitBoss) return;
    const score = i.good - i.bad;
    if (score >= 2) {
      h.stats.inspectPassed++;
      h.stats.repDelta += 5;
      h.addJar(15);
      h.hud.floatMoney(15);
      h.hud.toast(`👔 ${t('inspectPass')} +15₺`, 'good');
      audio.jingle();
      this.queue(0.8, 'boss', INSPECT.pass);
    } else if (score >= 0) {
      h.stats.repDelta += 1;
      this.queue(0.8, 'boss', INSPECT.ok);
    } else {
      h.stats.repDelta -= 5;
      h.hud.toast(`👔 ${t('inspectFail')}`, 'bad');
      this.queue(0.8, 'boss', INSPECT.fail);
    }
  }

  private updateInspection(dt: number) {
    const h = this.h;
    if (!this.insp && h.time >= this.inspAt) {
      this.inspAt = Infinity;
      this.startInspection();
    }
    const i = this.insp;
    if (!i) return;
    i.t += dt;
    if (i.over) {
      // patron yerden kalkınca ya da teftiş bitince birkaç saniye sonra kattan çıkar
      if (i.t > 4 && !i.npc.isDown) {
        h.removeWalker(i.npc);
        this.insp = null;
      }
      return;
    }
    const watching = this.watching();
    if (watching) {
      if (h.stats.broken > i.lastBroken) this.saw();
      if (h.stats.jarsLost > i.lastJars) this.saw();
    }
    i.lastBroken = h.stats.broken;
    i.lastJars = h.stats.jarsLost;
    h.hud.inspect({ watching, good: i.good, bad: i.bad, left: INSPECT_TIME - i.t });
    if (i.t >= INSPECT_TIME) this.endInspection();
  }

  // ---------------- dedikodunun geri tepmesi ----------------

  private maybeBackfire(about: readonly PersonId[], buyer: PersonId) {
    const h = this.h;
    for (const pid of about) {
      if (pid === buyer || this.backfires.some((b) => b.pid === pid) || !h.customerOf(pid)) continue;
      h.hud.toast(`🤫 ${this.name(pid)} ${t('backfireHint')}`, 'warn');
      if (h.rng.next() < 0.4) this.backfires.push({ pid, at: h.time + h.rng.range(12, 24) });
    }
  }

  private updateBackfires() {
    const h = this.h;
    for (let i = this.backfires.length - 1; i >= 0; i--) {
      const b = this.backfires[i];
      if (h.time < b.at) continue;
      this.backfires.splice(i, 1);
      const c = h.customerOf(b.pid);
      if (!c || c.standing || this.isChasing(c.office.id)) continue;
      h.stats.backfires++;
      h.stats.repDelta -= 2;
      h.hud.toast(`👂 ${this.name(b.pid)} ${t('backfire')}`, 'bad');
      this.startChase(c, BACKFIRE);
    }
  }

  // ---------------- her kare ----------------

  update(dt: number, input: Input) {
    const h = this.h;
    this.askCooldown -= dt;
    this.updateInspection(dt);
    this.updateBackfires();
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
    this.h.hud.inspect(null);
    this.h.hud.rumorPanel(null);
    this.h.hud.chase(null);
    this.h.hud.anger(0, false);
  }
}
