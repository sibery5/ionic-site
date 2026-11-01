// Arayüz: HUD, mini harita, büyük harita, menüler, dükkânlar, diyaloglar, bildirimler.
// Performans notları: HUD DOM referansları önbellekte; metin/stil yalnızca değer değişince yazılır;
// mini harita ~20 Hz; menü üzerindeki fare sesi tek bir önbellekli tamponla ve hız sınırıyla çalınır.
import { STORY } from '../game/story_data.js';
const STORY_N = STORY.length;
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
import { SLOTS, listSaves, latestSave } from '../game/save.js';
import { audio } from '../core/audio.js';
import { esc } from './dom.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

const TIPS = [
  'İpucu: Bankaya yatırdığın para ölünce kaybolmaz.',
  'İpucu: Sokak kedilerini sevmek (E) canını biraz yeniler. İstanbul\'da kediler kutsaldır.',
  'İpucu: Karaborsada mal fiyatları semtten semte ve günden güne değişir. Ucuza al, pahalıya sat!',
  'İpucu: Polisi atlatmak için görüş alanından çık ve bir süre saklan. Rüşvet de işe yarar...',
  'İpucu: Şehre gizlenmiş 25 Altın Lale var. Hepsini bulana büyük ödül!',
  'İpucu: Güvenli evine her girişinde oyun otomatik kaydedilir. Çıkarken de kayıt alınır.',
  'İpucu: İşletme satın al, her gün pasif gelir kazan.',
  'İpucu: Çete bölgesinde 15 çete üyesini indirirsen bölge senin olur.',
  'İpucu: El freni (Space) ile drift atabilirsin.',
  'İpucu: Galata Kulesi\'nin seyir terasından tüm İstanbul\'u izleyebilirsin.',
  'İpucu: Telefonunu (P) açıp İşler uygulamasından taksicilikten kiralık katilliğe kadar iş bulabilirsin.',
  'İpucu: Her konut bir güvenli evdir ve garaj kapasiteni artırır. Boğaz yalılarının özel iskelesi var.',
  'İpucu: Borsa uygulamasında ucuzdan al, haberlerden sonra pahalıya sat.',
];

// HUD'da önbelleğe alınan öğe kimlikleri
const HUD_IDS = ['dmg', 'xhair', 'hitmark', 'minimap', 'district', 'clockIcon', 'clock', 'day', 'money', 'bankLine', 'stars', 'wIcon', 'wName', 'wAmmo',
  'arcHp', 'arcAr', 'objective', 'timer', 'jobTimer', 'holdbar', 'racepos', 'notes', 'prompt', 'bigmsg', 'banner', 'speedo', 'kmh', 'carhp', 'carname', 'barks', 'wheel', 'fps', 'stamina'];
