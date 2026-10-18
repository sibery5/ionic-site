import { controlsList, getLang, t, tx, up } from '../core/i18n';
import { DAYS, ENDINGS, GOSSIP_NEEDED, Lang } from '../game/story';
import type { ShiftResult } from '../game/Shift';
import type { GreedResult } from '../game/Greed';
import type { SaveData } from '../core/save';
import { audio } from '../audio/Audio';

export interface UpgradeDef {
  id: string;
  name: Parameters<typeof up>[0];
  desc: Parameters<typeof up>[0];
  price: number;
  requires?: string;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'shoes', name: 'shoes', desc: 'shoesD', price: 60 },
  { id: 'thermos', name: 'thermos', desc: 'thermosD', price: 70 },
  { id: 'tray1', name: 'tray1', desc: 'tray1D', price: 80 },
  { id: 'wrist', name: 'wrist', desc: 'wristD', price: 90 },
  { id: 'tray2', name: 'tray2', desc: 'tray2D', price: 140, requires: 'tray1' },
];

function h(tag: string, cls = '', html = '', parent?: HTMLElement) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

function button(label: string, onClick: () => void, parent: HTMLElement, cls = 'btn') {
  const b = h('button', cls, label, parent) as HTMLButtonElement;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.init();
    audio.click();
    onClick();
  });
  return b;
}

function stars(n: number) {
  return '★'.repeat(n) + '<span class="dim">' + '★'.repeat(3 - n) + '</span>';
}

