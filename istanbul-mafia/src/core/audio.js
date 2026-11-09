// Tamamen prosedürel ses motoru: katmanlı silah sesleri, patlamalar, mermi vızıltısı, kovanlar, bıçak,
// şarjör değiştirme, sekme, yüzeye göre ayak sesi, çok osilatörlü motor, lastik sesi, rüzgâr,
// şehir ambiyansı, siren, martılar ve Hicaz makamında müzik.
// Konumlu sesler: mesafeye göre kısılır, alçak geçiren süzgeçle boğuklaşır, yankı payı artar ve
// dinleyicinin bakış yönüne göre stereo kaydırılır.

import { installSfx } from './sfx/index.js';

// Motor ses sınıfları: base/span rölanti ve devir aralığı (Hz), h2 alt harmonik, fire ateşleme titreşimi çarpanı,
// trem titreşim derinliği, nf/grit gürültü bandı ve miktarı, lp/lpSpan süzgeç, sq kare dalga, bright parlaklık, motor/vol kazanç
const ENGINE_KINDS = {
  car: { base: 38, span: 120, h2: 0.5, fire: 0.5, trem: 0.25, nf: 4, grit: 0.12, lp: 350, lpSpan: 1700, sq: 0.35, bright: 1, motor: 1, vol: 1 },
  small: { base: 46, span: 150, h2: 0.5, fire: 0.5, trem: 0.3, nf: 5, grit: 0.16, lp: 420, lpSpan: 2000, sq: 0.45, bright: 1.2, motor: 1, vol: 0.85 },
  old: { base: 34, span: 100, h2: 0.5, fire: 0.5, trem: 0.4, nf: 3.5, grit: 0.18, lp: 300, lpSpan: 1300, sq: 0.5, bright: 0.8, motor: 1, vol: 0.95 },
  sport: { base: 52, span: 200, h2: 0.5, fire: 0.75, trem: 0.18, nf: 6, grit: 0.1, lp: 500, lpSpan: 2600, sq: 0.25, bright: 1.6, motor: 1, vol: 1.15 },
  v8: { base: 30, span: 100, h2: 0.5, fire: 0.5, trem: 0.45, nf: 3, grit: 0.1, lp: 280, lpSpan: 1400, sq: 0.55, bright: 1.1, motor: 1, vol: 1.2 },
  diesel: { base: 27, span: 72, h2: 0.5, fire: 1, trem: 0.4, nf: 9, grit: 0.32, lp: 300, lpSpan: 1100, sq: 0.5, bright: 0.7, motor: 1, vol: 1.05 },
  truck: { base: 21, span: 55, h2: 0.5, fire: 1, trem: 0.45, nf: 10, grit: 0.35, lp: 220, lpSpan: 800, sq: 0.6, bright: 0.6, motor: 1, vol: 1.25 },
  tank: { base: 19, span: 42, h2: 0.5, fire: 1, trem: 0.5, nf: 8, grit: 0.3, lp: 200, lpSpan: 600, sq: 0.6, bright: 0.5, motor: 1, vol: 1.4 },
  moto: { base: 62, span: 270, h2: 0.5, fire: 0.5, trem: 0.35, nf: 4, grit: 0.12, lp: 600, lpSpan: 3000, sq: 0.3, bright: 1.5, motor: 1, vol: 0.95 },
  bike: { base: 40, span: 10, h2: 0.5, fire: 0.5, trem: 0, nf: 4, grit: 0, lp: 200, lpSpan: 0, sq: 0, bright: 0, motor: 0, vol: 0.5 },
  boat: { base: 40, span: 140, h2: 0.5, fire: 0.5, trem: 0.3, nf: 5, grit: 0.2, lp: 380, lpSpan: 1600, sq: 0.4, bright: 1.1, motor: 0.9, vol: 1 },
  prop: { base: 44, span: 110, h2: 0.5, fire: 0.5, trem: 0.35, nf: 4, grit: 0.15, lp: 400, lpSpan: 1400, sq: 0.4, bright: 1, motor: 1, vol: 1 },
  heli: { base: 40, span: 60, h2: 0.5, fire: 0.5, trem: 0.1, nf: 6, grit: 0.08, lp: 250, lpSpan: 500, sq: 0.2, bright: 0.5, motor: 0.35, vol: 1.3 },
  jet: { base: 40, span: 60, h2: 0.5, fire: 0.5, trem: 0.05, nf: 8, grit: 0.1, lp: 250, lpSpan: 400, sq: 0.1, bright: 0.3, motor: 0.15, vol: 1.4 },
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// Her karede güncellenen parametre: değer değişmediyse olay ekleme; ses saati ilerlemediyse (takılma / hızlı simülasyon)
// aynı ana yığılan olayları sil -> AudioParam zaman çizelgesi ve bellek sınırlı kalır
function tgt(p, v, t, tc) {
  if (p._lv !== undefined && Math.abs(p._lv - v) <= Math.abs(v) * 0.003 + 1e-4) return;
  if (p._lt !== undefined && t <= p._lt + 1e-4) p.cancelScheduledValues(t);
  p._lv = v; p._lt = t;
  p.setTargetAtTime(v, t, tc);
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.music = null;
    this.volume = { master: 0.8, sfx: 0.9, music: 0.5 };
    this.engineNode = null;
    this.sirenNode = null;
    this.musicTimer = null;
    this.musicMode = null;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.loops = {};
    this.surfaceAt = null; // (x,z) => 'concrete'|'grass'|'wood'|'metal'|'water' (combat.js atar)
    this.lastUpdate = 0;
    this.ambT = { horn: 6, gull: 9, dog: 25 };
    this.screechSet = 0;
    this.rpmPrev = 0; this.load = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10; this.comp.knee.value = 8; this.comp.ratio.value = 6; this.comp.attack.value = 0.003; this.comp.release.value = 0.25;
    this.comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.connect(this.comp);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.music = this.ctx.createGain(); this.music.connect(this.master);
    // yankı (şehir/oda)
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.2, 2.6);
    this.revGain = this.ctx.createGain(); this.revGain.gain.value = 0.3;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.brownBuf = this.makeBrown(3);
    this.applyVolume();
    // bekçi: oyun güncellemesi durunca (menü/duraklatma) sürekli döngüleri kıs
    setInterval(() => {
      if (!this.ctx || this.ctx.currentTime - this.lastUpdate < 0.4) return;
      for (const k of Object.keys(this.loops)) this.loopGain(k, 0, 0.3);
    }, 400);
  }

  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.volume.master;
    this.sfx.gain.value = this.volume.sfx;
    this.music.gain.value = this.volume.music * 0.6;
  }

  makeNoise(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  // kahverengi gürültü: uğultu, gürleme ve trafik için
  makeBrown(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return b;
  }
  impulse(sec, decay) {
    const len = this.ctx.sampleRate * sec;
    const b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 400 ? i / 400 : 1);
    }
    return b;
  }

  // mesafeye göre ses seviyesi (eski arayüz)
  att(x, z, range = 120) {
    if (x === undefined) return 1;
    const d = Math.hypot(x - this.listener.x, z - this.listener.z);
    return Math.max(0, 1 - d / range);
  }
  // dinleyiciye göre stereo konum (-1 sol .. 1 sağ)
  panOf(dx, dz) {
    const l = Math.hypot(dx, dz);
    if (l < 0.5) return 0;
    const y = this.listener.yaw || 0;
    return clamp((dx * -Math.cos(y) + dz * Math.sin(y)) / l, -1, 1) * 0.85;
  }
  // Konumlu çıkış zinciri: kazanç -> alçak geçiren -> stereo -> sfx (+ yankı gönderimi). null = duyulmaz
  spatial(x, z, range = 120, rev = 0.3) {
    if (!this.ctx) return null;
    const c = this.ctx;
    if (x === undefined) {
      const g = c.createGain(); g.connect(this.sfx);
      if (rev > 0) { const rg = c.createGain(); rg.gain.value = rev; g.connect(rg); rg.connect(this.reverb); }
      return { node: g, a: 1, d: 0 };
    }
    const dx = x - this.listener.x, dz = z - this.listener.z;
    const d = Math.hypot(dx, dz);
    const k = 1 - d / range;
    if (k <= 0.01) return null;
    // ses düğümü bütçesi: yoğun çatışmada (ya da hızlandırılmış testte) aynı anda yüzlerce ses grafiği kurulmasın
    // (ses saati ile ölçülür: ses işleme takılırsa biten düğüm olmaz, yenileri de kurulmaz -> bellek şişmez)
    const now = c.currentTime;
    if (now - (this._vT || 0) > 0.1 || now < (this._vT || 0)) { this._vT = now; this._vN = 0; }
    if (++this._vN > 30) return null;
    const a = Math.pow(k, 1.6);
    const g = c.createGain(); g.gain.value = a;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400 + 17000 * k * k * k; lp.Q.value = 0.5;
    g.connect(lp);
    let last = lp;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = this.panOf(dx, dz); lp.connect(p); last = p; }
    last.connect(this.sfx);
    if (rev > 0) { const rg = c.createGain(); rg.gain.value = rev * (0.6 + (1 - k) * 1.2); lp.connect(rg); rg.connect(this.reverb); }
    return { node: g, a, d };
  }
  // gürültü katmanı
  nz(out, t, { dur = 0.1, freq = 1000, q = 0.7, type = 'lowpass', gain = 1, attack = 0.002, rate = 1, sweep = 0, buf = null }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf || this.noiseBuf;
    src.playbackRate.value = rate * (0.9 + Math.random() * 0.2);
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  // osilatör katmanı
  osc(out, t, { freq = 440, freq2 = 0, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.003 }) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(Math.min(freq, 18000), t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(clamp(freq2, 10, 18000), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---- eski genel arayüz (UI ve görevler kullanır) ----
  noiseBurst({ dur = 0.2, freq = 1000, q = 1, type = 'lowpass', gain = 1, x, z, range, rev = 0.3, attack = 0.002 }) {
    const o = this.spatial(x, z, range || 120, rev);
    if (!o) return;
    this.nz(o.node, this.ctx.currentTime, { dur, freq, q, type, gain, attack });
  }
  tone({ freq = 440, freq2, dur = 0.2, type = 'sine', gain = 0.3, x, z, range, delay = 0 }) {
    const o = this.spatial(x, z, range || 120, 0);
    if (!o) return;
    this.osc(o.node, this.ctx.currentTime + delay, { freq, freq2, dur, type, gain, attack: 0.01 });
  }
  // mekanik çıt (şarjör, sürgü, horoz)
  clickAt(out, t, freq = 2500, gain = 0.2, dur = 0.025) {
    this.nz(out, t, { dur, freq, q: 3, type: 'bandpass', gain });
    // [ses B2] kare dalga yerine metal parça modları (dijital "bip" değil, çelik tıkırtısı)
    this.osc(out, t, { freq: freq * 0.93, dur: dur * 1.6, type: 'sine', gain: gain * 0.3, attack: 0.0005 });
    this.osc(out, t, { freq: freq * 1.71, dur: dur * 1.1, type: 'sine', gain: gain * 0.18, attack: 0.0005 });
  }

  // [ses B2] gunshot, explosion, impact, impactMetal, ricochet, shell, step, door, seagull, bark, setAmbience,
  // ambienceEvents, voice/megaphone, setSiren, müzik ve arayüz sesleri: src/core/sfx/ ve src/core/music.js
  // whiz (mermi vızıltısı/çatlaması) ve empty (boş tetik): sfx/weapons.js

  // ---------------- [savaş: yeni ses işlevleri] ----------------
  // oyuncu vurulunca: göğüse tok darbe + kısa inleme (k: şiddet)
  playerHurt(k = 1) {
    if (!this.ctx) return;
    const o = this.spatial(undefined, undefined, 1, 0);
    const t = this.ctx.currentTime;
    this.osc(o.node, t, { freq: 90, freq2: 40, dur: 0.18, type: 'sine', gain: 0.6 * k });
    this.nz(o.node, t, { dur: 0.06, freq: 900, gain: 0.35 * k });
    // inleme: ünlü formantlı kısa ses
    const f0 = 115 + Math.random() * 25;
    this.osc(o.node, t + 0.04, { freq: f0 * 1.15, freq2: f0 * 0.8, dur: 0.24, type: 'sawtooth', gain: 0.035 * k, attack: 0.02 });
  }
  // kalp atışı (ağır yaralı / kanama)
  heartbeat(k = 1) {
    if (!this.ctx) return;
    const o = this.spatial(undefined, undefined, 1, 0), t = this.ctx.currentTime;
    this.osc(o.node, t, { freq: 58, freq2: 38, dur: 0.12, gain: 0.45 * k });
    this.osc(o.node, t + 0.2, { freq: 52, freq2: 34, dur: 0.14, gain: 0.32 * k });
  }
  // helikopter pervane darbeleri (yaklaşık 0.3 sn'lik dilim; çağıran tekrarlar)
  heliChop(x, z, k = 1) {
    const o = this.spatial(x, z, 420, 0.4);
    if (!o) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this.nz(o.node, t + i * 0.075, { dur: 0.06, freq: 260, q: 0.8, type: 'lowpass', gain: 0.75 * k, attack: 0.004, buf: this.brownBuf });
    this.nz(o.node, t, { dur: 0.32, freq: 1800, q: 0.6, type: 'bandpass', gain: 0.05 * k, attack: 0.05 });
  }
  // konuşma / megafon / helikopter anonsu: sfx/announce.js (voice, megaphone, heliAnnounce)
  bulletFlesh(x, z) {
    const o = this.spatial(x, z, 50, 0.05);
    if (!o) return;
    const t = this.ctx.currentTime;
    this.nz(o.node, t, { dur: 0.07, freq: 650, gain: 0.7 });
    this.osc(o.node, t, { freq: 115, freq2: 55, dur: 0.09, gain: 0.4 });
  }
  // bıçak saplanması / kesik: tok vuruş + ıslak ses
  fleshHit(x, z, k = 1) {
    const o = this.spatial(x, z, 40, 0.05);
    if (!o) return;
    const t = this.ctx.currentTime;
    this.nz(o.node, t, { dur: 0.09, freq: 520, gain: 0.7 * k });
    this.nz(o.node, t + 0.01, { dur: 0.16, freq: 420, q: 5, type: 'bandpass', gain: 0.5 * k, sweep: 220 });
    this.osc(o.node, t, { freq: 95, freq2: 50, dur: 0.1, gain: 0.35 * k });
  }
  punch(x, z, k = 1) {
    const o = this.spatial(x, z, 40, 0.05);
    if (!o) return;
    const t = this.ctx.currentTime;
    this.nz(o.node, t, { dur: 0.08, freq: 600 / k, gain: 0.8 * k });
    this.osc(o.node, t, { freq: 120 / k, freq2: 60 / k, dur: 0.1, gain: 0.5 * k });
    if (k > 1.2) this.osc(o.node, t, { freq: 340, freq2: 260, dur: 0.12, type: 'triangle', gain: 0.12 }); // tahta sopa tınısı
  }
  // savuruş: 'knife' ıslık gibi keskin, 'bat' ağır, 'throw' fırlatma, varsayılan yumruk
  swing(kind) {
    const o = this.spatial(undefined, undefined, 0, 0);
    if (!o) return;
    const t = this.ctx.currentTime;
    if (kind === 'knife') { this.nz(o.node, t, { dur: 0.17, freq: 900, q: 3, type: 'bandpass', gain: 0.3, attack: 0.03, sweep: 3400 }); return; }
    if (kind === 'bat') { this.nz(o.node, t, { dur: 0.26, freq: 350, q: 2, type: 'bandpass', gain: 0.4, attack: 0.06, sweep: 1300 }); return; }
    if (kind === 'throw') { this.nz(o.node, t, { dur: 0.22, freq: 500, q: 1.5, type: 'bandpass', gain: 0.3, attack: 0.05, sweep: 1600 }); return; }
    this.nz(o.node, t, { dur: 0.13, freq: 1500, q: 2, type: 'bandpass', gain: 0.22, attack: 0.02, sweep: 700 });
  }
  grenadeBounce(x, z, k = 1) {
    const o = this.spatial(x, z, 40, 0.1);
    if (!o) return;
    const t = this.ctx.currentTime;
    this.osc(o.node, t, { freq: 880, dur: 0.12, gain: 0.12 * k });
    this.osc(o.node, t, { freq: 1370, dur: 0.08, gain: 0.07 * k });
    this.nz(o.node, t, { dur: 0.03, freq: 2000, type: 'bandpass', gain: 0.3 * k });
  }
  // çarpışma: alçak gümleme + metal ezilmesi + saçılan parçalar (her seferinde biraz farklı)
  crash(x, z, k = 1) {
    const o = this.spatial(x, z, 140, 0.3);
    if (!o) return;
    const t = this.ctx.currentTime, v = Math.random();
    this.osc(o.node, t, { freq: 75 + v * 30, freq2: 32, dur: 0.35, type: 'sine', gain: 0.5 * k });
    this.nz(o.node, t, { dur: 0.35 + v * 0.2, freq: 700 + v * 600, gain: 0.8 * k });
    this.nz(o.node, t + 0.01, { dur: 0.25, freq: 1600 + v * 1400, q: 3, type: 'bandpass', gain: 0.35 * k, sweep: 900 });
    this.osc(o.node, t, { freq: 90, freq2: 40, dur: 0.3, type: 'square', gain: 0.12 * k });
    const n = 3 + Math.floor(k * 4);
    for (let i = 0; i < n; i++) this.nz(o.node, t + 0.05 + Math.random() * 0.45, { dur: 0.03, freq: 2500 + Math.random() * 3500, q: 2, type: 'bandpass', gain: 0.2 * k }); // parça/cam
  }
  // şarjör değiştirme dizisi: kind = silah kimliği, time = toplam süre
  reload(kind, time = 1.5) {
    const o = this.spatial(undefined, undefined, 0, 0.1);
    if (!o) return;
    const t = this.ctx.currentTime, T = time;
    if (!kind) { this.clickAt(o.node, t, 2000, 0.2); this.clickAt(o.node, t + 0.35, 1400, 0.22); return; }
    if (kind === 'revolver') {
      this.clickAt(o.node, t, 1800, 0.25);
      for (let i = 0; i < 3; i++) this.shell(undefined, undefined, false, 0.6);
      for (let i = 0; i < 6; i++) this.clickAt(o.node, t + T * (0.3 + i * 0.08), 2600, 0.12, 0.015);
      this.clickAt(o.node, t + T * 0.88, 1500, 0.3, 0.04);
      return;
    }
    if (kind === 'shotgun') {
      for (let i = 0; i < 4; i++) { this.clickAt(o.node, t + T * (0.1 + i * 0.18), 1100, 0.22, 0.04); this.nz(o.node, t + T * (0.1 + i * 0.18) - 0.05, { dur: 0.06, freq: 2000, type: 'bandpass', gain: 0.08 }); }
      this.clickAt(o.node, t + T * 0.86, 1500, 0.35, 0.04); this.clickAt(o.node, t + T * 0.93, 1800, 0.4, 0.04);
      return;
    }
    if (kind === 'rpg') { this.nz(o.node, t + T * 0.4, { dur: 0.2, freq: 600, q: 1, type: 'bandpass', gain: 0.3, sweep: 300 }); this.clickAt(o.node, t + T * 0.85, 900, 0.4, 0.06); return; }
    // şarjörlü silahlar: bırak, çıkar, tak, sürgüyü çek
    this.clickAt(o.node, t, 2400, 0.2);
    this.nz(o.node, t + 0.08, { dur: 0.14, freq: 1500, q: 1.5, type: 'bandpass', gain: 0.12, sweep: 700 });
    this.nz(o.node, t + T * 0.55, { dur: 0.06, freq: 500, gain: 0.35 });
    this.clickAt(o.node, t + T * 0.56, 1600, 0.3, 0.03);
    this.clickAt(o.node, t + T * 0.8, 2200, 0.25);
    this.nz(o.node, t + T * 0.81, { dur: 0.09, freq: 2500, q: 2, type: 'bandpass', gain: 0.14, sweep: 1200 });
    this.clickAt(o.node, t + T * 0.9, 1700, 0.32, 0.035);
  }
  // arayüz sesleri (click, hover, cash, error, success, fail): sfx/ui.js
  // Telefon zil sesi: marimba tınılı kısa motif (bir çağrıda her ~2,6 sn'de bir çalınır). kind: 'reis' | 'kalp' | 'normal'
  ringtone(kind = 'normal') {
    if (!this.ctx) return;
    const M = {
      reis: [[659, 0], [494, 0.14], [587, 0.28], [659, 0.42], [784, 0.7], [740, 0.84], [659, 0.98]],
      kalp: [[880, 0], [1047, 0.16], [1319, 0.32], [1175, 0.56], [1047, 0.72], [880, 0.88]],
      normal: [[1319, 0], [988, 0.12], [1319, 0.24], [988, 0.36], [1319, 0.66], [988, 0.78], [1319, 0.9], [988, 1.02]],
    }[kind] || [];
    for (const [f, d] of M) {
      this.tone({ freq: f, dur: 0.22, type: 'sine', gain: 0.11, delay: d });
      this.tone({ freq: f * 4, dur: 0.05, type: 'triangle', gain: 0.025, delay: d }); // tokmak vuruşu
      this.tone({ freq: f * 2.01, dur: 0.12, type: 'sine', gain: 0.03, delay: d });
    }
  }
  phoneBeep(n = 1) { for (let i = 0; i < n; i++) this.tone({ freq: 425, dur: 0.18, type: 'sine', gain: 0.12, delay: i * 0.32 }); }
  meow(x, z) { this.tone({ freq: 700, freq2: 1100, dur: 0.15, type: 'sawtooth', gain: 0.08, x, z, range: 25 }); this.tone({ freq: 1100, freq2: 500, dur: 0.35, type: 'sawtooth', gain: 0.08, x, z, range: 25, delay: 0.15 }); }
  // acı inlemesi (yaralanan sokak hayvanı): köpekte tiz kaynama, kedide çığlık
  yelp(x, z, dog) { if (dog) { this.tone({ freq: 1400, freq2: 700, dur: 0.18, type: 'sawtooth', gain: 0.12, x, z, range: 50 }); this.tone({ freq: 1200, freq2: 600, dur: 0.22, type: 'sawtooth', gain: 0.1, x, z, range: 50, delay: 0.22 }); } else this.tone({ freq: 900, freq2: 1600, dur: 0.4, type: 'sawtooth', gain: 0.1, x, z, range: 35 }); }
  scream(x, z) { this.tone({ freq: 900, freq2: 1300, dur: 0.5, type: 'sawtooth', gain: 0.07, x, z, range: 60 }); }
  splash(x, z, k = 1) {
    const o = this.spatial(x, z, 60, 0.2);
    if (!o) return;
    const t = this.ctx.currentTime;
    this.nz(o.node, t, { dur: 0.6 * Math.sqrt(k), freq: 1200, gain: 0.8 * k, sweep: 500 });
    this.nz(o.node, t + 0.05, { dur: 0.3, freq: 2500, q: 2, type: 'bandpass', gain: 0.2 * k });
  }

  // ---------------- sürekli döngüler ----------------
  // Çok osilatörlü motor: rpm 0..1+, gain ses düzeyi, load (isteğe bağlı) 0..1 gaz yükü
  // ===================== ARAÇ / MOTOR SESLERİ (araç mühendisi) =====================
  // setEngine(on, rpm, gain, load, opts): rpm ~0.15..1.4. opts (isteğe bağlı) = { kind, throttle, speed, gear, surface, boost, rotor, big }
  // kind: car | small | sport | v8 | old | diesel | truck | moto | bike | tank | boat | heli | jet | prop
  // opts'lu çağrı (araç kendi sınıfını bildirir) 0.25 sn boyunca opts'suz genel çağrıları bastırır.
  setEngine(on, rpm = 0, gain = 0.15, load, opts) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (on && !opts && this._engOptsT && c.currentTime - this._engOptsT < 0.25) return;
    if (opts) this._engOptsT = c.currentTime;
    if (on && !this.engineNode) {
      const mk = (type) => { const o = c.createOscillator(); o.type = type; return o; };
      const o1 = mk('sawtooth'), o2 = mk('square'), o3 = mk('sawtooth'), o4 = mk('sine'), ow = mk('sine');
      o3.detune.value = 9;
      const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain(), g4 = c.createGain(), gw = c.createGain();
      g1.gain.value = 0.5; g2.gain.value = 0.35; g3.gain.value = 0.2; g4.gain.value = 0.6; gw.gain.value = 0;
      const nsrc = c.createBufferSource(); nsrc.buffer = this.noiseBuf; nsrc.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 2; nf.frequency.value = 300;
      const ng = c.createGain(); ng.gain.value = 0.15;
      // ikinci katman: kahverengi gürültü uğultusu (jet/rotor/su), genlik modülasyonlu (rotor "çat-çat")
      const bsrc = c.createBufferSource(); bsrc.buffer = this.brownBuf || this.noiseBuf; bsrc.loop = true;
      const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 400; rf.Q.value = 0.7;
      const am = c.createGain(); am.gain.value = 1;
      const amL = mk('sine'); amL.frequency.value = 18; const amG = c.createGain(); amG.gain.value = 0;
      amL.connect(amG); amG.connect(am.gain);
      const rg = c.createGain(); rg.gain.value = 0;
      bsrc.connect(rf); rf.connect(am); am.connect(rg);
      const mix = c.createGain();
      o1.connect(g1); o2.connect(g2); o3.connect(g3); o4.connect(g4); nsrc.connect(nf); nf.connect(ng);
      for (const n of [g1, g2, g3, g4, ng]) n.connect(mix);
      const shaper = c.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); }
      shaper.curve = curve;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 1.2;
      // silindir ateşlemelerinin titreşimi
      const trem = c.createGain(); trem.gain.value = 0.8;
      const lfo = mk('sine'); lfo.frequency.value = 12;
      const lfoG = c.createGain(); lfoG.gain.value = 0.2;
      lfo.connect(lfoG); lfoG.connect(trem.gain);
      const mg = c.createGain(); mg.gain.value = 1; // motor (osilatör) yolu
      const g = c.createGain(); g.gain.value = 0;
      mix.connect(shaper); shaper.connect(f); f.connect(trem); trem.connect(mg); mg.connect(g);
      ow.connect(gw); gw.connect(g); rg.connect(g);
      g.connect(this.sfx);
      for (const o of [o1, o2, o3, o4, ow, lfo, amL]) o.start();
      nsrc.start(); bsrc.start(0, Math.random() * 2);
      this.engineNode = { o1, o2, o3, o4, ow, gw, nsrc, nf, ng, g2, g3, f, lfo, lfoG, mg, rf, rg, amL, amG, g, stop: [o1, o2, o3, o4, ow, lfo, amL, nsrc, bsrc] };
    }
    if (!on && this.engineNode) {
      const n = this.engineNode; this.engineNode = null;
      n.g.gain.setTargetAtTime(0, c.currentTime, 0.05);
      setTimeout(() => { for (const s of n.stop) { try { s.stop(); } catch (e) { /* zaten durdu */ } } }, 300);
      for (const l of ['gravel', 'roadwind', 'water', 'freewheel']) this.loopGain(l, 0, 0.1);
      return;
    }
    if (!this.engineNode) return;
    const t = c.currentTime, n = this.engineNode, o = opts || {};
    if (load === undefined) {
      // yük tahmini: devir artıyorsa gaz veriliyor
      const want = o.throttle !== undefined ? Math.max(0, o.throttle) : rpm > this.rpmPrev + 0.0005 ? 1 : rpm < this.rpmPrev - 0.0005 ? 0 : this.load;
      this.load += (want - this.load) * 0.08;
      load = this.load;
    }
    this.rpmPrev = rpm;
    const r = clamp(rpm, 0, 1.4);
    const K = ENGINE_KINDS[o.kind] || ENGINE_KINDS.car;
    const S = (p, v, tc = 0.05) => tgt(p, v, t, tc);
    const base = K.base + r * K.span;
    S(n.o1.frequency, base); S(n.o2.frequency, base * K.h2); S(n.o3.frequency, base * 2); S(n.o4.frequency, base * 0.25);
    S(n.lfo.frequency, base * K.fire); S(n.lfoG.gain, K.trem - r * K.trem * 0.5, 0.1);
    S(n.nf.frequency, base * K.nf); S(n.ng.gain, K.grit * (0.5 + load * 1.2), 0.1);
    S(n.g2.gain, K.sq, 0.2);
    S(n.g3.gain, (0.12 + load * 0.3) * K.bright, 0.1);
    S(n.f.frequency, K.lp + r * K.lpSpan + load * 900, 0.06);
    S(n.mg.gain, K.motor, 0.1);
    // uğultu katmanı: rotor çırpması / jet gürlemesi / dalga
    const sp = o.speed || 0;
    if (o.kind === 'heli') {
      const rot = o.rotor !== undefined ? o.rotor : r;
      S(n.amL.frequency, 4 + rot * 15, 0.3); S(n.amG.gain, 0.85 * rot, 0.2);
      S(n.rf.frequency, 250 + rot * 500 + load * 300, 0.1); S(n.rg.gain, rot * (0.9 + load * 0.5), 0.2);
      S(n.ow.frequency, 1700 + rot * 900, 0.3); S(n.gw.gain, rot * 0.035, 0.3);
    } else if (o.kind === 'jet') {
      const th = o.throttle || 0, b = o.boost || 0;
      S(n.amG.gain, b * 0.25, 0.2); S(n.amL.frequency, 31, 0.2);
      S(n.rf.frequency, 300 + th * 1500 + b * 1200, 0.15); S(n.rg.gain, 0.35 + th * 0.9 + b * 1.1, 0.2);
      S(n.ow.frequency, 1500 + th * 4200, 0.4); S(n.gw.gain, 0.03 + th * 0.06, 0.3);
    } else if (o.kind === 'tank') {
      S(n.amG.gain, 0.6, 0.2); S(n.amL.frequency, 2 + sp * 1.6, 0.1); // palet şakırtısı
      S(n.rf.frequency, 600 + sp * 60, 0.1); S(n.rg.gain, Math.min(0.9, sp * 0.12), 0.15); S(n.gw.gain, 0.012 + r * 0.02, 0.2); S(n.ow.frequency, 900 + r * 700, 0.2);
    } else {
      S(n.amG.gain, 0, 0.2); S(n.rg.gain, 0, 0.2); S(n.gw.gain, o.kind === 'sport' || o.kind === 'v8' ? load * r * 0.02 : 0, 0.15); S(n.ow.frequency, 2400 + r * 3000, 0.1); // turbo ıslığı
    }
    S(n.g.gain, gain * (0.8 + load * 0.35) * K.vol, 0.1);
    // zemin ve hız katmanları
    const ground = o.kind !== 'heli' && o.kind !== 'jet' && o.kind !== 'boat' && o.kind !== 'prop';
    const dirt = ground && (o.surface === 'grass' || o.surface === 'dirt');
    const gl = this.loop('gravel', { type: 'bandpass', freq: 1100, q: 0.9, lfoRate: 9, lfoDepth: 500 });
    tgt(gl.f.frequency, 700 + Math.min(1500, sp * 60), t, 0.2);
    this.loopGain('gravel', dirt ? Math.min(0.2, sp * 0.012) : 0, 0.15);
    this.loop('roadwind', { buf: this.brownBuf, type: 'bandpass', freq: 500, q: 0.6, lfoRate: 0.3, lfoDepth: 150 });
    this.loopGain('roadwind', ground ? Math.min(0.14, Math.max(0, sp - 8) * 0.004) * (o.kind === 'moto' || o.kind === 'bike' ? 1.8 : 1) : 0, 0.3);
    this.loop('water', { buf: this.brownBuf, type: 'lowpass', freq: 700, q: 0.8, lfoRate: 0.7, lfoDepth: 300 });
    this.loopGain('water', o.kind === 'boat' ? 0.05 + Math.min(0.25, sp * 0.012) : 0, 0.3);
    const fw = this.loop('freewheel', { type: 'highpass', freq: 3500, q: 0.7, lfoRate: 8, lfoDepth: 0 });
    if (o.kind === 'bike') { tgt(fw.f.frequency, 3000 + sp * 200, t, 0.2); this.loopGain('freewheel', (o.throttle > 0 ? 0.004 : 0.018) * Math.min(1, sp / 4), 0.1); }
    else this.loopGain('freewheel', 0, 0.1);
  }

  // genel döngü kaynağı (gürültü -> süzgeç -> kazanç), lazy oluşturulur
  loop(name, { buf, type = 'lowpass', freq = 500, q = 0.7, lfoRate = 0, lfoDepth = 0 }) {
    if (this.loops[name]) return this.loops[name];
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = buf || this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.sfx);
    if (lfoRate) { const l = c.createOscillator(); l.frequency.value = lfoRate; const lg = c.createGain(); lg.gain.value = lfoDepth; l.connect(lg); lg.connect(f.frequency); l.start(); }
    src.start(0, Math.random() * 2);
    this.loops[name] = { src, f, g };
    return this.loops[name];
  }
  loopGain(name, v, tc = 0.2) { const l = this.loops[name]; if (l) tgt(l.g.gain, v, this.ctx.currentTime, tc); }

  // Lastik cızırtısı: her karede çağrılır, amount 0..1
  screech(amount = 0) {
    if (!this.ctx) return;
    const l = this.loop('screech', { type: 'bandpass', freq: 2900, q: 7, lfoRate: 7, lfoDepth: 260 });
    const a = clamp(amount, 0, 1);
    // aynı karede araç skid() çağırdıysa genel güncelleme (audio.update) onu ezmesin
    if (this._skidT && this.ctx.currentTime - this._skidT < 0.1 && amount < this.screechSet) return;
    this.screechSet = a;
    tgt(l.f.frequency, 2600 + a * 900, this.ctx.currentTime, 0.1);
    this.loopGain('screech', a * 0.11, 0.06);
  }
  // Kayma: asfaltta cızırtı, toprak/çimde çakıl hışırtısı
  skid(amount = 0, surface = 'concrete', speed = 0) {
    if (!this.ctx) return;
    const dirt = surface === 'grass' || surface === 'dirt';
    this.screech(dirt ? 0 : amount);
    this._skidT = this.ctx.currentTime;
    if (dirt) { this.loop('gravel', { type: 'bandpass', freq: 1100, q: 0.9, lfoRate: 9, lfoDepth: 500 }); this.loopGain('gravel', Math.min(0.3, amount * 0.25 + speed * 0.012), 0.08); }
  }
  // vites değişimi: debriyaj tıkırtısı + kısa emme
  gearShift(up = true, kind = 'car') {
    if (!this.ctx || kind === 'bike') return;
    const o = this.spatial(undefined, undefined, 0, 0.05); if (!o) return;
    const t = this.ctx.currentTime;
    this.osc(o.node, t, { freq: up ? 160 : 120, freq2: up ? 90 : 160, dur: 0.07, type: 'square', gain: 0.035 });
    this.nz(o.node, t, { dur: 0.05, freq: 1800, q: 2, type: 'bandpass', gain: 0.06 });
  }
  // turbo boşaltma (gaz kesince "pışşt")
  turbo(k = 1) {
    if (!this.ctx) return;
    const o = this.spatial(undefined, undefined, 0, 0.1); if (!o) return;
    const t = this.ctx.currentTime;
    this.nz(o.node, t, { dur: 0.38, freq: 3200, q: 3, type: 'bandpass', gain: 0.22 * k, sweep: 1400 });
    this.osc(o.node, t, { freq: 5200, freq2: 2600, dur: 0.3, type: 'sine', gain: 0.025 * k });
  }
  // korna: araç türüne göre (player.js horn(x,z) çağırır; tür araçta hornKind ile seçilir)
  horn(x, z, kind) {
    const k = kind || this.hornKind || 'car';
    if (k === 'truck') { this.tone({ freq: 155, dur: 0.9, type: 'sawtooth', gain: 0.2, x, z, range: 260 }); this.tone({ freq: 185, dur: 0.9, type: 'sawtooth', gain: 0.16, x, z, range: 260 }); this.tone({ freq: 233, dur: 0.9, type: 'square', gain: 0.07, x, z, range: 260 }); }
    else if (k === 'moto') { this.tone({ freq: 520, dur: 0.25, type: 'square', gain: 0.14, x, z, range: 90 }); this.tone({ freq: 620, dur: 0.25, type: 'square', gain: 0.1, x, z, range: 90 }); }
    else if (k === 'bell') { for (const d of [0, 0.16]) { this.tone({ freq: 2650, dur: 0.5, type: 'sine', gain: 0.1, x, z, range: 50, delay: d }); this.tone({ freq: 3420, dur: 0.35, type: 'sine', gain: 0.06, x, z, range: 50, delay: d }); } }
    else { this.tone({ freq: 392, dur: 0.4, type: 'square', gain: 0.18, x, z, range: 100 }); this.tone({ freq: 466, dur: 0.4, type: 'square', gain: 0.14, x, z, range: 100 }); }
  }
  // tank topu: derin gümleme + basınç dalgası
  cannon(x, z) {
    const o = this.spatial(x, z, 600, 0.8); if (!o) return;
    const t = this.ctx.currentTime;
    this.osc(o.node, t, { freq: 70, freq2: 28, dur: 0.9, type: 'sine', gain: 0.8 });
    this.nz(o.node, t, { dur: 0.7, freq: 380, gain: 1.0, buf: this.brownBuf });
  }
  // cam sesleri: dosya sonundaki [savaş: cam ve beden sesleri] bölümünde (glassCrack / glassBreak)
  // metal ezilmesi / sürtünme (çarpışmada ek katman)
  crashMetal(x, z, k = 1) {
    const o = this.spatial(x, z, 150, 0.35); if (!o) return;
    const t = this.ctx.currentTime;
    this.nz(o.node, t, { dur: 0.6 + Math.random() * 0.3, freq: 900 + Math.random() * 900, q: 4, type: 'bandpass', gain: 0.4 * k, sweep: 500 });
    this.osc(o.node, t + 0.02, { freq: 220 + Math.random() * 180, freq2: 120, dur: 0.4, type: 'sawtooth', gain: 0.05 * k });
  }
  setWind(k = 0) {
    if (!this.ctx) return;
    this.loop('wind', { buf: this.brownBuf, type: 'lowpass', freq: 450, q: 1.5, lfoRate: 0.13, lfoDepth: 220 });
    this.loopGain('wind', clamp(k, 0, 1) * 0.16, 0.8);
  }

  // Kare kancası (combat.update çağırır): dinleyici yönü, ortam, rüzgâr ve lastik sesi
  update(dt, game) {
    if (!this.ctx) return;
    this.lastUpdate = this.ctx.currentTime;
    const p = game.player;
    if (!p) return;
    this.listener.yaw = p.vehicle ? p.vehicle.heading : p.camYaw;
    const outside = !p.inInterior && game.mode === 'playing';
    const night = game.env ? game.env.nightFactor : 0;
    this.setAmbience(outside ? 0.8 - night * 0.35 : 0.08);
    let wind = outside ? 0.25 + Math.min(0.5, Math.max(0, p.pos.y - 6) * 0.02) : 0;
    let scr = 0;
    const v = p.vehicle;
    if (v && !v.destroyed && v.fwd) {
      const sp = Math.hypot(v.vx || 0, v.vz || 0);
      wind += Math.min(0.5, sp / 60);
      const ls = Math.abs((v.vx || 0) * -v.fwd.z + (v.vz || 0) * v.fwd.x);
      scr = clamp((ls - 3) / 8, 0, 1);
      if (v.controls && v.controls.handbrake && Math.abs(v.fs || 0) > 6) scr = Math.max(scr, 0.5);
      if ((v.pos.y || 0) > 1) scr = 0;
    }
    this.setWind(wind);
    this.screech(scr);
    if (outside) this.ambienceEvents(dt);
  }

  // siren: sfx/siren.js (setSiren + araç başına konumlu siren, Doppler)

  // müzik: core/music.js (startMusic, stopMusic, duckMusic)

}


