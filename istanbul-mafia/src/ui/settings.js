// Genişletilmiş ayarlar: Grafik (hazır ayar + tek tek), Performans, Ses, Kontroller, Oynanış, Dil.
// Değerler game.settings içinde saklanır; kalıcılık main.js applySettings -> storeSettings ile.
import * as THREE from 'three';
import { svgImg } from './icons.js';
import { $, el } from './dom.js';
import { audio } from '../core/audio.js';

// main.js DEFAULT_SETTINGS'e eklenen alanlar (eksikse buradaki varsayılan kullanılır)
export const SETTINGS_DEFAULTS = {
  preset: 'medium', shadowQuality: 'medium', antialias: true, textureQuality: 'medium', npcDensity: 1, trafficDensity: 1,
  motionBlur: false, hudVisible: true, minimapRotate: true, difficulty: 'normal', language: 'tr', subtitles: true, camShake: true,
  // performans (main.js PerfGovernor + Electron prefs.json okur)
  dynamicRes: true, renderScale: 1, fpsCap: 0, vsync: true, gpu: 'high', ao: true,
};
// zorluk -> oyuncunun aldığı hasar çarpanı (combat tarafından okunur: game.settings.damageTaken)
export const DIFFICULTY = { easy: { name: 'Kolay', taken: 0.6, dealt: 1.25 }, normal: { name: 'Normal', taken: 1, dealt: 1 }, hard: { name: 'Zor', taken: 1.5, dealt: 0.85 } };

const PRESETS = {
  low: { quality: 'low', shadows: false, shadowQuality: 'low', bloom: false, antialias: false, drawDistance: 600, textureQuality: 'low', npcDensity: 0.5, trafficDensity: 0.5, ao: false, renderScale: 0.85 },
  medium: { quality: 'medium', shadows: true, shadowQuality: 'medium', bloom: true, antialias: true, drawDistance: 1200, textureQuality: 'medium', npcDensity: 1, trafficDensity: 1, ao: false, renderScale: 1 },
  high: { quality: 'high', shadows: true, shadowQuality: 'high', bloom: true, antialias: true, drawDistance: 1600, textureQuality: 'high', npcDensity: 1.25, trafficDensity: 1.25, ao: true, renderScale: 1 },
  ultra: { quality: 'high', shadows: true, shadowQuality: 'ultra', bloom: true, antialias: true, drawDistance: 2000, textureQuality: 'high', npcDensity: 1.5, trafficDensity: 1.5, ao: true, renderScale: 1 },
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
    const sm = game.renderer.shadowMap;
    if (sm.enabled !== on) { sm.enabled = on; sm.needsUpdate = true; }
    const type = s.shadowQuality === 'low' ? THREE.BasicShadowMap : s.shadowQuality === 'medium' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if (sm.type !== type) { sm.type = type; sm.needsUpdate = true; }
  }
}

const KEYS = [
  ['W A S D', 'Yürü / Araç sür'], ['Shift', 'Koş'], ['Space', 'Zıpla / El freni'], ['C', 'Çömel / Araç kamerası'], ['Fare', 'Etrafa bak'],
  ['Sağ tık', 'Nişan al'], ['Sol tık', 'Ateş et / Yumruk'], ['R', 'Şarjör değiştir'], ['1-9 / Teker / Q', 'Silah değiştir'], ['F', 'Araca bin / in'],
  ['E', 'Etkileşim'], ['H', 'Korna'], ['N', 'Siren'], ['M', 'Harita'], ['Tab', 'İstatistikler'], ['I', 'Çanta (envanter)'], ['P', 'Telefon'],
  ['F5', 'Hızlı kayıt'], ['F9', 'Hızlı yükleme'], ['ESC', 'Duraklat / geri'], ['↑ ↓ ← →', 'Menüde gezin'], ['Enter', 'Menüde seç'],
];

