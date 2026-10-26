// Perakende ve yaşam ekranları: Butik (kabin + sepet + kasa), Gardırop, Oto Galeri (showroom, test sürüşü,
// taksit, deniz/hava araçları), Emlak (konut + işletme geliştirme), Banka (hesap, vadeli, kredi),
// Çanta/Envanter, Garaj ve iş ilanları. UI sınıfına karıştırılan (mixin) metodlardır.
import { STORY } from '../game/story_data.js';
const STORY_N = STORY.length;
import { svgImg } from './icons.js';
import { $, el, esc, bar } from './dom.js';
import { formatMoney } from '../core/util.js';
import { WEAPONS, WEAPON_ORDER } from '../game/weapons.js';
import {
  CLOTHES, CLOTHING_CATS, FREE_ITEM_IDS, applyClothing, removeClothing, wornClothing, clothingColor,
  CARS, CAR_CLASS, dealerCarList, LUXURY_VEHICLES, LUXURY_KINDS, PROPERTIES, PROPERTY_KINDS, propertyPerks, garageCapacity,
  BUSINESSES, BIZ_LEVELS, bizLevel, bizIncome, GOODS, LEGAL_RANKS, CRIME_RANKS, rankIn, rankOf, ensureLifeState,
} from '../game/economy.js';
import { JOBS, JOB_ORDER } from '../game/career.js';
import { DISTRICTS } from '../world/map.js';
import { audio } from '../core/audio.js';

const distName = (id) => (DISTRICTS.find((d) => d.id === id) || { name: id }).name;
const LUX_ICON = { speedboat: 'v_speedboat', yacht: 'v_yacht', helicopter: 'v_helicopter', plane: 'v_plane' };

