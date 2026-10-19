import { TEA } from '../config';
import { t } from '../core/i18n';
import type { Glass } from '../physics/tray';
import { drawGlassIcon } from '../world/textures';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export interface TicketView {
  office: string;
  items: string[];
  label?: string; // hazır yazı ("3 çay")
  kind?: 'normal' | 'vip' | 'rush' | 'gossip';
  urgency: number;
}

export interface RumorPanelView {
  who: string;
  ask: string;
  topicIcon: string;
  cards: { icon: string; text: string; source: string }[];
  sel: number; // -1 = "bilmiyorum"
  timeLeft: number;
}

/** Oyun içi arayüz. DOM ile çizilir, kanvasın üstünde durur. */
export class Hud {
  root: HTMLElement;
  private tickets: HTMLElement;
  private clock: HTMLElement;
  private clockFill: HTMLElement;
  private money: HTMLElement;
  private moneyTarget: HTMLElement;
  private dayLabel: HTMLElement;
  private trayBox: HTMLCanvasElement;
  private hintEl: HTMLElement;
  private toasts: HTMLElement;
  private pourWrap: HTMLElement;
  private pourFill: HTMLElement;
  private pourMarker: HTMLElement;
  private coachEl: HTMLElement;
  private speechEl: HTMLElement;
  private gossipEl: HTMLElement;
  private windEl: HTMLElement;
  private floatEl: HTMLElement;
  private greedEl: HTMLElement;
  private spinEl: HTMLElement;
  private bigEl: HTMLElement;
  private rumorEl: HTMLElement;
  private rumorKey = '';
  private phoneEl: HTMLElement;
  private angerEl: HTMLElement;
  private angerFill: HTMLElement;
  private chaseEl: HTMLElement;
  private inspectEl: HTMLElement;
  private inspectKey = '';
  private lastTicketKey = '';
  private lastTrayKey = '';
  private speechTimer = 0;
  private gossipTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud hidden', parent);
    this.tickets = el('div', 'tickets', this.root);
    const tr = el('div', 'hud-tr', this.root);
    this.clock = el('div', 'clock', tr);
    this.clockFill = el('div', 'clock-fill', this.clock);
    const m = el('div', 'money', tr);
    this.money = el('span', 'money-now', m, '0₺');
    this.moneyTarget = el('span', 'money-target', m);
    this.floatEl = el('div', 'float-money', tr);
    this.dayLabel = el('div', 'day-label', this.root);
    this.windEl = el('div', 'wind hidden', this.root, '<span class="wind-arrow">➤</span>');
    this.trayBox = el('canvas', 'tray-box', this.root);
    this.trayBox.width = 420;
    this.trayBox.height = 110;
    this.hintEl = el('div', 'hint hidden', this.root);
    this.toasts = el('div', 'toasts', this.root);
    this.pourWrap = el('div', 'pour hidden', this.root);
    const bar = el('div', 'pour-bar', this.pourWrap);
    this.pourFill = el('div', 'pour-fill', bar);
    this.pourMarker = el('div', 'pour-zone', bar);
    el('div', 'pour-label', this.pourWrap);
    this.coachEl = el('div', 'coach hidden', this.root);
    this.speechEl = el('div', 'speech hidden', this.root);
    this.gossipEl = el('div', 'gossip hidden', this.root);
    el('div', 'crosshair', this.root);
    this.greedEl = el('div', 'greed hidden', this.root);
    this.spinEl = el('div', 'spin-meter hidden', this.root, '<div class="spin-zone"></div><div class="spin-needle"></div><div class="spin-label"></div>');
    this.bigEl = el('div', 'big-text hidden', this.root);
    this.rumorEl = el('div', 'rumor-panel hidden', this.root);
    this.phoneEl = el('div', 'phone-stack', this.root);
    this.angerEl = el('div', 'anger hidden', this.root, '<span class="anger-face">😤</span><div class="anger-bar"><div class="anger-fill"></div></div><span class="anger-label"></span>');
    this.angerFill = this.angerEl.querySelector('.anger-fill') as HTMLElement;
    this.chaseEl = el('div', 'chase-vignette hidden', this.root, '<div class="chase-label"></div>');
    this.inspectEl = el('div', 'inspect hidden', this.root);
  }

  /** Patron teftişi rozeti: izliyor mu, kaç iyi kaç kötü gördü, kalan süre. */
  inspect(v: { watching: boolean; good: number; bad: number; left: number } | null) {
    const key = v ? `${v.watching}|${v.good}|${v.bad}|${Math.ceil(v.left)}` : '';
    if (key === this.inspectKey) return;
    this.inspectKey = key;
    this.inspectEl.classList.toggle('hidden', !v);
    if (!v) return;
    this.inspectEl.classList.toggle('watching', v.watching);
    this.inspectEl.innerHTML = `<span class="in-icon">👔</span><span class="in-text">${v.watching ? '👀 ' + t('inspectWatching') : t('inspectAround')}</span><span class="in-score">👍${v.good} 👎${v.bad}</span><span class="in-time">${Math.ceil(v.left)}</span>`;
  }

  /** "Dedikodu var mı?" seçim paneli. null: kapalı. */
  rumorPanel(v: RumorPanelView | null) {
    if (!v) {
      this.rumorEl.classList.add('hidden');
      this.rumorKey = '';
      return;
    }
    this.rumorEl.classList.remove('hidden');
    const key = `${v.who}|${v.ask}|${v.sel}|${v.cards.length}|${Math.ceil(v.timeLeft)}`;
    if (key === this.rumorKey) return;
    this.rumorKey = key;
    const cards = v.cards
      .map(
        (c, i) =>
          `<div class="rumor-card ${i === v.sel ? 'sel' : ''}"><span class="rc-key">${i + 1}</span><span class="rc-icon">${c.icon}</span><span class="rc-text">${c.text}</span><span class="rc-src">${c.source}</span></div>`,
      )
      .join('');
    this.rumorEl.innerHTML = `
      <div class="rp-head"><span class="rp-ear">👂</span><b>${v.who}</b><span class="rp-time">${Math.ceil(v.timeLeft)}</span></div>
      <div class="rp-ask">${v.topicIcon} ${v.ask}</div>
      <div class="rp-cards">${cards || `<div class="rp-empty">${t('pocketEmpty')}</div>`}</div>
      <div class="rumor-card none ${v.sel === -1 ? 'sel' : ''}"><span class="rc-key">0</span><span class="rc-text">${t('dontKnow')}</span></div>
      <div class="rp-foot">${t('rumorKeys')}</div>`;
  }

  /** Telefona mesaj düşer (patron, Rıza Usta, Selim). */
  phone(from: string, text: string, kind: 'boss' | 'riza' | 'villain' | 'info' = 'boss') {
    const icon = kind === 'boss' ? '👔' : kind === 'riza' ? '🫖' : kind === 'villain' ? '🕶️' : '📱';
    const d = el('div', `phone-msg ${kind}`, this.phoneEl, `<div class="pm-from">${icon} ${from}</div><div class="pm-text">${text}</div>`);
    while (this.phoneEl.children.length > 2) this.phoneEl.firstElementChild?.remove();
    setTimeout(() => d.classList.add('out'), 5200);
    setTimeout(() => d.remove(), 5800);
  }

  /** Sinir göstergesi 0..1; dolunca tepsiyle vurulabilir. */
  anger(level: number, ready: boolean) {
    this.angerEl.classList.toggle('hidden', level < 0.04 && !ready);
    this.angerEl.classList.toggle('ready', ready);
    this.angerFill.style.width = `${Math.min(1, level) * 100}%`;
    const lab = this.angerEl.querySelector('.anger-label') as HTMLElement;
    const txt = ready ? t('angerReady') : '';
    if (lab.textContent !== txt) lab.textContent = txt;
  }

  /** Kovalama uyarısı (kırmızı kenar + yazı). */
  chase(text: string | null, closeness = 0) {
    this.chaseEl.classList.toggle('hidden', !text);
    if (!text) return;
    this.chaseEl.style.setProperty('--close', String(Math.max(0, Math.min(1, closeness))));
    const lab = this.chaseEl.firstElementChild as HTMLElement;
    if (lab.textContent !== text) lab.textContent = text;
  }

  /** Açgözlü mod paneli: kasa, kavanoz, çarpan, kule. */
  setGreed(o: { bank: number; jar: number; hasJar: boolean; combo: number; tower: number; spinBoost: boolean }) {
    this.greedEl.classList.remove('hidden');
    const html =
      `<div class="g-bank"><span>${t('bank')}</span><b>${Math.round(o.bank)}₺</b></div>` +
      `<div class="g-jar ${o.hasJar ? '' : 'lost'}"><span>${t('jar')}</span><b>${o.hasJar ? Math.round(o.jar) + '₺' : '—'}</b></div>` +
      `<div class="g-combo ${o.combo > 1 ? 'hot' : ''}">×${o.combo.toFixed(1)}</div>` +
      `<div class="g-tower">${t('tower')}: <b>${o.tower}</b>${o.tower >= 7 ? ' <i>×2</i>' : ''}${o.spinBoost ? ' <i class="spin">' + t('spin') + ' ×2</i>' : ''}</div>`;
    if (this.greedEl.innerHTML !== html) this.greedEl.innerHTML = html;
  }

  /** Fırıldak zamanlama göstergesi; null gizler. */
  spinMeter(needle: number | null, zone: readonly [number, number] = [0.42, 0.58], label = '') {
    if (needle === null) {
      this.spinEl.classList.add('hidden');
      return;
    }
    this.spinEl.classList.remove('hidden');
    const z = this.spinEl.querySelector('.spin-zone') as HTMLElement;
    z.style.left = `${zone[0] * 100}%`;
    z.style.width = `${(zone[1] - zone[0]) * 100}%`;
    (this.spinEl.querySelector('.spin-needle') as HTMLElement).style.left = `${needle * 100}%`;
    (this.spinEl.querySelector('.spin-label') as HTMLElement).textContent = label;
  }

  /** Ekranın ortasında büyük, kısa yazı (felaket, rekor). */
  big(text: string, sub = '') {
    this.bigEl.innerHTML = `<div>${text}</div>${sub ? `<small>${sub}</small>` : ''}`;
    this.bigEl.classList.remove('hidden');
    this.bigEl.style.animation = 'none';
    void this.bigEl.offsetWidth;
    this.bigEl.style.animation = '';
    clearTimeout(this.bigTimer);
    this.bigTimer = window.setTimeout(() => this.bigEl.classList.add('hidden'), 1800);
  }
  private bigTimer = 0;

  /** Hikâye modunda para göstergesi, açgözlü modda kasa paneli görünür. */
  setMode(greed: boolean) {
    this.root.classList.toggle('greed-mode', greed);
    if (!greed) this.greedEl.classList.add('hidden');
  }

  show() {
    this.root.classList.remove('hidden');
  }
  hide() {
    this.root.classList.add('hidden');
  }

  setDay(label: string) {
    this.dayLabel.textContent = label;
  }

  setTime(remaining: number, total: number) {
    const s = Math.ceil(remaining);
    this.clockFill.style.width = `${(remaining / total) * 100}%`;
    this.clock.dataset.label = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.clock.classList.toggle('urgent', remaining < 30);
  }

  setMoney(earned: number, target: number) {
    this.money.textContent = `${earned.toFixed(1)}₺`;
    this.moneyTarget.textContent = ` / ${target}₺`;
    this.money.classList.toggle('reached', earned >= target);
  }

  floatMoney(v: number) {
    const f = el('div', 'float-item', this.floatEl, `+${v.toFixed(1)}₺`);
    setTimeout(() => f.remove(), 1400);
  }

  setTickets(list: TicketView[]) {
    const key = list.map((x) => `${x.office}:${x.kind}:${x.label ?? x.items.join('')}:${Math.round(x.urgency * 20)}`).join('|');
    if (key === this.lastTicketKey) return;
    this.lastTicketKey = key;
    this.tickets.innerHTML = '';
    for (const tk of list) {
      const d = el('div', 'ticket', this.tickets);
      if (tk.urgency > 0.75) d.classList.add('late');
      if (tk.kind && tk.kind !== 'normal') d.classList.add(tk.kind === 'gossip' ? 'ask' : tk.kind);
      el('div', 'ticket-office', d, `${tk.kind === 'vip' ? '★ VIP · ' : tk.kind === 'rush' ? '! ' : ''}${tk.office}`);
      const counts = { acik: 0, demli: 0 } as Record<string, number>;
      tk.items.forEach((i) => counts[i]++);
      const parts: string[] = [];
      if (counts.acik) parts.push(`${counts.acik} ${t('acik')}`);
      if (counts.demli) parts.push(`${counts.demli} ${t('demli')}`);
      el('div', 'ticket-items', d, tk.label ?? parts.join(', '));
      const bar = el('div', 'ticket-bar', d);
      const fill = el('div', 'ticket-bar-fill', bar);
      fill.style.width = `${Math.max(0, 1 - tk.urgency) * 100}%`;
    }
  }

  setTray(glasses: Glass[], capacity: number) {
    const key = glasses.map((g) => `${g.type}${Math.round(g.fill * 30)}${Math.round(g.temp / 5)}`).join('|') + capacity;
    if (key === this.lastTrayKey) return;
    this.lastTrayKey = key;
    const ctx = this.trayBox.getContext('2d')!;
    const W = this.trayBox.width;
    const H = this.trayBox.height;
    ctx.clearRect(0, 0, W, H);
    const gap = Math.min(70, (W - 40) / capacity);
    const sc = Math.min(1, gap / 62);
    const x0 = W / 2 - ((capacity - 1) * gap) / 2;
    for (let i = 0; i < capacity; i++) {
      const g = glasses[i];
      const x = x0 + i * gap;
      ctx.save();
      ctx.translate(x, 55);
      ctx.scale(sc, sc);
      ctx.translate(-x, -55);
      if (!g) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 20, 20, 40, 60);
        ctx.setLineDash([]);
        ctx.restore();
        continue;
      }
      drawGlassIcon(ctx, x, 50, g.type === 'demli' ? '#8e1d10' : '#d9822b', g.fill);
      // sıcaklık noktası
      const hot = Math.max(0, Math.min(1, (g.temp - 40) / 40));
      ctx.fillStyle = `rgb(${Math.round(80 + 175 * hot)},${Math.round(120 - 40 * hot)},${Math.round(200 - 160 * hot)})`;
      ctx.beginPath();
      ctx.arc(x, 96, 6, 0, Math.PI * 2);
      ctx.fill();
      if (g.colorScore > 1.1) {
        ctx.fillStyle = '#f2c230';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('★', x + 14, 26);
      }
      ctx.restore();
    }
  }

  hint(text: string | null) {
    if (!text) {
      this.hintEl.classList.add('hidden');
      return;
    }
    this.hintEl.classList.remove('hidden');
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
  }

  coach(text: string | null) {
    this.coachEl.classList.toggle('hidden', !text);
    if (text && this.coachEl.textContent !== text) this.coachEl.textContent = text;
  }

  toast(text: string, kind: 'good' | 'bad' | 'warn') {
    const d = el('div', `toast ${kind}`, this.toasts, text);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => d.remove(), 1600);
  }

  pourBar(progress: number | null, type: 'acik' | 'demli') {
    if (progress === null) {
      this.pourWrap.classList.add('hidden');
      return;
    }
    this.pourWrap.classList.remove('hidden');
    const win = type === 'acik' ? TEA.acikWindow : TEA.demliWindow;
    this.pourMarker.style.bottom = `${win[0] * 100}%`;
    this.pourMarker.style.height = `${(win[1] - win[0]) * 100}%`;
    this.pourFill.style.height = `${progress * 100}%`;
    // açık kehribardan koyu kırmızıya
    const r = Math.round(230 - 110 * progress);
    const g = Math.round(150 - 125 * progress);
    const b = Math.round(60 - 45 * progress);
    this.pourFill.style.background = `rgb(${r},${g},${b})`;
    const label = this.pourWrap.querySelector('.pour-label') as HTMLElement;
    label.textContent = t(type);
  }

  speech(who: string, text: string) {
    this.speechEl.innerHTML = `<b>${who}:</b> ${text}`;
    this.speechEl.classList.remove('hidden');
    clearTimeout(this.speechTimer);
    this.speechTimer = window.setTimeout(() => this.speechEl.classList.add('hidden'), 3200);
  }

  gossipCard(who: string, text: string) {
    this.gossipEl.innerHTML = `<div class="gossip-title">${t('gossipCard')}</div><div class="gossip-who">${who}</div><div class="gossip-text">${text}</div>`;
    this.gossipEl.classList.remove('hidden');
    clearTimeout(this.gossipTimer);
    this.gossipTimer = window.setTimeout(() => this.gossipEl.classList.add('hidden'), 7000);
  }

  wind(angle: number | null, level: number) {
    if (angle === null) {
      this.windEl.classList.add('hidden');
      return;
    }
    this.windEl.classList.remove('hidden');
    const a = this.windEl.firstElementChild as HTMLElement;
    a.style.transform = `rotate(${-angle * (180 / Math.PI) - 90}deg) scale(${0.8 + level * 0.6})`;
  }

  reset() {
    this.lastTicketKey = '';
    this.lastTrayKey = '';
    this.tickets.innerHTML = '';
    this.toasts.innerHTML = '';
    this.gossipEl.classList.add('hidden');
    this.speechEl.classList.add('hidden');
    this.coach(null);
    this.hint(null);
    this.pourBar(null, 'acik');
    this.wind(null, 0);
    this.spinMeter(null);
    this.bigEl.classList.add('hidden');
    this.rumorPanel(null);
    this.anger(0, false);
    this.chase(null);
    this.inspect(null);
    this.phoneEl.innerHTML = '';
  }
}
