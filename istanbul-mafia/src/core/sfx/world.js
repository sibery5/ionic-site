// [ses B2] Dünya sesleri: patlama, mermi isabetleri (beton/ahşap/toprak/metal), sekme, kovan, yüzeye göre ayak sesi,
// kapı, şehir ambiyans yatağı (stereo döngü), martı, köpek, uzak korna, kalabalık uğultusu ve çok uzaktan, yankılı ezan
// tınısı (yalnızca sözsüz, prosedürel ezgi; seyrek ve kısık). Hepsi tohumlu varyantlar hâlinde önceden örneklenir.
import { BQ, Reso, rng, normalize, toBuffer, modal, burst, TAU, addEcho, fadeOut, fadeIn, loopify, softclip } from './dsp.js';
import { synthSpeech, SPEECH_SR } from './speech.js';
import { play } from './voices.js';
import { addRender, addPlay } from './lab.js';

const SR2 = 32000; // uzun seslerde bellek tasarrufu (patlama, ambiyans)

function bank(eng, key, n, fn, sr) {
  const B = eng._wdb || (eng._wdb = {});
  if (!B[key]) { B[key] = []; for (let i = 0; i < n; i++) B[key].push(toBuffer(eng.ctx, fn(i), sr || eng.ctx.sampleRate)); }
  return B[key];
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------- patlama ----------------
// şok (geniş bant çatlama + basınç dalgası) -> ateş topu gövdesi (süzgeci kapanan, doymuş gürültü) -> alt bas (55->25 Hz)
// -> enkaz çıtırtıları -> cephelerden dönen yankılar + yuvarlanan gürleme
export function synthExplosion(sr, seed, big = false) {
  const R = rng(seed), N = Math.floor((big ? 4.6 : 4.0) * sr), d = new Float32Array(N);
  // şok cephesi
  for (let i = 0; i < 0.004 * sr; i++) d[i] += (1 - i / (0.004 * sr)) * 1.6 * (i < 0.0015 * sr ? 1 : -0.7);
  burst(d, sr, 0, { dur: 0.05, tau: 0.006, f: 2500, q: 0.6, type: 'hp', amp: 1.5, R });
  // basınç dalgası (yarım sinüs ~ 25 Hz)
  for (let i = 0; i < 0.04 * sr; i++) d[i] += Math.sin(Math.PI * i / (0.04 * sr)) * 1.2;
  // ateş topu
  const F = new BQ('lp', 4000, 0.7, sr), F2 = new BQ('lp', 4000, 0.7, sr);
  for (let i = 0; i < N; i++) {
    const t = i / sr;
    if ((i & 31) === 0) { const fc = 180 + 3800 * Math.exp(-t / 0.18); F.set('lp', fc, 0.7); F2.set('lp', fc * 1.2, 0.6); }
    const e = Math.min(1, t / 0.004) * (Math.exp(-t / 0.28) * 1.4 + Math.exp(-t / 1.2) * 0.35);
    d[i] += softclip(F2.p(F.p(R.n())) * e * 3.5, 1) * 0.9;
  }
  // alt bas
  let ph = 0;
  for (let i = 0; i < N; i++) { const t = i / sr; ph += TAU * (24 + 32 * Math.exp(-t / 0.25)) / sr; d[i] += Math.sin(ph) * 1.3 * Math.min(1, t / 0.006) * Math.exp(-t / 0.65); }
  // enkaz: düşen taş/metal/cam parçaları
  const G = big ? 60 : 38;
  for (let k = 0; k < G; k++) {
    const t0 = 0.12 + Math.pow(R(), 1.6) * (big ? 3.2 : 2.6), late = t0 / 3;
    if (R() < (big ? 0.35 : 0.2)) modal(d, sr, t0, [[1800 + R() * 3500, 0.03 + R() * 0.05, 0.3], [4000 + R() * 3000, 0.02, 0.15]], 0.18 * (1 - late * 0.6), R);
    else burst(d, sr, t0, { dur: 0.04, tau: 0.004 + R() * 0.01, f: 900 + R() * 3500, q: 1.4, type: 'bp', amp: (0.3 + R() * 0.35) * (1 - late * 0.6), R });
  }
  // yankılar ve gürleme
  const src = d.slice(0, Math.floor(0.8 * sr));
  for (const [t, g, lp] of [[0.11, 0.45, 2500], [0.23, 0.38, 1800], [0.37, 0.3, 1400], [0.56, 0.22, 1100], [0.82, 0.15, 900], [1.15, 0.1, 700]]) addEcho(d, src, t * (0.9 + R() * 0.2), g, sr, lp, 40);
  const lp = new BQ('lp', 260, 0.6, sr);
  let am = 1, amT = 0;
  for (let i = 0; i < N; i++) {
    const t = i / sr;
    if (t > amT) { amT = t + 0.08 + R() * 0.2; am = 0.5 + R() * 0.8; }
    d[i] += lp.p(R.n()) * 3.2 * Math.min(1, t / 0.15) * Math.exp(-t / 1.3) * am;
  }
  const hp = new BQ('hp', 18, 0.7, sr); hp.run(d);
  fadeOut(d, Math.floor(0.4 * sr));
  normalize(d, 1);
  for (let i = 0; i < N; i++) d[i] = Math.tanh(d[i] * 1.6) / Math.tanh(1.6);
  return normalize(d, 0.97);
}
export function explosion(eng, x, z, sc = 1) {
  if (!eng.ctx || !eng._vp) return;
  const big = sc > 1.1;
  const b = pick(bank(eng, big ? 'expB' : 'exp', 2, (i) => synthExplosion(SR2, 50 + i * 11 + (big ? 7 : 0), big), SR2));
  const L = eng.listener, d = x === undefined ? 0 : Math.hypot(x - L.x, z - L.z);
  const k = Math.min(2, Math.max(0.5, sc));
  play(eng, b, { x, z, range: 900, ref: 30, gain: 0.9 * Math.sqrt(k) * (eng.indoor ? 0.5 : 1), rate: (big ? 0.92 : 1) * (0.95 + Math.random() * 0.1) / Math.pow(k, 0.08), rev: 0.35, cat: 'boom', delay: d > 25 ? Math.min(2, d / 343) : 0, lp: eng.indoor ? 900 : 20000 });
}

// ---------------- isabetler ----------------
function synthImpact(sr, surf, seed) {
  const R = rng(seed), d = new Float32Array(Math.floor(0.35 * sr));
  if (surf === 'metal') {
    const f = 1100 + R() * 900;
    modal(d, sr, 0, [[f, 0.14, 0.4], [f * 1.67, 0.1, 0.3], [f * 2.71, 0.06, 0.25], [f * 3.9, 0.04, 0.2], [f * 5.3, 0.025, 0.15]], 0.9, R);
    burst(d, sr, 0, { dur: 0.02, tau: 0.002, f: 5000, type: 'hp', amp: 1.2, R });
  } else if (surf === 'wood') {
    modal(d, sr, 0, [[380 + R() * 120, 0.03, 0.5], [870 + R() * 200, 0.02, 0.35], [1700 + R() * 300, 0.012, 0.25]], 0.9, R);
    burst(d, sr, 0, { dur: 0.04, tau: 0.008, f: 1500, type: 'lp', amp: 0.9, R });
    for (let k = 0; k < 7; k++) burst(d, sr, 0.004 + R() * 0.05, { dur: 0.008, tau: 0.0015, f: 2000 + R() * 3000, q: 2, type: 'bp', amp: 0.35, R });
  } else if (surf === 'dirt' || surf === 'grass') {
    burst(d, sr, 0, { dur: 0.06, tau: 0.018, f: 520, type: 'lp', amp: 1.3, R });
    burst(d, sr, 0.003, { dur: 0.2, tau: 0.05, f: 1600, q: 0.8, type: 'bp', amp: 0.55, att: 0.006, R });
    for (let k = 0; k < 10; k++) burst(d, sr, 0.02 + R() * 0.2, { dur: 0.006, tau: 0.0015, f: 1500 + R() * 2500, q: 1.5, type: 'bp', amp: 0.18, R });
  } else { // beton/taş: keskin çatlama + kıymık + dökülen toz
    burst(d, sr, 0, { dur: 0.02, tau: 0.0016, f: 3500, type: 'hp', amp: 1.6, R });
    modal(d, sr, 0, [[2600 + R() * 800, 0.006, 0.4], [4300 + R() * 900, 0.004, 0.3]], 0.6, R);
    burst(d, sr, 0.001, { dur: 0.04, tau: 0.01, f: 900, q: 1, type: 'bp', amp: 0.6, R });
    burst(d, sr, 0.004, { dur: 0.25, tau: 0.05, f: 3200, q: 0.7, type: 'bp', amp: 0.25, att: 0.01, R });
    for (let k = 0; k < 8; k++) burst(d, sr, 0.03 + Math.pow(R(), 1.5) * 0.25, { dur: 0.006, tau: 0.0012, f: 2500 + R() * 4000, q: 2, type: 'bp', amp: 0.22, R });
  }
  fadeOut(d, Math.floor(0.02 * sr));
  return normalize(d, 0.9);
}
export function impact(eng, x, z, surf = 'concrete') {
  if (!eng.ctx || !eng._vp) return;
  const s = surf === 'dirt' || surf === 'grass' ? 'dirt' : surf === 'wood' ? 'wood' : surf === 'metal' ? 'metal' : 'concrete';
  play(eng, pick(bank(eng, 'imp:' + s, 3, (i) => synthImpact(eng.ctx.sampleRate, s, 300 + i * 13 + s.length))), { x, z, range: s === 'metal' ? 90 : 65, ref: 4, gain: s === 'metal' ? 0.45 : 0.55, rate: 0.93 + Math.random() * 0.14, rev: 0.15, cat: 'impact' });
}
// sekme: düşen perdeli ıslık + türbülans hışırtısı
function synthRicochet(sr, seed) {
  const R = rng(seed), N = Math.floor(0.55 * sr), d = new Float32Array(N);
  burst(d, sr, 0, { dur: 0.02, tau: 0.002, f: 3500, type: 'hp', amp: 1.2, R });
  const f0 = 2800 + R() * 1400, f1 = 700 + R() * 400, wob = 30 + R() * 30;
  let ph = 0;
  const F = new BQ('bp', f0, 6, sr);
  for (let i = 0; i < N; i++) {
    const t = i / sr, f = f1 + (f0 - f1) * Math.exp(-t / 0.16);
    ph += TAU * f * (1 + 0.04 * Math.sin(TAU * wob * t)) / sr;
    if ((i & 31) === 0) F.set('bp', f, 6);
    const e = Math.min(1, t / 0.012) * Math.exp(-t / 0.16);
    d[i] += (Math.sin(ph) * 0.35 + F.p(R.n()) * 1.2) * e;
  }
  return normalize(d, 0.85);
}
export function ricochet(eng, x, z) {
  if (!eng.ctx || !eng._vp) return;
  play(eng, pick(bank(eng, 'rico', 3, (i) => synthRicochet(eng.ctx.sampleRate, 400 + i * 9))), { x, z, range: 100, ref: 6, gain: 0.35, rate: 0.9 + Math.random() * 0.2, rev: 0.3, cat: 'impact' });
}
// kovan: pirinç kovanın 3-4 sıçrayışı (modal) / plastik fişek
function synthShell(sr, plastic, seed) {
  const R = rng(seed), d = new Float32Array(Math.floor(0.45 * sr));
  let t = 0, a = 1;
  for (let k = 0; k < 4; k++) {
    if (plastic) burst(d, sr, t, { dur: 0.03, tau: 0.006, f: 900 + R() * 300, q: 2, type: 'bp', amp: a, R });
    else { const f = 3600 + R() * 900; modal(d, sr, t, [[f, 0.035, 0.5], [f * 1.74, 0.022, 0.35], [f * 2.48, 0.014, 0.25]], a, R); burst(d, sr, t, { dur: 0.004, tau: 0.0008, f: 6000, type: 'hp', amp: a * 0.4, R }); }
    t += (0.09 - k * 0.022) * (0.8 + R() * 0.4); a *= 0.55;
  }
  return normalize(d, 0.8);
}
export function shell(eng, x, z, plastic = false, k = 1) {
  if (!eng.ctx || !eng._vp) return;
  play(eng, pick(bank(eng, plastic ? 'shellP' : 'shell', 3, (i) => synthShell(eng.ctx.sampleRate, plastic, 500 + i * 3 + (plastic ? 1 : 0)))), { x, z, range: 25, ref: 2, gain: 0.16 * k, rate: 0.92 + Math.random() * 0.16, rev: 0.03, cat: 'mech', delay: 0.25 + Math.random() * 0.15 });
}

// ---------------- ayak sesleri ----------------
function synthStep(sr, surf, seed) {
  const R = rng(seed), d = new Float32Array(Math.floor(0.3 * sr));
  const toe = 0.055 + R() * 0.03;
  const thud = (t, f, a, tau) => { let ph = 0; const i0 = Math.floor(t * sr); for (let i = 0; i < tau * 6 * sr && i0 + i < d.length; i++) { ph += TAU * f * (0.7 + 0.3 * Math.exp(-i / (0.01 * sr))) / sr; d[i0 + i] += Math.sin(ph) * a * Math.exp(-i / (tau * sr)) * Math.min(1, i / 20); } };
  const grains = (t, n, spread, f0, f1, a) => { for (let k = 0; k < n; k++) burst(d, sr, t + R() * spread, { dur: 0.006, tau: 0.0012 + R() * 0.001, f: f0 + R() * (f1 - f0), q: 1.6, type: 'bp', amp: a * (0.5 + R() * 0.5), R }); };
  switch (surf) {
    case 'grass':
      thud(0, 85, 0.25, 0.02); grains(0.003, 26, 0.07, 1800, 5500, 0.22); grains(toe, 14, 0.05, 2000, 6000, 0.15);
      burst(d, sr, 0, { dur: 0.12, tau: 0.035, f: 3500, q: 0.6, type: 'bp', amp: 0.12, att: 0.01, R });
      break;
    case 'dirt':
      thud(0, 90, 0.35, 0.018); grains(0.002, 20, 0.05, 900, 3800, 0.35); grains(toe, 12, 0.04, 1000, 4000, 0.25);
      break;
    case 'wood':
      modal(d, sr, 0, [[130 + R() * 30, 0.045, 0.6], [290 + R() * 40, 0.03, 0.4], [610 + R() * 80, 0.016, 0.25]], 0.8, R);
      burst(d, sr, 0, { dur: 0.02, tau: 0.004, f: 1800, q: 1, type: 'bp', amp: 0.4, R });
      modal(d, sr, toe, [[150, 0.03, 0.4], [330, 0.02, 0.3]], 0.4, R);
      if (R() < 0.35) burst(d, sr, 0.04, { dur: 0.15, tau: 0.05, f: 750 + R() * 300, q: 8, type: 'bp', amp: 0.25, att: 0.03, R, sweepTo: 950 + R() * 300 }); // gıcırtı
      break;
    case 'metal':
      modal(d, sr, 0, [[410 + R() * 60, 0.09, 0.4], [1130 + R() * 100, 0.06, 0.3], [2240 + R() * 200, 0.035, 0.25], [3500, 0.02, 0.15]], 0.7, R);
      burst(d, sr, 0, { dur: 0.015, tau: 0.002, f: 3000, type: 'hp', amp: 0.5, R });
      modal(d, sr, toe, [[450, 0.05, 0.3], [1250, 0.03, 0.2]], 0.35, R);
      break;
    case 'water': {
      const F = new BQ('bp', 700, 1.2, sr);
      for (let i = 0; i < d.length; i++) { const t = i / sr; if ((i & 31) === 0) F.set('bp', 700 + 1400 * Math.min(1, t / 0.12), 1.2); d[i] += F.p(R.n()) * Math.min(1, t / 0.01) * Math.exp(-t / 0.07) * 1.2; }
      grains(0.05, 10, 0.18, 1800, 4200, 0.25);
      break;
    }
    default: // beton/asfalt: topuk vuruşu + kum/çakıl tanesi + burun sürtmesi
      thud(0, 95 + R() * 20, 0.5, 0.012);
      burst(d, sr, 0, { dur: 0.02, tau: 0.003, f: 2200 + R() * 600, q: 1.1, type: 'bp', amp: 0.75, R });
      grains(0.002, 5, 0.02, 3000, 7000, 0.2);
      thud(toe, 120, 0.25, 0.008);
      burst(d, sr, toe, { dur: 0.06, tau: 0.014, f: 1500 + R() * 500, q: 0.9, type: 'bp', amp: 0.35, att: 0.004, R });
  }
  fadeOut(d, Math.floor(0.02 * sr));
  return normalize(d, 0.85);
}
export function step(eng, x, z, surface) {
  if (!eng.ctx || !eng._vp) return;
  let s = surface || (eng.surfaceAt ? eng.surfaceAt(x, z) : 'concrete');
  if (!['grass', 'dirt', 'wood', 'metal', 'water'].includes(s)) s = 'concrete';
  const L = eng.listener, own = x !== undefined && Math.hypot(x - L.x, z - L.z) < 1.5;
  play(eng, pick(bank(eng, 'step:' + s, 4, (i) => synthStep(SR2, s, 700 + i * 17 + s.length), SR2)), { x, z, range: 26, ref: 2.5, gain: (own ? 0.17 : 0.3) * (eng.indoor ? 1.2 : 1), rate: 0.92 + Math.random() * 0.16, rev: eng.indoor ? 0.12 : 0.04, cat: 'step', minD: own ? 1.5 : 0 });
}

// ---------------- kapı ----------------
function synthDoor(sr, kind, open, seed) {
  const R = rng(seed), d = new Float32Array(Math.floor(1.0 * sr));
  const car = kind === 'car', metal = kind === 'metal';
  const latch = (t, a) => { modal(d, sr, t, [[2400 + R() * 400, 0.012, 0.4], [4100 + R() * 500, 0.007, 0.3], [6200, 0.004, 0.2]], a, R); burst(d, sr, t, { dur: 0.01, tau: 0.002, f: 3500, q: 1.2, type: 'bp', amp: a * 0.5, R }); };
  if (open) {
    latch(0, 0.6);
    if (!car && R() < 0.8) { // menteşe gıcırtısı: yapış-kay darbeleri bir rezonansı uyarır
      const i0 = Math.floor(0.06 * sr), n = Math.floor(0.55 * sr), F = new BQ('bp', 800, 9, sr), F2 = new BQ('bp', 1600, 7, sr);
      let ph = 0;
      for (let i = 0; i < n && i0 + i < d.length; i++) {
        const u = i / n, rate = 35 + 60 * Math.sin(Math.PI * u) + R.n() * 4;
        ph += rate / sr;
        const pulse = ph >= 1 ? (ph -= 1, 1) : 0;
        if ((i & 63) === 0) { F.set('bp', 700 + 350 * u + R.n() * 20, 9); F2.set('bp', 1500 + 600 * u, 7); }
        const e = Math.sin(Math.PI * u) * (metal ? 0.6 : 1);
        d[i0 + i] += (F.p(pulse * 3) + F2.p(pulse * 2)) * e * 0.5;
      }
    }
    burst(d, sr, 0.05, { dur: 0.4, tau: 0.15, f: 400, type: 'lp', amp: 0.2, att: 0.1, R }); // hava/hareket
  } else {
    burst(d, sr, 0, { dur: 0.15, tau: 0.03, f: car ? 380 : 520, type: 'lp', amp: 1.2, R });
    modal(d, sr, 0, car ? [[78, 0.08, 0.9], [160, 0.05, 0.5], [420, 0.03, 0.3]] : metal ? [[180, 0.15, 0.6], [520, 0.12, 0.4], [1300, 0.08, 0.3]] : [[95, 0.07, 0.8], [210, 0.045, 0.5], [480, 0.025, 0.3]], 1, R);
    latch(0.008, 0.7);
    for (let k = 0; k < 3; k++) modal(d, sr, 0.05 + k * 0.04 + R() * 0.02, [[1800 + R() * 900, 0.01, 0.3]], 0.15, R); // kol/kilit tıkırtısı
  }
  fadeOut(d, Math.floor(0.05 * sr));
  return normalize(d, 0.85);
}
export function door(eng, x, z, open = true, kind = 'wood') {
  if (!eng.ctx || !eng._vp) return;
  play(eng, pick(bank(eng, 'door:' + kind + open, 2, (i) => synthDoor(SR2, kind, open, 900 + i * 7 + kind.length + (open ? 1 : 0)), SR2)), { x, z, range: 40, ref: 3, gain: 0.45, rate: 0.95 + Math.random() * 0.1, rev: 0.2, cat: 'misc' });
}

// ---------------- canlılar ----------------
// martı: harmonik kaynak + pürüz (alt harmonik titreşimi) + iki geniz formantı; uzun "kiyaav" ya da gülüşe benzer "ha-ha-ha"
function synthGull(sr, seed) {
  const R = rng(seed), laugh = seed % 2 === 1, N = Math.floor((laugh ? 1.3 : 1.0) * sr), d = new Float32Array(N);
  const calls = laugh ? [0, 0.17, 0.32, 0.46, 0.6].slice(0, 3 + Math.floor(R() * 3)).map((t, k) => [t, 0.13, 1050 - k * 40, 1250 - k * 60, 900]) : [[0, 0.42, 950, 1550, 820], ...(R() < 0.6 ? [[0.5, 0.3, 900, 1400, 780]] : [])];
  const f1 = new Reso(sr), f2 = new Reso(sr), f3 = new Reso(sr);
  f1.set(1900 + R() * 300, 300); f2.set(3100 + R() * 300, 400); f3.set(1000, 250);
  for (const [t0, dur, fa, fb, fc] of calls) {
    const i0 = Math.floor(t0 * sr), n = Math.floor(dur * sr);
    let ph = 0;
    for (let i = 0; i < n && i0 + i < N; i++) {
      const u = i / n;
      const f = u < 0.3 ? fa + (fb - fa) * (u / 0.3) : fb + (fc - fb) * ((u - 0.3) / 0.7);
      ph += f * (1 + 0.03 * Math.sin(TAU * 73 * i / sr) + R.n() * 0.01) / sr;
      let s = 0; for (let h = 1; h <= 7; h++) s += Math.sin(TAU * ph * h) / (h * 0.8);
      s *= 1 + 0.35 * Math.sin(TAU * ph * 0.5); // pürüz: alt harmonik
      const e = Math.min(1, u / 0.06) * Math.min(1, (1 - u) / 0.25);
      d[i0 + i] += s * e * 0.25 + R.n() * 0.04 * e;
    }
  }
  for (let i = 0; i < N; i++) { const x = d[i]; d[i] = f1.p(x) * 0.8 + f2.p(x) * 0.5 + f3.p(x) * 0.3; }
  const hp = new BQ('hp', 500, 0.7, sr); hp.run(d);
  fadeOut(d, Math.floor(0.03 * sr));
  return normalize(d, 0.8);
}
export function seagull(eng, x, z, k = 1) {
  if (!eng.ctx || !eng._vp) return;
  play(eng, pick(bank(eng, 'gull', 4, (i) => synthGull(SR2, 1200 + i), SR2)), { x, z, range: 180, ref: 12, gain: 0.32 * k, rate: 0.9 + Math.random() * 0.2, rev: 0.3, cat: 'amb' });
}
// köpek: gırtlak darbesi + iki formant, iki kısa "hav"
function synthBark(sr, seed) {
  const R = rng(seed), N = Math.floor(0.7 * sr), d = new Float32Array(N);
  const f1 = new Reso(sr), f2 = new Reso(sr), f3 = new Reso(sr);
  f1.set(750 + R() * 150, 180); f2.set(1600 + R() * 200, 220); f3.set(2700, 300);
  const n2 = R() < 0.6 ? 2 : 1;
  for (let b = 0; b < n2; b++) {
    const i0 = Math.floor((b * (0.24 + R() * 0.08)) * sr), n = Math.floor(0.13 * sr), f0 = 420 + R() * 160;
    let ph = 0, gp = 0;
    for (let i = 0; i < n && i0 + i < N; i++) {
      const u = i / n, f = f0 * (1.15 - 0.4 * u);
      ph += f / sr; if (ph >= 1) ph -= 1;
      const g = ph < 0.4 ? Math.sin(Math.PI * ph / 0.4) : 0;
      const e = Math.min(1, u / 0.05) * Math.pow(1 - u, 1.4);
      d[i0 + i] += ((g - gp) * 12 + R.n() * 0.4) * e; gp = g;
    }
  }
  for (let i = 0; i < N; i++) { const x = d[i]; d[i] = f1.p(x) + f2.p(x) * 0.7 + f3.p(x) * 0.3; }
  return normalize(d, 0.8);
}
export function bark(eng, x, z) {
  if (!eng.ctx || !eng._vp) return;
  play(eng, pick(bank(eng, 'bark', 3, (i) => synthBark(SR2, 1300 + i * 5), SR2)), { x, z, range: 90, ref: 6, gain: 0.35, rate: 0.9 + Math.random() * 0.2, rev: 0.3, cat: 'amb' });
}
// uzak korna: iki diyafram kornası (Avrupa tipi tiz-pes çift), korna rezonansı
function synthHorn(sr, seed) {
  const R = rng(seed), dur = 0.25 + R() * 0.5, N = Math.floor((dur + 0.1) * sr), d = new Float32Array(N);
  const fa = 340 + R() * 90, fb = fa * (1.19 + R() * 0.06);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < N; i++) {
    const t = i / sr, e = Math.min(1, t / 0.015) * Math.min(1, Math.max(0, (dur - t) / 0.03));
    p1 += fa / sr; p2 += fb / sr;
    d[i] = (Math.tanh(Math.sin(TAU * p1) * 4) + Math.tanh(Math.sin(TAU * p2) * 4) * 0.8) * e;
  }
  const a = new BQ('bp', 1700, 1.5, sr), b = new BQ('hp', 250, 0.7, sr);
  for (let i = 0; i < N; i++) d[i] = b.p(a.p(d[i])) * 0.7 + d[i] * 0.15;
  return normalize(d, 0.7);
}

