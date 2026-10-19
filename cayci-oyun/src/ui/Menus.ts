import { controlsList, gamepadList, getLang, t, tx } from '../core/i18n';
import { icon } from './icons';
import { ENDINGS, Lang } from '../game/story';
import { EVIDENCE_NEEDED, PEOPLE, RUMOR, RUMORS, TOPICS, type PersonId } from '../game/rumors';
import { TITLES, liveEvidence, nextTitleNeeds } from '../meta/titles';
import { SOLD_PRICE } from '../meta/profile';
import { VENUES, objectiveText, type Venue } from '../game/venues';
import type { SaveData, Quality, TrayAssist } from '../core/save';
import type { RunStats } from '../meta/stats';
import { objectiveKey, isUnlocked, type RunReport } from '../meta/profile';
import { ACHIEVEMENTS } from '../meta/achievements';
import { missionDef } from '../meta/missions';
import { withRivals, nextRival } from '../meta/leaderboard';
import { COSMETICS, UPGRADES, levelFromXp, levelProgress, type CosmeticSlot, type Upgrade } from '../meta/progress';
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
  return '<span class="st">' + icon('star').repeat(n) + '</span><span class="dim">' + icon('starOff').repeat(Math.max(0, of - n)) + '</span>';
}

function profileStrip(save: SaveData, parent: HTMLElement) {
  const lv = levelFromXp(save.xp);
  const strip = h('div', 'profile', '', parent);
  h('div', 'p-rank', `<b>${tx(TITLES[save.title].name)}</b> · ${t('level')} ${lv}`, strip);
  const bar = h('div', 'xpbar', '', strip);
  h('div', 'xpbar-fill', '', bar).style.width = `${levelProgress(save.xp) * 100}%`;
  h('div', `p-rep ${save.rep < 30 ? 'low' : save.rep >= 70 ? 'high' : ''}`, `${t('reputation')}: <b>${Math.round(save.rep)}</b>`, strip);
  h('div', 'p-wallet', `${t('wallet')}: <b>${Math.round(save.wallet)}₺</b>`, strip);
}

/** Toplantıda inandırıcı olmak için gereken itibar. */
export const MEETING_REP = 35;

const VERDICT_ICON = { reward: icon('good'), betray: icon('villain'), already: icon('back'), own: icon('faceSweat'), irrelevant: icon('shrug'), lie: icon('lie'), aboutThem: icon('mad') } as const;

