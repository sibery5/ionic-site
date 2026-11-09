// [ses B2] Türkçe kural tabanlı formant konuşma sentezi (Klatt tarzı) + megafon / helikopter hoparlörü zinciri.
// Türkçe yazıldığı gibi okunur: her harf bir ses birimine (fonem) eşlenir. Her fonemin hedefleri (F1-F3, bant genişlikleri,
// ses telleri genliği AV, sürtünme AF + merkez frekansı, soluk AH, genizsi sıfır) 2,5 ms'lik karelere yazılır; formantlar
// sıfır evreli yumuşatılır -> ünsüz-ünlü geçişleri (yer ipucu, "locus") doğal olur. Kaynak: Rosenberg gırtlak darbesinin
// türevi (bağırma için basık ses: kısa açık evre), titreme/genlik oynaması; ünsüzler: patlama + soluk (VOT) + sürtünme bantları.
// Vurgu: kelimenin son hecesi; "!" öncesi son ünlü uzar, yüksek başlayıp düşer. Bağıran erkek sesi: F0 ~ 1,4 x temel perde.
// Megafon: 380-3600 Hz bant, korna rezonansları, basınçlı doyma, boğaz yansıması, binalardan geri tepen yankılar,
// mikrofon tuşu tıkı ve "cırt" sinyali. Helikopter: daha dar bant + pervane maskelemesi + PA cızırtısı + yerden uzun yankı.
// Seçenek A: tarayıcıda tr-TR sesi varsa (Windows'ta çoğu zaman bulunur) speechSynthesis, telsiz cırtı ile; yoksa bu sentez.
import { BQ, Reso, AntiReso, rng, normalize, softclip, addEcho, fadeOut, TAU } from './dsp.js';

export const SPEECH_SR = 22050;

// Ünlüler (bağıran erkek; F1 bağırınca yükselir): [F1, F2, F3]
const V = {
  a: [760, 1300, 2550], e: [560, 1880, 2550], ı: [440, 1480, 2450], i: [340, 2250, 2950],
  o: [560, 930, 2450], ö: [480, 1580, 2350], u: [380, 900, 2250], ü: [360, 1700, 2250],
};
const FRONT = 'eiöü';
// Ünsüzler. t: tür (stop, fric, nasal, liquid, glide, tap, aff, asp)
// L: yer hedefi [F1, F2, F3] (locus), vb: ötümlü mü, bf: patlama/sürtünme merkezi, bq: Q, af: sürtünme genliği
const C = {
  p: { t: 'stop', L: [250, 900, 2200], vb: 0, bf: 1100, bq: 0.8 },
  b: { t: 'stop', L: [250, 900, 2200], vb: 1, bf: 1000, bq: 0.8 },
  t: { t: 'stop', L: [300, 1750, 2700], vb: 0, bf: 4200, bq: 1.0 },
  d: { t: 'stop', L: [300, 1750, 2700], vb: 1, bf: 3800, bq: 1.0 },
  k: { t: 'stop', L: [300, 0, 0], vb: 0, bf: 0, bq: 1.6 }, // yer: komşu ünlüye göre (ön/arka)
  g: { t: 'stop', L: [300, 0, 0], vb: 1, bf: 0, bq: 1.6 },
  s: { t: 'fric', L: [320, 1650, 2650], vb: 0, bf: 5200, bq: 1.3, af: 0.85, f2: 3300 },
  z: { t: 'fric', L: [320, 1650, 2650], vb: 1, bf: 5000, bq: 1.3, af: 0.5, f2: 3200 },
  ş: { t: 'fric', L: [320, 1900, 2350], vb: 0, bf: 2700, bq: 1.5, af: 0.95, f2: 4300 },
  j: { t: 'fric', L: [320, 1900, 2350], vb: 1, bf: 2700, bq: 1.5, af: 0.55, f2: 4300 },
  f: { t: 'fric', L: [300, 1100, 2300], vb: 0, bf: 3500, bq: 0.5, af: 0.32, f2: 1800 },
  v: { t: 'fric', L: [300, 1100, 2300], vb: 1, bf: 2800, bq: 0.5, af: 0.12, f2: 1500 },
  h: { t: 'asp', L: [0, 0, 0], vb: 0 },
  ç: { t: 'aff', L: [320, 1900, 2350], vb: 0, bf: 2800, bq: 1.5, af: 0.95, f2: 4300 },
  c: { t: 'aff', L: [320, 1900, 2350], vb: 1, bf: 2800, bq: 1.5, af: 0.55, f2: 4300 },
  m: { t: 'nasal', L: [260, 1000, 2200], nz: 1000 },
  n: { t: 'nasal', L: [260, 1650, 2600], nz: 1450 },
  l: { t: 'liquid', L: [380, 1150, 2750] },
  r: { t: 'tap', L: [430, 1350, 1900] },
  y: { t: 'glide', L: [300, 2200, 2950] },
};
const PUNCT = { ',': 0.17, '.': 0.3, '!': 0.24, '?': 0.26, ';': 0.2, ':': 0.18, '-': 0.1 };
const ALIAS = { â: 'a', î: 'i', û: 'u', q: 'k', w: 'v', x: 'ks' };

