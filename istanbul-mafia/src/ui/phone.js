// Akıllı telefon (P): Görevler, Rehber, Mesajlar, Harita, Banka, Ayarlar + İşler, Emlak, Galeri, Borsa, Çanta.
// 1.4: yeniden tasarım (cam kartlar, dock, uygulama geçiş animasyonları, klavye: oklar/Enter, Geri: Backspace)
// ve diğer ekipler için bildirim servisi: game.phone.notify(başlık, metin) → Mesajlar uygulaması + kayan bildirim.
import { svgImg } from './icons.js';
import { $, el, bar, esc } from './dom.js';
import { formatMoney, pad2 } from '../core/util.js';
import { CARS, dealerCarList, LUXURY_VEHICLES, LUXURY_KINDS, PROPERTIES, PROPERTY_KINDS, STOCKS, LEGAL_RANKS, CRIME_RANKS, rankIn, garageCapacity, ensureLifeState } from '../game/economy.js';
import { JOBS, JOB_ORDER } from '../game/career.js';
import { Market } from '../game/market.js';
import { audio } from '../core/audio.js';
import { STORY, ACTS } from '../game/story_data.js';
import { SWEETHEARTS } from '../game/romance.js';

// [id, ad, ikon, renk]; ilk dördü alttaki dock'ta durur
const DOCK = [['missions', 'Görevler', 'journal', '#c8102e'], ['contacts', 'Rehber', 'app_contacts', '#2fbf5a'], ['messages', 'Mesajlar', null, '#1d8ae0'], ['map', 'Harita', 'app_map', '#2d8a5a']];
const APPS = [
  ['bank', 'Banka', 'app_bank', '#b38a1a'], ['settings', 'Ayarlar', 'app_settings', '#5a5a64'], ['jobs', 'İşler', 'app_jobs', '#1d6ec8'], ['estate', 'Emlak', 'app_estate', '#8a4a1a'],
  ['garage', 'Galeri', 'app_garage', '#3a3a4a'], ['stock', 'Borsa', 'app_stock', '#0d6a4a'], ['bag', 'Çanta', 'app_inventory', '#6a3a2a'],
];
const MSG_SVG = (c = '#fff', s = 30) => `<svg viewBox="0 0 64 64" width="${s}" height="${s}"><path d="M8 12 H56 Q60 12 60 16 V42 Q60 46 56 46 H26 L14 56 V46 H8 Q4 46 4 42 V16 Q4 12 8 12Z" fill="${c}"/><circle cx="20" cy="29" r="3.5" fill="#1d8ae0"/><circle cx="32" cy="29" r="3.5" fill="#1d8ae0"/><circle cx="44" cy="29" r="3.5" fill="#1d8ae0"/></svg>`;
const appIcon = (icon, s = 30) => (icon ? svgImg(icon, '#fff', s) : MSG_SVG('#fff', s));

