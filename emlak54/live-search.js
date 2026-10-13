(() => {
'use strict';
const normalise = value => String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^\p{L}\p{N}+\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const money = value => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(value || 0)) + ' ₺';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 4.5 4.5"></path></svg>';
function localSearch(query, limit) {
  const all = Array.isArray(window.EMLAK54_PROPERTIES) ? window.EMLAK54_PROPERTIES : [];
  const words = normalise(query).split(' ').filter(Boolean);
  return all.map(p => {
    const text = normalise([p.title,p.deal,p.category,p.kind,p.district,p.neighborhood,p.city,p.description,(p.features||[]).join(' '),`${p.rooms||''}+${p.baths||''}`,p.area,p.year].join(' '));
    if (!words.every(word => text.includes(word))) return null;
    const title = normalise(p.title);
    const score = (title.startsWith(normalise(query)) ? 8 : title.includes(normalise(query)) ? 5 : 0) + (normalise(p.district) === normalise(query) ? 4 : 0) + (p.isNew ? 1 : 0);
    const prefix = document.querySelector('[data-live-search]')?.dataset.urlPrefix ?? '';
    return { id:p.id, slug:p.slug, title:p.title, price:p.price, deal:p.deal, category:p.category, kind:p.kind, area:p.area, rooms:p.rooms ? `${p.rooms}+${p.baths||0}` : '', location:[p.neighborhood,p.district,p.city].filter(Boolean).join(', '), description:p.description||'', image:(p.images||[])[0]||'', href:`${prefix}ilan/${p.slug}/`, priceNote:p.deal==='Kiralık'?'/ ay':'' ,_score:score };
  }).filter(Boolean).sort((a,b)=>b._score-a._score).slice(0,limit);
}
function make(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; }
function resultCard(item) {
  const a = make('a','live-result-card'); a.href = item.href || '#'; a.setAttribute('role','option');
  const imageWrap = make('span','live-result-image-wrap');
  const img = document.createElement('img'); img.src = item.image || ''; img.alt = item.title ? (item.title + ' ilan fotoğrafı') : ''; img.loading='lazy'; img.decoding='async';
  img.addEventListener('error',()=>{img.style.display='none'; imageWrap.classList.add('is-image-missing'); imageWrap.insertAdjacentHTML('beforeend', icon);},{once:true});
  imageWrap.append(img);
  const content = make('span','live-result-content');
  const meta = make('span','live-result-meta');
  meta.append(make('span',`live-result-badge ${item.deal==='Kiralık'?'is-rent':''}`,item.deal||'İlan'), make('span','live-result-location',item.location||item.category||''));
  const title = make('strong','live-result-title',item.title||'İlan');
  const desc = make('span','live-result-description',item.description||'Detayları görüntüleyin.');
  const specs = make('span','live-result-specs',[item.kind,item.area ? `${item.area} m²` : '',item.rooms ? `${item.rooms} oda/banyo` : ''].filter(Boolean).join(' · '));
  content.append(meta,title,desc,specs);
  const right = make('span','live-result-right');
  right.append(make('strong','live-result-price',money(item.price)));
  if(item.priceNote)right.append(make('small','live-result-price-note',item.priceNote));
  right.append(make('span','live-result-arrow')); right.lastChild.innerHTML='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  a.append(imageWrap,content,right); return a;
}
function init(widget) {
  const input = widget.querySelector('.live-search-input');
  const form = widget.querySelector('.live-search-form');
  const results = widget.querySelector('.live-search-results');
  const status = widget.querySelector('.live-search-status');
  if(!input || !form || !results) return;
  const endpoint = widget.dataset.endpoint || 'search.php';
  const limit = Math.max(1, Math.min(8, Number(widget.dataset.searchLimit || 5)));
  const prefix = widget.dataset.urlPrefix || '';
  let timer = 0, controller = null, latest = 0, blurTimer = 0;
  function close() { results.hidden = true; input.setAttribute('aria-expanded','false'); widget.classList.remove('has-results'); }
  function showStatus(text) { if(!status) return; status.textContent = text; status.hidden = !text; }
  function render(items, query, total) {
    results.replaceChildren();
    if(!items.length){close();showStatus(`“${query}” için eşleşen ilan bulunamadı.`);return;}
    items.forEach(item => {
      if(!item.href) item.href = `${prefix}ilan/${item.slug}/`;
      results.append(resultCard(item));
    });
    showStatus(`${total ?? items.length} ilan bulundu · İlk ${Math.min(items.length,total ?? items.length)} sonuç gösteriliyor`);
    results.hidden=false;input.setAttribute('aria-expanded','true');widget.classList.add('has-results');
  }
  async function search(query, requestId) {
    if(query.length<2){close();showStatus('İlan adı, konum veya özellik yazmaya başlayın.');return;}
    showStatus('İlanlar aranıyor…'); results.hidden=false;results.replaceChildren();results.append(make('div','live-search-loading', 'Eşleşen ilanlar aranıyor'));widget.classList.add('is-searching');
    if(controller)controller.abort();controller=new AbortController();
    try {
      const url = new URL(endpoint, location.href); url.searchParams.set('q',query);url.searchParams.set('limit',String(limit));
      const response = await fetch(url.toString(),{headers:{'Accept':'application/json','X-Requested-With':'XMLHttpRequest'},signal:controller.signal,cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw new Error('AJAX endpoint not available');
      const payload=await response.json(); if(requestId!==latest)return;
      if(!payload || payload.ok!==true || !Array.isArray(payload.results))throw new Error('Invalid search response');
      render(payload.results,query,payload.count);
    } catch(error) {
      if(error?.name==='AbortError'||requestId!==latest)return;
      const fallback=localSearch(query,limit);
      render(fallback,query,fallback.length);
      if(!fallback.length)showStatus(`“${query}” için eşleşen ilan bulunamadı.`);
    } finally { if(requestId===latest)widget.classList.remove('is-searching'); }
  }
  input.addEventListener('input',()=>{
    window.clearTimeout(timer);const query=input.value.trim();const requestId=++latest;
    if(query.length<2){close();showStatus('En az 2 karakter yazın.');return;}
    timer=window.setTimeout(()=>search(query,requestId),170);
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();window.clearTimeout(timer);const query=input.value.trim();const requestId=++latest;
    if(query.length<2){input.focus();showStatus('Arama için en az 2 karakter yazın.');return;}
    search(query,requestId);
    const mainListing = document.querySelector('#ilanlar');
    if(mainListing && widget.closest('#ilanlar')===null && document.body.classList.contains('detail-page')) {
      // Keep the user on the current page while suggestions appear; cards navigate to separate detail pages.
    }
  });
  input.addEventListener('focus',()=>{if(input.value.trim().length>=2&&!results.hidden)widget.classList.add('has-results');});
  widget.addEventListener('focusout',event=>{window.clearTimeout(blurTimer);if(widget.contains(event.relatedTarget))return;blurTimer=window.setTimeout(close,180);});
  document.addEventListener('click',event=>{if(!widget.contains(event.target))close();});
  input.addEventListener('keydown',event=>{
    const cards=[...results.querySelectorAll('.live-result-card')];
    if(event.key==='Escape'){close();input.blur();}
    if(event.key==='ArrowDown'&&cards.length){event.preventDefault();cards[0].focus();}
  });
  results.addEventListener('keydown',event=>{const cards=[...results.querySelectorAll('.live-result-card')];const i=cards.indexOf(document.activeElement);if(event.key==='ArrowDown'&&cards[i+1]){event.preventDefault();cards[i+1].focus();}else if(event.key==='ArrowUp'){event.preventDefault();if(i>0)cards[i-1].focus();else input.focus();}});
}
document.querySelectorAll('[data-live-search]').forEach(init);
})();
