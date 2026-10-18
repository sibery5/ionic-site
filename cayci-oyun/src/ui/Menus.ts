import { controlsList, gamepadList, getLang, t, tx } from '../core/i18n';
import { ENDINGS, GOSSIP_NEEDED, Lang } from '../game/story';
import { VENUES, objectiveText, type Venue } from '../game/venues';
import type { SaveData, Quality } from '../core/save';
import type { RunStats } from '../meta/stats';
import { objectiveKey, isUnlocked, type RunReport } from '../meta/profile';
import { ACHIEVEMENTS } from '../meta/achievements';
import { missionDef } from '../meta/missions';
import { withRivals, nextRival } from '../meta/leaderboard';
import { COSMETICS, UPGRADES, levelFromXp, levelProgress, rankFor, type CosmeticSlot, type Upgrade } from '../meta/progress';
import { audio } from '../audio/Audio';

function h(tag: string, cls = '', html = '', parent?: HTMLElement) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
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

function stars(n: number, of = 3) {
  return '<span class="st">' + '★'.repeat(n) + '</span><span class="dim">' + '★'.repeat(Math.max(0, of - n)) + '</span>';
}

function profileStrip(save: SaveData, parent: HTMLElement) {
  const lv = levelFromXp(save.xp);
  const strip = h('div', 'profile', '', parent);
  h('div', 'p-rank', `<b>${t('level')} ${lv}</b> · ${tx(rankFor(lv))}`, strip);
  const bar = h('div', 'xpbar', '', strip);
  h('div', 'xpbar-fill', '', bar).style.width = `${levelProgress(save.xp) * 100}%`;
  h('div', 'p-wallet', `${t('wallet')}: <b>${Math.round(save.wallet)}₺</b>`, strip);
}

const SLOT_NAMES: Record<CosmeticSlot, { tr: string; en: string }> = {
  tray: { tr: 'Tepsi', en: 'Tray' },
  vest: { tr: 'Yelek', en: 'Vest' },
  hat: { tr: 'Şapka', en: 'Hat' },
  glass: { tr: 'Bardak', en: 'Glass' },
};

