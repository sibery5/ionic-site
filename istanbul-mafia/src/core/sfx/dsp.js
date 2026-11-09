// [ses B2] Ortak çevrimdışı DSP araçları: tohumlu rastgele, RBJ biquad, Klatt rezonatörü, polyBLEP kare dalga,
// yumuşak kırpma, döngü birleştirme (çapraz geçiş) ve prosedürel oda/sokak/tünel dürtü yanıtları (IR).
// Hepsi saf JS: sesler bir kez Float32Array'e örneklenir, AudioBuffer'a yazılır, çalarken tek kaynak düğümü kurulur.

export const TAU = Math.PI * 2;

// mulberry32: tohumlu, hızlı, tekrarlanabilir rastgele (varyantlar her açılışta aynı karakterde kalsın)
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const f = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.n = () => f() * 2 - 1; // -1..1
  f.r = (a0, b0) => a0 + (b0 - a0) * f();
  return f;
}

// RBJ "Audio EQ Cookbook" biquad (doğrudan biçim I). type: lp | hp | bp | peak | ls | hs | notch
export class BQ {
  constructor(type, f, q = 0.707, sr = 44100, db = 0) { this.sr = sr; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(type, f, q, db); }
  set(type, f, q = 0.707, db = 0) {
    const sr = this.sr;
    f = Math.min(Math.max(f, 10), sr * 0.49);
    const w = TAU * f / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), A = Math.pow(10, db / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'hp': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'notch': b0 = 1; b1 = -2 * cs; b2 = 1; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'peak': b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; break;
      case 'ls': { const s2 = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cs + s2); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s2); a0 = (A + 1) + (A - 1) * cs + s2; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s2; break; }
      case 'hs': { const s2 = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + s2); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s2); a0 = (A + 1) - (A - 1) * cs + s2; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s2; break; }
      default: b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; // lp
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  // tüm diziyi yerinde süz
  run(d) { for (let i = 0; i < d.length; i++) d[i] = this.p(d[i]); return d; }
}

// Klatt formant rezonatörü (birim DC kazançlı iki kutuplu): konuşma sentezinde kaskad formantlar için
export class Reso {
  constructor(sr) { this.T = 1 / sr; this.y1 = this.y2 = 0; this.A = 1; this.B = 0; this.C = 0; }
  set(f, bw) {
    const T = this.T, C = -Math.exp(-TAU * bw * T), B = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(TAU * f * T);
    this.C = C; this.B = B; this.A = 1 - B - C;
  }
  p(x) { const y = this.A * x + this.B * this.y1 + this.C * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}
// Klatt anti-rezonatörü (sıfır): genizsi ünsüzlerde burun boşluğu
export class AntiReso {
  constructor(sr) { this.T = 1 / sr; this.x1 = this.x2 = 0; this.A = 1; this.B = 0; this.C = 0; }
  set(f, bw) {
    const T = this.T, C = -Math.exp(-TAU * bw * T), B = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(TAU * f * T), A = 1 - B - C;
    this.A = 1 / A; this.B = -B / A; this.C = -C / A;
  }
  p(x) { const y = this.A * x + this.B * this.x1 + this.C * this.x2; this.x2 = this.x1; this.x1 = x; return y; }
}

// tek kutuplu alçak geçiren (katsayı frekanstan)
export const lpCoef = (f, sr) => 1 - Math.exp(-TAU * f / sr);

// polyBLEP: bant sınırlı kare/testere için süreksizlik düzeltmesi
export function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

export const softclip = (x, k = 1) => Math.tanh(x * k);
export function peakOf(d) { let m = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; } return m; }
export function normalize(d, peak = 0.9) { const m = peakOf(d); if (m > 0) { const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; } return d; }
export function fadeIn(d, n) { n = Math.min(n, d.length); for (let i = 0; i < n; i++) d[i] *= i / n; return d; }
export function fadeOut(d, n) { const L = d.length; n = Math.min(n, L); for (let i = 0; i < n; i++) d[L - 1 - i] *= i / n; return d; }