export const ShopMethods = {
  // ---------- ortak parçalar ----------
  tabBar(list, cur, pick) {
    const t = el('div', 'tabs seg-tabs');
    for (const [k, l, ic] of list) t.appendChild(this.btn((ic ? svgImg(ic, null, 16) + ' ' : '') + l, () => pick(k), 'tab' + (cur === k ? ' on' : '')));
    return t;
  },
  walletChips() {
    const s = this.game.state;
    return `<div class="wallet"><span>${svgImg('cash', '#8dff7a', 16)} ${formatMoney(s.money)}</span><span>${svgImg('card', '#d4af37', 16)} ${formatMoney(s.bank)}</span></div>`;
  },
  payButtons(price, onPay, opts = {}) {
    const s = this.game.state;
    const w = el('div', 'paybox');
    const mk = (method, icon, label, bal) => {
      const ok = bal >= price;
      const b = el('button', 'paycard' + (ok ? '' : ' short'));
      b.innerHTML = `${svgImg(icon, ok ? '#d4af37' : '#8a7e68', 26)}<div><b>${label}</b><small>Bakiye ${formatMoney(bal)}</small></div>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); audio.click(); onPay(method); });
      b.addEventListener('mouseenter', () => audio.hover());
      return b;
    };
    w.append(mk('cash', 'cash', opts.cashLabel || 'Nakit öde', s.money), mk('bank', 'card', opts.bankLabel || 'Banka kartı', s.bank));
    return w;
  },
  life() { return this.ensureLife(); },

  // ======================= BUTİK =======================
  shop_clothes(free = false) {
    const g = this.game, s = ensureLifeState(g.state), pl = g.player;
    const cart = [];
    let trying = null; // { it, color }
    let cat = 'top', view = 'browse', errMsg = '';
    const cam = { d: pl.camDist, p: pl.camPitch };
    const isOwned = (it, color) => FREE_ITEM_IDS.includes(it.id) || (s.owned[it.slot + ':' + it.id] || []).includes(color);
    const ownsAny = (it) => FREE_ITEM_IDS.includes(it.id) || (s.owned[it.slot + ':' + it.id] || []).length > 0 || wornClothing(s.look, it);
    const preview = () => {
      const L = { ...s.look };
      for (const c of cart) applyClothing(L, c.it, c.color);
      if (trying) applyClothing(L, trying.it, trying.color);
      return L;
    };
    const refreshModel = () => pl.model.setLook(preview());
    // kabin görünümü: oyuncu kameraya döner, kamera yaklaşır
    pl.heading = pl.camYaw + Math.PI; pl.camDist = 2.7; pl.camPitch = 0.06;
    pl.syncModel();
    const p = el('div', 'panel boutique');
    p.innerHTML = `<div class="panel-head"><h2>${free ? 'GARDIROP' : 'BUTİK SELİN'}</h2><p>${free ? 'Sahip olduğun her şey burada.' : 'Kıyafet seni adam etmez, ama adam gibi gösterir.'}</p><button class="x" title="Kapat (ESC)">✕</button></div>
      <div class="bq-wrap"><div class="bq-rail"></div><div class="bq-main"></div></div><div class="bq-foot"></div>`;
    const m = this.openModal(p, {
      cls: 'right fitting', onClose: () => { pl.camDist = cam.d; pl.camPitch = cam.p; pl.model.setLook(s.look); },
    });
    m.kind = 'clothes';
    $('.x', p).onclick = () => this.closeModal(m);
    const rail = $('.bq-rail', p), main = $('.bq-main', p), foot = $('.bq-foot', p);
    const total = () => cart.reduce((a, c) => a + c.it.price, 0);
    const inCart = (it) => cart.findIndex((c) => c.it.slot === it.slot && (c.it.cat !== 'jewelry' || c.it.id === it.id));

    const renderRail = () => {
      rail.innerHTML = '';
      for (const c of CLOTHING_CATS) {
        const b = el('button', 'bq-cat' + (c.id === cat && view === 'browse' ? ' on' : ''), `${svgImg(c.icon, null, 26)}<span>${c.name}</span>`);
        b.onclick = () => { audio.click(); cat = c.id; view = 'browse'; render(); };
        rail.appendChild(b);
      }
    };
    const itemCard = (it) => {
      const row = el('div', 'bq-item');
      const owned = (c) => isOwned(it, c);
      let sel = wornClothing(s.look, it) ? clothingColor(s.look, it) : it.colors.find((c) => !free || owned(c)) || it.colors[0];
      if (!it.colors.includes(sel)) sel = it.colors[0];
      const worn = wornClothing(preview(), it);
      row.innerHTML = `<div class="bq-thumb" style="--c:${sel}">${svgImg(CLOTHING_CATS.find((c) => c.id === it.cat).icon, sel, 40)}</div>
        <div class="in"><b>${it.name}${worn ? ' <em class="tag">ÜSTÜNDE</em>' : ''}</b><small>${it.desc || ''}</small><div class="swatches"></div></div>
        <div class="ia"><div class="price">${it.price ? formatMoney(it.price) : 'Ücretsiz'}</div><div class="acts"></div></div>`;
      const sw = $('.swatches', row), acts = $('.acts', row);
      if (it.colors.length > 1) it.colors.forEach((c) => {
        if (free && !owned(c)) return;
        const b = el('button', 'sw' + (c === sel ? ' on' : '')); b.style.background = c; b.title = owned(c) ? 'Sahipsin' : '';
        if (owned(c) && !free) b.classList.add('own');
        b.onclick = () => { sel = c; sw.querySelectorAll('.sw').forEach((x) => x.classList.remove('on')); b.classList.add('on'); $('.bq-thumb', row).innerHTML = svgImg(CLOTHING_CATS.find((k) => k.id === it.cat).icon, c, 40); trying = { it, color: c }; refreshModel(); audio.click(); fillActs(); };
        sw.appendChild(b);
      });
      const fillActs = () => {
        acts.innerHTML = '';
        if (free) {
          const on = wornClothing(s.look, it) && clothingColor(s.look, it) === sel;
          if (on && ['chain', 'tespih', 'ring'].includes(it.slot)) acts.appendChild(this.btn('Çıkar', () => { removeClothing(s.look, it.slot); trying = null; refreshModel(); render(); }));
          else acts.appendChild(on ? el('small', 'own', 'GİYİLİ') : this.btn('Giy', () => { applyClothing(s.look, it, sel); trying = null; refreshModel(); this.notify(it.name + ' giyildi', 'good'); render(); }, 'gold'));
          return;
        }
        acts.appendChild(this.btn('Dene', () => { trying = { it, color: sel }; refreshModel(); render(); }));
        if (isOwned(it, sel)) {
          acts.appendChild(this.btn('Giy', () => { applyClothing(s.look, it, sel); trying = null; refreshModel(); this.notify(it.name + ' giyildi', 'good'); render(); }, 'gold'));
        } else {
          acts.appendChild(this.btn(`${svgImg('cart', null, 14)} Sepete Ekle`, () => {
            const i = inCart(it);
            if (i >= 0) cart.splice(i, 1);
            cart.push({ it, color: sel });
            trying = null; refreshModel(); audio.cash();
            this.notify(`Sepete eklendi: ${it.name}`, 'info');
            render();
          }, 'gold'));
        }
      };
      fillActs();
      return row;
    };
    const renderBrowse = () => {
      const c = CLOTHING_CATS.find((k) => k.id === cat);
      main.innerHTML = `<div class="bq-title">${svgImg(c.icon, '#d4af37', 22)} ${c.name}${cat === 'bag' ? ` <small>Taşıma kapasitesi: ${s.capacity}</small>` : ''}</div>`;
      const list = el('div', 'bq-list');
      const items = CLOTHES.filter((it) => it.cat === cat && (!free || ownsAny(it)));
      for (const it of items) list.appendChild(itemCard(it));
      if (cat === 'top' && s.unlockedGoldJacket) {
        const row = el('div', 'bq-item special');
        row.innerHTML = `<div class="bq-thumb">${svgImg('c_top', '#d4af37', 40)}</div><div class="in"><b>Altın Lale Ceketi</b><small>25 Altın Lale koleksiyon ödülü</small></div><div class="ia"><div class="acts"></div></div>`;
        $('.acts', row).appendChild(this.btn('Giy', () => { s.look.top = 'leather'; s.look.topColor = '#d4af37'; s.look.topStyle = 'goldjacket'; trying = null; refreshModel(); render(); }, 'gold'));
        list.appendChild(row);
      }
      if (!list.children.length) list.appendChild(el('p', 'hint', free ? 'Bu kategoride kıyafetin yok. Butikten alışveriş yap.' : 'Stokta ürün yok.'));
      main.appendChild(list);
    };
    const renderCart = () => {
      main.innerHTML = `<div class="bq-title">${svgImg('cart', '#d4af37', 22)} Sepetim <small>${cart.length} ürün</small></div>`;
      const list = el('div', 'bq-list');
      cart.forEach((c, i) => {
        const r = el('div', 'bq-item cart');
        r.innerHTML = `<div class="bq-thumb">${svgImg(CLOTHING_CATS.find((k) => k.id === c.it.cat).icon, c.color, 34)}</div><div class="in"><b>${c.it.name}</b><small><span class="swi" style="background:${c.color}"></span> ${CLOTHING_CATS.find((k) => k.id === c.it.cat).name}</small></div><div class="ia"><div class="price">${formatMoney(c.it.price)}</div><div class="acts"></div></div>`;
        $('.acts', r).appendChild(this.btn(svgImg('trash', null, 14) + ' Çıkar', () => { cart.splice(i, 1); refreshModel(); render(); }, 'dim'));
        list.appendChild(r);
      });
      if (!cart.length) list.appendChild(el('p', 'hint', 'Sepetin boş. Bir şeyler dene, beğendiğini sepete ekle.'));
      main.appendChild(list);
      main.appendChild(el('div', 'bq-total', `<span>Toplam</span><b>${formatMoney(total())}</b>`));
    };
    const renderCheckout = () => {
      main.innerHTML = `<div class="bq-title">${svgImg('card', '#d4af37', 22)} Kasa</div>
        <div class="receipt">${cart.map((c) => `<div><span>${c.it.name}</span><b>${formatMoney(c.it.price)}</b></div>`).join('')}<div class="sum"><span>ÖDENECEK</span><b>${formatMoney(total())}</b></div></div>
        ${errMsg ? `<div class="err">${errMsg}</div>` : ''}<p class="hint">Ödeme yöntemini seç:</p>`;
      main.appendChild(this.payButtons(total(), (method) => {
        const key = method === 'bank' ? 'bank' : 'money';
        if (s[key] < total()) { audio.error(); errMsg = `Yetersiz bakiye! ${method === 'bank' ? 'Banka hesabında' : 'Cebinde'} ${formatMoney(s[key])} var, ${formatMoney(total() - s[key])} eksik.`; this.notify('Yetersiz bakiye!', 'warn'); render(); return; }
        s[key] -= total(); audio.cash();
        for (const c of cart) {
          const k = c.it.slot + ':' + c.it.id;
          s.owned[k] = s.owned[k] || [];
          if (!s.owned[k].includes(c.color)) s.owned[k].push(c.color);
          applyClothing(s.look, c.it, c.color);
          if (c.it.capacity) s.capacity = Math.max(s.capacity, c.it.capacity);
        }
        const n = cart.length, sum = total();
        cart.length = 0; trying = null; errMsg = '';
        refreshModel();
        s.legalRep += 1;
        this.notify(`${n} ürün satın alındı ve giyildi · ${formatMoney(sum)}`, 'good');
        view = 'done'; render();
      }));
    };
    const renderDone = () => {
      main.innerHTML = `<div class="bq-done">${svgImg('check', '#7cdd6a', 64)}<h3>Hayırlı olsun!</h3><p>Yeni kıyafetlerin üstünde, eskileri gardırobuna gönderdik.</p></div>`;
      const r = el('div', 'row center');
      r.append(this.btn('Alışverişe Devam', () => { view = 'browse'; render(); }), this.btn('Mağazadan Çık', () => this.closeModal(m), 'gold'));
      main.appendChild(r);
    };
    const renderFoot = () => {
      foot.innerHTML = '';
      const rot = el('div', 'rot');
      rot.append(this.btn('⟲', () => { pl.heading += 0.6; pl.syncModel(); }, 'chip'), this.btn('⟳', () => { pl.heading -= 0.6; pl.syncModel(); }, 'chip'));
      foot.appendChild(rot);
      if (free) { foot.appendChild(el('div', 'cartsum', '<span>Kıyafet değiştirmek ücretsizdir</span>')); return; }
      foot.appendChild(el('div', 'cartsum', `${svgImg('cart', '#d4af37', 20)}<span><b>${cart.length}</b> ürün</span><b class="tot">${formatMoney(total())}</b>`));
      if (view === 'browse' || view === 'done') foot.appendChild(this.btn('Sepeti Gör', () => { view = 'cart'; render(); }));
      else foot.appendChild(this.btn('‹ Ürünler', () => { view = 'browse'; render(); }));
      if (view !== 'checkout') {
        const k = this.btn('Kasaya Git', () => { if (!cart.length) { audio.error(); this.notify('Sepetin boş', 'warn'); return; } errMsg = ''; view = 'checkout'; render(); }, 'gold');
        if (!cart.length) k.classList.add('dim');
        foot.appendChild(k);
      }
    };
    const render = () => {
      renderRail();
      if (view === 'browse') renderBrowse(); else if (view === 'cart') renderCart(); else if (view === 'checkout') renderCheckout(); else renderDone();
      renderFoot();
    };
    this._boutique = { cart, add: (id, color) => { const it = CLOTHES.find((c) => c.id === id && (!color || c.colors.includes(color))); if (it) { cart.push({ it, color: color || it.colors[0] }); refreshModel(); render(); } }, view: (v) => { view = v; render(); }, pay: (method) => { view = 'checkout'; render(); const b = main.querySelectorAll('.paycard')[method === 'bank' ? 1 : 0]; b && b.click(); }, close: () => this.closeModal(m) };
    render();
    return m;
  },
  shop_wardrobe() { return this.shop_clothes(true); },

  // ======================= OTO GALERİ =======================
  shop_dealer(startTab = 'car') {
    const g = this.game, s = ensureLifeState(g.state), life = this.life();
    let tab = startTab, sel = null, color = null, fin = false;
    const p = el('div', 'panel showroom');
    p.innerHTML = `<div class="panel-head"><h2>OTO GALERİ TAYFUN</h2><p>Sıfır ayarında, kâğıtları temiz... çoğunlukla.</p><button class="x" title="Kapat (ESC)">✕</button></div><div class="panel-body sr"></div>`;
    const m = this.openModal(p, { cls: 'wide' });
    m.kind = 'dealer';
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    const entries = () => (tab === 'car' ? dealerCarList().map((t) => ({ key: t, car: true, ...CARS[t] }))
      : LUXURY_VEHICLES.filter((l) => (tab === 'sea' ? ['speedboat', 'yacht'] : ['helicopter', 'plane']).includes(l.type)).map((l) => ({ key: l.id, car: false, ...l })));
    const render = () => {
      body.innerHTML = '';
      body.appendChild(this.tabBar([['car', 'Otomobil', 'app_garage'], ['sea', 'Deniz', 'v_yacht'], ['air', 'Hava', 'v_helicopter']], tab, (k) => { tab = k; sel = null; render(); }));
      const list = entries();
      if (!sel || !list.find((e) => e.key === sel)) sel = list[0] && list[0].key;
      const e = list.find((x) => x.key === sel);
      if (!color || !e.colors.includes(color)) color = e.colors[0];
      const grid = el('div', 'sr-grid');
      const left = el('div', 'sr-list');
      for (const x of list) {
        const b = el('button', 'sr-row' + (x.key === sel ? ' on' : ''), `${svgImg(x.car ? 'car' : LUX_ICON[x.type], x.colors[0], 34)}<div><b>${x.name}</b><small>${x.car ? CAR_CLASS[x.style] || 'Otomobil' : LUXURY_KINDS[x.type]}</small></div><span>${formatMoney(x.price)}</span>`);
        b.onclick = () => { audio.click(); sel = x.key; fin = false; render(); };
        left.appendChild(b);
      }
      const right = el('div', 'sr-detail');
      const stats = e.car
        ? `<div class="stat"><span>Azami hız</span>${bar(e.maxSpeed / 62)}<em>${Math.round(e.maxSpeed * 3.6)} km/s</em></div><div class="stat"><span>İvme</span>${bar(e.accel / 21)}<em>${e.accel}</em></div><div class="stat"><span>Dayanıklılık</span>${bar(e.hp / 3000)}<em>${e.hp}</em></div><div class="stat"><span>Boyut</span>${bar(e.len / 11)}<em>${e.len} m</em></div>`
        : `<div class="stat"><span>Azami hız</span>${bar(e.speed / 850)}<em>${e.speed} km/s</em></div><div class="stat"><span>Kapasite</span>${bar(e.seats / 24)}<em>${e.seats} kişi</em></div>`;
      const owned = e.car ? s.ownedCars.filter((c) => c.type === e.key).length : s.luxury.filter((l) => l.id === e.key).length;
      const testing = life.test && life.test.type === e.key;
      right.innerHTML = `<div class="sr-stage" style="--c:${color}">${svgImg(e.car ? 'car' : LUX_ICON[e.type], color, 190)}<div class="floor"></div></div>
        <h3 class="sr-name">${e.name}</h3><p class="hint">${e.desc || (CAR_CLASS[e.style] || 'Otomobil') + ' · Garaj ' + s.ownedCars.length + '/' + garageCapacity(s)}${owned ? ` · <b class="gold">Sende ${owned} adet</b>` : ''}</p>
        <div class="sr-stats">${stats}</div><div class="sr-colors"><span>Renk</span><div class="swatches"></div></div>
        <div class="sr-price">${formatMoney(e.price)}</div><div class="sr-acts"></div>`;
      const sw = $('.swatches', right);
      for (const c of e.colors) { const b = el('button', 'sw' + (c === color ? ' on' : '')); b.style.background = c; b.onclick = () => { color = c; audio.click(); render(); }; sw.appendChild(b); }
      const acts = $('.sr-acts', right);
      if (e.car) {
        if (testing) acts.appendChild(el('div', 'note-inline', 'Şu an bu aracı test ediyorsun — satın alırsan araç senin olur.'));
        else acts.appendChild(this.btn(svgImg('key', null, 16) + ' Test Sürüşü (60 sn)', () => life.startTest(e.key, color)));
        const f = life.financeOffer(e.price);
        acts.appendChild(this.btn(fin ? 'Peşin öde' : 'Taksitli al', () => { fin = !fin; render(); }, 'dim'));
        if (fin) {
          acts.appendChild(el('div', 'fin', `<div><span>Peşinat (%25)</span><b>${formatMoney(f.down)}</b></div><div><span>${f.days} gün × taksit</span><b>${formatMoney(f.daily)}</b></div><div><span>Toplam geri ödeme</span><b>${formatMoney(f.down + f.total)}</b></div><small>Taksitler her sabah banka hesabından çekilir. 3 taksit kaçarsa araca el konur.</small>`));
          acts.appendChild(this.btn('Taksitle Satın Al', () => life.buyCar(e.key, color, 'finance') || render(), 'gold'));
        } else acts.appendChild(this.payButtons(e.price, (method) => life.buyCar(e.key, color, method) || render()));
      } else {
        acts.appendChild(el('p', 'hint', e.type === 'speedboat' || e.type === 'yacht' ? 'Teslimat: marina ya da yalının iskelesi.' : 'Teslimat: hangar ya da penthouse helipadı.'));
        acts.appendChild(this.payButtons(e.price, (method) => { if (life.buyLuxury(e.key, color, method)) render(); }));
      }
      grid.append(left, right);
      body.appendChild(grid);
      body.insertAdjacentHTML('beforeend', `<div class="sr-foot">${this.walletChips()}<span>Garaj: ${s.ownedCars.length}/${garageCapacity(s)} araç</span></div>`);
    };
    render();
    return m;
  },

  // ======================= EMLAK =======================
  shop_estate(startTab = 'homes') {
    const g = this.game, s = ensureLifeState(g.state), props = this.life().properties;
    let tab = startTab;
    const p = this.panel('EMLAKÇI NURİ', 'Ev, yalı, penthouse ya da işletme — tapu hazır, imza senden.');
    p.classList.add('estate');
    const m = this.openModal(p, { cls: 'wide' });
    m.kind = 'estate';
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    const render = () => {
      body.innerHTML = '';
      body.appendChild(this.tabBar([['homes', 'Konutlar', 'app_estate'], ['biz', 'İşletmeler', 'pin_estate'], ['mine', 'Portföyüm', 'key']], tab, (k) => { tab = k; render(); }));
      body.insertAdjacentHTML('beforeend', this.walletChips());
      const grid = el('div', 'cards');
      if (tab === 'homes' || tab === 'mine') {
        for (const pr of PROPERTIES) {
          const own = props.owned(pr.id);
          if (tab === 'mine' && !own) continue;
          const c = el('div', 'card prop' + (own ? ' own' : ''));
          c.innerHTML = `<div class="card-h">${svgImg(PROPERTY_KINDS[pr.kind].icon, own ? '#d4af37' : '#e8e0d0', 40)}<div><b>${pr.name}</b><small>${PROPERTY_KINDS[pr.kind].name} · ${distName(pr.district)}</small></div></div>
            <p>${pr.desc}</p><div class="perks">${propertyPerks(pr).map((x) => `<span>${x}</span>`).join('')}</div>
            <div class="card-f"><div class="price">${own ? 'SENİN' : formatMoney(pr.price)}</div><div class="acts"></div></div>`;
          const a = $('.acts', c);
          a.appendChild(this.btn('Haritada', () => props.gps(pr.id), 'dim'));
          if (own) a.appendChild(this.btn(`Sat (${formatMoney(pr.price * 0.75)})`, () => this.confirm('Mülkü sat?', `${pr.name} · ${formatMoney(pr.price * 0.75)} hesabına geçer.`, 'Sat', () => { props.sell(pr.id); render(); })));
          else {
            a.appendChild(this.btn('Nakit', () => { if (props.buy(pr.id, 'cash')) render(); }, 'gold'));
            a.appendChild(this.btn('Banka', () => { if (props.buy(pr.id, 'bank')) render(); }, 'gold'));
          }
          grid.appendChild(c);
        }
      }
      if (tab === 'biz' || tab === 'mine') {
        for (const b of BUSINESSES) {
          const own = s.businesses.includes(b.id);
          if (tab === 'mine' && !own) continue;
          const lv = bizLevel(s, b.id), next = BIZ_LEVELS[lv];
          const c = el('div', 'card biz' + (own ? ' own' : ''));
          c.innerHTML = `<div class="card-h">${svgImg('pin_estate', own ? '#d4af37' : '#e8b060', 40)}<div><b>${b.name}</b><small>${distName(b.district)} · ${own ? BIZ_LEVELS[lv - 1].name : 'Satılık'}</small></div></div>
            <div class="grid2"><div><span>Günlük gelir</span><b>${formatMoney(own ? bizIncome(s, b) : b.income)}</b></div><div><span>Kademe</span><b>${own ? lv + '/' + BIZ_LEVELS.length : '—'}</b></div></div>
            ${own && next ? `<p class="hint">Sonraki: ${next.name} → günlük ${formatMoney(Math.round(b.income * next.mult))}</p>` : ''}
            <div class="card-f"><div class="price">${own ? (next ? formatMoney(b.price * next.cost) : 'EN ÜST KADEME') : formatMoney(b.price)}</div><div class="acts"></div></div>`;
          const a = $('.acts', c);
          if (!own) a.appendChild(this.btn('Satın Al', () => this.buy(b.price, () => { s.businesses.push(b.id); s.respect += 40; s.legalRep += 15; this.notify(b.name + ' artık senin!', 'gold'); render(); }), 'gold'));
          else if (next) a.appendChild(this.btn('Geliştir', () => this.buy(Math.round(b.price * next.cost), () => { s.bizLevel[b.id] = lv + 1; s.legalRep += 10 * lv; this.notify(`${b.name}: ${next.name} kademesine yükseldi`, 'gold'); render(); }), 'gold'));
          grid.appendChild(c);
        }
      }
      if (!grid.children.length) grid.appendChild(el('p', 'hint', 'Portföyün boş. Konutlar ve İşletmeler sekmesine göz at.'));
      body.appendChild(grid);
      body.appendChild(el('p', 'hint', 'Her konut kayıt noktası, gardırop ve silah dolabı olan bir güvenli evdir ve garaj kapasiteni artırır. İşletme geliri her sabah hesabına geçer.'));
    };
    render();
    return m;
  },

  // ======================= BANKA =======================
  shop_bank(startTab = 'acc') {
    const g = this.game, s = ensureLifeState(g.state), life = this.life();
    let tab = startTab;
    const p = this.panel('LALE BANKASI', 'Bankadaki paran ölünce de, tutuklanınca da güvende.');
    const m = this.openModal(p, { cls: 'right' });
    m.kind = 'bank';
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    const move = (from, to, a) => { const x = Math.min(a, s[from]); if (x <= 0) { audio.error(); return; } s[from] -= x; s[to] += x; audio.cash(); render(); };
    const render = () => {
      body.innerHTML = '';
      body.appendChild(this.tabBar([['acc', 'Hesap', 'card'], ['sav', 'Vadeli', 'trend_up'], ['loan', 'Kredi', 'scale']], tab, (k) => { tab = k; render(); }));
      body.insertAdjacentHTML('beforeend', `<div class="grid2"><div><span>Nakit</span><b>${formatMoney(s.money)}</b></div><div><span>Vadesiz hesap</span><b>${formatMoney(s.bank)}</b></div><div><span>Vadeli hesap</span><b>${formatMoney(s.savings)}</b></div><div><span>Kredi borcu</span><b class="${s.loans.length ? 'red' : ''}">${formatMoney(s.loans.reduce((a, l) => a + l.remaining, 0))}</b></div></div>`);
      if (tab === 'acc') {
        const r1 = el('div', 'row'), r2 = el('div', 'row');
        for (const a of [1000, 10000, 100000]) r1.appendChild(this.btn(`Yatır ${formatMoney(a)}`, () => move('money', 'bank', a)));
        r1.appendChild(this.btn('Hepsini yatır', () => move('money', 'bank', s.money), 'gold'));
        for (const a of [1000, 10000, 100000]) r2.appendChild(this.btn(`Çek ${formatMoney(a)}`, () => move('bank', 'money', a)));
        r2.appendChild(this.btn('Hepsini çek', () => move('bank', 'money', s.bank)));
        body.append(el('h3', '', 'Para yatır'), r1, el('h3', '', 'Para çek'), r2, el('p', 'hint', 'Vadesiz hesap günde %1 faiz kazanır (en fazla ₺50.000).'));
      } else if (tab === 'sav') {
        const r1 = el('div', 'row'), r2 = el('div', 'row');
        for (const a of [10000, 100000, 1000000]) r1.appendChild(this.btn(`Vadeliye ${formatMoney(a)}`, () => move('bank', 'savings', a)));
        r1.appendChild(this.btn('Tümünü aktar', () => move('bank', 'savings', s.bank), 'gold'));
        r2.appendChild(this.btn('Vadeliyi boz (hesaba aktar)', () => move('savings', 'bank', s.savings)));
        body.append(el('h3', '', 'Vadeli mevduat · günlük %2'), r1, r2, el('p', 'hint', 'Vadeli hesap her sabah %2 kazanır (günde en fazla ₺80.000). Para vadesiz hesaptan aktarılır.'));
      } else {
        const lim = life.loanLimit();
        body.appendChild(el('h3', '', `Kredi limiti: ${formatMoney(lim)}`));
        const r = el('div', 'row');
        for (const a of [10000, 50000, 250000, 1000000]) { const b = this.btn(`${formatMoney(a)} çek`, () => { if (life.takeLoan(a)) render(); }); if (a > lim) b.classList.add('dim'); r.appendChild(b); }
        body.appendChild(r);
        body.appendChild(el('p', 'hint', '%12 faiz, 10 günde eşit taksit. Limit; yasal itibarın, saygınlığın, mülk ve işletmelerinle artar.'));
        for (const [i, L] of s.loans.entries()) {
          const row = el('div', 'item');
          row.innerHTML = `<div class="ii">${svgImg(L.kind === 'car' ? 'car' : 'scale', '#d4af37', 36)}</div><div class="in"><b>${L.name}</b><small>Kalan ${formatMoney(L.remaining)} · günlük ${formatMoney(L.daily)}${L.missed ? ` · <span class="red">${L.missed} gecikme</span>` : ''}</small></div><div class="ia"></div>`;
          $('.ia', row).appendChild(this.btn('Erken kapat', () => { if (life.payOffLoan(i)) render(); }, 'gold'));
          body.appendChild(row);
        }
      }
    };
    render();
    return m;
  },

  // ======================= GARAJ =======================
  openGarage() {
    const g = this.game, s = g.state;
    const p = this.panel('GARAJ', `${s.ownedCars.length}/${garageCapacity(s)} araç · Seçtiğin araç kapıya getirilir`);
    const m = this.openModal(p, { cls: 'right' });
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    if (!s.ownedCars.length) body.appendChild(el('p', 'hint', 'Garajın boş. Oto Galeri\'den araç al ya da tamircide bir aracı kaydet.'));
    s.ownedCars.forEach((c, i) => {
      const d = CARS[c.type];
      if (!d) return;
      const row = el('div', 'item');
      row.innerHTML = `<div class="ii">${svgImg('car', c.color, 44)}</div><div class="in"><b>${d.name}</b><small>${CAR_CLASS[d.style] || ''}</small></div><div class="ia"></div>`;
      $('.ia', row).appendChild(this.btn('Kapıya getir', () => { this.closeAll(); this.deliverCar(i); }, 'gold'));
      body.appendChild(row);
    });
    return m;
  },
  deliverCar(i) {
    const g = this.game, s = g.state, c = s.ownedCars[i];
    if (!c) return;
    const old = g.vehicles.list.find((v) => v.id === c.vid);
    if (old && g.player.vehicle === old) { this.notify('Zaten bu araçtasın.', 'info'); return; }
    if (old) g.vehicles.remove(old);
    if (g.player.inInterior) g.interiors.exit();
    g.spawnOwnedCar(i, true);
    this.notify(`${CARS[c.type].name} yanına getirildi`, 'good');
  },

  // ======================= ÇANTA / ENVANTER =======================
  openInventory(startTab = 'clothes') {
    const g = this.game, s = ensureLifeState(g.state), pl = g.player, life = this.life();
    let tab = startTab;
    const lr = rankIn(LEGAL_RANKS, s.legalRep), cr = rankIn(CRIME_RANKS, s.crimeRep), mr = rankOf(s.respect);
    const p = el('div', 'panel inventory');
    p.innerHTML = `<div class="panel-head"><h2>ÇANTA</h2><p>${esc(s.name)} · ${mr.name}</p><button class="x" title="Kapat (I / ESC)">✕</button></div>
      <div class="inv-ranks"><div class="legal"><span>İş hayatı</span><b>${lr.name}</b>${bar(lr.pct, 'blue')}<small>${s.legalRep} itibar</small></div><div class="crime"><span>Yeraltı</span><b>${cr.name}</b>${bar(cr.pct, 'red')}<small>${s.crimeRep} itibar</small></div><div class="money"><span>Servet</span><b>${formatMoney(s.money + s.bank + s.savings)}</b><small>nakit + banka + vadeli</small></div></div>
      <div class="panel-body"></div>`;
    const m = this.openModal(p, { cls: 'wide' });
    m.kind = 'inventory';
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    const render = () => {
      body.innerHTML = '';
      body.appendChild(this.tabBar([['clothes', 'Kıyafet', 'c_top'], ['weapons', 'Silah', 'w_pistol'], ['cars', 'Araç', 'car'], ['luxury', 'Deniz & Hava', 'v_yacht'], ['props', 'Mülk', 'app_estate'], ['goods', 'Kaçak Mal', 'pin_trade'], ['collect', 'Koleksiyon', 'trophy']], tab, (k) => { tab = k; render(); }));
      const grid = el('div', 'inv-grid');
      const tile = (icon, color, title, sub, btns = [], cls = '') => {
        const t = el('div', 'inv-tile ' + cls);
        t.innerHTML = `<div class="ti">${svgImg(icon, color, 42)}</div><b>${title}</b><small>${sub || ''}</small><div class="acts"></div>`;
        for (const b of btns) $('.acts', t).appendChild(b);
        grid.appendChild(t);
      };
      if (tab === 'clothes') {
        for (const it of CLOTHES) {
          const cols = FREE_ITEM_IDS.includes(it.id) ? [] : (s.owned[it.slot + ':' + it.id] || []);
          if (!cols.length) continue;
          const worn = wornClothing(s.look, it);
          tile(CLOTHING_CATS.find((c) => c.id === it.cat).icon, worn ? clothingColor(s.look, it) : cols[0], it.name, `${cols.length} renk${worn ? ' · üstünde' : ''}`,
            [worn ? el('small', 'own', 'GİYİLİ') : this.btn('Giy', () => { applyClothing(s.look, it, cols[0]); pl.model.setLook(s.look); render(); })], worn ? 'on' : '');
        }
        body.appendChild(this.btn(svgImg('hanger', null, 16) + ' Gardırobu aç (renk seç, aynada bak)', () => { this.closeModal(m); this.shop_wardrobe(); }, 'gold'));
      } else if (tab === 'weapons') {
        for (const id of WEAPON_ORDER) {
          const w = pl.weapons[id];
          if (!w) continue;
          const d = WEAPONS[id];
          tile('w_' + id, id === pl.weapon ? '#d4af37' : '#e8e0d0', d.name, d.type === 'melee' ? 'Yakın dövüş' : `${w.mag} / ${w.ammo} mermi`,
            [id === pl.weapon ? el('small', 'own', 'ELİNDE') : this.btn('Kuşan', () => { pl.setWeapon(id); render(); })], id === pl.weapon ? 'on' : '');
        }
      } else if (tab === 'cars') {
        s.ownedCars.forEach((c, i) => {
          const d = CARS[c.type]; if (!d) return;
          const v = g.vehicles.list.find((x) => x.id === c.vid && !x.destroyed);
          tile('car', c.color, d.name, v ? `${Math.round(Math.hypot(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z))} m uzakta` : 'Garajda', [this.btn('Yanıma getir', () => { this.closeAll(); this.deliverCar(i); }, 'gold')]);
        });
        body.appendChild(el('p', 'hint', `Garaj kapasitesi: ${s.ownedCars.length}/${garageCapacity(s)} · Yeni mülkler kapasiteyi artırır.`));
      } else if (tab === 'luxury') {
        s.luxury.forEach((e, i) => {
          const L = LUXURY_VEHICLES.find((x) => x.id === e.id); if (!L) return;
          tile(LUX_ICON[L.type], e.color, L.name, LUXURY_KINDS[L.type], [this.btn('Teslim al', () => { this.closeAll(); life.deliverLuxury(i); }, 'gold')]);
        });
        if (!s.luxury.length) body.appendChild(el('p', 'hint', 'Teknen, yatın ya da helikopterin yok. Oto Galeri › Deniz / Hava.'));
      } else if (tab === 'props') {
        for (const pr of PROPERTIES) if (s.properties.includes(pr.id)) tile(PROPERTY_KINDS[pr.kind].icon, '#d4af37', pr.name, `${PROPERTY_KINDS[pr.kind].name} · ${distName(pr.district)}`, [this.btn('Rota çiz', () => { life.properties.gps(pr.id); this.closeModal(m); })]);
        for (const b of BUSINESSES) if (s.businesses.includes(b.id)) tile('pin_estate', '#e8b060', b.name, `Günlük ${formatMoney(bizIncome(s, b))}`, []);
        if (!grid.children.length) body.appendChild(el('p', 'hint', 'Henüz mülkün yok. Emlakçı Nuri seni bekliyor.'));
      } else if (tab === 'goods') {
        for (const gd of GOODS) {
          const n = s.goods[gd.id] || 0; if (!n) continue;
          tile('pin_trade', '#7cff8a', gd.name, `${n} adet · ort. maliyet ${formatMoney((s.goodsCost[gd.id] || 0) / n)}`);
        }
        body.appendChild(el('p', 'hint', `Çanta kapasitesi ${Object.values(s.goods).reduce((a, b) => a + b, 0)}/${s.capacity}. Yakalanırsan kaçak mallara el konur!`));
      } else {
        tile('pin_tulip', '#d4af37', 'Altın Lale', `${s.tulips.length}/25 bulundu`, [], s.tulips.length >= 25 ? 'on' : '');
        tile('trophy', s.stats.cats >= 10 ? '#d4af37' : '#8a7e68', 'Kedi Dostu', `${s.stats.cats || 0}/10 kedi sevildi`);
        tile('respect', '#d4af37', 'Bölgeler', `${Object.values(s.territories).filter(Boolean).length}/5 ele geçirildi`);
        tile('trophy', s.storyIndex >= STORY_N ? '#d4af37' : '#8a7e68', 'Hikâye', `${Math.min(s.storyIndex, STORY_N)}/${STORY_N} görev`);
        for (const id of JOB_ORDER) { const js = s.jobStats[id]; if (js) tile(JOBS[id].icon, JOBS[id].path === 'legal' ? '#5ad1ff' : '#ff5a5a', JOBS[id].name, `${js.count} iş · ${formatMoney(js.earned)}`); }
      }
      if (grid.children.length) body.insertBefore(grid, body.children[1] || null);
      else if (!body.querySelector('.hint')) body.appendChild(el('p', 'hint', 'Burada henüz bir şey yok.'));
    };
    render();
    return m;
  },

  // ======================= İŞ İLANI =======================
  jobOffer(id) {
    const g = this.game, life = this.life(), C = life.career, d = JOBS[id];
    const r = C.rank(d.path);
    const p = el('div', 'panel small joboffer ' + d.path);
    const can = C.canDo(id);
    p.innerHTML = `<div class="panel-head"><h2>${svgImg(d.icon, d.path === 'legal' ? '#5ad1ff' : '#ff5a5a', 30)} ${d.name.toUpperCase()}</h2><p>${d.path === 'legal' ? 'Yasal iş' : 'Kirli iş'} · Rütben: ${r.name} (kazanç ×${C.mult(d.path).toFixed(2)})</p><button class="x">✕</button></div>
      <div class="panel-body"><p>${d.desc}</p>${can ? '' : `<p class="err">Gereken ${d.path === 'legal' ? 'yasal' : 'suç'} itibarı: ${d.need}</p>`}${C.job ? `<p class="hint">Şu anki işin (${C.job.def.name}) bitirilecek.</p>` : ''}<div class="row"></div></div>`;
    const m = this.openModal(p);
    $('.x', p).onclick = () => this.closeModal(m);
    const row = $('.row', p);
    const go = this.btn(C.job && C.job.id === id ? 'İşi Bırak' : 'İşe Başla', () => { this.closeModal(m); if (C.job && C.job.id === id) C.endJob(); else C.startJob(id); }, 'gold');
    if (!can) go.classList.add('dim');
    row.append(go, this.btn('Vazgeç', () => this.closeModal(m)));
    return m;
  },
};