/** Menüler ve ara ekranlar. */
export class Menus {
  root: HTMLElement;
  private panel: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = h('div', 'menu', '', parent);
    this.panel = h('div', 'panel', '', this.root);
  }

  private open(cls = '') {
    this.root.classList.remove('hidden');
    this.root.className = `menu ${cls}`;
    this.panel.innerHTML = '';
    return this.panel;
  }

  hide() {
    this.root.classList.add('hidden');
  }

  title(o: {
    hasSave: boolean;
    onNew: () => void;
    onContinue: () => void;
    onGreed: () => void;
    onFree: () => void;
    onDaily: () => void;
    onHow: () => void;
    onSettings: () => void;
    onLang: (l: Lang) => void;
  }) {
    const p = this.open('title-screen');
    h('div', 'logo', 'ÇAYCI', p);
    h('div', 'logo-sub', t('subtitle'), p);
    h('div', 'tagline', t('tagline'), p);
    const list = h('div', 'btn-list', '', p);
    button(`${t('greedMode')} <span class="badge">${t('greedNew')}</span>`, o.onGreed, list, 'btn primary');
    if (o.hasSave) button(t('continue'), o.onContinue, list);
    button(t('newGame'), o.onNew, list);
    button(t('freePlay'), o.onFree, list);
    button(t('daily'), o.onDaily, list);
    button(t('howTo'), o.onHow, list);
    button(t('settings'), o.onSettings, list);
    const lang = h('div', 'lang-row', '', p);
    for (const l of ['tr', 'en'] as Lang[]) {
      const b = button(l.toUpperCase(), () => o.onLang(l), lang, 'btn small');
      if (getLang() === l) b.classList.add('active');
    }
    h('div', 'credits', t('credits'), p);
  }

  howTo(onBack: () => void) {
    const p = this.open();
    h('h2', '', t('howTo'), p);
    h('p', 'rules', t('rules'), p);
    h('h3', '', t('controlsTitle'), p);
    const tbl = h('table', 'controls', '', p);
    for (const [k, v] of controlsList()) h('tr', '', `<td><kbd>${k}</kbd></td><td>${v}</td>`, tbl);
    button(t('back'), onBack, p, 'btn primary');
  }

  settings(s: SaveData['settings'], onChange: (s: SaveData['settings']) => void, onBack: () => void) {
    const p = this.open();
    h('h2', '', t('settings'), p);
    const row = (label: string, key: 'volume' | 'music' | 'sensitivity', min: number, max: number) => {
      const r = h('label', 'slider-row', `<span>${label}</span>`, p);
      const inp = h('input', '', '', r) as HTMLInputElement;
      inp.type = 'range';
      inp.min = String(min);
      inp.max = String(max);
      inp.step = '0.05';
      inp.value = String(s[key]);
      inp.addEventListener('input', () => {
        s[key] = Number(inp.value);
        onChange(s);
      });
    };
    row(t('volume'), 'volume', 0, 1);
    row(t('music'), 'music', 0, 1);
    row(t('sensitivity'), 'sensitivity', 0.3, 2.5);
    button(t('back'), onBack, p, 'btn primary');
  }

  dayIntro(dayIndex: number, onStart: () => void) {
    const d = DAYS[dayIndex];
    const p = this.open('note-screen');
    h('div', 'note-day', tx(d.title), p);
    h('div', 'note-paper', tx(d.note), p);
    h('div', 'note-meta', `${t('target')}: <b>${[60, 80, 100, 120, 150][dayIndex]}₺</b> · ${tx(d.obstacle)}`, p);
    button(t('start'), onStart, p, 'btn primary');
  }

  freePlay(save: SaveData, onPick: (day: number) => void, onBack: () => void) {
    const p = this.open();
    h('h2', '', t('freePlay'), p);
    const grid = h('div', 'day-grid', '', p);
    DAYS.forEach((d, i) => {
      const unlocked = i <= Math.min(4, save.day);
      const b = button(
        `<div class="dg-floor">${tx(d.floor)}</div><div class="dg-obs">${tx(d.obstacle)}</div><div class="dg-stars">${unlocked ? stars(save.stars[i] ?? 0) : t('locked')}</div>`,
        () => unlocked && onPick(i),
        grid,
        'btn day-btn',
      );
      if (!unlocked) b.classList.add('locked');
    });
    button(t('back'), onBack, p, 'btn');
  }

  daily(best: number | undefined, dayIndex: number, onStart: () => void, onBack: () => void) {
    const p = this.open();
    h('h2', '', t('daily'), p);
    h('p', '', t('dailyInfo'), p);
    h('p', 'big', `${tx(DAYS[dayIndex].floor)} · ${tx(DAYS[dayIndex].obstacle)}`, p);
    if (best !== undefined) h('p', '', `${t('best')}: <b>${best}₺</b>`, p);
    button(t('start'), onStart, p, 'btn primary');
    button(t('back'), onBack, p, 'btn');
  }

  greedIntro(best: number | undefined, onStart: () => void, onBack: () => void) {
    const p = this.open('note-screen');
    h('div', 'note-day', t('greedMode'), p);
    h('div', 'note-paper', t('greedInfo'), p);
    const tbl = h('table', 'controls', '', p);
    for (const [k, v] of controlsList(true)) h('tr', '', `<td><kbd>${k}</kbd></td><td>${v}</td>`, tbl);
    if (best) h('p', 'big', `${t('bestScore')}: <b>${best}₺</b>`, p);
    button(t('start'), onStart, p, 'btn primary');
    button(t('back'), onBack, p);
  }

  greedSummary(r: GreedResult, o: { best: number; record: boolean; onRetry: () => void; onMenu: () => void }) {
    const p = this.open();
    h('h2', '', t('shiftOver'), p);
    if (o.record) h('div', 'record', t('newBest'), p);
    h('div', 'score', `${r.score}₺`, p);
    const tbl = h('table', 'summary', '', p);
    const row = (a: string, b: string) => h('tr', '', `<td>${a}</td><td>${b}</td>`, tbl);
    row(t('bestScore'), `${o.best}₺`);
    row(t('delivered'), String(r.delivered));
    row(t('maxTower'), String(r.maxTower));
    row(t('maxCombo'), `×${r.maxCombo.toFixed(1)}`);
    row(t('spins'), String(r.spins));
    row(t('broken'), String(r.broken));
    row(t('jarsLost'), String(r.jarsLost));
    button(t('playAgain'), o.onRetry, p, 'btn primary');
    button(t('quit'), o.onMenu, p);
    const key = (e: KeyboardEvent) => {
      if (e.code === 'KeyR' && document.body.contains(p) && !this.root.classList.contains('hidden')) {
        window.removeEventListener('keydown', key);
        o.onRetry();
      }
    };
    window.addEventListener('keydown', key);
  }

  clickToPlay(onClick: () => void) {
    const p = this.open('click-screen');
    const b = button(t('clickToPlay'), onClick, p, 'btn primary big');
    b.focus();
  }

  pause(onResume: () => void, onRestart: () => void, onQuit: () => void) {
    const p = this.open();
    h('h2', '', t('paused'), p);
    button(t('resume'), onResume, p, 'btn primary');
    button(t('restart'), onRestart, p);
    button(t('quit'), onQuit, p);
  }

  summary(r: ShiftResult, o: { passed: boolean; best?: number; onNext: () => void; onRetry: () => void; onMenu: () => void }) {
    const p = this.open();
    h('h2', '', t('shiftOver'), p);
    h('div', 'stars', stars(r.stars), p);
    const tbl = h('table', 'summary', '', p);
    const row = (a: string, b: string) => h('tr', '', `<td>${a}</td><td>${b}</td>`, tbl);
    row(t('earned'), `<b>${r.earned}₺</b>`);
    row(t('target'), `${r.target}₺`);
    if (o.best !== undefined) row(t('best'), `${o.best}₺`);
    row(t('delivered'), String(r.delivered));
    row(t('spilledTotal'), `${Math.round(r.spilled * 100)}%`);
    row(t('broken'), String(r.broken));
    row(t('spins'), String(r.spins));
    if (r.mode === 'story') row(t('gossipFound'), String(r.gossip.length));
    if (!o.passed && r.mode === 'story') h('p', 'warn-text', t('failed'), p);
    if (o.passed && r.mode === 'story') button(t('next'), o.onNext, p, 'btn primary');
    button(t('retry'), o.onRetry, p, o.passed ? 'btn' : 'btn primary');
    button(t('quit'), o.onMenu, p);
  }

  shop(save: SaveData, onBuy: (u: UpgradeDef) => void, onNext: () => void) {
    const p = this.open();
    h('h2', '', t('shop'), p);
    h('p', 'wallet', `${t('wallet')}: <b>${Math.round(save.wallet)}₺</b>`, p);
    const list = h('div', 'shop-list', '', p);
    for (const u of UPGRADES) {
      const owned = save.upgrades.includes(u.id);
      const blocked = u.requires && !save.upgrades.includes(u.requires);
      const item = h('div', 'shop-item', `<div><b>${up(u.name)}</b><br><small>${up(u.desc)}</small></div>`, list);
      const b = button(owned ? t('owned') : `${t('buy')} ${u.price}₺`, () => onBuy(u), item, 'btn small');
      if (owned || blocked || save.wallet < u.price) b.disabled = true;
    }
    button(t('nextDay'), onNext, p, 'btn primary');
  }

  choice(gossipCount: number, onSpill: () => void, onQuiet: () => void) {
    const p = this.open('note-screen');
    h('div', 'note-day', t('choiceTitle'), p);
    h('div', 'note-paper', t('choiceText'), p);
    h('div', 'note-meta', `${t('gossipFound')}: <b>${gossipCount}</b> / ${GOSSIP_NEEDED}`, p);
    button(t('spillIt'), onSpill, p, 'btn primary');
    button(t('stayQuiet'), onQuiet, p);
  }

  ending(key: keyof typeof ENDINGS, onMenu: () => void) {
    const e = ENDINGS[key];
    const p = this.open('note-screen');
    h('div', 'note-day', tx(e.title), p);
    h('div', 'note-paper', tx(e.text), p);
    h('div', 'logo small', `ÇAYCI · ${t('theEnd')}`, p);
    button(t('quit'), onMenu, p, 'btn primary');
  }
}
