// Büyük harita (M) ve mini harita taban görüntüsü.
// Taban (kara, deniz, kıyı ışıltısı, yollar, ana caddeler, parklar, binalar, köprüler, iskeleler) bir kez
// 2048×2048 tuvale çizilip önbelleğe alınır (≈1 piksel/metre). Her karede yalnızca görünen dilim kopyalanır;
// bölge renkleri, adlar, simgeler, işaretçiler ve oyuncu bunun üstüne hafif katman olarak çizilir.
// Etkileşim: teker = imleç etrafında yakınlaştır, sürükle = kaydır, sol tık = rota işareti, sağ tık = sil,
// +/- yakınlaştır, oklar kaydır, Boşluk = oyuncuya ortala, M/Esc = kapat.
import * as THREE from 'three';
import { DISTRICTS, BRIDGES, ISLAND, LANDMARKS, MARINA, HARBOR, AIRPORT, MILITARY_BASE } from '../world/map.js';
import { GANGS } from '../game/economy.js';
import { PIN_FOR, PIN_COLOR, svgImg, iconBitmap } from './icons.js';
import { audio } from '../core/audio.js';
import { el, esc } from './dom.js';

const SIZE = 2048, K = SIZE / 2000;
const P = (v) => (v + 1000) * K;
const WATER = [[200, -1000, 420, 1000], [-850, 70, 200, 190], [-1000, 820, 1000, 1000]];
const COL = {
  sea0: '#0a1c2c', sea1: '#0f2b40', coast: 'rgba(110,200,255,0.55)', land: '#24211d', block: '#2f2b25', villa: '#2c3624',
  park: '#25392a', zone: '#33302a', military: '#3a2a26', landmark: '#3b3428', bld: '#3d3830', bldHi: '#4a4337',
  road: '#4a453c', main: '#d7b45a', mainEdge: '#1a1612', bridge: '#e8c66a', pier: '#5a5244',
};
const LM_NAMES = { galata: 'Galata Kulesi', taksim: 'Taksim', bluemosque: 'Sultanahmet', ayasofya: 'Ayasofya', bazaar: 'Kapalıçarşı', suleymaniye: 'Süleymaniye', dolmabahce: 'Dolmabahçe', haydarpasa: 'Haydarpaşa', mihrimah: 'Mihrimah Sultan', stadium: 'Stadyum' };
const LEGEND = [['konak', 'Konak'], ['safehouse', 'Güvenli ev'], ['gun', 'Silahçı'], ['clothes', 'Butik'], ['food', 'Bakkal'], ['trade', 'Karaborsa'], ['dealer', 'Oto galeri'], ['bank', 'Banka'], ['hospital', 'Hastane'], ['police', 'Emniyet'], ['cafe', 'Çay ocağı'], ['club', 'Gece kulübü'], ['garage', 'Tamirci'], ['property', 'Mülkün'], ['job', 'Yasal iş'], ['crimejob', 'Kirli iş']];
const hexCache = new Map();
const hex = (c) => { let v = hexCache.get(c); if (!v) { v = '#' + new THREE.Color(c).getHexString(); hexCache.set(c, v); } return v; };
const JOB_PATH = (id) => (['chop', 'robbery', 'protection', 'hit'].includes(id) ? 'crime' : 'legal');