const PHONE_CSS = `
.phone.v2 { width: 352px; border-radius: 52px; padding: 11px; background: linear-gradient(150deg, #3a3634, #121012 40%, #2a2624); box-shadow: 0 0 0 1px #6a625a, 0 0 0 3px #0a0806, 0 34px 80px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.12); }
.phone.v2 .ph-notch { top: 17px; width: 104px; height: 28px; border-radius: 16px; box-shadow: inset 0 0 0 1px #1a1a1a; }
.phone.v2 .ph-notch::after { content: ''; position: absolute; right: 18px; top: 9px; width: 10px; height: 10px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #3a4a6a, #05060a 70%); }
.phone.v2 .ph-screen { border-radius: 42px; background: #07070a; }
.phone.v2 .ph-screen.app-home { background: radial-gradient(120% 70% at 10% -10%, rgba(200,16,46,0.55), transparent 60%), radial-gradient(90% 60% at 110% 110%, rgba(212,175,55,0.35), transparent 60%), radial-gradient(70% 50% at 50% 60%, rgba(30,60,120,0.35), transparent 70%), #08070b; }
.phone.v2 .ph-screen.anim-fwd > * { animation: phFwd 0.26s cubic-bezier(.2,.8,.2,1) both; }
.phone.v2 .ph-screen.anim-back > * { animation: phBack 0.26s cubic-bezier(.2,.8,.2,1) both; }
.phone.v2 .ph-screen.anim-home > * { animation: phHome 0.32s cubic-bezier(.2,.8,.2,1) both; }
@keyframes phFwd { from { opacity: 0; transform: translateX(26px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes phBack { from { opacity: 0; transform: translateX(-26px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes phHome { from { opacity: 0; transform: scale(1.06); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
.phone.v2 .ph-wall { padding: 4px 16px 0; }
.phone.v2 .ph-clock { font: 200 64px var(--sans); letter-spacing: -0.02em; }
.ph-glance { margin: 8px 14px 0; border-radius: 22px; padding: 12px 14px; background: rgba(255,255,255,0.09); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.1); text-align: left; cursor: var(--cursor); }
.ph-glance .k { font: bold 9px var(--sans); letter-spacing: 0.22em; color: #e0c878; text-transform: uppercase; }
.ph-glance b { display: block; font: bold 15px var(--sans); color: #fff; margin: 3px 0 2px; }
.ph-glance small { display: block; font-size: 11px; color: #d8ccb4; }
.ph-glance .meters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.ph-glance .meters span { font-size: 9px; color: #c9b88e; letter-spacing: 0.1em; text-transform: uppercase; }
.ph-glance .meters i { display: block; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.12); margin-top: 3px; overflow: hidden; }
.ph-glance .meters i b { height: 100%; margin: 0; border-radius: 2px; }
.ph-money { display: flex; justify-content: space-between; margin: 8px 14px 0; padding: 9px 14px; border-radius: 18px; background: rgba(0,0,0,0.35); font-size: 11px; color: #c9b88e; }
.ph-money b { display: block; font: bold 15px var(--sans); color: #fff; }
.phone.v2 .ph-apps { grid-template-columns: repeat(4, 1fr); gap: 14px 4px; padding: 14px 12px 6px; margin-top: auto; }
.phone.v2 .ph-dock { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 6px 10px 6px; padding: 10px 6px; border-radius: 28px; background: rgba(255,255,255,0.12); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.08); }
.phone.v2 .ph-app { position: relative; outline: none; }
.phone.v2 .ph-app i { width: 56px; height: 56px; border-radius: 17px; box-shadow: 0 8px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 6px rgba(0,0,0,0.25); transition: transform 0.15s, box-shadow 0.15s; }
.phone.v2 .ph-app.hot i, .phone.v2 .ph-app:focus-visible i { transform: translateY(-3px) scale(1.07); box-shadow: 0 0 0 2px #fff, 0 10px 22px rgba(0,0,0,0.5); }
.phone.v2 .ph-app .lbl { text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
.phone.v2 .ph-dock .ph-app .lbl { display: none; }
.ph-badge { position: absolute; top: -5px; right: 6px; min-width: 20px; height: 20px; border-radius: 10px; background: #ff3b30; color: #fff; font: bold 11px/20px var(--sans); text-align: center; padding: 0 5px; box-shadow: 0 0 0 2px #0a0808; }
.phone.v2 .ph-head { padding: 4px 14px 10px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.phone.v2 .ph-head b { font: 800 22px var(--sans); letter-spacing: -0.01em; }
.phone.v2 .ph-back.hot { background: rgba(212,175,55,0.4); }
.phone.v2 .btn.ph-btn.hot { box-shadow: 0 0 0 2px #fff; }
.ph-contact { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 6px; border: 0; border-bottom: 1px solid rgba(255,255,255,0.06); background: none; color: #fff; text-align: left; font-family: var(--sans); cursor: var(--cursor); border-radius: 12px; }
.ph-contact.hot, .ph-contact:hover { background: rgba(255,255,255,0.07); }
.ph-contact .av { width: 44px; height: 44px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; font: 800 17px var(--sans); color: #120c06; }
.ph-contact div { flex: 1; min-width: 0; } .ph-contact b { display: block; font-size: 14px; } .ph-contact span { display: block; font-size: 11px; color: #a89a7e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ph-contact em { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(180deg, #34c759, #1a8a3a); display: flex; align-items: center; justify-content: center; font-style: normal; flex: none; }
.ph-sect { font: bold 10px var(--sans); letter-spacing: 0.2em; color: #8a7e68; text-transform: uppercase; margin: 12px 4px 4px; }
.ph-msg { display: flex; gap: 10px; padding: 10px 6px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.ph-msg .av { width: 38px; height: 38px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; font: 800 15px var(--sans); color: #fff; }
.ph-msg div { flex: 1; min-width: 0; } .ph-msg b { font-size: 13px; color: #fff; } .ph-msg small { float: right; font-size: 10px; color: #8a7e68; }
.ph-msg p { margin: 3px 0 0; font-size: 12px; color: #d8ccb4; line-height: 1.35; }
.ph-msg.unread b::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #1d8ae0; margin-right: 6px; }
.ph-keys { text-align: center; font-size: 10px; color: #6a6258; padding: 2px 0 0; }
.ph-toast { position: fixed; top: 16px; right: 16px; width: 320px; z-index: 40; display: flex; gap: 10px; align-items: flex-start; padding: 11px 13px; border-radius: 20px; background: rgba(28,26,30,0.92); backdrop-filter: blur(18px); box-shadow: 0 14px 40px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08); color: #fff; font: 12px var(--sans); animation: phToastIn 0.4s cubic-bezier(.2,.9,.3,1.15); pointer-events: none; }
.ph-toast.out { animation: phToastOut 0.35s ease-in forwards; }
.ph-toast i { width: 34px; height: 34px; border-radius: 10px; background: linear-gradient(160deg, #1d8ae0, #0a3a7a); display: flex; align-items: center; justify-content: center; flex: none; }
.ph-toast b { display: block; font-size: 13px; } .ph-toast small { float: right; color: #a89a7e; font-size: 10px; } .ph-toast p { margin: 2px 0 0; color: #ddd; line-height: 1.3; }
@keyframes phToastIn { from { transform: translateY(-120%); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes phToastOut { to { transform: translateY(-120%); opacity: 0; } }
`;
function injectCSS() {
  if (typeof document === 'undefined' || document.getElementById('phone2-css')) return;
  const st = document.createElement('style'); st.id = 'phone2-css'; st.textContent = PHONE_CSS; document.head.appendChild(st);
}
const initials = (n) => String(n).split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const hashCol = (n) => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return ['#c8102e', '#1d8ae0', '#2fbf5a', '#b38a1a', '#8a3ac8', '#e0702a', '#3a9a9a'][h % 7]; };

