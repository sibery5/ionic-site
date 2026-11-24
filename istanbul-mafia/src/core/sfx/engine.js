// [ses] Araç motoru: ateşleme darbesi sentezi + devir/yük katmanlı döngü bankası.
// Neden: eski motor (testere/kare osilatör + doyma + alçak geçiren) ölçümde enerjinin %78-89'unu 150 Hz altında topluyordu,
// 2 kHz üstü ~%0; yani "uğuldayan osilatör". Gerçek motor sesi, egzozdan çıkan basınç darbelerinin (silindir başına çevrimde bir)
// boru rezonanslarından geçmesidir; tını devirle (darbe sıklığı) ve yükle (darbe şiddeti, yanma gürültüsü) değişir.
// Yöntem: her sınıf için 4 devir noktası x 2 yük (gazda / boşta) = 8 kısa döngü önceden çizilir (tam sayıda çevrim -> dikişsiz).
// Çalarken komşu iki devir noktası eşit güçle karıştırılır, her döngünün hızı gerçek devire oranlanır (en çok ~%20 perde kayması).
// Ateşleme frekansı = devir/60 x silindir/2 (dört zamanlı).
import { BQ, rng, toBuffer, normalize, fadeOut } from './dsp.js';

const SR = 22050;
// cyl: silindir, idle/max: devir, modes: egzoz/gövde rezonansları [Hz, Q, kazanç], lp: gazda parlaklık, rough: silindirler arası
// düzensizlik, knock: dizel tıkırtısı, timing: çevrim içi ateşleme anları (720° = 1; boşsa eşit aralık), amp: silindir genlik deseni,
// pop: gaz kesikken egzoz patlama olasılığı, intake: emme hışırtısı, muff: susturucu (yüksekleri bastırır), lvl: sınıflar arası düzey
export const ENGINE_SYN = {
  small: { cyl: 3, idle: 850, max: 6800, modes: [[150, 3, 1], [520, 4, 0.55], [1700, 3, 0.3]], lp: 2600, rough: 0.16, knock: 0, intake: 0.35, pop: 0.02, muff: 0.25, lvl: 0.85 },
  car: { cyl: 4, idle: 800, max: 6500, modes: [[120, 3, 1], [430, 4, 0.5], [1400, 3, 0.25]], lp: 2200, rough: 0.08, knock: 0, intake: 0.3, pop: 0.02, muff: 0.35, lvl: 1 },
  old: { cyl: 4, idle: 700, max: 5000, modes: [[105, 2.5, 1], [380, 3, 0.6], [1200, 2.5, 0.3]], lp: 1800, rough: 0.22, knock: 0, intake: 0.25, pop: 0.05, muff: 0.2, lvl: 0.95 },
  sport: { cyl: 6, idle: 900, max: 8000, modes: [[140, 3, 1], [620, 5, 0.6], [2300, 4, 0.4]], lp: 4200, rough: 0.05, knock: 0, intake: 0.5, pop: 0.12, muff: 0.1, lvl: 1.15 },
  v8: { cyl: 8, idle: 650, max: 6200, modes: [[85, 3, 1], [300, 4, 0.6], [1100, 3, 0.3]], lp: 2600, rough: 0.12, knock: 0, intake: 0.4, pop: 0.12, muff: 0.1, lvl: 1.2,
    // çapraz düzlemli krank: her sıradaki ateşleme aralığı eşit değil -> "gurul gurul" (lope)
    timing: [0, 0.135, 0.25, 0.365, 0.5, 0.635, 0.75, 0.865], amp: [1, 0.72, 1.12, 0.8, 1.05, 0.7, 1.15, 0.82] },
  diesel: { cyl: 4, idle: 650, max: 4300, modes: [[95, 2.5, 1], [340, 3, 0.55], [2600, 2, 0.35]], lp: 1500, rough: 0.1, knock: 0.55, intake: 0.2, pop: 0, muff: 0.3, lvl: 1.05 },
  truck: { cyl: 6, idle: 550, max: 2600, modes: [[65, 2.5, 1], [250, 3, 0.6], [1900, 2, 0.35]], lp: 1200, rough: 0.08, knock: 0.6, intake: 0.35, pop: 0, muff: 0.3, lvl: 1.25 },
  tank: { cyl: 12, idle: 500, max: 2400, modes: [[55, 2, 1], [210, 3, 0.6], [1500, 2, 0.3]], lp: 1000, rough: 0.1, knock: 0.45, intake: 0.3, pop: 0, muff: 0.4, lvl: 1.4 },
  moto: { cyl: 2, idle: 1200, max: 10500, modes: [[180, 3, 1], [780, 4, 0.6], [2600, 3, 0.4]], lp: 4500, rough: 0.1, knock: 0, intake: 0.45, pop: 0.1, muff: 0.05, lvl: 0.95,
    timing: [0, 0.4375], amp: [1, 0.9] }, // 45° V-ikiz: düzensiz "pat-pat"
  boat: { cyl: 4, idle: 700, max: 5000, modes: [[110, 2.5, 1], [400, 3, 0.4], [1200, 2, 0.15]], lp: 1300, rough: 0.1, knock: 0, intake: 0.2, pop: 0, muff: 0.6, lvl: 1 },
  prop: { cyl: 6, idle: 700, max: 2700, modes: [[100, 2.5, 1], [380, 3, 0.5], [1300, 2.5, 0.3]], lp: 1800, rough: 0.08, knock: 0, intake: 0.3, pop: 0, muff: 0.2, lvl: 1 },
};
const BINS = [0, 0.3, 0.62, 1];

