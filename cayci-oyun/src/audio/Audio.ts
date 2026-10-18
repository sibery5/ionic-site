// Bütün sesler ve müzik Web Audio ile gerçek zamanlı sentezlenir. Dış ses dosyası yok = lisans derdi yok.

type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';
const FORMANTS: Record<Vowel, [number, number]> = {
  a: [800, 1200],
  e: [500, 1900],
  i: [300, 2300],
  o: [500, 900],
  u: [320, 800],
};
const VOWELS: Vowel[] = ['a', 'e', 'i', 'o', 'u'];

// Hicaz makamı (Re karar): D Eb F# G A Bb C D
const HICAZ = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16, 17, 19];
const D3 = 146.83;

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private pluckCache = new Map<number, AudioBuffer>();
  private lastClink = 0;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private melodyDegree = 4;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private murmurGain: GainNode | null = null;
  private volume = 0.8;
  private musicVolume = 0.5;
  musicMood: 'calm' | 'tense' = 'calm';
  /** 0..1: tepsideki kule ve çay saati yükseldikçe müzik hızlanır, ritim kalabalıklaşır. */
  private intensity = 0;

  setIntensity(v: number) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume * 0.55;
    this.musicBus.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.value = v;
  }
  setMusic(v: number) {
    this.musicVolume = v;
    if (this.ctx) this.musicBus.gain.value = v * 0.55;
  }

  private get now() {
    return this.ctx!.currentTime;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseSrc(t: number, dur: number) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  private tone(freq: number, t: number, dur: number, peak: number, type: OscillatorType = 'sine', out: AudioNode = this.sfx) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    this.env(g, t, peak, 0.004, dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // ---------- efektler ----------

  /** Bardakların tepside şıngırdaması. intensity 0..1 */
  clink(intensity: number) {
    if (!this.ctx || intensity < 0.05) return;
    const t = this.now;
    if (t - this.lastClink < 0.07) return;
    this.lastClink = t;
    const f0 = 2500 + Math.random() * 900;
    const peak = Math.min(0.25, 0.04 + intensity * 0.2);
    [1, 2.32, 4.25].forEach((r, i) => this.tone(f0 * r * (1 + (Math.random() - 0.5) * 0.01), t, 0.22 - i * 0.05, peak / (i + 1)));
  }

  /** Çay doldurma sesi; dönen nesneyle ilerlemeyi güncelle, bitince stop(). */
  pour(): { update: (p: number) => void; stop: () => void } {
    if (!this.ctx) return { update: () => {}, stop: () => {} };
    const ctx = this.ctx;
    const t = this.now;
    const src = this.noiseSrc(t, 10);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.22, t + 0.08);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 17;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start(t);
    src.connect(bp).connect(g).connect(this.sfx);
    return {
      update: (p) => {
        bp.frequency.setTargetAtTime(700 + p * 1500, ctx.currentTime, 0.05);
      },
      stop: () => {
        const n = ctx.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setTargetAtTime(0, n, 0.03);
        src.stop(n + 0.2);
        lfo.stop(n + 0.2);
      },
    };
  }

  footstep(kind: 'walk' | 'run' | 'wet') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now;
    const src = this.noiseSrc(t, 0.12);
    const f = ctx.createBiquadFilter();
    f.type = kind === 'wet' ? 'bandpass' : 'lowpass';
    f.frequency.value = kind === 'wet' ? 1400 + Math.random() * 400 : 500 + Math.random() * 200;
    f.Q.value = kind === 'wet' ? 2 : 0.7;
    const g = ctx.createGain();
    this.env(g, t, kind === 'run' ? 0.28 : 0.16, 0.003, kind === 'wet' ? 0.11 : 0.06);
    src.connect(f).connect(g).connect(this.sfx);
    this.tone(80 + Math.random() * 20, t, 0.05, kind === 'run' ? 0.2 : 0.12);
  }

  splash(amount: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now;
    const src = this.noiseSrc(t, 0.4);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.9;
    const g = ctx.createGain();
    this.env(g, t, Math.min(0.4, 0.1 + amount), 0.01, 0.3);
    src.connect(f).connect(g).connect(this.sfx);
  }

  shatter() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now;
    const src = this.noiseSrc(t, 0.4);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2800;
    const g = ctx.createGain();
    this.env(g, t, 0.35, 0.002, 0.3);
    src.connect(f).connect(g).connect(this.sfx);
    for (let i = 0; i < 12; i++) this.tone(3000 + Math.random() * 4500, t + Math.random() * 0.18, 0.12, 0.08);
  }

  coin(size = 1) {
    if (!this.ctx) return;
    const t = this.now;
    const k = Math.min(1.5, 0.9 + size * 0.05);
    this.tone(1318 * k, t, 0.12, 0.13, 'triangle');
    this.tone(1760 * k, t + 0.08, 0.25, 0.13, 'triangle');
  }

  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now;
    const src = this.noiseSrc(t, 0.7);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.3);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.6);
    const g = ctx.createGain();
    this.env(g, t, 0.3, 0.15, 0.45);
    src.connect(f).connect(g).connect(this.sfx);
  }

  applause() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = this.now;
    for (let i = 0; i < 40; i++) {
      const t = t0 + Math.random() * 1.3;
      const src = this.noiseSrc(t, 0.03);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1500 + Math.random() * 1500;
      const g = ctx.createGain();
      this.env(g, t, 0.06 * (1 - (t - t0) / 1.6), 0.002, 0.03);
      src.connect(f).connect(g).connect(this.sfx);
    }
  }

  fail() {
    if (!this.ctx) return;
    const t = this.now;
    this.tone(330, t, 0.18, 0.12, 'square');
    this.tone(247, t + 0.15, 0.3, 0.12, 'square');
  }

  click() {
    if (!this.ctx) return;
    this.tone(900, this.now, 0.04, 0.06, 'triangle');
  }

  /** Hicaz arpej: başarı jingle'ı */
  jingle() {
    if (!this.ctx) return;
    const t = this.now;
    [0, 4, 5, 7, 12].forEach((s, i) => this.pluck(D3 * 2 * Math.pow(2, s / 12), t + i * 0.09, 0.5, this.sfx));
  }

  /** Formant süzgeçli "Han dili" konuşma. */
  babble(pitch: number, syllables = 6) {
    if (!this.ctx) return;
    let t = this.now;
    for (let i = 0; i < syllables; i++) {
      const v = VOWELS[Math.floor(Math.random() * VOWELS.length)];
      this.voice(v, pitch * (1 + (Math.random() - 0.5) * 0.25), t, 0.06 + Math.random() * 0.04, 0.09);
      t += 0.075 + Math.random() * 0.03;
    }
  }

  private voice(v: Vowel, pitch: number, t: number, dur: number, peak: number, glideTo?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(pitch, t);
    if (glideTo) o.frequency.linearRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, 0.01, dur);
    const [f1, f2] = FORMANTS[v];
    const mix = ctx.createGain();
    mix.gain.value = 1;
    for (const [f, q, gain] of [
      [f1, 6, 1],
      [f2, 8, 0.6],
    ] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = gain * 2.2;
      o.connect(bp).connect(fg).connect(mix);
    }
    mix.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** "Çaaay!" */
  shout() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now;
    // ç: kısa tıslama
    const src = this.noiseSrc(t, 0.1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const g = ctx.createGain();
    this.env(g, t, 0.2, 0.005, 0.08);
    src.connect(hp).connect(g).connect(this.sfx);
    // aaa → y
    this.voice('a', 190, t + 0.07, 0.75, 0.3, 270);
    this.voice('i', 270, t + 0.78, 0.18, 0.18, 230);
  }

  meow() {
    if (!this.ctx) return;
    const t = this.now;
    this.voice('i', 560, t, 0.15, 0.12, 820);
    this.voice('a', 820, t + 0.14, 0.2, 0.14, 600);
    this.voice('u', 600, t + 0.32, 0.2, 0.1, 450);
  }

  // ---------- ortam ----------

  startAmbience(wind: boolean) {
    if (!this.ctx) return;
    this.stopAmbience();
    const ctx = this.ctx;
    const t = this.now;
    // ofis uğultusu
    const m = this.noiseSrc(t, 3600);
    const mf = ctx.createBiquadFilter();
    mf.type = 'bandpass';
    mf.frequency.value = 380;
    mf.Q.value = 0.7;
    this.murmurGain = ctx.createGain();
    this.murmurGain.gain.value = wind ? 0.0 : 0.035;
    m.connect(mf).connect(this.murmurGain).connect(this.sfx);
    if (wind) {
      const w = this.noiseSrc(t, 3600);
      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windFilter.frequency.value = 300;
      this.windFilter.Q.value = 4;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0.05;
      w.connect(this.windFilter).connect(this.windGain).connect(this.sfx);
    }
  }

  /** level 0..1 */
  setWind(level: number) {
    if (!this.ctx || !this.windGain || !this.windFilter) return;
    const n = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.04 + level * 0.22, n, 0.3);
    this.windFilter.frequency.setTargetAtTime(250 + level * 900, n, 0.3);
  }

  stopAmbience() {
    if (!this.ctx) return;
    const n = this.ctx.currentTime;
    this.murmurGain?.gain.setTargetAtTime(0, n, 0.2);
    this.windGain?.gain.setTargetAtTime(0, n, 0.2);
    const a = this.murmurGain;
    const b = this.windGain;
    setTimeout(() => {
      a?.disconnect();
      b?.disconnect();
    }, 1500);
    this.murmurGain = null;
    this.windGain = null;
    this.windFilter = null;
  }

  // ---------- müzik ----------

  /** Karplus-Strong tel sesi (bağlama benzeri), notaya göre önbellekte. */
  private pluckBuffer(freq: number): AudioBuffer {
    const key = Math.round(freq * 10);
    const hit = this.pluckCache.get(key);
    if (hit) return hit;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 1.4);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const n = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(n);
    for (let i = 0; i < n; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    const decay = 0.994;
    for (let i = 0; i < len; i++) {
      const next = (idx + 1) % n;
      const v = ring[idx];
      // parlak, metalik tel: hafif ortalama
      ring[idx] = decay * (0.62 * v + 0.38 * ring[next]);
      out[i] = v;
      idx = next;
    }
    this.pluckCache.set(key, buf);
    return buf;
  }

  private pluck(freq: number, t: number, peak: number, out: AudioNode) {
    const ctx = this.ctx!;
    // bağlamada teller çift: hafif akort farklı iki tel
    for (const det of [1, 1.004]) {
      const s = ctx.createBufferSource();
      s.buffer = this.pluckBuffer(freq * det);
      const g = ctx.createGain();
      g.gain.value = peak * 0.5;
      s.connect(g).connect(out);
      s.start(t);
    }
  }

  startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    const ctx = this.ctx;
    this.nextNoteTime = ctx.currentTime + 0.1;
    this.step = 0;
    // dem (drone)
    const drone = ctx.createGain();
    drone.gain.value = 0.035;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    for (const f of [D3 / 2, (D3 / 2) * 1.5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      this.droneOscs.push(o);
    }
    lp.connect(drone).connect(this.musicBus);
    this.droneNode = drone;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  private droneNode: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.droneOscs.forEach((o) => o.stop());
    this.droneOscs = [];
    this.droneNode?.disconnect();
    this.droneNode = null;
  }

  private scheduleMusic() {
    const ctx = this.ctx!;
    const bpm = (this.musicMood === 'tense' ? 104 : 88) + this.intensity * 16;
    const eighth = 60 / bpm / 2;
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      const t = this.nextNoteTime;
      const s = this.step % 16; // 2 ölçü, sekizlik
      // düm-tek (Ayoub/çiftetelliye yakın sade bir ritim)
      if (s === 0 || s === 6 || s === 8) this.dum(t);
      if (s === 3 || s === 5 || s === 11 || s === 13 || s === 14) this.tek(t, s === 14 ? 0.5 : 1);
      // gerilim katmanları: kule yükseldikçe ara vuruşlar ve kalp atışı
      if (this.intensity > 0.4 && s % 2 === 1) this.tek(t, 0.35 + this.intensity * 0.3);
      if (this.intensity > 0.75 && s % 4 === 2) this.dum(t);
      // ezgi
      const phraseEnd = s === 14;
      const rest = Math.random() < (this.musicMood === 'tense' ? 0.15 : 0.3) && !phraseEnd;
      if (!rest) {
        const r = Math.random();
        let move = r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.85 ? 2 : -2;
        if (this.melodyDegree > 9) move = -Math.abs(move);
        if (this.melodyDegree < 2) move = Math.abs(move);
        this.melodyDegree = Math.max(0, Math.min(HICAZ.length - 1, this.melodyDegree + move));
        if (phraseEnd) this.melodyDegree = Math.random() < 0.5 ? 0 : 4; // karar ya da güçlü
        const semis = HICAZ[this.melodyDegree];
        const f = D3 * Math.pow(2, semis / 12);
        this.pluck(f, t, 0.32, this.musicBus);
        // tezene tremolo
        if (Math.random() < 0.12) this.pluck(f, t + eighth / 2, 0.18, this.musicBus);
      }
      this.nextNoteTime += eighth;
      this.step++;
    }
  }

  private dum(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const g = ctx.createGain();
    this.env(g, t, 0.35, 0.004, 0.22);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  private tek(t: number, v: number) {
    const ctx = this.ctx!;
    const src = this.noiseSrc(t, 0.06);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2500;
    const g = ctx.createGain();
    this.env(g, t, 0.16 * v, 0.002, 0.045);
    src.connect(f).connect(g).connect(this.musicBus);
  }
}

export const audio = new AudioEngine();