// Metni foneme çevir (kelime/hece sınırı ve vurgu bilgisiyle)
function toSegs(text) {
  let s = text.toLocaleLowerCase('tr-TR');
  s = s.replace(/[âîûqwx]/g, (c) => ALIAS[c]).replace(/[^a-zçğıöşü,.!?;:\- ]/g, ' ');
  const words = [];
  let cur = [];
  for (const ch of s) {
    if (ch === ' ') { if (cur.length) words.push(cur); cur = []; continue; }
    if (PUNCT[ch]) { if (cur.length) words.push(cur); cur = []; words.push(ch); continue; }
    cur.push(ch);
  }
  if (cur.length) words.push(cur);
  return words;
}

// kare parametreleri
const FR = 0.0025;
function buildTracks(text, { pitch = 125, rate = 1, shout = 1 } = {}) {
  const words = toSegs(text);
  const K = ['f1', 'f2', 'f3', 'b1', 'b2', 'b3', 'av', 'af', 'ff', 'fq', 'f2f', 'ah', 'nz', 'f0', 'vb'];
  const T = {}; for (const k of K) T[k] = [];
  const push = (dur, p) => { const n = Math.max(1, Math.round(dur / rate / FR)); for (let i = 0; i < n; i++) for (const k of K) T[k].push(p[k] ?? 0); return n; };
  let cf = [500, 1500, 2500];
  const base = { b1: 90, b2: 110, b3: 170, ff: 3000, fq: 1, f2f: 0, nz: 0, f0: 1, vb: 0 };
  const accents = []; // [kare, güç]
  // ünlü dizinleri: vurgu için kelimenin son ünlüsü
  for (let wi = 0; wi < words.length; wi++) {
    const w = words[wi];
    if (typeof w === 'string') { // noktalama: duraklama (ses yok)
      push(PUNCT[w], { ...base, f1: cf[0], f2: cf[1], f3: cf[2] });
      continue;
    }
    const nextP = words[wi + 1];
    const phraseEnd = typeof nextP === 'string' || wi === words.length - 1;
    const excl = nextP === '!';
    let lastV = -1;
    for (let i = 0; i < w.length; i++) if (V[w[i]]) lastV = i;
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      const nv = (() => { for (let j = i + 1; j < w.length; j++) if (V[w[j]]) return w[j]; return null; })();
      const pv = (() => { for (let j = i - 1; j >= 0; j--) if (V[w[j]]) return w[j]; return null; })();
      if (V[ch]) {
        const F = V[ch];
        let dur = 0.085;
        const stressed = i === lastV;
        if (stressed) dur *= 1.3;
        if (stressed && phraseEnd) dur *= excl ? 1.9 : 1.5;
        if (w[i + 1] === 'ğ') dur += 0.07; // yumuşak g: ünlüyü uzatır
        if (shout > 0.5 && stressed) dur *= 1.1;
        const st = T.f1.length;
        push(dur, { ...base, f1: F[0], f2: F[1], f3: F[2], b1: 75 + F[0] * 0.05, b2: 90 + F[1] * 0.04, b3: 150, av: 1 });
        if (stressed) accents.push([st, T.f1.length, phraseEnd ? (excl ? 2 : 1.5) : 1]);
        cf = F;
        continue;
      }
      if (ch === 'ğ') { // ünlüler arası hafif kayma; aksi hâlde yukarıda uzatıldı
        if (pv && nv) push(0.03, { ...base, f1: cf[0] * 0.9, f2: cf[1], f3: cf[2], av: 0.8 });
        continue;
      }
      const P = C[ch];
      if (!P) continue;
      const front = FRONT.includes(nv || pv || 'a');
      let L = P.L;
      if (ch === 'k' || ch === 'g') L = front ? [300, 2250, 2800] : [300, 1350, 2050];
      const bf = P.bf || (front ? 3000 : 1750);
      const nvF = nv ? V[nv] : cf;
      const loc = { f1: L[0] || nvF[0], f2: L[1] || nvF[1], f3: L[2] || nvF[2] };
      switch (P.t) {
        case 'stop': {
          // kapanma: sessiz (ötümsüz) ya da ses çubuğu (ötümlü)
          const wordInit = i === 0;
          push(wordInit && !pv ? 0.03 : (P.vb ? 0.05 : 0.065), { ...base, ...loc, f1: 220, av: P.vb ? 0.16 : 0, b1: 120 });
          // patlama: kısa, keskin
          push(0.008, { ...base, ...loc, af: P.vb ? 0.6 : 1.1, ff: bf, fq: P.bq, f2f: bf * 1.5 });
          // soluk / ötümsüz ünsüzde ses tellerinin gecikmesi (Türkçe ötümsüz patlamalılar soluklu)
          if (!P.vb) push(nv ? 0.045 : 0.06, { ...base, ...loc, ah: 0.55, af: 0.12, ff: bf, fq: P.bq });
          else push(0.012, { ...base, ...loc, av: 0.4 });
          break;
        }
        case 'fric': {
          const dur = (P.vb ? 0.07 : 0.095) * (i === w.length - 1 ? 1.25 : 1);
          push(dur, { ...base, ...loc, av: P.vb ? 0.4 : 0, vb: P.vb, af: P.af, ff: P.bf, fq: P.bq, f2f: P.f2 });
          break;
        }
        case 'aff': {
          push(0.05, { ...base, ...loc, f1: 220, av: P.vb ? 0.14 : 0 });
          push(0.008, { ...base, ...loc, af: 1.0, ff: P.bf + 600, fq: 1.2 });
          push(P.vb ? 0.05 : 0.07, { ...base, ...loc, av: P.vb ? 0.35 : 0, vb: P.vb, af: P.af, ff: P.bf, fq: P.bq, f2f: P.f2 });
          break;
        }
        case 'asp': {
          push(0.06, { ...base, f1: nvF[0], f2: nvF[1], f3: nvF[2], ah: 0.6, b1: 200, b2: 200 });
          break;
        }
        case 'nasal': {
          push(0.065, { ...base, ...loc, av: 0.75, nz: P.nz, b1: 60, b2: 150, b3: 250 });
          break;
        }
        case 'liquid': {
          push(0.06, { ...base, ...loc, av: 0.85, b2: 160 });
          break;
        }
        case 'glide': {
          push(0.045, { ...base, ...loc, av: 0.85 });
          break;
        }
        case 'tap': {
          // Türkçe r: tek dokunuş; kelime sonunda sürtünmeli (ötümsüzleşen) r
          const fin = i === w.length - 1;
          push(0.018, { ...base, ...loc, av: 0.8 });
          push(0.014, { ...base, ...loc, av: 0.25 });
          push(fin ? 0.06 : 0.018, { ...base, ...loc, av: fin ? 0.35 : 0.8, af: fin ? 0.22 : 0, ff: 3200, fq: 0.9, f2f: 4500 });
          break;
        }
        default: break;
      }
    }
    // kelime arası çok kısa bağlantı (akıcı konuşma)
    if (!phraseEnd) push(0.012, { ...base, f1: cf[0], f2: cf[1], f3: cf[2], av: 0.05 });
  }
  push(0.08, { ...base, f1: cf[0], f2: cf[1], f3: cf[2] });
  return { T, accents, n: T.f1.length };
}

