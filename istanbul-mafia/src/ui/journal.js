// Görev defteri (J): telefon görünümlü ajanda. Sekmeler: Görev (aktif hedef), Hikâye (tamamlananlar),
// Yan İşler (kontrat, sokak olayı, iş), Aranıyor (ödül avı listesi), Kalp (sevgili ilişkileri).
import { svgImg } from './icons.js';
import { $, el, esc } from './dom.js';
import { formatMoney, pad2 } from '../core/util.js';
import { STORY, ACTS } from '../game/story_data.js';
import { SWEETHEARTS, stageOf } from '../game/romance.js';
import { DISTRICT_N } from '../game/bounties.js';
import { audio } from '../core/audio.js';

const CSS = `
.phone.journal .ph-screen { background: radial-gradient(ellipse at 0% 0%, #3a1a10 0%, transparent 50%), linear-gradient(180deg, #14100c, #0a0806); }
.jr-head { padding: 4px 16px 0; display: flex; align-items: baseline; justify-content: space-between; }
.jr-head b { font: 900 20px var(--serif); color: var(--gold2); letter-spacing: 0.08em; }
.jr-head span { font: 11px var(--sans); color: #a89a7e; }
.jr-tabs { display: flex; gap: 4px; padding: 10px 10px 8px; overflow-x: auto; }
.jr-tab { flex: none; border: 0; border-radius: 14px; padding: 6px 10px; background: rgba(255,255,255,0.07); color: #c9b88e; font: bold 11px var(--sans); cursor: var(--cursor); display: flex; align-items: center; gap: 5px; }
.jr-tab.on { background: linear-gradient(180deg, #d4af37, #8a6a1a); color: #1a1205; }
.jr-tab i { font-style: normal; background: #c8102e; color: #fff; border-radius: 8px; padding: 0 5px; font-size: 10px; }
.jr-card { border-radius: 16px; padding: 12px 14px; margin-bottom: 9px; background: rgba(255,255,255,0.06); border: 1px solid rgba(212,175,55,0.18); position: relative; }
.jr-card.hot { background: linear-gradient(140deg, rgba(212,175,55,0.22), rgba(90,26,26,0.35)); border-color: rgba(212,175,55,0.55); }
.jr-card .k { font: bold 10px var(--sans); letter-spacing: 0.22em; color: #a89a7e; text-transform: uppercase; }
.jr-card h3 { margin: 3px 0 6px; font: bold 18px var(--serif); color: #fff; }
.jr-card p { margin: 4px 0; font-size: 12px; color: #e6dcc6; line-height: 1.4; }
.jr-obj { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: 10px; background: rgba(0,0,0,0.35); margin: 6px 0; font-size: 13px; color: #fff; }
.jr-obj::before { content: ''; flex: none; width: 9px; height: 9px; margin-top: 4px; border-radius: 50%; background: #ffcc00; box-shadow: 0 0 0 0 rgba(255,204,0,0.8); animation: jrPulse 1.2s infinite; }
@keyframes jrPulse { to { box-shadow: 0 0 0 9px rgba(255,204,0,0); } }
.jr-prog { height: 5px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; margin: 8px 0 4px; }
.jr-prog b { display: block; height: 100%; background: linear-gradient(90deg, #8a6a1a, #f0d68a); }
.jr-meta { display: flex; justify-content: space-between; font-size: 11px; color: #a89a7e; }
.jr-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.jr-act { font: bold 10px var(--sans); color: var(--gold); letter-spacing: 0.25em; margin: 12px 2px 6px; text-transform: uppercase; }
.jr-m { display: flex; gap: 9px; align-items: center; padding: 7px 4px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px; }
.jr-m .dot { flex: none; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font: bold 11px var(--sans); }
.jr-m.done .dot { background: #2d8a3d; color: #fff; } .jr-m.cur .dot { background: #d4af37; color: #1a1205; animation: jrPulse 1.2s infinite; } .jr-m.lock .dot { background: rgba(255,255,255,0.08); color: #666; }
.jr-m b { display: block; color: #fff; font-size: 13px; } .jr-m small { display: block; color: #8a7e68; font-size: 11px; }
.jr-m.lock b { color: #6a6258; }
.jr-wanted { display: flex; gap: 10px; }
.jr-wanted .mug { flex: none; width: 72px; height: 88px; border-radius: 6px; overflow: hidden; background: #ddd2b8; position: relative; }
.jr-wanted .mug svg { width: 100%; height: 100%; display: block; }
.jr-wanted .amt { font: 900 20px var(--serif); color: #ff6a4a; }
.jr-stamp { position: absolute; right: 10px; top: 10px; transform: rotate(-12deg); border: 2px solid currentColor; padding: 1px 6px; font: 900 11px var(--sans); letter-spacing: 0.15em; border-radius: 4px; }
.jr-stamp.open { color: #ff4a3a; } .jr-stamp.caught { color: #5ad1ff; } .jr-stamp.dead { color: #8a8a8a; }
.jr-heart { display: flex; gap: 2px; margin: 6px 0; }
.jr-heart span { flex: 1; height: 7px; border-radius: 4px; background: rgba(255,255,255,0.08); }
.jr-heart span.on { background: linear-gradient(90deg, #ff4a8a, #ff9ac8); }
.jr-av { width: 46px; height: 46px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; font: 900 20px var(--serif); color: #1a0a10; }
.jr-empty { text-align: center; padding: 24px 10px; color: #8a7e68; font-size: 12px; }
.jr-keys { text-align: center; font-size: 10px; color: #6a6258; padding: 4px 0 2px; }
`;
function injectCSS() {
  if (document.getElementById('journal-css')) return;
  const s = document.createElement('style'); s.id = 'journal-css'; s.textContent = CSS; document.head.appendChild(s);
}