// =====================================================================================================
// [savaş: cam ve beden sesleri] (A2 — Çatışma ve Beden). Diğer seslerden ayrı tutulur.
// Sesler ilk kullanımda JS ile örneklenip AudioBuffer'a yazılır (birkaç varyant); çalarken tek kaynak düğümü
// kurulur -> yoğun çatışmada düğüm yığılması olmaz. Kaynaklar: katmanlı gürültü, rezonanslı süzgeçler (RBJ biquad),
// çok sayıda minik rastgele "çın" taneciği (kırılmada dökülen cam), ıslak et ve kemik darbesi.
// =====================================================================================================
function rbjBand(f, q, sr) {
  const w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
  return { b0: al / a0, b2: -al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function bq(F, x) { const y = F.b0 * x + F.b2 * F.x2 - F.a1 * F.y1 - F.a2 * F.y2; F.x2 = F.x1; F.x1 = x; F.y2 = F.y1; F.y1 = y; return y; }
function normBuf(d, peak = 0.9) { let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); if (m > 0) { const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; } }
// rezonanslı cam "çın" taneciği: üç uyumsuz kısmi + mikro gürültü tıkı, üstel sönüm
function grain(d, sr, t0, f, dec, amp) {
  const i0 = Math.floor(t0 * sr), n = Math.min(d.length - i0, Math.floor(dec * 7 * sr));
  if (n <= 0) return;
  const r2 = 1.47 + Math.random() * 1.3, r3 = 2.6 + Math.random() * 1.9, ph = Math.random() * 6;
  const w1 = 2 * Math.PI * f / sr;
  // [B1 performans] örnek başına sin/exp yerine dönen fazörler ve çarpımsal sönüm (aynı sinyal, ~10x hızlı)
  let c1 = Math.cos(ph), s1 = Math.sin(ph), c2 = 1, s2 = 0, c3 = 1, s3 = 0;
  const k1c = Math.cos(w1), k1s = Math.sin(w1), k2c = Math.cos(w1 * r2), k2s = Math.sin(w1 * r2), k3c = Math.cos(w1 * r3), k3s = Math.sin(w1 * r3);
  const m1 = Math.exp(-1 / (sr * dec)), m2 = Math.exp(-1 / (sr * dec * 0.6)), m3 = Math.exp(-1 / (sr * dec * 0.35));
  let e1 = 1, e2 = 1, e3 = 1;
  for (let i = 0; i < n; i++) {
    const v = s1 + 0.55 * s2 * e2 + 0.3 * s3 * e3;
    d[i0 + i] += amp * e1 * (i < 12 ? i / 12 : 1) * v + (i < 40 ? amp * 0.6 * (Math.random() * 2 - 1) * (1 - i / 40) : 0);
    let t = c1 * k1c - s1 * k1s; s1 = s1 * k1c + c1 * k1s; c1 = t;
    t = c2 * k2c - s2 * k2s; s2 = s2 * k2c + c2 * k2s; c2 = t;
    t = c3 * k3c - s3 * k3s; s3 = s3 * k3c + c3 * k3s; c3 = t;
    e1 *= m1; e2 *= m2; e3 *= m3;
  }
}
function synthCrack(sr) {
  const d = new Float32Array(Math.floor(sr * 0.42));
  // 1) mermi darbesi: kısa geniş bant tık + boğuk gövde
  const hp = rbjBand(5200, 0.7, sr), th = rbjBand(190, 1.2, sr);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, n = Math.random() * 2 - 1;
    d[i] += bq(hp, n) * Math.exp(-t / 0.006) * 1.4 + bq(th, n) * Math.exp(-t / 0.03) * 2.2;
  }
  // 2) çatlak yayılması: hızlanan mikro kırılma tıkları (3-8 kHz rezonans), 6-14 adet ~45 ms içinde
  const N = 6 + Math.floor(Math.random() * 9);
  let tt = 0.002;
  for (let k = 0; k < N; k++) { tt += 0.002 + Math.random() * 0.006; grain(d, sr, tt, 3000 + Math.random() * 5200, 0.0016 + Math.random() * 0.003, 0.5 * (1 - k / N * 0.5)); }
  // 3) camın kendi tınısı: birkaç uyumsuz kısmi, yavaş sönüm (gergin levha)
  for (let k = 0; k < 3; k++) grain(d, sr, 0.003 + Math.random() * 0.01, 1800 + Math.random() * 4200, 0.03 + Math.random() * 0.06, 0.12);
  // 4) ince "çıtırtı" kuyruğu: çatlak yerleşirken seyrek tanecikler
  for (let k = 0; k < 5; k++) grain(d, sr, 0.06 + Math.random() * 0.28, 4000 + Math.random() * 4000, 0.002 + Math.random() * 0.004, 0.08);
  normBuf(d, 0.85);
  return d;
}
function synthShatter(sr, windshield) {
  const d = new Float32Array(Math.floor(sr * 1.9));
  // 1) kırılma anı: sert geniş bant patlama + rezonanslı çarpma gövdesi
  const h1 = rbjBand(3800, 0.6, sr), h2 = rbjBand(7200, 1.1, sr), lo = rbjBand(420, 0.9, sr);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, n = Math.random() * 2 - 1;
    d[i] += bq(h1, n) * (Math.exp(-t / 0.05) * 1.6 + Math.exp(-t / 0.3) * 0.35) + bq(h2, n) * Math.exp(-t / 0.12) * 0.9 + bq(lo, n) * Math.exp(-t / 0.04) * (windshield ? 1.6 : 0.9);
  }
  // 2) yüzlerce parçanın dökülmesi: başta yoğun, zamanla seyrekleşen çın tanecikleri
  const G = windshield ? 90 : 150;
  for (let k = 0; k < G; k++) {
    const u = Math.random(), t0 = 0.004 + 1.25 * Math.pow(u, 2.4);
    const late = t0 / 1.3;
    grain(d, sr, t0, 2200 + Math.random() * 7600 - late * 1500, 0.004 + Math.random() * 0.03, (0.07 + Math.random() * 0.16) * (1 - late * 0.7));
  }
  // 3) yere çarpan iri parçalar: daha alçak, iki-üç zıplama
  for (let k = 0; k < 10; k++) { const t0 = 0.18 + Math.random() * 0.9; for (let j = 0; j < 3; j++) grain(d, sr, t0 + j * (0.05 + Math.random() * 0.05), 1400 + Math.random() * 2600, 0.01 + Math.random() * 0.02, 0.16 / (j + 1)); }
  // 4) kumlanma: dökülürken ince tıslama (yüksek frekans gürültü, yavaş sönüm)
  const hs = rbjBand(8500, 0.8, sr);
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] += bq(hs, Math.random() * 2 - 1) * 0.18 * Math.exp(-t / 0.55) * Math.min(1, t / 0.02); }
  normBuf(d, 0.92);
  return d;
}
function synthFlesh(sr, head) {
  const d = new Float32Array(Math.floor(sr * 0.26));
  // ıslak darbe: alçak gürültü patlaması + perdesi düşen gövde vuruşu (tahta "tok" değil: kısa, yumuşak, sönümlü)
  const lp = rbjBand(900, 0.5, sr), sq = rbjBand(1100, 2.2, sr), f0 = 95 + Math.random() * 35;
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, n = Math.random() * 2 - 1;
    ph += 2 * Math.PI * (f0 * (0.55 + 0.45 * Math.exp(-t / 0.025))) / sr;
    // emişli "şlap": süzgeç merkezi zamanla iner
    if ((i & 63) === 0) { const fc = 1150 * Math.exp(-t / 0.05) + 280; const F = rbjBand(fc, 2.2, sr); sq.b0 = F.b0; sq.b2 = F.b2; sq.a1 = F.a1; sq.a2 = F.a2; }
    d[i] += bq(lp, n) * Math.exp(-t / 0.012) * 1.3 + Math.sin(ph) * Math.exp(-t / 0.045) * 0.9 + bq(sq, n) * Math.exp(-t / 0.06) * Math.min(1, t / 0.006) * 1.6;
  }
  // kan damlacıkları: birkaç küçük ıslak tıkırtı
  for (let k = 0; k < 4; k++) { const t0 = 0.02 + Math.random() * 0.12, i0 = Math.floor(t0 * sr), F = rbjBand(1800 + Math.random() * 1800, 3, sr); for (let i = 0; i < 260 && i0 + i < d.length; i++) d[i0 + i] += bq(F, Math.random() * 2 - 1) * 0.35 * Math.exp(-i / 60); }
  if (head) {
    // kemik: kısa sert kırılma tıkı + kafatası rezonansı
    const hb = rbjBand(3200, 1.4, sr), sk = rbjBand(620, 6, sr);
    for (let i = 0; i < d.length; i++) { const t = i / sr, n = Math.random() * 2 - 1; d[i] += bq(hb, n) * Math.exp(-t / 0.004) * 2.2 + bq(sk, n) * Math.exp(-t / 0.03) * 1.1; }
  }
  normBuf(d, 0.9);
  return d;
}
Object.assign(AudioEngine.prototype, {
  // önceden örneklenmiş varyant kümesi (ilk çağrıda bir kez)
  _sfxBank(key, n, fn) {
    const B = this._bank || (this._bank = {});
    if (B[key]) return B[key];
    while (!this._sfxBankStep(key, n, fn)) { /* kalan varyantlar */ }
    return B[key];
  },
  // [B1 performans] tek varyant üret (boşta önceden örnekleme için parça parça); bitince true
  _sfxBankStep(key, n, fn) {
    const B = this._bank || (this._bank = {});
    if (B[key]) return true;
    const W = this._bankWip || (this._bankWip = {}), list = W[key] || (W[key] = []);
    const sr = this.ctx.sampleRate, d = fn(sr, list.length);
    const b = this.ctx.createBuffer(1, d.length, sr); b.getChannelData(0).set(d); list.push(b);
    if (list.length < n) return false;
    B[key] = list; delete W[key];
    return true;
  },
  // [B1 performans] cam/et ses bankaları ilk çarpışmada ana iş parçacığında 1-4 sn sentezleniyordu (sürüşte donma):
  // boşta ön örnekleme kuyruğuna varyant başına bir görev
  glassPrewarm() {
    const T = [];
    const add = (key, n, fn) => { for (let i = 0; i < n; i++) T.push(() => this._sfxBankStep(key, n, fn)); };
    add('crack', 4, (sr) => synthCrack(sr));
    add('shatter', 3, (sr) => synthShatter(sr, false));
    add('shatterW', 3, (sr) => synthShatter(sr, true));
    add('flesh', 3, (sr) => synthFlesh(sr, false));
    add('fleshH', 3, (sr) => synthFlesh(sr, true));
    return T;
  },
  _playBank(list, x, z, range, rev, gain, rate = 1) {
    const o = this.spatial(x, z, range, rev); if (!o) return false;
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate * (0.93 + Math.random() * 0.14);
    const g = c.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(o.node); src.start();
    return true;
  },
  _countSfx(k) { const S = this.sfxStats || (this.sfxStats = {}); S[k] = (S[k] || 0) + 1; },
  // cam çatlaması: mermi darbesi + yayılan mikro kırılmalar + levha tınısı
  glassCrack(x, z, k = 1) {
    this._countSfx('glassCrack');
    if (!this.ctx) return;
    this._playBank(this._sfxBank('crack', 4, (sr) => synthCrack(sr)), x, z, 80, 0.22, 0.55 * k, 1);
  },
  // cam kırılması: patlama + yüzlerce dökülen parça taneciği + yere çarpan iri parçalar (ön cam daha tok)
  glassBreak(x, z, k = 1) {
    this._countSfx('glassBreak');
    if (!this.ctx) return;
    const ws = k > 1.1;
    this._playBank(this._sfxBank(ws ? 'shatterW' : 'shatter', 3, (sr) => synthShatter(sr, ws)), x, z, 120, 0.32, 0.8 * Math.min(1.3, k), ws ? 0.9 : 1);
  },
  // mermi ete girdi: ıslak darbe (baş: kemik kırılması eklenir)
  fleshImpact(x, z, k = 1, head = false) {
    this._countSfx('flesh');
    if (!this.ctx) return;
    this._playBank(this._sfxBank(head ? 'fleshH' : 'flesh', 3, (sr) => synthFlesh(sr, head)), x, z, 55, 0.05, 0.6 * Math.min(1.4, k), head ? 0.95 : 1);
  },
  // yelek plakası mermiyi durdurdu: boğuk tok darbe + kumaş sürtünmesi
  plateHit(x, z) {
    this._countSfx('plate');
    const o = this.spatial(x, z, 50, 0.05); if (!o) return;
    const t = this.ctx.currentTime;
    this.osc(o.node, t, { freq: 150, freq2: 70, dur: 0.07, gain: 0.45 });
    this.nz(o.node, t, { dur: 0.06, freq: 520, q: 1.2, type: 'bandpass', gain: 0.5 });
  },
});

installSfx(AudioEngine); // [ses B2] sfx/ modülleri
export const audio = new AudioEngine();
