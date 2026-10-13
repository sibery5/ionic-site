/* Emlak 54 — tüm sayfalarda ortak: sayfa geçişleri, üst ilerleme çubuğu, header, mobil menü, yukarı çık. */
(() => {
'use strict';
const doc = document.documentElement;
const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
// Çapraz sayfa View Transitions destekleniyorsa animasyonu tarayıcı yapar (CSS @view-transition).
const nativeVT = 'onpagereveal' in window;
const progress = document.getElementById('pageProgress');
if (!reduce && !nativeVT) doc.classList.add('pt-fallback');

function startProgress() {
  if (!progress) return;
  progress.classList.remove('is-done', 'is-active');
  void progress.offsetWidth;
  progress.classList.add('is-active');
}
function resetProgress() { progress?.classList.remove('is-active', 'is-done'); }

function pageLinkTarget(a, event) {
  if (!a || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (a.hasAttribute('download') || (a.target && a.target !== '_self')) return null;
  const raw = a.getAttribute('href') || '';
  if (!raw || raw.startsWith('#') || /^(tel:|mailto:|sms:|javascript:|data:)/i.test(raw)) return null;
  let url;
  try { url = new URL(a.href, location.href); } catch (_) { return null; }
  if (url.origin !== location.origin) return null;
  if (/\.(xml|txt|json|pdf|zip|webp|jpe?g|png|svg|gif|avif)$/i.test(url.pathname)) return null;
  if (/(emlak-admin|admin-api|install|search|site-config)\.php$/i.test(url.pathname)) return null;
  if (url.pathname === location.pathname && url.search === location.search) return null; // aynı sayfa / çapa
  return url;
}

document.addEventListener('click', event => {
  const a = event.target.closest ? event.target.closest('a[href]') : null;
  const url = pageLinkTarget(a, event);
  if (!url) return;
  startProgress();
  if (reduce || nativeVT) return; // normal gezinme; geçişi tarayıcı çizer
  event.preventDefault();
  doc.classList.add('pt-leaving');
  window.setTimeout(() => { location.href = url.href; }, 170);
  // Gezinme gerçekleşmezse (indirme, iptal vb.) içerik görünür hâle geri dönsün.
  window.setTimeout(() => { doc.classList.remove('pt-leaving'); resetProgress(); }, 6000);
});
// Geri/ileri ile önbellekten (bfcache) dönülünce sayfa görünmez kalmasın.
window.addEventListener('pageshow', () => { doc.classList.remove('pt-leaving'); resetProgress(); });

/* Header: kaydırınca kompakt + gölge */
const header = document.getElementById('siteHeader');
let ticking = false;
let toTop = null;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const y = window.scrollY || doc.scrollTop || 0;
    header?.classList.toggle('is-scrolled', y > 8);
    if (toTop) { toTop.hidden = y < 600; toTop.classList.toggle('is-visible', y >= 600); }
  });
}

/* Mobil menü (tüm sayfalarda tek yerden) */
const toggle = document.getElementById('menuToggle');
const drawer = document.getElementById('mobileDrawer');
const backdrop = document.getElementById('menuBackdrop');
const closeBtn = document.getElementById('drawerClose');
function setMenu(open) {
  if (!drawer) return;
  drawer.classList.toggle('is-open', open);
  backdrop?.classList.toggle('is-open', open);
  drawer.setAttribute('aria-hidden', String(!open));
  backdrop?.setAttribute('aria-hidden', String(!open));
  toggle?.setAttribute('aria-expanded', String(open));
  toggle?.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
  document.body.classList.toggle('menu-open', open);
  if (open) closeBtn?.focus(); else if (document.activeElement && drawer.contains(document.activeElement)) toggle?.focus();
}
toggle?.addEventListener('click', () => setMenu(!drawer?.classList.contains('is-open')));
closeBtn?.addEventListener('click', () => setMenu(false));
backdrop?.addEventListener('click', () => setMenu(false));
drawer?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && drawer?.classList.contains('is-open')) setMenu(false);
  // Menü açıkken odak çekmece içinde kalsın.
  if (e.key === 'Tab' && drawer?.classList.contains('is-open')) {
    const items = [...drawer.querySelectorAll('a[href],button:not([disabled])')];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
window.matchMedia && window.matchMedia('(min-width: 761px)').addEventListener?.('change', ev => { if (ev.matches) setMenu(false); });

/* Yukarı çık */
if (!document.getElementById('toTopBtn')) {
  toTop = document.createElement('button');
  toTop.id = 'toTopBtn';
  toTop.type = 'button';
  toTop.setAttribute('aria-label', 'Yukarı çık');
  toTop.title = 'Yukarı çık';
  toTop.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
  toTop.hidden = true;
  document.body.appendChild(toTop);
  toTop.addEventListener('click', () => {
    try { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

const year = document.getElementById('currentYear');
if (year) year.textContent = String(new Date().getFullYear());
})();