const ARC_C = 2 * Math.PI * 104, ARC_C2 = 2 * Math.PI * 98;
const MM_BASE = 440; // mini harita çizim koordinatları (gerçek tuval boyutu cihaza göre)
const NAV_SEL = 'button:not([disabled]), .slot, input, [data-nav]';
const colorCache = new Map();
const hexOf = (c) => { let v = colorCache.get(c); if (v === undefined) { v = '#' + new THREE.Color(c).getHexString(); colorCache.set(c, v); } return v; };
const _v3 = new THREE.Vector3();
// metni yalnızca değişince yaz (stil/yerleşim geçersizlemesini önler)
const setText = (e, v) => { if (e._t !== v) { e._t = v; e.textContent = v; } };

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
    this.mmT = 0; this.distT = 0;
    this.buildHUD();
    this.mapZoom = 1;
    this.mapPan = { x: 0, z: 0 };
    this._obj = { mission: '', job: '' };
    this.setupNav();
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mmPx = Math.round(220 * dpr);
    h.innerHTML = `
      <div class="vignette" id="dmg"></div>
      <div class="crosshair" id="xhair"><i></i><i></i><i></i><i></i><b></b></div>
      <div class="hitmark" id="hitmark"></div>
      <div class="minimap-wrap">
        <canvas id="minimap" width="${mmPx}" height="${mmPx}"></canvas>
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
    // tüm HUD öğeleri bir kez aranır (her karede querySelector yok)
    const H = this.h = {};
    for (const id of HUD_IDS) H[id] = h.querySelector('#' + id);
    H.starEls = Array.from(H.stars.children);
    H.staminaBar = H.stamina.firstElementChild;
    H.holdLabel = H.holdbar.firstElementChild; H.holdFill = H.holdbar.querySelector('i');
    H.bigTitle = H.bigmsg.querySelector('h1'); H.bigSub = H.bigmsg.querySelector('h2');
    this.mm = H.minimap.getContext('2d');
    this.mmScale = mmPx / MM_BASE;
    this.modalEl = el('div', 'modal-layer'); this.root.appendChild(this.modalEl);
    this.dialogEl = el('div', 'dialog hidden'); this.root.appendChild(this.dialogEl);
    this.overlayEl = el('div', 'overlay hidden'); this.root.appendChild(this.overlayEl);
    // kayıt göstergesi + "devam etmek için tıkla" ipucu
    this.saveEl = el('div', 'saveind', `<span class="spin"></span>${svgImg('save', null, 18)}<b>Kaydediliyor</b>`); this.root.appendChild(this.saveEl);
    this.clickEl = el('div', 'clickresume', '<kbd>Sol tık</kbd> Devam etmek için tıkla'); this.root.appendChild(this.clickEl);
    this.s = {}; // son yazılan HUD değerleri
  }

  showHUD(v) { this.hud.classList.toggle('hidden', !v); }

  notify(text, kind = 'info') {
    const n = el('div', 'note ' + kind, text);
    const box = this.h.notes;
    box.appendChild(n);
    setTimeout(() => n.classList.add('out'), 3600);
    setTimeout(() => n.remove(), 4200);
    if (box.children.length > 6) box.children[0].remove();
  }
  // otomatik/elle kayıt göstergesi (sağ alt, kısa süre)
  saveIndicator(failed) {
    const e = this.saveEl;
    e.lastChild.textContent = failed ? 'Kayıt başarısız!' : 'Kaydedildi';
    e.classList.toggle('fail', !!failed);
    e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => e.classList.remove('show'), 2200);
  }
  showClickToResume(v) { this.clickEl.classList.toggle('show', !!v); }
  bigMessage(title, sub = '', color = 'gold', dur = 3) {
    const b = this.h.bigmsg;
    b.className = 'bigmsg show ' + color;
    this.h.bigTitle.textContent = title;
    this.h.bigSub.textContent = sub;
    this.bigT = dur;
  }
  locationBanner(name) {
    const b = this.h.banner;
    b.textContent = name;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  // iki kanal: hikâye görevi (missions) ve iş/test sürüşü (career). İkisi birlikte gösterilir.
  setObjective(t, channel = 'mission', path = 'legal') {
    t = t || '';
    if (this._obj[channel] === t && (channel !== 'job' || this._objPath === path)) return;
    this._obj[channel] = t;
    if (channel === 'job') this._objPath = path;
    const o = this.h.objective;
    const parts = [];
    if (this._obj.mission) parts.push(`<div class="ob"><span>GÖREV</span>${this._obj.mission}</div>`);
    if (this._obj.job) parts.push(`<div class="ob job ${this._objPath === 'crime' ? 'crime' : ''}"><span>${this._objPath === 'crime' ? 'KİRLİ İŞ' : 'İŞ'}</span>${this._obj.job}</div>`);
    o.innerHTML = parts.join('');
    o.classList.toggle('show', parts.length > 0);
  }
  setJobTimer(t) { this._timer(this.h.jobTimer, t, 15); }
  setTimer(t) { this._timer(this.h.timer, t, 30); }
  _timer(e, t, urgent) {
    if (t > 0) { setText(e, `${Math.floor(t / 60)}:${pad2(Math.floor(t % 60))}`); e.classList.add('show'); e.classList.toggle('urgent', t < urgent); } else e.classList.remove('show');
  }
  setProgress(label, pct) {
    const h = this.h.holdbar;
    if (label === null || label === undefined) { h.classList.remove('show'); return; }
    h.classList.add('show');
    setText(this.h.holdLabel, label);
    const w = Math.round(Math.min(100, pct * 100));
    if (this.s.hold !== w) { this.s.hold = w; this.h.holdFill.style.transform = `scaleX(${w / 100})`; }
  }
  setRacePos(p, n) { const e = this.h.racepos; if (p > 0) { const k = p + '/' + n; if (e._t !== k) { e._t = k; e.innerHTML = `<b>${p}</b>/${n}<small>SIRA</small>`; } e.classList.add('show'); } else e.classList.remove('show'); }
  flashWanted() { const s = this.h.stars; s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash'); }
  damageFlash() { this.dmgT = 0.35; }
  onPlayerDamaged(d) { if (d > 0) this.dmgT = Math.min(0.8, 0.25 + d / 60); }
  hitMarker() { const h = this.h.hitmark; h.classList.remove('show'); void h.offsetWidth; h.classList.add('show'); }
  bark(actor, text) {
    if (this.barks.length > 5) return;
    const e = el('div', 'bark', text);
    e.style.display = 'none';
    this.h.barks.appendChild(e);
    this.barks.push({ actor, e, t: 3, vis: false });
  }
  prompt(text, key = 'E') {
    const p = this.h.prompt;
    if (text) {
      const k = key + text;
      if (p._t !== k) { p._t = k; p.innerHTML = `<kbd>${key}</kbd> ${text}`; }
      if (!this.s.prompt) { this.s.prompt = true; p.classList.add('show'); }
    } else if (this.s.prompt) { this.s.prompt = false; p.classList.remove('show'); }
  }
  showWeaponWheel() {
    const pl = this.game.player;
    const w = this.h.wheel;
    w.innerHTML = WEAPON_ORDER.filter((id) => pl.weapons[id]).map((id) => `<div class="wslot ${id === pl.weapon ? 'on' : ''}">${svgImg('w_' + id, null, 34)}<small>${WEAPONS[id].slot + 1}</small></div>`).join('');
    w.classList.add('show');
    this.wheelT = 1.5;
  }

  blocking() { return this.modalStack.length > 0 || !this.dialogEl.classList.contains('hidden'); }
  // tam ekran opak bir arayüz (harita, jenerik) 3B sahneyi tamamen örtüyor mu?
  coversScene() { for (let i = 0; i < this.modalStack.length; i++) if (this.modalStack[i].opaque) return true; return false; }

  update(dt) {
    const g = this.game, p = g.player, s = g.state, H = this.h, S = this.s;
    if (!s) return;
    const life = this.ensureLife();
    if (life) life.tickFromUI(dt);
    if (this._setStamp !== g.settings) { this._setStamp = g.settings; withDefaults(g.settings); applyExtendedSettings(g); }
    // saat & hava
    const env = g.env;
    const clk = env.hour * 60 + env.minute;
    if (S.clk !== clk) { S.clk = clk; H.clock.textContent = `${pad2(env.hour)}:${pad2(env.minute)}`; }
    if (S.day !== env.day) { S.day = env.day; H.day.textContent = `${env.day}. Gün`; }
    const ic = env.weather === 'rain' ? 'rain' : env.weather === 'cloudy' ? 'cloud' : env.nightFactor > 0.5 ? 'moon' : 'sun';
    if (S.ic !== ic) { H.clockIcon.innerHTML = ICONS[ic]; S.ic = ic; }
    // para animasyonu
    this.shownMoney = this.shownMoney === undefined ? s.money : this.shownMoney + (s.money - this.shownMoney) * Math.min(1, dt * 8);
    if (Math.abs(this.shownMoney - s.money) < 1) this.shownMoney = s.money;
    const mny = Math.round(this.shownMoney);
    if (S.money !== mny) { S.money = mny; H.money.textContent = formatMoney(mny); }
    if (S.bank !== s.bank) { S.bank = s.bank; H.bankLine.textContent = s.bank > 0 ? `Banka: ${formatMoney(s.bank)}` : ''; }
    // yıldızlar
    const lvl = g.wanted.level;
    if (S.lvl !== lvl) {
      S.lvl = lvl;
      for (let i = 0; i < 5; i++) H.starEls[i].classList.toggle('on', i < lvl);
      H.stars.classList.toggle('active', lvl > 0);
    }
    const blink = lvl > 0 && g.wanted.seenT > 6;
    if (S.blink !== blink) { S.blink = blink; H.stars.classList.toggle('blink', blink); }
    // silah
    if (S.w !== p.weapon) { H.wIcon.innerHTML = ICONS['w_' + p.weapon] || ''; H.wName.textContent = WEAPONS[p.weapon].name; S.w = p.weapon; S.mag = -1; }
    const ws = p.wstate, wd = p.wdef;
    const rl = p.reloadT > 0;
    if (S.mag !== ws.mag || S.ammo !== ws.ammo || S.rl !== rl) {
      S.mag = ws.mag; S.ammo = ws.ammo; S.rl = rl;
      H.wAmmo.textContent = wd.type === 'melee' ? '' : rl ? 'Şarjör değişiyor...' : `${ws.mag} / ${ws.ammo}`;
    }
    // can & zırh yayları (yalnızca değişince)
    const hpQ = Math.round(clamp(p.hp / p.maxHp, 0, 1) * 200), arQ = Math.round(clamp(p.armor / 100, 0, 1) * 200);
    if (S.hpQ !== hpQ) { S.hpQ = hpQ; H.arcHp.style.strokeDasharray = `${(ARC_C * 0.25 * hpQ / 200).toFixed(1)} ${ARC_C.toFixed(0)}`; H.arcHp.classList.toggle('low', p.hp < 30); }
    if (S.arQ !== arQ) { S.arQ = arQ; H.arcAr.style.strokeDasharray = `${(ARC_C2 * 0.25 * arQ / 200).toFixed(1)} ${ARC_C2.toFixed(0)}`; }
    // bölge adı (4 Hz)
    this.distT -= dt;
    if (!p.inInterior) {
      if (this.distT <= 0) {
        this.distT = 0.25;
        const d = districtAt(p.pos.x, p.pos.z);
        if (this._dist !== d.id) {
          H.district.textContent = d.name;
          if (this._dist) this.locationBanner(d.name + (g.state.territories[d.gang] ? '  ·  Senin bölgen' : GANGS[d.gang] ? `  ·  ${GANGS[d.gang].name} bölgesi` : ''));
          this._dist = d.id;
        }
      }
    } else if (this._dist !== 'in') { H.district.textContent = p.inInterior.name.toUpperCase(); this._dist = 'in'; }
    // nişangâh
    const showX = !p.vehicle && wd.type !== 'melee' && !p.swimming && (p.aiming || g.input.mouse.left);
    const x = H.xhair;
    x.classList.toggle('show', !!(showX || (p.vehicle && p.aiming)));
    x.classList.toggle('enemy', !!(p.aimTarget && !p.aimTarget.dead && (p.aimTarget.faction !== 'civilian' || p.aimTarget.hostile)));
    x.classList.toggle('scope', !!(p.aiming && wd.scope));
    const spread = Math.round((8 + (wd.spread || 0) * 400 * (p.aiming ? 0.6 : 1) + p.recoil * 10) * 2) / 2;
    if (S.spread !== spread) { S.spread = spread; x.style.setProperty('--spread', spread + 'px'); }
    // hasar efekti
    if (this.dmgT > 0) this.dmgT -= dt;
    const dop = Math.round(Math.max(this.dmgT * 1.4, p.hp < 30 ? 0.35 + Math.sin(performance.now() * 0.006) * 0.15 : 0) * 50) / 50;
    if (S.dop !== dop) { S.dop = dop; H.dmg.style.opacity = dop; }
    // büyük mesaj
    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) H.bigmsg.classList.remove('show'); }
    if (this.wheelT > 0) { this.wheelT -= dt; if (this.wheelT <= 0) H.wheel.classList.remove('show'); }
    // hız göstergesi
    const veh = p.vehicle;
    if (S.veh !== !!veh) { S.veh = !!veh; H.speedo.classList.toggle('show', !!veh); }
    if (veh) {
      const kmh = Math.round(Math.abs(veh.fs) * 3.6);
      if (S.kmh !== kmh) { S.kmh = kmh; H.kmh.textContent = kmh; }
      const chp = Math.round(clamp(veh.hp / veh.def.hp, 0, 1) * 100);
      if (S.chp !== chp) { S.chp = chp; H.carhp.style.transform = `scaleX(${chp / 100})`; }
      setText(H.carname, veh.def.name);
    }
    const stShow = p.stamina < 99 && !veh;
    if (S.stShow !== stShow) { S.stShow = stShow; H.stamina.classList.toggle('show', stShow); }
    const stq = Math.round(p.stamina);
    if (stShow && S.stq !== stq) { S.stq = stq; H.staminaBar.style.transform = `scaleX(${stq / 100})`; }
    // konuşma balonları (tek vektör, yalnızca görünürken konumlanır)
    for (let i = this.barks.length - 1; i >= 0; i--) {
      const b = this.barks[i];
      b.t -= dt;
      if (b.t <= 0) { b.e.remove(); this.barks.splice(i, 1); continue; }
      const v = _v3.set(b.actor.pos.x, b.actor.pos.y + 2.2, b.actor.pos.z).project(g.camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      if (vis !== b.vis) { b.vis = vis; b.e.style.display = vis ? 'block' : 'none'; }
      if (vis) b.e.style.transform = `translate(${((v.x * 0.5 + 0.5) * innerWidth) | 0}px, ${((-v.y * 0.5 + 0.5) * innerHeight) | 0}px) translate(-50%, -100%)`;
    }
    // mini harita ~20 Hz
    this.mmT += dt;
    if (this.mmT >= 0.05) { this.mmT = 0; this.drawMinimap(); }
    const fps = g.settings.showFps ? g.fps : -1;
    if (S.fps !== fps) { S.fps = fps; H.fps.textContent = fps >= 0 ? `${fps} FPS` : ''; }
  }

  // ======================= MİNİ HARİTA =======================
  // ekran koordinatı this._sx/_sy'ye yazılır (dizi ayırma yok)
  _mmTo(x, z) {
    const m = this._mmc;
    const dx = (x - m.px) * m.scale, dz = (z - m.pz) * m.scale;
    this._sx = m.R + dx * m.cs - dz * m.sn; this._sy = m.R + dx * m.sn + dz * m.cs;
  }
  // kenara sabitle
  _mmClamp(R, pad) {
    const d = Math.hypot(this._sx - R, this._sy - R);
    if (d > R - pad) { this._sx = R + (this._sx - R) / d * (R - pad); this._sy = R + (this._sy - R) / d * (R - pad); }
  }
  drawMinimap() {
    const g = this.game, p = g.player;
    const c = this.mm, W = MM_BASE, R = W / 2, k0 = this.mmScale;
    c.setTransform(k0, 0, 0, k0, 0, 0);
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
    const m = this._mmc || (this._mmc = {});
    m.px = p.pos.x; m.pz = p.pos.z; m.scale = scale; m.cs = Math.cos(rot); m.sn = Math.sin(rot); m.R = R;
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
    c.save();
    c.beginPath(); c.arc(R, R, R - 4, 0, Math.PI * 2); c.clip();
    const lim = (R - 14) * (R - 14);
    for (const b of g.map.specials) {
      this._mmTo(b.door.x, b.door.z);
      const ex = this._sx - R, ey = this._sy - R;
      if (ex * ex + ey * ey > lim) continue;
      const pt = b.ownedProp ? 'property' : b.type;
      const pin = PIN_FOR[pt]; if (!pin) continue;
      c.drawImage(iconBitmap(pin, PIN_COLOR[pt]), this._sx - 13, this._sy - 13, 26, 26);
    }
    // iş tabelaları
    const C = g.career;
    if (C) for (const bd of C.boards) {
      this._mmTo(bd.x, bd.z);
      const ex = this._sx - R, ey = this._sy - R;
      if (ex * ex + ey * ey > lim) continue;
      const pt = JOB_PATH(bd.id) === 'crime' ? 'crimejob' : 'job';
      c.drawImage(iconBitmap(PIN_FOR[pt], PIN_COLOR[pt]), this._sx - 11, this._sy - 11, 22, 22);
    }
    // NPC noktaları
    const now = performance.now();
    const copCol = Math.floor(now / 250) % 2 ? '#3a6aff' : '#ff3a3a';
    for (const n of g.npcs.list) {
      if (n.dead) continue;
      const hostile = (n.faction === 'gang' && (n.state === 'attack' || n.hostile)) || (n.faction === 'police' && g.wanted.level > 0);
      if (!hostile && !n.mission) continue;
      this._mmTo(n.pos.x, n.pos.z);
      c.fillStyle = n.faction === 'police' ? copCol : '#ff3030';
      c.beginPath(); c.arc(this._sx, this._sy, 6, 0, Math.PI * 2); c.fill();
    }
    const chaseCol = Math.floor(now / 200) % 2 ? '#3a6aff' : '#ff3a3a';
    for (const v of g.vehicles.list) {
      if (v.destroyed) continue;
      if (v.ai && v.ai.mode === 'chase') {
        this._mmTo(v.pos.x, v.pos.z);
        c.fillStyle = chaseCol;
        c.fillRect(this._sx - 7, this._sy - 7, 14, 14);
      } else if (v.owned && v !== p.vehicle) {
        this._mmTo(v.pos.x, v.pos.z);
        c.drawImage(iconBitmap('car', '#6ab8ff'), this._sx - 12, this._sy - 12, 24, 24);
      }
    }
    c.restore();
    // görev işaretçileri (kenara sabitlenir)
    for (const mk of g.missions.markers) {
      let x = mk.x, z = mk.z;
      if (mk.actor) { x = mk.actor.pos.x; z = mk.actor.pos.z; if (mk.actor.dead) continue; }
      if (mk.vehicle) { x = mk.vehicle.pos.x; z = mk.vehicle.pos.z; }
      this._mmTo(x, z); this._mmClamp(R, 18);
      const sx = this._sx, sy = this._sy;
      if (mk.giver) c.drawImage(iconBitmap('pin_reis', '#d4af37'), sx - 16, sy - 16, 32, 32);
      else { c.fillStyle = hexOf(mk.color); c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.arc(sx, sy, 10, 0, Math.PI * 2); c.fill(); c.stroke(); }
    }
    // iş işaretçileri (kenara sabitlenir, elmas biçimli)
    if (C) for (const mk of C.markers) {
      if (mk.actor && mk.actor.dead) continue;
      const pos = C.markerPos(mk);
      this._mmTo(pos.x, pos.z); this._mmClamp(R, 18);
      const sx = this._sx, sy = this._sy;
      c.fillStyle = hexOf(mk.color); c.strokeStyle = '#000'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(sx, sy - 12); c.lineTo(sx + 10, sy); c.lineTo(sx, sy + 12); c.lineTo(sx - 10, sy); c.closePath(); c.fill(); c.stroke();
    }
    if (g.waypoint) {
      this._mmTo(g.waypoint.x, g.waypoint.z); this._mmClamp(R, 18);
      const sx = this._sx, sy = this._sy;
      c.fillStyle = '#c86aff'; c.beginPath(); c.moveTo(sx, sy + 12); c.lineTo(sx - 9, sy - 6); c.lineTo(sx + 9, sy - 6); c.fill();
    }
    // oyuncu oku
    c.save();
    c.translate(R, R);
    const hd = p.vehicle ? p.vehicle.heading : p.heading;
    const fx = Math.sin(hd), fz = Math.cos(hd);
    const sx2 = fx * m.cs - fz * m.sn, sy2 = fx * m.sn + fz * m.cs;
    c.rotate(Math.atan2(sy2, sx2) + Math.PI / 2);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -16); c.lineTo(11, 12); c.lineTo(0, 6); c.lineTo(-11, 12); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // kuzey işareti
    this._mmTo(p.pos.x, p.pos.z - 10000);
    const nx = this._sx, ny = this._sy;
    const nd = Math.hypot(nx - R, ny - R);
    const kx = R + (nx - R) / nd * (R - 16), ky = R + (ny - R) / nd * (R - 16);
    c.fillStyle = '#d4af37'; c.font = 'bold 22px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('K', kx, ky);
  }

  // ======================= MENÜ GEZİNME (klavye / gamepad) =======================
  setupNav() {
    // tek, devredilmiş fare-üzeri dinleyicisi (buton başına dinleyici ve osilatör yok)
    this.modalEl.addEventListener('pointerover', (e) => {
      const t = e.target.closest && e.target.closest(NAV_SEL);
      if (!t || t === this.hot || !this.modalEl.contains(t)) return;
      this.setHot(t, false);
    });
    window.addEventListener('keydown', (e) => this.navKey(e), true);
    window.addEventListener('gamepadconnected', () => { this.padOn = true; });
    this.pad = { t: 0, a: false, b: false };
  }
  topModal() { return this.modalStack[this.modalStack.length - 1]; }
  // vurgulu öğe: fare ve klavye aynı vurguyu paylaşır (konsol menüleri gibi)
  setHot(t, kb) {
    if (this.hot && this.hot !== t) this.hot.classList.remove('hot');
    this.hot = t;
    if (!t) return;
    t.classList.add('hot');
    if (t.tagName === 'BUTTON' || t.classList.contains('slot')) this.hoverSound();
    if (kb) { try { t.focus({ preventScroll: true }); } catch (e) { /* yok */ } t.scrollIntoView({ block: 'nearest' }); }
    const m = this.topModal();
    if (m && m.onHot) m.onHot(t);
  }
  navList(m) {
    const all = Array.from(m.wrap.querySelectorAll(NAV_SEL));
    // bölümlü seçimler (.seg) tek durak sayılır: seçili çip temsil eder
    return all.filter((b) => { if (b.offsetParent === null) return false; const seg = b.parentElement && b.parentElement.classList.contains('seg') ? b.parentElement : null; if (!seg) return true; const on = seg.querySelector('.chip.on') || seg.firstElementChild; return on === b; });
  }
  navKey(e) {
    const m = this.topModal();
    if (!m || (this.game.mode === 'playing' && !m.nav)) {
      if (!m) return;
    }
    const k = e.code;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'NumpadEnter'].includes(k)) return;
    const a = document.activeElement;
    const typing = a && a.tagName === 'INPUT' && a.type !== 'range';
    if (typing && k !== 'ArrowUp' && k !== 'ArrowDown') return;
    if (a && a.type === 'range' && (k === 'ArrowLeft' || k === 'ArrowRight')) return; // kaydırıcı kendi tuşlarını kullanır
    const list = this.navList(m);
    if (!list.length) return;
    let cur = this.hot && list.includes(this.hot) ? this.hot : null;
    if (!cur && this.hot && this.hot.parentElement && this.hot.parentElement.classList.contains('seg')) cur = list.find((b) => b.parentElement === this.hot.parentElement) || null;
    if (k === 'Enter' || k === 'NumpadEnter') {
      if (cur && (!a || a === document.body || a !== cur)) { e.preventDefault(); cur.click(); }
      return;
    }
    e.preventDefault();
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const dir = k === 'ArrowLeft' ? -1 : 1;
      const base = this.hot;
      // bölümlü seçim: komşu çipi seç
      if (base && base.parentElement && base.parentElement.classList.contains('seg')) {
        const chips = Array.from(base.parentElement.children);
        const on = base.parentElement.querySelector('.chip.on') || base;
        const n = chips[clamp(chips.indexOf(on) + dir, 0, chips.length - 1)];
        if (n && n !== on) { n.click(); this.setHot(n, true); }
        return;
      }
      // aynı satırdaki komşu (yatay buton grupları)
      if (cur) { const i = list.indexOf(cur); const n = list[clamp(i + dir, 0, list.length - 1)]; if (n && Math.abs(n.getBoundingClientRect().top - cur.getBoundingClientRect().top) < 24) this.setHot(n, true); }
      return;
    }
    const dir = k === 'ArrowUp' ? -1 : 1;
    let i = cur ? list.indexOf(cur) : (dir > 0 ? -1 : list.length);
    // aynı satırdakileri atla (dikey hareket satır satır)
    const top = cur ? cur.getBoundingClientRect().top : null;
    let n = null;
    for (let j = i + dir; j >= 0 && j < list.length; j += dir) {
      if (top === null || Math.abs(list[j].getBoundingClientRect().top - top) > 12) { n = list[j]; break; }
    }
    if (!n) n = list[dir > 0 ? 0 : list.length - 1]; // sar
    if (typing) a.blur();
    this.setHot(n, true);
  }
  // gamepad: yön tuşları / sol çubuk = gezin, A = seç, B = geri (yalnızca menü açıkken)
  menuTick(dt) {
    if (!this.padOn || !this.modalStack.length || !navigator.getGamepads) return;
    const gp = navigator.getGamepads()[0];
    if (!gp) return;
    const P = this.pad;
    const btn = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    const ay = gp.axes[1] || 0, ax = gp.axes[0] || 0;
    const dir = btn(12) || ay < -0.6 ? 'ArrowUp' : btn(13) || ay > 0.6 ? 'ArrowDown' : btn(14) || ax < -0.6 ? 'ArrowLeft' : btn(15) || ax > 0.6 ? 'ArrowRight' : null;
    P.t -= dt;
    if (dir && (P.dir !== dir || P.t <= 0)) { this.navKey({ code: dir, preventDefault() {} }); P.t = P.dir === dir ? 0.12 : 0.35; }
    P.dir = dir;
    const a = btn(0), b = btn(1);
    if (a && !P.a && this.hot) this.hot.click();
    if (b && !P.b) this.game.onKey({ code: 'Escape' });
    P.a = a; P.b = b;
  }
  // fare üzeri sesi: tek önbellekli tampon, ≥45 ms aralık (her girişte yeni osilatör zinciri kurulmaz)
  hoverSound() {
    const ctx = audio.ctx;
    if (!ctx || !audio.sfx) return;
    const now = ctx.currentTime;
    if (now - (this._hvT || 0) < 0.045) return;
    this._hvT = now;
    if (!this._hvBuf) {
      const n = Math.floor(ctx.sampleRate * 0.035);
      const b = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) { const t = i / ctx.sampleRate; d[i] = Math.sin(t * 2 * Math.PI * 1500) * Math.exp(-t * 140) * 0.05; }
      this._hvBuf = b;
    }
    const s = ctx.createBufferSource(); s.buffer = this._hvBuf; s.connect(audio.sfx); s.start();
  }

  // ======================= MODAL ALTYAPISI =======================
  openModal(node, { onClose, cls = '', closable = true, opaque = false, onHot = null } = {}) {
    const wrap = el('div', 'modal enter ' + cls);
    wrap.appendChild(node);
    // alttaki menüyü geri plana it (yalnızca transform/opacity)
    const prev = this.topModal();
    if (prev) prev.wrap.classList.add('behind');
    this.modalEl.appendChild(wrap);
    const m = { wrap, onClose, closable, opaque, onHot };
    this.modalStack.push(m);
    this.game.input.unlock();
    this.showClickToResume(false);
    setTimeout(() => wrap.classList.remove('enter'), 900);
    return m;
  }
  closeModal(m) {
    m = m || this.topModal();
    if (!m) return;
    const i = this.modalStack.indexOf(m);
    if (i < 0) return;
    this.modalStack.splice(i, 1);
    // çıkış animasyonu: etkileşim hemen kapanır, öğe kısa süre sonra kaldırılır
    const w = m.wrap;
    w.classList.add('leaving');
    setTimeout(() => w.remove(), 170);
    if (this.hot && w.contains(this.hot)) this.hot = null;
    const top = this.topModal();
    if (top) top.wrap.classList.remove('behind');
    if (m.onClose) m.onClose();
    if (!this.modalStack.length && this.game.mode === 'playing') this.game.requestLock();
  }
  closeAll() { while (this.modalStack.length) this.closeModal(); }
  topClosable() { const m = this.topModal(); return m && m.closable; }

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
  // büyük menü öğesi (ana menü / duraklatma): numara + başlık + alt satır; desc bilgi kartında gösterilir
  navItem(n, label, sub, desc, onClick, cls = '') {
    const b = this.btn(`<i class="ni-n">${n}</i><span class="ni-l">${label}</span>${sub ? `<small class="ni-s">${sub}</small>` : ''}`, onClick, 'nav-item ' + cls);
    if (desc) b.dataset.desc = desc;
    return b;
  }
  // ortak menü iskeleti: sol gezinme sütunu + sağ bilgi kartı + alt tuş şeridi
  menuShell(cls, brandHtml, items, sideHtml, hints) {
    const m = el('div', 'menu-shell ' + cls);
    m.innerHTML = `<div class="ms-shade"></div>
      <div class="ms-left">${brandHtml}<nav class="ms-nav"><span class="ms-bar"></span></nav></div>
      <aside class="ms-side">${sideHtml || ''}<div class="ms-desc"><span class="ms-desc-k">BİLGİ</span><p></p></div></aside>
      <footer class="ms-foot">${hints.map(([k, v]) => `<span><kbd>${k}</kbd>${v}</span>`).join('')}<em>v1.1 · Prosedürel İstanbul</em></footer>`;
    const nav = $('.ms-nav', m);
    items.forEach((b, i) => { b.style.setProperty('--i', i); nav.appendChild(b); });
    return m;
  }
  // hareketli vurgu çubuğu + açıklama kartı (yalnızca transform)
  bindShell(m, shell) {
    const bar = $('.ms-bar', shell), desc = $('.ms-desc p', shell);
    m.onHot = (t) => {
      if (!t.classList.contains('nav-item')) return;
      bar.style.transform = `translateY(${t.offsetTop}px) scaleY(${t.offsetHeight / 100})`;
      bar.classList.add('on');
      if (desc.textContent !== (t.dataset.desc || '')) { desc.textContent = t.dataset.desc || ''; desc.classList.remove('in'); void desc.offsetWidth; desc.classList.add('in'); }
    };
    const first = $('.nav-item', shell);
    requestAnimationFrame(() => { if (first && this.topModal() === m && !this.hot) this.setHot(first, false); });
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
        if (!this.modalStack.length && this.game.mode === 'playing') this.game.requestLock();
        done && done();
      } else show();
    };
    const key = (e) => { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); advance(); } };
    setTimeout(() => window.addEventListener('keydown', key), 150);
    d.addEventListener('click', advance);
    show();
  }

  // genel karar kutusu: buttons = [{ label, cls, action }]; cancel = ESC ile kapanabilir
  choice(title, text, buttons, { closable = true, icon = null } = {}) {
    const p = el('div', 'dlg');
    p.innerHTML = `<div class="dlg-rule"></div>${icon ? `<div class="dlg-ic">${svgImg(icon, null, 30)}</div>` : ''}<h2>${title}</h2>${text ? `<p>${text}</p>` : ''}<div class="dlg-acts"></div>`;
    const m = this.openModal(p, { cls: 'dlg-layer', closable });
    const acts = $('.dlg-acts', p);
    buttons.forEach((b, i) => acts.appendChild(this.btn(b.label, () => { this.closeModal(m); if (b.action) b.action(); }, (b.cls || '') + (i === 0 ? ' primary' : ''))));
    requestAnimationFrame(() => { if (this.topModal() === m) this.setHot(acts.firstElementChild, true); });
    return m;
  }
  confirm(title, sub, label, action, cancelLabel = 'Vazgeç') {
    return this.choice(title, sub, [{ label, cls: 'gold', action }, { label: cancelLabel }]);
  }

  // ======================= YÜKLEME =======================
  showLoading() {
    const l = el('div', 'loading');
    l.id = 'loading';
    l.innerHTML = `<div class="ld-grain"></div><div class="ld-center"><div class="logo-big">${ICONS.logo}</div><h1 class="title"><span>İSTANBUL</span><em>MAFYA</em></h1>
      <div class="bar"><i id="loadBar"></i></div><div class="ld-row"><p id="loadText">Şehir kuruluyor...</p><b id="loadPct">0%</b></div></div>
      <p class="tip">${TIPS[Math.floor(Math.random() * TIPS.length)]}</p>`;
    this.root.appendChild(l);
  }
  setLoading(p, text) {
    const b = $('#loadBar'); if (b) b.style.transform = `scaleX(${Math.max(0.001, p)})`;
    const t = $('#loadText'); if (t && text) t.textContent = text;
    const n = $('#loadPct'); if (n) n.textContent = Math.round(p * 100) + '%';
  }
  hideLoading() { const l = $('#loading'); if (l) { l.classList.add('out'); setTimeout(() => l.remove(), 800); } }

  // ======================= ANA MENÜ =======================
  async mainMenu() {
    this.closeAll();
    const g = this.game;
    const saves = await listSaves();
    const latest = await latestSave(saves);
    const items = [];
    let n = 1;
    const num = () => String(n++).padStart(2, '0');
    if (latest) items.push(this.navItem(num(), 'DEVAM ET', `${esc(latest.name || 'İsimsiz')} · ${formatMoney(latest.money)} · ${latest.day}. Gün`, 'Kaldığın yerden devam et: en son kayıt yüklenir.', () => { this.closeAll(); g.loadGame(latest.slot); }, 'primary'));
    items.push(this.navItem(num(), 'YENİ OYUN', '', 'Cezaevi kapısından yeni bir hikâyeye başla.', () => this.newGameFlow(latest), latest ? '' : 'primary'));
    items.push(this.navItem(num(), 'OYUN YÜKLE', '', 'Otomatik kayıt ya da kayıt yuvalarından birini yükle.', () => this.saveLoadMenu('load')));
    items.push(this.navItem(num(), 'AYARLAR', '', 'Grafik, performans, ses ve oynanış ayarları.', () => this.settingsMenu()));
    items.push(this.navItem(num(), 'KONTROLLER', '', 'Klavye ve fare tuş düzeni.', () => this.controlsMenu()));
    items.push(this.navItem(num(), 'YAPIMCILAR', '', 'Bu şehri kimler kurdu?', () => this.credits(true)));
    items.push(this.navItem(num(), 'ÇIKIŞ', '', 'Masaüstüne dön.', () => g.quit(), 'dim'));
    const brand = `<div class="brand"><div class="brand-crest">${ICONS.logo}</div><div class="brand-kicker">BİR SUÇ DESTANI</div><h1 class="brand-title"><span>İSTANBUL</span><em>MAFYA</em></h1><p class="brand-tag">Boğaz'ın iki yakası, tek bir aile.</p></div>`;
    const side = latest ? `<div class="ms-card"><span class="ms-card-k">SON KAYIT · ${latest.slot === 'auto' ? 'OTOMATİK' : 'YUVA ' + latest.slot}</span><b>${esc(latest.name || 'İsimsiz')}</b>
      <div class="ms-stats"><div><span>Nakit</span><em>${formatMoney(latest.money)}</em></div><div><span>Gün</span><em>${latest.day}</em></div><div><span>Görev</span><em>${Math.min(latest.mission || 0, STORY_N)}/${STORY_N}</em></div><div><span>Süre</span><em>${fmtPlay(latest.play)}</em></div></div>
      <small>${new Date(latest.time).toLocaleString('tr-TR')}</small></div>` : '';
    const shell = this.menuShell('mainmenu', brand, items, side, [['↑↓', 'Seç'], ['Enter', 'Onayla'], ['Esc', 'Geri']]);
    const m = this.openModal(shell, { cls: 'full shell-layer', closable: false });
    this.bindShell(m, shell);
  }
  // YENİ OYUN: kayıt varsa önce sor
  newGameFlow(latest) {
    const g = this.game;
    const start = () => { this.closeAll(); this.characterCreator(); };
    if (!latest) return start();
    this.choice('KAYITLI OYUN BULUNDU', 'Kayıtlı bir oyunun var. Devam etmek ister misin?', [
      { label: 'Devam Et', cls: 'gold', action: () => { this.closeAll(); g.loadGame(latest.slot); } },
      { label: 'Yeni Oyuna Başla', action: () => this.choice('YENİ OYUN?', 'Otomatik kayıt yeni oyununla değiştirilecek. Elle aldığın kayıtlar (Yuva 1–3) korunur.', [
        { label: 'Evet, Yeni Oyun', cls: 'red', action: start },
        { label: 'Vazgeç' },
      ], { icon: 'save' }) },
    ], { icon: 'save' });
  }

  // ======================= KARAKTER OLUŞTURMA =======================
  characterCreator() {
    const g = this.game;
    const look = defaultLook('m');
    let name = 'Kemal';
    let cat = 'id';
    g.enterCreator(look);
    const p = el('div', 'creator-ui');
    p.innerHTML = `
      <div class="cr-panel">
        <div class="cr-head"><span class="cr-step">KARAKTER</span><h2>KARAKTERİNİ YARAT</h2><p>Cezaevi kapısından çıkacak adam ya da kadın kim?</p></div>
        <div class="cr-tabs"></div>
        <div class="cr-body"></div>
        <div class="cr-foot"></div>
      </div>
      <div class="cr-view">
        <div class="cr-tools"></div>
        <p class="cr-hint"><kbd>Sürükle</kbd> Döndür <kbd>Teker</kbd> Yakınlaş</p>
      </div>
      <div class="cr-name"><small>OYUNCU</small><b></b></div>`;
    const body = $('.cr-body', p), tabs = $('.cr-tabs', p), nameEl = $('.cr-name b', p);
    const update = () => { g.creatorModel.setLook(look); nameEl.textContent = (name || 'Kemal').toLocaleUpperCase('tr-TR'); };
    const row = (label) => { const r = el('div', 'crow'); r.innerHTML = `<label>${label}</label><div class="opts seg"></div>`; body.appendChild(r); return $('.opts', r); };
    const choice = (label, list, key, fmt, swatch) => {
      const o = row(label);
      if (swatch) o.classList.add('swatches');
      list.forEach((v) => {
        const b = el('button', 'chip' + (look[key] === v ? ' on' : ''), swatch ? '' : fmt ? fmt(v) : v);
        if (swatch) { b.style.background = v; b.classList.add('sw'); b.title = v; }
        b.addEventListener('click', () => { look[key] = v; o.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); b.classList.add('on'); audio.click(); if (key === 'gender') { look.hair = v === 'f' ? 'uzun' : 'kisa'; look.beard = v === 'f' ? 'none' : look.beard; } update(); });
        o.appendChild(b);
      });
    };
    const presets = {
      'Kabadayı': { top: 'leather', topColor: '#1c1c1c', pants: 'jeans', pantsColor: '#2a3550', shoes: 'boots', shoesColor: '#3a2412', hat: 'none', glasses: false },
      'Takım Elbise': { top: 'suit', topColor: '#1d2440', shirtColor: '#f0f0f0', pants: 'slacks', pantsColor: '#1d2440', shoes: 'polished', shoesColor: '#0a0a0a', hat: 'none', glasses: true },
      'Eşofmanlı': { top: 'track', topColor: '#1a1a1a', pants: 'track', pantsColor: '#1a1a1a', shoes: 'sneaker', shoesColor: '#eeeeee', hat: 'kasket', hatColor: '#2a2a2a', glasses: false },
      'Paltolu': { top: 'coat', topColor: '#2a2a3a', shirtColor: '#e8e8e8', pants: 'slacks', pantsColor: '#111111', shoes: 'polished', shoesColor: '#0a0a0a', hat: 'fedora', hatColor: '#151515', glasses: false },
    };
    const CATS = [['id', 'Kimlik', 'user', 'body'], ['face', 'Yüz & Saç', 'face', 'face'], ['style', 'Tarz', 'c_top', 'body']];
    const render = () => {
      tabs.innerHTML = '';
      for (const [k, l, ic, view] of CATS) {
        const b = el('button', 'cr-tab' + (k === cat ? ' on' : ''), `${svgImg(ic, null, 18)}<span>${l}</span>`);
        b.onclick = () => { if (cat === k) return; cat = k; audio.click(); g.creatorView(view); render(); };
        tabs.appendChild(b);
      }
      body.innerHTML = '';
      body.classList.remove('in'); void body.offsetWidth; body.classList.add('in');
      if (cat === 'id') {
        const nm = row('İsim'); nm.classList.remove('seg');
        const inp = el('input', 'txt'); inp.value = name; inp.maxLength = 16; inp.spellcheck = false;
        inp.addEventListener('input', () => { name = inp.value; update(); });
        nm.appendChild(inp);
        choice('Cinsiyet', ['m', 'f'], 'gender', (v) => (v === 'm' ? 'Erkek' : 'Kadın'));
        choice('Ten', SKIN_TONES, 'skin', null, true);
      } else if (cat === 'face') {
        choice('Saç', HAIR_STYLES, 'hair', (v) => ({ kisa: 'Kısa', arkaya: 'Arkaya', kel: 'Kel', uzun: 'Uzun', kivircik: 'Kıvırcık', at_kuyrugu: 'At kuyruğu' }[v] || v));
        choice('Saç rengi', HAIR_COLORS, 'hairColor', null, true);
        choice('Sakal', BEARDS, 'beard', (v) => ({ none: 'Yok', stubble: 'Kirli', mustache: 'Bıyık', full: 'Gür' }[v] || v));
      } else {
        const pr = row('Hazır tarz'); pr.classList.remove('seg'); pr.classList.add('cr-cards');
        for (const [k, v] of Object.entries(presets)) {
          const b = this.btn(`<b>${k}</b><small>${v.top === 'suit' ? 'Şık ve tehlikeli' : v.top === 'coat' ? 'Eski usul baba' : v.top === 'track' ? 'Mahallenin delikanlısı' : 'Sokakların sesi'}</small>`, () => { Object.assign(look, v); update(); pr.querySelectorAll('.btn').forEach((x) => x.classList.toggle('on', x === b)); }, 'cr-card');
          pr.appendChild(b);
        }
        body.appendChild(el('p', 'hint', 'Kıyafetlerin tamamı oyunda butiklerden alınabilir.'));
      }
    };
    const rnd = (a) => a[Math.floor(Math.random() * a.length)];
    const tools = $('.cr-tools', p);
    const tool = (ic, title, fn) => { const b = this.btn(svgImg(ic, null, 18), fn, 'cr-tool'); b.title = title; tools.appendChild(b); return b; };
    tool('back', 'Sola döndür', () => g.creatorView('left')).classList.add('flip-none');
    tool('rotate', 'Sağa döndür', () => g.creatorView('right'));
    tool('zoom_in', 'Yakınlaş', () => g.creatorView('in'));
    tool('zoom_out', 'Uzaklaş', () => g.creatorView('out'));
    tool('reset', 'Görünümü sıfırla', () => { g.creatorView('reset'); });
    const foot = $('.cr-foot', p);
    foot.append(
      this.btn('GERİ', () => { this.closeAll(); g.exitCreator(); this.mainMenu(); }, 'ghost'),
      this.btn('Rastgele', () => { look.skin = rnd(SKIN_TONES); look.hair = rnd(HAIR_STYLES); look.hairColor = rnd(HAIR_COLORS); if (look.gender !== 'f') look.beard = rnd(BEARDS); Object.assign(look, presets[rnd(Object.keys(presets))]); update(); render(); }, 'ghost'),
      this.btn('MACERAYA BAŞLA', () => { this.closeAll(); g.exitCreator(); g.newGame((name || '').trim() || 'Kemal', look); }, 'gold big-cta'),
    );
    render();
    update();
    const m = this.openModal(p, { cls: 'creator-layer', closable: false });
    void m;
  }

  // ======================= DURAKLATMA =======================
  pauseMenu() {
    const g = this.game;
    const s = g.state;
    ensureLifeState(s);
    const items = [
      this.navItem('01', 'DEVAM ET', '', 'Oyuna geri dön.', () => this.closeModal(m), 'primary'),
      this.navItem('02', 'HARİTA', '', 'Şehir haritası, rota ve işaretler.', () => this.mapScreen()),
      this.navItem('03', 'İSTATİSTİKLER', '', 'Saygınlık, bölgeler ve kariyerin.', () => this.statsScreen()),
      this.navItem('04', 'ÇANTA', '', 'Envanter, silahlar ve mülkler.', () => this.openInventory()),
      this.navItem('05', 'OYUNU KAYDET', '', 'Bir kayıt yuvasına kaydet. Oyun ayrıca otomatik kaydedilir.', () => (g.wanted.level > 0 ? this.notify('Aranırken kayıt alınamaz!', 'warn') : this.saveLoadMenu('save'))),
      this.navItem('06', 'OYUN YÜKLE', '', 'Kaydedilmiş bir oyunu yükle.', () => this.saveLoadMenu('load')),
      this.navItem('07', 'AYARLAR', '', 'Grafik, performans, ses ve oynanış ayarları.', () => this.settingsMenu()),
      this.navItem('08', 'KONTROLLER', '', 'Klavye ve fare tuş düzeni.', () => this.controlsMenu()),
      this.navItem('09', 'ANA MENÜ', '', 'İlerlemen otomatik kaydedilip ana menüye dönülür.', () => this.confirm('ANA MENÜYE DÖN?', 'İlerlemen otomatik kayda yazılacak.', 'Ana Menü', async () => { await g.saveOnQuit(); g.toMainMenu(); }), 'dim'),
      this.navItem('10', 'MASAÜSTÜNE ÇIK', '', 'İlerlemen otomatik kaydedilir, ardından oyun kapanır.', () => this.confirm('OYUNDAN ÇIK?', 'İlerlemen otomatik kayda yazılacak.', 'Kaydet ve Çık', () => g.quit()), 'dim'),
    ];
    const r = rankOf(s.respect);
    const env = g.env;
    const brand = `<div class="brand sm"><div class="brand-kicker">${env ? `${pad2(env.hour)}:${pad2(env.minute)} · ${env.day}. GÜN` : ''}</div><h1 class="brand-title"><em>DURAKLATILDI</em></h1><p class="brand-tag">${esc(this.h.district.textContent || '')}</p></div>`;
    const side = `<div class="ms-card"><span class="ms-card-k">${esc(r.name).toLocaleUpperCase('tr-TR')}</span><b>${esc(s.name)}</b>
      <div class="ms-stats"><div><span>Nakit</span><em>${formatMoney(s.money)}</em></div><div><span>Banka</span><em>${formatMoney(s.bank)}</em></div>
      <div><span>Hikâye</span><em>${Math.min(s.storyIndex, STORY_N)}/${STORY_N}</em></div><div><span>Saygınlık</span><em>${s.respect}</em></div>
      <div><span>İş hayatı</span><em>${rankIn(LEGAL_RANKS, s.legalRep).name}</em></div><div><span>Yeraltı</span><em>${rankIn(CRIME_RANKS, s.crimeRep).name}</em></div></div>
      <small>Oyun süresi ${fmtPlay(s.stats.playTime)}</small></div>`;
    const shell = this.menuShell('pausemenu', brand, items, side, [['↑↓', 'Seç'], ['Enter', 'Onayla'], ['Esc', 'Devam']]);
    // donmuş karenin bulanık, küçük kopyası (statik; fare üzerine gelince yeniden hesaplanmaz)
    shell.prepend(this.pauseBackdrop());
    const m = this.openModal(shell, { cls: 'full shell-layer', onClose: () => g.resume() });
    this.bindShell(m, shell);
    return m;
  }
  pauseBackdrop() {
    if (!this.pauseBg) { this.pauseBg = el('canvas', 'pause-bg'); this.pauseBg.width = 320; this.pauseBg.height = 180; }
    this.capturePauseBackdrop();
    return this.pauseBg;
  }
  // render()'dan hemen sonra (aynı görevde) çağrılmalı: WebGL çizim tamponu henüz geçerli
  capturePauseBackdrop() {
    const c = this.pauseBg, src = this.game.renderer && this.game.renderer.domElement;
    if (!c || !src) return;
    const ctx = c.getContext('2d');
    try { ctx.filter = 'blur(2px)'; ctx.drawImage(src, 0, 0, c.width, c.height); ctx.filter = 'none'; } catch (e) { /* yok */ }
  }

  async saveLoadMenu(mode) {
    const g = this.game;
    const saves = await listSaves();
    const latest = await latestSave(saves);
    const p = this.panel(mode === 'save' ? 'OYUNU KAYDET' : 'OYUN YÜKLE', mode === 'save' ? 'Bir kayıt yuvası seç' : 'Yüklenecek kaydı seç');
    p.classList.add('saves');
    const m = this.openModal(p, { cls: 'sheet' });
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    for (const s of SLOTS) {
      if (mode === 'save' && s === 'auto') continue;
      const info = saves[s];
      const b = el('div', 'slot' + (info ? '' : ' empty') + (latest && latest.slot === s ? ' latest' : ''));
      b.tabIndex = 0;
      b.innerHTML = `<div class="slot-n"><small>${s === 'auto' ? 'OTOMATİK' : 'YUVA'}</small><b>${s === 'auto' ? 'A' : s}</b></div>` + (info
        ? `<div class="slot-i"><b>${esc(info.name || 'İsimsiz')}</b>${latest && latest.slot === s ? '<em class="tag">EN SON</em>' : ''}<div class="slot-m"><span>${formatMoney(info.money)}</span><span>Saygınlık ${info.respect}</span><span>${info.day}. Gün</span><span>Görev ${Math.min(info.mission, STORY_N)}/${STORY_N}</span><span>${fmtPlay(info.play)}</span></div><small>${new Date(info.time).toLocaleString('tr-TR')}</small></div>`
        : '<div class="slot-i"><b>Boş yuva</b><small>Henüz kayıt yok</small></div>');
      b.addEventListener('click', async () => {
        audio.click();
        if (mode === 'save') {
          const doSave = async () => { await g.saveGame(s); this.closeModal(m); this.notify('Oyun kaydedildi: Yuva ' + s, 'good'); };
          if (info) this.confirm('ÜZERİNE YAZILSIN MI?', `Yuva ${s} dolu: ${esc(info.name || '')} · ${info.day}. Gün`, 'Üzerine Yaz', doSave); else doSave();
        } else if (info) { this.closeAll(); g.loadGame(s); }
      });
      body.appendChild(b);
    }
  }

  credits(fromMenu) {
    const p = el('div', 'credits');
    p.innerHTML = `<div class="roll">
      <div class="logo-mid">${ICONS.logo}</div><h1 class="title"><span>İSTANBUL</span> <em>MAFYA</em></h1>
      <h3>Oyun Tasarımı & Programlama</h3><p>Claude Code ile birlikte geliştirildi</p>
      <h3>Şehir</h3><p>Boğaz, Haliç, Galata, Sultanahmet, Kapalıçarşı, Dolmabahçe, Kız Kulesi, Haydarpaşa — prosedürel yeniden yorum</p>
      <h3>3D Modeller</h3><p>Tüm karakterler, araçlar, silahlar ve binalar koddan üretildi</p>
      <h3>Müzik</h3><p>Hicaz makamında prosedürel saz ve darbuka</p>
      <h3>Teşekkürler</h3><p>İstanbul'un kedilerine, martılarına ve çaycılarına</p>
      <p class="end">Bu oyun kurgudur. Gerçek kişi ve kurumlarla ilgisi yoktur.</p></div><div class="credits-skip"><kbd>Esc</kbd> Geri</div>`;
    const m = this.openModal(p, { cls: 'full', closable: true, opaque: true });
    p.addEventListener('click', () => { this.closeModal(m); if (!fromMenu) this.game.resume(); });
  }

  // ======================= HARİTA =======================
  mapScreen() {
    const g = this.game;
    const p = el('div', 'mapscreen');
    p.innerHTML = `<canvas id="bigmap" width="1600" height="1600"></canvas><div class="legend"></div><div class="map-help">Sol tık: rota işaretle · Sağ tık: rotayı sil · Teker: yakınlaştır · Sürükle: kaydır · ESC/M: kapat</div>`;
    const m = this.openModal(p, { cls: 'full', opaque: true });
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
        <div><span>Hikâye</span><b>${Math.min(s.storyIndex, STORY_N)}/${STORY_N} görev</b></div><div><span>Altın Lale</span><b>${s.tulips.length}/25</b></div>
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
    document.body.classList.add('desat'); this.game._desat = true;
    setTimeout(() => { o.className = 'overlay hidden'; document.body.classList.remove('desat'); this.game._desat = false; done && done(); }, 4500);
  }
}

Object.assign(UI.prototype, ShopMethods, PhoneMethods, SettingsMethods);

const JOB_PATH = (id) => (['chop', 'robbery', 'protection', 'hit'].includes(id) ? 'crime' : 'legal');

export function goodsCount(s) { return Object.values(s.goods).reduce((a, b) => a + b, 0); }
// oyun süresi: "3s 12dk"
function fmtPlay(sec) { sec = sec || 0; const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}s ${m}dk` : `${m}dk`; }