// sıfır evreli tek kutuplu yumuşatma
function smooth(a, tau) {
  const k = Math.exp(-FR / tau);
  for (let i = 1; i < a.length; i++) a[i] = a[i] * (1 - k) + a[i - 1] * k;
  for (let i = a.length - 2; i >= 0; i--) a[i] = a[i] * (1 - k) + a[i + 1] * k;
}

// Kuru konuşma sesi (Float32Array, SPEECH_SR)
export function synthSpeech(text, opts = {}) {
  const sr = SPEECH_SR, R = rng(opts.seed || 11);
  const { T, accents, n } = buildTracks(text, opts);
  if (!n) return new Float32Array(1);
  for (const k of ['f1', 'f2', 'f3', 'b1', 'b2', 'b3']) smooth(T[k], 0.011);
  for (const k of ['av', 'ah']) smooth(T[k], 0.004);
  smooth(T.af, 0.0025);
  // F0 eğrisi: öbek boyunca alçalma + vurgulu ünlülerde tepe; "!" öncesi yüksek-düşen
  const f0 = new Float32Array(n);
  for (let i = 0; i < n; i++) f0[i] = 1.08 - 0.2 * (i / n);
  for (const [a, b, s] of accents) {
    const len = b - a;
    for (let i = Math.max(0, a - 12); i < Math.min(n, b + 12); i++) {
      const u = (i - a) / Math.max(1, len);
      if (s >= 2) f0[i] *= 1 + 0.26 * Math.exp(-Math.pow((u - 0.2) / 0.45, 2)) - 0.12 * Math.max(0, u - 0.4);
      else f0[i] *= 1 + 0.13 * s * Math.exp(-Math.pow((u - 0.45) / 0.5, 2));
    }
  }
  const sh = opts.shout ?? 1;
  const F0b = (opts.pitch || 125) * (1 + 0.38 * sh);
  const N = Math.floor(n * FR * sr);
  const out = new Float32Array(N);
  const r1 = new Reso(sr), r2 = new Reso(sr), r3 = new Reso(sr), r4 = new Reso(sr), r5 = new Reso(sr);
  const np = new Reso(sr), nzr = new AntiReso(sr);
  r4.set(3500, 250); r5.set(4300, 300);
  const fb1 = new BQ('bp', 3000, 1, sr), fb2 = new BQ('bp', 4000, 1, sr);
  const tilt = new BQ('hs', 2500, 0.7, sr, 3 * sh); // bağırınca tizler artar
  let ph = 0, gPrev = 0, per = 1, jit = 0, shim = 1;
  const oq = 0.62 - 0.14 * sh, tp = oq * 0.68; // açık evre ve yükselme payı
  let lastSet = -1;
  for (let i = 0; i < N; i++) {
    const fi = Math.min(n - 1, Math.floor(i / (FR * sr)));
    if (fi !== lastSet) {
      lastSet = fi;
      r1.set(T.f1[fi], T.b1[fi]); r2.set(T.f2[fi], T.b2[fi]); r3.set(T.f3[fi], T.b3[fi]);
      if (T.nz[fi] > 50) { np.set(270, 100); nzr.set(T.nz[fi], 120); } else { np.set(270, 100); nzr.set(270, 100); }
      fb1.set('bp', T.ff[fi] || 3000, T.fq[fi] || 1);
      fb2.set('bp', T.f2f[fi] || 4000, 1.2);
    }
    const av = T.av[fi], ah = T.ah[fi], af = T.af[fi];
    // gırtlak darbesi (Rosenberg) ve türevi = ışıma dâhil uyarım
    const f = F0b * f0[fi] * (1 + jit);
    ph += f / sr;
    if (ph >= 1) { ph -= 1; jit = R.n() * 0.012; shim = 1 + R.n() * 0.06; }
    let g;
    if (ph < tp) g = 0.5 * (1 - Math.cos(Math.PI * ph / tp));
    else if (ph < oq) g = Math.cos(0.5 * Math.PI * (ph - tp) / (oq - tp));
    else g = 0;
    const exc = (g - gPrev) * 18 * shim; gPrev = g;
    const open = g; // açık evrede soluk gürültüsü
    const nse = R.n();
    let src = exc * av + nse * (ah * 0.9 + av * 0.04 * open);
    // kaskad: burun kutbu/sıfırı -> F1..F5
    src = nzr.p(np.p(src));
    let y = r5.p(r4.p(r3.p(r2.p(r1.p(src)))));
    // paralel sürtünme kolu (ötümlüde gırtlak darbesiyle modüle)
    if (af > 0.001) {
      const am = T.vb[fi] ? 0.5 + 0.5 * open : 1;
      y += (fb1.p(nse) * 1.0 + fb2.p(nse) * 0.45 * (T.f2f[fi] ? 1 : 0)) * af * am * 0.9;
    } else { fb1.p(nse); fb2.p(nse); }
    out[i] = tilt.p(y);
  }
  // DC/uğultu temizliği
  const hp = new BQ('hp', 80, 0.7, sr); hp.run(out);
  fadeOut(out, Math.floor(0.02 * sr));
  return normalize(out, 0.9);
}