// ---------------- ezan (uzaktan, sözsüz tını) ----------------
// Hicaz dizisinde ağır, süslemeli bir ezgi; ünlü formantlarıyla insan sesi tınısı; iki minareden gecikmeli yankı.
const EZ = [ // [yarım ton (La'dan), süre]
  [0, 1.5], [1, 0.25], [4, 0.25], [5, 0.5], [4, 0.3], [1, 0.3], [0, 1.2], [-1, 0.25], [0, 0.4],
  [5, 0.9], [7, 0.4], [8, 0.3], [7, 0.3], [5, 0.3], [4, 0.6], [1, 0.4], [0, 2.0],
];
export function synthEzan(sr, seed = 9) {
  const R = rng(seed), total = EZ.reduce((a, n) => a + n[1], 0) + 0.6;
  const N = Math.floor((total + 4.5) * sr), v = new Float32Array(Math.floor(total * sr));
  const rs = [new Reso(sr), new Reso(sr), new Reso(sr), new Reso(sr)];
  const F = [[720, 1150, 2650, 3400], [560, 1700, 2550, 3400]];
  let ph = 0, gp = 0, i = 0, fCur = 220, vow = 0;
  const base = 207; // La3 civarı
  for (const [st, dur] of EZ) {
    const fT = base * Math.pow(2, st / 12), n = Math.floor(dur * sr);
    vow = R() < 0.3 ? 1 - vow : vow;
    const fm = F[vow];
    for (let k = 0; k < 4; k++) rs[k].set(fm[k], 90 + k * 40);
    for (let j = 0; j < n && i < v.length; j++, i++) {
      fCur += (fT - fCur) * 0.0018; // portamento
      const t = i / sr, vib = 1 + 0.012 * Math.sin(TAU * 5.2 * t) * Math.min(1, j / (0.4 * sr));
      ph += fCur * vib / sr; if (ph >= 1) ph -= 1;
      const g = ph < 0.55 ? 0.5 - 0.5 * Math.cos(Math.PI * ph / 0.55 * 2) : 0;
      const ex = (g - gp) * 10; gp = g;
      let y = ex; for (const r of rs) y = r.p(y);
      v[i] = y;
    }
  }
  fadeIn(v, Math.floor(0.25 * sr)); fadeOut(v, Math.floor(0.6 * sr));
  normalize(v, 0.6);
  const d = new Float32Array(N);
  d.set(v);
  addEcho(d, v, 2.3, 0.45, sr, 1400, 200); // ikinci minare
  addEcho(d, v, 3.9, 0.3, sr, 1000, 200); // üçüncü, daha uzak
  for (const [t, g] of [[0.21, 0.35], [0.43, 0.28], [0.7, 0.2], [1.05, 0.14], [1.5, 0.09]]) addEcho(d, d.slice(0, v.length), t, g, sr, 1200, 150);
  const lp = new BQ('lp', 1800, 0.6, sr); lp.run(d);
  fadeOut(d, Math.floor(1.5 * sr));
  return normalize(d, 0.8);
}