/** Menüler ve ara ekranlar. */
export class Menus {
  root: HTMLElement;
  private panel: HTMLElement;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = h('div', 'menu', '', parent);
    this.panel = h('div', 'panel', '', this.root);
  }

  private open(cls = '') {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    this.root.classList.remove('hidden');
    this.root.className = `menu ${cls}`;
    this.panel.innerHTML = '';
    this.panel.scrollTop = 0;
    return this.panel;
  }

  private onKey(code: string, fn: () => void) {
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code === code && !this.root.classList.contains('hidden')) fn();
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  hide() {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    this.root.classList.add('hidden');
  }

  // ---------------- ana menü ----------------

  title(save: SaveData, o: Record<'career' | 'daily' | 'missions' | 'leaderboard' | 'wardrobe' | 'shop' | 'gossip' | 'howTo' | 'settings' | 'credits', () => void> & { lang: (l: Lang) => void }) {
    const p = this.open('title-screen');
    h('div', 'logo', 'ÇAYCI', p);
    h('div', 'logo-sub', t('subtitle'), p);
    h('div', 'tagline', t('tagline'), p);
    profileStrip(save, p);
    const list = h('div', 'btn-list', '', p);
    button(`${t('career')} <small>${t('careerSub')}</small>`, o.career, list, 'btn primary');
    const dm = save.daily.missions;
    const left = dm.filter((m) => !m.done).length;
    button(`${t('daily')}`, o.daily, list);
    button(`${t('missions')}${dm.length && left ? ` <span class="badge">${left}</span>` : ''}`, o.missions, list);
    const row = h('div', 'btn-row', '', list);
    button(t('leaderboard'), o.leaderboard, row);
    button(t('wardrobe'), o.wardrobe, row);
    const row2 = h('div', 'btn-row', '', list);
    button(t('shop'), o.shop, row2);
    button(t('gossipBook'), o.gossip, row2);
    const row3 = h('div', 'btn-row', '', list);
    button(t('howTo'), o.howTo, row3);
    button(t('settings'), o.settings, row3);
    const lang = h('div', 'lang-row', '', p);
    for (const l of ['tr', 'en'] as Lang[]) {
      const b = button(l.toUpperCase(), () => o.lang(l), lang, 'btn small');
      if (getLang() === l) b.classList.add('active');
    }
    button(t('credits'), o.credits, lang, 'btn small');
    h('div', 'version', 'v0.3', p);
  }

  // ---------------- kariyer haritası ----------------

  careerMap(save: SaveData, onPick: (i: number) => void, onMeeting: (() => void) | null, onBack: () => void) {
    const p = this.open();
    h('h2', '', t('map'), p);
    profileStrip(save, p);
    const grid = h('div', 'venue-grid', '', p);
    // en üst kat yukarıda: hanın kesiti
    [...VENUES.keys()].reverse().forEach((i) => {
      const v = VENUES[i];
      const rec = save.venues[v.id];
      const open = isUnlocked(save, i);
      const card = h('button', `venue-card ${open ? '' : 'locked'}`, '', grid) as HTMLButtonElement;
      const objDone = v.objectives.filter((ob) => rec?.objectives.includes(objectiveKey(ob))).length;
      const rival = nextRival(rec?.best ?? 0, v.rivals);
      card.innerHTML = `
        <div class="vc-floor">${tx(v.name)}</div>
        <div class="vc-obs">${tx(v.obstacle)}</div>
        <div class="vc-stars">${open ? stars(rec?.stars ?? 0) : '🔒 ' + t('unlockHint')}</div>
        ${open ? `<div class="vc-meta">${t('bestScore')}: <b>${rec?.best ?? 0}₺</b> · ${t('objectives')} ${objDone}/2${rival ? ` · ${t('rivalToBeat')}: ${esc(rival.name)} ${rival.score}₺` : ''}</div>` : ''}`;
      if (open)
        card.addEventListener('click', () => {
          audio.init();
          audio.click();
          onPick(i);
        });
      else card.disabled = true;
    });
    if (onMeeting) button(`★ ${t('meetingCard')} <small>${t('meetingCardSub')}</small>`, onMeeting, p, 'btn primary');
    h('p', 'gossip-count', `${t('gossipFound')}: <b>${save.gossip.length}</b> / 12 (${GOSSIP_NEEDED}+)`, p);
    button(t('back'), onBack, p);
  }

  venueIntro(v: Venue, save: SaveData, mode: RunStats['mode'], onStart: () => void, onBack: () => void) {
    const p = this.open('note-screen');
    const rec = save.venues[v.id];
    h('div', 'note-day', mode === 'daily' ? `${t('daily')} · ${tx(v.name)}` : tx(v.name), p);
    if (mode === 'career') h('div', 'note-paper', tx(v.note), p);
    else if (mode === 'daily') h('div', 'note-paper', t('dailyInfo'), p);
    const info = h('div', 'intro-grid', '', p);
    const obj = h('div', 'intro-box', `<h4>${t('objectives')}</h4>`, info);
    for (const ob of v.objectives) {
      const done = rec?.objectives.includes(objectiveKey(ob));
      h('div', `obj ${done ? 'done' : ''}`, `${done ? '✔' : '○'} ${tx(objectiveText(ob))}`, obj);
    }
    const goals = h('div', 'intro-box', `<h4>${t('starGoals')}</h4>`, info);
    v.stars.forEach((s, k) => h('div', 'obj', `${stars(k + 1)} ${s}₺`, goals));
    const rival = nextRival(rec?.best ?? 0, v.rivals);
    if (rival && mode !== 'daily') h('div', 'intro-box', `<h4>${t('rivalToBeat')}</h4><div class="obj">${esc(rival.name)}: <b>${rival.score}₺</b></div><div class="obj dim">${t('bestScore')}: ${rec?.best ?? 0}₺</div>`, info);
    button(t('start'), onStart, p, 'btn primary');
    button(t('back'), onBack, p);
    this.onKey('Enter', onStart);
  }

  clickToPlay(onClick: () => void) {
    const p = this.open('click-screen');
    const b = button(t('clickToPlay'), onClick, p, 'btn primary big');
    b.focus();
    this.onKey('Enter', onClick);
  }

  pause(onResume: () => void, onRestart: () => void, onQuit: () => void) {
    const p = this.open();
    h('h2', '', t('paused'), p);
    button(t('resume'), onResume, p, 'btn primary');
    button(t('restart'), onRestart, p);
    button(t('quit'), onQuit, p);
  }

  // ---------------- sonuç ekranı ----------------

  results(r: RunReport, s: RunStats, v: Venue, save: SaveData, o: { onAgain: () => void; onNext: (() => void) | null; onMap: () => void; onFinal: (() => void) | null }) {
    const p = this.open('results');
    h('h2', '', `${t('shiftOver')} · ${tx(v.name)}`, p);
    if (s.mode !== 'daily') h('div', 'stars big-stars', stars(r.stars), p);
    if (r.record) h('div', 'record', t('newBest'), p);
    h('div', 'score', `${r.score}₺`, p);
    if (r.rivalBeaten) h('div', 'rival', `${esc(r.rivalBeaten.name)} (${r.rivalBeaten.score}₺) ${t('rivalBeaten')}`, p);
    else if (r.nextRival) h('div', 'rival dim', `${t('rivalToBeat')}: ${esc(r.nextRival.name)} ${r.nextRival.score}₺`, p);
    else if (s.mode !== 'daily') h('div', 'rival', t('allRivalsBeaten'), p);

    const cols = h('div', 'res-grid', '', p);
    const left = h('div', 'intro-box', `<h4>${t('objectives')}</h4>`, cols);
    for (const ob of r.objectives) h('div', `obj ${ob.done ? 'done' : ''}`, `${ob.done ? '✔' : '○'} ${tx(objectiveText(ob.objective))}${ob.isNew ? ' <span class="badge">+XP</span>' : ''}`, left);
    const tbl = h('table', 'summary', '', left);
    const row = (a: string, b: string) => h('tr', '', `<td>${a}</td><td>${b}</td>`, tbl);
    row(t('delivered'), String(s.delivered));
    row(t('maxTower'), String(s.maxDeliveryTower));
    row(t('maxCombo'), `×${s.maxCombo.toFixed(1)}`);
    row(t('spins'), String(s.spins));
    row(t('broken'), String(s.broken));
    row(t('jarsLost'), String(s.jarsLost));
    if (r.boardRank) row(t('rank'), `#${r.boardRank}`);

    const right = h('div', 'intro-box', '', cols);
    const lv = r.levelAfter;
    h('h4', '', `${t('level')} ${lv} · ${tx(rankFor(lv))}`, right);
    const bar = h('div', 'xpbar', '', right);
    h('div', 'xpbar-fill', '', bar).style.width = `${levelProgress(save.xp) * 100}%`;
    h('div', 'obj', `+${r.xpGained} ${t('xp')} · ${t('coins')} +${r.coins}₺`, right);
    if (r.levelAfter > r.levelBefore) h('div', 'levelup', `${t('levelUp')} ${r.levelBefore} → ${r.levelAfter}`, right);
    for (const c of r.rewards) h('div', 'reward', `${t('unlockedReward')}: <b>${tx(c.name)}</b>`, right);
    for (const m of r.missionsCompleted) h('div', 'reward', `${t('missionDone')} ${tx(missionDef(m.kind).text(m.target))}`, right);
    if (r.achievements.length) h('div', 'reward ach', `🏆 ${t('achievementUnlocked')}: <b>${r.achievements.map((a) => tx(a.name)).join(', ')}</b>`, right);
    for (const g of r.gossipNew) {
      const [vid, oid] = g.split(':');
      const off = VENUES.find((x) => x.id === vid)?.offices.find((x) => x.id === oid);
      if (off?.gossip) h('div', 'reward gossip-line', `<b>${tx(off.person)}</b>: ${tx(off.gossip)}`, right);
    }

    const act = h('div', 'res-actions', '', p);
    if (o.onFinal) button(`★ ${t('meetingCard')}`, o.onFinal, act, 'btn primary');
    button(t('playAgain'), o.onAgain, act, o.onFinal ? 'btn' : 'btn primary');
    if (o.onNext) button(t('nextVenue'), o.onNext, act);
    button(t('map'), o.onMap, act);
    this.onKey('KeyR', o.onAgain);
  }

  // ---------------- görevler ve başarımlar ----------------

  missions(save: SaveData, onBack: () => void) {
    const p = this.open();
    h('h2', '', t('dailyMissions'), p);
    const list = h('div', 'mission-list', '', p);
    for (const m of save.daily.missions) {
      const def = missionDef(m.kind);
      const r = def.reward(m.target);
      const item = h('div', `mission ${m.done ? 'done' : ''}`, '', list);
      h('div', 'm-text', `${m.done ? '✔ ' : ''}${tx(def.text(m.target))}`, item);
      const bar = h('div', 'xpbar', '', item);
      h('div', 'xpbar-fill', '', bar).style.width = `${(m.progress / m.target) * 100}%`;
      h('div', 'm-meta', `${Math.round(m.progress)}/${m.target} · ${t('reward')}: ${r.coins}₺ + ${r.xp} ${t('xp')}`, item);
    }
    if (save.daily.missions.length && save.daily.missions.every((m) => m.done)) h('p', '', t('allMissionsDone'), p);
    h('h2', '', `${t('achievements')} (${save.achievements.length}/${ACHIEVEMENTS.length})`, p);
    const grid = h('div', 'ach-grid', '', p);
    for (const a of ACHIEVEMENTS) {
      const got = save.achievements.includes(a.id);
      h('div', `ach ${got ? 'got' : ''}`, `<b>${got ? '🏆' : '🔒'} ${tx(a.name)}</b><small>${tx(a.desc)}</small>`, grid);
    }
    button(t('back'), onBack, p, 'btn primary');
  }

  // ---------------- sıralama ----------------

  leaderboard(save: SaveData, tab: string, onTab: (id: string) => void, onBack: () => void) {
    const p = this.open();
    h('h2', '', t('leaderboard'), p);
    h('p', 'dim', t('leaderboardNote'), p);
    const tabs = h('div', 'tabs', '', p);
    for (const v of VENUES) {
      const b = button(tx(v.name), () => onTab(v.id), tabs, 'btn small');
      if (tab === v.id) b.classList.add('active');
    }
    const daily = Object.keys(save.boards).filter((k) => k.startsWith('daily-')).sort().reverse()[0];
    if (daily) {
      const b = button(t('daily'), () => onTab(daily), tabs, 'btn small');
      if (tab === daily) b.classList.add('active');
    }
    const v = VENUES.find((x) => x.id === tab);
    const rows = withRivals(save.boards[tab] ?? [], v ? v.rivals : []);
    const tbl = h('table', 'board', '', p);
    h('tr', '', `<th>#</th><th></th><th>₺</th><th></th>`, tbl);
    rows.slice(0, 13).forEach((e, i) => h('tr', e.rival ? 'rival-row' : 'me-row', `<td>${i + 1}</td><td>${esc(e.name)}${e.rival ? ' <small>(han)</small>' : ''}</td><td><b>${e.score}</b></td><td><small>${e.date}</small></td>`, tbl));
    button(t('back'), onBack, p, 'btn primary');
  }

  // ---------------- dolap ve çarşı ----------------

  wardrobe(save: SaveData, onEquip: (slot: CosmeticSlot, id: string) => void, onBack: () => void) {
    const p = this.open();
    h('h2', '', t('wardrobe'), p);
    profileStrip(save, p);
    const lv = levelFromXp(save.xp);
    for (const slot of ['tray', 'vest', 'hat', 'glass'] as CosmeticSlot[]) {
      h('h4', 'slot-title', SLOT_NAMES[slot][getLang()], p);
      const row = h('div', 'cos-row', '', p);
      for (const c of COSMETICS.filter((x) => x.slot === slot)) {
        const open = c.level <= lv;
        const on = save.look[slot] === c.id;
        const sw = c.color !== undefined ? `<span class="swatch" style="background:#${c.color.toString(16).padStart(6, '0')}"></span>` : '';
        const b = button(`${sw}${tx(c.name)}<small>${open ? (on ? t('equipped') : t('equip')) : `🔒 ${t('level')} ${c.level}`}</small>`, () => open && onEquip(slot, c.id), row, `btn cos ${on ? 'active' : ''}`);
        if (!open) b.disabled = true;
      }
    }
    button(t('back'), onBack, p, 'btn primary');
  }

  shop(save: SaveData, onBuy: (u: Upgrade) => void, onBack: () => void) {
    const p = this.open();
    h('h2', '', t('shop'), p);
    profileStrip(save, p);
    const list = h('div', 'shop-list', '', p);
    for (const u of UPGRADES) {
      const owned = save.upgrades.includes(u.id);
      const item = h('div', 'shop-item', `<div><b>${tx(u.name)}</b><br><small>${tx(u.desc)}</small></div>`, list);
      const b = button(owned ? t('owned') : `${t('buy')} ${u.price}₺`, () => onBuy(u), item, 'btn small');
      if (owned || save.wallet < u.price) b.disabled = true;
    }
    button(t('back'), onBack, p, 'btn primary');
  }

  gossipBook(save: SaveData, onBack: () => void) {
    const p = this.open('note-screen');
    h('div', 'note-day', `${t('gossipBook')} (${save.gossip.length}/12)`, p);
    const paper = h('div', 'note-paper gossip-book', '', p);
    for (const v of VENUES) {
      for (const off of v.offices) {
        if (!off.gossip) continue;
        const key = `${v.id}:${off.id}`;
        const got = save.gossip.includes(key);
        h('p', got ? '' : 'dim', got ? `<b>${tx(off.person)}</b> (${tx(v.name)}): ${tx(off.gossip)}` : `<b>${tx(v.name)}</b> · ? ? ?`, paper);
      }
    }
    button(t('back'), onBack, p, 'btn primary');
  }

  // ---------------- ayarlar, yardım ----------------

  settings(save: SaveData, onChange: () => void, onReset: () => void, onBack: () => void) {
    const p = this.open();
    const s = save.settings;
    h('h2', '', t('settings'), p);
    const slider = (label: string, key: 'volume' | 'music' | 'sensitivity', min: number, max: number) => {
      const r = h('label', 'slider-row', `<span>${label}</span>`, p);
      const inp = h('input', '', '', r) as HTMLInputElement;
      inp.type = 'range';
      inp.id = `set-${key}`;
      inp.min = String(min);
      inp.max = String(max);
      inp.step = '0.05';
      inp.value = String(s[key]);
      inp.addEventListener('input', () => {
        s[key] = Number(inp.value);
        onChange();
      });
    };
    slider(t('volume'), 'volume', 0, 1);
    slider(t('music'), 'music', 0, 1);
    slider(t('sensitivity'), 'sensitivity', 0.3, 2.5);
    const q = h('div', 'slider-row', `<span>${t('quality')}</span>`, p);
    const qs = h('div', '', '', q);
    for (const [k, label] of [
      ['low', t('qLow')],
      ['medium', t('qMedium')],
      ['high', t('qHigh')],
    ] as [Quality, string][]) {
      const b = button(label, () => {
        s.quality = k;
        onChange();
        this.settings(save, onChange, onReset, onBack);
      }, qs, `btn small ${s.quality === k ? 'active' : ''}`);
      void b;
    }
    const nm = h('label', 'slider-row', `<span>${t('playerName')}</span>`, p);
    const inp = h('input', 'name-input', '', nm) as HTMLInputElement;
    inp.id = 'set-name';
    inp.maxLength = 16;
    inp.value = save.playerName;
    inp.addEventListener('change', () => {
      save.playerName = inp.value.trim().slice(0, 16) || save.playerName;
      onChange();
    });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    button(t('fullscreen'), () => {
      if (document.fullscreenElement) void document.exitFullscreen?.();
      else void document.documentElement.requestFullscreen?.().catch(() => {});
    }, p, 'btn small');
    let armed = false;
    const reset = button(t('resetProgress'), () => {
      if (!armed) {
        armed = true;
        reset.textContent = t('resetConfirm');
        return;
      }
      onReset();
    }, p, 'btn small danger');
    button(t('back'), onBack, p, 'btn primary');
  }

  howTo(onBack: () => void) {
    const p = this.open();
    h('h2', '', t('howTo'), p);
    h('p', 'rules', t('rules'), p);
    h('h3', '', t('controlsTitle'), p);
    const tbl = h('table', 'controls', '', p);
    for (const [k, v] of controlsList()) h('tr', '', `<td><kbd>${k}</kbd></td><td>${v}</td>`, tbl);
    h('h3', '', t('gamepadTitle'), p);
    const tbl2 = h('table', 'controls', '', p);
    for (const [k, v] of gamepadList()) h('tr', '', `<td><kbd>${k}</kbd></td><td>${v}</td>`, tbl2);
    button(t('back'), onBack, p, 'btn primary');
  }

  credits(onBack: () => void) {
    const p = this.open('note-screen');
    h('div', 'logo small', 'ÇAYCI', p);
    h('div', 'note-paper', t('creditsText'), p);
    button(t('back'), onBack, p, 'btn primary');
  }

  // ---------------- final ----------------

  choice(gossipCount: number, onSpill: () => void, onQuiet: () => void) {
    const p = this.open('note-screen');
    h('div', 'note-day', t('choiceTitle'), p);
    h('div', 'note-paper', t('choiceText'), p);
    h('div', 'note-meta', `${t('gossipFound')}: <b>${gossipCount}</b> / 12 (${GOSSIP_NEEDED}+)`, p);
    button(t('spillIt'), onSpill, p, 'btn primary');
    button(t('stayQuiet'), onQuiet, p);
  }

  ending(key: keyof typeof ENDINGS, achievements: string[], onMenu: () => void) {
    const e = ENDINGS[key];
    const p = this.open('note-screen');
    h('div', 'note-day', tx(e.title), p);
    h('div', 'note-paper', tx(e.text), p);
    for (const a of achievements) h('div', 'reward ach', `🏆 ${t('achievementUnlocked')}: <b>${a}</b>`, p);
    h('div', 'logo small', `ÇAYCI · ${t('theEnd')}`, p);
    button(t('map'), onMenu, p, 'btn primary');
  }
}