// Kesintisiz döngü: N + X örnek üretilmiş diziyi N'e indirir; son X örnek (eşit güçlü) başa harmanlanır
export function loopify(d, N) {
  const X = d.length - N;
  const o = d.slice(0, N);
  for (let i = 0; i < X; i++) { const u = i / X, a = Math.sin(u * Math.PI / 2), b = Math.cos(u * Math.PI / 2); o[i] = o[i] * a + d[N + i] * b; }
  return o;
}
// Yankı kuyruğunu döngüye katla: N'den taşan kısmı başa ekle (müzik/ambiyans için)
export function wrapTail(d, N) { const o = d.slice(0, N); for (let i = N; i < d.length; i++) o[(i - N) % N] += d[i]; return o; }

// Bir diziye gecikmeli, süzülmüş kopya ekle (yankı/yansıma)
export function addEcho(out, src, delayS, gain, sr, lpF = 0, hpF = 0) {
  const off = Math.floor(delayS * sr);
  const lp = lpF ? new BQ('lp', lpF, 0.6, sr) : null, hp = hpF ? new BQ('hp', hpF, 0.6, sr) : null;
  for (let i = 0; i < src.length && i + off < out.length; i++) {
    let x = src[i] * gain;
    if (lp) x = lp.p(x);
    if (hp) x = hp.p(x);
    out[i + off] += x;
  }
}

// Prosedürel dürtü yanıtı (stereo). kind: street (cephe yansımaları + sokak boyunca çınlama), room (iç mekân),
// tunnel (uzun, çırpıntılı), hall (müzik salonu: pürüzsüz, parlak)
export function makeIR(sr, kind = 'street', seed = 7) {
  const R = rng(seed);
  const P = {
    street: { len: 2.4, t60: 1.7, f0: 7000, fEnd: 900, er: [[0.011, 0.5], [0.023, 0.45], [0.041, 0.42], [0.067, 0.36], [0.093, 0.3], [0.131, 0.24], [0.172, 0.2], [0.23, 0.14], [0.31, 0.1]], late: 0.32, pre: 0.012, flutter: 0.047 },
    room: { len: 0.9, t60: 0.55, f0: 6000, fEnd: 1500, er: [[0.003, 0.6], [0.006, 0.5], [0.009, 0.48], [0.013, 0.44], [0.017, 0.4], [0.022, 0.35], [0.029, 0.3]], late: 0.55, pre: 0.002, flutter: 0 },
    tunnel: { len: 3.4, t60: 2.8, f0: 3500, fEnd: 500, er: [[0.018, 0.6], [0.036, 0.5], [0.054, 0.45], [0.072, 0.4]], late: 0.5, pre: 0.01, flutter: 0.018 },
    hall: { len: 3.2, t60: 2.6, f0: 9000, fEnd: 2200, er: [[0.019, 0.35], [0.027, 0.3], [0.039, 0.28], [0.051, 0.25], [0.066, 0.2]], late: 0.6, pre: 0.02, flutter: 0 },
  }[kind] || null;
  const N = Math.floor(P.len * sr), L = new Float32Array(N), Rr = new Float32Array(N);
  const k60 = Math.log(1000) / P.t60;
  for (let c = 0; c < 2; c++) {
    const d = c ? Rr : L;
    let y = 0, y2 = 0;
    const pre = Math.floor(P.pre * sr);
    for (let i = pre; i < N; i++) {
      const t = (i - pre) / sr;
      const fc = P.fEnd + (P.f0 - P.fEnd) * Math.exp(-t / (P.t60 * 0.35)); // yüksek frekanslar daha çabuk söner
      const a = lpCoef(fc, sr);
      y += a * (R.n() - y); y2 += a * (y - y2);
      let env = Math.exp(-k60 * t) * Math.min(1, t / 0.025) * P.late;
      if (P.flutter) env *= 1 + 0.35 * Math.max(0, Math.cos(TAU * t / P.flutter)) * Math.exp(-t / 0.5); // paralel cepheler arası çırpıntı
      d[i] = y2 * env * 1.8;
    }
    // erken yansımalar: kısa, süzülmüş tıklar (sol/sağ hafif farklı)
    for (const [tt, g] of P.er) {
      const at = tt * (1 + (c ? 0.07 : -0.05) * R()) + P.pre;
      const i0 = Math.floor(at * sr), sm = 6 + Math.floor(R() * 10);
      const lp = new BQ('lp', P.f0 * (1 - tt * 1.5), 0.7, sr);
      for (let j = 0; j < sm * 4 && i0 + j < N; j++) d[i0 + j] += lp.p(j < sm ? R.n() : 0) * g * (R() < 0.5 ? 1 : -1) * 2.2;
    }
  }
  // ilk örnek: doğrudan yol yok (kuru sinyal ayrı gider)
  const m = Math.max(peakOf(L), peakOf(Rr)) || 1;
  for (let i = 0; i < N; i++) { L[i] /= m * 2.2; Rr[i] /= m * 2.2; }
  return [L, Rr];
}