// ---------------- şehir yatağı ve kalabalık (döngüler) ----------------
function synthCityBed(sr, seed = 3) {
  const R = rng(seed), S = 16, N = Math.floor(S * sr), X = Math.floor(1.2 * sr);
  const L = new Float32Array(N + X), Rr = new Float32Array(N + X);
  for (const [d, s] of [[L, 1], [Rr, 2]]) {
    const R2 = rng(seed * 7 + s), a = new BQ('lp', 160, 0.6, sr), b = new BQ('lp', 380, 0.6, sr), h = new BQ('lp', 2600, 0.5, sr), hh = new BQ('hp', 900, 0.5, sr);
    for (let i = 0; i < d.length; i++) { const n = R2.n(); d[i] = a.p(n) * 1.8 + b.p(n) * 0.6 + hh.p(h.p(R2.n())) * 0.05; }
  }
  // uzaktan geçen araçlar: lastik hışırtısı + motor uğultusu, soldan sağa (ya da tersi) kayarak
  for (let k = 0; k < 11; k++) {
    const t0 = R() * (S + 1.2) - 1, dur = 3 + R() * 4, dir = R() < 0.5 ? 1 : -1, amp = 0.2 + R() * 0.35;
    const tf = new BQ('bp', 900 + R() * 500, 0.9, sr), ef = new BQ('bp', 110 + R() * 70, 2, sr);
    const i0 = Math.floor(t0 * sr), n = Math.floor(dur * sr);
    for (let i = 0; i < n; i++) {
      const j = i0 + i; const u = i / n, e = Math.exp(-Math.pow((u - 0.5) / 0.22, 2)) * amp;
      const s = tf.p(R.n()) * 0.6 + ef.p(R.n()) * 1.6;
      if (j < 0 || j >= L.length) continue;
      const p = (u - 0.5) * 2 * dir, gl = Math.sqrt(0.5 * (1 - p)), gr = Math.sqrt(0.5 * (1 + p));
      L[j] += s * e * gl; Rr[j] += s * e * gr;
    }
  }
  const o = [loopify(L, N), loopify(Rr, N)];
  const m = Math.max(...o.map((c) => c.reduce((a, x) => Math.max(a, Math.abs(x)), 0)));
  for (const c of o) for (let i = 0; i < c.length; i++) c[i] *= 0.8 / m;
  return o;
}
const SYL = ['ba', 'ne', 'şu', 'gel', 'ya', 'bir', 'de', 'ka', 'ol', 'iyi', 'tam', 'mi', 'çok', 'yok', 'ha', 'na', 'sen', 'abi', 'ama', 'ti', 'lar', 'ev', 'kız', 'un', 'şey', 'bak', 'tabi', 'oğ', 'le', 'ri'];
function synthCrowd(sr, seed = 4) {
  const R = rng(seed), S = 10, N = Math.floor(S * SPEECH_SR), X = Math.floor(0.8 * SPEECH_SR);
  const L = new Float32Array(N + X), Rr = new Float32Array(N + X);
  for (let k = 0; k < 9; k++) {
    let txt = '';
    while (txt.length < 70) { const w = 1 + Math.floor(R() * 3); for (let j = 0; j < w; j++) txt += SYL[Math.floor(R() * SYL.length)]; txt += R() < 0.2 ? ', ' : ' '; }
    const v = synthSpeech(txt, { pitch: 95 + R() * 120, rate: 1.05 + R() * 0.2, shout: 0, seed: 77 + k });
    const off = Math.floor(R() * N), g = 0.25 + R() * 0.3, p = R.n() * 0.8, gl = Math.sqrt(0.5 * (1 - p)), gr = Math.sqrt(0.5 * (1 + p));
    const lp = new BQ('lp', 1800 + R() * 900, 0.6, SPEECH_SR);
    for (let i = 0; i < v.length; i++) { const j = (off + i) % (N + X), x = lp.p(v[i]) * g; L[j] += x * gl; Rr[j] += x * gr; }
  }
  const o = [loopify(L, N), loopify(Rr, N)];
  const m = Math.max(...o.map((c) => c.reduce((a, x) => Math.max(a, Math.abs(x)), 0)));
  for (const c of o) for (let i = 0; i < c.length; i++) c[i] *= 0.8 / m;
  return o;
}