/** Şimdiki unvan ve bir sonrakinin şartları. */
function titleBox(save: SaveData, parent: HTMLElement) {
  const box = h('div', 'title-box', '', parent);
  h('div', 'tb-now', `${t('title')}: <b>${tx(TITLES[save.title].name)}</b> · ${t('salary')} ${TITLES[save.title].salary}₺`, box);
  const next = nextTitleNeeds(save);
  if (!next) return;
  h('div', 'tb-next', `${t('nextTitle')}: <b>${tx(next.title.name)}</b> (${next.title.salary}₺)`, box);
  for (const n of next.needs) h('div', `obj ${n.done ? 'done' : ''}`, `${n.done ? icon('check') : icon('ring')} ${tx(n.text)}`, box);
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

  title(save: SaveData, o: Record<'career' | 'daily' | 'endless' | 'missions' | 'leaderboard' | 'wardrobe' | 'shop' | 'gossip' | 'howTo' | 'settings' | 'credits', () => void> & { lang: (l: Lang) => void }) {
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
    button(`${t('endless')} <small>${t('endlessSub')}</small>`, o.endless, list);
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
    h('div', 'version', 'v0.6', p);
  }

  // ---------------- kariyer haritası ----------------

  careerMap(save: SaveData, onPick: (i: number) => void, onMeeting: (() => void) | null, onBack: () => void, endless = false) {
    const p = this.open();
    h('h2', '', endless ? t('endless') : t('map'), p);
    if (endless) h('p', 'dim', t('endlessPick'), p);
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
        <div class="vc-stars">${open ? stars(rec?.stars ?? 0) : icon('lock') + ' ' + t('unlockHint')}</div>
        ${open && !endless ? `<div class="vc-meta">${t('bestScore')}: <b>${rec?.best ?? 0}₺</b> · ${t('objectives')} ${objDone}/2${rival ? ` · ${t('rivalToBeat')}: ${esc(rival.name)} ${rival.score}₺` : ''}</div>` : ''}
        ${open && endless ? `<div class="vc-meta">${t('bestScore')}: <b>${save.boards[`endless-${v.id}`]?.[0]?.score ?? 0}₺</b></div>` : ''}`;
      if (open)
        card.addEventListener('click', () => {
          audio.init();
          audio.click();
          onPick(i);
        });
      else card.disabled = true;
    });
    if (onMeeting) button(`${icon('star')} ${t('meetingCard')} <small>${t('meetingCardSub')}</small>`, onMeeting, p, 'btn primary');
    h('p', 'gossip-count', `${icon('notebook')} ${t('pocket')}: <b>${save.pocket.length}</b> / ${RUMORS.length} · ${icon('scale')} ${t('evidence')}: <b>${liveEvidence(save)}</b> / ${EVIDENCE_NEEDED}`, p);
    titleBox(save, p);
    button(t('back'), onBack, p);
  }

  venueIntro(v: Venue, save: SaveData, mode: RunStats['mode'], onStart: () => void, onBack: () => void) {
    const p = this.open('note-screen');
    const rec = save.venues[v.id];
    h('div', 'note-day', mode === 'daily' ? `${t('daily')} · ${tx(v.name)}` : mode === 'endless' ? `${t('endless')} · ${tx(v.name)}` : tx(v.name), p);
    if (mode === 'career') h('div', 'note-paper', tx(v.note), p);
    else if (mode === 'daily') h('div', 'note-paper', t('dailyInfo'), p);
    else if (mode === 'endless') {
      h('div', 'note-paper', t('endlessInfo'), p);
      const best = save.boards[`endless-${v.id}`]?.[0]?.score ?? 0;
      h('div', 'intro-box', `<h4>${t('bestScore')}</h4><div class="obj"><b>${best}₺</b></div>`, p);
      button(t('start'), onStart, p, 'btn primary');
      button(t('back'), onBack, p);
      this.onKey('Enter', onStart);
      return;
    }
    const info = h('div', 'intro-grid', '', p);
    const obj = h('div', 'intro-box', `<h4>${t('objectives')}</h4>`, info);
    for (const ob of v.objectives) {
      const done = rec?.objectives.includes(objectiveKey(ob));
      h('div', `obj ${done ? 'done' : ''}`, `${done ? icon('check') : icon('ring')} ${tx(objectiveText(ob))}`, obj);
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
    const ranked = s.mode === 'career' || s.mode === 'free';
    if (ranked) h('div', 'stars big-stars', stars(r.stars), p);
    if (s.mode === 'endless') h('div', 'rival', `${t('survived')}: <b>${Math.floor(s.survived / 60)}:${String(s.survived % 60).padStart(2, '0')}</b>`, p);
    if (r.record) h('div', 'record', t('newBest'), p);
    h('div', 'score', `${r.score}₺`, p);
    if (r.rivalBeaten) h('div', 'rival', `${esc(r.rivalBeaten.name)} (${r.rivalBeaten.score}₺) ${t('rivalBeaten')}`, p);
    else if (r.nextRival) h('div', 'rival dim', `${t('rivalToBeat')}: ${esc(r.nextRival.name)} ${r.nextRival.score}₺`, p);
    else if (ranked) h('div', 'rival', t('allRivalsBeaten'), p);

    const cols = h('div', 'res-grid', '', p);
    const left = h('div', 'intro-box', `<h4>${s.mode === 'endless' ? t('endless') : t('objectives')}</h4>`, cols);
    if (s.mode !== 'endless') for (const ob of r.objectives) h('div', `obj ${ob.done ? 'done' : ''}`, `${ob.done ? icon('check') : icon('ring')} ${tx(objectiveText(ob.objective))}${ob.isNew ? ' <span class="badge">+XP</span>' : ''}`, left);
    const tbl = h('table', 'summary', '', left);
    const row = (a: string, b: string) => h('tr', '', `<td>${a}</td><td>${b}</td>`, tbl);
    row(t('delivered'), String(s.delivered));
    row(t('maxTower'), String(s.maxDeliveryTower));
    row(t('maxCombo'), `×${s.maxCombo.toFixed(1)}`);
    row(t('spins'), String(s.spins));
    row(t('broken'), String(s.broken));
    row(t('jarsLost'), String(s.jarsLost));
    if (s.chases) row(t('statChases'), `${s.chases} · ${t('statEscapes')} ${s.escapes} · ${t('statCaught')} ${s.caught}`);
    if (s.mode !== 'daily' && save.settings.trayAssist !== 'normal') row(t('trayAssist'), save.settings.trayAssist === 'easy' ? `${t('trayEasy')} ×0,8` : `${t('trayMaster')} ×1,25`);
    if (s.bonks) row(t('statBonks'), `${s.bonks}${s.fines ? ` (−${s.fines}₺)` : ''}`);
    if (s.inspections) row(`${icon('boss')} ${t('inspection')}`, s.bossBonks ? t('bossHit') : s.inspectPassed ? t('inspectPass') : '—');
    if (s.backfires) row(`${icon('ear')} ${t('statBackfires')}`, String(s.backfires));
    if (r.boardRank) row(t('rank'), `#${r.boardRank}`);

    const right = h('div', 'intro-box', '', cols);
    const lv = r.levelAfter;
    h('h4', '', `${tx(TITLES[save.title].name)} · ${t('level')} ${lv}`, right);
    if (r.promotedTo !== null) h('div', 'levelup promo', `${t('promoted')} ${tx(TITLES[r.promotedTo].name)}`, right);
    const bar = h('div', 'xpbar', '', right);
    h('div', 'xpbar-fill', '', bar).style.width = `${levelProgress(save.xp) * 100}%`;
    h('div', 'obj', `+${r.xpGained} ${t('xp')} · ${t('coins')} +${r.coins}₺${r.salary ? ` (${t('salary')} ${r.salary}₺)` : ''}`, right);
    const dr = Math.round(r.repAfter - r.repBefore);
    if (dr) h('div', `obj ${dr > 0 ? 'done' : 'bad'}`, `${t('reputation')}: ${Math.round(r.repBefore)} → <b>${Math.round(r.repAfter)}</b> (${dr > 0 ? '+' : ''}${dr})`, right);
    if (r.levelAfter > r.levelBefore) h('div', 'levelup', `${t('levelUp')} ${r.levelBefore} → ${r.levelAfter}`, right);
    for (const c of r.rewards) h('div', 'reward', `${t('unlockedReward')}: <b>${tx(c.name)}</b>`, right);
    for (const m of r.missionsCompleted) h('div', 'reward', `${t('missionDone')} ${tx(missionDef(m.kind).text(m.target))}`, right);
    if (r.achievements.length) h('div', 'reward ach', `${icon('trophy')} ${t('achievementUnlocked')}: <b>${r.achievements.map((a) => tx(a.name)).join(', ')}</b>`, right);
    for (const id of r.gossipNew) {
      const g = RUMOR[id];
      if (g) h('div', 'reward gossip-line', `${icon('notebook')} ${icon(TOPICS[g.topic].icon)} <b>${tx(PEOPLE[g.source].name)}</b>: ${tx(g.text)}`, right);
    }
    for (const sale of r.sales) {
      const g = RUMOR[sale.rumor];
      if (!g) continue;
      h('div', `reward sale ${sale.verdict}`, `${VERDICT_ICON[sale.verdict]} ${icon(TOPICS[g.topic].icon)} → <b>${tx(PEOPLE[sale.buyer].name)}</b>${sale.pay ? ` +${sale.pay}₺` : ''} · ${t(`verdict_${sale.verdict}`)}`, right);
    }

    const act = h('div', 'res-actions', '', p);
    if (o.onFinal) button(`${icon('star')} ${t('meetingCard')}`, o.onFinal, act, 'btn primary');
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
      h('div', 'm-text', `${m.done ? icon('check') + ' ' : ''}${tx(def.text(m.target))}`, item);
      const bar = h('div', 'xpbar', '', item);
      h('div', 'xpbar-fill', '', bar).style.width = `${(m.progress / m.target) * 100}%`;
      h('div', 'm-meta', `${Math.round(m.progress)}/${m.target} · ${t('reward')}: ${r.coins}₺ + ${r.xp} ${t('xp')}`, item);
    }
    if (save.daily.missions.length && save.daily.missions.every((m) => m.done)) h('p', '', t('allMissionsDone'), p);
    h('h2', '', `${t('achievements')} (${save.achievements.length}/${ACHIEVEMENTS.length})`, p);
    const grid = h('div', 'ach-grid', '', p);
    for (const a of ACHIEVEMENTS) {
      const got = save.achievements.includes(a.id);
      h('div', `ach ${got ? 'got' : ''}`, `<b>${got ? icon('trophy') : icon('lock')} ${tx(a.name)}</b><small>${tx(a.desc)}</small>`, grid);
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
        const b = button(`${sw}${tx(c.name)}<small>${open ? (on ? t('equipped') : t('equip')) : `${icon('lock')} ${t('level')} ${c.level}`}</small>`, () => open && onEquip(slot, c.id), row, `btn cos ${on ? 'active' : ''}`);
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
    h('div', 'note-day', `${icon('notebook')} ${t('pocket')} (${save.pocket.length}/${RUMORS.length})`, p);
    h('div', 'note-meta', `${t('pocketSub')}<br>${icon('scale')} ${t('evidence')}: <b>${liveEvidence(save)}</b> / ${EVIDENCE_NEEDED} · ${t('reputation')}: <b>${Math.round(save.rep)}</b>`, p);
    const paper = h('div', 'note-paper gossip-book', '', p);
    for (const id of save.pocket) {
      const r = RUMOR[id];
      if (!r) continue;
      const told = save.sales.filter((k) => k.startsWith(`${id}>`)).map((k) => tx(PEOPLE[k.split('>')[1] as PersonId].name));
      const chips = [
        save.evidence.includes(id) && !save.burned.includes(id) ? `<span class="chip ok">${icon('scale')} ${t('evidence')}</span>` : '',
        save.burned.includes(id) ? `<span class="chip bad">${icon('fire')} ${t('burnedNote')}</span>` : '',
        told.length ? `<span class="chip">${t('soldTo')}: ${told.join(', ')}</span>` : '',
      ].join('');
      h('div', 'pocket-card', `<div class="pc-head">${icon(TOPICS[r.topic].icon)} <b>${tx(PEOPLE[r.source].name)}</b> <small>${tx(TOPICS[r.topic].name)}</small></div><div class="pc-text">${tx(r.text)}</div>${chips ? `<div class="pc-chips">${chips}</div>` : ''}`, paper);
    }
    const unknown = RUMORS.length - save.pocket.filter((id) => RUMOR[id]).length;
    if (unknown > 0) h('p', 'dim', `? ? ? × ${unknown}`, paper);
    // kim neyi merak eder: açılmış katlardaki insanlar
    h('div', 'note-day small', `${icon('people')} ${t('people')} · ${t('wants')}`, p);
    const ppl = h('div', 'people-grid', '', p);
    const seen = new Set<PersonId>();
    VENUES.forEach((v, i) => {
      if (!isUnlocked(save, i)) return;
      for (const o of v.offices) {
        if (seen.has(o.pid) || !PEOPLE[o.pid].wants.length) continue;
        seen.add(o.pid);
        h('div', 'person-chip', `<b>${tx(PEOPLE[o.pid].name)}</b> ${PEOPLE[o.pid].wants.map((w) => `<span title="${tx(TOPICS[w].name)}">${icon(TOPICS[w].icon)}</span>`).join(' ')}`, ppl);
      }
    });
    button(t('back'), onBack, p, 'btn primary');
  }

  // ---------------- ayarlar, yardım ----------------

  settings(save: SaveData, onChange: () => void, onReset: () => void, onBack: () => void) {
    const p = this.open();
    const s = save.settings;
    h('h2', '', t('settings'), p);
    const slider = (label: string, key: 'volume' | 'music' | 'sensitivity' | 'camDist', min: number, max: number) => {
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
    slider(t('camDist'), 'camDist', 0.75, 1.35);
    const ta = h('div', 'slider-row', `<span>${t('trayAssist')}</span>`, p);
    const tas = h('div', '', '', ta);
    for (const [k, label] of [
      ['easy', t('trayEasy')],
      ['normal', t('trayNormal')],
      ['master', t('trayMaster')],
    ] as [TrayAssist, string][]) {
      button(
        label,
        () => {
          s.trayAssist = k;
          onChange();
          this.settings(save, onChange, onReset, onBack);
        },
        tas,
        `btn small ${s.trayAssist === k ? 'active' : ''}`,
      );
    }
    h('p', 'dim small-note', t('trayAssistNote'), p);
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
    // otomatik kalite ve FPS göstergesi
    const toggles = h('div', 'slider-row', `<span>${t('performance')}</span>`, p);
    const tg = h('div', '', '', toggles);
    for (const [key, label] of [
      ['autoQuality', t('qAuto')],
      ['showFps', t('showFps')],
    ] as ['autoQuality' | 'showFps', string][]) {
      button(`${s[key] ? icon('boxOn') : icon('boxOff')} ${label}`, () => {
        s[key] = !s[key];
        onChange();
        this.settings(save, onChange, onReset, onBack);
      }, tg, `btn small ${s[key] ? 'active' : ''}`);
    }
    h('p', 'dim small-note', t('qAutoNote'), p);
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
    h('p', 'rules', t('rulesGossip'), p);
    h('p', 'rules', t('rulesAnger'), p);
    h('p', 'rules', t('rulesRise'), p);
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

  choice(save: SaveData, o: { onTruth: () => void; onQuiet: () => void; onSell: () => void }) {
    const p = this.open('note-screen');
    h('div', 'note-day', t('choiceTitle'), p);
    h('div', 'note-paper', t('choiceText'), p);
    const ev = liveEvidence(save);
    h(
      'div',
      'note-meta',
      `${t('meetingNeeds')}: ${icon('scale')} ${t('evidence')} <b class="${ev >= EVIDENCE_NEEDED ? 'ok' : 'bad'}">${ev}/${EVIDENCE_NEEDED}</b> · ${t('reputation')} <b class="${save.rep >= MEETING_REP ? 'ok' : 'bad'}">${Math.round(save.rep)}/${MEETING_REP}</b>`,
      p,
    );
    button(t('spillIt'), o.onTruth, p, 'btn primary');
    button(t('stayQuiet'), o.onQuiet, p);
    button(`${t('acceptOffer')} <small>${t('acceptOfferSub')} · +${SOLD_PRICE}₺</small>`, o.onSell, p, 'btn danger');
  }

  ending(key: keyof typeof ENDINGS, achievements: string[], onMenu: () => void) {
    const e = ENDINGS[key];
    const p = this.open('note-screen');
    h('div', 'note-day', tx(e.title), p);
    h('div', 'note-paper', tx(e.text), p);
    for (const a of achievements) h('div', 'reward ach', `${icon('trophy')} ${t('achievementUnlocked')}: <b>${a}</b>`, p);
    h('div', 'logo small', `ÇAYCI · ${t('theEnd')}`, p);
    button(t('map'), onMenu, p, 'btn primary');
  }
}

