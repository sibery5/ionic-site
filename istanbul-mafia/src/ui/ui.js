// Arayüz: HUD, mini harita, büyük harita, menüler, dükkânlar, diyaloglar, bildirimler.
import * as THREE from 'three';
import { ICONS, PIN_FOR, PIN_COLOR, svgImg, iconBitmap } from './icons.js';
import { formatMoney, pad2, clamp } from '../core/util.js';
import { WEAPONS, WEAPON_ORDER } from '../game/weapons.js';
import { FOOD, GOODS, BUSINESSES, GANGS, rankOf, RANKS, LEGAL_RANKS, CRIME_RANKS, rankIn, garageCapacity, ensureLifeState } from '../game/economy.js';
import { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, BEARDS, defaultLook } from '../entities/character.js';
import { Life } from '../game/life.js';
import { ShopMethods } from './shops.js';
import { PhoneMethods } from './phone.js';
import { SettingsMethods, applyExtendedSettings, withDefaults } from './settings.js';
import { districtAt, DISTRICTS } from '../world/map.js';
import { SLOTS, listSaves } from '../game/save.js';
import { audio } from '../core/audio.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

const TIPS = [
  'İpucu: Bankaya yatırdığın para ölünce kaybolmaz.',
  'İpucu: Sokak kedilerini sevmek (E) canını biraz yeniler. İstanbul\'da kediler kutsaldır.',
  'İpucu: Karaborsada mal fiyatları semtten semte ve günden güne değişir. Ucuza al, pahalıya sat!',
  'İpucu: Polisi atlatmak için görüş alanından çık ve bir süre saklan. Rüşvet de işe yarar...',
  'İpucu: Şehre gizlenmiş 25 Altın Lale var. Hepsini bulana büyük ödül!',
  'İpucu: Güvenli evindeki yatakta uyuyarak oyunu kaydedebilirsin. ESC menüsünden de kayıt alınır.',
  'İpucu: İşletme satın al, her gün pasif gelir kazan.',
  'İpucu: Çete bölgesinde 15 çete üyesini indirirsen bölge senin olur.',
  'İpucu: El freni (Space) ile drift atabilirsin.',
  'İpucu: Galata Kulesi\'nin seyir terasından tüm İstanbul\'u izleyebilirsin.',
  'İpucu: Telefonunu (P) açıp İşler uygulamasından taksicilikten kiralık katilliğe kadar iş bulabilirsin.',
  'İpucu: Her konut bir güvenli evdir ve garaj kapasiteni artırır. Boğaz yalılarının özel iskelesi var.',
  'İpucu: Borsa uygulamasında ucuzdan al, haberlerden sonra pahalıya sat.',
];

export class UI {
  constructor(game) {
    this.game = game;
    this.root = $('#ui');
    this.modalStack = [];
    this.notes = [];
    this.barks = [];
    this.bigT = 0;
    this.dmgT = 0;
    this.wheelT = 0;
    this.buildHUD();
    this.mapZoom = 1;
    this.mapPan = { x: 0, z: 0 };
    this._obj = { mission: '', job: '' };
  }

  // yaşam sistemlerini (kariyer, mülk, borsa) ilk ihtiyaçta kur
  ensureLife() {
    const g = this.game;
    if (!g.life && g.map) new Life(g);
    return g.life;
  }

  // ======================= HUD =======================
  buildHUD() {
    const h = el('div', 'hud hidden'); h.id = 'hud';
    h.innerHTML = `
      <div class="vignette" id="dmg"></div>
      <div class="crosshair" id="xhair"><i></i><i></i><i></i><i></i><b></b></div>
      <div class="hitmark" id="hitmark"></div>
      <div class="minimap-wrap">
        <canvas id="minimap" width="440" height="440"></canvas>
        <svg class="arcs" viewBox="0 0 220 220"><circle class="arc-bg" cx="110" cy="110" r="104"/><circle id="arcHp" class="arc hp" cx="110" cy="110" r="104"/><circle id="arcAr" class="arc ar" cx="110" cy="110" r="98"/></svg>
        <div class="district" id="district">BEYOĞLU</div>
      </div>
      <div class="topright">
        <div class="clock"><span id="clockIcon">${ICONS.sun}</span><span id="clock">09:00</span><small id="day">1. Gün</small></div>
        <div class="money"><span id="money">₺0</span></div>
        <div class="bank" id="bankLine"></div>
        <div class="stars" id="stars">${[0, 1, 2, 3, 4].map(() => `<span class="star">${ICONS.star}</span>`).join('')}</div>
        <div class="weapon"><span id="wIcon" class="wicon"></span><div><div id="wName"></div><div id="wAmmo" class="ammo"></div></div></div>
      </div>
      <div class="objective" id="objective"></div>
      <div class="timer" id="timer"></div>
      <div class="timer job" id="jobTimer"></div>
      <div class="holdbar" id="holdbar"><span></span><div><i></i></div></div>
      <div class="racepos" id="racepos"></div>
      <div class="notes" id="notes"></div>
      <div class="prompt" id="prompt"></div>
      <div class="bigmsg" id="bigmsg"><h1></h1><h2></h2></div>
      <div class="banner" id="banner"></div>
      <div class="speedo" id="speedo"><b id="kmh">0</b><span>km/s</span><div class="carhp"><i id="carhp"></i></div><small id="carname"></small></div>
      <div class="barks" id="barks"></div>
      <div class="wheel" id="wheel"></div>
      <div class="fps" id="fps"></div>
      <div class="stamina" id="stamina"><i></i></div>
    `;
    this.root.appendChild(h);
    this.hud = h;
    this.mm = $('#minimap').getContext('2d');
    this.modalEl = el('div', 'modal-layer'); this.root.appendChild(this.modalEl);
    this.dialogEl = el('div', 'dialog hidden'); this.root.appendChild(this.dialogEl);
    this.overlayEl = el('div', 'overlay hidden'); this.root.appendChild(this.overlayEl);
  }

  showHUD(v) { this.hud.classList.toggle('hidden', !v); }