function loopNode(eng, name, data, sr) {
  if (eng.loops[name]) return eng.loops[name];
  const c = eng.ctx, src = c.createBufferSource();
  src.buffer = toBuffer(c, data, sr); src.loop = true;
  const g = c.createGain(); g.gain.value = 0;
  src.connect(g); g.connect(eng.sfx);
  src.start(0, Math.random() * src.buffer.duration);
  eng.loops[name] = { src, g, f: null };
  return eng.loops[name];
}

// Ambiyans güncellemesi: audio.update -> setAmbience(k) + ambienceEvents(dt)
export function setAmbience(eng, k = 0) {
  if (!eng.ctx) return;
  eng.ambK = Math.max(0, Math.min(1, k));
  if (!eng.loops.citybed && !eng._bedQueued) {
    eng._bedQueued = true;
    const job = () => loopNode(eng, 'citybed', synthCityBed(22050), 22050);
    if (eng._prewarm) { eng._prewarm.unshift(job); eng._prewarmStep(); } else job();
  }
  if (eng.loops.citybed) eng.loopGain('citybed', eng.ambK * 0.3, 1);
}
export function ambienceEvents(eng, dt, game) {
  const k = eng.ambK || 0;
  // kalabalık uğultusu: yakındaki yaya sayısına göre (0,5 sn'de bir sayılır)
  eng._crowdT = (eng._crowdT || 0) - dt;
  if (eng._crowdT <= 0 && game && game.npcs) {
    eng._crowdT = 0.5;
    let n = 0;
    const L = eng.listener;
    if (k > 0.2) for (const p of game.npcs.list) { if (!p.dead && (p.kind === 'civilian' || p.kind === 'civ') && Math.abs(p.pos.x - L.x) < 22 && Math.abs(p.pos.z - L.z) < 22) n++; }
    if (n >= 3 && !eng.loops.crowd && !eng._crowdQueued) {
      eng._crowdQueued = true;
      eng._prewarm && eng._prewarm.push(() => loopNode(eng, 'crowd', synthCrowd(SPEECH_SR), SPEECH_SR));
      eng._prewarmStep && eng._prewarmStep();
    }
    if (eng.loops.crowd) eng.loopGain('crowd', Math.min(0.2, Math.max(0, n - 2) * 0.022) * k, 1.2);
  }
  if (k < 0.2) return;
  const a = eng.ambT;
  a.horn -= dt; a.gull -= dt; a.dog -= dt;
  const far = (r) => { const ang = Math.random() * Math.PI * 2; return [eng.listener.x + Math.cos(ang) * r, eng.listener.z + Math.sin(ang) * r]; };
  if (a.horn <= 0) {
    a.horn = 6 + Math.random() * 14;
    const [x, z] = far(80 + Math.random() * 90);
    play(eng, pick(bank(eng, 'horn', 3, (i) => synthHorn(SR2, 1400 + i * 3), SR2)), { x, z, range: 300, ref: 20, gain: 0.25 * k, rev: 0.45, cat: 'amb' });
  }
  if (a.gull <= 0) { a.gull = 8 + Math.random() * 18; const [x, z] = far(40 + Math.random() * 60); seagull(eng, x, z, 0.8 * k); }
  if (a.dog <= 0) { a.dog = 25 + Math.random() * 45; const [x, z] = far(50 + Math.random() * 40); bark(eng, x, z); }
  // ezan: oyun saati namaz vaktine girince, dışarıdaysa; çok uzak ve kısık
  const env = game && game.env;
  if (env && typeof env.time === 'number') {
    const h = env.time, slot = [5.6, 13.1, 16.4, 19.2, 20.6].findIndex((v) => h >= v && h < v + 0.25);
    const now = eng.ctx.currentTime;
    if (slot >= 0 && slot !== eng._ezanSlot && now - (eng._ezanT || -1e9) > 120) {
      eng._ezanSlot = slot; eng._ezanT = now;
      const [x, z] = far(700);
      play(eng, bank(eng, 'ezan', 1, () => synthEzan(SR2), SR2)[0], { x, z, range: 2200, ref: 220, gain: 0.5 * k, rev: 0.6, cat: 'amb', lp: 1600 });
    }
    if (slot < 0) eng._ezanSlot = -1;
  }
}

