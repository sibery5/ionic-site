(() => {
'use strict';
const p = window.EMLAK54_CURRENT_LISTING; if (!p) return;
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const gallery = $('#propertyGallery'), lightbox = $('#lightbox'), lbImg = $('#lightboxImage'), counter = $('#lightboxCounter');
const imgs = Array.isArray(p.images) ? p.images : [];
let current = 0, touchX = null, sliderTouchX = null, lastFocus = null;

/* WhatsApp mesajı: ilan bilgileriyle hazır gelir (ajan kartı + mobil alt çubuk). */
const formatListingPrice = value => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(value)||0);
const waPhone = String(window.EMLAK54_CONFIG?.whatsappPhone || '').replace(/\D/g,'');
const listingUrl = p.url || location.href.split(/[?#]/)[0];
const isRent = String(p.deal||'').toLocaleLowerCase('tr-TR') === 'kiralık';
const message = [
  'Merhaba, bu ilan hakkında bilgi alabilir miyim?',
  '',
  `🏡 İlan: ${p.title || 'Emlak ilanı'} (No: ${p.id})`,
  `🏷️ İlan türü: ${[p.deal, p.kind || p.category].filter(Boolean).join(' ')}`,
  `💰 Fiyat: ${formatListingPrice(p.price)}${isRent ? ' / ay' : ''}`,
  `📍 Konum: ${[p.neighborhood, p.district, p.city || 'Sakarya'].filter(Boolean).join(', ')}`,
  p.area ? `📐 Alan: ${p.area} m²` : null,
  Array.isArray(p.features) && p.features.length ? `✨ Öne çıkanlar: ${p.features.slice(0,4).join(', ')}` : null,
  '',
  `🔗 ${listingUrl}`
].filter(line => line !== null).join('\n');
$$('[data-listing-wa]').forEach(a => {
  if (waPhone.length >= 10) a.href = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
  a.target = '_blank'; a.rel = 'noopener noreferrer';
});

/* Galeri */
function swapImage(img, src, alt) {
  if (!img) return;
  if (reduce || img.getAttribute('src') === src) { img.src = src; img.alt = alt; return; }
  img.classList.add('is-fading');
  const pre = new Image();
  const done = () => { img.src = src; img.alt = alt; requestAnimationFrame(() => img.classList.remove('is-fading')); };
  pre.onload = done; pre.onerror = done; pre.src = src;
}
function update(i) {
  if (!imgs.length) return;
  current = (i + imgs.length) % imgs.length;
  const alt = `${p.title} — fotoğraf ${current+1}`;
  if (lightbox?.classList.contains('is-open')) swapImage(lbImg, imgs[current], alt); else if (lbImg) { lbImg.src = imgs[current]; lbImg.alt = alt; }
  if (counter) counter.textContent = `${current+1} / ${imgs.length}`;
  swapImage(gallery?.querySelector('.gallery-main img'), imgs[current], alt);
  const stageCounter = gallery?.querySelector('.gallery-counter');
  if (stageCounter) stageCounter.textContent = `${current+1} / ${imgs.length}`;
  $$('.gallery-thumbnail').forEach((b, n) => b.setAttribute('aria-current', String(n === current)));
}
function syncSlider(i) {
  update(i);
  $$('.gallery-thumbnail')[current]?.scrollIntoView({ block:'nearest', inline:'nearest', behavior: reduce ? 'auto' : 'smooth' });
}
function openAt(i) {
  lastFocus = document.activeElement;
  update(i);
  lightbox?.classList.add('is-open');
  lightbox?.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
  $('#lightboxClose')?.focus();
}
function close() {
  lightbox?.classList.remove('is-open');
  lightbox?.setAttribute('aria-hidden','true');
  document.body.style.overflow = '';
  (lastFocus || gallery?.querySelector('.gallery-open'))?.focus?.();
}
gallery?.querySelector('.gallery-prev')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); syncSlider(current-1); });
gallery?.querySelector('.gallery-next')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); syncSlider(current+1); });
gallery?.querySelectorAll('.gallery-thumbnail').forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); syncSlider(Number(b.dataset.galleryIndex)); }));
const stage = gallery?.querySelector('.gallery-main');
stage?.querySelector('.gallery-open')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openAt(current); });
stage?.addEventListener('touchstart', e => { sliderTouchX = e.changedTouches[0]?.clientX ?? null; }, { passive:true });
stage?.addEventListener('touchend', e => { if (sliderTouchX === null) return; const dx = (e.changedTouches[0]?.clientX ?? sliderTouchX) - sliderTouchX; if (Math.abs(dx) > 42 && imgs.length > 1) syncSlider(current + (dx < 0 ? 1 : -1)); sliderTouchX = null; }, { passive:true });
$('#lightboxClose')?.addEventListener('click', close);
$('#lightboxPrev')?.addEventListener('click', () => update(current-1));
$('#lightboxNext')?.addEventListener('click', () => update(current+1));
lightbox?.addEventListener('click', e => { if (e.target === lightbox || e.target.classList.contains('lightbox-image-wrap')) close(); });
lightbox?.addEventListener('touchstart', e => { touchX = e.changedTouches[0]?.clientX ?? null; }, { passive:true });
lightbox?.addEventListener('touchend', e => { if (touchX === null) return; const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX; if (Math.abs(dx) > 42 && imgs.length > 1) update(current + (dx < 0 ? 1 : -1)); touchX = null; }, { passive:true });
document.addEventListener('keydown', e => {
  const open = lightbox?.classList.contains('is-open');
  if (open) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft') update(current-1);
    else if (e.key === 'ArrowRight') update(current+1);
    else if (e.key === 'Tab') { // odak galeri içinde kalsın
      const items = [...lightbox.querySelectorAll('button')];
      const first = items[0], last = items[items.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    return;
  }
  if (document.activeElement === stage?.querySelector('.gallery-open')) {
    if (e.key === 'ArrowLeft') syncSlider(current-1);
    if (e.key === 'ArrowRight') syncSlider(current+1);
  }
});
// Sonraki fotoğrafı önceden yükle: kaydırmalar beklemesiz olsun.
if (imgs.length > 1) window.addEventListener('load', () => { const pre = new Image(); pre.src = imgs[1]; }, { once:true });

/* Kaydet (favori) — kayıtlı durum sayfa açılışında da görünür */
const saveBtn = $('#saveListing');
const readFavs = () => { try { return JSON.parse(localStorage.getItem('emlak54-favorites') || '[]').map(Number); } catch (_) { return []; } };
function paintSave(on) {
  if (!saveBtn) return;
  saveBtn.setAttribute('aria-pressed', String(on));
  saveBtn.classList.toggle('is-saved', on);
  const label = saveBtn.querySelector('span');
  if (label) label.textContent = on ? 'Kaydedildi' : 'Kaydet';
  const svg = saveBtn.querySelector('svg');
  if (svg) svg.style.fill = on ? 'currentColor' : 'none';
}
paintSave(readFavs().includes(Number(p.id)));
saveBtn?.addEventListener('click', () => {
  let ids = readFavs();
  const on = !ids.includes(Number(p.id));
  ids = on ? [...ids, Number(p.id)] : ids.filter(x => x !== Number(p.id));
  try { localStorage.setItem('emlak54-favorites', JSON.stringify(ids)); } catch (_) {}
  paintSave(on);
});

/* Paylaş */
$('#shareListing')?.addEventListener('click', async () => {
  const btn = $('#shareListing'); const label = btn?.querySelector('span');
  const data = { title: p.title, text: `${p.title} — ${formatListingPrice(p.price)}`, url: listingUrl };
  try {
    if (navigator.share) await navigator.share(data);
    else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(listingUrl);
      if (label) { label.textContent = 'Bağlantı kopyalandı'; setTimeout(() => { label.textContent = 'Paylaş'; }, 1800); }
    } else window.prompt('İlan bağlantısını kopyalayın', listingUrl);
  } catch (e) { if (e?.name !== 'AbortError') window.prompt('İlan bağlantısı', listingUrl); }
});

/* Harita: yalnızca kullanıcı isteyince Google Haritalar yüklenir (hız + gizlilik). */
const mapBox = $('.map-lazy');
mapBox?.querySelector('.map-load')?.addEventListener('click', () => {
  const src = mapBox.dataset.mapSrc; if (!src) return;
  const frame = document.createElement('iframe');
  frame.src = src; frame.title = `${p.title} konum haritası`; frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer-when-downgrade'; frame.allowFullscreen = true;
  mapBox.appendChild(frame); mapBox.classList.add('is-loaded');
});

/* Mobil alt iletişim çubuğu: ilan danışmanı kartı ekrandayken gizlenir (çift buton görünmesin). */
const ctaBar = $('#detailCtaBar');
const agent = $('.agent-card');
if (ctaBar && agent && 'IntersectionObserver' in window) {
  new IntersectionObserver(entries => entries.forEach(en => ctaBar.classList.toggle('is-hidden', en.isIntersecting)), { threshold: 0.25 }).observe(agent);
}
})();