// prosedürel sabıka fotoğrafı (isimden tohumlanır)
function mugshot(name) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = (k) => ((h >> k) & 255) / 255;
  const skin = ['#e0b493', '#c99572', '#a8754f', '#f1d0b5'][h % 4], hair = ['#1a1410', '#3b2a1e', '#8a8a8a', '#6b4a2e'][(h >> 3) % 4];
  const bald = r(5) > 0.6, beard = r(9) > 0.45, w = 15 + r(2) * 4;
  let lines = ''; for (let y = 10; y < 100; y += 10) lines += `<path d="M0 ${y} H8 M72 ${y} H80" stroke="#7a6e58" stroke-width="1"/>`;
  return `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="100" fill="#cfc4aa"/>${lines}
    <path d="M10 100 Q12 72 40 70 Q68 72 70 100Z" fill="#3a3228"/><rect x="34" y="58" width="12" height="14" fill="${skin}"/>
    <ellipse cx="40" cy="42" rx="${w}" ry="21" fill="${skin}"/>${bald ? '' : `<path d="M${40 - w} 40 Q${40 - w} 18 40 19 Q${40 + w} 18 ${40 + w} 40 Q${40 + w - 4} 27 40 28 Q${40 - w + 4} 27 ${40 - w} 40Z" fill="${hair}"/>`}
    <ellipse cx="33" cy="42" rx="2.4" ry="1.6" fill="#1a1410"/><ellipse cx="47" cy="42" rx="2.4" ry="1.6" fill="#1a1410"/><path d="M30 37 L36 38 M44 38 L50 37" stroke="${hair}" stroke-width="2"/>
    <path d="M40 44 L38 51 L42 51" stroke="#7a5a40" stroke-width="1.2" fill="none"/>${beard ? `<path d="M${40 - w + 3} 46 Q40 70 ${40 + w - 3} 46 Q40 60 ${40 - w + 3} 46Z" fill="${hair}" opacity="0.85"/>` : ''}<path d="M35 55 Q40 57 45 55" stroke="#6a3a2a" stroke-width="1.5" fill="none"/>
    <rect x="16" y="82" width="48" height="12" fill="#111"/><text x="40" y="91" fill="#eee" font-size="7" text-anchor="middle" font-family="monospace">${(h % 90000 + 10000)}</text></svg>`;
}

const TABS = [['gorev', 'Görev', 'journal'], ['hikaye', 'Hikâye', 'star'], ['yan', 'Yan İşler', 'app_jobs'], ['aranan', 'Aranıyor', 'pin_skull'], ['kalp', 'Kalp', 'heart']];