// Bildirim servisi: game.phone. Diğer ekipler: game.phone.notify('Kırmızı ışık ihlali', '₺500 ceza kesildi').
// Mesajlar kayıtla saklanır (g.state.phoneMsgs, en fazla 60); durum yokken bellekte bekler.
export class PhoneService {
  constructor(game) { this.g = game; this.pending = []; this._toast = null; this.onChange = null; }
  get list() {
    const s = this.g.state;
    if (!s) return this.pending;
    if (!Array.isArray(s.phoneMsgs)) s.phoneMsgs = [];
    if (this.pending.length) { s.phoneMsgs.push(...this.pending); this.pending = []; }
    return s.phoneMsgs;
  }
  get unread() { return this.list.filter((m) => !m.read).length; }
  // opts: {from, silent, kind:'fine'|'story'|'info'}
  notify(title, body = '', opts = {}) {
    const g = this.g, env = g.env;
    const m = { title: String(title || ''), body: String(body || ''), from: opts.from || String(title || ''), kind: opts.kind || 'info', day: env ? env.day : 1, time: env ? `${pad2(env.hour)}:${pad2(env.minute)}` : '', read: false };
    const L = this.list;
    L.unshift(m);
    if (L.length > 60) L.length = 60;
    if (!opts.silent) this.toast(m);
    if (this.onChange) this.onChange();
    return m;
  }
  markRead() { for (const m of this.list) m.read = true; if (this.onChange) this.onChange(); }
  open(app = 'home') { return this.g.ui && this.g.ui.openPhone(app); }
  toast(m) {
    if (typeof document === 'undefined' || !this.g.ui) return;
    injectCSS();
    if (this._toast) this._toast.remove();
    const e = el('div', 'ph-toast', `<i>${MSG_SVG('#fff', 20)}</i><div><small>${esc(m.time)}</small><b>${esc(m.from)}</b><p>${esc(m.from === m.title ? m.body : `${m.title} — ${m.body}`)}</p></div>`);
    this.g.ui.root.appendChild(e);
    this._toast = e;
    if (audio.phoneBeep) audio.phoneBeep(1);
    setTimeout(() => { e.classList.add('out'); setTimeout(() => { e.remove(); if (this._toast === e) this._toast = null; }, 380); }, 4800);
  }
}

