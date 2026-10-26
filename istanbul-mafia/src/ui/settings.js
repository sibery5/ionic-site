// Genişletilmiş ayarlar: Grafik (hazır ayar + tek tek), Ses, Kontroller, Oynanış, Dil.
// Değerler game.settings içinde saklanır; kalıcılık main.js applySettings -> storeSettings ile.
import * as THREE from 'three';
import { svgImg } from './icons.js';
import { $, el } from './dom.js';
import { audio } from '../core/audio.js';

// main.js DEFAULT_SETTINGS'e eklenmesi önerilen yeni alanlar (eksikse buradaki varsayılan kullanılır)
export const SETTINGS_DEFAULTS = {
  preset: 'medium', shadowQuality: 'medium', antialias: true, textureQuality: 'medium', npcDensity: 1, trafficDensity: 1,
  motionBlur: false, hudVisible: true, minimapRotate: true, difficulty: 'normal', language: 'tr', subtitles: true, camShake: true,
};
// zorluk -> oyuncunun aldığı hasar çarpanı (combat tarafından okunur: game.settings.damageTaken)
export const DIFFICULTY = { easy: { name: 'Kolay', taken: 0.6, dealt: 1.25 }, normal: { name: 'Normal', taken: 1, dealt: 1 }, hard: { name: 'Zor', taken: 1.5, dealt: 0.85 } };

const PRESETS = {
  low: { quality: 'low', shadows: false, shadowQuality: 'low', bloom: false, antialias: false, drawDistance: 600, textureQuality: 'low', npcDensity: 0.5, trafficDensity: 0.5 },
  medium: { quality: 'medium', shadows: true, shadowQuality: 'medium', bloom: true, antialias: true, drawDistance: 1200, textureQuality: 'medium', npcDensity: 1, trafficDensity: 1 },
  high: { quality: 'high', shadows: true, shadowQuality: 'high', bloom: true, antialias: true, drawDistance: 1600, textureQuality: 'high', npcDensity: 1.25, trafficDensity: 1.25 },
  ultra: { quality: 'high', shadows: true, shadowQuality: 'ultra', bloom: true, antialias: true, drawDistance: 2000, textureQuality: 'high', npcDensity: 1.5, trafficDensity: 1.5 },
};
const SHADOW_SIZE = { low: 512, medium: 1024, high: 2048, ultra: 4096 };

export function withDefaults(s) { for (const [k, v] of Object.entries(SETTINGS_DEFAULTS)) if (s[k] === undefined) s[k] = v; return s; }