// her satırın açıklaması (alttaki bilgi şeridinde gösterilir)
const DESC = {
  preset: 'Tüm grafik ayarlarını tek seferde belirler. Düşük: zayıf ekran kartları ve dizüstüler için.',
  quality: 'Şehir geometrisi ve efekt kalitesi. Tam etkisi yeni oyunda / yeniden başlatınca görülür.',
  shadows: 'Güneş gölgeleri. Kapatmak en büyük FPS kazancını sağlar.',
  shadowQuality: 'Gölge haritası çözünürlüğü. Orta ve altında gölgeler iki karede bir yenilenir.',
  drawDistance: 'Uzak binaların ve sisin başladığı mesafe.',
  bloom: 'Işıkların parlaması. Orta ve altında yarım çözünürlükte hesaplanır.',
  ao: 'Ortam kapatma (GTAO): köşelerde yumuşak gölgeler. Yalnızca Yüksek/Ultra kalitede çalışır, maliyetlidir.',
  antialias: 'Kenar yumuşatma. Yeniden başlatınca uygulanır.',
  textureQuality: 'Doku çözünürlüğü. Yeniden başlatınca uygulanır.',
  npcDensity: 'Sokaktaki yaya sayısı. İşlemci yükünü doğrudan etkiler.',
  trafficDensity: 'Yoldaki araç sayısı. İşlemci yükünü doğrudan etkiler.',
  dynamicRes: 'FPS 60 altına düşünce görüntü çözünürlüğünü %60–100 arasında otomatik ayarlar.',
  renderScale: 'Görüntü çözünürlüğünün üst sınırı. Düşürmek FPS artırır, görüntüyü yumuşatır.',
  fpsCap: 'Kare hızını sınırlar; ısınmayı ve fan sesini azaltır.',
  vsync: 'Dikey eşitleme yırtılmayı önler. Kapatınca FPS ekran tazeleme hızını aşabilir (yeniden başlatınca).',
  gpu: 'Çift ekran kartlı bilgisayarlarda hangi kartın kullanılacağı (yeniden başlatınca).',
  motionBlur: 'Yakında.', fov: 'Kameranın görüş açısı.', showFps: 'Ekranın üstünde FPS sayacı.', fullscreen: 'Tam ekran ya da pencere modu.',
  volMaster: 'Tüm seslerin düzeyi.', volSfx: 'Silah, araç ve çevre sesleri.', volMusic: 'Menü ve radyo müziği.', subtitles: 'Diyalog altyazıları.',
  sensitivity: 'Fare ile kamera dönüş hızı.', invertY: 'Fareyi yukarı itince aşağı bak.', camShake: 'Patlama ve çarpışmalarda kamera sarsıntısı.',
  difficulty: 'Alınan ve verilen hasarı etkiler.', hudVisible: 'Ekran göstergelerini gizle (sinematik çekim için).', minimapRotate: 'Mini harita kamerayla dönsün mü?',
  language: 'Arayüz dili.',
};