// tek döngü: rpm sabit, on = gazda (true) / boşta-motor freni (false)
export function synthEngineLoop(S, rpm, on, seed) {
  const R = rng(seed);
  const cycle = 120 / rpm, cycles = Math.max(2, Math.round(0.7 / cycle));
  const N = Math.round(cycles * cycle * SR), ex = new Float32Array(N), out = new Float32Array(N);
  const ff = rpm / 60 * S.cyl / 2; // ateşleme frekansı
  const pw = Math.max(0.0012, Math.min(0.006, 0.32 / ff)); // darbe genişliği: devir arttıkça daralır
  const kA = on ? 1 : 0.38, nzA = on ? 0.55 : 0.22;
  // silindir başına sabit genlik farkı (aynı silindir her çevrimde benzer -> tanınabilir ritim)
  const cylA = []; for (let c = 0; c < S.cyl; c++) cylA.push((S.amp ? S.amp[c] : 1) * (1 + (R() - 0.5) * 2 * S.rough));
  const KN = new BQ('bp', 3200, 1.4, SR);
  for (let cy = 0; cy < cycles; cy++) {
    for (let c = 0; c < S.cyl; c++) {
      const frac = S.timing ? S.timing[c] : c / S.cyl;
      const i0 = Math.floor((cy + frac) * N / cycles);
      const a = cylA[c] * kA * (1 + (R() - 0.5) * 0.12);
      const pn = Math.floor(pw * SR), nn = Math.floor(pw * 3 * SR);
      for (let i = 0; i < nn; i++) {
        const j = (i0 + i) % N;
        if (i < pn) ex[j] += a * Math.sin(Math.PI * i / pn); // basınç darbesi
        ex[j] += a * nzA * R.n() * Math.exp(-i / (pw * 0.8 * SR)); // yanma gürültüsü
      }
      if (S.knock) for (let i = 0; i < 0.012 * SR; i++) { const j = (i0 + i) % N; ex[j] += KN.p(R.n()) * S.knock * (on ? 1 : 0.5) * Math.exp(-i / (0.0025 * SR)); }
      // boşta yüksek devirde egzozda yanma: seyrek "pat"
      if (!on && S.pop && rpm > S.idle * 2.2 && R() < S.pop) for (let i = 0; i < 0.03 * SR; i++) { const j = (i0 + i + 80) % N; ex[j] += R.n() * 1.4 * Math.exp(-i / (0.006 * SR)); }
    }
  }
  // boru rezonansları + doğrudan (alçak geçirilmiş) darbe; iki tur: ilk tur süzgeç durumunu ısıtır -> döngü dikişsiz
  const lpF = (on ? S.lp : S.lp * 0.45) * (1 - S.muff * 0.5) * (0.7 + 0.3 * Math.min(1, rpm / (S.max * 0.6)));
  const res = S.modes.map(([f, q]) => new BQ('bp', Math.min(f * (0.92 + 0.16 * (rpm / S.max)), SR * 0.4), q, SR));
  const LP = new BQ('lp', lpF, 0.7, SR), LP2 = new BQ('lp', lpF * 1.3, 0.6, SR);
  const IN = new BQ('bp', 1100 + rpm * 0.15, 1.2, SR), HP = new BQ('hp', 35, 0.7, SR);
  let env = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      const x = ex[i];
      let y = LP2.p(LP.p(x)) * 0.8;
      for (let m = 0; m < res.length; m++) y += res[m].p(x) * S.modes[m][2] * (m === 2 ? (on ? 1 : 0.4) * (1 - S.muff) : 1);
      env += (Math.abs(x) - env) * 0.004;
      if (on && S.intake) y += IN.p(R.n()) * S.intake * 0.5 * env; // emme: gazda, darbelerle kabaran hışırtı
      if (pass) out[i] = HP.p(y); else HP.p(y);
    }
  }
  // yumuşak doyma ve RMS eşitleme (yük farkı çalarken kazançla verilir)
  let ss = 0; for (let i = 0; i < N; i++) ss += out[i] * out[i];
  const k = 0.22 / Math.sqrt(ss / N + 1e-12);
  for (let i = 0; i < N; i++) out[i] = Math.tanh(out[i] * k * 1.6) / 1.6;
  return out;
}

