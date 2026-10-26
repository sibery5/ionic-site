// Akıllı telefon (P): Harita, Banka, İşler, Emlak, Galeri, Borsa, Kişiler, Çanta, Ayarlar.
import { svgImg } from './icons.js';
import { $, el, bar } from './dom.js';
import { formatMoney, pad2 } from '../core/util.js';
import { CARS, dealerCarList, LUXURY_VEHICLES, LUXURY_KINDS, PROPERTIES, PROPERTY_KINDS, STOCKS, LEGAL_RANKS, CRIME_RANKS, rankIn, garageCapacity, ensureLifeState } from '../game/economy.js';
import { JOBS, JOB_ORDER } from '../game/career.js';
import { Market } from '../game/market.js';
import { audio } from '../core/audio.js';

const APPS = [
  ['map', 'Harita', 'app_map', '#2d8a5a'], ['bank', 'Banka', 'app_bank', '#b38a1a'], ['jobs', 'İşler', 'app_jobs', '#1d6ec8'], ['estate', 'Emlak', 'app_estate', '#8a4a1a'],
  ['garage', 'Galeri', 'app_garage', '#3a3a4a'], ['stock', 'Borsa', 'app_stock', '#0d6a4a'], ['contacts', 'Kişiler', 'app_contacts', '#5a2d8a'], ['bag', 'Çanta', 'app_inventory', '#6a3a2a'],
  ['settings', 'Ayarlar', 'app_settings', '#444'],
];

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
    const ph = el('div', 'phone');
    ph.innerHTML = `<div class="ph-notch"></div><div class="ph-status"><span class="op">İSTMAFYA</span><span class="tm"></span><span class="ic">${svgImg('signal', null, 13)}${svgImg('battery', null, 18)}</span></div><div class="ph-screen"></div><div class="ph-home"></div>`;
    const m = this.openModal(ph, { cls: 'phone-layer' });
    m.kind = 'phone';
    const scr = $('.ph-screen', ph);
    const tm = () => { $('.tm', ph).textContent = `${pad2(g.env.hour)}:${pad2(g.env.minute)}`; };
    let cur = app, sub = null;
    const header = (title, back = 'home') => {
      const h = el('div', 'ph-head');
      const b = el('button', 'ph-back', svgImg('back', null, 16));
      b.onclick = () => { audio.click(); sub = null; go(back); };
      h.append(b, el('b', '', title));
      scr.appendChild(h);
      const c = el('div', 'ph-body'); scr.appendChild(c); return c;
    };
    const go = (a) => { cur = a; render(); };
    $('.ph-home', ph).onclick = () => { audio.click(); sub = null; go('home'); };
    const B = (label, fn, cls = '') => this.btn(label, () => { fn(); }, 'ph-btn ' + cls);
    const render = () => {
      tm();
      scr.innerHTML = '';
      scr.className = 'ph-screen app-' + cur;
      const s = g.state;
      if (cur === 'home') {
        const lr = rankIn(LEGAL_RANKS, s.legalRep), cr = rankIn(CRIME_RANKS, s.crimeRep);
        scr.innerHTML = `<div class="ph-wall"><div class="ph-clock">${pad2(g.env.hour)}:${pad2(g.env.minute)}</div><div class="ph-date">${g.env.day}. Gün · ${g.env.weather === 'rain' ? 'Yağmurlu' : g.env.weather === 'cloudy' ? 'Bulutlu' : 'Açık'}</div>
          <div class="ph-widget"><div><span>Nakit</span><b>${formatMoney(s.money)}</b></div><div><span>Banka</span><b>${formatMoney(s.bank)}</b></div></div>
          <div class="ph-widget ranks"><div><span>İş hayatı</span><b>${lr.name}</b></div><div><span>Yeraltı</span><b>${cr.name}</b></div></div>
          ${life.career.job ? `<div class="ph-widget job"><span>Aktif iş</span><b>${life.career.job.def.name}</b></div>` : ''}</div><div class="ph-apps"></div>`;
        const grid = $('.ph-apps', scr);
        for (const [id, name, icon, col] of APPS) {
          const a = el('button', 'ph-app', `<i style="background:linear-gradient(160deg, ${col}, #111)">${svgImg(icon, '#fff', 30)}</i><span>${name}</span>`);
          a.onclick = () => { audio.click(); if (id === 'map') { this.closeModal(m); this.mapScreen(); } else if (id === 'settings') this.settingsMenu(); else if (id === 'bag') { this.closeModal(m); this.openInventory(); } else go(id); };
          a.addEventListener('mouseenter', () => audio.hover());
          grid.appendChild(a);
        }
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
        const c = header('BİM Borsa');
        const pf = M.portfolio();
        c.innerHTML = `<div class="ph-card"><span>BİM-30 Endeksi</span><b>${M.index().toFixed(1)}</b><small>Portföy ${formatMoney(pf.value)} · K/Z <span class="${pf.pnl >= 0 ? 'up' : 'dn'}">${formatMoney(pf.pnl)}</span></small></div>`;
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
        const c = header('Kişiler');
        const C = life.career;
        const contacts = [
          ['Reis Baba', 'pin_reis', 'Aile işleri · hikâye görevleri', () => { this.closeModal(m); g.missions.talkToGiver('reis'); }],
          ['Galerici Tayfun', 'app_garage', 'Araç kataloğu', () => go('garage')],
          ['Emlakçı Nuri', 'app_estate', 'Satılık mülkler', () => go('estate')],
          ['Usta Rıfat', 'j_mechanic', 'Uzaktan tamir · ₺2.000', () => {
            const v = g.player.lastVehicle;
            if (!v || v.destroyed) return this.notify('Rıfat: "Tamir edecek araç göremiyorum evlat."', 'warn');
            if (v.hp >= v.def.hp) return this.notify('Rıfat: "Araç turp gibi, boşuna arama."', 'info');
            this.buy(2000, () => { v.hp = v.def.hp; v.burnT = 0; this.notify('Rıfat\'ın çırağı aracını tamir etti.', 'good'); });
          }],
          ['Avukat Hikmet', 'scale', 'Aranma kaydını sildir', () => {
            const lv = g.wanted.level;
            if (!lv) return this.notify('Hikmet: "Temizsin, keyfine bak."', 'info');
            const cost = lv * 8000;
            this.confirm('AVUKAT HİKMET', `"Dosyayı kapatırım ama ${formatMoney(cost)} tutar."`, 'Öde', () => this.buy(cost, () => { g.wanted.reset(); g.npcs.calmPolice(); this.notify('Aranma kaydın silindi.', 'good'); }));
          }],
          ['Taksi Durağı', 'j_taxi', 'Taksi şoförlüğüne başla', () => { this.closeModal(m); C.startJob('taxi'); }],
          ['Kurye Ahmet', 'j_courier', 'Paket dağıtımına başla', () => { this.closeModal(m); C.startJob('courier'); }],
          ['Atölye Usta', 'j_chop', 'Siparişe araç işi', () => { this.closeModal(m); C.startJob('chop'); }],
        ];
        for (const [name, icon, desc, fn] of contacts) {
          const r = el('div', 'ph-li');
          r.innerHTML = `<i class="av">${svgImg(icon, '#fff', 20)}</i><div><b>${name}</b><span>${desc}</span></div>`;
          r.appendChild(B('Ara', fn, 'gold'));
          c.appendChild(r);
        }
      }
    };
    render();
    // canlı saat & borsa yenilemesi
    const iv = setInterval(() => { if (!ph.isConnected) { clearInterval(iv); return; } tm(); if (cur === 'stock') render(); }, 2000);
    return m;
  },
};