// ---------------- önbellekli taban ----------------
export function mapBase(g) {
  if (g._mapBase) return g._mapBase;
  if (!g.map || typeof document === 'undefined') return null;
  const t0 = performance.now();
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const x = c.getContext('2d');
  // deniz: derinlik degradesi + ince dalga çizgileri
  const sg = x.createLinearGradient(0, 0, SIZE, SIZE); sg.addColorStop(0, COL.sea0); sg.addColorStop(1, COL.sea1);
  x.fillStyle = sg; x.fillRect(0, 0, SIZE, SIZE);
  x.strokeStyle = 'rgba(140,200,255,0.05)'; x.lineWidth = 1;
  for (let y = 6; y < SIZE; y += 14) { x.beginPath(); for (let xx = 0; xx <= SIZE; xx += 32) x.lineTo(xx, y + Math.sin(xx * 0.02 + y) * 2); x.stroke(); }
  // kara (su dikdörtgenleri dışında kalan her şey)
  const land = document.createElement('canvas'); land.width = land.height = SIZE;
  const l = land.getContext('2d');
  l.fillStyle = COL.land; l.fillRect(0, 0, SIZE, SIZE);
  l.globalCompositeOperation = 'destination-out';
  for (const [x0, z0, x1, z1] of WATER) l.fillRect(P(x0), P(z0), (x1 - x0) * K, (z1 - z0) * K);
  l.globalCompositeOperation = 'source-over';
  // kıyı ışıltısı: kara siluetinin bulanık kopyası
  x.save(); x.filter = 'blur(6px)'; x.globalAlpha = 0.9; x.drawImage(land, 0, 0); x.restore();
  x.save(); x.globalCompositeOperation = 'source-atop'; x.restore();
  x.drawImage(land, 0, 0);
  x.strokeStyle = COL.coast; x.lineWidth = 2;
  for (const [x0, z0, x1, z1] of WATER) x.strokeRect(P(x0) + 1, P(z0) + 1, (x1 - x0) * K - 2, (z1 - z0) * K - 2);
  // bloklar
  for (const b of g.map.blocks) {
    x.fillStyle = b.kind === 'park' ? COL.park : b.kind === 'villa' ? COL.villa : b.kind === 'zone' ? (b.zone === 'military' ? COL.military : COL.zone) : b.kind === 'landmark' ? COL.landmark : COL.block;
    x.fillRect(P(b.x0), P(b.z0), (b.x1 - b.x0) * K, (b.z1 - b.z0) * K);
  }
  // binalar (çatı tonu kat sayısına göre)
  for (const b of g.map.buildings) {
    x.fillStyle = (b.floors || 3) > 6 ? COL.bldHi : COL.bld;
    x.fillRect(P(b.x0) + 0.5, P(b.z0) + 0.5, Math.max(1, (b.x1 - b.x0) * K - 1), Math.max(1, (b.z1 - b.z0) * K - 1));
  }
  // parklarda ağaç benekleri
  x.fillStyle = 'rgba(80,140,80,0.35)';
  for (const b of g.map.blocks) if (b.kind === 'park') for (let i = 0; i < (b.x1 - b.x0) * (b.z1 - b.z0) / 260; i++) { x.beginPath(); x.arc(P(b.x0 + ((i * 37) % (b.x1 - b.x0))), P(b.z0 + ((i * 53) % (b.z1 - b.z0))), 2.2, 0, 6.3); x.fill(); }
  // yollar: önce sokaklar, sonra ana caddeler (kenar çizgisi + altın dolgu)
  const rect = (rd, pad) => { const hw = rd.w / 2 + pad; x.fillRect(P(Math.min(rd.x0, rd.x1) - hw), P(Math.min(rd.z0, rd.z1) - hw), (Math.abs(rd.x1 - rd.x0) + hw * 2) * K, (Math.abs(rd.z1 - rd.z0) + hw * 2) * K); };
  x.fillStyle = COL.road; for (const rd of g.map.roads) if (rd.w < 16 && !rd.bridge) rect(rd, 0);
  x.fillStyle = COL.mainEdge; for (const rd of g.map.roads) if (rd.w >= 16 && !rd.bridge) rect(rd, 2.5);
  x.fillStyle = COL.main; for (const rd of g.map.roads) if (rd.w >= 16 && !rd.bridge) rect(rd, -2);
  // havalimanı pisti, askeri üs
  const AP = AIRPORT;
  x.fillStyle = '#4a453c'; x.fillRect(P(AP.runway.x0), P(AP.runway.z0), (AP.runway.x1 - AP.runway.x0) * K, (AP.runway.z1 - AP.runway.z0) * K);
  x.strokeStyle = '#e8e0c8'; x.setLineDash([10, 10]); x.lineWidth = 2; x.beginPath(); x.moveTo(P((AP.runway.x0 + AP.runway.x1) / 2), P(AP.runway.z0)); x.lineTo(P((AP.runway.x0 + AP.runway.x1) / 2), P(AP.runway.z1)); x.stroke(); x.setLineDash([]);
  const MB = MILITARY_BASE;
  x.save(); x.beginPath(); x.rect(P(MB.x0), P(MB.z0), (MB.x1 - MB.x0) * K, (MB.z1 - MB.z0) * K); x.clip();
  x.strokeStyle = 'rgba(200,70,50,0.35)'; x.lineWidth = 3; for (let i = -400; i < 400; i += 16) { x.beginPath(); x.moveTo(P(MB.x0) + i, P(MB.z0)); x.lineTo(P(MB.x0) + i + 300, P(MB.z0) + 300); x.stroke(); }
  x.restore(); x.strokeStyle = '#c84a3a'; x.lineWidth = 2; x.strokeRect(P(MB.x0), P(MB.z0), (MB.x1 - MB.x0) * K, (MB.z1 - MB.z0) * K);
  // iskeleler, köprüler, Kız Kulesi adası
  x.fillStyle = COL.pier; for (const p of [...HARBOR.piers, ...MARINA.piers]) x.fillRect(P(p.x0), P(p.z0), Math.max(1.5, (p.x1 - p.x0) * K), Math.max(1.5, (p.z1 - p.z0) * K));
  for (const b of BRIDGES) { x.fillStyle = '#111'; x.fillRect(P(b.x0) - 3, P(b.z0) - 3, (b.x1 - b.x0) * K + 6, (b.z1 - b.z0) * K + 6); x.fillStyle = COL.bridge; x.fillRect(P(b.x0), P(b.z0), (b.x1 - b.x0) * K, (b.z1 - b.z0) * K); }
  x.fillStyle = COL.landmark; x.beginPath(); x.arc(P(ISLAND.x), P(ISLAND.z), ISLAND.r * K + 2, 0, 6.3); x.fill(); x.strokeStyle = COL.coast; x.stroke();
  // hafif kâğıt dokusu (tek seferlik)
  x.globalAlpha = 0.05; x.fillStyle = '#fff';
  for (let i = 0; i < 9000; i++) { const a = (i * 7919) % SIZE, b = (i * 104729) % SIZE; x.fillRect(a, b, 1, 1); }
  x.globalAlpha = 1;
  g._mapBase = c;
  g._mapBaseMs = Math.round(performance.now() - t0);
  return c;
}