  notify(text, kind = 'info') {
    const n = el('div', 'note ' + kind, text);
    $('#notes').appendChild(n);
    setTimeout(() => n.classList.add('out'), 3600);
    setTimeout(() => n.remove(), 4200);
    const all = $('#notes').children;
    if (all.length > 6) all[0].remove();
  }
  bigMessage(title, sub = '', color = 'gold', dur = 3) {
    const b = $('#bigmsg');
    b.className = 'bigmsg show ' + color;
    b.querySelector('h1').textContent = title;
    b.querySelector('h2').textContent = sub;
    this.bigT = dur;
  }
  locationBanner(name) {
    const b = $('#banner');
    b.textContent = name;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  // iki kanal: hikâye görevi (missions) ve iş/test sürüşü (career). İkisi birlikte gösterilir.
  setObjective(t, channel = 'mission', path = 'legal') {
    this._obj[channel] = t || '';
    if (channel === 'job') this._objPath = path;
    const o = $('#objective');
    const parts = [];
    if (this._obj.mission) parts.push(`<div class="ob"><span>GÖREV</span>${this._obj.mission}</div>`);
    if (this._obj.job) parts.push(`<div class="ob job ${this._objPath === 'crime' ? 'crime' : ''}"><span>${this._objPath === 'crime' ? 'KİRLİ İŞ' : 'İŞ'}</span>${this._obj.job}</div>`);
    o.innerHTML = parts.join('');
    o.classList.toggle('show', parts.length > 0);
  }
  setJobTimer(t) { const e = $('#jobTimer'); if (t > 0) { e.textContent = `${Math.floor(t / 60)}:${pad2(Math.floor(t % 60))}`; e.classList.add('show'); e.classList.toggle('urgent', t < 15); } else e.classList.remove('show'); }
  setProgress(label, pct) {
    const h = $('#holdbar');
    if (label === null || label === undefined) { h.classList.remove('show'); return; }
    h.classList.add('show');
    h.firstElementChild.textContent = label;
    h.querySelector('i').style.width = `${Math.min(100, pct * 100)}%`;
  }
  setTimer(t) { const e = $('#timer'); if (t > 0) { e.textContent = `${Math.floor(t / 60)}:${pad2(Math.floor(t % 60))}`; e.classList.add('show'); e.classList.toggle('urgent', t < 30); } else e.classList.remove('show'); }
  setRacePos(p, n) { const e = $('#racepos'); if (p > 0) { e.innerHTML = `<b>${p}</b>/${n}<small>SIRA</small>`; e.classList.add('show'); } else e.classList.remove('show'); }
  flashWanted() { const s = $('#stars'); s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash'); }
  damageFlash() { this.dmgT = 0.35; }
  onPlayerDamaged(d) { if (d > 0) this.dmgT = Math.min(0.8, 0.25 + d / 60); }
  hitMarker() { const h = $('#hitmark'); h.classList.remove('show'); void h.offsetWidth; h.classList.add('show'); }
  bark(actor, text) {
    if (this.barks.length > 5) return;
    const e = el('div', 'bark', text);
    $('#barks').appendChild(e);
    this.barks.push({ actor, e, t: 3 });
  }
  prompt(text) {
    const p = $('#prompt');
    if (text) { p.innerHTML = `<kbd>E</kbd> ${text}`; p.classList.add('show'); } else p.classList.remove('show');
  }
  showWeaponWheel() {
    const pl = this.game.player;
    const w = $('#wheel');
    w.innerHTML = WEAPON_ORDER.filter((id) => pl.weapons[id]).map((id) => `<div class="wslot ${id === pl.weapon ? 'on' : ''}">${svgImg('w_' + id, null, 34)}<small>${WEAPONS[id].slot + 1}</small></div>`).join('');
    w.classList.add('show');
    this.wheelT = 1.5;
  }

  blocking() { return this.modalStack.length > 0 || !this.dialogEl.classList.contains('hidden'); }

  update(dt) {
    const g = this.game, p = g.player, s = g.state;
    if (!s) return;
    const life = this.ensureLife();
    if (life) life.tickFromUI(dt);
    if (this._setStamp !== g.settings) { this._setStamp = g.settings; withDefaults(g.settings); applyExtendedSettings(g); }
    // saat & hava
    $('#clock').textContent = `${pad2(g.env.hour)}:${pad2(g.env.minute)}`;
    $('#day').textContent = `${g.env.day}. Gün`;
    const ic = g.env.weather === 'rain' ? 'rain' : g.env.weather === 'cloudy' ? 'cloud' : g.env.nightFactor > 0.5 ? 'moon' : 'sun';
    if (this._ic !== ic) { $('#clockIcon').innerHTML = ICONS[ic]; this._ic = ic; }
    // para animasyonu
    this.shownMoney = this.shownMoney === undefined ? s.money : this.shownMoney + (s.money - this.shownMoney) * Math.min(1, dt * 8);
    if (Math.abs(this.shownMoney - s.money) < 1) this.shownMoney = s.money;
    $('#money').textContent = formatMoney(this.shownMoney);
    $('#bankLine').textContent = s.bank > 0 ? `Banka: ${formatMoney(s.bank)}` : '';
    // yıldızlar
    const stars = $('#stars').children;
    for (let i = 0; i < 5; i++) stars[i].classList.toggle('on', i < g.wanted.level);
    $('#stars').classList.toggle('active', g.wanted.level > 0);
    $('#stars').classList.toggle('blink', g.wanted.level > 0 && g.wanted.seenT > 6);
    // silah
    if (this._w !== p.weapon) { $('#wIcon').innerHTML = ICONS['w_' + p.weapon] || ''; $('#wName').textContent = WEAPONS[p.weapon].name; this._w = p.weapon; }
    const ws = p.wstate, wd = p.wdef;
    $('#wAmmo').textContent = wd.type === 'melee' ? '' : p.reloadT > 0 ? 'Şarjör değişiyor...' : `${ws.mag} / ${ws.ammo}`;
    // can & zırh yayları
    const C = 2 * Math.PI * 104, C2 = 2 * Math.PI * 98;
    $('#arcHp').style.strokeDasharray = `${C * 0.25 * clamp(p.hp / p.maxHp, 0, 1)} ${C}`;
    $('#arcAr').style.strokeDasharray = `${C2 * 0.25 * clamp(p.armor / 100, 0, 1)} ${C2}`;
    $('#arcHp').classList.toggle('low', p.hp < 30);
    // bölge adı
    if (!p.inInterior) {
      const d = districtAt(p.pos.x, p.pos.z);
      if (this._dist !== d.id) {
        $('#district').textContent = d.name;
        if (this._dist) this.locationBanner(d.name + (g.state.territories[d.gang] ? '  ·  Senin bölgen' : GANGS[d.gang] ? `  ·  ${GANGS[d.gang].name} bölgesi` : ''));
        this._dist = d.id;
      }
    } else if (this._dist !== 'in') { $('#district').textContent = p.inInterior.name.toUpperCase(); this._dist = 'in'; }
    // nişangâh
    const showX = !p.vehicle && wd.type !== 'melee' && !p.swimming && (p.aiming || g.input.mouse.left);
    const x = $('#xhair');
    x.classList.toggle('show', showX || (p.vehicle && p.aiming));
    x.classList.toggle('enemy', !!(p.aimTarget && !p.aimTarget.dead && (p.aimTarget.faction !== 'civilian' || p.aimTarget.hostile)));
    x.classList.toggle('scope', !!(p.aiming && wd.scope));
    x.style.setProperty('--spread', `${8 + (wd.spread || 0) * 400 * (p.aiming ? 0.6 : 1) + p.recoil * 10}px`);
    // hasar efekti
    if (this.dmgT > 0) this.dmgT -= dt;
    $('#dmg').style.opacity = Math.max(this.dmgT * 1.4, p.hp < 30 ? 0.35 + Math.sin(performance.now() * 0.006) * 0.15 : 0);
    // büyük mesaj
    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) $('#bigmsg').classList.remove('show'); }
    if (this.wheelT > 0) { this.wheelT -= dt; if (this.wheelT <= 0) $('#wheel').classList.remove('show'); }
    // hız göstergesi
    const sp = $('#speedo');
    if (p.vehicle) {
      sp.classList.add('show');
      $('#kmh').textContent = Math.round(Math.abs(p.vehicle.fs) * 3.6);
      $('#carhp').style.width = `${clamp(p.vehicle.hp / p.vehicle.def.hp, 0, 1) * 100}%`;
      $('#carname').textContent = p.vehicle.def.name;
    } else sp.classList.remove('show');
    const st = $('#stamina');
    st.classList.toggle('show', p.stamina < 99 && !p.vehicle);
    st.firstElementChild.style.width = p.stamina + '%';
    // konuşma balonları
    for (const b of this.barks.slice()) {
      b.t -= dt;
      const v = new THREE.Vector3(b.actor.pos.x, b.actor.pos.y + 2.2, b.actor.pos.z).project(g.camera);
      const vis = v.z < 1 && b.t > 0 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      b.e.style.display = vis ? 'block' : 'none';
      b.e.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
      if (b.t <= 0) { b.e.remove(); this.barks.splice(this.barks.indexOf(b), 1); }
    }
    this.drawMinimap();
    if (g.settings.showFps) $('#fps').textContent = `${g.fps} FPS`;
    else $('#fps').textContent = '';
  }