const cache = new Map(); // tür -> { rpms, bufs: [[on, off] x 4] } (Float32, bağlamdan bağımsız)
function loops(kind) {
  let L = cache.get(kind);
  if (L) return L;
  const S = ENGINE_SYN[kind], rpms = BINS.map((b) => S.idle + b * (S.max - S.idle));
  L = { rpms, data: rpms.map((r, i) => [synthEngineLoop(S, r, true, 11 + i * 7 + kind.length), synthEngineLoop(S, r, false, 31 + i * 5 + kind.length)]) };
  cache.set(kind, L);
  return L;
}

// [donma] Motor döngüleri sınıf başına ilk binişte ana iş parçacığında sentezleniyordu (88–124 ms takılma, ölçüm freeze-steps).
// Boşta ön örnekleme kuyruğuna sınıf başına bir görev: oyun anında hazır olur.
export function enginePrewarm(ctx) { return Object.keys(ENGINE_SYN).map((k) => () => { const L = loops(k); if (ctx && L.ctx !== ctx) { L.ctx = ctx; L.ab = L.data.flat().map((d) => toBuffer(ctx, d, SR)); } }); }

// Çalan banka: 8 döngü kaynağı sürekli çalar, kazançlar ve hızlar devirle güncellenir (karede ayırma yok)
export function makeEngineBank(ctx, kind) {
  const S = ENGINE_SYN[kind]; if (!S) return null;
  const L = loops(kind), out = ctx.createGain(), srcs = [], gains = [];
  out.gain.value = 3.6 * S.lvl; // ölçümle eski osilatör motorunun RMS düzeyine eşitlendi
  const AB = L.ab && L.ctx === ctx ? L.ab : (L.ctx = ctx, L.ab = L.data.flat().map((d) => toBuffer(ctx, d, SR))); // [donma] tamponlar bir kez
  let bi = 0;
  for (const pair of L.data) for (const d of pair) {
    void d; const s = ctx.createBufferSource(); s.buffer = AB[bi++]; s.loop = true;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(g); g.connect(out); s.start(0, Math.random() * 0.3);
    srcs.push(s); gains.push(g);
  }
  const P = (p, v, t, tc) => { if (p._lv !== undefined && Math.abs(p._lv - v) < 1e-3) return; p._lv = v; p.setTargetAtTime(v, t, tc); };
  return {
    kind, out, S,
    // r: oyunun devir değeri (0.15 boşta .. ~1.2 kırmızı çizgi), load 0..1, t: bağlam zamanı
    set(r, load, t) {
      const u = Math.max(0, Math.min(1.2, (r - 0.15) / 1.05));
      const rpm = S.idle + u * (S.max - S.idle);
      let i = 0; while (i < 2 && rpm > L.rpms[i + 1]) i++;
      const w = Math.max(0, Math.min(1, (rpm - L.rpms[i]) / (L.rpms[i + 1] - L.rpms[i])));
      const wOn = Math.sqrt(load), wOff = Math.sqrt(1 - load) * 0.62;
      for (let b = 0; b < 4; b++) {
        const wb = b === i ? Math.cos(w * Math.PI / 2) : b === i + 1 ? Math.sin(w * Math.PI / 2) : 0;
        P(gains[b * 2].gain, wb * wOn, t, 0.04); P(gains[b * 2 + 1].gain, wb * wOff, t, 0.04);
        const rate = rpm / L.rpms[b];
        P(srcs[b * 2].playbackRate, rate, t, 0.03); P(srcs[b * 2 + 1].playbackRate, rate, t, 0.03);
      }
      return rpm;
    },
    stop() { for (const s of srcs) { try { s.stop(); } catch (e) { /* bitti */ } } setTimeout(() => out.disconnect(), 50); },
  };
}

