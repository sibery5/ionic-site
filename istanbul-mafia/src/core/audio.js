// Tamamen prosedürel ses motoru: silahlar, motor, siren, martılar ve Hicaz makamında müzik.
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
    this.listener = { x: 0, z: 0 };
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.music = this.ctx.createGain(); this.music.connect(this.master);
    // basit reverb (oda/şehir yankısı)
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(1.8, 2.5);
    this.revGain = this.ctx.createGain(); this.revGain.gain.value = 0.25;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.applyVolume();
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
  impulse(sec, decay) {
    const len = this.ctx.sampleRate * sec;
    const b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // mesafeye göre ses seviyesi
  att(x, z, range = 120) {
    if (x === undefined) return 1;
    const d = Math.hypot(x - this.listener.x, z - this.listener.z);
    return Math.max(0, 1 - d / range);
  }

  noiseBurst({ dur = 0.2, freq = 1000, q = 1, type = 'lowpass', gain = 1, x, z, range, rev = 0.3, attack = 0.002 }) {
    if (!this.ctx) return;
    const a = this.att(x, z, range);
    if (a <= 0.01) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * a, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    if (rev > 0) { const rg = this.ctx.createGain(); rg.gain.value = rev; g.connect(rg); rg.connect(this.reverb); }
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  tone({ freq = 440, freq2, dur = 0.2, type = 'sine', gain = 0.3, x, z, range, delay = 0 }) {
    if (!this.ctx) return;
    const a = this.att(x, z, range);
    if (a <= 0.01) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * a, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  gunshot(kind, x, z) {
    const map = {
      pistol: [0.18, 2400, 1.0], revolver: [0.35, 1600, 1.3], smg: [0.12, 3000, 0.7],
      shotgun: [0.45, 1100, 1.5], rifle: [0.22, 2000, 1.2], sniper: [0.6, 1400, 1.6], rpg: [0.5, 600, 1.2],
    };
    const [dur, freq, gain] = map[kind] || map.pistol;
    this.noiseBurst({ dur, freq, q: 0.7, gain, x, z, range: 250, rev: 0.5 });
    this.tone({ freq: 150, freq2: 40, dur: dur * 0.8, type: 'triangle', gain: gain * 0.6, x, z, range: 250 });
  }
  explosion(x, z) {
    this.noiseBurst({ dur: 1.6, freq: 400, q: 0.5, gain: 2.0, x, z, range: 400, rev: 0.8, attack: 0.01 });
    this.tone({ freq: 80, freq2: 25, dur: 1.2, type: 'sine', gain: 1.2, x, z, range: 400 });
  }
  punch(x, z) { this.noiseBurst({ dur: 0.08, freq: 600, gain: 0.8, x, z, range: 40, rev: 0 }); this.tone({ freq: 120, freq2: 60, dur: 0.1, type: 'sine', gain: 0.5, x, z, range: 40 }); }
  swing() { this.noiseBurst({ dur: 0.15, freq: 1800, type: 'bandpass', q: 2, gain: 0.25, rev: 0 }); }
  impact(x, z) { this.noiseBurst({ dur: 0.05, freq: 4000, type: 'highpass', gain: 0.3, x, z, range: 60, rev: 0.1 }); }
  crash(x, z, k = 1) { this.noiseBurst({ dur: 0.4, freq: 900, gain: 0.9 * k, x, z, range: 120, rev: 0.3 }); this.tone({ freq: 90, freq2: 40, dur: 0.3, type: 'square', gain: 0.25 * k, x, z, range: 120 }); }
  empty() { this.tone({ freq: 1800, dur: 0.03, type: 'square', gain: 0.15 }); }
  reload() { this.tone({ freq: 900, dur: 0.04, type: 'square', gain: 0.15 }); this.tone({ freq: 600, dur: 0.05, type: 'square', gain: 0.15, delay: 0.35 }); }
  cash() { [1318, 1568, 2093].forEach((f, i) => this.tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.25, delay: i * 0.07 })); }
  click() { this.tone({ freq: 700, dur: 0.05, type: 'triangle', gain: 0.18 }); }
  hover() { this.tone({ freq: 1200, dur: 0.03, type: 'sine', gain: 0.06 }); }
  error() { this.tone({ freq: 220, dur: 0.18, type: 'square', gain: 0.18 }); this.tone({ freq: 180, dur: 0.22, type: 'square', gain: 0.18, delay: 0.12 }); }
  success() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, dur: 0.35, type: 'triangle', gain: 0.25, delay: i * 0.12 })); }
  fail() { [392, 349, 311, 261].forEach((f, i) => this.tone({ freq: f, dur: 0.4, type: 'sawtooth', gain: 0.12, delay: i * 0.16 })); }
  horn(x, z) { this.tone({ freq: 392, dur: 0.4, type: 'square', gain: 0.18, x, z, range: 100 }); this.tone({ freq: 466, dur: 0.4, type: 'square', gain: 0.14, x, z, range: 100 }); }
  meow(x, z) { this.tone({ freq: 700, freq2: 1100, dur: 0.15, type: 'sawtooth', gain: 0.08, x, z, range: 25 }); this.tone({ freq: 1100, freq2: 500, dur: 0.35, type: 'sawtooth', gain: 0.08, x, z, range: 25, delay: 0.15 }); }
  bark(x, z) { this.noiseBurst({ dur: 0.12, freq: 700, type: 'bandpass', q: 3, gain: 0.5, x, z, range: 60 }); this.tone({ freq: 300, freq2: 180, dur: 0.12, type: 'sawtooth', gain: 0.15, x, z, range: 60 }); }
  seagull(x, z) {
    for (let i = 0; i < 3; i++) this.tone({ freq: 1600 + Math.random() * 300, freq2: 900, dur: 0.22, type: 'sawtooth', gain: 0.05, x, z, range: 150, delay: i * 0.26 });
  }
  scream(x, z) { this.tone({ freq: 900, freq2: 1300, dur: 0.5, type: 'sawtooth', gain: 0.07, x, z, range: 60 }); }
  splash(x, z) { this.noiseBurst({ dur: 0.6, freq: 1200, gain: 0.8, x, z, range: 60 }); }
  step(x, z) { this.noiseBurst({ dur: 0.04, freq: 400, gain: 0.08, x, z, range: 20, rev: 0 }); }

  // Sürekli motor sesi
  setEngine(on, rpm = 0, gain = 0.15) {
    if (!this.ctx) return;
    if (on && !this.engineNode) {
      const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = this.ctx.createOscillator(); o2.type = 'square';
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const g = this.ctx.createGain(); g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx);
      o1.start(); o2.start();
      this.engineNode = { o1, o2, f, g };
    }
    if (!on && this.engineNode) {
      const n = this.engineNode; this.engineNode = null;
      n.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      setTimeout(() => { try { n.o1.stop(); n.o2.stop(); } catch (e) { /* zaten durdu */ } }, 300);
      return;
    }
    if (this.engineNode) {
      const t = this.ctx.currentTime;
      const base = 40 + rpm * 110;
      this.engineNode.o1.frequency.setTargetAtTime(base, t, 0.05);
      this.engineNode.o2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
      this.engineNode.f.frequency.setTargetAtTime(500 + rpm * 1500, t, 0.05);
      this.engineNode.g.gain.setTargetAtTime(gain, t, 0.1);
    }
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