// ---------------- çizim katmanı ----------------
// v: {cx, cz, zoom (px/m), W, H}
function drawMap(g, ctx, v, now) {
  const W = v.W, H = v.H, sc = v.zoom;
  const tx = (wx) => W / 2 + (wx - v.cx) * sc, tz = (wz) => H / 2 + (wz - v.cz) * sc;
  ctx.fillStyle = COL.sea0; ctx.fillRect(0, 0, W, H);
  const base = mapBase(g);
  if (base) {
    ctx.imageSmoothingEnabled = sc < 2.2;
    ctx.drawImage(base, tx(-1000), tz(-1000), 2000 * sc, 2000 * sc);
  }
  const s = g.state || { territories: {} };
  // bölge renkleri (çete rengi; senin bölgen altın)
  for (const d of DISTRICTS) {
    const own = s.territories[d.gang];
    const col = own ? '#d4af37' : GANGS[d.gang] ? GANGS[d.gang].color : '#888888';
    ctx.fillStyle = col + (own ? '22' : '18');
    ctx.fillRect(tx(d.x0), tz(d.z0), (d.x1 - d.x0) * sc, (d.z1 - d.z0) * sc);
    ctx.strokeStyle = col + 'aa'; ctx.lineWidth = 2; ctx.setLineDash([10, 7]);
    ctx.strokeRect(tx(d.x0) + 1, tz(d.z0) + 1, (d.x1 - d.x0) * sc - 2, (d.z1 - d.z0) * sc - 2);
  }
  ctx.setLineDash([]);
  const label = (text, x, y, size, color, opt = {}) => {
    ctx.font = `${opt.weight || 'bold'} ${size}px ${opt.font || 'Georgia, serif'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (opt.spacing) { try { ctx.letterSpacing = opt.spacing + 'px'; } catch (e) { /* eski tarayıcı */ } }
    ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
    if (opt.spacing) { try { ctx.letterSpacing = '0px'; } catch (e) { /* yok */ } }
  };
  // deniz adları
  const seaSize = Math.max(13, Math.min(26, 14 * sc + 6));
  ctx.save(); ctx.translate(tx(310), tz(-120)); ctx.rotate(-Math.PI / 2); label('İSTANBUL BOĞAZI', 0, 0, seaSize, 'rgba(150,210,255,0.75)', { weight: 'italic', spacing: 6 }); ctx.restore();
  label('HALİÇ', tx(-380), tz(130), seaSize * 0.85, 'rgba(150,210,255,0.75)', { weight: 'italic', spacing: 5 });
  label('MARMARA DENİZİ', tx(0), tz(910), seaSize * 1.1, 'rgba(150,210,255,0.75)', { weight: 'italic', spacing: 8 });
  // semt adları ve kimin bölgesi
  const dSize = Math.max(15, Math.min(40, 22 * sc + 6));
  for (const d of DISTRICTS) {
    const own = s.territories[d.gang], cx = tx((d.x0 + d.x1) / 2), cy = tz((d.z0 + d.z1) / 2);
    label(d.name, cx, cy, dSize, own ? '#f0d68a' : 'rgba(255,245,225,0.85)', { spacing: 4 });
    label(own ? 'SENİN BÖLGEN' : GANGS[d.gang] ? GANGS[d.gang].name.toUpperCase() : '', cx, cy + dSize * 0.85, dSize * 0.42, own ? '#d4af37' : GANGS[d.gang] ? GANGS[d.gang].color : '#aaa', { weight: '600', font: 'system-ui, sans-serif', spacing: 2 });
  }
  // simge yapılar ve köprüler (yakınlaştıkça)
  if (sc > 0.55) {
    const ls = Math.max(11, Math.min(17, 9 * sc + 4));
    for (const L of LANDMARKS) { const n = LM_NAMES[L.type]; if (!n) continue; ctx.fillStyle = '#f0d68a'; ctx.beginPath(); ctx.arc(tx(L.x), tz(L.z), 4, 0, 6.3); ctx.fill(); label(n, tx(L.x), tz(L.z) - 12, ls, '#f6e7bf', { weight: '600', font: 'system-ui, sans-serif' }); }
    for (const b of BRIDGES) label(b.name, tx((b.x0 + b.x1) / 2), tz((b.z0 + b.z1) / 2) + (b.axis === 'x' ? -14 : 0), ls * 0.9, '#e8c66a', { weight: '600', font: 'system-ui, sans-serif' });
    label('Kız Kulesi', tx(ISLAND.x), tz(ISLAND.z) - 16, ls * 0.9, '#cfe8ff', { weight: '600', font: 'system-ui, sans-serif' });
    label(AIRPORT.name, tx((AIRPORT.x0 + AIRPORT.x1) / 2), tz(AIRPORT.z0 + 40), ls * 0.9, '#d8d0c0', { weight: '600', font: 'system-ui, sans-serif' });
    label(MILITARY_BASE.name + ' · YASAK BÖLGE', tx((MILITARY_BASE.x0 + MILITARY_BASE.x1) / 2), tz((MILITARY_BASE.z0 + MILITARY_BASE.z1) / 2), ls * 0.9, '#ff8a70', { weight: '600', font: 'system-ui, sans-serif' });
    label(HARBOR.name, tx(680), tz(805), ls * 0.85, '#cfe8ff', { weight: '600', font: 'system-ui, sans-serif' });
  }
  // GPS rotası
  const p = g.player;
  if (g.gpsPath && g.gpsPath.length && p) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [w, c] of [[9, 'rgba(0,0,0,0.6)'], [5, '#c86aff']]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(tx(p.pos.x), tz(p.pos.z));
      for (const n of g.gpsPath) ctx.lineTo(tx(n.x), tz(n.z));
      ctx.stroke();
    }
  }
  // dükkân / mekân simgeleri (uzaktan yalnız önemliler)
  const pinS = Math.max(18, Math.min(34, 14 * sc + 10));
  const major = new Set(['konak', 'safehouse', 'hospital', 'police', 'gun', 'garage']);
  for (const b of g.map.specials) {
    const pt = b.ownedProp ? 'property' : b.type;
    const pin = PIN_FOR[pt]; if (!pin) continue;
    if (sc < 0.7 && !major.has(pt) && pt !== 'property') continue;
    ctx.drawImage(iconBitmap(pin, PIN_COLOR[pt], 48), tx(b.door.x) - pinS / 2, tz(b.door.z) - pinS / 2, pinS, pinS);
  }
  if (g.career) {
    if (sc >= 0.7) for (const bd of g.career.boards) { const pt = JOB_PATH(bd.id) === 'crime' ? 'crimejob' : 'job'; ctx.drawImage(iconBitmap(PIN_FOR[pt], PIN_COLOR[pt], 48), tx(bd.x) - pinS * 0.4, tz(bd.z) - pinS * 0.4, pinS * 0.8, pinS * 0.8); }
    for (const mk of g.career.markers) {
      const pos = g.career.markerPos(mk);
      ctx.fillStyle = hex(mk.color); ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(tx(pos.x), tz(pos.z) - 13); ctx.lineTo(tx(pos.x) + 10, tz(pos.z)); ctx.lineTo(tx(pos.x), tz(pos.z) + 13); ctx.lineTo(tx(pos.x) - 10, tz(pos.z)); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // görev ve ödül avı işaretçileri
  const strong = now < (g.missions.blinkUntil || 0);
  for (const mk of g.missions.markers) {
    let x = mk.x, z = mk.z;
    if (mk.actor) { if (mk.actor.dead) continue; x = mk.actor.pos.x; z = mk.actor.pos.z; }
    if (mk.vehicle) { x = mk.vehicle.pos.x; z = mk.vehicle.pos.z; }
    const col = hex(mk.color), X = tx(x), Y = tz(z);
    if (mk.area) { ctx.fillStyle = col + '22'; ctx.strokeStyle = col + 'bb'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.arc(X, Y, Math.max(8, mk.area * sc), 0, 6.3); ctx.fill(); ctx.stroke(); ctx.setLineDash([]); }
    if (mk.blink || mk.story) {
      const ph = (now % 1000) / 1000;
      ctx.strokeStyle = col; ctx.globalAlpha = (1 - ph) * (strong ? 1 : 0.7); ctx.lineWidth = strong ? 5 : 3;
      ctx.beginPath(); ctx.arc(X, Y, 14 + ph * (strong ? 34 : 24), 0, 6.3); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (mk.giver) ctx.drawImage(iconBitmap('pin_reis', '#d4af37', 48), X - 19, Y - 19, 38, 38);
    else if (mk.icon) ctx.drawImage(iconBitmap(mk.icon, col, 48), X - 17, Y - 17, 34, 34);
    else { ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X, Y, 11, 0, 6.3); ctx.fill(); ctx.stroke(); }
    if (mk.label) label(mk.label, X, Y - 26, 15, col, { font: 'system-ui, sans-serif' });
  }
  for (const vh of g.vehicles.list) if (vh.owned && !vh.destroyed) ctx.drawImage(iconBitmap('car', '#6ab8ff', 48), tx(vh.pos.x) - 12, tz(vh.pos.z) - 12, 24, 24);
  if (g.waypoint) {
    const X = tx(g.waypoint.x), Y = tz(g.waypoint.z);
    ctx.fillStyle = '#c86aff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X - 12, Y - 22); ctx.arc(X, Y - 24, 12, Math.PI, 0); ctx.lineTo(X, Y); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X, Y - 24, 4.5, 0, 6.3); ctx.fill();
  }
  // oyuncu
  if (p) {
    const X = tx(p.pos.x), Y = tz(p.pos.z);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(X, Y, 22 + Math.sin(now / 300) * 3, 0, 6.3); ctx.fill();
    ctx.save(); ctx.translate(X, Y);
    const hd = p.vehicle ? p.vehicle.heading : p.heading;
    ctx.rotate(Math.atan2(Math.cos(hd), Math.sin(hd)) + Math.PI / 2);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(12, 13); ctx.lineTo(0, 6); ctx.lineTo(-12, 13); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // ölçek çubuğu
  const m = sc > 2 ? 50 : sc > 0.8 ? 100 : 250;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(18, H - 40, m * sc + 24, 26);
  ctx.fillStyle = '#f0d68a'; ctx.fillRect(30, H - 24, m * sc, 3);
  ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${m} m`, 30, H - 32);
}