export function worldPrewarm(eng) {
  return [
    () => bank(eng, 'step:concrete', 4, (i) => synthStep(SR2, 'concrete', 700 + i * 17 + 8), SR2),
    () => bank(eng, 'imp:concrete', 3, (i) => synthImpact(eng.ctx.sampleRate, 'concrete', 300 + i * 13 + 8)),
    () => bank(eng, 'imp:metal', 3, (i) => synthImpact(eng.ctx.sampleRate, 'metal', 300 + i * 13 + 5)),
    () => bank(eng, 'shell', 3, (i) => synthShell(eng.ctx.sampleRate, false, 500 + i * 3)),
    () => bank(eng, 'exp', 2, (i) => synthExplosion(SR2, 50 + i * 11, false), SR2),
  ];
}

// --- test çıktıları ---
const one = (fn, sr = SR2) => async () => ({ chans: [fn()], sr });
addRender('explosion', one(() => synthExplosion(SR2, 50, false)));
addRender('explosion_car', one(() => synthExplosion(SR2, 57, true)));
addRender('impact_concrete', one(() => synthImpact(44100, 'concrete', 311), 44100));
addRender('impact_metal', one(() => synthImpact(44100, 'metal', 318), 44100));
addRender('impact_wood', one(() => synthImpact(44100, 'wood', 304), 44100));
addRender('ricochet', one(() => synthRicochet(44100, 400), 44100));
addRender('shell_brass', one(() => synthShell(44100, false, 500), 44100));
addRender('steps_surfaces', async () => {
  const sr = SR2, out = new Float32Array(sr * 7);
  ['concrete', 'grass', 'dirt', 'wood', 'metal', 'water'].forEach((s, k) => { for (let j = 0; j < 2; j++) { const d = synthStep(sr, s, 700 + j * 17 + s.length); const o = Math.floor((k * 1.15 + j * 0.5) * sr); for (let i = 0; i < d.length && o + i < out.length; i++) out[o + i] += d[i] * 0.8; } });
  return { chans: [out], sr };
});
addRender('door_open_close', async () => {
  const sr = SR2, a = synthDoor(sr, 'wood', true, 901), b = synthDoor(sr, 'wood', false, 902), out = new Float32Array(a.length + b.length);
  out.set(a); out.set(b, a.length); return { chans: [out], sr };
});
addRender('gull', one(() => synthGull(SR2, 1200)));
addRender('gull_laugh', one(() => synthGull(SR2, 1201)));
addRender('dog_bark', one(() => synthBark(SR2, 1300)));
addRender('ezan_far', one(() => synthEzan(SR2)));
addRender('city_bed', async () => ({ chans: synthCityBed(22050), sr: 22050 }));
addRender('crowd', async () => ({ chans: synthCrowd(SPEECH_SR), sr: SPEECH_SR }));
addPlay((eng, x, z, i) => impact(eng, x, z, ['concrete', 'metal', 'wood', 'dirt'][i % 4]));
addPlay((eng, x, z) => step(eng, x, z, 'concrete'));
addPlay((eng, x, z) => shell(eng, x, z));
addPlay((eng, x, z, i) => (i % 10 === 0 ? explosion(eng, x + 40, z) : ricochet(eng, x, z)));
