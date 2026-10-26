// Tamamen prosedürel ses motoru: katmanlı silah sesleri, patlamalar, mermi vızıltısı, kovanlar, bıçak,
// şarjör değiştirme, sekme, yüzeye göre ayak sesi, çok osilatörlü motor, lastik sesi, rüzgâr,
// şehir ambiyansı, siren, martılar ve Hicaz makamında müzik.
// Konumlu sesler: mesafeye göre kısılır, alçak geçiren süzgeçle boğuklaşır, yankı payı artar ve
// dinleyicinin bakış yönüne göre stereo kaydırılır.

// Silah profilleri: click (ilk çıt), body [frekans, süre, kazanç], thump [f1, f2, süre, kazanç], tail [frekans, süre, kazanç]
const GUN = {
  pistol: { click: 0.5, body: [1900, 0.1, 1.0], thump: [170, 48, 0.12, 0.75], tail: [950, 0.6, 0.32], range: 260 },
  revolver: { click: 0.65, body: [1350, 0.17, 1.35], thump: [130, 38, 0.2, 1.05], tail: [720, 0.95, 0.5], range: 330 },
  smg: { click: 0.45, body: [2300, 0.075, 0.8], thump: [190, 60, 0.08, 0.5], tail: [1150, 0.45, 0.24], range: 230 },
  shotgun: { click: 0.6, body: [950, 0.24, 1.5], thump: [110, 32, 0.28, 1.35], tail: [620, 1.1, 0.6], range: 330 },
  rifle: { click: 0.75, body: [1650, 0.12, 1.2], thump: [145, 40, 0.16, 0.9], tail: [820, 0.9, 0.48], range: 390, crack: true },
  sniper: { click: 0.85, body: [1250, 0.22, 1.6], thump: [100, 30, 0.3, 1.35], tail: [600, 1.6, 0.7], range: 520, crack: true },
  rpg: { click: 0.3, body: [520, 0.5, 1.2], thump: [80, 30, 0.4, 1.0], tail: [420, 1.2, 0.5], range: 360, whoosh: true },
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

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
    this.osc(out, t, { freq: freq * 0.6, freq2: freq * 0.4, dur: dur * 0.8, type: 'square', gain: gain * 0.25 });
  }

  // ---------------- silahlar ----------------
  gunshot(kind, x, z) {
    const P = GUN[kind] || GUN.pistol;
    const o = this.spatial(x, z, P.range, 0.55);
    if (!o) return;
    const c = this.ctx;
    // uzak atışlar ses hızıyla gecikir
    const t = c.currentTime + (o.d > 30 ? Math.min(1.2, o.d / 343) : 0);
    const pit = 0.94 + Math.random() * 0.12;
    const near = o.d < 40 ? 1 - o.d / 40 : 0;
    // 1) ilk geçici çıt
    this.nz(o.node, t, { dur: 0.014, freq: 4500, type: 'highpass', q: 0.7, gain: P.click * (0.4 + near), attack: 0.0005 });
    // 2) gövde patlaması
    this.nz(o.node, t, { dur: P.body[1], freq: P.body[0] * pit, q: 0.8, type: 'lowpass', gain: P.body[2], attack: 0.001, sweep: P.body[0] * 0.4 });
    this.nz(o.node, t, { dur: P.body[1] * 0.6, freq: P.body[0] * 1.8 * pit, q: 1.2, type: 'bandpass', gain: P.body[2] * 0.5, attack: 0.001 });
    // 3) alçak gümleme
    this.osc(o.node, t, { freq: P.thump[0] * pit, freq2: P.thump[1], dur: P.thump[2], type: 'sine', gain: P.thump[3], attack: 0.002 });
    this.osc(o.node, t, { freq: P.thump[0] * 0.7 * pit, freq2: P.thump[1] * 0.8, dur: P.thump[2] * 1.2, type: 'triangle', gain: P.thump[3] * 0.4 });
    // 4) yankı kuyruğu (şehir duvarlarından dönen)
    this.nz(o.node, t + 0.02, { dur: P.tail[1], freq: P.tail[0], q: 0.5, type: 'lowpass', gain: P.tail[2] * (0.5 + (1 - near) * 0.6), attack: 0.03, sweep: P.tail[0] * 0.35 });
    if (P.crack && o.d > 25) this.nz(o.node, t, { dur: 0.008, freq: 3500, type: 'highpass', gain: 0.5, attack: 0.0005 });
    if (P.whoosh) this.nz(o.node, t + 0.03, { dur: 0.9, freq: 700, q: 1.5, type: 'bandpass', gain: 0.6, attack: 0.05, sweep: 2200 });
    // mekanik devam: pompa / sürgü
    if (o.d < 18) {
      if (kind === 'shotgun') { this.clickAt(o.node, t + 0.36, 1500, 0.35, 0.04); this.nz(o.node, t + 0.38, { dur: 0.08, freq: 900, type: 'bandpass', q: 1.5, gain: 0.2 }); this.clickAt(o.node, t + 0.5, 1800, 0.4, 0.04); }
      if (kind === 'sniper') { this.clickAt(o.node, t + 0.5, 2200, 0.3); this.nz(o.node, t + 0.55, { dur: 0.12, freq: 1600, type: 'bandpass', q: 2, gain: 0.15 }); this.clickAt(o.node, t + 0.72, 2600, 0.32); }
    }
  }
  explosion(x, z, sc = 1) {
    const o = this.spatial(x, z, 700, 0.8);
    if (!o) return;
    const t = this.ctx.currentTime + (o.d > 25 ? Math.min(1.6, o.d / 343) : 0);
    const near = o.d < 60 ? 1 - o.d / 60 : 0;
    const k = clamp(sc, 0.5, 2);
    // alt bas gümlemesi
    this.osc(o.node, t, { freq: 62, freq2: 22, dur: 2.2, type: 'sine', gain: 1.5 * k, attack: 0.004 });
    this.osc(o.node, t, { freq: 40, freq2: 18, dur: 3.0, type: 'sine', gain: 0.9 * k, attack: 0.02 });
    // patlama gövdesi
    this.nz(o.node, t, { dur: 1.3, freq: 700, q: 0.6, type: 'lowpass', gain: 2.0 * k, attack: 0.004, sweep: 140 });
    if (near > 0) this.nz(o.node, t, { dur: 0.09, freq: 2200, type: 'highpass', gain: 1.1 * near, attack: 0.0008 });
    // gürleme kuyruğu
    this.nz(o.node, t + 0.05, { dur: 3.6, freq: 260, q: 0.5, type: 'lowpass', gain: 1.1 * k, attack: 0.25, buf: this.brownBuf });
    // düşen enkaz çıtırtıları
    for (let i = 0; i < 26; i++) {
      const dt = 0.15 + Math.pow(Math.random(), 1.4) * 2.4;
      this.nz(o.node, t + dt, { dur: 0.01 + Math.random() * 0.03, freq: 2200 + Math.random() * 4000, q: 1.5, type: 'bandpass', gain: (0.35 + Math.random() * 0.3) * (1 - dt / 2.8), attack: 0.001 });
    }
  }
  // Yakından geçen mermi: vızıltı (doppler) + süpersonik çatırtı. sx,sz = geçiş noktasının dinleyiciye göre yönü
  whiz(k = 1, sx = 0, sz = 0, crack = false) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const g = c.createGain(); g.gain.value = 1;
    let last = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = this.panOf(sx, sz); g.connect(p); last = p; }
    last.connect(this.sfx);
    this.nz(g, t, { dur: 0.2, freq: 3200, q: 4, type: 'bandpass', gain: 0.55 * k, attack: 0.03, sweep: 800 });
    this.osc(g, t, { freq: 2600 + Math.random() * 600, freq2: 900, dur: 0.16, type: 'sine', gain: 0.05 * k, attack: 0.02 });
    if (crack) this.nz(g, t, { dur: 0.012, freq: 2800, type: 'highpass', gain: 0.9 * k, attack: 0.0005 });
  }
  // kovan tıngırtısı (pirinç) veya plastik fişek tıkırtısı
  shell(x, z, plastic = false, k = 1) {
    const o = this.spatial(x, z, 25, 0.05);
    if (!o) return;
    const t = this.ctx.currentTime;
    if (plastic) { this.nz(o.node, t, { dur: 0.05, freq: 900, q: 2, type: 'bandpass', gain: 0.25 * k }); return; }
    const f = 3000 + Math.random() * 1800;
    for (const [m, gm] of [[1, 1], [2.76, 0.6], [5.4, 0.35]]) this.osc(o.node, t, { freq: f * m, dur: 0.05 + Math.random() * 0.08, type: 'sine', gain: 0.05 * k * gm, attack: 0.0008 });
    this.nz(o.node, t, { dur: 0.015, freq: 6000, type: 'highpass', gain: 0.08 * k });
  }
  impact(x, z, surf = 'concrete') {
    const o = this.spatial(x, z, 60, 0.12);
    if (!o) return;
    const t = this.ctx.currentTime;
    if (surf === 'dirt') { this.nz(o.node, t, { dur: 0.07, freq: 700, gain: 0.35 }); return; }
    if (surf === 'wood') { this.nz(o.node, t, { dur: 0.07, freq: 700, q: 2, type: 'bandpass', gain: 0.45 }); return; }
    this.nz(o.node, t, { dur: 0.05, freq: 3500, type: 'highpass', gain: 0.35 });
    this.nz(o.node, t + 0.005, { dur: 0.06, freq: 1300, q: 1.5, type: 'bandpass', gain: 0.25 });
  }
  impactMetal(x, z) {
    const o = this.spatial(x, z, 80, 0.2);
    if (!o) return;
    const t = this.ctx.currentTime, f = 1500 + Math.random() * 1800;
    this.osc(o.node, t, { freq: f, dur: 0.25, type: 'sine', gain: 0.12 });
    this.osc(o.node, t, { freq: f * 1.53, dur: 0.18, type: 'sine', gain: 0.07 });
    this.nz(o.node, t, { dur: 0.03, freq: 5000, type: 'highpass', gain: 0.4 });
  }
  ricochet(x, z) {
    const o = this.spatial(x, z, 90, 0.3);
    if (!o) return;
    const c = this.ctx, t = c.currentTime;
    const os = c.createOscillator(); os.type = 'triangle';
    const f0 = 2400 + Math.random() * 900;
    os.frequency.setValueAtTime(f0, t); os.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.38);
    const lfo = c.createOscillator(); lfo.frequency.value = 38; const lg = c.createGain(); lg.gain.value = 90;
    lfo.connect(lg); lg.connect(os.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    os.connect(g); g.connect(o.node);
    os.start(t); lfo.start(t); os.stop(t + 0.45); lfo.stop(t + 0.45);
  }
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
  crash(x, z, k = 1) {
    const o = this.spatial(x, z, 140, 0.3);
    if (!o) return;
    const t = this.ctx.currentTime;
    this.nz(o.node, t, { dur: 0.45, freq: 900, gain: 0.9 * k });
    this.osc(o.node, t, { freq: 90, freq2: 40, dur: 0.3, type: 'square', gain: 0.22 * k });
    for (let i = 0; i < 5; i++) this.nz(o.node, t + 0.05 + Math.random() * 0.4, { dur: 0.03, freq: 3000 + Math.random() * 3000, q: 2, type: 'bandpass', gain: 0.25 * k }); // cam/parça
  }
  empty() { this.tone({ freq: 1800, dur: 0.03, type: 'square', gain: 0.15 }); }
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
  cash() { [1318, 1568, 2093].forEach((f, i) => this.tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.25, delay: i * 0.07 })); }
  click() { this.tone({ freq: 700, dur: 0.05, type: 'triangle', gain: 0.18 }); }
  hover() { this.tone({ freq: 1200, dur: 0.03, type: 'sine', gain: 0.06 }); }
  error() { this.tone({ freq: 220, dur: 0.18, type: 'square', gain: 0.18 }); this.tone({ freq: 180, dur: 0.22, type: 'square', gain: 0.18, delay: 0.12 }); }
  success() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, dur: 0.35, type: 'triangle', gain: 0.25, delay: i * 0.12 })); }
  fail() { [392, 349, 311, 261].forEach((f, i) => this.tone({ freq: f, dur: 0.4, type: 'sawtooth', gain: 0.12, delay: i * 0.16 })); }
  horn(x, z) { this.tone({ freq: 392, dur: 0.4, type: 'square', gain: 0.18, x, z, range: 100 }); this.tone({ freq: 466, dur: 0.4, type: 'square', gain: 0.14, x, z, range: 100 }); }
  meow(x, z) { this.tone({ freq: 700, freq2: 1100, dur: 0.15, type: 'sawtooth', gain: 0.08, x, z, range: 25 }); this.tone({ freq: 1100, freq2: 500, dur: 0.35, type: 'sawtooth', gain: 0.08, x, z, range: 25, delay: 0.15 }); }
  bark(x, z) { this.noiseBurst({ dur: 0.12, freq: 700, type: 'bandpass', q: 3, gain: 0.5, x, z, range: 60 }); this.tone({ freq: 300, freq2: 180, dur: 0.12, type: 'sawtooth', gain: 0.15, x, z, range: 60 }); }
  seagull(x, z, k = 1) {
    for (let i = 0; i < 3; i++) this.tone({ freq: 1600 + Math.random() * 300, freq2: 900, dur: 0.22, type: 'sawtooth', gain: 0.05 * k, x, z, range: 150, delay: i * 0.26 });
  }
  scream(x, z) { this.tone({ freq: 900, freq2: 1300, dur: 0.5, type: 'sawtooth', gain: 0.07, x, z, range: 60 }); }
  splash(x, z, k = 1) {
    const o = this.spatial(x, z, 60, 0.2);
    if (!o) return;
    const t = this.ctx.currentTime;
    this.nz(o.node, t, { dur: 0.6 * Math.sqrt(k), freq: 1200, gain: 0.8 * k, sweep: 500 });
    this.nz(o.node, t + 0.05, { dur: 0.3, freq: 2500, q: 2, type: 'bandpass', gain: 0.2 * k });
  }
  // yüzeye göre ayak sesi
  step(x, z, surface) {
    const s = surface || (this.surfaceAt ? this.surfaceAt(x, z) : 'concrete');
    const o = this.spatial(x, z, 22, 0.04);
    if (!o) return;
    const t = this.ctx.currentTime, r = 0.85 + Math.random() * 0.3;
    if (s === 'grass') { this.nz(o.node, t, { dur: 0.1, freq: 2600 * r, q: 0.6, type: 'bandpass', gain: 0.07, attack: 0.01 }); return; }
    if (s === 'wood') { this.osc(o.node, t, { freq: 150 * r, freq2: 90, dur: 0.07, gain: 0.12 }); this.nz(o.node, t, { dur: 0.05, freq: 700 * r, gain: 0.08 }); return; }
    if (s === 'metal') { this.osc(o.node, t, { freq: 420 * r, dur: 0.1, type: 'triangle', gain: 0.05 }); this.nz(o.node, t, { dur: 0.05, freq: 1500 * r, q: 2, type: 'bandpass', gain: 0.1 }); return; }
    if (s === 'water') { this.nz(o.node, t, { dur: 0.18, freq: 1100 * r, q: 1, type: 'bandpass', gain: 0.15, sweep: 500 }); return; }
    this.nz(o.node, t, { dur: 0.05, freq: 1100 * r, gain: 0.1 });
    this.nz(o.node, t, { dur: 0.02, freq: 4000 * r, type: 'highpass', gain: 0.04 });
  }

  // ---------------- sürekli döngüler ----------------
  // Çok osilatörlü motor: rpm 0..1+, gain ses düzeyi, load (isteğe bağlı) 0..1 gaz yükü
  setEngine(on, rpm = 0, gain = 0.15, load) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (on && !this.engineNode) {
      const mk = (type) => { const o = c.createOscillator(); o.type = type; return o; };
      const o1 = mk('sawtooth'), o2 = mk('square'), o3 = mk('sawtooth'), o4 = mk('sine');
      o3.detune.value = 9;
      const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain(), g4 = c.createGain();
      g1.gain.value = 0.5; g2.gain.value = 0.35; g3.gain.value = 0.2; g4.gain.value = 0.6;
      const nsrc = c.createBufferSource(); nsrc.buffer = this.noiseBuf; nsrc.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.Q.value = 2; nf.frequency.value = 300;
      const ng = c.createGain(); ng.gain.value = 0.15;
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
      const lfo = c.createOscillator(); lfo.frequency.value = 12;
      const lfoG = c.createGain(); lfoG.gain.value = 0.2;
      lfo.connect(lfoG); lfoG.connect(trem.gain);
      const g = c.createGain(); g.gain.value = 0;
      mix.connect(shaper); shaper.connect(f); f.connect(trem); trem.connect(g); g.connect(this.sfx);
      for (const o of [o1, o2, o3, o4, lfo]) o.start();
      nsrc.start();
      this.engineNode = { o1, o2, o3, o4, nsrc, nf, ng, g3, f, lfo, lfoG, g, stop: [o1, o2, o3, o4, lfo, nsrc] };
    }
    if (!on && this.engineNode) {
      const n = this.engineNode; this.engineNode = null;
      n.g.gain.setTargetAtTime(0, c.currentTime, 0.05);
      setTimeout(() => { for (const s of n.stop) { try { s.stop(); } catch (e) { /* zaten durdu */ } } }, 300);
      return;
    }
    if (this.engineNode) {
      const t = c.currentTime, n = this.engineNode;
      if (load === undefined) {
        // yük tahmini: devir artıyorsa gaz veriliyor
        const want = rpm > this.rpmPrev + 0.0005 ? 1 : rpm < this.rpmPrev - 0.0005 ? 0 : this.load;
        this.load += (want - this.load) * 0.08;
        load = this.load;
      }
      this.rpmPrev = rpm;
      const r = clamp(rpm, 0, 1.4);
      const base = 38 + r * 120;
      n.o1.frequency.setTargetAtTime(base, t, 0.05);
      n.o2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
      n.o3.frequency.setTargetAtTime(base * 2, t, 0.05);
      n.o4.frequency.setTargetAtTime(base * 0.25, t, 0.05);
      n.lfo.frequency.setTargetAtTime(base * 0.5, t, 0.05);
      n.lfoG.gain.setTargetAtTime(0.25 - r * 0.12, t, 0.1);
      n.nf.frequency.setTargetAtTime(base * 4, t, 0.05);
      n.ng.gain.setTargetAtTime(0.08 + load * 0.25, t, 0.1);
      n.g3.gain.setTargetAtTime(0.12 + load * 0.3, t, 0.1);
      n.f.frequency.setTargetAtTime(350 + r * 1700 + load * 900, t, 0.06);
      n.g.gain.setTargetAtTime(gain * (0.8 + load * 0.35), t, 0.1);
    }
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
  loopGain(name, v, tc = 0.2) { const l = this.loops[name]; if (l) l.g.gain.setTargetAtTime(v, this.ctx.currentTime, tc); }

  // Lastik cızırtısı: her karede çağrılır, amount 0..1
  screech(amount = 0) {
    if (!this.ctx) return;
    const l = this.loop('screech', { type: 'bandpass', freq: 2900, q: 7, lfoRate: 7, lfoDepth: 260 });
    const a = clamp(amount, 0, 1);
    this.screechSet = a;
    l.f.frequency.setTargetAtTime(2600 + a * 900, this.ctx.currentTime, 0.1);
    this.loopGain('screech', a * 0.11, 0.06);
  }
  setWind(k = 0) {
    if (!this.ctx) return;
    this.loop('wind', { buf: this.brownBuf, type: 'lowpass', freq: 450, q: 1.5, lfoRate: 0.13, lfoDepth: 220 });
    this.loopGain('wind', clamp(k, 0, 1) * 0.16, 0.8);
  }
  // Şehir ambiyansı: uzak trafik uğultusu + ara sıra korna, martı, köpek
  setAmbience(k = 0) {
    if (!this.ctx) return;
    this.loop('traffic', { buf: this.brownBuf, type: 'lowpass', freq: 220, q: 0.5, lfoRate: 0.07, lfoDepth: 60 });
    this.loop('hum', { type: 'bandpass', freq: 380, q: 0.8 });
    this.ambK = clamp(k, 0, 1);
    this.loopGain('traffic', this.ambK * 0.22, 1);
    this.loopGain('hum', this.ambK * 0.012, 1);
  }
  ambienceEvents(dt) {
    const k = this.ambK || 0;
    if (k < 0.2) return;
    const a = this.ambT;
    a.horn -= dt; a.gull -= dt; a.dog -= dt;
    const far = (r) => { const ang = Math.random() * Math.PI * 2; return [this.listener.x + Math.cos(ang) * r, this.listener.z + Math.sin(ang) * r]; };
    if (a.horn <= 0) {
      a.horn = 5 + Math.random() * 12;
      const [x, z] = far(90 + Math.random() * 60);
      const o = this.spatial(x, z, 260, 0.9);
      if (o) { const t = this.ctx.currentTime, f = 330 + Math.random() * 120; this.osc(o.node, t, { freq: f, dur: 0.35 + Math.random() * 0.4, type: 'square', gain: 0.06 * k, attack: 0.02 }); this.osc(o.node, t, { freq: f * 1.19, dur: 0.35, type: 'square', gain: 0.04 * k, attack: 0.02 }); }
    }
    if (a.gull <= 0) { a.gull = 8 + Math.random() * 18; const [x, z] = far(40 + Math.random() * 50); this.seagull(x, z, 0.7 * k); }
    if (a.dog <= 0) { a.dog = 20 + Math.random() * 40; const [x, z] = far(50); this.bark(x, z); }
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

  setSiren(level) {
    if (!this.ctx) return;
    if (level > 0 && !this.sirenNode) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.7;
      const lg = this.ctx.createGain(); lg.gain.value = 250;
      lfo.connect(lg); lg.connect(o.frequency); o.frequency.value = 850;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1000; f.Q.value = 0.8;
      const g = this.ctx.createGain(); g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(this.sfx);
      o.start(); lfo.start();
      this.sirenNode = { o, lfo, g };
    }
    if (this.sirenNode) {
      this.sirenNode.g.gain.setTargetAtTime(Math.min(0.07, level * 0.07), this.ctx.currentTime, 0.3);
      if (level <= 0) {
        const n = this.sirenNode; this.sirenNode = null;
        setTimeout(() => { try { n.o.stop(); n.lfo.stop(); } catch (e) { /* zaten durdu */ } }, 1500);
      }
    }
  }

  // Hicaz makamında prosedürel müzik (menü ve gece için)
  startMusic(mode = 'menu') {
    if (!this.ctx) return;
    if (this.musicMode === mode) return;
    this.stopMusic();
    this.musicMode = mode;
    const root = mode === 'menu' ? 146.83 : 110; // D3 / A2
    const hicaz = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16, 17, 19];
    const bpm = mode === 'menu' ? 92 : 80;
    const beat = 60 / bpm;
    let step = 0;
    let note = 4;
    const drone = this.ctx.createOscillator(); drone.type = 'sawtooth'; drone.frequency.value = root / 2;
    const df = this.ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 300;
    const dg = this.ctx.createGain(); dg.gain.value = 0.05;
    drone.connect(df); df.connect(dg); dg.connect(this.music); drone.start();
    this.drone = { drone, dg };
    const pluck = (freq, t, dur, gain) => {
      // ud/bağlama benzeri telli ses
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
      const o2 = this.ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 2.003;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.music);
      const rg = this.ctx.createGain(); rg.gain.value = 0.5; g.connect(rg); rg.connect(this.reverb);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    };
    const drum = (t, low) => {
      // darbuka: düm / tek
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(low ? 110 : 420, t); o.frequency.exponentialRampToValueAtTime(low ? 55 : 300, t + 0.12);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(low ? 0.35 : 0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + (low ? 0.25 : 0.08));
      o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.3);
      if (!low) {
        const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
        const hf = this.ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 3000;
        const sg = this.ctx.createGain(); sg.gain.setValueAtTime(0.08, t); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        s.connect(hf); hf.connect(sg); sg.connect(this.music); s.start(t, Math.random()); s.stop(t + 0.06);
      }
    };
    // 9/8 Roman havası esintili ritim
    const rhythm = [1, 0, 2, 0, 1, 2, 0, 2, 2];
    let next = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.ctx) return;
      while (next < this.ctx.currentTime + 0.3) {
        const r = rhythm[step % rhythm.length];
        if (r) drum(next, r === 1);
        if (step % 2 === 0 || Math.random() < 0.3) {
          note += Math.floor(Math.random() * 5) - 2;
          if (note < 0) note = 1; if (note >= hicaz.length) note = hicaz.length - 2;
          const freq = root * Math.pow(2, hicaz[note] / 12);
          pluck(freq, next, beat * 1.5, 0.09);
          if (Math.random() < 0.15) pluck(freq * 2, next + beat * 0.25, beat * 0.5, 0.05);
        }
        next += beat / 2;
        step++;
      }
    };
    this.musicTimer = setInterval(tick, 100);
  }
  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null; this.musicMode = null;
    if (this.drone) {
      const d = this.drone; this.drone = null;
      d.dg.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      setTimeout(() => { try { d.drone.stop(); } catch (e) { /* zaten durdu */ } }, 1500);
    }
  }
}


export const audio = new AudioEngine();
