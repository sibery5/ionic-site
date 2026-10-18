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
  urgency: number;
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
    const key = list.map((x) => `${x.office}:${x.items.join('')}:${Math.round(x.urgency * 20)}`).join('|');
    if (key === this.lastTicketKey) return;
    this.lastTicketKey = key;
    this.tickets.innerHTML = '';
    for (const tk of list) {
      const d = el('div', 'ticket', this.tickets);
      if (tk.urgency > 0.75) d.classList.add('late');
      el('div', 'ticket-office', d, tk.office);
      const counts = { acik: 0, demli: 0 } as Record<string, number>;
      tk.items.forEach((i) => counts[i]++);
      const parts: string[] = [];
      if (counts.acik) parts.push(`${counts.acik} ${t('acik')}`);
      if (counts.demli) parts.push(`${counts.demli} ${t('demli')}`);
      el('div', 'ticket-items', d, parts.join(', '));
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
    const gap = 70;
    const x0 = W / 2 - ((capacity - 1) * gap) / 2;
    for (let i = 0; i < capacity; i++) {
      const g = glasses[i];
      const x = x0 + i * gap;
      if (!g) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 20, 20, 40, 60);
        ctx.setLineDash([]);
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
  }
}