export const JournalMethods = {
  openJournal(tab) {
    const g = this.game, ui = this;
    injectCSS();
    tab = tab || this.journalTab || 'gorev';
    const ph = el('div', 'phone journal');
    ph.innerHTML = `<div class="ph-notch"></div><div class="ph-status"><span class="op">AJANDA</span><span class="tm"></span><span class="ic">${svgImg('signal', null, 13)}${svgImg('battery', null, 18)}</span></div><div class="ph-screen"></div><div class="ph-home"></div>`;
    const m = this.openModal(ph, { cls: 'phone-layer' });
    m.kind = 'journal';
    const scr = $('.ph-screen', ph);
    $('.ph-home', ph).onclick = () => { audio.click(); this.closeModal(m); };
    const B = (label, fn, cls = '') => this.btn(label, () => { fn(); }, 'ph-btn ' + cls);
    const M = g.missions, S = g.social;
    const render = () => {
      this.journalTab = tab;
      $('.tm', ph).textContent = `${pad2(g.env.hour)}:${pad2(g.env.minute)}`;
      const nb = S ? S.bounties.list().filter((b) => b.status === 'open').length : 0;
      scr.innerHTML = `<div class="jr-head"><b>Görev Defteri</b><span>${g.env.day}. gün</span></div><div class="jr-tabs"></div><div class="ph-body"></div><div class="jr-keys"><kbd>1-5</kbd> sekme · <kbd>J</kbd> kapat</div>`;
      const tabs = $('.jr-tabs', scr);
      for (const [id, label, icon] of TABS) {
        const b = el('button', 'jr-tab' + (id === tab ? ' on' : ''), `${svgImg(icon, id === tab ? '#1a1205' : '#c9b88e', 13)}${label}${id === 'aranan' && nb ? `<i>${nb}</i>` : ''}`);
        b.onclick = () => { audio.click(); tab = id; render(); };
        tabs.appendChild(b);
      }
      const c = $('.ph-body', scr);
      this['journal_' + tab](c, B, render, m);
    };
    m.render = render;
    m.setTab = (i) => { const t = TABS[i]; if (t) { tab = t[0]; render(); } };
    render();
    return m;
  },

  journal_gorev(c, B, render, m) {
    const g = this.game, M = g.missions, s = g.state;
    if (M.active) {
      const def = M.active, n = def.steps ? def.steps.length : 1, i = M.stepIdx || 0;
      const card = el('div', 'jr-card hot');
      card.innerHTML = `<div class="k">${esc(ACTS[def.act] || '')}${M.replay ? ' · Tekrar' : ''}</div><h3>${esc(def.title)}</h3>
        <div class="jr-obj">${esc(M.objText || 'Devam et')}</div>
        <div class="jr-prog"><b style="width:${Math.round((i / n) * 100)}%"></b></div>
        <div class="jr-meta"><span>Aşama ${i + 1}/${n}${M.cpIdx > 0 && def.steps[M.cpIdx] && def.steps[M.cpIdx].cp ? ' · Kontrol: ' + esc(def.steps[M.cpIdx].cp) : ''}</span><span>${formatMoney(def.reward)} · +${def.respect}</span></div>
        <p>${esc(def.short || '')}</p>`;
      const row = el('div', 'jr-row');
      const mk = M.story.list[0];
      if (mk) row.appendChild(B('Hedefe rota', () => { const x = mk.actor ? mk.actor.pos.x : mk.vehicle ? mk.vehicle.pos.x : mk.x, z = mk.actor ? mk.actor.pos.z : mk.vehicle ? mk.vehicle.pos.z : mk.z; g.setGps(x, z); M.blinkUntil = performance.now() + 8000; audio.click(); this.closeModal(m); }, 'gold'));
      card.appendChild(row);
      c.appendChild(card);
    } else {
      const def = STORY[s.storyIndex];
      const card = el('div', 'jr-card hot');
      if (def) {
        const giver = def.call || def.giver || (M.flag('reisWounded') && !M.flag('reisBack') ? 'Leyla' : 'Reis Baba');
        card.innerHTML = `<div class="k">Sıradaki · ${esc(ACTS[def.act] || '')}</div><h3>${esc(def.title)}</h3><div class="jr-obj">${def.call ? `${esc(def.call)} seni arayacak` : `${esc(giver)} ile konakta konuş`}</div><p>${esc(def.short || '')}</p><div class="jr-meta"><span>Görev ${s.storyIndex + 1}/${STORY.length}</span><span>${formatMoney(def.reward)}</span></div>`;
        const row = el('div', 'jr-row');
        row.appendChild(B('Rota: Reis\'in konağı', () => { const k = g.map.nearestOfType('konak', 0, 0); if (k) { g.setGps(k.door.x, k.door.z + k.door.nz * 1.5); M.blinkUntil = performance.now() + 10000; } this.closeModal(m); }, 'gold'));
        card.appendChild(row);
      } else card.innerHTML = '<div class="k">Hikâye</div><h3>İstanbul senin</h3><p>Bütün hikâye görevleri tamamlandı. Görev arşivinden tekrar oynayabilirsin.</p>';
      c.appendChild(card);
    }
    // şu anki diğer uğraşlar
    const busy = this.journalBusy();
    c.appendChild(el('h4', '', 'Şu an'));
    if (!busy.length) c.appendChild(el('div', 'jr-empty', 'Yan uğraş yok. Kontrat panosu güvenli evde ve çay ocaklarında.'));
    for (const b of busy) c.appendChild(el('div', 'jr-m cur', `<span class="dot">•</span><div><b>${esc(b[0])}</b><small>${esc(b[1])}</small></div>`));
  },
  journalBusy() {
    const g = this.game, side = g.missions.side, out = [];
    const life = this.ensureLife ? this.ensureLife() : null;
    if (side.contract) out.push(['Kontrat: ' + side.contract.name, side.contract.district.toUpperCase() + ' · hedef haritada']);
    if (side.event) out.push([{ mugging: 'Kapkaç', chase: 'Polis kovalamacası', ambush: 'Çete pususu', footchase: 'Kaçan şüpheli' }[side.event.type] || 'Sokak olayı', 'Sokak olayı devam ediyor']);
    if (side.bagCarry) out.push(['Çantayı sahibine götür', 'Yeşil işaretli kadın']);
    if (side.war) out.push(['Bölge savunması', 'Meydanı tut']);
    if (life && life.career && life.career.job) out.push(['İş: ' + life.career.job.def.name, 'Aktif iş']);
    const S = g.social;
    if (S) {
      const ab = S.bounties.list().find((b) => b.active);
      if (ab) out.push(['Ödül avı: ' + ab.name, formatMoney(ab.amount) + ' · ' + DISTRICT_N[ab.district]]);
      if (S.romance.with) out.push([SWEETHEARTS[S.romance.with].name + ' yanında', S.romance.datePt ? 'Randevu yeri haritada (kalp)' : 'Birlikte geziyorsunuz']);
      else if (S.romance.meet) out.push([SWEETHEARTS[S.romance.meet].name + ' seni bekliyor', SWEETHEARTS[S.romance.meet].where]);
    }
    return out;
  },

  journal_hikaye(c) {
    const g = this.game, s = g.state;
    let act = -1;
    const done = s.completed.length;
    c.appendChild(el('div', 'jr-card', `<div class="k">İlerleme</div><h3>${done}/${STORY.length} görev</h3><div class="jr-prog"><b style="width:${Math.round(done / STORY.length * 100)}%"></b></div><div class="jr-meta"><span>Saygınlık ${s.respect}</span><span>${formatMoney(s.money)}</span></div>`));
    STORY.forEach((def, i) => {
      if (def.act !== act) { act = def.act; c.appendChild(el('div', 'jr-act', esc(ACTS[act] || ''))); }
      const isDone = s.completed.includes(def.id), cur = i === s.storyIndex;
      const cls = isDone ? 'done' : cur ? 'cur' : 'lock';
      const title = isDone || cur ? def.title : '? ? ?';
      const sub = isDone ? (def.short || '') : cur ? 'Sıradaki görev' : 'Kilitli';
      c.appendChild(el('div', 'jr-m ' + cls, `<span class="dot">${isDone ? '✓' : i + 1}</span><div><b>${esc(title)}</b><small>${esc(sub)}</small></div>`));
    });
  },

  journal_yan(c) {
    const g = this.game, s = g.state, side = g.missions.side;
    const busy = this.journalBusy();
    c.appendChild(el('h4', '', 'Devam edenler'));
    if (!busy.length) c.appendChild(el('div', 'jr-empty', 'Şu an yan iş yok.'));
    for (const b of busy) c.appendChild(el('div', 'jr-m cur', `<span class="dot">•</span><div><b>${esc(b[0])}</b><small>${esc(b[1])}</small></div>`));
    c.appendChild(el('h4', '', 'Bugünün kontratları'));
    const C = s.contracts && s.contracts.day === g.env.day ? s.contracts : null;
    if (!C) c.appendChild(el('div', 'jr-empty', 'Kontrat panosuna bakmadın. (Güvenli ev · çay ocağı)'));
    else for (const k of C.list) { const d = C.done.includes(k.id); c.appendChild(el('div', 'jr-m ' + (d ? 'done' : 'lock'), `<span class="dot">${d ? '✓' : '•'}</span><div><b>${esc(k.name)}</b><small>${esc(k.district.toUpperCase())} · ${formatMoney(k.pay)}</small></div>`)); }
    c.appendChild(el('h4', '', 'Sokaklar'));
    c.appendChild(el('p', 'hint', 'Şehirde kapkaç, polis kovalamacası ve pusu gibi olaylar kendiliğinden çıkar. Kapkaççıyı yakalayıp polise teslim edersen hem para hem itibar kazanırsın.'));
    void side;
  },

  journal_aranan(c, B, render) {
    const g = this.game, S = g.social;
    if (!S) return;
    c.appendChild(el('p', 'hint', 'Emniyet bu kaçakların başına ödül koydu. Diri teslim: tam ödül. Ölü: %60.'));
    for (const b of S.bounties.list()) {
      const card = el('div', 'jr-card' + (b.active ? ' hot' : ''));
      const st = b.status === 'open' ? (b.active ? 'AVDA' : 'ARANIYOR') : b.status === 'caught' ? 'YAKALANDI' : 'ÖLÜ';
      card.innerHTML = `<span class="jr-stamp ${b.status}">${st}</span><div class="jr-wanted"><div class="mug">${mugshot(b.name)}</div><div><div class="k">${esc(DISTRICT_N[b.district])}</div><h3>${esc(b.name)}</h3><div class="amt">${formatMoney(b.amount)}</div><p>${esc(b.crime)}</p></div></div><p>${esc(b.desc)}</p>`;
      if (b.status === 'open') {
        const row = el('div', 'jr-row');
        if (b.active) row.appendChild(B('Avı bırak', () => { S.bounties.cancel(); render(); }, 'red'));
        else row.appendChild(B('Avla', () => { S.bounties.hunt(b.id); render(); }, 'gold'));
        card.appendChild(row);
      }
      c.appendChild(card);
    }
  },

  journal_kalp(c, B, render, m) {
    const g = this.game, S = g.social;
    if (!S) return;
    const R = S.romance;
    for (const d of Object.values(SWEETHEARTS)) {
      const r = R.rel(d.id);
      const card = el('div', 'jr-card' + (R.with === d.id ? ' hot' : ''));
      const hearts = Array.from({ length: 10 }, (_, i) => `<span class="${r.love >= (i + 1) * 10 ? 'on' : ''}"></span>`).join('');
      card.innerHTML = r.met || r.love > 0
        ? `<div style="display:flex;gap:10px;align-items:center"><div class="jr-av" style="background:radial-gradient(circle at 35% 30%, #fff8, transparent 55%), ${d.color}">${d.name[0]}</div><div><div class="k">${esc(d.where)}${r.dead ? ' · HAYATTA DEĞİL' : ''}</div><h3>${esc(d.name)} · ${stageOf(r)}</h3></div></div>
           <div class="jr-heart">${hearts}</div><div class="jr-meta"><span>${r.love}/100 kalp</span><span>${r.dates} randevu${r.kissed ? ' · öpüştünüz' : ''}</span></div><p>${esc(d.bio)}</p>`
        : `<div class="k">${esc(d.where)}</div><h3>Tanımadığın biri</h3><p>${esc(d.where)}'de, kalp işaretinin olduğu yerde biri var. Belki bir gün yolunuz kesişir.</p>`;
      const row = el('div', 'jr-row');
      if (r.met && !r.dead) row.appendChild(B('Ara', () => { this.closeModal(m); R.phone(d.id); }, 'gold'));
      if (!r.dead) row.appendChild(B('Rota', () => { const h = R.homeSpot(d.id); g.setGps(h.x, h.z); this.closeModal(m); }));
      card.appendChild(row);
      c.appendChild(card);
    }
    c.appendChild(el('p', 'hint', 'İpucu: Yanındayken arabaya binersen yolcu koltuğuna oturur. Randevuda bankta oturup sohbet edin; ilişkiniz ilerledikçe el ele tutuşma, sarılma ve öpüşme açılır.'));
    void render;
  },
};
