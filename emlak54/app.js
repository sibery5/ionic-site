(() => {
  'use strict';
  const all = Array.isArray(window.EMLAK54_PROPERTIES) ? window.EMLAK54_PROPERTIES : [];
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const money = n => new Intl.NumberFormat('tr-TR',{maximumFractionDigits:0}).format(n) + ' ₺';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const iconSvg = (name, size=16) => {
    const paths = {
      pin:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
      bed:'<path d="M3 18V5M3 14h18v7M21 18v3M3 10h18v4M7 10V7h4a3 3 0 0 1 3 3"/>',
      area:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h10v10H7zM7 12h10M12 7v10"/>',
      heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
      arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
      calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
      search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
    };
    return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.arrow}</svg>`;
  };
  const grid = $('#propertyGrid');
  const loadMore = $('#loadMore');
  const moreNote = $('#loadMoreNote');
  const resultNote = $('#listingResultNote');
  const sortSelect = $('#sortSelect');
  const filterLocation = $('#filterLocation');
  const filterType = $('#filterType');
  const minPrice = $('#filterMinPrice');
  const maxPrice = $('#filterMaxPrice');
  const extraFilters = $('#extraFilters');
  const PAGE = 30;
  let activeCategory = 'Tümü';
  let visibleCount = PAGE;
  let favorites = new Set();
  try { favorites = new Set(JSON.parse(localStorage.getItem('emlak54-favorites') || '[]').map(Number)); } catch(_) {}
  const saveFavorites = () => { try { localStorage.setItem('emlak54-favorites', JSON.stringify([...favorites])); } catch(_) {} };

  const normalize = s => String(s||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ı/g,'i');
  const parseTrPrice = v => { const d = String(v ?? '').replace(/[^0-9]/g,''); return d === '' ? null : Number(d); };
  // Eski kayıtlarda oda sayısı yalnızca rakam ("5"): "5+3" gibi yanıltıcı birleştirme yerine "5 oda".
  const roomsLabel = rooms => { const r = String(rooms ?? '').trim(); if (!r || r === '0') return ''; return r.includes('+') ? r : `${r} oda`; };

  function matchesCategory(p, cat) {
    if (!cat || cat === 'Tümü') return true;
    if (cat === 'Satılık' || cat === 'Kiralık') return p.deal === cat;
    if (cat === 'Daire') return p.kind === 'Daire';
    return p.category === cat;
  }
  function filtersActive() {
    return activeCategory !== 'Tümü' || !!(filterLocation?.value.trim()) || (filterType && filterType.value !== 'Tümü') || !!(minPrice?.value) || !!(maxPrice?.value);
  }
  function filterProperties() {
    const q = normalize(filterLocation?.value || '');
    const tokens = q.split(/\s+/).filter(Boolean);
    const type = filterType?.value || 'Tümü';
    let min = parseTrPrice(minPrice?.value);
    let max = parseTrPrice(maxPrice?.value);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    const out = all.filter(p => {
      if (tokens.length) {
        const text = normalize([p.title,p.district,p.neighborhood,p.city,p.category,p.kind,p.deal,p.description].join(' '));
        if (!tokens.every(token => text.includes(token))) return false;
      }
      if (!matchesCategory(p, activeCategory)) return false;
      if (type !== 'Tümü' && !(p.kind === type || p.category === type)) return false;
      if (min !== null && p.price < min) return false;
      if (max !== null && p.price > max) return false;
      return true;
    });
    const sort = sortSelect?.value || 'featured';
    // "Öne çıkanlar": sunucunun sırası (öne çıkarılanlar önce, sonra en yeni) korunur.
    if (sort === 'price-asc') out.sort((a,b)=>a.price-b.price);
    else if (sort === 'price-desc') out.sort((a,b)=>b.price-a.price);
    else if (sort === 'area-desc') out.sort((a,b)=>(b.area||0)-(a.area||0));
    else if (sort === 'newest') out.sort((a,b)=>(b.created||0)-(a.created||0) || b.id-a.id);
    return out;
  }
  const imgFallback = "this.onerror=null;this.removeAttribute('srcset');this.src='assets/logo.svg'";
  function cardParts(p) {
    const title = p.title || 'Gayrimenkul ilanı';
    const slug = /^[a-z0-9-]{1,190}$/.test(String(p.slug||'')) ? String(p.slug) : '';
    const place = [p.district,p.city].filter(Boolean).join(', ');
    const deal = p.deal || 'İlan';
    const badge = p.badge ? `<span class="badge${p.badge==='Öne Çıkan'?' highlight':''}">${esc(p.badge)}</span>` : '';
    const rooms = roomsLabel(p.rooms);
    const isSaved = favorites.has(Number(p.id));
    return {
      title, href: `ilan/${esc(slug)}/`, place, deal, badge, isSaved,
      img: (Array.isArray(p.images) && p.images[0]) ? String(p.images[0]) : 'assets/logo.svg',
      alt: esc(`${title} — ${place || 'Sakarya'} ilan fotoğrafı`),
      dealBadge: `<span class="badge deal${deal==='Kiralık'?' rent':''}">${esc(deal)}</span>`,
      fav: `<button class="favorite-btn${isSaved?' is-saved':''}" type="button" data-favorite="${Number(p.id)||0}" aria-label="${isSaved?'Kaydedilenlerden çıkar':'İlanı kaydet'}: ${esc(title)}" aria-pressed="${isSaved}">${iconSvg('heart',18)}</button>`,
      specs: `<div class="card-specs"><span class="spec">${iconSvg('area',15)} ${Number(p.area||0)} m²</span>${rooms ? `<span class="spec">${iconSvg('bed',15)} ${esc(rooms)}</span>` : ''}<span class="spec">${iconSvg('calendar',15)} ${Number(p.year||0)||'—'}</span></div>`,
      price: `${money(Number(p.price)||0)}${deal==='Kiralık'?'<small> / ay</small>':''}`,
    };
  }
  // Sunucudaki property_card_html() ile aynı işaretleme (SEO için ilk görünüm sunucuda üretilir).
  function card(p) {
    const c = cardParts(p);
    const img = esc(c.img);
    return `<article class="property-card" data-property-id="${Number(p.id)||0}"><div class="card-image-wrap"><a class="card-media" href="${c.href}" aria-label="${esc(c.title)} ilan detayını aç" tabindex="-1"><img class="card-image" src="${img}" srcset="${esc(c.img.replace('w=1200','w=500'))} 500w, ${esc(c.img.replace('w=1200','w=900'))} 900w, ${img} 1200w" sizes="(max-width:760px) 92vw, (max-width:1050px) 45vw, 31vw" alt="${c.alt}" width="1200" height="800" loading="lazy" decoding="async" onerror="${imgFallback}"></a><span class="image-shade"></span><div class="card-badges">${c.dealBadge}${c.badge}</div>${c.fav}<span class="card-location">${iconSvg('pin',14)} ${esc(c.place || p.neighborhood || 'Sakarya')}</span></div><div class="card-content"><h3 class="card-title"><a href="${c.href}">${esc(c.title)}</a></h3><div class="card-subtitle">${esc(p.kind||'')} · ${esc(p.category||'')}</div>${c.specs}<div class="card-bottom"><div class="price">${c.price}</div><a class="card-link" href="${c.href}" aria-label="${esc(c.title)} detayları">${iconSvg('arrow',18)}</a></div></div></article>`;
  }
  function listCard(p) {
    const c = cardParts(p);
    return `<article class="property-card list-card" data-property-id="${Number(p.id)||0}"><div class="list-media"><a href="${c.href}" aria-label="${esc(c.title)} ilan detayını aç" tabindex="-1"><img class="card-image" src="${esc(c.img)}" onerror="${imgFallback}" alt="${c.alt}" width="640" height="420" loading="lazy" decoding="async"></a><div class="card-badges">${c.dealBadge}${c.badge}</div>${c.fav}</div><div class="list-main"><h3 class="card-title"><a href="${c.href}">${esc(c.title)}</a></h3><div class="card-subtitle">${esc(p.kind||'')} · ${esc(p.category||'')}</div><div class="list-loc">${iconSvg('pin',14)} ${esc([p.neighborhood,c.place].filter(Boolean).join(', ') || 'Sakarya')}</div>${c.specs}</div><div class="list-side"><div class="price">${c.price}</div><a class="btn btn-primary btn-sm" href="${c.href}">İncele ${iconSvg('arrow',15)}</a></div></article>`;
  }

  let viewMode = 'grid';
  try { const sv = localStorage.getItem('emlak54-view'); if (sv === 'list' || sv === 'grid') viewMode = sv; } catch (_) {}
  function syncViewButtons() {
    $$('#viewToggle [data-viewmode]').forEach(b => { const on = b.dataset.viewmode === viewMode; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
  }
  function initViewToggle() {
    const bar = $('#ilanlar .toolbar-right');
    if (!bar || $('#viewToggle')) { syncViewButtons(); return; }
    const vt = document.createElement('div');
    vt.className = 'view-toggle'; vt.id = 'viewToggle'; vt.setAttribute('role', 'group'); vt.setAttribute('aria-label', 'Görünüm');
    vt.innerHTML = `<button type="button" data-viewmode="grid" aria-label="Kart görünümü" title="Kart görünümü"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></button><button type="button" data-viewmode="list" aria-label="Liste görünümü" title="Liste görünümü"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg></button>`;
    bar.prepend(vt);
    vt.addEventListener('click', e => {
      const b = e.target.closest('[data-viewmode]');
      if (!b) return;
      viewMode = b.dataset.viewmode === 'list' ? 'list' : 'grid';
      try { localStorage.setItem('emlak54-view', viewMode); } catch (_) {}
      syncViewButtons(); render(true);
    });
    syncViewButtons();
  }

  function render(animate = false) {
    if (!grid) return;
    const filtered = filterProperties();
    const display = filtered.slice(0, visibleCount);
    grid.classList.toggle('is-list', viewMode === 'list');
    grid.innerHTML = display.length ? display.map(viewMode === 'list' ? listCard : card).join('') : `<div class="empty-state"><span class="empty-icon">${iconSvg('search',25)}</span><h3>Aramana uygun ilan bulamadık.</h3><p>Fiyat aralığını değiştirebilir, farklı bir konum arayabilir veya filtreleri temizleyebilirsin.</p><button type="button" class="btn btn-outline" data-clear-filters>Filtreleri temizle</button></div>`;
    if (animate && !reduceMotion) {
      $$('.property-card', grid).forEach((c, i) => c.style.setProperty('--i', String(Math.min(i, 11))));
      grid.classList.remove('is-refreshing'); void grid.offsetWidth; grid.classList.add('is-refreshing');
      window.clearTimeout(render.t); render.t = window.setTimeout(() => grid.classList.remove('is-refreshing'), 1200);
    }
    if (loadMore) loadMore.hidden = display.length >= filtered.length || filtered.length === 0;
    if (moreNote) moreNote.textContent = filtered.length ? 'Beğendiğin ilanı açıp detayını inceleyebilirsin.' : 'Filtreleri değiştirerek ilanları yeniden listeleyebilirsin.';
    if (resultNote) resultNote.innerHTML = filtersActive() && filtered.length ? `Filtrelere uyan <strong>${filtered.length}</strong> ilan listeleniyor.` : '';
  }
  // İlk açılışta sunucunun ürettiği kartlar korunur (yeniden çizim/titreme olmaz); yalnızca favoriler işlenir.
  function hydrate() {
    $$('[data-favorite]', grid).forEach(btn => {
      const saved = favorites.has(Number(btn.dataset.favorite));
      btn.classList.toggle('is-saved', saved);
      btn.setAttribute('aria-pressed', String(saved));
      if (saved) btn.setAttribute('aria-label', btn.getAttribute('aria-label').replace('İlanı kaydet', 'Kaydedilenlerden çıkar'));
    });
    const filtered = filterProperties();
    if (loadMore) loadMore.hidden = filtered.length <= visibleCount;
  }
  grid?.addEventListener('click', e => {
    const fav = e.target.closest('[data-favorite]');
    if (fav) {
      e.preventDefault(); e.stopPropagation();
      const id = Number(fav.dataset.favorite);
      const saved = !favorites.has(id);
      if (saved) favorites.add(id); else favorites.delete(id);
      saveFavorites();
      fav.classList.toggle('is-saved', saved);
      fav.setAttribute('aria-pressed', String(saved));
      const label = fav.getAttribute('aria-label') || '';
      fav.setAttribute('aria-label', label.replace(/^(İlanı kaydet|Kaydedilenlerden çıkar)/, saved ? 'Kaydedilenlerden çıkar' : 'İlanı kaydet'));
      fav.classList.remove('pop'); void fav.offsetWidth; fav.classList.add('pop');
      return;
    }
    if (e.target.closest('[data-clear-filters]')) clearFilters();
  });

  function setCategory(cat, animate = true) {
    activeCategory = cat;
    visibleCount = PAGE;
    $$('#listingTabs [data-category]').forEach(btn => { const on = btn.dataset.category === cat; btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', String(on)); });
    $$('.category-tile[data-category]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.category === cat && cat !== 'Tümü'));
    render(animate);
  }
  function clearFilters() {
    if (filterLocation) filterLocation.value = '';
    if (filterType) filterType.value = 'Tümü';
    if (minPrice) minPrice.value = '';
    if (maxPrice) maxPrice.value = '';
    setCategory('Tümü');
  }
  const scrollToListings = () => document.getElementById('ilanlar')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  $$('[data-category]').forEach(btn => btn.addEventListener('click', () => {
    const cat = btn.dataset.category;
    if (!cat) return;
    setCategory(cat);
    if (btn.classList.contains('category-tile')) scrollToListings();
  }));
  sortSelect?.addEventListener('change', () => { visibleCount = PAGE; render(true); });

  const formatTrPriceInput = el => {
    if (!el) return;
    el.addEventListener('input', () => {
      const d = el.value.replace(/[^0-9]/g, '').slice(0, 12);
      const f = d ? new Intl.NumberFormat('tr-TR').format(Number(d)) : '';
      if (el.value !== f) el.value = f;
    });
  };
  formatTrPriceInput(minPrice);
  formatTrPriceInput(maxPrice);
  let typingTimer = 0;
  filterLocation?.addEventListener('input', () => { window.clearTimeout(typingTimer); typingTimer = window.setTimeout(() => { visibleCount = PAGE; render(); }, 160); });
  [filterType, minPrice, maxPrice].filter(Boolean).forEach(el => el.addEventListener('change', () => { visibleCount = PAGE; render(true); }));
  $('#clearFilters')?.addEventListener('click', clearFilters);
  loadMore?.addEventListener('click', () => {
    const oldCount = visibleCount;
    visibleCount += PAGE;
    render();
    const next = grid?.querySelectorAll('.property-card')[oldCount];
    next?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });
  $('#filterToggle')?.addEventListener('click', () => {
    const btn = $('#filterToggle');
    const isOpen = !extraFilters.hidden;
    extraFilters.hidden = isOpen;
    btn.setAttribute('aria-expanded', String(!isOpen));
  });

  // Footer kısayolları: ana sayfadaysa filtreyi hemen uygula, değilse ana sayfada uygulanmak üzere sakla.
  $$('.footer-links [data-footer-filter]').forEach(a => a.addEventListener('click', () => {
    try { sessionStorage.setItem('emlak54-pending-filter', a.dataset.footerFilter); } catch (_) {}
    if (grid) window.setTimeout(() => setCategory(a.dataset.footerFilter), 40);
  }));

  // URL parametreleri: ?konum=Serdivan / ?kategori=Kiralık (ilçe bağlantıları bunları kullanır).
  let initialFilter = false;
  if (grid) {
    const params = new URLSearchParams(location.search);
    const konum = (params.get('konum') || params.get('q') || '').trim().slice(0, 120);
    if (konum && filterLocation) { filterLocation.value = konum; initialFilter = true; }
    const kategori = (params.get('kategori') || '').trim();
    let pending = '';
    try { pending = sessionStorage.getItem('emlak54-pending-filter') || ''; sessionStorage.removeItem('emlak54-pending-filter'); } catch (_) {}
    const cat = ['Satılık','Kiralık','Konut','Daire','Arsa','İş yeri'].includes(kategori) ? kategori : (['Satılık','Kiralık','Konut','Daire','Arsa','İş yeri'].includes(pending) ? pending : '');
    if (cat) { activeCategory = cat; initialFilter = true; }
    if (initialFilter && extraFilters && window.matchMedia('(max-width: 760px)').matches && konum) { extraFilters.hidden = false; $('#filterToggle')?.setAttribute('aria-expanded', 'true'); }
  }

  initViewToggle();
  if (grid) {
    if (initialFilter) setCategory(activeCategory, false);
    else if (viewMode === 'grid' && grid.dataset.ssr === '1' && grid.querySelector('.property-card')) hydrate();
    else render();
  }
})();