// ---------------- [deniz] D7: vites kesmesi, egzoz patlaması, turbo boşaltma (önceden örneklenir) ----------------
// Neden: eski gearShift 70 ms kare dalga "bip" + gürültüydü (vitesten çok arayüz sesi gibi), egzoz patlaması süzülmüş gürültü,
// turbo tek süpürmeli gürültü. Artık motorla aynı darbe modeli: kesme anında birkaç ateşleme darbesi kesilip söner + şanzıman
// "tık"ı; patlama = egzozda yanma (sert ön cephe, boru rezonansı, çatırtı kuyruğu); turbo = kelebek vana titremesi (flutter).
// Tamponlar audio._sfxBank ile sınıf başına bir kez, boşta ön örnekleme kuyruğunda üretilir (oyun anında sentez yok).
const pipeRes = (S, sr) => S.modes.map(([f, q, g]) => [new BQ('bp', f, q, sr), g]);
// vites kesmesi: yüksek devirden ateşleme kesilir (darbeler 40 ms'de söner) + debriyaj/şanzıman tıkı + düşük devirde yeniden bağlanış
export function synthShiftCut(sr, kind = 'car', up = true, v = 0) {
  const S = ENGINE_SYN[kind] || ENGINE_SYN.car, R = rng(71 + v * 13 + kind.length);
  const N = Math.floor(0.34 * sr), d = new Float32Array(N), ex = new Float32Array(N);
  const rpm0 = S.max * (up ? 0.86 : 0.55), rpm1 = S.max * (up ? 0.62 : 0.8);
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / sr;
    // devir: kesmede 0,09 sn içinde düşer (yukarı vites) / gaz vuruşuyla çıkar (aşağı vites); arada 50 ms boşluk
    const u = Math.min(1, t / 0.09), rpm = rpm0 + (rpm1 - rpm0) * u * u * (3 - 2 * u);
    const ff = rpm / 60 * S.cyl / 2; ph += ff / sr;
    const on = t < 0.035 ? 1 - t / 0.05 : t < 0.085 ? 0.08 : Math.min(1, (t - 0.085) / 0.05) * 0.75;
    if (ph >= 1) { ph -= 1; const a = on * (0.8 + R() * 0.4); for (let k = 0; k < 40 && i + k < N; k++) ex[i + k] += a * Math.sin(Math.PI * k / 40) + a * 0.4 * R.n() * Math.exp(-k / 20); }
  }
  const res = pipeRes(S, sr), LP = new BQ('lp', S.lp * 0.8, 0.7, sr), CL = new BQ('bp', 2400 + R() * 600, 5, sr), MB = new BQ('bp', 340, 4, sr);
  for (let i = 0; i < N; i++) {
    let y = LP.p(ex[i]) * 0.6; for (const [b, g] of res) y += b.p(ex[i]) * g;
    // şanzıman/debriyaj tıkı (kesmenin ortasında) — metalik, kısa
    const tc = i / sr - 0.045; if (tc > 0 && tc < 0.03) { const n = R.n(); y += CL.p(n) * 2.2 * Math.exp(-tc / 0.004) + MB.p(n) * 1.4 * Math.exp(-tc / 0.012); }
    d[i] = y;
  }
  fadeOut(d, Math.floor(0.06 * sr));
  return normalize(d, 0.85);
}
// egzoz patlaması: 2–6 düzensiz "pat" (sert ön cephe + boru rezonansı) ve aralarda çıtırtı; v8 daha boğuk, moto daha keskin
export function synthBackfire(sr, kind = 'sport', v = 0) {
  const S = ENGINE_SYN[kind] || ENGINE_SYN.sport, R = rng(131 + v * 29 + kind.length);
  const N = Math.floor(0.7 * sr), d = new Float32Array(N);
  const res = pipeRes(S, sr), LP = new BQ('lp', kind === 'v8' ? 1800 : kind === 'moto' ? 4200 : 3000, 0.8, sr), CR = new BQ('bp', 3500, 1.2, sr);
  const ex = new Float32Array(N);
  const n = 2 + Math.floor(R() * (kind === 'v8' ? 3 : 5));
  let t = 0.01;
  for (let k = 0; k < n && t < 0.55; k++) {
    const i0 = Math.floor(t * sr), a = (0.6 + R() * 0.5) * (1 - k / (n + 2));
    for (let i = 0; i < 0.025 * sr && i0 + i < N; i++) { const e = Math.exp(-i / (0.0025 * sr)); ex[i0 + i] += a * (i < 12 ? 1 : R.n() * 0.9) * e; }
    // çıtırtı: patlama sonrası seyrek kısa tıklar
    for (let c = 0; c < 6; c++) { const j = i0 + Math.floor((0.008 + R() * 0.05) * sr); if (j < N) ex[j] += (R() - 0.5) * a * 1.2; }
    t += 0.04 + R() * 0.1;
  }
  for (let i = 0; i < N; i++) { const x = ex[i]; let y = LP.p(x) * 1.2 + CR.p(x) * 0.5; for (const [b, g] of res) y += b.p(x) * g * 0.8; d[i] = Math.tanh(y * 2.2); }
  fadeOut(d, Math.floor(0.05 * sr));
  return normalize(d, 0.9);
}
// turbo boşaltma: basınçlı hava hışırtısı (yükselip sönen bant) + kelebek vana titremesi (~22 Hz genlik kıyması)
export function synthBlowoff(sr, v = 0) {
  const R = rng(211 + v * 7), N = Math.floor(0.55 * sr), d = new Float32Array(N);
  const B1 = new BQ('bp', 3400 + v * 300, 2.2, sr), B2 = new BQ('bp', 6200, 3, sr), HP = new BQ('hp', 900, 0.7, sr);
  const fl = 18 + v * 4 + R() * 4;
  for (let i = 0; i < N; i++) {
    const t = i / sr, env = Math.min(1, t / 0.012) * Math.exp(-t / 0.16);
    const flut = t > 0.06 ? 0.55 + 0.45 * Math.sin(Math.PI * 2 * fl * t) ** 2 : 1;
    const n = R.n();
    d[i] = HP.p(B1.p(n) * 1.0 + B2.p(n) * 0.5) * env * flut;
  }
  return normalize(d, 0.8);
}
// ön örnekleme görevleri (index.js kuyruğuna eklenir); a: AudioEngine (_sfxBankStep)
export function engineSfxPrewarm(a) {
  const T = [];
  const add = (key, n, fn) => { for (let i = 0; i < n; i++) T.push(() => a._sfxBankStep(key, n, fn)); };
  for (const k of ['car', 'sport', 'v8', 'small', 'moto', 'old']) { add('shiftU_' + k, 2, (sr, v) => synthShiftCut(sr, k, true, v)); add('shiftD_' + k, 2, (sr, v) => synthShiftCut(sr, k, false, v)); }
  for (const k of ['sport', 'v8', 'moto']) add('bfire_' + k, 3, (sr, v) => synthBackfire(sr, k, v));
  add('blowoff', 2, (sr, v) => synthBlowoff(sr, v));
  return T;
}