export const SettingsMethods = {
  settingsMenu(startTab = 'gfx') {
    const g = this.game;
    const s = withDefaults(g.settings);
    let tab = startTab;
    const p = this.panel('AYARLAR', 'Değişiklikler anında uygulanır ve kaydedilir');
    p.classList.add('settings');
    const apply = () => { g.applySettings(true); applyExtendedSettings(g); };
    const m = this.openModal(p, { onClose: () => apply(), cls: 'sheet' });
    m.kind = 'settings';
    $('.x', p).onclick = () => this.closeModal(m);
    const body = $('.panel-body', p);
    body.classList.add('set-body');
    const rail = el('div', 'set-rail');
    const host = el('div', 'srows');
    const info = el('div', 'set-info');
    body.append(rail, host);
    p.appendChild(info);
    const idle = 'Fareyle bir ayarın üzerine gel ya da ok tuşlarıyla gezin.';
    const showInfo = (key) => { info.textContent = DESC[key] || idle; };
    const row = (label, ctrl, hint, key) => {
      const r = el('div', 'srow'); r.innerHTML = `<label>${label}${hint ? `<small>${hint}</small>` : ''}</label>`; r.appendChild(ctrl);
      if (key) { r.dataset.key = key; r.addEventListener('pointerenter', () => showInfo(key)); r.addEventListener('focusin', () => showInfo(key)); }
      host.appendChild(r);
    };
    const section = (t) => host.appendChild(el('h3', 'set-sec', t));
    const markPreset = () => {
      const c = host.querySelector('.srow[data-key="preset"] .seg');
      if (c) c.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.v === String(s.preset)));
    };
    const select = (key, opts, after) => {
      const d = el('div', 'seg');
      for (const [v, l] of opts) {
        const b = el('button', 'chip' + (s[key] === v ? ' on' : ''), l);
        b.dataset.v = String(v);
        b.onclick = () => {
          s[key] = v; d.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); b.classList.add('on'); audio.click();
          if (key !== 'preset' && PRESETS.low[key] !== undefined) { s.preset = 'custom'; markPreset(); }
          if (after) after(v);
          apply();
        };
        d.appendChild(b);
      }
      return d;
    };
    const slider = (key, min, max, step, fmt = (v) => v) => {
      const w = el('div', 'slider');
      const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = s[key];
      const v = el('span', '', String(fmt(s[key])));
      // sürüklerken yalnızca değer yazılır; ağır uygulama (yeniden boyutlama, kayıt) bırakınca
      i.oninput = () => { s[key] = parseFloat(i.value); v.textContent = fmt(s[key]); if (PRESETS.low[key] !== undefined && s.preset !== 'custom') { s.preset = 'custom'; markPreset(); } };
      i.onchange = () => apply();
      w.append(i, v);
      return w;
    };
    const onoff = (key) => select(key, [[false, 'Kapalı'], [true, 'Açık']]);
    const pct = (v) => Math.round(v * 100) + '%';
    const TABS = [['gfx', 'Grafik', 'monitor'], ['perf', 'Performans', 'gauge'], ['snd', 'Ses', 'speaker'], ['ctl', 'Kontroller', 'gamepad'], ['play', 'Oynanış', 'respect'], ['lang', 'Dil', 'globe']];
    let liveT = null;
    const render = () => {
      clearTimeout(liveT);
      rail.innerHTML = '';
      for (const [k, l, ic] of TABS) {
        const b = el('button', 'set-tab' + (k === tab ? ' on' : ''), `${svgImg(ic, null, 18)}<span>${l}</span>`);
        b.onclick = () => { if (tab === k) return; tab = k; audio.click(); render(); };
        rail.appendChild(b);
      }
      host.innerHTML = '';
      host.classList.remove('in'); void host.offsetWidth; host.classList.add('in');
      if (tab === 'gfx') {
        row('Hazır ayar', select('preset', [['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek'], ['ultra', 'Ultra'], ['custom', 'Özel']], (v) => { if (PRESETS[v]) Object.assign(s, PRESETS[v]); render(); }), null, 'preset');
        section('Görüntü');
        if (window.desktop) row('Ekran modu', select('fullscreen', [[true, 'Tam ekran'], [false, 'Pencere']]), null, 'fullscreen');
        row('Görüş açısı (FOV)', slider('fov', 55, 90, 1, (v) => v + '°'), null, 'fov');
        row('FPS göster', onoff('showFps'), null, 'showFps');
        section('Kalite');
        row('Grafik kalitesi', select('quality', [['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek']]), 'Yeni oyunda tam uygulanır', 'quality');
        row('Gölgeler', onoff('shadows'), null, 'shadows');
        row('Gölge kalitesi', select('shadowQuality', [['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek'], ['ultra', 'Ultra']]), null, 'shadowQuality');
        row('Çizim mesafesi', slider('drawDistance', 400, 2000, 100, (v) => v + ' m'), null, 'drawDistance');
        row('Işıma (Bloom)', onoff('bloom'), null, 'bloom');
        row('Ortam kapatma (AO)', onoff('ao'), 'Yüksek kalitede', 'ao');
        row('Kenar yumuşatma', onoff('antialias'), 'Yeniden başlatınca', 'antialias');
        row('Doku kalitesi', select('textureQuality', [['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek']]), 'Yeniden başlatınca', 'textureQuality');
        row('Hareket bulanıklığı', onoff('motionBlur'), 'Yakında', 'motionBlur');
      } else if (tab === 'perf') {
        const live = el('div', 'perf-live');
        host.appendChild(live);
        const tick = () => {
          if (!live.isConnected) return;
          const r = g.renderer;
          live.innerHTML = `<div><b>${g.fps}</b><span>FPS</span></div><div><b>${Math.round(g.perf.scale * 100)}%</b><span>Çözünürlük</span></div><div><b>${r ? r.info.render.calls : 0}</b><span>Çizim çağrısı</span></div><div><b>${r ? r.getPixelRatio().toFixed(2) : '-'}</b><span>Piksel oranı</span></div>`;
          liveT = setTimeout(tick, 500);
        };
        tick();
        section('Çözünürlük');
        row('Dinamik çözünürlük', onoff('dynamicRes'), 'Hedef 60 FPS', 'dynamicRes');
        row('Çözünürlük ölçeği', slider('renderScale', 0.5, 1, 0.05, pct), null, 'renderScale');
        section('Kare hızı');
        row('FPS sınırı', select('fpsCap', [[0, 'Yok'], [30, '30'], [60, '60'], [120, '120'], [144, '144']]), null, 'fpsCap');
        if (window.desktop) row('VSync', onoff('vsync'), 'Yeniden başlatınca', 'vsync');
        if (window.desktop) row('Ekran kartı', select('gpu', [['high', 'Performans'], ['default', 'Varsayılan'], ['low', 'Tasarruf']]), 'Yeniden başlatınca', 'gpu');
        section('Kalabalık');
        row('Yaya yoğunluğu', slider('npcDensity', 0.25, 1.5, 0.25, pct), null, 'npcDensity');
        row('Trafik yoğunluğu', slider('trafficDensity', 0.25, 1.5, 0.25, pct), null, 'trafficDensity');
      } else if (tab === 'snd') {
        row('Ana ses', slider('volMaster', 0, 1, 0.05, pct), null, 'volMaster');
        row('Efektler', slider('volSfx', 0, 1, 0.05, pct), null, 'volSfx');
        row('Müzik', slider('volMusic', 0, 1, 0.05, pct), null, 'volMusic');
        row('Altyazılar', onoff('subtitles'), null, 'subtitles');
      } else if (tab === 'ctl') {
        row('Fare hassasiyeti', slider('sensitivity', 0.2, 3, 0.1, (v) => v.toFixed(1)), null, 'sensitivity');
        row('Y eksenini ters çevir', select('invertY', [[false, 'Hayır'], [true, 'Evet']]), null, 'invertY');
        row('Kamera sarsıntısı', onoff('camShake'), null, 'camShake');
        section('Tuş atamaları');
        host.insertAdjacentHTML('beforeend', `<div class="keys">${KEYS.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div>`);
        host.appendChild(el('p', 'hint', 'Tuş değiştirme yakında. Şimdilik varsayılan düzen kullanılır.'));
      } else if (tab === 'play') {
        row('Zorluk', select('difficulty', Object.entries(DIFFICULTY).map(([k, d]) => [k, d.name])), 'Alınan / verilen hasarı etkiler', 'difficulty');
        row('HUD göster', onoff('hudVisible'), null, 'hudVisible');
        row('Mini harita dönsün', select('minimapRotate', [[true, 'Kamerayla'], [false, 'Kuzey sabit']]), null, 'minimapRotate');
      } else {
        row('Dil / Language', select('language', [['tr', 'Türkçe'], ['en', 'English (yakında)']]), null, 'language');
        host.appendChild(el('p', 'hint', 'Şu an yalnızca Türkçe destekleniyor.'));
      }
      info.textContent = idle;
    };
    render();
    return m;
  },
  controlsMenu() { return this.settingsMenu('ctl'); },
};