// Float32Array (veya [L,R]) -> AudioBuffer
export function toBuffer(ctx, data, sr) {
  const ch = Array.isArray(data) ? data : [data];
  const b = ctx.createBuffer(ch.length, ch[0].length, sr || ctx.sampleRate);
  ch.forEach((d, i) => b.getChannelData(i).set(d));
  return b;
}

// Karplus-Strong telli çalgı (bağlama/ud benzeri): iki tel (çift tel düzeni, hafif akortsuz) + gövde rezonansı
export function pluckString(sr, f, dur, { bright = 0.6, decay = 0.996, seed = 1, detune = 0.0025, body = 1 } = {}) {
  const R = rng(seed), N = Math.floor(dur * sr), out = new Float32Array(N);
  for (const [df, amp, po] of [[1, 0.6, 0.13], [1 + detune, 0.5, 0.21]]) {
    const P = sr / (f * df), Li = Math.floor(P), fr = P - Li;
    const buf = new Float32Array(Li + 2);
    // tezene darbesi: parlak gürültü + tezene konumu (tarak süzgeci)
    for (let i = 0; i < buf.length; i++) buf[i] = R.n() * (0.5 + 0.5 * bright);
    const pk = Math.max(1, Math.floor(Li * po));
    for (let i = buf.length - 1; i >= pk; i--) buf[i] -= buf[i - pk] * 0.8;
    let idx = 0, prev = 0;
    const lpA = 0.35 + bright * 0.6;
    for (let i = 0; i < N; i++) {
      const j = idx, j1 = (idx + 1) % buf.length;
      const s = buf[j] * (1 - fr) + buf[j1] * fr;
      const y = (s * lpA + prev * (1 - lpA)) * decay;
      prev = s;
      buf[j] = y;
      idx = j1;
      out[i] += s * amp;
    }
  }
  if (body) { // ince gövde: 2 tepe (kapak + sap)
    const b1 = new BQ('peak', 210, 2.5, sr, 6), b2 = new BQ('peak', 1150, 2, sr, 4), hp = new BQ('hp', 90, 0.7, sr);
    for (let i = 0; i < N; i++) out[i] = hp.p(b2.p(b1.p(out[i])));
  }
  fadeOut(out, Math.floor(sr * 0.05));
  return out;
}

// Modal (fiziksel) vuruş: kütle-yay modlarının toplamı. modes = [[frekans, sönüm sn, genlik], ...]
export function modal(d, sr, t0, modes, amp = 1, R = Math.random) {
  const i0 = Math.floor(t0 * sr);
  for (const [f, tau, a] of modes) {
    const n = Math.min(d.length - i0, Math.floor(tau * 7 * sr)), w = TAU * f / sr, ph = R() * TAU, k = Math.exp(-1 / (tau * sr));
    let e = amp * a;
    for (let i = 0; i < n; i++) { d[i0 + i] += e * Math.sin(w * i + ph) * Math.min(1, i / 3); e *= k; }
  }
}
// süzülmüş gürültü darbesi (üstel sönüm), yerinde ekler
export function burst(d, sr, t0, { dur = 0.1, tau = 0.03, f = 1000, q = 0.7, type = 'lp', amp = 1, att = 0.0005, R = Math.random, sweepTo = 0 } = {}) {
  const i0 = Math.floor(t0 * sr), n = Math.min(d.length - i0, Math.floor(dur * sr));
  if (n <= 0) return;
  const F = new BQ(type, f, q, sr), na = Math.max(1, att * sr);
  for (let i = 0; i < n; i++) {
    if (sweepTo && (i & 31) === 0) F.set(type, f * Math.pow(sweepTo / f, i / n), q);
    const t = i / sr;
    d[i0 + i] += F.p(R() * 2 - 1) * amp * Math.exp(-t / tau) * Math.min(1, i / na);
  }
}