const CSS = `
.bigmap { position: fixed; inset: 0; background: #06101a; overflow: hidden; }
.bigmap canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; }
.bigmap canvas.drag { cursor: grabbing; }
.bm-title { position: absolute; left: 24px; top: 20px; font: 900 26px var(--serif, Georgia); color: #f0d68a; letter-spacing: 0.18em; text-shadow: 0 2px 10px #000; pointer-events: none; }
.bm-title small { display: block; font: 600 11px var(--sans, sans-serif); letter-spacing: 0.3em; color: #a89a7e; }
.bm-legend { position: absolute; right: 18px; top: 18px; width: 236px; max-height: calc(100vh - 110px); overflow-y: auto; padding: 12px 14px; border-radius: 18px; background: rgba(12,10,8,0.82); backdrop-filter: blur(10px); border: 1px solid rgba(212,175,55,0.25); font: 12px var(--sans, sans-serif); color: #e8dcc4; }
.bm-legend h4 { margin: 8px 0 6px; font: bold 10px var(--sans, sans-serif); letter-spacing: 0.2em; color: #d4af37; }
.bm-legend .li { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
.bm-legend .sw { width: 14px; height: 14px; border-radius: 4px; flex: none; }
.bm-legend .ln { width: 22px; height: 5px; border-radius: 2px; flex: none; }
.bm-zoom { position: absolute; right: 18px; bottom: 64px; display: flex; flex-direction: column; gap: 6px; }
.bm-zoom button { width: 40px; height: 40px; border-radius: 12px; border: 1px solid rgba(212,175,55,0.35); background: rgba(12,10,8,0.85); color: #f0d68a; font: bold 20px var(--sans, sans-serif); cursor: var(--cursor, pointer); }
.bm-zoom button:hover, .bm-zoom button.hot { background: rgba(212,175,55,0.25); }
.bm-help { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); padding: 7px 16px; border-radius: 14px; background: rgba(12,10,8,0.82); color: #c9b88e; font: 12px var(--sans, sans-serif); white-space: nowrap; }
.bm-coord { position: absolute; left: 24px; bottom: 60px; font: 600 11px var(--sans, sans-serif); color: #a89a7e; text-shadow: 0 1px 3px #000; }
`;
function injectCSS() { if (document.getElementById('bigmap-css')) return; const s = document.createElement('style'); s.id = 'bigmap-css'; s.textContent = CSS; document.head.appendChild(s); }