// main.js applySettings'in kapsamadığı, anında uygulanabilen ayarlar
export function applyExtendedSettings(game) {
  const s = withDefaults(game.settings);
  const d = DIFFICULTY[s.difficulty] || DIFFICULTY.normal;
  s.damageTaken = d.taken; s.damageDealt = d.dealt;
  const hud = document.getElementById('hud');
  if (hud) hud.classList.toggle('hud-off', !s.hudVisible);
  const sun = game.env && game.env.sun;
  if (sun && sun.shadow) {
    const n = SHADOW_SIZE[s.shadowQuality] || 1024;
    if (sun.shadow.mapSize.x !== n) { sun.shadow.mapSize.set(n, n); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  }
  if (game.renderer) {
    const on = !!s.shadows && s.quality !== 'low';
    if (game.renderer.shadowMap.enabled !== on) { game.renderer.shadowMap.enabled = on; game.renderer.shadowMap.needsUpdate = true; }
    game.renderer.shadowMap.type = s.shadowQuality === 'low' ? THREE.BasicShadowMap : s.shadowQuality === 'medium' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  }
}

const KEYS = [
  ['W A S D', 'Yürü / Araç sür'], ['Shift', 'Koş'], ['Space', 'Zıpla / El freni'], ['C', 'Çömel / Araç kamerası'], ['Fare', 'Etrafa bak'],
  ['Sağ tık', 'Nişan al'], ['Sol tık', 'Ateş et / Yumruk'], ['R', 'Şarjör değiştir'], ['1-9 / Teker / Q', 'Silah değiştir'], ['F', 'Araca bin / in'],
  ['E', 'Etkileşim'], ['H', 'Korna'], ['N', 'Siren'], ['M', 'Harita'], ['Tab', 'İstatistikler'], ['I', 'Çanta (envanter)'], ['P', 'Telefon'],
  ['F5', 'Hızlı kayıt'], ['F9', 'Hızlı yükleme'], ['ESC', 'Duraklat / geri'],
];

export const SettingsMethods = {
  settingsMenu(startTab = 'gfx') {
    const g = this.game;
    const s = withDefaults(g.settings);
    let tab = startTab;
    const p = this.panel('AYARLAR');
    p.classList.add('settings');
    const apply = () => { g.applySettings(true); applyExtendedSettings(g); };
    const m = this.openModal(p, { onClose: () => apply() });
    m.kind = 'settings';
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    let host;
    const row = (label, ctrl, hint) => { const r = el('div', 'srow'); r.innerHTML = `<label>${label}${hint ? `<small>${hint}</small>` : ''}</label>`; r.appendChild(ctrl); host.appendChild(r); };
    const select = (key, opts, after) => {
      const d = el('div', 'seg');
      for (const [v, l] of opts) {
        const b = el('button', 'chip' + (s[key] === v ? ' on' : ''), l);
        b.onclick = () => { s[key] = v; d.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); b.classList.add('on'); audio.click(); if (key !== 'preset' && PRESETS.low[key] !== undefined) s.preset = 'custom'; if (after) after(v); apply(); };
        d.appendChild(b);
      }
      return d;
    };
    const slider = (key, min, max, step, fmt = (v) => v) => {
      const w = el('div', 'slider');
      const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = s[key];
      const v = el('span', '', String(fmt(s[key])));
      i.oninput = () => { s[key] = parseFloat(i.value); v.textContent = fmt(s[key]); if (PRESETS.low[key] !== undefined) s.preset = 'custom'; apply(); };
      w.append(i, v);
      return w;
    };
    const onoff = (key) => select(key, [[false, 'Kapalı'], [true, 'Açık']]);
    const pct = (v) => Math.round(v * 100) + '%';
    const render = () => {
      body.innerHTML = '';
      body.appendChild(this.tabBar([['gfx', 'Grafik', 'monitor'], ['snd', 'Ses', 'speaker'], ['ctl', 'Kontroller', 'gamepad'], ['play', 'Oynanış', 'respect'], ['lang', 'Dil', 'globe']], tab, (k) => { tab = k; render(); }));
      host = el('div', 'srows'); body.appendChild(host);
      if (tab === 'gfx') {
        row('Hazır ayar', select('preset', [['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek'], ['ultra', 'Ultra'], ['custom', 'Özel']], (v) => { if (PRESETS[v]) Object.assign(s, PRESETS[v]); render(); }));
        row('Grafik kalitesi', select('quality', [['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek']]), 'Yeni oyunda tam uygulanır');
        row('Gölgeler', onoff('shadows'));
        row('Gölge kalitesi', select('shadowQuality', [['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek'], ['ultra', 'Ultra']]));
        row('Çizim mesafesi', slider('drawDistance', 400, 2000, 100, (v) => v + ' m'));
        row('Işıma (Bloom)', onoff('bloom'));
        row('Kenar yumuşatma', onoff('antialias'), 'Yeniden başlatınca');
        row('Doku kalitesi', select('textureQuality', [['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek']]), 'Yeniden başlatınca');
        row('Yaya yoğunluğu', slider('npcDensity', 0.25, 1.5, 0.25, pct));
        row('Trafik yoğunluğu', slider('trafficDensity', 0.25, 1.5, 0.25, pct));
        row('Hareket bulanıklığı', onoff('motionBlur'), 'Yakında');
        row('Görüş açısı (FOV)', slider('fov', 55, 90, 1, (v) => v + '°'));
        row('FPS göster', onoff('showFps'));
        if (window.desktop) row('Tam ekran', select('fullscreen', [[true, 'Açık'], [false, 'Pencere']]));
      } else if (tab === 'snd') {
        row('Ana ses', slider('volMaster', 0, 1, 0.05, pct));
        row('Efektler', slider('volSfx', 0, 1, 0.05, pct));
        row('Müzik', slider('volMusic', 0, 1, 0.05, pct));
        row('Altyazılar', onoff('subtitles'));
      } else if (tab === 'ctl') {
        row('Fare hassasiyeti', slider('sensitivity', 0.2, 3, 0.1, (v) => v.toFixed(1)));
        row('Y eksenini ters çevir', select('invertY', [[false, 'Hayır'], [true, 'Evet']]));
        row('Kamera sarsıntısı', onoff('camShake'));
        host.appendChild(el('h3', '', 'Tuş atamaları'));
        host.insertAdjacentHTML('beforeend', `<div class="keys">${KEYS.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div>`);
        host.appendChild(el('p', 'hint', 'Tuş değiştirme yakında. Şimdilik varsayılan düzen kullanılır.'));
      } else if (tab === 'play') {
        row('Zorluk', select('difficulty', Object.entries(DIFFICULTY).map(([k, d]) => [k, d.name])), 'Alınan / verilen hasarı etkiler');
        row('HUD göster', onoff('hudVisible'));
        row('Mini harita dönsün', select('minimapRotate', [[true, 'Kamerayla'], [false, 'Kuzey sabit']]));
      } else {
        row('Dil / Language', select('language', [['tr', 'Türkçe'], ['en', 'English (yakında)']]));
        host.appendChild(el('p', 'hint', 'Şu an yalnızca Türkçe destekleniyor.'));
      }
      host.querySelectorAll('button').forEach((b) => b.addEventListener('mouseenter', () => audio.hover()));
    };
    render();
    void svgImg;
    return m;
  },
  controlsMenu() { return this.settingsMenu('ctl'); },
};