  // ======================= MİNİ HARİTA =======================
  drawMinimap() {
    const g = this.game, p = g.player;
    const c = this.mm, W = 440, R = W / 2;
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath(); c.arc(R, R, R - 4, 0, Math.PI * 2); c.clip();
    if (p.inInterior) {
      c.fillStyle = '#1a1712'; c.fillRect(0, 0, W, W);
      c.fillStyle = '#d4af37'; c.font = 'bold 26px Georgia'; c.textAlign = 'center';
      c.fillText('İÇ MEKÂN', R, R - 8); c.font = '20px Georgia'; c.fillText(p.inInterior.name, R, R + 22);
      c.restore();
      return;
    }
    const src = g.city.minimapCanvas;
    const k = src.width / 2000;
    const range = p.vehicle ? 260 : 160; // metre yarıçap
    const scale = (R / range); // px/m
    const yaw = p.camYaw;
    const rot = g.settings.minimapRotate === false ? 0 : -Math.PI / 2 - Math.atan2(Math.cos(yaw), Math.sin(yaw));
    c.fillStyle = '#0f2a3d'; c.fillRect(0, 0, W, W);
    c.translate(R, R);
    c.rotate(rot);
    c.scale(scale / k, scale / k);
    c.translate(-(p.pos.x + 1000) * k, -(p.pos.z + 1000) * k);
    c.imageSmoothingEnabled = true;
    c.drawImage(src, 0, 0);
    // GPS rotası
    if (g.gpsPath && g.gpsPath.length) {
      c.strokeStyle = '#c86aff'; c.lineWidth = 6 / scale * k * 1.2; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      c.moveTo((p.pos.x + 1000) * k, (p.pos.z + 1000) * k);
      for (const n of g.gpsPath) c.lineTo((n.x + 1000) * k, (n.z + 1000) * k);
      c.stroke();
    }
    c.restore();
    // ikonlar
    const toScreen = (x, z) => {
      const dx = (x - p.pos.x) * scale, dz = (z - p.pos.z) * scale;
      const cs = Math.cos(rot), sn = Math.sin(rot);
      return [R + dx * cs - dz * sn, R + dx * sn + dz * cs];
    };
    c.save();
    c.beginPath(); c.arc(R, R, R - 4, 0, Math.PI * 2); c.clip();
    for (const b of g.map.specials) {
      const [sx, sy] = toScreen(b.door.x, b.door.z);
      if (Math.hypot(sx - R, sy - R) > R - 14) continue;
      const pt = b.ownedProp ? 'property' : b.type;
      const pin = PIN_FOR[pt]; if (!pin) continue;
      c.drawImage(iconBitmap(pin, PIN_COLOR[pt]), sx - 13, sy - 13, 26, 26);
    }
    // iş tabelaları
    const C = g.career;
    if (C) for (const bd of C.boards) {
      const [sx, sy] = toScreen(bd.x, bd.z);
      if (Math.hypot(sx - R, sy - R) > R - 14) continue;
      const pt = JOB_PATH(bd.id) === 'crime' ? 'crimejob' : 'job';
      c.drawImage(iconBitmap(PIN_FOR[pt], PIN_COLOR[pt]), sx - 11, sy - 11, 22, 22);
    }
    // NPC noktaları
    for (const n of g.npcs.list) {
      if (n.dead) continue;
      const hostile = (n.faction === 'gang' && (n.state === 'attack' || n.hostile)) || (n.faction === 'police' && g.wanted.level > 0);
      if (!hostile && !n.mission) continue;
      const [sx, sy] = toScreen(n.pos.x, n.pos.z);
      c.fillStyle = n.faction === 'police' ? (Math.floor(performance.now() / 250) % 2 ? '#3a6aff' : '#ff3a3a') : '#ff3030';
      c.beginPath(); c.arc(sx, sy, 6, 0, Math.PI * 2); c.fill();
    }
    for (const v of g.vehicles.list) {
      if (v.destroyed) continue;
      if (v.ai && v.ai.mode === 'chase') {
        const [sx, sy] = toScreen(v.pos.x, v.pos.z);
        c.fillStyle = Math.floor(performance.now() / 200) % 2 ? '#3a6aff' : '#ff3a3a';
        c.fillRect(sx - 7, sy - 7, 14, 14);
      } else if (v.owned && v !== p.vehicle) {
        const [sx, sy] = toScreen(v.pos.x, v.pos.z);
        c.drawImage(iconBitmap('car', '#6ab8ff'), sx - 12, sy - 12, 24, 24);
      }
    }
    c.restore();
    // görev işaretçileri (kenara sabitlenir)
    for (const mk of g.missions.markers) {
      let x = mk.x, z = mk.z;
      if (mk.actor) { x = mk.actor.pos.x; z = mk.actor.pos.z; if (mk.actor.dead) continue; }
      if (mk.vehicle) { x = mk.vehicle.pos.x; z = mk.vehicle.pos.z; }
      let [sx, sy] = toScreen(x, z);
      const d = Math.hypot(sx - R, sy - R);
      if (d > R - 18) { sx = R + (sx - R) / d * (R - 18); sy = R + (sy - R) / d * (R - 18); }
      const col = '#' + new THREE.Color(mk.color).getHexString();
      if (mk.giver) c.drawImage(iconBitmap('pin_reis', '#d4af37'), sx - 16, sy - 16, 32, 32);
      else { c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.arc(sx, sy, 10, 0, Math.PI * 2); c.fill(); c.stroke(); }
    }
    // iş işaretçileri (kenara sabitlenir, elmas biçimli)
    if (C) for (const mk of C.markers) {
      const pos = C.markerPos(mk);
      if (mk.actor && mk.actor.dead) continue;
      let [sx, sy] = toScreen(pos.x, pos.z);
      const d = Math.hypot(sx - R, sy - R);
      if (d > R - 18) { sx = R + (sx - R) / d * (R - 18); sy = R + (sy - R) / d * (R - 18); }
      c.fillStyle = '#' + new THREE.Color(mk.color).getHexString(); c.strokeStyle = '#000'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(sx, sy - 12); c.lineTo(sx + 10, sy); c.lineTo(sx, sy + 12); c.lineTo(sx - 10, sy); c.closePath(); c.fill(); c.stroke();
    }
    if (g.waypoint) {
      let [sx, sy] = toScreen(g.waypoint.x, g.waypoint.z);
      const d = Math.hypot(sx - R, sy - R);
      if (d > R - 18) { sx = R + (sx - R) / d * (R - 18); sy = R + (sy - R) / d * (R - 18); }
      c.fillStyle = '#c86aff'; c.beginPath(); c.moveTo(sx, sy + 12); c.lineTo(sx - 9, sy - 6); c.lineTo(sx + 9, sy - 6); c.fill();
    }
    // oyuncu oku
    c.save();
    c.translate(R, R);
    c.rotate(rot + (Math.PI - (p.vehicle ? p.vehicle.heading : p.heading)) - Math.PI + Math.atan2(0, 1));
    const ang = rot - Math.atan2(Math.cos(p.vehicle ? p.vehicle.heading : p.heading), Math.sin(p.vehicle ? p.vehicle.heading : p.heading)) - (rot) ;
    c.restore();
    c.save();
    c.translate(R, R);
    const hd = p.vehicle ? p.vehicle.heading : p.heading;
    const fx = Math.sin(hd), fz = Math.cos(hd);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const sx2 = fx * cs - fz * sn, sy2 = fx * sn + fz * cs;
    c.rotate(Math.atan2(sy2, sx2) + Math.PI / 2);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -16); c.lineTo(11, 12); c.lineTo(0, 6); c.lineTo(-11, 12); c.closePath(); c.fill(); c.stroke();
    c.restore();
    void ang;
    // kuzey işareti
    const [nx, ny] = toScreen(p.pos.x, p.pos.z - 10000);
    const nd = Math.hypot(nx - R, ny - R);
    const kx = R + (nx - R) / nd * (R - 16), ky = R + (ny - R) / nd * (R - 16);
    c.fillStyle = '#d4af37'; c.font = 'bold 22px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('K', kx, ky);
  }

  // ======================= MODAL ALTYAPISI =======================
  openModal(node, { onClose, cls = '', closable = true } = {}) {
    const wrap = el('div', 'modal ' + cls);
    wrap.appendChild(node);
    this.modalEl.appendChild(wrap);
    const m = { wrap, onClose, closable };
    this.modalStack.push(m);
    this.game.input.unlock();
    wrap.querySelectorAll('button').forEach((b) => b.addEventListener('mouseenter', () => audio.hover()));
    return m;
  }
  closeModal(m) {
    m = m || this.modalStack[this.modalStack.length - 1];
    if (!m) return;
    m.wrap.remove();
    this.modalStack.splice(this.modalStack.indexOf(m), 1);
    if (m.onClose) m.onClose();
    if (!this.modalStack.length && this.game.mode === 'playing') this.game.input.lock();
  }
  closeAll() { while (this.modalStack.length) this.closeModal(); }
  topClosable() { const m = this.modalStack[this.modalStack.length - 1]; return m && m.closable; }

  panel(title, sub = '') {
    const p = el('div', 'panel');
    p.innerHTML = `<div class="panel-head"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}<button class="x" title="Kapat (ESC)">✕</button></div><div class="panel-body"></div>`;
    return p;
  }
  btn(label, onClick, cls = '') {
    const b = el('button', 'btn ' + cls, label);
    b.addEventListener('click', (e) => { e.stopPropagation(); audio.click(); onClick(b); });
    return b;
  }

  // ======================= DİYALOG =======================
  dialog(lines, done) {
    const d = this.dialogEl;
    let i = 0;
    this.game.input.unlock();
    const show = () => {
      const L = lines[i];
      d.innerHTML = `<div class="who">${L.who}</div><div class="txt"></div><div class="next">Devam <kbd>Enter</kbd></div>`;
      const t = $('.txt', d);
      let k = 0;
      clearInterval(this._typer);
      this._typer = setInterval(() => { k += 2; t.textContent = L.text.slice(0, k); if (k >= L.text.length) clearInterval(this._typer); }, 16);
      d._full = () => { clearInterval(this._typer); t.textContent = L.text; };
      d._len = L.text.length;
    };
    d.classList.remove('hidden');
    this.root.classList.add('cinema');
    const advance = () => {
      const t = $('.txt', d);
      if (t && t.textContent.length < d._len) { d._full(); return; }
      i++;
      audio.click();
      if (i >= lines.length) {
        d.classList.add('hidden'); this.root.classList.remove('cinema');
        window.removeEventListener('keydown', key); d.removeEventListener('click', advance);
        if (!this.modalStack.length && this.game.mode === 'playing') this.game.input.lock();
        done && done();
      } else show();
    };
    const key = (e) => { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); advance(); } };
    setTimeout(() => window.addEventListener('keydown', key), 150);
    d.addEventListener('click', advance);
    show();
  }

  confirm(title, sub, label, action, cancelLabel = 'Vazgeç') {
    const p = el('div', 'panel small');
    p.innerHTML = `<div class="panel-head"><h2>${title}</h2><p>${sub}</p></div><div class="panel-body row"></div>`;
    const m = this.openModal(p);
    $('.panel-body', p).append(this.btn(label, () => { this.closeModal(m); action(); }, 'gold'), this.btn(cancelLabel, () => this.closeModal(m)));
  }

  // ======================= YÜKLEME =======================
  showLoading() {
    const l = el('div', 'loading');
    l.id = 'loading';
    l.innerHTML = `<div class="logo-big">${ICONS.logo}</div><h1 class="title">İSTANBUL <em>MAFYA</em></h1><div class="bar"><i id="loadBar"></i></div><p id="loadText">Şehir kuruluyor...</p><p class="tip">${TIPS[Math.floor(Math.random() * TIPS.length)]}</p>`;
    this.root.appendChild(l);
  }
  setLoading(p, text) { const b = $('#loadBar'); if (b) b.style.width = Math.round(p * 100) + '%'; const t = $('#loadText'); if (t && text) t.textContent = text; }
  hideLoading() { const l = $('#loading'); if (l) { l.classList.add('out'); setTimeout(() => l.remove(), 800); } }

  // ======================= ANA MENÜ =======================
  async mainMenu() {
    this.closeAll();
    const g = this.game;
    const saves = await listSaves();
    const latest = Object.entries(saves).sort((a, b) => b[1].time - a[1].time)[0];
    const m = el('div', 'mainmenu');
    m.innerHTML = `
      <div class="mm-left">
        <div class="logo-mid">${ICONS.logo}</div>
        <h1 class="title">İSTANBUL<br><em>MAFYA</em></h1>
        <p class="slogan">Boğaz'ın iki yakası, tek bir aile.</p>
        <div class="mm-buttons"></div>
      </div>
      <div class="mm-foot">v1.0 · Tüm modeller, dokular, sesler ve müzik prosedürel olarak üretilmiştir.</div>`;
    const bx = $('.mm-buttons', m);
    if (latest) bx.append(this.btn(`DEVAM ET <small>${latest[1].name || ''} · ${formatMoney(latest[1].money)} · ${latest[1].day}. Gün</small>`, () => { this.closeAll(); g.loadGame(latest[0]); }, 'big gold'));
    bx.append(this.btn('YENİ OYUN', () => { this.closeAll(); this.characterCreator(); }, 'big' + (latest ? '' : ' gold')));
    bx.append(this.btn('OYUN YÜKLE', () => this.saveLoadMenu('load'), 'big'));
    bx.append(this.btn('AYARLAR', () => this.settingsMenu(), 'big'));
    bx.append(this.btn('KONTROLLER', () => this.controlsMenu(), 'big'));
    bx.append(this.btn('YAPIMCILAR', () => this.credits(true), 'big'));
    bx.append(this.btn('ÇIKIŞ', () => g.quit(), 'big dim'));
    this.openModal(m, { cls: 'full', closable: false });
  }

  // ======================= KARAKTER OLUŞTURMA =======================
  characterCreator() {
    const g = this.game;
    const look = defaultLook('m');
    let name = 'Kemal';
    g.enterCreator(look);
    const p = el('div', 'panel creator');
    p.innerHTML = `<div class="panel-head"><h2>KARAKTERİNİ YARAT</h2><p>Cezaevi kapısından çıkacak adam ya da kadın kim?</p></div><div class="panel-body"></div>`;
    const body = $('.panel-body', p);
    const row = (label) => { const r = el('div', 'crow'); r.innerHTML = `<label>${label}</label><div class="opts"></div>`; body.appendChild(r); return $('.opts', r); };
    const nm = row('İsim');
    const inp = el('input', 'txt'); inp.value = name; inp.maxLength = 16; inp.addEventListener('input', () => { name = inp.value || 'Kemal'; }); nm.appendChild(inp);
    const update = () => g.creatorModel.setLook(look);
    const choice = (label, list, key, fmt, swatch) => {
      const o = row(label);
      list.forEach((v) => {
        const b = el('button', 'chip' + (look[key] === v ? ' on' : ''), swatch ? '' : fmt ? fmt(v) : v);
        if (swatch) b.style.background = v, b.classList.add('sw');
        b.addEventListener('click', () => { look[key] = v; o.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); b.classList.add('on'); audio.click(); if (key === 'gender') { look.hair = v === 'f' ? 'uzun' : 'kisa'; look.beard = v === 'f' ? 'none' : look.beard; } update(); });
        o.appendChild(b);
      });
    };
    choice('Cinsiyet', ['m', 'f'], 'gender', (v) => (v === 'm' ? 'Erkek' : 'Kadın'));
    choice('Ten', SKIN_TONES, 'skin', null, true);
    choice('Saç', HAIR_STYLES, 'hair', (v) => ({ kisa: 'Kısa', arkaya: 'Arkaya', kel: 'Kel', uzun: 'Uzun', kivircik: 'Kıvırcık', at_kuyrugu: 'At kuyruğu' }[v]));
    choice('Saç rengi', HAIR_COLORS, 'hairColor', null, true);
    choice('Sakal', BEARDS, 'beard', (v) => ({ none: 'Yok', stubble: 'Kirli', mustache: 'Bıyık', full: 'Gür' }[v]));
    const pr = row('Tarz');
    const presets = {
      'Kabadayı': { top: 'leather', topColor: '#1c1c1c', pants: 'jeans', pantsColor: '#2a3550', shoes: 'boots', shoesColor: '#3a2412', hat: 'none', glasses: false },
      'Takım Elbise': { top: 'suit', topColor: '#1d2440', shirtColor: '#f0f0f0', pants: 'slacks', pantsColor: '#1d2440', shoes: 'polished', shoesColor: '#0a0a0a', hat: 'none', glasses: true },
      'Eşofmanlı': { top: 'track', topColor: '#1a1a1a', pants: 'track', pantsColor: '#1a1a1a', shoes: 'sneaker', shoesColor: '#eeeeee', hat: 'kasket', hatColor: '#2a2a2a', glasses: false },
      'Paltolu': { top: 'coat', topColor: '#2a2a3a', shirtColor: '#e8e8e8', pants: 'slacks', pantsColor: '#111111', shoes: 'polished', shoesColor: '#0a0a0a', hat: 'fedora', hatColor: '#151515', glasses: false },
    };
    for (const [k, v] of Object.entries(presets)) pr.appendChild(this.btn(k, () => { Object.assign(look, v); update(); }, 'chip'));
    const foot = el('div', 'row');
    foot.append(this.btn('GERİ', () => { this.closeAll(); g.exitCreator(); this.mainMenu(); }), this.btn('MACERAYA BAŞLA', () => { this.closeAll(); g.exitCreator(); g.newGame(name.trim() || 'Kemal', look); }, 'gold big'));
    body.appendChild(foot);
    const hint = el('p', 'hint', 'Karakteri döndürmek için fareyle sürükle');
    body.appendChild(hint);
    this.openModal(p, { cls: 'right', closable: false });
  }

  // ======================= DURAKLATMA =======================
  pauseMenu() {
    const g = this.game;
    const p = el('div', 'pausemenu');
    p.innerHTML = `<div class="logo-small">${ICONS.logo}</div><h1 class="title sm">DURAKLATILDI</h1><div class="mm-buttons"></div><div class="pause-info"></div>`;
    const bx = $('.mm-buttons', p);
    const m = this.openModal(p, { cls: 'full dim', onClose: () => g.resume() });
    bx.append(
      this.btn('DEVAM ET', () => this.closeModal(m), 'big gold'),
      this.btn('HARİTA', () => this.mapScreen(), 'big'),
      this.btn('İSTATİSTİKLER', () => this.statsScreen(), 'big'),
      this.btn('ÇANTA', () => this.openInventory(), 'big'),
      this.btn('OYUNU KAYDET', () => (g.wanted.level > 0 ? this.notify('Aranırken kayıt alınamaz!', 'warn') : this.saveLoadMenu('save')), 'big'),
      this.btn('OYUN YÜKLE', () => this.saveLoadMenu('load'), 'big'),
      this.btn('AYARLAR', () => this.settingsMenu(), 'big'),
      this.btn('KONTROLLER', () => this.controlsMenu(), 'big'),
      this.btn('ANA MENÜ', () => this.confirm('Ana menüye dön?', 'Kaydedilmemiş ilerleme kaybolur.', 'Ana Menü', () => g.toMainMenu()), 'big dim'),
      this.btn('MASAÜSTÜNE ÇIK', () => this.confirm('Oyundan çık?', 'Kaydedilmemiş ilerleme kaybolur.', 'Çık', () => g.quit()), 'big dim'),
    );
    const s = g.state;
    ensureLifeState(s);
    $('.pause-info', p).innerHTML = `<b>${s.name}</b> · ${rankOf(s.respect).name} · ${formatMoney(s.money)} · Görev ${Math.min(s.storyIndex, 8)}/8<br><small>İş: ${rankIn(LEGAL_RANKS, s.legalRep).name} · Yeraltı: ${rankIn(CRIME_RANKS, s.crimeRep).name}</small>`;
  }

  async saveLoadMenu(mode) {
    const g = this.game;
    const saves = await listSaves();
    const p = this.panel(mode === 'save' ? 'OYUNU KAYDET' : 'OYUN YÜKLE', mode === 'save' ? 'Bir kayıt yuvası seç' : 'Yüklenecek kaydı seç');
    const m = this.openModal(p);
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    for (const s of SLOTS) {
      if (mode === 'save' && s === 'auto') continue;
      const info = saves[s];
      const b = el('div', 'slot' + (info ? '' : ' empty'));
      b.innerHTML = `<div class="slot-n">${s === 'auto' ? 'OTOMATİK' : 'YUVA ' + s}</div>` + (info
        ? `<div class="slot-i"><b>${info.name || 'İsimsiz'}</b> · ${formatMoney(info.money)} · Saygınlık ${info.respect} · ${info.day}. Gün · Görev ${Math.min(info.mission, 8)}/8<small>${new Date(info.time).toLocaleString('tr-TR')}</small></div>`
        : '<div class="slot-i">Boş yuva</div>');
      b.addEventListener('click', async () => {
        audio.click();
        if (mode === 'save') {
          const doSave = async () => { await g.saveGame(s); this.closeModal(m); this.notify('Oyun kaydedildi: Yuva ' + s, 'good'); };
          if (info) this.confirm('Üzerine yazılsın mı?', `Yuva ${s} dolu.`, 'Üzerine Yaz', doSave); else doSave();
        } else if (info) { this.closeAll(); g.loadGame(s); }
      });
      body.appendChild(b);
    }
  }

  credits(fromMenu) {
    const p = el('div', 'credits');
    p.innerHTML = `<div class="roll">
      <div class="logo-mid">${ICONS.logo}</div><h1 class="title">İSTANBUL <em>MAFYA</em></h1>
      <h3>Oyun Tasarımı & Programlama</h3><p>Claude Code ile birlikte geliştirildi</p>
      <h3>Şehir</h3><p>Boğaz, Haliç, Galata, Sultanahmet, Kapalıçarşı, Dolmabahçe, Kız Kulesi, Haydarpaşa — prosedürel yeniden yorum</p>
      <h3>3D Modeller</h3><p>Tüm karakterler, araçlar, silahlar ve binalar koddan üretildi</p>
      <h3>Müzik</h3><p>Hicaz makamında prosedürel saz ve darbuka</p>
      <h3>Teşekkürler</h3><p>İstanbul'un kedilerine, martılarına ve çaycılarına</p>
      <p class="end">Bu oyun kurgudur. Gerçek kişi ve kurumlarla ilgisi yoktur.</p></div>`;
    const m = this.openModal(p, { cls: 'full', closable: true });
    p.addEventListener('click', () => { this.closeModal(m); if (!fromMenu) this.game.resume(); });
  }

  // ======================= HARİTA =======================
  mapScreen() {
    const g = this.game;
    const p = el('div', 'mapscreen');
    p.innerHTML = `<canvas id="bigmap" width="1600" height="1600"></canvas><div class="legend"></div><div class="map-help">Sol tık: rota işaretle · Sağ tık: rotayı sil · Teker: yakınlaştır · Sürükle: kaydır · ESC/M: kapat</div>`;
    const m = this.openModal(p, { cls: 'full' });
    const cv = $('#bigmap', p);
    const ctx = cv.getContext('2d');
    const leg = $('.legend', p);
    const types = [['konak', 'Reis Konağı'], ['safehouse', 'Güvenli Ev'], ['gun', 'Silahçı'], ['clothes', 'Butik'], ['food', 'Bakkal'], ['trade', 'Karaborsa'], ['dealer', 'Oto Galeri'], ['bank', 'Banka'], ['hospital', 'Hastane'], ['police', 'Emniyet'], ['estate', 'Emlakçı'], ['cafe', 'Çay Ocağı'], ['club', 'Gece Kulübü'], ['garage', 'Oto Tamir'], ['property', 'Mülkün'], ['job', 'Yasal iş'], ['crimejob', 'Kirli iş']];
    leg.innerHTML = '<h3>LEJANT</h3>' + types.map(([t, l]) => `<div>${svgImg(PIN_FOR[t], PIN_COLOR[t], 20)} ${l}</div>`).join('') +
      '<h3>BÖLGELER</h3>' + DISTRICTS.map((d) => `<div><i class="gdot" style="background:${g.state.territories[d.gang] ? '#d4af37' : GANGS[d.gang] ? GANGS[d.gang].color : '#888'}"></i>${d.name} — ${g.state.territories[d.gang] ? 'SENİN' : GANGS[d.gang] ? GANGS[d.gang].name : ''}</div>`).join('');
    let zoom = this.mapZoom, cx = g.player.pos.x, cz = g.player.pos.z, drag = null;
    const draw = () => {
      const W = 1600;
      ctx.fillStyle = '#0f2a3d'; ctx.fillRect(0, 0, W, W);
      const sc = (W / 2000) * zoom;
      const tx = (x) => W / 2 + (x - cx) * sc, tz = (z) => W / 2 + (z - cz) * sc;
      ctx.drawImage(g.city.minimapCanvas, tx(-1000), tz(-1000), 2000 * sc, 2000 * sc);
      // bölge sınırları
      ctx.lineWidth = 3; ctx.setLineDash([12, 8]);
      for (const d of DISTRICTS) {
        ctx.strokeStyle = g.state.territories[d.gang] ? 'rgba(212,175,55,0.8)' : GANGS[d.gang] ? GANGS[d.gang].color + 'aa' : '#8888';
        ctx.strokeRect(tx(d.x0), tz(d.z0), (d.x1 - d.x0) * sc, (d.z1 - d.z0) * sc);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `bold ${Math.max(18, 26 * zoom)}px Georgia`; ctx.textAlign = 'center';
        ctx.fillText(d.name, tx((d.x0 + d.x1) / 2), tz((d.z0 + d.z1) / 2));
      }
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(160,210,255,0.7)'; ctx.font = `italic ${Math.max(16, 22 * zoom)}px Georgia`;
      ctx.save(); ctx.translate(tx(310), tz(-200)); ctx.rotate(-Math.PI / 2); ctx.fillText('İ S T A N B U L   B O Ğ A Z I', 0, 0); ctx.restore();
      ctx.fillText('H A L İ Ç', tx(-450), tz(132));
      ctx.fillText('M A R M A R A   D E N İ Z İ', tx(0), tz(910));
      if (g.gpsPath && g.gpsPath.length) {
        ctx.strokeStyle = '#c86aff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(tx(g.player.pos.x), tz(g.player.pos.z));
        for (const n of g.gpsPath) ctx.lineTo(tx(n.x), tz(n.z));
        ctx.stroke();
      }
      for (const b of g.map.specials) {
        const pt = b.ownedProp ? 'property' : b.type;
        const pin = PIN_FOR[pt]; if (!pin) continue;
        const s = 30;
        ctx.drawImage(iconBitmap(pin, PIN_COLOR[pt], 48), tx(b.door.x) - s / 2, tz(b.door.z) - s / 2, s, s);
      }
      if (g.career) {
        for (const bd of g.career.boards) { const pt = JOB_PATH(bd.id) === 'crime' ? 'crimejob' : 'job'; ctx.drawImage(iconBitmap(PIN_FOR[pt], PIN_COLOR[pt], 48), tx(bd.x) - 13, tz(bd.z) - 13, 26, 26); }
        for (const mk of g.career.markers) {
          const pos = g.career.markerPos(mk);
          ctx.fillStyle = '#' + new THREE.Color(mk.color).getHexString(); ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(tx(pos.x), tz(pos.z) - 16); ctx.lineTo(tx(pos.x) + 13, tz(pos.z)); ctx.lineTo(tx(pos.x), tz(pos.z) + 16); ctx.lineTo(tx(pos.x) - 13, tz(pos.z)); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      for (const mk of g.missions.markers) {
        let x = mk.x, z = mk.z;
        if (mk.actor) { x = mk.actor.pos.x; z = mk.actor.pos.z; }
        if (mk.vehicle) { x = mk.vehicle.pos.x; z = mk.vehicle.pos.z; }
        ctx.fillStyle = '#' + new THREE.Color(mk.color).getHexString(); ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(tx(x), tz(z), 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      for (const v of g.vehicles.list) if (v.owned && !v.destroyed) ctx.drawImage(iconBitmap('car', '#6ab8ff', 48), tx(v.pos.x) - 14, tz(v.pos.z) - 14, 28, 28);
      if (g.waypoint) { ctx.fillStyle = '#c86aff'; ctx.beginPath(); ctx.moveTo(tx(g.waypoint.x), tz(g.waypoint.z)); ctx.lineTo(tx(g.waypoint.x) - 14, tz(g.waypoint.z) - 26); ctx.lineTo(tx(g.waypoint.x) + 14, tz(g.waypoint.z) - 26); ctx.fill(); }
      // oyuncu
      ctx.save(); ctx.translate(tx(g.player.pos.x), tz(g.player.pos.z));
      const hd = g.player.vehicle ? g.player.vehicle.heading : g.player.heading;
      ctx.rotate(Math.atan2(Math.cos(hd), Math.sin(hd)) + Math.PI / 2);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(15, 16); ctx.lineTo(0, 8); ctx.lineTo(-15, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    };
    const toWorld = (e) => {
      const r = cv.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * 1600, pz = ((e.clientY - r.top) / r.height) * 1600;
      const sc = (1600 / 2000) * zoom;
      return { x: cx + (px - 800) / sc, z: cz + (pz - 800) / sc };
    };
    cv.addEventListener('wheel', (e) => { zoom = clamp(zoom * (e.deltaY > 0 ? 0.85 : 1.18), 0.8, 8); this.mapZoom = zoom; draw(); });
    cv.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, cx, cz, moved: false, button: e.button }; });
    cv.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const r = cv.getBoundingClientRect();
      const sc = (r.width / 2000) * zoom;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      cx = drag.cx - dx / sc; cz = drag.cz - dy / sc; draw();
    });
    cv.addEventListener('mouseup', (e) => {
      if (drag && !drag.moved) {
        if (e.button === 0) { const w = toWorld(e); g.setWaypoint(w.x, w.z); audio.click(); }
        if (e.button === 2) { g.setWaypoint(null); }
        draw();
      }
      drag = null;
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    draw();
    void m;
  }

  statsScreen() {
    const g = this.game, s = g.state;
    const p = this.panel('İSTATİSTİKLER', `${s.name} — ${rankOf(s.respect).name}`);
    const m = this.openModal(p);
    $('.x', p).onclick = () => this.closeModal(m);
    const r = rankOf(s.respect);
    const next = RANKS.find((k) => k.min > s.respect);
    const pct = next ? ((s.respect - r.min) / (next.min - r.min)) * 100 : 100;
    const st = s.stats;
    const goods = GOODS.filter((gd) => s.goods[gd.id]).map((gd) => `${gd.name}: <b>${s.goods[gd.id]}</b>`).join(' · ') || 'Yok';
    const terr = Object.entries(GANGS).map(([id, gg]) => `<span class="tchip ${s.territories[id] ? 'own' : ''}" style="--c:${gg.color}">${gg.name}: ${s.territories[id] ? 'ELE GEÇİRİLDİ' : `${s.gangKills[id] || 0}/15`}</span>`).join('');
    const pt = st.playTime;
    $('.panel-body', p).innerHTML = `
      <div class="rank"><div>${svgImg('respect', '#d4af37', 40)}</div><div><b>${r.name}</b><div class="rbar"><i style="width:${pct}%"></i></div><small>Saygınlık ${s.respect}${next ? ' / ' + next.min + ' → ' + next.name : ''}</small></div></div>
      <div class="grid2">
        <div><span>Nakit</span><b>${formatMoney(s.money)}</b></div><div><span>Banka</span><b>${formatMoney(s.bank)}</b></div>
        <div><span>Hikâye</span><b>${Math.min(s.storyIndex, 8)}/8 görev</b></div><div><span>Altın Lale</span><b>${s.tulips.length}/25</b></div>
        <div><span>Leş</span><b>${st.kills}</b></div><div><span>Öldürülen polis</span><b>${st.copsKilled}</b></div>
        <div><span>Ölüm</span><b>${st.deaths}</b></div><div><span>Tutuklanma</span><b>${st.busted}</b></div>
        <div><span>Soygun</span><b>${st.robberies}</b></div><div><span>Sürüş</span><b>${(st.driveDist / 1000).toFixed(1)} km</b></div>
        <div><span>İşletmeler</span><b>${s.businesses.length}/${BUSINESSES.length}</b></div><div><span>Oyun süresi</span><b>${Math.floor(pt / 3600)}s ${Math.floor((pt % 3600) / 60)}dk</b></div>
      </div>
      <div class="grid2 ranks2"><div><span>İş hayatı</span><b>${rankIn(LEGAL_RANKS, s.legalRep || 0).name}</b><small>${s.legalRep || 0} itibar</small></div><div><span>Yeraltı</span><b>${rankIn(CRIME_RANKS, s.crimeRep || 0).name}</b><small>${s.crimeRep || 0} itibar</small></div>
        <div><span>Mülkler</span><b>${(s.properties || []).length}</b></div><div><span>Garaj</span><b>${s.ownedCars.length}/${garageCapacity(ensureLifeState(s))}</b></div></div>
      <h3>Bölgeler</h3><div class="terr">${terr}</div>
      <h3>Çanta (${goodsCount(s)}/${s.capacity})</h3><p>${goods}</p>`;
  }

  // ======================= DÜKKÂNLAR =======================
  openShop(type) {
    const fn = this['shop_' + type];
    if (fn) fn.call(this);
  }

  shop_gun() {
    const g = this.game, s = g.state, pl = g.player;
    const p = this.panel('SİLAHÇI CEMAL', 'Parayı veren düdüğü çalar.');
    const m = this.openModal(p, { cls: 'right' });
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    const render = () => {
      body.innerHTML = '';
      const req = { m4: 300, sniper: 300, rpg: 700, grenade: 100, ak: 100 };
      for (const id of WEAPON_ORDER) {
        if (id === 'fists') continue;
        const d = WEAPONS[id];
        const owned = !!pl.weapons[id];
        const locked = (req[id] || 0) > s.respect;
        const row = el('div', 'item' + (locked ? ' locked' : ''));
        const dmgBar = Math.min(100, (d.dmg * (d.pellets || 1)) / 2.5);
        const rateBar = Math.min(100, (d.rate || 1) * 8);
        row.innerHTML = `<div class="ii">${svgImg('w_' + id, '#e8e0d0', 54)}</div><div class="in"><b>${d.name}</b>
          <div class="stat"><span>Hasar</span><i style="width:${dmgBar}%"></i></div><div class="stat"><span>Hız</span><i style="width:${rateBar}%"></i></div>
          ${locked ? `<small class="lock">Gereken saygınlık: ${req[id]}</small>` : owned && d.type !== 'melee' ? `<small>Mermi: ${pl.weapons[id].mag + pl.weapons[id].ammo}</small>` : ''}</div>`;
        const act = el('div', 'ia');
        if (!locked) {
          if (!owned) act.appendChild(this.btn(formatMoney(d.price), () => this.buy(d.price, () => { pl.giveWeapon(id, d.mag ? d.mag * 3 : 0); pl.setWeapon(id); this.notify(d.name + ' satın alındı', 'good'); render(); }), 'gold'));
          else if (d.type !== 'melee') {
            const cost = d.ammoPrice * (d.mag || 1) * (id === 'grenade' || id === 'rpg' ? 1 : 2);
            act.appendChild(this.btn(`Mermi +${id === 'grenade' || id === 'rpg' ? 1 : d.mag * 2} · ${formatMoney(cost)}`, () => this.buy(cost, () => { pl.giveWeapon(id, id === 'grenade' || id === 'rpg' ? 1 : d.mag * 2); render(); })));
          } else act.innerHTML = '<small>Sahipsin</small>';
        }
        row.appendChild(act);
        body.appendChild(row);
      }
      const ar = el('div', 'item');
      ar.innerHTML = `<div class="ii">${svgImg('shield', '#6ab8ff', 54)}</div><div class="in"><b>Çelik Yelek</b><small>Zırhı 100'e tamamlar (şu an ${Math.round(pl.armor)})</small></div>`;
      const a = el('div', 'ia'); a.appendChild(this.btn(formatMoney(2000), () => { if (pl.armor >= 100) return this.notify('Zırhın zaten tam', 'warn'); this.buy(2000, () => { pl.armor = 100; render(); }); }, 'gold')); ar.appendChild(a);
      body.appendChild(ar);
    };
    render();
  }

  buy(price, fn) {
    const s = this.game.state;
    if (s.money < price) { audio.error(); this.notify('Yetersiz bakiye!', 'warn'); return false; }
    s.money -= price; audio.cash(); fn(); return true;
  }

  shop_food() {
    const g = this.game, pl = g.player;
    const p = this.panel('YİYECEK & İÇECEK', 'Aç ayı oynamaz.');
    const m = this.openModal(p, { cls: 'right' });
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    for (const f of FOOD) {
      const row = el('div', 'item');
      row.innerHTML = `<div class="in"><b>${f.name}</b><small>+${f.heal} can</small></div><div class="ia"></div>`;
      $('.ia', row).appendChild(this.btn(formatMoney(f.price), () => {
        if (pl.hp >= pl.maxHp) return this.notify('Karnın tok, canın tam.', 'info');
        this.buy(f.price, () => { pl.hp = Math.min(pl.maxHp, pl.hp + f.heal); this.notify(`${f.name}: afiyet olsun! +${f.heal}`, 'good'); });
      }, 'gold'));
      body.appendChild(row);
    }
  }

  shop_trade() {
    const g = this.game, s = g.state;
    const ctx = g.player.inInterior;
    const dist = ctx ? districtAt(ctx.door.x, ctx.door.z).id : 'beyoglu';
    const prices = s.prices[dist];
    const p = this.panel('KARABORSA', `${DISTRICTS.find((d) => d.id === dist).name} piyasası · ${g.env.day}. gün fiyatları`);
    const m = this.openModal(p, { cls: 'wide' });
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    const render = () => {
      const cnt = goodsCount(s);
      body.innerHTML = `<div class="cap">Çanta: <b>${cnt}/${s.capacity}</b> · Nakit: <b>${formatMoney(s.money)}</b></div>`;
      const tbl = el('table', 'trade');
      tbl.innerHTML = `<tr><th>Mal</th><th>Burada</th><th>Sende</th><th></th>${DISTRICTS.map((d) => `<th class="dim">${d.name.slice(0, 4)}</th>`).join('')}</tr>`;
      for (const gd of GOODS) {
        const pr = prices[gd.id];
        const have = s.goods[gd.id] || 0;
        const tr = el('tr');
        const best = Math.max(...DISTRICTS.map((d) => s.prices[d.id][gd.id]));
        const worst = Math.min(...DISTRICTS.map((d) => s.prices[d.id][gd.id]));
        tr.innerHTML = `<td><b>${gd.name}</b></td><td class="${pr === worst ? 'cheap' : pr === best ? 'dear' : ''}">${formatMoney(pr)}</td><td>${have}</td><td class="acts"></td>${DISTRICTS.map((d) => `<td class="dim ${s.prices[d.id][gd.id] === best ? 'dear' : s.prices[d.id][gd.id] === worst ? 'cheap' : ''}">${formatMoney(s.prices[d.id][gd.id])}</td>`).join('')}`;
        const acts = $('.acts', tr);
        const buyN = (n) => () => {
          n = Math.min(n, s.capacity - goodsCount(s), Math.floor(s.money / pr));
          if (n <= 0) { audio.error(); return this.notify(goodsCount(s) >= s.capacity ? 'Çanta dolu!' : 'Paran yetmiyor!', 'warn'); }
          s.money -= pr * n; s.goods[gd.id] = (s.goods[gd.id] || 0) + n; s.goodsCost[gd.id] = (s.goodsCost[gd.id] || 0) + pr * n; audio.cash();
          g.missions.onTrade(gd.id, n, 'buy', dist); render();
        };
        const sellN = (n) => () => {
          n = Math.min(n, s.goods[gd.id] || 0);
          if (n <= 0) return;
          const avg = (s.goodsCost[gd.id] || 0) / (s.goods[gd.id] || 1);
          s.money += pr * n; s.goods[gd.id] -= n; s.goodsCost[gd.id] = avg * s.goods[gd.id]; audio.cash();
          const profit = (pr - avg) * n;
          this.notify(`${n} ${gd.name} satıldı · ${profit >= 0 ? 'Kâr' : 'Zarar'}: ${formatMoney(profit)}`, profit >= 0 ? 'money' : 'warn');
          if (profit > 0) { s.respect += Math.floor(profit / 5000); ensureLifeState(s).crimeRep += Math.floor(profit / 3000); }
          g.missions.onTrade(gd.id, n, 'sell', dist); render();
        };
        acts.append(this.btn('Al 1', buyN(1)), this.btn('Al 5', buyN(5)), this.btn('Sat 1', sellN(1)), this.btn('Hepsini sat', sellN(9999), 'gold'));
        tbl.appendChild(tr);
      }
      body.appendChild(tbl);
      body.appendChild(el('p', 'hint', 'Yeşil: en ucuz semt · Kırmızı: en pahalı semt. Fiyatlar her gün değişir. Aranırken yakalanırsan mallara el konur!'));
    };
    render();
  }

  shop_garage() {
    const g = this.game, s = g.state;
    const v = g.player.lastVehicle;
    const p = this.panel('OTO TAMİR USTA RIFAT', v ? `Araç: ${v.def.name} · Hasar %${Math.round((1 - v.hp / v.def.hp) * 100)}` : 'Önce dışarıya bir araç getir.');
    const m = this.openModal(p, { cls: 'right' });
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    const near = v && !v.destroyed && Math.hypot(v.pos.x - g.player.inInterior.door.x, v.pos.z - g.player.inInterior.door.z) < 40;
    const add = (name, desc, price, fn, done) => {
      const row = el('div', 'item');
      row.innerHTML = `<div class="in"><b>${name}</b><small>${desc}</small></div><div class="ia"></div>`;
      $('.ia', row).appendChild(done ? el('small', '', 'Yapıldı') : this.btn(formatMoney(price), () => this.buy(price, () => { fn(); this.closeModal(m); this.shop_garage(); }), 'gold'));
      body.appendChild(row);
    };
    if (near) {
      const rep = Math.ceil((v.def.hp - v.hp) * 3);
      add('Tamir', 'Aracı tam sağlığına kavuşturur', Math.max(100, rep), () => { v.hp = v.def.hp; v.burnT = 0; }, v.hp >= v.def.hp);
      for (const col of ['#111111', '#e8e8e8', '#8a1a1a', '#1d3d6e', '#f2c200', '#2d5a2d', '#d4af37']) {
        add(`Boya: <span class="swi" style="background:${col}"></span>`, 'Yeni renk — polis de seni tanımaz (aranma -1)', 800, () => {
          v.color = col; v.mesh.userData.bodyMesh.material = new THREE.MeshStandardMaterial({ color: col, metalness: 0.55, roughness: 0.3 });
          if (g.wanted.level > 0) { g.wanted.heat = Math.max(0, g.wanted.heat - 1); g.wanted.level = Math.floor(g.wanted.heat); }
          const oc = s.ownedCars.find((o) => o.vid === v.id); if (oc) oc.color = col;
        });
      }
      if (!v.owned && s.ownedCars.length < garageCapacity(ensureLifeState(s)) && !v.testDrive && v.type !== 'police' && v.type !== 'bus' && v.type !== 'swat') add('Garaja kaydet', 'Bu aracı kalıcı olarak sahiplen', 2500, () => { v.owned = true; s.ownedCars.push({ type: v.type, color: v.color, vid: v.id }); });
    } else body.appendChild(el('p', 'hint', 'Tamir ve boya için aracını kapının önüne park et.'));
    add('Motor Modifiyesi', 'Tüm araçlarında %15 daha yüksek azami hız', 25000, () => { s.carUpgrade = true; }, s.carUpgrade);
  }

  shop_hospital() {
    const g = this.game, pl = g.player;
    const cost = Math.ceil((pl.maxHp - pl.hp) * 6);
    this.confirm('TEDAVİ', pl.hp >= pl.maxHp ? 'Sağlığın yerinde.' : `Tam tedavi: ${formatMoney(cost)}`, 'Tedavi Ol', () => { if (pl.hp < pl.maxHp) this.buy(cost, () => { pl.hp = pl.maxHp; this.notify('Tam sağlık!', 'good'); }); });
  }

  shop_stash() {
    const g = this.game, pl = g.player;
    const p = this.panel('SİLAH DOLABI', 'Sahip olduğun silahlara %30 indirimli cephane');
    const m = this.openModal(p, { cls: 'right' });
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    const render = () => {
      body.innerHTML = '';
      for (const id of WEAPON_ORDER) {
        const d = WEAPONS[id];
        if (!pl.weapons[id] || d.type === 'melee') continue;
        const n = id === 'rpg' || id === 'grenade' ? 1 : d.mag * 2;
        const cost = Math.ceil(d.ammoPrice * n * 0.7);
        const row = el('div', 'item');
        row.innerHTML = `<div class="ii">${svgImg('w_' + id, '#e8e0d0', 44)}</div><div class="in"><b>${d.name}</b><small>${pl.weapons[id].mag + pl.weapons[id].ammo} mermi</small></div><div class="ia"></div>`;
        $('.ia', row).appendChild(this.btn(`+${n} · ${formatMoney(cost)}`, () => this.buy(cost, () => { pl.giveWeapon(id, n); render(); }), 'gold'));
        body.appendChild(row);
      }
      if (!body.children.length) body.appendChild(el('p', 'hint', 'Henüz ateşli silahın yok. Silahçıya uğra.'));
    };
    render();
  }

  shop_bribe() {
    const g = this.game;
    if (g.wanted.level <= 0) return this.notify('Aranmıyorsun. Komiser sana çay ikram etti.', 'info');
    const cost = g.wanted.level * 6000;
    this.confirm('RÜŞVET', `Komiser dosyanı "kaybedebilir"... ${formatMoney(cost)}`, 'Zarfı Uzat', () => this.buy(cost, () => { g.wanted.reset(); g.npcs.calmPolice(); this.notify('Aranma kaydın silindi.', 'good'); }));
  }

  // ======================= ÖLÜM / TUTUKLANMA =======================
  wasted(title, sub, done) {
    const o = this.overlayEl;
    o.innerHTML = `<h1>${title}</h1><p>${sub}</p>`;
    o.className = 'overlay show ' + (title === 'TUTUKLANDIN' ? 'blue' : 'red');
    document.body.classList.add('desat');
    setTimeout(() => { o.className = 'overlay hidden'; document.body.classList.remove('desat'); done && done(); }, 4500);
  }
}

Object.assign(UI.prototype, ShopMethods, PhoneMethods, SettingsMethods);

const JOB_PATH = (id) => (['chop', 'robbery', 'protection', 'hit'].includes(id) ? 'crime' : 'legal');

export function goodsCount(s) { return Object.values(s.goods).reduce((a, b) => a + b, 0); }