export const MapMethods = {
  mapScreen() {
    const g = this.game;
    injectCSS();
    const root = el('div', 'bigmap');
    root.innerHTML = `<canvas></canvas><div class="bm-title">İSTANBUL<small>ŞEHİR HARİTASI</small></div><div class="bm-legend"></div>
      <div class="bm-zoom"><button data-z="in" title="Yakınlaştır (+)">+</button><button data-z="out" title="Uzaklaştır (-)">−</button><button data-z="me" title="Bana ortala (Boşluk)">◎</button></div>
      <div class="bm-coord"></div><div class="bm-help">Teker: yakınlaştır · Sürükle: kaydır · Sol tık: rota işaretle · Sağ tık: rotayı sil · Boşluk: ortala · M/Esc: kapat</div>`;
    const m = this.openModal(root, { cls: 'full', opaque: true });
    m.kind = 'map';
    const cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
    const s = g.state || { territories: {} };
    const leg = root.querySelector('.bm-legend');
    const terr = DISTRICTS.map((d) => { const own = s.territories[d.gang]; const col = own ? '#d4af37' : GANGS[d.gang] ? GANGS[d.gang].color : '#888'; return `<div class="li"><span class="sw" style="background:${col}55;border:1px solid ${col}"></span>${esc(d.name)} — ${own ? '<b style="color:#f0d68a">SENİN</b>' : esc(GANGS[d.gang] ? GANGS[d.gang].name : '')}</div>`; }).join('');
    leg.innerHTML = `<h4>İŞARETLER</h4><div class="li"><span class="sw" style="background:#ffcc00;border-radius:50%"></span>Hikâye hedefi</div><div class="li">${svgImg('pin_reis', '#d4af37', 16)} Sıradaki görev (konak)</div><div class="li">${svgImg('pin_skull', '#ff4a3a', 16)} Ödül avı</div><div class="li"><span class="sw" style="background:#ff3030;border-radius:50%"></span>Düşman / hedef</div><div class="li"><span class="sw" style="background:#c86aff"></span>Rota (GPS)</div>
      <h4>YOLLAR</h4><div class="li"><span class="ln" style="background:${COL.main}"></span>Ana cadde</div><div class="li"><span class="ln" style="background:${COL.road}"></span>Sokak</div><div class="li"><span class="ln" style="background:${COL.bridge}"></span>Köprü</div>
      <h4>BÖLGELER</h4>${terr}<h4>MEKÂNLAR</h4>${LEGEND.map(([t, l]) => `<div class="li">${svgImg(PIN_FOR[t], PIN_COLOR[t], 16)} ${l}</div>`).join('')}`;
    const p = g.player;
    const v = { cx: p ? p.pos.x : 0, cz: p ? p.pos.z : 0, zoom: this.mapZoom2 || 0.9, W: 1, H: 1 };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => { const r = root.getBoundingClientRect(); cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr)); };
    let dirty = true, drag = null, raf = 0, lastDraw = 0;
    const clampV = () => { v.zoom = Math.max(0.35, Math.min(6, v.zoom)); v.cx = Math.max(-1000, Math.min(1000, v.cx)); v.cz = Math.max(-1000, Math.min(1000, v.cz)); this.mapZoom2 = v.zoom; };
    const frame = (now) => {
      if (!root.isConnected) { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey, true); return; }
      raf = requestAnimationFrame(frame);
      // yanıp sönen işaretler için ~12 Hz yeterli; sürüklerken/yakınlaştırırken her karede
      if (!dirty && now - lastDraw < 80) return;
      dirty = false; lastDraw = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      v.W = cv.width / dpr; v.H = cv.height / dpr;
      drawMap(g, ctx, v, performance.now());
    };
    const toWorld = (cx, cy) => { const r = cv.getBoundingClientRect(); return { x: v.cx + (cx - r.left - r.width / 2) / v.zoom, z: v.cz + (cy - r.top - r.height / 2) / v.zoom }; };
    const zoomAt = (k, cx, cy) => {
      const a = cx === undefined ? null : toWorld(cx, cy);
      v.zoom *= k; clampV();
      if (a) { const b = toWorld(cx, cy); v.cx += a.x - b.x; v.cz += a.z - b.z; clampV(); }
      dirty = true;
    };
    cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY > 0 ? 0.87 : 1.15, e.clientX, e.clientY); }, { passive: false });
    cv.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: v.cx, cz: v.cz, moved: false }; cv.classList.add('drag'); });
    cv.addEventListener('mousemove', (e) => {
      const w = toWorld(e.clientX, e.clientY);
      root.querySelector('.bm-coord').textContent = `${Math.round(w.x)}, ${Math.round(-w.z)}`;
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      v.cx = drag.cx - dx / v.zoom; v.cz = drag.cz - dy / v.zoom; clampV(); dirty = true;
    });
    const endDrag = (e) => {
      if (drag && !drag.moved && e) {
        if (e.button === 0) { const w = toWorld(e.clientX, e.clientY); g.setWaypoint(w.x, w.z); audio.click(); }
        else if (e.button === 2) g.setWaypoint(null);
        dirty = true;
      }
      drag = null; cv.classList.remove('drag');
    };
    cv.addEventListener('mouseup', endDrag);
    cv.addEventListener('mouseleave', () => endDrag(null));
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    root.querySelectorAll('.bm-zoom button').forEach((b) => { b.onclick = () => { audio.click(); if (b.dataset.z === 'in') zoomAt(1.3); else if (b.dataset.z === 'out') zoomAt(1 / 1.3); else if (p) { v.cx = p.pos.x; v.cz = p.pos.z; dirty = true; } }; });
    const onKey = (e) => {
      if (this.topModal() !== m) return;
      const step = 120 / v.zoom;
      const k = e.code;
      if (k === 'Equal' || k === 'NumpadAdd') zoomAt(1.25);
      else if (k === 'Minus' || k === 'NumpadSubtract') zoomAt(0.8);
      else if (k === 'Space') { if (p) { v.cx = p.pos.x; v.cz = p.pos.z; dirty = true; } }
      else if (k === 'ArrowLeft' || k === 'KeyA') { v.cx -= step; clampV(); dirty = true; }
      else if (k === 'ArrowRight' || k === 'KeyD') { v.cx += step; clampV(); dirty = true; }
      else if (k === 'ArrowUp' || k === 'KeyW') { v.cz -= step; clampV(); dirty = true; }
      else if (k === 'ArrowDown' || k === 'KeyS') { v.cz += step; clampV(); dirty = true; }
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    const onResize = () => { resize(); dirty = true; };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey, true);
    resize();
    raf = requestAnimationFrame(frame);
    // test ve hata ayıklama erişimi
    m.view = v; m.zoomAt = zoomAt; m.toWorld = toWorld; m.canvas = cv;
    m.redraw = () => { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); v.W = cv.width / dpr; v.H = cv.height / dpr; drawMap(g, ctx, v, performance.now()); };
    return m;
  },
};