// Hoparlör zinciri. kind: 'mega' | 'heli' | 'dry' (çıplak bağırma; yine de hafif sokak yankısı)
export function speakerChain(dry, kind = 'mega', seed = 5) {
  const sr = SPEECH_SR, R = rng(seed);
  const heli = kind === 'heli';
  const pre = kind === 'dry' ? 0 : Math.floor((heli ? 0.22 : 0.16) * sr);
  const tailS = kind === 'dry' ? 0.5 : heli ? 1.3 : 0.9;
  const N = pre + dry.length + Math.floor(tailS * sr);
  const sig = new Float32Array(N);
  sig.set(dry, pre);
  if (kind !== 'dry') {
    const bLo = heli ? 450 : 380, bHi = heli ? 3200 : 3600;
    const ch = [new BQ('hp', bLo, 0.75, sr), new BQ('hp', bLo * 1.1, 0.6, sr), new BQ('peak', 650, 1.5, sr, 2.5),
      new BQ('peak', heli ? 1500 : 1900, 2.6, sr, 6.5), new BQ('peak', heli ? 2500 : 2900, 4, sr, 5),
      new BQ('lp', bHi, 0.8, sr), new BQ('lp', bHi * 1.1, 0.6, sr)];
    for (let i = 0; i < N; i++) { let x = sig[i]; for (const b of ch) x = b.p(x); sig[i] = x; }
    normalize(sig, 0.75);
    // basınçlı sürücü doyması (asimetrik) + boğaz yansıması (0,6 ms tarak)
    const drive = heli ? 4.2 : 3.2, cd = Math.round(0.0006 * sr), hist = new Float32Array(cd + 1);
    const post = [new BQ('lp', heli ? 4200 : 5200, 0.7, sr), new BQ('hp', 400, 0.7, sr)];
    for (let i = 0; i < N; i++) {
      let x = softclip(sig[i] * drive + 0.05, 1) - softclip(0.05, 1);
      const y = x + hist[i % (cd + 1)] * 0.28; hist[i % (cd + 1)] = x;
      sig[i] = post[1].p(post[0].p(y));
    }
    if (heli) {
      // pervane maskelemesi: ana rotor kanat geçişi (~21 Hz) sesi kesik kesik ezer; PA cızırtısı sürekli
      const hb = new BQ('bp', 2600, 0.6, sr), hb2 = new BQ('hp', 1200, 0.7, sr);
      for (let i = 0; i < N; i++) {
        const t = i / sr, ch2 = Math.pow(Math.max(0, Math.sin(TAU * 21 * t)), 3);
        sig[i] = sig[i] * (1 - 0.32 * ch2) + hb2.p(hb.p(R.n())) * 0.035 * Math.min(1, t * 8) * Math.min(1, (N - i) / (0.3 * sr));
      }
    }
    // tuş tıkı + "cırt": konuşma öncesi ve sonrası (araç PA amplifikatörü)
    keyChirp(sig, sr, 0.015, R, heli, true);
    keyChirp(sig, sr, (pre + dry.length) / sr + 0.05, R, heli, false);
  }
  // binalardan geri tepen yankılar (sokak): ilk cephe, karşı cephe, uzak bloklar
  const src = sig.slice();
  const E = heli ? [[0.17, 0.4, 2200], [0.31, 0.3, 1800], [0.5, 0.2, 1400], [0.74, 0.12, 1100]]
    : kind === 'dry' ? [[0.06, 0.22, 3000], [0.13, 0.12, 2200]]
      : [[0.092, 0.36, 2800], [0.165, 0.26, 2300], [0.255, 0.17, 1900], [0.41, 0.1, 1500], [0.6, 0.06, 1200]];
  for (const [dl, g, lp] of E) addEcho(sig, src, dl * (0.93 + R() * 0.14), g, sr, lp, 350);
  return normalize(sig, 0.92);
}