function spark(hist, w = 90, h = 26, color) {
  const mn = Math.min(...hist), mx = Math.max(...hist), k = mx - mn || 1;
  const pts = hist.map((v, i) => `${(i / (hist.length - 1)) * w},${h - ((v - mn) / k) * (h - 2) - 1}`).join(' ');
  const c = color || (hist[hist.length - 1] >= hist[0] ? '#5ae08a' : '#ff5a5a');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.6"/></svg>`;
}

export const PhoneMethods = {
  openPhone(app = 'home') {
    const g = this.game;
    ensureLifeState(g.state);
    const life = this.ensureLife();
    injectCSS();
    if (!g.phone) g.phone = new PhoneService(g);
    if (app === 'missions') { this.openJournal(); return null; }
    const ph = el('div', 'phone v2');
    ph.innerHTML = `<div class="ph-notch"></div><div class="ph-status"><span class="op">İSTMAFYA</span><span class="tm"></span><span class="ic">${svgImg('signal', null, 13)}${svgImg('battery', null, 18)}</span></div><div class="ph-screen"></div><div class="ph-home"></div>`;
    const m = this.openModal(ph, { cls: 'phone-layer' });
    m.kind = 'phone';
    const scr = $('.ph-screen', ph);
    const tm = () => { $('.tm', ph).textContent = `${pad2(g.env.hour)}:${pad2(g.env.minute)}`; };
    let cur = app, sub = null, anim = 'anim-home';
    const header = (title, back = 'home') => {
      const h = el('div', 'ph-head');
      const b = el('button', 'ph-back', svgImg('back', null, 16));
      b.onclick = () => { audio.click(); sub = null; go(back, true); };
      h.append(b, el('b', '', title));
      scr.appendChild(h);
      const c = el('div', 'ph-body'); scr.appendChild(c); return c;
    };
    const go = (a, isBack) => { anim = a === 'home' ? 'anim-home' : isBack ? 'anim-back' : 'anim-fwd'; cur = a; render(); };
    $('.ph-home', ph).onclick = () => { audio.click(); sub = null; go('home'); };
    // Geri: Backspace (alt sayfa → uygulama → ana ekran). Oklar/Enter: ui.navKey (fare ile aynı vurgu)
    const onKey = (e) => {
      if (!ph.isConnected) { window.removeEventListener('keydown', onKey, true); return; }
      if (this.topModal() !== m || e.code !== 'Backspace') return;
      const a = document.activeElement; if (a && a.tagName === 'INPUT') return;
      e.preventDefault(); e.stopPropagation(); audio.click();
      if (sub) { sub = null; go(cur, true); } else if (cur !== 'home') go('home', true); else this.closeModal(m);
    };
    window.addEventListener('keydown', onKey, true);
    const prevOnChange = g.phone.onChange;
    g.phone.onChange = () => { if (ph.isConnected && (cur === 'home' || cur === 'messages')) render(); else if (prevOnChange) prevOnChange(); };
    const openApp = (id) => {
      audio.click();
      if (id === 'map') { this.closeModal(m); this.mapScreen(); }
      else if (id === 'settings') this.settingsMenu();
      else if (id === 'bag') { this.closeModal(m); this.openInventory(); }
      else if (id === 'missions') { this.closeModal(m); this.openJournal('gorev'); }
      else go(id);
    };
    const B = (label, fn, cls = '') => this.btn(label, () => { fn(); }, 'ph-btn ' + cls);
    const render = () => {
      tm();
      scr.innerHTML = '';
      scr.className = 'ph-screen app-' + cur + ' ' + anim;
      anim = '';
      const s = g.state;
      if (cur === 'home') {
        const M = g.missions, def = STORY[s.storyIndex];
        const B = M && M.baba;
        const f = M ? M.flags : {};
        const nUn = g.phone.unread;
        const next = M && M.active ? { k: 'Aktif görev · ' + (ACTS[M.active.act] || ''), t: M.active.title, sub: M.objText || 'Devam et' }
          : def ? { k: 'Sıradaki · ' + (ACTS[def.act] || ''), t: def.title, sub: `${B ? B.giver() : 'Reis Baba'} seni konakta bekliyor` } : { k: 'Hikâye', t: 'İstanbul senin', sub: 'Bütün görevler tamamlandı' };
        const meters = B && !f.babaDown ? `<div class="meters"><div><span>Reis'in güveni · ${B.trust}</span><i><b style="width:${B.trust}%;background:linear-gradient(90deg,#8a6a1a,#f0d68a)"></b></i></div><div><span>Şüphe · ${B.susp}</span><i><b style="width:${B.susp}%;background:linear-gradient(90deg,#6a1a1a,#ff5a46)"></b></i></div></div>` : '';
        scr.innerHTML = `<div class="ph-wall"><div class="ph-clock">${pad2(g.env.hour)}:${pad2(g.env.minute)}</div><div class="ph-date">${g.env.day}. Gün · ${g.env.weather === 'rain' ? 'Yağmurlu' : g.env.weather === 'cloudy' ? 'Bulutlu' : 'Açık'}</div></div>
          <button class="ph-glance" data-nav><div class="k">${esc(next.k)}</div><b>${esc(next.t)}</b><small>${esc(next.sub)}</small>${meters}</button>
          <div class="ph-money"><div>Nakit<b>${formatMoney(s.money)}</b></div><div>Banka<b>${formatMoney(s.bank)}</b></div><div>İtibar<b>${rankIn(CRIME_RANKS, s.crimeRep).name}</b></div></div>
          ${life.career.job ? `<div class="ph-money"><div>Aktif iş<b>${life.career.job.def.name}</b></div></div>` : ''}
          <div class="ph-apps"></div><div class="ph-dock"></div><div class="ph-keys"><kbd>Oklar</kbd> gez · <kbd>Enter</kbd> aç · <kbd>⌫</kbd> geri · <kbd>Esc</kbd> kapat</div>`;
        $('.ph-glance', scr).onclick = () => openApp('missions');
        const mk = ([id, name, icon, col], box) => {
          const a = el('button', 'ph-app', `<i style="background:linear-gradient(160deg, ${col}, ${col}55 120%)">${appIcon(icon)}</i><span class="lbl">${name}</span>${id === 'messages' && nUn ? `<em class="ph-badge">${nUn}</em>` : ''}`);
          a.dataset.app = id;
          a.onclick = () => openApp(id);
          box.appendChild(a);
        };
        for (const A of APPS) mk(A, $('.ph-apps', scr));
        for (const A of DOCK) mk(A, $('.ph-dock', scr));
        return;
      }
      if (cur === 'messages') {
        const c = header('Mesajlar');
        const L = g.phone.list;
        if (!L.length) c.appendChild(el('div', 'jr-empty', 'Mesaj yok. Şehir bugün sessiz.'));
        for (const msg of L) {
          const r = el('div', 'ph-msg' + (msg.read ? '' : ' unread'), `<span class="av" style="background:${hashCol(msg.from)}">${esc(initials(msg.from))}</span><div><small>${msg.day}. gün ${esc(msg.time)}</small><b>${esc(msg.from)}</b><p>${esc(msg.from === msg.title ? msg.body : `${msg.title} — ${msg.body}`)}</p></div>`);
          c.appendChild(r);
        }
        if (L.length) { const r = el('div', 'ph-row'); r.append(B('Tümünü sil', () => { L.length = 0; render(); }, 'red')); c.appendChild(r); }
        setTimeout(() => { for (const msg of L) msg.read = true; }, 400);
        return;
      }
      if (cur === 'bank') {
        const c = header('Lale Bankası');
        c.innerHTML = `<div class="ph-card"><span>Vadesiz hesap</span><b>${formatMoney(s.bank)}</b><small>Vadeli ${formatMoney(s.savings)} · Borç ${formatMoney(s.loans.reduce((a, l) => a + l.remaining, 0))}</small></div><div class="ph-card dim"><span>Cüzdan (nakit)</span><b>${formatMoney(s.money)}</b></div><h4>Transfer</h4><div class="ph-row"></div><div class="ph-row r2"></div><h4>Kredi taksitleri</h4><div class="ph-list"></div>`;
        const mv = (from, to, a) => { const x = Math.min(a, s[from]); if (x <= 0) return audio.error(); s[from] -= x; s[to] += x; audio.cash(); render(); };
        $('.ph-row', c).append(B('Nakit → Hesap', () => mv('money', 'bank', s.money), 'gold'), B('+₺10.000', () => mv('money', 'bank', 10000)));
        $('.r2', c).append(B('Hesap → Nakit', () => mv('bank', 'money', Math.min(s.bank, 10000))), B('Tümünü çek', () => mv('bank', 'money', s.bank)));
        const l = $('.ph-list', c);
        if (!s.loans.length) l.innerHTML = '<p class="hint">Borcun yok. Aferin.</p>';
        for (const L of s.loans) l.insertAdjacentHTML('beforeend', `<div class="ph-li"><b>${L.name}</b><span>${formatMoney(L.remaining)} · günlük ${formatMoney(L.daily)}</span></div>`);
        return;
      }
      if (cur === 'jobs') {
        const c = header('İş İlanları');
        const C = life.career;
        const lr = C.rank('legal'), cr = C.rank('crime');
        c.innerHTML = `<div class="ph-ranks"><div class="legal"><span>Yasal · ${lr.name}</span>${bar(lr.pct, 'blue')}</div><div class="crime"><span>Suç · ${cr.name}</span>${bar(cr.pct, 'red')}</div></div>`;
        if (C.job) { const r = el('div', 'ph-row'); r.append(B(`${C.job.def.name} işini bırak`, () => { C.endJob(); render(); }, 'red')); c.appendChild(r); }
        for (const path of ['legal', 'crime']) {
          c.appendChild(el('h4', '', path === 'legal' ? 'Yasal işler' : 'Kirli işler'));
          for (const id of JOB_ORDER) {
            const d = JOBS[id]; if (d.path !== path) continue;
            const can = C.canDo(id), on = C.job && C.job.id === id;
            const r = el('div', 'ph-li job' + (can ? '' : ' locked') + (on ? ' on' : ''));
            r.innerHTML = `${svgImg(d.icon, path === 'legal' ? '#5ad1ff' : '#ff5a5a', 26)}<div><b>${d.name}</b><span>${can ? d.desc.split('.')[0] : `Gereken itibar: ${d.need}`}</span></div>`;
            if (can && !on) r.appendChild(B('Başla', () => { this.closeModal(m); C.startJob(id); }, 'gold'));
            else if (on) r.appendChild(el('em', '', 'AKTİF'));
            c.appendChild(r);
          }
        }
        c.appendChild(el('p', 'hint', 'Not: Şehirdeki iş tabelalarından da başlayabilirsin (mavi: yasal, kırmızı: kirli). Her dükkânın kasası silahla soyulabilir.'));
        return;
      }
      if (cur === 'estate') {
        const c = header('Emlak İlanları');
        const P = life.properties;
        for (const pr of PROPERTIES) {
          const own = P.owned(pr.id);
          const r = el('div', 'ph-li' + (own ? ' on' : ''));
          r.innerHTML = `${svgImg(PROPERTY_KINDS[pr.kind].icon, own ? '#d4af37' : '#ddd', 26)}<div><b>${pr.name}</b><span>${PROPERTY_KINDS[pr.kind].name} · ${own ? 'SENİN' : formatMoney(pr.price)}</span></div>`;
          const a = el('div', 'ph-acts');
          a.appendChild(B('Rota', () => { P.gps(pr.id); }));
          if (!own) a.appendChild(B('Al', () => { if (P.buy(pr.id, 'bank')) render(); }, 'gold'));
          r.appendChild(a);
          c.appendChild(r);
        }
        const r = el('div', 'ph-row'); r.append(B('Tüm ilanlar ve işletmeler', () => this.shop_estate())); c.appendChild(r);
        c.appendChild(el('p', 'hint', 'Telefonla alımlar banka hesabından ödenir.'));
        return;
      }
      if (cur === 'garage') {
        const c = header('Galeri Kataloğu');
        if (life.test) {
          const t = life.test, d = CARS[t.type];
          const box = el('div', 'ph-card gold');
          box.innerHTML = `<span>Test sürüşü · ${Math.ceil(t.t)} sn</span><b>${d.name}</b><small>${formatMoney(d.price)}</small>`;
          const r = el('div', 'ph-row');
          r.append(B('Nakit ile al', () => life.buyCar(t.type, t.color, 'cash') || render(), 'gold'), B('Kartla al', () => life.buyCar(t.type, t.color, 'bank') || render(), 'gold'));
          box.appendChild(r); c.appendChild(box);
        }
        c.appendChild(el('h4', '', `Otomobil · Garaj ${s.ownedCars.length}/${garageCapacity(s)}`));
        for (const t of dealerCarList()) {
          const d = CARS[t];
          const r = el('div', 'ph-li');
          r.innerHTML = `${svgImg('car', d.colors[0], 28)}<div><b>${d.name}</b><span>${formatMoney(d.price)} · ${Math.round(d.maxSpeed * 3.6)} km/s</span></div>`;
          r.appendChild(B('Kartla al', () => life.buyCar(t, d.colors[0], 'bank'), 'gold'));
          c.appendChild(r);
        }
        c.appendChild(el('h4', '', 'Deniz & Hava'));
        for (const L of LUXURY_VEHICLES) {
          const r = el('div', 'ph-li');
          r.innerHTML = `${svgImg({ speedboat: 'v_speedboat', yacht: 'v_yacht', helicopter: 'v_helicopter', plane: 'v_plane' }[L.type], L.colors[0], 28)}<div><b>${L.name}</b><span>${LUXURY_KINDS[L.type]} · ${formatMoney(L.price)}</span></div>`;
          r.appendChild(B('Kartla al', () => { if (life.buyLuxury(L.id, L.colors[0], 'bank')) render(); }, 'gold'));
          c.appendChild(r);
        }
        c.appendChild(el('p', 'hint', 'Renk seçimi, taksit ve test sürüşü için galeriye git.'));
        return;
      }
      if (cur === 'stock') {
        const M = life.market;
        if (sub) {
          const st = STOCKS.find((x) => x.sym === sub);
          const c = header(st.sym, 'stock');
          const px = M.price(st.sym), ch = M.change(st.sym), have = s.stocks.hold[st.sym] || 0;
          const avg = have ? s.stocks.cost[st.sym] / have : 0;
          c.innerHTML = `<div class="ph-stock-h"><b>${st.name}</b><span>${st.sector}</span><div class="px">₺${px.toFixed(2)} <em class="${ch >= 0 ? 'up' : 'dn'}">${ch >= 0 ? '▲' : '▼'} %${Math.abs(ch * 100).toFixed(2)}</em></div></div>
            <div class="ph-chart">${spark(M.m.hist[st.sym], 300, 110)}</div>
            <div class="ph-card dim"><span>Elindeki</span><b>${have} lot</b><small>${have ? `Ort. maliyet ₺${avg.toFixed(2)} · K/Z ${formatMoney((px - avg) * have)}` : 'Pozisyon yok'}</small></div><h4>Al (banka hesabından)</h4><div class="ph-row b"></div><h4>Sat</h4><div class="ph-row sl"></div>`;
          const mx = Market.maxBuy(g, st.sym);
          for (const q of [1, 10, 100]) $('.b', c).appendChild(B(`+${q}`, () => { if (M.buy(st.sym, q)) render(); }));
          $('.b', c).appendChild(B(`Maks (${mx})`, () => { if (M.buy(st.sym, mx)) render(); }, 'gold'));
          for (const q of [1, 10, 100]) $('.sl', c).appendChild(B(`-${q}`, () => { if (M.sell(st.sym, q)) render(); }));
          $('.sl', c).appendChild(B('Hepsini sat', () => { if (M.sell(st.sym, have)) render(); }, 'red'));
          return;
        }
        const c = header('Boğaz Borsası');
        const pf = M.portfolio();
        c.innerHTML = `<div class="ph-card"><span>BGZ-30 Endeksi</span><b>${M.index().toFixed(1)}</b><small>Portföy ${formatMoney(pf.value)} · K/Z <span class="${pf.pnl >= 0 ? 'up' : 'dn'}">${formatMoney(pf.pnl)}</span></small></div>`;
        for (const st of STOCKS) {
          const ch = M.change(st.sym), have = s.stocks.hold[st.sym] || 0;
          const r = el('button', 'ph-li stock');
          r.innerHTML = `<div><b>${st.sym}</b><span>${st.name}${have ? ` · ${have} lot` : ''}</span></div>${spark(M.m.hist[st.sym])}<div class="q"><b>₺${M.price(st.sym).toFixed(2)}</b><em class="${ch >= 0 ? 'up' : 'dn'}">%${(ch * 100).toFixed(2)}</em></div>`;
          r.onclick = () => { audio.click(); sub = st.sym; render(); };
          c.appendChild(r);
        }
        if (M.lastNews) c.appendChild(el('p', 'hint', `Son haber: ${M.lastNews.text}`));
        return;
      }
      if (cur === 'contacts') {
        const c = header('Rehber');
        const C = life.career;
        const M = g.missions, B = M && M.baba;
        const call = (name, fn) => { this.closeModal(m); audio.phoneBeep && audio.phoneBeep(1); fn(); void name; };
        const row = (name, desc, color, fn) => {
          const r = el('button', 'ph-contact', `<span class="av" style="background:radial-gradient(circle at 35% 30%, #fff8, transparent 55%), ${color}">${esc(initials(name))}</span><div><b>${esc(name)}</b><span>${esc(desc)}</span></div><em>${svgImg('phone', '#fff', 16)}</em>`);
          r.onclick = () => { audio.click(); fn(); };
          c.appendChild(r);
        };
        c.appendChild(el('div', 'ph-sect', 'Aile'));
        const giver = B ? B.giver() : 'Reis Baba';
        row(giver, giver === 'Reis Baba' ? 'Aile işleri · yeni iş için konağa çağırır' : 'Sağ kolun · aile işleri', giver === 'Reis Baba' ? '#d4af37' : giver === 'Leyla' ? '#ff8ab8' : '#5ad1ff', () => call(giver, () => M.talkToGiver('reis')));
        const S = g.social;
        if (S) {
          const R = S.romance;
          const loves = Object.values(SWEETHEARTS).filter((d) => { const r = R.rel(d.id); return r && r.met && !r.dead; });
          if (loves.length) c.appendChild(el('div', 'ph-sect', 'Kalp'));
          for (const d of loves) row(d.name, `${R.rel(d.id).love}/100 kalp · buluşma ayarla`, d.color || '#ff4a8a', () => call(d.name, () => R.phone(d.id)));
        }
        c.appendChild(el('div', 'ph-sect', 'Hizmetler'));
        row('Usta Rıfat', 'Tamirci · uzaktan tamir ₺2.000', '#e0702a', () => {
          const v = g.player.lastVehicle;
          if (!v || v.destroyed) return this.notify('Rıfat: "Tamir edecek araç göremiyorum evlat."', 'warn');
          if (v.hp >= v.def.hp) return this.notify('Rıfat: "Araç turp gibi, boşuna arama."', 'info');
          this.buy(2000, () => { v.hp = v.def.hp; v.burnT = 0; this.notify('Rıfat\'ın çırağı aracını tamir etti.', 'good'); g.phone.notify('Usta Rıfat', 'Araban tamir edildi. Hesap ₺2.000, kartından çekildi.', { silent: true }); });
        });
        row('Avukat Hikmet', 'Aranma kaydını sildir', '#5a6ab8', () => {
          const lv = g.wanted.level;
          if (!lv) return this.notify('Hikmet: "Temizsin, keyfine bak."', 'info');
          const cost = lv * 8000;
          this.confirm('AVUKAT HİKMET', `"Dosyayı kapatırım ama ${formatMoney(cost)} tutar."`, 'Öde', () => this.buy(cost, () => { g.wanted.reset(); g.npcs.calmPolice(); this.notify('Aranma kaydın silindi.', 'good'); }));
        });
        row('Galerici Tayfun', 'Araç kataloğu', '#3a3a4a', () => go('garage'));
        row('Emlakçı Nuri', 'Satılık mülkler', '#8a4a1a', () => go('estate'));
        c.appendChild(el('div', 'ph-sect', 'İşler'));
        row('Taksi Durağı', 'Taksi şoförlüğüne başla', '#f2c200', () => { this.closeModal(m); C.startJob('taxi'); });
        row('Kurye Ahmet', 'Paket dağıtımına başla', '#1d6ec8', () => { this.closeModal(m); C.startJob('courier'); });
        row('Atölye Usta', 'Siparişe araç işi', '#8a1a1a', () => { this.closeModal(m); C.startJob('chop'); });
      }
    };
    render();
    // canlı saat & borsa yenilemesi
    const iv = setInterval(() => { if (!ph.isConnected) { clearInterval(iv); return; } tm(); if (cur === 'stock') render(); }, 2000);
    return m;
  },
};