function keyChirp(d, sr, t0, R, heli, start) {
  const i0 = Math.floor(t0 * sr);
  // mekanik tuş tıkı
  const k = new BQ('bp', 2400, 1.2, sr);
  for (let i = 0; i < 0.012 * sr && i0 + i < d.length; i++) d[i0 + i] += k.p(R.n()) * 0.22 * Math.exp(-i / (0.002 * sr));
  // başta kısa yükselen bip, sonda alçalan "cırt" + kısa susturucu (squelch) hışırtısı
  const n = Math.floor((start ? 0.07 : 0.09) * sr);
  let ph = 0;
  const sq = new BQ('bp', 2200, 1.1, sr), sl = new BQ('lp', 3800, 0.7, sr);
  for (let i = 0; i < n && i0 + 200 + i < d.length; i++) {
    const u = i / n;
    const f = start ? 1500 + 900 * u : 2300 - 1300 * u;
    ph += f / sr;
    const env = Math.sin(Math.PI * u);
    const tone = Math.sin(TAU * ph) + 0.3 * Math.sin(TAU * ph * 2);
    d[i0 + 200 + i] += tone * env * (start ? 0.16 : 0.12) + (start ? 0 : sl.p(sq.p(R.n())) * 0.07 * env * (heli ? 1.4 : 1));
  }
}

// ---- Seçenek A: işletim sistemi Türkçe sesi (varsa) ----
let _trVoice = null, _probed = false;
export function probeTTS() {
  if (_probed) return _trVoice;
  if (typeof window === 'undefined' || !window.speechSynthesis) { _probed = true; return null; }
  const pick = () => {
    const vs = window.speechSynthesis.getVoices() || [];
    const tr = vs.filter((v) => /^tr(-|_|$)/i.test(v.lang));
    // erkek sesi tercih (ör. "Tolga"), yerel ses önce
    _trVoice = tr.find((v) => /tolga|erkek|male/i.test(v.name) && v.localService) || tr.find((v) => v.localService) || tr[0] || null;
    _probed = true;
  };
  pick();
  if (!_trVoice) { _probed = false; window.speechSynthesis.onvoiceschanged = () => { pick(); }; _probed = true; }
  return _trVoice;
}
export function ttsVoice() { return _trVoice; }
